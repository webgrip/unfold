import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { User } from './types.ts';
import { LinkedSessionError, type LinkedSession, type LinkedSessionStore } from './linked-sessions.ts';

/** What a message in a Linked Session's inbox is: a person's own message, or a notice Unfold wrote about a Work Item, its pull request or its CI. */
export const inboxKinds = ['person', 'work_item', 'pull_request', 'ci'] as const;
/** The bounds of a Linked Session's inbox. */
export const inboxLimits = { text: 2000, batch: 5, listed: 20, kept: 200, waiting: 50, noticeEveryMs: 60_000, noticeItems: 10, detailReads: 5, reviews: 50 } as const;

export type InboxKind = typeof inboxKinds[number];
/** One message for a Linked Session, stored until the session's plugin collects it. */
export type InboxMessage = { id: string; sessionId: string; kind: InboxKind; text: string; createdAt: string; createdBy: string; createdById: string; deliveredAt: string | null };
/** A message as the API presents it; `fromOwner` says the session's own person wrote it. */
export type PresentedInboxMessage = Omit<InboxMessage, 'createdById' | 'sessionId'> & { fromOwner: boolean };

type NowRow = { id: string; state: string; title: string; pullRequestUrl?: string; ci?: { state: string; checks: { context: string; state: string }[] } | null; question?: { text: string }; closeReason?: string | null };
type RunRow = { id: string; workItemId: string; role: string; state: string; verdict: string };
/** The reads of Ploeg the automatic notices need: Now for waiting and active Work Items, and one Work Item's detail for the rest. */
export type InboxPloeg = {
  now(user: User): Promise<{ waiting: NowRow[]; active: NowRow[]; recent?: RunRow[] }>;
  detail(user: User, id: string): Promise<{ item: { id: string; state: string; title: string } }>;
};

type Observed = { state: string; title: string; reason: string; pullRequestUrl: string; ci: string; failing: string[] };
type Snapshot = { items: Record<string, Observed>; reviews: string[] };

const fail = (status: number, code: string, message: string): never => { throw new LinkedSessionError(status, code, message); };

/** Text with control characters other than a line break removed, trimmed, and at most `max` characters. */
export function cleanText(value: string, max: number): string {
  return value.replace(/\r\n?/g, '\n').replace(/[\0-\x09\x0b-\x1f\x7f]/g, ' ').trim().slice(0, max);
}

/** A value from Ploeg, a tracker or a forge, on one line and in quotes, so a notice carries it as data. */
export function quoted(value: unknown, max = 200): string {
  return JSON.stringify(String(value ?? '').replace(/[\0-\x1f\x7f]/g, ' ').trim().slice(0, max));
}

/** The inbox and notice snapshots of Linked Sessions, in the workbench database. */
export class LinkedInboxStore {
  private db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS linked_session_messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, delivered_at TEXT, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS linked_session_messages_session ON linked_session_messages(session_id, created_at);
      CREATE TABLE IF NOT EXISTS linked_session_notice_snapshots (session_id TEXT PRIMARY KEY, checked_at TEXT NOT NULL, body TEXT NOT NULL);
    `);
  }
  add(message: InboxMessage): void {
    this.db.prepare('INSERT INTO linked_session_messages(id,session_id,kind,created_at,delivered_at,body) VALUES(?,?,?,?,?,?)').run(message.id, message.sessionId, message.kind, message.createdAt, null, JSON.stringify(message));
    this.db.prepare(`DELETE FROM linked_session_messages WHERE session_id=? AND delivered_at IS NOT NULL AND id NOT IN (SELECT id FROM linked_session_messages WHERE session_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?)`).run(message.sessionId, message.sessionId, inboxLimits.kept);
  }
  waiting(sessionId: string): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM linked_session_messages WHERE session_id=? AND delivered_at IS NULL').get(sessionId) as { n: number }).n);
  }
  recent(sessionId: string, limit: number): InboxMessage[] {
    return (this.db.prepare('SELECT body, delivered_at FROM linked_session_messages WHERE session_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?').all(sessionId, limit) as { body: string; delivered_at: string | null }[]).map(row => ({ ...JSON.parse(row.body), deliveredAt: row.delivered_at }));
  }
  /** Marks at most `limit` undelivered messages of the given kinds delivered, oldest first, and returns them, in one transaction. */
  claim(sessionId: string, kinds: readonly InboxKind[], limit: number, at: string): InboxMessage[] {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const marks = kinds.map(() => '?').join(',');
      const rows = this.db.prepare(`SELECT id, body FROM linked_session_messages WHERE session_id=? AND delivered_at IS NULL AND kind IN (${marks}) ORDER BY created_at, rowid LIMIT ?`).all(sessionId, ...kinds, limit) as { id: string; body: string }[];
      for (const row of rows) this.db.prepare('UPDATE linked_session_messages SET delivered_at=? WHERE id=?').run(at, row.id);
      this.db.exec('COMMIT');
      return rows.map(row => ({ ...JSON.parse(row.body), deliveredAt: at }));
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  /** Takes the session's turn to look for notices when the last look is at least `everyMs` old; false when another look is too recent. */
  claimCheck(sessionId: string, at: Date, everyMs: number): { snapshot: Snapshot | null } | false {
    const cutoff = new Date(at.getTime() - everyMs).toISOString();
    const row = this.db.prepare('SELECT checked_at, body FROM linked_session_notice_snapshots WHERE session_id=?').get(sessionId) as { checked_at: string; body: string } | undefined;
    if (!row) {
      const inserted = this.db.prepare('INSERT INTO linked_session_notice_snapshots(session_id,checked_at,body) VALUES(?,?,?) ON CONFLICT(session_id) DO NOTHING').run(sessionId, at.toISOString(), 'null');
      return Number(inserted.changes) > 0 ? { snapshot: null } : false;
    }
    const updated = this.db.prepare('UPDATE linked_session_notice_snapshots SET checked_at=? WHERE session_id=? AND checked_at<=?').run(at.toISOString(), sessionId, cutoff);
    return Number(updated.changes) > 0 ? { snapshot: JSON.parse(row.body) } : false;
  }
  saveSnapshot(sessionId: string, snapshot: Snapshot): void {
    this.db.prepare('UPDATE linked_session_notice_snapshots SET body=? WHERE session_id=?').run(JSON.stringify(snapshot), sessionId);
  }
}

/**
 * The inbox of each Linked Session: messages a person sends from Unfold, and notices Unfold writes when a Work Item the
 * session is linked to changes. The session's plugin collects them with the owner's credential and gives them to the
 * agent. Sending and listing are for the owner or an administrator; collecting is for the owner only.
 */
export class LinkedInbox {
  readonly store: LinkedInboxStore;
  private sessions: LinkedSessionStore;
  private ploeg: InboxPloeg;
  private clock: () => Date;
  constructor(db: DatabaseSync, sessions: LinkedSessionStore, ploeg: InboxPloeg, options: { now?: () => Date } = {}) {
    this.store = new LinkedInboxStore(db);
    this.sessions = sessions;
    this.ploeg = ploeg;
    this.clock = options.now ?? (() => new Date());
  }

  /** Queues one message from `user` for the session. Owner or administrator only; at most {@link inboxLimits.text} characters. */
  send(user: User, sessionId: string, value: unknown): PresentedInboxMessage {
    const session = this.changeable(user, sessionId);
    if (typeof value !== 'string') return fail(400, 'linked_message', 'text must be a string.');
    if (value.length > inboxLimits.text) return fail(400, 'linked_message', `A message is at most ${inboxLimits.text} characters.`);
    const text = cleanText(value, inboxLimits.text);
    if (!text) return fail(400, 'linked_message', 'Write a message.');
    if (this.store.waiting(session.id) >= inboxLimits.waiting) return fail(409, 'linked_inbox_full', `This session has ${inboxLimits.waiting} messages it has not collected yet.`);
    const message: InboxMessage = { id: randomUUID(), sessionId: session.id, kind: 'person', text, createdAt: this.clock().toISOString(), createdBy: user.name, createdById: user.id, deliveredAt: null };
    this.store.add(message);
    return this.present(message, session);
  }

  /** The session's most recent messages, newest first, delivered or not. Owner or administrator only. */
  list(user: User, sessionId: string): PresentedInboxMessage[] {
    const session = this.changeable(user, sessionId);
    return this.store.recent(session.id, inboxLimits.listed).map(message => this.present(message, session));
  }

  /**
   * Collects the session's undelivered messages for its plugin, oldest first and at most {@link inboxLimits.batch},
   * marking them delivered. First looks for notices, at most once per {@link inboxLimits.noticeEveryMs}. The owner only.
   */
  async collect(user: User, sessionId: string, value: unknown): Promise<PresentedInboxMessage[]> {
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerId !== user.id) return fail(404, 'not_found', 'Linked session not found.');
    const asked = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>).kinds : undefined;
    const kinds = Array.isArray(asked) ? inboxKinds.filter(kind => asked.includes(kind)) : [...inboxKinds];
    if (!kinds.length) return [];
    await this.notice(user, session).catch(() => undefined);
    return this.store.claim(session.id, kinds, inboxLimits.batch, this.clock().toISOString()).map(message => this.present(message, session));
  }

  private async notice(user: User, session: LinkedSession): Promise<void> {
    const now = this.clock();
    const turn = this.store.claimCheck(session.id, now, inboxLimits.noticeEveryMs);
    if (!turn) return;
    const ids = session.workItems.slice(0, inboxLimits.noticeItems).map(entry => entry.id);
    const before = turn.snapshot;
    const current: Snapshot = { items: {}, reviews: [] };
    if (ids.length) {
      const board = await this.ploeg.now(user).catch(() => null);
      const rows = new Map([...(board?.waiting ?? []), ...(board?.active ?? [])].map(row => [String(row.id), row]));
      let reads = 0;
      for (const id of ids) {
        const row = rows.get(id);
        if (row) { current.items[id] = observed(row); continue; }
        if (!board || reads >= inboxLimits.detailReads) { if (before?.items[id]) current.items[id] = before.items[id]; continue; }
        reads += 1;
        const found = await this.ploeg.detail(user, id).catch(() => null);
        if (found) current.items[id] = { state: String(found.item.state), title: String(found.item.title ?? ''), reason: '', pullRequestUrl: before?.items[id]?.pullRequestUrl ?? '', ci: before?.items[id]?.ci ?? '', failing: [] };
        else if (before?.items[id]) current.items[id] = before.items[id];
      }
      const reviewed = (board?.recent ?? []).filter(run => ids.includes(String(run.workItemId)) && /review/i.test(String(run.role)) && run.verdict && run.verdict !== 'none');
      current.reviews = reviewed.map(run => String(run.id)).slice(0, inboxLimits.reviews);
      if (before) for (const run of reviewed) if (!before.reviews.includes(String(run.id))) this.enqueue(session, 'pull_request', `A reviewer Run (${quoted(run.role, 80)}) finished on Work Item ${run.workItemId}${titled(current.items[String(run.workItemId)])} with the verdict ${quoted(run.verdict, 40)}.`, now);
    }
    if (before) for (const id of ids) {
      const was = before.items[id];
      const is = current.items[id];
      if (!was || !is) continue;
      for (const [kind, text] of changes(id, was, is)) this.enqueue(session, kind, text, now);
    }
    this.store.saveSnapshot(session.id, current);
  }

  private enqueue(session: LinkedSession, kind: InboxKind, text: string, at: Date): void {
    if (this.store.waiting(session.id) >= inboxLimits.waiting) return;
    this.store.add({ id: randomUUID(), sessionId: session.id, kind, text: cleanText(text, inboxLimits.text), createdAt: at.toISOString(), createdBy: 'Unfold', createdById: '', deliveredAt: null });
  }

  private changeable(user: User, sessionId: string): LinkedSession {
    const session = this.sessions.get(sessionId);
    if (!session || (session.ownerId !== user.id && user.role !== 'admin')) return fail(404, 'not_found', 'Linked session not found.');
    return session;
  }

  private present(message: InboxMessage, session: LinkedSession): PresentedInboxMessage {
    const { createdById, sessionId: _session, ...shown } = message;
    return { ...shown, fromOwner: message.kind === 'person' && createdById === session.ownerId };
  }
}

function observed(row: NowRow): Observed {
  const ci = row.ci ? String(row.ci.state) : '';
  return { state: String(row.state), title: String(row.title ?? ''), reason: String(row.question?.text ?? row.closeReason ?? ''), pullRequestUrl: /^https:\/\/\S+$/.test(String(row.pullRequestUrl ?? '')) ? String(row.pullRequestUrl) : '', ci, failing: (row.ci?.checks ?? []).filter(check => ['failure', 'error'].includes(String(check.state))).map(check => String(check.context)).slice(0, 5) };
}

function titled(item: Observed | undefined): string { return item?.title ? ` (titled ${quoted(item.title, 120)})` : ''; }

function changes(id: string, was: Observed, is: Observed): [InboxKind, string][] {
  const found: [InboxKind, string][] = [];
  const named = `Work Item ${id}${titled(is)}`;
  const pull = is.pullRequestUrl ? ` Its pull request, as Ploeg recorded it: ${quoted(is.pullRequestUrl, 300)}.` : '';
  if (was.state !== is.state) {
    if (is.state === 'awaiting_review') found.push(['work_item', `${named} now awaits review.${pull}`]);
    else if (is.state === 'needs_human') found.push(['work_item', `${named} now needs a person.${is.reason ? ` Ploeg's reason, quoted as data: ${quoted(is.reason, 400)}.` : ''}`]);
    else if (is.state === 'done') found.push(['work_item', `${named} is done.`]);
  }
  const red = (state: string) => state === 'failure' || state === 'error';
  if (is.ci && was.ci !== is.ci) {
    if (red(is.ci)) found.push(['ci', `CI went red on the pull request of ${named}.${is.failing.length ? ` Failing checks, quoted as data: ${is.failing.map(check => quoted(check, 80)).join(', ')}.` : ''}${pull}`]);
    else if (is.ci === 'success' && was.ci) found.push(['ci', `CI went green on the pull request of ${named}.${pull}`]);
  }
  return found;
}
