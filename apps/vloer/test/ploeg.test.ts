import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { PloegClient, validatePloeg, type PloegDetail } from '../src/ploeg.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { hashPassword } from '../src/auth.ts';
import { application, configuration, login, request } from './api-support.ts';

const admin = { id: 'admin', name: 'admin', role: 'admin' as const };

async function upstream(t: TestContext) {
  const env = `VLOER_PLOEG_TEST_${randomBytes(8).toString('hex').toUpperCase()}`;
  let bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  const seen: { path: string; authorized: boolean; method: string }[] = [];
  const details = structuredClone(ploegDemo.details);
  let intercept: ((req: IncomingMessage, res: ServerResponse) => boolean) | undefined;
  const server = createServer((req, res) => {
    seen.push({ path: req.url!, authorized: req.headers.authorization === `Bearer ${bearer}`, method: req.method! });
    if (intercept?.(req, res)) return;
    if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
    const url = new URL(req.url!, 'http://fixture.invalid');
    const send = (data: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data as object }));
    if (url.pathname.endsWith('/teams')) { send({ teams: ploegDemo.teams }); return; }
    if (url.pathname.endsWith('/work-items')) {
      const items = Object.values(details).map(detail => detail.item).filter(item => item.team === url.searchParams.get('team') && (!url.searchParams.has('state') || item.state === url.searchParams.get('state')) && BigInt(item.id) > BigInt(url.searchParams.get('after') || '0'));
      const limit = Number(url.searchParams.get('limit') || 25);
      send({ items: items.slice(0, limit), nextCursor: items.length > limit ? items[limit - 1].id : null }); return;
    }
    const id = url.pathname.split('/').at(-1)!;
    if (details[id]) { send(details[id]); return; }
    res.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); delete process.env[env]; });
  const address = server.address(); assert(address && typeof address !== 'string');
  const config = { url: `http://127.0.0.1:${address.port}`, tokenEnv: env };
  return { config, seen, details, get token() { return bearer; }, rotate() { bearer = randomBytes(24).toString('hex'); process.env[env] = bearer; }, intercept(handler: typeof intercept) { intercept = handler; } };
}

function client(config: NonNullable<ReturnType<typeof validatePloeg>>) { return new PloegClient({ ...configuration('/unused', 'live'), ploeg: config }); }

test('operator configuration stores only environment references and explicit team access', () => {
  const config = validatePloeg({ url: 'https://ploeg.example.test/base/', tokenEnv: 'PLOEG_OPERATOR_TOKEN', teams: ['delivery'], userTeams: { operator: ['delivery'] } }, 'live');
  assert.equal(config?.url, 'https://ploeg.example.test/base');
  assert.deepEqual(config?.userTeams, { operator: ['delivery'] });
  assert.throws(() => validatePloeg({ url: 'https://ploeg.example.test', token: randomBytes(24).toString('hex') }, 'live'), /credentials/);
  for (const url of ['ftp://ploeg.example.test', 'https://user:pass@ploeg.example.test', 'https://ploeg.example.test?token=x', 'https://ploeg.example.test/#x', 'https://ploeg.example.test/%2fescape']) assert.throws(() => validatePloeg({ url, tokenEnv: 'PLOEG_TOKEN' }, 'live'));
  assert.throws(() => validatePloeg({ url: 'https://ploeg.example.test' }, 'live'), /tokenEnv/);
  assert.throws(() => validatePloeg({ url: 'https://ploeg.example.test', tokenEnv: 'bad-env-name' }, 'live'), /environment variable/);
  assert.throws(() => validatePloeg({ url: 'https://ploeg.example.test', demo: true }, 'live'), /demo mode/);
  assert.throws(() => validatePloeg({ url: 'https://ploeg.example.test', tokenEnv: 'PLOEG_TOKEN', teams: ['delivery\nresearch'] }, 'live'), /team names/);
});

test('live operator projection reads all lanes, complete evidence and honest unknown costs with bounded caching', async t => {
  const upstreamApi = await upstream(t);
  const ploeg = client(upstreamApi.config);
  const overview = await ploeg.overview(admin);
  assert.equal(overview.demo, false);
  assert.equal(overview.available, true);
  assert.equal(overview.teams[0].paused, null);
  assert.equal(overview.lanes?.needs_human.items[0].id, '101');
  assert.equal(overview.lanes?.leased.items[0].id, '102');
  assert.equal(overview.lanes?.queued.items[0].id, '103');
  assert.deepEqual(overview.lanes?.awaiting_review.items.map(item => item.id), ['105']);
  assert(upstreamApi.seen.some(call => call.path.includes('state=awaiting_review')));
  assert.equal(upstreamApi.seen.length, 6);
  await ploeg.overview(admin);
  assert.equal(upstreamApi.seen.length, 6);
  await ploeg.overview(admin, undefined, true);
  assert.equal(upstreamApi.seen.length, 12);
  upstreamApi.rotate();
  await ploeg.overview(admin);
  assert.equal(upstreamApi.seen.length, 18, 'rotating the consumer credential invalidates cached scope');
  const detail = await ploeg.detail(admin, '101');
  assert.equal(detail.demo, false);
  assert.equal(detail.runs[0].costStatus, 'unknown');
  assert.equal(detail.runs[0].usage, null);
  assert.equal(detail.checkpoints.length, 1);
  assert.equal(detail.events.length, 1);
  assert.equal(detail.shifts.length, 1);
  assert(upstreamApi.seen.every(call => call.authorized && call.method === 'GET'));
});

test('HTTP projection authenticates and intersects local user mapping with deployment and upstream team scope', async t => {
  const upstreamApi = await upstream(t);
  const server = await application('live', config => { config.ploeg = { ...upstreamApi.config, teams: ['delivery'], userTeams: { reader: ['delivery', 'research'], other: ['research'] } }; });
  t.after(() => server.close());
  assert.equal((await request(server.url, '/api/ploeg')).status, 401);
  assert.equal(upstreamApi.seen.length, 0);
  const password = randomBytes(24).toString('hex');
  for (const id of ['reader', 'other', 'unmapped']) server.app.store.addUser({ id, name: id, role: 'viewer', passwordHash: await hashPassword(password) });
  const reader = await login(server.url, 'reader', password);
  const other = await login(server.url, 'other', password);
  const unmapped = await login(server.url, 'unmapped', password);
  const administrator = await login(server.url);
  assert.equal((await request(server.url, '/api/ploeg', unmapped)).status, 403);
  const view = await request(server.url, '/api/ploeg', reader);
  assert.equal(view.status, 200);
  assert.deepEqual(view.body.teams.map((team: { id: string }) => team.id), ['delivery']);
  assert.deepEqual((await request(server.url, '/api/ploeg', administrator)).body.teams.map((team: { id: string }) => team.id), ['delivery']);
  assert.equal((await request(server.url, '/api/ploeg/work-items/101', reader)).status, 200);
  assert.equal((await request(server.url, '/api/ploeg/work-items/104', reader)).status, 404);
  assert.equal((await request(server.url, '/api/ploeg/work-items/101', other)).status, 404);
  assert.equal((await request(server.url, '/api/ploeg?team=research', administrator)).status, 404);
  assert.equal((await request(server.url, '/api/ploeg/work-items?team=research', reader)).status, 404);
  assert.equal((await request(server.url, '/api/ploeg/work-items/101', { ...administrator, method: 'POST' })).status, 405);
  assert.equal((await request(server.url, '/api/ploeg/work-items?team=delivery&after=1e4', reader)).status, 400);
  assert.equal((await request(server.url, '/api/ploeg/work-items?team=delivery&state=unknown', reader)).status, 400);
  assert.equal((await request(server.url, '/api/bootstrap', administrator)).text.includes(upstreamApi.token), false);
  assert.equal(server.app.store.listSessions().length, 0, 'reading external work must not create execution records');
});

test('opaque bigint cursors paginate and unexpected team records or cross-item evidence fail closed', async t => {
  const upstreamApi = await upstream(t);
  for (let n = 0; n < 27; n++) {
    const id = String(9007199254740993n + BigInt(n));
    const detail = structuredClone(upstreamApi.details['103']);
    detail.item.id = id; detail.events = [];
    upstreamApi.details[id] = detail;
  }
  const ploeg = client(upstreamApi.config);
  const first = await ploeg.items(admin, 'delivery', 'queued');
  assert.equal(first.items.length, 25);
  assert.equal(typeof first.nextCursor, 'string');
  const second = await ploeg.items(admin, 'delivery', 'queued', first.nextCursor!);
  assert.equal(second.items.length, 3);
  assert.equal(second.nextCursor, null);
  assert.equal(second.items.at(-1)?.id, '9007199254741019');
  upstreamApi.intercept((req, res) => {
    if (!req.url?.includes('work-items?')) return false;
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', items: [upstreamApi.details['104'].item], nextCursor: null })); return true;
  });
  await assert.rejects(ploeg.items(admin, 'delivery', 'all', '0', true), /unsupported operator response/);
  upstreamApi.intercept(undefined);
  upstreamApi.details['101'].runs[0].team = 'research';
  await assert.rejects(ploeg.detail(admin, '101'), /unsupported operator response/);
});

test('projection strips unknown fields, credential-bearing links and audit data, including an echoed consumer credential', async t => {
  const upstreamApi = await upstream(t);
  const detail = upstreamApi.details['101'] as PloegDetail & { token?: string };
  detail.token = upstreamApi.token;
  detail.item.title = `Echo ${upstreamApi.token}`;
  detail.item.url = `https://tracker.example.test/task?token=${upstreamApi.token}`;
  detail.runs[0].links = ['javascript:alert(1)', 'https://user:pass@tracker.example.test/task', 'https://tracker.example.test/changes/1'];
  detail.events[0].detail = { reason: `Echo ${upstreamApi.token}`, environment: { other: 'private' }, secret: 'private', role: 'reviewer' };
  const result = await client(upstreamApi.config).detail(admin, '101');
  assert.equal(JSON.stringify(result).includes(upstreamApi.token), false);
  assert.equal('token' in result, false);
  assert.equal(result.item.url, '');
  assert.deepEqual(result.runs[0].links, ['https://tracker.example.test/changes/1']);
  assert.deepEqual(result.events[0].detail, { reason: 'Echo [redacted]', role: 'reviewer' });
});

test('unsupported versions, redirects, oversized payloads and observed costs without usage remain unavailable', async t => {
  const upstreamApi = await upstream(t);
  const ploeg = client(upstreamApi.config);
  upstreamApi.intercept((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '2.0', teams: [] })); return true; });
  assert.equal((await ploeg.overview(admin)).available, false);
  upstreamApi.intercept((_req, res) => { res.writeHead(302, { location: 'http://127.0.0.1:1/forbidden' }).end(); return true; });
  assert.equal((await ploeg.overview(admin, undefined, true)).available, false);
  upstreamApi.intercept((_req, res) => { res.writeHead(200, { 'content-type': 'application/json', 'content-length': 16_777_217 }).end('{}'); return true; });
  assert.match((await ploeg.overview(admin, undefined, true)).message, /16 MiB/);
  upstreamApi.intercept(undefined);
  upstreamApi.details['101'].runs[0].costStatus = 'observed';
  await assert.rejects(ploeg.detail(admin, '101'), /unsupported operator response/);
  upstreamApi.details['101'].runs[0].usage = { costUsd: 0.003, inputTokens: 80 };
  assert.equal((await ploeg.detail(admin, '101', true)).runs[0].usage?.costUsd, 0.003);
  delete process.env[upstreamApi.config.tokenEnv];
  assert.equal((await ploeg.overview(admin)).available, false);
});

test('demo operator records are explicitly illustrative and never dispatch, while unconfigured live stays unavailable', async t => {
  const demo = await application(); t.after(() => demo.close());
  const view = await request(demo.url, '/api/ploeg');
  assert.equal(view.body.demo, true);
  assert.match(view.body.message, /Illustrative.*not executed.*no model calls/);
  assert.deepEqual(view.body.lanes.awaiting_review.items.map((item: { id: string }) => item.id), ['105']);
  const review = await request(demo.url, '/api/ploeg/work-items/105');
  assert.equal(review.body.demo, true);
  assert(review.body.shifts.every((shift: { spentUsd: number; reservedUsd: number }) => shift.spentUsd === 0 && shift.reservedUsd === 0));
  assert(review.body.runs.every((run: { costStatus: string; usage: unknown }) => run.costStatus === 'unknown' && run.usage === null));
  const detail = await request(demo.url, '/api/ploeg/work-items/101');
  assert.equal(detail.body.demo, true);
  assert.equal(detail.body.runs[0].costStatus, 'unknown');
  assert.equal(detail.body.runs[0].usage, null);
  assert.equal(demo.app.store.listSessions().length, 0);
  const live = new PloegClient(configuration('/unused', 'live'));
  assert.equal((await live.overview(admin)).configured, false);
});

test('a response started before consumer credential rotation cannot restore old cached team access', async t => {
  const upstreamApi = await upstream(t);
  const ploeg = client(upstreamApi.config);
  let markStarted!: () => void;
  let releaseResponse!: () => void;
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const release = new Promise<void>(resolve => { releaseResponse = resolve; });
  let count = 0;
  upstreamApi.intercept((_req, res) => {
    const first = ++count === 1;
    const finish = () => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', teams: [ploegDemo.teams[first ? 0 : 1]] }));
    if (first) { markStarted(); void release.then(finish); } else finish();
    return true;
  });
  const old = ploeg.teams(admin).then(() => assert.fail('old access was restored'), error => assert.match(error.message, /credential changed/));
  await started;
  upstreamApi.rotate();
  assert.deepEqual((await ploeg.teams(admin)).map(team => team.id), ['research']);
  releaseResponse(); await old;
  assert.deepEqual((await ploeg.teams(admin)).map(team => team.id), ['research']);
  assert.equal(upstreamApi.seen.length, 2);
});

test('a work item whose pull request awaits review is a valid Ploeg state', async t => {
  const upstreamApi = await upstream(t);
  const item = upstreamApi.details['101'].item;
  item.state = 'awaiting_review';
  const page = await client(upstreamApi.config).items(admin, item.team, 'awaiting_review');
  assert.deepEqual(page.items.map(entry => [entry.id, entry.state]), [['101', 'awaiting_review'], ['105', 'awaiting_review']]);
});
