import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, reduceChat, vscodeAgentsWindow, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';
import { activity, choiceEvents, closedToMessages } from '../src/ahp/host.ts';
import type { Event, Session } from '../src/types.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/session-059675b9.json', import.meta.url), 'utf8'));

async function stoppedSession(t: { after: (fn: () => unknown) => void }) {
  const server = await application();
  t.after(() => server.close());
  const operator = { id: 'demo-operator', name: 'Demo operator', role: 'operator' as const };
  const created = server.app.engine.create({ title: fixture.session.title, objective: fixture.session.objective, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  const session: Session = { ...created, ...fixture.session, placement: undefined, approval: undefined, id: created.id, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', ownerId: created.ownerId, ownerName: created.ownerName, runs: fixture.session.runs.map((run: Json) => ({ ...run, sessionId: created.id })) };
  server.app.store.saveSession(session);
  for (const event of fixture.events as Event[]) server.app.store.appendEvent(created.id, event.type, event.actor, event.data, event.runId);
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'progress' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'progress', clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
  const channel = `ahp-session:/${created.id}`;
  return { server, client, id: created.id, channel, chat: defaultChatOf(channel), session };
}

const picked = (option: string) => ({ '0': { state: 'submitted', value: { kind: 'selected', value: option } } });
const chatActions = (client: { inbox: Json[] }, chat: string) => client.inbox.filter(message => message.method === 'action' && message.params.channel === chat && !message.params.rejectionReason).map(message => message.params.action);
const optionIds = (request: Json) => request.questions[0].options.map((option: Json) => option.id);

/** The 059675b9 session, subscribed, with the choice the host offers once it sees the session stopped. */
async function offered(t: { after: (fn: () => unknown) => void }) {
  const stopped = await stoppedSession(t);
  const snapshot = (await stopped.client.rpc('subscribe', { channel: stopped.chat })).snapshot.state;
  const closing = await stopped.client.until(message => action(message, stopped.chat, 'chat/inputRequested'));
  return { ...stopped, snapshot, closing: closing.params.action.request as Json };
}

/** Sends `text` as a new turn and waits for the choice that answers it. */
async function sendIntoStopped(client: ReturnType<typeof connect>, chat: string, text: string, clientSeq: number, turnId: string) {
  client.notify('dispatchAction', { channel: chat, clientSeq, action: { type: 'chat/turnStarted', turnId, startedAt: new Date().toISOString(), message: { text, origin: { kind: 'user' } } } });
  const echo = await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === clientSeq);
  const asked = await client.until(message => action(message, chat, 'chat/inputRequested') && message.params.serverSeq > echo.params.serverSeq);
  return { echo, request: asked.params.action.request as Json, asked };
}

test('the 059675b9 session reads as stopped in the Agents window: activity, an outcome that ends the turn, and a composer that still takes a message', { timeout: testTimeout(60_000) }, async t => {
  const { client, channel, chat, session } = await stoppedSession(t);
  assert.equal(activity(session), 'Stopped · Ploeg holds it for reconciliation');
  assert.equal(closedToMessages(session), true);
  const [summary] = (await client.rpc('listSessions', { channel: 'ahp-root://' })).items;
  assert.equal(summary.activity, 'Stopped · Ploeg holds it for reconciliation');
  const state = (await client.rpc('subscribe', { channel })).snapshot.state;
  assert.equal(state._meta['vscode.chatInputState'], undefined, 'no composer block: a message becomes a choice instead of a dead end');
  assert.equal(state.chats[0].interactivity, 'full');
  assert.ok(state._meta['dev.webgrip.unfold'], 'Unfold\'s own facts stay');
  const turns = (await client.rpc('subscribe', { channel: chat })).snapshot.state.turns;
  const parts = turns.flatMap((turn: Json) => turn.responseParts);
  assert.deepEqual(parts.filter((part: Json) => part.kind === 'toolCall' && part.toolCall.toolName === 'unfold_run').map((part: Json) => part.toolCall.invocationMessage), ['Implementer · writes the change', 'Reviewer · reads the change and gives a verdict'], 'each Run shows as a subagent, not as a notice');
  assert.ok(parts.some((part: Json) => part.kind === 'markdown' && /^\*\*Implementer\*\* finished\./.test(part.content)));
  const outcome = turns.at(-1).responseParts.at(-1);
  assert.equal(outcome.kind, 'markdown');
  assert.match(outcome.content, /^\*\*Stopped\*\* · Reviewer approved the change · the session stopped before finishing/);
  assert.match(outcome.content, /interrupted, approved in its transcript/);
  assert.match(outcome.content, /Spend: US\$\s0,03 \(observed, not settled · of US\$\s0,25\)/);
  assert.match(outcome.content, /Next: Investigate · View change/);
  assert.equal(turns.at(-1).state, 'complete');
  assert.equal(parts.filter((part: Json) => part.kind === 'markdown' && /^\*\*Stopped\*\*/.test(part.content)).length, 1, 'the outcome is said once');
});

test('a session that stopped by itself ends with its next steps as a choice in a host turn, offered once and never acted on', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, id, chat, snapshot, closing } = await offered(t);
  const started = client.inbox.find(message => action(message, chat, 'chat/turnStarted'))!;
  assert.equal(started.params.action.message.origin.kind, 'systemNotification', 'the host opens the turn; it does not pretend the person typed');
  assert.equal(started.params.action.message.text, 'What next?');
  assert.deepEqual(optionIds(closing), ['run_again_start', 'run_again', 'dismiss'], 'without Ploeg\'s confirmed stop there is no delivery, and Ploeg blocked Resume');
  assert.deepEqual(closing.questions[0].options.map((option: Json) => option.label), ['Run again and start', 'Run again, start later', 'Leave it for now']);
  assert.equal(closing.questions[0].kind, 'single-select');
  assert.equal(closing.questions[0].allowFreeformInput, false);
  assert.match(closing.questions[0].message, /\*\*Run again and start\*\*: a new session with this session.s brief, repository, crew, placement and budget \(US\$\s0,25\)\. It starts at once, as a new Ploeg authorization\./);
  const explanation = client.inbox.find(message => action(message, chat, 'chat/responsePart') && message.params.action.part.kind === 'markdown' && message.params.action.part.id.endsWith('-choice'))!;
  assert.match(explanation.params.action.part.content, /Ploeg stopped this session and it will not run again on its own/);
  assert.match(explanation.params.action.part.content, /Nothing runs until you choose\./);
  const reduced = chatActions(client, chat).reduce(reduceChat, snapshot);
  assert.equal(reduced.activeTurn.responseParts.at(-1).kind, 'inputRequest', 'the open choice sits in the active turn, where VS Code renders it');
  assert.equal(server.app.store.events(id).filter(event => event.type === choiceEvents.offered).length, 1);
  await client.rpc('subscribe', { channel: `ahp-session:/${id}` });
  await new Promise(resolve => setTimeout(resolve, 900));
  assert.equal(server.app.store.events(id).filter(event => event.type === choiceEvents.offered).length, 1, 'watching again offers nothing new');
  assert.equal(server.app.store.getSession(id)!.status, 'interrupted', 'an offer changes nothing');
  assert.equal(server.app.store.listSessions().length, 1, 'an offer creates nothing');
});

test('a message into the stopped session is accepted in its own turn and becomes a choice, replacing the open one', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, id, chat, closing } = await offered(t);
  const { echo, request: choice } = await sendIntoStopped(client, chat, 'Test', 1, 'test-turn');
  assert.equal(echo.params.rejectionReason, undefined, 'the turn is accepted, not rejected into an empty turn');
  assert.equal(echo.params.action.type, 'chat/turnStarted');
  assert.equal(echo.params.action.turnId, 'test-turn', 'the turn keeps the id the client gave it');
  assert.equal(echo.params.action.message.text, 'Test');
  const replaced = client.inbox.find(message => action(message, chat, 'chat/inputCompleted') && message.params.action.requestId === closing.id)!;
  assert.equal(replaced.params.action.response, 'cancel', 'the closing choice is answered as replaced before the new turn starts');
  assert.ok(replaced.params.serverSeq < echo.params.serverSeq);
  assert.deepEqual(optionIds(choice), ['run_again_start', 'run_again', 'dismiss']);
  assert.deepEqual(choice.questions[0].options.map((option: Json) => option.label), ['Run again and start', 'Run again with this message', 'Cancel']);
  assert.match(choice.questions[0].message, /your message as an instruction its crew reads/);
  const explanation = client.inbox.find(message => action(message, chat, 'chat/responsePart') && message.params.action.turnId === 'test-turn' && message.params.action.part.kind === 'markdown')!;
  assert.match(explanation.params.action.part.content, /^No crew will read this message\. Unfold lost Ploeg's authority to run it at \d\d:\d\d, after Ploeg did not answer in time\. Ploeg stopped the execution and holds it for reconciliation\./);
  const reduced = chatActions(client, chat).reduce(reduceChat, { turns: [] });
  assert.equal(reduced.activeTurn.id, 'test-turn');
  assert.deepEqual(reduced.activeTurn.responseParts.map((part: Json) => part.kind), ['markdown', 'inputRequest']);
  assert(!server.app.store.events(id).some(event => event.type === 'message' && event.data.role === 'operator'), 'the message is no instruction for an execution that will not come');
});

test('"Run again with this message" creates a queued session with the same brief and the message as its instruction, announces it and never starts it', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, id, chat, session } = await offered(t);
  const { request: choice } = await sendIntoStopped(client, chat, 'Make the readme sound like a mime instead.', 1, 'mime-turn');
  client.notify('dispatchAction', { channel: chat, clientSeq: 2, action: { type: 'chat/inputCompleted', requestId: choice.id, response: 'accept', answers: picked('run_again') } });
  const completed = await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 2);
  assert.equal(completed.params.rejectionReason, undefined);
  assert.equal(completed.params.action.type, 'chat/inputCompleted');
  assert.deepEqual(completed.params.action.answers, picked('run_again'));
  const added = await client.until(message => message.method === 'root/sessionAdded');
  const created = server.app.store.listSessions().find(item => item.id !== id)!;
  assert.equal(added.params.summary.resource, `ahp-session:/${created.id}`, 'the new session appears in the Agents window at once');
  assert.equal(created.status, 'queued', 'nothing starts without the person\'s choice');
  assert.equal(created.objective, session.objective, 'the brief stays; a follow-up is not a brief');
  assert.deepEqual(server.app.store.events(created.id).filter(event => event.type === 'message' && event.data.role === 'operator').map(event => event.data.text), ['Make the readme sound like a mime instead.']);
  assert.equal(created.budgetUsd, session.budgetUsd, 'the budget defaults from the original');
  assert.equal(created.crewId, session.crewId);
  assert.equal(created.previousSessionId, id);
  const reply = await client.until(message => action(message, chat, 'chat/responsePart') && message.params.action.turnId === 'mime-turn' && /Created a new session/.test(message.params.action.part.content ?? ''));
  assert.match(reply.params.action.part.content, /and your message as an instruction its crew reads/);
  assert.match(reply.params.action.part.content, /It waits for you: send it a message to start it/);
  await client.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === 'mime-turn');
  assert.equal(server.app.store.getSession(id)!.status, 'interrupted', 'this session stays as it is');
  assert.equal(server.app.store.events(id).find(event => event.type === 'session.run_again')?.data.sessionId, created.id);
});

test('"Run again and start" starts the new session, and only then', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, id, chat } = await offered(t);
  const { request: choice } = await sendIntoStopped(client, chat, 'Make it funnier.', 1, 'start-turn');
  client.notify('dispatchAction', { channel: chat, clientSeq: 2, action: { type: 'chat/inputCompleted', requestId: choice.id, response: 'accept', answers: picked('run_again_start') } });
  const reply = await client.until(message => action(message, chat, 'chat/responsePart') && /Created a new session/.test(message.params.action.part.content ?? ''));
  assert.match(reply.params.action.part.content, /It started as a new Ploeg authorization\./);
  const created = server.app.store.listSessions().find(item => item.id !== id)!;
  assert.notEqual(server.app.store.getSession(created.id)!.status, 'queued');
  assert.equal(server.app.store.listSessions().length, 2, 'one choice, one session');
});

test('Cancel, a skipped choice and the stop button leave everything as it is', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, id, chat } = await offered(t);
  const first = await sendIntoStopped(client, chat, 'One', 1, 'one-turn');
  client.notify('dispatchAction', { channel: chat, clientSeq: 2, action: { type: 'chat/inputCompleted', requestId: first.request.id, response: 'accept', answers: picked('dismiss') } });
  assert.equal((await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 2)).params.rejectionReason, undefined);
  await client.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === 'one-turn');
  const second = await sendIntoStopped(client, chat, 'Two', 3, 'two-turn');
  client.notify('dispatchAction', { channel: chat, clientSeq: 4, action: { type: 'chat/turnCancelled', turnId: 'two-turn' } });
  const stopped = await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 4);
  assert.equal(stopped.params.rejectionReason, undefined);
  assert.equal(stopped.params.action.type, 'chat/turnCancelled');
  assert.ok(client.inbox.some(message => action(message, chat, 'chat/inputCompleted') && message.params.action.requestId === second.request.id && message.params.action.response === 'cancel'));
  const third = await sendIntoStopped(client, chat, 'Three', 5, 'three-turn');
  client.notify('dispatchAction', { channel: chat, clientSeq: 6, action: { type: 'chat/inputCompleted', requestId: third.request.id, response: 'cancel' } });
  assert.equal((await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 6)).params.rejectionReason, undefined);
  await client.until(message => action(message, chat, 'chat/turnCancelled') && message.params.action.turnId === 'three-turn');
  client.notify('dispatchAction', { channel: chat, clientSeq: 7, action: { type: 'chat/inputCompleted', requestId: third.request.id, response: 'accept', answers: picked('run_again') } });
  assert.ok((await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 7)).params.rejectionReason, 'an answered choice cannot be answered again');
  assert.equal(server.app.store.listSessions().length, 1, 'nothing was created');
  assert.equal(server.app.store.getSession(id)!.status, 'interrupted');
});

test('a choice survives a restart: the reconnected client gets it open in the active turn, and an option it never offered is refused', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, id, chat } = await offered(t);
  const { request: choice } = await sendIntoStopped(client, chat, 'After the restart', 1, 'restart-turn');
  client.close();
  await server.restart();
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'after-restart' } });
  const again = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => again.close());
  await again.open;
  await again.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'after-restart', clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
  const state = (await again.rpc('subscribe', { channel: chat })).snapshot.state;
  assert.equal(state.activeTurn.id, 'restart-turn');
  const open = state.activeTurn.responseParts.find((part: Json) => part.kind === 'inputRequest');
  assert.equal(open.request.id, choice.id);
  assert.equal(open.response, undefined);
  again.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/inputCompleted', requestId: choice.id, response: 'accept', answers: picked('deliver') } });
  assert.match((await again.until(message => message.method === 'action' && message.params.origin?.clientSeq === 1)).params.rejectionReason, /Choose one of the offered options/);
  assert.equal(server.app.store.getSession(id)!.status, 'interrupted');
});

test('another person cannot see or answer the owner\'s choice', { timeout: testTimeout(60_000) }, async t => {
  const { server, chat, closing } = await offered(t);
  server.app.store.addUser({ id: 'bob-choice', name: 'bob-choice', role: 'operator', passwordHash: 'unused' });
  const bob = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${server.app.agentHost.issueToken({ id: 'bob-choice', name: 'bob-choice', role: 'operator' })}`);
  t.after(() => bob.close());
  await bob.open;
  await bob.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'bob', initialSubscriptions: ['ahp-root://'] });
  await assert.rejects(bob.rpc('subscribe', { channel: chat }));
  bob.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/inputCompleted', requestId: closing.id, response: 'accept', answers: picked('run_again') } });
  assert.match((await bob.until(message => message.method === 'action' && message.params.origin?.clientSeq === 1)).params.rejectionReason, /Session not found/);
  assert.equal(server.app.store.listSessions().length, 1);
});

test('a message into a running session is acknowledged for the next Role and marked when that Role picks it up', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const operator = { id: 'demo-operator', name: 'Demo operator', role: 'operator' as const };
  const created = server.app.engine.create({ title: 'Acknowledged', objective: 'Round half up in the order totals.', repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  const [writer, reader] = created.runs;
  server.app.store.saveSession({ ...created, status: 'running' });
  server.app.store.appendEvent(created.id, 'run.started', writer.roleId, { role: writer.roleName, mode: 'write' }, writer.id);
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'ack' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'ack', clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
  const chat = defaultChatOf(`ahp-session:/${created.id}`);
  await client.rpc('subscribe', { channel: chat });
  client.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'steer', startedAt: new Date().toISOString(), message: { text: 'Keep the helper signature.', origin: { kind: 'user' } } } });
  const echo = await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 1);
  assert.equal(echo.params.rejectionReason, undefined);
  assert.equal(echo.params.action.turnId, 'steer');
  const ack = await client.until(message => action(message, chat, 'chat/responsePart') && message.params.action.turnId === 'steer' && message.params.action.part.kind === 'systemNotification');
  assert.equal(ack.params.action.part.content, `Queued for the ${reader.roleName}'s next step. The ${writer.roleName} is working now and does not read it; pause and resume to give it to the ${writer.roleName}.`);
  assert.equal(client.inbox.filter(message => message.params?.origin?.clientSeq === 1).length, 1, 'the turn is echoed once, with the client\'s origin');
  server.app.store.appendEvent(created.id, 'run.finished', writer.roleId, { status: 'completed', summary: 'Done.' }, writer.id);
  const started = server.app.store.appendEvent(created.id, 'run.started', reader.roleId, { role: reader.roleName, mode: 'read' }, reader.id);
  const pickup = await client.until(message => action(message, chat, 'chat/responsePart') && /^Picked up by/.test(message.params.action.part.content ?? ''));
  assert.equal(pickup.params.action.part.kind, 'systemNotification');
  assert.equal(pickup.params.action.part.content, `Picked up by ${reader.roleName} at ${started.at.slice(11, 16)} UTC.`);
  assert.equal(pickup.params.action.turnId, 'steer');
  const reduced = chatActions(client, chat).reduce(reduceChat, { turns: [] });
  assert.deepEqual(reduced.activeTurn.responseParts.filter((part: Json) => part.kind === 'systemNotification').map((part: Json) => part.content.split(' ')[0]), ['Queued', 'Demo', 'Picked'], 'a finished Run says what was spent, and a demo says it spends nothing');
  const spawned = chatActions(client, chat).filter(item => item.type === 'chat/toolCallStart' && item.toolName === 'unfold_run' && item.turnId === 'steer').map(item => item.displayName);
  assert.deepEqual(spawned, [writer.roleName, reader.roleName], 'the working Role carries into the new turn as a subagent, and the next Role joins it');
});

test('a message into a queued session names the first Role, which picks it up when the session starts', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const operator = { id: 'demo-operator', name: 'Demo operator', role: 'operator' as const };
  const created = server.app.engine.create({ title: 'Queued', objective: 'Round half up in the order totals.', repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'queued' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'queued', initialSubscriptions: ['ahp-root://'] });
  const chat = defaultChatOf(`ahp-session:/${created.id}`);
  await client.rpc('subscribe', { channel: chat });
  server.app.store.appendEvent(created.id, 'message', operator.id, { role: 'operator', text: 'Keep it small.' });
  const ack = await client.until(message => action(message, chat, 'chat/responsePart') && message.params.action.part.kind === 'systemNotification');
  assert.equal(ack.params.action.part.content, `Queued for the ${created.runs[0].roleName}'s next step, when the session starts.`);
});
