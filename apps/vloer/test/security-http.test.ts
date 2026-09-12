import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword } from '../src/auth.ts';
import { application, createInput, createSession, login, replay, request, sessionUntil } from './api-support.ts';
import type { AgentRuntime, Event, RuntimeKind } from '../src/types.ts';

test('live HTTP login requires credentials, same-origin mutation protection, and a revocable cookie', { timeout: 15_000 }, async t => {
  const server = await application('live');
  t.after(() => server.close());
  for (const path of ['/api/bootstrap', '/api/sessions', '/api/ploeg']) {
    const unauthenticated = await request(server.url, path);
    assert.equal(unauthenticated.status, 401, `${path}: ${unauthenticated.text}`);
    assert.equal(typeof unauthenticated.body.error.code, 'string');
  }
  const missingHeader = await request(server.url, '/api/login', { method: 'POST', csrf: false, body: { name: 'admin', password: 'test-admin-password-314159' } });
  assert.equal(missingHeader.status, 403, missingHeader.text);
  const foreignOrigin = await request(server.url, '/api/login', { method: 'POST', headers: { origin: 'https://attacker.invalid' }, body: { name: 'admin', password: 'test-admin-password-314159' } });
  assert.equal(foreignOrigin.status, 403, foreignOrigin.text);
  const invalidPassword = await request(server.url, '/api/login', { method: 'POST', body: { name: 'admin', password: 'wrong-password' } });
  assert.equal(invalidPassword.status, 401, invalidPassword.text);
  const credentials = await login(server.url);
  assert.match(credentials.setCookie, /HttpOnly/i);
  assert.match(credentials.setCookie, /SameSite=(Lax|Strict)/i);
  assert.match(credentials.setCookie, /Path=\//i);
  assert(!credentials.setCookie.includes('test-admin-password-314159'));
  assert.equal((await request(server.url, '/api/bootstrap', { cookie: credentials.cookie })).status, 200);
  const blockedMutation = await request(server.url, '/api/sessions', { method: 'POST', cookie: credentials.cookie, csrf: false, body: createInput({ runtime: 'opencode' }) });
  assert.equal(blockedMutation.status, 403, blockedMutation.text);
  const blockedCrossSite = await request(server.url, '/api/sessions', { method: 'POST', cookie: credentials.cookie, headers: { origin: 'https://attacker.invalid' }, body: createInput({ runtime: 'opencode' }) });
  assert.equal(blockedCrossSite.status, 403, blockedCrossSite.text);
  const logout = await request(server.url, '/api/logout', { method: 'POST', cookie: credentials.cookie });
  assert([200, 204].includes(logout.status), logout.text);
  assert.equal((await request(server.url, '/api/bootstrap', { cookie: credentials.cookie })).status, 401, 'logout must revoke the server-side session, not merely clear a browser cookie');
});

test('ownership covers details, history, SSE, controls, and permission routes while viewers cannot mutate', { timeout: 20_000 }, async t => {
  const server = await application('live');
  t.after(() => server.close());
  for (const user of [
    { id: 'alice', name: 'alice', role: 'operator' as const },
    { id: 'bob', name: 'bob', role: 'operator' as const },
    { id: 'watcher', name: 'watcher', role: 'viewer' as const },
  ]) server.app.store.addUser({ ...user, passwordHash: await hashPassword('test-user-password-271828') });
  const alice = await login(server.url, 'alice', 'test-user-password-271828');
  const bob = await login(server.url, 'bob', 'test-user-password-271828');
  const watcher = await login(server.url, 'watcher', 'test-user-password-271828');
  const admin = await login(server.url);
  const created = await createSession(server.url, { cookie: alice.cookie, overrides: { runtime: 'opencode' } });
  assert.equal(created.ownerId, 'alice');
  assert.equal((await request(server.url, '/api/sessions', { cookie: bob.cookie })).body.length, 0, 'another operator must not discover a private session through the list');
  assert.equal((await request(server.url, `/api/sessions/${created.id}`, { cookie: admin.cookie })).status, 200);
  for (const path of ['', '/history', '/permissions']) {
    const denied = await request(server.url, `/api/sessions/${created.id}${path}`, { cookie: bob.cookie });
    assert([403, 404].includes(denied.status), `${path}: ${denied.status} ${denied.text}`);
    assert(!denied.text.includes(created.objective));
  }
  const sse = await fetch(`${server.url}/api/sessions/${created.id}/events`, { headers: { cookie: bob.cookie }, signal: AbortSignal.timeout(3_000) });
  assert([403, 404].includes(sse.status), 'SSE must authorize before opening the stream');
  await sse.body?.cancel();
  for (const [path, body] of [
    ['/start', undefined], ['/pause', undefined], ['/resume', undefined], ['/cancel', undefined],
    ['/messages', { text: 'Overwrite the owner instructions.' }],
    ['/budget', { amountUsd: 1 }],
    ['/permissions/unknown-permission', { decision: 'always' }],
  ] as const) {
    const denied = await request(server.url, `/api/sessions/${created.id}${path}`, { method: 'POST', cookie: bob.cookie, body });
    assert([403, 404].includes(denied.status), `${path}: ${denied.status} ${denied.text}`);
  }
  const viewerCreate = await request(server.url, '/api/sessions', { method: 'POST', cookie: watcher.cookie, body: createInput({ runtime: 'opencode' }) });
  assert.equal(viewerCreate.status, 403, viewerCreate.text);
  const operatorBudget = await request(server.url, `/api/sessions/${created.id}/budget`, { method: 'POST', cookie: alice.cookie, body: { amountUsd: 1 } });
  assert.equal(operatorBudget.status, 403, operatorBudget.text);
  const stillQueued = await request(server.url, `/api/sessions/${created.id}`, { cookie: alice.cookie });
  assert.equal(stillQueued.body.status, 'queued');
  assert.equal(stillQueued.body.budgetUsd, 3);
  assert(stillQueued.body.runs.every((run: { status: string }) => run.status === 'queued'));
});

test('public API exposes configured choices while hiding authority and rejecting executable or repository injection', { timeout: 15_000 }, async t => {
  const controlPassword = 'workspace-control-password-987654';
  const masterKey = 'sk-master-do-not-expose-123456';
  const server = await application('live', config => {
    config.runtime.password = controlPassword;
    config.litellm = { baseUrl: 'http://127.0.0.1:1/v1', adminUrl: 'http://127.0.0.1:1', masterKey, models: ['coding'], ttl: '1h' };
  });
  t.after(() => server.close());
  const user = await login(server.url);
  for (const path of ['/api/bootstrap', '/api/sessions', '/api/health']) {
    const response = await request(server.url, path, { cookie: user.cookie });
    assert.equal(response.status, 200, response.text);
    for (const secret of [controlPassword, masterKey, 'test-admin-password-314159']) assert(!response.text.includes(secret), `${path} exposed a control-plane credential`);
    assert(!response.text.includes('passwordHash'));
  }
  const unknownRuntime = await request(server.url, '/api/sessions', { method: 'POST', cookie: user.cookie, body: createInput({ runtime: 'command', command: ['/bin/sh', '-c', 'touch /tmp/should-never-run'] }) });
  assert([400, 422].includes(unknownRuntime.status), unknownRuntime.text);
  const unknownRepository = await request(server.url, '/api/sessions', { method: 'POST', cookie: user.cookie, body: createInput({ runtime: 'opencode', repositoryId: 'file:///etc' }) });
  assert([400, 422].includes(unknownRepository.status), unknownRepository.text);
  const malformed = await fetch(`${server.url}/api/sessions`, { method: 'POST', headers: { cookie: user.cookie, 'x-vloer-request': '1', 'content-type': 'application/json' }, body: '{"title":' });
  assert.equal(malformed.status, 400);
  const malformedText = await malformed.text();
  assert(!malformedText.includes('SyntaxError'));
  assert(!malformedText.includes(repositoryRootForLeakCheck()));
});

function repositoryRootForLeakCheck() {
  return new URL('../src/', import.meta.url).pathname;
}

test('runtime credentials are removed from durable artifacts, nested activity, and reconnect replay', { timeout: 15_000 }, async t => {
  const secret = 'control-password-"quoted"-\\value-123456';
  const runtime: AgentRuntime = {
    kind: 'demo',
    async prepare(session) { return { id: session.id, backend: 'demo', directory: '/isolated-test-workspace' }; },
    async execute(context) {
      context.emit({ type: 'message', data: { text: `Tool echoed ${secret}`, role: 'agent', nested: { values: [secret] } } });
      return { summary: `Result containing ${secret}`, verdict: context.role.mode === 'read' ? 'approve' : undefined, artifacts: [{ id: context.run.id, name: 'Credential exposure probe', kind: 'test', content: `Command output: ${secret}` }] };
    },
    async interrupt() {},
    async dispose() {},
  };
  const server = await application('demo', config => { config.runtime.password = secret; }, new Map<RuntimeKind, AgentRuntime>([['demo', runtime]]));
  t.after(() => server.close());
  const created = await createSession(server.url);
  assert.equal((await request(server.url, `/api/sessions/${created.id}/start`, { method: 'POST' })).status, 200);
  const completed = await sessionUntil(server.url, created.id, session => session.status === 'completed' || session.status === 'failed');
  assert.equal(completed.status, 'completed');
  assert(completed.artifacts.every(artifact => !artifact.content.includes(secret) && artifact.content.includes('[redacted]')));
  const durable = server.app.store.getSession(created.id)!;
  assert(durable.artifacts.every(artifact => !artifact.content.includes(secret)), 'redaction must happen before persistence, not solely in the HTTP serializer');
  for (const event of server.app.store.events(created.id)) assert(!JSON.stringify(event.data).includes(JSON.stringify(secret).slice(1, -1)), 'nested credential escaped into durable events');
  const history = await request(server.url, `/api/sessions/${created.id}/history`);
  const events = history.body as Event[];
  assert(!history.text.includes(JSON.stringify(secret).slice(1, -1)));
  await server.restart();
  const replayed = await replay(server.url, created.id, 0, events.length);
  assert.deepEqual(replayed, events);
  assert(!JSON.stringify(replayed).includes(JSON.stringify(secret).slice(1, -1)));
});
