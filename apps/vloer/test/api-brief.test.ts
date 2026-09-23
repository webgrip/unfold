import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AgentRuntime, ExecutionContext, RuntimeKind, Session } from '../src/types.ts';
import { application, login, request, createInput, sessionUntil } from './api-support.ts';

function runtime(verdicts: Array<'approve' | 'inconclusive' | undefined> = [], tools = 0) {
  let index = 0;
  return {
    kind: 'opencode',
    async prepare(session: Session) { return { id: `w-${session.id}`, backend: 'local', endpoint: 'http://127.0.0.1:1', directory: '/tmp/none' }; },
    async execute(context: ExecutionContext) {
      for (let i = 0; i < tools; i += 1) { context.emit({ type: 'tool', data: { name: 'read', status: 'running', partId: `p${i}` } }); if (context.signal.aborted) throw context.signal.reason; }
      const verdict = verdicts[index] ?? (context.role.mode === 'read' ? 'approve' : undefined); index += 1;
      return { summary: `objective was: ${context.session.objective.slice(0, 80)}`, costUsd: 0.01, artifacts: [], verdict };
    },
    async captureCandidate() { return { status: 'unsupported_workspace' } as any; },
    async dispose() {},
    async respond() {},
  } as unknown as AgentRuntime;
}

const broker = { mint: async (session: Session) => ({ key: 'sk-session-fixture-key', alias: 'a', reference: `de-vloer-${session.id}-x`, budgetUsd: session.budgetUsd }), revoke: async () => {}, spend: async () => 0 };

test('a brief of a few words is refused before any budget is authorized', async t => {
  const server = await application('live', config => { config.runtime = { kind: 'opencode', backend: 'local', timeoutMs: 30_000 }; }, new Map<RuntimeKind, AgentRuntime>([['opencode', runtime()]]));
  t.after(() => server.close());
  const { cookie } = await login(server.url);
  const thin = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode', objective: 'Hiya' }), cookie, csrf: true });
  assert.equal(thin.status, 400);
  assert.equal(thin.body.error.code, 'objective_too_thin');
});

test('the gateway screens the brief cheaply, asks the operator when it is not actionable, and starts once answered', async t => {
  const prompts: string[] = [];
  let actionable = false;
  const gateway = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const data = JSON.parse(body); prompts.push(data.model + '|' + data.messages.at(-1).content);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: actionable ? '{"actionable": true, "reason": "clear", "questions": []}' : 'Sure: {"actionable": false, "reason": "A greeting is not a task.", "questions": ["What should change?", "How will you know it is done?"]}' } }] }));
  });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  const base = `http://127.0.0.1:${(gateway.address() as { port: number }).port}/v1`;
  const server = await application('live', config => {
    config.runtime = { kind: 'opencode', backend: 'local', timeoutMs: 30_000 };
    config.models.push({ id: 'cheap', name: 'Cheap', providerId: 'litellm', modelId: 'claude-haiku-4-5' });
    config.litellm = { baseUrl: base, adminUrl: base.replace(/\/v1$/, ''), masterKey: 'sk-master-fixture', models: ['coding', 'claude-haiku-4-5'], ttl: '4h' };
  }, new Map<RuntimeKind, AgentRuntime>([['opencode', runtime()]]));
  t.after(async () => { await server.close(); gateway.close(); });
  server.app.engine.broker = broker;
  const { cookie } = await login(server.url);
  const created = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode', title: 'Hiya', objective: 'Hiya there, just saying hello to everyone here.' }), cookie, csrf: true });
  await request(server.url, `/api/sessions/${created.body.id}/start`, { method: 'POST', body: {}, cookie, csrf: true });
  const waiting = await sessionUntil(server.url, created.body.id, session => session.status === 'waiting_input', cookie);
  assert.equal(waiting.runs[0].status, 'queued');
  assert.equal(prompts.length, 1);
  assert.ok(prompts[0].startsWith('claude-haiku-4-5|'));
  const pending = await request(server.url, `/api/sessions/${created.body.id}/permissions`, { cookie });
  const question = pending.body.find((item: any) => item.kind === 'question' && !item.resolved);
  assert.equal(question.title, 'The brief needs more before the crew starts');
  assert.equal(question.questions.length, 2);
  actionable = true;
  const answered = await request(server.url, `/api/sessions/${created.body.id}/permissions/${question.id}`, { method: 'POST', body: { answers: [['Rename the README title'], ['The title reads De Vloer']] }, cookie, csrf: true });
  assert.equal(answered.status, 200, JSON.stringify(answered.body));
  const done = await sessionUntil(server.url, created.body.id, session => ['completed', 'failed'].includes(session.status), cookie);
  assert.equal(done.status, 'completed', done.blocker);
  assert.ok(done.objective.includes('Operator clarification:\nRename the README title\nThe title reads De Vloer'));
  const events = await request(server.url, `/api/sessions/${created.body.id}/history`, { cookie });
  const types = events.body.map((event: any) => event.type);
  assert.ok(types.includes('brief.unclear') && types.includes('brief.clarified'));
  assert.equal(types.filter((type: string) => type === 'brief.checked').length, 1);
});

test('an investigation crew completes with the challenger\'s verdict instead of failing, and a runaway role is stopped', async t => {
  const server = await application('live', config => {
    config.runtime = { kind: 'opencode', backend: 'local', timeoutMs: 30_000, maxToolCalls: 5 };
    config.crews.push({ id: 'investigation', name: 'Investigation', description: 'read only', roles: [{ id: 'analyst', name: 'Analyst', mode: 'read', instruction: 'look' }, { id: 'challenger', name: 'Challenger', mode: 'read', instruction: 'check' }] });
  }, new Map<RuntimeKind, AgentRuntime>([['opencode', runtime(['inconclusive', 'inconclusive'])]]));
  t.after(() => server.close());
  server.app.engine.broker = broker;
  const { cookie } = await login(server.url);
  const created = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode', crewId: 'investigation' }), cookie, csrf: true });
  await request(server.url, `/api/sessions/${created.body.id}/start`, { method: 'POST', body: {}, cookie, csrf: true });
  const done = await sessionUntil(server.url, created.body.id, session => ['completed', 'failed'].includes(session.status), cookie);
  assert.equal(done.status, 'completed', done.blocker);
  assert.equal(done.runs[0].verdict, undefined);
  assert.equal(done.runs[1].verdict, 'inconclusive');
  assert.equal(done.runs[1].status, 'completed');
  const runaway = await application('live', config => { config.runtime = { kind: 'opencode', backend: 'local', timeoutMs: 30_000, maxToolCalls: 5 }; }, new Map<RuntimeKind, AgentRuntime>([['opencode', runtime([], 12)]]));
  t.after(() => runaway.close());
  runaway.app.engine.broker = broker;
  const other = await login(runaway.url);
  const loose = await request(runaway.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode' }), cookie: other.cookie, csrf: true });
  await request(runaway.url, `/api/sessions/${loose.body.id}/start`, { method: 'POST', body: {}, cookie: other.cookie, csrf: true });
  const stopped = await sessionUntil(runaway.url, loose.body.id, session => ['completed', 'failed'].includes(session.status), other.cookie);
  assert.equal(stopped.status, 'failed');
  assert.equal(stopped.failure?.category, 'runaway');
  assert.ok(stopped.failure?.detail?.includes('the limit is 5'));
});
