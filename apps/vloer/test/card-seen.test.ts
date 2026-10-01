import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardSeenLimit } from '../src/store.ts';
import { application, login, request } from './api-support.ts';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

test('a person’s seen mark on a card needs a sign-in, the request header for writes, and a card in their Teams', async t => {
  const api = await application('demo');
  t.after(() => api.close());
  const fresh = await request(api.url, '/api/cards/114/seen');
  assert.equal(fresh.status, 200, fresh.text);
  assert.deepEqual([fresh.body.workItemId, fresh.body.seenAt, fresh.body.snapshot], ['114', null, null], 'no mark before the first look');
  assert.equal((await request(api.url, '/api/cards/114/seen', { method: 'POST', csrf: false })).status, 403, 'a write without the request header is refused');
  assert.equal((await request(api.url, '/api/cards/999/seen')).status, 404, 'a card outside the person’s Teams has no mark');
  assert.equal((await request(api.url, '/api/cards/999/seen', { method: 'POST' })).status, 404);
  assert.equal((await request(api.url, '/api/cards/abc/seen')).status, 400);
  assert.equal((await request(api.url, '/api/cards/114/seen', { method: 'DELETE' })).status, 405);
  const live = await application('live');
  t.after(() => live.close());
  assert.equal((await request(live.url, '/api/cards/114/seen')).status, 401, 'signed out, nothing');
  const { cookie } = await login(live.url);
  assert.notEqual((await request(live.url, '/api/cards/114/seen', { cookie })).status, 200, 'without Ploeg there is no card to mark');
});

test('a seen mark only moves forward, never past now, and keeps a sanitised snapshot', async t => {
  const api = await application('demo');
  t.after(() => api.close());
  const first = await request(api.url, '/api/cards/114/seen', { method: 'POST', body: { until: daysAgo(3), snapshot: { grade: 8.5, setComplete: true, extra: 'dropped' } } });
  assert.equal(first.status, 200, first.text);
  assert(Date.parse(first.body.seenAt) < Date.now() - 2 * 86_400_000);
  assert.deepEqual(first.body.snapshot, { grade: 8.5, setComplete: true });
  const back = await request(api.url, '/api/cards/114/seen', { method: 'POST', body: { until: daysAgo(10), snapshot: { grade: 7.3, setComplete: 'yes' } } });
  assert.equal(back.body.seenAt, first.body.seenAt, 'a mark never moves back');
  assert.deepEqual(back.body.snapshot, { grade: null, setComplete: false }, 'only a half-step grade and a true flag survive');
  const ahead = await request(api.url, '/api/cards/114/seen', { method: 'POST', body: { until: new Date(Date.now() + 86_400_000).toISOString(), snapshot: {} } });
  assert(Date.parse(ahead.body.seenAt) <= Date.now(), 'never past now');
  const now = await request(api.url, '/api/cards/117/seen', { method: 'POST', body: { snapshot: null } });
  assert(Math.abs(Date.parse(now.body.seenAt) - Date.now()) < 5000, 'without until, the mark is now');
});

test('the binder moves the marks of the cards whose news it showed, and a person keeps at most the newest marks', async t => {
  const api = await application('demo');
  t.after(() => api.close());
  await request(api.url, '/api/cards/114/seen', { method: 'POST', body: { until: daysAgo(5), snapshot: {} } });
  const until = daysAgo(1);
  assert.equal((await request(api.url, '/api/binder/seen', { method: 'POST', body: { until, cards: ['114', '117', 'bad id', 42] } })).status, 200);
  assert.equal(Date.parse((await request(api.url, '/api/cards/114/seen')).body.seenAt), Date.parse(until), 'the binder moved the card’s mark to what it showed');
  assert.equal((await request(api.url, '/api/cards/117/seen')).body.seenAt, null, 'a card the person never looked at gets no mark from the binder');
  const store = api.app.store;
  for (let index = 0; index <= cardSeenLimit; index++) store.markCardSeen('someone', String(1000 + index), new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(), { grade: null, setComplete: false });
  assert.equal(store.cardSeen('someone', '1000'), undefined, 'the least recently seen mark is dropped');
  assert.ok(store.cardSeen('someone', String(1000 + cardSeenLimit)));
  assert.equal(store.cardSeen('admin', '1000'), undefined, 'marks are per person');
});
