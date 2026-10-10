import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, type Json } from './ahp-support.ts';
import { settle, testTimeout } from './timeframes.ts';
import { DemoRuntime } from '../src/runtime/demo.ts';
import type { AgentRuntime, ExecutionContext, ExecutionResult, RuntimeKind } from '../src/types.ts';

async function heldRun() {
  const dataDir = await mkdtemp(join(tmpdir(), 'unfold-ahp-held-'));
  const pace = (signal: AbortSignal) => new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  return { dataDir, runtimes: new Map<RuntimeKind, AgentRuntime>([['demo', new DemoRuntime({ dataDir, pace })]]) };
}

const objective = 'Reproduce the rounding regression and fix it with the tests intact.';
const echoOf = (seq: number) => (message: Json) => message.method === 'action' && message.params.origin?.clientSeq === seq;

test('every accepted client action is echoed with its origin in server order, and a turn the client starts keeps its id', { timeout: testTimeout(60_000) }, async t => {
  const held = await heldRun();
  const server = await application('demo', undefined, held.runtimes);
  t.after(() => server.close());
  t.after(() => rm(held.dataDir, { recursive: true, force: true }));
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'echoes' } });
  const address = `${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`;
  const attach = async (clientId: string) => {
    const client = connect(address);
    t.after(() => client.close());
    await client.open;
    await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
    return client;
  };
  const vscode = await attach('vscode-window');
  const watcher = await attach('second-window');
  const sessionUri = `ahp-session:/${randomUUID()}`;
  const chat = defaultChatOf(sessionUri);
  await vscode.rpc('createSession', { channel: sessionUri, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Echoes' } });
  for (const channel of [sessionUri, chat]) await vscode.rpc('subscribe', { channel });

  vscode.notify('dispatchAction', { channel: sessionUri, clientSeq: 1, action: { type: 'session/activeClientSet', activeClient: { clientId: 'vscode-window', tools: [] } } });
  assert.equal((await vscode.until(echoOf(1))).params.rejectionReason, undefined, 'an active client may be set before the first message');
  vscode.notify('dispatchAction', { channel: chat, clientSeq: 2, action: { type: 'chat/turnStarted', turnId: 'first-turn', startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } } });
  const first = await vscode.until(echoOf(2));
  assert.equal(first.params.action.type, 'chat/turnStarted');
  assert.equal(first.params.action.turnId, 'first-turn', 'the first turn keeps the id the client gave it');
  await vscode.until(message => action(message, chat, 'chat/responsePart') && message.params.action.turnId === 'first-turn');
  for (const channel of [sessionUri, chat]) await watcher.rpc('subscribe', { channel });
  assert.deepEqual((await watcher.rpc('subscribe', { channel: sessionUri })).snapshot.state.activeClients, [{ clientId: 'vscode-window', tools: [] }]);

  vscode.notify('dispatchAction', { channel: sessionUri, clientSeq: 3, action: { type: 'session/activeClientSet', activeClient: { clientId: 'someone-else', tools: [] } } });
  assert.match((await vscode.until(echoOf(3))).params.rejectionReason, /itself/);

  const steer = 'Keep the public rounding helper signature unchanged.';
  vscode.notify('dispatchAction', { channel: chat, clientSeq: 4, action: { type: 'chat/turnStarted', turnId: 'steer-turn', startedAt: new Date().toISOString(), message: { text: steer, origin: { kind: 'user' } } } });
  const steered = await vscode.until(echoOf(4));
  assert.equal(steered.params.rejectionReason, undefined);
  assert.equal(steered.params.action.turnId, 'steer-turn', 'a turn started during a Run keeps the client\'s id');
  assert.equal(steered.params.action.message.text, steer);
  await vscode.until(message => action(message, chat, 'chat/responsePart') && message.params.action.turnId === 'steer-turn' && /next Run/.test(message.params.action.part.content));
  assert.equal(vscode.inbox.filter(message => action(message, chat, 'chat/turnStarted') && message.params.action.message.text === steer).length, 1, 'the instruction opens one turn, not a second one under a host id');

  vscode.notify('dispatchAction', { channel: chat, clientSeq: 5, action: { type: 'chat/pendingMessageSet', kind: 'steering', id: 'pending-1', message: { text: 'Also cover a negative amount.', origin: { kind: 'user' } } } });
  const pendingSet = await vscode.until(echoOf(5));
  assert.equal(pendingSet.params.rejectionReason, undefined);
  assert.deepEqual(pendingSet.params.action, { type: 'chat/pendingMessageSet', kind: 'steering', id: 'pending-1', message: { text: 'Also cover a negative amount.', origin: { kind: 'user' } } });
  const removed = await vscode.until(message => action(message, chat, 'chat/pendingMessageRemoved'));
  assert.deepEqual(removed.params.action, { type: 'chat/pendingMessageRemoved', kind: 'steering', id: 'pending-1' });
  assert.ok(removed.params.serverSeq > pendingSet.params.serverSeq, 'the host removes the pending message after echoing it');
  const instruction = await vscode.until(message => action(message, chat, 'chat/turnStarted') && message.params.action.message.text === 'Also cover a negative amount.');
  assert.equal(instruction.params.origin, undefined, 'the recorded instruction appears as the host\'s own turn');
  const events = server.app.store.events(server.app.store.listSessions()[0].id).filter(event => event.type === 'message' && event.data.role === 'operator');
  assert.deepEqual(events.map(event => [event.data.text, event.data.applies]), [[steer, 'next_execution'], ['Also cover a negative amount.', 'next_execution']]);

  vscode.notify('dispatchAction', { channel: chat, clientSeq: 6, action: { type: 'chat/pendingMessageSet', kind: 'queued', id: 'pending-2', message: { text: 'Delegated by another agent.', origin: { kind: 'agent' } } } });
  assert.match((await vscode.until(echoOf(6))).params.rejectionReason, /person/);
  vscode.notify('dispatchAction', { channel: chat, clientSeq: 7, action: { type: 'chat/pendingMessageRemoved', kind: 'steering', id: 'pending-1' } });
  assert.ok((await vscode.until(echoOf(7))).params.rejectionReason);
  vscode.notify('dispatchAction', { channel: chat, clientSeq: 8, action: { type: 'chat/queuedMessagesReordered', order: [] } });
  assert.equal((await vscode.until(echoOf(8))).params.rejectionReason, undefined);
  vscode.notify('dispatchAction', { channel: chat, clientSeq: 9, action: { type: 'chat/truncated', turnId: 'first-turn' } });
  assert.match((await vscode.until(echoOf(9))).params.rejectionReason, /history.*cannot be truncated/);

  vscode.notify('dispatchAction', { channel: sessionUri, clientSeq: 10, action: { type: 'session/titleChanged', title: 'Renamed from the session' } });
  assert.deepEqual((await vscode.until(echoOf(10))).params.action, { type: 'session/titleChanged', title: 'Renamed from the session' });
  assert.equal((await watcher.until(message => message.method === 'root/sessionSummaryChanged' && message.params.changes.title === 'Renamed from the session')).params.session, sessionUri);
  vscode.notify('dispatchAction', { channel: chat, clientSeq: 11, action: { type: 'session/titleChanged', title: 'Renamed from the chat' } });
  assert.equal((await vscode.until(echoOf(11))).params.channel, chat);
  await watcher.until(message => action(message, sessionUri, 'session/titleChanged') && message.params.action.title === 'Renamed from the chat');
  assert.equal((await vscode.rpc('listSessions', { channel: 'ahp-root://' })).items[0].title, 'Renamed from the chat');
  vscode.notify('dispatchAction', { channel: sessionUri, clientSeq: 12, action: { type: 'session/titleChanged', title: '   ' } });
  assert.ok((await vscode.until(echoOf(12))).params.rejectionReason, 'an empty title is rejected');

  vscode.notify('dispatchAction', { channel: 'ahp-root://', clientSeq: 13, action: { type: 'root/configChanged', config: { trustedUris: ['file:///home/operator/private'] } } });
  assert.equal((await vscode.until(echoOf(13))).params.rejectionReason, undefined);

  vscode.notify('dispatchAction', { channel: chat, clientSeq: 14, action: { type: 'chat/turnCancelled', turnId: 'steer-turn', duration: 0 } });
  const cancelled = await vscode.until(echoOf(14));
  assert.equal(cancelled.params.action.type, 'chat/turnCancelled');
  assert.equal(cancelled.params.rejectionReason, undefined);
  assert.equal(server.app.store.listSessions()[0].status, 'paused', 'cancelling a turn pauses the work; it does not end it');

  const echoes = vscode.inbox.filter(message => message.method === 'action' && message.params.origin?.clientId === 'vscode-window');
  const sequence = echoes.map(message => message.params.serverSeq);
  assert.deepEqual(sequence, [...sequence].sort((a, b) => a - b), 'echoes arrive in server order');
  assert.equal(new Set(sequence).size, sequence.length);
  assert.ok(!watcher.inbox.some(message => JSON.stringify(message).includes('file:///home/operator/private')), 'root configuration is echoed only to its sender');

  server.app.agentHost.activeClientGraceMs = 50;
  vscode.close();
  const dropped = await watcher.until(message => action(message, sessionUri, 'session/activeClientRemoved'));
  assert.equal(dropped.params.action.clientId, 'vscode-window', 'a client that does not come back within the grace period stops being an active client');

  await server.restart();
  const reissued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'after restart' } });
  const again = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${reissued.body.token}`);
  t.after(() => again.close());
  await again.open;
  await again.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'after-restart', _meta: { 'vscode.ahpSessionUris': true } });
  const turns = (await again.rpc('subscribe', { channel: chat })).snapshot.state.turns.map((turn: Json) => turn.id);
  assert.equal(turns[0], 'first-turn', 'the client\'s turn ids survive a restart');
  assert.ok(turns.includes('steer-turn'));
  await settle(50);
});

class AskingRuntime extends DemoRuntime {
  private release?: () => void;
  private openAsk?: () => void;
  private readonly asking = new Promise<void>(resolve => { this.openAsk = resolve; });
  ask(): void { this.openAsk?.(); }
  override async execute(context: ExecutionContext): Promise<ExecutionResult> {
    if (context.role.mode === 'read') return { summary: 'Reviewed the bounded fixture.', verdict: 'approve', artifacts: [], costUsd: 0 };
    await this.asking;
    context.emit({ type: 'permission', data: { nativeId: 'native-permission-1', kind: 'permission', title: 'Allow the fixture check?', detail: 'node --test test/order.test.js', options: ['once', 'reject'] } });
    await new Promise<void>((resolve, reject) => { this.release = resolve; context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true }); });
    return { summary: 'Ran the fixture check after approval.', artifacts: [], costUsd: 0 };
  }
  async respond(): Promise<void> { this.release?.(); }
}

test('a confirmed permission is echoed to its sender in server order, and an input request makes the session unread', { timeout: testTimeout(60_000) }, async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'unfold-ahp-asking-'));
  const runtime = new AskingRuntime({ dataDir, delayMs: 10 });
  const server = await application('demo', undefined, new Map<RuntimeKind, AgentRuntime>([['demo', runtime]]));
  t.after(() => server.close());
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'asking' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'asking-window', initialSubscriptions: ['ahp-root://'] });
  const sessionUri = `unfold:/${randomUUID()}`;
  const chat = defaultChatOf(sessionUri);
  await client.rpc('createSession', { channel: sessionUri, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Asks first' } });
  for (const channel of [sessionUri, chat]) await client.rpc('subscribe', { channel });
  client.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'asking-turn', startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } } });
  await client.until(echoOf(1));
  await client.until(message => action(message, chat, 'chat/responsePart') && /started/.test(message.params.action.part.content ?? ''));
  client.notify('dispatchAction', { channel: sessionUri, clientSeq: 2, action: { type: 'session/isReadChanged', isRead: true } });
  const markedRead = await client.until(message => message.method === 'root/sessionSummaryChanged' && (message.params.changes.status & 32) === 32);
  assert.equal(markedRead.params.changes.status & 8, 8, 'the session is read while its Run works');
  client.inbox.length = 0;
  runtime.ask();
  const ready = await client.until(message => action(message, chat, 'chat/toolCallReady') && message.params.action.confirmationTitle === 'Allow the fixture check?');
  const needsInput = await client.until(message => message.method === 'root/sessionSummaryChanged' && (message.params.changes.status & 24) === 24);
  assert.equal(needsInput.params.changes.status & 32, 0, 'an input request makes the session unread');

  client.notify('dispatchAction', { channel: chat, clientSeq: 3, action: { type: 'chat/toolCallConfirmed', turnId: ready.params.action.turnId, toolCallId: ready.params.action.toolCallId, approved: true, confirmed: 'user-action', selectedOptionId: 'once' } });
  const confirmed = await client.until(echoOf(3));
  assert.equal(confirmed.params.rejectionReason, undefined);
  assert.equal(confirmed.params.action.type, 'chat/toolCallConfirmed');
  assert.equal(confirmed.params.action.toolCallId, ready.params.action.toolCallId);
  const complete = await client.until(message => action(message, chat, 'chat/toolCallComplete') && message.params.action.toolCallId === ready.params.action.toolCallId);
  assert.ok(complete.params.serverSeq > confirmed.params.serverSeq, 'the echo comes before the completion it causes');
  client.notify('dispatchAction', { channel: chat, clientSeq: 4, action: { type: 'chat/toolCallConfirmed', turnId: ready.params.action.turnId, toolCallId: ready.params.action.toolCallId, approved: true, selectedOptionId: 'once' } });
  assert.ok((await client.until(echoOf(4))).params.rejectionReason, 'a request is answered once');
});
