import type { Session } from '../types.ts';

/** Days a finished session's workspace volume is kept after the session last changed, unless `kubernetes.workspaceRetentionDays` says otherwise; 0 keeps every volume. */
export const defaultWorkspaceRetentionDays = 7;

/** Whether a session's retained workspace volume may go, and the reason either way. */
export type RetentionVerdict = { release: boolean; reason: 'kept_forever' | 'active' | 'unresolved' | 'uncaptured' | 'recent' | 'idle' };

const finished = new Set(['completed', 'failed', 'cancelled']);
const day = 86_400_000;

/**
 * The retention rule for a session's workspace volume. A volume goes only when its session finished, nothing still holds it
 * (a running engine, an unacknowledged stop, unresolved spend), its change was captured or never existed, and the session has
 * not changed for `days` days. The candidate lives in the workbench's data directory, so reviewing or publishing it never
 * needs the volume; a writing Run whose change was not captured keeps it, because recovery captures from the workspace.
 */
export function workspaceRetention(session: Pick<Session, 'status' | 'updatedAt' | 'workItemClosedAt' | 'candidate' | 'runs'>, now: number, days: number, held: boolean): RetentionVerdict {
  if (days <= 0) return { release: false, reason: 'kept_forever' };
  if (!finished.has(session.status)) return { release: false, reason: 'active' };
  if (held) return { release: false, reason: 'unresolved' };
  if (session.runs.some(run => run.mode === 'write' && run.status === 'completed') && session.candidate?.status !== 'ready') return { release: false, reason: 'uncaptured' };
  const last = Math.max(Date.parse(session.updatedAt) || 0, Date.parse(session.workItemClosedAt ?? '') || 0);
  if (!last || now - last < days * day) return { release: false, reason: 'recent' };
  return { release: true, reason: 'idle' };
}
