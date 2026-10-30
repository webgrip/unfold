import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import type { FactsPullRequest, FactsRun, WorkItemFacts } from '../src/cards/facts.ts';
import { economicsWindows } from '../src/delivery-economics.ts';
import { acceptanceCalendarSettings, deliveriesCsv, deliveryCsvColumns, deliveryLedger, deliveryRow, readDeliveryLedger, silentAcceptanceAt } from '../src/delivery-ledger.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { application, login, request } from './api-support.ts';

const until = Date.parse('2026-10-29T12:00:00Z');
const since = until - economicsWindows['30d'];
const iso = (ms: number) => new Date(ms).toISOString();
const friday = Date.parse('2026-10-02T10:00:00Z');

function run(id: string, extra: Partial<FactsRun> = {}): FactsRun {
  return { id, shiftId: '1', role: 'builder', round: 1, writes: true, state: 'finished', startedAt: iso(friday - 3_600_000), finishedAt: iso(friday), outcome: 'pr_opened', links: [], authorizedUsd: 2, usage: { costUsd: 1 }, ...extra };
}

function pr(extra: Partial<FactsPullRequest> = {}): FactsPullRequest {
  return {
    id: '1', forge: 'forgejo', owner: 'webgrip', repo: 'unfold', number: 1, url: 'https://forge.example/pulls/1', shiftId: '1', branch: 'ploeg/1', baseBranch: 'development',
    state: 'open', draft: false, author: 'ploeg-bot', headSha: 'abc', mergeCommitSha: null, openedAt: iso(friday - 600_000), firstSeenAt: iso(friday - 600_000), mergedAt: null, mergedBy: null, closedAt: null, updatedAt: iso(friday),
    additions: 1, deletions: 1, changedFiles: 1, labels: [], commits: 1, firstCommitAt: null, forcePushes: 0, activityCapturedAt: null, activityTruncated: false, commitStatus: null,
    ciRunsCapturedAt: null, ciRunsSource: null, ciRunsTruncated: false, ciRuns: [], reviews: [], events: [], filesCapturedAt: null, filesTruncated: false, files: [], changedPaths: null, reverts: [], deployments: [],
    ...extra,
  };
}

function item(id: string, { team = 'bronze', state = 'awaiting_review', runs = [run(`${id}-1`)], pullRequests = [pr()], extra = {} }: { team?: string; state?: string; runs?: FactsRun[]; pullRequests?: FactsPullRequest[]; extra?: Partial<WorkItemFacts> } = {}): WorkItemFacts {
  return {
    workItem: { id, provider: 'vikunja', externalId: id, externalRef: `VIK-${id}`, url: '', title: `Work Item ${id}`, state, team, createdAt: iso(since), updatedAt: iso(until), trackerCreatedAt: null, estimateSeconds: null, target: null, epics: [], withdrawals: [] },
    activityAt: iso(until), shifts: [], runs, liveUsage: [], pullRequests, statusTransitions: [], gateTransitions: [], deployEnvironments: [], roster: [], botLogins: ['ploeg-bot'],
    truncated: { shifts: false, runs: false, pullRequests: false, statusTransitions: false, gateTransitions: false },
    ...extra,
  };
}

const row = (facts: WorkItemFacts, at = until, nonWorkingDates: string[] = []) => deliveryRow(facts, { until: at, calendar: { nonWorkingDates } });

test('silence ends at the UTC midnight after the tenth working day, skipping weekends and configured dates', () => {
  assert.equal(iso(silentAcceptanceAt(friday)), '2026-10-17T00:00:00.000Z', 'Friday 2 October: Monday 5 to Friday 16 are the ten working days');
  assert.equal(iso(silentAcceptanceAt(Date.parse('2026-10-03T23:00:00Z'))), '2026-10-17T00:00:00.000Z', 'a Saturday hand-over counts from Monday');
  assert.equal(iso(silentAcceptanceAt(friday, { nonWorkingDates: ['2026-10-07'] })), '2026-10-20T00:00:00.000Z', 'a skipped Wednesday moves it past the weekend');
  assert.equal(iso(silentAcceptanceAt(friday, { nonWorkingDates: ['2026-10-10'] })), '2026-10-17T00:00:00.000Z', 'a skipped Saturday changes nothing');
});

test('a merge is Acceptance on the day it merged, and a person approving first makes it an approval', () => {
  const merged = row(item('1', { state: 'done', pullRequests: [pr({ state: 'merged', mergedAt: '2026-10-05T09:00:00Z' })] }));
  assert.deepEqual(merged.acceptance, { kind: 'merged', at: '2026-10-05T09:00:00.000Z', pullRequestUrl: 'https://forge.example/pulls/1' });
  const reviews = [{ reviewer: 'ploeg-bot', state: 'APPROVED', headSha: 'abc', receivedAt: '2026-10-02T11:00:00Z' }, { reviewer: 'ryan', state: 'APPROVED', headSha: 'abc', receivedAt: '2026-10-04T08:00:00Z' }];
  assert.deepEqual(row(item('2', { pullRequests: [pr({ state: 'merged', mergedAt: '2026-10-05T09:00:00Z', reviews })] })).acceptance.kind, 'approved', 'the agents’ own approval is not a decision');
  assert.equal(row(item('2', { pullRequests: [pr({ state: 'merged', mergedAt: '2026-10-05T09:00:00Z', reviews })] })).acceptance.at, '2026-10-04T08:00:00.000Z');
  const tie = row(item('3', { pullRequests: [pr({ state: 'merged', mergedAt: '2026-10-05T09:00:00Z', events: [{ kind: 'review', actor: 'ryan', at: '2026-10-05T09:00:00Z', state: 'approved', headSha: 'abc' }] })] }));
  assert.equal(tie.acceptance.kind, 'merged', 'a merge wins a tie');
  const outside = row(item('4', { pullRequests: [pr({ shiftId: null, state: 'merged', mergedAt: '2026-10-05T09:00:00Z' })] }));
  assert.equal(outside.acceptance.kind, 'open', 'a pull request without a Shift is not Ploeg’s delivery');
});

test('ten working days with no decision after the last writing Run is silent Acceptance; before that it is open with its due date', () => {
  const quiet = item('5');
  assert.deepEqual(row(quiet).acceptance, { kind: 'silent', at: '2026-10-17T00:00:00.000Z', pullRequestUrl: 'https://forge.example/pulls/1' });
  assert.equal(row(quiet).readyForReviewAt, iso(friday));
  const early = row(quiet, Date.parse('2026-10-16T23:59:59Z'));
  assert.deepEqual([early.acceptance.kind, early.silentDueAt], ['open', '2026-10-17T00:00:00.000Z']);
  assert.equal(row(quiet, until, ['2026-10-07']).acceptance.at, '2026-10-20T00:00:00.000Z');
  const later = item('6', { runs: [run('a'), run('b', { finishedAt: '2026-10-09T10:00:00Z', round: 2 })] });
  assert.equal(row(later).acceptance.at, '2026-10-24T00:00:00.000Z', 'a later writing Run restarts the clock');
  const asked = item('7', { pullRequests: [pr({ reviews: [{ reviewer: 'ryan', state: 'changes_requested', headSha: 'abc', receivedAt: '2026-10-08T10:00:00Z' }] })] });
  assert.deepEqual([row(asked).acceptance.kind, row(asked).silentDueAt], ['open', null], 'a person asked for changes, so the work was not silently accepted');
  assert.equal(row(item('8', { pullRequests: [pr({ draft: true })] })).acceptance.kind, 'open', 'a draft is not handed over');
  const mergedLate = row(item('9', { state: 'done', pullRequests: [pr({ state: 'merged', mergedAt: '2026-10-20T09:00:00Z' })] }));
  assert.deepEqual([mergedLate.acceptance.kind, mergedLate.acceptance.at], ['silent', '2026-10-17T00:00:00.000Z'], 'silence came first');
});

test('a Work Item done, withdrawn or with every pull request closed is closed without acceptance; one still working is open', () => {
  const closedPr = [pr({ state: 'closed', closedAt: '2026-10-06T10:00:00Z' })];
  assert.deepEqual(row(item('10', { state: 'needs_human', pullRequests: closedPr })).acceptance, { kind: 'closed_without_acceptance', at: '2026-10-06T10:00:00.000Z', pullRequestUrl: null });
  assert.equal(row(item('11', { state: 'queued', pullRequests: closedPr })).acceptance.kind, 'open', 'Ploeg is trying again');
  const withdrawn = item('12', { state: 'withdrawn', pullRequests: [], extra: {} });
  withdrawn.workItem.withdrawals = [{ at: '2026-10-07T08:00:00Z', actor: 'ryan' }];
  assert.deepEqual(row(withdrawn).acceptance, { kind: 'closed_without_acceptance', at: '2026-10-07T08:00:00.000Z', pullRequestUrl: null });
  assert.equal(row(item('13', { state: 'leased', pullRequests: [] })).acceptance.kind, 'open');
});

test('the Token Charge base adds settled spend of every Shift, failed Runs included, and keeps open spend apart', () => {
  const result = row(item('14', {
    state: 'done', pullRequests: [pr({ state: 'merged', mergedAt: '2026-10-05T09:00:00Z' })],
    runs: [
      run('a', { usage: { costUsd: 0.4 } }),
      run('b', { outcome: 'failed', shiftId: '2', usage: { costUsd: 0.6 } }),
      run('c', { state: 'running', finishedAt: null, usage: null }),
      run('d', { usage: { costUsd: 0.25 } }),
      run('e', { usage: { inputTokens: 10 } }),
      run('f', { shiftId: null, usage: { costUsd: 9 } }),
    ],
    extra: { liveUsage: [{ runId: 'c', observedAt: iso(until - 1), costUsd: 0.07, inputTokens: 1, outputTokens: 1 }], runBudgetHolds: [{ runId: 'd', shiftId: '1', reservedUsd: 1 }] },
  }));
  assert.equal(result.tokenChargeBaseUsd, 1);
  assert.deepEqual(result.unsettled, { runs: 2, usd: 0.32 });
  assert.equal(result.unknownRuns, 1);
});

test('the ledger lists attempted Work Items newest Acceptance first, open ones last, with totals per kind', () => {
  const ledger = deliveryLedger([
    item('20'),
    item('21', { state: 'done', pullRequests: [pr({ state: 'merged', mergedAt: '2026-10-05T09:00:00Z' })] }),
    item('22', { state: 'leased', pullRequests: [] }),
    item('23', { state: 'leased', runs: [], pullRequests: [] }),
    item('21'),
    item('24', { state: 'leased', pullRequests: [], extra: { truncated: { shifts: false, runs: true, pullRequests: false, statusTransitions: false, gateTransitions: false } } }),
  ], { window: '30d', since, until });
  assert.deepEqual(ledger.rows.map(entry => [entry.workItemId, entry.acceptance.kind]), [['20', 'silent'], ['21', 'merged'], ['24', 'open'], ['22', 'open']], 'Work Item 23 was never attempted');
  assert.deepEqual(ledger.totals.kinds, { merged: 1, approved: 0, silent: 1, closed_without_acceptance: 0, open: 2 });
  assert.equal(ledger.totals.tokenChargeBaseUsd, 4);
  assert.equal(ledger.scanned, 5);
  assert.equal(ledger.truncated, true);
  assert.deepEqual(ledger.calendar, { workingDays: 'monday-friday', nonWorkingDates: [], silentAfterWorkingDays: 10, timeZone: 'UTC' });
  assert.equal(ledger.readyForReview, 'last_writing_run');
});

test('the facts are read within the window and the caller’s Teams', async () => {
  const seen: string[] = [];
  const source = { factsPage: async (query: { since?: string }) => { seen.push(query.since!); return { facts: [item('30'), item('31', { team: 'hidden' })], nextBefore: null }; } };
  const ledger = await readDeliveryLedger(source, { window: '30d', teams: ['bronze'], now: until, calendar: { nonWorkingDates: ['2026-10-07'] } });
  assert.deepEqual(seen, [iso(since)]);
  assert.deepEqual(ledger.rows.map(entry => entry.workItemId), ['30']);
  assert.equal(ledger.rows[0]!.acceptance.at, '2026-10-20T00:00:00.000Z');
});

test('the calendar setting takes real dates only and defaults to none', () => {
  assert.deepEqual(acceptanceCalendarSettings(undefined), { nonWorkingDates: [] });
  assert.deepEqual(acceptanceCalendarSettings({ nonWorkingDates: ['2026-12-26', '2026-12-25', '2026-12-25'] }), { nonWorkingDates: ['2026-12-25', '2026-12-26'] });
  for (const bad of [{ nonWorkingDates: ['2026-02-30'] }, { nonWorkingDates: '2026-12-25' }, { holidays: [] }, [], null]) assert.throws(() => acceptanceCalendarSettings(bad), /acceptanceCalendar/);
});

test('the CSV export quotes text, defuses formulas and keeps amounts as plain numbers', () => {
  const hostile = item('40', { state: 'done', pullRequests: [pr({ state: 'merged', mergedAt: '2026-10-05T09:00:00Z' })], runs: [run('a', { usage: { costUsd: 0.1234567 } })] });
  hostile.workItem.title = '=HYPERLINK("x"), then more';
  const csv = deliveriesCsv([row(hostile)]);
  const [header, line, end] = csv.split('\r\n');
  assert.equal(header, deliveryCsvColumns.join(','));
  assert.equal(line, '40,VIK-40,bronze,"\'=HYPERLINK(""x""), then more",done,merged,2026-10-05T09:00:00.000Z,https://forge.example/pulls/1,2026-10-02T10:00:00.000Z,,0.123457,0,0,0,false');
  assert.equal(end, '');
  assert.equal(deliveriesCsv([]), `${deliveryCsvColumns.join(',')}\r\n`);
});

test('GET /api/ploeg/deliveries answers the ledger and its CSV for a signed-in user, and the demo shows no amounts', async t => {
  const env = `UNFOLD_PLOEG_TEST_${randomBytes(8).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  const team = ploegDemo.teams[0]!.id;
  const merged = item('41', { team, state: 'done', runs: [run('410', { finishedAt: new Date(Date.now() - 7_200_000).toISOString(), usage: { costUsd: 0.75 } })], pullRequests: [pr({ state: 'merged', mergedAt: new Date(Date.now() - 3_600_000).toISOString() })] });
  const upstream = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
    const send = (data: object) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data }));
    if (req.url!.includes('/teams')) return send({ teams: ploegDemo.teams });
    if (req.url!.includes('/facts?')) return send({ facts: [merged], nextBefore: null });
    res.writeHead(404).end();
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => upstream.close(() => resolve())); delete process.env[env]; });
  const address = upstream.address();
  assert(address && typeof address !== 'string');
  const live = await application('live', config => { config.ploeg = { url: `http://127.0.0.1:${address.port}`, tokenEnv: env }; config.acceptanceCalendar = { nonWorkingDates: ['2026-12-25'] }; });
  t.after(() => live.close());
  const session = await login(live.url);
  const result = await request(live.url, '/api/ploeg/deliveries?window=24h', session);
  assert.equal(result.status, 200, result.text);
  assert.equal(result.body.demo, false);
  assert.deepEqual(result.body.rows.map((entry: { workItemId: string; acceptance: { kind: string }; tokenChargeBaseUsd: number }) => [entry.workItemId, entry.acceptance.kind, entry.tokenChargeBaseUsd]), [['41', 'merged', 0.75]]);
  assert.deepEqual(result.body.calendar.nonWorkingDates, ['2026-12-25']);
  const csv = await request(live.url, '/api/ploeg/deliveries?window=24h&format=csv', session);
  assert.equal(csv.status, 200);
  assert.match(csv.response.headers.get('content-type') ?? '', /^text\/csv/);
  assert.match(csv.response.headers.get('content-disposition') ?? '', /unfold-deliveries-24h\.csv/);
  assert.match(csv.text, /^work_item_id,.*\r\n41,VIK-41,/s);
  assert.equal((await request(live.url, '/api/ploeg/deliveries?window=1y', session)).body.error.code, 'ploeg_filter');
  assert.equal((await request(live.url, '/api/ploeg/deliveries?format=xlsx', session)).body.error.code, 'ploeg_filter');
  assert.equal((await request(live.url, '/api/ploeg/deliveries')).status, 401, 'a signed-out caller reads nothing');

  const demo = await application('demo');
  t.after(() => demo.close());
  assert.deepEqual((await request(demo.url, '/api/ploeg/deliveries?window=7d')).body, { demo: true, window: '7d' }, 'the demo invents no model call or spend');
  const demoCsv = await request(demo.url, '/api/ploeg/deliveries?window=7d&format=csv');
  assert.equal(demoCsv.text, `${deliveryCsvColumns.join(',')}\r\n`);
  assert.match(demoCsv.response.headers.get('content-disposition') ?? '', /unfold-deliveries-demo-7d\.csv/);
});
