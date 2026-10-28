import test from 'node:test';
import assert from 'node:assert/strict';
import { application, login, request } from './api-support.ts';
import { hashPassword } from '../src/auth.ts';
import { maxNowSnoozes, parseSnooze, SnoozeError } from '../src/now-snoozes.ts';

test('a person snoozes, lists and unsnoozes rows on their own Now, and another person neither sees nor changes them', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const admin = await login(app.url);
  app.app.store.addUser({ id: 'viewer-iris', name: 'iris@example.test', role: 'viewer', passwordHash: await hashPassword('viewer-password-1414') });
  const viewer = await login(app.url, 'iris@example.test', 'viewer-password-1414');

  assert.equal((await request(app.url, '/api/now/snoozes')).status, 401, 'snoozes need a signed-in person');
  const empty = await request(app.url, '/api/now/snoozes', { cookie: viewer.cookie });
  assert.deepEqual(empty.body, { snoozes: [], limit: maxNowSnoozes, demo: false });

  const set = await request(app.url, '/api/now/snoozes', { method: 'PUT', cookie: viewer.cookie, body: { key: 'work:7', fingerprint: 'needs_human|2026-10-18T09:00:00Z', until: '1d' } });
  assert.equal(set.status, 200, set.text);
  assert.equal(set.body.snoozes.length, 1);
  assert.equal(set.body.snoozes[0].kind, 'snooze');
  const until = Date.parse(set.body.snoozes[0].untilAt) - Date.parse(set.body.snoozes[0].createdAt);
  assert.equal(until, 24 * 60 * 60 * 1000, 'a viewer may snooze their own view for a day');
  const dismissed = await request(app.url, '/api/now/snoozes', { method: 'PUT', cookie: viewer.cookie, body: { key: 'task:vikunja:25', fingerprint: 'label_missing|2026-10-18T07:00:00Z', kind: 'dismiss' } });
  assert.equal(dismissed.status, 200, dismissed.text);
  assert.deepEqual(dismissed.body.snoozes.map((item: any) => [item.key, item.kind, item.untilAt]).at(-1), ['task:vikunja:25', 'dismiss', null]);

  assert.deepEqual((await request(app.url, '/api/now/snoozes', { cookie: admin.cookie })).body.snoozes, [], 'another person sees none of them');
  const theirs = await request(app.url, '/api/now/snoozes?key=work%3A7', { method: 'DELETE', cookie: admin.cookie });
  assert.equal(theirs.status, 200);
  assert.equal((await request(app.url, '/api/now/snoozes', { cookie: viewer.cookie })).body.snoozes.length, 2, 'another person cannot unsnooze them');
  assert.equal((await request(app.url, '/api/now/snoozes', { method: 'PUT', cookie: viewer.cookie, body: { key: 'work:8', fingerprint: 'x', until: '1w' }, csrf: false })).status, 403, 'a snooze is a guarded mutation');

  const cleared = await request(app.url, '/api/now/snoozes?key=work%3A7', { method: 'DELETE', cookie: viewer.cookie });
  assert.deepEqual(cleared.body.snoozes.map((item: any) => item.key), ['task:vikunja:25']);
  const recorded = app.app.store.actionRecords({ userId: 'viewer-iris', limit: 10 });
  assert.ok(recorded.some((entry: any) => entry.action === 'PUT /api/now/snoozes'), 'a snooze shows in the person’s action log');

  await app.restart();
  const again = await login(app.url, 'iris@example.test', 'viewer-password-1414');
  assert.equal((await request(app.url, '/api/now/snoozes', { cookie: again.cookie })).body.snoozes.length, 1, 'a snooze survives a restart');
});

test('a snooze request is validated, and a person keeps at most the newest snoozes and none that ended', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const admin = await login(app.url);
  const put = (body: unknown) => request(app.url, '/api/now/snoozes', { method: 'PUT', cookie: admin.cookie, body });
  for (const [body, code] of [
    [{ key: 'session:1', fingerprint: 'x', until: '1d' }, 'snooze_key'],
    [{ key: 'work:7', fingerprint: '', until: '1d' }, 'snooze_fingerprint'],
    [{ key: 'work:7', fingerprint: 'x'.repeat(201), until: '1d' }, 'snooze_fingerprint'],
    [{ key: 'work:7', fingerprint: 'x', until: 'forever' }, 'snooze_until'],
    [{ key: 'work:7', fingerprint: 'x', until: '1d', kind: 'mute' }, 'snooze_kind'],
    [{ key: 'work:7', fingerprint: 'x', kind: 'dismiss' }, 'snooze_dismiss'],
    [{ key: 'task:vikunja:25', fingerprint: 'x', until: '1w', kind: 'dismiss' }, 'snooze_dismiss'],
  ] as const) {
    const answer = await put(body);
    assert.equal(answer.status, 400, JSON.stringify(body));
    assert.equal(answer.body.error.code, code);
  }
  assert.equal((await request(app.url, '/api/now/snoozes?key=nope', { method: 'DELETE', cookie: admin.cookie })).body.error.code, 'snooze_key');
  assert.equal((await request(app.url, '/api/now/snoozes', { method: 'POST', cookie: admin.cookie, body: {} })).status, 405);

  const store = app.app.store;
  const base = Date.parse('2026-10-01T00:00:00Z');
  for (let index = 0; index < maxNowSnoozes + 5; index++) store.setNowSnooze('someone', { key: `work:${index}`, fingerprint: 'f', kind: 'snooze', untilAt: null, createdAt: new Date(base + index * 1000).toISOString() }, maxNowSnoozes);
  const kept = store.nowSnoozes('someone', '2026-10-02T00:00:00Z', '2026-01-01T00:00:00Z');
  assert.equal(kept.length, maxNowSnoozes, 'setting one more drops the oldest');
  assert.equal(kept[0].key, 'work:5');
  store.setNowSnooze('someone', { key: 'work:ended', fingerprint: 'f', kind: 'snooze', untilAt: '2026-10-01T12:00:00Z', createdAt: '2026-10-01T23:00:00Z' }, maxNowSnoozes);
  assert.equal(store.nowSnoozes('someone', '2026-10-02T00:00:00Z', '2026-01-01T00:00:00Z').some(item => item.key === 'work:ended'), false, 'an ended snooze is pruned');
  const retained = store.nowSnoozes('someone', '2026-10-02T00:00:00Z', '2026-10-01T00:01:00.000Z');
  assert.equal(retained[0].key, 'work:60', 'a snooze kept past retention is pruned');
  assert.equal(retained.length, maxNowSnoozes + 5 - 60);
  assert.deepEqual(store.nowSnoozes('other', '2026-10-02T00:00:00Z', '2026-01-01T00:00:00Z'), [], 'the cap and the pruning are per person');
});

test('a demo workbench keeps snoozes in Unfold and says it is the demo', async t => {
  const app = await application('demo');
  t.after(() => app.close());
  const answer = await request(app.url, '/api/now/snoozes', { method: 'PUT', body: { key: 'task:demo:DEMO-30', fingerprint: 'label_missing|x', kind: 'dismiss' } });
  assert.equal(answer.status, 200, answer.text);
  assert.equal(answer.body.demo, true);
});

test('parseSnooze computes a week from the time it is given', () => {
  const now = new Date('2026-10-18T12:00:00Z');
  assert.equal(parseSnooze({ key: 'work:7', fingerprint: 'f', until: '1w' }, now).untilAt, '2026-10-25T12:00:00.000Z');
  assert.equal(parseSnooze({ key: 'work:7', fingerprint: 'f', until: 'change' }, now).untilAt, null);
  assert.throws(() => parseSnooze({ key: 7, fingerprint: 'f', until: '1d' }, now), SnoozeError);
});
