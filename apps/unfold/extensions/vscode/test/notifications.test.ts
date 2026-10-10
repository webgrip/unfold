import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCore } from '../src/core.ts';
import { sessionRows } from '../src/now.ts';
import { NeedsYouNotifier, alertFor, attentionEvent, needsDetail, owned, type NeedsYouDetail } from '../src/notifications.ts';
import type { Recovery, Session } from '../src/types.ts';

const core = await loadCore(new URL('../media/core/', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(readFileSync(new URL('../../../test/fixtures/session-059675b9.json', import.meta.url), 'utf8'));

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1', title: 'Fix rounding', objective: 'Fix it', repositoryId: 'order-service', crewId: 'delivery', runtime: 'opencode',
    ownerId: 'ryan', ownerName: 'Ryan', status: 'running', budgetUsd: 5, spentUsd: 1, costStatus: 'settled', createdAt: '2026-10-10T10:00:00.000Z', updatedAt: '2026-10-10T10:05:00.000Z', branch: 'unfold/s1',
    runs: [{ id: 'r1', roleName: 'Engineer', mode: 'write', status: 'running', startedAt: '2026-10-10T10:01:00.000Z' }],
    artifacts: [],
    ...overrides,
  };
}

const asking = (overrides: Partial<Session> = {}) => session({ status: 'waiting_input', updatedAt: '2026-10-10T10:06:00.000Z', runs: [{ id: 'r1', roleName: 'Engineer', mode: 'write', status: 'waiting_input', startedAt: '2026-10-10T10:01:00.000Z' }], ...overrides });
const reviewable = (overrides: Partial<Session> = {}) => session({ status: 'completed', updatedAt: '2026-10-10T10:20:00.000Z', runs: [{ id: 'r1', roleName: 'Engineer', mode: 'write', status: 'completed' }, { id: 'r2', roleName: 'Reviewer', mode: 'read', status: 'completed', verdict: 'approve' }], ...overrides });
const failed = (overrides: Partial<Session> = {}) => session({ status: 'failed', updatedAt: '2026-10-10T10:30:00.000Z', failure: { category: 'runtime', stage: 'workspace', message: 'The clone failed', remediation: 'Check the repository credentials.', promptAcceptance: 'not_submitted', automaticRetry: false }, ...overrides });
const stopped = fixture.session as Session;
const recovery = (actions: Recovery['actions']): Recovery => ({ sessionId: stopped.id, status: 'interrupted', stranded: true, summary: 'Ploeg released the lease.', review: null, execution: null, actions });
const deliver = { id: 'deliver', label: 'Deliver approved work', method: 'POST', path: '/deliver', available: true };
const noResume = { id: 'resume', label: 'Resume', method: 'POST', path: '/resume', available: false };
const progress = (value: Session, options: { recovery?: Recovery } = {}) => core.sessionProgress(value, { ...options, now: Date.parse('2026-10-10T11:00:00.000Z') });
const rows = (...sessions: Session[]) => sessionRows(core, sessions, Date.parse('2026-10-10T11:00:00.000Z'));

test('a question offers Answer for the open request, and a permission request says what it asks', () => {
  const question = alertFor(asking(), progress(asking()), { request: { id: 'q1', kind: 'question', title: 'Which currency rounding?' } });
  assert.equal(question?.kind, 'question');
  assert.equal(question?.message, 'Fix rounding: asks: Which currency rounding?');
  assert.deepEqual(question?.actions[0], { label: 'Answer', action: 'answer', requestId: 'q1' });
  const permission = alertFor(asking(), progress(asking()), { request: { id: 'p1', kind: 'permission', title: 'Run npm install' } });
  assert.equal(permission?.kind, 'permission');
  assert.equal(permission?.message, 'Fix rounding: asks permission: Run npm install');
  assert.equal(permission?.severity, 'warning');
  const unknown = alertFor(asking(), progress(asking()));
  assert.equal(unknown?.message, 'Fix rounding: Engineer asks you a question', 'without the request it reads the progress headline');
  assert.deepEqual(unknown?.actions[0], { label: 'Answer', action: 'answer' });
});

test('a result ready for review offers Review, and a failure offers Open, both in the progress words', () => {
  const review = alertFor(reviewable(), progress(reviewable()));
  assert.equal(review?.kind, 'review');
  assert.equal(review?.severity, 'information');
  assert.match(review!.message, /^Fix rounding: Ready for your review/);
  assert.deepEqual(review?.actions.map(action => action.label), ['Review', 'Open']);
  assert.equal(review?.actions[0].action, 'view-change');
  const failure = alertFor(failed(), progress(failed()));
  assert.equal(failure?.kind, 'failed');
  assert.equal(failure?.message, 'Fix rounding: Workspace failed: The clone failed');
  assert.deepEqual(failure?.actions.map(action => action.label), ['Open']);
});

test('a stopped session notifies only with a recovery on offer, and leads with Deliver when delivery is offered', () => {
  const offered = alertFor(stopped, progress(stopped), { progress: progress(stopped, { recovery: recovery([deliver, noResume]) }) });
  assert.equal(offered?.kind, 'stopped');
  assert.deepEqual(offered?.actions.map(action => action.label), ['Deliver', 'Open']);
  assert.equal(offered?.actions[0].action, 'deliver');
  const none = alertFor(stopped, progress(stopped), { progress: progress(stopped, { recovery: recovery([noResume]) }) });
  assert.equal(none, undefined, 'a stop nobody can act on from here is not announced; Now still lists it');
  const again = alertFor(stopped, progress(stopped), { progress: progress(stopped, { recovery: recovery([{ id: 'run_again', label: 'Run again', method: 'POST', path: '/run-again', available: true }, noResume]) }) });
  assert.deepEqual(again?.actions.map(action => action.label), ['Open']);
});

test('running, paused and accepted sessions need nobody', () => {
  assert.equal(alertFor(session(), progress(session())), undefined);
  assert.equal(alertFor(session({ status: 'paused' }), progress(session({ status: 'paused' }))), undefined);
  const accepted = reviewable({ review: { decision: 'accepted', by: 'ryan', byName: 'Ryan', at: '2026-10-10T10:40:00.000Z' } });
  assert.equal(alertFor(accepted, progress(accepted)), undefined);
});

test('the first view after a connect is a silent baseline, and each later state change notifies once', () => {
  const notifier = new NeedsYouNotifier(() => true);
  assert.deepEqual(notifier.observe('ryan', rows(session())), [], 'baseline');
  const detail = new Map<string, NeedsYouDetail>([['s1', { request: { id: 'q1', kind: 'question', title: 'Which currency rounding?' } }]]);
  const first = notifier.observe('ryan', rows(asking()), detail);
  assert.deepEqual(first.map(alert => alert.kind), ['question']);
  assert.deepEqual(notifier.observe('ryan', rows(asking()), detail), [], 'the same state on the next poll stays silent');
  assert.deepEqual(notifier.observe('ryan', rows(asking())), [], 'an unchanged row keeps its key even without fetched details');
  const second = notifier.observe('ryan', rows(asking({ updatedAt: '2026-10-10T10:07:00.000Z' })), new Map([['s1', { request: { id: 'q2', kind: 'question', title: 'And the tax?' } }]]));
  assert.deepEqual(second.map(alert => alert.message), ['Fix rounding: asks: And the tax?'], 'a new question in the same phase notifies');
  assert.deepEqual(notifier.observe('ryan', rows(session({ updatedAt: '2026-10-10T10:08:00.000Z' }))), []);
  assert.deepEqual(notifier.observe('ryan', rows(reviewable())).map(alert => alert.kind), ['review']);
  assert.deepEqual(notifier.observe('ryan', rows(reviewable())), []);
});

test('a session that is already waiting at the baseline does not notify, and leaving and returning does', () => {
  const notifier = new NeedsYouNotifier(() => true);
  assert.deepEqual(notifier.observe('ryan', rows(failed())), []);
  assert.deepEqual(notifier.observe('ryan', rows(failed())), []);
  assert.deepEqual(notifier.observe('ryan', rows()), []);
  assert.deepEqual(notifier.observe('ryan', rows(failed())).map(alert => alert.kind), ['failed']);
});

test('only the owner is notified, the setting and the demo silence it, and a reset starts a new baseline', () => {
  let enabled = true;
  const notifier = new NeedsYouNotifier(() => enabled);
  notifier.observe('ryan', rows(session(), session({ id: 's2', ownerId: 'alex' })));
  assert.deepEqual(notifier.observe('ryan', rows(failed(), failed({ id: 's2', ownerId: 'alex' }))).map(alert => alert.sessionId), ['s1']);
  enabled = false;
  assert.deepEqual(notifier.observe('ryan', rows(reviewable())), []);
  enabled = true;
  assert.deepEqual(notifier.observe('ryan', rows(reviewable())), [], 'a state seen while switched off does not notify later');
  assert.deepEqual(notifier.observe('ryan', rows(failed({ updatedAt: '2026-10-10T10:50:00.000Z' })), new Map(), true), [], 'the demo records without notifying');
  notifier.reset();
  assert.deepEqual(notifier.observe('ryan', rows(reviewable({ updatedAt: '2026-10-10T10:55:00.000Z' }))), []);
  assert.equal(owned(session(), ''), false);
});

test('details are fetched only for owned asking and stopped sessions whose state moved', () => {
  const notifier = new NeedsYouNotifier(() => true);
  const all = rows(asking(), { ...stopped }, reviewable({ id: 's3' }), asking({ id: 's4', ownerId: 'alex' }));
  assert.deepEqual(notifier.changed('ryan', all).map(row => row.session.id).sort(), [stopped.id, 's1'].sort());
  assert.equal(all.filter(needsDetail).length, 3);
  notifier.observe('ryan', all);
  assert.deepEqual(notifier.changed('ryan', all), []);
  assert.deepEqual(notifier.changed('ryan', rows(asking({ updatedAt: '2026-10-10T10:09:00.000Z' }))).map(row => row.session.id), ['s1']);
});

test('stream events that can change what a person must do refresh at once; tokens and tools do not', () => {
  for (const type of ['permission', 'session.interrupted', 'session.failed', 'session.completed', 'candidate.ready']) assert.equal(attentionEvent(type), true, type);
  for (const type of ['message', 'tool', 'budget.observed', 'run.started']) assert.equal(attentionEvent(type), false, type);
});

test('the manifest contributes unfold.notifications.needsYou, on by default, and no value at unfold.notifications that would hide it', () => {
  const properties = manifest.contributes.configuration.properties;
  assert.equal(properties['unfold.notifications.needsYou'].type, 'boolean');
  assert.equal(properties['unfold.notifications.needsYou'].default, true);
  assert.deepEqual(properties['unfold.notifications.workItems'].enum, ['all', 'decisions-and-failures', 'none']);
  assert.equal(properties['unfold.notifications'], undefined);
});
