import { randomBytes, randomInt, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { AppConfig, User } from './types.ts';
import type { EditorCredential, Store } from './store.ts';

/** How an editor sign-in looks to the person who signed in for it. */
export type EditorRequestView = { userCode: string; createdAt: string; expiresAt: string; status: 'waiting' | 'approved' | 'denied' };
type EditorTicket = { secretHash: string; userCode: string; createdAt: number; lastPoll: number; failures: number; signedInBy?: string; decision?: 'approved' | 'denied' };

const editorTicketMs = 600_000;
const editorPollSeconds = 2;
const editorStartsPerAddress = 20;
const editorSecretFailures = 5;
const userCodeAlphabet = 'BCDFGHJKLMNPQRSTVWXZ';
/** Editor credentials last this many days from approval and are never renewed. */
export const editorCredentialDays = 30;
/** Every editor credential starts with this prefix, so it is never mistaken for a browser session. */
export const editorTokenPrefix = 'vle_';
const editorTokenPattern = /^vle_[A-Za-z0-9_-]{43}$/;

export function hashPassword(password: string): string {
  if (password.length < 12 || password.length > 1024) throw new Error('Use a password between 12 and 1024 characters');
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  try {
    const [scheme, salt, hash] = encoded.split('$');
    if (scheme !== 'scrypt' || !salt || !hash || password.length > 1024) return false;
    const expected = Buffer.from(hash, 'hex');
    const actual = scryptSync(password, salt, 64);
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}

function digest(token: string): string { return createHash('sha256').update(token).digest('hex'); }

function failure(status: number, code: string, message: string): Error { return Object.assign(new Error(message), { status, code }); }

const unknownEditor = () => failure(404, 'editor_login_unknown', 'This editor sign-in is unknown or has expired. Start it again from your editor.');

export class Auth {
  store: Store;
  config: AppConfig;
  cookieName: string;
  attempts = new Map<string, { count: number; since: number }>();
  constructor(store: Store, config: AppConfig) {
    this.store = store;
    this.config = config;
    this.cookieName = config.auth.secureCookies ? '__Host-unfold' : 'unfold';
    if (config.mode === 'live' && config.auth.bootstrapPassword && !store.getUserByName(config.auth.bootstrapName)) {
      store.addUser({ id: randomBytes(12).toString('hex'), name: config.auth.bootstrapName, role: 'admin', passwordHash: hashPassword(config.auth.bootstrapPassword) });
    }
  }
  token(req: IncomingMessage): string | undefined {
    const header = req.headers.cookie || '';
    return header.split(';').map(pair => pair.trim()).find(pair => pair.startsWith(`${this.cookieName}=`))?.slice(this.cookieName.length + 1);
  }
  /** The bearer token of a request: undefined without an Authorization header, empty when the header is malformed. */
  bearer(req: IncomingMessage): string | undefined {
    const header = req.headers.authorization;
    if (header === undefined) return undefined;
    return /^Bearer [!-~]{1,200}$/.test(header) ? header.slice(7) : '';
  }
  /** OAuth callbacks are cross-site navigations, so use a separate Lax cookie. */
  browserBinding(req: IncomingMessage): string {
    const name = `${this.cookieName}-oauth`;
    const value = (req.headers.cookie || '').split(';').map(pair => pair.trim()).find(pair => pair.startsWith(`${name}=`))?.slice(name.length + 1);
    return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? digest(value) : '';
  }
  beginBrowserFlow(req: IncomingMessage): { binding: string; cookie: string } {
    const name = `${this.cookieName}-oauth`;
    const existing = (req.headers.cookie || '').split(';').map(pair => pair.trim()).find(pair => pair.startsWith(`${name}=`))?.slice(name.length + 1);
    const value = existing && /^[A-Za-z0-9_-]{43}$/.test(existing) ? existing : randomBytes(32).toString('base64url');
    return { binding: digest(value), cookie: `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${this.config.auth.secureCookies ? '; Secure' : ''}` };
  }
  /** Identifies the sign-in that authenticated a request, a browser session or an editor credential, without exposing its secret. */
  signIn(req: IncomingMessage): string | undefined {
    const bearer = this.bearer(req);
    if (bearer !== undefined) return editorTokenPattern.test(bearer) ? digest(bearer) : undefined;
    const token = this.token(req);
    return token && token.length <= 200 ? digest(token) : undefined;
  }
  /** Which credential authenticated a request: a browser session or an editor credential. */
  scope(req: IncomingMessage): 'browser' | 'editor' | undefined {
    if (this.config.mode === 'demo') return 'browser';
    if (this.bearer(req) !== undefined) return this.editorUser(req) ? 'editor' : undefined;
    return this.user(req) ? 'browser' : undefined;
  }
  user(req: IncomingMessage): User | undefined {
    if (this.config.mode === 'demo') return { id: 'demo-operator', name: 'Demo operator', role: 'admin' };
    if (this.bearer(req) !== undefined) return this.editorUser(req);
    const token = this.token(req);
    if (!token || token.length > 200) return undefined;
    const login = this.store.getLogin(digest(token));
    if (!login || Date.parse(login.expiresAt) <= Date.now()) return undefined;
    const user = this.store.getUser(login.userId);
    return user ? { id: user.id, name: user.name, role: user.role } : undefined;
  }
  private editorUser(req: IncomingMessage): User | undefined {
    const bearer = this.bearer(req);
    if (!bearer || !editorTokenPattern.test(bearer)) return undefined;
    const credential = this.store.getEditorCredential(digest(bearer));
    const user = credential && this.store.getUser(credential.userId);
    if (!credential || !user) return undefined;
    const now = Date.now();
    if (!credential.lastUsedAt || now - Date.parse(credential.lastUsedAt) >= 60_000) this.store.touchEditorCredential(credential.id, new Date(now).toISOString());
    return { id: user.id, name: user.name, role: user.role };
  }
  login(name: string, password: string, address: string): { user: User; cookie: string } {
    const now = Date.now();
    const attempts = this.attempts.get(address);
    if (attempts && now - attempts.since < 300000 && attempts.count >= 10) throw Object.assign(new Error('Too many login attempts. Try again in five minutes.'), { status: 429, code: 'rate_limited' });
    if (this.attempts.size > 10000) this.attempts.clear();
    this.attempts.set(address, { since: attempts && now - attempts.since < 300000 ? attempts.since : now, count: attempts && now - attempts.since < 300000 ? attempts.count + 1 : 1 });
    const record = this.store.getUserByName(name);
    const valid = verifyPassword(password, record?.passwordHash || `scrypt$00000000000000000000000000000000$${'00'.repeat(64)}`);
    if (!record || !valid) throw Object.assign(new Error('Name or password is incorrect.'), { status: 401, code: 'invalid_credentials' });
    this.attempts.delete(address);
    const token = randomBytes(32).toString('base64url');
    const seconds = this.config.auth.sessionHours * 3600;
    this.store.createLogin(digest(token), record.id, new Date(now + seconds * 1000).toISOString());
    return { user: { id: record.id, name: record.name, role: record.role }, cookie: this.cookie(token, seconds) };
  }
  private readonly editors = new Map<string, EditorTicket>();
  private readonly editorStarts = new Map<string, { count: number; since: number }>();

  /** Starts an editor sign-in. Its ticket stays pending until the person who signs in for it approves it in a browser. */
  beginEditor(address: string): { code: string; secret: string; userCode: string; expiresIn: number; interval: number } {
    const now = Date.now();
    for (const [code, item] of this.editors) if (now - item.createdAt > editorTicketMs) this.editors.delete(code);
    for (const [key, window] of this.editorStarts) if (now - window.since > editorTicketMs) this.editorStarts.delete(key);
    const started = this.editorStarts.get(address);
    if (started && started.count >= editorStartsPerAddress) throw failure(429, 'rate_limited', 'Too many editor sign-ins were started from this address. Try again in ten minutes.');
    if (this.editors.size >= 1000) throw failure(429, 'rate_limited', 'Too many editor sign-ins are waiting. Try again in a few minutes.');
    this.editorStarts.set(address, { since: started?.since ?? now, count: (started?.count ?? 0) + 1 });
    const code = randomBytes(9).toString('base64url');
    const secret = randomBytes(32).toString('base64url');
    const userCode = Array.from({ length: 8 }, (_, index) => `${index === 4 ? '-' : ''}${userCodeAlphabet[randomInt(userCodeAlphabet.length)]}`).join('');
    this.editors.set(code, { secretHash: digest(secret), userCode, createdAt: now, lastPoll: 0, failures: 0 });
    return { code, secret, userCode, expiresIn: editorTicketMs / 1000, interval: editorPollSeconds };
  }

  /** Whether a browser sign-in can still claim an editor sign-in. */
  editorPending(code: string): boolean {
    const item = this.liveTicket(code);
    return Boolean(item && !item.signedInBy && !item.decision);
  }

  /** Records who signed in for an editor sign-in. Signing in alone never makes the ticket collectable. */
  claimEditor(code: string, user: User): boolean {
    const item = this.liveTicket(code);
    if (!item || item.signedInBy || item.decision) return false;
    item.signedInBy = user.id;
    return true;
  }

  /** The editor sign-in that `user` signed in for, or undefined for anyone else. */
  editorRequest(code: string, user: User): EditorRequestView | undefined {
    const item = this.liveTicket(code);
    if (!item || item.signedInBy !== user.id) return undefined;
    return { userCode: item.userCode, createdAt: new Date(item.createdAt).toISOString(), expiresAt: new Date(item.createdAt + editorTicketMs).toISOString(), status: item.decision ?? 'waiting' };
  }

  /** Approves or denies an editor sign-in that `user` signed in for. A ticket takes one decision. */
  decideEditor(code: string, user: User, decision: 'approved' | 'denied'): EditorRequestView {
    const item = this.liveTicket(code);
    if (!item || item.signedInBy !== user.id) throw unknownEditor();
    if (item.decision) throw failure(409, 'editor_login_decided', `This editor sign-in was already ${item.decision}.`);
    item.decision = decision;
    return this.editorRequest(code, user)!;
  }

  /** Polls an editor sign-in with its secret. An approved ticket yields a new editor credential once; every other state yields none. */
  collectEditor(code: string, secret: string): { status: 'pending' } | { status: 'ready'; user: User; token: string; expiresAt: string } {
    const item = this.liveTicket(code);
    if (!item) throw unknownEditor();
    if (item.secretHash !== digest(secret)) {
      if (++item.failures >= editorSecretFailures) this.editors.delete(code);
      throw unknownEditor();
    }
    const now = Date.now();
    if (now - item.lastPoll < editorPollSeconds * 500) throw failure(429, 'slow_down', 'The editor is asking too often. Wait a little longer between polls.');
    item.lastPoll = now;
    if (item.decision === 'denied') {
      this.editors.delete(code);
      throw failure(403, 'editor_login_denied', 'This editor sign-in was denied in the browser.');
    }
    if (item.decision !== 'approved' || !item.signedInBy) return { status: 'pending' };
    this.editors.delete(code);
    const record = this.store.getUser(item.signedInBy);
    if (!record) throw unknownEditor();
    const user = { id: record.id, name: record.name, role: record.role };
    const token = `${editorTokenPrefix}${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(now + editorCredentialDays * 86_400_000).toISOString();
    this.store.createEditorCredential({ id: randomBytes(12).toString('hex'), tokenHash: digest(token), userId: user.id, label: 'VS Code', scope: 'editor', createdAt: new Date(now).toISOString(), expiresAt });
    return { status: 'ready', user, token, expiresAt };
  }

  /** A person's live editor credentials, without their token hashes. */
  editorCredentials(user: User): Array<Omit<EditorCredential, 'tokenHash' | 'userId'>> {
    return this.store.editorCredentials(user.id).map(({ id, label, scope, createdAt, expiresAt, lastUsedAt }) => ({ id, label, scope, createdAt, expiresAt, ...(lastUsedAt ? { lastUsedAt } : {}) }));
  }

  /** Revokes one of a person's editor credentials and returns the sign-in it identified. */
  revokeEditorCredential(user: User, id: string): string {
    const removed = this.store.deleteEditorCredential(user.id, id);
    if (!removed) throw failure(404, 'not_found', 'No editor with that credential is signed in as you.');
    return removed.tokenHash;
  }

  private liveTicket(code: string): EditorTicket | undefined {
    const item = this.editors.get(code);
    if (item && Date.now() - item.createdAt > editorTicketMs) { this.editors.delete(code); return undefined; }
    return item;
  }

  issue(user: User): { user: User; cookie: string } {
    const token = randomBytes(32).toString('base64url');
    const seconds = this.config.auth.sessionHours * 3600;
    this.store.createLogin(digest(token), user.id, new Date(Date.now() + seconds * 1000).toISOString());
    return { user, cookie: this.cookie(token, seconds) };
  }
  cookie(value: string, seconds: number): string {
    return `${this.cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${this.config.auth.secureCookies ? '; Secure' : ''}`;
  }
  logout(req: IncomingMessage): string {
    const bearer = this.bearer(req);
    if (bearer !== undefined) {
      if (editorTokenPattern.test(bearer)) this.store.deleteEditorCredentialByToken(digest(bearer));
      return this.cookie('', 0);
    }
    const token = this.token(req);
    if (token) this.store.deleteLogin(digest(token));
    return this.cookie('', 0);
  }
}
