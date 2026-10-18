import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, reduceChat, vscodeAgentsWindow, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';
import { ChatService, chatMaxRounds, demoChatReply, type ChatAuthority } from '../src/chat/service.ts';
import { mcpToolbox } from '../src/chat/tools.ts';
import { ChatAllowanceUsedUp, PloegClient, PloegError, type PloegChatAllowance } from '../src/ploeg.ts';
import { chatSessionUri } from '../src/ahp/chats.ts';

type Server = Awaited<ReturnType<typeof application>>;
type Reply = { content?: string; calls?: { name: string; arguments?: Json }[] } | { status: number; body: string };

const allowance: PloegChatAllowance = { scopeKind: 'team', scopeId: 'delivery', periodStart: '2026-10-01T00:00:00Z', resetAt: '2026-11-01T00:00:00Z', limitUsd: 5, settledUsd: 0.4, heldUsd: 0.05, remainingUsd: 4.55, chatCount: 9, chatBudgetUsd: 0.05, chatsEnabled: true };

/** A fake Ploeg chat authority and a scripted model gateway around the demo application's real MCP tools. */
function fakes(server: Server, options: { admit?: ChatAuthority['admit']; demo?: boolean } = {}) {
  const admitted: { team: string; chatId: string; message: string }[] = [];
  const finished: string[] = [];
  const requests: Json[] = [];
  const replies: Reply[] = [];
  const authority: ChatAuthority = {
    async teams() { return [{ id: 'delivery', name: 'delivery' }, { id: 'research', name: 'research' }]; },
    admit: options.admit ?? (async (_user, team, chatId, message) => { admitted.push({ team, chatId, message }); return { chatId, runId: '900', team, budgetUsd: 0.05, key: 'sk-chat-key', models: ['chat-model'], expiresAt: '2026-10-18T12:00:00Z', allowance }; }),
    async finish(_user, _team, chatId) { finished.push(chatId); },
    async allowance() { return allowance; },
  };
  const gateway = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push({ auth: (init.headers as Record<string, string>).authorization, body });
    const reply = replies.shift() ?? { content: 'Hello from Unfold.' };
    if ('status' in reply) return new Response(reply.body, { status: reply.status, headers: { 'content-type': 'application/json' } });
    const toolCalls = reply.calls?.map((call, index) => ({ id: `call-${requests.length}-${index}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) } }));
    return new Response(JSON.stringify({ choices: [{ message: { content: reply.content ?? null, ...(toolCalls ? { tool_calls: toolCalls } : {}) }, finish_reason: toolCalls ? 'tool_calls' : 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const toolbox = mcpToolbox({ delegate: () => ({ token: `vlm_${randomBytes(32).toString('base64url')}`, revoke() {} }), apiUrl: () => server.url, linkUrl: server.url, version: 'test' });
  const service = new ChatService(authority, toolbox, { demo: options.demo ?? false, gatewayUrl: 'http://gateway.test/v1', secrets: [], fetch: gateway });
  server.app.agentHost.useChat(service);
  return { admitted, finished, requests, replies, service };
}

async function attach(t: TestContext, server: Server, spelling: '0.9' | '1.0', clientId = randomUUID()) {
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: `chat ${spelling}` } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  const initialized = await client.rpc('initialize', spelling === '0.9'
    ? { channel: 'ahp-root://', protocolVersions: ['0.10.0', '0.9.0'], clientId, clientInfo: vscodeAgentsWindow, initialSubscriptions: ['ahp-root://'] }
    : { channel: 'ahp-root://', protocolVersions: ['1.0.0', '0.9.0'], clientId, clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
  return Object.assign(client, { initialized });
}

async function newChat(client: Awaited<ReturnType<typeof attach>>, spelling: '0.9' | '1.0', config: Json = {}) {
  const id = randomUUID();
  const session = spelling === '0.9' ? `unfold-chat:/${id}` : `ahp-session:/${id}`;
  await client.rpc('createSession', { channel: session, provider: 'unfold-chat', config: { team: 'delivery', ...config } });
  const chat = defaultChatOf(session);
  const snapshot = (await client.rpc('subscribe', { channel: chat })).snapshot.state;
  return { id, session, chat, snapshot };
}

let seq = 0;
const send = (client: ReturnType<typeof connect>, chat: string, text: string, turnId: string) =>
  client.notify('dispatchAction', { channel: chat, clientSeq: ++seq, action: { type: 'chat/turnStarted', turnId, startedAt: new Date().toISOString(), message: { text, origin: { kind: 'user' } } } });
const ended = (chat: string, turnId: string) => (message: Json) => message.method === 'action' && message.params.channel === chat && ['chat/turnComplete', 'chat/error', 'chat/turnCancelled'].includes(message.params.action.type) && message.params.action.turnId === turnId;

test('the Agents window lists the Unfold chat beside Unfold teams, for 0.9 and 1.0 clients alike', { timeout: testTimeout(30_000) }, async t => {
  const server = await application(); t.after(() => server.close());
  fakes(server);
  for (const spelling of ['0.9', '1.0'] as const) {
    const client = await attach(t, server, spelling);
    const agents = client.initialized.snapshots[0].state.agents;
    assert.deepEqual(agents.map((agent: Json) => agent.provider), ['unfold', 'unfold-chat']);
    assert.deepEqual(agents.map((agent: Json) => agent.displayName), ['Unfold teams', 'Unfold']);
    assert.deepEqual(agents[0].models, [{ id: 'unfold-team', name: 'Demo team · no model calls', provider: 'unfold' }], 'Unfold teams is unchanged');
    assert.deepEqual(agents[1].protectedResources, [], 'no GitHub sign-in gate');
    const resolved = await client.rpc('resolveSessionConfig', { channel: 'ahp-root://', provider: 'unfold-chat' });
    assert.deepEqual(resolved.schema.properties.team.enum, ['delivery', 'research']);
    assert.match(resolved.schema.properties.team.enumDescriptions[0], /4,55 of .*5,00 left until 1 November/);
    assert.equal(resolved.values.team, 'delivery');
    const teams = await client.rpc('resolveSessionConfig', { channel: 'ahp-root://', provider: 'unfold' });
    assert.ok(teams.schema.properties.repository, 'the Unfold teams schema is unchanged');
  }
});

test('a short "test" gets an answer in a 0.9 chat, paid by one admission whose key is finished', { timeout: testTimeout(30_000) }, async t => {
  const server = await application(); t.after(() => server.close());
  const fake = fakes(server);
  const client = await attach(t, server, '0.9');
  const { id, session, chat } = await newChat(client, '0.9');
  assert.equal(session, `unfold-chat:/${id}`);
  send(client, chat, 'test', 'turn-1');
  const echo = await client.until(message => action(message, chat, 'chat/turnStarted') && message.params.action.turnId === 'turn-1');
  assert.equal(echo.params.rejectionReason, undefined);
  assert.equal(echo.params.origin.clientSeq, seq);
  const done = await client.until(ended(chat, 'turn-1'));
  assert.equal(done.params.action.type, 'chat/turnComplete');
  const parts = client.inbox.filter(message => action(message, chat, 'chat/responsePart')).map(message => message.params.action.part.content);
  assert.equal(parts[0], 'Hello from Unfold.');
  assert.match(parts[1], /Team delivery · US\\\$\s4,55 of US\\\$\s5,00 chat allowance left, until 1 November/);
  assert.deepEqual(fake.admitted.map(entry => [entry.team, entry.message]), [['delivery', 'test']]);
  assert.deepEqual(fake.finished, [fake.admitted[0].chatId], 'the key is finished once the turn ends');
  assert.equal(fake.requests.length, 1);
  assert.equal(fake.requests[0].auth, 'Bearer sk-chat-key');
  assert.equal(fake.requests[0].body.model, 'chat-model');
  const tools = fake.requests[0].body.tools.map((tool: Json) => tool.function.name);
  assert.ok(tools.includes('unfold_now') && tools.includes('unfold_hand_off'));
  assert.ok(!tools.includes('unfold_ask'), 'unfold_ask would spend a second allowance');
  assert.equal(fake.requests[0].body.messages.at(-1).content, 'test');
  const listed = (await client.rpc('listSessions', { channel: 'ahp-root://' })).items.find((item: Json) => item.resource === session);
  assert.equal(listed.provider, 'unfold-chat');
  assert.equal(listed.title, 'test', 'the title is the first message');
  assert.match(listed.activity, /4,55 of Team delivery's chat allowance left/);
});

test('a read-only tool runs at once and shows as a tool call in the turn', { timeout: testTimeout(30_000) }, async t => {
  const server = await application(); t.after(() => server.close());
  const fake = fakes(server);
  fake.replies.push({ calls: [{ name: 'unfold_now' }] }, { content: 'Two items wait for you.' });
  const client = await attach(t, server, '1.0');
  const { chat } = await newChat(client, '1.0');
  send(client, chat, 'What waits for me?', 'turn-read');
  await client.until(ended(chat, 'turn-read'));
  const start = client.inbox.find(message => action(message, chat, 'chat/toolCallStart'))!;
  assert.equal(start.params.action.toolName, 'unfold_now');
  assert.equal(start.params.action.displayName, 'What waits for me');
  const ready = client.inbox.find(message => action(message, chat, 'chat/toolCallReady'))!;
  assert.equal(ready.params.action.confirmed, 'not-needed');
  assert.equal(ready.params.action.confirmationTitle, undefined);
  const complete = client.inbox.find(message => action(message, chat, 'chat/toolCallComplete'))!;
  assert.equal(complete.params.action.result.success, true);
  assert.match(complete.params.action.result.pastTenseMessage, /illustrative demo/);
  const toolMessage = fake.requests[1].body.messages.find((message: Json) => message.role === 'tool');
  assert.match(toolMessage.content, /"waiting"/, 'the model reads the tool result');
  assert.equal(fake.admitted.length, 1, 'the whole tool loop uses one admission');
  assert.equal(fake.finished.length, 1);
});

test('an acting tool waits for confirmation with its effect, runs once allowed, and a denial reaches the model as declined', { timeout: testTimeout(45_000) }, async t => {
  const server = await application(); t.after(() => server.close());
  const fake = fakes(server);
  const client = await attach(t, server, '1.0');
  const { chat, session } = await newChat(client, '1.0');
  await client.rpc('subscribe', { channel: session });

  fake.replies.push({ calls: [{ name: 'unfold_approve_work', arguments: { id: '106' } }] }, { content: 'Approved.' });
  send(client, chat, 'Approve 106', 'turn-allow');
  const ready = await client.until(message => action(message, chat, 'chat/toolCallReady') && message.params.action.turnId === 'turn-allow');
  assert.match(ready.params.action.confirmationTitle, /Approve Work Item 106 .*Ploeg queues it for Team delivery/);
  assert.deepEqual(ready.params.action.options.map((option: Json) => option.kind), ['approve', 'deny']);
  const needed = await client.until(message => action(message, session, 'session/inputNeededSet'));
  assert.equal(needed.params.action.request.kind, 'toolConfirmation');
  assert.equal(needed.params.action.request.toolCall.status, 'pending-confirmation');
  const toolCallId = ready.params.action.toolCallId;
  client.notify('dispatchAction', { channel: chat, clientSeq: ++seq, action: { type: 'chat/toolCallConfirmed', turnId: 'turn-allow', toolCallId, approved: true, selectedOptionId: 'allow' } });
  const confirmed = await client.until(message => action(message, chat, 'chat/toolCallConfirmed') && message.params.action.toolCallId === toolCallId);
  assert.equal(confirmed.params.action.approved, true);
  assert.equal(confirmed.params.origin.clientSeq, seq);
  const complete = await client.until(message => action(message, chat, 'chat/toolCallComplete') && message.params.action.toolCallId === toolCallId);
  assert.equal(complete.params.action.result.success, true);
  assert.match(complete.params.action.result.pastTenseMessage, /Approved Work Item 106/);
  await client.until(ended(chat, 'turn-allow'));
  assert.match(fake.requests[1].body.messages.find((message: Json) => message.role === 'tool').content, /Approved Work Item 106/);

  fake.replies.push({ calls: [{ name: 'unfold_stop_work', arguments: { id: '101' } }] }, { content: 'Nothing was changed.' });
  send(client, chat, 'Stop 101', 'turn-deny');
  const asked = await client.until(message => action(message, chat, 'chat/toolCallReady') && message.params.action.turnId === 'turn-deny' && message.params.action.confirmationTitle);
  assert.match(asked.params.action.confirmationTitle, /Stop Work Item 101/);
  client.notify('dispatchAction', { channel: chat, clientSeq: ++seq, action: { type: 'chat/toolCallConfirmed', turnId: 'turn-deny', toolCallId: asked.params.action.toolCallId, approved: false, selectedOptionId: 'deny' } });
  const denied = await client.until(message => action(message, chat, 'chat/toolCallConfirmed') && message.params.action.toolCallId === asked.params.action.toolCallId);
  assert.equal(denied.params.action.approved, false);
  assert.equal(denied.params.action.reason, 'denied');
  await client.until(ended(chat, 'turn-deny'));
  assert.ok(!client.inbox.some(message => action(message, chat, 'chat/toolCallComplete') && message.params.action.toolCallId === asked.params.action.toolCallId), 'a denied tool never runs');
  assert.match(fake.requests[3].body.messages.findLast((message: Json) => message.role === 'tool').content, /declined/);
  const work = await request(server.url, '/api/ploeg/work-items/101');
  assert.notEqual(work.body.item.state, 'withdrawn', 'nothing was stopped');
  assert.equal(fake.finished.length, 2);
  assert.ok(client.inbox.some(message => action(message, session, 'session/inputNeededRemoved')));
});

test('a used-up chat allowance ends the turn with when it resets, and nothing is asked', { timeout: testTimeout(30_000) }, async t => {
  const server = await application(); t.after(() => server.close());
  const fake = fakes(server, { admit: async () => { throw new ChatAllowanceUsedUp('2026-11-01T00:00:00Z', { ...allowance, remainingUsd: 0 }); } });
  const client = await attach(t, server, '1.0');
  const { chat } = await newChat(client, '1.0');
  send(client, chat, 'hi', 'turn-402');
  const error = await client.until(ended(chat, 'turn-402'));
  assert.equal(error.params.action.type, 'chat/error');
  assert.equal(error.params.action.part.error.errorType, 'allowance_exhausted');
  assert.match(error.params.action.part.error.message, /chat allowance is used up.*resets on 1 November/);
  assert.equal(fake.requests.length, 0, 'no model call');
  assert.deepEqual(fake.finished, [], 'nothing was admitted, so nothing to finish');
});

test('a failing model gateway still finishes the key', { timeout: testTimeout(30_000) }, async t => {
  const server = await application(); t.after(() => server.close());
  const fake = fakes(server);
  fake.replies.push({ status: 500, body: '{"error":{"message":"upstream down"}}' });
  const client = await attach(t, server, '0.9');
  const { chat } = await newChat(client, '0.9');
  send(client, chat, 'hi', 'turn-500');
  const error = await client.until(ended(chat, 'turn-500'));
  assert.equal(error.params.action.type, 'chat/error');
  assert.deepEqual(fake.finished, [fake.admitted[0].chatId]);
});

test('the chat keeps its history across a reconnect and a restart, and sends a bounded history to the model', { timeout: testTimeout(60_000) }, async t => {
  const server = await application(); t.after(() => server.close());
  let fake = fakes(server);
  fake.replies.push({ calls: [{ name: 'unfold_spend' }] }, { content: 'Spend is fine.' }, { content: 'Still fine.' });
  const first = await attach(t, server, '0.9');
  const { id, chat } = await newChat(first, '0.9');
  send(first, chat, 'How is spend?', 'turn-a');
  await first.until(ended(chat, 'turn-a'));
  send(first, chat, 'And now?', 'turn-b');
  await first.until(ended(chat, 'turn-b'));
  const history = fake.requests.at(-1)!.body.messages.slice(1).map((message: Json) => [message.role, message.content]);
  assert.deepEqual(history, [['user', 'How is spend?'], ['assistant', 'Spend is fine.'], ['user', 'And now?']], 'earlier turns without the allowance line');
  first.close();

  await server.restart();
  fake = fakes(server);
  const later = await attach(t, server, '1.0');
  const session = `ahp-session:/${id}`;
  const listed = (await later.rpc('listSessions', { channel: 'ahp-root://' })).items.find((item: Json) => item.resource === session);
  assert.equal(listed.title, 'How is spend?');
  assert.equal(listed.chats[0].resource, defaultChatOf(session), 'a 1.0 client gets the chat catalog');
  const snapshot = (await later.rpc('subscribe', { channel: defaultChatOf(session) })).snapshot.state;
  assert.deepEqual(snapshot.turns.map((turn: Json) => [turn.id, turn.message.text, turn.state]), [['turn-a', 'How is spend?', 'complete'], ['turn-b', 'And now?', 'complete']]);
  const tool = snapshot.turns[0].responseParts.find((part: Json) => part.kind === 'toolCall');
  assert.equal(tool.toolCall.toolName, 'unfold_spend');
  assert.equal(tool.toolCall.status, 'completed');
  assert.equal(snapshot.turns[0].responseParts.find((part: Json) => part.kind === 'markdown').content, 'Spend is fine.');
  assert.equal(snapshot.activeTurn, undefined);
  const sessionState = (await later.rpc('subscribe', { channel: session })).snapshot.state;
  assert.equal(sessionState.provider, 'unfold-chat');
  assert.equal(sessionState.config.values.team, 'delivery');
  later.notify('dispatchAction', { channel: session, clientSeq: ++seq, action: { type: 'session/isArchivedChanged', isArchived: true } });
  const archived = await later.until(message => message.method === 'root/sessionSummaryChanged' && message.params.session === session);
  assert.equal(archived.params.changes.status & 64, 64);
  await later.rpc('disposeSession', { channel: session });
  assert.ok(!(await later.rpc('listSessions', { channel: 'ahp-root://' })).items.some((item: Json) => item.resource === session));
});

test('another person never sees or uses someone else\'s chat', { timeout: testTimeout(30_000) }, async t => {
  const server = await application(); t.after(() => server.close());
  fakes(server);
  const owner = await attach(t, server, '1.0');
  const { id } = await newChat(owner, '1.0');
  const chats = (server.app.agentHost as unknown as { chats: { owns(user: Json, id: string): boolean } }).chats;
  assert.equal(chats.owns({ id: 'someone-else', name: 'x', role: 'admin' }, id), false);
  assert.equal(chats.owns({ id: 'demo-operator', name: 'Demo operator', role: 'admin' }, id), true);
  assert.equal(chatSessionUri(id, 'unfold'), `unfold-chat:/${id}`);
});

test('the demo answers with a fixed reply that says so, and makes no admission or model call', { timeout: testTimeout(30_000) }, async t => {
  const server = await application(); t.after(() => server.close());
  const fake = fakes(server, { demo: true });
  const client = await attach(t, server, '1.0');
  assert.equal(client.initialized.snapshots[0].state.agents[1].models[0].name, 'Demo · no model calls');
  const { chat, snapshot } = await newChat(client, '1.0');
  send(client, chat, 'hello', 'turn-demo');
  await client.until(ended(chat, 'turn-demo'));
  const seen = client.inbox.filter(message => message.method === 'action' && message.params.channel === chat && !message.params.rejectionReason).map(message => message.params.action).reduce(reduceChat, snapshot);
  assert.equal(seen.turns.at(-1).responseParts[0].content, demoChatReply);
  assert.match(demoChatReply, /demo: no model is asked and nothing is spent/);
  assert.equal(fake.admitted.length, 0);
  assert.equal(fake.requests.length, 0);
});

test('the default demo workbench wires the demo chat', { timeout: testTimeout(30_000) }, async t => {
  const server = await application(); t.after(() => server.close());
  const client = await attach(t, server, '1.0');
  const { chat } = await newChat(client, '1.0');
  send(client, chat, 'test', 'turn-default');
  await client.until(ended(chat, 'turn-default'));
  const part = client.inbox.find(message => action(message, chat, 'chat/responsePart'))!;
  assert.equal(part.params.action.part.content, demoChatReply);
});

test('a turn takes at most eight tool-call rounds before the model must answer', { timeout: testTimeout(45_000) }, async t => {
  const server = await application(); t.after(() => server.close());
  const fake = fakes(server);
  for (let round = 0; round < chatMaxRounds; round++) fake.replies.push({ calls: [{ name: 'unfold_sessions' }] });
  fake.replies.push({ content: 'Done looking.' });
  const client = await attach(t, server, '1.0');
  const { chat } = await newChat(client, '1.0');
  send(client, chat, 'Look around', 'turn-rounds');
  await client.until(ended(chat, 'turn-rounds'), testTimeout(40_000));
  assert.equal(fake.requests.length, chatMaxRounds + 1);
  assert.equal(fake.requests.at(-1)!.body.tools, undefined, 'the last request offers no tools');
  assert.equal(fake.finished.length, 1);
});

test('Stop ends a turn that waits for confirmation, finishes its key, and runs nothing', { timeout: testTimeout(30_000) }, async t => {
  const server = await application(); t.after(() => server.close());
  const fake = fakes(server);
  fake.replies.push({ calls: [{ name: 'unfold_approve_work', arguments: { id: '106' } }] });
  const client = await attach(t, server, '1.0');
  const { chat } = await newChat(client, '1.0');
  send(client, chat, 'Approve 106', 'turn-stop');
  await client.until(message => action(message, chat, 'chat/toolCallReady') && message.params.action.confirmationTitle);
  client.notify('dispatchAction', { channel: chat, clientSeq: ++seq, action: { type: 'chat/turnCancelled', turnId: 'turn-stop' } });
  const cancelled = await client.until(ended(chat, 'turn-stop'));
  assert.equal(cancelled.params.action.type, 'chat/turnCancelled');
  for (let wait = 0; wait < 100 && !fake.finished.length; wait++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(fake.finished.length, 1);
  assert.equal(fake.requests.length, 1, 'no further model call');
  const detail = await request(server.url, '/api/ploeg/work-items/106');
  assert.equal(detail.body.item.state, 'proposed', 'nothing was approved');
});

async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
}

test('Unfold\'s Ploeg client speaks Ploeg ADR-0115\'s chat routes', { timeout: testTimeout(30_000) }, async t => {
  const env = `UNFOLD_PLOEG_CHAT_${randomBytes(6).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  t.after(() => { delete process.env[env]; });
  const calls: Json[] = [];
  let admission: (data: Json) => [number, Json] = data => [201, { created: true, chat: { chatId: data.chatId, runId: '900', team: 'delivery', actor: 'ryan', askedBy: 'ryan', state: 'open', budgetUsd: 0.05, messageSha256: 'a'.repeat(64), createdAt: '2026-10-18T10:00:00Z', expiresAt: '2026-10-18T10:05:00Z', finishedAt: null, spend: { costStatus: 'provisional', usd: null, keyState: 'issued' } }, credential: { key: 'sk-chat', alias: 'chat-1', models: ['glm-flash'], budgetUsd: 0.05, expiresAt: '2026-10-18T10:05:00Z' }, allowance: { purpose: 'chat', ...allowance } }];
  const ploeg = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://fixture.invalid');
    const data = await body(req);
    calls.push({ method: req.method, path: url.pathname, query: url.search, acting: req.headers['x-ploeg-acting-user'], body: data });
    const send = (status: number, payload: Json) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...payload }));
    if (req.headers.authorization !== `Bearer ${bearer}`) return send(401, {});
    if (url.pathname === '/api/v1/operator/teams/delivery/chats' && req.method === 'POST') { const [status, payload] = admission(data); return send(status, payload); }
    if (/\/chats\/[^/]+\/finish$/.test(url.pathname)) return send(200, { chat: { chatId: 'c', team: 'delivery', state: 'finished' } });
    if (/\/teams\/delivery\/chats\/[^/]+$/.test(url.pathname)) return send(200, { chat: { chatId: decodeURIComponent(url.pathname.split('/').at(-1)!), state: 'finished', spend: { costStatus: 'settled', usd: 0.0021 } } });
    if (url.pathname === '/api/v1/operator/allowances') return send(200, { allowance: { purpose: 'chat', ...allowance } });
    return send(404, { error: { code: 'not_found' } });
  });
  await new Promise<void>(resolve => ploeg.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => ploeg.close(() => resolve())));
  const address = ploeg.address(); assert(address && typeof address !== 'string');
  const client = new PloegClient({ mode: 'live', ploeg: { url: `http://127.0.0.1:${address.port}`, tokenEnv: env, userTeams: { ryan: ['delivery'] } } } as never);
  const user = { id: 'ryan', name: 'Ryan', role: 'operator' as const };

  const grant = await client.admitChat(user, 'delivery', 'chat-1', 'hi');
  assert.deepEqual([grant.key, grant.models, grant.budgetUsd, grant.allowance?.remainingUsd, grant.allowance?.chatBudgetUsd], ['sk-chat', ['glm-flash'], 0.05, 4.55, 0.05]);
  assert.deepEqual([calls[0].method, calls[0].acting, calls[0].body], ['POST', 'ryan', { chatId: 'chat-1', message: 'hi' }]);
  await client.finishChat(user, 'delivery', 'chat-1');
  assert.equal(calls.at(-1)!.path, '/api/v1/operator/teams/delivery/chats/chat-1/finish');
  assert.equal((await client.chatRecord(user, 'delivery', 'chat-1')).usd, 0.0021);
  assert.equal((await client.chatAllowance(user, 'delivery'))?.limitUsd, 5);
  assert.equal(calls.at(-1)!.query, '?team=delivery&purpose=chat');
  await assert.rejects(client.admitChat(user, 'research', 'chat-2', 'hi'), (error: unknown) => error instanceof PloegError && error.status === 404, 'a Team outside the person\'s scope is never asked');

  admission = () => [402, { error: { code: 'allowance_exhausted' }, allowance: { purpose: 'chat', ...allowance, remainingUsd: 0 } }];
  await assert.rejects(client.admitChat(user, 'delivery', 'chat-3', 'hi'), (error: unknown) => error instanceof ChatAllowanceUsedUp && error.resetAt === '2026-11-01T00:00:00Z' && error.allowance?.remainingUsd === 0);
  admission = () => [409, { error: { code: 'inference_policy' } }];
  await assert.rejects(client.admitChat(user, 'delivery', 'chat-4', 'hi'), (error: unknown) => error instanceof PloegError && error.code === 'chat_unconfigured');
  admission = () => [409, { error: { code: 'chat_conflict' } }];
  await assert.rejects(client.admitChat(user, 'delivery', 'chat-5', 'hi'), (error: unknown) => error instanceof PloegError && error.code === 'chat_conflict');
  admission = () => [503, { error: { code: 'inference_unavailable' } }];
  await assert.rejects(client.admitChat(user, 'delivery', 'chat-6', 'hi'), (error: unknown) => error instanceof PloegError && error.code === 'chat_unavailable');
  admission = data => [200, { created: false, chat: { chatId: data.chatId, runId: '900', team: 'delivery', state: 'open', budgetUsd: 0.05 }, credential: null, allowance: { purpose: 'chat', ...allowance } }];
  await assert.rejects(client.admitChat(user, 'delivery', 'chat-7', 'hi'), (error: unknown) => error instanceof PloegError && error.code === 'chat_replayed');
});

test('a replay without a key is admitted again under a new chat id', async () => {
  const ids: string[] = [];
  const authority: ChatAuthority = {
    async teams() { return [{ id: 'delivery', name: 'delivery' }]; },
    async admit(_user, team, chatId) { ids.push(chatId); if (ids.length === 1) throw new PloegError(409, 'chat_replayed', 'replayed'); return { chatId, runId: '1', team, budgetUsd: 0.05, key: 'k', models: ['m'], expiresAt: '', allowance: null }; },
    async finish() {},
    async allowance() { return null; },
  };
  const gateway = (async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })) as unknown as typeof fetch;
  const service = new ChatService(authority, { list: async () => [], confirmsFirst: () => false, run: async () => ({ ok: true, text: '' }), plan: async () => ({ kind: 'answer', answer: { ok: true, text: '' } }), perform: async () => ({ ok: true, text: '' }) }, { demo: false, gatewayUrl: 'http://gateway.test', secrets: [], fetch: gateway });
  const said: string[] = [];
  const outcome = await service.respond({ id: 'u', name: 'u', role: 'operator' }, 'delivery', 'hi', [], { say: text => said.push(text), tool: () => { throw new Error('no tools'); }, admitted() {} }, new AbortController().signal);
  assert.equal(outcome.state, 'complete');
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
  assert.deepEqual(said, ['ok']);
});
