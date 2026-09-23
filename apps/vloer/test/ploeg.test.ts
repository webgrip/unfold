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

const summaryTeam = (team: string, awaitingReview: number) => ({ team, workItems: { queued: 1, leased: 0, awaitingReview, needsHuman: 0, proposed: 1, withdrawn: 0, done: 4, stale: 0 }, runs: { pending: 0, running: 1, finished: 5, failed: 1, stuck: 1 }, spend: { settledUsd: 1.25, reservedUsd: 0.5 }, lastActivityAt: '2026-09-10T08:00:00Z' });
const listRun = (id: string, workItemId: string, team: string) => ({ id, workItemId, workItemTitle: `Work ${workItemId}`, externalRef: '', team, role: 'builder', round: 1, writes: true, state: 'finished', outcome: 'failed', verdict: '', failureReason: 'timeout', startedAt: '2026-09-10T08:00:00Z', finishedAt: '2026-09-10T08:10:00Z', durationSeconds: 600, authorizedUsd: 2, settledUsd: null, usage: { inputTokens: 0, outputTokens: 0, models: [] } });
const reply = (res: ServerResponse, status: number, data: object) => { res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data })); return true; };

test('an older Ploeg without the activity routes reports unsupported instead of failing', async t => {
  const upstreamApi = await upstream(t);
  const server = await application('live', config => { config.ploeg = upstreamApi.config; });
  t.after(() => server.close());
  const administrator = await login(server.url);
  for (const path of ['/api/ploeg/summary?window=7d', '/api/ploeg/runs', '/api/ploeg/events']) {
    const result = await request(server.url, path, administrator);
    assert.equal(result.status, 501, path);
    assert.equal(result.body.error.code, 'ploeg_unsupported');
    assert.match(result.body.error.message, /does not provide activity data yet/);
  }
  upstreamApi.intercept((req, res) => req.url!.includes('/events?') ? reply(res, 400, { error: { code: 'invalid_request', message: 'Unknown, empty or repeated query parameter.' } }) : false);
  assert.equal((await request(server.url, '/api/ploeg/events?refresh=1', administrator)).body.error.code, 'ploeg_unsupported', 'an events route that rejects order=desc is an older Ploeg');
  assert.equal((await request(server.url, '/api/ploeg', administrator)).status, 200, 'the lanes still work');
  const unconfigured = await application('live');
  t.after(() => unconfigured.close());
  assert.equal((await request(unconfigured.url, '/api/ploeg/summary', await login(unconfigured.url))).body.error.code, 'ploeg_unconfigured');
});

test('summary, Runs and events are scoped to the caller’s teams, and events gain Work Item titles', async t => {
  const upstreamApi = await upstream(t);
  upstreamApi.intercept((req, res) => {
    const url = new URL(req.url!, 'http://fixture.invalid');
    if (url.pathname.endsWith('/summary')) return reply(res, 200, { generatedAt: '2026-09-10T09:00:00Z', window: url.searchParams.get('window'), teams: [summaryTeam('delivery', 2), summaryTeam('research', 3)], totals: {} });
    if (url.pathname.endsWith('/runs')) return reply(res, 200, { runs: [listRun('31', '105', 'delivery'), listRun('30', '104', 'research')], nextBefore: '30' });
    if (url.pathname.endsWith('/events')) return reply(res, 200, { events: [{ id: '501', at: '2026-09-10T08:00:00Z', actor: 'ploegd', action: 'shift.closed', workItemId: '105', team: 'delivery', detail: { reason: 'plan_exhausted' } }, { id: '499', at: '2026-09-10T07:30:00Z', actor: 'ploegd', action: 'run.claimed', workItemId: '101', team: 'delivery', detail: {} }, { id: '500', at: '2026-09-10T07:00:00Z', actor: 'ploegd', action: 'run.claimed', workItemId: '104', team: 'research', detail: {} }], nextCursor: '500', lastCursor: '501', hasMore: true, consistency: 'snapshot' });
    return false;
  });
  const server = await application('live', config => { config.ploeg = { ...upstreamApi.config, userTeams: { reader: ['delivery'] } }; });
  t.after(() => server.close());
  const password = randomBytes(24).toString('hex');
  server.app.store.addUser({ id: 'reader', name: 'reader', role: 'viewer', passwordHash: await hashPassword(password) });
  const reader = await login(server.url, 'reader', password);
  const administrator = await login(server.url);

  const scoped = await request(server.url, '/api/ploeg/summary?window=30d', reader);
  assert.equal(scoped.status, 200, scoped.text);
  assert.deepEqual(scoped.body.teams.map((team: { team: string }) => team.team), ['delivery']);
  assert.equal(scoped.body.totals.workItems.awaitingReview, 2, 'totals cover only the teams the caller can see');
  assert.equal((await request(server.url, '/api/ploeg/summary?window=30d', administrator)).body.totals.workItems.awaitingReview, 5);
  assert.equal((await request(server.url, '/api/ploeg/summary?window=1y', reader)).status, 400);

  const runs = await request(server.url, '/api/ploeg/runs?state=finished&outcome=failed&before=40', reader);
  assert.deepEqual(runs.body.runs.map((run: { id: string }) => run.id), ['31']);
  assert.equal(runs.body.nextBefore, '30');
  assert.equal(runs.body.runs[0].usage.inputTokens, 0);
  assert(upstreamApi.seen.some(call => call.path === '/api/v1/operator/runs?limit=25&state=finished&outcome=failed&before=40'));
  const before = upstreamApi.seen.length;
  assert.equal((await request(server.url, '/api/ploeg/runs?state=running&outcome=failed', reader)).status, 400, 'only finished Runs have an outcome');
  assert.equal((await request(server.url, '/api/ploeg/runs?team=research', reader)).status, 404);
  assert.equal(upstreamApi.seen.length, before);

  const events = await request(server.url, '/api/ploeg/events?before=600', reader);
  assert.equal(events.status, 200, events.text);
  assert.deepEqual(events.body.events.map((entry: { id: string }) => entry.id), ['501', '499']);
  assert.deepEqual(events.body.events.map((entry: { workItemTitle: string }) => entry.workItemTitle), ['Work 105', 'Review the rounding acceptance criteria'], 'titles come from Runs already read, or else from the Work Item');
  assert.equal(events.body.nextCursor, '500');
  assert(upstreamApi.seen.some(call => call.path === '/api/v1/operator/events?order=desc&limit=25&before=600'));
  assert.equal((await request(server.url, '/api/ploeg/events?before=abc', reader)).status, 400);
  assert(upstreamApi.seen.every(call => call.method === 'GET'));
});

test('proposed work lists every team’s proposals with the Work Item whose Run proposed them', async t => {
  const upstreamApi = await upstream(t);
  for (const id of ['106', '107']) { const entry = upstreamApi.details[id].item as Partial<PloegDetail['item']>; delete entry.sourceWorkItemId; delete entry.createdKind; delete entry.ready; }
  upstreamApi.intercept((req, res) => req.url!.endsWith('/runs/25') ? reply(res, 200, { run: { id: '25', workItemId: '105' } }) : false);
  const page = await client(upstreamApi.config).proposed(admin);
  assert.deepEqual(page.items.map(entry => entry.id), ['107', '106']);
  const [research, delivery] = page.items;
  assert.equal(delivery.sourceWorkItemId, '105');
  assert.equal(delivery.sourceTitle, 'Round half-cent totals consistently');
  assert.equal(research.sourceWorkItemId, undefined, 'a Run lookup that fails leaves the source unreported');
  assert.equal(research.createdKind, undefined);
});

test('Work Item decisions go through an authenticated, CSRF-guarded, role- and team-scoped proxy', async t => {
  const upstreamApi = await upstream(t);
  const posts: { path: string; actor?: string; acting?: string; body: string }[] = [];
  let status = 200;
  upstreamApi.intercept((req, res) => {
    if (req.method !== 'POST') return false;
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      posts.push({ path: req.url!, actor: req.headers['x-ploeg-actor'] as string, acting: req.headers['x-ploeg-acting-user'] as string, body: Buffer.concat(chunks).toString('utf8') });
      if (status !== 200) { reply(res, status, { error: { code: 'not_proposed', message: 'Only a proposed Work Item can be approved or rejected.' } }); return; }
      const id = req.url!.split('/').at(-2);
      reply(res, 200, req.url!.endsWith('/cancel') ? { cancellation: { workItemId: id, state: 'withdrawn' } } : { decision: { workItemId: Number(id), team: 'delivery', state: req.url!.endsWith('/approve') ? 'queued' : 'withdrawn', approved: req.url!.endsWith('/approve') } });
    });
    return true;
  });
  const server = await application('live', config => { config.ploeg = { ...upstreamApi.config, userTeams: { watcher: ['delivery'], op: ['delivery'] } }; });
  t.after(() => server.close());
  const password = randomBytes(24).toString('hex');
  server.app.store.addUser({ id: 'watcher', name: 'watcher', role: 'viewer', passwordHash: await hashPassword(password) });
  server.app.store.addUser({ id: 'op', name: 'op', role: 'operator', passwordHash: await hashPassword(password) });
  const watcher = await login(server.url, 'watcher', password);
  const op = await login(server.url, 'op', password);
  const decide = (id: string, decision: string, session?: { cookie: string }, body: unknown = {}, csrf = true) => request(server.url, `/api/ploeg/work-items/${id}/${decision}`, { method: 'POST', body, csrf, ...session });

  assert.equal((await decide('106', 'approve')).status, 401);
  assert.equal((await decide('106', 'approve', op, {}, false)).body.error.code, 'csrf');
  assert.equal((await decide('106', 'approve', watcher)).status, 403);
  assert.equal((await decide('106', 'reject', op)).status, 400, 'a rejection needs a reason');
  assert.equal((await decide('107', 'approve', op)).status, 404, 'another team’s Work Item is not found');
  assert.equal((await decide('105', 'approve', op)).status, 409, 'only proposed work can be approved');
  assert.equal((await request(server.url, '/api/ploeg/work-items/106', { method: 'POST', body: {}, ...op })).status, 405);
  assert.equal((await request(server.url, '/api/ploeg/work-items/106/delete', { method: 'POST', body: {}, ...op })).status, 405);
  assert.equal(posts.length, 0, 'refused decisions never reach Ploeg');

  const approved = await decide('106', 'approve', op);
  assert.equal(approved.status, 200, approved.text);
  assert.deepEqual(approved.body, { workItemId: '106', team: 'delivery', state: 'queued', demo: false });
  const rejected = await decide('106', 'reject', op, { reason: '  Duplicate of DEMO-3  ' });
  assert.equal(rejected.body.state, 'withdrawn');
  assert.equal((await decide('105', 'cancel', op)).body.state, 'withdrawn');
  assert.deepEqual(posts, [
    { path: '/api/v1/operator/work-items/106/approve', actor: 'op', acting: 'op', body: '{}' },
    { path: '/api/v1/operator/work-items/106/reject', actor: 'op', acting: 'op', body: '{"reason":"Duplicate of DEMO-3"}' },
    { path: '/api/v1/operator/work-items/105/cancel', actor: 'op', acting: 'op', body: '' },
  ]);
  status = 409;
  const conflict = await decide('106', 'approve', op);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, 'ploeg_decision_conflict');
  assert.equal(server.app.store.listSessions().length, 0);
});

test('the demo serves illustrative activity with zero spend, pages events and keeps decisions local', async t => {
  const demo = await application(); t.after(() => demo.close());
  const summary = await request(demo.url, '/api/ploeg/summary?window=7d');
  assert.equal(summary.body.demo, true);
  assert.deepEqual(summary.body.totals.spend, { settledUsd: 0, reservedUsd: 0 });
  const runs = await request(demo.url, '/api/ploeg/runs');
  assert(runs.body.runs.every((run: { settledUsd: number | null; usage: unknown }) => (run.settledUsd === 0 || run.settledUsd === null) && run.usage === null));
  assert.deepEqual([...new Set(runs.body.runs.map((run: { outcome: string }) => run.outcome))].sort(), ['', 'failed', 'no_change_needed', 'pr_opened', 'stuck']);
  const first = await request(demo.url, '/api/ploeg/events');
  assert.equal(first.body.events.length, 10);
  const second = await request(demo.url, `/api/ploeg/events?before=${first.body.nextCursor}`);
  assert.equal(second.body.nextCursor, null);
  assert.equal(new Set([...first.body.events, ...second.body.events].map((entry: { id: string }) => entry.id)).size, 15);
  assert.equal((await request(demo.url, '/api/ploeg/events?team=research')).body.events.every((entry: { team: string }) => entry.team === 'research'), true);
  assert.deepEqual((await request(demo.url, '/api/ploeg/proposed')).body.items.map((entry: { id: string }) => entry.id), ['107', '106']);
  const approved = await request(demo.url, '/api/ploeg/work-items/106/approve', { method: 'POST' });
  assert.deepEqual(approved.body, { workItemId: '106', team: 'delivery', state: 'queued', demo: true });
  assert.deepEqual((await request(demo.url, '/api/ploeg/proposed')).body.items.map((entry: { id: string }) => entry.id), ['107']);
  assert.equal((await request(demo.url, '/api/ploeg/work-items/105/cancel', { method: 'POST' })).body.error.code, 'ploeg_demo');
  assert.equal(demo.app.store.listSessions().length, 0);
});
