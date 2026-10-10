import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { application, request } from './api-support.ts';
import { isActionKnownToVersion } from '../src/ahp/versions.ts';
import { testTimeout } from './timeframes.ts';
import { action, closed, connect, defaultChatOf, vscodeAgentsWindow, type Json } from './ahp-support.ts';

const vscode141Offer = ['0.10.0', '0.9.0', '0.7.0', '0.6.0', '0.5.2', '0.5.1'];
const vscodeMainOffer = ['1.0.0', '0.10.0', '0.9.0'];
const isRead = 32;
const catalogFields = (value: Json | undefined) => value !== undefined && ('chats' in value || 'defaultChat' in value);

test('one host answers a VS Code 1.141 window in 0.9 and a VS Code main window in 1.0, and only the 1.0 client sees the chat catalog', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'versions' } });
  const address = `${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`;
  const info = await request(server.url, '/api/agent-host');
  assert.equal(info.body.protocolVersion, '1.0.0');
  assert.deepEqual(info.body.protocolVersions, ['1.0.0', '0.9.0']);

  const refused = connect(address);
  t.after(() => refused.close());
  await refused.open;
  const refusedClosed = closed(refused.socket);
  await assert.rejects(refused.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['2.0.0', '0.10.0', '0.8.99'], clientId: 'too-new' }), (error: any) => error.code === -32005 && JSON.stringify(error.data.supportedVersions) === JSON.stringify(['^1.0.0', '^0.9.0']));
  assert.equal(await refusedClosed, 1000);

  const legacy = connect(address);
  t.after(() => legacy.close());
  await legacy.open;
  const legacyInit = await legacy.rpc('initialize', { channel: 'ahp-root://', protocolVersions: vscode141Offer, clientId: 'vscode-1.141', clientInfo: { ...vscodeAgentsWindow, version: '1.141.0' }, initialSubscriptions: ['ahp-root://'] });
  assert.equal(legacyInit.protocolVersion, '0.9.0', 'VS Code 1.141 keeps working in 0.9');

  const current = connect(address);
  t.after(() => current.close());
  await current.open;
  const currentInit = await current.rpc('initialize', { channel: 'ahp-root://', protocolVersions: vscodeMainOffer, clientId: 'vscode-main', clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
  assert.equal(currentInit.protocolVersion, '1.0.0', 'VS Code main gets the highest version both share');

  const id = randomUUID();
  const session = `ahp-session:/${id}`;
  const chat = defaultChatOf(session);
  await current.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Two baselines' } });
  const added = await current.until(message => message.method === 'root/sessionAdded' && message.params.summary.resource === session);
  assert.equal(added.params.summary.defaultChat, chat);
  assert.deepEqual(added.params.summary.chats.map((entry: Json) => entry.resource), [chat]);
  assert.equal(typeof added.params.summary.chats[0].status, 'number');
  const legacyAdded = await legacy.until(message => message.method === 'root/sessionAdded' && message.params.summary.resource === `unfold:/${id}`);
  assert.equal(catalogFields(legacyAdded.params.summary), false, 'a 0.9 client never sees SessionSummary.chats or defaultChat');

  await current.rpc('subscribe', { channel: chat });
  current.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'two-baselines', startedAt: new Date().toISOString(), message: { text: 'Reproduce the rounding regression and fix it with the tests intact.', origin: { kind: 'user' } } } });
  await current.until(message => action(message, chat, 'chat/turnComplete'));

  const listed = (await current.rpc('listSessions', { channel: 'ahp-root://' })).items.find((item: Json) => item.resource === session);
  assert.deepEqual(listed.chats, [{ resource: chat, title: listed.title, origin: { kind: 'user' }, interactivity: listed.chats[0].interactivity, status: listed.chats[0].status, ...(listed.changes ? { changes: listed.changes } : {}) }]);
  assert.equal(listed.defaultChat, chat);
  const legacyListed = (await legacy.rpc('listSessions', { channel: 'ahp-root://' })).items.find((item: Json) => item.resource === `unfold:/${id}`);
  assert.ok(legacyListed);
  assert.equal(catalogFields(legacyListed), false);

  current.notify('dispatchAction', { channel: chat, clientSeq: 2, action: { type: 'chat/isReadChanged', isRead: true } });
  const marked = await current.until(message => message.method === 'root/sessionSummaryChanged' && message.params.session === session && Boolean(message.params.changes.chats?.[0]?.status & isRead));
  assert.equal(marked.params.changes.defaultChat, chat);
  assert.equal(marked.params.changes.chats[0].resource, chat, 'the chat status bits reach the 1.0 catalog');
  current.notify('dispatchAction', { channel: chat, clientSeq: 3, action: { type: 'chat/isArchivedChanged', isArchived: true } });
  await current.until(message => message.method === 'root/sessionSummaryChanged' && message.params.session === session && Boolean(message.params.changes.chats?.[0]?.status & 64));

  const resumed = connect(address);
  t.after(() => resumed.close());
  current.close();
  await resumed.open;
  await resumed.rpc('reconnect', { channel: 'ahp-root://', clientId: 'vscode-main', lastSeenServerSeq: 0, subscriptions: ['ahp-root://'], _meta: { 'vscode.ahpSessionUris': true } });
  const relisted = (await resumed.rpc('listSessions', { channel: 'ahp-root://' })).items.find((item: Json) => item.resource === session);
  assert.equal(relisted.defaultChat, chat, 'a reconnecting client keeps the version it negotiated');

  for (const message of legacy.inbox) {
    if (message.method === 'action') assert.ok(isActionKnownToVersion(message.params.action.type, '0.9.0'), message.params.action.type);
    if (message.method?.startsWith('root/')) assert.equal(catalogFields(message.params.summary) || catalogFields(message.params.changes), false, JSON.stringify(message));
  }
});
