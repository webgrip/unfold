import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, vscodeAgentsWindow, type Json } from './ahp-support.ts';
import { chatConfigRefusal, debugLogsRefusal, repositoriesDirectory, resourceWriteRefusal } from '../src/ahp/host.ts';
import { isActionKnownToVersion } from '../src/ahp/versions.ts';
import { testTimeout } from './timeframes.ts';

async function attached(t: { after: (fn: () => unknown) => void }, protocolVersions = ['1.0.0', '0.10.0', '0.9.0']) {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'tolerance' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  const clientId = randomUUID();
  const initialized = await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions, clientId, clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
  let seq = 0;
  const dispatch = (channel: string, dispatched: Json) => {
    const clientSeq = ++seq;
    client.notify('dispatchAction', { channel, clientSeq, action: dispatched });
    return client.until(message => message.method === 'action' && message.params.origin?.clientSeq === clientSeq);
  };
  return { server, client, clientId, initialized, dispatch };
}

async function startedSession(t: { after: (fn: () => unknown) => void }, protocolVersions?: string[]) {
  const attachedClient = await attached(t, protocolVersions);
  const { client, dispatch } = attachedClient;
  const session = `ahp-session:/${randomUUID()}`;
  const chat = defaultChatOf(session);
  await client.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', team: 'delivery', budgetUsd: 1, title: 'Tolerance' } });
  await client.rpc('subscribe', { channel: session });
  await client.rpc('subscribe', { channel: chat });
  const started = await dispatch(chat, { type: 'chat/turnStarted', turnId: randomUUID(), startedAt: new Date().toISOString(), message: { text: 'Reproduce the rounding regression and fix it with the tests intact.', origin: { kind: 'user' } } });
  assert.equal(started.params.rejectionReason, undefined, started.params.rejectionReason);
  return { ...attachedClient, session, chat };
}

test('chat/configChanged is AHP 1.1.0: 1.0 and 0.9 clients never receive it, and it is refused cleanly to the client that sent it', { timeout: testTimeout(60_000) }, async t => {
  assert.equal(isActionKnownToVersion('chat/configChanged', '1.1.0'), true);
  assert.equal(isActionKnownToVersion('chat/configChanged', '1.0.0'), false);
  assert.equal(isActionKnownToVersion('chat/configChanged', '0.9.0'), false);
  assert.equal(isActionKnownToVersion('chat/isReadChanged', '0.9.0'), true);

  const { client, session, chat, dispatch } = await startedSession(t);
  const refused = await dispatch(chat, { type: 'chat/configChanged', config: { budgetUsd: '25' } });
  assert.equal(refused.params.rejectionReason, chatConfigRefusal, 'the 1.0 sender still gets its rejection, so dispatchConfirmed resolves');
  assert.equal(refused.params.action.type, 'chat/configChanged');
  const state = (await client.rpc('subscribe', { channel: session })).snapshot.state;
  for (const [name, property] of Object.entries<Json>(state.config.schema.properties)) assert.equal(property.chatMutable, undefined, `${name} is never chatMutable`);
  assert.equal(state.config.values.budgetUsd, '1', 'nothing changed');
});

test('a pending message without kind is AHP 1.1\'s default, queued, and becomes an instruction like any queued or steering message', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, chat, dispatch } = await startedSession(t);
  const id = randomUUID();
  const echo = await dispatch(chat, { type: 'chat/pendingMessageSet', id, message: { text: 'Keep the public API unchanged.', origin: { kind: 'user' } } });
  assert.equal(echo.params.rejectionReason, undefined, echo.params.rejectionReason);
  assert.equal(echo.params.action.kind, 'queued');
  const removed = await client.until(message => action(message, chat, 'chat/pendingMessageRemoved') && message.params.action.id === id);
  assert.equal(removed.params.action.kind, 'queued');
  const steering = await dispatch(chat, { type: 'chat/pendingMessageSet', kind: 'steering', id: randomUUID(), message: { text: 'And keep the tests.', origin: { kind: 'user' } } });
  assert.equal(steering.params.rejectionReason, undefined, steering.params.rejectionReason);
  const operator = server.app.store.events(server.app.store.listSessions()[0].id).filter(event => event.type === 'message' && (event.data as Json).role === 'operator').map(event => (event.data as Json).text);
  assert.ok(operator.includes('Keep the public API unchanged.') && operator.includes('And keep the tests.'), 'both reach the Team as instructions');
});

test('AHP 1.1 subscribe and reconnect options are ignored: the host still answers with ordinary snapshots', { timeout: testTimeout(60_000) }, async t => {
  const { client, clientId, session } = await startedSession(t);
  const subscribed = await client.rpc('subscribe', { channel: session, flowControl: { receive: { maxFrames: 4 } } });
  assert.equal(subscribed.snapshot.resource, session);
  assert.ok(subscribed.snapshot.state.defaultChat);
  const again = await client.rpc('reconnect', { channel: 'ahp-root://', clientId, lastSeenServerSeq: 0, subscriptions: [session], windows: { [session]: { cursor: 'unknown' } } });
  assert.equal(again.type, 'snapshot');
  assert.equal(again.snapshots[0].resource, session);
});

test('vscode/stopBackgroundWork and vscode/cancelAgentHostDebugLogs get well-formed answers: there is no background work to stop and no log export to cancel', async t => {
  const { client } = await attached(t);
  assert.deepEqual(await client.rpc('vscode/stopBackgroundWork', { chat: defaultChatOf(`ahp-session:/${randomUUID()}`), id: 'shell-1' }), { stopped: false }, 'VS Code shows "had already finished", not an error notification');
  await assert.rejects(client.rpc('vscode/stopBackgroundWork', {}), (error: any) => error.code === -32602);
  assert.equal(await client.rpc('vscode/cancelAgentHostDebugLogs', { progressToken: randomUUID() }), null);
  await assert.rejects(client.rpc('vscode/cancelAgentHostDebugLogs', {}), (error: any) => error.code === -32602);
  await assert.rejects(client.rpc('vscode/collectAgentHostDebugLogs', { session: `ahp-session:/${randomUUID()}`, progressToken: randomUUID() }), (error: any) => error.code === -32009 && error.message === debugLogsRefusal, 'VS Code then exports its own logs and shows why the host\'s are missing');
});

test('resource writes, copies, moves, deletes and mkdir are refused with PermissionDenied, which VS Code shows as NoPermissions', async t => {
  const { client } = await attached(t);
  const folder = `${repositoriesDirectory}/order-service`;
  const calls: Array<[string, Json]> = [
    ['resourceWrite', { uri: `${folder}/notes.md`, data: 'x', encoding: 'utf-8' }],
    ['resourceCopy', { source: `${folder}/a`, destination: `${folder}/b` }],
    ['resourceDelete', { uri: `${folder}/a`, recursive: true }],
    ['resourceMove', { source: `${folder}/a`, destination: `${folder}/b`, failIfExists: true }],
    ['resourceMkdir', { uri: `${folder}/new` }],
  ];
  for (const [method, params] of calls) await assert.rejects(client.rpc(method, { channel: 'ahp-root://', ...params }), (error: any) => error.code === -32009 && error.message === resourceWriteRefusal, method);
  await assert.rejects(client.rpc('resourceUnknown', {}), (error: any) => error.code === -32601, 'an unknown method stays method-not-found');
});

test('setClientManagedSettingsPermissions, which VS Code 1.142 sends every host, is a notification the host ignores', async t => {
  const { client, dispatch } = await attached(t);
  client.notify('setClientManagedSettingsPermissions', { permissions: {} });
  assert.deepEqual(await client.rpc('ping', {}), {});
  assert.equal(client.inbox.some(message => message.error), false, 'a notification gets no answer, not even an error');
  assert.equal((await dispatch('ahp-root://', { type: 'root/configChanged', config: {} })).params.rejectionReason, undefined, 'the connection keeps working');
});
