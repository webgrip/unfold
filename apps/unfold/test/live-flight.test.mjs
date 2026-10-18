import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveModel } from '../public/live/model.js';
import { flightLegs, flightPath, heightAt, hopGeometry } from '../public/live/flight-path.js';
import { scenarios } from '../public/live/fixtures.js';

const legs = name => flightLegs(liveModel(scenarios[name].input()));
const attempts = list => list.filter(leg => leg.kind === 'attempt').map(leg => leg.hops.map(hop => `${hop.end}${hop.count > 1 ? `×${hop.count}` : ''}`));
const after = list => list.filter(leg => leg.kind === 'approach' || leg.kind === 'stop').map(leg => leg.kind === 'stop' ? `stop:${leg.label}` : leg.mode);
const stations = list => Object.fromEntries(list.filter(leg => leg.kind === 'station').map(leg => [leg.id, `${leg.status}${leg.parked ? ':parked' : ''}`]));

test('VIK-2049: six machine-ended Runs bounce as one burst, then the plane flies the second attempt', () => {
  const list = legs('running');
  assert.deepEqual(attempts(list), [['machine×6'], ['live']]);
  assert.deepEqual(after(list), ['forecast']);
  assert.equal(list.find(leg => leg.kind === 'attempt' && leg.n === 1).tone, 'machine');
});

test('every failure state ends where a person can see it', () => {
  assert.deepEqual([attempts(legs('stalled')), after(legs('stalled'))], [[['holding']], ['forecast']]);
  assert.deepEqual([attempts(legs('needsYou')), after(legs('needsYou'))], [[['failed', 'failed', 'timeout']], ['stop:Needs you']]);
  assert.deepEqual([attempts(legs('overBudget')), after(legs('overBudget'))], [[['budget']], ['stop:Needs you']]);
  assert.deepEqual([attempts(legs('staleMachines')), after(legs('staleMachines'))], [[['machine×10']], ['stop:Stopped retrying']]);
  assert.deepEqual([attempts(legs('withdrawn')), after(legs('withdrawn'))], [[['cancelled']], ['stop:Withdrawn']]);
  assert.deepEqual(Object.values(stations(legs('needsYou'))), ['blocked', 'blocked', 'blocked', 'blocked'], 'nothing ahead is reachable once it stopped');
});

test('a Run waiting for a worker taxis, and its attempt still reads as live', () => {
  const list = legs('timeoutRetry');
  assert.deepEqual([attempts(list), after(list)], [[['timeout', 'pending']], ['taxi']]);
  assert.equal(list.find(leg => leg.kind === 'attempt').tone, 'live');
});

test('the plane parks where the work waits: your review, or merged', () => {
  assert.deepEqual([after(legs('review')), stations(legs('review'))], [['landed'], { pr: 'done', review: 'current:parked', merge: 'next', production: 'next' }]);
  assert.deepEqual(stations(legs('landed')), { pr: 'done', review: 'done', merge: 'done:parked', production: 'unknown' });
  assert.deepEqual([attempts(legs('fixRound')), after(legs('fixRound'))], [[['pr', 'changes', 'live']], ['forecast']], 'a fix round is still in the air');
  const queued = legs('queued');
  assert.equal(queued.find(leg => leg.kind === 'wait').parked, true);
  assert.equal(queued.some(leg => leg.kind === 'attempt' || leg.kind === 'approach'), false);
});

test('a hop ends in the air, on the ground, or as a run of bounces', () => {
  const end = path => path.trim().split(' ').slice(-2).map(Number);
  assert.deepEqual(end(hopGeometry({ from: 'ground', end: 'live', profile: null }).line), [100, 30]);
  assert.deepEqual(end(hopGeometry({ from: 'air', end: 'failed', profile: null }).line), [100, 96]);
  assert.equal((hopGeometry({ from: 'ground', end: 'machine', profile: null, count: 6 }).line.match(/C/g) ?? []).length, 6);
  assert.equal((hopGeometry({ from: 'ground', end: 'machine', profile: null, count: 20 }).line.match(/C/g) ?? []).length, 8, 'bounces are capped');
  assert.equal(hopGeometry({ from: 'ground', end: 'live', profile: [{ level: 1, trouble: true }, { level: 0.5, trouble: false }] }).trouble.startsWith('M'), true);
});

const hopOf = name => legs(name).find(leg => leg.kind === 'attempt').hops[0];
const markup = name => flightPath(liveModel(scenarios[name].input()));

test('tripwire hits stand on the hop at the time of the call, grouped by column, danger when high', () => {
  const hop = hopOf('hijacked');
  assert.deepEqual(hop.marks.wires.map(wire => [wire.bin, wire.signals.length, wire.severity]), [[7, 1, 'high'], [8, 1, 'high'], [9, 2, 'high'], [10, 1, 'high'], [11, 2, 'high']]);
  const html = markup('hijacked');
  assert.equal((html.match(/class="lv-fp-wire is-high lv-fp-at-\d+"/g) ?? []).length, 5);
  assert.equal((html.match(/class="lv-fp-wire-line is-high" d="M[\d.]+ [\d.]+ V8"/g) ?? []).length, 5);
  assert.match(html, /title="2 tripwire hits at [^"]*: went after credentials\. Derived from the transcript\."/);
  assert.match(html, /7 calls crossed a tripwire, 1 blocked\./);
});

test('AI judge verdicts are advisory call signs; the worst is labelled, an off-track verdict marks the hop and nothing stops the Run', () => {
  const hijacked = hopOf('hijacked');
  assert.deepEqual(hijacked.marks.calls.map(call => [call.bin, call.verdict, call.labelled]), [[7, 'watch', false], [12, 'off_track', true]]);
  assert.deepEqual([hijacked.marks.divertedAt, hijacked.marks.calls[1].side], [12, 'end']);
  const html = markup('hijacked');
  assert.match(html, /class="lv-fp-hop [^"]*is-live[^"]* is-diverted"/);
  assert.match(html, /lv-fp-line lv-fp-line-diverted" d="[^"]+" clip-path="url\(#lv-flight-191-2-0-after\)"/);
  assert.match(html, /class="lv-fp-call is-off_track lv-fp-at-12 lv-fp-call-end" title="AI judge \(advisory\) at [^"]*: off track\./);
  assert.match(html, /<span class="lv-fp-call-word">AI · off track<\/span>/);
  assert.match(html, /class="lv-fp-plane is-live is-suspect"/, 'a high tripwire decided the health');
  assert.match(html, /Possible hijack: /);
  assert.match(html, /<span class="lv-fp-wire-chip is-high">.*?7<\/span><span class="lv-fp-call-chip is-off_track">.*?AI · off track<\/span>/, 'the phone log keeps the counts');
  const input = scenarios.hijacked.input();
  const crowded = flightLegs(liveModel({ ...input, judgements: input.judgements.map((entry, index) => index === 0 ? { ...entry, at: new Date(Date.parse(entry.at) + 4.4 * 60000).toISOString() } : entry) })).find(leg => leg.kind === 'attempt').hops[0];
  assert.deepEqual(crowded.marks.calls.map(call => call.labelled), [false, false], 'among tripwire marks, a word that would cover another verdict is left off; its title and the phone chip still say it');
  const raised = hopOf('judgeRaises');
  assert.deepEqual([raised.end, raised.marks.calls.map(call => call.labelled), raised.marks.divertedAt], ['live', [false, true], 6], 'without tripwire marks the word gets its own row, and the Run keeps flying');
  assert.match(markup('judgeRaises'), /class="lv-fp-plane is-live is-off_track"/, 'an Off track the judge raised rings red without the hijack halo');
  assert.deepEqual(after(legs('judgeRaises')), ['forecast']);
  const watch = hopOf('judgeDrifting');
  assert.deepEqual([watch.marks.calls.map(call => `${call.verdict}${call.labelled ? '*' : ''}`), watch.marks.divertedAt], [['on_track', 'watch*'], null]);
  assert.doesNotMatch(markup('judgeDrifting'), /is-diverted|is-suspect/);
  assert.match(markup('judgeDrifting'), /class="lv-fp-plane is-live is-watch"/);
  assert.doesNotMatch(markup('running'), /lv-fp-wire|lv-fp-call|is-diverted|is-suspect|is-watch|is-off_track/, 'a clean flight draws no marks');
});

test('Run 305 holds once a command has been quiet for half the idle stop, and its plane rings by health', () => {
  const watch = legs('run305Watch');
  const off = legs('run305OffTrack');
  assert.deepEqual([attempts(watch), attempts(off)], [[['holding']], [['holding']]]);
  assert.match(markup('run305Watch'), /class="lv-fp-plane is-holding is-watch"/);
  assert.match(markup('run305OffTrack'), /class="lv-fp-plane is-holding is-off_track"/);
});

test('a hop’s height is read off its points so a mark meets its line', () => {
  const { points } = hopGeometry({ from: 'ground', end: 'live', profile: null });
  assert.equal(heightAt(points, 0), 96);
  assert.equal(heightAt(points, 100), 30);
  assert.ok(heightAt(points, 11) < 96 && heightAt(points, 11) > 30);
});
