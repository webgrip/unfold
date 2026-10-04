import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canHandOff, canTakeBack, currentWorkItem, ploegChangeFailure, ploegSituation } from '../public/views/tasks.js';

const open = { status: 'open' };
const teams = [{ id: 'bronze', assignee: 'bronze', queueDepth: 0, paused: null, roles: ['builder', 'reviewer'] }];
const status = (overrides = {}) => ({ available: true, demo: false, handoff: { allowed: true }, teams, assignedTeams: [], workItems: [], fetchedAt: '2026-09-30T12:00:00Z', ...overrides });
const item = (state, extra = {}) => ({ id: '42', team: 'bronze', state, attempts: 1, updatedAt: '2026-09-30T11:00:00Z', ...extra });

test('a task Ploeg has never seen is not with Ploeg yet and offers a hand-off, not a warning', () => {
  const idle = status();
  assert.deepEqual(ploegSituation(idle, open), { tone: 'neutral', headline: 'Not with Ploeg yet.', next: 'Choose a team to hand it over. Ploeg works on a branch and opens a pull request for your review; nothing merges without you.' });
  assert.equal(canHandOff(idle, open), true);
  assert.equal(canTakeBack(idle), false);
});

test('a refused hand-off leaves the headline without a next step, so the card shows only the reason', () => {
  const viewer = status({ handoff: { allowed: false, reason: 'Viewers cannot hand tasks to Ploeg.' } });
  assert.equal(canHandOff(viewer, open), false);
  assert.equal(ploegSituation(viewer, open).next, '');
  assert.equal(canHandOff(status({ teams: [] }), open), false, 'no team to offer');
  assert.equal(canHandOff(status(), { status: 'closed' }), false, 'a closed task');
  assert.equal(ploegSituation(status(), { status: 'closed' }).headline, 'This task is closed in the tracker.');
});

test('an assignment Ploeg has not listed yet can be taken back and is not offered again', () => {
  const assigned = status({ assignedTeams: ['bronze'] });
  assert.equal(ploegSituation(assigned, open).headline, 'Assigned to bronze. Waiting for Ploeg to queue it.');
  assert.equal(canHandOff(assigned, open), false);
  assert.equal(canTakeBack(assigned), true);
});

test('live work reads in the shared vocabulary, and take-back stops once Ploeg has started', () => {
  const queued = status({ assignedTeams: ['bronze'], workItems: [item('queued')] });
  assert.equal(ploegSituation(queued, open).headline, 'Queued for team bronze.');
  assert.equal(canTakeBack(queued), true);
  const running = status({ assignedTeams: ['bronze'], workItems: [item('leased')] });
  assert.deepEqual(ploegSituation(running, open), { tone: 'live', headline: 'Running in team bronze.', next: 'Follow its Runs on the Work Item page.' });
  assert.equal(canTakeBack(running), false);
  assert.equal(canHandOff(running, open), false);
  assert.equal(ploegSituation(status({ workItems: [item('awaiting_review')] }), open).tone, 'review');
  assert.equal(ploegSituation(status({ workItems: [item('needs_human')] }), open).headline, 'Needs you: team bronze stopped.');
});

test('the current Work Item is the one still in progress, and settled work can be handed over again', () => {
  const history = status({ workItems: [item('done', { id: '7' }), item('queued', { id: '9' })] });
  assert.equal(currentWorkItem(history).id, '9');
  const done = status({ workItems: [item('done')] });
  assert.equal(ploegSituation(done, open).headline, 'Done by team bronze.');
  assert.equal(canHandOff(done, open), true);
  assert.equal(ploegSituation(status({ workItems: [item('withdrawn')] }), open).headline, 'Withdrawn from team bronze.');
  assert.equal(ploegSituation(status({ workItems: [item('stale')] }), open).tone, 'severe');
});

test('an unavailable Ploeg says so and offers nothing', () => {
  const down = { available: false, message: 'Ploeg could not be reached.', demo: false, handoff: { allowed: false, reason: 'Ploeg could not be reached.' }, teams: [], assignedTeams: [], workItems: [], fetchedAt: '2026-09-30T12:00:00Z' };
  assert.deepEqual(ploegSituation(down, open), { tone: 'neutral', headline: 'Ploeg could not be reached.', next: '' });
  assert.equal(canHandOff(down, open), false);
  assert.equal(canTakeBack(down), false);
});

test('headlines lead with the shared Work Item state words', () => {
  assert.equal(ploegSituation(status({ workItems: [item('ingested')] }), open).headline, 'Received by team bronze.');
  assert.equal(ploegSituation(status({ workItems: [item('awaiting_review')] }), open).headline, 'Ready for your review.');
  assert.equal(ploegSituation(status({ workItems: [item('stale')] }), open).headline, 'Stopped retrying in team bronze.');
});

test('a tracker token that may not write names itself and the fix, and never reads as a hand-off', () => {
  const message = 'The workbench’s Vikunja token may not change this task. Give it permission to add and remove task assignees and to add task comments, then try again.';
  const failure = ploegChangeFailure({ code: 'task_write_forbidden', message });
  assert.equal(failure.title, 'The Unfold token cannot change this task’s assignees');
  assert.match(failure.body, /^Nothing changed on the task\./);
  assert.match(failure.body, /permission to add and remove task assignees/);
  assert.doesNotMatch(`${failure.title} ${failure.body}`, /handed to|queued|done/i);
  const idle = status();
  assert.equal(ploegSituation(idle, open).headline, 'Not with Ploeg yet.', 'the card keeps the status Ploeg last reported');
  assert.deepEqual(ploegChangeFailure({ code: 'task_changed', message: 'The task changed.' }), { title: 'Ploeg did not take that change', body: 'The task changed.' });
});
