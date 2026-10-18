import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gatewayFailure } from '../src/ask/service.ts';
import { CardArtGenerator } from '../src/card-art.ts';
import { gatewayError, type BudgetOwner, type GatewayErrorKind } from '../src/gateway-errors.ts';

type Captured = { litellm: string; case: string; status: number; body: string; kind: GatewayErrorKind; budgetOwner: BudgetOwner };
const captured: Captured[] = JSON.parse(readFileSync(new URL('./fixtures/litellm-errors.json', import.meta.url), 'utf8'));

test('every error body captured from LiteLLM 1.102.4 and 1.105.1 gets its kind', () => {
  assert.deepEqual([...new Set(captured.map(entry => entry.litellm))].sort(), ['1.102.4', '1.105.1']);
  for (const entry of captured) {
    const error = gatewayError(entry.status, entry.body);
    assert.deepEqual([error.kind, error.budgetOwner], [entry.kind, entry.budgetOwner], `${entry.litellm} ${entry.case} (HTTP ${entry.status})`);
  }
});

test('a spent budget is a budget whichever status LiteLLM gives it', () => {
  const spent = captured.filter(entry => entry.kind === 'budget_exceeded');
  assert.deepEqual([...new Set(spent.map(entry => entry.status))].sort(), [422, 429], 'the fixture holds both the old and the new status');
  const body = spent.find(entry => entry.litellm === '1.105.1' && entry.budgetOwner === 'key')!.body;
  for (const status of [400, 402, 403, 422, 429, 500, 0]) assert.equal(gatewayError(status, body).kind, 'budget_exceeded', `HTTP ${status}`);
});

test('budget wording decides without LiteLLM\'s JSON shape', () => {
  const cases: [number, string, GatewayErrorKind, BudgetOwner][] = [
    [400, '{"error":"Budget has been exceeded"}', 'budget_exceeded', null],
    [429, 'ExceededBudget: budget', 'budget_exceeded', null],
    [422, '{"error":{"message":"ExceededBudget: Key over 1d budget. Spend=2.0, Budget=1.0","type":"budget_exceeded","param":null,"code":"422"}}', 'budget_exceeded', 'key'],
    [422, '{"error":{"message":"ExceededBudget: Team=t-1 over 30d budget. Spend=2.0, Budget=1.0","type":"budget_exceeded","param":null,"code":"422"}}', 'budget_exceeded', 'team'],
    [422, '{"error":{"message":"Budget has been exceeded! User=u-1 in Team=t-1 Current cost: 2.0, Max budget: 1.0","type":"budget_exceeded","param":null,"code":"422"}}', 'budget_exceeded', 'user'],
    [422, '{"error":{"message":"ExceededBudget: End User=e-1 over budget. Spend=2.0, Budget=1.0","type":"budget_exceeded","param":null,"code":"422"}}', 'budget_exceeded', 'end_user'],
    [422, '{"error":{"message":"Budget has been exceeded! Organization=o-1 Current cost: 2.0, Max budget: 1.0","type":"budget_exceeded","param":null,"code":"422"}}', 'budget_exceeded', 'organization'],
    [422, '{"error":{"message":"Budget has been exceeded! Model access group=g-1 Current cost: 2.0, Max budget: 1.0","type":"budget_exceeded","param":null,"code":"422"}}', 'budget_exceeded', 'model_group'],
    [418, '{"error":{"message":"over the limit","type":"budget_exceeded"}}', 'budget_exceeded', null],
    [402, '', 'budget_exceeded', null],
  ];
  for (const [status, body, kind, owner] of cases) assert.deepEqual([gatewayError(status, body).kind, gatewayError(status, body).budgetOwner], [kind, owner], body || `HTTP ${status}`);
});

test('a status with nothing else to read falls back to its usual meaning', () => {
  const cases: [number, GatewayErrorKind][] = [[401, 'key_rejected'], [403, 'key_rejected'], [404, 'model_unavailable'], [408, 'timeout'], [429, 'rate_limited'], [400, 'bad_request'], [422, 'bad_request'], [500, 'provider_unavailable'], [502, 'provider_unavailable'], [503, 'provider_unavailable'], [504, 'timeout'], [200, 'unknown']];
  for (const [status, kind] of cases) assert.equal(gatewayError(status, 'not json').kind, kind, `HTTP ${status}`);
  assert.equal(gatewayError(500, '{"error":{"message":"litellm.Timeout: Request timed out","type":"timeout"}}').kind, 'timeout');
  assert.equal(gatewayError(400, '{"error":{"message":"Unsupported parameter: timeout"}}').kind, 'bad_request', 'a 400 naming a timeout parameter is not a timeout');
});

test('an Ask names each captured gateway failure in words that fit it', () => {
  const expected: Record<GatewayErrorKind, string> = { budget_exceeded: 'budget_exceeded', rate_limited: 'rate_limited', provider_quota: 'provider_error', key_rejected: 'key_rejected', provider_auth: 'provider_error', model_unavailable: 'model_unavailable', context_too_long: 'too_long', content_filtered: 'filtered', timeout: 'timeout', provider_unavailable: 'provider_error', bad_request: 'provider_error', unknown: 'provider_error' };
  for (const entry of captured) {
    const code = entry.kind === 'budget_exceeded' && entry.budgetOwner !== 'key' ? 'spend_limit_reached' : expected[entry.kind];
    assert.equal(gatewayFailure(entry.status, entry.body), code, `${entry.litellm} ${entry.case}`);
  }
});

test('a failed art request says what the gateway refused', async () => {
  process.env.UNFOLD_TEST_GATEWAY_ART = 'sk-unfold-gateway-art-test';
  const spent = captured.find(entry => entry.litellm === '1.105.1' && entry.budgetOwner === 'key')!;
  const throttled = captured.find(entry => entry.litellm === '1.105.1' && entry.case === 'key rpm limit')!;
  const failing = (entry: Captured) => (async () => new Response(entry.body, { status: entry.status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
  const config = { mode: 'live', cardThemes: { ai: { baseUrl: 'http://gateway.test/v1', model: 'fake-art', keyEnv: 'UNFOLD_TEST_GATEWAY_ART', requestsPerHour: 30, maxTokens: 100, timeoutMs: 1000 } } } as any;
  const user = { id: 'admin', name: 'Admin', role: 'admin' } as any;
  await assert.rejects(new CardArtGenerator(config, failing(spent)).generate(user, { prompt: 'a koi pond' }), (error: Error) => /HTTP 422\. Its gateway budget is used up\./.test(error.message));
  await assert.rejects(new CardArtGenerator(config, failing(throttled)).generate(user, { prompt: 'a koi pond' }), (error: Error) => /HTTP 429\. Its rate limit is reached/.test(error.message));
});
