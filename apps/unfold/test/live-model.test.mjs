import assert from 'node:assert/strict';
import { test } from 'node:test';
import { healthRules, liveModel, movesOf } from '../public/live/model.js';
import { standingAnswers } from '../public/live/answers.js';
import { instruments } from '../public/live/instruments.js';
import { fixtureNow, scenarios } from '../public/live/fixtures.js';

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
