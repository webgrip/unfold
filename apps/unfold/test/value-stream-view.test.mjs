import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentExtent, streamChart, streamExtent, streamLanes, streamStats, streamTicks } from '../public/core/value-stream.js';

const now = Date.parse('2026-10-02T16:00:00Z');
const stream = {
  workItemId: '181', trackerCreatedAt: '2026-09-30T08:00:00Z', admittedAt: '2026-10-01T09:00:00Z', closed: false, demo: false, notes: ['CI shows the latest runs Ploeg read for each pull request, at most 30.'],
  lanes: [
    { key: 'ticket', group: 'ticket', label: 'Ticket', sublabel: 'VIK-1990', url: 'https://tracker.example/1990', bars: [{ start: '2026-09-30T08:00:00Z', end: '2026-10-01T09:00:00Z', label: 'Before Ploeg', detail: '', tone: 'neutral', waiting: true }], marks: [{ at: '2026-09-30T08:00:00Z', label: 'Created in the tracker', tone: 'neutral' }] },
    { key: 'ci:7', group: 'ci', label: 'CI · #42', sublabel: '1 run', url: null, bars: [{ start: '2026-10-02T11:00:00Z', end: '2026-10-02T11:10:00Z', label: 'success', detail: 'verify', tone: 'success', waiting: false }], marks: [] },
    { key: 'pull:7', group: 'pullRequest', label: 'Pull request #42', sublabel: 'webgrip/glide', url: null, bars: [{ start: '2026-10-02T12:00:00Z', end: null, label: 'In review', detail: '', tone: 'review', waiting: true }], marks: [] },
  ],
};
const shifts = [{ id: '3', round: 2, openedAt: '2026-10-02T09:30:00Z', closedAt: null }];
const runs = [
  { id: '11', shiftId: '3', role: 'builder', round: 1, writes: true, state: 'finished', startedAt: '2026-10-02T09:31:00Z', finishedAt: '2026-10-02T09:40:00Z' },
  { id: '12', shiftId: '3', role: 'reviewer', round: 2, writes: false, state: 'running', startedAt: '2026-10-02T15:30:00Z', finishedAt: null },
  { id: '13', shiftId: '3', role: 'reviewer', round: 2, writes: false, state: 'pending', startedAt: null, finishedAt: null },
];
const runTone = run => ({ tone: run.state === 'running' ? 'live' : 'success', label: run.state === 'running' ? 'Running' : 'PR opened' });

test('Shift and Role lanes sit between the tracker lanes and the pull request lanes, and a Run that never started is left out', () => {
  const lanes = streamLanes({ stream, shifts, runs, runTone });
  assert.deepEqual(lanes.map(lane => lane.key), ['ticket', 'shift', 'run:builder', 'run:reviewer', 'pull:7', 'ci:7']);
  const reviewer = lanes.find(lane => lane.key === 'run:reviewer');
  assert.deepEqual(reviewer.bars.map(bar => [bar.runId, bar.end, bar.label]), [['12', null, 'Round 2']]);
  assert.equal(lanes.find(lane => lane.key === 'run:builder').sublabel, 'writer');
});

test('the stream runs to now while anything still runs, and the agent window starts near the first Shift', () => {
  const lanes = streamLanes({ stream, shifts, runs, runTone });
  assert.deepEqual(streamExtent(lanes, now), { from: Date.parse('2026-09-30T08:00:00Z'), to: now });
  const agents = agentExtent(lanes, now);
  assert.ok(agents.from > Date.parse('2026-10-02T08:00:00Z') && agents.from < Date.parse('2026-10-02T09:30:00Z'));
  assert.equal(agents.to, now);
});

test('ticks stay few and land on whole hours or days', () => {
  const ticks = streamTicks({ from: Date.parse('2026-10-02T09:07:00Z'), to: Date.parse('2026-10-02T16:00:00Z') });
  assert.ok(ticks.length >= 3 && ticks.length <= 7);
  for (const tick of ticks) assert.equal(new Date(tick.at).getMinutes(), 0);
});

test('the headline figures add up the lanes and never invent a missing one', () => {
  const stats = streamStats(streamLanes({ stream, shifts, runs, runTone }), { stream, now });
  assert.equal(stats.total, (now - Date.parse('2026-09-30T08:00:00Z')) / 1000);
  assert.equal(stats.beforeFirstRun, (Date.parse('2026-10-02T09:31:00Z') - Date.parse('2026-09-30T08:00:00Z')) / 1000);
  assert.equal(stats.agents, 9 * 60 + 30 * 60);
  assert.equal(stats.ci, 600);
  assert.equal(stats.review, 4 * 3600);
  assert.equal(stats.deploy, null);
});

test('the chart offers the agent zoom only when it helps, links Run bars to their Run and reads every bar aloud', () => {
  const lanes = streamLanes({ stream, shifts, runs, runTone });
  const whole = streamChart({ lanes, stream, now });
  assert.match(whole, /data-action="work-stream-zoom"/);
  assert.match(whole, /data-action="work-run" data-id="12"/);
  assert.match(whole, /class="stream-now"/);
  assert.match(whole, /Created in the tracker: /);
  assert.match(whole, /<li>CI shows the latest runs/);
  const zoomed = streamChart({ lanes, stream, now, zoom: 'agents' });
  assert.match(zoomed, /aria-pressed="true"[^>]*data-id="agents"|data-id="agents"[^>]*aria-pressed="true"/);
  assert.doesNotMatch(zoomed, /Before Ploeg/);
  const short = streamLanes({ stream: null, shifts, runs, runTone });
  assert.doesNotMatch(streamChart({ lanes: short, stream: null, now }), /work-stream-zoom/);
  assert.equal(streamChart({ lanes: [], stream: null, now }), '');
});
