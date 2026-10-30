import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { Auth } from '../src/auth.ts';
import type { FactsPullRequest, FactsRun, WorkItemFacts } from '../src/cards/facts.ts';
import { minimumMergedSample } from '../src/delivery-economics.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import type { Membership } from '../src/tenancy.ts';
import { tenancySettings } from '../src/tenant-scope.ts';
import type { AppConfig, Repository } from '../src/types.ts';
import { application, request } from './api-support.ts';
import { testTimeout } from './timeframes.ts';

const owners = {
  a: { tenant: 'tenant-a', path: ['tenant-a', 'app'] },
  b: { tenant: 'tenant-b', path: ['tenant-b', 'app'] },
  x: { tenant: 'agency', client: 'x', path: ['agency', 'x'] },
  y: { tenant: 'agency', client: 'y', path: ['agency', 'y'] },
} as const;
type Key = keyof typeof owners;
const keys = Object.keys(owners) as Key[];
const workItemOf: Record<Key, string> = { a: '101', b: '102', x: '105', y: '106' };
const costOf: Record<Key, number> = { a: 1, b: 2, x: 4, y: 8 };

const people: Record<string, Membership[]> = {
  alice: [{ kind: 'tenant', tenant: 'tenant-a', role: 'developer' }],
  bob: [{ kind: 'tenant', tenant: 'tenant-b', role: 'developer' }],
  xena: [{ kind: 'client', tenant: 'agency', client: 'x' }],
  yuri: [{ kind: 'client', tenant: 'agency', client: 'y' }],
  dana: [{ kind: 'tenant', tenant: 'agency', role: 'developer' }],
};

const iso = (ms: number) => new Date(ms).toISOString();

function facts(key: Key, now: number, count = 1): WorkItemFacts[] {
  const [owner, repo] = owners[key].path;
  return Array.from({ length: count }, (_, index) => {
    const id = index === 0 ? workItemOf[key] : String(Number(workItemOf[key]) * 1000 + index);
    const run: FactsRun = { id: `${id}0`, shiftId: '1', role: 'builder', round: 1, writes: true, state: 'finished', startedAt: iso(now - 7_200_000), finishedAt: iso(now - 5_400_000), outcome: 'pr_opened', links: [], authorizedUsd: 10, usage: { costUsd: costOf[key] } };
    const pr: FactsPullRequest = {
      id, forge: 'forgejo', owner, repo, number: Number(id), url: `https://forge.example/${owner}/${repo}/pulls/${id}`, shiftId: '1', branch: `ploeg/${id}`, baseBranch: 'main',
      state: 'merged', draft: false, author: 'ploeg-bot', headSha: 'abc', mergeCommitSha: null, openedAt: iso(now - 5_000_000), firstSeenAt: iso(now - 5_000_000), mergedAt: iso(now - 3_600_000), mergedBy: 'reviewer', closedAt: iso(now - 3_600_000), updatedAt: iso(now - 3_600_000),
      additions: 1, deletions: 1, changedFiles: 1, labels: [], commits: 1, firstCommitAt: null, forcePushes: 0, activityCapturedAt: null, activityTruncated: false, commitStatus: null,
      ciRunsCapturedAt: null, ciRunsSource: null, ciRunsTruncated: false, ciRuns: [], reviews: [], events: [], filesCapturedAt: null, filesTruncated: false, files: [], changedPaths: null, reverts: [], deployments: [],
    };
    return {
      workItem: { id, provider: 'vikunja', externalId: id, externalRef: `VIK-${id}`, url: '', title: `Work of ${key}`, state: 'done', team: 'delivery', createdAt: iso(now - 86_400_000), updatedAt: iso(now - 3_600_000), trackerCreatedAt: null, estimateSeconds: null, target: { forge: 'forgejo', owner, repo, baseBranch: 'main' }, epics: [], withdrawals: [] },
      activityAt: iso(now - 3_600_000), shifts: [], runs: [run], liveUsage: [], pullRequests: [pr], statusTransitions: [], gateTransitions: [], deployEnvironments: [], roster: [], botLogins: ['ploeg-bot'],
      truncated: { shifts: false, runs: false, pullRequests: false, statusTransitions: false, gateTransitions: false },
    };
  });
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

async function ploegUpstream(t: TestContext, perOwner: Partial<Record<Key, number>> = {}) {
  const env = `UNFOLD_PLOEG_TENANCY_FACTS_${randomBytes(6).toString('hex').toUpperCase()}`;
  process.env[env] = randomBytes(24).toString('hex');
  const now = Date.now();
  const all = keys.flatMap(key => facts(key, now, perOwner[key] ?? 1));
  const details = structuredClone(ploegDemo.details);
  for (const key of keys) {
    const [owner, repo] = owners[key].path;
    details[workItemOf[key]]!.item.target = { forge: 'forgejo', owner, repo, baseBranch: 'main' };
  }
  const events = keys.map((key, index) => ({ id: String(2000 + index), at: iso(now - 60_000), actor: 'ploegd', action: 'run.finished', workItemId: workItemOf[key], team: 'delivery', detail: {}, workItemTitle: `Work of ${key}` }));
  const accounts = keys.map((key, index) => ({ runId: String(3000 + index), workItemId: workItemOf[key], team: 'delivery', accountState: 'blocked', heldUsd: costOf[key], since: iso(now - 60_000) }));
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://fixture.invalid');
    const send = (data: object) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data }));
    if (url.pathname.endsWith('/teams')) return send({ teams: ploegDemo.teams });
    if (url.pathname.endsWith('/facts')) {
      const start = Number(url.searchParams.get('before') ?? '0');
      const limit = Number(url.searchParams.get('limit') ?? '25');
      return send({ facts: all.slice(start, start + limit), nextBefore: start + limit < all.length ? String(start + limit) : null });
    }
    if (url.pathname.endsWith('/events')) return send({ events });
    if (url.pathname.endsWith('/summary')) return send({ generatedAt: iso(now), window: url.searchParams.get('window'), teams: [], totals: {} });
    if (url.pathname.endsWith('/unsettled-accounts')) return send({ generatedAt: iso(now), accounts });
    const id = url.pathname.split('/').at(-1)!;
    if (url.pathname.includes('/work-items/') && details[id]) return send(details[id]);
    res.writeHead(404).end();
  });
  const address = await listen(server);
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeIdleConnections(); }); delete process.env[env]; });
  return { url: address, tokenEnv: env };
}

function configure(config: AppConfig, ploeg: { url: string; tokenEnv: string }, withOwners: boolean, tenancy?: unknown) {
  config.ploeg = ploeg;
  config.repositories = keys.map((key): Repository => {
    const { path, ...owner } = owners[key];
    return { id: `repo-${key}`, name: `Repository ${key}`, description: '', url: `https://forge.example/${path.join('/')}.git`, baseBranch: 'main', verify: [], ...(withOwners ? owner : {}) };
  });
  if (tenancy !== undefined) config.tenancy = tenancySettings(tenancy);
}

type App = Awaited<ReturnType<typeof application>>;

async function signIn(server: App, id: string) {
  if (!server.app.store.getUser(id)) server.app.store.addUser({ id, name: id, role: 'admin', passwordHash: '', memberships: people[id] ?? [] });
  return new Auth(server.app.store, server.config).issue({ id, name: id, role: 'admin' }).cookie.split(';')[0];
}

async function read(server: App, cookie: string) {
  const economics = await request(server.url, '/api/ploeg/economics?window=24h', { cookie });
  const deliveries = await request(server.url, '/api/ploeg/deliveries?window=24h', { cookie });
  const csv = await request(server.url, '/api/ploeg/deliveries?window=24h&format=csv', { cookie });
  const events = await request(server.url, '/api/ploeg/events', { cookie });
  const summary = await request(server.url, '/api/ploeg/summary?window=24h', { cookie });
  for (const answer of [economics, deliveries, csv, events, summary]) assert.equal(answer.status, 200, answer.text);
  return { economics, deliveries, csv, events, summary };
}

const ids = (rows: { workItemId: string }[]) => rows.map(row => row.workItemId).sort();
const csvIds = (text: string) => text.split('\r\n').slice(1).filter(Boolean).map(line => line.split(',')[0]).sort();

async function assertSees(server: App, who: string, seen: Key[]) {
  const answer = await read(server, await signIn(server, who));
  const expected = seen.map(key => workItemOf[key]).sort();
  const spend = seen.reduce((sum, key) => sum + costOf[key], 0);
  assert.equal(answer.economics.body.merged, seen.length, `${who}: only reached Work Items count as merged`);
  assert.equal(answer.economics.body.settledUsd, spend, `${who}: only reached Work Items add spend`);
  assert.equal(answer.economics.body.scanned, seen.length, `${who}: an unreached Work Item is not even scanned`);
  assert.deepEqual(answer.economics.body.cleanMerge, { clean: seen.length, merged: seen.length, closed: 0, rate: seen.length ? 1 : null }, `${who}: the clean-merge rate covers reached Work Items only`);
  assert.deepEqual(ids(answer.deliveries.body.rows), expected, `${who}: the ledger lists reached Work Items only`);
  assert.equal(answer.deliveries.body.totals.tokenChargeBaseUsd, spend, `${who}: the ledger totals cover reached Work Items only`);
  assert.equal(answer.deliveries.body.totals.kinds.merged, seen.length);
  assert.deepEqual(csvIds(answer.csv.text), expected, `${who}: the CSV export is scoped too`);
  assert.deepEqual(ids(answer.events.body.events), expected, `${who}: Activity lists events of reached Work Items only`);
  assert.deepEqual(ids(answer.summary.body.unsettled.accounts), expected, `${who}: unsettled accounts of unreached Work Items are left out`);
  assert.equal(answer.summary.body.unsettled.heldUsd, spend);
}

test('Insights economics, the Delivery ledger and its CSV, Activity and unsettled accounts keep a Tenant to its own Work Items', { timeout: testTimeout(30_000) }, async t => {
  const ploeg = await ploegUpstream(t);
  const server = await application('live', config => configure(config, ploeg, true, { enforce: true }));
  t.after(() => server.close());
  await assertSees(server, 'alice', ['a']);
  await assertSees(server, 'bob', ['b']);
  await assertSees(server, 'dana', ['x', 'y']);
  await assertSees(server, 'nobody', []);
});

test('a Client membership reaches its own Client\'s Work Items in every delivery figure, never another Client\'s', { timeout: testTimeout(30_000) }, async t => {
  const ploeg = await ploegUpstream(t);
  const server = await application('live', config => configure(config, ploeg, true, { enforce: true }));
  t.after(() => server.close());
  await assertSees(server, 'xena', ['x']);
  await assertSees(server, 'yuri', ['y']);
});

test('another Tenant\'s merged Work Items never lift the reader over the sample threshold', { timeout: testTimeout(30_000) }, async t => {
  const ploeg = await ploegUpstream(t, { a: 1, b: minimumMergedSample });
  const server = await application('live', config => configure(config, ploeg, true, { enforce: true }));
  t.after(() => server.close());
  const alice = (await read(server, await signIn(server, 'alice'))).economics.body;
  assert.equal(alice.merged, 1);
  assert.equal(alice.sampleTooSmall, true);
  assert.equal(alice.costPerMergedUsd, null);
  assert.deepEqual(alice.teams.map((team: { team: string; merged: number; costPerMergedUsd: number | null }) => [team.team, team.merged, team.costPerMergedUsd]), [['delivery', 1, null]]);
  const bob = (await read(server, await signIn(server, 'bob'))).economics.body;
  assert.equal(bob.merged, minimumMergedSample);
  assert.equal(bob.sampleTooSmall, false);
  assert.equal(bob.costPerMergedUsd, costOf.b);
});

test('with tenancy.enforce off, the delivery figures are byte-identical to a configuration without owners', { timeout: testTimeout(30_000) }, async t => {
  const ploeg = await ploegUpstream(t);
  const answers = async (withOwners: boolean, tenancy?: unknown) => {
    const server = await application('live', config => configure(config, ploeg, withOwners, tenancy));
    t.after(() => server.close());
    const answer = await read(server, await signIn(server, 'xena'));
    const stable = (text: string) => text.replace(/"(since|until|generatedAt|fetchedAt)":"[^"]+"/g, '"$1":"<time>"');
    return Object.entries(answer).map(([name, value]) => `${name} ${value.status} ${stable(value.text)}`);
  };
  const expected = await answers(false);
  assert(expected.some(line => line.startsWith('csv 200') && keys.every(key => line.includes(`\r\n${workItemOf[key]},`))), 'with the flag off, every Work Item reads as today');
  assert.deepEqual(await answers(true, { enforce: false }), expected);
  assert.deepEqual(await answers(true), expected);
});
