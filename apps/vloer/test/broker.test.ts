import { RuntimeFailure } from '../src/failures.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { LiteLLMBroker } from '../src/broker.ts';
import type { Session } from '../src/types.ts';

async function gateway(t: any, delay = 0) {
  const keys = new Map<string, any>();
  const requests: any[] = [];
  let mode = 'normal';
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    const url = new URL(request.url!, 'http://localhost');
    requests.push({ method: request.method, path: url.pathname, body });
    assert.equal(request.headers.authorization, 'Bearer administrative-only');
    if (mode === 'error') { response.writeHead(500); response.end('administrative-only secret echo'); return; }
    if (mode === 'denied') { response.writeHead(403); response.end('{"error":"administrative-only policy"}'); return; }
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/key/generate') {
      const token = 'hashed-' + body.key_alias;
      keys.set(token, { token, key_alias: body.key_alias, blocked: false, metadata: body.metadata, spend: 0.5 });
      response.end(JSON.stringify({ key: 'sk-workspace-only' }));
    } else if (url.pathname === '/key/list') response.end(JSON.stringify({ keys: [...keys.values()], total_pages: 1 }));
    else if (url.pathname === '/key/info') response.end(JSON.stringify({ info: keys.get(url.searchParams.get('key')!) }));
    else if (url.pathname === '/key/block') { keys.get(body.key).blocked = true; response.end('{}'); }
    else if (url.pathname === '/key/update') { Object.assign(keys.get(body.key), body); response.end('{}'); }
    else { response.writeHead(404); response.end('{}'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close());
  const address = server.address() as { port: number };
  const config = { baseUrl: `http://127.0.0.1:${address.port}/v1`, adminUrl: `http://127.0.0.1:${address.port}`, masterKey: 'administrative-only', models: ['coding'], ttl: '4h', settlementDelayMs: delay };
  return { broker: new LiteLLMBroker(config), config, keys, requests, fail: () => { mode = 'error'; }, deny: () => { mode = 'denied'; } };
}

const session = { id: 'session-123', ownerId: 'owner', budgetUsd: 5 } as Session;

test('broker mints scoped finite credentials and keeps administrative secrets out of results', async t => {
  const { broker, requests } = await gateway(t);
  for (const budgetUsd of [0, -1, NaN, Infinity]) await assert.rejects(broker.mint({ ...session, budgetUsd }), /uncapped/);
  assert.equal(requests.length, 0);
  const credential = await broker.mint(session);
  assert.equal(credential.key, 'sk-workspace-only');
  assert.match(credential.reference, /^de-vloer-session-123-/);
  assert.equal(JSON.stringify(credential).includes('administrative-only'), false);
  assert.deepEqual(requests[0].body.models, ['coding']);
  assert.equal(requests[0].body.duration, '4h');
  assert.equal(requests[0].body.max_budget, 5);
  assert.equal(requests[0].body.budget_duration, null);
});

test('revocation blocks credentials while retaining their accounting across broker restart', async t => {
  const { broker, config, keys, requests } = await gateway(t);
  const credential = await broker.mint(session);
  await broker.revoke(credential.reference);
  const key = [...keys.values()][0];
  assert.equal(key.blocked, true);
  assert.ok(key.metadata.de_vloer_blocked_at);
  const restarted = new LiteLLMBroker(config);
  assert.equal(await restarted.spend(credential.reference), 0.5);
  assert.deepEqual(await restarted.aliasesForSession(session.id), [credential.reference]);
  assert.equal(requests.some(item => item.path === '/key/delete'), false);
});

test('post-revocation accounting grace and missing spend remain unknown instead of zero', async t => {
  const { broker, keys } = await gateway(t, 60_000);
  const credential = await broker.mint(session);
  await broker.revoke(credential.reference);
  assert.equal(await broker.spend(credential.reference), undefined);
  const key = [...keys.values()][0];
  key.metadata.de_vloer_blocked_at = new Date(Date.now() - 120_000).toISOString();
  delete key.spend;
  assert.equal(await broker.spend(credential.reference), undefined);
  key.spend = 0;
  assert.equal(await broker.spend(credential.reference), 0);
  keys.clear();
  assert.equal(await broker.spend(credential.reference), undefined);
});

test('a gateway outage is connectivity, not a rejection, and names the call', async t => {
  const { broker, fail } = await gateway(t);
  fail();
  await assert.rejects(broker.mint(session), error => {
    assert.equal(String(error).includes('administrative-only'), false);
    assert(error instanceof RuntimeFailure);
    assert.equal(error.category, 'connectivity');
    assert.equal(error.httpStatus, 500);
    assert.equal(error.detail, 'POST /key/generate returned HTTP 500');
    return true;
  });
});

test('a gateway refusal is a rejection that never echoes the response', async t => {
  const { broker, deny } = await gateway(t);
  deny();
  await assert.rejects(broker.mint(session), error => {
    assert.equal(String(error).includes('administrative-only'), false);
    assert(error instanceof RuntimeFailure);
    assert.equal(error.category, 'gateway_rejected');
    assert.equal(error.httpStatus, 403);
    return true;
  });
});

test('usage aggregates the gateway ledger per model with the routed group and failures', async t => {
  const { broker, config } = await gateway(t);
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    if (url.includes('/spend/logs')) {
      assert.ok(url.includes('api_key=hashed-'));
      return new Response(JSON.stringify([
        { model: 'anthropic/claude-haiku-4-5', model_group: 'auto', spend: 0.01, status: 'success', prompt_tokens: 100, completion_tokens: 20, request_id: 'r1', custom_llm_provider: 'anthropic', api_base: 'https://api.anthropic.com/v1/messages', startTime: '2026-09-10T12:00:00.000Z', completionStartTime: '2026-09-10T12:00:00.400Z', endTime: '2026-09-10T12:00:02.000Z', request_tags: ['User-Agent: opencode/1.18.30 ai-sdk'], metadata: { routing_decision: { tier: 'LOW', cause: 'heuristic_scorer' }, autorouter_savings: 0.004, attempted_retries: 1, attempted_fallbacks: 0, applied_guardrails: ['lakera'], additional_usage_values: { inference_geo: 'global', prompt_tokens_details: { cached_tokens: 50 } }, litellm_call_id: 'call-1' } },
        { model: 'anthropic/claude-sonnet-5', model_group: 'auto', spend: 0.02, status: 'success', prompt_tokens: 200, completion_tokens: 40, request_id: 'r2', startTime: '2026-09-10T12:00:03.000Z' },
        { model: 'anthropic/claude-sonnet-5', model_group: 'auto', spend: 0.03, status: 'success', prompt_tokens: 300, completion_tokens: 60, request_id: 'r3', startTime: '2026-09-10T12:00:06.000Z' },
        { model: 'auto', model_group: 'auto', spend: 0, status: 'failure', prompt_tokens: 0, completion_tokens: 0, request_id: 'r4', startTime: '2026-09-10T12:00:09.000Z', metadata: { error_information: { error_class: 'BudgetExceededError', error_code: '429', error_message: 'Budget has been exceeded! Key=sk-secret spend=0.25' } } },
      ]), { headers: { 'content-type': 'application/json' } });
    }
    return original(input, init);
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = original; });
  const credential = await broker.mint(session);
  const usage = await broker.usage(credential.reference);
  assert.deepEqual(usage, [
    { model: 'anthropic/claude-sonnet-5', group: 'auto', requests: 2, failures: 0, usd: 0.05, inputTokens: 500, outputTokens: 100 },
    { model: 'anthropic/claude-haiku-4-5', group: 'auto', requests: 1, failures: 0, usd: 0.01, inputTokens: 100, outputTokens: 20 },
    { model: 'auto', requests: 1, failures: 1, usd: 0, inputTokens: 0, outputTokens: 0 },
  ]);
  assert.equal(await broker.usage('de-vloer-missing'), undefined);
  const ledger = (await broker.ledger(credential.reference))!;
  assert.equal(ledger.requests.length, 4);
  const first = ledger.requests[0];
  assert.equal(first.id, 'r1');
  assert.equal(first.provider, 'anthropic');
  assert.equal(first.host, 'api.anthropic.com');
  assert.equal(first.geo, 'global');
  assert.equal(first.group, 'auto');
  assert.equal(first.tier, 'LOW');
  assert.equal(first.cause, 'heuristic_scorer');
  assert.equal(first.savingsUsd, 0.004);
  assert.equal(first.retries, 1);
  assert.deepEqual(first.guardrails, ['lakera']);
  assert.equal(first.cachedTokens, 50);
  assert.equal(first.durationMs, 2000);
  assert.equal(first.firstTokenMs, 400);
  assert.equal(first.harness, 'opencode/1.18.30');
  assert.equal(first.callId, 'call-1');
  const refused = ledger.requests.at(-1)!;
  assert.equal(refused.status, 'failure');
  assert.ok(refused.error!.startsWith('BudgetExceededError · 429 · Budget has been exceeded'));
  void config;
});

test('providersFor resolves a model, follows an auto-router to its tiers, and is undefined for an unknown name', async t => {
  const { broker } = await gateway(t);
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    if (String(input).includes('/model/info')) return new Response(JSON.stringify({ data: [
      { model_name: 'claude-sonnet-5', litellm_params: { model: 'anthropic/claude-sonnet-5' }, model_info: { litellm_provider: 'anthropic' } },
      { model_name: 'kimi-latest', litellm_params: { model: 'fireworks_ai/accounts/fireworks/models/kimi-k3' }, model_info: { litellm_provider: 'fireworks_ai' } },
      { model_name: 'auto', litellm_params: { complexity_router_config: { tiers: { SIMPLE: 'kimi-latest', MEDIUM: 'claude-sonnet-5', COMPLEX: 'claude-sonnet-5' } } }, model_info: { litellm_provider: 'auto_router' } },
      { model_name: 'nested', litellm_params: { complexity_router_config: { tiers: { SIMPLE: 'auto' } } }, model_info: { litellm_provider: 'auto_router' } },
    ] }), { headers: { 'content-type': 'application/json' } });
    return original(input, init);
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = original; });
  assert.deepEqual(await broker.providersFor('claude-sonnet-5'), ['anthropic']);
  assert.deepEqual((await broker.providersFor('auto'))!.sort(), ['anthropic', 'fireworks_ai']);
  assert.deepEqual((await broker.providersFor('nested'))!.sort(), ['anthropic', 'fireworks_ai']);
  assert.equal(await broker.providersFor('missing'), undefined);
});
