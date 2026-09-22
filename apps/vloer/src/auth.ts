import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { AppConfig, User } from './types.ts';
import type { Store } from './store.ts';

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

export class Auth {
  store: Store;
  config: AppConfig;
  cookieName: string;
  attempts = new Map<string, { count: number; since: number }>();
  constructor(store: Store, config: AppConfig) {
    this.store = store;
    this.config = config;
    this.cookieName = config.auth.secureCookies ? '__Host-vloer' : 'vloer';
    if (config.mode === 'live' && config.auth.bootstrapPassword && !store.getUserByName(config.auth.bootstrapName)) {
      store.addUser({ id: randomBytes(12).toString('hex'), name: config.auth.bootstrapName, role: 'admin', passwordHash: hashPassword(config.auth.bootstrapPassword) });
    }
  }
  token(req: IncomingMessage): string | undefined {
    const header = req.headers.cookie || '';
    return header.split(';').map(pair => pair.trim()).find(pair => pair.startsWith(`${this.cookieName}=`))?.slice(this.cookieName.length + 1);
  }
  /** Identifies the sign-in that authenticated a request without exposing its cookie value. */
  signIn(req: IncomingMessage): string | undefined {
    const token = this.token(req);
    return token && token.length <= 200 ? digest(token) : undefined;
  }
  user(req: IncomingMessage): User | undefined {
    if (this.config.mode === 'demo') return { id: 'demo-operator', name: 'Demo operator', role: 'admin' };
    const token = this.token(req);
    if (!token || token.length > 200) return undefined;
    const login = this.store.getLogin(digest(token));
    if (!login || Date.parse(login.expiresAt) <= Date.now()) return undefined;
    const user = this.store.getUser(login.userId);
    return user ? { id: user.id, name: user.name, role: user.role } : undefined;
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
  private readonly editors = new Map<string, { secretHash: string; createdAt: number; issued?: { user: User; cookie: string } }>();

  beginEditor(): { code: string; secret: string; expiresIn: number } {
    const now = Date.now();
    for (const [code, item] of this.editors) if (now - item.createdAt > 600_000) this.editors.delete(code);
    if (this.editors.size >= 1000) throw Object.assign(new Error('Too many editor sign-ins are waiting. Try again in a few minutes.'), { status: 429, code: 'rate_limited' });
    const code = randomBytes(9).toString('base64url');
    const secret = randomBytes(32).toString('base64url');
    this.editors.set(code, { secretHash: digest(secret), createdAt: now });
    return { code, secret, expiresIn: 600 };
  }

  editorPending(code: string): boolean {
    const item = this.editors.get(code);
    return Boolean(item && !item.issued && Date.now() - item.createdAt <= 600_000);
  }

  bindEditor(code: string, issued: { user: User; cookie: string }): void {
    const item = this.editors.get(code);
    if (item && !item.issued && Date.now() - item.createdAt <= 600_000) item.issued = issued;
  }

  collectEditor(code: string, secret: string): { status: 'pending' } | { status: 'ready'; user: User; cookie: string } {
    const item = this.editors.get(code);
    if (!item || Date.now() - item.createdAt > 600_000 || item.secretHash !== digest(secret)) throw Object.assign(new Error('This editor sign-in is unknown or has expired. Start it again.'), { status: 404, code: 'editor_login_unknown' });
    if (!item.issued) return { status: 'pending' };
    this.editors.delete(code);
    return { status: 'ready', user: item.issued.user, cookie: item.issued.cookie };
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
    const token = this.token(req);
    if (token) this.store.deleteLogin(digest(token));
    return this.cookie('', 0);
  }
}
