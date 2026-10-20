import assert from 'node:assert/strict';
import { test } from 'node:test';
import { landingEstimate, withJudgeEta } from '../public/live/landing.js';
import { liveModel } from '../public/live/model.js';
import { flightLegs } from '../public/live/flight-path.js';
import { standingAnswers } from '../public/live/answers.js';
import { scenarios } from '../public/live/fixtures.js';

const start = Date.parse('2026-10-18T21:26:00Z');
const run = { id: '50', role: 'Builder', writes: true, state: 'running', startedAt: new Date(start).toISOString() };
const finished = (id, minutes, extra = {}) => ({ id, role: 'Builder', writes: true, outcome: 'pr_opened', durationSeconds: minutes * 60, ...extra });
const history = [finished('1', 10), finished('2', 14), finished('3', 18), finished('4', 22), finished('5', 40)];
const at = minutes => start + minutes * 60000;

test('a running Builder lands at the median of the Team’s earlier Builder Runs that opened a pull request', () => {
  const estimate = landingEstimate({ history, run, now: at(5) });
  assert.equal(estimate.medianSeconds, 18 * 60);
  assert.equal(estimate.sample, 5);
  assert.equal(estimate.landsAt, at(18));
  assert.match(estimate.note, /^about \d{2}:\d{2}$/);
  assert.match(estimate.text, /median of the last 5/);
});

test('past the median the landing moves to the slowest tenth, and past every earlier Run there is none', () => {
  const long = landingEstimate({ history, run, now: at(25) });
  assert.equal(long.landsAt, at(40));
  assert.match(long.note, /running long/);
  const lost = landingEstimate({ history, run, now: at(45) });
  assert.equal(lost.landsAt, null);
  assert.equal(lost.note, 'past every earlier Run');
});

test('no estimate from too few Runs, other Roles, reviewers, shadows, or for a Run that does not write', () => {
  const others = [finished('1', 10, { role: 'Reviewer' }), finished('2', 10, { writes: false }), finished('3', 10, { shadow: true }), finished('4', 10, { outcome: 'pr_updated' }), finished('5', 12), finished('6', 13)];
  assert.equal(landingEstimate({ history: others, run, now: at(1) }), null);
  assert.equal(landingEstimate({ history, run: { ...run, writes: false }, now: at(1) }), null);
  assert.equal(landingEstimate({ history, run: { ...run, state: 'finished' }, now: at(1) }), null);
  assert.equal(landingEstimate({ history: [], run, now: at(1) }), null);
});

test('the flight path and the review answer show the estimate instead of “no estimate”', () => {
  const input = scenarios.running.input();
  const estimate = { text: 'The pull request should open about 21:44: Builder Runs on this Team open one in 18 min (median of the last 5)', note: 'about 21:44', source: 'team-history' };
  const model = liveModel({ ...input, estimate });
  assert.equal(flightLegs(model).find(leg => leg.kind === 'approach').note, 'about 21:44');
  const review = standingAnswers(model).find(entry => entry.id === 'review');
  assert.equal(review.source, 'estimate');
  assert.match(review.answer, /should open about 21:44/);
});

test('the AI judge’s forecast stands beside the history estimate, and alone when there is too little history', () => {
  const judge = { runId: '50', at: new Date(at(10)).toISOString(), etaAt: new Date(at(40)).toISOString() };
  const both = withJudgeEta(landingEstimate({ history, run, now: at(12) }), judge, { run, now: at(12) });
  assert.equal(both.landsAt, at(18));
  assert.equal(both.judgeAt, at(40));
  assert.match(both.note, /^about \d{2}:\d{2} · AI \d{2}:\d{2}$/);
  assert.match(both.text, /The AI judge, reading its progress at \d{2}:\d{2}, expects it about \d{2}:\d{2}/);
  const alone = withJudgeEta(null, judge, { run, now: at(12) });
  assert.equal(alone.source, 'judge');
  assert.equal(alone.landsAt, at(40));
  assert.match(alone.note, /^AI · about/);
});

test('a judge forecast already past, for another Run, or for a Run that does not write is left out', () => {
  const judge = { runId: '50', at: new Date(at(1)).toISOString(), etaAt: new Date(at(20)).toISOString() };
  assert.equal(withJudgeEta(null, judge, { run, now: at(21) }), null);
  assert.equal(withJudgeEta(null, { ...judge, runId: '49' }, { run, now: at(2) }), null);
  assert.equal(withJudgeEta(null, judge, { run: { ...run, writes: false }, now: at(2) }), null);
  assert.equal(withJudgeEta(null, { ...judge, etaAt: null }, { run, now: at(2) }), null);
});
