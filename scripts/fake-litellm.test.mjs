import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { startFakeLiteLLM } from './fake-litellm.mjs';

async function call(gateway, path, { method = 'GET', body, key = gateway.masterKey } = {}) {
  const response = await fetch(gateway.url + path, { method, headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
}

test('mints, lists, meters, blocks and deletes keys the way the broker expects', async t => {
  const gateway = await startFakeLiteLLM();
  t.after(() => gateway.close());
  const minted = await call(gateway, '/key/generate', { method: 'POST', body: { key_type: 'llm_api', key_alias: 'ploeg-0123456789ab', max_budget: 1, models: ['qualification-coding'], duration: '600s' } });
  assert.equal(minted.status, 200);
  assert.match(minted.body.key, /^sk-fake-/);
  const token = createHash('sha256').update(minted.body.key).digest('hex');
  const listed = await call(gateway, '/key/list?return_full_object=true&size=100&page=1');
  assert.deepEqual(listed.body.keys.map(key => [key.token, key.key_alias, key.blocked]), [[token, 'ploeg-0123456789ab', false]]);
  assert.equal(listed.body.total_pages, 1);
  assert.equal((await call(gateway, `/key/info?key=${token}`)).body.info.spend, 0);
  assert.equal((await call(gateway, '/key/block', { method: 'POST', body: { key: minted.body.key } })).body.blocked, true);
  assert.equal((await call(gateway, `/key/info?key=${token}`)).body.info.blocked, true);
  assert.equal((await call(gateway, '/key/block', { method: 'POST', body: { key: token } })).body.blocked, true);
  assert.equal((await call(gateway, '/key/delete', { method: 'POST', body: { keys: [token] } })).status, 200);
  assert.equal((await call(gateway, '/key/delete', { method: 'POST', body: { keys: [token] } })).status, 404);
  assert.equal((await call(gateway, `/key/info?key=${token}`)).status, 404);
  assert.deepEqual({ ...gateway.stats }, { generated: 1, blocked: 2, deleted: 1, info: 3, list: 1, modelCalls: 0, unauthorized: 0, unexpected: 0 });
});

test('refuses inference and admin calls without the master key, and never reports spend', async t => {
  const gateway = await startFakeLiteLLM();
  t.after(() => gateway.close());
  assert.equal((await call(gateway, '/key/generate', { method: 'POST', key: 'sk-not-master', body: { key_alias: 'x', max_budget: 1 } })).status, 401);
  assert.equal((await call(gateway, '/key/generate', { method: 'POST', body: { key_alias: 'uncapped' } })).status, 400);
  const minted = await call(gateway, '/key/generate', { method: 'POST', body: { key_alias: 'ploeg-feedfacecafe', max_budget: 2 } });
  for (const path of ['/v1/chat/completions', '/chat/completions', '/v1/messages', '/v1/models']) {
    const refused = await call(gateway, path, { method: path.endsWith('models') ? 'GET' : 'POST', key: minted.body.key, body: path.endsWith('models') ? undefined : { model: 'qualification-coding', messages: [] } });
    assert.equal(refused.status, 403, path);
  }
  assert.equal(gateway.stats.modelCalls, 4);
  assert.equal(gateway.stats.unauthorized, 1);
  assert.ok([...gateway.keys.values()].every(key => key.spend === 0));
});
