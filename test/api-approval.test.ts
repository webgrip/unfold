import test from 'node:test';
import assert from 'node:assert/strict';
import type { AgentRuntime, RuntimeKind } from '../src/types.ts';
import { application, login, request, createInput } from './api-support.ts';

const inert: AgentRuntime = { kind: 'opencode', async prepare() { throw new Error('unused'); }, async execute() { throw new Error('unused'); } } as unknown as AgentRuntime;

test('automatic approval needs an isolated placement and can be switched on a live session', async t => {
  const server = await application('live', config => { config.runtime = { kind: 'opencode', backend: 'docker', backends: ['docker', 'local'], timeoutMs: 30_000 }; }, new Map<RuntimeKind, AgentRuntime>([['opencode', inert]]));
  t.after(() => server.close());
  const { cookie } = await login(server.url);
  const refused = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode', placement: 'local', approval: 'auto' }), cookie, csrf: true });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error.code, 'approval_requires_isolation');
  const invalid = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode', placement: 'docker', approval: 'sometimes' }), cookie, csrf: true });
  assert.equal(invalid.body.error.code, 'invalid_approval');
  const created = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode', placement: 'docker', approval: 'auto' }), cookie, csrf: true });
  assert.equal(created.status, 201);
  assert.equal(created.body.approval, 'auto');
  const manual = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode', placement: 'docker' }), cookie, csrf: true });
  assert.equal(manual.body.approval, 'manual');
  const switched = await request(server.url, `/api/sessions/${manual.body.id}/approval`, { method: 'POST', body: { approval: 'auto' }, cookie, csrf: true });
  assert.equal(switched.status, 200);
  assert.equal(switched.body.approval, 'auto');
  const events = await request(server.url, `/api/sessions/${manual.body.id}/history`, { cookie });
  assert.ok(JSON.stringify(events.body).includes('approval.changed'));
  const local = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode', placement: 'local' }), cookie, csrf: true });
  const refusedSwitch = await request(server.url, `/api/sessions/${local.body.id}/approval`, { method: 'POST', body: { approval: 'auto' }, cookie, csrf: true });
  assert.equal(refusedSwitch.status, 400);
});

test('a session can pin a configured model for every role and rejects an unknown one', async t => {
  const server = await application('live', config => { config.runtime = { kind: 'opencode', backend: 'docker', backends: ['docker', 'local'], timeoutMs: 30_000 }; config.models.push({ id: 'auto', name: 'Auto-router', providerId: 'litellm', modelId: 'auto' }); }, new Map<RuntimeKind, AgentRuntime>([['opencode', inert]]));
  t.after(() => server.close());
  const { cookie } = await login(server.url);
  const pinned = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode', model: 'auto' }), cookie, csrf: true });
  assert.equal(pinned.status, 201);
  assert.equal(pinned.body.model, 'auto');
  const unknown = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode', model: 'nope' }), cookie, csrf: true });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error.code, 'invalid_model');
  const none = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode' }), cookie, csrf: true });
  assert.equal(none.body.model, undefined);
});
