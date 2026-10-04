import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardFlow, cardPipeline, cardShape, playCITiming, playShape, playTimeline } from '../src/card-kpis.ts';
import { parseCard } from '../src/ploeg.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { demoWorkingSeconds } from '../src/ploeg-demo-kpis.ts';
import { seasonMedians } from '../src/season.ts';

const span = (extra: Record<string, unknown> = {}) => ({ from: '2026-09-20T09:00:00Z', to: '2026-09-28T15:00:00Z', seconds: 712800, workingSeconds: 165600, running: false, start: 'tracker_created', end: 'release', ...extra });
const status = (extra: Record<string, unknown> = {}) => ({ status: 'In progress', gate: 'development', kind: 'active', visits: 2, seconds: 172800, workingSeconds: 57600, observed: false, current: false, ...extra });
const flow = (extra: Record<string, unknown> = {}) => ({
  statuses: [status({ status: 'Backlog', gate: null, kind: 'waiting', visits: 1 }), status(), status({ status: 'Done', gate: 'done', kind: 'done', visits: 1, current: true })], statusesSince: '2026-09-20T09:00:00Z', truncated: false,
  gates: { development: { seconds: 172800, workingSeconds: 57600 }, done: { seconds: 3600, workingSeconds: 0 } }, kinds: { active: { seconds: 172800, workingSeconds: 57600 }, waiting: { seconds: 86400, workingSeconds: 28800 } },
  leadTime: span(), cycleTime: span({ start: 'first_active' }), timeToStart: span({ seconds: 86400, workingSeconds: 28800, end: 'first_active' }),
  efficiency: 0.412, blockedSeconds: 0, blockedWorkingSeconds: 0, reopens: 1, queueSeconds: 300, queueWorkingSeconds: 300, agentSeconds: 2100, runs: 3,
  firstRunToFirstPlaySeconds: 1800, firstRunToFirstPlayWorkingSeconds: 1800, mergeTo: { test: 1800, production: 172800 }, mergeToWorking: { test: 1800, production: 28800 }, environmentsReached: ['test', 'production'],
  timeToProduction: { environment: 'production', seconds: 172800, workingSeconds: 28800 },
  restores: [{ crackId: '7', confirmedAt: '2026-09-25T10:00:00Z', mendedAt: '2026-09-26T10:00:00Z', seconds: 86400, workingSeconds: 28800 }], meanRestoreSeconds: 86400, meanRestoreWorkingSeconds: 28800,
  estimateSeconds: 28800, calendar: { timezone: 'Europe/Amsterdam', days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '09:00', end: '17:00', holidays: 0 }, notCollected: ['holidays'],
  ...extra,
});
const timeline = (extra: Record<string, unknown> = {}) => ({
  openedAt: '2026-09-27T09:00:00Z', readyAt: '2026-09-27T10:00:00Z', firstFeedbackAt: '2026-09-27T10:42:00Z', firstApprovalAt: '2026-09-27T12:00:00Z', lastApprovalAt: '2026-09-27T13:00:00Z', mergedAt: '2026-09-27T13:10:00Z',
  toFirstFeedbackSeconds: 2520, toFirstApprovalSeconds: 7200, approvalToMergeSeconds: 600, openToMergeSeconds: 15000, reviewRounds: 2, comments: 5, reviewers: 2, responseSeconds: 3000,
  commits: 4, firstCommitAt: '2026-09-27T07:00:00Z', forcePushes: null, codingSeconds: 10800, truncated: false, capturedAt: '2026-09-27T13:11:00Z', ...extra,
});
const ci = (extra: Record<string, unknown> = {}) => ({ runs: 4, failedRuns: 1, reruns: 2, lastGreenSeconds: 312, queueSeconds: 140, timeToGreenSeconds: 3600, minutes: 21.5, slowest: [{ name: 'test', seconds: 280 }, { name: 'e2e', seconds: 260 }], firstPassGreen: false, source: 'actions', truncated: false, capturedAt: '2026-09-27T13:11:00Z', ...extra });
const complexity = { method: 'indentation/2026.1', added: 31, removed: 40, net: -9, maxDepth: 4, hotspots: [{ path: 'src/a.ts', added: 22 }] };
const shape = (extra: Record<string, unknown> = {}) => ({ complexity, files: 3, countedLines: 69, testLines: 24, testRatio: 0.533, docsTouched: 1, languages: [{ name: 'TypeScript', lines: 58 }], truncated: false, capturedAt: '2026-09-27T13:11:00Z', ...extra });
const pipeline = (extra: Record<string, unknown> = {}) => ({ plays: 2, toFirstFeedbackSeconds: 2520, openToMergeSeconds: 15000, reviewRounds: 3, comments: 6, firstPassGreen: false, median: { toFirstFeedbackSeconds: 2000, openToMergeSeconds: 14000, responseSeconds: 3000, lastGreenSeconds: 300 }, ci: { runs: 6, failedRuns: 1, reruns: 2, minutes: 30.2, queueSeconds: 200 }, ...extra });
const card = (extra: Record<string, unknown> = {}) => ({ workItemId: '7', title: 'Rotate merchant keys', team: 'delivery', state: 'merged', plays: [], totals: {}, events: [], ...extra });

test('flow reads strictly but additively: absent, null, the full contract, unknown fields dropped', () => {
  assert.equal(cardFlow(undefined), null);
  assert.equal(cardFlow(null), null);
  assert.equal(cardFlow('flow'), null, 'a bare word is no flow');
  assert.equal(cardFlow([flow()]), null, 'a list is no flow');
  assert.deepEqual(cardFlow(flow()), flow(), 'the contract shape passes through unchanged');
  const future = { ...flow(), cadence: 'weekly', leadTime: { ...span(), confidence: 0.9 }, statuses: [{ ...status(), colour: 'blue' }], calendar: { ...flow().calendar, lunch: '12:00' } };
  assert.deepEqual(cardFlow(future), { ...flow(), statuses: [status()] }, 'unknown fields at any depth are dropped');
});

test('a malformed flow figure becomes null and a malformed entry is left out, never failing the card', () => {
  const parsed = cardFlow(flow({ leadTime: { from: 'soon', to: '2026-09-28T15:00:00Z', seconds: 1, workingSeconds: 1 }, efficiency: 1.4, reopens: -1, queueSeconds: 2.5, runs: '3', calendar: { timezone: 'Europe/Amsterdam', days: [], start: '09:00', end: '17:00' }, timeToProduction: { environment: 'Production!', seconds: 1, workingSeconds: 1 }, statuses: [status(), status({ kind: 'thinking' }), status({ seconds: -5 }), 'Doing'], mergeTo: { test: 1800, 'bad env': 3, staging: -1 }, notCollected: ['statuses', 'Not A Key', 4], restores: [{ crackId: '7' }] }))!;
  assert.equal(parsed.leadTime, null, 'a span with an unreadable end');
  assert.equal(parsed.efficiency, null, 'an efficiency above one');
  assert.equal(parsed.reopens, null, 'a negative count');
  assert.equal(parsed.queueSeconds, null, 'fractional seconds');
  assert.equal(parsed.runs, null, 'a count as text');
  assert.equal(parsed.calendar, null, 'a calendar without working days');
  assert.equal(parsed.timeToProduction, null, 'an environment that is not a name');
  assert.deepEqual(parsed.statuses, [status()], 'only readable statuses are kept');
  assert.deepEqual(parsed.mergeTo, { test: 1800 });
  assert.deepEqual(parsed.notCollected, ['statuses']);
  assert.deepEqual(parsed.restores, []);
  assert.deepEqual(parsed.cycleTime, flow().cycleTime, 'the readable figures beside them stay');
  const sparse = cardFlow({ statuses: [], leadTime: null })!;
  assert.deepEqual([sparse.leadTime, sparse.efficiency, sparse.agentSeconds, sparse.calendar, sparse.truncated, sparse.statuses, sparse.gates], [null, null, null, null, false, [], {}], 'a partial flow reads unknown as null, never zero');
});

test('a play’s timeline, CI timing and shape read strictly but additively', () => {
  assert.deepEqual(playTimeline(timeline()), timeline());
  assert.deepEqual(playCITiming(ci()), ci());
  assert.deepEqual(playShape(shape()), shape(), 'a negative net complexity is a fact, not an error');
  for (const parse of [playTimeline, playCITiming, playShape]) { assert.equal(parse(null), null); assert.equal(parse(undefined), null); assert.equal(parse(7), null); }
  assert.deepEqual(playTimeline({ ...timeline(), readyAt: 'later', comments: 2.5, verdict: 'lgtm' }), { ...timeline(), readyAt: null, comments: null }, 'an unreadable time or count is null and an unknown field is dropped');
  assert.deepEqual(playCITiming({ ...ci(), slowest: [{ name: 'a', seconds: 1 }, { name: '', seconds: 2 }, { name: 'b', seconds: 3 }, { name: 'c', seconds: 4 }, { name: 'd', seconds: 5 }], source: 'Jenkins CI', minutes: -1 }), { ...ci(), slowest: [{ name: 'a', seconds: 1 }, { name: 'b', seconds: 3 }], source: '', minutes: null }, 'at most three readable slow jobs, an unreadable source and minutes dropped');
  assert.deepEqual(playShape({ ...shape(), complexity: { ...complexity, added: 'many' } }), { ...shape(), complexity: null }, 'an unreadable complexity is null and the rest stays');
});

test('the card pipeline and card shape read strictly but additively', () => {
  assert.deepEqual(cardPipeline(pipeline()), pipeline());
  assert.deepEqual(cardPipeline(pipeline({ ci: null, median: undefined })), pipeline({ ci: null, median: { toFirstFeedbackSeconds: null, openToMergeSeconds: null, responseSeconds: null, lastGreenSeconds: null } }), 'no CI read and no medians are unknowns');
  assert.equal(cardPipeline(null), null);
  const { capturedAt: _capturedAt, ...rest } = shape();
  assert.deepEqual(cardShape({ ...rest, plays: 1, complete: true }), { ...rest, plays: 1, complete: true });
  assert.equal(cardShape([]), null);
});

test('parseCard keeps an older Ploeg’s card as it was and passes KPI figures through figure by figure', () => {
  const older = parseCard(card({ plays: [{ number: 3, state: 'merged', reviews: [] }] }));
  for (const key of ['flow', 'pipeline', 'shape']) assert.equal(Object.hasOwn(older, key), false, `an older Ploeg sends no ${key}`);
  for (const key of ['timeline', 'ciTiming', 'shape']) assert.equal(Object.hasOwn(older.plays[0], key), false, `an older play has no ${key}`);
  const newer = parseCard(card({ flow: flow(), pipeline: pipeline(), shape: { ...shape(), plays: 1, complete: true }, plays: [{ number: 3, state: 'merged', reviews: [], timeline: timeline(), ciTiming: ci(), shape: shape() }] }));
  assert.deepEqual(newer.flow, flow());
  assert.deepEqual(newer.pipeline, pipeline());
  assert.deepEqual(newer.plays[0].timeline, timeline());
  assert.deepEqual(newer.plays[0].ciTiming, ci());
  assert.deepEqual(newer.plays[0].shape, shape());
  const broken = parseCard(card({ flow: 'soon', pipeline: [1], shape: 3, plays: [{ number: 3, state: 'open', reviews: [], timeline: 'x', ciTiming: null, shape: [] }] }));
  assert.deepEqual([broken.flow, broken.pipeline, broken.shape, broken.plays[0].timeline, broken.plays[0].ciTiming, broken.plays[0].shape], [null, null, null, null, null, null], 'an unreadable KPI object is null and the card still reads');
  assert.equal(broken.title, 'Rotate merchant keys');
});

test('the demo carries deterministic, illustrative KPIs across states and never invents spend', () => {
  const cards = ploegDemo.cards;
  const flaky = cards['140'];
  assert.equal(flaky.state, 'merged');
  assert(flaky.plays.at(-1)!.ciTiming!.reruns! >= 3, 'a flaky-CI card reran');
  const blocked = cards['113'];
  const onHold = blocked.flow!.statuses.find(entry => entry.kind === 'blocked')!;
  assert(onHold.current && onHold.seconds > 3 * 86400, 'a card blocked for days, still blocked');
  assert(cards['142'].pipeline!.toFirstFeedbackSeconds! <= 15 * 60, 'a fast-feedback card');
  assert.deepEqual(Object.values(cards).filter(entry => entry.flow?.estimateSeconds).map(entry => entry.workItemId).sort(), ['102', '105', '117'], 'three cards have an estimate');
  const waiting = cards['109'].plays.at(-1)!.timeline!;
  assert.equal(waiting.firstFeedbackAt, null, 'an open play still waits for its first feedback');
  assert(['drafting', 'in_review', 'merged'].every(state => Object.values(cards).some(entry => entry.state === state && entry.flow)), 'drafting, in review and merged cards carry flow');
  for (const entry of Object.values(cards)) {
    assert.equal(entry.totals.costStatus, 'not_reported', `${entry.workItemId} spends nothing`);
    if (entry.flow) assert.equal(entry.flow.runs, entry.totals.runs ?? 0, `${entry.workItemId} counts only the demo's own Runs`);
    assert.deepEqual(parseCard(JSON.parse(JSON.stringify(entry))).flow ?? null, entry.flow ?? null, `${entry.workItemId}'s flow is in the contract's shape`);
    for (const play of entry.plays) if (play.timeline) assert.deepEqual(parseCard(JSON.parse(JSON.stringify(entry))).plays.find(other => other.number === play.number)!.timeline, play.timeline);
  }
});

test('the demo counts working time in Monday to Friday, 09:00 to 17:00 Europe/Amsterdam, across daylight saving', () => {
  const monday = Date.parse('2026-09-28T07:00:00Z');
  assert.equal(demoWorkingSeconds(monday, monday + 86_400_000), 8 * 3600, 'one working day');
  assert.equal(demoWorkingSeconds(monday, monday + 7 * 86_400_000), 40 * 3600, 'one working week');
  assert.equal(demoWorkingSeconds(Date.parse('2026-10-24T00:00:00Z'), Date.parse('2026-10-27T00:00:00Z')), 8 * 3600, 'a weekend and the Monday after the clocks went back');
  assert.equal(demoWorkingSeconds(monday, monday - 1), 0);
});

test('season medians are team aggregates over the cards that know each figure, and null when none does', () => {
  const at = (seconds: number, efficiency: number, minutes: number | null, feedback: number | null) => parseCard(card({ flow: flow({ leadTime: span({ seconds }), efficiency }), pipeline: pipeline({ toFirstFeedbackSeconds: feedback, ci: minutes === null ? null : { runs: 1, failedRuns: 0, reruns: 0, minutes, queueSeconds: 0 } }) }));
  const medians = seasonMedians([at(100, 0.2, 10, 600), at(300, 0.6, null, 1200), at(200, 0.4, 20, null), parseCard(card({ flow: flow({ leadTime: span({ seconds: 999, running: true }) }) }))]);
  assert.deepEqual(medians.leadTimeSeconds, { value: 200, cards: 3 }, 'a running lead time is not a delivered one');
  assert.deepEqual(medians.flowEfficiency, { value: 0.406, cards: 4 }, 'an even count takes the middle two');
  assert.deepEqual(medians.ciMinutes, { value: 15, cards: 2 });
  assert.deepEqual(medians.firstFeedbackSeconds, { value: 900, cards: 2 });
  assert.deepEqual(seasonMedians([parseCard(card())]), { leadTimeSeconds: null, firstFeedbackSeconds: null, ciMinutes: null, flowEfficiency: null });
});
