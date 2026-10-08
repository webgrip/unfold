import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, reduceChat, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';

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
