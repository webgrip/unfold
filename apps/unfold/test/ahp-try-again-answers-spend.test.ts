import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, reduceChat, vscodeAgentsWindow, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';
import { choiceEvents } from '../src/ahp/host.ts';
import { booleanAnswer, declineEvents, declinedAnswerText, declinedAnswers, yesNoLabels } from '../src/ahp/questions.ts';
import { initialSpend, observeSpend, spendLine } from '../src/ahp/spend.ts';
import { resumable, resumeRefusal, turnResumedEvent } from '../src/ahp/try-again.ts';
import { executionFailure } from '../src/failures.ts';
import { DemoRuntime } from '../src/runtime/demo.ts';
import type { AgentRuntime, ExecutionContext, ExecutionResult, PermissionRequest, RuntimeKind, Workspace } from '../src/types.ts';

const operator = { id: 'demo-operator', name: 'Demo operator', role: 'operator' as const };
const objective = 'Round half up in the order totals.';
const usd = (text: string) => text.replace(/\s/g, ' ');

test('a yes/no question is a boolean question, and its answer is the crew\'s own label', () => {
  const choices = [{ label: 'No' }, { label: 'Yes.' }];
  assert.deepEqual(yesNoLabels({}, choices), { yes: 'Yes.', no: 'No' });
  assert.equal(booleanAnswer({}, choices, true), 'Yes.');
  assert.equal(booleanAnswer({}, choices, false), 'No');
  assert.throws(() => booleanAnswer({}, choices, 'true'), /not a yes or no/);
  assert.equal(yesNoLabels({ multiple: true }, choices), undefined, 'several answers are not a yes or no');
  assert.equal(yesNoLabels({}, [{ label: 'Yes', description: 'Ship it now.' }, { label: 'No' }]), undefined, 'a description would be lost');
  assert.equal(yesNoLabels({}, [{ label: 'Yes' }, { label: 'No' }, { label: 'Later' }]), undefined);
  assert.equal(yesNoLabels({}, [{ label: 'Half up' }, { label: 'Half even' }]), undefined);
});

test('a declined request answers every question explicitly and records each as skipped with that text', () => {
  const request: PermissionRequest = { id: 'r1', sessionId: 's', runId: '', nativeId: 'n', kind: 'question', title: 'Q', detail: '', questions: [{ question: 'A?' }, { question: 'B?' }] };
  const text = declinedAnswerText(operator);
  assert.match(text, /^Declined by Demo operator: no answer will be given\./);
  assert.deepEqual(declinedAnswers(request, operator), { answers: [[text], [text]], recorded: { '0': { state: 'skipped', freeformValues: [text] }, '1': { state: 'skipped', freeformValues: [text] } } });
  assert.deepEqual(declinedAnswers({ ...request, questions: [] }, operator).answers, [[text]], 'a request without questions still gets one answer');
});

test('spend: one line against the budget, and a notice once per threshold crossed', () => {
  const state = initialSpend({ budgetUsd: 12, costStatus: 'pending' }, [{ type: 'budget.increased', data: { amountUsd: 4, totalBudgetUsd: 12 } }]);
  assert.equal(state.budgetUsd, 8, 'the budget before a later increase');
  assert.equal(usd(spendLine(state)), 'Spend not reported yet · budget US$ 8,00.');
  assert.equal(observeSpend(state, { type: 'budget.observed', data: { observedUsd: 1.2 } }), undefined, 'under half the budget says nothing');
  assert.equal(usd(spendLine(state)), 'Spent US$ 1,20 of US$ 8,00 · observed, not settled.');
  assert.equal(usd(observeSpend(state, { type: 'budget.observed', data: { observedUsd: 4 } })!), 'Spent US$ 4,00 of US$ 8,00 · observed, not settled · 50 % of the budget.');
  assert.equal(observeSpend(state, { type: 'budget.observed', data: { observedUsd: 5 } }), undefined, 'each threshold is said once');
  assert.equal(usd(observeSpend(state, { type: 'budget.settled', data: { spentUsd: 8.1, costStatus: 'settled' } })!), 'Spent US$ 8,10 of US$ 8,00 · 100 % of the budget.', 'jumping past 80 % names the highest threshold');
  assert.equal(observeSpend(state, { type: 'budget.increased', data: { amountUsd: 4, totalBudgetUsd: 12 } }), undefined);
  assert.equal(usd(observeSpend(state, { type: 'budget.observed', data: { observedUsd: 8.2 } })!), 'Spent US$ 8,20 of US$ 12,00 · observed, not settled · 50 % of the budget.', 'a raised budget starts the thresholds again');
  const demo = initialSpend({ budgetUsd: 1, costStatus: 'demo' }, []);
  assert.equal(observeSpend(demo, { type: 'budget.observed', data: { observedUsd: 1 } }), undefined);
  assert.equal(spendLine(demo), 'Demo · no model calls or spend.');
});

test('Try Again applies only to the last failed turn of a session the Run-again path accepts', () => {
  const failed = { status: 'failed' as const };
  const turns = [{ id: 't1', state: 'error', responseParts: [{ kind: 'markdown' }, { kind: 'error', resumable: true }] }];
  assert.equal(resumable(failed), true);
  assert.equal(resumable({ ...failed, sourceTask: {} as never }), false);
  assert.equal(resumable({ status: 'interrupted' }), false);
  assert.equal(resumeRefusal(failed, turns, undefined, 't1', false), undefined);
  assert.match(resumeRefusal(failed, turns, undefined, 't1', true)!, /Viewers/);
  assert.match(resumeRefusal(failed, turns, { id: 't2' }, 't1', false)!, /still running/);
  assert.match(resumeRefusal(failed, turns, undefined, 't0', false)!, /only to the last turn/);
  assert.match(resumeRefusal(failed, [{ ...turns[0], responseParts: [{ kind: 'error' }] }], undefined, 't1', false)!, /cannot be tried again/);
  assert.match(resumeRefusal({ status: 'completed' }, turns, undefined, 't1', false)!, /Only a failed session/);
});

async function attached(t: { after: (fn: () => unknown) => void }, runtimes?: Map<RuntimeKind, AgentRuntime>) {
  const server = await application('demo', undefined, runtimes);
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'try-again' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'try-again', clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
  return { server, client };
}

const chatActions = (client: { inbox: Json[] }, chat: string) => client.inbox.filter(message => message.method === 'action' && message.params.channel === chat && !message.params.rejectionReason).map(message => message.params.action);

test('a failed session ends its turn with a resumable error, and Try Again creates a new session that waits, only when pressed', { timeout: testTimeout(60_000) }, async t => {
  const { server, client } = await attached(t);
  const { store } = server.app;
  const created = server.app.engine.create({ title: 'Fails', objective, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  const failure = executionFailure('connectivity', 'workspace', 'not_submitted');
  store.saveSession({ ...created, status: 'failed', failure });
  store.appendEvent(created.id, 'session.failed', 'system', { code: failure.category, message: failure.message });
  const chat = defaultChatOf(`ahp-session:/${created.id}`);
  const snapshot = (await client.rpc('subscribe', { channel: chat })).snapshot.state;
  const last = snapshot.turns.at(-1);
  assert.equal(last.state, 'error');
  assert.deepEqual(last.responseParts.at(-1), { kind: 'error', error: { errorType: failure.category, message: failure.message }, resumable: true }, 'the error is the last part and resumable, which is what shows Try Again');
  assert.equal(store.listSessions().length, 1, 'nothing runs again by itself');
  assert.equal(store.events(created.id).some(event => event.type === choiceEvents.offered), false, 'no "What next?" turn buries the Try Again button');

  client.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/turnResume', turnId: 'not-the-turn' } });
  const refused = await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 1);
  assert.match(refused.params.rejectionReason, /only to the last turn/);

  client.notify('dispatchAction', { channel: chat, clientSeq: 2, action: { type: 'chat/turnResume', turnId: last.id } });
  const echo = await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 2);
  assert.equal(echo.params.rejectionReason, undefined);
  assert.deepEqual(echo.params.action, { type: 'chat/turnResume', turnId: last.id }, 'the echo carries the client\'s origin, as VS Code waits for');
  const done = await client.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === last.id);
  assert.ok(done.params.serverSeq > echo.params.serverSeq);
  const next = store.listSessions().find(session => session.id !== created.id)!;
  assert.equal(next.status, 'queued', 'Try Again takes the Run-again path: a new session that waits for its start');
  assert.equal(next.previousSessionId, created.id);
  assert.equal(store.getSession(created.id)!.status, 'failed', 'the failed session stays as it is');
  assert.deepEqual(store.events(created.id).filter(event => event.type === turnResumedEvent).map(event => event.data.sessionId), [next.id]);

  const reduced = chatActions(client, chat).reduce((state: Json, item: Json) => item.type === 'chat/turnResume' ? { ...state, turns: state.turns.slice(0, -1), activeTurn: state.turns.at(-1) } : reduceChat(state, item), snapshot);
  assert.equal(reduced.activeTurn, undefined);
  assert.equal(reduced.turns.at(-1).id, last.id);
  assert.equal(reduced.turns.at(-1).state, 'complete');
  assert.match(reduced.turns.at(-1).responseParts.at(-1).content, /^Created a new session, \*\*Fails\*\*.*\n\nNothing runs until you start it/s);
  const replayed = (await client.rpc('subscribe', { channel: chat })).snapshot.state.turns.at(-1);
  assert.deepEqual([replayed.id, replayed.state, replayed.responseParts.at(-1).content], [last.id, 'complete', reduced.turns.at(-1).responseParts.at(-1).content], 'a fresh snapshot tells the same story');

  client.notify('dispatchAction', { channel: chat, clientSeq: 3, action: { type: 'chat/turnResume', turnId: last.id } });
  const again = await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 3);
  assert.match(again.params.rejectionReason, /only when it failed/, 'pressing it twice creates nothing twice');
  assert.equal(store.listSessions().length, 2);
});

test('a failure of a tracker task offers no Try Again', { timeout: testTimeout(60_000) }, async t => {
  const { server, client } = await attached(t);
  const { store } = server.app;
  const created = server.app.engine.create({ title: 'Tracked', objective, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  store.saveSession({ ...created, status: 'failed', sourceTask: { provider: 'vikunja', id: '1', url: 'https://tracker.example/1', title: 'Tracked' } as never });
  store.appendEvent(created.id, 'session.failed', 'system', { code: 'runtime_failure', message: 'It broke.' });
  const chat = defaultChatOf(`ahp-session:/${created.id}`);
  const last = (await client.rpc('subscribe', { channel: chat })).snapshot.state.turns.at(-1);
  assert.equal(last.responseParts.at(-1).kind, 'error');
  assert.equal(last.responseParts.at(-1).resumable, undefined);
});

class AskingRuntime extends DemoRuntime {
  readonly answers: Array<{ answers?: string[][] }> = [];
  private release?: () => void;
  override async execute(context: ExecutionContext): Promise<ExecutionResult> {
    if (context.role.mode === 'read') return { summary: 'Reviewed.', verdict: 'approve', artifacts: [], costUsd: 0 };
    context.emit({ type: 'permission', data: { nativeId: `native-${randomUUID()}`, kind: 'question', title: 'Agent needs your answer', questions: [{ question: 'Keep the helper signature?', options: [{ label: 'Yes' }, { label: 'No' }] }, { question: 'Anything else?' }] } });
    await new Promise<void>((resolve, reject) => { this.release = resolve; context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true }); });
    return { summary: 'Applied the answers.', artifacts: [], costUsd: 0 };
  }
  async respond(_workspace: Workspace, _request: PermissionRequest, answer: { answers?: string[][] }): Promise<void> { this.answers.push(answer); this.release?.(); }
}

async function asked(t: { after: (fn: () => unknown) => void }) {
  const dataDir = await mkdtemp(join(tmpdir(), 'unfold-ahp-answers-'));
  const runtime = new AskingRuntime({ dataDir, delayMs: 5 });
  const { server, client } = await attached(t, new Map<RuntimeKind, AgentRuntime>([['demo', runtime]]));
  t.after(() => rm(dataDir, { recursive: true, force: true, maxRetries: 10 }));
  const session = `ahp-session:/${randomUUID()}`;
  const chat = defaultChatOf(session);
  await client.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Answers' } });
  for (const channel of [session, chat]) await client.rpc('subscribe', { channel });
  client.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'answers-turn', startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } } });
  const requested = await client.until(message => action(message, chat, 'chat/inputRequested'));
  return { server, client, runtime, chat, request: requested.params.action.request as Json };
}

test('a yes/no question renders as VS Code\'s boolean kind and the answer reaches the crew as the label it offered', { timeout: testTimeout(60_000) }, async t => {
  const { client, runtime, chat, request: question } = await asked(t);
  assert.deepEqual(question.questions.map((item: Json) => [item.kind, item.options]), [['boolean', undefined], ['text', undefined]]);
  const answers = { '0': { state: 'submitted', value: { kind: 'boolean', value: false } }, '1': { state: 'submitted', value: { kind: 'text', value: 'No.' } } };
  client.notify('dispatchAction', { channel: chat, clientSeq: 2, action: { type: 'chat/inputCompleted', requestId: question.id, response: 'accept', answers } });
  const echo = await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 2);
  assert.equal(echo.params.rejectionReason, undefined);
  assert.deepEqual(echo.params.action.answers, answers, 'the chat keeps the boolean answer the client sent');
  assert.deepEqual(runtime.answers, [{ answers: [['No'], ['No.']] }]);
});

test('declining a question in VS Code becomes a recorded "declined" answer the crew receives explicitly', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, runtime, chat, request: question } = await asked(t);
  client.notify('dispatchAction', { channel: chat, clientSeq: 2, action: { type: 'chat/inputCompleted', requestId: question.id, response: 'cancel' } });
  const echo = await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 2);
  assert.equal(echo.params.rejectionReason, undefined, 'a decline is accepted, not refused');
  assert.equal(echo.params.action.response, 'decline');
  const text = declinedAnswerText(operator);
  assert.deepEqual(echo.params.action.answers, { '0': { state: 'skipped', freeformValues: [text] }, '1': { state: 'skipped', freeformValues: [text] } });
  assert.deepEqual(runtime.answers, [{ answers: [[text], [text]] }], 'the crew gets an explicit answer for every question');
  const id = server.app.store.listSessions()[0].id;
  assert.deepEqual(server.app.store.events(id).filter(event => event.type === declineEvents.declined).map(event => [event.data.requestId, event.actor]), [[question.id, operator.id]]);
  assert.equal(server.app.store.permissions(id).every(item => item.resolved), true);
  const replayed = (await client.rpc('subscribe', { channel: chat })).snapshot.state;
  const part = [...replayed.turns, ...(replayed.activeTurn ? [replayed.activeTurn] : [])].flatMap((turn: Json) => turn.responseParts).find((item: Json) => item.kind === 'inputRequest' && item.request.id === question.id);
  assert.equal(part.response, 'decline', 'a fresh snapshot shows the question as declined');
});

test('spend arrives as system notifications at each threshold and at the end of a Run, never in usage', { timeout: testTimeout(60_000) }, async t => {
  const { server, client } = await attached(t);
  const { store } = server.app;
  const created = server.app.engine.create({ title: 'Spending', objective, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 8 }, operator);
  const [writer] = created.runs;
  store.saveSession({ ...created, status: 'running', costStatus: 'pending' });
  store.appendEvent(created.id, 'run.started', writer.roleId, { role: writer.roleName, mode: 'write' }, writer.id);
  const chat = defaultChatOf(`ahp-session:/${created.id}`);
  await client.rpc('subscribe', { channel: chat });
  store.appendEvent(created.id, 'usage', 'system', { inputTokens: 10, outputTokens: 5, costUsd: 0.4, source: 'harness-estimate' }, writer.id);
  store.appendEvent(created.id, 'budget.observed', 'system', { observedUsd: 4.1, budgetUsd: 8 });
  store.appendEvent(created.id, 'budget.observed', 'system', { observedUsd: 4.2, budgetUsd: 8 });
  store.appendEvent(created.id, 'budget.observed', 'system', { observedUsd: 6.5, budgetUsd: 8 });
  store.appendEvent(created.id, 'run.finished', writer.roleId, { status: 'completed', summary: 'Done.' }, writer.id);
  await client.until(message => action(message, chat, 'chat/responsePart') && /^Spent .* observed, not settled\.$/.test(message.params.action.part.content ?? ''));
  const notices = chatActions(client, chat).filter(item => item.type === 'chat/responsePart' && item.part.kind === 'systemNotification' && /^Spen/.test(item.part.content)).map(item => usd(item.part.content));
  assert.deepEqual(notices, [
    'Spent US$ 4,10 of US$ 8,00 · observed, not settled · 50 % of the budget.',
    'Spent US$ 6,50 of US$ 8,00 · observed, not settled · 80 % of the budget.',
    'Spent US$ 6,50 of US$ 8,00 · observed, not settled.',
  ]);
  const usage = chatActions(client, chat).find(item => item.type === 'chat/usage')!;
  assert.equal(usage.usage._meta.costUsd, undefined, 'spend is not hidden in usage metadata');
});
