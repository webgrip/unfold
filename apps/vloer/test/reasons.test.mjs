import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detailReason, listReason, parseBudgetReason, parseStuckReason, requeueNote, routingWarning } from '../public/core/reasons.js';
import { ploegDemo } from '../src/ploeg-demo.ts';

const space = ' ';
const shift = closeReason => ({ id: '9', round: 2, branch: 'agent/x', budgetUsd: 3, spentUsd: 2.97, reservedUsd: 0.1, openedAt: '2026-09-30T09:00:00Z', closedAt: '2026-09-30T10:00:00Z', closeReason });
const item = (closeReason, extra = {}) => ({ id: '28', provider: 'vikunja', externalId: '624', state: 'needs_human', title: 'Fix the README', url: 'https://tracker.test/tasks/624', attempts: 1, infraFailures: 0, target: { forge: 'forgejo', owner: 'webgrip', repo: 'glide', baseBranch: 'main' }, latestShift: shift(closeReason), ...extra });
const chip = (closeReason, extra) => listReason(item(closeReason, extra))?.chip;

test('every needs-human close reason code gets a chip, a sentence and an action that ends with re-assigning in the tracker', () => {
  const expected = {
    plan_exhausted: 'No pull request or changes unresolved',
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

test('an unknown, missing or still-open reason says stopped and points at the details', () => {
  assert.equal(chip('Illustrative escalation to a human reviewer.'), 'Stopped; open for details');
  assert.equal(listReason(item('Illustrative escalation to a human reviewer.')).sentence, 'Ploeg recorded: “Illustrative escalation to a human reviewer.”.');
  assert.equal(listReason(item('', { latestShift: null })).chip, 'Stopped; open for details');
  assert.equal(listReason(item('', { latestShift: null })).sentence, 'Ploeg stopped this Work Item without a reason Vloer recognises.');
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
  assert.equal(listReason(unrouted).chip, 'No pull request or changes unresolved');
  assert.deepEqual([routingWarning(unrouted).chip, routingWarning(unrouted).tone], ['Not routed', 'attention']);
  assert.equal(routingWarning(item('plan_exhausted')), null);
  assert.equal(routingWarning(item('plan_exhausted', { target: null, provider: 'manual' })), null);
  assert.equal(routingWarning({ id: '1', state: 'needs_human' }), null, 'a Now item without the target field has no warning');
  assert.equal(routingWarning({ id: '2', state: 'queued', target: null, provider: 'demo' }).chip, 'Not routed');
  assert.match(requeueNote, /proposed Ploeg work/);
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

test('the demo’s free-text escalation with a stuck reviewer reads as a stuck agent with its reason', () => {
  const reason = detailReason(ploegDemo.details['101']);
  assert.equal(reason.chip, 'Agent is stuck');
  assert.equal(reason.sentence, 'The reviewer reported that it cannot finish in Round 1 without a person.');
  assert.equal(reason.run.text, 'The acceptance criteria need a human decision.');
  assert.equal(reason.requeue, 'Then assign the task to the Team again in its tracker.');
  assert.equal(listReason(ploegDemo.details['101'].item).chip, 'Stopped; open for details');
});
