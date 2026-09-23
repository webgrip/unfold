import type { PloegActivityEvent, PloegDetail, PloegItem, PloegRun, PloegRunRow, PloegShift, PloegTeam, PloegTeamSummary, PloegWindow } from './ploeg.ts';

const at = '2026-09-10T09:00:00Z';
const teams: PloegTeam[] = [{ id: 'delivery', paused: null, queueDepth: 1, roles: [{ id: 'implementer', queueDepth: 1 }, { id: 'reviewer', queueDepth: 0 }] }, { id: 'research', paused: null, queueDepth: 1, roles: [{ id: 'analyst', queueDepth: 1 }] }];
const shift: PloegShift = { id: '11', workItemId: '101', team: 'delivery', branch: 'demo/rounding-review', round: 1, budgetUsd: 0, spentUsd: 0, reservedUsd: 0, openedAt: at, closedAt: at, closeReason: 'Illustrative escalation to a human reviewer.' };
const base = { provider: 'demo', description: 'Illustrative work item for exploring the operator workbench. No dispatch or model calls occurred.', externalId: '', revision: 'illustrative-v1', team: 'delivery', priority: 1, attempts: 0, infraFailures: 0, nextEligibleAt: null, createdAt: at, updatedAt: at, target: { forge: 'demo', owner: 'example', repo: 'order-service', baseBranch: 'main' }, lease: null, latestShift: null, url: '' };
const items: PloegItem[] = [
  { ...base, id: '101', externalId: 'DEMO-1', title: 'Review the rounding acceptance criteria', state: 'needs_human', attempts: 1, latestShift: shift },
  { ...base, id: '102', externalId: 'DEMO-2', title: 'Prepare a regression investigation', state: 'leased', attempts: 1, latestShift: { ...shift, id: '12', workItemId: '102', closedAt: null, closeReason: '', branch: 'demo/regression-investigation' }, lease: { renewedAt: at, expiresAt: '2026-09-10T09:30:00Z' } },
  { ...base, id: '103', externalId: 'DEMO-3', title: 'Document the order verification workflow', state: 'queued', attempts: 1, infraFailures: 1 },
  { ...base, id: '104', externalId: 'DEMO-4', title: 'Define evidence for a market research brief', state: 'queued', team: 'research', target: null, attempts: 1 },
  { ...base, id: '105', externalId: 'DEMO-5', title: 'Round half-cent totals consistently', state: 'awaiting_review', attempts: 1, latestShift: { ...shift, id: '13', workItemId: '105', round: 2, branch: 'agent/demo-5', closeReason: 'plan_exhausted' } },
  { ...base, id: '106', provider: 'ploeg', externalId: 'run-25-1', title: 'Add a regression test for negative half-cent totals', description: 'Illustrative Work Item that an agent reviewing DEMO-5 could propose. No Run created it; it is sample data.', state: 'proposed', createdAt: '2026-09-10T08:36:00Z', updatedAt: '2026-09-10T08:36:00Z', sourceWorkItemId: '105', createdKind: 'discovered', ready: true },
  { ...base, id: '107', provider: 'ploeg', externalId: 'run-26-1', team: 'research', target: null, title: 'Clarify which markets the research brief covers', description: 'Illustrative clarification an agent could propose for DEMO-4. It is sample data.', state: 'proposed', createdAt: '2026-09-10T08:55:00Z', updatedAt: '2026-09-10T08:55:00Z', sourceWorkItemId: '104', createdKind: 'clarify', ready: false },
];
const find = (id: string) => items.find(item => item.id === id)!;
const row = (id: string, workItemId: string, role: string, round: number, writes: boolean, state: string, outcome: string, verdict: string, failureReason: string, startedAt: string | null, finishedAt: string | null): PloegRunRow => ({ id, workItemId, workItemTitle: find(workItemId).title, externalRef: find(workItemId).externalId, team: find(workItemId).team, role, round, writes, state, outcome, verdict, failureReason, startedAt, finishedAt, durationSeconds: startedAt && finishedAt ? (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000 : null, authorizedUsd: state === 'pending' ? null : 0, settledUsd: state === 'finished' ? 0 : null, usage: null });
const runs: PloegRunRow[] = [
  row('26', '104', 'analyst', 1, false, 'pending', '', '', '', null, null),
  row('25', '105', 'reviewer', 2, false, 'finished', 'no_change_needed', '', '', '2026-09-10T08:20:00Z', '2026-09-10T08:34:00Z'),
  row('24', '105', 'implementer', 1, true, 'finished', 'pr_opened', '', '', '2026-09-10T07:40:00Z', '2026-09-10T08:15:00Z'),
  row('23', '103', 'implementer', 1, true, 'finished', 'failed', '', 'infra_node', '2026-09-08T14:00:00Z', '2026-09-08T14:05:00Z'),
  row('22', '102', 'implementer', 1, true, 'running', '', '', '', '2026-09-10T08:40:00Z', null),
  row('21', '101', 'reviewer', 1, false, 'finished', 'stuck', 'request_changes', '', '2026-09-09T15:10:00Z', '2026-09-09T15:30:00Z'),
  row('20', '104', 'analyst', 1, false, 'finished', 'failed', '', 'timeout', '2026-08-20T10:00:00Z', '2026-08-20T11:00:00Z'),
];
const timing = (id: string) => { const entry = runs.find(candidate => candidate.id === id)!; return { startedAt: entry.startedAt, finishedAt: entry.finishedAt }; };
const run: PloegRun = { id: '21', workItemId: '101', shiftId: '11', team: 'delivery', role: 'reviewer', round: 1, writes: false, state: 'finished', ...timing('21'), expiresAt: null, outcome: 'stuck', summary: 'Illustrative reviewer handoff: agree on the rounding rule before changing the implementation.', stuckReason: 'The acceptance criteria need a human decision.', links: [], findings: 'Sample finding: define how half-cent amounts should round and add that case to the acceptance criteria. This is illustrative content, not a result of an executed review.', verdict: 'request_changes', failureReason: null, authorizedUsd: 0, usage: null, costStatus: 'unknown', keyAlias: null };
const details = Object.fromEntries(items.map(item => [item.id, { item, shifts: item.latestShift ? [item.latestShift] : [], runs: item.id === '101' ? [run] : item.id === '102' ? [{ ...run, id: '22', workItemId: item.id, shiftId: '12', role: 'implementer', writes: true, state: 'running', ...timing('22'), outcome: null, summary: '', stuckReason: '', findings: '', verdict: '' }] : [], checkpoints: item.id === '101' ? [{ id: '31', workItemId: item.id, phase: 'review', branch: shift.branch, prUrl: '', createdAt: at, nodeName: '', podUid: '' }] : [], events: [{ id: String(1000 + Number(item.id)), at, actor: 'demo-fixture', action: 'illustrative.snapshot', workItemId: item.id, team: item.team, detail: { reason: 'Illustrative operator data. No dispatch, model call or check was executed for this record.' } }], truncated: { shifts: false, runs: false, checkpoints: false, events: false } }])) as Record<string, PloegDetail>;

const reviewShift = items[4].latestShift!;
const reviewRun: PloegRun = { ...run, id: '25', workItemId: '105', shiftId: reviewShift.id, round: 2, ...timing('25'), outcome: 'no_change_needed', summary: 'Illustrative review of the rounding change.', stuckReason: '', findings: 'Sample finding: the change edits AGENTS.md to document the rounding rule, as the Work Item asks. An instruction-file change needs a human decision, so this review gives no verdict. This is illustrative content, not a result of an executed review.', verdict: '', links: [] };
details['105'] = { ...details['105'], runs: [reviewRun, { ...reviewRun, id: '24', role: 'implementer', round: 1, writes: true, ...timing('24'), outcome: 'pr_opened', summary: 'Illustrative writer handoff for the rounding change.', findings: '', verdict: '' }], checkpoints: [{ id: '32', workItemId: '105', phase: 'pr_opened', branch: reviewShift.branch, prUrl: 'https://forge.example.invalid/example/order-service/pulls/5', createdAt: at, nodeName: '', podUid: '' }] };

const event = (id: string, time: string, workItemId: string, action: string, detail: Record<string, unknown> = {}): PloegActivityEvent => ({ id, at: time, actor: 'demo-fixture', action, workItemId, team: find(workItemId).team, detail, workItemTitle: find(workItemId).title });
const events: PloegActivityEvent[] = [
  event('1215', '2026-09-10T08:55:00Z', '107', 'work_item.proposed'),
  event('1214', '2026-09-10T08:54:00Z', '104', 'round.opened', { round: 1 }),
  event('1213', '2026-09-10T08:40:00Z', '102', 'run.claimed', { role: 'implementer', round: 1 }),
  event('1212', '2026-09-10T08:36:00Z', '106', 'work_item.proposed'),
  event('1211', '2026-09-10T08:35:00Z', '105', 'shift.closed', { reason: 'plan_exhausted' }),
  event('1210', '2026-09-10T08:20:00Z', '105', 'round.opened', { round: 2 }),
  event('1209', '2026-09-10T08:15:00Z', '105', 'checkpoint.written', { phase: 'pr_opened' }),
  event('1208', '2026-09-10T07:40:00Z', '105', 'run.claimed', { role: 'implementer', round: 1 }),
  event('1207', '2026-09-10T07:35:00Z', '105', 'work_item.queued'),
  event('1206', '2026-09-09T15:30:00Z', '101', 'shift.closed', { reason: 'Illustrative escalation to a human reviewer.' }),
  event('1205', '2026-09-09T15:10:00Z', '101', 'run.claimed', { role: 'reviewer', round: 1 }),
  event('1204', '2026-09-08T14:05:00Z', '103', 'lease.expired', { infraFailures: 1 }),
  event('1203', '2026-09-08T14:00:00Z', '103', 'run.claimed', { role: 'implementer', round: 1 }),
  event('1202', '2026-08-20T11:00:00Z', '104', 'run.expired', { role: 'analyst', round: 1 }),
  event('1201', '2026-08-20T09:30:00Z', '104', 'work_item.queued'),
];

const windowHours: Record<PloegWindow, number> = { '24h': 24, '7d': 168, '30d': 720 };
const stateKeys = { queued: 'queued', leased: 'leased', awaiting_review: 'awaitingReview', needs_human: 'needsHuman', proposed: 'proposed', withdrawn: 'withdrawn', done: 'done', stale: 'stale' } as const;
function summary(window: PloegWindow, current: PloegItem[]): { generatedAt: string; teams: PloegTeamSummary[] } {
  const since = Date.parse(at) - windowHours[window] * 3_600_000;
  return { generatedAt: at, teams: teams.map(({ id }) => {
    const workItems = { queued: 0, leased: 0, awaitingReview: 0, needsHuman: 0, proposed: 0, withdrawn: 0, done: 0, stale: 0 };
    for (const item of current) if (item.team === id && item.state in stateKeys) workItems[stateKeys[item.state as keyof typeof stateKeys]]++;
    const own = runs.filter(entry => entry.team === id);
    const recent = own.filter(entry => entry.finishedAt && Date.parse(entry.finishedAt) >= since);
    return { team: id, workItems, runs: { pending: own.filter(entry => entry.state === 'pending').length, running: own.filter(entry => entry.state === 'running').length, finished: recent.length, failed: recent.filter(entry => entry.outcome === 'failed').length, stuck: recent.filter(entry => entry.outcome === 'stuck').length }, spend: { settledUsd: 0, reservedUsd: 0 }, lastActivityAt: events.find(entry => entry.team === id)?.at ?? null };
  }) };
}

export const ploegDemo = { teams, items, details, runs, events, summary, pageSize: 10 };
