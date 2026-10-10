import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, reduceChat, type Json } from './ahp-support.ts';
import { scaledTimeout, settle, testTimeout, waitFor } from './timeframes.ts';

const objective = 'Reproduce the rounding regression and fix it with the tests intact.';
const vscodeMain = { name: 'vscode-agents-window', title: 'VS Code Agents Window' };

async function attached(t: { after: (fn: () => unknown) => void }) {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'e2e' } });
  const address = `${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`;
  const open = async (clientId: string, initialize: Json = {}) => {
    const client = connect(address);
    t.after(() => client.close());
    await client.open;
    const result = await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId, clientInfo: vscodeMain, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'], ...initialize });
    return Object.assign(client, { initialized: result });
  };
  return { server, address, open };
}

async function runTurn(client: Awaited<ReturnType<Awaited<ReturnType<typeof attached>>['open']>>, extra: Json = {}) {
  const session = `ahp-session:/${randomUUID()}`;
  const chat = defaultChatOf(session);
  await client.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'End to end' }, ...extra });
  const sessionSnapshot = (await client.rpc('subscribe', { channel: session })).snapshot;
  const chatSnapshot = (await client.rpc('subscribe', { channel: chat })).snapshot;
  client.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'e2e-turn', startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } } });
  await client.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === 'e2e-turn');
  return { session, chat, sessionSnapshot, chatSnapshot };
}

const actionsOn = (client: { inbox: Json[] }, channel: string) => client.inbox.filter(message => message.method === 'action' && message.params.channel === channel && !message.params.rejectionReason).map(message => message.params.action);
const markdown = (turn: Json) => turn.responseParts.filter((part: Json) => part.kind === 'markdown').map((part: Json) => part.content);

test('a streamed markdown part reduces to the text once: the response part carries what it held when added, the delta the rest', { timeout: testTimeout(60_000) }, async t => {
  const { open } = await attached(t);
  const client = await open(randomUUID());
  const { chat, chatSnapshot } = await runTurn(client);
  const reduced = actionsOn(client, chat).reduce(reduceChat, chatSnapshot.state);
  const fresh = (await client.rpc('subscribe', { channel: chat })).snapshot.state;
  assert.ok(markdown(fresh.turns[0]).some((content: string) => content.length > 0));
  assert.deepEqual(markdown(reduced.turns[0]), markdown(fresh.turns[0]), 'the reduced chat equals a fresh snapshot, with no chunk doubled');
});

const merged = (state: Json | undefined, changes: Json) => ({ ...state, ...changes });

test('activity that ends is cleared with null in root summaries and in the session\'s chat catalogue, as VS Code\'s own host does', { timeout: testTimeout(60_000) }, async t => {
  const { open } = await attached(t);
  const client = await open(randomUUID());
  const { session, chat, sessionSnapshot } = await runTurn(client);
  const summaries = client.inbox.filter(message => message.method === 'root/sessionSummaryChanged' && message.params.session === session).map(message => message.params.changes);
  assert.ok(summaries.some(changes => typeof changes.activity === 'string'), 'the session had activity while its crew worked');
  const root = summaries.reduce(merged, client.inbox.find(message => message.method === 'root/sessionAdded' && message.params.summary.resource === session)!.params.summary);
  const listed = (await client.rpc('listSessions', { channel: 'ahp-root://' })).items.find((item: Json) => item.resource === session);
  assert.equal(listed.activity, undefined);
  assert.equal(root.activity ?? undefined, undefined, 'the reduced root summary no longer carries the finished activity');
  const updates = actionsOn(client, session).filter(item => item.type === 'session/chatUpdated' && item.chat === chat).map(item => item.changes);
  const catalogued = updates.reduce(merged, sessionSnapshot.state.chats[0]);
  assert.equal(catalogued.activity ?? undefined, undefined, 'the chat catalogue entry no longer carries it either');
  assert.ok(updates.at(-1) && Object.hasOwn(updates.at(-1)!, 'activity') && updates.at(-1)!.activity === null);
});

test('the chat channel follows its activity with chat/activityChanged and clears it when the work ends', { timeout: testTimeout(60_000) }, async t => {
  const { open } = await attached(t);
  const client = await open(randomUUID());
  const { session, chat, chatSnapshot } = await runTurn(client);
  const changes = actionsOn(client, chat).filter(item => item.type === 'chat/activityChanged');
  assert.ok(changes.some(item => /is working/.test(item.activity ?? '')), `the chat reports the crew working: ${JSON.stringify(changes)}`);
  assert.equal(changes.at(-1)!.activity, undefined, 'the last change clears the activity');
  const reduced = actionsOn(client, chat).reduce(reduceChat, chatSnapshot.state);
  assert.equal(reduced.activity, (await client.rpc('subscribe', { channel: chat })).snapshot.state.activity);
  const sessionChanges = actionsOn(client, session).filter(item => item.type === 'session/activityChanged').map(item => item.activity);
  assert.deepEqual(sessionChanges, changes.map(item => item.activity), 'the session and its chat report the same changes');
  assert.ok(sessionChanges.every((value, index) => index === 0 || value !== sessionChanges[index - 1]), 'an unchanged activity is not announced again');
});

test('root/activeSessionsChanged tells each person how many of their own sessions are active', { timeout: testTimeout(60_000) }, async t => {
  const { server, address, open } = await attached(t);
  const client = await open(randomUUID());
  assert.equal(client.initialized.snapshots[0].state.activeSessions, 0);
  server.app.store.addUser({ id: 'carol-e2e', name: 'carol-e2e', role: 'operator', passwordHash: 'unused' });
  const carol = connect(`${address.replace(/tkn=.*/, '')}tkn=${server.app.agentHost.issueToken({ id: 'carol-e2e', name: 'carol-e2e', role: 'operator' })}`);
  t.after(() => carol.close());
  await carol.open;
  await carol.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'carol', initialSubscriptions: ['ahp-root://'] });
  await runTurn(client);
  await client.until(message => action(message, 'ahp-root://', 'root/activeSessionsChanged') && message.params.action.activeSessions === 0);
  const counts = actionsOn(client, 'ahp-root://').filter(item => item.type === 'root/activeSessionsChanged').map(item => item.activeSessions);
  assert.deepEqual(counts, [1, 0], 'the count rises while the crew works and falls when it is done');
  const reduced = counts.at(-1);
  assert.equal(reduced, (await client.rpc('subscribe', { channel: 'ahp-root://' })).snapshot.state.activeSessions);
  assert.deepEqual(actionsOn(carol, 'ahp-root://').filter(item => item.type === 'root/activeSessionsChanged'), [], 'someone who cannot see the session is told nothing');
});

test('createSession.activeClient makes the creating client active, as a session/activeClientSet right after creation would', { timeout: testTimeout(60_000) }, async t => {
  const { open } = await attached(t);
  const clientId = randomUUID();
  const client = await open(clientId);
  const activeClient = { clientId, tools: [{ name: 'open_file', description: 'Open a file in the editor', inputSchema: { type: 'object' } }] };
  const config = { repository: 'order-service', crew: 'delivery', budgetUsd: 1 };
  const refused = `ahp-session:/${randomUUID()}`;
  await assert.rejects(client.rpc('createSession', { channel: refused, provider: 'unfold', config, activeClient: { clientId: 'someone-else', tools: [] } }), (error: any) => error.code === -32602, 'a client may only claim itself');
  assert.ok(!(await client.rpc('listSessions', { channel: 'ahp-root://' })).items.some((item: Json) => item.resource === refused), 'a refused creation creates nothing');

  const session = `ahp-session:/${randomUUID()}`;
  await client.rpc('createSession', { channel: session, provider: 'unfold', config, activeClient });
  const set = await client.until(message => action(message, session, 'session/activeClientSet'));
  assert.deepEqual(set.params.action.activeClient, activeClient);
  assert.ok(set.params.serverSeq > (await client.until(message => action(message, session, 'session/ready'))).params.serverSeq);
  assert.deepEqual((await client.rpc('subscribe', { channel: session })).snapshot.state.activeClients, [activeClient]);
  const chat = defaultChatOf(session);
  await client.rpc('subscribe', { channel: chat });
  client.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'active-turn', startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } } });
  await client.until(message => action(message, chat, 'chat/turnStarted'));
  assert.deepEqual((await client.rpc('subscribe', { channel: session })).snapshot.state.activeClients, [activeClient], 'the claim survives the first message');
});

test('reconnect as the first request on a new connection resumes a client this host has seen, in that client\'s spelling', { timeout: testTimeout(60_000) }, async t => {
  const { server, address, open } = await attached(t);
  const clientId = randomUUID();
  const first = await open(clientId);
  const session = `ahp-session:/${randomUUID()}`;
  await first.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1 } });
  await first.until(message => action(message, session, 'session/ready'));
  const lastSeen = first.inbox.filter(message => message.method === 'action').at(-1)!.params.serverSeq;
  first.close();

  const resumed = connect(address);
  t.after(() => resumed.close());
  await resumed.open;
  const result = await resumed.rpc('reconnect', { channel: 'ahp-root://', clientId, lastSeenServerSeq: lastSeen, subscriptions: ['ahp-root://', session], _meta: { 'vscode.ahpSessionUris': true } });
  assert.equal(result.type, 'snapshot');
  assert.deepEqual(result.snapshots.map((snapshot: Json) => [snapshot.resource, snapshot.state.resource ?? snapshot.resource]), [['ahp-root://', 'ahp-root://'], [session, session]]);
  resumed.notify('dispatchAction', { channel: session, clientSeq: 1, action: { type: 'session/isReadChanged', isRead: true } });
  const echoed = await resumed.until(message => message.method === 'action' && message.params.origin?.clientSeq === 1);
  assert.equal(echoed.params.rejectionReason, undefined, 'the resumed client may act');
  assert.equal(echoed.params.origin.clientId, clientId, 'under the clientId it resumed');

  const stranger = connect(address);
  t.after(() => stranger.close());
  await stranger.open;
  await assert.rejects(stranger.rpc('reconnect', { channel: 'ahp-root://', clientId: randomUUID(), lastSeenServerSeq: 0, subscriptions: ['ahp-root://'] }), (error: any) => error.code === -32008, 'a client this host never saw must initialize');
  await assert.rejects(stranger.rpc('subscribe', { channel: session }), (error: any) => error.code === -32600, 'a refused reconnect leaves the connection uninitialized');

  server.app.store.addUser({ id: 'dave-e2e', name: 'dave-e2e', role: 'operator', passwordHash: 'unused' });
  const dave = connect(`${address.replace(/tkn=.*/, '')}tkn=${server.app.agentHost.issueToken({ id: 'dave-e2e', name: 'dave-e2e', role: 'operator' })}`);
  t.after(() => dave.close());
  await dave.open;
  await assert.rejects(dave.rpc('reconnect', { channel: 'ahp-root://', clientId, lastSeenServerSeq: 0, subscriptions: ['ahp-root://'] }), (error: any) => error.code === -32008, 'another person cannot resume someone else\'s client');

  const windowId = randomUUID();
  const window = await open(windowId, { _meta: { 'vscode.clientConnectionKind': 'remote' } });
  window.close();
  const windowAgain = connect(address);
  t.after(() => windowAgain.close());
  await windowAgain.open;
  const legacy = await windowAgain.rpc('reconnect', { channel: 'ahp-root://', clientId: windowId, lastSeenServerSeq: 0, subscriptions: [`unfold:/${session.slice('ahp-session:/'.length)}`] });
  assert.equal(legacy.snapshots[0].state.resource, `unfold:/${session.slice('ahp-session:/'.length)}`, 'a VS Code 1.141 window resumes with the provider spelling');
});

test('a reconnect keeps the session spelling decided at initialize, even when it repeats no _meta', { timeout: testTimeout(60_000) }, async t => {
  const { address, open } = await attached(t);
  const clientId = randomUUID();
  const first = await open(clientId);
  const session = `ahp-session:/${randomUUID()}`;
  await first.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1 } });
  await first.until(message => action(message, session, 'session/ready'));
  first.close();

  const resumed = connect(address);
  t.after(() => resumed.close());
  await resumed.open;
  const result = await resumed.rpc('reconnect', { channel: 'ahp-root://', clientId, lastSeenServerSeq: 0, subscriptions: ['ahp-root://', session] });
  const state = result.snapshots[1].state;
  assert.deepEqual([result.snapshots[1].resource, state.resource, state.defaultChat], [session, session, defaultChatOf(session)], 'the declared ahp-session spelling survives a reconnect without _meta');
  await resumed.rpc('subscribe', { channel: defaultChatOf(session) });
  resumed.notify('dispatchAction', { channel: defaultChatOf(session), clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'resumed-turn', startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } } });
  await resumed.until(message => action(message, defaultChatOf(session), 'chat/turnComplete'));
  assert.deepEqual((await resumed.rpc('listSessions', { channel: 'ahp-root://' })).items.map((item: Json) => item.resource), [session]);
  assert.ok(!JSON.stringify(resumed.inbox).includes(`unfold:/${session.slice('ahp-session:/'.length)}`), 'no later notification falls back to the provider spelling');

  const windowId = randomUUID();
  const window = await open(windowId, { _meta: { 'vscode.clientConnectionKind': 'remote' } });
  window.close();
  const declaring = connect(address);
  t.after(() => declaring.close());
  await declaring.open;
  const upgraded = await declaring.rpc('reconnect', { channel: 'ahp-root://', clientId: windowId, lastSeenServerSeq: 0, subscriptions: [session], _meta: { 'vscode.ahpSessionUris': true } });
  assert.equal(upgraded.snapshots[0].state.resource, session, 'a reconnect that declares the capability switches to ahp-session');
});

test('an active client that drops keeps its place for the grace period, keeps it through a reconnect, and loses it when the period ends or it does not resubscribe', { timeout: testTimeout(60_000) }, async t => {
  const { server, address, open } = await attached(t);
  const shortGrace = scaledTimeout(800);
  server.app.agentHost.activeClientGraceMs = scaledTimeout(10_000);
  const clientId = randomUUID();
  const activeClient = { clientId, tools: [] };
  const session = `ahp-session:/${randomUUID()}`;
  const first = await open(clientId);
  await first.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1 }, activeClient });
  await first.until(message => action(message, session, 'session/activeClientSet'));
  const watcher = await open(randomUUID());
  await watcher.rpc('subscribe', { channel: session });
  const removals = () => watcher.inbox.filter(message => action(message, session, 'session/activeClientRemoved'));
  const resume = async (subscriptions: string[]) => {
    const connection = connect(address);
    t.after(() => connection.close());
    await connection.open;
    return Object.assign(connection, { result: await connection.rpc('reconnect', { channel: 'ahp-root://', clientId, lastSeenServerSeq: 0, subscriptions }) });
  };

  const departing = () => waitFor(() => server.app.agentHost.isDeparting(clientId), undefined, { reason: 'the host never began the dropped client\'s grace period', withinMs: 5_000 });

  first.close();
  await departing();
  assert.deepEqual((await watcher.rpc('subscribe', { channel: session })).snapshot.state.activeClients, [activeClient], 'a dropped client keeps its place while it may still come back');
  const resumed = await resume(['ahp-root://', session]);
  assert.deepEqual(resumed.result.snapshots[1].state.activeClients, [activeClient], 'the reconnect snapshot still lists it');
  assert.equal(server.app.agentHost.isDeparting(clientId), false, 'a reconnect inside the period ends the wait');
  await settle(1200);
  assert.deepEqual(removals(), [], 'a client that came back in time is never removed');

  server.app.agentHost.activeClientGraceMs = shortGrace;
  const beforeRemoval = removals().length;
  resumed.close();
  await departing();
  assert.equal(removals().length, beforeRemoval, 'the removal waits for the grace period');
  const removed = await watcher.until(message => action(message, session, 'session/activeClientRemoved'));
  assert.deepEqual(removed.params.action, { type: 'session/activeClientRemoved', clientId });
  assert.equal(removed.params.origin, undefined, 'the host removes it, not a client');
  assert.deepEqual((await watcher.rpc('subscribe', { channel: session })).snapshot.state.activeClients, []);

  const again = await open(clientId);
  await again.rpc('subscribe', { channel: session });
  again.notify('dispatchAction', { channel: session, clientSeq: 1, action: { type: 'session/activeClientSet', activeClient } });
  await again.until(message => message.method === 'action' && message.params.origin?.clientSeq === 1);
  again.close();
  await departing();
  const elsewhere = await resume(['ahp-root://']);
  assert.equal(server.app.agentHost.isDeparting(clientId), false, 'a reconnect that does not resubscribe gives its place up at once, not after the grace period');
  const removedAgain = await watcher.until(message => action(message, session, 'session/activeClientRemoved') && message.params.serverSeq > removed.params.serverSeq);
  assert.deepEqual(removedAgain.params.action, { type: 'session/activeClientRemoved', clientId });
  assert.equal(elsewhere.result.type, 'snapshot');
});
