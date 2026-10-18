import assert from 'node:assert/strict';
import { test } from 'node:test';
import { application, request } from './api-support.ts';

test('the demo computes a running Run\'s health from its illustrative limits, labelled demo, with no judge', async t => {
  const api = await application('demo');
  t.after(() => api.close());
  const read = await request(api.url, '/api/ploeg/work-items/102/runs/51/health');
  assert.equal(read.status, 200, read.text);
  assert.equal(read.body.demo, true);
  assert.equal(read.body.judgeState, 'off');
  assert.equal(read.body.health, 'on_track');
  assert.match(read.body.reason, /^\d+ of 90 min$/);
  assert.deepEqual(read.body.signals.filter((signal: { reason: string }) => signal.reason === 'The demo records no transcripts').map((signal: { key: string }) => signal.key), ['tripwire', 'quiet', 'pace', 'repeat']);
  const finished = await request(api.url, '/api/ploeg/work-items/105/runs/50/health');
  assert.equal(finished.status, 200, finished.text);
  assert.equal(finished.body.health, null);
  assert.deepEqual(finished.body.history, []);
});

test('Run health refuses another Work Item\'s Run, other methods and an unknown judgement', async t => {
  const api = await application('demo');
  t.after(() => api.close());
  assert.equal((await request(api.url, '/api/ploeg/work-items/102/runs/50/health')).status, 404);
  assert.equal((await request(api.url, '/api/ploeg/work-items/999999/runs/51/health')).status, 404);
  assert.equal((await request(api.url, '/api/ploeg/work-items/102/runs/51/health', { method: 'POST', body: {} })).status, 405);
  assert.equal((await request(api.url, '/api/ploeg/work-items/102/runs/51/health/judgements/nope/wrong', { method: 'POST', body: {} })).status, 404);
  assert.equal((await request(api.url, '/api/ploeg/work-items/102/runs/51/health/judgements/nope/wrong', { method: 'POST', body: {}, csrf: false })).status, 403);
});
