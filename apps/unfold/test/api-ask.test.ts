import assert from 'node:assert/strict';
import { test } from 'node:test';
import { application, request } from './api-support.ts';

test('the demo answers an Ask about a Work Item without a model call or spend, and lists it', async t => {
  const api = await application('demo');
  t.after(() => api.close());
  const asked = await request(api.url, '/api/ploeg/work-items/119/asks', { method: 'POST', body: { question: 'Where does it stand?' } });
  assert.equal(asked.status, 201, asked.text);
  assert.equal(asked.body.demo, true);
  assert.equal(asked.body.status, 'answered');
  assert.equal(asked.body.costStatus, 'demo');
  assert.equal(asked.body.costUsd, null);
  assert.match(asked.body.answer, /^It is /);
  const listed = await request(api.url, '/api/ploeg/work-items/119/asks');
  assert.equal(listed.status, 200, listed.text);
  assert.deepEqual(listed.body.asks.map((ask: { id: string }) => ask.id), [asked.body.id]);
});

test('an Ask needs a question, a known Work Item and a same-origin request', async t => {
  const api = await application('demo');
  t.after(() => api.close());
  assert.equal((await request(api.url, '/api/ploeg/work-items/119/asks', { method: 'POST', body: { question: ' ' } })).status, 400);
  assert.equal((await request(api.url, '/api/ploeg/work-items/999999/asks', { method: 'POST', body: { question: 'Where?' } })).status, 404);
  assert.equal((await request(api.url, '/api/ploeg/work-items/119/asks', { method: 'POST', body: { question: 'Where?' }, csrf: false })).status, 403);
  assert.equal((await request(api.url, '/api/ploeg/work-items/119/asks', { method: 'DELETE' })).status, 405);
});
