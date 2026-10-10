import type { Progress } from './core.js';
import type { SessionRow } from './now.js';
import type { Permission, Session } from './types.js';

/** Which Ploeg Work Items on Now raise a notification, as `unfold.notifications.workItems` sets it. */
export type WorkItemPolicy = 'all' | 'decisions-and-failures' | 'none';

/** Why a session the person owns needs them. */
export type NeedsYouKind = 'question' | 'permission' | 'review' | 'stopped' | 'failed';

/** A progress action a notification button runs: `answer` opens the request, the others are the panel's session actions. */
export type NeedsYouAction = { label: string; action: 'answer' | 'view-change' | 'deliver' | 'open-session'; requestId?: string };

/** One notification for one state change of one session. `key` names that state, so the same state never notifies twice. */
export type NeedsYouAlert = { key: string; sessionId: string; kind: NeedsYouKind; severity: 'information' | 'warning'; message: string; actions: NeedsYouAction[] };

/** What a session's notification reads beyond its row: the open request while it asks, and its progress with the recovery answer while it is stopped. */
export type NeedsYouDetail = { request?: Pick<Permission, 'id' | 'kind' | 'title'>; progress?: Progress };

const stampOf = (row: SessionRow) => `${row.progress.phase}@${row.session.updatedAt}`;
const recoveryActions = new Set(['deliver', 'run-again', 'resume']);
const attentionEvents = new Set(['permission', 'session.interrupted', 'session.failed', 'session.completed', 'execution.authority_lost', 'execution.reconciliation_required', 'run.runaway', 'candidate.ready']);

/** Whether a streamed session event can move a session into or out of needing its owner, so the caller refreshes at once instead of at the next poll. */
export function attentionEvent(type: string): boolean {
  return attentionEvents.has(type);
}

/** Whether the session belongs to `userId`. Notifications are for the owner only; the Now badge still counts everything visible. */
export function owned(session: Pick<Session, 'ownerId'>, userId: string): boolean {
  return Boolean(userId) && session.ownerId === userId;
}

/** Whether the caller must fetch details before `NeedsYouNotifier.observe` can word this row: an asking session needs its open request, a stopped one its recovery. */
export function needsDetail(row: SessionRow): boolean {
  return row.progress.phase === 'asking' || row.progress.phase === 'stopped';
}

/**
 * The notification a session's progress calls for, or undefined when nothing needs its owner. A question or permission
 * request offers Answer, a result offers Review, a stopped session offers Deliver when the server offers delivery and
 * is announced only when some recovery is offered at all, and a failure offers Open.
 */
export function alertFor(session: Session, progress: Progress, detail: NeedsYouDetail = {}): NeedsYouAlert | undefined {
  const open: NeedsYouAction = { label: 'Open', action: 'open-session' };
  const at = (suffix: string) => `${session.id}:${progress.phase}:${suffix}`;
  switch (progress.phase) {
    case 'asking': {
      const request = detail.request;
      const kind: NeedsYouKind = request?.kind === 'permission' ? 'permission' : 'question';
      const what = request?.title ? (kind === 'permission' ? `asks permission: ${request.title}` : `asks: ${request.title}`) : progress.headline;
      return { key: at(request?.id ?? session.updatedAt), sessionId: session.id, kind, severity: 'warning', message: `${session.title}: ${what}`, actions: [{ label: 'Answer', action: 'answer', ...(request?.id ? { requestId: request.id } : {}) }, open] };
    }
    case 'review':
      return { key: at(session.candidate?.headSha ?? session.updatedAt), sessionId: session.id, kind: 'review', severity: 'information', message: `${session.title}: ${progress.headline}`, actions: [{ label: 'Review', action: 'view-change' }, open] };
    case 'stopped': {
      const stopped = detail.progress ?? progress;
      const offered = stopped.actions.filter(action => recoveryActions.has(action.id)).map(action => action.id);
      if (!offered.length) return undefined;
      const deliver = offered.includes('deliver');
      return { key: at(`${stopped.reason?.at ?? session.updatedAt}:${offered.sort().join('+')}`), sessionId: session.id, kind: 'stopped', severity: 'warning', message: `${session.title}: ${stopped.headline}`, actions: deliver ? [{ label: 'Deliver', action: 'deliver' }, open] : [open] };
    }
    case 'failed':
      return { key: at(session.failure?.stage ?? session.updatedAt), sessionId: session.id, kind: 'failed', severity: 'warning', message: `${session.title}: ${progress.headline}`, actions: [open] };
    default:
      return undefined;
  }
}

/**
 * Turns successive views of the person's sessions into one notification per state change. The first view after a
 * connect only records what is already waiting; the badge and status bar show that. A session keeps its last key
 * until its phase or update time moves, so a poll that finds the same state notifies nothing, and a session that
 * leaves a state and returns to it notifies again.
 */
export class NeedsYouNotifier {
  private known?: Map<string, { stamp: string; key: string }>;
  private readonly enabled: () => boolean;
  constructor(enabled: () => boolean) { this.enabled = enabled; }

  /** Forgets every session, so the next view is a new baseline. */
  reset() { this.known = undefined; }

  /** The rows of sessions `userId` owns whose state moved since the last view and that need details first. */
  changed(userId: string, rows: SessionRow[]): SessionRow[] {
    return rows.filter(row => owned(row.session, userId) && needsDetail(row) && this.known?.get(row.session.id)?.stamp !== stampOf(row));
  }

  /** Records the rows of sessions `userId` owns and answers the notifications their changes call for. `quiet` records without notifying, as the demo does. */
  observe(userId: string, rows: SessionRow[], details: ReadonlyMap<string, NeedsYouDetail> = new Map(), quiet = false): NeedsYouAlert[] {
    const previous = this.known;
    const next = new Map<string, { stamp: string; key: string }>();
    const alerts: NeedsYouAlert[] = [];
    for (const row of rows) {
      if (!owned(row.session, userId)) continue;
      const stamp = stampOf(row);
      const before = previous?.get(row.session.id);
      if (before?.stamp === stamp) { next.set(row.session.id, before); continue; }
      const alert = alertFor(row.session, row.progress, details.get(row.session.id));
      const key = alert?.key ?? `${row.session.id}:${row.progress.phase}`;
      next.set(row.session.id, { stamp, key });
      if (alert && previous && before?.key !== key && !quiet && this.enabled()) alerts.push(alert);
    }
    this.known = next;
    return alerts;
  }
}
