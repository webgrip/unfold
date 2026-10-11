import assert from 'node:assert/strict';
import { test } from 'node:test';
import { followDelay, followTarget, handoffTrack, offersNotify, passesFilter, standingBadge, standingFromStatus, taskStandings, trackKey, trackMarkup } from '../public/handoff.js';
import { trackSentence } from '../public/views/tasks.js';

const teams = [{ id: 'bronze', assignee: 'bronze', queueDepth: 3, paused: null, roles: ['builder', 'reviewer'] }];
const status = (overrides = {}) => ({ available: true, demo: false, handoff: { allowed: true }, teams, assignedTeams: [], workItems: [], fetchedAt: '2026-10-11T12:00:00Z', ...overrides });
const item = (state, extra = {}) => ({ id: '186', team: 'bronze', state, attempts: 1, updatedAt: '2026-10-11T11:59:00Z', ...extra });
const steps = track => track.steps.map(step => `${step.label}:${step.state}`);

test('a task nobody handed over has no track, so the card offers the hand-off instead', () => {
  assert.equal(handoffTrack(status()), null);
  assert.equal(handoffTrack({ ...status(), available: false }), null);
  assert.equal(followTarget(status()), null);
  assert.equal(followDelay(status()), null);
});

test('right after the hand-off the track says the baton is passed and Ploeg is picking it up', () => {
  const track = handoffTrack(status({ assignedTeams: ['bronze'] }));
  assert.deepEqual(steps(track), ['Handed over:done', 'Queued:current', 'Running:todo', 'Ready for review:todo']);
  assert.equal(track.steps[0].detail, 'To bronze');
  assert.equal(track.steps[1].detail, 'Waiting for Ploeg to pick up the assignment');
  assert.equal(followTarget(status({ assignedTeams: ['bronze'] })), null, 'nothing to follow before Ploeg lists a Work Item');
  assert.equal(followDelay(status({ assignedTeams: ['bronze'] })), 3000, 'reads quickly while the hand-off is moving');
});

test('a queued task says which worker it waits for and how long the queue is, and links to its Work Item', () => {
  const queued = status({ assignedTeams: ['bronze'], workItems: [item('queued')] });
  const track = handoffTrack(queued);
  assert.equal(track.steps[1].detail, 'Waiting for a bronze worker · 3 in the queue');
  assert.deepEqual(followTarget(queued), { href: '#work/186', label: 'Follow Work Item #186', external: false, icon: 'arrow' });
  const alone = status({ teams: [{ ...teams[0], queueDepth: 1 }], assignedTeams: ['bronze'], workItems: [item('queued')] });
  assert.equal(handoffTrack(alone).steps[1].detail, 'Waiting for a bronze worker');
});

test('running work moves the mark to Running and slows the reads down', () => {
  const running = status({ assignedTeams: ['bronze'], workItems: [item('leased')] });
  const track = handoffTrack(running);
  assert.deepEqual(steps(track), ['Handed over:done', 'Queued:done', 'Running:current', 'Ready for review:todo']);
  assert.equal(track.tone, 'live');
  assert.equal(followDelay(running), 15000);
});

test('the last step names what the work waits for, and following stops once it waits on you', () => {
  const review = status({ workItems: [item('awaiting_review', { prUrl: 'https://forge.test/pulls/9' })] });
  assert.deepEqual(steps(handoffTrack(review)), ['Handed over:done', 'Queued:done', 'Running:done', 'Ready for review:current']);
  assert.equal(handoffTrack(review).tone, 'review');
  assert.equal(followDelay(review), null);
  const stopped = status({ workItems: [item('needs_human')] });
  assert.equal(handoffTrack(stopped).steps[3].label, 'Needs you');
  assert.equal(handoffTrack(stopped).tone, 'attention');
  assert.equal(followTarget(stopped).label, 'Decide on Work Item #186');
  const done = status({ workItems: [item('done')] });
  assert.deepEqual(steps(handoffTrack(done)), ['Handed over:done', 'Queued:done', 'Running:done', 'Done:done']);
  assert.equal(followTarget(done).label, 'Open Work Item #186');
});

test('withdrawn and stopped-retrying work leaves the track to the situation callout', () => {
  assert.equal(handoffTrack(status({ workItems: [item('withdrawn')] })), null);
  assert.equal(handoffTrack(status({ assignedTeams: ['bronze'], workItems: [item('stale')] })), null);
  const again = handoffTrack(status({ assignedTeams: ['bronze'], workItems: [item('withdrawn')] }));
  assert.equal(again.steps[1].state, 'current', 'a task handed over again after a withdrawal is tracked anew');
});

test('the track key changes only when the work moves on', () => {
  const listing = handoffTrack(status({ assignedTeams: ['bronze'] }));
  const queued = handoffTrack(status({ assignedTeams: ['bronze'], workItems: [item('queued')] }));
  const again = handoffTrack(status({ assignedTeams: ['bronze'], workItems: [item('queued', { updatedAt: '2026-10-11T12:01:00Z' })] }));
  assert.notEqual(trackKey(listing), trackKey(queued), 'Ploeg listing the Work Item is a moment worth showing');
  assert.equal(trackKey(queued), trackKey(again), 'a repeated read is not');
  assert.equal(trackKey(null), '');
});

test('the track is an ordered list a screen reader can follow, with the mark on the current step', () => {
  const html = trackMarkup(handoffTrack(status({ workItems: [item('leased')] })), { arrived: true });
  assert.match(html, /^<ol class="handoff-track" id="handoff-track" data-tone="live" data-reached="2" aria-label="Where this task is with Ploeg">/);
  assert.equal(html.match(/aria-current="step"/g).length, 1);
  assert.match(html, /aria-current="step" data-arrived><span class="handoff-dot" aria-hidden="true"><svg class="handoff-mark"/);
  assert.match(html, /Handed over<span class="sr-only">, done<\/span>/);
  assert.match(html, /Running<span class="sr-only">, now<\/span>/);
  assert.match(html, /Ready for review<span class="sr-only">, next<\/span>/);
  assert.doesNotMatch(trackMarkup(handoffTrack(status({ workItems: [item('leased')] }))), /data-arrived/, 'a repeated render does not replay the arrival');
  assert.equal(trackMarkup(null), '');
});

test('the spoken update names the task, the step and what happens next', () => {
  const track = handoffTrack(status({ assignedTeams: ['bronze'], workItems: [item('queued')] }));
  assert.equal(trackSentence({ title: 'Plan the TS 7 route' }, track), '“Plan the TS 7 route”: Queued. Waiting for a bronze worker · 3 in the queue.');
  assert.equal(trackSentence({ title: 'Done one' }, handoffTrack(status({ workItems: [item('done')] }))), '“Done one” is done.');
});

test('each tracker task gets its standing from Now, waiting work first and proposals left out', () => {
  const data = {
    waiting: [{ id: '5', provider: 'vikunja', externalId: '1092', state: 'awaiting_review', team: 'bronze' }, { id: '6', provider: 'vikunja', externalId: '700', state: 'proposed', team: 'bronze' }],
    active: [{ id: '4', provider: 'vikunja', externalId: '1092', state: 'leased', team: 'bronze' }, { id: '7', provider: 'vikunja', externalId: '843', state: 'queued', team: 'silver' }, { id: '8', provider: 'ploeg', externalId: '', state: 'queued', team: 'unfold' }],
    errors: {},
  };
  const standings = taskStandings(data);
  assert.deepEqual([...standings.keys()], ['vikunja:1092', 'vikunja:843']);
  assert.deepEqual(standings.get('vikunja:1092'), { id: '5', state: 'awaiting_review', team: 'bronze' });
  assert.equal(taskStandings({ ...data, errors: { active: 'boom' } }).has('vikunja:843'), false, 'a failed group adds nothing');
  assert.equal(taskStandings(null).size, 0);
});

test('a task’s own status is the freshest standing, including the moment before Ploeg lists it', () => {
  assert.deepEqual(standingFromStatus(status({ assignedTeams: ['bronze'] })), { id: '', state: 'handed', team: 'bronze' });
  assert.deepEqual(standingFromStatus(status({ workItems: [item('queued')] })), { id: '186', state: 'queued', team: 'bronze' });
  assert.equal(standingFromStatus(status({ workItems: [item('done')] })), null);
  assert.equal(standingFromStatus(status()), null);
  assert.match(standingBadge({ state: 'handed', team: 'bronze' }), /Handed to bronze/);
  assert.match(standingBadge({ state: 'leased', team: 'bronze' }), /live-dot[\s\S]*Running/);
  assert.equal(standingBadge(null), '');
});

test('the list filters split tasks into not started and with Ploeg', () => {
  assert.equal(passesFilter('all', null), true);
  assert.equal(passesFilter('idle', null), true);
  assert.equal(passesFilter('idle', { state: 'queued' }), false);
  assert.equal(passesFilter('ploeg', { state: 'queued' }), true);
  assert.equal(passesFilter('ploeg', null), false);
});

test('the notify offer appears only while the work moves, notifications could be turned on, and you did not decline', () => {
  const queued = status({ assignedTeams: ['bronze'], workItems: [item('queued')] });
  assert.equal(offersNotify(queued, 'off', false), true);
  assert.equal(offersNotify(queued, 'on', false), false, 'already on');
  assert.equal(offersNotify(queued, 'denied', false), false, 'the browser blocks it; Preferences explains how to allow it');
  assert.equal(offersNotify(queued, 'unsupported', false), false);
  assert.equal(offersNotify(queued, 'off', true), false, 'Not now is respected');
  assert.equal(offersNotify(status({ workItems: [item('awaiting_review')] }), 'off', false), false, 'nothing left to wait for');
  assert.equal(offersNotify(status(), 'off', false), false, 'not handed over');
});
