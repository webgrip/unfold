import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Store } from '../store.ts';
import { noPreferences, type Preferences } from './preferences.ts';
import type { NotificationMessage } from './triggers.ts';

/** Where a notice stands: waiting to be sent, sent, given up, or dropped because the person's choice or target went away. */
export type OutboxState = 'pending' | 'delivered' | 'dead' | 'dropped';
/** One notice for one person, channel and target. */
export type OutboxEntry = {
  id: number; userId: string; channel: string; targetId: string; dedupeKey: string; message: NotificationMessage;
  state: OutboxState; attempts: number; nextAt: string; createdAt: string; updatedAt: string; lastError: string;
};
/** One place a channel delivers a person's notices: an ntfy topic, a push subscription. `address` is the channel's own data. */
export type Target = { id: string; userId: string; channel: string; address: Record<string, unknown>; createdAt: string };

type Row = Record<string, string | number | null>;
const entry = (row: Row): OutboxEntry => ({
  id: Number(row.id), userId: String(row.user_id), channel: String(row.channel), targetId: String(row.target_id), dedupeKey: String(row.dedupe_key),
  message: JSON.parse(String(row.message)), state: row.state as OutboxState, attempts: Number(row.attempts), nextAt: String(row.next_at),
  createdAt: String(row.created_at), updatedAt: String(row.updated_at), lastError: String(row.last_error ?? ''),
});
const target = (row: Row): Target => ({ id: String(row.id), userId: String(row.user_id), channel: String(row.channel), address: JSON.parse(String(row.address)), createdAt: String(row.created_at) });

/**
 * The notification tables in the workbench database: each person's preferences, their channel targets, the outbox
 * and the cursors of the sources. Preferences and targets are personal data; no key or token is stored here.
 */
export class NotifyStore {
  readonly db: DatabaseSync;
  readonly store: Store;
  constructor(store: Store) {
    this.store = store;
    this.db = store.db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notify_preferences (user_id TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notify_targets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, channel TEXT NOT NULL, address_key TEXT NOT NULL, address TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (channel, user_id, address_key));
      CREATE TABLE IF NOT EXISTS notify_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, channel TEXT NOT NULL, target_id TEXT NOT NULL, dedupe_key TEXT NOT NULL, message TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_error TEXT, UNIQUE (user_id, channel, target_id, dedupe_key));
      CREATE INDEX IF NOT EXISTS notify_outbox_due ON notify_outbox(state, next_at);
      CREATE TABLE IF NOT EXISTS notify_cursors (name TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    `);
  }

  preferences(userId: string): Preferences {
    const row = this.db.prepare('SELECT body FROM notify_preferences WHERE user_id=?').get(userId) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : noPreferences;
  }
  setPreferences(userId: string, preferences: Preferences, at: string): void {
    this.db.prepare('INSERT INTO notify_preferences(user_id,body,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at').run(userId, JSON.stringify(preferences), at);
  }
  /** The people who chose at least one trigger and one channel. */
  subscribers(): { userId: string; preferences: Preferences }[] {
    return (this.db.prepare('SELECT user_id, body FROM notify_preferences ORDER BY user_id').all() as { user_id: string; body: string }[])
      .map(row => ({ userId: row.user_id, preferences: JSON.parse(row.body) as Preferences }))
      .filter(row => row.preferences.channels.length > 0 && row.preferences.triggers.length > 0);
  }

  targets(userId: string, channel: string): Target[] {
    return (this.db.prepare('SELECT * FROM notify_targets WHERE user_id=? AND channel=? ORDER BY created_at, rowid').all(userId, channel) as Row[]).map(target);
  }
  target(id: string): Target | undefined {
    const row = this.db.prepare('SELECT * FROM notify_targets WHERE id=?').get(id) as Row | undefined;
    return row ? target(row) : undefined;
  }
  /** Stores a target, or replaces the address of the one with the same `addressKey`; keeps at most `limit` per person and channel. */
  putTarget(userId: string, channel: string, addressKey: string, address: Record<string, unknown>, at: string, limit: number): Target {
    return this.store.transaction(() => {
      this.db.prepare('INSERT INTO notify_targets(id,user_id,channel,address_key,address,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(channel,user_id,address_key) DO UPDATE SET address=excluded.address')
        .run(randomUUID(), userId, channel, addressKey, JSON.stringify(address), at);
      const stored = target(this.db.prepare('SELECT * FROM notify_targets WHERE channel=? AND user_id=? AND address_key=?').get(channel, userId, addressKey) as Row);
      const kept = this.targets(userId, channel).filter(entry => entry.id !== stored.id);
      for (const old of kept.slice(0, Math.max(0, kept.length + 1 - limit))) this.deleteTarget(old.id);
      return stored;
    });
  }
  /** Deletes a target and drops the notices still waiting for it. */
  deleteTarget(id: string): boolean {
    this.db.prepare("UPDATE notify_outbox SET state='dropped', last_error='target_removed' WHERE target_id=? AND state='pending'").run(id);
    return Number(this.db.prepare('DELETE FROM notify_targets WHERE id=?').run(id).changes) === 1;
  }

  /** Queues a notice once: a second call with the same person, channel, target and key changes nothing. Answers whether it was queued. */
  enqueue(userId: string, channel: string, targetId: string, dedupeKey: string, message: NotificationMessage, at: string): boolean {
    return Number(this.db.prepare("INSERT OR IGNORE INTO notify_outbox(user_id,channel,target_id,dedupe_key,message,state,attempts,next_at,created_at,updated_at) VALUES(?,?,?,?,?,'pending',0,?,?,?)")
      .run(userId, channel, targetId, dedupeKey, JSON.stringify(message), at, at, at).changes) === 1;
  }
  due(at: string, limit: number): OutboxEntry[] {
    return (this.db.prepare("SELECT * FROM notify_outbox WHERE state='pending' AND next_at<=? ORDER BY next_at, id LIMIT ?").all(at, limit) as Row[]).map(entry);
  }
  /** Records an attempt's result; `next` keeps it pending until then. */
  settle(id: number, state: OutboxState, at: string, changes: { attempts?: number; nextAt?: string; lastError?: string } = {}): void {
    this.db.prepare('UPDATE notify_outbox SET state=?, updated_at=?, attempts=COALESCE(?,attempts), next_at=COALESCE(?,next_at), last_error=COALESCE(?,last_error) WHERE id=?')
      .run(state, at, changes.attempts ?? null, changes.nextAt ?? null, changes.lastError ?? null, id);
  }
  recent(userId: string, limit: number): OutboxEntry[] {
    return (this.db.prepare('SELECT * FROM notify_outbox WHERE user_id=? ORDER BY id DESC LIMIT ?').all(userId, limit) as Row[]).map(entry);
  }
  /** Deletes finished notices older than `before`. */
  prune(before: string): void { this.db.prepare("DELETE FROM notify_outbox WHERE state<>'pending' AND updated_at<?").run(before); }
  /** Forgets everything about a person: preferences, targets and notices. */
  forget(userId: string): void {
    this.store.transaction(() => {
      for (const table of ['notify_outbox', 'notify_targets', 'notify_preferences']) this.db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(userId);
    });
  }

  cursor(name: string): string | undefined { return (this.db.prepare('SELECT value FROM notify_cursors WHERE name=?').get(name) as { value: string } | undefined)?.value; }
  setCursor(name: string, value: string, at: string): void {
    this.db.prepare('INSERT INTO notify_cursors(name,value,updated_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').run(name, value, at);
  }
  /** Whether a table exists, for sources whose tables another part of Unfold creates. */
  hasTable(name: string): boolean { return Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
}
