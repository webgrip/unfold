import test from 'node:test';
import assert from 'node:assert/strict';
import { application, createSession, replay, request } from './api-support.ts';
import { eventReplayBatch } from '../src/http.ts';
import { testTimeout } from './timeframes.ts';

test('health probes stay cheap and a corrupt session row fails neither of them', { timeout: testTimeout(15_000) }, async t => {
  const server = await application('demo');
  t.after(() => server.close());
  const store = server.app.store;
  const at = new Date().toISOString();
  store.db.prepare('INSERT INTO sessions(id,owner_id,updated_at,body) VALUES(?,?,?,?)').run('unreadable-body', 'nobody', at, '{not json');
  store.db.prepare('INSERT INTO sessions(id,owner_id,updated_at,body) VALUES(?,?,?,?)').run('undecryptable-workspace', 'nobody', at, JSON.stringify({ id: 'undecryptable-workspace', ownerId: 'nobody' }));
  store.db.prepare('INSERT INTO internal_state(id,ciphertext) VALUES(?,?)').run('workspace:undecryptable-workspace', Buffer.alloc(40, 7).toString('base64'));
  assert.throws(() => store.listSessions(), 'the seeded rows must really be unreadable');

  const reads: string[] = [];
  const prepare = store.db.prepare.bind(store.db);
  store.db.prepare = ((sql: string) => { reads.push(sql); return prepare(sql); }) as typeof store.db.prepare;
  t.after(() => { store.db.prepare = prepare; });

  for (const path of ['/healthz', '/readyz']) {
    reads.length = 0;
    const probe = await request(server.url, path);
    assert.equal(probe.status, 200, `${path}: ${probe.text}`);
    assert.deepEqual(Object.keys(probe.body).sort(), ['status', 'version']);
    assert.equal(probe.body.status, 'ok');
    assert.deepEqual(reads, path === '/readyz' ? ['SELECT 1'] : [], `${path} storage reads`);
    const wrongMethod = await request(server.url, path, { method: 'POST' });
    assert.equal(wrongMethod.status, 405, wrongMethod.text);
    assert.equal(wrongMethod.body.error.code, 'method');
  }
});

test('a live event client from an old cursor catches up completely in bounded storage reads', { timeout: testTimeout(30_000) }, async t => {
  const server = await application('demo');
  t.after(() => server.close());
  const store = server.app.store;
  const created = await createSession(server.url);
  const seeded = eventReplayBatch * 3 + 37;
  store.transaction(() => { for (let index = 0; index < seeded; index++) store.appendEvent(created.id, 'test.seeded', 'test', { index }); });
  const history = store.events(created.id);
  const cursor = history[0].id;
  const expected = history.filter(event => event.id > cursor);
  assert(expected.length > eventReplayBatch * 3, 'the catch-up must span several replay batches');

  const pages: { after: number; limit: number; returned: number }[] = [];
  const eventPage = store.eventPage.bind(store);
  store.eventPage = (sessionId, after, limit) => {
    const page = eventPage(sessionId, after, limit);
    if (sessionId === created.id) pages.push({ after, limit, returned: page.length });
    return page;
  };
  t.after(() => { store.eventPage = eventPage; });

  assert.deepEqual(await replay(server.url, created.id, cursor, expected.length), expected);
  assert(pages.length >= Math.ceil(expected.length / eventReplayBatch), `expected batched reads, saw ${pages.length}`);
  for (const page of pages) {
    assert.equal(page.limit, eventReplayBatch);
    assert(page.returned <= eventReplayBatch);
  }
  assert.equal(pages[0].after, cursor);
  const catchUp = pages.slice(0, Math.ceil(expected.length / eventReplayBatch));
  assert.deepEqual(catchUp.map(page => page.returned).slice(0, -1), Array(catchUp.length - 1).fill(eventReplayBatch));
  assert.equal(new Set(pages.filter(page => page.returned > 0).map(page => page.after)).size, pages.filter(page => page.returned > 0).length, 'each batch must continue from the previous cursor');

  const remainder = await request(server.url, `/api/sessions/${created.id}/history?after=${cursor}`);
  assert.deepEqual(remainder.body, expected, 'the history endpoint still returns the whole remainder');
});
