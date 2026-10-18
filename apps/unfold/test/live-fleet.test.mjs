import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearSkies, fleetBoard, fleetHeadline, fleetModel, stageLimit } from '../public/live/fleet.js';
import { fleetAt, fleetScenarios } from '../public/live/fleet-fixtures.js';

const modelOf = name => fleetModel({ ...fleetScenarios[name](), at: fleetAt });

test('each Work Item lands in exactly one place of its Team lane', () => {
  const model = modelOf('rush');
  const { now } = fleetScenarios.rush();
  const placed = model.lanes.flatMap(lane => ['gate', 'air', 'holding', 'approach'].flatMap(stage => lane[stage].map(entry => `${lane.team}:${entry.id}`)));
  assert.equal(new Set(placed).size, placed.length);
  assert.equal(placed.length, now.active.length + now.waiting.length);
  const bronze = model.lanes.find(lane => lane.team === 'bronze');
  assert.deepEqual(bronze.air.map(entry => entry.id), ['301', '302', '308', '309', '310']);
  assert.equal(bronze.air.find(entry => entry.id === '309').seconds, null, 'a leased item without a running Run is between Runs');
  assert.equal(bronze.air.find(entry => entry.id === '302').reads, true);
  assert.deepEqual(model.lanes.find(lane => lane.team === 'pewter').gate.map(entry => entry.proposed), [true]);
});

test('lanes put what needs a person first and park Teams that did not fly', () => {
  const model = modelOf('today');
  assert.deepEqual(model.lanes.map(lane => [lane.team, lane.parked]), [['unfold', false], ['bronze', false], ['copper', false], ['pewter', false], ['silver', true]]);
  assert.equal(model.lanes[0].tone, 'attention');
  assert.equal(model.lanes[0].refused, 1);
  assert.equal(model.lanes[1].tone, 'review');
  assert.equal(modelOf('clear').lanes.every(lane => lane.parked), true);
});

test('totals add up the lanes and the summary, and stay unknown without a summary', () => {
  const model = modelOf('today');
  assert.deepEqual({ ...model.totals }, { teams: 5, flying: 4, gate: 0, air: 0, holding: 2, approach: 1, refused: 1, finished: 34, failed: 17, settledUsd: 1.39, reservedUsd: 0, stuckHolds: 0 });
  const partial = modelOf('partial');
  assert.equal(partial.totals.finished, null);
  assert.equal(partial.totals.settledUsd, null);
  assert.deepEqual(partial.missing, ['recent', 'summary']);
  assert.match(fleetBoard(partial), /Ploeg could not list finished Runs, the 24-hour Team summary/);
});

test('the contrail runs oldest first and tells a machine-ended Run from an agent failure', () => {
  const bronze = modelOf('today').lanes.find(lane => lane.team === 'bronze');
  assert.deepEqual(bronze.trail.map(tick => tick.tone), ['failed', 'success', 'machine', 'neutral', 'machine', 'neutral']);
});

test('the boards list running Runs and queued Work Items oldest first, and finished Runs newest first', () => {
  const model = modelOf('rush');
  assert.ok(model.departures.every((row, index, rows) => index === 0 || (rows[index - 1].at ?? 0) <= (row.at ?? 0)));
  assert.ok(model.arrivals.every((row, index, rows) => index === 0 || (rows[index - 1].at ?? 0) >= (row.at ?? 0)));
  assert.deepEqual(model.departures.filter(row => row.remark.text === 'Queued').map(row => row.workItemId).sort(), ['305', '306', '307']);
  assert.equal(model.departures.find(row => row.workItemId === '302').role, 'reviewer · Round 2');
  assert.deepEqual(model.arrivals.map(row => row.remark.text).slice(0, 3), ['PR opened', 'No change', 'Machine ended it']);
});

test('the headline says what holds first and never invents a count', () => {
  assert.equal(fleetHeadline(modelOf('today')), '2 holding for you and 1 on approach to your review. 4 of 5 Teams flying.');
  assert.equal(fleetHeadline(modelOf('clear')), 'Clear skies. 0 of 2 Teams flying, nothing waits.');
  assert.equal(fleetHeadline(fleetModel({ now: null, at: fleetAt })), 'No Team is in the sky yet.');
});

test('a paper plane floats over the board only under clear skies', () => {
  assert.equal(clearSkies(modelOf('clear')), true);
  assert.match(fleetBoard(modelOf('clear')), /class="fb-cruise"/);
  for (const fleet of ['today', 'rush']) {
    assert.equal(clearSkies(modelOf(fleet)), false);
    assert.doesNotMatch(fleetBoard(modelOf(fleet)), /fb-cruise/);
  }
  assert.equal(clearSkies(fleetModel({ now: null, at: fleetAt })), false);
});

test('a crowded stage links to the rest of its lane in Work', () => {
  const now = fleetScenarios.rush().now;
  const extra = Array.from({ length: stageLimit + 2 }, (_, index) => ({ ...now.waiting[2], id: String(400 + index) }));
  const html = fleetBoard(fleetModel({ now: { ...now, waiting: [...now.waiting, ...extra] }, summary: null, at: fleetAt }));
  assert.match(html, /href="#work\?team=unfold&amp;lane=needs_human">3 more</);
});
