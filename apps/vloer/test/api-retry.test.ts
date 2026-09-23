import test from 'node:test';
import assert from 'node:assert/strict';
import type { AgentRuntime, ExecutionContext, RuntimeKind, Session } from '../src/types.ts';
import { application, login, request, createInput, sessionUntil } from './api-support.ts';

test('a failed session can be tried again from the beginning once its spend has settled', async t => {
  let attempts = 0;
  const runtime: AgentRuntime = {
    kind: 'opencode',
    async prepare(session: Session) {
      attempts += 1;
      if (attempts === 1) { const { RuntimeFailure } = await import('../src/failures.ts'); throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, "fatal: could not read Username for 'https://gitlab.example': terminal prompts disabled"); }
      return { id: `w-${session.id}`, backend: 'local', endpoint: 'http://127.0.0.1:1', directory: '/tmp/none' };
    },
    async execute(context: ExecutionContext) { return { summary: `attempt ${attempts}`, costUsd: 0.01, artifacts: [], verdict: context.role.mode === 'read' ? 'approve' : undefined }; },
    async captureCandidate() { return { status: 'unsupported_workspace' } as any; },
    async dispose() {},
  } as unknown as AgentRuntime;
  const server = await application('live', config => {
    config.runtime = { kind: 'opencode', backend: 'local', timeoutMs: 30_000 };
    config.repositories[0].url = 'https://gitlab.example/group/order-service.git';
    config.links = { gitlab: { baseUrl: 'https://gitlab.example', clientId: 'application-id-1234', scopes: ['read_api'] } };
  }, new Map<RuntimeKind, AgentRuntime>([['opencode', runtime]]));
  t.after(() => server.close());
  const { cookie } = await login(server.url);
  server.app.engine.broker = { mint: async (session: Session) => ({ key: 'sk-session-fixture-key', alias: 'a', reference: `de-vloer-${session.id}-${attempts}`, budgetUsd: session.budgetUsd }), revoke: async () => {}, spend: async () => 0 };
  const created = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode' }), cookie, csrf: true });
  await request(server.url, `/api/sessions/${created.body.id}/start`, { method: 'POST', body: {}, cookie, csrf: true });
  const failed = await sessionUntil(server.url, created.body.id, session => session.status === 'failed', cookie);
  assert.equal(failed.failure?.category, 'workspace_setup');
  assert.ok(failed.failure?.detail?.includes('no gitlab.example link'), failed.failure?.detail);
  await sessionUntil(server.url, created.body.id, session => session.costStatus === 'settled', cookie);
  const retried = await request(server.url, `/api/sessions/${created.body.id}/retry`, { method: 'POST', body: {}, cookie, csrf: true });
  assert.equal(retried.status, 200, JSON.stringify(retried.body));
  assert.equal(retried.body.status, 'running');
  assert.equal(retried.body.failure, undefined);
  const completed = await sessionUntil(server.url, created.body.id, session => ['completed', 'failed'].includes(session.status), cookie);
  assert.equal(completed.status, 'completed', completed.blocker);
  assert.equal(completed.runs.every(run => run.status === 'completed'), true);
  const events = await request(server.url, `/api/sessions/${created.body.id}/history`, { cookie });
  assert.ok(JSON.stringify(events.body).includes('"session.retried"'));
  const again = await request(server.url, `/api/sessions/${created.body.id}/retry`, { method: 'POST', body: {}, cookie, csrf: true });
  assert.equal(again.status, 409);
});
