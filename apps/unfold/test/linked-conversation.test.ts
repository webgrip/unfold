import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LinkedConversation, conversationLimits, parseEntries } from '../src/linked-conversation.ts';
import { LinkedSessionStore, type LinkedSession } from '../src/linked-sessions.ts';
import { isAction } from '../src/action-records.ts';
import type { User } from '../src/types.ts';
import { application, login, request } from './api-support.ts';

const owner: User = { id: 'u-ryan', name: 'ryan', role: 'operator' };
const admin: User = { id: 'u-admin', name: 'admin', role: 'admin' };
const sessionId = '5dd12314-92bd-4fe3-b9ee-fb49cbf6d126';

function linkedSession(status: LinkedSession['status'] = 'working'): LinkedSession {
  return { id: sessionId, harness: 'claude-code', harnessVersion: '', ownerId: owner.id, ownerName: owner.name, title: '', repository: '', branch: '', model: '', remoteUrl: '', status, waitingFor: '', startedAt: '2026-10-25T10:00:00.000Z', lastSeenAt: '2026-10-25T10:00:00.000Z', endedAt: status === 'ended' ? '2026-10-25T11:00:00.000Z' : null, workItems: [], dismissed: [], resolvedBranch: '', pullRequests: [], commits: [] };
}

function setup(status?: LinkedSession['status'], options: { holdMs?: number; answerMs?: number } = {}) {
  const sessions = new LinkedSessionStore(new DatabaseSync(':memory:'));
  sessions.save(linkedSession(status));
  const clock = { at: Date.parse('2026-10-25T10:00:00.000Z') };
  return { conversation: new LinkedConversation(sessions, { now: () => clock.at, holdMs: options.holdMs ?? 50, answerMs: options.answerMs ?? 200 }), clock };
}

const entry = (text: string, kind = 'prompt') => ({ id: `e-${text}`, kind, text, at: '2026-10-25T10:01:00.000Z' });

test('a read reaches the plugin that polls, and the plugin hands the entries back to that reader', async () => {
  const { conversation } = setup(undefined, { holdMs: 5_000 });
  const poll = conversation.wants(owner, sessionId);
  const read = conversation.read(owner, sessionId, null);
  const { wants } = await poll;
  assert.equal(wants.length, 1);
  assert.equal(wants[0].after, null);
  assert.deepEqual(conversation.answer(owner, sessionId, wants[0].id, { entries: [entry('fix the runner'), entry('On it.', 'reply')], cursor: 4096, truncated: true }), { delivered: true });
  assert.deepEqual(await read, { reachable: true, entries: [entry('fix the runner'), entry('On it.', 'reply')], cursor: 4096, truncated: true, restarted: false });
  assert.deepEqual(conversation.answer(owner, sessionId, wants[0].id, { entries: [], cursor: 1 }), { delivered: false }, 'an answered read takes no second answer');
});

test('a newer poll releases the older one empty, and a read reaches the newer poll with its cursor', async () => {
  const { conversation } = setup(undefined, { holdMs: 5_000 });
  const older = conversation.wants(owner, sessionId);
  const newer = conversation.wants(owner, sessionId);
  assert.deepEqual(await older, { wants: [] });
  const read = conversation.read(owner, sessionId, 4096);
  const { wants } = await newer;
  assert.equal(wants[0].after, 4096);
  conversation.answer(owner, sessionId, wants[0].id, { entries: [entry('later', 'reply')], cursor: 9000, restarted: true });
  const answered = await read;
  assert.ok(answered.reachable && answered.cursor === 9000 && answered.restarted);
});

test('without a recent poll, for an ended session, or without an answer in time, the read says why instead of hanging', async () => {
  const quiet = setup();
  assert.deepEqual(await quiet.conversation.read(owner, sessionId, null), { reachable: false, reason: 'not_relaying' });
  const ended = setup('ended');
  assert.deepEqual(await ended.conversation.read(owner, sessionId, null), { reachable: false, reason: 'ended' });
  const silent = setup(undefined, { holdMs: 5, answerMs: 30 });
  await silent.conversation.wants(owner, sessionId);
  const started = Date.now();
  assert.deepEqual(await silent.conversation.read(owner, sessionId, null), { reachable: false, reason: 'no_answer' });
  assert.ok(Date.now() - started < 1_000);
  silent.clock.at += conversationLimits.relayingMs + 1;
  assert.deepEqual(await silent.conversation.read(owner, sessionId, null), { reachable: false, reason: 'not_relaying' }, 'a plugin that stopped polling no longer counts as relaying');
  const missing = setup(undefined, { holdMs: 5_000 });
  const poll = missing.conversation.wants(owner, sessionId);
  const read = missing.conversation.read(owner, sessionId, null);
  missing.conversation.answer(owner, sessionId, (await poll).wants[0].id, { missing: true });
  assert.deepEqual(await read, { reachable: false, reason: 'no_transcript' });
});

test('only the session’s owner reads or relays its conversation; an administrator gets not found', async () => {
  const { conversation } = setup();
  await assert.rejects(conversation.read(admin, sessionId, null), { status: 404, code: 'not_found' });
  await assert.rejects(conversation.wants(admin, sessionId), { status: 404, code: 'not_found' });
  assert.throws(() => conversation.answer(admin, sessionId, '00000000-0000-4000-8000-000000000000', {}), { status: 404 });
});

test('entries a plugin hands back are bounded: known kinds only, clipped fields, at most the newest 200', () => {
  const many = Array.from({ length: 250 }, (_, index) => entry(`m${index}`));
  const parsed = parseEntries([...many, { kind: 'thinking', text: 'secret plan' }, { kind: 'reply', text: '   ' }, null, 'x']);
  assert.equal(parsed.length, conversationLimits.entries - 4);
  assert.equal(parsed.at(-1)?.text, 'm249');
  assert.equal(parseEntries([{ id: 'x'.repeat(500), kind: 'reply', text: `a\u0007b${'y'.repeat(10_000)}`, at: '2026' }])[0].text.length, conversationLimits.text);
  assert.equal(parseEntries([{ id: 'x'.repeat(500), kind: 'reply', text: 'a\u0007b', at: '2026' }])[0].text, 'a b');
  assert.equal(parseEntries('nope').length, 0);
});

test('the relay routes are never recorded as actions, so no conversation text reaches the action log', () => {
  assert.equal(isAction('POST', `/api/linked-sessions/${sessionId}/conversation/wants`), false);
  assert.equal(isAction('POST', `/api/linked-sessions/${sessionId}/conversation/answers/00000000-0000-4000-8000-000000000000`), false);
});

async function filesUnder(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) found.push(...await filesUnder(path)); else found.push(path);
  }
  return found;
}

test('through the API the owner reads what their plugin relays, nobody else does, and nothing of it is stored', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const admin = await login(app.url);
  const password = randomBytes(24).toString('hex');
  const { hashPassword } = await import('../src/auth.ts');
  app.app.store.addUser({ id: 'peer', name: 'peer', role: 'operator', passwordHash: await hashPassword(password) });
  const peer = await login(app.url, 'peer', password);
  const id = 'session-under-test-conversation';
  const marker = `zebra-${randomBytes(6).toString('hex')}-quartz`;
  assert.equal((await request(app.url, '/api/linked-sessions/events', { method: 'POST', cookie: peer.cookie, body: { harness: 'claude-code', sessionId: id, event: 'start' } })).status, 200);
  assert.deepEqual((await request(app.url, `/api/linked-sessions/${id}/conversation`, { cookie: peer.cookie })).body, { reachable: false, reason: 'not_relaying' });
  const plugin = (async () => {
    const polled = await request(app.url, `/api/linked-sessions/${id}/conversation/wants`, { method: 'POST', cookie: peer.cookie });
    assert.equal(polled.status, 200, polled.text);
    const [want] = polled.body.wants;
    const answered = await request(app.url, `/api/linked-sessions/${id}/conversation/answers/${want.id}`, { method: 'POST', cookie: peer.cookie, body: { entries: [{ id: 'a', kind: 'prompt', text: `please ${marker}`, at: '2026-10-25T10:00:00.000Z' }], cursor: 120 } });
    assert.deepEqual(answered.body, { delivered: true });
  })();
  await new Promise(done => setTimeout(done, 50));
  const read = await request(app.url, `/api/linked-sessions/${id}/conversation`, { cookie: peer.cookie });
  await plugin;
  assert.equal(read.status, 200, read.text);
  assert.equal(read.response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(read.body.entries.map((item: { text: string }) => item.text), [`please ${marker}`]);
  assert.equal((await request(app.url, `/api/linked-sessions/${id}/conversation`, { cookie: admin.cookie })).status, 404, 'an administrator does not read another person’s conversation');
  assert.equal((await request(app.url, `/api/linked-sessions/${id}/conversation/wants`, { method: 'POST', cookie: admin.cookie })).status, 404);
  assert.equal((await request(app.url, `/api/linked-sessions/${id}/conversation`, { method: 'POST', cookie: peer.cookie })).status, 405);
  const actions = await request(app.url, '/api/actions', { cookie: peer.cookie });
  assert.equal(actions.body.actions.some((record: { action: string }) => record.action.includes('/conversation')), false);
  app.app.store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  for (const file of await filesUnder(app.config.dataDir)) assert.equal((await readFile(file)).includes(marker), false, `${file} holds conversation text`);
});
