import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveModel } from '../public/live/model.js';
import { flightLegs, hopGeometry } from '../public/live/flight-path.js';
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
