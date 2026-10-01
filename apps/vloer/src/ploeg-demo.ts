import type { PloegActivityEvent, PloegCard, PloegCardPlay, PloegCheckpoint, PloegDetail, PloegEvent, PloegItem, PloegRun, PloegRunRow, PloegShift, PloegTeam, PloegTeamSummary, PloegWindow } from './ploeg.ts';

const anchor = Math.floor(Date.now() / 60_000) * 60_000;
const ago = (minutes: number) => new Date(anchor - minutes * 60_000).toISOString().replace('.000Z', 'Z');
const at = ago(0);

const teams: PloegTeam[] = [
  { id: 'delivery', paused: null, queueDepth: 0, roles: [{ id: 'implementer', queueDepth: 0 }, { id: 'reviewer', queueDepth: 0 }], assignees: [], pinnedScopes: [] },
  { id: 'research', paused: null, queueDepth: 1, roles: [{ id: 'analyst', queueDepth: 1 }, { id: 'builder', queueDepth: 0 }], assignees: [], pinnedScopes: [] },
];
const orders = { forge: 'demo', owner: 'example', repo: 'order-service', baseBranch: 'main' };
const studies = { forge: 'demo', owner: 'example', repo: 'market-research', baseBranch: 'main' };
const pull = (number: number) => `https://forge.example.invalid/example/order-service/pulls/${number}`;
const illustrative = 'Illustrative work item for exploring the operator workbench. No dispatch or model calls occurred.';

type ShiftSpec = { id: string; item: string; branch: string; round: number; opened: number; closed: number | null; reason: string; budget?: number };
const shiftSpecs: ShiftSpec[] = [
  { id: '11', item: '114', branch: 'agent/demo-14', round: 4, opened: 2999, closed: 2895, reason: 'review_approved' },
  { id: '12', item: '111', branch: 'agent/demo-11', round: 2, opened: 1829, closed: 1760, reason: 'run stuck: builder round 2' },
  { id: '13', item: '101', branch: 'demo/rounding-review', round: 1, opened: 1398, closed: 1330, reason: 'Illustrative escalation to a human reviewer.' },
  { id: '14', item: '112', branch: 'agent/demo-12', round: 1, opened: 1319, closed: 1206, reason: 'writing_run_killed_repeatedly' },
  { id: '15', item: '109', branch: 'agent/demo-9', round: 4, opened: 559, closed: 450, reason: 'fix_round_cap_reached' },
  { id: '16', item: '108', branch: 'agent/demo-8', round: 2, opened: 329, closed: 285, reason: 'plan_exhausted' },
  { id: '17', item: '115', branch: 'agent/demo-15', round: 1, opened: 249, closed: 240, reason: 'withdrawn_unassigned' },
  { id: '18', item: '110', branch: 'agent/demo-10', round: 1, opened: 199, closed: 197, reason: 'budget exhausted: pool 0.04, spent 0.00, reserved 0.00', budget: 0.04 },
  { id: '19', item: '105', branch: 'agent/demo-5', round: 2, opened: 94, closed: 25, reason: 'plan_exhausted' },
  { id: '20', item: '102', branch: 'demo/regression-investigation', round: 1, opened: 69, closed: null, reason: '' },
  { id: '21', item: '104', branch: 'agent/demo-4', round: 1, opened: 6, closed: null, reason: '' },
];

type ItemSpec = Partial<PloegItem> & Pick<PloegItem, 'id' | 'externalId' | 'title' | 'state'> & { created: number; updated: number };
const itemSpecs: ItemSpec[] = [
  { id: '101', externalId: 'DEMO-1', title: 'Review the rounding acceptance criteria', state: 'needs_human', priority: 2, attempts: 1, created: 1400, updated: 1330 },
  { id: '102', externalId: 'DEMO-2', title: 'Prepare a regression investigation', state: 'leased', attempts: 1, created: 70, updated: 18, lease: { renewedAt: ago(1), expiresAt: ago(-9) } },
  { id: '103', externalId: 'DEMO-3', title: 'Document the order verification workflow', state: 'queued', attempts: 0, infraFailures: 2, nextEligibleAt: ago(-3), created: 180, updated: 2 },
  { id: '104', externalId: 'DEMO-4', title: 'Define evidence for a market research brief', state: 'queued', team: 'research', target: null, attempts: 1, created: 305, updated: 240 },
  { id: '105', externalId: 'DEMO-5', title: 'Round half-cent totals consistently', state: 'awaiting_review', attempts: 2, created: 95, updated: 25 },
  { id: '106', provider: 'ploeg', externalId: 'run-53-1', title: 'Add a regression test for negative half-cent totals', description: 'Illustrative Work Item that an agent reviewing DEMO-5 could propose. No Run created it; it is sample data.', state: 'proposed', created: 26, updated: 26, sourceWorkItemId: '105', createdKind: 'discovered', ready: true },
  { id: '107', provider: 'ploeg', externalId: 'run-46-1', team: 'research', target: null, title: 'Clarify which markets the research brief covers', description: 'Illustrative clarification an agent could propose for DEMO-4. It is sample data.', state: 'proposed', created: 240, updated: 240, sourceWorkItemId: '104', createdKind: 'clarify', ready: false },
  { id: '108', provider: 'vikunja', externalId: 'DEMO-8', target: null, title: 'Show VAT per line on the order confirmation', state: 'needs_human', priority: 3, attempts: 2, created: 330, updated: 285, description: '<p>Customers ask for the VAT amount on every line of the order confirmation, not only in the total.</p><p><strong>Acceptance criteria</strong></p><ul><li><p>Each order line shows its VAT rate and amount.</p></li><li><p>The totals block still shows the VAT sum.</p></li><li><p>The existing confirmation tests keep passing.</p></li></ul><p>Background: <a href="https://docs.example.invalid/vat-per-line">VAT per line proposal</a>.</p><p><em>Illustrative Vikunja-style task. No tracker was contacted and no model was called.</em></p>' },
  { id: '109', provider: 'vikunja', externalId: 'DEMO-9', title: 'Reject negative quantities in the cart API', state: 'needs_human', priority: 4, attempts: 4, created: 560, updated: 450, description: '<h3>Problem</h3><p>The cart API accepts <code>quantity: -1</code> and refunds the line instead of refusing it.</p><h3>Done when</h3><ol><li><p>Zero and negative quantities are answered with <strong>422</strong>.</p></li><li><p>The error names the <code>quantity</code> field.</p></li></ol><p>See <a href="https://forge.example.invalid/example/order-service/issues/7">the bug report</a>.</p><p><em>Illustrative Vikunja-style task. No tracker was contacted and no model was called.</em></p>' },
  { id: '110', externalId: 'DEMO-10', team: 'research', target: studies, title: 'Summarise payment-provider fees for the pricing brief', state: 'needs_human', attempts: 1, created: 200, updated: 197, description: 'Illustrative Work Item whose Shift budget is smaller than the least Ploeg authorizes for one Run, so Ploeg parked it before its first Run started. No dispatch or model calls occurred and nothing was spent.' },
  { id: '111', externalId: 'DEMO-11', team: 'research', target: studies, title: 'Draft the market-sizing section of the research brief', state: 'needs_human', attempts: 2, created: 1830, updated: 1760, description: 'Illustrative research task: write the market-sizing section of the brief from the sources in the repository. No dispatch or model calls occurred.' },
  { id: '112', externalId: 'DEMO-12', title: 'Add retry backoff to the payment webhook consumer', state: 'needs_human', priority: 2, attempts: 10, created: 1320, updated: 1206, description: 'Illustrative Work Item whose writer never got a real attempt because the cluster stopped every Run. No dispatch or model calls occurred.' },
  { id: '113', externalId: 'DEMO-13', title: 'Migrate the order export to the new CSV schema', state: 'stale', attempts: 3, created: 7200, updated: 7020, description: 'Illustrative Work Item from before Shifts: three agent attempts failed, so Ploeg stopped retrying. No dispatch or model calls occurred.' },
  { id: '114', externalId: 'DEMO-14', title: 'Show the delivery window on the order summary', state: 'done', attempts: 4, created: 3000, updated: 2700, description: 'Illustrative Work Item that went through one fix round, was approved by the agent reviewer and was merged by a person. No dispatch or model calls occurred.' },
  { id: '115', provider: 'vikunja', externalId: 'DEMO-15', title: 'Rename the Buy now button to Place order', state: 'withdrawn', attempts: 0, created: 250, updated: 240, description: '<p>Rename the <strong>Buy now</strong> button to <strong>Place order</strong> on the checkout page.</p><p><em>Illustrative Vikunja-style task. It was unassigned before any Run started.</em></p>' },
  { id: '116', provider: 'ploeg', externalId: 'run-27-1', team: 'research', target: studies, title: 'Split the competitor table into its own brief', state: 'done', created: 1800, updated: 1500, description: 'Illustrative proposal an agent could make while drafting DEMO-11. A person rejected it. It is sample data.', sourceWorkItemId: '111', createdKind: 'split', ready: true },
];

const shifts = new Map(shiftSpecs.map(spec => {
  const item = itemSpecs.find(entry => entry.id === spec.item)!;
  const shift: PloegShift = { id: spec.id, workItemId: spec.item, team: item.team ?? 'delivery', branch: spec.branch, round: spec.round, budgetUsd: spec.budget ?? 3, spentUsd: 0, reservedUsd: 0, openedAt: ago(spec.opened), closedAt: spec.closed === null ? null : ago(spec.closed), closeReason: spec.reason };
  return [spec.item, shift];
}));
const items: PloegItem[] = itemSpecs.map(({ created, updated, ...spec }) => ({ provider: 'demo', description: illustrative, revision: 'illustrative-v1', team: 'delivery', priority: 1, attempts: 0, infraFailures: 0, nextEligibleAt: null, target: orders, lease: null, url: '', ...spec, createdAt: ago(created), updatedAt: ago(updated), latestShift: shifts.get(spec.id) ?? null }));
const find = (id: string) => items.find(item => item.id === id)!;

type RunSpec = { id: string; item: string; role: string; round: number; writes: boolean; started: number | null; finished: number | null; outcome?: string; verdict?: string; failure?: string; summary?: string; stuck?: string; findings?: string; problem?: string; solution?: string; links?: string[] };
const legacy = { role: '', round: 0, writes: true };
const killed = Array.from({ length: 10 }, (_, attempt): RunSpec => {
  const created = 1319 - attempt * 12;
  return attempt % 2 === 0
    ? { id: String(31 + attempt), item: '112', role: 'implementer', round: 1, writes: true, started: created - 1, finished: created - 4, outcome: 'failed', failure: 'infra_node', summary: 'Pod evicted: node memory pressure. Illustrative record; nothing ran.' }
    : { id: String(31 + attempt), item: '112', role: 'implementer', round: 1, writes: true, started: created - 1, finished: created - 4, outcome: 'failed', failure: 'lease_lost', summary: 'run deadline expired' };
});
const runSpecs: RunSpec[] = [
  { id: '20', item: '113', ...legacy, started: 7190, finished: 7150, outcome: 'failed', failure: 'agent_error', summary: 'Illustrative: the harness exited while writing the export.', stuck: 'Illustrative log tail: opencode exited with status 1 after "tool call rejected: write outside the workspace".' },
  { id: '21', item: '113', ...legacy, started: 7140, finished: 7080, outcome: 'failed', failure: 'timeout', summary: 'Illustrative: the run reached its 60-minute wall-clock limit.' },
  { id: '22', item: '113', ...legacy, started: 7075, finished: 7020, outcome: 'failed', failure: 'agent_error', summary: 'Illustrative: the harness exited while writing the export.', stuck: 'Illustrative log tail: opencode exited with status 1 after "tool call rejected: write outside the workspace".' },
  { id: '23', item: '114', role: 'implementer', round: 1, writes: true, started: 2995, finished: 2960, outcome: 'pr_opened', summary: 'Illustrative writer handoff: the order summary shows the delivery window.', problem: 'Customers cannot see when their order will arrive: the order summary shows no delivery window.', solution: '- The order summary shows the delivery window from the warehouse schedule.\n\nThis is illustrative content, not a result of an executed Run.', links: [pull(3)] },
  { id: '24', item: '114', role: 'reviewer', round: 2, writes: false, started: 2955, finished: 2940, outcome: 'no_change_needed', verdict: 'request_changes', summary: 'Illustrative review: one change requested.', findings: '**Changes requested**\n\n- The window ignores the warehouse time zone.\n- Add a test for an order placed after the cut-off.\n\nThis is illustrative content, not a result of an executed review.' },
  { id: '25', item: '114', role: 'implementer', round: 3, writes: true, started: 2935, finished: 2910, outcome: 'pr_updated', summary: 'Illustrative fix round: time zone handled and a cut-off test added.', problem: 'Customers cannot see when their order will arrive: the order summary shows no delivery window.', solution: '- The order summary shows the delivery window from the warehouse schedule.\n- The window is shown in the warehouse time zone.\n- A test covers an order placed after the cut-off.\n\nThis is illustrative content, not a result of an executed Run.', links: [pull(3)] },
  { id: '26', item: '114', role: 'reviewer', round: 4, writes: false, started: 2905, finished: 2895, outcome: 'no_change_needed', verdict: 'approve', summary: 'Illustrative review: approved.', findings: 'Both requested changes are in and the checks pass. Approved for a person to merge.\n\nThis is illustrative content, not a result of an executed review.' },
  { id: '27', item: '111', role: 'analyst', round: 1, writes: false, started: 1825, finished: 1800, outcome: 'no_change_needed', summary: 'Illustrative analysis: sources listed; the competitor table could be its own brief.', findings: 'Sample finding: the repository holds market reports for 2021 to 2023. No source covers 2026.\n\nThis is illustrative content, not a result of an executed analysis.' },
  { id: '28', item: '111', role: 'builder', round: 2, writes: true, started: 1790, finished: 1760, outcome: 'stuck', summary: 'Illustrative: the brief asks for 2026 market sizes, but every source in the repository stops at 2023.', stuck: 'The brief asks for 2026 market sizes, but every source in the repository stops at 2023. A person must decide whether older figures are acceptable or add a newer source.' },
  { id: '30', item: '101', role: 'reviewer', round: 1, writes: false, started: 1390, finished: 1330, outcome: 'stuck', verdict: 'request_changes', summary: 'Illustrative reviewer handoff: agree on the rounding rule before changing the implementation.', stuck: 'The acceptance criteria need a human decision.', findings: 'Sample finding: define how half-cent amounts should round and add that case to the acceptance criteria. This is illustrative content, not a result of an executed review.' },
  ...killed,
  { id: '41', item: '109', role: 'implementer', round: 1, writes: true, started: 555, finished: 520, outcome: 'pr_opened', summary: 'Illustrative writer handoff: negative quantities are refused.', problem: 'The cart API accepts a negative quantity, so a cart line can lower the order total.', solution: '- The cart API refuses a quantity below zero.\n\nThis is illustrative content, not a result of an executed Run.', links: [pull(7)] },
  { id: '42', item: '109', role: 'reviewer', round: 2, writes: false, started: 515, finished: 500, outcome: 'no_change_needed', verdict: 'request_changes', summary: 'Illustrative review: zero is still accepted.', findings: '**Changes requested**\n\n- A quantity of `0` is still accepted.\n- The error does not name the field.\n\nThis is illustrative content, not a result of an executed review.' },
  { id: '43', item: '109', role: 'implementer', round: 3, writes: true, started: 495, finished: 470, outcome: 'pr_updated', summary: 'Illustrative fix round: zero refused; the error names the field.', problem: 'The cart API accepts a negative quantity, so a cart line can lower the order total.', solution: '- The cart API refuses a quantity of zero or less.\n- The error names the `quantity` field.\n\nThis is illustrative content, not a result of an executed Run.', links: [pull(7)] },
  { id: '44', item: '109', role: 'reviewer', round: 4, writes: false, started: 465, finished: 450, outcome: 'no_change_needed', verdict: 'request_changes', summary: 'Illustrative review: the status code is still wrong.', findings: '**Changes requested**\n\n- The API answers `400`, but the task asks for `422`.\n\nThe team allows one fix round, so a person decides what happens next. This is illustrative content, not a result of an executed review.' },
  { id: '45', item: '108', role: 'implementer', round: 1, writes: true, started: 325, finished: 300, outcome: 'no_change_needed', summary: 'Illustrative: the repository in this workspace already shows VAT per line, so the writer changed nothing and opened no pull request.' },
  { id: '46', item: '104', ...legacy, started: 300, finished: 240, outcome: 'failed', failure: 'agent_error', summary: 'Illustrative: the agent stopped after asking which markets the brief covers, and proposed a clarification.', stuck: 'Illustrative log tail: the brief names "our markets" but lists none.' },
  { id: '47', item: '108', role: 'reviewer', round: 2, writes: false, started: 295, finished: 285, outcome: 'no_change_needed', summary: 'Illustrative review: nothing to review.', findings: 'Sample finding: there is no pull request to review. The task names no repository, so the writer worked in its default checkout. Route the task to the order service and assign it again.\n\nThis is illustrative content, not a result of an executed review.' },
  { id: '48', item: '110', role: 'analyst', round: 1, writes: false, started: null, finished: 197, summary: 'cancelled: shift closed (budget exhausted: pool 0.04, spent 0.00, reserved 0.00)' },
  { id: '49', item: '103', ...legacy, started: 175, finished: 150, outcome: 'failed', failure: 'lease_lost', summary: 'lease expired' },
  { id: '50', item: '105', role: 'implementer', round: 1, writes: true, started: 90, finished: 55, outcome: 'pr_opened', summary: 'Illustrative writer handoff for the rounding change.', problem: 'Order totals with a half cent round differently on the invoice and in the cart, so a customer can be charged one cent more than shown.', solution: '- One rounding rule, half away from zero, now serves the cart and the invoice.\n- AGENTS.md documents the rule, as the Work Item asks.\n- A test covers half-cent totals.\n\nThis is illustrative content, not a result of an executed Run.', links: [pull(5)] },
  { id: '51', item: '102', role: 'implementer', round: 1, writes: true, started: 18, finished: null },
  { id: '52', item: '103', ...legacy, started: 58, finished: 2, outcome: 'failed', failure: 'lease_lost', summary: 'lease expired' },
  { id: '53', item: '105', role: 'reviewer', round: 2, writes: false, started: 40, finished: 26, outcome: 'no_change_needed', summary: 'Illustrative review of the rounding change.', findings: 'Sample finding: the change edits AGENTS.md to document the rounding rule, as the Work Item asks. An instruction-file change needs a human decision, so this review gives no verdict. This is illustrative content, not a result of an executed review.' },
  { id: '54', item: '104', role: 'analyst', round: 1, writes: false, started: null, finished: null },
];

const runState = (spec: RunSpec): PloegRun['state'] => spec.finished !== null ? 'finished' : spec.started !== null ? 'running' : 'pending';
const runDetail = (spec: RunSpec): PloegRun => {
  const item = find(spec.item);
  const state = runState(spec);
  return { id: spec.id, workItemId: spec.item, shiftId: spec.role ? shifts.get(spec.item)?.id ?? null : null, team: item.team, role: spec.role, round: spec.round, writes: spec.writes, state, startedAt: spec.started === null ? null : ago(spec.started), finishedAt: spec.finished === null ? null : ago(spec.finished), expiresAt: state === 'running' ? ago(-9) : null, outcome: spec.outcome ?? null, summary: spec.summary ?? '', stuckReason: spec.stuck ?? '', links: spec.links ?? [], findings: spec.findings ?? '', verdict: spec.verdict ?? '', problem: spec.problem ?? '', solution: spec.solution ?? '', failureReason: spec.failure ?? null, authorizedUsd: 0, usage: null, costStatus: 'unknown', keyAlias: null };
};
const runRow = (spec: RunSpec): PloegRunRow => {
  const item = find(spec.item);
  const run = runDetail(spec);
  return { id: run.id, workItemId: run.workItemId, workItemTitle: item.title, externalRef: item.externalId, team: run.team, role: run.role, round: run.round, writes: run.writes, state: run.state, outcome: run.outcome ?? '', verdict: run.verdict, failureReason: run.failureReason ?? '', startedAt: run.startedAt, finishedAt: run.finishedAt, durationSeconds: spec.started !== null && spec.finished !== null ? (spec.started - spec.finished) * 60 : null, authorizedUsd: run.state === 'pending' ? null : 0, settledUsd: run.state === 'finished' && spec.started !== null ? 0 : null, observedUsd: null, reservedModels: [], usage: null };
};
const newestFirst = (a: { id: string }, b: { id: string }) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1);
const runs: PloegRunRow[] = runSpecs.map(runRow).sort(newestFirst);

type CheckpointSpec = [id: string, item: string, phase: string, minutes: number, prUrl?: string];
const checkpointSpecs: CheckpointSpec[] = [
  ['61', '114', 'branch_created', 2993], ['62', '114', 'pr_opened', 2961, pull(3)], ['63', '114', 'reviewed', 2941], ['64', '114', 'pr_updated', 2911, pull(3)], ['65', '114', 'reviewed', 2896],
  ['66', '111', 'reviewed', 1801], ['67', '111', 'branch_created', 1788],
  ['70', '101', 'reviewed', 1331],
  ['71', '109', 'branch_created', 553], ['72', '109', 'pr_opened', 521, pull(7)], ['73', '109', 'reviewed', 501], ['74', '109', 'pr_updated', 471, pull(7)], ['75', '109', 'reviewed', 451],
  ['76', '108', 'reviewed', 286],
  ['78', '105', 'branch_created', 88], ['79', '105', 'pr_opened', 56, pull(5)], ['80', '105', 'reviewed', 27],
  ['81', '102', 'branch_created', 16], ['82', '102', 'progress', 4],
];
const checkpoints: PloegCheckpoint[] = checkpointSpecs.map(([id, item, phase, minutes, prUrl]) => ({ id, workItemId: item, phase, branch: shifts.get(item)?.branch ?? '', prUrl: prUrl ?? '', createdAt: ago(minutes), nodeName: '', podUid: '' }));

type EventSpec = [minutes: number, item: string, action: string, actor: string, detail?: Record<string, unknown>];
const team = (item: string) => `team:${find(item).team}`;
const tracker = (item: string) => `webhook:${find(item).provider}`;
const queued = (item: string, minutes: number): EventSpec => [minutes, item, 'work_item.queued', tracker(item), {}];
const opened = (item: string, minutes: number, round: number): EventSpec => [minutes, item, 'round.opened', team(item), { shiftId: shifts.get(item)!.id, round }];
const claimed = (spec: RunSpec): EventSpec => [spec.started!, spec.item, 'run.claimed', team(spec.item), { shiftId: shifts.get(spec.item)!.id, role: spec.role, round: spec.round, writes: spec.writes }];
const reported = (spec: RunSpec): EventSpec[] => spec.outcome ? [[spec.finished!, spec.item, `outcome.${spec.outcome}`, team(spec.item), {}]] : [];
const leased = (spec: RunSpec): EventSpec[] => [[spec.started!, spec.item, 'lease.acquired', team(spec.item), {}], ...reported(spec)];
const checkpointed = (item: string): EventSpec[] => checkpointSpecs.filter(([, owner]) => owner === item).map(([, , phase, minutes]) => [minutes, item, 'checkpoint.written', team(item), { phase }]);
const closed = (item: string, human: string, state = 'needs_human'): EventSpec[] => { const shift = shiftSpecs.find(spec => spec.item === item)!; return [[shift.closed!, item, 'shift.closed', team(item), { shiftId: shift.id, reason: shift.reason }], [shift.closed!, item, `work_item.${state}`, 'ploegd:shift-engine', { reason: human }]]; };
const ran = (item: string, rounds: Record<number, number>): EventSpec[] => [...Object.entries(rounds).map(([round, minutes]) => opened(item, minutes, Number(round))), ...runSpecs.filter(spec => spec.item === item && spec.role).flatMap(spec => [...(spec.started !== null ? [claimed(spec)] : []), ...(spec.finished !== null ? reported(spec) : [])])];
const run = (id: string) => runSpecs.find(spec => spec.id === id)!;
const killedEvents = killed.flatMap((spec, attempt): EventSpec[] => [claimed(spec), ...(attempt % 2 === 0 ? reported(spec) : [[spec.finished!, spec.item, 'run.expired', 'ploegd:sweeper', { shiftId: '14', role: spec.role, writes: true }] as EventSpec])]);

const eventSpecs: EventSpec[] = [
  queued('113', 7200), ...leased(run('20')), ...leased(run('21')), ...leased(run('22')),
  queued('114', 3000), ...ran('114', { 1: 2999, 2: 2959, 3: 2939, 4: 2909 }), ...checkpointed('114'), ...closed('114', 'the reviewer approved; a person is asked to merge', 'awaiting_review'), [2700, '114', 'work_item.done', 'ploegd:review', { reason: 'pull request merged' }],
  queued('111', 1830), ...ran('111', { 1: 1829, 2: 1799 }), ...checkpointed('111'), [1800, '116', 'work_item.proposed', 'team:research', {}], ...closed('111', `shift stopped: builder reported stuck in round 2 — ${run('28').summary}`), [1500, '116', 'work_item.rejected', 'operator:vloer:demo-operator', { reason: 'Already covered by the market-sizing section.' }],
  queued('101', 1400), ...ran('101', { 1: 1398 }), ...checkpointed('101'), ...closed('101', `shift stopped: the reviewer escalated to a person in round 1 — ${run('30').summary}`),
  queued('112', 1320), opened('112', 1319, 1), ...killedEvents, ...closed('112', 'shift stopped: implementer was killed 10 times in round 1 before it could finish — the runs never failed on the work, so look at the cluster (evictions, node pressure, image pulls), not the ticket'),
  queued('109', 560), ...ran('109', { 1: 559, 2: 519, 3: 499, 4: 469 }), ...checkpointed('109'), ...closed('109', 'the reviewer kept asking for changes and the fix-round cap was reached; a person is asked to take over'),
  queued('108', 330), ...ran('108', { 1: 329, 2: 299 }), ...checkpointed('108'), ...closed('108', 'plan complete; a person is asked to review and merge'),
  queued('104', 305), ...leased(run('46')), [240, '107', 'work_item.proposed', 'team:research', {}], opened('104', 6, 1),
  queued('115', 250), opened('115', 249, 1), [240, '115', 'work_item.withdrawn', tracker('115'), { reason: 'withdrawn_unassigned', shiftId: '17' }],
  queued('110', 200), opened('110', 199, 1), ...closed('110', 'the budget could not fund the next round; a person is asked to take over'),
  queued('103', 180), [175, '103', 'lease.acquired', team('103'), {}], [150, '103', 'lease.expired', 'ploegd:sweeper', { infraFailures: 1 }], [58, '103', 'lease.acquired', team('103'), {}], [2, '103', 'lease.expired', 'ploegd:sweeper', { infraFailures: 2 }],
  queued('105', 95), ...ran('105', { 1: 94, 2: 54 }), ...checkpointed('105'), [26, '106', 'work_item.proposed', 'team:delivery', {}], ...closed('105', 'plan complete; a person is asked to review and merge', 'awaiting_review'),
  queued('102', 70), ...ran('102', { 1: 69 }), ...checkpointed('102'),
];
const events: PloegActivityEvent[] = eventSpecs
  .map((spec, index) => ({ spec, index }))
  .sort((a, b) => b.spec[0] - a.spec[0] || a.index - b.index)
  .map(({ spec: [minutes, item, action, actor, detail] }, index) => ({ id: String(1001 + index), at: ago(minutes), actor, action, workItemId: item, team: find(item).team, detail: detail ?? {}, workItemTitle: find(item).title }))
  .reverse();

const details = Object.fromEntries(items.map(item => {
  const own = <T extends { workItemId: string }>(entries: T[]) => entries.filter(entry => entry.workItemId === item.id);
  const shift = shifts.get(item.id);
  const detail: PloegDetail = {
    item,
    shifts: shift ? [shift] : [],
    runs: runSpecs.filter(spec => spec.item === item.id).map(runDetail).sort(newestFirst),
    checkpoints: own(checkpoints).sort(newestFirst),
    events: own(events).map(({ workItemTitle: _title, ...entry }): PloegEvent => entry),
    truncated: { shifts: false, runs: false, checkpoints: false, events: false },
  };
  return [item.id, detail];
})) as Record<string, PloegDetail>;

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

type PlaySpec = { item: string; number: number; additions: number; deletions: number; changedFiles: number; merged?: { minutes: number; by: string; review: number } };
const playSpecs: PlaySpec[] = [
  { item: '114', number: 3, additions: 131, deletions: 9, changedFiles: 5, merged: { minutes: 2700, by: 'demo-operator', review: 2705 } },
  { item: '109', number: 7, additions: 36, deletions: 4, changedFiles: 2 },
  { item: '105', number: 5, additions: 48, deletions: 12, changedFiles: 3 },
];
const demoReviewer = 'demo-operator';

function demoCard(item: PloegItem): PloegCard {
  const detail = details[item.id];
  const shift = shifts.get(item.id) ?? null;
  const own = runSpecs.filter(spec => spec.item === item.id);
  const plays: PloegCardPlay[] = playSpecs.filter(spec => spec.item === item.id).map(spec => {
    return { number: spec.number, url: pull(spec.number), state: spec.merged ? 'merged' : 'open', shiftId: shift?.id ?? null, branch: shift?.branch ?? '', headSha: '', mergeCommitSha: '', mergedAt: spec.merged ? ago(spec.merged.minutes) : null, mergedBy: spec.merged?.by ?? '', closedAt: null, additions: spec.additions, deletions: spec.deletions, changedFiles: spec.changedFiles, ci: null, reviews: spec.merged ? [{ reviewer: demoReviewer, state: 'approved', receivedAt: ago(spec.merged.review), headSha: '' }] : [] };
  });
  const latest = plays.at(-1);
  const state = item.state === 'withdrawn' ? 'withdrawn' : !latest ? 'drafting' : latest.state === 'merged' ? 'merged' : latest.state === 'closed' ? 'closed' : 'in_review';
  const merged = plays.find(play => play.state === 'merged');
  const roleOf = (spec: RunSpec) => spec.role || 'agent';
  const started = own.filter(spec => spec.started !== null);
  const finished = started.filter(spec => spec.finished !== null);
  const roles = [...new Set(started.map(roleOf))];
  const timeline: { minutes: number; kind: string; actor: string; detail: Record<string, string | number | boolean> }[] = [];
  const first = started.reduce<RunSpec | null>((earliest, spec) => !earliest || spec.started! > earliest.started! ? spec : earliest, null);
  if (first) timeline.push({ minutes: first.started!, kind: 'minted', actor: `team:${item.team}`, detail: {} });
  for (const spec of started) {
    timeline.push({ minutes: spec.started!, kind: 'run_started', actor: `team:${item.team}`, detail: { runId: spec.id, role: roleOf(spec), round: spec.round } });
    if (spec.finished !== null) timeline.push({ minutes: spec.finished, kind: 'run_finished', actor: `team:${item.team}`, detail: { runId: spec.id, role: roleOf(spec), round: spec.round, ...(spec.outcome ? { outcome: spec.outcome } : {}) } });
  }
  for (const [, owner, phase, minutes] of checkpointSpecs) if (owner === item.id && phase === 'pr_opened' && plays[0]) timeline.push({ minutes, kind: 'pr_opened', actor: `team:${item.team}`, detail: { number: plays[0].number } });
  const spec = playSpecs.find(entry => entry.item === item.id && entry.merged);
  if (spec?.merged) timeline.push({ minutes: spec.merged.review, kind: 'review', actor: spec.merged.by, detail: { number: spec.number, state: 'approved' } }, { minutes: spec.merged.minutes, kind: 'merged', actor: spec.merged.by, detail: { number: spec.number } });
  const withdrawn = detail.events.find(entry => entry.action === 'work_item.withdrawn');
  if (withdrawn) timeline.push({ minutes: (anchor - Date.parse(withdrawn.at)) / 60_000, kind: 'withdrawn', actor: withdrawn.actor, detail: typeof withdrawn.detail.reason === 'string' ? { reason: withdrawn.detail.reason } : {} });
  const runSeconds = finished.reduce((sum, entry) => sum + (entry.started! - entry.finished!) * 60, 0);
  return {
    workItemId: item.id, title: item.title, externalRef: item.externalId, url: item.url, team: item.team,
    target: item.target ? { forge: item.target.forge, owner: item.target.owner, repo: item.target.repo } : null,
    style: { skin: 'vloer-native', theme: null }, state, rarity: null, finish: 'matte', grade: null, condition: null,
    steward: merged ? { name: merged.mergedBy, source: 'merged_by' } : null,
    roster: merged ? [{ name: merged.mergedBy, roles: ['merger', 'reviewer'] }] : [],
    crew: roles.map(role => ({ role, writes: started.find(entry => roleOf(entry) === role)!.writes, runs: started.filter(entry => roleOf(entry) === role).length })),
    plays,
    totals: {
      costStatus: 'not_reported', usageComplete: started.length ? false : null,
      ...(shift ? { shifts: 1, rounds: shift.round } : {}),
      runs: started.length, failedRuns: finished.filter(entry => entry.outcome === 'failed' || entry.outcome === 'stuck').length,
      firstRunAt: first ? ago(first.started!) : null, lastRunAt: finished.length ? ago(Math.min(...finished.map(entry => entry.finished!))) : null,
      ...(finished.length ? { runSeconds } : {}),
    },
    events: timeline.sort((a, b) => b.minutes - a.minutes).map(entry => ({ at: ago(entry.minutes), kind: entry.kind, actor: entry.actor, detail: entry.detail })),
    demo: true,
  };
}
const cards: Record<string, PloegCard> = Object.fromEntries(items.map(item => [item.id, demoCard(item)]));

export const ploegDemo = { teams, items, details, runs, events, summary, cards, pageSize: 10 };
