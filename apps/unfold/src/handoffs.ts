import type { ActionRecord } from './action-records.ts';
import { nowItem, PloegError, pullRequestUrl, type PloegClient, type PloegItem, type PloegNowItem } from './ploeg.ts';
import type { TenantScope } from './tenant-scope.ts';
import type { User } from './types.ts';

/** Where a hand-off came from: a tracker task handed to a Team, or a Linked Session handed to Ploeg to finish. */
export type HandOffOrigin = { kind: 'task'; sourceId: string; sourceName: string; taskId: string } | { kind: 'session' };

/**
 * One hand-off the person made, through any channel, newest first: when, through which channel, to which Team, and
 * the Work Item it became with its state, pull request link and spend. `workItem` is null until Ploeg lists one,
 * and `note` then says why there is none.
 */
export type HandOff = { id: number; at: string; channel: string; team: string | null; origin: HandOffOrigin; workItem: PloegNowItem | null; note: string };

/** The hand-offs a person made, as `GET /api/handoffs` answers them. */
export type HandOffList = { handoffs: HandOff[]; demo: boolean; fetchedAt: string };

/** What the read needs: the person's own hand-off Action Records, Ploeg as that person, the Tenant scope, and whether Ploeg is the demo. */
export type HandOffSources = {
  records(userId: string, limit: number): ActionRecord[];
  ploeg: Pick<PloegClient, 'detail' | 'trackerItems'>;
  demo: boolean;
  tenants: Pick<TenantScope, 'source'>;
};

/** The most hand-offs one read lists. */
export const handOffLimit = 50;
const notListed = 'Ploeg has not listed a Work Item for this hand-off yet.';
const unreadable = 'Ploeg could not be read just now.';

/** Whether an Action Record is a hand-off or a take-back: a successful POST or DELETE on a hand-off route about a task or a Work Item. */
export function isHandOffRecord(record: Pick<ActionRecord, 'action' | 'method' | 'outcome' | 'target'>): boolean {
  return record.outcome === 'done' && (record.method === 'POST' || record.method === 'DELETE') && record.action.endsWith('/handoff') && (record.target?.kind === 'task' || record.target?.kind === 'work-item');
}

/** The newest record per target, leaving out targets whose newest record is a take-back, at most `limit`. */
export function latestHandOffs(records: ActionRecord[], limit: number): ActionRecord[] {
  const seen = new Set<string>();
  const kept: ActionRecord[] = [];
  for (const record of [...records].sort((a, b) => b.id - a.id)) {
    if (!isHandOffRecord(record)) continue;
    const key = `${record.target!.kind}:${record.target!.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (record.method === 'POST') kept.push(record);
    if (kept.length >= limit) break;
  }
  return kept;
}

const newest = (items: PloegItem[]) => [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (BigInt(b.id) > BigInt(a.id) ? 1 : -1))[0];

async function withPullRequest(sources: HandOffSources, user: User, item: PloegItem, fresh: boolean): Promise<PloegNowItem> {
  const row = nowItem(item);
  row.pullRequestUrl = item.pullRequest?.url ?? '';
  if (!row.pullRequestUrl && item.state === 'awaiting_review') row.pullRequestUrl = await sources.ploeg.detail(user, item.id, fresh).then(pullRequestUrl, () => '');
  return row;
}

async function resolve(sources: HandOffSources, user: User, record: ActionRecord, fresh: boolean): Promise<HandOff | undefined> {
  const recordedTeam = typeof record.inputs?.team === 'string' ? record.inputs.team : null;
  const base = { id: record.id, at: record.at, channel: record.channel };
  if (record.target!.kind === 'work-item') {
    try {
      const detail = await sources.ploeg.detail(user, record.target!.id, fresh);
      const row = nowItem(detail.item);
      row.pullRequestUrl = detail.item.pullRequest?.url || pullRequestUrl(detail);
      return { ...base, team: detail.item.team, origin: { kind: 'session' }, workItem: row, note: '' };
    } catch (error) {
      if (error instanceof PloegError && (error.status === 404 || error.status === 403)) return undefined;
      return { ...base, team: recordedTeam, origin: { kind: 'session' }, workItem: null, note: unreadable };
    }
  }
  const split = record.target!.id.indexOf(':');
  const sourceId = record.target!.id.slice(0, split);
  const taskId = record.target!.id.slice(split + 1);
  const source = split > 0 ? sources.tenants.source(user, sourceId) : undefined;
  if (!source) return undefined;
  const origin: HandOffOrigin = { kind: 'task', sourceId: source.id, sourceName: source.name, taskId };
  try {
    const found = await sources.ploeg.trackerItems(user, source.provider, taskId, fresh);
    if (!found.supported) return { ...base, team: recordedTeam, origin, workItem: null, note: found.message ?? notListed };
    const candidates = found.items.filter(item => !recordedTeam || item.team === recordedTeam);
    const item = newest(candidates.length ? candidates : found.items);
    if (!item) return { ...base, team: recordedTeam, origin, workItem: null, note: notListed };
    return { ...base, team: item.team, origin, workItem: await withPullRequest(sources, user, item, fresh), note: '' };
  } catch {
    return { ...base, team: recordedTeam, origin, workItem: null, note: unreadable };
  }
}

/**
 * The hand-offs `user` made through any channel, newest first, at most `limit`: only their own Action Records, and
 * only tasks of sources and Work Items they still reach, so a hand-off whose source or Team they lost reads as absent.
 */
export async function listHandOffs(sources: HandOffSources, user: User, limit = 20, fresh = false): Promise<HandOffList> {
  const bounded = Math.min(handOffLimit, Math.max(1, Math.floor(limit) || 20));
  const records = latestHandOffs(sources.records(user.id, bounded * 4), bounded).filter(record => record.userId === user.id);
  const resolved = await Promise.all(records.map(record => resolve(sources, user, record, fresh)));
  return { handoffs: resolved.filter((entry): entry is HandOff => Boolean(entry)), demo: sources.demo, fetchedAt: new Date().toISOString() };
}

