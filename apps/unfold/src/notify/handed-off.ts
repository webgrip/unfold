import type { ActionRecord, ActionTarget } from '../action-records.ts';
import { isHandOffRecord } from '../handoffs.ts';

/** What the lookup needs from the store: the hand-off Action Records about one target. */
export type HandOffRecords = { actionRecords(filter: { target: ActionTarget; outcome: 'done'; handOffs: true; limit: number }): ActionRecord[] };

const teamOf = (record: ActionRecord): string => {
  const inputs = record.inputs ?? {};
  const query = inputs.query && typeof inputs.query === 'object' ? inputs.query as Record<string, unknown> : {};
  const team = typeof inputs.team === 'string' ? inputs.team : typeof query.team === 'string' ? query.team : '';
  return team.trim();
};

/**
 * The people whose latest hand-off record about this Work Item, made before `before`, still hands it off: a Linked
 * Session's Work Item handed to Ploeg, or its tracker task handed to its Team from one of `sourceIds`, the task
 * connections of its tracker. Someone who took the task back is left out. The records come from every channel.
 */
export function handedOffBy(store: HandOffRecords, item: { id: string; team: string; externalId: string }, sourceIds: readonly string[], before: string): string[] {
  const targets: ActionTarget[] = [{ kind: 'work-item', id: item.id }, ...sourceIds.map(id => ({ kind: 'task' as const, id: `${id}:${item.externalId}` }))];
  const people = new Set<string>();
  for (const target of targets) {
    const seen = new Set<string>();
    for (const record of store.actionRecords({ target, outcome: 'done', handOffs: true, limit: 200 })) {
      if (!isHandOffRecord(record) || record.at > before || seen.has(record.userId)) continue;
      if (target.kind === 'task' && teamOf(record) !== item.team) continue;
      seen.add(record.userId);
      if (record.method === 'POST') people.add(record.userId);
    }
  }
  return [...people];
}
