import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { application, login, request } from './api-support.ts';
import { chatChannel, diffEntries, parseChannel } from '../src/ahp/host.ts';
import { settle, testTimeout } from './timeframes.ts';
import { action, closed, connect, defaultChatOf, type Json } from './ahp-support.ts';

test('the agent host speaks AHP 0.9: initialize, create a session from a chat, stream the crew, share state with a second client and expose the candidate as a changeset', { timeout: testTimeout(60_000) }, async t => {
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

  const stale = connect(`${address}/?tkn=${issued.body.token}`);
  t.after(() => stale.close());
  await stale.open;
  await assert.rejects(stale.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9', '0.9.0'], clientId: 'malformed' }), (error: any) => error.code === -32602 && /0\.9/.test(error.message), 'a malformed offer is an explicit error');
  const staleClosed = closed(stale.socket);
  await assert.rejects(stale.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['1.0.0', '0.10.0', '0.5.0'], clientId: 'old' }), (error: any) => error.code === -32005 && Array.isArray(error.data.supportedVersions) && error.data.supportedVersions.includes('^0.9.0'));
  assert.equal(await staleClosed, 1000, 'the host closes the connection after an unsupported offer');

  const alice = connect(`${address}/?tkn=${issued.body.token}`);
  t.after(() => alice.close());
  await alice.open;
  const initialized = await alice.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.10.0', '0.9.0', '0.9.3', '0.7.0'], clientId: 'alice', clientInfo: { name: 'test' }, initialSubscriptions: ['ahp-root://'] });
  assert.equal(initialized.protocolVersion, '0.9.3', 'the highest offered 0.9.x, as offered');
  assert.equal(initialized.snapshots[0].state.agents[0].provider, 'unfold');
  assert.deepEqual(await alice.rpc('ping', { channel: 'ahp-root://' }), {});
  const resolved = await alice.rpc('resolveSessionConfig', { channel: 'ahp-root://' });
  assert.ok(resolved.schema.properties.repository.enum.includes('order-service'));
  assert.equal(resolved.values.crew, 'delivery');

  const sessionId = randomUUID();
  const sessionUri = `unfold:/${sessionId}`;
  const chatUri = chatChannel(sessionId);
  assert.equal(chatUri, `ahp-chat://default/${Buffer.from(sessionUri).toString('base64url')}`, 'the default chat has the URI VS Code derives from the session');
  assert.deepEqual(await alice.rpc('createSession', { channel: sessionUri, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Agent host demo' } }), {});
  await alice.until(message => action(message, sessionUri, 'session/ready'));
  await alice.until(message => message.method === 'root/sessionAdded' && message.params.summary.resource === sessionUri);
  await assert.rejects(alice.rpc('createSession', { channel: sessionUri }), (error: any) => error.code === -32003);
  const drafted = await alice.rpc('subscribe', { channel: sessionUri });
  assert.equal(drafted.snapshot.state.defaultChat, chatUri, 'the default chat exists before the first message');
  assert.equal((await alice.rpc('subscribe', { channel: chatUri })).snapshot.state.resource, chatUri);
  alice.notify('dispatchAction', { channel: chatUri, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'client-turn', startedAt: new Date().toISOString(), message: { text: 'Reproduce the rounding regression and fix it with the tests intact.', origin: { kind: 'user' } } } });
  const realSession = sessionUri;
  const realChat = chatUri;
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
  assert.ok(!alice.inbox.some(message => message.method === 'root/sessionRemoved'), 'the first turn keeps the session the client created');
  assert.equal(initialized.snapshots[0].state.agents[0].capabilities, undefined, 'no multi-chat or multi-folder capability is advertised');
  assert.ok(listed.items.every((item: Json) => item.workingDirectories === undefined), 'no host filesystem path is exposed');
  const subscribed = await bob.rpc('subscribe', { channel: realChat });
  assert.equal(subscribed.snapshot.state.turns.at(-1).state, 'complete');
  assert.ok(subscribed.snapshot.state.turns.at(-1).responseParts.length > 2);
  const sessionSnapshot = await bob.rpc('subscribe', { channel: realSession });
  assert.equal(sessionSnapshot.snapshot.state.lifecycle, 'ready');
  assert.equal(sessionSnapshot.snapshot.state.defaultChat, realChat);
  assert.equal(sessionSnapshot.snapshot.state.changesets[0].uriTemplate, `ahp-changeset:/${sessionId}`);
  const changeset = await bob.rpc('subscribe', { channel: `ahp-changeset:/${sessionId}` });
  assert.equal(changeset.snapshot.state.status, 'ready');
  assert.ok(changeset.snapshot.state.files.length > 0);
  const contentUri = changeset.snapshot.state.files[0].edit.after.content.uri;
  const read = await bob.rpc('resourceRead', { channel: 'ahp-root://', uri: contentUri });
  assert.match(read.data, /^diff --git/);
  await assert.rejects(bob.rpc('resourceRead', { channel: 'ahp-root://', uri: 'unfold-diff://nope/0/0/after' }), (error: any) => error.code === -32008);

  bob.notify('dispatchAction', { channel: realChat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 't', startedAt: new Date().toISOString(), message: { text: 'again', origin: { kind: 'user' } } } });
  const rejected = await bob.until(message => action(message, realChat, 'chat/turnStarted') && message.params.rejectionReason);
  assert.match(rejected.params.rejectionReason, /ended/);
  const aliceSaw = await alice.until(message => action(message, realChat, 'chat/turnStarted') && message.params.origin?.clientId === 'bob');
  assert.equal(aliceSaw.params.serverSeq, rejected.params.serverSeq, 'both clients receive the same envelope');
  await assert.rejects(alice.rpc('noSuchMethod', { channel: 'ahp-root://' }), (error: any) => error.code === -32601);
  await settle(50);
});

test('unified diff artifacts become changeset files when no native diff is available', () => {
  const entries = diffEntries('diff --git a/src/a.js b/src/a.js\n--- a/src/a.js\n+++ b/src/a.js\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -0,0 +1 @@\n+hello\n');
  assert.deepEqual(entries.map(entry => [entry.file, entry.additions, entry.deletions]), [['src/a.js', 1, 1], ['README.md', 1, 0]]);
  assert.deepEqual(diffEntries('[{"file":"x","before":"a","after":"b"}]').map(entry => entry.file), ['x']);
});

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

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

test('the agent host keeps each user to their own sessions, summaries and rejections', { timeout: testTimeout(60_000) }, async t => {
  const server = await application('live');
  t.after(() => server.close());
  const { hashPassword } = await import('../src/auth.ts');
  for (const name of ['alice-ahp', 'bob-ahp']) server.app.store.addUser({ id: name, name, role: 'operator', passwordHash: await hashPassword('operator-password-314159') });
  const address = server.url.replace(/^http/, 'ws');
  const attach = async (name: string) => {
    const auth = await login(server.url, name, 'operator-password-314159');
    assert.ok(auth.cookie, `${name} signs in`);
    const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie: auth.cookie, body: { label: name } });
    assert.equal(issued.status, 201, issued.text);
    const client = connect(`${address}/?tkn=${issued.body.token}`);
    t.after(() => client.close());
    await client.open;
    await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: name, initialSubscriptions: ['ahp-root://'] });
    return client;
  };
  const alice = await attach('alice-ahp');
  const bob = await attach('bob-ahp');

  const sessionUri = `unfold:/${randomUUID()}`;
  await alice.rpc('createSession', { channel: sessionUri, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Alice private work' } });
  await alice.until(message => message.method === 'root/sessionAdded' && message.params.summary.resource === sessionUri);
  await assert.rejects(bob.rpc('subscribe', { channel: sessionUri }), (error: any) => error.code === -32001, 'another user cannot subscribe to a pending session');
  await assert.rejects(bob.rpc('disposeSession', { channel: sessionUri }), (error: any) => error.code === -32001, 'another user cannot dispose a pending session');

  const aliceElsewhere = await attach('alice-ahp');
  await aliceElsewhere.rpc('subscribe', { channel: sessionUri });
  alice.notify('dispatchAction', { channel: 'ahp-root://', clientSeq: 7, action: { type: 'root/configChanged', config: { trustedUris: ['file:///home/alice/alice-only'] } } });
  const configured = await alice.until(message => message.method === 'action' && message.params.origin?.clientId === 'alice-ahp' && message.params.origin?.clientSeq === 7);
  assert.equal(configured.params.rejectionReason, undefined, 'the sender\'s root configuration is accepted and echoed back to it');
  alice.notify('dispatchAction', { channel: sessionUri, clientSeq: 8, action: { type: 'session/titleChanged', title: 'Alice private work, renamed' } });
  const rejected = await alice.until(message => message.method === 'action' && message.params.origin?.clientSeq === 8);
  assert.ok(rejected.params.rejectionReason, 'the sender is told its action was rejected');
  await aliceElsewhere.until(message => message.method === 'action' && message.params.origin?.clientSeq === 8);
  assert.ok(!aliceElsewhere.inbox.some(message => JSON.stringify(message).includes('alice-only')), 'root configuration never reaches another client, even the same person\'s');

  await alice.rpc('disposeSession', { channel: sessionUri });
  await alice.until(message => message.method === 'root/sessionRemoved' && message.params.session === sessionUri);
  await settle(500);
  const leaked = bob.inbox.filter(message => JSON.stringify(message).includes(sessionUri) || JSON.stringify(message).includes('alice-only') || JSON.stringify(message).includes('Alice private work'));
  assert.deepEqual(leaked, [], 'nothing about Alice reaches Bob');
  assert.equal((await bob.rpc('subscribe', { channel: 'ahp-root://' })).snapshot.state.activeSessions, 0);
  assert.deepEqual((await bob.rpc('listSessions', { channel: 'ahp-root://' })).items, []);
});

test('channels parse in the VS Code spelling and in the earlier ahp- spelling', () => {
  const id = 'abc-123';
  assert.deepEqual(parseChannel(`unfold:/${id}`), { kind: 'session', id });
  assert.deepEqual(parseChannel(`ahp-session:/${id}`), { kind: 'session', id });
  assert.deepEqual(parseChannel(chatChannel(id)), { kind: 'chat', id });
  assert.deepEqual(parseChannel(`ahp-chat://default/${Buffer.from(`ahp-session:/${id}`).toString('base64url')}`), { kind: 'chat', id });
  assert.deepEqual(parseChannel(`ahp-chat:/${id}`), { kind: 'chat', id });
  assert.deepEqual(parseChannel(`ahp-changeset:/${id}`), { kind: 'changeset', id });
  assert.equal(parseChannel(`ahp-chat://default/${Buffer.from('ahp-root://').toString('base64url')}`), undefined);
  assert.equal(parseChannel(`copilot:/${id}`), undefined);
  assert.equal(parseChannel('ahp-root://'), undefined);
});

test('a session created with the earlier ahp-session spelling is listed and streamed under the VS Code spelling', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'legacy' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'legacy', initialSubscriptions: ['ahp-root://'] });
  const id = randomUUID();
  await client.rpc('createSession', { channel: `ahp-session:/${id}`, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Legacy spelling' } });
  await client.until(message => action(message, `ahp-session:/${id}`, 'session/ready'));
  await client.until(message => message.method === 'root/sessionAdded' && message.params.summary.resource === `unfold:/${id}`);
  await client.rpc('subscribe', { channel: `ahp-chat:/${id}` });
  client.notify('dispatchAction', { channel: `ahp-chat:/${id}`, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'legacy-turn', startedAt: new Date().toISOString(), message: { text: 'Reproduce the rounding regression and fix it with the tests intact.', origin: { kind: 'user' } } } });
  await client.until(message => action(message, `ahp-chat:/${id}`, 'chat/turnComplete'));
  const listed = await client.rpc('listSessions', { channel: 'ahp-root://' });
  assert.ok(listed.items.some((item: Json) => item.resource === `unfold:/${id}`), 'the client-chosen id survives the first turn');

  client.close();
  await server.restart();
  const reissued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'after restart' } });
  const again = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${reissued.body.token}`);
  t.after(() => again.close());
  await again.open;
  await again.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'again' });
  assert.ok((await again.rpc('listSessions', { channel: 'ahp-root://' })).items.some((item: Json) => item.resource === `unfold:/${id}`), 'the client-chosen id survives a restart');
  const chat = await again.rpc('subscribe', { channel: chatChannel(id) });
  assert.equal(chat.snapshot.state.turns.at(-1).state, 'complete');
});

test('each client sees every session in its own spelling: unfold:/ for VS Code 1.141, ahp-session:/ once it declares vscode.ahpSessionUris', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'spelling' } });
  const address = `${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`;
  const attach = async (clientId: string, meta?: Json) => {
    const client = connect(address);
    t.after(() => client.close());
    await client.open;
    const result = await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId, ...(meta ? { _meta: meta } : {}), initialSubscriptions: ['ahp-root://'] });
    return { client, result };
  };
  const { client: modern, result: modernInit } = await attach('modern', { 'vscode.ahpSessionUris': true });
  const { client: legacy, result: legacyInit } = await attach('legacy');
  assert.equal(modernInit._meta?.['vscode.ahpSessionUris'], true, 'the host confirms the capability the client declared');
  assert.equal(modernInit._meta?.['vscode.agentHost'], undefined, 'the host never presents itself as VS Code\'s own');
  assert.equal(legacyInit._meta, undefined);

  const id = randomUUID();
  const modernUri = `ahp-session:/${id}`;
  const legacyUri = `unfold:/${id}`;
  const modernChat = defaultChatOf(modernUri);
  await modern.rpc('createSession', { channel: modernUri, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Spelled per client' } });
  assert.equal((await modern.until(message => message.method === 'root/sessionAdded')).params.summary.resource, modernUri);
  assert.equal((await legacy.until(message => message.method === 'root/sessionAdded')).params.summary.resource, legacyUri);
  const drafted = (await modern.rpc('subscribe', { channel: modernUri })).snapshot.state;
  assert.equal(drafted.resource, modernUri);
  assert.equal(drafted.defaultChat, modernChat, 'the default chat is derived from the session URI the client chose');
  assert.deepEqual(drafted.chats.map((chat: Json) => chat.resource), [modernChat]);
  assert.equal((await modern.rpc('subscribe', { channel: modernChat })).snapshot.state.resource, modernChat);

  modern.notify('dispatchAction', { channel: modernChat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'modern-turn', startedAt: new Date().toISOString(), message: { text: 'Reproduce the rounding regression and fix it with the tests intact.', origin: { kind: 'user' } } } });
  await modern.until(message => action(message, modernChat, 'chat/turnComplete'));
  assert.equal((await modern.until(message => message.method === 'root/sessionSummaryChanged')).params.session, modernUri);
  assert.equal((await legacy.until(message => message.method === 'root/sessionSummaryChanged')).params.session, legacyUri);
  const chatUpdates = modern.inbox.filter(message => action(message, modernUri, 'session/chatUpdated'));
  assert.ok(chatUpdates.length > 0 && chatUpdates.every(message => message.params.action.chat === modernChat));
  assert.deepEqual((await modern.rpc('listSessions', { channel: 'ahp-root://' })).items.map((item: Json) => item.resource), [modernUri]);
  assert.deepEqual((await legacy.rpc('listSessions', { channel: 'ahp-root://' })).items.map((item: Json) => item.resource), [legacyUri]);

  const legacyState = (await legacy.rpc('subscribe', { channel: legacyUri })).snapshot.state;
  assert.equal(legacyState.resource, legacyUri);
  assert.equal(legacyState.defaultChat, defaultChatOf(legacyUri));
  assert.equal((await legacy.rpc('subscribe', { channel: defaultChatOf(legacyUri) })).snapshot.state.turns.at(-1).state, 'complete');
  const mentions = (client: typeof modern, text: string) => client.inbox.some(message => JSON.stringify(message).includes(text));
  assert.ok(!mentions(legacy, modernUri) && !mentions(legacy, modernChat), 'the 1.141 client never sees the ahp-session spelling');
  assert.ok(!mentions(modern, legacyUri) && !mentions(modern, defaultChatOf(legacyUri)), 'the declaring client never sees the provider spelling');

  const returning = connect(address);
  t.after(() => returning.close());
  await returning.open;
  await assert.rejects(returning.rpc('reconnect', { channel: 'ahp-root://', clientId: 'modern', lastSeenServerSeq: 0, subscriptions: [modernUri], _meta: { 'vscode.ahpSessionUris': true } }), (error: any) => error.code === -32008, 'a reconnect on a new connection is told to initialize');
  const again = await returning.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['1.0.0', '0.10.0', '0.9.0'], clientId: 'modern', _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://', modernUri] });
  assert.equal(again.snapshots[1].state.resource, modernUri);
  assert.equal(again.snapshots[1].state.defaultChat, modernChat);
});

test('read and archived marks belong to the person who set them, survive summary updates and restarts, and never change the work', { timeout: testTimeout(60_000) }, async t => {
  const server = await application('live');
  t.after(() => server.close());
  const { hashPassword } = await import('../src/auth.ts');
  for (const name of ['alice-marks', 'bob-marks']) server.app.store.addUser({ id: name, name, role: 'operator', passwordHash: await hashPassword('operator-password-314159') });
  const attach = async (name: string, password: string, meta?: Json) => {
    const auth = await login(server.url, name, password);
    const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie: auth.cookie, body: { label: name } });
    const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
    t.after(() => client.close());
    await client.open;
    await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: `${name}-${randomUUID()}`, ...(meta ? { _meta: meta } : {}), initialSubscriptions: ['ahp-root://'] });
    return client;
  };
  const alice = await attach('alice-marks', 'operator-password-314159', { 'vscode.ahpSessionUris': true });
  const aliceElsewhere = await attach('alice-marks', 'operator-password-314159');
  const admin = await attach('admin', 'test-admin-password-314159');
  const bob = await attach('bob-marks', 'operator-password-314159');
  const session = server.app.engine.create({ title: 'Alice marks this', objective: 'Fix the order rounding regression and provide the actual verification result.', repositoryId: 'order-service', crewId: 'delivery', runtime: 'opencode', budgetUsd: 1 }, { id: 'alice-marks', name: 'alice-marks', role: 'operator' });
  const aliceUri = `ahp-session:/${session.id}`;
  const aliceChat = defaultChatOf(aliceUri);
  const legacyUri = `unfold:/${session.id}`;
  for (const channel of [aliceUri, aliceChat]) await alice.rpc('subscribe', { channel });
  for (const client of [aliceElsewhere, admin]) for (const channel of [legacyUri, defaultChatOf(legacyUri)]) await client.rpc('subscribe', { channel });
  const read = 32;
  const archived = 64;
  const statusOf = async (client: typeof alice) => (await client.rpc('listSessions', { channel: 'ahp-root://' })).items.find((item: Json) => item.resource.endsWith(session.id)).status;

  alice.notify('dispatchAction', { channel: aliceChat, clientSeq: 1, action: { type: 'session/isReadChanged', isRead: true } });
  assert.match((await alice.until(message => message.params?.origin?.clientSeq === 1)).params.rejectionReason, /session channel/, 'a session mark belongs on the session channel');
  alice.notify('dispatchAction', { channel: aliceUri, clientSeq: 2, action: { type: 'session/isArchivedChanged', isArchived: 'yes' } });
  assert.ok((await alice.until(message => message.params?.origin?.clientSeq === 2)).params.rejectionReason);
  const marks = [
    { channel: aliceUri, action: { type: 'session/isReadChanged', isRead: true } },
    { channel: aliceUri, action: { type: 'session/isArchivedChanged', isArchived: true } },
    { channel: aliceChat, action: { type: 'chat/isReadChanged', isRead: true } },
    { channel: aliceChat, action: { type: 'chat/isArchivedChanged', isArchived: true } },
  ];
  for (const [index, mark] of marks.entries()) {
    alice.notify('dispatchAction', { channel: mark.channel, clientSeq: 10 + index, action: mark.action });
    const echoed = await alice.until(message => message.params?.origin?.clientSeq === 10 + index);
    assert.equal(echoed.params.channel, mark.channel);
    assert.deepEqual(echoed.params.action, mark.action);
    assert.equal(echoed.params.rejectionReason, undefined, `${mark.action.type} is accepted and echoed`);
  }
  const elsewhere = await aliceElsewhere.until(message => action(message, legacyUri, 'session/isArchivedChanged') && !message.params.rejectionReason);
  assert.equal(elsewhere.params.origin.clientSeq, 11, 'the same person\'s other client sees the mark in its own spelling');
  await aliceElsewhere.until(message => action(message, defaultChatOf(legacyUri), 'chat/isArchivedChanged'));
  const summaryChanges = aliceElsewhere.inbox.filter(message => message.method === 'root/sessionSummaryChanged' && message.params.session === legacyUri);
  assert.equal(summaryChanges.at(-1)?.params.changes.status & (read | archived), read | archived);
  assert.equal(await statusOf(alice) & (read | archived), read | archived);
  assert.equal((await alice.rpc('subscribe', { channel: aliceUri })).snapshot.state.status & (read | archived), read | archived);
  assert.equal((await alice.rpc('subscribe', { channel: aliceUri })).snapshot.state.chats[0].status & (read | archived), read | archived);
  assert.equal((await alice.rpc('subscribe', { channel: aliceChat })).snapshot.state.status & (read | archived), read | archived);
  assert.equal(await statusOf(admin) & (read | archived), 0, 'an administrator viewing the session keeps their own marks');
  assert.equal(server.app.store.getSession(session.id)!.status, 'queued', 'archiving never cancels or changes the work');

  alice.inbox.length = 0;
  await server.app.engine.message(session.id, 'Keep the public rounding helper signature unchanged.', { id: 'alice-marks', name: 'alice-marks', role: 'operator' });
  const unread = await alice.until(message => message.method === 'root/sessionSummaryChanged' && message.params.session === aliceUri);
  assert.equal(unread.params.changes.status & (read | archived), archived, 'a new turn makes the session unread, and the summary update keeps it archived');
  const chatUnread = await alice.until(message => action(message, aliceUri, 'session/chatUpdated'));
  assert.equal(chatUnread.params.action.changes.status & (read | archived), archived);
  alice.notify('dispatchAction', { channel: aliceUri, clientSeq: 20, action: { type: 'session/isReadChanged', isRead: true } });
  await alice.until(message => message.params?.origin?.clientSeq === 20);
  assert.equal(await statusOf(alice) & (read | archived), read | archived);

  await settle(200);
  const adminSummaries = admin.inbox.filter(message => message.method === 'root/sessionSummaryChanged' && message.params.session === legacyUri);
  assert.ok(adminSummaries.length > 0 && adminSummaries.every(message => (message.params.changes.status & (read | archived)) === 0), 'the administrator\'s summaries carry none of Alice\'s marks');
  const leaked = [...admin.inbox, ...bob.inbox].filter(message => /is(Read|Archived)Changed/.test(String(message.params?.action?.type)));
  assert.deepEqual(leaked, [], 'nobody else receives the marks');
  assert.ok(!bob.inbox.some(message => JSON.stringify(message).includes(session.id)));

  await server.restart();
  const returned = await attach('alice-marks', 'operator-password-314159', { 'vscode.ahpSessionUris': true });
  assert.equal(await statusOf(returned) & (read | archived), read | archived, 'the marks survive a restart');
  assert.equal(await statusOf(await attach('admin', 'test-admin-password-314159')) & (read | archived), 0);
});

test('the host answers VS Code\'s getNetworkDiagnosticsInfo with its version, platform and architecture and no account', async t => {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'diagnostics' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await assert.rejects(client.rpc('getNetworkDiagnosticsInfo', {}), (error: any) => error.code === -32600, 'only an initialized client is answered');
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.10.0', '0.9.0'], clientId: 'diagnostics' });
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(await client.rpc('getNetworkDiagnosticsInfo', {}), { version, os: process.platform, arch: process.arch, proxySettings: {}, proxyEnv: {}, endpoints: [] });
});
