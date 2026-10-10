import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { application, login, request } from './api-support.ts';
import { action, connect, defaultChatOf, vscodeAgentsWindow, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';
import { CommandLog, commandLineOf, noClientTerminals, parseTerminalChannel, readOnlyTerminal, terminalActionChannel, terminalChannel } from '../src/ahp/terminals.ts';
import { plainRedactedText } from '../src/redaction.ts';
import type { Event } from '../src/types.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/session-059675b9.json', import.meta.url), 'utf8'));
const operatorPassword = 'operator-password-314159';
const adminPassword = 'test-admin-password-314159';

let nextEventId = 1;
const event = (type: string, data: Json, runId = 'run-1', at = '2026-10-10T10:00:00.000Z'): Event => ({ id: nextEventId++, sessionId: 's', type, at, actor: 'system', runId, data });

/** What VS Code 1.141's `AgentHostOutputChannel` shows for a non-PTY terminal: every part's output joined, with CRLF line ends. */
const shownOutput = (state: Json) => state.content.map((part: Json) => part.type === 'command' ? part.output : part.value).join('').replace(/\r?\n/g, '\r\n');

/** The AHP 0.9 terminal reducer for the actions this host sends. */
function reduceTerminal(state: Json, change: Json): Json {
  switch (change.type) {
    case 'terminal/data': {
      const content = [...state.content];
      const tail = content.at(-1);
      if (tail?.type === 'command' && !tail.isComplete) content[content.length - 1] = { ...tail, output: tail.output + change.data };
      else content.push({ type: 'unclassified', value: change.data });
      return { ...state, content };
    }
    case 'terminal/commandFinished': return { ...state, content: state.content.map((part: Json) => part.type === 'command' && part.commandId === change.commandId ? { ...part, isComplete: true, exitCode: change.exitCode, durationMs: change.durationMs } : part) };
    case 'terminal/exited': return { ...state, lifecycle: { status: 'exited', exitCode: change.exitCode } };
    default: throw new Error(`unexpected terminal action ${change.type}`);
  }
}

test('a command line comes from the event\'s command field or a shell tool\'s input, never from a description', () => {
  assert.equal(commandLineOf({ name: 'node --test test/order.test.js', command: 'node --test test/order.test.js' }), 'node --test test/order.test.js');
  assert.equal(commandLineOf({ name: 'bash', input: JSON.stringify({ command: 'npm test', description: 'Run the tests' }) }), 'npm test');
  assert.equal(commandLineOf({ name: 'bash', input: `{"command":"echo \\"${'x'.repeat(2100)}`.slice(0, 2000) + '…' })?.startsWith('echo "xxx'), true, 'OpenCode\'s 2000-character input preview still names the command');
  assert.equal(commandLineOf({ name: 'bash', title: 'git diff --check' }), undefined, 'a title alone is a description, not a command');
  assert.equal(commandLineOf({ name: 'edit', input: JSON.stringify({ command: 'rm -rf /' }) }), undefined, 'only shell tools run commands');
  assert.equal(commandLineOf({ name: 'bash', input: JSON.stringify({ description: 'nothing' }) }), undefined);
});

test('terminal channels name the session and the event that started the command', () => {
  assert.equal(terminalChannel('abc', '42'), 'ahp-terminal:/abc/42');
  assert.deepEqual(parseTerminalChannel('ahp-terminal:/abc/42'), { sessionId: 'abc', commandId: '42' });
  for (const uri of ['ahp-terminal:/abc', 'ahp-terminal:/abc/x', 'agenthost-terminal:/abc/42', 'ahp-terminal:/a b/1']) assert.equal(parseTerminalChannel(uri), undefined, uri);
});

test('a command\'s terminal follows its tool events, and its output reaches a client without escape sequences or credentials', () => {
  const log = new CommandLog('session-1', text => plainRedactedText(text.split('known-secret-value').join('[redacted]')));
  assert.deepEqual(log.apply(event('tool', { name: 'bash', status: 'pending', partId: 'p1', input: '{}' })), { actions: [] }, 'a shell tool without its command yet is no terminal');
  const started = log.apply(event('tool', { name: 'bash', status: 'running', partId: 'p1', input: JSON.stringify({ command: 'curl -H "Authorization: Bearer abc.def" https://x' }) }));
  assert.ok(started.command);
  assert.equal(started.command.commandLine, 'curl -H "Authorization: Bearer [redacted] https://x');
  assert.deepEqual(started.content, { type: 'terminal', resource: terminalChannel('session-1', started.command.id), title: started.command.commandLine, isPty: false });
  assert.deepEqual(started.actions, []);
  const claim = { session: 'ahp-session:/session-1', chat: 'ahp-chat:/x' };
  let state = log.state(started.command, claim);
  assert.deepEqual(state.lifecycle, { status: 'running' });
  assert.equal(state.isPty, false);
  assert.deepEqual(state.claim, { kind: 'session', ...claim });
  const output = 'ok\r\n\u001b[31mred\u001b[0m \u001b]52;c;cGFzc3dvcmQ=\u0007 known-secret-value sk-live-123\n';
  const done = log.apply(event('tool', { name: 'bash', status: 'completed', partId: 'p1', output }, 'run-1', '2026-10-10T10:00:03.000Z'));
  assert.equal(done.command, started.command);
  assert.deepEqual(done.actions.map(item => item.type), ['terminal/data', 'terminal/commandFinished', 'terminal/exited']);
  for (const item of done.actions) assert.equal(terminalActionChannel(item), terminalChannel('session-1', started.command.id));
  for (const item of done.actions) state = reduceTerminal(state, item);
  const shown = shownOutput(state);
  assert.doesNotMatch(shown, /\u001b|\u0007|known-secret-value|sk-live-123/);
  assert.match(shown, /red/);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), log.state(started.command, claim), 'a live client and a later snapshot see the same terminal on the wire');
  assert.deepEqual(done.content!.result, { preview: started.command.output, truncated: false });
  assert.equal(state.content[0].durationMs, 3000);
  assert.equal(log.apply(event('tool', { name: 'bash', status: 'completed', partId: 'p1' })).command, undefined, 'a finished command is not reopened');
});

test('a command the Run or the session stopped before it reported ends its terminal without an exit code', () => {
  const log = new CommandLog('session-2', text => text);
  const first = log.apply(event('tool', { name: 'bash', status: 'running', partId: 'a', input: JSON.stringify({ command: 'sleep 600' }) }, 'run-a')).command!;
  const second = log.apply(event('tool', { name: 'bash', status: 'running', partId: 'b', input: JSON.stringify({ command: 'npm run watch' }) }, 'run-b')).command!;
  assert.deepEqual(log.apply(event('run.finished', { status: 'completed' }, 'run-a')).actions.map(item => [item.type, terminalActionChannel(item)]), [
    ['terminal/commandFinished', terminalChannel('session-2', first.id)], ['terminal/exited', terminalChannel('session-2', first.id)],
  ]);
  assert.equal(second.finished, false);
  assert.deepEqual(log.apply(event('session.interrupted', {})).actions.map(item => item.type), ['terminal/commandFinished', 'terminal/exited']);
  assert.deepEqual(log.state(second, { session: 's', chat: 'c' }).lifecycle, { status: 'exited' });
});

test('the demo runtime\'s exit codes and the 059675b9 session\'s events project deterministically', () => {
  const demo = new CommandLog('demo', text => text);
  demo.apply(event('tool', { name: 'node --test test/order.test.js', command: 'node --test test/order.test.js', status: 'running' }));
  const failed = demo.apply(event('tool', { name: 'node --test test/order.test.js', command: 'node --test test/order.test.js', status: 'failed', exitCode: 1, durationMs: 812.4, output: 'not ok 1\n' }));
  assert.deepEqual(failed.content!.result, { exitCode: 1, preview: 'not ok 1\n', truncated: false });
  assert.deepEqual(failed.actions.at(-1), { type: 'terminal/exited', exitCode: 1 });
  assert.equal(failed.command!.durationMs, 812);
  const recorded = new CommandLog('059675b9', text => text);
  assert.deepEqual((fixture.events as Event[]).flatMap(item => recorded.apply(item).actions), [], 'its bash event records no command line, so it shows no terminal');
  const withInput = new CommandLog('059675b9', text => text);
  const updates = (fixture.events as Event[]).map(item => withInput.apply(item.type === 'tool' && item.data.name === 'bash' ? { ...item, data: { ...item.data, input: JSON.stringify({ command: String(item.data.title) }) } } : item));
  const terminal = updates.find(update => update.command)!;
  assert.equal(terminal.command!.commandLine, 'git diff --check');
  assert.equal(terminal.command!.finished, true);
  assert.deepEqual(terminal.actions.map(item => item.type), ['terminal/commandFinished', 'terminal/exited']);
});

test('a command the crew runs streams into a read-only terminal on its tool call, for the owner and administrators only', { timeout: testTimeout(60_000) }, async t => {
  const server = await application('live');
  t.after(() => server.close());
  const { hashPassword } = await import('../src/auth.ts');
  for (const name of ['alice-term', 'bob-term']) server.app.store.addUser({ id: name, name, role: 'operator', passwordHash: await hashPassword(operatorPassword) });
  const attach = async (name: string, password: string) => {
    const auth = await login(server.url, name, password);
    const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie: auth.cookie, body: { label: name } });
    const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
    t.after(() => client.close());
    await client.open;
    await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: `${name}-${randomUUID()}`, clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
    return client;
  };
  const alice = await attach('alice-term', operatorPassword);
  const bob = await attach('bob-term', operatorPassword);
  const admin = await attach('admin', adminPassword);
  const session = server.app.engine.create({ title: 'Alice runs tests', objective: 'Fix the order rounding regression and provide the actual verification result.', repositoryId: 'order-service', crewId: 'delivery', runtime: 'opencode', budgetUsd: 1 }, { id: 'alice-term', name: 'alice-term', role: 'operator' });
  const sessionUri = `ahp-session:/${session.id}`;
  const chat = defaultChatOf(sessionUri);
  await alice.rpc('subscribe', { channel: chat });

  server.app.store.appendEvent(session.id, 'tool', 'system', { name: 'bash', status: 'pending', partId: 'call-1', input: '{}' }, 'run-1');
  const begun = await alice.until(message => action(message, chat, 'chat/toolCallStart'));
  const toolCallId = begun.params.action.toolCallId;
  server.app.store.appendEvent(session.id, 'tool', 'system', { name: 'bash', status: 'running', partId: 'call-1', title: 'Run the tests', input: JSON.stringify({ command: `npm test -- --reporter=dot --password=${adminPassword}`, description: 'Run the tests' }) }, 'run-1');
  const ready = await alice.until(message => action(message, chat, 'chat/toolCallReady') && message.params.action.toolCallId === toolCallId);
  assert.equal(ready.params.action.toolInput, 'npm test -- --reporter=dot --password=[redacted]', 'the command line VS Code shows is the one the crew ran, without the secret');
  const attached = await alice.until(message => action(message, chat, 'chat/toolCallContentChanged') && message.params.action.toolCallId === toolCallId);
  const [content] = attached.params.action.content;
  assert.equal(content.type, 'terminal');
  assert.equal(content.isPty, false, 'VS Code attaches a plain-text output view, which never sends input');
  assert.equal(content.title, 'Run the tests');
  assert.equal(content.result, undefined);
  const terminal = content.resource;
  assert.match(terminal, new RegExp(`^ahp-terminal:/${session.id}/\\d+$`));

  let state = (await alice.rpc('subscribe', { channel: terminal })).snapshot.state;
  assert.deepEqual(state.lifecycle, { status: 'running' });
  assert.deepEqual(state.claim, { kind: 'session', session: sessionUri, chat });
  assert.equal(state.content[0].commandLine, 'npm test -- --reporter=dot --password=[redacted]');
  assert.equal(state.content[0].isComplete, false);

  await assert.rejects(bob.rpc('subscribe', { channel: terminal }), (error: Json) => error.code === -32008 && /Terminal not found/.test(error.message), 'another operator cannot see the terminal');
  const adminState = (await admin.rpc('subscribe', { channel: terminal })).snapshot.state;
  assert.equal(adminState.content[0].commandId, state.content[0].commandId, 'an administrator can');

  for (const [index, refused] of [{ type: 'terminal/input', data: 'rm -rf /\r' }, { type: 'terminal/resized', cols: 80, rows: 24 }, { type: 'terminal/cleared' }, { type: 'terminal/titleChanged', title: 'mine' }, { type: 'terminal/claimed', claim: { kind: 'client', clientId: 'alice' } }].entries()) {
    alice.notify('dispatchAction', { channel: terminal, clientSeq: 100 + index, action: refused });
    const rejected = await alice.until(message => message.params?.origin?.clientSeq === 100 + index);
    assert.equal(rejected.params.rejectionReason, readOnlyTerminal, `${refused.type} is refused`);
  }
  bob.notify('dispatchAction', { channel: terminal, clientSeq: 1, action: { type: 'terminal/input', data: 'x' } });
  assert.equal((await bob.until(message => message.params?.origin?.clientSeq === 1)).params.rejectionReason, 'Terminal not found', 'a refusal does not confirm another person\'s terminal exists');
  for (const method of ['createTerminal', 'disposeTerminal']) {
    await assert.rejects(alice.rpc(method, { channel: terminal, claim: { kind: 'client', clientId: 'alice' } }), (error: Json) => error.code === -32009 && error.message === noClientTerminals, `${method} is refused`);
  }
  assert.equal(alice.inbox.some(message => message.params?.channel === terminal && message.params?.action?.type === 'terminal/input' && !message.params.rejectionReason), false, 'no input is ever echoed as accepted');

  server.app.store.appendEvent(session.id, 'tool', 'system', { name: 'bash', status: 'completed', partId: 'call-1', output: `\u001b[32m3 passing\u001b[0m\npassword=${adminPassword}\n` }, 'run-1');
  const exited = await alice.until(message => action(message, terminal, 'terminal/exited'));
  for (const message of alice.inbox.filter(item => item.method === 'action' && item.params.channel === terminal && !item.params.rejectionReason && item.params.serverSeq <= exited.params.serverSeq)) state = reduceTerminal(state, message.params.action);
  assert.equal(shownOutput(state), '3 passing\r\npassword=[redacted]\r\n');
  assert.equal(state.content[0].isComplete, true);
  assert.equal(state.lifecycle.status, 'exited');
  assert.equal(state.lifecycle.exitCode, undefined, 'OpenCode reports no exit code, and the host invents none');
  const complete = await alice.until(message => action(message, chat, 'chat/toolCallComplete') && message.params.action.toolCallId === toolCallId);
  assert.deepEqual(complete.params.action.result.content, [{ ...content, result: { preview: '3 passing\npassword=[redacted]\n', truncated: false } }]);
  await admin.until(message => action(message, terminal, 'terminal/exited'));
  assert.equal(bob.inbox.some(message => message.params?.channel === terminal && !message.params.rejectionReason), false, 'nothing about the terminal reaches another operator');

  const snapshot = (await alice.rpc('subscribe', { channel: chat })).snapshot.state;
  const toolCall = [...snapshot.turns, snapshot.activeTurn].filter(Boolean).flatMap((turn: Json) => turn.responseParts).find((part: Json) => part.kind === 'toolCall' && part.toolCall.toolCallId === toolCallId).toolCall;
  assert.equal(toolCall.status, 'completed');
  assert.equal(toolCall.toolInput, 'npm test -- --reporter=dot --password=[redacted]');
  assert.deepEqual(toolCall.content, complete.params.action.result.content, 'a reconnecting client gets the same terminal and its outcome');
  assert.equal(JSON.stringify(alice.inbox).includes(adminPassword), false, 'the secret never crossed the wire');
});

test('a deterministic demo run shows each check it really ran as a terminal with its real exit code', { timeout: testTimeout(60_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'terminals' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'terminals', clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
  const session = `ahp-session:/${randomUUID()}`;
  const chat = defaultChatOf(session);
  await client.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Terminals' } });
  for (const channel of [session, chat]) await client.rpc('subscribe', { channel });
  client.notify('dispatchAction', { channel: chat, clientSeq: 1, action: { type: 'chat/turnStarted', turnId: 'terminals-turn', startedAt: new Date().toISOString(), message: { text: 'Reproduce the rounding regression and fix it with the tests intact.', origin: { kind: 'user' } } } });
  await client.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === 'terminals-turn');
  const state = (await client.rpc('subscribe', { channel: chat })).snapshot.state;
  const terminals = state.turns.flatMap((turn: Json) => turn.responseParts).filter((part: Json) => part.kind === 'toolCall' && part.toolCall.content?.[0]?.type === 'terminal').map((part: Json) => part.toolCall);
  assert.deepEqual(terminals.map((call: Json) => [call.toolInput, call.content[0].result.exitCode]), [
    ['node --test test/order.test.js', 1],
    ['node --test test/order.test.js', 0],
    ['node --test test/order.test.js', 0],
  ], 'the baseline fails as the fixture intends, then verification and the independent review pass');
  assert.equal(terminals[0].success, false);
  const baseline = (await client.rpc('subscribe', { channel: terminals[0].content[0].resource })).snapshot.state;
  assert.deepEqual(baseline.lifecycle, { status: 'exited', exitCode: 1 });
  assert.match(baseline.content[0].output, /not ok|fail/i, 'the output is the real test run');
  assert.equal(baseline.content[0].output, terminals[0].content[0].result.preview);
  const edit = state.turns.flatMap((turn: Json) => turn.responseParts).find((part: Json) => part.kind === 'toolCall' && part.toolCall.toolName === 'edit src/order.js');
  assert.equal(edit.toolCall.content, undefined, 'a file edit is not a command and gets no terminal');
});
