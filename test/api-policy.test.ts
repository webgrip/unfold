import test from 'node:test';
import assert from 'node:assert/strict';
import type { AgentRuntime, ExecutionContext, RuntimeKind, Session } from '../src/types.ts';
import { application, login, request, createInput, sessionUntil } from './api-support.ts';

function runtime(): AgentRuntime {
  return {
    kind: 'opencode',
    async prepare(session: Session) { return { id: `w-${session.id}`, backend: 'local', endpoint: 'http://127.0.0.1:1', directory: '/tmp/none' }; },
    async execute(context: ExecutionContext) {
      await new Promise<void>((_, reject) => context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true }));
      return { summary: 'unreachable', costUsd: 0, artifacts: [] };
    },
    async captureCandidate() { return { status: 'unsupported_workspace' } as any; },
  } as unknown as AgentRuntime;
}

test('a model served outside the allowed providers is refused before the first turn', async t => {
  const server = await application('live', config => { config.runtime = { kind: 'opencode', backend: 'local', timeoutMs: 30_000 }; config.gatewayPolicy = { providers: ['anthropic'] }; }, new Map<RuntimeKind, AgentRuntime>([['opencode', runtime()]]));
  t.after(() => server.close());
  const { cookie } = await login(server.url);
  server.app.engine.broker = {
    mint: async (session: Session) => ({ key: 'sk-session-fixture-key', alias: 'a', reference: `de-vloer-${session.id}-x`, budgetUsd: session.budgetUsd }), revoke: async () => {}, spend: async () => 0, extend: async () => {},
    providersFor: async (model: string) => model === 'coding' ? ['fireworks_ai'] : undefined,
  };
  const created = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode' }), cookie, csrf: true });
  const started = await request(server.url, `/api/sessions/${created.body.id}/start`, { method: 'POST', body: {}, cookie, csrf: true });
  assert.equal(started.status, 409);
  assert.equal(started.body.error.code, 'policy_provider');
  assert.ok(started.body.error.message.includes('fireworks_ai'));
});

test('a request the gateway attributes to a provider or region outside policy stops the session and revokes its key', async t => {
  const revoked: string[] = [];
  const server = await application('live', config => { config.runtime = { kind: 'opencode', backend: 'local', timeoutMs: 30_000 }; config.gatewayPolicy = { providers: ['anthropic'], regions: ['eu'] }; }, new Map<RuntimeKind, AgentRuntime>([['opencode', runtime()]]));
  t.after(() => server.close());
  const { cookie } = await login(server.url);
  server.app.engine.broker = {
    mint: async (session: Session) => ({ key: 'sk-session-fixture-key', alias: 'a', reference: `de-vloer-${session.id}-x`, budgetUsd: session.budgetUsd }), revoke: async (reference: string) => { revoked.push(reference); }, spend: async () => 0.02, extend: async () => {},
    providersFor: async () => ['anthropic'],
    ledger: async () => ({ usage: [{ model: 'anthropic/claude-sonnet-5', requests: 1, failures: 0, usd: 0.02, inputTokens: 10, outputTokens: 5 }], requests: [{ id: 'r1', at: new Date().toISOString(), provider: 'anthropic', geo: 'global', model: 'anthropic/claude-sonnet-5', retries: 0, fallbacks: 0, guardrails: [], cacheHit: false, cachedTokens: 0, inputTokens: 10, outputTokens: 5, usd: 0.02, status: 'success' as const }] }),
  };
  const created = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ runtime: 'opencode' }), cookie, csrf: true });
  const started = await request(server.url, `/api/sessions/${created.body.id}/start`, { method: 'POST', body: {}, cookie, csrf: true });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  await sessionUntil(server.url, created.body.id, session => session.status === 'running', cookie);
  await server.app.engine.observeSpend();
  const failed = await sessionUntil(server.url, created.body.id, session => session.status === 'failed', cookie);
  assert.equal(failed.failure?.category, 'policy_violation');
  assert.ok(failed.failure?.detail?.includes('region global'));
  assert.equal(failed.requests?.[0].violation, 'region global');
  assert.ok(revoked.some(reference => reference.startsWith('de-vloer-')));
  const events = await request(server.url, `/api/sessions/${created.body.id}/history`, { cookie });
  assert.ok(JSON.stringify(events.body).includes('policy.violated'));
  const brief = JSON.stringify(events.body);
  assert.ok(brief.includes('"prompt":{"objective"'));
  assert.ok(brief.includes('"promptSha"'));
});
