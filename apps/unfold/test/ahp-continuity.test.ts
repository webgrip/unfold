import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, vscodeAgentsWindow, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';
import { IdleSessions, ServerSequence, idleSessionMs } from '../src/ahp/continuity.ts';
import type { Event, Session } from '../src/types.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/session-059675b9.json', import.meta.url), 'utf8'));
const objective = 'Reproduce the rounding regression and fix it with the tests intact.';
const initialize = (clientId: string, extra: Json = {}) => ({ channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId, clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'], ...extra });
const lastSeq = (client: { inbox: Json[] }) => Math.max(0, ...client.inbox.filter(message => message.method === 'action').map(message => message.params.serverSeq));

async function attach(server: Awaited<ReturnType<typeof application>>, t: { after: (fn: () => unknown) => void }, token: string) {
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${token}`);
  t.after(() => client.close());
  await client.open;
  return client;
}

test('the sequence reserves numbers in the store and resumes after the reservation, never below a number it gave out', { timeout: testTimeout(30_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const first = new ServerSequence(server.app.store, 3);
  const given: number[] = [];
  for (let index = 0; index < 5; index++) { first.advanceTo(first.current + 1); given.push(first.current); }
  first.advanceTo(2);
  assert.equal(first.current, 5, 'a lower value never moves it back');
  const second = new ServerSequence(server.app.store, 3);
  assert.ok(second.current >= Math.max(...given), 'a new process starts at or after every number the old one gave out');
  second.advanceTo(second.current + 1);
  assert.ok(new ServerSequence(server.app.store, 3).current >= second.current);
});

test('idle sessions are evicted only after the idle period in a row, and a session that stops being evictable starts over', () => {
  const idle = new IdleSessions(100);
  let evictable = true;
  assert.deepEqual(idle.sweep(['a'], () => evictable, 0), []);
  assert.deepEqual(idle.sweep(['a'], () => evictable, 99), []);
  evictable = false;
  assert.deepEqual(idle.sweep(['a'], () => evictable, 150), []);
  evictable = true;
  assert.deepEqual(idle.sweep(['a'], () => evictable, 200), []);
  assert.deepEqual(idle.sweep(['a'], () => evictable, 299), []);
  assert.deepEqual(idle.sweep(['a', 'a'], () => evictable, 300), ['a']);
});

test('across a restart serverSeq keeps rising, a client reconnects with its pre-restart lastSeenServerSeq and gets snapshots, and its active-client place is kept', { timeout: testTimeout(90_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const token = (await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'continuity' } })).body.token;
  const clientId = randomUUID();
  const activeClient = { clientId, tools: [] };
  const first = await attach(server, t, token);
  await first.rpc('initialize', initialize(clientId));
  const session = `ahp-session:/${randomUUID()}`;
  const chat = defaultChatOf(session);
  await first.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Continuity' }, activeClient });
  await first.rpc('subscribe', { channel: chat });
  first.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'continuity-turn', startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } } });
  await first.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === 'continuity-turn');
  const lastSeen = Math.max(lastSeq(first), server.app.agentHost.serverSeq);
  first.close();

  await server.restart();
  assert.ok(server.app.agentHost.serverSeq >= lastSeen, 'the sequence never moves backwards across a restart');
  const resumed = await attach(server, t, token);
  const result = await resumed.rpc('reconnect', { channel: 'ahp-root://', clientId, lastSeenServerSeq: lastSeen, subscriptions: ['ahp-root://', session, chat], _meta: { 'vscode.ahpSessionUris': true } });
  assert.equal(result.type, 'snapshot', 'a reconnect after a restart never replays');
  assert.deepEqual(result.snapshots.map((snapshot: Json) => snapshot.resource), ['ahp-root://', session, chat]);
  for (const snapshot of result.snapshots) assert.ok(snapshot.fromSeq >= lastSeen, `${snapshot.resource} starts at or after what the client last saw`);
  assert.deepEqual(result.snapshots[1].state.activeClients, [activeClient], 'the active client survives the restart');
  assert.equal(result.snapshots[2].state.turns.at(-1).id, 'continuity-turn');

  resumed.notify('dispatchAction', { channel: session, clientSeq: 2, action: { type: 'session/isReadChanged', isRead: true } });
  const echoed = await resumed.until(message => message.method === 'action' && message.params.origin?.clientSeq === 2);
  assert.equal(echoed.params.rejectionReason, undefined);
  assert.ok(echoed.params.serverSeq > lastSeen, 'the first action after the restart is numbered after every action before it');

  resumed.close();
  await server.restart();
  assert.deepEqual(server.app.agentHost.evictIdleSessions(), [], 'nothing is cached before anyone subscribes');
  const watching = await attach(server, t, token);
  await watching.rpc('initialize', initialize(randomUUID(), { initialSubscriptions: [session] }));
  const elsewhere = await attach(server, t, token);
  await elsewhere.rpc('reconnect', { channel: 'ahp-root://', clientId, lastSeenServerSeq: echoed.params.serverSeq, subscriptions: ['ahp-root://'] });
  const removed = await watching.until(message => action(message, session, 'session/activeClientRemoved'));
  assert.deepEqual(removed.params.action, { type: 'session/activeClientRemoved', clientId }, 'a restored client that comes back without the session gives its place up at once');
  assert.ok(removed.params.serverSeq > echoed.params.serverSeq);
  await server.restart();
  const after = await attach(server, t, token);
  const state = (await after.rpc('initialize', initialize(randomUUID(), { initialSubscriptions: [session] }))).snapshots[0].state;
  assert.deepEqual(state.activeClients, [], 'the removal is kept across the next restart');
});

test('disposing a session drops its projection, summary and active clients', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const token = (await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'dispose' } })).body.token;
  const client = await attach(server, t, token);
  const clientId = randomUUID();
  await client.rpc('initialize', initialize(clientId));
  const session = `ahp-session:/${randomUUID()}`;
  const chat = defaultChatOf(session);
  await client.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1 }, activeClient: { clientId, tools: [] } });
  await client.rpc('subscribe', { channel: chat });
  client.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'dispose-turn', startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } } });
  await client.until(message => action(message, chat, 'chat/turnComplete'));
  const id = server.app.store.listSessions()[0].id;
  assert.ok(server.app.agentHost.cachedSessions().includes(id));
  await client.rpc('disposeSession', { channel: session });
  assert.ok(!server.app.agentHost.cachedSessions().includes(id), 'the projection and summary are gone');
  await server.restart();
  const again = await attach(server, t, token);
  const state = (await again.rpc('initialize', initialize(randomUUID(), { initialSubscriptions: [session] }))).snapshots[0].state;
  assert.deepEqual(state.activeClients, [], 'a disposed session keeps no active clients');
});

test('an ended session nobody subscribes to is evicted after the idle period and rebuilt to the same snapshot on subscribe; a subscribed or running one is kept', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const operator = { id: 'demo-operator', name: 'Demo operator', role: 'operator' as const };
  const created = server.app.engine.create({ title: fixture.session.title, objective: fixture.session.objective, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  const ended: Session = { ...created, ...fixture.session, status: 'cancelled', placement: undefined, approval: undefined, id: created.id, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', ownerId: created.ownerId, ownerName: created.ownerName, runs: fixture.session.runs.map((run: Json) => ({ ...run, sessionId: created.id })) };
  server.app.store.saveSession(ended);
  for (const event of fixture.events as Event[]) server.app.store.appendEvent(created.id, event.type, event.actor, event.data, event.runId);
  const queued = server.app.engine.create({ title: 'Still queued', objective, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  const host = server.app.agentHost;
  const token = (await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'idle' } })).body.token;
  const client = await attach(server, t, token);
  await client.rpc('initialize', initialize('idle'));
  const session = `ahp-session:/${created.id}`;
  const chat = defaultChatOf(session);
  const before = await Promise.all([session, chat].map(async channel => (await client.rpc('subscribe', { channel })).snapshot.state));
  await client.rpc('subscribe', { channel: `ahp-session:/${queued.id}` });
  const now = Date.now();
  assert.deepEqual(host.evictIdleSessions(now), []);
  assert.deepEqual(host.evictIdleSessions(now + idleSessionMs), [], 'a subscribed session is never evicted');

  for (const channel of [session, chat, `ahp-session:/${queued.id}`]) client.notify('unsubscribe', { channel });
  await client.rpc('ping', {});
  assert.deepEqual(host.evictIdleSessions(now + idleSessionMs), [], 'the idle period starts when nobody subscribes');
  assert.deepEqual(host.evictIdleSessions(now + 2 * idleSessionMs - 1), []);
  assert.deepEqual(host.evictIdleSessions(now + 2 * idleSessionMs), [created.id], 'only the ended session goes; the queued one may still run');
  assert.ok(!host.cachedSessions().includes(created.id));
  assert.ok(host.cachedSessions().includes(queued.id));

  const after = await Promise.all([session, chat].map(async channel => (await client.rpc('subscribe', { channel })).snapshot.state));
  assert.deepEqual(after, before, 'the rebuilt projection gives the same snapshot');
  const kinds = after[1].turns.flatMap((turn: Json) => turn.responseParts.map((part: Json) => part.kind));
  assert.ok(['systemNotification', 'toolCall', 'markdown'].every(kind => kinds.includes(kind)), 'the worst-case history is rebuilt in full');
});
