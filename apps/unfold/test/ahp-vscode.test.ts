import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, vscodeAgentsWindow, type AgentHostClient, type Json } from './ahp-support.ts';
import { repositoriesDirectory, repositoryWorkspaceNames } from '../src/ahp/host.ts';
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
  assert.equal(initialized.protocolVersion, '0.9.0');
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
  assert.ok(!(conversation + JSON.stringify(reconnecting.inbox) + JSON.stringify(again)).includes(`unfold:/${session.slice('ahp-session:/'.length)}`), 'the provider spelling never reaches a client that declared ahp-session URIs');
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
  await vscode.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Fix rounding from VS Code 1.141' } });
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

test('repositories are named Unfold · <repository> after their forge path, with the id only when two share a name', () => {
  const repository = (id: string, url: string) => ({ id, name: id, description: '', url, baseBranch: 'main', verify: [] });
  const names = repositoryWorkspaceNames([
    repository('unfold', 'https://forgejo.webgrip.dev/webgrip/unfold.git'),
    repository('api', 'ssh://git@forge.example/team/service/'),
    repository('web', 'https://forge.example/team/service'),
    repository('order-service', '/srv/fixtures/order-service/'),
  ]);
  assert.deepEqual([...names.values()], ['Unfold · unfold', 'Unfold · service (api)', 'Unfold · service (web)', 'Unfold · order-service']);
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
  assert.deepEqual(listed.entries, [{ name: 'Unfold · order-service', type: 'directory' }]);
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
