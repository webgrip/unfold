import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import type { FactsPage, FactsPullRequest, FactsRun, WorkItemFacts } from '../src/cards/facts.ts';
import type { FactsQuery } from '../src/cards/service.ts';
import { deliveryEconomics, economicsWindows, isEconomicsWindow, minimumMergedSample, readDeliveryEconomics } from '../src/delivery-economics.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { application, login, request } from './api-support.ts';

const until = Date.parse('2026-10-29T12:00:00Z');
const since = until - economicsWindows['7d'];
const iso = (ms: number) => new Date(ms).toISOString();

function run(id: string, extra: Partial<FactsRun> = {}): FactsRun {
  return { id, shiftId: '1', role: 'builder', round: 1, writes: true, state: 'finished', startedAt: iso(until - 7_200_000), finishedAt: iso(until - 3_600_000), outcome: 'pr_opened', links: [], authorizedUsd: 2, usage: { costUsd: 1 }, ...extra };
}

function pr(extra: Partial<FactsPullRequest> = {}): FactsPullRequest {
  return {
    id: '1', forge: 'forgejo', owner: 'webgrip', repo: 'unfold', number: 1, url: 'https://forge.example/pulls/1', shiftId: '1', branch: 'ploeg/1', baseBranch: 'development',
    state: 'merged', draft: false, author: 'ploeg-bot', headSha: 'abc', mergeCommitSha: 'def', openedAt: iso(until - 3_000_000), firstSeenAt: iso(until - 3_000_000), mergedAt: iso(until - 60_000), mergedBy: 'ryan', closedAt: null, updatedAt: iso(until),
    additions: 1, deletions: 1, changedFiles: 1, labels: [], commits: 1, firstCommitAt: null, forcePushes: 0, activityCapturedAt: null, activityTruncated: false, commitStatus: null,
    ciRunsCapturedAt: null, ciRunsSource: null, ciRunsTruncated: false, ciRuns: [], reviews: [], events: [], filesCapturedAt: null, filesTruncated: false, files: [], changedPaths: null, reverts: [], deployments: [],
    ...extra,
  };
}

function item(id: string, { team = 'bronze', runs = [run(`${id}-1`)], pullRequests = [pr()], extra = {} }: { team?: string; runs?: FactsRun[]; pullRequests?: FactsPullRequest[]; extra?: Partial<WorkItemFacts> } = {}): WorkItemFacts {
  return {
    workItem: { id, provider: 'vikunja', externalId: id, externalRef: `VIK-${id}`, url: '', title: `Work Item ${id}`, state: 'done', team, createdAt: iso(since), updatedAt: iso(until), trackerCreatedAt: null, estimateSeconds: null, target: null, epics: [], withdrawals: [] },
    activityAt: iso(until), shifts: [], runs, liveUsage: [], pullRequests, statusTransitions: [], gateTransitions: [], deployEnvironments: [], roster: [], botLogins: ['ploeg-bot'],
    truncated: { shifts: false, runs: false, pullRequests: false, statusTransitions: false, gateTransitions: false },
    ...extra,
  };
}

const measure = (facts: WorkItemFacts[], truncated = false) => deliveryEconomics(facts, { window: '7d', since, until, truncated });

test('a Work Item counts when its pull request merged at either edge of the window, and not a millisecond outside it', () => {
  const at = (ms: number) => [pr({ mergedAt: iso(ms) })];
  const result = measure([
    item('1', { pullRequests: at(since) }),
    item('2', { pullRequests: at(until) }),
    item('3', { pullRequests: at(since - 1) }),
    item('4', { pullRequests: at(until + 1) }),
    item('5', { pullRequests: [pr({ state: 'open', mergedAt: null })] }),
  ]);
  assert.equal(result.merged, 2);
  assert.equal(result.settledUsd, 2);
  assert.equal(result.since, iso(since));
  assert.equal(result.until, iso(until));
  assert.equal(result.scanned, 5);
});

test('settled spend of every Shift is added, failed Runs included; open and unknown spend is listed apart and never added', () => {
  const result = measure([item('7', {
    runs: [
      run('a', { usage: { costUsd: 0.4 } }),
      run('b', { outcome: 'failed', shiftId: '2', usage: { costUsd: 0.6 } }),
      run('c', { state: 'running', finishedAt: null, usage: null }),
      run('d', { usage: { costUsd: 0.25 } }),
      run('e', { usage: { inputTokens: 10 } }),
      run('f', { shiftId: null, usage: { costUsd: 9 } }),
    ],
    extra: { liveUsage: [{ runId: 'c', observedAt: iso(until - 10), costUsd: 0.05, inputTokens: 1, outputTokens: 1 }, { runId: 'c', observedAt: iso(until - 1), costUsd: 0.07, inputTokens: 1, outputTokens: 1 }], runBudgetHolds: [{ runId: 'd', shiftId: '1', reservedUsd: 1 }] },
  })]);
  assert.equal(result.settledUsd, 1, 'only a and b: c is running, d still holds budget, e has no cost, f is outside any Shift');
  assert.deepEqual(result.unsettled, { runs: 2, usd: 0.32 });
  assert.deepEqual(result.unknown, { runs: 1 });
  assert.deepEqual(result.openSpend, [
    { workItemId: '7', team: 'bronze', runId: 'c', status: 'unsettled', usd: 0.07 },
    { workItemId: '7', team: 'bronze', runId: 'd', status: 'unsettled', usd: 0.25 },
    { workItemId: '7', team: 'bronze', runId: 'e', status: 'unknown', usd: null },
  ]);
});

test('below the minimum sample there is no cost per merged Work Item; at the minimum it divides settled spend only', () => {
  const few = measure(Array.from({ length: minimumMergedSample - 1 }, (_, i) => item(String(i + 1))));
  assert.equal(few.merged, 19);
  assert.equal(few.sampleTooSmall, true);
  assert.equal(few.costPerMergedUsd, null);
  assert.equal(few.settledUsd, 19);
  const enough = measure([...Array.from({ length: minimumMergedSample }, (_, i) => item(String(i + 1), { runs: [run('x', { usage: { costUsd: 1.5 } }), run('y', { state: 'pending', startedAt: null, finishedAt: null, usage: null })] }))]);
  assert.equal(enough.sampleTooSmall, false);
  assert.equal(enough.costPerMergedUsd, 1.5);
  assert.equal(enough.unsettled.runs, 20);
  assert.equal(enough.openSpend.length, 20);
  assert.equal(enough.teams[0]!.costPerMergedUsd, 1.5);
  assert.equal(measure([]).costPerMergedUsd, null);
});

test('a Work Item read twice counts once, and Teams are measured apart', () => {
  const result = measure([item('1'), item('1'), item('2', { team: 'silver', runs: [run('s', { usage: { costUsd: 3 } })] })]);
  assert.equal(result.merged, 2);
  assert.deepEqual(result.teams.map(t => [t.team, t.merged, t.settledUsd]), [['bronze', 1, 1], ['silver', 1, 3]]);
});

test('K5 counts a pull request clean unless a person asked for changes or pushed after the agents finished', () => {
  const after = iso(until - 1_800_000);
  const before = iso(until - 5_000_000);
  const result = measure([
    item('1'),
    item('2', { pullRequests: [pr({ reviews: [{ reviewer: 'ryan', state: 'changes_requested', headSha: 'abc', receivedAt: after }] })] }),
    item('3', { pullRequests: [pr({ events: [{ kind: 'push', actor: 'ryan', at: after, state: null, headSha: 'abc' }] })] }),
    item('4', { pullRequests: [pr({ reviews: [{ reviewer: 'ryan', state: 'changes_requested', headSha: 'abc', receivedAt: before }, { reviewer: 'ploeg-bot', state: 'changes_requested', headSha: 'abc', receivedAt: after }, { reviewer: 'ryan', state: 'approved', headSha: 'abc', receivedAt: after }] })] }),
    item('5', { pullRequests: [pr({ events: [{ kind: 'push', actor: 'ploeg-bot', at: after, state: null, headSha: 'abc' }] })] }),
    item('6', { pullRequests: [pr({ state: 'closed', mergedAt: null, closedAt: iso(until - 10) })] }),
    item('7', { pullRequests: [pr({ state: 'closed', mergedAt: null, closedAt: iso(since - 10) })] }),
    item('8', { pullRequests: [pr({ shiftId: null })] }),
  ]);
  assert.deepEqual(result.cleanMerge, { clean: 3, merged: 5, closed: 1, rate: 0.5 });
  assert.equal(result.merged, 6, 'cost counts every merged Work Item, also one whose pull request had no Shift');
  assert.deepEqual(measure([]).cleanMerge, { clean: 0, merged: 0, closed: 0, rate: null });
});

test('the facts are read page by page within the window, kept to the caller’s Teams, and a bound says it truncated', async () => {
  const queries: FactsQuery[] = [];
  const pages: FactsPage[] = [
    { facts: [item('1'), item('2', { team: 'hidden' })], nextBefore: 'c1' },
    { facts: [item('3')], nextBefore: 'c2' },
    { facts: [item('4')], nextBefore: null },
  ];
  const source = { factsPage: async (query: FactsQuery) => { queries.push(query); return pages[queries.length - 1]!; } };
  const all = await readDeliveryEconomics(source, { window: '7d', teams: ['bronze'], now: until });
  assert.deepEqual(queries.map(q => [q.since, q.before ?? null, q.limit]), [[iso(since), null, 25], [iso(since), 'c1', 25], [iso(since), 'c2', 25]]);
  assert.equal(all.merged, 3);
  assert.equal(all.truncated, false);
  queries.length = 0;
  const cut = await readDeliveryEconomics(source, { window: '7d', teams: ['bronze'], now: until, maxPages: 2 });
  assert.equal(cut.truncated, true);
  assert.equal(cut.scanned, 2);
  const runsCut = measure([item('1', { extra: { truncated: { shifts: false, runs: true, pullRequests: false, statusTransitions: false, gateTransitions: false } } })]);
  assert.deepEqual([runsCut.truncated, runsCut.runsTruncated], [true, 1]);
});

test('only the Insights windows are accepted', () => {
  assert.deepEqual(['24h', '7d', '30d', '1y', 'constructor', 7].map(isEconomicsWindow), [true, true, true, false, false, false]);
});

test('GET /api/ploeg/economics measures the live facts for a signed-in user, and the demo answers that it measured nothing', async t => {
  const env = `UNFOLD_PLOEG_TEST_${randomBytes(8).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  const seen: string[] = [];
  const team = ploegDemo.teams[0]!.id;
  const merged = item('41', { team, runs: [run('410', { usage: { costUsd: 0.75 } }), run('411', { state: 'running', finishedAt: null, usage: null })], pullRequests: [pr({ mergedAt: new Date(Date.now() - 3_600_000).toISOString() })] });
  const upstream = createServer((req, res) => {
    seen.push(req.url!);
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
  const live = await application('live', config => { config.ploeg = { url: `http://127.0.0.1:${address.port}`, tokenEnv: env }; });
  t.after(() => live.close());
  const session = await login(live.url);
  const result = await request(live.url, '/api/ploeg/economics?window=24h', session);
  assert.equal(result.status, 200, result.text);
  assert.equal(result.body.demo, false);
  assert.equal(result.body.window, '24h');
  assert.deepEqual([result.body.merged, result.body.settledUsd, result.body.costPerMergedUsd, result.body.sampleTooSmall, result.body.unsettled.runs], [1, 0.75, null, true, 1]);
  assert(seen.some(path => /\/facts\?since=[^&]+&limit=25$/.test(path)), seen.join(', '));
  assert.equal((await request(live.url, '/api/ploeg/economics?window=1y', session)).body.error.code, 'ploeg_filter');
  assert.equal((await request(live.url, '/api/ploeg/economics')).status, 401, 'a signed-out caller reads nothing');

  const demo = await application('demo');
  t.after(() => demo.close());
  const answer = await request(demo.url, '/api/ploeg/economics?window=7d');
  assert.deepEqual(answer.body, { demo: true, window: '7d' }, 'the demo invents no model call or spend');
});
