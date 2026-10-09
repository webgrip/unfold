import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import type { Session, Event, PermissionRequest, User } from './types.ts';

export type StoredUser = User & { passwordHash: string };
export type Login = { tokenHash: string; userId: string; expiresAt: string };
/** A credential issued to one editor after its person approved the sign-in in a browser. The token itself is never stored. */
export type EditorCredential = { id: string; tokenHash: string; userId: string; label: string; scope: 'editor'; createdAt: string; expiresAt: string; lastUsedAt?: string };
/** A note an administrator posts on the Status page while something affects the workbench. */
export type StatusNote = { id: string; severity: 'info' | 'degraded' | 'outage'; text: string; author: string; createdAt: string; resolvedAt?: string; resolvedBy?: string };

function eventFromRow(row: Record<string, unknown>): Event {
  return { id: Number(row.id), sessionId: String(row.session_id), type: String(row.type), at: String(row.at), actor: String(row.actor), ...(row.run_id ? { runId: String(row.run_id) } : {}), data: JSON.parse(String(row.data)) };
}

export class Store {
  db: DatabaseSync;
  private encryptionKey: Buffer;

  constructor(path: string) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const keyPath = `${path}.key`;
      if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
      this.encryptionKey = readFileSync(keyPath);
      chmodSync(keyPath, 0o600);
    } else this.encryptionKey = randomBytes(32);
    if (this.encryptionKey.length !== 32) throw new Error('Invalid internal state encryption key');
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_owner ON sessions(owner_id);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES sessions(id), type TEXT NOT NULL, at TEXT NOT NULL, actor TEXT NOT NULL, run_id TEXT, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_session ON events(session_id,id);
      CREATE TABLE IF NOT EXISTS permissions (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, role TEXT NOT NULL, password_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS logins (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS editor_credentials (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id), label TEXT NOT NULL, scope TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_used_at TEXT);
      CREATE INDEX IF NOT EXISTS editor_credentials_user ON editor_credentials(user_id);
      CREATE TABLE IF NOT EXISTS internal_state (id TEXT PRIMARY KEY, ciphertext TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS card_identities (user_id TEXT PRIMARY KEY, logins TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS card_binders (user_id TEXT PRIMARY KEY, started_at TEXT NOT NULL, seen_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS card_seen (user_id TEXT NOT NULL, work_item_id TEXT NOT NULL, seen_at TEXT NOT NULL, snapshot TEXT NOT NULL, PRIMARY KEY (user_id, work_item_id));
      CREATE TABLE IF NOT EXISTS card_packs (user_id TEXT NOT NULL, pack_id TEXT NOT NULL, opened_at TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (user_id, pack_id));
      CREATE TABLE IF NOT EXISTS card_pulls (user_id TEXT NOT NULL, work_item_id TEXT NOT NULL, pack_id TEXT NOT NULL, pattern TEXT NOT NULL, alt_art INTEGER, full_art INTEGER NOT NULL, gold_signature INTEGER NOT NULL, odds_version TEXT NOT NULL, message TEXT NOT NULL, digest TEXT NOT NULL, pulled_at TEXT NOT NULL, PRIMARY KEY (user_id, work_item_id));
      CREATE TABLE IF NOT EXISTS card_worlds (user_id TEXT NOT NULL, work_item_id TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (user_id, work_item_id));
      CREATE TABLE IF NOT EXISTS card_themes (id TEXT PRIMARY KEY, version INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS card_theme_versions (theme_id TEXT NOT NULL, version INTEGER NOT NULL, saved_at TEXT NOT NULL, saved_by TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(theme_id, version));
      CREATE TABLE IF NOT EXISTS card_assets (id TEXT PRIMARY KEY, purpose TEXT NOT NULL, media_type TEXT NOT NULL, bytes INTEGER NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL, content BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS status_notes (id TEXT PRIMARY KEY, severity TEXT NOT NULL, text TEXT NOT NULL, author TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT, resolved_by TEXT);
      CREATE TABLE IF NOT EXISTS product_event (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, actor TEXT NOT NULL, session TEXT NOT NULL, name TEXT NOT NULL, screen TEXT NOT NULL DEFAULT '', work_item_id INTEGER, shift_id INTEGER, props TEXT NOT NULL DEFAULT '{}', at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS product_event_at ON product_event(at);
      CREATE INDEX IF NOT EXISTS product_event_day ON product_event(name, screen, at);
      CREATE TABLE IF NOT EXISTS product_event_daily (tenant_id TEXT NOT NULL, day TEXT NOT NULL, name TEXT NOT NULL, screen TEXT NOT NULL DEFAULT '', count INTEGER NOT NULL, actors INTEGER NOT NULL, PRIMARY KEY (tenant_id, day, name, screen));
      CREATE TABLE IF NOT EXISTS agent_host_views (user_id TEXT NOT NULL, session_id TEXT NOT NULL, session_flags INTEGER NOT NULL, chat_flags INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, session_id));
    `);
  }

  close(): void { this.db.close(); }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  saveSession(session: Session): void {
    const body = { ...session };
    if (body.workspace) this.setSecret(`workspace:${session.id}`, body.workspace);
    delete body.workspace;
    this.db.prepare('INSERT INTO sessions(id,owner_id,updated_at,body) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,updated_at=excluded.updated_at,body=excluded.body')
      .run(session.id, session.ownerId, session.updatedAt, JSON.stringify(body));
  }

  getSession(id: string): Session | undefined {
    const row = this.db.prepare('SELECT body FROM sessions WHERE id=?').get(id) as { body: string } | undefined;
    return row ? this.restoreSession(row.body) : undefined;
  }

  listSessions(): Session[] {
    return (this.db.prepare('SELECT body FROM sessions ORDER BY updated_at DESC,id').all() as { body: string }[]).map(row => this.restoreSession(row.body));
  }

  /** The owner of every session that is running, waiting for input or exporting its candidate, once per session. */
  activeSessionOwners(): string[] {
    return (this.db.prepare("SELECT owner_id AS owner FROM sessions WHERE json_extract(body,'$.status') IN ('running','waiting_input','exporting')").all() as { owner: string }[]).map(row => row.owner);
  }

  private restoreSession(body: string): Session {
    const session: Session = JSON.parse(body);
    const workspace = this.getSecret<Session['workspace']>(`workspace:${session.id}`);
    if (workspace) session.workspace = workspace;
    return session;
  }

  appendEvent(sessionId: string, type: string, actor: string, data: Record<string, unknown>, runId?: string): Event {
    const at = new Date().toISOString();
    const result = this.db.prepare('INSERT INTO events(session_id,type,at,actor,run_id,data) VALUES(?,?,?,?,?,?)')
      .run(sessionId, type, at, actor, runId ?? null, JSON.stringify(data));
    return { id: Number(result.lastInsertRowid), sessionId, type, at, actor, ...(runId ? { runId } : {}), data };
  }

  /** Every event of a session after the `after` cursor, oldest first. */
  events(sessionId: string, after = 0): Event[] {
    const rows = this.db.prepare('SELECT * FROM events WHERE session_id=? AND id>? ORDER BY id').all(sessionId, after) as Record<string, unknown>[];
    return rows.map(eventFromRow);
  }

  /** At most `limit` events of a session after the `after` cursor, oldest first; a page shorter than `limit` is the last one. */
  eventPage(sessionId: string, after: number, limit: number): Event[] {
    const rows = this.db.prepare('SELECT * FROM events WHERE session_id=? AND id>? ORDER BY id LIMIT ?').all(sessionId, after, limit) as Record<string, unknown>[];
    return rows.map(eventFromRow);
  }

  /** Runs one trivial query, proving the database answers without reading or decrypting any stored record. */
  ping(): void { this.db.prepare('SELECT 1').get(); }

  /** When an event of `type` was last recorded for any session. */
  lastEventAt(type: string): string | undefined {
    const row = this.db.prepare('SELECT at FROM events WHERE type=? ORDER BY id DESC LIMIT 1').get(type) as { at: string } | undefined;
    return row?.at;
  }

  addStatusNote(note: StatusNote): void {
    this.db.prepare('INSERT INTO status_notes(id,severity,text,author,created_at) VALUES(?,?,?,?,?)').run(note.id, note.severity, note.text, note.author, note.createdAt);
  }

  resolveStatusNote(id: string, by: string, at: string): StatusNote | undefined {
    this.db.prepare('UPDATE status_notes SET resolved_at=?, resolved_by=? WHERE id=? AND resolved_at IS NULL').run(at, by, id);
    return this.statusNote(this.db.prepare('SELECT * FROM status_notes WHERE id=?').get(id));
  }

  /** Open notes and the notes resolved after `resolvedSince`, newest first. */
  statusNotes(resolvedSince: string): StatusNote[] {
    return this.db.prepare('SELECT * FROM status_notes WHERE resolved_at IS NULL OR resolved_at>=? ORDER BY created_at DESC, id').all(resolvedSince).map(row => this.statusNote(row)!);
  }

  private statusNote(row: unknown): StatusNote | undefined {
    if (!row) return undefined;
    const value = row as Record<string, string | null>;
    return { id: value.id!, severity: value.severity as StatusNote['severity'], text: value.text!, author: value.author!, createdAt: value.created_at!, ...(value.resolved_at ? { resolvedAt: value.resolved_at } : {}), ...(value.resolved_by ? { resolvedBy: value.resolved_by } : {}) };
  }

  /** One person's view of an agent host session, by the id the host advertises for it. A view never set reads as zero. */
  agentHostView(userId: string, sessionId: string): AgentHostView {
    const row = this.db.prepare('SELECT session_flags, chat_flags FROM agent_host_views WHERE user_id=? AND session_id=?').get(userId, sessionId) as { session_flags: number; chat_flags: number } | undefined;
    return { session: Number(row?.session_flags ?? 0), chat: Number(row?.chat_flags ?? 0) };
  }

  setAgentHostView(userId: string, sessionId: string, view: AgentHostView, at: string): void {
    this.db.prepare('INSERT INTO agent_host_views(user_id,session_id,session_flags,chat_flags,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id, session_id) DO UPDATE SET session_flags=excluded.session_flags, chat_flags=excluded.chat_flags, updated_at=excluded.updated_at').run(userId, sessionId, view.session, view.chat, at);
  }

  /** Clears `flags` from every person's view of one agent host session and its chat, and answers the people whose view changed. */
  clearAgentHostFlags(sessionId: string, flags: number, at: string): string[] {
    const changed = (this.db.prepare('SELECT user_id FROM agent_host_views WHERE session_id=? AND ((session_flags & ?) != 0 OR (chat_flags & ?) != 0)').all(sessionId, flags, flags) as { user_id: string }[]).map(row => row.user_id);
    if (changed.length) this.db.prepare('UPDATE agent_host_views SET session_flags=session_flags & ~?, chat_flags=chat_flags & ~?, updated_at=? WHERE session_id=?').run(flags, flags, at, sessionId);
    return changed;
  }

  deleteAgentHostViews(sessionId: string): void { this.db.prepare('DELETE FROM agent_host_views WHERE session_id=?').run(sessionId); }

  savePermission(request: PermissionRequest): void {
    this.db.prepare('INSERT INTO permissions(id,session_id,body) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(request.id, request.sessionId, JSON.stringify(request));
  }

  permissions(sessionId: string): PermissionRequest[] {
    return (this.db.prepare('SELECT body FROM permissions WHERE session_id=? ORDER BY rowid').all(sessionId) as { body: string }[]).map(row => JSON.parse(row.body));
  }

  getPermission(id: string): PermissionRequest | undefined {
    const row = this.db.prepare('SELECT body FROM permissions WHERE id=?').get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }

  addUser(user: StoredUser): void {
    this.db.prepare('INSERT INTO users(id,name,role,password_hash) VALUES(?,?,?,?)').run(user.id, user.name, user.role, user.passwordHash);
  }

  /** Stores a user by id and returns the name it holds: `user.name`, or a numbered variant when another account already holds that name. */
  upsertUser(user: StoredUser): string {
    return this.transaction(() => {
      const name = this.nameFreeFor(user.id, user.name);
      this.db.prepare('INSERT INTO users(id,name,role,password_hash) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role').run(user.id, name, user.role, user.passwordHash);
      return name;
    });
  }

  private nameFreeFor(id: string, name: string): string {
    const holder = this.db.prepare('SELECT id FROM users WHERE name=? COLLATE NOCASE');
    for (let attempt = 1; ; attempt++) {
      const suffix = attempt === 1 ? '' : ` (${attempt})`;
      const candidate = name.slice(0, 100 - suffix.length) + suffix;
      const row = holder.get(candidate) as { id: string } | undefined;
      if (!row || row.id === id) return candidate;
    }
  }

  getUserByName(name: string): StoredUser | undefined {
    return this.user(this.db.prepare('SELECT * FROM users WHERE name=? COLLATE NOCASE').get(name));
  }

  getUser(id: string): StoredUser | undefined { return this.user(this.db.prepare('SELECT * FROM users WHERE id=?').get(id)); }

  private user(row: unknown): StoredUser | undefined {
    if (!row) return undefined;
    const value = row as Record<string, string>;
    return { id: value.id, name: value.name, role: value.role as User['role'], passwordHash: value.password_hash };
  }

  createLogin(tokenHash: string, userId: string, expiresAt: string): void {
    this.db.prepare('INSERT INTO logins(token_hash,user_id,expires_at) VALUES(?,?,?)').run(tokenHash, userId, expiresAt);
  }

  getLogin(tokenHash: string): Login | undefined {
    const row = this.db.prepare('SELECT * FROM logins WHERE token_hash=? AND expires_at>?').get(tokenHash, new Date().toISOString()) as Record<string, string> | undefined;
    return row ? { tokenHash: row.token_hash, userId: row.user_id, expiresAt: row.expires_at } : undefined;
  }

  deleteLogin(tokenHash: string): void { this.db.prepare('DELETE FROM logins WHERE token_hash=?').run(tokenHash); }

  createEditorCredential(credential: EditorCredential): void {
    this.db.prepare('INSERT INTO editor_credentials(id,token_hash,user_id,label,scope,created_at,expires_at,last_used_at) VALUES(?,?,?,?,?,?,?,?)').run(credential.id, credential.tokenHash, credential.userId, credential.label, credential.scope, credential.createdAt, credential.expiresAt, credential.lastUsedAt ?? null);
  }

  /** The unexpired editor credential whose token hashes to `tokenHash`. */
  getEditorCredential(tokenHash: string): EditorCredential | undefined {
    return this.editorCredential(this.db.prepare('SELECT * FROM editor_credentials WHERE token_hash=? AND expires_at>?').get(tokenHash, new Date().toISOString()));
  }

  /** A person's unexpired editor credentials, newest first. */
  editorCredentials(userId: string): EditorCredential[] {
    return (this.db.prepare('SELECT * FROM editor_credentials WHERE user_id=? AND expires_at>? ORDER BY created_at DESC, id').all(userId, new Date().toISOString())).map(row => this.editorCredential(row)!);
  }

  touchEditorCredential(id: string, at: string): void { this.db.prepare('UPDATE editor_credentials SET last_used_at=? WHERE id=?').run(at, id); }

  /** Deletes one of a person's editor credentials and returns it, or undefined when that person holds no such credential. */
  deleteEditorCredential(userId: string, id: string): EditorCredential | undefined {
    const found = this.editorCredential(this.db.prepare('SELECT * FROM editor_credentials WHERE id=? AND user_id=?').get(id, userId));
    if (found) this.db.prepare('DELETE FROM editor_credentials WHERE id=?').run(id);
    return found;
  }

  deleteEditorCredentialByToken(tokenHash: string): void { this.db.prepare('DELETE FROM editor_credentials WHERE token_hash=?').run(tokenHash); }

  /** Whether `tokenHash` identifies a live sign-in: an unexpired browser login or editor credential. */
  liveSignIn(tokenHash: string): boolean { return Boolean(this.getLogin(tokenHash) ?? this.getEditorCredential(tokenHash)); }

  private editorCredential(row: unknown): EditorCredential | undefined {
    if (!row) return undefined;
    const value = row as Record<string, string | null>;
    return { id: String(value.id), tokenHash: String(value.token_hash), userId: String(value.user_id), label: String(value.label), scope: 'editor', createdAt: String(value.created_at), expiresAt: String(value.expires_at), ...(value.last_used_at ? { lastUsedAt: value.last_used_at } : {}) };
  }

  setSecret(id: string, value: unknown): void {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    cipher.setAAD(Buffer.from(id));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    const ciphertext = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
    this.db.prepare('INSERT INTO internal_state(id,ciphertext) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET ciphertext=excluded.ciphertext').run(id, ciphertext);
  }

  getSecret<T>(id: string): T | undefined {
    const row = this.db.prepare('SELECT ciphertext FROM internal_state WHERE id=?').get(id) as { ciphertext: string } | undefined;
    if (!row) return undefined;
    const bytes = Buffer.from(row.ciphertext, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
  }

  deleteSecret(id: string): void { this.db.prepare('DELETE FROM internal_state WHERE id=?').run(id); }

  /** The forge and tracker logins a person listed as theirs, used to find their card copies. */
  cardIdentity(userId: string): { logins: string[]; updatedAt: string } | undefined {
    const row = this.db.prepare('SELECT logins, updated_at FROM card_identities WHERE user_id=?').get(userId) as { logins: string; updated_at: string } | undefined;
    return row ? { logins: JSON.parse(row.logins), updatedAt: row.updated_at } : undefined;
  }

  setCardIdentity(userId: string, logins: string[], at: string): void {
    this.db.prepare('INSERT INTO card_identities(user_id,logins,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET logins=excluded.logins, updated_at=excluded.updated_at').run(userId, JSON.stringify(logins), at);
  }

  /** When a person first opened their binder or a pack, and the moment up to which they have seen their cards' news. */
  binderMark(userId: string): CardBinderMark | undefined {
    const row = this.db.prepare('SELECT started_at, seen_at FROM card_binders WHERE user_id=?').get(userId) as { started_at: string; seen_at: string } | undefined;
    return row ? { startedAt: row.started_at, seenAt: row.seen_at } : undefined;
  }

  /** Creates the binder mark at `at`, or moves its seen moment forward to `seenAt`; it never moves back. */
  markBinder(userId: string, at: string, seenAt: string): CardBinderMark {
    this.db.prepare('INSERT INTO card_binders(user_id,started_at,seen_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET seen_at=MAX(card_binders.seen_at, excluded.seen_at)').run(userId, at, seenAt);
    return this.binderMark(userId)!;
  }

  /** The moment up to which a person has seen one card's news, and the grade and set state they last saw on it. */
  cardSeen(userId: string, workItemId: string): CardSeenMark | undefined {
    const row = this.db.prepare('SELECT seen_at, snapshot FROM card_seen WHERE user_id=? AND work_item_id=?').get(userId, workItemId) as { seen_at: string; snapshot: string } | undefined;
    return row ? { seenAt: row.seen_at, snapshot: JSON.parse(row.snapshot) } : undefined;
  }

  /**
   * Moves a person's seen moment on one card forward to `seenAt` (it never moves back) and stores the snapshot they
   * saw. A person keeps marks for at most `cardSeenLimit` cards; the least recently seen ones are dropped first.
   */
  markCardSeen(userId: string, workItemId: string, seenAt: string, snapshot: CardSeenSnapshot): CardSeenMark {
    this.transaction(() => {
      this.db.prepare('INSERT INTO card_seen(user_id,work_item_id,seen_at,snapshot) VALUES(?,?,?,?) ON CONFLICT(user_id, work_item_id) DO UPDATE SET seen_at=MAX(card_seen.seen_at, excluded.seen_at), snapshot=excluded.snapshot').run(userId, workItemId, seenAt, JSON.stringify(snapshot));
      this.db.prepare('DELETE FROM card_seen WHERE user_id=? AND work_item_id NOT IN (SELECT work_item_id FROM card_seen WHERE user_id=? ORDER BY seen_at DESC, work_item_id LIMIT ?)').run(userId, userId, cardSeenLimit);
    });
    return this.cardSeen(userId, workItemId)!;
  }

  openedPack(userId: string, packId: string): StoredPack | undefined {
    const row = this.db.prepare('SELECT pack_id, opened_at, body FROM card_packs WHERE user_id=? AND pack_id=?').get(userId, packId) as { pack_id: string; opened_at: string; body: string } | undefined;
    return row ? { packId: row.pack_id, openedAt: row.opened_at, ...JSON.parse(row.body) } : undefined;
  }

  openedPacks(userId: string): StoredPack[] {
    return (this.db.prepare('SELECT pack_id, opened_at, body FROM card_packs WHERE user_id=? ORDER BY opened_at, pack_id').all(userId) as { pack_id: string; opened_at: string; body: string }[]).map(row => ({ packId: row.pack_id, openedAt: row.opened_at, ...JSON.parse(row.body) }));
  }

  /**
   * Records an opened pack and the first pulls it drew, in one transaction. A pack opens once per person, and a card's
   * first pull is never replaced: a second open, or a pull for a card that already has one, changes nothing and returns false.
   */
  recordPack(userId: string, pack: StoredPack, pulls: StoredPull[]): boolean {
    return this.transaction(() => {
      const inserted = this.db.prepare('INSERT INTO card_packs(user_id,pack_id,opened_at,body) VALUES(?,?,?,?) ON CONFLICT(user_id, pack_id) DO NOTHING').run(userId, pack.packId, pack.openedAt, JSON.stringify({ period: pack.period, entries: pack.entries, demo: pack.demo }));
      if (!inserted.changes) return false;
      const add = this.db.prepare('INSERT INTO card_pulls(user_id,work_item_id,pack_id,pattern,alt_art,full_art,gold_signature,odds_version,message,digest,pulled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id, work_item_id) DO NOTHING');
      for (const pull of pulls) add.run(userId, pull.workItemId, pull.packId, pull.pattern, pull.altArt, pull.fullArt ? 1 : 0, pull.goldSignature ? 1 : 0, pull.oddsVersion, pull.message, pull.digest, pull.pulledAt);
      return true;
    });
  }

  /** A person's decoration of their copy of a card, as they last saved it, or undefined. */
  cardWorld(userId: string, workItemId: string): { world: unknown; updatedAt: string } | undefined {
    const row = this.db.prepare('SELECT updated_at, body FROM card_worlds WHERE user_id=? AND work_item_id=?').get(userId, workItemId) as { updated_at: string; body: string } | undefined;
    return row ? { world: JSON.parse(row.body), updatedAt: row.updated_at } : undefined;
  }

  /** Stores a person's decoration of a card, replacing the last one. A person keeps at most `limit` decorations; the least recently changed are dropped first. */
  setCardWorld(userId: string, workItemId: string, world: unknown, at: string, limit: number): void {
    this.transaction(() => {
      this.db.prepare('INSERT INTO card_worlds(user_id,work_item_id,updated_at,body) VALUES(?,?,?,?) ON CONFLICT(user_id, work_item_id) DO UPDATE SET updated_at=excluded.updated_at, body=excluded.body').run(userId, workItemId, at, JSON.stringify(world));
      this.db.prepare('DELETE FROM card_worlds WHERE user_id=? AND work_item_id NOT IN (SELECT work_item_id FROM card_worlds WHERE user_id=? ORDER BY updated_at DESC, work_item_id LIMIT ?)').run(userId, userId, limit);
    });
  }

  /** Forgets a person's decoration of a card; answers whether there was one. */
  deleteCardWorld(userId: string, workItemId: string): boolean {
    return Number(this.db.prepare('DELETE FROM card_worlds WHERE user_id=? AND work_item_id=?').run(userId, workItemId).changes) > 0;
  }

  /** Every first pull a person holds, by Work Item. */
  pulls(userId: string): Map<string, StoredPull> {
    const rows = this.db.prepare('SELECT * FROM card_pulls WHERE user_id=?').all(userId) as Record<string, string | number | null>[];
    return new Map(rows.map(row => [String(row.work_item_id), { workItemId: String(row.work_item_id), packId: String(row.pack_id), pattern: String(row.pattern), altArt: row.alt_art === null ? null : Number(row.alt_art), fullArt: row.full_art === 1, goldSignature: row.gold_signature === 1, oddsVersion: String(row.odds_version), message: String(row.message), digest: String(row.digest), pulledAt: String(row.pulled_at) }]));
  }

  /** Stores one product event after the catalogue checked it and returns its row id. */
  recordProductEvent(event: StoredProductEvent): number {
    const result = this.db.prepare('INSERT INTO product_event(tenant_id,actor,session,name,screen,work_item_id,shift_id,props,at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(event.tenantId, event.actor, event.session, event.name, event.screen, event.workItemId ?? null, event.shiftId ?? null, JSON.stringify(event.props), event.at);
    return Number(result.lastInsertRowid);
  }

  /**
   * Replaces one UTC day's rows in `product_event_daily` with the rollup of that day's events, keeping the
   * count and the number of distinct actors per tenant, event and screen. It returns the number of rows written.
   */
  foldProductEventDay(day: string): number {
    const rows = this.db.prepare(`INSERT INTO product_event_daily(tenant_id,day,name,screen,count,actors)
      SELECT tenant_id, substr(at,1,10) AS day, name, screen, COUNT(*), COUNT(DISTINCT actor)
      FROM product_event WHERE substr(at,1,10)=? GROUP BY tenant_id,name,screen
      ON CONFLICT(tenant_id,day,name,screen) DO UPDATE SET count=excluded.count, actors=excluded.actors`).run(day);
    return Number(rows.changes);
  }

  /** The UTC days that hold at least one stored product event, oldest first. */
  productEventDays(): string[] {
    return (this.db.prepare('SELECT DISTINCT substr(at,1,10) AS day FROM product_event ORDER BY day').all() as { day: string }[]).map(row => row.day);
  }

  /** Deletes stored product events older than `cutoff` and returns how many rows went. */
  pruneProductEventsBefore(cutoff: string): number {
    return Number(this.db.prepare('DELETE FROM product_event WHERE at < ?').run(cutoff).changes);
  }

  /** Every daily rollup row, oldest first, for the aggregate export. */
  productEventDaily(): ProductEventDaily[] {
    return (this.db.prepare('SELECT tenant_id, day, name, screen, count, actors FROM product_event_daily ORDER BY day, name, screen').all() as Record<string, string | number>[])
      .map(row => ({ tenantId: String(row.tenant_id), day: String(row.day), name: String(row.name), screen: String(row.screen), count: Number(row.count), actors: Number(row.actors) }));
  }
}

/**
 * What one person marked on an agent host session, as AHP `SessionStatus` bits (32 read, 64 archived): `session` on the
 * session itself, `chat` on its default chat. A view belongs to the viewer and never changes the work.
 */
export type AgentHostView = { session: number; chat: number };
export type CardBinderMark = { startedAt: string; seenAt: string };
/** What a person last saw of a card that its moments cannot tell: its overall grade and whether its set was complete. */
export type CardSeenSnapshot = { grade: number | null; setComplete: boolean };
export type CardSeenMark = { seenAt: string; snapshot: CardSeenSnapshot };
/** How many cards' seen marks Unfold keeps per person. */
export const cardSeenLimit = 2000;
export type StoredPackEntry = { workItemId: string; kind: 'new' | 'upgrade'; moments: { kind: string; at: string; detail: Record<string, string | number> }[] };
export type StoredPack = { packId: string; openedAt: string; period: Record<string, unknown>; entries: StoredPackEntry[]; demo: boolean };
export type StoredPull = { workItemId: string; packId: string; pattern: string; altArt: number | null; fullArt: boolean; goldSignature: boolean; oddsVersion: string; message: string; digest: string; pulledAt: string };
export type StoredProductEvent = { tenantId: string; actor: string; session: string; name: string; screen: string; workItemId?: number; shiftId?: number; props: Record<string, string | number | boolean>; at: string };
export type ProductEventDaily = { tenantId: string; day: string; name: string; screen: string; count: number; actors: number };

export function publicSession(session: Session): Session {
  const copy = structuredClone(session);
  delete copy.workspace;
  for (const run of copy.runs) delete run.nativeId;
  return copy;
}

/** Database file names this application used before it was named Unfold, newest first. */
export const renamedDatabaseFiles = Object.freeze(['vloer.sqlite']);

/**
 * Gives `path` the data of a database file that an earlier release wrote under a former name in the same directory,
 * together with its write-ahead log and shared-memory files, when `path` does not exist yet. Returns the file it adopted.
 */
export function adoptRenamedDatabase(path: string): string | null {
  if (existsSync(path)) return null;
  for (const name of renamedDatabaseFiles) {
    const legacy = join(dirname(path), name);
    if (!existsSync(legacy)) continue;
    for (const suffix of ['', '-wal', '-shm', '.key']) if (existsSync(legacy + suffix)) renameSync(legacy + suffix, path + suffix);
    return legacy;
  }
  return null;
}
