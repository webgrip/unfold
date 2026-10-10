import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, vscodeAgentsWindow, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';
import { parseChannel } from '../src/ahp/host.ts';
import { parseRunChannel, runChatChannel, toolActions } from '../src/ahp/runs.ts';
import type { Event, Session } from '../src/types.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/session-059675b9.json', import.meta.url), 'utf8'));
const operator = { id: 'demo-operator', name: 'Demo operator', role: 'operator' as const };

async function attach(server: Awaited<ReturnType<typeof application>>, t: { after: (fn: () => unknown) => void }, clientId: string, meta?: Json) {
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: clientId } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId, clientInfo: vscodeAgentsWindow, ...(meta ? { _meta: meta } : {}), initialSubscriptions: ['ahp-root://'] });
  return client;
}

async function stopped(t: { after: (fn: () => unknown) => void }) {
  const server = await application();
  t.after(() => server.close());
  const created = server.app.engine.create({ title: fixture.session.title, objective: fixture.session.objective, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  const session: Session = { ...created, ...fixture.session, placement: undefined, approval: undefined, id: created.id, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', ownerId: created.ownerId, ownerName: created.ownerName, runs: fixture.session.runs.map((run: Json) => ({ ...run, sessionId: created.id })) };
  server.app.store.saveSession(session);
  for (const event of fixture.events as Event[]) server.app.store.appendEvent(created.id, event.type, event.actor, event.data, event.runId);
  const client = await attach(server, t, 'runs');
  return { server, client, id: created.id, channel: `unfold:/${created.id}`, chat: defaultChatOf(`unfold:/${created.id}`) };
}

const toolCalls = (turns: Json[]) => turns.flatMap(turn => turn.responseParts).filter((part: Json) => part.kind === 'toolCall').map((part: Json) => part.toolCall);

test('a Run\'s chat is spelled as VS Code derives a subagent\'s chat, and parses back to its session and tool call', () => {
  const session = 'unfold:/059675b9-modelled';
  const channel = runChatChannel(session, 'run-run-impl');
  assert.equal(channel, `ahp-chat://subagent/${Buffer.from(session).toString('base64url')}/run-run-impl`);
  assert.deepEqual(parseRunChannel(channel), { id: '059675b9-modelled', run: 'run-run-impl' });
  assert.deepEqual(parseChannel(channel), { kind: 'chat', id: '059675b9-modelled', run: 'run-run-impl' });
  assert.deepEqual(parseRunChannel(runChatChannel('ahp-session:/059675b9-modelled', 'run-run-impl')), { id: '059675b9-modelled', run: 'run-run-impl' }, 'both session spellings name the same Run chat');
  assert.equal(parseRunChannel(runChatChannel('file:///etc/passwd', 'run-a')), undefined);
  assert.equal(parseRunChannel(`ahp-chat://subagent/${Buffer.from(session).toString('base64url')}/${encodeURIComponent('../x y')}`), undefined);
});

test('a tool event becomes a tool call with its input and its output or error, and a failed command fails', () => {
  const turn: Json = { id: 'turn', responseParts: [] };
  const open = new Map<string, string>();
  const event = (data: Json): Event => ({ id: 1, sessionId: 's', type: 'tool', at: '2026-10-10T10:00:00.000Z', actor: 'system', data });
  const started = toolActions(turn, open, event({ name: 'bash', status: 'pending', partId: 'p1' }));
  assert.deepEqual(started.map(item => item.type), ['chat/toolCallStart', 'chat/toolCallReady']);
  assert.equal(started[1].toolInput, undefined, 'nothing is shown as input before the tool reports one');
  const running = toolActions(turn, open, event({ name: 'bash', status: 'running', partId: 'p1', title: 'Run the tests', input: '{"command":"npm test"}' }));
  assert.deepEqual(running.map(item => [item.type, item.toolInput, item.invocationMessage]), [['chat/toolCallReady', '{"command":"npm test"}', 'Run the tests']]);
  const done = toolActions(turn, open, event({ name: 'bash', status: 'completed', partId: 'p1', title: 'Run the tests', input: '{"command":"npm test"}', output: '12 passing' }));
  assert.deepEqual(done.at(-1)!.result, { success: true, pastTenseMessage: 'Run the tests', content: [{ type: 'text', text: '12 passing' }] });
  const failed = toolActions(turn, open, event({ name: 'node --test', status: 'failed', exitCode: 1, durationMs: 40, output: '1 failing' }));
  assert.deepEqual(failed.at(-1)!.result, { success: false, pastTenseMessage: 'node --test failed', content: [{ type: 'text', text: '1 failing' }], structuredContent: { exitCode: 1, durationMs: 40 }, error: { message: 'Exited with code 1' } });
  assert.equal(open.size, 0, 'a failed command is finished, not left running');
  assert.ok(turn.responseParts.every((part: Json) => part.toolCall.status === 'completed' && part.toolCall.confirmed === 'not-needed' && part.toolCall.editable === undefined && part.toolCall.edits === undefined), 'a reported tool call offers no confirmation and no edit');
});

test('the 059675b9 session shows each Run as a subagent with its own chat, its tool calls and, for the writer, its file diff', { timeout: testTimeout(60_000) }, async t => {
  const { client, channel, chat } = await stopped(t);
  const state = (await client.rpc('subscribe', { channel })).snapshot.state;
  assert.equal(state.chats.length, 3);
  const [main, implementer, reviewer] = state.chats;
  assert.equal(main.resource, chat);
  assert.equal(implementer.resource, runChatChannel(channel, 'run-run-impl'), 'the Run chat is spelled from the session URI the client uses');
  assert.deepEqual([implementer.title, implementer.origin, implementer.interactivity, implementer.status], ['Implementer', { kind: 'tool', chat, toolCallId: 'run-run-impl' }, 'read-only', 1]);
  assert.deepEqual([reviewer.title, reviewer.origin.toolCallId, reviewer.status], ['Reviewer', 'run-run-review', 2], 'the Reviewer did not finish');

  const turns = (await client.rpc('subscribe', { channel: chat })).snapshot.state.turns;
  const calls = toolCalls(turns);
  assert.deepEqual(calls.map(call => call.toolName), ['unfold_run', 'unfold_run'], 'the crew\'s tool calls sit under their Run, not in the session\'s chat');
  const [writes, reads] = calls;
  assert.deepEqual(writes._meta, { toolKind: 'subagent', subagentDescription: 'Implementer writes the change', subagentAgentName: 'Implementer' });
  assert.deepEqual(writes.content[0], { type: 'subagent', resource: implementer.resource, title: 'Implementer', agentName: 'Implementer', description: 'writes the change' });
  assert.deepEqual([writes.status, writes.success, writes.pastTenseMessage, writes.content[1]], ['completed', true, 'Implementer finished', { type: 'text', text: fixture.session.runs[0].summary }]);
  assert.deepEqual([reads.status, reads.success, reads.pastTenseMessage], ['completed', false, 'Reviewer did not finish: Unfold lost contact with its execution']);

  const written = (await client.rpc('subscribe', { channel: implementer.resource })).snapshot.state;
  assert.equal(written.interactivity, 'read-only');
  assert.equal(written.activeTurn, undefined);
  assert.equal(written.turns[0].state, 'complete');
  const writtenCalls = toolCalls(written.turns);
  assert.deepEqual(writtenCalls.map(call => [call.toolName, call.invocationMessage, call.success]), [['edit', 'Edit README.md', true], ['bash', 'git diff --check', true], ['unfold_changes', 'Implementer changed', true]]);
  const edit = writtenCalls[2].content.find((item: Json) => item.type === 'fileEdit');
  assert.deepEqual(edit.diff, { added: 57, removed: 45 });
  assert.equal(edit.after.uri, 'file:///workspace/repository/README.md');
  const after = await client.rpc('resourceRead', { channel: 'ahp-root://', uri: edit.after.content.uri });
  assert.match(after.data, /Honk honk!/, 'the diff is the Run\'s own recorded file diff');
  const before = await client.rpc('resourceRead', { channel: 'ahp-root://', uri: edit.before.content.uri });
  assert.match(before.data, /ready for human review/);

  const read = (await client.rpc('subscribe', { channel: reviewer.resource })).snapshot.state;
  assert.equal(read.turns[0].state, 'cancelled');
  assert.match(read.turns[0].responseParts.filter((part: Json) => part.kind === 'markdown').map((part: Json) => part.content).join(''), /VERDICT: approve/, 'the Run chat keeps the Run\'s own words');
  assert.ok(toolCalls(read.turns).every(call => !(call.content ?? []).some((item: Json) => item.type === 'fileEdit')), 'a read-only Run\'s chat carries no file edits');

  client.notify('dispatchAction', { channel: reviewer.resource, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'into-run', startedAt: new Date().toISOString(), message: { text: 'hi', origin: { kind: 'user' } } } });
  const rejected = await client.until(message => message.method === 'action' && message.params.origin?.clientSeq === 1);
  assert.match(rejected.params.rejectionReason, /read-only/);
  assert.equal(rejected.params.channel, reviewer.resource);
});

test('a live Run spawns its chat in the client\'s spelling and streams its tool calls there, then completes the subagent with its verdict', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const created = server.app.engine.create({ title: 'Live Runs', objective: 'Round half up in the order totals.', repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  const [writer, reader] = created.runs;
  server.app.store.saveSession({ ...created, status: 'running' });
  const client = await attach(server, t, 'live', { 'vscode.ahpSessionUris': true });
  const channel = `ahp-session:/${created.id}`;
  const chat = defaultChatOf(channel);
  await client.rpc('subscribe', { channel });
  await client.rpc('subscribe', { channel: chat });
  server.app.store.appendEvent(created.id, 'run.started', writer.roleId, { role: writer.roleName, mode: 'write' }, writer.id);
  const added = await client.until(message => action(message, channel, 'session/chatAdded'));
  const runChat = added.params.action.summary.resource;
  assert.equal(runChat, runChatChannel(channel, `run-${writer.id}`));
  assert.deepEqual(added.params.action.summary.origin, { kind: 'tool', chat, toolCallId: `run-${writer.id}` });
  assert.equal(added.params.action.summary.status, 8);
  const spawned = await client.until(message => action(message, chat, 'chat/toolCallContentChanged'));
  assert.equal(spawned.params.action.content[0].resource, runChatChannel(`unfold:/${created.id}`, `run-${writer.id}`), 'the subagent content names the Run chat; the catalogue entry carries the client\'s spelling');
  const opened = (await client.rpc('subscribe', { channel: runChat })).snapshot.state;
  assert.equal(opened.activeTurn.message.text, created.objective);

  server.app.store.appendEvent(created.id, 'tool', writer.roleId, { name: 'bash', status: 'running', partId: 'call-1', title: 'Run the tests', input: '{"command":"npm test"}' }, writer.id);
  server.app.store.appendEvent(created.id, 'tool', writer.roleId, { name: 'bash', status: 'error', partId: 'call-1', title: 'Run the tests', input: '{"command":"npm test"}', output: '1 failing', error: 'npm test exited 1' }, writer.id);
  const ready = await client.until(message => action(message, runChat, 'chat/toolCallReady'));
  assert.equal(ready.params.action.toolInput, '{"command":"npm test"}');
  const complete = await client.until(message => action(message, runChat, 'chat/toolCallComplete'));
  assert.deepEqual(complete.params.action.result, { success: false, pastTenseMessage: 'Run the tests failed', content: [{ type: 'text', text: '1 failing' }], error: { message: 'npm test exited 1' } });
  assert.ok(!client.inbox.some(message => action(message, chat, 'chat/toolCallStart') && message.params.action.toolName === 'bash'), 'the Run\'s tool call is not repeated in the session\'s chat');

  server.app.store.appendEvent(created.id, 'run.finished', writer.roleId, { status: 'completed', summary: 'Fixed the rounding.' }, writer.id);
  await client.until(message => action(message, runChat, 'chat/turnComplete'));
  const finished = await client.until(message => action(message, chat, 'chat/toolCallComplete') && message.params.action.toolCallId === `run-${writer.id}`);
  assert.deepEqual([finished.params.action.result.success, finished.params.action.result.pastTenseMessage, finished.params.action.result.content.map((item: Json) => item.type)], [true, `${writer.roleName} finished`, ['subagent', 'text']]);
  const updated = await client.until(message => action(message, channel, 'session/chatUpdated') && message.params.action.chat === runChat);
  assert.deepEqual(updated.params.action.changes.status, 1);

  server.app.store.appendEvent(created.id, 'run.started', reader.roleId, { role: reader.roleName, mode: 'read' }, reader.id);
  server.app.store.appendEvent(created.id, 'run.finished', reader.roleId, { status: 'failed', verdict: 'request_changes', summary: 'The tests fail.' }, reader.id);
  const verdict = await client.until(message => action(message, chat, 'chat/toolCallComplete') && message.params.action.toolCallId === `run-${reader.id}`);
  assert.deepEqual([verdict.params.action.result.success, verdict.params.action.result.pastTenseMessage], [false, `${reader.roleName} requested changes`]);
  const fresh = (await client.rpc('subscribe', { channel })).snapshot.state;
  assert.deepEqual(fresh.chats.map((item: Json) => [item.title, item.status]), [[created.title, fresh.chats[0].status], [writer.roleName, 1], [reader.roleName, 2]]);
  const reviewed = (await client.rpc('subscribe', { channel: fresh.chats[2].resource })).snapshot.state;
  assert.equal(reviewed.turns[0].state, 'error');
});

test('a demo session run from the Agents window nests the demo\'s real checks under each Run and ends with the captured candidate as file edits', { timeout: testTimeout(90_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const client = await attach(server, t, 'demo-run', { 'vscode.ahpSessionUris': true });
  const channel = `ahp-session:/${randomUUID()}`;
  const chat = defaultChatOf(channel);
  await client.rpc('createSession', { channel, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Demo Runs' } });
  await client.rpc('subscribe', { channel });
  await client.rpc('subscribe', { channel: chat });
  client.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'demo-turn', startedAt: new Date().toISOString(), message: { text: 'Reproduce the rounding regression and fix it with the tests intact.', origin: { kind: 'user' } } } });
  await client.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === 'demo-turn');
  const state = (await client.rpc('subscribe', { channel })).snapshot.state;
  const runChats = state.chats.filter((item: Json) => item.origin.kind === 'tool');
  assert.ok(runChats.length >= 2, 'the writer and the reviewer each have a chat');
  const writer = (await client.rpc('subscribe', { channel: runChats[0].resource })).snapshot.state;
  const checks = toolCalls(writer.turns).filter(call => call.toolName.startsWith('node --test'));
  assert.deepEqual(checks.map(call => call.success), [false, true], 'the baseline check fails before the fix and passes after it, as the demo ran them');
  assert.match(checks[0].content[0].text, /fail/i);
  const turns = (await client.rpc('subscribe', { channel: chat })).snapshot.state.turns;
  const candidate = toolCalls(turns).find(call => call.toolName === 'unfold_candidate');
  assert.ok(candidate, 'the captured candidate appears as file edits in the session\'s chat');
  const edit = candidate.content.find((item: Json) => item.type === 'fileEdit');
  assert.equal(edit.after.uri, 'file:///workspace/repository/src/order.js');
  const after = await client.rpc('resourceRead', { channel: 'ahp-root://', uri: edit.after.content.uri });
  const before = await client.rpc('resourceRead', { channel: 'ahp-root://', uri: edit.before.content.uri });
  assert.notEqual(after.data, before.data, 'both sides come from the candidate bundle');
});
