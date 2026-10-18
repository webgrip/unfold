import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, vscodeAgentsWindow, type AgentHostClient, type Json } from './ahp-support.ts';
import { choiceEvents, repositoriesDirectory, repositoryFolderNames, repositoryWorkspaceNames } from '../src/ahp/host.ts';
import { DemoRuntime } from '../src/runtime/demo.ts';
import type { AgentRuntime, ExecutionContext, ExecutionResult, RuntimeKind } from '../src/types.ts';
import { testTimeout } from './timeframes.ts';

const read = 32;
const archived = 64;
const objective = 'Reproduce the rounding regression and fix it with the tests intact.';
const vscodeConfig = { 'chat.agent.terminal.autoApprove': { 'npm test': true }, workspaceTrust: { enabled: true, trustedUris: ['file:///Users/operator/projects/private'] }, telemetryLevel: 'off' };

function client(address: string, t: { after: (fn: () => void) => void }) {
  const opened = connect(address);
  t.after(() => opened.close());
  let seq = 0;
  return Object.assign(opened, {
    dispatch(channel: string, dispatched: Json): Promise<Json> {
      const clientSeq = ++seq;
      opened.notify('dispatchAction', { channel, clientSeq, action: dispatched });
      return opened.until(message => message.method === 'action' && message.params.origin?.clientSeq === clientSeq);
    },
  });
}

async function accepted(echo: Promise<Json>, channel: string, type: string): Promise<Json> {
  const envelope = await echo;
  assert.equal(envelope.params.rejectionReason, undefined, `${type} is accepted: ${envelope.params.rejectionReason}`);
  assert.equal(envelope.params.channel, channel);
  assert.equal(envelope.params.action.type, type);
  return envelope;
}

const summaryOf = (vscode: AgentHostClient, session: string, test: (changes: Json) => boolean) => vscode.until(message => message.method === 'root/sessionSummaryChanged' && message.params.session === session && test(message.params.changes));

test('VS Code main (1.142) attaches: ahp-session URIs, read and archive marks that survive a summary update, root config and a reconnect', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'VS Code main' } });
  const address = `${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`;
  const clientId = randomUUID();
  const clientMeta = { 'vscode.clientConnectionKind': 'remote', 'vscode.telemetryLevel': 0, 'vscode.ahpSessionUris': true };
  const vscode = client(address, t);
  await vscode.open;
  const initialized = await vscode.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['1.0.0', '0.10.0', '0.9.0'], clientId, clientInfo: vscodeAgentsWindow, _meta: clientMeta, initialSubscriptions: ['ahp-root://'] });
  assert.equal(initialized.protocolVersion, '1.0.0', 'VS Code main offers 1.0.0 first and gets it');
  assert.deepEqual(initialized._meta, { 'vscode.ahpSessionUris': true }, 'the host confirms the URI capability and claims nothing native');
  await accepted(vscode.dispatch('ahp-root://', { type: 'root/configChanged', config: vscodeConfig }), 'ahp-root://', 'root/configChanged');
  assert.equal((await vscode.rpc('getNetworkDiagnosticsInfo', {})).os, process.platform);

  const values = (await vscode.rpc('resolveSessionConfig', { channel: 'ahp-root://', provider: 'unfold', config: { title: 'Fix rounding from VS Code main' } })).values;
  const session = `ahp-session:/${randomUUID()}`;
  const chat = defaultChatOf(session);
  assert.deepEqual(await vscode.rpc('createSession', { channel: session, provider: 'unfold', config: values, activeClient: { clientId, tools: [] } }), {});
  await vscode.until(message => message.method === 'root/sessionAdded' && message.params.summary.resource === session);
  const drafted = (await vscode.rpc('subscribe', { channel: session })).snapshot.state;
  assert.equal(drafted.defaultChat, chat, 'the default chat is buildDefaultChatUri of the ahp-session URI');
  await vscode.rpc('subscribe', { channel: chat });
  await accepted(vscode.dispatch(session, { type: 'session/activeClientSet', activeClient: { clientId, tools: [] } }), session, 'session/activeClientSet');
  const turnId = randomUUID();
  const started = await accepted(vscode.dispatch(chat, { type: 'chat/turnStarted', turnId, startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } }), chat, 'chat/turnStarted');
  assert.equal(started.params.action.turnId, turnId);
  await vscode.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === turnId);
  await summaryOf(vscode, session, changes => changes.status === 1);

  await accepted(vscode.dispatch(chat, { type: 'chat/isReadChanged', isRead: true }), chat, 'chat/isReadChanged');
  const chatRead = await vscode.until(message => action(message, session, 'session/chatUpdated') && message.params.action.chat === chat && (message.params.action.changes.status & read) === read);
  assert.equal(chatRead.params.origin, undefined);
  await accepted(vscode.dispatch(session, { type: 'session/isReadChanged', isRead: true }), session, 'session/isReadChanged');
  await accepted(vscode.dispatch(session, { type: 'session/isArchivedChanged', isArchived: true }), session, 'session/isArchivedChanged');
  await summaryOf(vscode, session, changes => (changes.status & (read | archived)) === (read | archived));

  vscode.inbox.length = 0;
  await accepted(vscode.dispatch(session, { type: 'session/titleChanged', title: 'Rounding, reviewed' }), session, 'session/titleChanged');
  const updated = await summaryOf(vscode, session, changes => changes.title === 'Rounding, reviewed' && changes.status !== undefined);
  assert.equal(updated.params.changes.status & (read | archived), read | archived, 'a summary update keeps both marks');
  const chatUpdated = await vscode.until(message => action(message, session, 'session/chatUpdated') && message.params.action.changes.status !== undefined);
  assert.equal(chatUpdated.params.action.changes.status & read, read, 'the chat summary keeps its read mark');
  assert.equal(server.app.store.listSessions()[0].status, 'completed', 'archiving changed nothing about the work');
  const conversation = JSON.stringify(vscode.inbox);
  vscode.close();

  const reconnecting = client(address, t);
  await reconnecting.open;
  const again = await reconnecting.rpc('reconnect', { channel: 'ahp-root://', clientId, lastSeenServerSeq: started.params.serverSeq, subscriptions: ['ahp-root://', session, chat], _meta: clientMeta });
  assert.equal(again.type, 'snapshot', 'the host resumes the client it knows with fresh snapshots');
  assert.deepEqual(again.snapshots.map((snapshot: Json) => snapshot.resource), ['ahp-root://', session, chat]);
  const [root, sessionState, chatState] = again.snapshots.map((snapshot: Json) => snapshot.state);
  assert.equal(root.agents[0].provider, 'unfold');
  assert.equal(sessionState.resource, session);
  assert.equal(sessionState.title, 'Rounding, reviewed');
  assert.equal(sessionState.status & (read | archived), read | archived);
  assert.equal(sessionState.defaultChat, chat);
  assert.equal(chatState.status & read, read);
  assert.equal(chatState.turns[0].id, turnId, 'the turn keeps the client\'s id across the reconnect');
  await accepted(reconnecting.dispatch('ahp-root://', { type: 'root/configChanged', config: vscodeConfig }), 'ahp-root://', 'root/configChanged');
  const listed = (await reconnecting.rpc('listSessions', { channel: 'ahp-root://' })).items;
  assert.deepEqual(listed.map((item: Json) => [item.resource, item.status & (read | archived)]), [[session, read | archived]]);
  assert.deepEqual(listed.map((item: Json) => [item.defaultChat, item.chats.map((entry: Json) => [entry.resource, entry.status & read])]), [[chat, [[chat, read]]]], 'a 1.0 client reads the chat\'s read mark from the session catalog');
  assert.ok(!(conversation + JSON.stringify(reconnecting.inbox) + JSON.stringify(again)).includes(`unfold:/${session.slice('ahp-session:/'.length)}`), 'the provider spelling never reaches a client that declared ahp-session URIs');
});

test('a first message the workbench refuses ends its turn with the reason, and the session stays open for a better message', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'VS Code 1.142' } });
  const address = `${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`;
  const clientId = randomUUID();
  const vscode = client(address, t);
  await vscode.open;
  await vscode.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['1.0.0', '0.10.0', '0.9.0'], clientId, clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
  const session = `ahp-session:/${randomUUID()}`;
  const chat = defaultChatOf(session);
  await vscode.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', team: 'delivery', budgetUsd: 1 }, activeClient: { clientId, tools: [] } });
  await vscode.rpc('subscribe', { channel: session });
  await vscode.rpc('subscribe', { channel: chat });

  const thin = 'request_thin';
  await accepted(vscode.dispatch(chat, { type: 'chat/turnStarted', turnId: thin, startedAt: new Date().toISOString(), message: { text: 'test', origin: { kind: 'user' } } }), chat, 'chat/turnStarted');
  const refused = await vscode.until(message => action(message, chat, 'chat/error') && message.params.action.turnId === thin);
  assert.equal(refused.params.action.part.error.errorType, 'objective_too_thin');
  assert.ok(!vscode.inbox.some(message => action(message, session, 'session/creationFailed')), 'VS Code drops session/creationFailed without showing it');
  const reopened = (await vscode.rpc('subscribe', { channel: chat })).snapshot.state;
  assert.deepEqual(reopened.turns.map((turn: Json) => [turn.id, turn.state, turn.responseParts[0].error.errorType]), [[thin, 'error', 'objective_too_thin']]);

  const turnId = 'request_brief';
  await accepted(vscode.dispatch(chat, { type: 'chat/turnStarted', turnId, startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } }), chat, 'chat/turnStarted');
  await vscode.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === turnId);
});

/** VS Code 1.142.0's `isNativeAgentHost` (`agentHostSessionUrisMeta.ts`): `_meta['vscode.agentHost']`, or a non-empty `hostBuild.version` in the root state's `_meta`. */
function isNativeAgentHostOfVscode1142(result: Json): boolean {
  if (result._meta?.['vscode.agentHost'] === true) return true;
  const build = result.snapshots?.find((snapshot: Json) => snapshot.resource === 'ahp-root://')?.state?._meta?.hostBuild;
  return typeof build?.version === 'string' && build.version.length > 0;
}

/** VS Code 1.142.0's `mapProtocolStatus` (`agentHostDiffs.ts`), which the Agents window's session grid shows; `needsInput` is labelled "Needs attention". */
function sessionGridStatusOfVscode1142(status: number): 'needsInput' | 'inProgress' | 'error' | 'completed' {
  if ((status & 24) === 24) return 'needsInput';
  if (status & 8) return 'inProgress';
  if (status & 2) return 'error';
  return 'completed';
}

class DecidingRuntime extends DemoRuntime {
  private release?: () => void;
  override async execute(context: ExecutionContext): Promise<ExecutionResult> {
    if (context.role.mode === 'read') return { summary: 'Reviewed the rounding change.', verdict: 'approve', artifacts: [], costUsd: 0 };
    await this.decided(context, { type: 'permission', data: { nativeId: 'native-permission-1142', kind: 'permission', title: 'Allow the rounding check?', detail: 'node --test test/order.test.js', options: ['once', 'reject'] } });
    await this.decided(context, { type: 'permission', data: { nativeId: 'native-question-1142', kind: 'question', title: 'Which rounding mode?', questions: [{ question: 'Which rounding mode should orders use?', options: ['half-even', 'half-up'] }] } });
    return { summary: 'Fixed rounding after both decisions.', artifacts: [], costUsd: 0 };
  }
  private decided(context: ExecutionContext, event: Parameters<ExecutionContext['emit']>[0]): Promise<void> {
    const answered = new Promise<void>((resolve, reject) => { this.release = resolve; context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true }); });
    context.emit(event);
    return answered;
  }
  async respond(): Promise<void> { this.release?.(); }
}

test('VS Code 1.142.0 attaches: 1.0.0, the session catalog, "Needs attention" for every decision, an envelope for every confirmed dispatch, and a reconnect', { timeout: testTimeout(90_000) }, async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'unfold-ahp-1142-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const server = await application('demo', undefined, new Map<RuntimeKind, AgentRuntime>([['demo', new DecidingRuntime({ dataDir, delayMs: 10 })]]));
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'VS Code 1.142.0' } });
  const address = `${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`;
  const clientId = randomUUID();
  const clientMeta = { 'vscode.telemetryLevel': 0, 'vscode.clientConnectionKind': 'remote', 'vscode.ahpSessionUris': true };
  const vscode = client(address, t);
  const dispatched: Array<{ channel: string; clientSeq: number }> = [];
  let seq = 0;
  const confirmed = (on: AgentHostClient, channel: string, dispatchedAction: Json): Promise<Json> => {
    const clientSeq = ++seq;
    dispatched.push({ channel, clientSeq });
    on.notify('dispatchAction', { channel, clientSeq, action: dispatchedAction });
    return on.until(message => message.method === 'action' && message.params.channel === channel && message.params.origin?.clientId === clientId && message.params.origin.clientSeq === clientSeq);
  };
  const envelopes: Json[] = [];
  vscode.socket.addEventListener('message', event => { const message = JSON.parse(String(event.data)); if (message.method === 'action' && message.params.origin?.clientId === clientId) envelopes.push(message); });
  await vscode.open;

  const initialized = await vscode.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['1.0.0', '0.10.0', '0.9.0'], clientId, clientInfo: vscodeAgentsWindow, _meta: clientMeta, initialSubscriptions: ['ahp-root://'] });
  assert.equal(initialized.protocolVersion, '1.0.0');
  assert.equal(isNativeAgentHostOfVscode1142(initialized), false, 'the host never claims to be a native VS Code host');
  assert.equal(initialized._meta?.['vscode.agentHost'], undefined);
  assert.equal(initialized.snapshots[0].state._meta?.hostBuild, undefined);
  assert.equal(initialized._meta?.['vscode.ahpSessionUris'], true, 'so newAgentHostSessionUri spells sessions ahp-session:/');
  await accepted(confirmed(vscode, 'ahp-root://', { type: 'root/configChanged', config: vscodeConfig }), 'ahp-root://', 'root/configChanged');
  assert.deepEqual((await vscode.rpc('listSessions', { channel: 'ahp-root://' })).items, []);

  const workingDirectory = `${repositoriesDirectory}/order-service`;
  const values = (await vscode.rpc('resolveSessionConfig', { channel: 'ahp-root://', provider: 'unfold', workingDirectory, config: { title: 'Fix rounding from VS Code 1.142' } })).values;
  const session = `ahp-session:/${randomUUID()}`;
  const chat = defaultChatOf(session);
  const activeClient = { clientId, tools: [], customizations: [] };
  assert.deepEqual(await vscode.rpc('createSession', { channel: session, provider: 'unfold', workingDirectories: [workingDirectory], config: values, progressToken: randomUUID(), activeClient }), {});
  const added = await vscode.until(message => message.method === 'root/sessionAdded' && message.params.summary.resource === session);
  assert.equal(added.params.summary.defaultChat, chat);
  assert.deepEqual(added.params.summary.chats.map((entry: Json) => [entry.resource, entry.status]), [[chat, 1]]);
  await vscode.rpc('subscribe', { channel: session });
  await vscode.rpc('subscribe', { channel: chat });
  const rebound = await accepted(confirmed(vscode, session, { type: 'session/configChanged', config: values }), session, 'session/configChanged');
  assert.equal(rebound.params.action.config.repository, 'order-service', 'a provisional rebind reuses the draft');

  const turnId = randomUUID();
  const started = await accepted(confirmed(vscode, chat, { type: 'chat/turnStarted', turnId, startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } }), chat, 'chat/turnStarted');
  assert.equal(started.params.action.turnId, turnId);

  const needsAttention = async (decision: string) => {
    const summary = await summaryOf(vscode, session, changes => changes.status !== undefined && (changes.status & 24) === 24);
    assert.equal(sessionGridStatusOfVscode1142(summary.params.changes.status), 'needsInput', `the session grid says "Needs attention" while ${decision} waits`);
    assert.equal(summary.params.changes.chats[0].status & 24, 24, `the catalog's chat needs input while ${decision} waits`);
    const chatUpdated = await vscode.until(message => action(message, session, 'session/chatUpdated') && (message.params.action.changes.status & 24) === 24);
    assert.equal(chatUpdated.params.action.chat, chat);
    vscode.inbox.length = 0;
  };
  const ready = await vscode.until(message => action(message, chat, 'chat/toolCallReady') && message.params.action.confirmationTitle === 'Allow the rounding check?');
  await vscode.until(message => action(message, session, 'session/inputNeededSet') && message.params.action.request.kind === 'toolConfirmation');
  await needsAttention('a permission');
  await accepted(confirmed(vscode, chat, { type: 'chat/toolCallConfirmed', turnId: ready.params.action.turnId, toolCallId: ready.params.action.toolCallId, approved: true, confirmed: 'user-action', selectedOptionId: 'once' }), chat, 'chat/toolCallConfirmed');

  const asked = await vscode.until(message => action(message, chat, 'chat/inputRequested'));
  await vscode.until(message => action(message, session, 'session/inputNeededSet') && message.params.action.request.kind === 'chatInput');
  await needsAttention('a question');
  await accepted(confirmed(vscode, chat, { type: 'chat/inputCompleted', requestId: asked.params.action.request.id, response: 'accept', answers: { '0': { state: 'submitted', value: { kind: 'selected', value: '0' } } } }), chat, 'chat/inputCompleted');
  await vscode.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === turnId);
  const settled = await summaryOf(vscode, session, changes => changes.status !== undefined && (changes.status & 31) === 1);
  assert.equal(sessionGridStatusOfVscode1142(settled.params.changes.status), 'completed');

  vscode.inbox.length = 0;
  const choiceId = randomUUID();
  server.app.store.appendEvent(server.app.store.listSessions()[0].id, choiceEvents.offered, 'system', { choiceId, title: 'What next?', question: 'What should happen next?', explanation: 'Nothing runs until you choose.', detail: '- **Leave it for now**: nothing changes.', options: [{ id: 'dismiss', label: 'Leave it for now' }] });
  await vscode.until(message => action(message, chat, 'chat/inputRequested') && message.params.action.request.id === choiceId);
  await vscode.until(message => action(message, session, 'session/inputNeededSet') && message.params.action.request.id === choiceId && message.params.action.request.kind === 'chatInput');
  await needsAttention('a choice');
  const listed = (await vscode.rpc('listSessions', { channel: 'ahp-root://' })).items;
  assert.equal(sessionGridStatusOfVscode1142(listed[0].status), 'needsInput', 'listSessions agrees while the choice waits');
  await accepted(confirmed(vscode, chat, { type: 'chat/inputCompleted', requestId: choiceId, response: 'accept', answers: { '0': { state: 'submitted', value: { kind: 'selected', value: 'dismiss' } } } }), chat, 'chat/inputCompleted');
  const answered = await summaryOf(vscode, session, changes => changes.status !== undefined && (changes.status & 31) === 1);
  await vscode.until(message => action(message, session, 'session/inputNeededRemoved') && message.params.action.id === choiceId);
  assert.equal(sessionGridStatusOfVscode1142(answered.params.changes.status), 'completed', 'answering the choice clears "Needs attention"');

  const refused = await confirmed(vscode, chat, { type: 'chat/turnStarted', turnId: randomUUID(), startedAt: new Date().toISOString(), message: { text: 'One more thing', origin: { kind: 'user' } } });
  assert.ok(refused.params.rejectionReason, 'a refused turn is answered too, so dispatchConfirmed never waits forever');
  await accepted(confirmed(vscode, chat, { type: 'chat/isReadChanged', isRead: true }), chat, 'chat/isReadChanged');
  await accepted(confirmed(vscode, session, { type: 'session/isReadChanged', isRead: true }), session, 'session/isReadChanged');
  await accepted(confirmed(vscode, chat, { type: 'chat/isArchivedChanged', isArchived: true }), chat, 'chat/isArchivedChanged');
  await accepted(confirmed(vscode, session, { type: 'session/isArchivedChanged', isArchived: true }), session, 'session/isArchivedChanged');
  await accepted(confirmed(vscode, session, { type: 'session/titleChanged', title: 'Rounding, decided' }), session, 'session/titleChanged');
  await summaryOf(vscode, session, changes => changes.title === 'Rounding, decided');
  const conversation = JSON.stringify(vscode.inbox);
  vscode.close();
  for (const { channel, clientSeq } of dispatched) assert.equal(envelopes.filter(message => message.params.origin.clientSeq === clientSeq && message.params.channel === channel).length, 1, `clientSeq ${clientSeq} on ${channel} gets exactly one echo or rejection`);

  const reconnecting = client(address, t);
  await reconnecting.open;
  const again = await reconnecting.rpc('reconnect', { channel: 'ahp-root://', clientId, lastSeenServerSeq: started.params.serverSeq, subscriptions: ['ahp-root://', session, chat], _meta: clientMeta });
  assert.equal(again.type, 'snapshot');
  const [root, sessionState, chatState] = again.snapshots.map((snapshot: Json) => snapshot.state);
  assert.equal(root._meta?.hostBuild, undefined);
  assert.equal(sessionState.status & (read | archived), read | archived);
  assert.equal(sessionState.defaultChat, chat);
  assert.equal(sessionState.chats.find((entry: Json) => entry.resource === chat).status & (read | archived), read | archived);
  assert.equal(chatState.status & (read | archived), read | archived);
  assert.equal(chatState.turns[0].id, turnId);
  const catalog = (await reconnecting.rpc('listSessions', { channel: 'ahp-root://' })).items;
  assert.deepEqual(catalog.map((item: Json) => [item.resource, item.defaultChat, item.chats.map((entry: Json) => [entry.resource, entry.status & (read | archived)])]), [[session, chat, [[chat, read | archived]]]]);

  assert.ok(!(conversation + JSON.stringify(again)).includes(`unfold:/${session.slice('ahp-session:/'.length)}`));
});

test('VS Code 1.141 attaches: unfold URIs, the 0.10.0 offer negotiated down to 0.9.0, and session read and archive marks', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'VS Code 1.141' } });
  const address = `${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`;
  const clientId = randomUUID();
  const vscode = client(address, t);
  await vscode.open;
  const initialized = await vscode.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.10.0', '0.9.0', '0.7.0', '0.6.0', '0.5.2', '0.5.1'], clientId, clientInfo: vscodeAgentsWindow, _meta: { 'vscode.clientConnectionKind': 'remote' }, initialSubscriptions: ['ahp-root://'] });
  assert.equal(initialized.protocolVersion, '0.9.0');
  assert.equal(initialized._meta, undefined);
  await accepted(vscode.dispatch('ahp-root://', { type: 'root/configChanged', config: vscodeConfig }), 'ahp-root://', 'root/configChanged');
  assert.equal((await vscode.rpc('getNetworkDiagnosticsInfo', {})).arch, process.arch);

  const id = randomUUID();
  const session = `unfold:/${id}`;
  const chat = defaultChatOf(session);
  await vscode.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', team: 'delivery', budgetUsd: 1, title: 'Fix rounding from VS Code 1.141' } });
  await vscode.until(message => message.method === 'root/sessionAdded' && message.params.summary.resource === session);
  assert.equal((await vscode.rpc('subscribe', { channel: session })).snapshot.state.defaultChat, chat);
  await vscode.rpc('subscribe', { channel: chat });
  const turnId = randomUUID();
  await accepted(vscode.dispatch(chat, { type: 'chat/turnStarted', turnId, startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } }), chat, 'chat/turnStarted');
  await vscode.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === turnId);
  await summaryOf(vscode, session, changes => changes.status === 1);

  await accepted(vscode.dispatch(session, { type: 'session/isReadChanged', isRead: true }), session, 'session/isReadChanged');
  await summaryOf(vscode, session, changes => (changes.status & read) === read);
  await accepted(vscode.dispatch(session, { type: 'session/isArchivedChanged', isArchived: true }), session, 'session/isArchivedChanged');
  vscode.inbox.length = 0;
  await accepted(vscode.dispatch(chat, { type: 'session/titleChanged', title: 'Rounding, filed' }), chat, 'session/titleChanged');
  await vscode.until(message => action(message, session, 'session/titleChanged') && message.params.action.title === 'Rounding, filed');
  const updated = await summaryOf(vscode, session, changes => changes.title === 'Rounding, filed' && changes.status !== undefined);
  assert.equal(updated.params.changes.status & (read | archived), read | archived, 'a summary update keeps both marks');
  const listed = (await vscode.rpc('listSessions', { channel: 'ahp-root://' })).items;
  assert.deepEqual(listed.map((item: Json) => [item.resource, item.status & (read | archived)]), [[session, read | archived]]);
  assert.ok(!JSON.stringify(vscode.inbox).includes(`ahp-session:/${id}`), 'a 1.141 client never sees the ahp-session spelling');
});

function resolveAgentAuthRequirementOfVscode1141(agent: Json): 'github' | 'none' | 'unusable' {
  const copilot = (agent.protectedResources ?? []).some((resource: Json) => /githubcopilot|api\.github\.com/.test(String(resource.resource)));
  if (!agent.protectedResources || copilot) return 'github';
  return agent.models.length > 0 ? 'none' : 'unusable';
}

test('the agent declares no protected resource, so VS Code 1.141 does not gate Unfold behind GitHub sign-in', async t => {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'VS Code 1.141 auth' } });
  const vscode = client(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`, t);
  await vscode.open;
  const initialized = await vscode.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: randomUUID(), clientInfo: vscodeAgentsWindow, initialSubscriptions: ['ahp-root://'] });
  const [agent] = initialized.snapshots[0].state.agents;
  assert.deepEqual(agent.protectedResources, [], 'the connection token already authenticated the person');
  assert.ok(agent.models.length > 0);
  assert.equal(resolveAgentAuthRequirementOfVscode1141(agent), 'none');
  assert.equal(resolveAgentAuthRequirementOfVscode1141({ ...agent, protectedResources: undefined }), 'github', 'without the field VS Code would ask for Copilot');
});

test('repository folders are named after their forge path and projects Unfold · <folder>, with the id only when two share a name', () => {
  const repository = (id: string, url: string) => ({ id, name: id, description: '', url, baseBranch: 'main', verify: [] });
  const repositories = [
    repository('unfold', 'https://forgejo.webgrip.dev/webgrip/unfold.git'),
    repository('api', 'ssh://git@forge.example/team/service/'),
    repository('web', 'https://forge.example/team/service'),
    repository('order-service', '/srv/fixtures/order-service/'),
    repository('twente-dev', 'https://forgejo.webgrip.dev/webgrip/twente.dev.git'),
  ];
  assert.deepEqual([...repositoryFolderNames(repositories).values()], ['unfold', 'service (api)', 'service (web)', 'order-service', 'twente.dev']);
  assert.deepEqual([...repositoryWorkspaceNames(repositories).values()], ['Unfold · unfold', 'Unfold · service (api)', 'Unfold · service (web)', 'Unfold · order-service', 'Unfold · twente.dev']);
});

test('the Agents window\'s workspace picker offers each repository, and picking one starts the session on it under a clear label', async t => {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'VS Code workspace picker' } });
  const vscode = client(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`, t);
  await vscode.open;
  const initialized = await vscode.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: randomUUID(), clientInfo: vscodeAgentsWindow, initialSubscriptions: ['ahp-root://'] });
  assert.equal(initialized.defaultDirectory, repositoriesDirectory, 'VS Code lists this folder in the Workspace picker');
  const listed = await vscode.rpc('resourceList', { channel: 'ahp-root://', uri: repositoriesDirectory });
  assert.deepEqual(listed.entries, [{ name: 'order-service', type: 'directory' }]);
  assert.deepEqual((await vscode.rpc('resourceList', { channel: 'ahp-root://', uri: 'file:///' })).entries, [{ name: 'unfold-repositories', type: 'directory' }]);
  await assert.rejects(vscode.rpc('resourceList', { channel: 'ahp-root://', uri: 'file:///etc' }), (error: any) => error.code === -32008, 'the host filesystem is not browsable');

  const picked = `${repositoriesDirectory}/${encodeURIComponent(listed.entries[0].name)}`;
  const resolved = await vscode.rpc('resolveSessionConfig', { channel: 'ahp-root://', provider: 'unfold', workingDirectory: picked, config: { repository: 'stale-choice', title: 'From the picker' } });
  assert.equal(resolved.values.repository, 'order-service', 'the picked folder decides the repository');
  const session = `unfold:/${randomUUID()}`;
  assert.deepEqual(await vscode.rpc('createSession', { channel: session, provider: 'unfold', workingDirectories: [picked], config: { ...resolved.values, repository: 'stale-choice' } }), {});
  const added = await vscode.until(message => message.method === 'root/sessionAdded' && message.params.summary.resource === session);
  const project = added.params.summary.project;
  assert.equal(project.displayName, 'Unfold · order-service');
  assert.equal(`${project.displayName} [Unfold]`, 'Unfold · order-service [Unfold]', 'VS Code 1.141 labels the session group `<project> [<host entry name>]`');
  assert.equal(added.params.summary.workingDirectories, undefined, 'no host path is exposed');
});

test('VS Code 1.142\'s folder picker browses to a repository through resourceResolve and resourceList, and starts the session in it', async t => {
  const server = await application();
  t.after(() => server.close());
  const logged: string[] = [];
  const log = t.mock.method(console, 'error', (line: unknown) => { logged.push(String(line)); });
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'VS Code 1.142 folder picker' } });
  const vscode = client(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`, t);
  await vscode.open;
  const initialized = await vscode.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: randomUUID(), clientInfo: vscodeAgentsWindow, initialSubscriptions: ['ahp-root://'] });
  const root = 'ahp-root://';
  const stat = (uri: string) => vscode.rpc('resourceResolve', { channel: root, uri });
  const list = async (uri: string) => (await vscode.rpc('resourceList', { channel: root, uri })).entries as Json[];

  assert.deepEqual(await stat(initialized.defaultDirectory), { uri: repositoriesDirectory, type: 'directory' }, 'the picker opens on the default directory only once it resolves');
  assert.deepEqual(await list('file:///'), [{ name: 'unfold-repositories', type: 'directory' }]);
  assert.deepEqual(await stat('file:///'), { uri: 'file:///', type: 'directory' });
  assert.deepEqual(await stat('file:///unfold-repositories/'), { uri: 'file:///unfold-repositories/', type: 'directory' }, 'a typed trailing slash resolves');
  const folders = await list('file:///unfold-repositories/');
  assert.deepEqual(folders, [{ name: 'order-service', type: 'directory' }], 'a folder name a person can type');
  const picked = `${repositoriesDirectory}/${folders[0].name}`;
  assert.deepEqual(await stat(picked), { uri: picked, type: 'directory' });
  assert.deepEqual(await list(picked), []);
  const legacy = `${repositoriesDirectory}/${encodeURIComponent('Unfold · order-service')}`;
  assert.deepEqual(await stat(legacy), { uri: legacy, type: 'directory' }, 'a working directory picked under the earlier name still resolves');
  for (const missing of ['file:///unfold-repositories/unfold-repositories', 'file:///etc', 'file:///unfold-repositories/../etc', 'vscode-agent-host://x/file/-/unfold-repositories']) {
    await assert.rejects(stat(missing), (error: any) => error.code === -32008, `${missing} does not exist`);
    await assert.rejects(list(missing), (error: any) => error.code === -32008, `${missing} is not listed`);
  }

  const session = `ahp-session:/${randomUUID()}`;
  assert.deepEqual(await vscode.rpc('createSession', { channel: session, provider: 'unfold', workingDirectories: [picked], config: { title: 'Picked in the folder dialog' } }), {});
  const added = await vscode.until(message => message.method === 'root/sessionAdded' && message.params.summary.title === 'Picked in the folder dialog');
  assert.equal(added.params.summary.project.displayName, 'Unfold · order-service', 'the picked folder decides the repository');
  const legacySession = `ahp-session:/${randomUUID()}`;
  await vscode.rpc('createSession', { channel: legacySession, provider: 'unfold', workingDirectories: [legacy], config: { title: 'Picked under the earlier name' } });
  assert.equal((await vscode.until(message => message.method === 'root/sessionAdded' && message.params.summary.title === 'Picked under the earlier name')).params.summary.project.displayName, 'Unfold · order-service');

  await assert.rejects(vscode.rpc('resourceMkdir', { channel: root, uri: picked }), (error: any) => error.code === -32009, 'a write is refused, not unknown');
  await assert.rejects(vscode.rpc('vscode/notYetSpecified', { channel: root }), (error: any) => error.code === -32601);
  log.mock.restore();
  const unanswered = logged.map(line => { try { return JSON.parse(line); } catch { return undefined; } }).filter(entry => entry?.event === 'agent_host.unanswered_request');
  assert.ok(unanswered.some(entry => entry.method === 'resourceResolve' && entry.path === '/etc'), 'a path the host cannot answer is logged');
  assert.ok(unanswered.some(entry => entry.method === 'vscode/notYetSpecified' && entry.path === undefined), 'an unknown method is logged by name');
  assert.ok(!unanswered.some(entry => entry.method === 'resourceMkdir'), 'a refused write is answered, so it is not logged as unanswered');
  assert.ok(!unanswered.some(entry => JSON.stringify(entry).includes(issued.body.token)), 'no token is logged');
});
