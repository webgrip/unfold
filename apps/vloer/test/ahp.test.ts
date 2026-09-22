import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { application, login, request } from './api-support.ts';
import { diffEntries } from '../src/ahp/host.ts';

type Json = Record<string, any>;

function connect(url: string) {
  const socket = new WebSocket(url);
  const inbox: Json[] = [];
  const waiters: Array<{ predicate: (message: Json) => boolean; resolve: (message: Json) => void }> = [];
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: Json) => void; reject: (error: Error) => void }>();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined && pending.has(message.id)) {
      const waiter = pending.get(message.id)!; pending.delete(message.id);
      if (message.error) waiter.reject(Object.assign(new Error(message.error.message), { code: message.error.code, data: message.error.data })); else waiter.resolve(message.result);
      return;
    }
    inbox.push(message);
    for (const waiter of [...waiters]) if (waiter.predicate(message)) { waiters.splice(waiters.indexOf(waiter), 1); waiter.resolve(message); }
  });
  const open = new Promise<void>((resolve, reject) => { socket.addEventListener('open', () => resolve()); socket.addEventListener('error', () => reject(new Error('connection refused'))); });
  return {
    socket, inbox, open,
    rpc(method: string, params: Json): Promise<Json> { const id = nextId++; socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params })); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); },
    notify(method: string, params: Json) { socket.send(JSON.stringify({ jsonrpc: '2.0', method, params })); },
    until(predicate: (message: Json) => boolean, timeoutMs = 25_000): Promise<Json> {
      const existing = inbox.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`timed out waiting for a message; seen: ${inbox.map(message => `${message.method}:${message.params?.action?.type ?? message.params?.channel ?? ''}`).join(', ')}`)), timeoutMs); waiters.push({ predicate, resolve: message => { clearTimeout(timer); resolve(message); } }); });
    },
    close() { socket.close(); },
  };
}

const action = (message: Json, channel: string, type: string) => message.method === 'action' && message.params.channel === channel && message.params.action.type === type;

test('the agent host speaks AHP 0.9: initialize, create a session from a chat, stream the crew, share state with a second client and expose the candidate as a changeset', { timeout: 60_000 }, async t => {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'test' } });
  assert.equal(issued.status, 201, issued.text);
  const address = server.url.replace(/^http/, 'ws');
  assert.equal(issued.body.vscodeSetting.key, 'chat.remoteAgentHosts');
  const info = await request(server.url, '/api/agent-host');
  assert.equal(info.body.protocolVersion, '0.9.0');

  const refused = connect(`${address}/?tkn=not-a-real-token-value`);
  await assert.rejects(refused.open);

  const alice = connect(`${address}/?tkn=${issued.body.token}`);
  t.after(() => alice.close());
  await alice.open;
  await assert.rejects(alice.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.5.0'], clientId: 'old' }), (error: any) => error.code === -32005 && Array.isArray(error.data.supportedVersions));
  const initialized = await alice.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'alice', clientInfo: { name: 'test' }, initialSubscriptions: ['ahp-root://'] });
  assert.equal(initialized.protocolVersion, '0.9.0');
  assert.equal(initialized.snapshots[0].state.agents[0].provider, 'de-vloer');
  assert.deepEqual(await alice.rpc('ping', { channel: 'ahp-root://' }), {});
  const resolved = await alice.rpc('resolveSessionConfig', { channel: 'ahp-root://' });
  assert.ok(resolved.schema.properties.repository.enum.includes('order-service'));
  assert.equal(resolved.values.crew, 'delivery');

  const sessionUri = `ahp-session:/${randomUUID()}`;
  const chatUri = `ahp-chat:/${randomUUID()}`;
  assert.deepEqual(await alice.rpc('createSession', { channel: sessionUri, provider: 'de-vloer', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Agent host demo' } }), {});
  await alice.until(message => action(message, sessionUri, 'session/ready'));
  await alice.until(message => message.method === 'root/sessionAdded' && message.params.summary.resource === sessionUri);
  await assert.rejects(alice.rpc('createSession', { channel: sessionUri }), (error: any) => error.code === -32003);
  assert.deepEqual(await alice.rpc('createChat', { channel: sessionUri, chat: chatUri, initialMessage: { text: 'Reproduce the rounding regression and fix it with the tests intact.', origin: { kind: 'user' } } }), {});
  const added = await alice.until(message => message.method === 'root/sessionAdded' && message.params.summary.resource !== sessionUri);
  const realSession: string = added.params.summary.resource;
  const realChat = realSession.replace('ahp-session:/', 'ahp-chat:/');
  const started = await alice.until(message => action(message, realChat, 'chat/turnStarted'));
  assert.equal(started.params.action.message.text, 'Reproduce the rounding regression and fix it with the tests intact.');
  assert.equal(started.params.origin.clientId, 'alice');
  const complete = await alice.until(message => action(message, realChat, 'chat/turnComplete'));
  assert.equal(typeof complete.params.serverSeq, 'number');
  const parts = alice.inbox.filter(message => action(message, realChat, 'chat/responsePart')).map(message => message.params.action.part);
  assert.ok(parts.some(part => part.kind === 'systemNotification' && /started/.test(part.content)));
  assert.ok(parts.some(part => part.kind === 'markdown' && /completed/.test(part.content)));
  assert.ok(alice.inbox.some(message => action(message, realSession, 'session/chatUpdated')));

  const bob = connect(`${address}/?tkn=${issued.body.token}`);
  t.after(() => bob.close());
  await bob.open;
  const bobInit = await bob.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'bob', initialSubscriptions: ['ahp-root://'] });
  assert.equal(bobInit.snapshots[0].state.activeSessions, 0);
  const listed = await bob.rpc('listSessions', { channel: 'ahp-root://' });
  assert.ok(listed.items.some((item: Json) => item.resource === realSession && item.title === 'Agent host demo'));
  const subscribed = await bob.rpc('subscribe', { channel: realChat });
  assert.equal(subscribed.snapshot.state.turns.at(-1).state, 'complete');
  assert.ok(subscribed.snapshot.state.turns.at(-1).responseParts.length > 2);
  const sessionSnapshot = await bob.rpc('subscribe', { channel: realSession });
  assert.equal(sessionSnapshot.snapshot.state.lifecycle, 'ready');
  assert.equal(sessionSnapshot.snapshot.state.defaultChat, realChat);
  assert.equal(sessionSnapshot.snapshot.state.changesets[0].uriTemplate, realSession.replace('ahp-session:/', 'ahp-changeset:/'));
  const changeset = await bob.rpc('subscribe', { channel: realSession.replace('ahp-session:/', 'ahp-changeset:/') });
  assert.equal(changeset.snapshot.state.status, 'ready');
  assert.ok(changeset.snapshot.state.files.length > 0);
  const contentUri = changeset.snapshot.state.files[0].edit.after.content.uri;
  const read = await bob.rpc('resourceRead', { channel: 'ahp-root://', uri: contentUri });
  assert.match(read.data, /^diff --git/);
  await assert.rejects(bob.rpc('resourceRead', { channel: 'ahp-root://', uri: 'vloer-diff://nope/0/0/after' }), (error: any) => error.code === -32008);

  bob.notify('dispatchAction', { channel: realChat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 't', startedAt: new Date().toISOString(), message: { text: 'again', origin: { kind: 'user' } } } });
  const rejected = await bob.until(message => action(message, realChat, 'chat/turnStarted') && message.params.rejectionReason);
  assert.match(rejected.params.rejectionReason, /ended/);
  const aliceSaw = await alice.until(message => action(message, realChat, 'chat/turnStarted') && message.params.origin?.clientId === 'bob');
  assert.equal(aliceSaw.params.serverSeq, rejected.params.serverSeq, 'both clients receive the same envelope');
  await assert.rejects(alice.rpc('noSuchMethod', { channel: 'ahp-root://' }), (error: any) => error.code === -32601);
  await delay(50);
});

test('unified diff artifacts become changeset files when no native diff is available', () => {
  const entries = diffEntries('diff --git a/src/a.js b/src/a.js\n--- a/src/a.js\n+++ b/src/a.js\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -0,0 +1 @@\n+hello\n');
  assert.deepEqual(entries.map(entry => [entry.file, entry.additions, entry.deletions]), [['src/a.js', 1, 1], ['README.md', 1, 0]]);
  assert.deepEqual(diffEntries('[{"file":"x","before":"a","after":"b"}]').map(entry => entry.file), ['x']);
});

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const closed = (socket: WebSocket) => new Promise<number>(resolve => { if (socket.readyState === WebSocket.CLOSED) resolve(1006); else socket.addEventListener('close', event => resolve(event.code), { once: true }); });

test('agent host tokens expire without use, renew when used and are rejected afterwards', async t => {
  const server = await application('live');
  t.after(() => server.close());
  const auth = await login(server.url);
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie: auth.cookie, body: { label: 'lifetime' } });
  assert.equal(issued.status, 201, issued.text);
  const address = `${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`;
  const key = `ahp-token:${sha256(issued.body.token)}`;
  const store = server.app.store;
  const lifetimeMs = server.config.auth.sessionHours * 3_600_000;
  const first = store.getSecret<{ expiresAt: string }>(key)!;
  assert.ok(Math.abs(Date.parse(first.expiresAt) - (Date.now() + lifetimeMs)) < 10_000, 'a new token carries a bounded lifetime');

  store.setSecret(key, { ...first, expiresAt: new Date(Date.now() + 120_000).toISOString() });
  const used = connect(address);
  t.after(() => used.close());
  await used.open;
  assert.deepEqual(await used.rpc('ping', { channel: 'ahp-root://' }), {});
  const renewed = store.getSecret<{ expiresAt: string }>(key)!;
  assert.ok(Date.parse(renewed.expiresAt) > Date.now() + lifetimeMs - 10_000, 'use renews the lifetime');

  store.setSecret(key, { ...renewed, expiresAt: new Date(Date.now() - 1000).toISOString() });
  const ending = closed(used.socket);
  used.notify('ping', { channel: 'ahp-root://' });
  assert.equal(await ending, 1008, 'an expired token closes its open connection on next use');
  assert.equal(store.getSecret(key), undefined, 'an expired token is revoked');
  await assert.rejects(connect(address).open);
});

test('signing out or the end of the issuing sign-in revokes agent host tokens and closes their connections', async t => {
  const server = await application('live');
  t.after(() => server.close());
  const store = server.app.store;
  const address = (token: string) => `${server.url.replace(/^http/, 'ws')}/?tkn=${token}`;

  const signedOut = await login(server.url);
  const other = await login(server.url);
  const revokedToken = (await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie: signedOut.cookie, body: {} })).body.token;
  const keptToken = (await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie: other.cookie, body: {} })).body.token;
  const attached = connect(address(revokedToken));
  t.after(() => attached.close());
  await attached.open;
  const ending = closed(attached.socket);
  assert.equal((await request(server.url, '/api/logout', { method: 'POST', cookie: signedOut.cookie })).status, 200);
  assert.equal(await ending, 1008, 'signing out closes the connection immediately');
  assert.equal(store.getSecret(`ahp-token:${sha256(revokedToken)}`), undefined);
  await assert.rejects(connect(address(revokedToken)).open);
  const kept = connect(address(keptToken));
  t.after(() => kept.close());
  await kept.open;
  assert.deepEqual(await kept.rpc('ping', { channel: 'ahp-root://' }), {}, 'another sign-in keeps its own tokens');

  const signIn = sha256(other.cookie.slice(other.cookie.indexOf('=') + 1));
  const record = store.getLogin(signIn)!;
  store.deleteLogin(signIn);
  store.createLogin(signIn, record.userId, new Date(Date.now() - 1000).toISOString());
  const expiring = closed(kept.socket);
  kept.notify('ping', { channel: 'ahp-root://' });
  assert.equal(await expiring, 1008, 'a token ends with the sign-in session that issued it');
  assert.equal(store.getSecret(`ahp-token:${sha256(keptToken)}`), undefined);
  await assert.rejects(connect(address(keptToken)).open);
});
