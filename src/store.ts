import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import type { Session, Event, PermissionRequest, User } from './types.ts';

export type StoredUser = User & { passwordHash: string };
export type Login = { tokenHash: string; userId: string; expiresAt: string };

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
      CREATE TABLE IF NOT EXISTS internal_state (id TEXT PRIMARY KEY, ciphertext TEXT NOT NULL);
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

  events(sessionId: string, after = 0): Event[] {
    const rows = this.db.prepare('SELECT * FROM events WHERE session_id=? AND id>? ORDER BY id').all(sessionId, after) as Record<string, unknown>[];
    return rows.map(row => ({ id: Number(row.id), sessionId: String(row.session_id), type: String(row.type), at: String(row.at), actor: String(row.actor), ...(row.run_id ? { runId: String(row.run_id) } : {}), data: JSON.parse(String(row.data)) }));
  }

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

  upsertUser(user: StoredUser): void {
    this.db.prepare('INSERT INTO users(id,name,role,password_hash) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role').run(user.id, user.name, user.role, user.passwordHash);
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
}

export function publicSession(session: Session): Session {
  const copy = structuredClone(session);
  delete copy.workspace;
  for (const run of copy.runs) delete run.nativeId;
  return copy;
}
