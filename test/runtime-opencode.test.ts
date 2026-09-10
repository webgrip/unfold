import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenCodeRuntime, type RuntimeWorkspaces } from '../src/runtime/opencode.ts';
import type { AppConfig, ExecutionContext, RuntimeEvent, Workspace } from '../src/types.ts';
import { RuntimeFailure } from '../src/failures.ts';
import { executionFixture } from './runtime-fixture.ts';

const workspace: Workspace = { id: 'ws', backend: 'local', directory: '/workspace/repo', endpoint: 'http://agent.test:4096' };
const manager: RuntimeWorkspaces = {
  prepare: async () => ({ ...workspace }), credentials: () => ({ username: 'opencode', password: 'workspace-secret' }),
  executionEnvironment: () => ({}), dispose: async () => {},
};
const config = { models: [{ id: 'coding', providerId: 'litellm', modelId: 'coding', name: 'Coding' }], runtime: { timeoutMs: 3000 } } as AppConfig;
function context(events: RuntimeEvent[], signal = new AbortController().signal): ExecutionContext {
  return executionFixture({ runtime: 'opencode', role: { id: 'reviewer', name: 'Reviewer', mode: 'read', instruction: 'Review the evidence' }, workspace: { ...workspace }, verify: ['npm', 'test'], prompt: 'Review the change', emit: event => { events.push(event); }, signal });
}

function wire(options: { failPrompt?: boolean; waiting?: boolean; incomplete?: boolean; toolCommand?: string } = {}) {
  const calls: Array<{ path: string; method: string; body: any }> = [];
  let submitted = false;
  let permission = options.waiting ?? false;
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('directory'), '/workspace/repo');
    assert.equal((init?.headers as any).Authorization, `Basic ${Buffer.from('opencode:workspace-secret').toString('base64')}`);
    assert.equal(init?.redirect, 'error');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path: url.pathname, method: init?.method ?? 'GET', body });
    const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/event') return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"id":"evt_connected","type":"server.connected","properties":{}}\n\n')); controller.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
    if (url.pathname === '/session') return json({ id: 'ses_native' });
    if (url.pathname.endsWith('/prompt_async')) {
      assert.deepEqual(body.model, { providerID: 'litellm', modelID: 'coding' });
      assert.equal(body.parts[0].type, 'text');
      submitted = true;
      return options.failPrompt ? new Response('secret-provider-error', { status: 503 }) : new Response(null, { status: 204 });
    }
    if (url.pathname === '/permission/perm_one/reply') { permission = false; return json(true); }
    if (url.pathname === '/session/status') return json(permission ? { ses_native: { type: 'busy' } } : {});
    if (url.pathname === '/permission') return json(submitted && permission ? [{ id: 'perm_one', sessionID: 'ses_native', permission: 'read', patterns: ['README.md'], always: ['README.md'], metadata: {} }] : []);
    if (url.pathname === '/question' || url.pathname.endsWith('/children')) return json([]);
    if (url.pathname.endsWith('/message')) return json(submitted && !permission ? [{ info: { id: 'msg_answer', role: 'assistant', sessionID: 'ses_native', parentID: 'msg_user', time: { created: 1, completed: 2 }, finish: options.incomplete ? 'tool-calls' : 'stop', cost: 0.02, tokens: { input: 10, output: 20 } }, parts: [{ type: 'text', text: '```json\n{"verdict":"approve","summary":"Inspected the supplied evidence"}\n```' }, ...(options.toolCommand ? [{ type: 'tool', tool: 'bash', state: { status: 'completed', input: { command: options.toolCommand }, output: 'Actual verification output' } }] : [])] }] : []);
    if (url.pathname.endsWith('/diff')) return json([{ file: 'README.md', before: 'before', after: 'after', additions: 1, deletions: 1 }]);
    if (url.pathname.endsWith('/abort')) return json(true);
    throw new Error(`Unexpected wire request ${url.pathname}`);
  }) as typeof fetch;
  return { fetcher, calls };
}

test('OpenCode creates native session, submits once, reconciles final answer and real native diff', async () => {
  const events: RuntimeEvent[] = [];
  const fake = wire();
  const runtime = new OpenCodeRuntime(config, manager, fake.fetcher);
  const result = await runtime.execute(context(events));
  assert.equal(result.nativeId, 'ses_native');
  assert.equal(result.verdict, 'approve');
  assert.equal(result.costUsd, 0.02);
  assert.equal(result.artifacts.find(artifact => artifact.kind === 'diff')?.content.includes('README.md'), true);
  assert.equal(fake.calls.filter(call => call.path.endsWith('/prompt_async')).length, 1);
  assert.deepEqual(events.find(event => event.type === 'native.session')?.data, { nativeId: 'ses_native' });
  assert.equal(fake.calls.find(call => call.path === '/session')?.body.permission.find((rule: any) => rule.permission === 'task').action, 'deny');
});

test('OpenCode exposes native approval identifiers and resumes after actual permission response', async () => {
  const events: RuntimeEvent[] = [];
  const fake = wire({ waiting: true });
  const runtime = new OpenCodeRuntime(config, manager, fake.fetcher);
  const ctx = context(events);
  ctx.emit = event => {
    events.push(event);
    if (event.type === 'permission') void runtime.respond(ctx.workspace, { ...event.data, id: 'local', sessionId: 'session', runId: 'run' } as any, { decision: 'once' });
  };
  const result = await runtime.execute(ctx);
  assert.equal(result.verdict, 'approve');
  assert.equal(events.some(event => event.type === 'permission' && event.data.nativeId === 'perm_one'), true);
  assert.deepEqual(fake.calls.find(call => call.path === '/permission/perm_one/reply')?.body, { reply: 'once' });
});

test('OpenCode never retries an ambiguous paid prompt and excludes raw error bodies', async () => {
  const fake = wire({ failPrompt: true });
  const runtime = new OpenCodeRuntime(config, manager, fake.fetcher);
  await assert.rejects(runtime.execute(context([])), error => error instanceof RuntimeFailure && error.category === 'prompt_acceptance_unknown' && error.promptAcceptance === 'unknown' && !JSON.stringify(error).includes('secret-provider-error'));
  assert.equal(fake.calls.filter(call => call.path.endsWith('/prompt_async')).length, 1);
  assert.equal(fake.calls.some(call => call.path.endsWith('/abort')), true);
});

test('OpenCode interruption aborts native run and does not turn cancellation into retry', async () => {
  const fake = wire({ waiting: true });
  const controller = new AbortController();
  const runtime = new OpenCodeRuntime(config, manager, fake.fetcher);
  const ctx = context([], controller.signal);
  ctx.emit = event => { if (event.type === 'permission') controller.abort(); };
  await assert.rejects(runtime.execute(ctx), { name: 'AbortError' });
  assert.equal(fake.calls.filter(call => call.path.endsWith('/prompt_async')).length, 1);
});

test('OpenCode cannot complete on HTTP acceptance or a completed tool-call message', async () => {
  const fake = wire({ incomplete: true });
  const runtime = new OpenCodeRuntime({ ...config, runtime: { ...config.runtime, timeoutMs: 80 } }, manager, fake.fetcher);
  await assert.rejects(runtime.execute(context([])), /configured time limit/);
  assert.equal(fake.calls.some(call => call.path.endsWith('/diff')), false);
});

test('OpenCode supplies verification argv and captures only its actual completed tool output', async () => {
  for (const [toolCommand, expected] of [['npm test', true], ['npm', false], ['echo npm test', false]] as const) {
    const fake = wire({ toolCommand });
    const runtime = new OpenCodeRuntime(config, manager, fake.fetcher);
    const ctx = context([]);
    ctx.role.mode = 'write';
    const result = await runtime.execute(ctx);
    assert.equal(result.artifacts.some(artifact => artifact.kind === 'test' && artifact.content === 'Actual verification output'), expected);
    assert.match(fake.calls.find(call => call.path.endsWith('/prompt_async'))!.body.parts[0].text, /\["npm","test"\]/);
  }
});

test('OpenCode recovery releases managed workers when their in-memory native credentials are unavailable', async () => {
  let released = 0;
  const recoveredManager = { ...manager, credentials: () => undefined, dispose: async () => { released++; } };
  const runtime = new OpenCodeRuntime(config, recoveredManager, (async () => { throw new Error('Unauthenticated abort must not be attempted'); }) as typeof fetch);
  await runtime.interrupt({ ...workspace, nativeSessionId: 'ses_recovered' });
  assert.equal(released, 1);
});

test('OpenCode interruption reports native abort failures to the controller', async () => {
  const runtime = new OpenCodeRuntime(config, manager, (async () => new Response('private-error', { status: 503 })) as typeof fetch);
  await assert.rejects(runtime.interrupt({ ...workspace, nativeSessionId: 'ses_native' }), error => error instanceof RuntimeFailure && error.category === 'harness_rejected' && error.httpStatus === 503);
});

test('automatic approval creates the native session with allow rules and keeps the read-role denials', async () => {
  const events: RuntimeEvent[] = [];
  const fake = wire();
  const runtime = new OpenCodeRuntime(config, manager, fake.fetcher);
  const ctx = context(events);
  ctx.session = { ...ctx.session, approval: 'auto' };
  await runtime.execute(ctx);
  const rules = fake.calls.find(call => call.path === '/session')?.body.permission;
  assert.equal(rules.find((rule: any) => rule.permission === '*').action, 'allow');
  assert.equal(rules.find((rule: any) => rule.permission === 'edit').action, 'deny');
  assert.equal(rules.find((rule: any) => rule.permission === 'bash').action, 'deny');
  const writer = context(events);
  writer.session = { ...writer.session, approval: 'auto' };
  writer.role = { id: 'builder', name: 'Builder', mode: 'write', instruction: 'Build' };
  const second = wire();
  await new OpenCodeRuntime(config, manager, second.fetcher).execute(writer);
  const writerRules = second.calls.find(call => call.path === '/session')?.body.permission;
  assert.deepEqual(writerRules, [{ permission: '*', pattern: '*', action: 'allow' }, { permission: 'external_directory', pattern: '*', action: 'deny' }]);
});
