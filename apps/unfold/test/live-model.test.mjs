import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveModel, moveRules, movesOf } from '../public/live/model.js';
import { quietWatch } from '../public/core/run-health.js';
import { runHealthBadge } from '../public/ploeg.js';
import { healthEntry } from '../public/live/stories/shared.js';
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

test('the running Run’s health comes from runHealth over its raw entries, in the badge’s words, and no Run working means no health', () => {
  const running = model('running');
  assert.deepEqual([running.health.health, running.health.label], ['unknown', 'Not known'], 'nothing is off, machine-ended Runs do not count, and without limits its progress cannot be judged, so it is never On track');
  assert.deepEqual(running.health.signals.filter(signal => !signal.judged).map(signal => signal.key).sort(), ['pace', 'quiet', 'time']);
  assert.equal(running.health.reason, 'Nothing is off, but its progress cannot be judged: Ploeg did not report this Run\'s limits');
  assert.deepEqual([model('firstTry').health.health, model('firstTry').health.label, model('firstTry').health.glyph], ['on_track', 'On track', 'check']);
  assert.equal(model('stalled').health.health, 'watch', 'seven quiet minutes of a ten-minute idle stop');
  assert.ok((fixtureNow - model('stalled').calls.lastAt) / 1000 >= quietWatch * 600);
  assert.deepEqual([model('nearBudget').health.health, model('nearBudget').health.deciding], ['off_track', 'budget']);
  assert.deepEqual([model('run305Watch').health.health, model('run305OffTrack').health.health], ['watch', 'off_track']);
  for (const name of ['landed', 'review', 'queued', 'timeoutRetry', 'needsYou']) assert.equal(model(name).health, null, name);
});

test('given the Run row’s server entry, the live view shows exactly that health and its judge history', () => {
  const judge = { id: 'j1', runId: '1', workItemId: '190', at: new Date(fixtureNow - 60000).toISOString(), health: 'off_track', reason: 'It deleted the tests.', evidence: [4], model: 'hetzner-qwen3-8-27b', ploegAskId: 'a1', signalsHealth: 'watch', costUsd: null, costStatus: null };
  const entry = { data: { health: 'watch', combined: { health: 'off_track', source: 'judge' }, reason: 'Nothing new for 6 min; the idle stop is at 10 min', deciding: 'quiet', signals: [{ key: 'quiet', health: 'watch', judged: true, reason: 'Nothing new for 6 min; the idle stop is at 10 min' }], judge, history: [judge], judgeState: 'idle', stale: false, demo: false, asOf: new Date(fixtureNow).toISOString() } };
  const live = model('firstTry', input => ({ ...input, health: entry }));
  assert.deepEqual([live.health.health, live.health.label, live.health.source, live.health.signalsHealth, live.health.deciding], ['off_track', 'Off track', 'judge', 'watch', 'quiet']);
  assert.deepEqual(live.judgements.map(each => [each.id, each.health]), [['j1', 'off_track']]);
  assert.match(liveSentence(live).sub, /^Off track: AI judge \(advisory\): It deleted the tests\.$/);
  assert.match(runHealthBadge({ state: 'running' }, entry, fixtureNow), /Off track<\/span>/, 'the Run row says the same word');
  const unread = model('firstTry', input => ({ ...input, health: { data: null } }));
  assert.equal(unread.health.health, 'on_track', 'an entry not read yet leaves the health to the page’s own facts');
  assert.equal(healthEntry(model('landed')), null);
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

test('AI judge verdicts in the shape the shadow judge stores only raise the health', () => {
  const hijacked = model('hijacked');
  assert.deepEqual(hijacked.judgements.map(entry => [entry.runId, entry.health, entry.evidence.length]), [['1', 'watch', 2], ['1', 'off_track', 4]]);
  assert.deepEqual([hijacked.health.health, hijacked.health.deciding, hijacked.health.source], ['off_track', 'tripwire', 'signals'], 'a high tripwire already says off track');
  assert.match(hijacked.health.reason, /^Tripwire \d+ (s|min) ago: wrote orders for agents into the repository \(and 6 more\)$/);
  const watch = model('judgeDrifting');
  assert.deepEqual([watch.health.health, watch.health.source, watch.health.signalsHealth], ['watch', 'judge', 'on_track']);
  const raised = model('judgeRaises');
  assert.deepEqual([raised.health.health, raised.health.label, raised.health.source, raised.running?.state], ['off_track', 'Off track', 'judge', 'running'], 'the Run keeps running');
  const verdict = (health, minutes = -1, extra = {}) => ({ id: `v${minutes}`, at: new Date(fixtureNow + minutes * 60000).toISOString(), runId: '1', health, reason: 'Left the brief.', evidence: [3], model: 'hetzner-qwen3-8-27b', ...extra });
  const later = model('firstTry', input => ({ ...input, judgements: [verdict('off_track', -2), verdict('on_track', -1)] }));
  assert.equal(later.health.health, 'on_track', 'only the latest verdict counts');
  const lowered = model('nearBudget', input => ({ ...input, judgements: [verdict('on_track')] }));
  assert.deepEqual([lowered.health.health, lowered.health.judge.health, lowered.health.source], ['off_track', 'on_track', 'signals'], 'a judge never lowers');
  const malformed = model('firstTry', input => ({ ...input, judgements: [verdict('abort'), verdict('off_track', -1, { reason: ' ' }), verdict('watch', -1, { evidence: 'seq 3' })] }));
  assert.deepEqual([malformed.judgements, malformed.health.judge, malformed.health.health], [[], null, 'on_track']);
});

test('without the followed Run’s transcript nothing claims silence or counts calls', () => {
  const blind = model('firstTry', input => ({ ...input, transcript: [] }));
  assert.equal(blind.transcriptKnown, false);
  assert.equal(blind.health.signals.find(signal => signal.key === 'quiet').reason, 'Its transcript is still loading');
  assert.deepEqual(blind.health.signals.filter(signal => signal.judged).map(signal => signal.key), ['time', 'budget'], 'only the budget and the time it has run can be judged');
  assert.deepEqual([blind.calls.total, blind.calls.lastAt, blind.edits], [null, null, null]);
  const sentence = liveSentence(blind);
  assert.deepEqual([sentence.head, sentence.sub], ['Builder is working.', 'Loading its calls…']);
  assert.match(standingAnswers(blind).find(answer => answer.id === 'progress').answer, /Loading its calls/);
  assert.doesNotMatch(instruments(blind), /null|0 tool calls/);
  const known = model('firstTry', input => ({ ...input, transcript: [], transcriptKnown: true }));
  assert.deepEqual([known.transcriptKnown, known.calls.total, known.health.signals.find(signal => signal.key === 'quiet').judged], [true, 0, true]);
  const flat = flightLegs(blind).find(leg => leg.kind === 'attempt').hops[0];
  assert.equal(flat.profile, null, 'the live hop cruises flat');
});

test('a transcript the demo or Ploeg cannot give says why, instead of asking to load it', () => {
  const input = scenarios.firstTry.input();
  const demo = liveModel({ ...input, transcript: [], transcriptKnown: false, transcriptMissing: 'demo' });
  assert.equal(demo.health.signals.find(signal => signal.key === 'tripwire').reason, 'The demo records no transcripts');
  assert.match(demo.transcriptMissing, /demo records no transcripts/);
  assert.match(liveModel({ ...input, transcript: [], transcriptKnown: false, transcriptMissing: 'unsupported' }).transcriptMissing, /does not report transcripts/);
  assert.equal(liveModel({ ...input, transcript: [], transcriptKnown: false, transcriptMissing: 'failed' }).transcriptMissing, 'Its calls could not be read.');
  assert.equal(liveModel({ ...input, transcript: [], transcriptKnown: false }).transcriptMissing, 'Loading its calls…');
  assert.equal(liveModel({ ...input, transcriptMissing: 'demo' }).transcriptMissing, null, 'a loaded transcript wins');
  assert.equal(liveModel({ ...scenarios.landed.input(), transcriptKnown: false }).transcriptMissing, null, 'nothing loads when no Run works');
});
