import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { User } from './types.ts';
import { LinkedSessionError, type LinkedSessionStore } from './linked-sessions.ts';
import { plainRedactedText } from './redaction.ts';

/** The bounds of remote permission answers: field lengths, waits in seconds, and how many requests one session keeps. */
export const permissionLimits = { tool: 80, summary: 200, detail: 120, reason: 500, pendingPerSession: 5, kept: 50, minWaitSeconds: 10, maxWaitSeconds: 300, defaultWaitSeconds: 120 } as const;
/** The answers a person can give a waiting tool-permission prompt from Unfold. "Always allow" is deliberately not one. */
export const permissionDecisions = ['allow', 'deny'] as const;
export type PermissionDecision = typeof permissionDecisions[number];
/**
 * Where a permission request stands: `pending` until someone answers, `answered` once the owner answered from Unfold,
 * `delivered` once the plugin collected the answer, `withdrawn` when the prompt was answered locally or went away, and
 * `expired` when nobody answered in time.
 */
export type PermissionState = 'pending' | 'answered' | 'delivered' | 'withdrawn' | 'expired';
/** Which credential made a request: the browser, an editor credential, one `unfold-mcp` over HTTP delegated, or a signed chat interaction of a linked chat account. */
export type PermissionScope = 'browser' | 'editor' | 'mcp' | 'chat' | undefined;

/** A tool-permission prompt of a Linked Session, as the plugin reported it, and its answer. */
export type PermissionRequest = {
  id: string; sessionId: string; ownerId: string; credential: string;
  tool: string; summary: string; detail: string;
  createdAt: string; expiresAt: string; state: PermissionState;
  decision: PermissionDecision | null; reason: string; answeredAt: string | null; answeredBy: string;
};
/** A permission request as the API presents it to its owner: never the credential that reported it. */
export type PresentedPermissionRequest = Omit<PermissionRequest, 'credential' | 'ownerId'>;
/** What the plugin learns when it collects: still pending, the answer (once), or that the request is over. */
export type CollectedPermission = { state: PermissionState; decision?: PermissionDecision; reason?: string };
/** Who is calling and how, for the checks that bind a request to its session, its owner and its credential. */
export type PermissionCaller = { user: User; scope: PermissionScope; credential?: string; confirmation?: string | null };

const fail = (status: number, code: string, message: string): never => { throw new LinkedSessionError(status, code, message); };
const toolPattern = /^[A-Za-z0-9_.:-]{1,80}$/;
const notFound = () => fail(404, 'not_found', 'Linked session not found.');

/** One line of plain text: secrets masked, control characters removed, trimmed and at most `max` characters. */
export function summaryText(value: unknown, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return fail(400, 'invalid_input', 'Every text field must be a string.');
  return plainRedactedText(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** The permission requests of Linked Sessions and which sessions opted in to remote answers, in the workbench database. */
export class LinkedPermissionStore {
  private db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS linked_session_permissions (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, state TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS linked_session_permissions_session ON linked_session_permissions(session_id, created_at);
      CREATE TABLE IF NOT EXISTS linked_session_remote_approval (session_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, enabled INTEGER NOT NULL, changed_at TEXT NOT NULL);
    `);
  }
  optedIn(sessionId: string): boolean {
    return Number((this.db.prepare('SELECT enabled FROM linked_session_remote_approval WHERE session_id=?').get(sessionId) as { enabled: number } | undefined)?.enabled ?? 0) === 1;
  }
  setOptIn(sessionId: string, ownerId: string, enabled: boolean, at: string): void {
    this.db.prepare('INSERT INTO linked_session_remote_approval(session_id,owner_id,enabled,changed_at) VALUES(?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET enabled=excluded.enabled, changed_at=excluded.changed_at').run(sessionId, ownerId, enabled ? 1 : 0, at);
  }
  get(id: string): PermissionRequest | undefined {
    const row = this.db.prepare('SELECT state, body FROM linked_session_permissions WHERE id=?').get(id) as { state: PermissionState; body: string } | undefined;
    return row ? { ...JSON.parse(row.body), state: row.state } : undefined;
  }
  add(request: PermissionRequest): void {
    this.db.prepare('INSERT INTO linked_session_permissions(id,session_id,state,expires_at,created_at,body) VALUES(?,?,?,?,?,?)').run(request.id, request.sessionId, request.state, request.expiresAt, request.createdAt, JSON.stringify(request));
    this.db.prepare('DELETE FROM linked_session_permissions WHERE session_id=? AND id NOT IN (SELECT id FROM linked_session_permissions WHERE session_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?)').run(request.sessionId, request.sessionId, permissionLimits.kept);
  }
  /** Moves a request from `from` to `to` in one statement, so two callers never both win; answers whether this caller did. */
  transition(id: string, from: PermissionState, to: PermissionState, at: string, changes: Partial<PermissionRequest> = {}): boolean {
    const current = this.get(id);
    if (!current || current.state !== from) return false;
    const next = { ...current, ...changes, state: to };
    const result = this.db.prepare(`UPDATE linked_session_permissions SET state=?, body=? WHERE id=? AND state=?${from === 'pending' ? ' AND expires_at>?' : ''}`).run(...[to, JSON.stringify(next), id, from, ...(from === 'pending' ? [at] : [])]);
    return Number(result.changes) > 0;
  }
  expire(sessionId: string, at: string): void {
    this.db.prepare("UPDATE linked_session_permissions SET state='expired' WHERE session_id=? AND state IN ('pending','answered') AND expires_at<=?").run(sessionId, at);
  }
  withdrawAll(sessionId: string): number {
    return Number(this.db.prepare("UPDATE linked_session_permissions SET state='withdrawn' WHERE session_id=? AND state='pending'").run(sessionId).changes);
  }
  pending(sessionIds: string[]): PermissionRequest[] {
    if (!sessionIds.length) return [];
    const marks = sessionIds.map(() => '?').join(',');
    return (this.db.prepare(`SELECT state, body FROM linked_session_permissions WHERE session_id IN (${marks}) AND state='pending' ORDER BY created_at, rowid`).all(...sessionIds) as { state: PermissionState; body: string }[]).map(row => ({ ...JSON.parse(row.body), state: row.state }));
  }
}

/**
 * Remote answers to the tool-permission prompts of a person's own Claude Code sessions. The plugin reports a prompt
 * with a short, redacted summary and waits a bounded time; the session's owner, and nobody else, may allow or deny it
 * once from Unfold before it expires. Remote answers are off for a session until its plugin starts with
 * `UNFOLD_REMOTE_APPROVAL=1`, and an answer never comes from the editor credential that reported the prompt.
 */
export class LinkedPermissions {
  readonly store: LinkedPermissionStore;
  private sessions: LinkedSessionStore;
  private clock: () => Date;
  constructor(db: DatabaseSync, sessions: LinkedSessionStore, options: { now?: () => Date } = {}) {
    this.store = new LinkedPermissionStore(db);
    this.sessions = sessions;
    this.clock = options.now ?? (() => new Date());
  }

  /** Records whether the owner's plugin started the session with remote answers on; turning them off withdraws what waits. */
  setOptIn(user: User, sessionId: string, enabled: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerId !== user.id) return;
    this.store.setOptIn(sessionId, user.id, enabled, this.clock().toISOString());
    if (!enabled) this.store.withdrawAll(sessionId);
  }

  /** Whether the session opted in to remote answers. */
  optedIn(sessionId: string): boolean { return this.store.optedIn(sessionId); }

  /** Withdraws every prompt still waiting, for when the session stopped its turn or ended: no prompt outlives that. */
  settle(sessionId: string): void { this.store.withdrawAll(sessionId); }

  /**
   * Stores one prompt the owner's plugin reports with its editor credential: the tool, a one-line summary and an
   * optional detail, each redacted and clipped again here, waiting `waitSeconds` (clamped). The plugin names nothing else.
   */
  create(caller: PermissionCaller, sessionId: string, value: unknown): PresentedPermissionRequest {
    const session = this.owned(caller.user, sessionId);
    if (caller.scope !== 'editor' || !caller.credential) return fail(403, 'remote_approval_editor', 'Only the plugin reports a permission prompt, with its editor credential.');
    if (!this.store.optedIn(session.id)) return fail(409, 'remote_approval_off', 'This session did not turn on remote approval. Start it with UNFOLD_REMOTE_APPROVAL=1.');
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    if (typeof raw.tool !== 'string' || !toolPattern.test(raw.tool)) return fail(400, 'permission_tool', 'tool must be the tool name: 1 to 80 letters, digits, _ . : or -.');
    const now = this.clock();
    this.store.expire(session.id, now.toISOString());
    if (this.store.pending([session.id]).length >= permissionLimits.pendingPerSession) return fail(409, 'permission_requests_full', `A session has at most ${permissionLimits.pendingPerSession} prompts waiting.`);
    const asked = Number(raw.waitSeconds);
    const wait = Number.isFinite(asked) ? Math.min(permissionLimits.maxWaitSeconds, Math.max(permissionLimits.minWaitSeconds, Math.round(asked))) : permissionLimits.defaultWaitSeconds;
    const request: PermissionRequest = {
      id: randomUUID(), sessionId: session.id, ownerId: session.ownerId, credential: caller.credential,
      tool: raw.tool, summary: summaryText(raw.summary, permissionLimits.summary) || `Use ${raw.tool}`, detail: summaryText(raw.detail, permissionLimits.detail),
      createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + wait * 1000).toISOString(), state: 'pending',
      decision: null, reason: '', answeredAt: null, answeredBy: '',
    };
    this.store.add(request);
    return present(request);
  }

  /** The prompts waiting in the owner's own sessions, or in one of them; nobody else sees them, an administrator neither. */
  pending(user: User, sessionId?: string): PresentedPermissionRequest[] {
    const ids = sessionId ? [this.owned(user, sessionId).id] : this.sessions.owned(user.id, 50).map(session => session.id);
    const at = this.clock().toISOString();
    for (const id of ids) this.store.expire(id, at);
    return this.store.pending(ids.filter(id => this.store.optedIn(id))).map(present);
  }

  /**
   * Allows or denies one waiting prompt. Only the session's owner may, only while the session opted in and the prompt
   * waits, and only once. An editor credential or `unfold-mcp` must carry the confirmation the person gave, and the
   * editor credential that reported the prompt can never answer it.
   */
  answer(caller: PermissionCaller, sessionId: string, requestId: string, value: unknown): PresentedPermissionRequest {
    const session = this.owned(caller.user, sessionId);
    const request = this.store.get(requestId);
    if (!request || request.sessionId !== session.id) return fail(404, 'not_found', 'Permission request not found.');
    if (!this.store.optedIn(session.id)) return fail(409, 'remote_approval_off', 'This session did not turn on remote approval, so Unfold cannot answer its prompts.');
    if (caller.scope === 'editor' && caller.credential && caller.credential === request.credential) return fail(403, 'remote_approval_same_credential', 'The credential your plugin reports with cannot answer its own prompts. Answer in the browser, or give unfold-mcp its own credential.');
    if ((caller.scope === 'editor' || caller.scope === 'mcp' || caller.scope === 'chat') && !caller.confirmation) return fail(403, 'confirmation_required', 'Answering a prompt from an editor, an agent or a chat needs the person’s confirmation.');
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    if (!permissionDecisions.includes(raw.decision as PermissionDecision)) return fail(400, 'permission_decision', 'decision must be allow or deny. Unfold never answers "always allow".');
    const decision = raw.decision as PermissionDecision;
    if (decision === 'allow' && raw.reason !== undefined && raw.reason !== '') return fail(400, 'permission_reason', 'Only a denial carries a reason.');
    const reason = decision === 'deny' ? summaryText(raw.reason, permissionLimits.reason) : '';
    const at = this.clock().toISOString();
    if (request.state === 'pending' && request.expiresAt <= at) { this.store.expire(session.id, at); return fail(410, 'permission_expired', 'This prompt is no longer waiting for an answer from Unfold. Answer it in your terminal.'); }
    if (!this.store.transition(request.id, 'pending', 'answered', at, { decision, reason, answeredAt: at, answeredBy: caller.user.name })) {
      const now = this.store.get(request.id);
      return now?.state === 'expired' || (now?.state === 'pending' && now.expiresAt <= at) ? fail(410, 'permission_expired', 'This prompt is no longer waiting for an answer from Unfold. Answer it in your terminal.') : fail(409, 'permission_closed', now?.state === 'withdrawn' ? 'This prompt was answered in the terminal or went away.' : 'This prompt was already answered.');
    }
    return present(this.store.get(request.id)!);
  }

  /**
   * The plugin's look at its own prompt, with the credential that reported it: still pending, the answer exactly once
   * (it then counts as delivered and the session as working again), or that it is over.
   */
  collect(caller: PermissionCaller, sessionId: string, requestId: string): CollectedPermission {
    const request = this.mine(caller, sessionId, requestId);
    const at = this.clock().toISOString();
    if (request.state === 'pending' && request.expiresAt <= at) { this.store.expire(request.sessionId, at); return { state: 'expired' }; }
    if (request.state === 'answered') {
      if (request.expiresAt <= at) { this.store.expire(request.sessionId, at); return { state: 'expired' }; }
      if (!this.store.transition(request.id, 'answered', 'delivered', at)) return { state: this.store.get(request.id)?.state ?? 'expired' };
      this.resume(request.sessionId, at);
      return { state: 'delivered', decision: request.decision!, ...(request.reason ? { reason: request.reason } : {}) };
    }
    return { state: request.state };
  }

  /**
   * Withdraws the plugin's own prompt when it was answered in the terminal, timed out or went away. With
   * `answered: true` (the terminal answered it) the session shows as working again once nothing else waits.
   */
  withdraw(caller: PermissionCaller, sessionId: string, requestId: string, value: unknown = {}): CollectedPermission {
    const request = this.mine(caller, sessionId, requestId);
    const withdrawn = this.store.transition(request.id, 'pending', 'withdrawn', '');
    if (withdrawn && value && typeof value === 'object' && (value as Record<string, unknown>).answered === true) this.resume(request.sessionId, this.clock().toISOString());
    return { state: this.store.get(request.id)?.state ?? 'withdrawn' };
  }

  private resume(sessionId: string, at: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'waiting' || this.store.pending([sessionId]).length) return;
    session.status = 'working'; session.waitingFor = ''; session.lastSeenAt = at;
    this.sessions.save(session);
  }

  private mine(caller: PermissionCaller, sessionId: string, requestId: string): PermissionRequest {
    const session = this.owned(caller.user, sessionId);
    const request = this.store.get(requestId);
    if (!request || request.sessionId !== session.id || !caller.credential || request.credential !== caller.credential) return fail(404, 'not_found', 'Permission request not found.');
    return request;
  }

  private owned(user: User, sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerId !== user.id) return notFound();
    return session;
  }
}

function present(request: PermissionRequest): PresentedPermissionRequest {
  const { credential: _credential, ownerId: _owner, ...shown } = request;
  return shown;
}

const routes = {
  mine: /^\/api\/linked-permissions$/,
  session: /^\/api\/linked-sessions\/([A-Za-z0-9_-]{8,128})\/permissions$/,
  step: /^\/api\/linked-sessions\/([A-Za-z0-9_-]{8,128})\/permissions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(answer|collect|withdraw)$/,
};

/** Whether `path` is one of the permission-answer routes. */
export function isPermissionRoute(path: string): boolean { return Object.values(routes).some(pattern => pattern.test(path)); }

/** Serves the permission-answer routes; answers the status and JSON body. Refusals throw {@link LinkedSessionError}. */
export async function permissionRoute(service: LinkedPermissions, request: { method: string; path: string; caller: PermissionCaller; body: () => Promise<Record<string, unknown>> }): Promise<{ status: number; body: unknown }> {
  const { method, path, caller } = request;
  let match: RegExpExecArray | null;
  if (routes.mine.test(path)) {
    if (method !== 'GET') fail(405, 'method', 'List the prompts waiting in your sessions with GET.');
    return { status: 200, body: { requests: service.pending(caller.user) } };
  }
  if ((match = routes.session.exec(path))) {
    if (method === 'GET') return { status: 200, body: { requests: service.pending(caller.user, match[1]), remoteApproval: service.optedIn(match[1]) } };
    if (method !== 'POST') fail(405, 'method', 'List prompts with GET and report one with POST.');
    return { status: 201, body: { request: service.create(caller, match[1], await request.body()) } };
  }
  match = routes.step.exec(path)!;
  if (method !== 'POST') fail(405, 'method', 'Use POST.');
  const [, sessionId, requestId, step] = match;
  if (step === 'answer') return { status: 200, body: { request: service.answer(caller, sessionId, requestId, await request.body()) } };
  if (step === 'collect') return { status: 200, body: service.collect(caller, sessionId, requestId) };
  return { status: 200, body: service.withdraw(caller, sessionId, requestId, await request.body()) };
}
