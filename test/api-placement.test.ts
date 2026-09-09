import test from 'node:test';
import assert from 'node:assert/strict';
import { application, createInput, login, request } from './api-support.ts';
import type { AgentRuntime, RuntimeKind } from '../src/types.ts';

const inert: AgentRuntime = {
  kind: 'opencode',
  async prepare(session) { return { id: session.id, backend: 'docker', directory: '/workspace/repository' }; },
  async execute() { throw new Error('not executed'); },
  async interrupt() {}, async dispose() {},
};

test('bootstrap advertises enabled placements and session creation validates the choice', { timeout: 20_000 }, async t => {
  const server = await application('live', config => { config.runtime = { kind: 'opencode', backend: 'docker', backends: ['docker', 'local'], timeoutMs: 30_000 }; }, new Map<RuntimeKind, AgentRuntime>([['opencode', inert]]));
  t.after(() => server.close());
  const alice = await login(server.url);
  const bootstrap = await request(server.url, '/api/bootstrap', { cookie: alice.cookie });
  assert.deepEqual(bootstrap.body.placements.map((item: any) => [item.id, item.isolation, item.default]), [['docker', 'container', true], ['local', 'working-directory', false]]);
  const health = await request(server.url, '/api/health', { cookie: alice.cookie });
  assert.deepEqual(health.body.workspaceBackends, ['docker', 'local']);
  assert.equal(health.body.workspaceBackend, 'docker');
  const defaulted = await request(server.url, '/api/sessions', { method: 'POST', cookie: alice.cookie, body: createInput({ runtime: 'opencode' }) });
  assert.equal(defaulted.status, 201, defaulted.text);
  assert.equal(defaulted.body.placement, 'docker');
  const chosen = await request(server.url, '/api/sessions', { method: 'POST', cookie: alice.cookie, body: createInput({ runtime: 'opencode', placement: 'local' }) });
  assert.equal(chosen.status, 201, chosen.text);
  assert.equal(chosen.body.placement, 'local');
  const rejected = await request(server.url, '/api/sessions', { method: 'POST', cookie: alice.cookie, body: createInput({ runtime: 'opencode', placement: 'kubernetes' }) });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error.code, 'invalid_placement');
  const malformed = await request(server.url, '/api/sessions', { method: 'POST', cookie: alice.cookie, body: createInput({ runtime: 'opencode', placement: { backend: 'docker' } }) });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'placement');
  const restored = await request(server.url, `/api/sessions/${chosen.body.id}`, { cookie: alice.cookie });
  assert.equal(restored.body.placement, 'local');
});

test('the demonstration deployment exposes no placements', async t => {
  const server = await application();
  t.after(() => server.close());
  const bootstrap = await request(server.url, '/api/bootstrap');
  assert.deepEqual(bootstrap.body.placements, []);
  const rejected = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ placement: 'docker' }) });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error.code, 'invalid_placement');
});
