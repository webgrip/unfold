import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveModel, moveRules, movesOf } from '../public/live/model.js';
import { healthThresholds } from '../public/core/run-health.js';
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

test('the running Run’s health comes from runHealth, and no Run working means no health', () => {
  const running = model('running');
  assert.equal(running.health.health, 'not_known', 'nothing is off, machine-ended Runs do not count, and without limits its progress cannot be judged, so it is never On track');
  assert.deepEqual(running.health.signals.filter(signal => signal.state === 'unknown').map(signal => signal.id).sort(), ['pace', 'quiet', 'time']);
  assert.match(running.health.reason, /^Nothing is off, but its progress cannot be judged: Ploeg did not report this Run’s limits/);
  assert.equal(model('stalled').health.health, 'watch', 'seven quiet minutes of a ten-minute idle stop');
  assert.ok((fixtureNow - model('stalled').calls.lastAt) / 1000 >= healthThresholds.quietWatch * 600);
  assert.equal(model('nearBudget').health.health, 'off_track');
  for (const name of ['landed', 'review', 'queued', 'timeoutRetry', 'needsYou']) assert.equal(model(name).health, null, name);
  const given = { health: 'watch', label: 'Watch', tone: 'attention', glyph: 'eye', reason: 'Given.', deciding: 'quiet', signals: [], judge: null, transcript: 'loaded', stale: null };
  assert.equal(model('firstTry', input => ({ ...input, health: given })).health, given, 'a page that computed the health passes it through');
});

test('moves start at a stage, or after a pause without one, and remember trouble', () => {
  const at = seconds => new Date(fixtureNow + seconds * 1000).toISOString();
  const call = (seconds, extra = {}) => ({ type: 'tool', id: `c${seconds}`, at: at(seconds), title: 'Run', toolKind: 'execute', status: 'completed', input: 'ls', paths: [], ...extra });
  const moves = movesOf([
    call(0), call(30), call(30 + moveRules.moveGap + 1, { input: 'C-c' }),
    { type: 'stage', at: at(400), text: 'Write the change' }, call(401, { toolKind: 'edit', status: 'failed' }),
  ], { now: fixtureNow + 500000, live: true });
  assert.deepEqual(moves.map(move => [move.title, move.calls.length, move.trouble, move.live]), [['Run', 2, false, false], ['Run', 1, true, false], ['Write the change', 1, true, true]]);
  assert.deepEqual(moves.map(move => Math.round(move.seconds)), [30 + moveRules.moveGap + 1, 400 - 30 - moveRules.moveGap - 1, 100]);
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

test('proposed AI judge verdicts are Ask answers of one shape that only raise the health', () => {
  const hijacked = model('hijacked');
  assert.deepEqual(hijacked.judgements.map(entry => [entry.runId, entry.health, entry.evidence.length]), [['1', 'watch', 2], ['1', 'off_track', 4]]);
  assert.deepEqual([hijacked.health.health, hijacked.health.deciding, hijacked.health.judge.raised], ['off_track', 'tripwire', false], 'a high tripwire already says off track');
  assert.match(hijacked.health.reason, /^Tripwire at \d\d:\d\d: /);
  const watch = model('judgeDrifting');
  assert.deepEqual([watch.health.health, watch.health.judge.raised], ['watch', true]);
  const raised = model('judgeRaises');
  assert.deepEqual([raised.health.health, raised.health.label, raised.health.judge.raised, raised.running?.state], ['off_track', 'Off track', true, 'running'], 'the Run keeps running');
  const verdict = (health, minutes = -1, extra = {}) => ({ at: new Date(fixtureNow + minutes * 60000).toISOString(), runId: '1', health, reason: 'Left the brief.', evidence: [3], ...extra });
  const later = model('firstTry', input => ({ ...input, judgements: [verdict('off_track', -2), verdict('on_track', -1)] }));
  assert.equal(later.health.health, 'on_track', 'only the latest verdict counts');
  const lowered = model('nearBudget', input => ({ ...input, judgements: [verdict('on_track')] }));
  assert.deepEqual([lowered.health.health, lowered.health.judge.health, lowered.health.judge.raised], ['off_track', 'on_track', false], 'a judge never lowers');
  const malformed = model('firstTry', input => ({ ...input, judgements: [verdict('abort'), verdict('off_track', -1, { reason: 'x'.repeat(161) }), verdict('watch', -1, { evidence: 'seq 3' }), verdict('watch', -1, { stop: true })] }));
  assert.deepEqual([malformed.judgements, malformed.health.judge, malformed.health.health], [[], null, 'on_track']);
});

test('without the followed Run’s transcript nothing claims silence or counts calls', () => {
  const blind = model('firstTry', input => ({ ...input, transcript: [] }));
  assert.equal(blind.transcriptKnown, false);
  assert.equal(blind.health.transcript, 'loading');
  assert.deepEqual(blind.health.signals.filter(signal => signal.state !== 'unknown').map(signal => signal.id), ['time', 'budget'], 'only the budget and the time it has run can be judged');
  assert.deepEqual([blind.calls.total, blind.calls.lastAt, blind.edits], [null, null, null]);
  const sentence = liveSentence(blind);
  assert.deepEqual([sentence.head, sentence.sub], ['Builder is working.', 'Loading its calls…']);
  assert.match(standingAnswers(blind).find(answer => answer.id === 'progress').answer, /Loading its calls/);
  assert.doesNotMatch(instruments(blind), /null|0 tool calls/);
  const known = model('firstTry', input => ({ ...input, transcript: [], transcriptKnown: true }));
  assert.deepEqual([known.transcriptKnown, known.calls.total, known.health.transcript], [true, 0, 'loaded']);
  const flat = flightLegs(blind).find(leg => leg.kind === 'attempt').hops[0];
  assert.equal(flat.profile, null, 'the live hop cruises flat');
});

test('a transcript the demo or Ploeg cannot give says why, instead of asking to load it', () => {
  const input = scenarios.firstTry.input();
  const demo = liveModel({ ...input, transcript: [], transcriptKnown: false, transcriptMissing: 'demo' });
  assert.equal(demo.health.transcript, 'demo');
  assert.match(demo.health.reason, /demo data$/);
  assert.match(demo.transcriptMissing, /demo records no transcripts/);
  assert.match(liveModel({ ...input, transcript: [], transcriptKnown: false, transcriptMissing: 'unsupported' }).transcriptMissing, /does not report transcripts/);
  assert.equal(liveModel({ ...input, transcript: [], transcriptKnown: false }).transcriptMissing, 'Loading its calls…');
  assert.equal(liveModel({ ...input, transcriptMissing: 'demo' }).transcriptMissing, null, 'a loaded transcript wins');
  assert.equal(liveModel({ ...scenarios.landed.input(), transcriptKnown: false }).transcriptMissing, null, 'nothing loads when no Run works');
});
