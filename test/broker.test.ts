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
  return { broker: new LiteLLMBroker(config), config, keys, requests, fail: () => { mode = 'error'; } };
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
  await restarted.extend(credential.reference, 8);
  assert.equal(key.max_budget, 8);
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

test('provider errors do not expose response credentials', async t => {
  const { broker, fail } = await gateway(t);
  fail();
  await assert.rejects(broker.mint(session), error => {
    assert.equal(String(error).includes('administrative-only'), false);
    assert(error instanceof RuntimeFailure);
    assert.equal(error.category, 'gateway_rejected');
    assert.equal(error.httpStatus, 500);
    return true;
  });
});
