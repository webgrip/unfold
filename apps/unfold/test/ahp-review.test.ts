import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, vscodeAgentsWindow, type AgentHostClient, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';
import { annotationsChannel, changesInstruction, feedbackComments, openComments, parseAnnotationsChannel, reduceAnnotations, reviewOperations } from '../src/ahp/review.ts';
import type { Event, Session } from '../src/types.ts';

const objective = 'Reproduce the rounding regression and fix it with the tests intact.';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/session-059675b9.json', import.meta.url), 'utf8'));
const orderFile = 'file:///workspace/repository/src/order.js';

async function reviewable(t: { after: (fn: () => unknown) => void }) {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'review' } });
  const address = `${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`;
  const client = connect(address);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'review', clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
  const id = randomUUID();
  const session = `ahp-session:/${id}`;
  const chat = defaultChatOf(session);
  await client.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Review' } });
  for (const channel of [session, chat]) await client.rpc('subscribe', { channel });
  client.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'review-turn', startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } } });
  await client.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === 'review-turn');
  const stored = () => server.app.store.listSessions().find(item => item.id === id || server.app.store.getSecret(`ahp-alias:${id}`) === item.id)!;
  await client.until(() => stored().status === 'completed' && stored().candidate?.status === 'ready');
  return { server, client, address, id, session, chat, changeset: `ahp-changeset:/${id}`, annotations: annotationsChannel(session), stored };
}

const comment = (id: string, text: string, line = 11) => ({ id, origin: { session: 'x' }, resource: orderFile, range: { start: { line, character: 0 }, end: { line, character: 4 } }, resolved: false, entries: [{ id: `${id}:0`, text, _meta: { 'vscode.agentFeedback': { author: 'user' } } }], _meta: { 'vscode.agentFeedback': { kind: 'user', state: 'accepted', sessionResource: 'x' } } });
const textAnswer = (value: string) => ({ '0': { state: 'submitted', value: { kind: 'text', value } } });
const completions = (client: AgentHostClient, chat: string) => client.inbox.filter(message => action(message, chat, 'chat/turnComplete') && !message.params.rejectionReason).length;
/** Resolves when the chat completes one more turn than it had when `seen` was counted. */
const turnCompleted = (client: AgentHostClient, chat: string, seen: number) => client.until(() => completions(client, chat) > seen);
const rejection = (client: { inbox: Json[] }, channel: string, type: string) => client.inbox.find(message => message.method === 'action' && message.params.channel === channel && message.params.action.type === type && message.params.rejectionReason);

test('a candidate waiting for review offers Accept, Request changes and Reject, and its chat takes input until it is reviewed', { timeout: testTimeout(60_000) }, async t => {
  const { client, session, chat, changeset } = await reviewable(t);
  const state = (await client.rpc('subscribe', { channel: changeset })).snapshot.state;
  assert.deepEqual(state.operations.map((operation: Json) => [operation.id, operation.label, operation.scopes, operation.status]), [['accept', 'Accept', ['changeset'], 'idle'], ['request-changes', 'Request changes…', ['changeset'], 'idle'], ['reject', 'Reject…', ['changeset'], 'idle']]);
  const chatState = (await client.rpc('subscribe', { channel: chat })).snapshot.state;
  assert.equal(chatState.interactivity, 'full', 'the person can answer a review question and submit comments');
  const sessionState = (await client.rpc('subscribe', { channel: session })).snapshot.state;
  assert.match(sessionState._meta.git.branchName, /\S/, 'VS Code learns the candidate branch from _meta.git');
  assert.equal(sessionState._meta.git.baseBranchName, 'main');
  client.notify('dispatchAction', { channel: chat, clientSeq: 2, action: { type: 'chat/turnStarted', turnId: 'typed', startedAt: new Date().toISOString(), message: { text: 'looks fine', origin: { kind: 'user' } } } });
  const refused = await client.until(message => action(message, chat, 'chat/turnStarted') && message.params.action.turnId === 'typed');
  assert.match(refused.params.rejectionReason, /waits for your review/);
});

test('Reject asks why in the chat and records the rejection with that reason through the review path, once', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, chat, changeset, stored } = await reviewable(t);
  await client.rpc('subscribe', { channel: changeset });
  const result = await client.rpc('invokeChangesetOperation', { channel: changeset, operationId: 'reject' });
  assert.match(result.message, /Nothing is recorded until you do/);
  assert.equal(stored().review, undefined, 'invoking Reject records nothing by itself');
  const asked = (await client.until(message => action(message, chat, 'chat/inputRequested'))).params.action.request;
  assert.equal(asked.questions[0].kind, 'text');
  assert.equal(asked.questions[0].required, true);
  assert.equal(asked.questions[0].title, 'Why do you reject this outcome?');
  const again = await client.rpc('invokeChangesetOperation', { channel: changeset, operationId: 'reject' });
  assert.match(again.message, /Answer the question/, 'a second click points at the open question instead of asking twice');
  assert.equal(server.app.store.events(stored().id).filter(event => event.type === 'choice.offered').length, 1);

  client.notify('dispatchAction', { channel: chat, clientSeq: 2, action: { type: 'chat/inputCompleted', requestId: asked.id, response: 'accept', answers: textAnswer('  ') } });
  await client.until(() => Boolean(rejection(client, chat, 'chat/inputCompleted')));
  assert.match(rejection(client, chat, 'chat/inputCompleted')!.params.rejectionReason, /Say why/);
  assert.equal(stored().review, undefined);

  const seen = completions(client, chat);
  client.notify('dispatchAction', { channel: chat, clientSeq: 3, action: { type: 'chat/inputCompleted', requestId: asked.id, response: 'accept', answers: textAnswer('The fix rounds negative amounts the wrong way.') } });
  await turnCompleted(client, chat, seen);
  assert.equal(stored().review?.decision, 'rejected');
  assert.equal(stored().review?.note, 'The fix rounds negative amounts the wrong way.');
  assert.equal(server.app.store.events(stored().id).filter(event => event.type === 'review.recorded').length, 1);
  const changed = await client.until(message => action(message, changeset, 'changeset/contentChanged') && Array.isArray(message.params.action.operations) && message.params.action.operations.length === 0);
  assert.deepEqual(changed.params.action.operations, []);
  const turns = (await client.rpc('subscribe', { channel: chat })).snapshot.state.turns;
  assert.match(turns.at(-1).responseParts.filter((part: Json) => part.kind === 'markdown').map((part: Json) => part.content).join('\n'), /Rejected by/);
  assert.equal((await client.rpc('subscribe', { channel: chat })).snapshot.state.interactivity, 'read-only', 'a reviewed candidate takes no more input');
  await assert.rejects(client.rpc('invokeChangesetOperation', { channel: changeset, operationId: 'reject' }), (error: any) => error.code === -32602);
});

test('skipping the review question records nothing and leaves the candidate waiting for review', { timeout: testTimeout(60_000) }, async t => {
  const { client, chat, changeset, stored } = await reviewable(t);
  await client.rpc('invokeChangesetOperation', { channel: changeset, operationId: 'request-changes' });
  const asked = (await client.until(message => action(message, chat, 'chat/inputRequested'))).params.action.request;
  const seen = completions(client, chat);
  client.notify('dispatchAction', { channel: chat, clientSeq: 2, action: { type: 'chat/inputCompleted', requestId: asked.id, response: 'cancel' } });
  await turnCompleted(client, chat, seen);
  assert.equal(stored().review, undefined);
  assert.equal((await client.rpc('subscribe', { channel: changeset })).snapshot.state.operations.length, 3);
});

test('Request changes records the reason as a rejection and creates the next session, waiting, with the reason and the candidate\'s comments as its instruction', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, session, chat, changeset, annotations, stored } = await reviewable(t);
  const snapshot = (await client.rpc('subscribe', { channel: annotations })).snapshot;
  assert.deepEqual(snapshot.state, { annotations: [] });
  client.notify('dispatchAction', { channel: annotations, clientSeq: 2, action: { type: 'annotations/set', annotation: comment('c1', 'Use Math.round on cents, not on the float.') } });
  await client.until(message => action(message, annotations, 'annotations/set') && !message.params.rejectionReason);
  client.notify('dispatchAction', { channel: annotations, clientSeq: 3, action: { type: 'annotations/entrySet', annotationId: 'c1', entry: { id: 'c1:r0', text: 'And add a test for -0.005.' } } });
  await client.until(message => action(message, annotations, 'annotations/entrySet') && !message.params.rejectionReason);
  assert.equal((await client.rpc('subscribe', { channel: session })).snapshot.state.annotations.annotationCount, 1);

  await client.rpc('invokeChangesetOperation', { channel: changeset, operationId: 'request-changes' });
  const asked = (await client.until(message => action(message, chat, 'chat/inputRequested'))).params.action.request;
  assert.equal(asked.questions[0].title, 'What should change?');
  assert.equal(asked.questions[0].required, false, 'with comments on the candidate, a reason is optional');
  assert.match(asked.questions[0].message, /src\/order\.js` line 12: Use Math\.round on cents/);
  const seen = completions(client, chat);
  client.notify('dispatchAction', { channel: chat, clientSeq: 4, action: { type: 'chat/inputCompleted', requestId: asked.id, response: 'accept', answers: textAnswer('Handle negative amounts too.') } });
  const added = await client.until(message => message.method === 'root/sessionAdded' && message.params.summary.resource !== session);
  const previous = stored();
  assert.equal(previous.review?.decision, 'rejected');
  assert.equal(previous.review?.note, 'Handle negative amounts too.');
  const next = server.app.store.listSessions().find(item => item.previousSessionId === previous.id)!;
  assert.ok(next, 'the next session links back to this one');
  assert.equal(next.status, 'queued', 'the next session waits for an explicit start');
  assert.equal(next.objective, previous.objective);
  assert.ok(added.params.summary.resource.endsWith(next.id));
  const instructions = server.app.store.events(next.id).filter(event => event.type === 'message').map(event => (event.data as Json).text);
  assert.equal(instructions.length, 1);
  assert.match(instructions[0], /Handle negative amounts too\./);
  assert.match(instructions[0], /`src\/order\.js` line 12: Use Math\.round on cents, not on the float\.\n {2}- Reply: And add a test for -0\.005\./);
  assert.ok(server.app.store.events(previous.id).some(event => event.type === 'session.run_again' && (event.data as Json).sessionId === next.id));
  await turnCompleted(client, chat, seen);
  const turns = (await client.rpc('subscribe', { channel: chat })).snapshot.state.turns;
  assert.match(turns.at(-1).responseParts.filter((part: Json) => part.kind === 'markdown').map((part: Json) => part.content).join('\n'), /Created a new session/);
});

test('comments submitted from VS Code\'s feedback on a candidate open Request changes in the person\'s own turn, and need no further words', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, session, chat, annotations, stored } = await reviewable(t);
  await client.rpc('subscribe', { channel: annotations });
  client.notify('dispatchAction', { channel: annotations, clientSeq: 2, action: { type: 'annotations/set', annotation: comment('c2', 'Name the constant.', 3) } });
  await client.until(message => action(message, annotations, 'annotations/set') && !message.params.rejectionReason);
  const message = { text: '/act-on-feedback', origin: { kind: 'user' }, attachments: [{ type: 'annotations', label: '1 comment', displayKind: 'agentFeedback', resource: annotations, annotationIds: ['c2'], _meta: { agentFeedback: { sessionResource: 'x', feedbackItems: [{ id: 'c2', text: 'Name the constant.', resourceUri: 'vscode-agent-host://host/file/-/workspace/repository/src/order.js', range: { start: { line: 3, character: 0 }, end: { line: 4, character: 0 } } }] } } }] };
  client.notify('dispatchAction', { channel: chat, clientSeq: 3, action: { type: 'chat/turnStarted', turnId: 'feedback-turn', startedAt: new Date().toISOString(), message } });
  const started = await client.until(m => action(m, chat, 'chat/turnStarted') && m.params.action.turnId === 'feedback-turn');
  assert.equal(started.params.rejectionReason, undefined, 'the feedback turn is accepted');
  const asked = (await client.until(m => action(m, chat, 'chat/inputRequested'))).params.action.request;
  assert.equal(asked.questions[0].required, false);
  client.notify('dispatchAction', { channel: chat, clientSeq: 4, action: { type: 'chat/inputCompleted', requestId: asked.id, response: 'accept', answers: textAnswer('') } });
  await client.until(m => m.method === 'root/sessionAdded' && m.params.summary.resource !== session);
  assert.equal(stored().review?.note, 'Requested changes in one comment on the candidate.');
  const next = server.app.store.listSessions().find(item => item.previousSessionId === stored().id)!;
  const [instruction] = server.app.store.events(next.id).filter(event => event.type === 'message').map(event => (event.data as Json).text);
  assert.match(instruction, /`src\/order\.js` line 4-5: Name the constant\./);
});

test('feedback sent while the crew can still read it becomes an instruction naming each file and line', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const operator = { id: 'demo-operator', name: 'Demo operator', role: 'operator' as const };
  const created = server.app.engine.create({ title: 'Paused', objective, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  server.app.store.saveSession({ ...created, status: 'paused' });
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'paused' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'paused', clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true } });
  const chat = defaultChatOf(`ahp-session:/${created.id}`);
  await client.rpc('subscribe', { channel: chat });
  const message = { text: '/act-on-feedback', origin: { kind: 'user' }, attachments: [{ type: 'simple', label: '1 comment', modelRepresentation: 'The following comments were made on the code changes:', _meta: { agentFeedback: { sessionResource: 'x', feedbackItems: [{ id: 'c3', text: 'Keep the old name.', resourceUri: orderFile, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, replies: ['Agreed'] }] } } }] };
  client.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'paused-feedback', startedAt: new Date().toISOString(), message } });
  await client.until(() => server.app.store.events(created.id).some(event => event.type === 'message'));
  const recorded = server.app.store.events(created.id).find(event => event.type === 'message')!.data as Json;
  assert.equal(recorded.text, 'Comments on the change:\n- `src/order.js` line 1: Keep the old name.\n  - Reply: Agreed');
  assert.equal(recorded.role, 'operator');
});

test('VS Code\'s Agent Merge accepts a candidate waiting for review and cannot be turned off again; it merges nothing', { timeout: testTimeout(60_000) }, async t => {
  const { client, session, changeset, stored } = await reviewable(t);
  client.notify('dispatchAction', { channel: session, clientSeq: 2, action: { type: 'session/configChanged', config: { agentMerge: { enabled: true, overrides: { mergePullRequest: 'never' } } } } });
  const echoed = await client.until(message => action(message, session, 'session/configChanged'));
  assert.equal(echoed.params.rejectionReason, undefined);
  assert.equal(stored().review?.decision, 'accepted');
  assert.deepEqual((await client.rpc('subscribe', { channel: session })).snapshot.state.config.values.agentMerge, { enabled: true });
  assert.deepEqual((await client.rpc('subscribe', { channel: changeset })).snapshot.state.operations, undefined);
  client.notify('dispatchAction', { channel: session, clientSeq: 3, action: { type: 'session/configChanged', config: { agentMerge: { enabled: false } } } });
  await client.until(() => Boolean(rejection(client, session, 'session/configChanged')));
  assert.match(rejection(client, session, 'session/configChanged')!.params.rejectionReason, /cannot be withdrawn/);
  assert.equal(stored().review?.decision, 'accepted');
});

test('the 059675b9 session offers no review and refuses Agent Merge: nothing waits for review', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const operator = { id: 'demo-operator', name: 'Demo operator', role: 'operator' as const };
  const created = server.app.engine.create({ title: fixture.session.title, objective: fixture.session.objective, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  const stopped: Session = { ...created, ...fixture.session, placement: undefined, approval: undefined, id: created.id, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', ownerId: created.ownerId, ownerName: created.ownerName, runs: fixture.session.runs.map((run: Json) => ({ ...run, sessionId: created.id })) };
  server.app.store.saveSession(stopped);
  for (const event of fixture.events as Event[]) server.app.store.appendEvent(created.id, event.type, event.actor, event.data, event.runId);
  assert.deepEqual(reviewOperations(stopped, false), []);
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'fixture' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'fixture', clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true } });
  const session = `ahp-session:/${created.id}`;
  await client.rpc('subscribe', { channel: session });
  client.notify('dispatchAction', { channel: session, clientSeq: 1, action: { type: 'session/configChanged', config: { agentMerge: { enabled: true } } } });
  await client.until(() => Boolean(rejection(client, session, 'session/configChanged')));
  assert.match(rejection(client, session, 'session/configChanged')!.params.rejectionReason, /waits for your review; this session has none/);
  assert.equal(server.app.store.getSession(created.id)!.review, undefined);
});

test('annotations are kept with the session for the people who may see it, and another person can neither read nor add any', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, address, id, annotations } = await reviewable(t);
  await client.rpc('subscribe', { channel: annotations });
  client.notify('dispatchAction', { channel: annotations, clientSeq: 2, action: { type: 'annotations/set', annotation: { id: 'bad', resource: orderFile, entries: [] } } });
  await client.until(() => Boolean(rejection(client, annotations, 'annotations/set')));
  client.notify('dispatchAction', { channel: annotations, clientSeq: 3, action: { type: 'annotations/set', annotation: comment('kept', 'Keep me.') } });
  await client.until(message => action(message, annotations, 'annotations/set') && !message.params.rejectionReason);

  const again = connect(address);
  t.after(() => again.close());
  await again.open;
  await again.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'review-two' });
  const spelledByProvider = `unfold:/${id}/annotations`;
  assert.deepEqual((await again.rpc('subscribe', { channel: spelledByProvider })).snapshot.state.annotations.map((annotation: Json) => annotation.id), ['kept'], 'the same channel in either spelling');
  client.notify('dispatchAction', { channel: annotations, clientSeq: 4, action: { type: 'annotations/removed', annotationId: 'kept' } });
  const removed = await again.until(message => action(message, spelledByProvider, 'annotations/removed'));
  assert.equal(removed.params.action.annotationId, 'kept', 'another client of the same person sees the change in its own spelling');

  server.app.store.addUser({ id: 'bob-review', name: 'bob-review', role: 'operator', passwordHash: 'unused' });
  const bob = connect(`${address.split('?')[0]}?tkn=${server.app.agentHost.issueToken({ id: 'bob-review', name: 'bob-review', role: 'operator' })}`);
  t.after(() => bob.close());
  await bob.open;
  await bob.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'bob-review' });
  await assert.rejects(bob.rpc('subscribe', { channel: annotations }), (error: any) => error.code === -32001);
  bob.notify('dispatchAction', { channel: annotations, clientSeq: 1, action: { type: 'annotations/set', annotation: comment('bob', 'Mine now.') } });
  await bob.until(message => action(message, annotations, 'annotations/set'));
  assert.equal(bob.inbox.find(message => action(message, annotations, 'annotations/set'))!.params.rejectionReason, 'Session not found');
  await assert.rejects(bob.rpc('invokeChangesetOperation', { channel: `ahp-changeset:/${id}`, operationId: 'reject' }), (error: any) => error.code === -32001);
});

test('feedback comments are read from both attachment shapes VS Code 1.141 sends, with file paths and one-based lines', () => {
  const annotation = comment('a1', 'From the channel.', 9);
  const comments = feedbackComments({ attachments: [
    { type: 'annotations', annotationIds: ['a1'] },
    { type: 'simple', _meta: { agentFeedback: { feedbackItems: [{ id: 'f1', text: { markdown: 'Rename **this**.' }, resourceUri: 'vscode-agent-host://h/file/-/workspace/repository/lib/a%20b.ts', range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } }, replies: ['ok'] }, { id: 'empty', text: '', resourceUri: orderFile }] } } },
  ] }, [annotation]);
  assert.deepEqual(comments, [{ id: 'a1', path: 'src/order.js', lines: '10', text: 'From the channel.', replies: [] }, { id: 'f1', path: 'lib/a b.ts', lines: '1-3', text: 'Rename **this**.', replies: ['ok'] }]);
  assert.deepEqual(feedbackComments({ text: 'plain' }), []);
  assert.deepEqual(openComments([annotation, { ...comment('r', 'Resolved.'), resolved: true }, { ...comment('s', 'Sent.'), _meta: { 'vscode.agentFeedback': { state: 'submitted' } } }]).map(item => item.id), ['a1']);
  assert.equal(changesInstruction({ title: 'Fix' } as Session, '', comments.slice(0, 1)), 'Changes were requested on the candidate of the previous session, "Fix".\n\nComments on the candidate\'s files:\n- `src/order.js` line 10: From the channel.');
});

test('the annotations reducer follows AHP and keeps the host\'s limits', () => {
  const first = reduceAnnotations([], { type: 'annotations/set', annotation: comment('a', 'One.') }) as Json[];
  assert.equal(first.length, 1);
  assert.equal((reduceAnnotations(first, { type: 'annotations/updated', annotationId: 'a', resolved: true }) as Json[])[0].resolved, true);
  assert.deepEqual(reduceAnnotations(first, { type: 'annotations/updated', annotationId: 'missing', resolved: true }), first, 'an unknown id is a no-op');
  assert.equal((reduceAnnotations(first, { type: 'annotations/entrySet', annotationId: 'a', entry: { id: 'a:1', text: 'Two.' } }) as Json[])[0].entries.length, 2);
  assert.equal((reduceAnnotations(first, { type: 'annotations/entryRemoved', annotationId: 'a', entryId: 'a:0' }) as Json[])[0].entries.length, 0);
  assert.deepEqual(reduceAnnotations(first, { type: 'annotations/removed', annotationId: 'a' }), []);
  assert.equal(typeof reduceAnnotations(first, { type: 'annotations/set', annotation: { ...comment('b', 'x'), entries: [{ id: 'e', text: 'y'.repeat(8001) }] } }), 'string');
  assert.equal(typeof reduceAnnotations(first, { type: 'annotations/cleared' }), 'string');
  assert.deepEqual(parseAnnotationsChannel('ahp-session:/abc/annotations'), { id: 'abc', session: 'ahp-session:/abc' });
  assert.deepEqual(parseAnnotationsChannel('unfold:/abc/annotations'), { id: 'abc', session: 'unfold:/abc' });
  assert.equal(parseAnnotationsChannel('ahp-session:/abc'), undefined);
});

test('a task imported from a tracker is offered Accept and Reject but not Request changes, which would need a new import', () => {
  const session = { status: 'completed', sourceTask: { key: 'x' } } as unknown as Session;
  assert.deepEqual(reviewOperations(session, false).map(operation => operation.id), ['accept', 'reject']);
  assert.deepEqual(reviewOperations({ ...session, sourceTask: undefined } as Session, true), [], 'a delivery policy hands the review to the forge');
});

