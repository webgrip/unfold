import test from 'node:test';
import assert from 'node:assert/strict';
import type { AgentRuntime, ExecutionContext, RuntimeKind, Session } from '../src/types.ts';
import { application, login, request, createInput, sessionUntil } from './api-support.ts';

test('an analysis role reports without a verdict and only the final reviewer decides the crew', async t => {
  const prompts: string[] = [];
  const runtime: AgentRuntime = {
    kind: 'opencode',
    async prepare(session: Session) { return { id: `w-${session.id}`, backend: 'local', endpoint: 'http://127.0.0.1:1', directory: '/tmp/none' }; },
    async execute(context: ExecutionContext) {
      prompts.push(`${context.role.id}:${context.prompt}`);
      const analyst = context.role.id === 'analyst';
      return { summary: analyst ? 'The tag is v1.100.0 at helmrelease.yaml:64.' : 'Confirmed against the file.', costUsd: 0.01, artifacts: [], verdict: analyst ? 'inconclusive' : 'approve' };
    },
    async captureCandidate() { return { status: 'unsupported_workspace' } as any; },
  } as unknown as AgentRuntime;
  const server = await application('live', config => {
    config.runtime = { kind: 'opencode', backend: 'local', timeoutMs: 30_000 };
    config.crews.push({ id: 'investigation', name: 'Investigation crew', description: 'Analyst then challenger', roles: [
      { id: 'analyst', name: 'Analyst', mode: 'read', instruction: 'Investigate.' },
      { id: 'challenger', name: 'Challenger', mode: 'read', instruction: 'Challenge the findings.' },
    ] });
  }, new Map<RuntimeKind, AgentRuntime>([['opencode', runtime]]));
  t.after(() => server.close());
  const { cookie } = await login(server.url);
  server.app.engine.broker = { mint: async (session: Session) => ({ key: 'scoped-key-fixture', alias: 'alias', reference: `de-vloer-${session.id}-fixture`, budgetUsd: session.budgetUsd }), revoke: async () => {}, spend: async () => 0 };
  const created = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode', crewId: 'investigation' }), cookie, csrf: true });
  assert.equal(created.status, 201);
  await request(server.url, `/api/sessions/${created.body.id}/start`, { method: 'POST', body: {}, cookie, csrf: true });
  const finished = await sessionUntil(server.url, created.body.id, session => ['completed', 'failed'].includes(session.status), cookie);
  assert.equal(finished.status, 'completed', finished.blocker);
  const [analyst, challenger] = finished.runs;
  assert.equal(analyst.status, 'completed');
  assert.equal(analyst.verdict, undefined);
  assert.equal(challenger.verdict, 'approve');
  assert.ok(prompts[0].includes('Do not return a review verdict'));
  assert.ok(prompts[1].includes('Conclude with JSON'));
});
