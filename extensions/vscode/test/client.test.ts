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
