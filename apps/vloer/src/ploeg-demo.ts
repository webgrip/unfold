import { createHash } from 'node:crypto';
import type { PloegActivityEvent, PloegCard, PloegCardCondition, PloegCardGates, PloegCrack, PloegCrackCandidates, PloegGate, PloegCardDeployment, PloegCardGrade, PloegCardPlay, PloegCheckpoint, PloegDetail, PloegEvent, PloegItem, PloegRun, PloegRunRow, PloegShift, PloegTeam, PloegTeamSummary, PloegWindow } from './ploeg.ts';

const anchor = Math.floor(Date.now() / 60_000) * 60_000;
/** The minute, in epoch milliseconds, that every illustrative Ploeg timestamp is relative to: the clock when this module loaded. */
export const ploegDemoAnchor = anchor;
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
const day = 1440;
type ShowcaseSpec = { item: string; days: number; number: number };
const showcases: ShowcaseSpec[] = [];
function showcase(id: string, title: string, days: number, samples: string[] = []): ItemSpec[] {
  const number = 10 + showcases.length;
  showcases.push({ item: id, days, number });
  const merged = (days + 2) * day + 300;
  return [{ id, externalId: `DEMO-${Number(id) - 100}`, title, state: 'done', attempts: 1, created: merged + 2 * day, updated: merged, description: `Illustrative merged Work Item that shows a Run card after ${days} days live. Its Runs predate the demo's history and its ${['deploys', 'roster', 'gates', ...samples].join(', ').replace(/, ([^,]*)$/, ' and $1')} are sample data. No dispatch or model calls occurred.` }];
}
function epic(id: string, title: string, created: number): ItemSpec {
  return { id, externalId: `DEMO-${Number(id) - 100}`, title, state: 'done', attempts: 0, created, updated: created - day, description: 'Illustrative epic: its card lists the set of Work Items the tracker named as its children, drawn in a DOM skin pack. An epic carries no pull request of its own. The set is sample data; no dispatch or model calls occurred.' };
}
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
  ...showcase('117', 'Show the order number in the confirmation email subject', 9),
  ...showcase('118', 'Validate postcodes on the shipping address form', 41, ['cracks']),
  ...showcase('119', 'Cache the product price lookup for the cart', 118, ['grade', 'cracks']),
  ...showcase('120', 'Add an audit log entry when an order is refunded', 205, ['grade', 'cracks']),
  ...showcase('121', 'Return 404 instead of 500 for unknown order ids', 412),
  ...showcase('122', 'Rate-limit the order webhook per merchant', 400, ['grade', 'cracks']),
  ...showcase('123', 'Attach the invoice PDF to the shipping confirmation', 63, ['grade', 'cracks']),
  { id: '124', externalId: 'DEMO-24', title: 'A postcode with a space makes the shipping form answer 500', state: 'done', attempts: 0, created: 6 * day, updated: 2 * day, description: 'Illustrative bug Work Item: a person fixed it in pull request #24. Its fix, the candidate causes Ploeg would list and the attributions on it are sample data, so the Trace this bug panel has something to show. No dispatch or model calls occurred.' },
  { id: '125', externalId: 'DEMO-25', title: 'Checkout and confirmation hardening', state: 'done', attempts: 0, created: 420 * day, updated: 3 * day, description: 'Illustrative epic: its card lists the set of Work Items the tracker named as its children before their first Shift. An epic carries no pull request of its own. The set is sample data; no dispatch or model calls occurred.' },
  ...showcase('134', 'Store the chosen payment method on the checkout session', 190, ['set membership', 'grade', 'cracks']),
  epic('135', 'Checkout overhaul', 260 * day),
  ...showcase('136', 'Recalculate shipping costs when the address changes', 95, ['set membership', 'grade', 'cracks']),
  ...showcase('137', 'Retry failed stock reservations with backoff', 370, ['set membership', 'grade', 'cracks']),
  ...showcase('138', 'Show an order summary step before payment', 12, ['set membership', 'grade', 'cracks']),
  epic('139', 'Order service reliability', 420 * day),
  ...showcase('140', 'Send the order confirmation in the customer language', 33, ['set membership', 'grade', 'cracks']),
  ...showcase('141', 'Validate discount codes before the payment step', 205, ['set membership', 'grade', 'cracks']),
  ...showcase('142', 'Remember the last used delivery address', 400, ['set membership', 'grade', 'cracks']),
  epic('143', 'Order flow polish', 40 * day),
];

const demoSkins: Record<string, string> = {
  '105': 'forge', '117': 'forge', '119': 'forge', '120': 'forge', '122': 'forge', '123': 'forge',
  '111': 'holo', '134': 'holo', '135': 'holo',
  '108': 'loot', '136': 'loot', '137': 'loot',
  '102': 'arcade', '138': 'arcade', '139': 'arcade',
  '113': 'ticker', '140': 'ticker', '141': 'ticker',
  '101': 'patch', '142': 'patch', '143': 'patch',
};
const notCollectedInputs = ['durability.survival', 'review.ciFirstGreen', 'review.findings'];
type InputSpec = { weight: number; reverted?: boolean; days: number; reverts?: number; hotfixes?: number; budget?: number | null; defects: number; plays?: number; failed?: number; changes?: number; rounds: number };
const gradeInputs = (spec: InputSpec): NonNullable<PloegCardGrade['inputs']> => ({
  reliability: { crackWeight: spec.weight, reverted: spec.reverted ?? false },
  durability: { daysLive: spec.days, liveSince: ago(spec.days * day + 300), reverts: spec.reverts ?? 0, hotfixes: spec.hotfixes ?? 0, survival: null },
  delivery: { budgetShare: spec.budget ?? null, defectBounces: spec.defects, extraPlays: spec.plays ?? 0, failedRuns: spec.failed ?? 0 },
  review: { ciFirstGreen: null, findings: null, changeRequests: spec.changes ?? 0, reviewRounds: spec.rounds },
  notCollected: notCollectedInputs,
});
const demoGrades: Record<string, PloegCardGrade> = {
  '119': { formula: '2026.2', overall: 8.5, provisional: true, subgrades: { reliability: 8, durability: 9, delivery: 8.5, review: 8 }, label: null, qualifiers: [], inputs: gradeInputs({ weight: 2, days: 118, defects: 0, plays: 1, changes: 2, rounds: 2 }) },
  '120': { formula: '2026.2', overall: 9.5, provisional: false, subgrades: { reliability: 9.5, durability: 10, delivery: 9, review: 9 }, label: null, qualifiers: [], inputs: gradeInputs({ weight: 0.25, days: 205, defects: 0, failed: 1, changes: 1, rounds: 2 }) },
  '122': { formula: '2026.2', overall: 10, provisional: false, subgrades: { reliability: 10, durability: 10, delivery: 10, review: 10 }, label: 'black', qualifiers: [], inputs: gradeInputs({ weight: 0, days: 400, defects: 0, rounds: 1 }) },
  '123': { formula: '2026.2', overall: 8.5, provisional: true, subgrades: { reliability: 10, durability: 8, delivery: 7.5, review: 8.5 }, label: null, qualifiers: ['RT'], inputs: gradeInputs({ weight: 0, days: 63, defects: 1, failed: 1, changes: 1, rounds: 2 }) },
  '134': { formula: '2026.2', overall: 9.5, provisional: false, subgrades: { reliability: 9, durability: 10, delivery: 9.5, review: 9.5 }, label: null, qualifiers: [], inputs: gradeInputs({ weight: 0.5, days: 190, defects: 0, rounds: 1 }) },
  '136': { formula: '2026.2', overall: 7.5, provisional: true, subgrades: { reliability: 6.5, durability: 8, delivery: 8, review: 8.5 }, label: null, qualifiers: ['HF'], inputs: gradeInputs({ weight: 2, days: 95, hotfixes: 1, defects: 1, rounds: 2 }) },
  '137': { formula: '2026.2', overall: 10, provisional: false, subgrades: { reliability: 10, durability: 10, delivery: 10, review: 10 }, label: 'black', qualifiers: [], inputs: gradeInputs({ weight: 0, days: 370, defects: 0, rounds: 1 }) },
  '138': { formula: '2026.2', overall: 8.5, provisional: true, subgrades: { reliability: 9, durability: 8, delivery: 8.5, review: 8 }, label: null, qualifiers: [], inputs: gradeInputs({ weight: 0, days: 12, defects: 0, changes: 1, rounds: 2 }) },
  '140': { formula: '2026.2', overall: 8, provisional: true, subgrades: { reliability: 7.5, durability: 8, delivery: 8.5, review: 8 }, label: null, qualifiers: ['RT'], inputs: gradeInputs({ weight: 0.25, days: 33, defects: 0, failed: 1, rounds: 2 }) },
  '141': { formula: '2026.2', overall: 9, provisional: false, subgrades: { reliability: 8.5, durability: 9.5, delivery: 9, review: 9 }, label: null, qualifiers: [], inputs: gradeInputs({ weight: 1, days: 205, defects: 1, rounds: 1 }) },
  '142': { formula: '2026.2', overall: 10, provisional: false, subgrades: { reliability: 10, durability: 10, delivery: 10, review: 9.5 }, label: 'gold', qualifiers: [], inputs: gradeInputs({ weight: 0, days: 400, defects: 0, rounds: 1 }) },
};
const workdaysLater = (minutes: number, workdays: number) => { let at = anchor - minutes * 60_000; for (let left = workdays; left > 0;) { at += 86_400_000; const weekday = new Date(at).getUTCDay(); if (weekday !== 0 && weekday !== 6) left--; } return new Date(at).toISOString().replace('.000Z', 'Z'); };
const bugRef = { workItemId: '124', ref: 'DEMO-24', title: 'A postcode with a space makes the shipping form answer 500' };
const bugMend = { at: ago(2 * day + 60), by: 'demo-dev', pr: 24, bySteward: false, confirmedAt: null };
const demoConditions: Record<string, PloegCardCondition> = {
  '118': { state: 'cracked', cracks: [{ id: '7101', bug: bugRef, severity: 'S3', share: 'primary', discovery: 'discovered', proposedAt: ago(2 * day), confirmedAt: ago(day), confirmedBy: ['demo-dev', 'demo-tester'], disputed: false, weight: 1, warranty: 'full', mended: bugMend }] },
  '119': { state: 'cracked', cracks: [{ id: 'demo-crack-119', bug: { workItemId: null, ref: 'DEMO-31', title: 'Cart total keeps the cached price after a currency switch' }, severity: 'S2', share: 'primary', discovery: 'discovered', proposedAt: ago(9 * day), confirmedAt: ago(8 * day), confirmedBy: ['demo-operator', 'demo-reviewer'], disputed: false, weight: 2, warranty: 'full', mended: null }] },
  '120': { state: 'mended', cracks: [{ id: 'demo-crack-120', bug: { workItemId: null, ref: 'DEMO-32', title: 'Refund audit entry missed partial refunds' }, severity: 'S3', share: 'primary', discovery: 'self', proposedAt: ago(60 * day), confirmedAt: ago(59 * day), confirmedBy: ['demo-operator', 'demo-reviewer'], disputed: false, weight: 0.25, warranty: 'full', mended: { at: ago(55 * day), by: 'demo-operator', pr: 68, bySteward: true, confirmedAt: ago(25 * day) } }] },
  '134': { state: 'mended', cracks: [{ id: 'demo-crack-134', bug: { workItemId: null, ref: 'DEMO-51', title: 'Saved payment method kept after the customer removed it' }, severity: 'S2', share: 'primary', discovery: 'discovered', proposedAt: ago(80 * day), confirmedAt: ago(79 * day), confirmedBy: ['demo-operator', 'demo-reviewer'], disputed: false, weight: 0.5, warranty: 'full', mended: { at: ago(74 * day), by: 'demo-operator', pr: 71, bySteward: true, confirmedAt: ago(44 * day) } }] },
  '136': { state: 'cracked', cracks: [{ id: 'demo-crack-136', bug: { workItemId: null, ref: 'DEMO-52', title: 'Shipping cost stays at the old rate after a postcode change' }, severity: 'S2', share: 'primary', discovery: 'discovered', proposedAt: ago(6 * day), confirmedAt: ago(5 * day), confirmedBy: ['demo-operator', 'demo-reviewer'], disputed: false, weight: 2, warranty: 'full', mended: null }] },
  '140': { state: 'mended', cracks: [{ id: 'demo-crack-140', bug: { workItemId: null, ref: 'DEMO-53', title: 'Confirmation fell back to English for Frisian' }, severity: 'S4', share: 'primary', discovery: 'self', proposedAt: ago(20 * day), confirmedAt: ago(20 * day), confirmedBy: ['demo-operator', 'demo-reviewer'], disputed: false, weight: 0.25, warranty: 'full', mended: { at: ago(18 * day), by: 'demo-reviewer', pr: 74, bySteward: false, confirmedAt: ago(1 * day) } }] },
  '141': { state: 'cracked', cracks: [{ id: 'demo-crack-141', bug: { workItemId: null, ref: 'DEMO-54', title: 'Expired discount codes pass when the clock crosses midnight' }, severity: 'S3', share: 'primary', discovery: 'discovered', proposedAt: ago(3 * day), confirmedAt: ago(2 * day), confirmedBy: ['demo-operator', 'demo-reviewer'], disputed: false, weight: 1, warranty: 'half', mended: null }] },
};
const mergers: Record<string, string> = { '121': 'demo-lead' };
type GateVisit = [gate: PloegGate, minutes: number];
type GateSpec = { visits: GateVisit[]; bounces?: { reason: string; actor: string }[] };
const qa = 'demo-tester';
const acceptor = 'demo-po';
const flow = (merged: number, extra: GateVisit[] = []): GateVisit[] => [['development', merged + 3 * day], ...extra, ['test', merged], ['acceptance', merged - day / 2], ['done', merged - day]];
const showcaseMerged = (id: string) => { const spec = showcases.find(entry => entry.item === id)!; return (spec.days + 2) * day + 300; };
const demoGateSpecs: Record<string, GateSpec> = {
  '105': { visits: [['development', 94], ['test', 50]] },
  '114': { visits: [['development', 3000], ['test', 2700], ['acceptance', 2600], ['done', 2500]] },
  '117': { visits: flow(showcaseMerged('117')) },
  '118': { visits: (() => { const merged = showcaseMerged('118'); return [['development', merged + 5 * day], ['test', merged + 3 * day], ['development', merged + 2.5 * day], ['test', merged], ['acceptance', merged - day / 2], ['done', merged - day]] as GateVisit[]; })(), bounces: [{ reason: 'defect', actor: qa }] },
  '119': { visits: (() => { const merged = showcaseMerged('119'); return [['development', merged + 4 * day], ['test', merged + 2 * day], ['acceptance', merged + day], ['development', merged + 0.8 * day], ['test', merged], ['acceptance', merged - day / 2], ['done', merged - day]] as GateVisit[]; })(), bounces: [{ reason: 'requirement', actor: acceptor }] },
  '120': { visits: flow(showcaseMerged('120')) },
  '121': { visits: flow(showcaseMerged('121')) },
  '122': { visits: flow(showcaseMerged('122')) },
  '123': { visits: (() => { const merged = showcaseMerged('123'); return [['development', merged + 5 * day], ['test', merged + 3 * day], ['development', merged + 2.6 * day], ['test', merged + day], ['acceptance', merged], ['test', merged - 0.2 * day], ['acceptance', merged - day / 2], ['done', merged - day]] as GateVisit[]; })(), bounces: [{ reason: 'defect', actor: qa }, { reason: 'environment', actor: acceptor }] },
  '124': { visits: [['development', 5 * day], ['test', 2 * day + 60], ['acceptance', 1.5 * day], ['done', day]] },
  '101': { visits: [['development', 1400], ['test', 1390]] },
  '102': { visits: [['development', 70]] },
  '134': { visits: flow(showcaseMerged('134')) },
  '136': { visits: (() => { const merged = showcaseMerged('136'); return [['development', merged + 4 * day], ['test', merged + 2 * day], ['acceptance', merged + day], ['development', merged + 0.8 * day], ['test', merged], ['acceptance', merged - day / 2], ['done', merged - day]] as GateVisit[]; })(), bounces: [{ reason: 'defect', actor: acceptor }] },
  '137': { visits: flow(showcaseMerged('137')) },
  '138': { visits: flow(showcaseMerged('138')) },
  '140': { visits: (() => { const merged = showcaseMerged('140'); return [['development', merged + 4 * day], ['test', merged + 2 * day], ['development', merged + 1.5 * day], ['test', merged], ['acceptance', merged - day / 2], ['done', merged - day]] as GateVisit[]; })(), bounces: [{ reason: 'requirement', actor: qa }] },
  '141': { visits: (() => { const merged = showcaseMerged('141'); return [['development', merged + 4 * day], ['test', merged + 2 * day], ['development', merged + 1.5 * day], ['test', merged], ['acceptance', merged - day / 2], ['done', merged - day]] as GateVisit[]; })() },
  '142': { visits: flow(showcaseMerged('142')) },
};
const gateOrder: PloegGate[] = ['development', 'test', 'acceptance', 'done'];
function demoGates(id: string): PloegCardGates | undefined {
  const spec = demoGateSpecs[id];
  if (!spec) return undefined;
  const history = spec.visits.map(([gate, minutes], index) => ({ gate, enteredAt: ago(minutes), leftAt: index + 1 < spec.visits.length ? ago(spec.visits[index + 1][1]) : null }));
  const backs = spec.visits.slice(1).map(([gate, minutes], index) => ({ from: spec.visits[index][0], to: gate, minutes })).filter(move => gateOrder.indexOf(move.to) < gateOrder.indexOf(move.from));
  const bounces = backs.map((move, index) => ({ from: move.from, to: move.to, at: ago(move.minutes), reason: spec.bounces?.[index]?.reason ?? 'unknown', actor: spec.bounces?.[index]?.actor ?? '' }));
  const entered = new Set(spec.visits.map(([gate]) => gate));
  const rightFirstTime = Object.fromEntries((['test', 'acceptance', 'done'] as const).filter(gate => entered.has(gate)).map(gate => [gate, bounces.filter(bounce => bounce.from === gate && (bounce.reason === 'defect' || bounce.reason === 'unknown')).length]));
  return { current: spec.visits.at(-1)![0], history, bounces, rightFirstTime };
}
const demoEpics: Record<string, string[]> = {
  '125': ['121', '118', '123', '117', '105'],
  '135': ['138', '134', '136', '141', '142'],
  '139': ['122', '120', '137', '140'],
  '143': ['114', '109', '103'],
};
const inDemoSet = (id: string) => Object.hasOwn(demoEpics, id) || Object.values(demoEpics).some(children => children.includes(id));

const demoCopies: Record<string, string[]> = { '105': ['developer'], '117': ['developer'], '119': ['developer'], '120': ['qa'], '121': ['developer'], '122': ['po'], '123': ['developer'] };

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

type PlaySpec = { item: string; number: number; additions: number; deletions: number; changedFiles: number; merged?: { minutes: number; by: string; review: number }; deploys?: [environment: string, minutes: number][] };
const playSpecs: PlaySpec[] = [
  { item: '114', number: 3, additions: 131, deletions: 9, changedFiles: 5, merged: { minutes: 2700, by: 'demo-operator', review: 2705 } },
  { item: '109', number: 7, additions: 36, deletions: 4, changedFiles: 2 },
  { item: '105', number: 5, additions: 48, deletions: 12, changedFiles: 3 },
  { item: '124', number: 24, additions: 18, deletions: 6, changedFiles: 3, merged: { minutes: 2 * day + 60, by: 'demo-dev', review: 2 * day + 90 }, deploys: [['test', 2 * day], ['acceptance', 1.5 * day], ['production', day]] },
  ...showcases.map(({ item, days, number }, index): PlaySpec => {
    const released = days * day + 300;
    return { item, number, additions: 24 + index * 37, deletions: 3 + index * 5, changedFiles: 2 + index, merged: { minutes: released + 2 * day, by: mergers[item] ?? 'demo-operator', review: released + 2 * day + 45 }, deploys: [['test', released + 2 * day - 30], ['acceptance', released + day], ['production', released]] };
  }),
];
const demoReviewer = 'demo-operator';
const demoSha = (item: string, number: number) => createHash('sha1').update(`demo-${item}-${number}`).digest('hex');
const pipeline = (item: string, environment: string) => `https://forge.example.invalid/example/order-service/actions/runs/${item}-${environment}`;

function demoRelease(specs: PlaySpec[]): Pick<PloegCard, 'deployments' | 'release'> {
  const firsts = new Map<string, PloegCardDeployment & { minutes: number }>();
  for (const spec of specs) for (const [environment, minutes] of spec.deploys ?? []) {
    const earlier = firsts.get(environment);
    if (!earlier || minutes > earlier.minutes) firsts.set(environment, { environment, firstDeployedAt: ago(minutes), sha: demoSha(spec.item, spec.number), url: pipeline(spec.item, environment), minutes });
  }
  const deployments = [...firsts.values()].sort((a, b) => b.minutes - a.minutes).map(({ minutes: _minutes, ...entry }) => entry);
  const latest = specs.filter(spec => spec.merged).at(-1);
  if (!latest?.merged) return { deployments, release: null };
  const production = latest.deploys?.find(([environment]) => environment === 'production');
  if (production) return { deployments, release: { at: ago(production[1]), source: 'deploy', environment: 'production' } };
  return { deployments, release: latest.deploys?.length ? null : { at: ago(latest.merged.minutes), source: 'merge', environment: 'production' } };
}

function demoCard(item: PloegItem): PloegCard {
  const detail = details[item.id];
  const shift = shifts.get(item.id) ?? null;
  const own = runSpecs.filter(spec => spec.item === item.id);
  const ownPlays = playSpecs.filter(spec => spec.item === item.id);
  const plays: PloegCardPlay[] = ownPlays.map(spec => {
    return { number: spec.number, url: pull(spec.number), state: spec.merged ? 'merged' : 'open', shiftId: shift?.id ?? null, branch: shift?.branch ?? '', headSha: '', mergeCommitSha: spec.merged ? demoSha(spec.item, spec.number) : '', mergedAt: spec.merged ? ago(spec.merged.minutes) : null, mergedBy: spec.merged?.by ?? '', closedAt: null, additions: spec.additions, deletions: spec.deletions, changedFiles: spec.changedFiles, ci: null, reviews: spec.merged ? [{ reviewer: demoReviewer, state: 'approved', receivedAt: ago(spec.merged.review), headSha: '' }] : [], deployments: (spec.deploys ?? []).map(([environment, minutes]) => ({ environment, firstDeployedAt: ago(minutes), sha: demoSha(spec.item, spec.number), url: pipeline(spec.item, environment) })) };
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
    style: { skin: demoSkins[item.id] ?? 'vloer-native', theme: null }, state, rarity: null, finish: 'matte', grade: demoGrades[item.id] ?? null, condition: demoConditions[item.id] ?? null,
    steward: merged ? { name: merged.mergedBy, source: 'merged_by' } : null,
    roster: demoRoster(item.id, merged ?? null, plays),
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
    ...demoRelease(ownPlays),
    ...(demoGates(item.id) ? { gates: demoGates(item.id) } : {}),
    ...(demoGateSpecs[item.id]?.bounces?.some(bounce => bounce.reason === 'requirement') ? { evolved: true as const } : {}),
    ...(inDemoSet(item.id) ? { set: null } : {}),
    demo: true,
  };
}
function demoRoster(id: string, merged: PloegCardPlay | null, plays: PloegCardPlay[]): PloegCard['roster'] {
  const roles = new Map<string, Set<string>>();
  const mark = (name: string, role: string) => { if (!name) return; if (!roles.has(name)) roles.set(name, new Set()); roles.get(name)!.add(role); };
  if (merged) mark(merged.mergedBy, 'merger');
  for (const play of plays) for (const review of play.reviews) mark(review.reviewer, 'reviewer');
  const visits = demoGateSpecs[id]?.visits ?? [];
  if (visits.some(([gate], index) => gate === 'test' && visits[index + 1] && visits[index + 1][0] !== 'development')) mark(qa, 'qa');
  if (visits.some(([gate], index) => gate === 'acceptance' && visits[index + 1]?.[0] === 'done')) mark(acceptor, 'acceptor');
  for (const crack of demoConditions[id]?.cracks ?? []) if (crack.mended && !crack.mended.bySteward) mark(crack.mended.by, 'cosigner');
  for (const role of demoCopies[id] ?? []) mark('demo-operator', role);
  const order = ['developer', 'merger', 'reviewer', 'qa', 'po', 'acceptor', 'cosigner'];
  return [...roles].map(([name, held]) => ({ name, roles: order.filter(role => held.has(role)) }));
}
function demoSets(cards: Record<string, PloegCard>): void {
  for (const [epicId, childIds] of Object.entries(demoEpics)) demoSet(cards, epicId, childIds);
}
function demoSet(cards: Record<string, PloegCard>, epicId: string, childIds: string[]): void {
  const epic = cards[epicId];
  const children = childIds.map(id => cards[id]);
  const settled = (card: PloegCard) => card.state === 'merged' && Boolean(card.release) && Date.parse(card.release!.at) <= anchor - 30 * 86_400_000;
  const cracked = (card: PloegCard) => card.condition?.cracks.some(crack => !crack.mended?.confirmedAt) ?? false;
  const complete = children.every(card => settled(card) && !cracked(card));
  const epicRef = { workItemId: epicId, ref: epic.externalRef, title: epic.title };
  epic.set = { role: 'epic', epic: epicRef, position: null, size: children.length, children: children.map(card => ({ workItemId: card.workItemId, title: card.title, state: card.state, settled: settled(card), cracked: cracked(card) })), complete };
  children.forEach((card, index) => { card.set = { role: 'child', epic: epicRef, position: index + 1, size: children.length, children: [], complete }; });
}
const cards: Record<string, PloegCard> = Object.fromEntries(items.map(item => [item.id, demoCard(item)]));
demoSets(cards);

const crackItem = (id: string) => ({ workItemId: id, title: find(id).title, externalRef: find(id).externalId });
const mergedPlay = (id: string) => cards[id].plays.find(play => play.state === 'merged')!;
const cracks: PloegCrack[] = [
  { id: '7101', team: 'delivery', state: 'confirmed', card: crackItem('118'), bug: crackItem('124'), play: mergedPlay('118').number, severity: 'S3', share: 'primary', discovery: 'discovered', steward: 'demo-operator', note: 'Illustrative: the postcode pattern from #11 rejects "1234 AB" with a space, and the form had no case for it.', proposedBy: 'demo-dev', proposedAt: ago(2 * day), confirmedBy: ['demo-dev', 'demo-tester'], confirmedAt: ago(day), disputeUntil: workdaysLater(day, 5), disputed: false, disputedBy: null, disputedAt: null, disputeReason: null, resolvedBy: null, resolvedAt: null, resolution: null, evolvedBy: null, evolvedAt: null, mended: { ...bugMend, reopenedAt: null } },
  { id: '7102', team: 'delivery', state: 'proposed', card: crackItem('121'), bug: crackItem('124'), play: mergedPlay('121').number, severity: 'S4', share: 'contributing', discovery: 'discovered', steward: 'demo-lead', note: 'Illustrative: the unknown-id handler from #14 turns a validation error into a 500 instead of a 422.', proposedBy: 'demo-dev', proposedAt: ago(2 * day - 30), confirmedBy: [], confirmedAt: null, disputeUntil: null, disputed: false, disputedBy: null, disputedAt: null, disputeReason: null, resolvedBy: null, resolvedAt: null, resolution: null, evolvedBy: null, evolvedAt: null, mended: { ...bugMend, reopenedAt: null } },
];
const candidate = (id: string, sharedFiles: number, files: string[]): PloegCrackCandidates['candidates'][number] => {
  const play = mergedPlay(id);
  return { card: crackItem(id), play: play.number, repo: 'example/order-service', mergedAt: play.mergedAt!, mergedBy: play.mergedBy, sharedFiles, share: sharedFiles / 3, files, reverted: false, attribution: cracks.find(entry => entry.card.workItemId === id && entry.bug.workItemId === '124')?.state ?? null };
};
const crackCandidates: Record<string, PloegCrackCandidates> = {
  '124': { bug: crackItem('124'), fixFiles: 3, fixFilesTruncated: false, since: ago(6 * day + 365 * day), until: ago(6 * day), candidates: [
    candidate('118', 2, ['src/shipping/postcode.js', 'test/shipping/postcode.test.js']),
    candidate('121', 1, ['src/orders/errors.js']),
    candidate('120', 1, ['src/orders/errors.js']),
  ] },
};

export const ploegDemo = { teams, items, details, runs, events, summary, cards, cracks, crackCandidates, pageSize: 10 };
