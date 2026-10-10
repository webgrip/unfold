import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, reduceChat, vscodeAgentsWindow, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';
import { askMarkdown, commandCompletions, messageIntent, type ChatAskEntry } from '../src/ahp/asks.ts';
import { choiceEvents } from '../src/ahp/host.ts';
import { AskAllowanceUsedUp, AskService, type AskAuthority, type AskGrant } from '../src/ask/service.ts';
import type { Ask } from '../src/ask/types.ts';
import type { Event, Session } from '../src/types.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/session-059675b9.json', import.meta.url), 'utf8'));
const answerText = 'Ploeg stopped it after its heartbeat went missing. The Reviewer had approved the change.';
const allowance = { limitUsd: 5, settledUsd: 0.4, heldUsd: 0.02, remainingUsd: 4.58, resetAt: '2026-11-01T00:00:00Z', askCount: 12, askBudgetUsd: 0.02, asksEnabled: true };

type Fakes = { admitted: string[]; prompts: string[]; admit?: AskAuthority['admit']; gatewayUrl?: string | undefined };

/** A real Ask service over the fixture's Work Item, a fake Ploeg authority and a fake model gateway. */
function askService(store: ConstructorParameters<typeof AskService>[0], fakes: Fakes) {
  const grant: AskGrant = { askId: 'ploeg-ask-1', key: 'sk-ask-key', models: ['ask-model'], expiresAt: fixture.now, allowance };
  const authority: AskAuthority = {
    admit: fakes.admit ?? (async (_user, workItemId, _askId, question) => { fakes.admitted.push(`${workItemId}: ${question}`); return grant; }),
    async finish() {},
    async spend() { return { costUsd: 0.0123, costStatus: 'pending' }; },
    async allowance() { return allowance; },
  };
  const workItems = {
    async detail(_user: unknown, id: string) { assert.equal(id, '184'); return { truncated: { shifts: false, runs: false, checkpoints: false, events: false }, demo: false, ...structuredClone(fixture.ploeg) }; },
    async card(): Promise<never> { throw new Error('no card facts'); },
  };
  const gateway = (async (_url: string, init: RequestInit) => {
    fakes.prompts.push(String(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: answerText } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return new AskService(store, workItems, authority, { demo: false, gatewayUrl: 'gatewayUrl' in fakes ? fakes.gatewayUrl : 'http://gateway.test/v1', secrets: [], fetch: gateway });
}

async function fixtureSession(t: { after: (fn: () => unknown) => void }, options: { status?: Session['status']; fakes?: Partial<Fakes> } = {}) {
  const server = await application();
  t.after(() => server.close());
  const operator = { id: 'demo-operator', name: 'Demo operator', role: 'operator' as const };
  const created = server.app.engine.create({ title: fixture.session.title, objective: fixture.session.objective, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  const session: Session = { ...created, ...fixture.session, ...(options.status ? { status: options.status, blocker: undefined } : {}), placement: undefined, approval: undefined, id: created.id, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', ownerId: created.ownerId, ownerName: created.ownerName, runs: fixture.session.runs.map((run: Json) => ({ ...run, sessionId: created.id })) };
  server.app.store.saveSession(session);
  const events = options.status === 'running' ? (fixture.events as Event[]).filter(event => !/^(execution\.|budget\.)/.test(event.type)) : fixture.events as Event[];
  for (const event of events) server.app.store.appendEvent(created.id, event.type, event.actor, event.data, event.runId);
  const fakes: Fakes = { admitted: [], prompts: [], ...options.fakes };
  server.app.agentHost.useAsks(askService(server.app.store, fakes));
  const client = await attach(server, 'asks');
  t.after(() => client.close());
  const channel = `ahp-session:/${created.id}`;
  return { server, client, id: created.id, channel, chat: defaultChatOf(channel), fakes };
}

async function attach(server: Awaited<ReturnType<typeof application>>, clientId: string) {
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: clientId } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  await client.open;
  const initialized = await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId, clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
  return Object.assign(client, { initialized });
}

const send = (client: ReturnType<typeof connect>, chat: string, text: string, clientSeq: number, turnId: string, attachments?: Json[]) =>
  client.notify('dispatchAction', { channel: chat, clientSeq, action: { type: 'chat/turnStarted', turnId, startedAt: new Date().toISOString(), message: { text, origin: { kind: 'user' }, ...(attachments ? { attachments } : {}) } } });
const askParts = (turns: Json[]) => turns.flatMap(turn => turn.responseParts).filter((part: Json) => part.kind === 'markdown' && part.content.startsWith('**Ask**'));
const picked = (option: string) => ({ '0': { state: 'submitted', value: { kind: 'selected', value: option } } });

const entry = (placement: ChatAskEntry['placement'] = 'turn'): ChatAskEntry => ({ askId: 'a', afterEvent: 3, placement, text: 'Why did it stop?', at: fixture.now, allowance: { remainingUsd: 4.58, limitUsd: 5, resetAt: '2026-11-01T00:00:00Z' } });
const ask = (fields: Partial<Ask>): Ask => ({ id: 'a', workItemId: '184', workItemTitle: 'README', askerId: 'demo-operator', askerName: 'Demo operator', audience: 'internal', question: 'Why did it stop?', answer: '', status: 'answered', demo: false, ploegAskId: 'p-1', model: 'ask-model', costUsd: null, costStatus: 'pending', failure: null, source: 'model', intent: null, createdAt: fixture.now, answeredAt: fixture.now, ...fields });
const modelQuestion = 'Which section of the README did the reviewer care about most?';

test('a message names its intent by a leading /ask or /steer, typed or picked from the completion list', () => {
  assert.deepEqual(messageIntent({ text: '/ask why did it stop?' }), { intent: 'ask', text: 'why did it stop?' });
  assert.deepEqual(messageIntent({ text: '  /STEER  make it shorter' }), { intent: 'steer', text: 'make it shorter' });
  assert.deepEqual(messageIntent({ text: 'why did it stop?', attachments: [{ type: 'simple', label: '/ask', displayKind: 'command', _meta: { command: 'ask' } }] }), { intent: 'ask', text: 'why did it stop?' });
  assert.deepEqual(messageIntent({ text: 'why did it stop?' }), { text: 'why did it stop?' });
  assert.deepEqual(messageIntent({ text: '/asking is not a command' }), { text: '/asking is not a command' });
});

test('typing / at the start of a message lists /ask, and /steer only where a message is an Ask by default', () => {
  const running = commandCompletions('/', 1, false);
  assert.deepEqual(running.map(item => item.insertText), ['/ask ']);
  assert.deepEqual(running[0].attachment, { type: 'simple', label: '/ask', _meta: { command: 'ask', description: running[0].attachment._meta.description, argumentHint: 'question' } });
  assert.match(running[0].attachment._meta.description, /never read by the crew/);
  assert.deepEqual(running[0].rangeStart, 0);
  assert.deepEqual(running[0].rangeEnd, 1);
  assert.deepEqual(commandCompletions('/st', 3, true).map(item => item.insertText), ['/steer ']);
  assert.deepEqual(commandCompletions('/', 1, true).map(item => item.insertText), ['/ask ', '/steer ']);
  assert.deepEqual(commandCompletions('why /', 5, true), [], 'only at the start of the message');
});

test('an Ask reads as an Ask in the chat: its badge, the answer or why there is none, and its spend', () => {
  const answered = askMarkdown(ask({ answer: 'It stopped.', costUsd: 0.0123 }), entry());
  assert.match(answered, /^\*\*Ask\*\* · not sent to the crew\n\nIt stopped\.\n\n\*US\$\s0,01 \(not settled yet\) · US\$\s4,58 of US\$\s5,00 left this month, until 1 November\*$/);
  assert.match(askMarkdown(ask({ answer: 'It stopped.' }), entry()), /\*cost pending in Ploeg · /);
  assert.match(askMarkdown(ask({ answer: 'It stopped.', ploegAskId: null, model: null, costUsd: 0, costStatus: 'settled', source: 'record', intent: 'why' }), entry()), /\*Answered from the record · no model call\*$/);
  assert.match(askMarkdown(ask({ answer: 'It stopped.', demo: true, costStatus: 'demo', ploegAskId: null, source: 'record' }), entry()), /\*Demo · answered from the record · no model call, nothing spent\*$/);
  assert.match(askMarkdown(ask({ status: 'refused', demo: true, costStatus: 'demo', ploegAskId: null, failure: 'This is a demo: there is no model to ask, so nothing was asked or spent.' }), entry()), /\*Demo · no model call, nothing spent\*$/);
  const refused = askMarkdown(ask({ status: 'refused', ploegAskId: null, costUsd: 0, costStatus: 'settled', failure: 'Ask Allowance used up. It resets on 1 November.' }), entry());
  assert.match(refused, /Not answered\. Ask Allowance used up\. It resets on 1 November\./);
  assert.match(refused, /Nothing was charged\. An administrator can raise the allowance\./);
  assert.match(askMarkdown(ask({ status: 'answering' }), entry()), /the workbench stopped while it was asking/);
  assert.match(askMarkdown(ask({ answer: 'It stopped.' }), entry('inline')), /^\*\*Ask\*\* · not sent to the crew\n\n> Why did it stop\?\n\nIt stopped\./);
  assert.match(askMarkdown(undefined, entry()), /no longer stored/);
});

test('a message typed into the stopped 059675b9 session is an Ask: answered in its own turn with cost and allowance, never an instruction, and the next steps are offered again', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, id, channel, chat, fakes } = await fixtureSession(t);
  assert.deepEqual(client.initialized.completionTriggerCharacters, ['/'], 'VS Code 1.141 registers its slash-command completion only for a host that names a trigger character');
  const listed = await client.rpc('completions', { kind: 'userMessage', channel, text: '/', offset: 1 });
  assert.deepEqual(listed.items.map((item: Json) => item.insertText), ['/ask ', '/steer ']);
  const snapshot = (await client.rpc('subscribe', { channel: chat })).snapshot.state;
  const closing = await client.until(message => action(message, chat, 'chat/inputRequested'));
  send(client, chat, modelQuestion, 1, 'ask-turn');
  const echo = await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 1);
  assert.equal(echo.params.rejectionReason, undefined);
  assert.equal(echo.params.action.type, 'chat/turnStarted');
  assert.equal(echo.params.action.turnId, 'ask-turn');
  const replaced = client.inbox.find(message => action(message, chat, 'chat/inputCompleted') && message.params.action.requestId === closing.params.action.request.id)!;
  assert.equal(replaced.params.action.response, 'cancel', 'the open "What next?" is answered as replaced');
  const part = await client.until(message => action(message, chat, 'chat/responsePart') && message.params.action.turnId === 'ask-turn');
  assert.match(part.params.action.part.content, new RegExp(`^\\*\\*Ask\\*\\* · not sent to the crew\\n\\n${answerText.replace(/\./g, '\\.')}\\n\\n\\*US\\$\\s0,01 \\(not settled yet\\) · US\\$\\s4,58 of US\\$\\s5,00 left this month, until 1 November\\*$`));
  await client.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === 'ask-turn');
  const again = await client.until(message => action(message, chat, 'chat/inputRequested') && message.params.serverSeq > part.params.serverSeq);
  assert.deepEqual(again.params.action.request.questions[0].options.map((option: Json) => option.id), ['run_again_start', 'run_again', 'dismiss'], 'the next steps come back after the answer');
  const reduced = client.inbox.filter(message => message.method === 'action' && message.params.channel === chat && !message.params.rejectionReason).map(message => message.params.action).reduce(reduceChat, snapshot);
  const asked = reduced.turns.find((turn: Json) => turn.id === 'ask-turn');
  assert.equal(asked.message.text, modelQuestion);
  assert.equal(asked.state, 'complete');
  assert.deepEqual(fakes.admitted, [`184: ${modelQuestion}`], 'Ploeg admitted the Ask on the session\'s Work Item');
  assert.equal(fakes.prompts.length, 1);
  const events = server.app.store.events(id);
  assert(!events.some(event => event.type === 'message' && event.data.role === 'operator'), 'no crew gets the question');
  assert(!JSON.stringify(events).includes(answerText), 'the Ask stays out of the session\'s events');
  assert(!JSON.stringify(events).includes(modelQuestion), 'the question too');
  assert.equal(server.app.store.asksAbout('184', 5)[0].answer, answerText);
  assert.equal(server.app.store.listSessions().length, 1, 'an Ask creates nothing');
});

test('an Ask in the chat survives a restart: the rebuilt chat shows it in the same place with the same words', { timeout: testTimeout(90_000) }, async t => {
  const { server, client, chat } = await fixtureSession(t);
  await client.rpc('subscribe', { channel: chat });
  await client.until(message => action(message, chat, 'chat/inputRequested'));
  send(client, chat, modelQuestion, 1, 'ask-turn');
  const part = await client.until(message => action(message, chat, 'chat/responsePart') && message.params.action.turnId === 'ask-turn');
  await client.until(message => action(message, chat, 'chat/inputRequested') && message.params.serverSeq > part.params.serverSeq);
  const before = (await client.rpc('subscribe', { channel: chat })).snapshot.state.turns;
  client.close();
  await server.restart();
  const after = await attach(server, 'asks-after-restart');
  t.after(() => after.close());
  const turns = (await after.rpc('subscribe', { channel: chat })).snapshot.state.turns;
  assert.deepEqual(askParts(turns), askParts(before));
  assert.deepEqual(turns.map((turn: Json) => turn.message.text), before.map((turn: Json) => turn.message.text), 'the turns are in the same order');
  assert.equal(askParts(turns).length, 1);
});

test('an Ask Allowance that is used up says so with its reset date, and nothing is charged', { timeout: testTimeout(60_000) }, async t => {
  const { client, chat } = await fixtureSession(t, { fakes: { admit: async () => { throw new AskAllowanceUsedUp('2026-11-01T00:00:00Z'); } } });
  await client.rpc('subscribe', { channel: chat });
  send(client, chat, modelQuestion, 1, 'refused-turn');
  const part = await client.until(message => action(message, chat, 'chat/responsePart') && message.params.action.turnId === 'refused-turn');
  assert.match(part.params.action.part.content, /Not answered\. Ask Allowance used up\. It resets on 1 November\./);
  assert.match(part.params.action.part.content, /Nothing was charged/);
});

test('when Asks are unavailable the message becomes the message choice, which says why, and steers only if the person picks it', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, id, chat } = await fixtureSession(t, { fakes: { gatewayUrl: undefined } });
  await client.rpc('subscribe', { channel: chat });
  send(client, chat, 'Make the readme shorter.', 1, 'unasked-turn');
  const asked = await client.until(message => action(message, chat, 'chat/inputRequested') && message.params.action.request.message === 'No crew will read this message');
  assert.deepEqual(asked.params.action.request.questions[0].options.map((option: Json) => option.id), ['run_again_start', 'run_again', 'dismiss'], 'no Ask instead when asking is what failed');
  const explanation = client.inbox.find(message => action(message, chat, 'chat/responsePart') && message.params.action.turnId === 'unasked-turn' && message.params.action.part.kind === 'markdown')!;
  assert.match(explanation.params.action.part.content, /It was not answered as an Ask either: Asking needs a connected Ploeg and model gateway\./);
  assert(!server.app.store.events(id).some(event => event.type === 'message' && event.data.role === 'operator'));
  assert.equal(server.app.store.asksAbout('184', 5).length, 0);
});

test('/steer in the stopped session offers today\'s message choice with Ask instead, which answers in that choice\'s turn', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, id, chat, fakes } = await fixtureSession(t);
  await client.rpc('subscribe', { channel: chat });
  send(client, chat, '/steer Which reviewer remark mattered most?', 1, 'steer-turn');
  const choice = (await client.until(message => action(message, chat, 'chat/inputRequested') && message.params.action.request.message === 'No crew will read this message')).params.action.request;
  assert.deepEqual(choice.questions[0].options.map((option: Json) => option.label), ['Run again and start', 'Run again with this message', 'Ask instead', 'Cancel']);
  assert.match(choice.questions[0].message, /\*\*Ask instead\*\*: your message is answered at once as an Ask about this work\. No crew reads it/);
  assert.deepEqual(fakes.admitted, [], '/steer asks nothing');
  client.notify('dispatchAction', { channel: chat, clientSeq: 2, action: { type: 'chat/inputCompleted', requestId: choice.id, response: 'accept', answers: picked('ask') } });
  const part = await client.until(message => action(message, chat, 'chat/responsePart') && message.params.action.turnId === 'steer-turn' && message.params.action.part.content?.startsWith('**Ask**'));
  assert.match(part.params.action.part.content, new RegExp(answerText.slice(0, 20)));
  await client.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === 'steer-turn');
  assert.deepEqual(fakes.admitted, ['184: Which reviewer remark mattered most?']);
  assert.equal(server.app.store.listSessions().length, 1);
  assert(server.app.store.events(id).some(event => event.type === choiceEvents.answered && event.data.option === 'ask'));
});

test('in a running session a message steers by default, and /ask sent while the crew works is answered inside its turn without reaching the crew', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, id, channel, chat, fakes } = await fixtureSession(t, { status: 'running' });
  const listed = await client.rpc('completions', { kind: 'userMessage', channel, text: '/', offset: 1 });
  assert.deepEqual(listed.items.map((item: Json) => item.insertText), ['/ask '], 'a running session lists /ask only; a plain message already steers');
  const snapshot = (await client.rpc('subscribe', { channel: chat })).snapshot.state;
  assert.ok(snapshot.activeTurn, 'the crew\'s turn is open');
  const crewTurn = snapshot.activeTurn.id;
  client.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/pendingMessageSet', kind: 'steering', id: 'pending-1', message: { text: '/ask which part of the README is the reviewer reading?', origin: { kind: 'user' } } } });
  const part = await client.until(message => action(message, chat, 'chat/responsePart') && message.params.action.part.content?.startsWith('**Ask**'));
  assert.equal(part.params.action.turnId, crewTurn, 'the answer sits in the crew\'s open turn');
  assert.match(part.params.action.part.content, /^\*\*Ask\*\* · not sent to the crew\n\n> which part of the README is the reviewer reading\?\n\n/);
  await client.until(message => action(message, chat, 'chat/pendingMessageRemoved'));
  assert.deepEqual(fakes.admitted, ['184: which part of the README is the reviewer reading?']);
  assert(!server.app.store.events(id).some(event => event.type === 'message' && event.data.role === 'operator'), 'the crew never reads it');
  assert.equal(server.app.store.getSession(id)!.status, 'running');
});

test('a completed session keeps its composer while Asks can answer about its Work Item, and a message there is an Ask', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, id, channel, chat, fakes } = await fixtureSession(t, { status: 'completed' });
  const state = (await client.rpc('subscribe', { channel })).snapshot.state;
  assert.equal(state.chats[0].interactivity, 'full');
  await client.rpc('subscribe', { channel: chat });
  send(client, chat, 'Which wording did the README end up with?', 1, 'done-turn');
  const part = await client.until(message => action(message, chat, 'chat/responsePart') && message.params.action.turnId === 'done-turn');
  assert.match(part.params.action.part.content, /^\*\*Ask\*\* · not sent to the crew/);
  assert.deepEqual(fakes.admitted, ['184: Which wording did the README end up with?']);
  assert.equal(server.app.store.getSession(id)!.status, 'completed');
});

test('a standing question is answered from the record: no Ploeg admission, no model call, and the chat says so', { timeout: testTimeout(60_000) }, async t => {
  const { client, chat, fakes } = await fixtureSession(t);
  await client.rpc('subscribe', { channel: chat });
  send(client, chat, 'Why did it stop?', 1, 'record-turn');
  const part = await client.until(message => action(message, chat, 'chat/responsePart') && message.params.action.turnId === 'record-turn');
  assert.match(part.params.action.part.content, /^\*\*Ask\*\* · not sent to the crew\n\n/);
  assert.match(part.params.action.part.content, /\*Answered from the record · no model call\*$/);
  assert.deepEqual(fakes.admitted, []);
  assert.equal(fakes.prompts.length, 0);
});
