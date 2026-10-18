import assert from 'node:assert/strict';
import { test } from 'node:test';
import { healthStates, healthThresholds, judgeVerdict, runHealth, runHealthMarkup, runHealthReason } from '../public/core/run-health.js';
import { scenarios } from '../public/live/fixtures.js';
import { liveModel } from '../public/live/model.js';

const start = Date.parse('2026-10-17T08:34:05Z');
const iso = ms => new Date(ms).toISOString();
const minutes = n => start + n * 60000;
const limits = { promptSeconds: 5400, idleSeconds: 600, promptStartedAt: iso(start) };
const running = (extra = {}) => ({ id: '305', state: 'running', startedAt: iso(start), authorizedUsd: 1, costStatus: 'observed', usage: { costUsd: 0.1 }, ...extra });
const tool = (at, input = `cmd ${at}`, status = 'completed') => ({ type: 'tool', at: iso(at), title: 'Run', toolKind: 'execute', status, input });
const loaded = items => ({ state: 'loaded', items });
const plan = (done, inProgress = 0, total = 6) => Array.from({ length: total }, (_, index) => ({ content: `Step ${index + 1}`, status: index < done ? 'completed' : index < done + inProgress ? 'in_progress' : 'pending' }));
const health = (input = {}) => runHealth({ run: running(), transcript: loaded([tool(minutes(20) - 20000)]), plan: plan(3), now: minutes(20), limits, ...input });
const signal = (result, id) => result.signals.find(entry => entry.id === id);
const verdict = (value, extra = {}) => ({ health: value, reason: 'It rewrites a module the ticket does not name.', evidence: [41, 42], model: 'qwen-ask', ...extra });

test('the five healths and every threshold are named, frozen constants', () => {
  assert.deepEqual(Object.keys(healthStates), ['on_track', 'watch', 'off_track', 'not_judged', 'not_known']);
  assert.deepEqual(Object.values(healthStates).map(state => [state.label, state.tone, state.glyph]), [['On track', 'success', 'check'], ['Watch', 'attention', 'eye'], ['Off track', 'danger', 'alert'], ['Not judged yet', 'neutral', 'minus'], ['Not known', 'neutral', 'help-circle']]);
  assert.ok(Object.isFrozen(healthStates) && Object.values(healthStates).every(Object.isFrozen) && Object.isFrozen(healthThresholds));
  assert.deepEqual(healthThresholds, { quietWatch: 0.5, quietOff: 0.8, paceWatchAfter: 0.25, paceOffAfter: 0.5, paceOffOverrun: 1.25, timeWatch: 0.75, timeOff: 0.9, budgetWatch: 0.7, budgetOff: 0.9, repeatWindow: 10, repeatWatch: 3, repeatOff: 5, notJudgedFor: 300, judgeReasonMax: 160 });
});

test('state: a pending Run and a finished Run have no health', () => {
  assert.equal(health({ run: running({ state: 'pending', startedAt: null }) }), null);
  assert.equal(health({ run: running({ state: 'finished', outcome: 'pr_opened' }) }), null);
  assert.equal(runHealth({ run: null, now: minutes(1) }), null);
});

test('state: running in its first 5 minutes without a plan is Not judged yet, and a tripwire still speaks', () => {
  const early = health({ now: minutes(4.9), plan: null, transcript: loaded([tool(minutes(4.5))]) });
  assert.deepEqual([early.health, early.label, early.glyph], ['not_judged', 'Not judged yet', 'minus']);
  assert.match(early.reason, /^Starting: health is shown once the agent has a plan or 5 min have passed$/);
  assert.equal(health({ now: minutes(5), plan: null, transcript: loaded([tool(minutes(4.5))]) }).health, 'on_track', 'judged from 5 min');
  assert.equal(health({ now: minutes(2), plan: plan(0, 1), transcript: loaded([tool(minutes(1.9))]) }).health, 'on_track', 'a plan ends the wait');
  const wire = health({ now: minutes(2), plan: null, transcript: loaded([tool(minutes(1.9))]), tripwires: [{ severity: 'high', label: 'Went after credentials', at: minutes(1.9) }] });
  assert.equal(wire.health, 'off_track');
});

test('state: running with a plan and limits reads On track, Watch or Off track and names its numbers', () => {
  const ok = health();
  assert.equal(ok.health, 'on_track');
  assert.match(ok.reason, /^Plan 3 of 6 at 20 min of 90 min · US\$\s?0,10 of US\$\s?1,00 · last activity 20 s ago$/, 'the RFC’s example shape');
  assert.equal(ok.deciding, null);
  const quiet = health({ transcript: loaded([tool(minutes(14), 'sleep 600', 'in_progress')]) });
  assert.deepEqual([quiet.health, quiet.deciding, quiet.reason], ['watch', 'quiet', 'A command has had no output for 6 min; the idle stop is at 10 min']);
  const silent = health({ transcript: loaded([tool(minutes(11.9))]) });
  assert.deepEqual([silent.health, silent.reason], ['off_track', 'Nothing new reached the transcript for 8 min; the idle stop is at 10 min']);
});

test('the signal thresholds sit exactly on their published boundaries', () => {
  const at = (now, extra = {}) => health({ now: minutes(now), transcript: loaded([tool(minutes(now) - 1000)]), ...extra });
  assert.equal(signal(at(67.4, { plan: plan(5, 1) }), 'time').state, 'ok');
  assert.equal(signal(at(67.5, { plan: plan(5, 1) }), 'time').state, 'watch');
  assert.equal(signal(at(81, { plan: plan(5, 1) }), 'time').state, 'watch', 'the last step is in progress, so 90 % is only Watch');
  assert.equal(signal(at(81, { plan: plan(5, 0) }), 'time').state, 'off_track');
  assert.equal(signal(at(22, { plan: plan(1) }), 'pace').state, 'ok', 'before 25 % an overrun is not judged');
  assert.equal(signal(at(23, { plan: plan(1) }), 'pace').state, 'watch');
  assert.equal(signal(at(46, { plan: plan(2, 1) }), 'pace').state, 'watch', 'overrun under 25 % stays Watch after 50 %');
  assert.equal(signal(at(46, { plan: plan(1) }), 'pace').state, 'off_track');
  assert.equal(signal(at(46, { plan: plan(4) }), 'pace').state, 'ok', 'ahead of the clock');
  const quietAt = seconds => signal(health({ transcript: loaded([tool(minutes(20) - seconds * 1000)]) }), 'quiet').state;
  assert.deepEqual([quietAt(299), quietAt(300), quietAt(479), quietAt(480)], ['ok', 'watch', 'watch', 'off_track']);
  const spent = usd => signal(health({ run: running({ usage: { costUsd: usd } }) }), 'budget').state;
  assert.deepEqual([spent(0.69), spent(0.7), spent(0.89), spent(0.9)], ['ok', 'watch', 'watch', 'off_track']);
  const repeated = times => signal(health({ transcript: loaded([...Array.from({ length: 10 - times }, (_, index) => tool(minutes(19) + index * 1000)), ...Array.from({ length: times }, (_, index) => tool(minutes(19.5) + index * 1000, 'npm test'))]) }), 'repeat');
  assert.deepEqual([repeated(2).state, repeated(3).state, repeated(4).state, repeated(5).state], ['ok', 'watch', 'watch', 'off_track']);
  assert.equal(repeated(5).reason, 'The same call ran 5 times in the last 10 calls');
  const old = health({ transcript: loaded([...Array.from({ length: 5 }, (_, index) => tool(minutes(10) + index, 'npm test')), ...Array.from({ length: 10 }, (_, index) => tool(minutes(19) + index * 1000))]) });
  assert.equal(signal(old, 'repeat').state, 'ok', 'only the last ten calls count');
});

test('Run 305: Watch at 09:11 from pace, Watch at 09:17 from quiet, Off track at 09:19 from quiet', () => {
  const at911 = liveModel({ ...scenarios.run305Watch.input(), now: Date.parse('2026-10-17T09:11:30Z') }).health;
  assert.deepEqual([at911.health, at911.deciding], ['watch', 'pace']);
  assert.match(at911.reason, /^Plan 1 of 6 at 37 min of 90 min: at this pace it needs about \d+ min$/);
  const watch = liveModel(scenarios.run305Watch.input()).health;
  assert.deepEqual([watch.health, watch.label, watch.tone, watch.deciding], ['watch', 'Watch', 'attention', 'quiet']);
  assert.equal(watch.reason, 'A command has had no output for 6 min; the idle stop is at 10 min');
  assert.deepEqual(watch.signals.map(entry => [entry.id, entry.state]), [['tripwire', 'ok'], ['quiet', 'watch'], ['time', 'ok'], ['budget', 'ok'], ['pace', 'watch'], ['repeat', 'ok']]);
  const off = liveModel(scenarios.run305OffTrack.input()).health;
  assert.deepEqual([off.health, off.deciding, off.reason], ['off_track', 'quiet', 'A command has had no output for 8 min; the idle stop is at 10 min']);
  assert.ok(signal(off, 'quiet').numbers.share >= healthThresholds.quietOff);
});

test('state: Ploeg sent no limits, so health is the worst of Budget, Repeat and Tripwires, else Not known', () => {
  const ok = health({ limits: null });
  assert.equal(ok.health, 'not_known', 'never On track for lack of evidence (ADR 0046)');
  assert.deepEqual(['quiet', 'time', 'pace'].map(id => [signal(ok, id).state, signal(ok, id).reason]), Array(3).fill(['unknown', 'Ploeg did not report this Run’s limits']));
  assert.match(ok.reason, /Ploeg did not report this Run’s limits/);
  assert.equal(health({ limits: null, run: running({ usage: { costUsd: 0.95 } }) }).health, 'off_track');
  const blind = health({ limits: null, run: running({ costStatus: 'unknown', usage: null }), transcript: { state: 'loading' } });
  assert.deepEqual([blind.health, blind.label, blind.glyph], ['not_known', 'Not known', 'help-circle']);
  assert.equal(blind.reason, 'Its transcript is still loading; Ploeg did not report this Run’s limits; Its cost is not reported yet', 'every reason it could not judge, once');
  assert.equal(health({ run: running({ limits }), limits: undefined }).signals.find(entry => entry.id === 'time').state, 'ok', 'limits default to run.limits');
});

test('state: no transcript (an unsupported harness) judges Time and Budget only', () => {
  const result = health({ transcript: { state: 'unsupported' }, plan: null });
  assert.equal(result.transcript, 'unsupported');
  assert.deepEqual(result.signals.filter(entry => entry.state !== 'unknown').map(entry => entry.id), ['time', 'budget']);
  for (const id of ['quiet', 'pace', 'repeat', 'tripwire']) assert.match(signal(result, id).reason, /^No transcript/, id);
  assert.equal(result.health, 'on_track');
  assert.equal(health({ transcript: null }).transcript, 'none');
  assert.equal(signal(health({ transcript: { state: 'loading' } }), 'quiet').reason, 'Its transcript is still loading');
});

test('state: a failing transcript poll keeps the last health, greyed, never a fresh verdict on stale data', () => {
  const now = minutes(20);
  const items = [tool(minutes(17.5))];
  const fresh = health({ transcript: { state: 'loaded', items, asOf: minutes(18) }, now });
  assert.deepEqual(fresh.stale, { asOf: minutes(18) });
  assert.equal(fresh.health, 'on_track', 'quiet measured at the last good read: 30 s, not 2.5 min');
  assert.match(fresh.reason, / · health as of 2 min ago$/);
  assert.match(runHealthMarkup(fresh), /class="badge sm run-health is-on_track is-stale"/);
  assert.match(runHealthReason(fresh), /class="run-health-reason is-stale"/);
  assert.equal(health({ transcript: { state: 'loaded', items }, now }).stale, null);
});

test('state: unknown cost is never judged, and provisional cost is', () => {
  const unknown = health({ run: running({ costStatus: 'unknown', usage: { costUsd: 0.99 } }) });
  assert.deepEqual([signal(unknown, 'budget').state, signal(unknown, 'budget').reason], ['unknown', 'Its cost is not reported yet']);
  assert.equal(unknown.health, 'on_track', 'never treat unknown spend as zero, nor as spent');
  assert.equal(signal(health({ run: running({ costStatus: 'provisional', usage: { costUsd: 0.75 } }) }), 'budget').state, 'watch');
  assert.equal(signal(health({ run: running({ costStatus: 'settled', usage: { costUsd: 0.95 } }) }), 'budget').state, 'unknown');
  assert.equal(signal(health({ run: running({ authorizedUsd: null }) }), 'budget').state, 'unknown');
});

test('state: the judge may raise the health, never lower it, and never stops anything', () => {
  const raised = health({ judge: verdict('off_track') });
  assert.deepEqual([raised.health, raised.label, raised.judge.raised, raised.judge.model, raised.judge.evidence], ['off_track', 'Off track', true, 'qwen-ask', [41, 42]]);
  assert.match(raised.reason, /^Plan 3 of 6/, 'the signals’ reason stays; the judge has its own line');
  assert.match(runHealthMarkup(raised), /<span class="run-health-ai" aria-hidden="true">AI<\/span><span class="sr-only">, raised by an AI judge<\/span>/);
  assert.match(runHealthReason(raised), /class="run-health-judge"[^>]*><span class="run-health-ai" aria-hidden="true">AI<\/span><span class="sr-only">AI judge, advisory: <\/span>Judge raised this to off track: It rewrites/);
  const offSignals = health({ run: running({ usage: { costUsd: 0.95 } }), judge: verdict('on_track') });
  assert.deepEqual([offSignals.health, offSignals.judge.health, offSignals.judge.raised], ['off_track', 'on_track', false], 'Off track and the judge says On track: the badge stays Off track and shows both');
  assert.match(runHealthReason(offSignals), /Judge said on track; it never lowers the signals/);
  assert.doesNotMatch(runHealthMarkup(offSignals), /run-health-ai/);
  assert.equal(health({ judge: verdict('watch'), run: running({ usage: { costUsd: 0.95 } }) }).health, 'off_track');
  const unknown = health({ limits: null, run: running({ costStatus: 'unknown', usage: null }), transcript: { state: 'loading' }, judge: verdict('on_track') });
  assert.equal(unknown.health, 'not_known', 'a judge’s On track is no evidence for Not known');
  assert.equal(health({ judge: verdict('watch', { runId: '999' }) }).judge, null, 'a verdict for another Run is ignored');
  for (const key of Object.keys(raised)) assert.ok(!/stop|cancel|abort|requeue/i.test(key), key);
});

test('a malformed judge verdict is discarded', () => {
  const bad = [
    null, 'off_track', [], { health: 'abort', reason: 'x', evidence: [] }, verdict('off_course'), verdict('off_track', { reason: '' }),
    verdict('off_track', { reason: 'x'.repeat(161) }), verdict('off_track', { evidence: [1.5] }), verdict('off_track', { evidence: '41' }),
    verdict('off_track', { evidence: [-1] }), verdict('off_track', { action: 'cancel' }), { health: 'off_track', reason: 'No evidence.' },
  ];
  for (const entry of bad) {
    assert.equal(judgeVerdict(entry), null, JSON.stringify(entry));
    const result = health({ judge: entry });
    assert.deepEqual([result.health, result.judge], ['on_track', null], JSON.stringify(entry));
  }
  assert.equal(judgeVerdict(verdict('watch', { reason: 'x'.repeat(160) })).reason.length, 160);
  assert.equal(judgeVerdict(verdict('watch', { model: undefined })).model, 'Judge model');
});

test('state: an Ask refused for a spent allowance pauses the judge and says so; a failed judge is quiet', () => {
  const paused = health({ judge: { refused: 'allowance' } });
  assert.deepEqual([paused.health, paused.judge], ['on_track', null]);
  assert.match(paused.reason, / · judge paused: this month’s allowance is spent$/);
  for (const failed of [{ failed: true }, { timedOut: true }, undefined]) {
    const result = health({ judge: failed });
    assert.equal(result.judge, null);
    assert.doesNotMatch(result.reason, /judge/);
    assert.doesNotMatch(runHealthReason(result), /run-health-judge/);
  }
});

test('state: demo mode computes from demo data, says so, and never shows a judge', () => {
  const demo = health({ transcript: { state: 'demo' }, judge: verdict('off_track'), plan: null });
  assert.deepEqual([demo.transcript, demo.judge, demo.health], ['demo', null, 'on_track']);
  assert.match(demo.reason, / · demo data$/);
  assert.equal(signal(demo, 'quiet').reason, 'The demo records no transcripts');
  assert.match(health({ transcript: { state: 'demo' }, judge: { refused: 'allowance' } }).reason, /^(?!.*judge paused)/);
});

test('Runs a machine ended never count against the running Run', () => {
  const machine = running({ state: 'finished', outcome: 'failed', failureReason: 'infra_node' });
  assert.equal(health({ run: machine }), null);
  const vik2049 = liveModel(scenarios.running.input());
  assert.equal(vik2049.lost.runs, 6);
  assert.equal(vik2049.health.health, 'not_known', 'six machine-ended Runs and a failed, interrupted call do not make it worse; without limits it is Not known, never On track');
  assert.deepEqual(vik2049.health.signals.map(entry => [entry.id, entry.state]), [['tripwire', 'ok'], ['quiet', 'unknown'], ['time', 'unknown'], ['budget', 'ok'], ['pace', 'unknown'], ['repeat', 'ok']]);
});

test('tripwires map to Watch for medium and Off track for high, naming the tripwire and its time', () => {
  const medium = health({ tripwires: [{ severity: 'medium', label: 'Reached for a host outside its brief', at: minutes(19) }] });
  assert.deepEqual([medium.health, medium.deciding], ['watch', 'tripwire']);
  assert.match(medium.reason, /^Tripwire at \d\d:\d\d: reached for a host outside its brief$/);
  const high = health({ tripwires: [{ severity: 'medium', label: 'Changed its own instructions', at: minutes(18) }, { severity: 'high', label: 'Went after credentials', at: minutes(19) }] });
  assert.deepEqual([high.health, high.deciding], ['off_track', 'tripwire']);
  assert.match(high.reason, /^Tripwire at \d\d:\d\d: went after credentials \(and 1 more\)$/);
  assert.deepEqual(signal(high, 'tripwire').numbers, { high: 1, medium: 1 });
  const hijacked = liveModel(scenarios.hijacked.input()).health;
  assert.deepEqual([hijacked.health, hijacked.deciding], ['off_track', 'tripwire']);
  assert.equal(signal(health({ transcript: { state: 'unsupported' }, tripwires: [] }), 'tripwire').state, 'unknown');
});

test('the badge carries glyph and word, the reason line escapes and lists every signal, and neither uses inline style', () => {
  const states = [health(), health({ transcript: loaded([tool(minutes(14))]) }), health({ transcript: loaded([tool(minutes(11))]) }), health({ now: minutes(1), plan: null }), health({ limits: null, run: running({ costStatus: 'unknown' }), transcript: null })];
  assert.deepEqual(states.map(entry => entry.health), ['on_track', 'watch', 'off_track', 'not_judged', 'not_known']);
  for (const entry of states) {
    const badge = runHealthMarkup(entry);
    assert.match(badge, new RegExp(`^<span class="badge sm run-health is-${entry.health}" data-tone="${entry.tone}" title="[^"]+"><svg[^>]*class="icon[^"]*"[^>]*>.*</svg><span class="sr-only">Health: </span>${entry.label}</span>$`));
    const reason = runHealthReason(entry);
    assert.equal((reason.match(/class="run-health-signal is-/g) ?? []).length, 6);
    assert.doesNotMatch(badge + reason, /\sstyle=/);
  }
  const hostile = health({ judge: verdict('watch', { reason: '<img src=x onerror=alert(1)>' }) });
  assert.doesNotMatch(runHealthReason(hostile) + runHealthMarkup(hostile), /<img/);
  assert.equal(runHealthMarkup(null), '');
  assert.equal(runHealthReason(null), '');
});
