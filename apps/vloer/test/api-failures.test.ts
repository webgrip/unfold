import test from 'node:test';
import assert from 'node:assert/strict';
import { application, createSession, login, replay, request, sessionUntil } from './api-support.ts';
import { OpenCodeRuntime, type RuntimeWorkspaces } from '../src/runtime/opencode.ts';
import { runProcess } from '../src/runtime/workspace.ts';
import { RuntimeFailure } from '../src/failures.ts';
import type { AgentRuntime, AppConfig, Event, ExecutionContext, RuntimeKind } from '../src/types.ts';

const privateText = 'Authorization: Bearer opaque-native-secret; Cookie: private-cookie; https://user:password@private.invalid/path?token=never-persist';
const privateParts = ['opaque-native-secret', 'private-cookie', 'private.invalid', 'user:password', 'never-persist'];
const cases = [
  ['missing', 'missing_executable', 'workspace', 'not_submitted'],
  ['workspace-timeout', 'timeout', 'workspace', 'not_submitted'],
  ['provider', 'gateway_rejected', 'execution', 'accepted'],
  ['harness', 'harness_rejected', 'prompt', 'rejected'],
  ['connectivity', 'connectivity', 'runtime', 'not_submitted'],
  ['preflight-timeout', 'timeout', 'runtime', 'not_submitted'],
  ['disconnect', 'prompt_acceptance_unknown', 'prompt', 'unknown'],
  ['submission-timeout', 'prompt_acceptance_unknown', 'prompt', 'unknown'],
  ['poll-disconnect', 'connectivity', 'execution', 'accepted'],
  ['unknown', 'runtime_failure', 'execution', 'unknown'],
] as const;

test('live failures persist actionable safe evidence, survive authenticated replay, and never replay a paid submission', { timeout: 30_000 }, async t => {
  const unconfigured: AgentRuntime = { kind: 'opencode', prepare: async () => { throw new Error('Fixture not configured'); }, execute: async () => { throw new Error('Fixture not configured'); }, interrupt: async () => {}, dispose: async () => {} };
  const runtimes = new Map<RuntimeKind, AgentRuntime>([['opencode', unconfigured]]);
  const server = await application('live', undefined, runtimes);
  t.after(() => server.close());
  const auth = await login(server.url);
  let mints = 0;
  server.app.engine.broker = {
    mint: async session => { mints++; return { key: 'scoped-key-fixture', alias: 'alias', reference: `reference-${session.id}`, budgetUsd: session.budgetUsd }; },
    revoke: async () => {}, spend: async () => 0,
  };
  const retained: Array<{ id: string; history: Event[]; submissions: number }> = [];
  let allSubmissions = 0;
  for (const [scenario, category, stage, acceptance] of cases) {
    let submitted = false;
    let submissions = 0;
    const config = { ...server.config, runtime: { ...server.config.runtime, timeoutMs: ['submission-timeout', 'preflight-timeout'].includes(scenario) ? 60 : 3000 } } as AppConfig;
    const workspace = { id: 'fixture-workspace', backend: 'external' as const, directory: '/repository', endpoint: 'https://runtime.fixture.invalid' };
    const workspaces: RuntimeWorkspaces = {
      prepare: async () => {
        if (scenario === 'missing') await runProcess('/no-such-vloer-executable', [], server.config.dataDir, {});
        if (scenario === 'workspace-timeout') throw new DOMException(privateText, 'TimeoutError');
        return workspace;
      },
      credentials: () => ({ username: 'user', password: 'opaque-native-secret' }),
      executionEnvironment: () => ({}), dispose: async () => {},
    };
    const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const json = (value: unknown) => new Response(JSON.stringify(value));
      const disconnected = () => new TypeError(privateText, { cause: Object.assign(new Error(privateText), { code: 'ECONNRESET', headers: { authorization: privateText } }) });
      if (path === '/event') return new Response('');
      if (path.endsWith('/abort')) return json(true);
      if (path === '/session') {
        if (scenario === 'connectivity') throw disconnected();
        if (scenario === 'preflight-timeout') return await new Promise<Response>((_, reject) => {
          if (init?.signal?.aborted) reject(init.signal.reason);
          else init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        });
        return json({ id: 'native-session' });
      }
      if (path.endsWith('/prompt_async')) {
        submissions++; allSubmissions++; submitted = true;
        if (scenario === 'disconnect') throw disconnected();
        if (scenario === 'submission-timeout') return await new Promise<Response>((_, reject) => {
          if (init?.signal?.aborted) reject(init.signal.reason);
          else init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        });
        if (scenario === 'harness') return new Response(privateText, { status: 401, headers: { 'x-private': privateText } });
        return new Response(null, { status: 204 });
      }
      if (path === '/session/status') {
        if (scenario === 'poll-disconnect') throw disconnected();
        return json({});
      }
      if (path.endsWith('/message')) return json(submitted ? [{ info: { id: 'answer', role: 'assistant', error: { name: 'APIError', data: { message: privateText, responseBody: privateText, headers: { authorization: privateText } } } }, parts: [] }] : []);
      return json([]);
    }) as typeof fetch;
    const runtime = new OpenCodeRuntime(config, workspaces, fetcher);
    if (scenario === 'unknown') runtime.execute = async (_context: ExecutionContext) => { throw Object.assign(new Error(privateText), { response: { body: privateText }, category: privateText }); };
    runtimes.set('opencode', runtime);
    const session = await createSession(server.url, { cookie: auth.cookie, overrides: { runtime: 'opencode', title: scenario } });
    assert.equal((await request(server.url, `/api/sessions/${session.id}/start`, { method: 'POST', cookie: auth.cookie })).status, 200);
    const failed = await sessionUntil(server.url, session.id, value => value.status === 'failed' && value.costStatus === 'settled', auth.cookie);
    assert.equal(failed.failure?.category, category, scenario);
    assert.equal(failed.failure?.stage, stage, scenario);
    assert.equal(failed.failure?.promptAcceptance, acceptance, scenario);
    assert.equal(failed.failure?.automaticRetry, false);
    assert(failed.failure?.remediation.length && failed.failure.remediation.length > 30);
    assert.equal(failed.blocker, failed.failure?.message);
    assert.equal((await request(server.url, `/api/sessions/${session.id}/history`)).status, 401);
    const history = await request(server.url, `/api/sessions/${session.id}/history`, { cookie: auth.cookie });
    const event = history.body.find((item: Event) => item.type === 'session.failed');
    assert.deepEqual(event.data.failure, failed.failure);
    const persisted = JSON.stringify({ session: server.app.store.getSession(session.id), history: server.app.store.events(session.id) });
    for (const value of privateParts) {
      assert(!persisted.includes(value), `${scenario} persisted private runtime data`);
      assert(!history.text.includes(value), `${scenario} exposed private runtime data`);
    }
    assert.equal((await request(server.url, `/api/sessions/${session.id}/resume`, { method: 'POST', cookie: auth.cookie })).status, 409);
    assert.equal(submissions, ['missing', 'workspace-timeout', 'connectivity', 'preflight-timeout', 'unknown'].includes(scenario) ? 0 : 1);
    retained.push({ id: session.id, history: history.body, submissions });
  }
  const beforeRestartSubmissions = allSubmissions;
  await server.restart();
  for (const record of retained) {
    const restored = await request(server.url, `/api/sessions/${record.id}`, { cookie: auth.cookie });
    assert.equal(restored.body.status, 'failed');
    const events = await replay(server.url, record.id, 0, record.history.length, auth.cookie);
    assert.deepEqual(events, record.history);
    for (const value of privateParts) assert(!JSON.stringify(events).includes(value));
  }
  assert.equal(mints, cases.length);
  assert.equal(allSubmissions, beforeRestartSubmissions);
});

test('mutated typed errors cannot smuggle diagnostics or vocabulary into persisted and replayed failures', async t => {
  let failure = new RuntimeFailure('workspace_setup', 'workspace');
  const runtime: AgentRuntime = { kind: 'demo', prepare: async () => { throw failure; }, execute: async () => { throw new Error('must not execute'); }, interrupt: async () => {}, dispose: async () => {} };
  const server = await application('demo', undefined, new Map([['demo', runtime]]));
  t.after(() => server.close());
  const mutations = [
    { values: {}, category: 'workspace_setup', stage: 'workspace', acceptance: 'not_submitted' },
    { values: { category: privateText, stage: privateText, promptAcceptance: privateText }, category: 'runtime_failure', stage: 'execution', acceptance: 'unknown' },
    { values: { category: 'constructor', stage: null, promptAcceptance: { raw: privateText } }, category: 'runtime_failure', stage: 'execution', acceptance: 'unknown' },
    { values: { category: '__proto__', stage: 42, promptAcceptance: undefined }, category: 'runtime_failure', stage: 'execution', acceptance: 'unknown' },
  ];
  for (const mutation of mutations) {
    failure = Object.assign(new RuntimeFailure('workspace_setup', 'workspace'), { message: privateText, stack: privateText, cause: { body: privateText }, headers: { Authorization: privateText }, ...mutation.values });
    const created = await createSession(server.url);
    await request(server.url, `/api/sessions/${created.id}/start`, { method: 'POST' });
    const failed = await sessionUntil(server.url, created.id, session => session.status === 'failed');
    assert.equal(failed.failure?.category, mutation.category);
    assert.equal(failed.failure?.stage, mutation.stage);
    assert.equal(failed.failure?.promptAcceptance, mutation.acceptance);
    assert.equal(failed.failure?.automaticRetry, false);
    assert.equal(typeof failed.failure?.message, 'string');
    assert.equal(typeof failed.failure?.remediation, 'string');
    assert.equal(failed.failure?.message, mutation.category === 'workspace_setup' ? 'The workspace could not be prepared.' : 'Execution failed without a recognized safe diagnosis.');
    const storedEvents = server.app.store.events(created.id);
    const persisted = JSON.stringify(server.app.store.getSession(created.id)) + JSON.stringify(storedEvents);
    for (const value of privateParts) assert(!persisted.includes(value));
    await server.restart();
    const events = await replay(server.url, created.id, 0, storedEvents.length);
    assert.deepEqual(events, storedEvents);
    assert.deepEqual(events.find(event => event.type === 'session.failed')?.data.failure, failed.failure);
    for (const value of privateParts) assert(!JSON.stringify(events).includes(value));
  }
});
