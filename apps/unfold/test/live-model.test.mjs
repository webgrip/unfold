import assert from 'node:assert/strict';
import { test } from 'node:test';
import { healthRules, liveModel, movesOf } from '../public/live/model.js';
import { standingAnswers } from '../public/live/answers.js';
import { instruments } from '../public/live/instruments.js';
import { fixtureNow, scenarios } from '../public/live/fixtures.js';
import { liveSentence } from '../public/live/parts.js';
import { flightLegs } from '../public/live/flight-path.js';

const model = (name, change = input => input) => liveModel(change(scenarios[name].input()));

test('VIK-2049 reads as two attempts: six Runs lost to machines, then one builder Run numbered from 1 inside its attempt', () => {
  const live = model('running');
  assert.deepEqual(live.attempts.map(attempt => [attempt.n, attempt.runs.length, attempt.lost]), [[1, 6, 6], [2, 1, 0]]);
  assert.deepEqual([live.running.attempt, live.running.n, live.running.role], [2, 1, 'Builder']);
  assert.deepEqual(live.roles, [{ role: 'Builder', runs: 1 }], 'Runs a machine ended are not Role work');
  assert.deepEqual(live.lost, { runs: 6, agentFailures: 0, seconds: live.time.lost });
});

test('spend is one figure: the total, the latest attempt’s share of it and what that attempt holds', () => {
  const live = model('running');
  assert.deepEqual([live.spend.usd, live.spend.attemptUsd, live.spend.heldUsd, live.spend.share, live.spend.over, live.spend.status], [0.08, 0.08, 1, 0.08, false, 'observed']);
  const landed = model('landed');
  assert.equal(landed.spend.usd, 0.38, 'sums are rounded, never 0.37999…');
  assert.equal(landed.spend.status, 'settled');
  const over = model('nearBudget', input => { input.detail.runs[0].usage.costUsd = 1.2; return input; });
  assert.deepEqual([over.spend.share, over.spend.over], [1, true], 'the gauge clamps and the overrun is flagged');
});

test('a figure Ploeg did not report stays null and reads Not reported, never zero', () => {
  const live = model('unreported');
  assert.deepEqual([live.spend.usd, live.tokens.in, live.tokens.out], [null, null, null]);
  const markup = instruments(live);
  assert.match(markup, /Not reported/);
  assert.doesNotMatch(markup, /US\$\s0,00/);
});

test('agent time is useful time plus time lost to machines, for every scenario', () => {
  for (const [name, scenario] of Object.entries(scenarios)) {
    const live = liveModel(scenario.input());
    assert.equal(Math.round(live.time.agent), Math.round(live.time.useful + live.time.lost), name);
    assert.ok(live.spend.share === null || (live.spend.share >= 0 && live.spend.share <= 1), name);
    assert.equal(live.attempts.flatMap(attempt => attempt.runs).length, live.runs.length, name);
  }
});

test('the health word follows its published thresholds', () => {
  const quietSince = live => (fixtureNow - live.calls.lastAt) / 1000;
  const steady = model('firstTry');
  assert.equal(steady.health.word, 'steady');
  const justBefore = model('firstTry', input => ({ ...input, now: steady.calls.lastAt + (healthRules.stalledAfter - 1) * 1000 }));
  const atLimit = model('firstTry', input => ({ ...input, now: steady.calls.lastAt + healthRules.stalledAfter * 1000 }));
  assert.equal(justBefore.health.word, 'steady');
  assert.equal(atLimit.health.word, 'stalled');
  assert.ok(quietSince(model('stalled')) >= healthRules.stalledAfter);
  assert.equal(model('stalled').health.word, 'stalled');
  assert.equal(model('running').health.word, 'struggling', 'a failed call and an interrupt in ten minutes');
  const expired = model('firstTry', input => { input.detail.item.lease.expiresAt = new Date(fixtureNow - 1000).toISOString(); return input; });
  assert.deepEqual([expired.health.word, expired.health.reason], ['stalled', 'The worker’s lease ran out before it was renewed.']);
  assert.equal(model('landed').health.word, 'idle');
});

test('moves start at a stage, or after a pause without one, and remember trouble', () => {
  const at = seconds => new Date(fixtureNow + seconds * 1000).toISOString();
  const call = (seconds, extra = {}) => ({ type: 'tool', id: `c${seconds}`, at: at(seconds), title: 'Run', toolKind: 'execute', status: 'completed', input: 'ls', paths: [], ...extra });
  const moves = movesOf([
    call(0), call(30), call(30 + healthRules.moveGap + 1, { input: 'C-c' }),
    { type: 'stage', at: at(400), text: 'Write the change' }, call(401, { toolKind: 'edit', status: 'failed' }),
  ], { now: fixtureNow + 500000, live: true });
  assert.deepEqual(moves.map(move => [move.title, move.calls.length, move.trouble, move.live]), [['Run', 2, false, false], ['Run', 1, true, false], ['Write the change', 1, true, true]]);
  assert.deepEqual(moves.map(move => Math.round(move.seconds)), [30 + healthRules.moveGap + 1, 400 - 30 - healthRules.moveGap - 1, 100]);
});

test('the stages say where the Work Item stands and who acts', () => {
  const at = name => Object.fromEntries(model(name).stages.map(stage => [stage.id, [stage.status, stage.tone]]));
  assert.deepEqual(at('queued').wait, ['current', 'neutral']);
  assert.deepEqual(at('running').build, ['current', 'live']);
  assert.deepEqual([at('review').pr[0], at('review').review], ['done', ['current', 'review']]);
  assert.deepEqual(at('needsYou').build, ['current', 'attention']);
  assert.deepEqual(Object.values(at('landed')).map(([status]) => status), ['done', 'done', 'done', 'done', 'done', 'done', 'unknown'], 'production is not tracked, so it is not claimed');
});

test('an estimate appears only when the caller passes one', () => {
  const review = live => standingAnswers(live).find(answer => answer.id === 'review');
  assert.equal(review(model('running')).source, 'none');
  assert.match(review(model('running')).answer, /no estimate/);
  assert.equal(review(model('stress')).source, 'estimate');
  assert.equal(review(model('review')).source, 'record');
});

test('the model is deterministic for the same input and moment', () => {
  for (const name of Object.keys(scenarios)) assert.deepEqual(model(name), model(name), name);
});

test('proposed judge verdicts come from run.judgement events and steer the health word by its published order', () => {
  const hijacked = model('hijacked');
  assert.deepEqual(hijacked.judgements.map(entry => [entry.runId, entry.verdict, entry.proposed]), [['1', 'drifting', true], ['1', 'off_course', true]]);
  assert.equal(hijacked.health.word, 'suspect', 'a high tripwire outranks the judge');
  assert.match(hijacked.health.reason, /crossed a tripwire/);
  assert.equal(model('judgeDrifting').health.word, 'steady', 'drifting then on course leaves a steady Run steady');
  const abort = model('judgeAbort');
  assert.deepEqual([abort.health.word, abort.health.tone], ['suspect', 'danger']);
  assert.match(abort.health.reason, /^A judge model \(proposed\) said abort\. It deleted/);
  const event = (verdict, at = -1) => ({ id: verdict, at: new Date(fixtureNow + at * 60000).toISOString(), action: 'run.judgement', detail: { runId: '1', verdict, reason: 'Left the brief.', judge: 'judge' } });
  const offCourse = model('firstTry', input => ({ ...input, detail: { ...input.detail, events: [event('off_course')] } }));
  assert.deepEqual([offCourse.health.word, offCourse.health.reason], ['struggling', 'A judge model (proposed) said off course. Left the brief.']);
  const later = model('firstTry', input => ({ ...input, detail: { ...input.detail, events: [event('off_course', -2), event('on_course', -1)] } }));
  assert.equal(later.health.word, 'steady', 'only the latest verdict counts');
  const stalled = model('stalled', input => ({ ...input, detail: { ...input.detail, events: [event('off_course')] } }));
  assert.equal(stalled.health.word, 'struggling', 'an off-course verdict outranks silence');
  const unknown = model('firstTry', input => ({ ...input, detail: { ...input.detail, events: [event('maybe'), { action: 'work_item.queued', detail: {} }] } }));
  assert.deepEqual(unknown.judgements, []);
});

test('without the followed Run’s transcript nothing claims silence or counts calls', () => {
  const blind = model('firstTry', input => ({ ...input, transcript: [] }));
  assert.equal(blind.transcriptKnown, false);
  assert.deepEqual(blind.health, { word: 'flying', tone: 'live', reason: 'Its calls are not loaded yet.' });
  assert.deepEqual([blind.calls.total, blind.calls.lastAt, blind.edits], [null, null, null]);
  const late = model('firstTry', input => ({ ...input, transcript: [], now: fixtureNow + 3600000 }));
  assert.equal(late.health.word, 'stalled', 'the lease still speaks: it expired');
  const sentence = liveSentence(blind);
  assert.deepEqual([sentence.head, sentence.sub], ['Builder is working.', 'Open the Run to follow its calls.']);
  assert.match(standingAnswers(blind).find(answer => answer.id === 'progress').answer, /transcript is not loaded/);
  assert.doesNotMatch(instruments(blind), /null|0 tool calls/);
  const known = model('firstTry', input => ({ ...input, transcript: [], transcriptKnown: true }));
  assert.deepEqual([known.transcriptKnown, known.calls.total, known.health.word], [true, 0, 'stalled']);
  const flat = flightLegs(blind).find(leg => leg.kind === 'attempt').hops[0];
  assert.equal(flat.profile, null, 'the live hop cruises flat');
});
