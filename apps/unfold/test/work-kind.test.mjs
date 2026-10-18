import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workKindMeta, workKindOf, workKinds } from '../public/core/work-kind.js';
import { expectationDefaults, expectationsFor, runWork } from '../public/core/expectations.js';
import { activityTally, tallyCall, tallyCalls } from '../public/core/activity.js';
import { runHealth } from '../public/core/run-health.js';

const writer = { writes: true, round: 1, role: 'builder' };

test('a Run\'s Work Kind comes from its Role, its Round, then its title, and says which rule decided', () => {
  const kind = (title, run = writer) => { const result = workKindOf({ title }, run); return [result.kind, result.source]; };
  assert.deepEqual(kind('docs: link observability.md to the RFC'), ['docs', 'prefix']);
  assert.deepEqual(kind('fix(unfold): keep the failure detail'), ['fix', 'prefix']);
  assert.deepEqual(kind('chore(deps): update node to v24'), ['dependency', 'prefix']);
  assert.deepEqual(kind('ci: the brain test job must finish inside 60 minutes'), ['tests', 'prefix']);
  assert.deepEqual(kind('toolchain: plan the TypeScript 7 route off astro check'), ['research', 'title']);
  assert.deepEqual(kind('unfold: make the agent host grace-period test stable under load'), ['fix', 'title']);
  assert.deepEqual(kind('Say how to run the unit tests in the README'), ['docs', 'title']);
  assert.deepEqual(kind('unfold: carry the session failure detail to Ploeg'), ['feature', 'default']);
  assert.deepEqual(kind('docs: anything', { writes: false, round: 2, role: 'reviewer' }), ['review', 'role']);
  assert.deepEqual(kind('docs: anything', { writes: true, round: 2, role: 'builder' }), ['repair', 'round']);
  assert.match(workKindOf({ title: 'docs: x' }, writer).rule, /^the title starts with docs:$/);
});

test('every Work Kind has a family, a label, a result and defaults; an unknown key reads as Feature', () => {
  assert.deepEqual([...new Set(workKinds.map(entry => entry.family))], ['change', 'chore', 'repair', 'investigate', 'review']);
  for (const entry of workKinds) assert.ok(expectationDefaults[entry.key], entry.key);
  assert.equal(workKindMeta('nonsense').key, 'feature');
  assert.equal(expectationDefaults.review.changes, false);
  assert.equal(expectationDefaults.research.firstChangeMinutes, null);
});

test('a Team pins expectations per Work Kind and the rest stay default', () => {
  const pinned = expectationsFor('docs', { firstChangeMinutes: 4, unknown: 9 });
  assert.deepEqual([pinned.firstChangeMinutes, pinned.readMinutes, pinned.pinned], [4, expectationDefaults.docs.readMinutes, ['firstChangeMinutes']]);
});

test('the tally counts reading since the last change, test, ship or setup, the cycles, and a ship after an untested change', () => {
  const minute = 60_000;
  const tally = tallyCalls([
    { activity: 'orient', at: 0 }, { activity: 'explore', at: 5 * minute }, { activity: 'change', at: 8 * minute },
    { activity: 'verify', at: 9 * minute }, { activity: 'change', at: 10 * minute }, { activity: 'ship', rule: 'git commit', at: 11 * minute },
    { activity: 'ship', rule: 'git push', at: 12 * minute }, { activity: 'explore', at: 13 * minute },
  ]);
  assert.deepEqual([tally.firstChangeAt, tally.cycles, tally.readingSince, tally.unverifiedShip.rule, tally.unverifiedShip.push], [8 * minute, 1, 13 * minute, 'git push', true]);
  assert.deepEqual([tally.calls.change, tally.seconds.explore, tally.seconds.change], [2, 360, 240]);
  assert.equal(tallyCall(activityTally(), { activity: 'nonsense', at: null }).calls.other, 1);
});

const at = minutes => new Date(Date.UTC(2026, 9, 18, 19, 0) + minutes * 60_000).toISOString();
const running = { state: 'running', startedAt: at(0), limits: { promptSeconds: 5400, idleSeconds: 600, promptStartedAt: at(0) } };
const health = (work, minutes, entries = [{ seq: 1, at: at(minutes - 0.2), kind: 'tool_call', toolCallId: 'x', input: 'ls' }]) => runHealth({ run: running, entries, now: Date.parse(at(minutes)), transcriptState: 'loaded', work });
const reading = (item, run, minutes) => runWork(item, run, tallyCalls(Array.from({ length: minutes }, (_, index) => ({ activity: 'explore', at: Date.parse(at(index)) }))));

test('Run 381\'s shape: reading with no change turns Watch, then Off track, by its Work Kind\'s expectations', () => {
  const item = { title: 'unfold: carry the session failure detail to Ploeg' };
  const early = health(reading(item, writer, 10), 10);
  assert.equal(early.health, 'on_track');
  const watch = health(reading(item, writer, 21), 21);
  assert.deepEqual([watch.health, watch.deciding], ['watch', 'first_change']);
  assert.equal(watch.reason, 'No file changed after 21 min; Feature work usually changes one by 20 min (default)');
  const off = health(reading(item, writer, 41), 41);
  assert.deepEqual([off.health, off.deciding], ['off_track', 'first_change']);
  const research = health(reading({ title: 'research: compare harnesses' }, writer, 41), 41);
  assert.equal(research.signals.some(signal => signal.key === 'first_change'), false, 'research is not expected to change files');
  assert.equal(research.health, 'on_track');
});

test('a push after an untested change is Off track, a commit Watch, and a review that changes a file is out of role', () => {
  const minute = 60_000;
  const base = Date.parse(at(0));
  const ship = rule => runWork({ title: 'fix: x' }, writer, tallyCalls([{ activity: 'explore', at: base }, { activity: 'change', at: base + minute }, { activity: 'ship', rule, at: base + 2 * minute }]));
  assert.deepEqual([health(ship('git push'), 3).health, health(ship('git push'), 3).deciding], ['off_track', 'order']);
  assert.equal(health(ship('git commit'), 6).health, 'watch', 'a Watch waits out the first five minutes; an Off track does not');
  const reviewer = runWork({ title: 'docs: x' }, { writes: false, round: 2, role: 'reviewer' }, tallyCalls([{ activity: 'explore', at: base }, { activity: 'change', at: base + minute }]));
  assert.deepEqual([health(reviewer, 6).health, health(reviewer, 6).deciding], ['watch', 'out_of_role']);
  assert.equal(health(reviewer, 6).reason, 'This Review Run changed a file; a review changes none');
});

test('without a transcript or a tally the expectation signals are not listed', () => {
  const work = runWork({ title: 'fix: x' }, writer, activityTally());
  assert.equal(runHealth({ run: running, now: Date.parse(at(30)), transcriptState: 'loading', work }).signals.some(signal => signal.key === 'first_change'), false);
  assert.equal(runHealth({ run: running, entries: [], now: Date.parse(at(30)), transcriptState: 'loaded' }).signals.some(signal => signal.key === 'first_change'), false);
});
