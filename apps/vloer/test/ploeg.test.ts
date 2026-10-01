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
  const cards: Record<string, unknown> = {};
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
    const cardPath = /\/work-items\/([0-9]+)\/card$/.exec(url.pathname);
    if (cardPath) { if (cards[cardPath[1]]) res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: 1, card: cards[cardPath[1]] })); else res.writeHead(404).end(); return; }
    const id = url.pathname.split('/').at(-1)!;
    if (details[id]) { send(details[id]); return; }
    res.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); delete process.env[env]; });
  const address = server.address(); assert(address && typeof address !== 'string');
  const config = { url: `http://127.0.0.1:${address.port}`, tokenEnv: env };
  return { config, seen, details, cards, get token() { return bearer; }, rotate() { bearer = randomBytes(24).toString('hex'); process.env[env] = bearer; }, intercept(handler: typeof intercept) { intercept = handler; } };
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
  assert.equal(detail.events.length, 7);
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

test('a writer’s problem and solution pass through, and a Ploeg that predates them reads as empty rather than failing', async t => {
  const upstreamApi = await upstream(t);
  const ploeg = client(upstreamApi.config);
  const writer = upstreamApi.details['105'].runs.find(run => run.writes)!;
  assert.match((await ploeg.detail(admin, '105')).runs.find(run => run.id === writer.id)!.problem, /half cent/);
  for (const run of upstreamApi.details['109'].runs) { delete (run as Partial<typeof run>).problem; delete (run as Partial<typeof run>).solution; }
  const older = await ploeg.detail(admin, '109');
  assert(older.runs.length > 0 && older.runs.every(run => run.problem === '' && run.solution === ''));
  (upstreamApi.details['114'].runs[0] as { problem: unknown }).problem = 42;
  await assert.rejects(ploeg.detail(admin, '114'), /unsupported operator response/, 'a present value must still be text');
});

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
  upstreamApi.intercept((req, res) => req.url!.endsWith('/runs/53') ? reply(res, 200, { run: { id: '53', workItemId: '105' } }) : false);
  const page = await client(upstreamApi.config).proposed(admin);
  assert.deepEqual(page.items.map(entry => entry.id), ['106', '107'], 'newest proposal first');
  const [delivery, research] = page.items;
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
      reply(res, 200, req.url!.endsWith('/cancel') ? { cancellation: { workItemId: id, state: 'withdrawn', withdrawn: true, shiftId: '13', cancelledRuns: 1, stoppedRuns: 2, keysBlocked: false } } : { decision: { workItemId: Number(id), team: 'delivery', state: req.url!.endsWith('/approve') ? 'queued' : 'withdrawn', approved: req.url!.endsWith('/approve') } });
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
  const cancelled = await decide('105', 'cancel', op);
  assert.equal(cancelled.status, 200, cancelled.text);
  assert.deepEqual(cancelled.body, { workItemId: '105', team: 'delivery', state: 'withdrawn', demo: false, withdrawn: true, shiftId: '13', cancelledRuns: 1, stoppedRuns: 2, keysBlocked: false, message: '' }, 'Ploeg’s cancellation result reaches the browser, including an unconfirmed key block');
  assert.deepEqual(posts, [
    { path: '/api/v1/operator/work-items/106/approve', actor: 'op', acting: 'op', body: '{}' },
    { path: '/api/v1/operator/work-items/106/reject', actor: 'op', acting: 'op', body: '{"reason":"Duplicate of DEMO-3"}' },
    { path: '/api/v1/operator/work-items/105/cancel', actor: 'op', acting: 'op', body: '' },
  ]);
  status = 409;
  const conflict = await decide('106', 'approve', op);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, 'ploeg_decision_conflict');
  const owned = await decide('105', 'cancel', op);
  assert.equal(owned.status, 409);
  assert.equal(owned.body.error.code, 'ploeg_decision_conflict');
  assert.match(owned.body.error.message, /workbench session drives it\. Cancel that session instead/);
  assert.equal(server.app.store.listSessions().length, 0);
});

test('a cancellation from an older Ploeg without result counts reports them as unknown, never as zero', async t => {
  const upstreamApi = await upstream(t);
  let cancellation: Record<string, unknown> = { workItemId: '102', state: 'withdrawn' };
  upstreamApi.intercept((req, res) => req.method === 'POST' ? reply(res, 200, { cancellation }) : false);
  const ploeg = client(upstreamApi.config);
  assert.deepEqual(await ploeg.decide(admin, '102', 'cancel'), { workItemId: '102', team: 'delivery', state: 'withdrawn', demo: false, withdrawn: null, shiftId: null, cancelledRuns: null, stoppedRuns: null, keysBlocked: null, message: '' });
  cancellation = { workItemId: 102, state: 'needs_human', withdrawn: false, shiftId: null, cancelledRuns: 0, stoppedRuns: 0, keysBlocked: true, message: 'Nothing was live.' };
  assert.deepEqual(await ploeg.decide(admin, '102', 'cancel'), { workItemId: '102', team: 'delivery', state: 'needs_human', demo: false, withdrawn: false, shiftId: null, cancelledRuns: 0, stoppedRuns: 0, keysBlocked: true, message: 'Nothing was live.' }, 'a Work Item with nothing live keeps its state and says so');
  cancellation = { workItemId: '102', state: 'withdrawn', withdrawn: 'yes', shiftId: '../1', cancelledRuns: -1, stoppedRuns: 1.5, keysBlocked: 'no', message: 7 };
  assert.deepEqual(await ploeg.decide(admin, '102', 'cancel'), { workItemId: '102', team: 'delivery', state: 'withdrawn', demo: false, withdrawn: null, shiftId: null, cancelledRuns: null, stoppedRuns: null, keysBlocked: null, message: '' }, 'malformed counts are unknown, not zero');
  cancellation = { workItemId: '103', state: 'withdrawn' };
  await assert.rejects(ploeg.decide(admin, '102', 'cancel'), /unsupported operator response/);
});

test('the demo serves illustrative activity with zero spend, pages events and keeps decisions local', async t => {
  const demo = await application(); t.after(() => demo.close());
  const summary = await request(demo.url, '/api/ploeg/summary?window=7d');
  assert.equal(summary.body.demo, true);
  assert.deepEqual(summary.body.totals.spend, { settledUsd: 0, reservedUsd: 0 });
  const pages = async <T>(path: string, key: 'runs' | 'events', cursor: 'nextBefore' | 'nextCursor'): Promise<T[][]> => {
    const all: T[][] = [];
    for (let next: string | null = ''; next !== null;) {
      const page = await request(demo.url, `${path}${next ? `?before=${next}` : ''}`);
      assert.equal(page.status, 200, page.text);
      all.push(page.body[key]);
      next = page.body[cursor];
    }
    return all;
  };
  const runPages = await pages<{ id: string; settledUsd: number | null; observedUsd: number | null; usage: unknown; outcome: string }>('/api/ploeg/runs', 'runs', 'nextBefore');
  const runs = runPages.flat();
  assert.equal(runPages[0].length, ploegDemo.pageSize);
  assert.equal(runs.length, ploegDemo.runs.length);
  assert(runs.every(run => (run.settledUsd === 0 || run.settledUsd === null) && run.observedUsd === null && run.usage === null), 'the demo settles nothing and observes nothing');
  assert.deepEqual([...new Set(runs.map(run => run.outcome))].sort(), ['', 'failed', 'no_change_needed', 'pr_opened', 'pr_updated', 'stuck']);
  const eventPages = await pages<{ id: string }>('/api/ploeg/events', 'events', 'nextCursor');
  assert.equal(eventPages[0].length, ploegDemo.pageSize);
  assert(eventPages.length > 2, 'the feed pages more than once');
  assert.equal(new Set(eventPages.flat().map(entry => entry.id)).size, ploegDemo.events.length, 'paging repeats and drops nothing');
  assert.equal((await request(demo.url, '/api/ploeg/events?team=research')).body.events.every((entry: { team: string }) => entry.team === 'research'), true);
  assert.deepEqual((await request(demo.url, '/api/ploeg/proposed')).body.items.map((entry: { id: string }) => entry.id), ['106', '107']);
  const approved = await request(demo.url, '/api/ploeg/work-items/106/approve', { method: 'POST' });
  assert.deepEqual(approved.body, { workItemId: '106', team: 'delivery', state: 'queued', demo: true });
  assert.deepEqual((await request(demo.url, '/api/ploeg/proposed')).body.items.map((entry: { id: string }) => entry.id), ['107']);
  const cancelled = await request(demo.url, '/api/ploeg/work-items/105/cancel', { method: 'POST' });
  assert.equal(cancelled.status, 200, cancelled.text);
  assert.deepEqual({ ...cancelled.body, message: undefined }, { workItemId: '105', team: 'delivery', state: 'awaiting_review', demo: true, withdrawn: false, shiftId: null, cancelledRuns: 0, stoppedRuns: 0, keysBlocked: null, message: undefined });
  assert.match(cancelled.body.message, /Illustrative demo record\. Nothing was cancelled/);
  assert.equal((await request(demo.url, '/api/ploeg/work-items/105')).body.item.state, 'awaiting_review', 'a demo cancel changes nothing');
  assert.equal(demo.app.store.listSessions().length, 0);
});

test('the demo exercises every needs-you reason with Ploeg’s own sentences and the Runs behind them', async t => {
  const demo = await application(); t.after(() => demo.close());
  const parked = ploegDemo.items.filter(item => item.state === 'needs_human');
  assert.deepEqual(parked.map(item => item.latestShift?.closeReason).sort(), ['Illustrative escalation to a human reviewer.', 'budget exhausted: pool 0.04, spent 0.00, reserved 0.00', 'fix_round_cap_reached', 'plan_exhausted', 'run stuck: builder round 2', 'writing_run_killed_repeatedly']);
  assert.deepEqual([...new Set(parked.map(item => item.team))], ['delivery', 'research']);
  for (const item of parked) {
    const detail = await request(demo.url, `/api/ploeg/work-items/${item.id}`);
    assert.equal(detail.status, 200, detail.text);
    const reason = detail.body.events.find((entry: { action: string }) => entry.action === 'work_item.needs_human')?.detail.reason;
    assert.match(reason ?? '', /^(shift stopped: |the |plan complete; )/, `${item.id} carries Ploeg’s needs-human sentence`);
    const closeReason = item.latestShift!.closeReason;
    const stuck = /^run stuck: (\w+) round (\d+)$/.exec(closeReason);
    if (stuck) assert(detail.body.runs.some((run: { role: string; round: number; outcome: string; stuckReason: string }) => run.role === stuck[1] && run.round === Number(stuck[2]) && run.outcome === 'stuck' && run.stuckReason), `${item.id} has the stuck Run the close reason names`);
    if (closeReason === 'writing_run_killed_repeatedly') {
      const writers = detail.body.runs.filter((run: { writes: boolean; failureReason: string | null }) => run.writes && ['infra_node', 'lease_lost'].includes(run.failureReason ?? ''));
      assert.equal(writers.length, 10, 'ten infrastructure kills');
      assert.match(reason, /killed 10 times in round 1/);
    }
    if (closeReason.startsWith('budget exhausted')) {
      const [pool, spent, reserved] = [...closeReason.matchAll(/\d+\.\d+/g)].map(match => Number(match[0]));
      const shift = detail.body.shifts[0];
      assert.deepEqual([pool, spent, reserved], [shift.budgetUsd, shift.spentUsd, shift.reservedUsd], 'the close reason quotes the Shift’s own zero spend, never sample amounts');
      assert(pool < 0.05, 'a pool below the least Ploeg authorizes is what parks a Shift that spent nothing');
      assert(detail.body.runs.every((run: { startedAt: string | null; summary: string }) => run.startedAt === null && run.summary.startsWith('cancelled: shift closed (budget exhausted')), 'no Run started, so no model was called');
    }
    if (!closeReason.startsWith('run stuck:') && detail.body.runs.some((run: { outcome: string }) => run.outcome === 'stuck')) assert.match(closeReason, /^Illustrative /, `${item.id}: a stuck Run without a run-stuck close reason is the free-text escalation`);
    if (closeReason === 'fix_round_cap_reached') assert.deepEqual(detail.body.runs.map((run: { round: number; verdict: string }) => [run.round, run.verdict]).reverse(), [[1, ''], [2, 'request_changes'], [3, ''], [4, 'request_changes']]);
    assert.equal(detail.body.events[0].action, 'work_item.needs_human', `${item.id}: the newest event is the park`);
  }
  const escalation = ploegDemo.details['101'];
  assert.equal(escalation.item.provider, 'demo');
  assert.deepEqual(escalation.runs.filter(entry => entry.outcome === 'stuck').map(entry => [entry.role, entry.round, entry.stuckReason]), [['reviewer', 1, 'The acceptance criteria need a human decision.']], 'DEMO-1 keeps its free-text escalation with a reviewer stuck in Round 1');
  const unrouted = parked.find(item => item.target === null)!;
  assert.equal(unrouted.provider, 'vikunja');
  for (const markup of ['<p>', '<ul><li>', '<strong>', '<a href="https://']) assert(unrouted.description.includes(markup), `the unrouted brief is Vikunja HTML with ${markup}`);
  const brief = await request(demo.url, `/api/ploeg/work-items/${unrouted.id}`);
  assert.match(brief.body.item.descriptionMarkdown, /^Customers ask for the VAT amount[\s\S]*\*\*Acceptance criteria\*\*[\s\S]*- Each order line[\s\S]*\[VAT per line proposal\]\(https:\/\/docs\.example\.invalid\/vat-per-line\)/);
  assert.deepEqual(['stale', 'done', 'withdrawn'].map(state => ploegDemo.items.some(item => item.state === state)), [true, true, true]);
  const approved = ploegDemo.items.find(item => item.state === 'done' && item.latestShift?.closeReason === 'review_approved')!;
  assert.deepEqual(ploegDemo.details[approved.id].runs.map(run => [run.round, run.verdict]).reverse(), [[1, ''], [2, 'request_changes'], [3, ''], [4, 'approve']], 'a Round ladder with both verdicts');
  assert.equal(ploegDemo.details[approved.id].events[0].action, 'work_item.done');
  assert(ploegDemo.details[approved.id].events.some(entry => entry.action === 'work_item.awaiting_review'));
  const rejected = ploegDemo.items.find(item => item.state === 'done' && item.provider === 'ploeg')!;
  assert.equal(ploegDemo.details[rejected.id].events[0].action, 'work_item.rejected', 'done also covers a rejected proposal');
});

test('demo records stay illustrative: no spend, no model calls, and every record passes the live parser', async t => {
  for (const detail of Object.values(ploegDemo.details)) {
    assert(detail.shifts.every(shift => shift.spentUsd === 0 && shift.reservedUsd === 0), detail.item.id);
    assert(detail.runs.every(run => run.usage === null && run.costStatus === 'unknown' && run.authorizedUsd === 0 && run.keyAlias === null), detail.item.id);
    assert(detail.events.every(entry => !entry.action.startsWith('llm.')), 'the demo mints no model keys');
    const feed = ploegDemo.events.filter(entry => entry.workItemId === detail.item.id).map(({ workItemTitle: _title, ...entry }) => entry);
    assert.deepEqual(detail.events, feed, `${detail.item.id}: the detail timeline is its slice of the feed`);
  }
  assert(ploegDemo.items.every(item => /illustrative|sample data/i.test(item.description)), 'every description says it is illustrative');
  const ids = ploegDemo.events.map(entry => BigInt(entry.id));
  assert(ids.every((id, index) => index === 0 || id < ids[index - 1]), 'the feed is newest first by id');
  assert(ploegDemo.events.every((entry, index) => index === 0 || entry.at <= ploegDemo.events[index - 1].at), 'ids follow time');
  const newest = Date.parse(ploegDemo.events[0].at);
  assert(newest <= Date.now() && Date.now() - newest < 30 * 60_000, 'the newest event happened minutes ago, not on a fixed date');
  const upstreamApi = await upstream(t);
  const ploeg = client(upstreamApi.config);
  for (const id of Object.keys(ploegDemo.details)) assert.equal((await ploeg.detail(admin, id)).item.id, id);
  for (const team of ploegDemo.teams) assert.equal((await ploeg.items(admin, team.id)).items.length, ploegDemo.items.filter(item => item.team === team.id).length);
});

test('the Now projection lists waiting work, running Runs and recent Runs across the caller’s teams', async (t) => {
  const upstreamApi = await upstream(t);
  upstreamApi.intercept((req, res) => {
    const url = new URL(req.url!, 'http://fixture.invalid');
    if (!url.pathname.endsWith('/runs')) return false;
    const rows = url.searchParams.get('state') === 'running'
      ? [{ ...listRun('40', '102', 'delivery'), state: 'running', outcome: '', settledUsd: null, finishedAt: null, durationSeconds: null, observedUsd: null, reservedModels: [] }]
      : [listRun('31', '105', 'delivery'), listRun('30', '104', 'research')];
    return reply(res, 200, { runs: rows, nextBefore: null });
  });
  const now = await client(upstreamApi.config).now(admin);
  assert.equal(now.demo, false);
  assert.deepEqual(now.teams, ['delivery', 'research']);
  assert.deepEqual(now.waiting.map(entry => entry.id), ['105', '111', '101', '112', '109', '108', '110', '107', '106'], 'awaiting review, then needs human, then proposed, each oldest first');
  assert.equal(now.waiting[0].team, 'delivery');
  assert.equal(now.waiting[0].spentUsd, 0, 'the latest Shift spend travels with the row');
  assert.equal(now.waiting[0].pullRequestUrl, 'https://forge.example.invalid/example/order-service/pulls/5');
  assert.equal(now.waiting[1].pullRequestUrl, '', 'only awaiting-review rows carry a pull request link');
  assert.deepEqual(now.running.map(run => run.id), ['40']);
  assert.equal(now.running[0].observedUsd, null, 'an unobserved Run reports null, never zero');
  assert.deepEqual(now.running[0].reservedModels, []);
  assert.deepEqual(now.recent.map(run => run.id), ['31', '30']);
  assert.deepEqual([now.runningTruncated, now.recentTruncated], [false, false], 'a page without a cursor is the whole list');
  assert.deepEqual(now.errors, {});
});

test('Now rows carry the close reason, attempts, routing, priority and Shift money that the list payload already has', async (t) => {
  const upstreamApi = await upstream(t);
  const parked = upstreamApi.details['101'].item;
  parked.target = null;
  parked.attempts = 3;
  parked.infraFailures = 2;
  parked.priority = 4;
  parked.latestShift = { ...parked.latestShift!, round: 4, closeReason: 'fix_round_cap_reached', budgetUsd: 3, spentUsd: 2.5, reservedUsd: 0.25, closedAt: '2026-09-10T08:00:00Z' };
  const now = await client(upstreamApi.config).now(admin);
  const row = now.waiting.find(entry => entry.id === '101')!;
  assert.equal(row.provider, parked.provider);
  assert.equal(row.externalId, parked.externalId);
  assert.equal(row.priority, 4);
  assert.equal(row.attempts, 3);
  assert.equal(row.infraFailures, 2);
  assert.equal(row.target, null, 'an unresolved repository stays null so the browser can say "Not routed"');
  assert.equal(row.closeReason, 'fix_round_cap_reached');
  assert.deepEqual(row.latestShift, { round: 4, closeReason: 'fix_round_cap_reached', budgetUsd: 3, spentUsd: 2.5, reservedUsd: 0.25, closedAt: '2026-09-10T08:00:00Z' });
  assert.equal(row.spentUsd, 2.5, 'the existing spentUsd field is kept');
  for (const entry of now.waiting) {
    const source = upstreamApi.details[entry.id].item;
    assert.deepEqual(entry.target, source.target, entry.id);
    assert.equal(entry.closeReason, source.latestShift?.closeReason || null, entry.id);
    assert.equal(entry.latestShift?.round ?? null, source.latestShift?.round ?? null, entry.id);
    assert.equal('description' in entry, false, 'Now rows stay small: the brief is read from the Work Item');
  }
  const proposal = now.waiting.find(entry => entry.state === 'proposed' && entry.sourceWorkItemId)!;
  assert.equal(proposal.createdKind, upstreamApi.details[proposal.id].item.createdKind);
  assert.equal(proposal.sourceTitle, upstreamApi.details[proposal.sourceWorkItemId!].item.title);
  const unshifted = structuredClone(upstreamApi.details['105'].item);
  upstreamApi.details['105'].item.latestShift = null;
  const bare = (await client(upstreamApi.config).now(admin)).waiting.find(entry => entry.id === '105')!;
  assert.equal(bare.closeReason, null);
  assert.equal(bare.latestShift, null);
  assert.equal(bare.spentUsd, null);
  upstreamApi.details['105'].item = unshifted;
});

test('a Ploeg group that fails reports an error and never masquerades as an empty list', async (t) => {
  const upstreamApi = await upstream(t);
  upstreamApi.intercept((req, res) => new URL(req.url!, 'http://fixture.invalid').pathname.endsWith('/runs') ? reply(res, 503, { error: { code: 'unavailable', message: 'Planned outage.' } }) : false);
  const now = await client(upstreamApi.config).now(admin);
  assert.deepEqual(now.running, []);
  assert.deepEqual(now.recent, []);
  assert.match(now.errors.running ?? '', /Ploeg could not provide/);
  assert.match(now.errors.recent ?? '', /Ploeg could not provide/);
  assert.deepEqual([now.runningTruncated, now.recentTruncated], [false, false], 'a failed group never claims more Runs');
  assert.equal(now.errors.waiting, undefined, 'a healthy group carries no error');
  assert.deepEqual(now.waiting.map(entry => entry.id), ['105', '111', '101', '112', '109', '108', '110', '107', '106'], 'the healthy groups still return their work');
});

test('the Now page is scoped to the caller’s teams and refuses a user without team access', async (t) => {
  const upstreamApi = await upstream(t);
  const server = await application('live', config => { config.ploeg = { ...upstreamApi.config, userTeams: { reader: ['delivery'] } }; });
  t.after(() => server.close());
  assert.equal((await request(server.url, '/api/ploeg/now')).status, 401);
  const password = randomBytes(24).toString('hex');
  for (const id of ['reader', 'unmapped']) server.app.store.addUser({ id, name: id, role: 'viewer', passwordHash: await hashPassword(password) });
  const reader = await login(server.url, 'reader', password);
  const denied = await request(server.url, '/api/ploeg/now', await login(server.url, 'unmapped', password));
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'ploeg_scope');
  const view = await request(server.url, '/api/ploeg/now', reader);
  assert.equal(view.status, 200, JSON.stringify(view.body));
  assert.deepEqual(view.body.teams, ['delivery']);
  assert.deepEqual(view.body.waiting.map((entry: { id: string }) => entry.id), ['105', '101', '112', '109', '108', '106']);
  assert(view.body.waiting.every((entry: { team: string }) => entry.team === 'delivery'));
});

test('the demo Now projection names its limitation and never invents model calls or spend', async (t) => {
  const demo = await application('demo');
  t.after(() => demo.close());
  const now = await request(demo.url, '/api/ploeg/now');
  assert.equal(now.status, 200);
  assert.equal(now.body.demo, true);
  assert.deepEqual(now.body.teams, ['delivery', 'research']);
  assert.deepEqual(now.body.waiting.map((entry: { id: string }) => entry.id), ['105', '111', '101', '112', '109', '108', '110', '107', '106']);
  assert.deepEqual([...new Set(now.body.waiting.map((entry: { team: string }) => entry.team))], ['delivery', 'research'], 'waiting work spans both teams');
  assert(now.body.waiting.every((entry: { latestShift: { spentUsd: number; reservedUsd: number } | null }) => !entry.latestShift || (entry.latestShift.spentUsd === 0 && entry.latestShift.reservedUsd === 0)));
  assert(now.body.running.every((run: { observedUsd: number | null; reservedModels: string[]; usage: unknown }) => run.observedUsd === null && run.reservedModels.length === 0 && run.usage === null));
  assert(now.body.recent.every((run: { settledUsd: number | null; startedAt: string | null }) => run.settledUsd === 0 || (run.settledUsd === null && run.startedAt === null)), 'a finished demo Run settles zero; one that never started reports no settlement');
  assert.equal(now.body.recentTruncated, true, 'the demo holds more finished Runs than its first page');
  assert.equal(now.body.runningTruncated, false);
  assert.deepEqual(now.body.errors, {});
});

function liveCard(id: string, team = 'delivery') {
  return {
    workItemId: id, title: 'Retry sandbox claims', externalRef: 'VIK-1612', url: 'https://tracker.example.test/tasks/1612', team,
    target: { forge: 'forgejo', owner: 'webgrip', repo: 'glide' }, style: { skin: 'vloer-native', theme: null }, state: 'in_review',
    rarity: 'legendary', finish: 'holo', grade: 9, condition: 'cracked',
    steward: { name: 'ryan', source: 'approver' }, roster: [{ name: 'ryan', roles: ['reviewer'] }],
    crew: [{ role: 'builder', writes: true, runs: 3, costUsd: 0.58, inputTokens: 12100000, outputTokens: 88000 }],
    plays: [{ number: 57, url: 'https://forge.example.test/webgrip/glide/pulls/57', state: 'open', shiftId: 113, branch: 'ploeg/138', headSha: 'abc', mergedAt: null, closedAt: null, additions: 214, deletions: 38, changedFiles: 6, ci: { state: 'success', checks: [{ context: 'verify', state: 'success' }] }, reviews: [{ reviewer: 'ryan', state: 'approved', receivedAt: '2026-10-01T10:30:00Z', headSha: 'abc' }] }],
    totals: { costUsd: 0.58, authorizedUsd: 2, costStatus: 'observed', inputTokens: 12100000, outputTokens: 88000, usageComplete: false, runs: 3, failedRuns: 1, rounds: 1, shifts: 1, firstRunAt: '2026-10-01T09:00:00Z', lastRunAt: '2026-10-01T09:35:00Z', runSeconds: 2100 },
    events: [{ at: '2026-10-01T09:00:00Z', kind: 'minted', actor: 'team:delivery', detail: { secret: 'private', number: 57 } }],
    demo: false,
    presentation: { glow: true },
  };
}

test('the card proxy reads Ploeg card facts, keeps unknowns absent and shows no rarity, grade or condition in P1', async t => {
  const upstreamApi = await upstream(t);
  upstreamApi.cards['101'] = liveCard('101');
  const ploeg = client(upstreamApi.config);
  const view = await ploeg.card(admin, '101');
  assert.equal(view.demo, false);
  assert.equal(view.card.workItemId, '101');
  assert.deepEqual([view.card.rarity, view.card.finish, view.card.grade, view.card.condition], [null, 'matte', null, null]);
  assert.equal('presentation' in view.card, false, 'presentation fields are not passed on');
  assert.equal(view.card.plays[0].shiftId, '113');
  assert.equal(view.card.plays[0].mergedBy, '');
  assert.equal(view.card.totals.cacheReadInputTokens, undefined, 'an unreported count stays absent, never zero');
  assert.equal(view.card.totals.turns, undefined);
  assert.equal(view.card.totals.usageComplete, false);
  assert.deepEqual(view.card.events[0].detail, { number: 57 });
  assert(upstreamApi.seen.some(call => call.path === '/api/v1/operator/work-items/101/card' && call.method === 'GET'));
  upstreamApi.cards['101'] = { ...liveCard('101'), url: `https://tracker.example.test/task?token=${upstreamApi.token}`, style: { skin: '../../evil', theme: 'acme-blue' } };
  const sanitized = await ploeg.card(admin, '101', true);
  assert.equal(sanitized.card.url, '');
  assert.deepEqual(sanitized.card.style, { skin: 'vloer-native', theme: 'acme-blue' });
  assert.equal(JSON.stringify(sanitized).includes(upstreamApi.token), false);
  const manual = { ...liveCard('101'), target: null, plays: [{ number: 58, reviews: [{ reviewer: 'ryan', state: 'commented' }], ci: { state: 'pending', checks: [], headSha: 'def', capturedAt: '2026-10-01T11:00:00Z' } }], events: [{ at: '2026-10-01T09:00:00Z', kind: 'review', actor: 'ryan', detail: { number: 58, source: 'forge' } }] } as Record<string, unknown>;
  delete manual.url; delete manual.externalRef;
  upstreamApi.cards['101'] = manual;
  const omitted = await ploeg.card(admin, '101', true);
  assert.deepEqual([omitted.card.target, omitted.card.url, omitted.card.externalRef], [null, '', '']);
  assert.equal(omitted.card.plays[0].state, '', 'a play the forge did not describe has no state');
  assert.deepEqual(omitted.card.plays[0].ci, { state: 'pending', checks: [], headSha: 'def', capturedAt: '2026-10-01T11:00:00Z' });
  assert.deepEqual(omitted.card.events[0].detail, { number: 58, source: 'forge' });
  upstreamApi.cards['101'] = { ...liveCard('101'), plays: [{ number: '57' }] };
  await assert.rejects(ploeg.card(admin, '101', true), /unsupported operator response/);
  upstreamApi.cards['101'] = { ...liveCard('101'), totals: { costStatus: 'estimated' } };
  await assert.rejects(ploeg.card(admin, '101', true), /unsupported operator response/);
  upstreamApi.cards['101'] = liveCard('102');
  await assert.rejects(ploeg.card(admin, '101', true), /not found/, 'a card for another Work Item is refused');
  await assert.rejects(ploeg.card(admin, '105'), /not found/, 'an older Ploeg without the card route answers 404');
  await assert.rejects(ploeg.card(admin, 'abc'), /valid Ploeg work item/);
});

test('the card route is scoped to the caller\'s Teams, read-only, and a demo card says so with no spend', async t => {
  const upstreamApi = await upstream(t);
  upstreamApi.cards['101'] = liveCard('101');
  upstreamApi.cards['104'] = liveCard('104', 'research');
  const server = await application('live', config => { config.ploeg = { ...upstreamApi.config, userTeams: { reader: ['delivery'] } }; });
  t.after(() => server.close());
  const password = randomBytes(24).toString('hex');
  server.app.store.addUser({ id: 'reader', name: 'reader', role: 'viewer', passwordHash: await hashPassword(password) });
  const reader = await login(server.url, 'reader', password);
  assert.equal((await request(server.url, '/api/ploeg/work-items/101/card')).status, 401);
  const card = await request(server.url, '/api/ploeg/work-items/101/card', reader);
  assert.equal(card.status, 200);
  assert.equal(card.body.card.title, 'Retry sandbox claims');
  assert.equal(card.body.demo, false);
  assert.equal((await request(server.url, '/api/ploeg/work-items/104/card', reader)).status, 404, 'another Team\'s card stays hidden');
  assert.equal((await request(server.url, '/api/ploeg/work-items/105/card', reader)).status, 404);
  assert.equal((await request(server.url, '/api/ploeg/work-items/101/card', { ...reader, method: 'POST', body: {} })).status, 405);
  const demo = await application(); t.after(() => demo.close());
  const merged = await request(demo.url, '/api/ploeg/work-items/114/card');
  assert.equal(merged.status, 200);
  assert.equal(merged.body.demo, true);
  assert.equal(merged.body.card.demo, true);
  assert.equal(merged.body.card.state, 'merged');
  assert.equal(merged.body.card.totals.costStatus, 'not_reported');
  assert.equal(merged.body.card.totals.costUsd, undefined);
  assert.equal(merged.body.card.totals.inputTokens, undefined);
  assert.equal((await request(demo.url, '/api/ploeg/work-items/999/card')).status, 404);
  assert.equal(demo.app.store.listSessions().length, 0);
});
