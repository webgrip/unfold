import assert from 'node:assert/strict';
import { test } from 'node:test';
import { application, request } from './api-support.ts';

test('the demo tripwire route shows labelled demo hits on a running Run, makes no decider call and records no verdict', async t => {
  const api = await application('demo');
  t.after(() => api.close());
  const read = await request(api.url, '/api/ploeg/work-items/102/tripwire');
  assert.equal(read.status, 200, read.text);
  assert.equal(read.body.status, 'off');
  assert.equal(read.body.demo, true);
  assert.equal(read.body.decider, null);
  assert.deepEqual(read.body.hits.map((hit: { runId: string; check: string; score: number; demo: boolean }) => [hit.runId, hit.check, hit.score, hit.demo]), [['51', 'reads_credentials', 2, true]]);
  const hit = read.body.hits[0].id;
  const marked = await request(api.url, `/api/ploeg/work-items/102/tripwire/${hit}/verdict`, { method: 'POST', body: { verdict: 'wrong' } });
  assert.equal(marked.status, 200, marked.text);
  assert.deepEqual(marked.body, { recorded: false, verdict: 'wrong', demo: true });
  const finished = await request(api.url, '/api/ploeg/work-items/105/tripwire');
  assert.equal(finished.status, 200, finished.text);
  assert.deepEqual(finished.body.hits, []);
});

test('the tripwire routes refuse other methods, unknown hits, bad verdicts, a missing CSRF token and Work Items outside the caller\'s Teams', async t => {
  const api = await application('demo');
  t.after(() => api.close());
  const hit = (await request(api.url, '/api/ploeg/work-items/102/tripwire')).body.hits[0].id;
  assert.equal((await request(api.url, '/api/ploeg/work-items/102/tripwire', { method: 'POST', body: {} })).status, 405);
  assert.equal((await request(api.url, `/api/ploeg/work-items/102/tripwire/${hit}/verdict`)).status, 405);
  assert.equal((await request(api.url, '/api/ploeg/work-items/102/tripwire/nope/verdict', { method: 'POST', body: { verdict: 'right' } })).status, 404);
  assert.equal((await request(api.url, `/api/ploeg/work-items/102/tripwire/${hit}/verdict`, { method: 'POST', body: { verdict: 'maybe' } })).status, 400);
  assert.equal((await request(api.url, `/api/ploeg/work-items/102/tripwire/${hit}/verdict`, { method: 'POST', body: { verdict: 'right' }, csrf: false })).status, 403);
  assert.equal((await request(api.url, '/api/ploeg/work-items/999999/tripwire')).status, 404);
});
