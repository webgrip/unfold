import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, vscodeChangesets, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';

const objective = 'Reproduce the rounding regression and fix it with the tests intact.';

async function finishedThroughAgentHost(t: { after: (fn: () => unknown) => void }) {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'rendering' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'rendering', clientInfo: { name: 'vscode', version: '1.142.0' }, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
  const id = randomUUID();
  const session = `ahp-session:/${id}`;
  const chat = defaultChatOf(session);
  await client.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Rendering' } });
  for (const channel of [session, chat]) await client.rpc('subscribe', { channel });
  client.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'rendering-turn', startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } } });
  await client.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === 'rendering-turn');
  return { server, client, id, session, chat, changeset: `ahp-changeset:/${id}` };
}

test('C8: the candidate is a session changeset on the chat, so VS Code instantiates it and selects it for the Changes view', { timeout: testTimeout(60_000) }, async t => {
  const { client, session, chat, changeset } = await finishedThroughAgentHost(t);
  const advertised = await client.until(message => action(message, chat, 'chat/changesetsChanged') && message.params.action.changesets?.length);
  assert.equal(advertised.params.action.changesets[0].changeKind, 'session');
  const sessionState = (await client.rpc('subscribe', { channel: session })).snapshot.state;
  const chatState = (await client.rpc('subscribe', { channel: chat })).snapshot.state;
  const shown = vscodeChangesets(chatState, sessionState);
  assert.equal(shown.length, 1, 'VS Code keeps the candidate instead of dropping an unknown change kind');
  assert.equal(shown[0].changeKind, 'session');
  assert.equal(shown[0].uriTemplate, changeset);
  assert.equal(shown[0].label, 'Candidate');
  assert.deepEqual(sessionState.changesets, chatState.changesets, 'the session and its chat advertise the same catalogue');
});
