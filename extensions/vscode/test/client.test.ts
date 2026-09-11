import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { VloerClient, ApiError, normalizeServerUrl, type Secrets } from '../src/client.ts';
import { application, createInput, sessionUntil } from '../../../test/api-support.ts';
import { hashPassword } from '../../../src/auth.ts';
import type { SessionInput } from '../src/types.ts';

class MemorySecrets implements Secrets {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key); }
  async store(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

test('server origins require HTTPS except loopback and reject credential-bearing or path URLs', () => {
  assert.equal(normalizeServerUrl(' https://vloer.example/ '), 'https://vloer.example');
  assert.equal(normalizeServerUrl('http://127.0.0.1:4080'), 'http://127.0.0.1:4080');
  assert.equal(normalizeServerUrl('http://[::1]:4080'), 'http://[::1]:4080');
  for (const value of ['http://vloer.example', 'https://user:password@vloer.example', 'https://vloer.example/api', 'https://vloer.example?token=secret', 'https://vloer.example/#token', 'file:///etc/passwd', 'http://127.0.0.1.attacker.example']) assert.throws(() => normalizeServerUrl(value));
});

test('the client drives the actual demo server to real checks and independently reviewed evidence', { timeout: 30_000 }, async t => {
  const server = await application();
  t.after(() => server.close());
  const secrets = new MemorySecrets();
  const client = new VloerClient(server.url, secrets);
  const bootstrap = await client.bootstrap();
  assert.equal(bootstrap.mode, 'demo');
  assert.equal(bootstrap.repositories[0].id, 'order-service');
  const session = await client.create(createInput() as SessionInput);
  assert.equal(session.status, 'queued');
  await client.message(session.id, 'Keep nonnegative amount validation.');
  const history = await client.history(session.id);
  assert(history.some(event => JSON.stringify(event.data).includes('Keep nonnegative')));
  const after = history.at(-1)!.id;
  await client.action(session.id, 'start');
  await sessionUntil(server.url, session.id, value => ['completed', 'failed'].includes(value.status));
  const completed = await client.session(session.id);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.spentUsd, 0);
  assert.equal(completed.costStatus, 'demo');
  assert(completed.runs.some(run => run.verdict === 'approve'));
  assert.match(completed.artifacts.find(artifact => artifact.name === 'Baseline checks (expected failure)')!.content, /not ok|fail/i);
  assert.match(completed.artifacts.find(artifact => artifact.name === 'Verification checks')!.content, /pass|ok \d/i);
  assert.match(completed.artifacts.find(artifact => artifact.kind === 'diff')!.content, /^diff --git/m);
  assert((await client.history(session.id, after)).every(event => event.id > after));
  assert.equal((await client.sessions()).length, 1);
  assert.deepEqual(await client.permissions(session.id), []);
  assert.equal(secrets.values.size, 0, 'the demonstration never invents login or API credentials');
  assert.equal(client.dashboard(session.id), `${server.url}/#session/${session.id}`);
});

test('pause, durable instruction, resume and cancel use the real authenticated mutation contract', { timeout: 20_000 }, async t => {
  const server = await application();
  t.after(() => server.close());
  const client = new VloerClient(server.url, new MemorySecrets());
  const session = await client.create(createInput() as SessionInput);
  await client.action(session.id, 'start');
  await sessionUntil(server.url, session.id, value => value.status === 'running');
  await client.action(session.id, 'pause');
  await client.message(session.id, 'Preserve the public function signature.');
  assert.equal((await client.session(session.id)).status, 'paused');
  await client.action(session.id, 'resume');
  await client.action(session.id, 'cancel');
  assert.equal((await client.session(session.id)).status, 'cancelled');
  await assert.rejects(client.action(session.id, 'start'), (error: unknown) => error instanceof ApiError && error.status === 409);
});

test('live login stores only the opaque session cookie, restores it, clears expired credentials and logs out', { timeout: 20_000 }, async t => {
  const server = await application('live');
  t.after(() => server.close());
  const secrets = new MemorySecrets();
  const client = new VloerClient(server.url, secrets);
  await assert.rejects(client.bootstrap(), (error: unknown) => error instanceof ApiError && error.status === 401);
  await assert.rejects(client.login('admin', 'incorrect-password'), (error: unknown) => error instanceof ApiError && error.status === 401);
  assert.equal(secrets.values.size, 0);
  await client.login('admin', 'test-admin-password-314159');
  assert.match(secrets.values.get(client.secretKey)!, /^vloer=[A-Za-z0-9_-]+$/);
  assert(!JSON.stringify([...secrets.values]).includes('test-admin-password'));
  const restored = new VloerClient(server.url, secrets);
  assert.equal((await restored.bootstrap()).user.role, 'admin');
  await restored.logout();
  assert.equal(secrets.values.size, 0);
  await assert.rejects(restored.bootstrap(), (error: unknown) => error instanceof ApiError && error.status === 401);
  await secrets.store(restored.secretKey, `vloer=${'a'.repeat(43)}`);
  await assert.rejects(restored.bootstrap(), (error: unknown) => error instanceof ApiError && error.status === 401);
  assert.equal(secrets.values.size, 0);
});

test('the actual server enforces object ownership for desktop clients', { timeout: 20_000 }, async t => {
  const server = await application('live');
  t.after(() => server.close());
  server.app.store.addUser({ id: 'alice', name: 'alice', role: 'operator', passwordHash: hashPassword('alice-password-314159') });
  server.app.store.addUser({ id: 'bob', name: 'bob', role: 'operator', passwordHash: hashPassword('bob-password-314159') });
  const alice = new VloerClient(server.url, new MemorySecrets());
  const bob = new VloerClient(server.url, new MemorySecrets());
  await alice.login('alice', 'alice-password-314159');
  await bob.login('bob', 'bob-password-314159');
  const session = await alice.create(createInput({ runtime: 'opencode' }) as SessionInput);
  assert.equal((await alice.sessions()).length, 1);
  assert.equal((await bob.sessions()).length, 0);
  for (const request of [() => bob.session(session.id), () => bob.history(session.id), () => bob.permissions(session.id), () => bob.message(session.id, 'Unauthorized change'), () => bob.action(session.id, 'cancel')]) await assert.rejects(request(), (error: unknown) => error instanceof ApiError && error.status === 404);
});

test('redirects never forward a stored control-plane cookie to a different destination', async t => {
  let targetCalls = 0;
  const target = createServer((_request, response) => { targetCalls++; response.end('unexpected'); });
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => target.close(() => resolve())));
  const targetAddress = target.address();
  assert(targetAddress && typeof targetAddress !== 'string');
  let originalCookie = '';
  const redirect = createServer((request, response) => { originalCookie = request.headers.cookie || ''; response.writeHead(302, { Location: `http://127.0.0.1:${targetAddress.port}/api/bootstrap` }); response.end(); });
  await new Promise<void>(resolve => redirect.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => redirect.close(() => resolve())));
  const address = redirect.address();
  assert(address && typeof address !== 'string');
  const secrets = new MemorySecrets();
  const client = new VloerClient(`http://127.0.0.1:${address.port}`, secrets);
  await secrets.store(client.secretKey, 'vloer=opaque-control-cookie');
  await assert.rejects(client.bootstrap(), (error: unknown) => error instanceof ApiError && error.code === 'redirect');
  assert.equal(originalCookie, 'vloer=opaque-control-cookie');
  assert.equal(targetCalls, 0);
});

test('invalid route identifiers are rejected before any network action', async () => {
  const client = new VloerClient('http://127.0.0.1:1', new MemorySecrets());
  for (const id of ['../login', 'abc/../def', 'session?token=secret', 'https://evil.example']) {
    assert.throws(() => client.session(id));
    assert.throws(() => client.dashboard(id));
  }
});

test('linked demo task import preserves its revision, deduplicates commands and starts only on operator action', { timeout: 30_000 }, async t => {
  const server = await application('demo', config => {
    config.taskSources = [{ id: 'demo-tasks', name: 'Demo tasks', provider: 'demo', baseUrl: 'https://example.invalid', project: 'demo', repositoryId: 'order-service', executionOwner: 'interactive' }];
  });
  t.after(() => server.close());
  const client = new VloerClient(server.url, new MemorySecrets());
  const sources = await client.taskSources();
  assert.equal(sources[0].provider, 'demo');
  assert.deepEqual((await client.bootstrap()).taskSources, sources);
  const page = await client.tasks('demo-tasks');
  assert.equal(page.tasks.length, 1);
  const task = await client.task('demo-tasks', page.tasks[0].id);
  assert.equal(task.revision, page.tasks[0].revision);
  const input = { sourceId: task.sourceId, taskId: task.id, revision: task.revision, crewId: 'delivery', runtime: 'demo', budgetUsd: 3 };
  const [first, repeated] = await Promise.all([client.importTask(input), client.importTask(input)]);
  assert.equal(first.id, repeated.id);
  assert.equal(first.status, 'queued');
  assert(first.runs.every(run => run.status === 'queued'));
  assert.deepEqual(first.sourceTask, task);
  assert.equal((await client.sessions()).length, 1);
  assert.equal((await client.history(first.id)).filter(event => event.type === 'session.created').length, 1);
  await client.action(first.id, 'start');
  await sessionUntil(server.url, first.id, session => ['completed', 'failed'].includes(session.status));
  const completed = await client.session(first.id);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.costStatus, 'demo');
  assert.equal(completed.candidate?.status, 'ready');
  const manifest = JSON.parse(Buffer.from(await client.downloadCandidate(first.id, 'manifest')).toString('utf8'));
  assert.equal(manifest.sessionId, first.id);
  const patch = Buffer.from(await client.downloadCandidate(first.id, 'patch')).toString('utf8');
  assert.match(patch, /^diff --git/m);
  const bundle = Buffer.from(await client.downloadCandidate(first.id, 'bundle'));
  assert.match(bundle.subarray(0, 80).toString('utf8'), /^# v[23] git bundle\n/);
  assert.equal((await client.importTask(input)).id, first.id, 're-importing a completed revision never starts replacement work');
});

test('a desktop client links Vikunja through the actual authenticated server and refuses stale snapshots and Ploeg execution', { timeout: 20_000 }, async t => {
  let title = 'Improve remote task import';
  const requests: { path: string; authorization: string }[] = [];
  const upstream = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    requests.push({ path: url.pathname, authorization: request.headers.authorization ?? '' });
    const task = { id: 42, project_id: 9, title, description: '<script>malicious tracker text</script> Preserve review evidence.', done: false, updated: '2026-09-09T00:00:00Z' };
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/api/v1/tasks') {
      assert.equal(url.searchParams.get('filter'), 'project_id = 9 && done = false');
      response.end(JSON.stringify([task]));
    } else if (url.pathname === '/api/v1/tasks/42') response.end(JSON.stringify(task));
    else { response.statusCode = 404; response.end('{}'); }
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => upstream.close(() => resolve())));
  const address = upstream.address();
  assert(address && typeof address !== 'string');
  const server = await application('live', config => {
    const source = { id: 'vikunja-work', name: 'Vikunja work', provider: 'vikunja' as const, baseUrl: `http://127.0.0.1:${address.port}/api/v1`, project: '9', repositoryId: 'order-service', token: 'upstream-token-kept-server-side', executionOwner: 'interactive' as const };
    config.taskSources = [source, { ...source, id: 'ploeg-work', project: '10', executionOwner: 'ploeg' }];
  });
  t.after(() => server.close());
  const client = new VloerClient(server.url, new MemorySecrets());
  await client.login('admin', 'test-admin-password-314159');
  const bootstrap = await client.bootstrap();
  assert(!JSON.stringify(bootstrap).includes('upstream-token-kept-server-side'));
  assert(!JSON.stringify(bootstrap).includes('/api/v1'));
  const task = (await client.tasks('vikunja-work')).tasks[0];
  assert.equal(task.provider, 'vikunja');
  assert.equal(task.repositoryId, 'order-service');
  assert.match(task.description, /<script>/);
  const input = { sourceId: task.sourceId, taskId: task.id, revision: task.revision, crewId: 'delivery', runtime: 'opencode', budgetUsd: 3 };
  title = 'Task updated after preview';
  await assert.rejects(client.importTask(input), (error: unknown) => error instanceof ApiError && error.status === 409 && error.code === 'task_changed');
  assert.equal((await client.sessions()).length, 0);
  const fresh = await client.task(task.sourceId, task.id);
  const session = await client.importTask({ ...input, revision: fresh.revision });
  assert.equal(session.status, 'queued');
  assert.equal(session.sourceTask?.title, title);
  assert(session.runs.every(run => run.status === 'queued'));
  await assert.rejects(client.importTask({ ...input, sourceId: 'ploeg-work' }), (error: unknown) => error instanceof ApiError && error.status === 403 && error.code === 'ploeg_owned');
  assert(requests.length >= 4);
  assert(requests.every(request => request.authorization === 'Bearer upstream-token-kept-server-side'));
  assert(requests.every(request => !request.authorization.includes('vloer=')));
});

test('candidate downloads reject redirects and oversized responses without forwarding credentials or retaining a partial file', async t => {
  let targetCalls = 0;
  const target = createServer((_request, response) => { targetCalls++; response.end('unexpected'); });
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => target.close(() => resolve())));
  const targetAddress = target.address();
  assert(targetAddress && typeof targetAddress !== 'string');
  let mode = 'redirect';
  const origin = createServer((_request, response) => {
    if (mode === 'redirect') { response.writeHead(302, { Location: `http://127.0.0.1:${targetAddress.port}/artifact` }); response.end(); }
    else { response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': 129 * 1024 * 1024 }); response.end(); }
  });
  await new Promise<void>(resolve => origin.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => origin.close(() => resolve())));
  const address = origin.address();
  assert(address && typeof address !== 'string');
  const secrets = new MemorySecrets();
  const client = new VloerClient(`http://127.0.0.1:${address.port}`, secrets);
  await secrets.store(client.secretKey, 'vloer=opaque-download-cookie');
  await assert.rejects(client.downloadCandidate('session-123', 'bundle'), (error: unknown) => error instanceof ApiError && error.code === 'redirect');
  assert.equal(targetCalls, 0);
  mode = 'oversized';
  await assert.rejects(client.downloadCandidate('session-123', 'bundle'), (error: unknown) => error instanceof ApiError && error.code === 'response_too_large');
});

async function until(condition: () => Promise<boolean> | boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('Condition not met in time');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

test('the live event stream delivers durable events in order, replays after a cursor and stops cleanly on abort', { timeout: 30_000 }, async t => {
  const server = await application();
  t.after(() => server.close());
  const client = new VloerClient(server.url, new MemorySecrets());
  const session = await client.create(createInput() as SessionInput);
  const seen: { id: number; type: string }[] = [];
  let opened = false;
  const controller = new AbortController();
  const streaming = client.stream(session.id, 0, { onOpen: () => { opened = true; }, onEvent: event => seen.push({ id: event.id, type: event.type }) }, controller.signal);
  await until(() => opened);
  await client.action(session.id, 'start');
  await sessionUntil(server.url, session.id, value => ['completed', 'failed'].includes(value.status));
  const history = await client.history(session.id);
  await until(() => seen.length >= history.length);
  controller.abort();
  await streaming;
  assert.deepEqual(seen.map(event => event.id), history.map(event => event.id));
  assert(seen.some(event => event.type === 'session.created'));
  assert(seen.some(event => event.type === 'session.completed'));
  assert(seen.every((event, index) => index === 0 || event.id > seen[index - 1].id));
  const cursor = history[2].id;
  const replayed: number[] = [];
  const replay = new AbortController();
  const replaying = client.stream(session.id, cursor, { onEvent: event => replayed.push(event.id) }, replay.signal);
  await until(() => replayed.length >= history.length - 3);
  replay.abort();
  await replaying;
  assert.deepEqual(replayed, history.slice(3).map(event => event.id));
  await assert.rejects(client.stream('../events', 0, { onEvent: () => undefined }, new AbortController().signal));
});

test('the live event stream requires the stored login and never invents one', { timeout: 20_000 }, async t => {
  const server = await application('live');
  t.after(() => server.close());
  const secrets = new MemorySecrets();
  const client = new VloerClient(server.url, secrets);
  await assert.rejects(client.stream('session-1', 0, { onEvent: () => undefined }, new AbortController().signal), (error: unknown) => error instanceof ApiError && error.status === 401);
  assert.equal(secrets.values.size, 0);
});

test('administrators authorize additional budget through the real mutation contract', { timeout: 20_000 }, async t => {
  const server = await application('live');
  t.after(() => server.close());
  const client = new VloerClient(server.url, new MemorySecrets());
  await client.login('admin', 'test-admin-password-314159');
  const session = await client.create(createInput({ runtime: 'opencode', budgetUsd: 3 }) as SessionInput);
  assert.throws(() => client.budget(session.id, 0));
  assert.throws(() => client.budget(session.id, -1));
  const increased = await client.budget(session.id, 2);
  assert.equal(increased.budgetUsd, 5);
  assert((await client.history(session.id)).some(event => event.type === 'budget.increased'));
  await assert.rejects(client.budget(session.id, 1000), (error: unknown) => error instanceof ApiError && error.status === 400);
});

test('Ploeg inspection shares workbench identity and opens opaque item links without remote execution', async t => {
  const server = await application();
  t.after(() => server.close());
  const secrets = new MemorySecrets();
  const client = new VloerClient(server.url, secrets);
  const overview = await client.ploeg('research', true);
  assert.equal(overview.demo, true);
  assert.equal(overview.selectedTeam, 'research');
  assert.equal(overview.lanes?.queued.items[0].id, '104');
  assert.equal(client.ploegDashboard('9007199254740993'), `${server.url}/#ploeg/9007199254740993`);
  assert.equal(client.ploegDashboard(), `${server.url}/#ploeg`);
  assert.throws(() => client.ploegDashboard('../private'));
  assert.throws(() => client.ploegDashboard('1?token=anything'));
  assert.equal(server.app.store.listSessions().length, 0);
  assert.equal(secrets.values.size, 0);
});
