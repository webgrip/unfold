import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closeReasonLabel, detailReason, listReason, needsYouBlocks, parseBudgetReason, parseStuckReason, routingWarning, withdrawnReason } from '../public/core/reasons.js';
import { ploegDemo } from '../src/ploeg-demo.ts';

const space = ' ';
const shift = closeReason => ({ id: '9', round: 2, branch: 'agent/x', budgetUsd: 3, spentUsd: 2.97, reservedUsd: 0.1, openedAt: '2026-09-30T09:00:00Z', closedAt: '2026-09-30T10:00:00Z', closeReason });
const item = (closeReason, extra = {}) => ({ id: '28', provider: 'vikunja', externalId: '624', state: 'needs_human', title: 'Fix the README', url: 'https://tracker.test/tasks/624', attempts: 1, infraFailures: 0, target: { forge: 'forgejo', owner: 'webgrip', repo: 'glide', baseBranch: 'main' }, latestShift: shift(closeReason), ...extra });
const chip = (closeReason, extra) => listReason(item(closeReason, extra))?.chip;

test('every needs-human close reason code gets a chip, a sentence and an action that ends with re-assigning in the tracker', () => {
  const expected = {
    plan_exhausted: 'Every Round ran, no result',
    fix_round_cap_reached: 'Reviewer still wants changes',
    budget_exhausted_before_fix_round: 'Budget ran out',
    writing_run_failed_repeatedly: 'Writer kept failing',
    writing_run_killed_repeatedly: 'Cluster kept stopping the writer',
    operator_failed: 'Session failed',
    review_approved: 'Pull request closed',
    'budget exhausted: pool 3.00, spent 2.97, reserved 0.10': 'Budget ran out',
    'run stuck: reviewer round 2': 'Agent is stuck',
    'plan removed from configuration': 'Team plan removed',
  };
  for (const [code, label] of Object.entries(expected)) {
    const reason = listReason(item(code));
    assert.equal(reason.chip, label, code);
    assert(reason.sentence.endsWith('.') || reason.sentence.endsWith('”.'), code);
    assert.equal(reason.tone, 'attention', code);
    assert.equal(reason.requeue, 'Then assign the task to the Team again in Vikunja.', code);
    assert(reason.action.startsWith(reason.fix) && reason.action.endsWith(reason.requeue), code);
    assert.equal(reason.trackerUrl, 'https://tracker.test/tasks/624', code);
  }
});

test('plan_exhausted in needs_human names both causes, never "out of attempts"', () => {
  const reason = listReason(item('plan_exhausted'));
  assert.equal(reason.code, 'plan_exhausted');
  assert.equal(reason.sentence, 'Every planned Round ran, but no writer reported a pull request, or the last reviewer asked for changes and this team has no fix rounds.');
  assert.doesNotMatch(`${reason.chip} ${reason.sentence}`, /attempt/i);
});

test('prefixed close reasons are parsed for their numbers and Role', () => {
  assert.deepEqual(parseBudgetReason('budget exhausted: pool 3.00, spent 2.97, reserved 0.10'), { pool: 3, spent: 2.97, reserved: 0.1 });
  assert.deepEqual(parseBudgetReason('budget exhausted'), { pool: null, spent: null, reserved: null });
  assert.equal(listReason(item('budget exhausted: pool 3.00, spent 2.97, reserved 0.10')).sentence, `The Shift’s budget of US$${space}3,00 could not pay for the next Round (spent US$${space}2,97, reserved US$${space}0,10).`);
  assert.equal(listReason(item('budget exhausted: something else')).sentence, 'The Shift’s budget could not pay for the next Round.');
  assert.equal(listReason(item('Budget Exhausted: pool 1')).code, 'budget_exhausted');
  assert.deepEqual(parseStuckReason('run stuck: reviewer round 2'), { role: 'reviewer', round: 2 });
  assert.deepEqual(parseStuckReason('run stuck: implementer'), { role: 'implementer', round: null });
  assert.equal(listReason(item('run stuck: reviewer round 2')).sentence, 'The reviewer reported that it cannot finish in Round 2 without a person.');
  assert.equal(listReason(item('run stuck: ')).sentence, 'An agent reported that it cannot finish without a person.');
});

test('a writer killed by the cluster is explained as not the Work Item’s fault, with the count when known', () => {
  const counted = listReason(item('writing_run_killed_repeatedly', { infraFailures: 10 }));
  assert.equal(counted.sentence, 'Not the Work Item’s fault: the cluster stopped the writer 10 times before it could finish, so the work was never really tried.');
  assert.match(counted.fix, /cluster/);
  assert.match(listReason(item('writing_run_killed_repeatedly')).sentence, /^Not the Work Item’s fault/);
});

test('a free-text reason asks for a decision; a missing or still-open one says stopped and points at the details', () => {
  const recorded = listReason(item('Illustrative escalation to a human reviewer.'));
  assert.deepEqual([recorded.code, recorded.chip], ['unknown', 'Needs a decision'], 'the code stays unknown for callers that branch on it');
  assert.equal(recorded.sentence, 'Ploeg recorded: “Illustrative escalation to a human reviewer.”', 'a quote that ends a sentence is not followed by a second full stop');
  assert.equal(listReason(item('operator asked for help')).sentence, 'Ploeg recorded: “operator asked for help”.');
  assert.equal(recorded.glyph, 'help-circle', 'every reason carries its own glyph');
  assert.equal(listReason(item('budget exhausted: pool 3.00, spent 2.50, reserved 0.40')).glyph, 'coins');
  assert.match(recorded.fix, /decide in the tracker/);
  assert.equal(listReason(item('', { latestShift: null })).chip, 'Stopped; open for details');
  assert.equal(listReason(item('', { latestShift: null })).sentence, 'Ploeg stopped this Work Item without a reason Unfold recognises.');
  assert.equal(listReason(item('', { latestShift: { ...shift(''), closedAt: null } })).code, 'unknown');
  assert.equal(listReason(item('operator abort')).code, 'unknown', 'operator abort is not a real close reason');
});

test('a Now item carries its close reason at the top level, and missing counters are tolerated', () => {
  assert.equal(listReason({ id: '1', state: 'needs_human', closeReason: 'fix_round_cap_reached' }).chip, 'Reviewer still wants changes');
  assert.equal(listReason({ id: '1', state: 'needs_human' }).code, 'unknown');
  assert.equal(listReason({ id: '1', state: 'needs_human', closeReason: 'plan_exhausted' }).requeue, 'Then assign the task to the Team again in its tracker.');
  assert.equal(listReason({ id: '1', state: 'needs_human', closeReason: 'plan_exhausted' }).trackerUrl, '');
});

test('only needs_human and stale items have a reason; stale separates infrastructure from agent failures', () => {
  for (const state of ['awaiting_review', 'queued', 'leased', 'proposed', 'done', 'withdrawn', 'ingested']) assert.equal(listReason(item('plan_exhausted', { state })), null, state);
  assert.equal(listReason(null), null);
  const infra = listReason(item('', { state: 'stale', infraFailures: 10 }));
  assert.deepEqual([infra.code, infra.chip, infra.tone], ['stale_infrastructure', 'Infrastructure kept failing', 'severe']);
  const agents = listReason(item('', { state: 'stale', attempts: 3 }));
  assert.deepEqual([agents.code, agents.chip, agents.tone], ['stale_attempts', 'Agents kept failing', 'severe']);
});

test('an unresolved repository is a secondary Not routed warning, never the primary reason', () => {
  const unrouted = item('plan_exhausted', { target: null });
  assert.equal(listReason(unrouted).chip, 'Every Round ran, no result');
  assert.deepEqual([routingWarning(unrouted).chip, routingWarning(unrouted).tone], ['Not routed', 'attention']);
  assert.equal(routingWarning(unrouted).fix, 'Add a repository label or a routing rule to the task.');
  assert.equal(routingWarning(item('plan_exhausted')), null);
  assert.equal(routingWarning(item('plan_exhausted', { target: null, provider: 'manual' })), null);
  assert.equal(routingWarning({ id: '1', state: 'needs_human' }), null, 'a Now item without the target field has no warning');
  assert.equal(routingWarning({ id: '2', state: 'queued', target: null, provider: 'demo' }).chip, 'Not routed');
});

test('the detail reason uses Ploeg’s own needs-human sentence as the headline and names the stuck Run', () => {
  const detail = {
    item: item('run stuck: reviewer round 2'),
    shifts: [shift('run stuck: reviewer round 2')],
    runs: [
      { id: '41', role: 'reviewer', round: 2, writes: false, outcome: 'stuck', stuckReason: 'The acceptance criteria contradict each other.', summary: '', failureReason: null },
      { id: '40', role: 'reviewer', round: 1, writes: false, outcome: 'stuck', stuckReason: 'Older.', summary: '', failureReason: null },
      { id: '39', role: 'implementer', round: 2, writes: true, outcome: 'pr_opened', stuckReason: '', summary: '', failureReason: null },
    ],
    events: [
      { id: '3', action: 'work_item.needs_human', detail: { reason: 'shift stopped: reviewer is stuck in round 2 — a person should read its reason' } },
      { id: '2', action: 'work_item.needs_human', detail: { reason: 'older' } },
    ],
  };
  const reason = detailReason(detail);
  assert.equal(reason.headline, 'shift stopped: reviewer is stuck in round 2 — a person should read its reason');
  assert.equal(reason.chip, 'Agent is stuck');
  assert.deepEqual(reason.run, { id: '41', role: 'reviewer', round: 2, text: 'The acceptance criteria contradict each other.', failure: null });
  assert.match(reason.action, /assign the task to the Team again in Vikunja\.$/);
});

test('the detail reason shows the failing writer’s failure reason and recognises a pull request closed without merging', () => {
  const failing = {
    item: item('writing_run_failed_repeatedly'), shifts: [],
    runs: [{ id: '7', role: 'implementer', round: 1, writes: true, outcome: 'failed', stuckReason: 'exit status 1: harness crashed', summary: '', failureReason: 'agent_error' }],
    events: [],
  };
  const reason = detailReason(failing);
  assert.equal(reason.headline, null);
  assert.equal(reason.run.text, 'exit status 1: harness crashed');
  assert.equal(reason.run.failure.label, 'The agent harness failed');
  const closed = { item: item('review_approved'), shifts: [], runs: [], events: [{ id: '9', action: 'work_item.needs_human', detail: { reason: 'pull request closed without merging' } }] };
  assert.equal(detailReason(closed).chip, 'Pull request closed');
  assert.equal(detailReason({ item: item('plan_exhausted', { state: 'awaiting_review' }), shifts: [], runs: [], events: [] }), null);
  assert.equal(detailReason(null), null);
});

test('the demo’s free-text escalation keeps the list’s chip and shows the stuck reviewer as its evidence', () => {
  const reason = detailReason(ploegDemo.details['101']);
  assert.equal(reason.chip, 'Needs a decision');
  assert.equal(reason.sentence, 'Ploeg recorded: “Illustrative escalation to a human reviewer.”');
  assert.equal(reason.run.text, 'The acceptance criteria need a human decision.');
  assert.equal(reason.requeue, 'Then assign the task to the Team again in its tracker.');
  assert.equal(listReason(ploegDemo.details['101'].item).chip, 'Needs a decision');
});

test('the detail tells plan_exhausted apart: no pull request when the writer changed nothing, unresolved when the reviewer asked for changes', () => {
  const run = (id, writes, extra) => ({ id, shiftId: '9', role: writes ? 'implementer' : 'reviewer', round: writes ? 1 : 2, writes, state: 'finished', outcome: 'no_change_needed', verdict: '', links: [], stuckReason: '', summary: '', failureReason: null, ...extra });
  const detail = runs => ({ item: item('plan_exhausted'), shifts: [shift('plan_exhausted')], runs, checkpoints: [], events: [{ id: '1', action: 'work_item.needs_human', detail: { reason: 'plan complete; a person is asked to review and merge' } }] });
  const none = detailReason(detail([run('2', false), run('1', true)]));
  assert.deepEqual([none.variant, none.chip, none.headline], ['no_pull_request', 'Every Round ran, no result', null], 'Ploeg’s plan-complete sentence would suggest a merge, so it is not the headline');
  assert.equal(none.sentence, 'Every planned Round ran, but the writer changed nothing, so there is no pull request to review.');
  assert.match(none.action, /^Check that the task says what must change and where\. If the change is already there, close the task\. Then assign/);
  assert.equal(detailReason(detail([run('2', false)])).sentence, 'Every planned Round ran, but no writer ran, so there is no pull request to review.');
  assert.equal(detailReason(detail([run('1', true, { outcome: 'failed' })])).sentence, 'Every planned Round ran, but no writer reported a pull request.');
  const unresolved = detailReason(detail([run('2', false, { verdict: 'request_changes' }), run('1', true, { outcome: 'pr_opened', links: ['https://forge.test/a/b/pulls/3'] })]));
  assert.deepEqual([unresolved.variant, unresolved.chip], ['changes_unresolved', 'Every Round ran, no result']);
  assert.match(unresolved.sentence, /last reviewer still asked for changes/);
  assert.match(unresolved.fix, /reviewer’s findings/);
  const opened = detailReason(detail([run('2', false), run('1', true, { outcome: 'pr_opened' })]));
  assert.deepEqual([opened.variant, opened.chip], [null, 'Every Round ran, no result'], 'with a pull request and no request for changes Unfold does not guess');
});

test('the demo’s budget sentence names the budget but never spend it did not have', () => {
  const text = 'budget exhausted: pool 0.04, spent 0.00, reserved 0.00';
  assert.equal(listReason(item(text), { demo: true }).sentence, `The Shift’s budget of US$${space}0,04 could not pay for the next Round.`);
  assert.match(listReason(item(text)).sentence, /spent US\$/, 'live data keeps the numbers');
  assert.equal(detailReason({ item: item(text), shifts: [shift(text)], runs: [], events: [], demo: true }).sentence, `The Shift’s budget of US$${space}0,04 could not pay for the next Round.`);
});

test('the detail counts the killed writer Runs when the Work Item does not', () => {
  const runs = Array.from({ length: 4 }, (_, index) => ({ id: String(index + 1), shiftId: '9', role: 'implementer', round: 1, writes: true, state: 'finished', outcome: 'failed', failureReason: index % 2 ? 'lease_lost' : 'infra_node', stuckReason: '', summary: '' }));
  const reason = detailReason({ item: item('writing_run_killed_repeatedly'), shifts: [shift('writing_run_killed_repeatedly')], runs, events: [] });
  assert.match(reason.sentence, /stopped the writer 4 times/);
});

test('a Shift close reason reads in a few plain words, never as a raw code', () => {
  assert.equal(closeReasonLabel('plan_exhausted'), 'Every planned Round ran');
  assert.equal(closeReasonLabel('review_approved'), 'An agent reviewer approved');
  assert.equal(closeReasonLabel('review_failed'), 'No agent reviewed it: the reviewer kept failing');
  assert.equal(closeReasonLabel('fix_round_cap_reached'), 'The fix Rounds ran out');
  assert.equal(closeReasonLabel('writing_run_killed_repeatedly'), 'The cluster kept stopping the writer');
  assert.equal(closeReasonLabel('budget exhausted: pool 0.04, spent 0.00, reserved 0.00'), `The US$${space}0,04 budget ran out`);
  assert.equal(closeReasonLabel('budget exhausted'), 'The budget ran out');
  assert.equal(closeReasonLabel('budget exhausted: pool 8.00, spent 0.00, reserved 8.00'), `The US$${space}8,00 budget was held, not spent`);
  assert.equal(closeReasonLabel('run stuck: builder round 2'), 'The builder got stuck in Round 2');
  assert.equal(closeReasonLabel('plan removed from configuration'), 'The Team plan was removed');
  assert.equal(closeReasonLabel(''), 'Still open');
  assert.equal(closeReasonLabel(null), 'Still open');
  assert.equal(closeReasonLabel('Illustrative escalation.'), 'Ploeg recorded: “Illustrative escalation.”');
  assert.equal(withdrawnReason('withdrawn_unassigned'), 'The task was unassigned from the Team.');
  assert.equal(withdrawnReason('withdrawn_by_operator'), 'An operator cancelled it.');
  assert.equal(withdrawnReason('plan_exhausted'), null);
  assert.equal(withdrawnReason(undefined), null);
});

test('every demo Work Item reads with the same reason chip in the lists and on its own page', () => {
  for (const item of ploegDemo.items) {
    const detail = { ...ploegDemo.details[item.id], demo: true };
    const list = listReason(item, { demo: true });
    const page = detailReason(detail);
    assert.equal(page?.chip ?? null, list?.chip ?? null, `${item.id} ${item.externalId}`);
    const now = { ...item, closeReason: item.latestShift?.closeReason || null, latestShift: item.latestShift ? { ...item.latestShift } : null };
    assert.equal(listReason(now, { demo: true })?.chip ?? null, list?.chip ?? null, `${item.id} as a Now row`);
  }
});

test('Needs you groups only reasons that two or more Work Items share, after the flat rows', () => {
  const rows = [item('plan_exhausted', { id: '1' }), item('fix_round_cap_reached', { id: '2' }), item('budget exhausted: pool 1', { id: '3' }), item('run stuck: builder', { id: '4' }), item('budget_exhausted_before_fix_round', { id: '5' }), item('plan_exhausted', { id: '6' }), item('', { id: '7', state: 'stale', attempts: 3 })];
  const blocks = needsYouBlocks(rows);
  assert.deepEqual(blocks.map(block => [block.grouped, block.reason.chip, block.items.map(entry => entry.id)]), [
    [false, 'Reviewer still wants changes', ['2']],
    [false, 'Agent is stuck', ['4']],
    [false, 'Agents kept failing', ['7']],
    [true, 'Every Round ran, no result', ['1', '6']],
    [true, 'Budget ran out', ['3', '5']],
  ]);
  assert.deepEqual(needsYouBlocks(rows.slice(1, 4)).map(block => block.grouped), [false, false, false], 'different reasons stay one flat list');
  assert.deepEqual(needsYouBlocks([]), []);
});

test('a budget stop whose shortfall was only held, not spent, says so and points away from the budget', () => {
  const text = 'budget exhausted: pool 8.00, spent 0.00, reserved 8.00';
  const reason = listReason(item(text));
  assert.equal(reason.code, 'budget_held');
  assert.equal(reason.chip, 'Budget held, not spent');
  assert.equal(reason.sentence, `Ploeg stopped because the Shift’s US$${space}8,00 budget could not pay for the next Round, but nothing was spent. US$${space}8,00 was held for Runs whose spend Ploeg had not settled yet.`);
  assert.match(reason.fix, /Raising the budget does not help/);
  assert.equal(chip('budget exhausted: pool 3.00, spent 2.97, reserved 0.10'), 'Budget ran out', 'real spend stays a budget stop');
  const failedRun = id => ({ id, shiftId: '9', role: 'builder', round: 1, writes: true, state: 'finished', startedAt: '2026-09-28T10:00:00Z', outcome: 'failed', failureReason: 'infra_llm', summary: '', stuckReason: '' });
  const runs = [{ id: '5', shiftId: '9', role: 'builder', round: 1, writes: true, state: 'finished', startedAt: null, summary: 'cancelled: shift closed' }, failedRun('4'), failedRun('3'), failedRun('2'), failedRun('1')];
  const released = { ...shift(text), budgetUsd: 8, spentUsd: 0, reservedUsd: 0 };
  const detailed = detailReason({ item: item(text, { latestShift: released }), shifts: [released], runs, events: [{ id: '1', action: 'work_item.needs_human', detail: { reason: 'the budget could not fund the next round; a person is asked to take over' } }] });
  assert.match(detailed.sentence, /4 Runs failed first: the model gateway failed, which is infrastructure, not the agent\./);
  assert.match(detailed.sentence, new RegExp(`Ploeg has since released that hold, so US\\$${space}8,00 of the budget is free again\\.`));
  assert.equal(detailed.fix, 'Check the gateway keys, quotas and provider status. The budget itself was not the problem.');
  assert.equal(detailed.headline, null, 'Ploeg’s budget sentence only repeats Unfold’s');
  assert.equal(detailed.run.id, '4', 'the evidence is the newest failed writer Run');
  const stillHeld = detailReason({ item: item(text, { latestShift: { ...released, reservedUsd: 8 } }), shifts: [{ ...released, reservedUsd: 8 }], runs, events: [] });
  assert.doesNotMatch(stillHeld.sentence, /released/, 'a hold that is still there is not reported as released');
});

test('Ploeg’s own held-budget close reason reads as held, never as a budget that ran out', () => {
  const text = 'budget held by unsettled runs: pool 8.00, spent 0.00, held 8.00';
  assert.deepEqual(parseBudgetReason(text), { pool: 8, spent: 0, reserved: 8 });
  const reason = listReason(item(text));
  assert.equal(reason.chip, 'Budget held, not spent');
  assert.equal(reason.sentence, `Ploeg stopped because the Shift’s US$${space}8,00 budget is held, not spent: US$${space}8,00 is still held for finished Runs whose spend Ploeg could not settle within a day.`);
  assert.equal(closeReasonLabel(text), `The US$${space}8,00 budget is still held, not spent`);
});

test('a reason code this Unfold does not know is named as unrecognised, never hidden', () => {
  const reason = listReason(item('operator_teleported'));
  assert.deepEqual([reason.code, reason.chip], ['unrecognised', 'Unrecognised: operator_teleported']);
  assert.equal(reason.sentence, 'Ploeg recorded the reason code “operator_teleported”, which this version of Unfold does not recognise.');
  assert.equal(reason.glyph, 'help-circle');
  assert.equal(listReason(item('operator abort')).code, 'unknown', 'free text stays a recorded sentence');
});

test('an open Shift whose needs-human event carries an operator code reads as that code in the detail', () => {
  const open = { ...shift(''), closedAt: null };
  const detail = code => detailReason({ item: item('', { latestShift: open }), shifts: [open], runs: [], events: [{ id: '5', action: 'work_item.needs_human', detail: { reason: code } }] });
  const interrupted = detail('operator_interrupted');
  assert.deepEqual([interrupted.code, interrupted.chip, interrupted.headline], ['operator_interrupted', 'Session interrupted', null]);
  assert.match(interrupted.fix, /deliver work its reviewer approved, run it again, or cancel it/);
  assert.equal(detail('operator_expired').chip, 'Session lost contact');
  assert.equal(detail('operator_paused').chip, 'Session paused');
  assert.equal(detail('operator_waiting_input').chip, 'Session needs an answer');
  assert.deepEqual([detail('operator_vanished').code, detail('operator_vanished').chip], ['unrecognised', 'Unrecognised: operator_vanished']);
  assert.equal(detail('A person should look at this.').headline, 'A person should look at this.', 'free text stays a quoted headline');
});
