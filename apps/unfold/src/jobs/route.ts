import type { User } from '../types.ts';
import type { JobQueue } from './queue.ts';

/**
 * Answers `GET /api/admin/jobs` for an administrator: each kind's counts by state, and the jobs that need an eye (dead,
 * or waiting after a failure), at most `limit` (50 by default, 200 at most), optionally of one `kind`. Read-only; the
 * answer never carries a job's key or payload.
 */
export function jobsRoute(queue: JobQueue, user: User, method: string, query: URLSearchParams): { status: number; body: unknown } {
  if (user.role !== 'admin') return { status: 403, body: { error: { code: 'forbidden', message: 'Only administrators read the job queue.' } } };
  if (method !== 'GET') return { status: 405, body: { error: { code: 'method', message: 'Read the job queue with GET.' } } };
  const kind = query.get('kind') ?? undefined;
  if (kind !== undefined && !/^[a-z][a-z0-9_.-]{0,63}$/.test(kind)) return { status: 400, body: { error: { code: 'job_kind', message: 'Name a job kind such as outbound.delivery.' } } };
  const asked = Number(query.get('limit') ?? 50);
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 200) : 50;
  return { status: 200, body: { kinds: queue.summary(), troubled: queue.troubled(limit, kind) } };
}
