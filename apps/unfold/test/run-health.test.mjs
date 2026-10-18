import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budgetOffTrack, budgetWatch, combineHealth, healthMeta, healthSignals, healthStates, paceOffTrackAfter, paceOffTrackOverrun, paceWatchAfter, quietOffTrack, quietWatch, recentToolCalls, repeatOffTrack, repeatWatch, repeatWindow, runHealth, startupSeconds, timeOffTrack, timeWatch } from '../public/core/run-health.js';
import { tones } from '../public/core/states.js';
import { money } from '../public/core/format.js';
import { icons } from '../public/core/icons.js';

const started = '2026-10-17T08:34:05Z';
const limits = { promptSeconds: 5400, idleSeconds: 600, promptStartedAt: started };
const at = text => Date.parse(`2026-10-17T${text}Z`);
const run = (overrides = {}) => ({ id: '305', state: 'running', startedAt: started, authorizedUsd: 1, costStatus: 'observed', usage: { costUsd: 0.1 }, limits, ...overrides });
const plan = (seq, time, statuses) => ({ seq, at: `2026-10-17T${time}Z`, kind: 'plan', plan: statuses.map((status, index) => ({ content: `step ${index + 1}`, status })) });
const call = (seq, time, input, status = 'completed', id = `call-${seq}`) => ({ seq, at: `2026-10-17T${time}Z`, kind: 'tool_call', toolCallId: id, toolKind: 'execute', status, input });
const signalOf = (result, key) => result.signals.find(entry => entry.key === key);

const run305 = [
  plan(10, '08:37:00', ['in_progress', 'pending', 'pending', 'pending', 'pending', 'pending']),
  call(20, '08:40:00', 'go test ./brain-eval/...'),
  call(30, '09:05:00', 'go test ./brain-eval/... -run Distill'),
  plan(40, '09:10:40', ['completed', 'in_progress', 'pending', 'pending', 'pending', 'pending']),
  call(41, '09:10:50', 'scripts/distill-mutation.sh', 'in_progress'),
];

test('the thresholds are the RFC-0007 constants, each named once', () => {
  assert.deepEqual([quietWatch, quietOffTrack], [0.5, 0.8]);
  assert.deepEqual([paceWatchAfter, paceOffTrackAfter, paceOffTrackOverrun], [0.25, 0.5, 0.25]);
  assert.deepEqual([timeWatch, timeOffTrack], [0.75, 0.9]);
  assert.deepEqual([budgetWatch, budgetOffTrack], [0.7, 0.9]);
  assert.deepEqual([repeatWindow, repeatWatch, repeatOffTrack], [10, 3, 5]);
  assert.equal(startupSeconds, 300);
  assert.deepEqual(healthSignals, ['quiet', 'pace', 'time', 'budget', 'repeat']);
});

test('every health has a label, an existing tone and a known glyph, so it is never colour alone', () => {
  assert.deepEqual(Object.keys(healthStates), ['on_track', 'watch', 'off_track', 'not_yet', 'unknown']);
  assert.deepEqual(Object.values(healthStates).map(meta => [meta.label, meta.tone, meta.glyph]), [['On track', 'success', 'check'], ['Watch', 'attention', 'eye'], ['Off track', 'danger', 'alert'], ['Not judged yet', 'neutral', 'minus'], ['Not known', 'neutral', 'help-circle']]);
  for (const meta of Object.values(healthStates)) { assert(tones.includes(meta.tone)); assert(Object.hasOwn(icons, meta.glyph), meta.glyph); }
  assert.equal(healthMeta('nonsense').key, 'unknown');
});

test('Run 305: Watch from 09:11 on pace, Watch on quiet at 09:16, Off track on quiet before the 09:19 stop', () => {
  const early = runHealth({ run: run(), entries: run305.slice(0, 2), now: at('08:40:30') });
  assert.equal(early.health, 'on_track', 'before a quarter of the limit, pace is not judged');
  const watch = runHealth({ run: run(), entries: run305, now: at('09:11:00') });
  assert.equal(watch.health, 'watch');
  assert.equal(watch.deciding, 'pace');
  assert.equal(watch.reason, 'Plan 1 of 6 at 37 of 90 min: at this pace it runs past the time limit');
  const quiet = runHealth({ run: run(), entries: run305, now: at('09:16:00') });
  assert.equal(quiet.health, 'watch');
  assert.equal(signalOf(quiet, 'quiet').health, 'watch');
  assert.equal(signalOf(quiet, 'quiet').reason, 'A command has had no output for 5 min; the idle stop is at 10 min');
  const off = runHealth({ run: run(), entries: run305, now: at('09:18:50') });
  assert.equal(off.health, 'off_track');
  assert.equal(off.deciding, 'quiet');
  assert.match(off.reason, /^A command has had no output for 8 min; the idle stop is at 10 min$/);
});

test('pending and finished Runs have no health: their state badge or outcome speaks instead', () => {
  assert.deepEqual(runHealth({ run: run({ state: 'pending', startedAt: null, limits: undefined }), entries: [], now: at('08:30:00') }), { health: null, signals: [], deciding: null, reason: '' });
  assert.equal(runHealth({ run: run({ state: 'finished' }), entries: run305, now: at('09:30:00') }).health, null);
});

test('running, first 5 min with no plan: Not judged yet, avoiding an early false Watch', () => {
  const result = runHealth({ run: run(), entries: [call(1, '08:34:30', 'ls')], now: at('08:38:00') });
  assert.equal(result.health, 'not_yet');
  assert.equal(result.reason, healthStates.not_yet.example);
  const planned = runHealth({ run: run(), entries: [plan(1, '08:35:00', ['in_progress', 'pending'])], now: at('08:38:00') });
  assert.equal(planned.health, 'on_track', 'a plan ends the start-up grace');
  const after = runHealth({ run: run(), entries: [call(1, '08:39:00', 'ls')], now: at('08:39:30') });
  assert.notEqual(after.health, 'not_yet', 'five minutes end it too');
  const spent = runHealth({ run: run({ usage: { costUsd: 0.95 } }), entries: [], now: at('08:36:00') });
  assert.equal(spent.health, 'off_track', 'an Off track signal still shows in the first five minutes');
});

test('running, plan and limits known: On track names the numbers it used, Watch and Off track name the deciding signal', () => {
  const entries = [plan(1, '08:40:00', ['completed', 'completed', 'completed', 'in_progress', 'pending', 'pending']), call(2, '09:11:45', 'npm test')];
  const ok = runHealth({ run: run({ usage: { costUsd: 0.31 } }), entries, now: at('09:12:05') });
  assert.equal(ok.health, 'on_track');
  assert.equal(ok.deciding, null);
  assert.equal(ok.reason, `Plan 3 of 6 at 38 of 90 min · ${money(0.31)} of ${money(1)} · last activity 20 s ago`);
  const late = runHealth({ run: run(), entries: [plan(1, '09:40:00', ['completed', 'in_progress', 'pending', 'pending', 'pending', 'pending']), call(2, '09:43:30', 'npm test')], now: at('09:44:05') });
  assert.equal(late.health, 'off_track');
  assert.equal(late.deciding, 'pace');
  assert.equal(late.reason, 'Plan 1 of 6 at 70 of 90 min: at this pace the time limit comes first');
  const time = runHealth({ run: run(), entries: [plan(1, '09:30:00', ['completed', 'completed', 'completed', 'completed', 'completed', 'pending']), call(2, '09:44:30', 'npm test')], now: at('09:45:00') });
  assert.equal(signalOf(time, 'time').health, 'watch');
  assert.equal(time.health, 'watch');
  const wall = runHealth({ run: run(), entries: [plan(1, '09:30:00', ['completed', 'completed', 'completed', 'completed', 'completed', 'pending']), call(2, '10:56:00', 'npm test')], now: at('10:56:30') });
  assert.equal(signalOf(wall, 'time').health, 'off_track');
  const finishing = runHealth({ run: run(), entries: [plan(1, '09:30:00', ['completed', 'completed', 'completed', 'completed', 'completed', 'in_progress']), call(2, '10:56:00', 'npm test')], now: at('10:56:30') });
  assert.equal(signalOf(finishing, 'time').health, 'watch', 'the last step in progress keeps Time at Watch');
});

test('budget: Watch from 70 %, Off track from 90 %, and only for observed or provisional cost', () => {
  const entries = [plan(1, '08:40:00', ['in_progress', 'pending']), call(2, '08:44:00', 'ls')];
  const read = (usd, costStatus = 'observed') => signalOf(runHealth({ run: run({ usage: { costUsd: usd }, costStatus }), entries, now: at('08:44:10') }), 'budget');
  assert.equal(read(0.69).health, 'on_track');
  assert.equal(read(0.7).health, 'watch');
  assert.equal(read(0.9, 'provisional').health, 'off_track');
  assert.equal(read(0.95, 'settled').health, 'unknown');
});

test('running, cost unknown: Budget is not judged, never read as zero', () => {
  const result = runHealth({ run: run({ costStatus: 'unknown', usage: null }), entries: [plan(1, '08:40:00', ['in_progress', 'pending']), call(2, '08:44:00', 'ls')], now: at('08:44:10') });
  const budget = signalOf(result, 'budget');
  assert.deepEqual([budget.health, budget.judged, budget.reason], ['unknown', false, 'cost not known yet']);
  assert.equal(result.health, 'on_track', 'the other signals still judge');
});

test('repeat: three identical inputs in the last ten tool calls is Watch, five is Off track', () => {
  const calls = count => [plan(1, '08:40:00', ['in_progress', 'pending']), ...Array.from({ length: count }, (_, index) => call(10 + index, '08:44:00', 'go test ./...')), call(30, '08:44:01', 'git status')];
  const read = count => signalOf(runHealth({ run: run(), entries: calls(count), now: at('08:44:10') }), 'repeat');
  assert.equal(read(2).health, 'on_track');
  assert.equal(read(3).health, 'watch');
  assert.equal(read(5).health, 'off_track');
  assert.equal(read(5).reason, 'The same command ran 5 times in the last 10 tool calls');
  const updates = [call(1, '08:44:00', 'go test', 'pending', 'one'), call(2, '08:44:01', '', 'in_progress', 'one'), call(3, '08:44:02', '', 'completed', 'one')];
  assert.equal(recentToolCalls(updates).length, 1, 'updates of one tool call count once');
  const old = [...Array.from({ length: 5 }, (_, index) => call(index + 1, '08:40:00', 'go test')), ...Array.from({ length: 10 }, (_, index) => call(index + 10, '08:41:00', `step ${index}`))];
  assert.equal(signalOf(runHealth({ run: run(), entries: [plan(0, '08:39:00', ['in_progress']), ...old], now: at('08:41:10') }), 'repeat').health, 'on_track', 'only the last ten count');
});

test('running, Ploeg sent no limits: worst of Budget and Repeat, else Not known', () => {
  const entries = [plan(1, '08:40:00', ['in_progress', 'pending']), call(2, '08:44:00', 'ls')];
  const none = runHealth({ run: run({ limits: undefined, costStatus: 'unknown', usage: null }), entries, now: at('08:50:00') });
  assert.equal(none.health, 'unknown');
  assert.equal(none.reason, 'Ploeg did not report this Run\'s limits');
  for (const key of ['quiet', 'pace', 'time']) assert.equal(signalOf(none, key).reason, 'Ploeg did not report this Run\'s limits');
  const budget = runHealth({ run: run({ limits: undefined, usage: { costUsd: 0.75 } }), entries, now: at('08:50:00') });
  assert.equal(budget.health, 'watch');
  assert.equal(budget.deciding, 'budget');
  const calm = runHealth({ run: run({ limits: undefined, usage: { costUsd: 0.2 } }), entries, now: at('08:50:00') });
  assert.equal(calm.health, 'on_track', 'Budget is evidence');
  const broken = runHealth({ run: run({ limits: { promptSeconds: 5400, idleSeconds: 600, promptStartedAt: 'yesterday' }, costStatus: 'unknown', usage: null }), entries, now: at('08:50:00') });
  assert.equal(broken.health, 'unknown', 'an unreadable start time is no limits');
});

test('running, transcript unavailable: Time and Budget only; Quiet, Pace and Repeat say no transcript', () => {
  const result = runHealth({ run: run(), entries: [], transcriptAvailable: false, now: at('09:50:00') });
  for (const key of ['quiet', 'pace', 'repeat']) assert.deepEqual([signalOf(result, key).health, signalOf(result, key).reason], ['unknown', 'no transcript']);
  assert.equal(signalOf(result, 'time').health, 'watch');
  assert.equal(result.health, 'watch');
  const bare = runHealth({ run: run({ costStatus: 'unknown', usage: null, limits: undefined }), entries: [], transcriptAvailable: false, now: at('09:50:00') });
  assert.equal(bare.health, 'unknown');
});

test('running, transcript poll failing: the last health comes back marked stale and is never re-judged', () => {
  const last = runHealth({ run: run(), entries: run305, now: at('09:11:00') });
  const stale = runHealth({ run: run(), entries: [], now: at('09:30:00'), stale: last });
  assert.equal(stale.stale, true);
  assert.equal(stale.health, 'watch');
  assert.equal(stale.reason, last.reason);
});

test('the judge raises the badge and never lowers it', () => {
  assert.deepEqual(combineHealth({ health: 'off_track' }, { health: 'on_track' }), { health: 'off_track', source: 'signals' });
  assert.deepEqual(combineHealth({ health: 'watch' }, { health: 'on_track' }), { health: 'watch', source: 'signals' });
  assert.deepEqual(combineHealth({ health: 'on_track' }, { health: 'watch' }), { health: 'watch', source: 'judge' });
  assert.deepEqual(combineHealth({ health: 'watch' }, { health: 'off_track' }), { health: 'off_track', source: 'judge' });
  assert.deepEqual(combineHealth({ health: 'unknown' }, { health: 'on_track' }), { health: 'unknown', source: 'signals' });
  assert.deepEqual(combineHealth({ health: 'not_yet' }, { health: 'watch' }), { health: 'watch', source: 'judge' });
  assert.deepEqual(combineHealth({ health: 'on_track' }, null), { health: 'on_track', source: 'signals' });
  assert.deepEqual(combineHealth({ health: 'on_track' }, { health: 'great' }), { health: 'on_track', source: 'signals' });
});

test('limits with a +02:00 offset read the same instant as UTC', () => {
  const offset = runHealth({ run: run({ limits: { ...limits, promptStartedAt: '2026-10-17T10:34:05+02:00' } }), entries: run305, now: at('09:11:00') });
  assert.equal(offset.reason, 'Plan 1 of 6 at 37 of 90 min: at this pace it runs past the time limit');
});
