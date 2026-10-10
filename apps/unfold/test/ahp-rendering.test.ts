import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, reduceChat, vscodeAgentsWindow, vscodeChangesets, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';
import { diffEntries } from '../src/ahp/host.ts';
import { patchLineCounts } from '../src/candidates.ts';
import { DemoRuntime } from '../src/runtime/demo.ts';
import type { AgentRuntime, ExecutionContext, ExecutionResult, PermissionRequest, RuntimeKind, Workspace } from '../src/types.ts';

const objective = 'Reproduce the rounding regression and fix it with the tests intact.';

async function finishedThroughAgentHost(t: { after: (fn: () => unknown) => void }) {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'rendering' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'rendering', clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
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

test('C9: every candidate file is served whole on both sides, read from the candidate bundle, with the patch\'s line counts', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, id, changeset } = await finishedThroughAgentHost(t);
  const state = (await client.rpc('subscribe', { channel: changeset })).snapshot.state;
  assert.equal(state.status, 'ready');
  const order = state.files.find((file: Json) => file.id === 'src/order.js');
  assert.ok(order, `the candidate lists src/order.js: ${JSON.stringify(state.files.map((file: Json) => file.id))}`);
  assert.equal(order.edit.before.uri, 'file:///workspace/repository/src/order.js');
  assert.equal(order.edit.after.uri, order.edit.before.uri, 'a modified file keeps its path, so VS Code shows an edit, not a creation');
  const read = async (uri: string) => (await client.rpc('resourceRead', { channel: 'ahp-root://', uri })).data as string;
  const before = await read(order.edit.before.content.uri);
  const after = await read(order.edit.after.content.uri);
  assert.match(before, /Math\.round\(amount \* 100\)/, 'the before side is the base file');
  assert.match(after, /Math\.round\(\(amount \+ Number\.EPSILON\) \* 100\)/, 'the after side is the changed file');
  for (const content of [before, after]) assert.doesNotMatch(content, /^diff --git/m, 'no side is a patch');
  const session = server.app.store.listSessions().find(item => item.id === id || server.app.store.getSecret(`ahp-alias:${id}`) === item.id)!;
  const download = await request(server.url, `/api/sessions/${session.id}/candidate/download?format=patch`);
  const counts = patchLineCounts(download.text).get('src/order.js')!;
  assert.deepEqual(order.edit.diff, counts);
  assert.ok(counts.added > 0 && counts.removed > 0);
  const base64 = await client.rpc('resourceRead', { channel: 'ahp-root://', uri: order.edit.after.content.uri, encoding: 'base64' });
  assert.equal(Buffer.from(base64.data, 'base64').toString('utf8'), after);
  await assert.rejects(client.rpc('resourceRead', { channel: 'ahp-root://', uri: `unfold-candidate:/${id}/999/after` }), (error: any) => error.code === -32008);
});

test('C9: patch line counts unquote Git paths and count only hunk lines', () => {
  const patch = [
    'diff --git a/src/a.js b/src/a.js', 'index 1111111..2222222 100644', '--- a/src/a.js', '+++ b/src/a.js', '@@ -1,2 +1,2 @@', ' keep', '-old', '+++counter;', '+new',
    'diff --git "a/docs/caf\\303\\251 \\"x\\".md" "b/docs/caf\\303\\251 \\"x\\".md"', 'new file mode 100644', '--- /dev/null', '+++ "b/docs/caf\\303\\251 \\"x\\".md"', '@@ -0,0 +1 @@', '+hello',
    'diff --git a/logo.png b/logo.png', 'index 3333333..4444444 100644', 'GIT binary patch', 'literal 3', 'KcmZQzU|;|M0RR91', '',
    'diff --git a/with space.txt b/with space.txt', 'deleted file mode 100644', '--- a/with space.txt', '+++ /dev/null', '@@ -1 +0,0 @@', '---dashes', '',
  ].join('\n');
  assert.deepEqual([...patchLineCounts(patch)], [['src/a.js', { added: 2, removed: 1 }], ['docs/café "x".md', { added: 1, removed: 0 }], ['logo.png', { added: 0, removed: 0 }], ['with space.txt', { added: 0, removed: 1 }]]);
  assert.deepEqual(diffEntries(patch).map(entry => [entry.file, entry.after, entry.before]), [['src/a.js', undefined, undefined], ['docs/café "x".md', undefined, undefined], ['logo.png', undefined, undefined], ['with space.txt', undefined, undefined]], 'a patch is never offered as a file\'s content');
});

test('C9: without a captured candidate, a native file diff is served on both sides and a bare patch is not passed off as a file', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'artifacts' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'artifacts' });
  const operator = { id: 'demo-operator', name: 'Demo operator', role: 'operator' as const };
  const create = (title: string) => server.app.engine.create({ title, objective, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  const native = create('Native diff');
  native.artifacts = [{ id: randomUUID(), kind: 'diff', name: 'Writer native file diff', content: JSON.stringify([{ file: 'src/order.js', before: 'old\n', after: 'new\n', additions: 1, deletions: 1 }]) }];
  server.app.store.saveSession(native);
  const patchOnly = create('Patch only');
  patchOnly.artifacts = [{ id: randomUUID(), kind: 'diff', name: 'Workspace changes', content: 'diff --git a/src/order.js b/src/order.js\n--- a/src/order.js\n+++ b/src/order.js\n@@ -1 +1 @@\n-old\n+new\n' }];
  server.app.store.saveSession(patchOnly);

  const files = (await client.rpc('subscribe', { channel: `ahp-changeset:/${native.id}` })).snapshot.state.files;
  assert.equal(files.length, 1);
  assert.deepEqual(files[0].edit.diff, { added: 1, removed: 1 });
  assert.equal((await client.rpc('resourceRead', { channel: 'ahp-root://', uri: files[0].edit.before.content.uri })).data, 'old\n');
  assert.equal((await client.rpc('resourceRead', { channel: 'ahp-root://', uri: files[0].edit.after.content.uri })).data, 'new\n');
  assert.equal((await client.rpc('subscribe', { channel: `ahp-session:/${native.id}` })).snapshot.state.changesets[0].changeKind, 'session');

  assert.equal((await client.rpc('subscribe', { channel: `ahp-session:/${patchOnly.id}` })).snapshot.state.changesets, undefined, 'no changeset is advertised for changes that cannot be shown as files');
  assert.deepEqual((await client.rpc('subscribe', { channel: `ahp-changeset:/${patchOnly.id}` })).snapshot.state.files, []);
});

test('C10: the candidate offers Accept, the workbench\'s own review, under the same authorization, and then offers nothing', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, id, changeset } = await finishedThroughAgentHost(t);
  const state = (await client.rpc('subscribe', { channel: changeset })).snapshot.state;
  assert.deepEqual(state.operations.map((operation: Json) => [operation.id, operation.status, operation.scopes]), [['accept', 'idle', ['changeset']], ['request-changes', 'idle', ['changeset']], ['reject', 'idle', ['changeset']]], 'no disabled operation is advertised');

  server.app.store.addUser({ id: 'bob-render', name: 'bob-render', role: 'operator', passwordHash: 'unused' });
  const bob = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${server.app.agentHost.issueToken({ id: 'bob-render', name: 'bob-render', role: 'operator' })}`);
  t.after(() => bob.close());
  await bob.open;
  await bob.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'bob-render' });
  await assert.rejects(bob.rpc('invokeChangesetOperation', { channel: changeset, operationId: 'accept' }), (error: any) => error.code === -32001, 'another person cannot accept someone else\'s candidate');
  await assert.rejects(client.rpc('invokeChangesetOperation', { channel: changeset, operationId: 'download-bundle' }), (error: any) => error.code === -32602);
  await assert.rejects(client.rpc('invokeChangesetOperation', { channel: changeset, operationId: 'accept', target: { kind: 'resource', resource: 'file:///workspace/repository/src/order.js' } }), (error: any) => error.code === -32602);

  const result = await client.rpc('invokeChangesetOperation', { channel: changeset, operationId: 'accept' });
  assert.match(result.message, /nothing was pushed or merged/);
  const session = server.app.store.listSessions().find(item => item.id === id || server.app.store.getSecret(`ahp-alias:${id}`) === item.id)!;
  assert.equal(session.review?.decision, 'accepted');
  assert.equal(session.review?.by, 'demo-operator');
  assert.equal(server.app.store.events(session.id).filter(event => event.type === 'review.recorded').length, 1);
  const changed = await client.until(message => action(message, changeset, 'changeset/operationsChanged'));
  assert.deepEqual(changed.params.action.operations, []);
  assert.equal((await client.rpc('subscribe', { channel: changeset })).snapshot.state.operations, undefined);
  await assert.rejects(client.rpc('invokeChangesetOperation', { channel: changeset, operationId: 'accept' }), (error: any) => error.code === -32602, 'a candidate is accepted once');
});

const askedQuestions = [
  { question: 'Which rounding rule should money use?', header: 'Rounding', options: [{ label: 'Half up', description: 'Round 0.5 away from zero.' }, { label: 'Half even' }], multiple: false },
  { question: 'Which currencies must the fix cover?', header: 'Currencies', options: [{ label: 'EUR' }, { label: 'USD' }, { label: 'JPY' }], multiple: true, custom: false },
  { question: 'Anything else the crew should know?' },
];

class QuestionRuntime extends DemoRuntime {
  readonly answers: Array<{ decision?: string; answers?: string[][] }> = [];
  private release?: () => void;
  override async execute(context: ExecutionContext): Promise<ExecutionResult> {
    if (context.role.mode === 'read') return { summary: 'Reviewed.', verdict: 'approve', artifacts: [], costUsd: 0 };
    context.emit({ type: 'permission', data: { nativeId: 'native-question-1', kind: 'question', title: 'Agent needs your answer', detail: askedQuestions.map(question => question.question).join('\n'), questions: askedQuestions } });
    await new Promise<void>((resolve, reject) => { this.release = resolve; context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true }); });
    return { summary: 'Applied the answers.', artifacts: [], costUsd: 0 };
  }
  async respond(_workspace: Workspace, _request: PermissionRequest, answer: { decision?: 'once' | 'always' | 'reject'; answers?: string[][] }): Promise<void> { this.answers.push(answer); this.release?.(); }
}

async function asking(t: { after: (fn: () => unknown) => void }) {
  const dataDir = await mkdtemp(join(tmpdir(), 'unfold-ahp-questions-'));
  const runtime = new QuestionRuntime({ dataDir, delayMs: 5 });
  const server = await application('demo', undefined, new Map<RuntimeKind, AgentRuntime>([['demo', runtime]]));
  t.after(() => server.close());
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'questions' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'questions', clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
  const session = `ahp-session:/${randomUUID()}`;
  const chat = defaultChatOf(session);
  await client.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Questions' } });
  for (const channel of [session, chat]) await client.rpc('subscribe', { channel });
  client.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'question-turn', startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } } });
  return { server, runtime, client, session, chat };
}

test('C11: questions carry a message and their choices, answers map back to the options, and a decline is refused with the way out', { timeout: testTimeout(60_000) }, async t => {
  const { server, runtime, client, chat } = await asking(t);
  const requested = await client.until(message => action(message, chat, 'chat/inputRequested'));
  const { request: asked } = requested.params.action;
  assert.match(asked.message, /^Agent needs your answer$/, 'the request names itself and does not repeat the questions');
  for (const question of asked.questions) assert.equal(typeof question.message, 'string', 'every question has the message VS Code requires');
  assert.deepEqual(asked.questions.map((question: Json) => [question.id, question.kind, question.title, question.message]), [
    ['0', 'single-select', 'Rounding', 'Which rounding rule should money use?'],
    ['1', 'multi-select', 'Currencies', 'Which currencies must the fix cover?'],
    ['2', 'text', undefined, 'Anything else the crew should know?'],
  ]);
  assert.deepEqual(asked.questions[0].options, [{ id: '0', label: 'Half up', description: 'Round 0.5 away from zero.' }, { id: '1', label: 'Half even' }]);
  assert.equal(asked.questions[0].allowFreeformInput, true);
  assert.equal(asked.questions[1].allowFreeformInput, false, 'a question that refuses custom answers says so');

  client.notify('dispatchAction', { channel: chat, clientSeq: 2, action: { type: 'chat/inputCompleted', requestId: asked.id, response: 'cancel' } });
  const declined = await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 2);
  assert.match(declined.params.rejectionReason, /cannot decline a question.*stop the turn to pause/);
  assert.deepEqual(runtime.answers, [], 'a decline never reaches the engine');
  assert.equal(server.app.store.permissions(server.app.store.listSessions()[0].id).filter(item => !item.resolved).length, 1, 'the question stays open');

  const answers = {
    '0': { state: 'submitted', value: { kind: 'selected', value: '1' } },
    '1': { state: 'submitted', value: { kind: 'selected-many', value: ['0', '2'] } },
    '2': { state: 'submitted', value: { kind: 'text', value: 'Keep the helper signature.' } },
  };
  client.notify('dispatchAction', { channel: chat, clientSeq: 3, action: { type: 'chat/inputCompleted', requestId: asked.id, response: 'accept', answers } });
  const echoed = await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 3);
  assert.equal(echoed.params.rejectionReason, undefined);
  assert.deepEqual(echoed.params.action, { type: 'chat/inputCompleted', requestId: asked.id, response: 'accept', answers }, 'the echo carries the answers the client sent');
  assert.deepEqual(runtime.answers, [{ answers: [['Half even'], ['EUR', 'JPY'], ['Keep the helper signature.']] }], 'the runtime receives the chosen labels');
});

const chatActions = (client: { inbox: Json[] }, chat: string, upTo = Infinity) => client.inbox.filter(message => message.method === 'action' && message.params.channel === chat && !message.params.rejectionReason && message.params.serverSeq <= upTo).map(message => message.params.action);

test('C12: an answer the crew still waits for moves into the turn an instruction opens, so the client can still answer it', { timeout: testTimeout(60_000) }, async t => {
  const { runtime, client, chat } = await asking(t);
  const requested = await client.until(message => action(message, chat, 'chat/inputRequested'));
  const requestId = requested.params.action.request.id;
  client.notify('dispatchAction', { channel: chat, clientSeq: 2, action: { type: 'chat/turnStarted', turnId: 'steer-turn', startedAt: new Date().toISOString(), message: { text: 'Prefer the rule the finance team uses.', origin: { kind: 'user' } } } });
  const steered = await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 2);
  assert.equal(steered.params.rejectionReason, undefined);
  const raised = await client.until(message => action(message, chat, 'chat/inputRequested') && message.params.serverSeq > steered.params.serverSeq);
  assert.equal(raised.params.action.request.id, requestId);
  const reduced = chatActions(client, chat).reduce(reduceChat, { turns: [] });
  assert.equal(reduced.activeTurn.id, 'steer-turn');
  assert.deepEqual(reduced.activeTurn.responseParts.filter((part: Json) => part.kind === 'inputRequest').map((part: Json) => [part.request.id, part.response]), [[requestId, undefined]], 'the open question is in the active turn the client holds');

  client.notify('dispatchAction', { channel: chat, clientSeq: 3, action: { type: 'chat/inputCompleted', requestId, response: 'accept', answers: { '0': { state: 'submitted', value: { kind: 'selected', value: '0' } }, '1': { state: 'skipped' }, '2': { state: 'skipped' } } } });
  const completed = await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 3);
  assert.equal(completed.params.rejectionReason, undefined);
  const answered = chatActions(client, chat, completed.params.serverSeq).reduce(reduceChat, { turns: [] });
  assert.equal(answered.activeTurn.responseParts.find((part: Json) => part.kind === 'inputRequest' && part.request.id === requestId).response, 'accept');
  assert.deepEqual(runtime.answers, [{ answers: [['Half up'], [], []] }]);
});

test('C12: a brief question opens a host turn when none is active, the way VS Code\'s own host starts host-initiated turns', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'brief' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'brief' });
  const operator = { id: 'demo-operator', name: 'Demo operator', role: 'operator' as const };
  const session = server.app.engine.create({ title: 'Unclear brief', objective, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  await server.app.engine.message(session.id, 'Keep the public rounding helper signature unchanged.', operator);
  const chat = defaultChatOf(`ahp-session:/${session.id}`);
  const snapshot = (await client.rpc('subscribe', { channel: chat })).snapshot.state;
  assert.equal(snapshot.activeTurn, undefined, 'the instruction\'s turn has ended and no turn is active');

  const requestId = randomUUID();
  const questions = ['What should the crew change?', 'How will you know it is done?'];
  server.app.store.savePermission({ id: requestId, sessionId: session.id, runId: session.runs[0].id, nativeId: `brief:${randomUUID()}`, kind: 'question', title: 'The brief needs more before the crew starts', detail: 'It names no observable outcome.', questions: questions.map(question => ({ question })), resolved: false });
  const waiting = server.app.store.getSession(session.id)!;
  waiting.status = 'waiting_input';
  server.app.store.saveSession(waiting);
  server.app.store.appendEvent(session.id, 'brief.unclear', 'system', { reason: 'It names no observable outcome.', questions, requestId });

  const requested = await client.until(message => action(message, chat, 'chat/inputRequested'));
  assert.deepEqual(requested.params.action.request.questions.map((question: Json) => [question.kind, question.message]), questions.map(question => ['text', question]));
  assert.equal(requested.params.action.request.message, 'The brief needs more before the crew starts\n\nIt names no observable outcome.');
  const started = client.inbox.find(message => action(message, chat, 'chat/turnStarted'))!;
  assert.ok(started.params.serverSeq < requested.params.serverSeq, 'the host opens the turn before it asks');
  assert.equal(started.params.action.message.origin.kind, 'systemNotification', 'a host-initiated turn does not pretend the person typed');
  const reduced = chatActions(client, chat).reduce(reduceChat, snapshot);
  assert.equal(reduced.activeTurn.responseParts.at(-1).request.id, requestId, 'the client keeps the question instead of dropping it');
  const subscribed = (await client.rpc('subscribe', { channel: chat })).snapshot.state;
  assert.equal(subscribed.activeTurn.responseParts.at(-1).request.id, requestId, 'a fresh snapshot carries the same open question');
});
