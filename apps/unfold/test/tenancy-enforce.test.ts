import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Auth } from '../src/auth.ts';
import { PloegClient } from '../src/ploeg.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { Store } from '../src/store.ts';
import { narrowedMemberships, type Membership } from '../src/tenancy.ts';
import { tenancySettings } from '../src/tenant-scope.ts';
import type { AppConfig, Repository, User } from '../src/types.ts';
import type { TaskSourceConfig } from '../src/tasks.ts';
import { application, configuration, request } from './api-support.ts';
import { testTimeout } from './timeframes.ts';

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

async function tracker(t: TestContext) {
  const requests: string[] = [];
  const issue = (owner: string) => ({ id: 1733, number: 17, title: `Task of ${owner}`, body: 'Tracker text.', state: 'open', updated_at: '2026-10-01T10:00:00Z', html_url: '', labels: [] });
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    requests.push(url.pathname);
    res.setHeader('Content-Type', 'application/json');
    const match = /^\/api\/v1\/repos\/([a-z]+)\/([a-z]+)\/issues(\/17)?$/.exec(url.pathname);
    if (!match) { res.writeHead(404); res.end('{}'); return; }
    const body = { ...issue(`${match[1]}/${match[2]}`), html_url: `http://127.0.0.1/${match[1]}/${match[2]}/issues/17` };
    res.end(JSON.stringify(match[3] ? body : [body]));
  });
  const url = await listen(server);
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeIdleConnections(); }));
  return { url, requests };
}

const owners = {
  a: { tenant: 'tenant-a' }, b: { tenant: 'tenant-b' },
  x: { tenant: 'agency', client: 'x' }, y: { tenant: 'agency', client: 'y' }, shared: { tenant: 'agency' },
} as const;
type Key = keyof typeof owners;
const keys = Object.keys(owners) as Key[];

function configure(config: AppConfig, trackerUrl: string, withOwners: boolean, tenancy?: unknown) {
  config.repositories = keys.map((key): Repository => ({ id: `repo-${key}`, name: `Repository ${key}`, description: '', url: `demo://${key}`, baseBranch: 'main', verify: ['true'], ...(withOwners ? owners[key] : {}) }));
  config.taskSources = keys.map((key): TaskSourceConfig => ({ id: `src-${key}`, name: `Source ${key}`, provider: 'forgejo', baseUrl: `${trackerUrl}/api/v1`, project: `${key}/app`, repositoryId: `repo-${key}`, token: 'tracker-service-token-271828', executionOwner: 'interactive', ...(withOwners ? owners[key] : {}) }));
  if (tenancy !== undefined) config.tenancy = tenancySettings(tenancy);
}

const people: Record<string, Membership[]> = {
  alice: [{ kind: 'tenant', tenant: 'tenant-a', role: 'developer' }],
  bob: [{ kind: 'tenant', tenant: 'tenant-b', role: 'developer' }],
  xena: [{ kind: 'client', tenant: 'agency', client: 'x' }],
  yuri: [{ kind: 'client', tenant: 'agency', client: 'y' }],
  vera: [{ kind: 'tenant', tenant: 'agency', role: 'viewer' }],
  dana: [{ kind: 'tenant', tenant: 'agency', role: 'developer' }],
  root: [],
};

async function signIn(server: Awaited<ReturnType<typeof application>>, id: string, role: User['role'] = 'operator') {
  if (!server.app.store.getUser(id)) server.app.store.addUser({ id, name: id, role, passwordHash: '', memberships: people[id] });
  return new Auth(server.app.store, server.config).issue({ id, name: id, role }).cookie.split(';')[0];
}

const importBody = (sourceId: string) => ({ sourceId, taskId: '17', revision: 'r', teamId: 'delivery', runtime: 'opencode', budgetUsd: 1 });

async function probes(server: Awaited<ReturnType<typeof application>>, cookie: string, key: Key) {
  const base = `/api/task-sources/src-${key}/tasks`;
  return {
    list: await request(server.url, base, { cookie }),
    task: await request(server.url, `${base}/17`, { cookie }),
    status: await request(server.url, `${base}/17/ploeg`, { cookie }),
    handoff: await request(server.url, `${base}/17/handoff`, { method: 'POST', cookie, body: { team: 'delivery', revision: 'r' } }),
    importing: await request(server.url, '/api/task-imports', { method: 'POST', cookie, body: importBody(`src-${key}`) }),
    session: await request(server.url, '/api/sessions', { method: 'POST', cookie, body: { title: 'T', objective: 'O', repositoryId: `repo-${key}`, teamId: 'delivery', runtime: 'opencode', budgetUsd: 1 } }),
  };
}

async function assertAbsent(server: Awaited<ReturnType<typeof application>>, cookie: string, key: Key, upstream: { requests: string[] }, who: string) {
  const before = upstream.requests.length;
  const missing = await probes(server, cookie, 'nope' as Key);
  const result = await probes(server, cookie, key);
  for (const name of ['list', 'task', 'status', 'handoff', 'importing'] as const) {
    assert.equal(result[name].status, 404, `${who}: ${name} of ${key} is absent: ${result[name].text}`);
    assert.equal(result[name].text, missing[name].text, `${who}: ${name} of ${key} answers exactly like an unknown connection`);
  }
  assert.equal(result.session.status, 400, result.session.text);
  assert.equal(result.session.text, missing.session.text, `${who}: a session on repo-${key} answers exactly like an unknown repository`);
  assert.deepEqual(upstream.requests.slice(before), [], `${who}: no tracker request was made with ${key}'s service token`);
  const sources = await request(server.url, '/api/task-sources', { cookie });
  assert(!sources.body.some((entry: { id: string }) => entry.id === `src-${key}`), `${who}: src-${key} is not listed`);
  const bootstrap = await request(server.url, '/api/bootstrap', { cookie });
  assert(!bootstrap.body.repositories.some((entry: { id: string }) => entry.id === `repo-${key}`), `${who}: repo-${key} is not in bootstrap`);
  assert(!bootstrap.body.taskSources.some((entry: { id: string }) => entry.id === `src-${key}`), `${who}: src-${key} is not in bootstrap`);
  const lookup = await request(server.url, `/api/tasks/lookup?provider=vikunja&id=17`, { cookie });
  assert.equal(lookup.status, 404, lookup.text);
}

test('a user in Tenant A gets 404 for Tenant B\'s source, task and repository, and no service-token read happens', { timeout: testTimeout(30_000) }, async t => {
  const upstream = await tracker(t);
  const server = await application('live', config => configure(config, upstream.url, true, { enforce: true }));
  t.after(() => server.close());
  const alice = await signIn(server, 'alice');
  const bob = await signIn(server, 'bob');
  await assertAbsent(server, alice, 'b', upstream, 'alice');
  await assertAbsent(server, bob, 'a', upstream, 'bob');
  for (const [cookie, key] of [[alice, 'a'], [bob, 'b']] as const) {
    assert.equal((await request(server.url, `/api/task-sources/src-${key}/tasks/17`, { cookie })).status, 200, `the own Tenant's task reads`);
    assert.deepEqual((await request(server.url, '/api/task-sources', { cookie })).body.map((entry: { id: string }) => entry.id), [`src-${key}`]);
    assert.deepEqual((await request(server.url, '/api/bootstrap', { cookie })).body.repositories.map((entry: { id: string }) => entry.id), [`repo-${key}`]);
  }
});

test('a Client user gets 404 for another Client\'s and the Tenant-wide source, task and repository, and reads but does not change its own', { timeout: testTimeout(30_000) }, async t => {
  const upstream = await tracker(t);
  const server = await application('live', config => configure(config, upstream.url, true, { enforce: true }));
  t.after(() => server.close());
  const xena = await signIn(server, 'xena');
  const yuri = await signIn(server, 'yuri');
  for (const key of ['y', 'shared', 'a', 'b'] as const) await assertAbsent(server, xena, key, upstream, 'xena');
  for (const key of ['x', 'shared'] as const) await assertAbsent(server, yuri, key, upstream, 'yuri');
  assert.deepEqual((await request(server.url, '/api/task-sources', { cookie: xena })).body.map((entry: { id: string }) => entry.id), ['src-x']);
  assert.equal((await request(server.url, '/api/task-sources/src-x/tasks/17', { cookie: xena })).status, 200);
  const own = await probes(server, xena, 'x');
  assert.equal(own.importing.status, 403, own.importing.text);
  assert.equal(own.handoff.status, 403, own.handoff.text);

  const vera = await signIn(server, 'vera');
  assert.deepEqual((await request(server.url, '/api/task-sources', { cookie: vera })).body.map((entry: { id: string }) => entry.id), ['src-x', 'src-y', 'src-shared'], 'a Tenant membership reaches every Client of the Tenant');
  assert.equal((await request(server.url, '/api/task-imports', { method: 'POST', cookie: vera, body: importBody('src-shared') })).status, 403, 'a Viewer membership reads but does not import');
  const dana = await signIn(server, 'dana');
  const allowed = await request(server.url, '/api/task-imports', { method: 'POST', cookie: dana, body: importBody('src-shared') });
  assert.equal(allowed.status, 409, `a Developer membership passes the Tenant check and reaches the revision check: ${allowed.text}`);

  const root = await signIn(server, 'root', 'admin');
  assert.deepEqual((await request(server.url, '/api/task-sources', { cookie: root })).body, [], 'a workbench admin without a membership reaches nothing');
});

test('with tenancy.enforce off, every answer is byte-identical to a configuration without owners', { timeout: testTimeout(30_000) }, async t => {
  const upstream = await tracker(t);
  const today = await application('live', config => configure(config, upstream.url, false));
  t.after(() => today.close());
  const off = await application('live', config => configure(config, upstream.url, true, { enforce: false }));
  t.after(() => off.close());
  const unset = await application('live', config => configure(config, upstream.url, true));
  t.after(() => unset.close());
  const answers = async (server: Awaited<ReturnType<typeof application>>) => {
    const cookie = await signIn(server, 'xena');
    const texts: string[] = [];
    for (const path of ['/api/task-sources', '/api/bootstrap', '/api/task-sources/src-y/tasks', '/api/task-sources/src-b/tasks/17', '/api/tasks/lookup?provider=forgejo&id=17']) { const answer = await request(server.url, path, { cookie }); texts.push(`${path} ${answer.status} ${answer.text}`); }
    for (const key of ['b', 'y'] as const) {
      const result = await probes(server, cookie, key);
      for (const [name, value] of Object.entries(result)) texts.push(`${key} ${name} ${value.status} ${value.text.replace(/"id":"[^"]+"/g, '"id":"<new>"').replace(/"(createdAt|updatedAt|fetchedAt)":"[^"]+"/g, '"$1":"<time>"')}`);
    }
    return texts;
  };
  const expected = await answers(today);
  assert(expected.some(line => line.startsWith('/api/task-sources/src-b/tasks/17 200')), 'with the flag off, another Tenant\'s task reads as today');
  assert.deepEqual(await answers(off), expected);
  assert.deepEqual(await answers(unset), expected);
});

test('tenancy takes only enforce, as true or false', () => {
  assert.deepEqual(tenancySettings(undefined), { enforce: false });
  assert.deepEqual(tenancySettings({}), { enforce: false });
  assert.deepEqual(tenancySettings({ enforce: true }), { enforce: true });
  assert.throws(() => tenancySettings({ enforce: 'yes' }), /tenancy.enforce must be true or false/);
  assert.throws(() => tenancySettings({ enforce: true, mode: 'strict' }), /tenancy takes only enforce/);
  assert.throws(() => tenancySettings([]), /tenancy takes only enforce/);
});

async function ploegUpstream(t: TestContext) {
  const env = `UNFOLD_PLOEG_TENANCY_${randomBytes(6).toString('hex').toUpperCase()}`;
  process.env[env] = randomBytes(24).toString('hex');
  const details = structuredClone(ploegDemo.details);
  const ofX = new Set(['105', '101', '102', '106']);
  for (const [id, entry] of Object.entries(details)) entry.item.target = { forge: 'forgejo', owner: 'agency', repo: ofX.has(id) ? 'x' : 'y', baseBranch: 'main' };
  const run = (id: string, workItemId: string, state: 'running' | 'finished') => ({ id, workItemId, workItemTitle: `Work ${workItemId}`, externalRef: '', team: 'delivery', role: 'builder', round: 1, writes: true, state, outcome: state === 'finished' ? 'failed' : '', verdict: '', failureReason: '', startedAt: '2026-10-01T08:00:00Z', finishedAt: state === 'finished' ? '2026-10-01T08:10:00Z' : null, durationSeconds: null, authorizedUsd: 2, settledUsd: null, observedUsd: null, reservedModels: [], usage: { inputTokens: 0, outputTokens: 0, models: [] } });
  const server = createServer((req: IncomingMessage, res) => {
    const url = new URL(req.url!, 'http://fixture.invalid');
    const send = (data: object) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data }));
    if (url.pathname.endsWith('/teams')) return send({ teams: ploegDemo.teams });
    if (url.pathname.endsWith('/runs')) return send({ runs: url.searchParams.get('state') === 'running' ? [run('40', '102', 'running'), run('41', '103', 'running')] : [run('31', '105', 'finished'), run('30', '112', 'finished')], nextBefore: null });
    if (url.pathname.endsWith('/work-items')) {
      const wanted = url.searchParams.get('state')?.split(',');
      const items = Object.values(details).map(entry => entry.item).filter(item => item.team === url.searchParams.get('team') && (!wanted || wanted.includes(item.state)) && BigInt(item.id) > BigInt(url.searchParams.get('after') || '0')).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      return send({ items, nextCursor: null });
    }
    const id = url.pathname.split('/').at(-1)!;
    if (details[id]) return send(details[id]);
    res.writeHead(404).end();
  });
  const url = await listen(server);
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); delete process.env[env]; });
  return { config: { url, tokenEnv: env }, ofX };
}

function ploegClient(upstream: { config: { url: string; tokenEnv: string } }, enforce: boolean) {
  const config: AppConfig = { ...configuration('/unused', 'live'), ploeg: upstream.config };
  config.repositories = [{ id: 'repo-x', name: 'X', description: '', url: 'https://forge.example/agency/x.git', baseBranch: 'main', verify: [], tenant: 'agency', client: 'x' }, { id: 'repo-y', name: 'Y', description: '', url: 'https://forge.example/agency/y.git', baseBranch: 'main', verify: [], tenant: 'agency', client: 'y' }];
  config.tenancy = { enforce };
  return new PloegClient(config);
}

test('Work Items, Now, Proposed and Runs read from Ploeg are scoped by the Tenant and Client that own the target repository', async t => {
  const upstream = await ploegUpstream(t);
  const xena: User = { id: 'xena', name: 'xena', role: 'admin', memberships: people.xena };
  const tenantWide: User = { id: 'dana', name: 'dana', role: 'admin', memberships: people.dana };
  const ploeg = ploegClient(upstream, true);
  const now = await ploeg.now(xena);
  assert.deepEqual(now.errors, {});
  const shown = [...now.waiting, ...now.active].map(entry => entry.id);
  assert(shown.length > 0 && shown.every(id => upstream.ofX.has(id)), `Now lists Client x's Work Items only: ${shown}`);
  assert.deepEqual(now.running.map(entry => entry.id), ['40'], 'a running Run of Client y\'s Work Item is left out');
  assert.deepEqual(now.recent.map(entry => entry.id), ['31']);
  assert((await ploeg.proposed(xena)).items.every(entry => upstream.ofX.has(entry.id)));
  assert((await ploeg.items(xena, 'delivery', 'all')).items.every(entry => upstream.ofX.has(entry.id)));
  assert.equal((await ploeg.detail(xena, '105')).item.id, '105');
  await assert.rejects(ploeg.detail(xena, '112'), (error: any) => error.status === 404 && error.code === 'ploeg_not_found');
  assert.deepEqual((await ploeg.runs(xena, {})).runs.map(entry => entry.id), ['31'], 'a Run is kept when its Work Item is reached');

  const wide = await ploeg.now(tenantWide);
  assert([...wide.waiting, ...wide.active].some(entry => !upstream.ofX.has(entry.id)), 'a Tenant membership reaches every Client');
  const outsider = await ploeg.now({ id: 'root', name: 'root', role: 'admin', memberships: [] });
  assert.deepEqual([outsider.waiting, outsider.active, outsider.running, outsider.recent], [[], [], [], []]);

  const off = await ploegClient(upstream, false).now(xena);
  const admin = await ploegClient(upstream, false).now({ id: 'admin', name: 'admin', role: 'admin' });
  assert.deepEqual({ ...off, fetchedAt: '' }, { ...admin, fetchedAt: '' }, 'with the flag off, memberships change nothing');
});

test('a delegated unfold-mcp credential that lowers the role keeps no wider memberships than that role', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-delegation-'));
  const store = new Store(join(directory, 'unfold.sqlite'));
  t.after(async () => { store.db.close(); await rm(directory, { recursive: true, force: true }); });
  const held: Membership[] = [{ kind: 'tenant', tenant: 'agency', role: 'admin' }, { kind: 'tenant', tenant: 'other', role: 'developer' }, { kind: 'client', tenant: 'agency', client: 'x' }];
  store.addUser({ id: 'pat', name: 'pat', role: 'admin', passwordHash: '', memberships: held });
  const auth = new Auth(store, { ...configuration(directory, 'live'), auth: { secureCookies: false, sessionHours: 1, bootstrapName: 'admin' } });
  const as = (token: string) => ({ headers: { authorization: `Bearer ${token}` }, url: '/api/task-sources/src-x/tasks/17/handoff', method: 'POST' }) as unknown as IncomingMessage;

  const token = narrowedMemberships(held, [{ kind: 'tenant', tenant: 'agency', role: 'admin' }, { kind: 'client', tenant: 'agency', client: 'x' }, { kind: 'client', tenant: 'agency', client: 'y' }], 'viewer');
  assert.deepEqual(token, [{ kind: 'tenant', tenant: 'agency', role: 'viewer' }, { kind: 'client', tenant: 'agency', client: 'x' }], 'only what the account and the token both hold, at most Viewer for a viewer');

  const delegated = auth.delegate({ id: 'pat', name: 'pat', role: 'viewer', memberships: token }, 60_000);
  t.after(() => delegated.revoke());
  assert.deepEqual(auth.user(as(delegated.token))?.memberships, token);

  const wider = auth.delegate({ id: 'pat', name: 'pat', role: 'operator', memberships: held }, 60_000);
  t.after(() => wider.revoke());
  assert.deepEqual(auth.user(as(wider.token))?.memberships, [{ kind: 'tenant', tenant: 'agency', role: 'developer' }, { kind: 'tenant', tenant: 'other', role: 'developer' }, { kind: 'client', tenant: 'agency', client: 'x' }], 'an operator credential holds at most Developer');

  store.setMemberships('pat', [{ kind: 'tenant', tenant: 'agency', role: 'viewer' }]);
  assert.deepEqual(auth.user(as(wider.token))?.memberships, [{ kind: 'tenant', tenant: 'agency', role: 'viewer' }], 'a membership the account lost since minting is gone at the next use');
});
