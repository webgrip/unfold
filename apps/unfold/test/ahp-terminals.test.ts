import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { application, login, request } from './api-support.ts';
import { action, connect, defaultChatOf, vscodeAgentsWindow, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';
import { CommandLog, clientTerminalNotice, commandLineOf, liveOutputLimits, noClientShell, noClientTerminals, parseTerminalChannel, readOnlyTerminal, terminalActionChannel, terminalChannel } from '../src/ahp/terminals.ts';
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

test('a command the team runs streams into a read-only terminal on its tool call, for the owner and administrators only', { timeout: testTimeout(60_000) }, async t => {
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
  assert.equal(ready.params.action.toolInput, 'npm test -- --reporter=dot --password=[redacted]', 'the command line VS Code shows is the one the team ran, without the secret');
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
    await assert.rejects(alice.rpc(method, { channel: terminal, claim: { kind: 'client', clientId: 'alice' } }), (error: Json) => error.code === -32009 && error.message === noClientTerminals, `${method} is refused on a team command's terminal`);
  }
  const own = 'agenthost-terminal:/0d5c7f4e-1b2a-4c3d-9e8f-a1b2c3d4e5f6';
  assert.deepEqual(await alice.rpc('createTerminal', { channel: own, claim: { kind: 'client', clientId: 'alice' }, cwd: 'file:///home/alice', cols: 80, rows: 24 }), {}, 'the terminal VS Code opens for a session is accepted rather than shown as a launch failure');
  const ownState = (await alice.rpc('subscribe', { channel: own })).snapshot.state;
  assert.deepEqual(ownState.content, [{ type: 'unclassified', value: clientTerminalNotice }]);
  assert.equal(ownState.lifecycle.status, 'running');
  assert.equal(ownState.claim.kind, 'client');
  alice.notify('dispatchAction', { channel: own, clientSeq: 200, action: { type: 'terminal/input', data: 'ls\r' } });
  assert.equal((await alice.until(message => message.params?.origin?.clientSeq === 200)).params.rejectionReason, noClientShell, 'it starts no shell and takes no input');
  await assert.rejects(bob.rpc('subscribe', { channel: own }), 'another connection cannot read it');
  assert.deepEqual(await alice.rpc('disposeTerminal', { channel: own }), {});
  await assert.rejects(alice.rpc('subscribe', { channel: own }), 'a disposed terminal is gone');
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
  const runChats = (await client.rpc('subscribe', { channel: session })).snapshot.state.chats.filter((item: Json) => item.origin.kind === 'tool');
  const parts: Json[] = [];
  for (const run of runChats) parts.push(...(await client.rpc('subscribe', { channel: run.resource })).snapshot.state.turns.flatMap((turn: Json) => turn.responseParts));
  const terminals = parts.filter((part: Json) => part.kind === 'toolCall' && part.toolCall.content?.[0]?.type === 'terminal').map((part: Json) => part.toolCall);
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
  const edit = parts.find((part: Json) => part.kind === 'toolCall' && part.toolCall.toolName === 'edit src/order.js')!;
  assert.ok(!(edit.toolCall.content ?? []).some((item: Json) => item.type === 'terminal'), 'a file edit is not a command and gets no terminal');
});

test('live output chunks reach a command\'s terminal line by line, in offset order, masked across chunk boundaries', () => {
  const log = new CommandLog('session-live', text => plainRedactedText(text.split('known-secret-value').join('[redacted]')));
  const chunk = (offset: number, data: string, partId = 'p1', runId = 'run-1') => log.apply(event('tool.output', { partId, offset, data }, runId));
  assert.deepEqual(chunk(0, 'early\n'), { actions: [] }, 'output before its command is known has no terminal to land on');
  const started = log.apply(event('tool', { name: 'bash', status: 'running', partId: 'p1', input: JSON.stringify({ command: 'npm test' }) }));
  const claim = { session: 'ahp-session:/session-live', chat: 'ahp-chat:/x' };
  let state = log.state(started.command!, claim);
  const data = (update: { actions: Json[] }) => update.actions.map(item => { assert.equal(terminalActionChannel(item), terminalChannel('session-live', started.command!.id)); state = reduceTerminal(state, item); return item.data; }).join('');

  assert.equal(data(chunk(0, 'one\ntwo')), 'one\n', 'an unfinished line waits for the rest of it');
  assert.equal(data(chunk(7, ' Bearer known-sec')), '');
  assert.equal(data(chunk(24, 'ret-value done\n')), 'two Bearer [redacted] done\n', 'a credential split across two chunks is masked once the line is whole');
  assert.equal(data(chunk(0, 'one\ntwo Bearer known-secret-value done\n')), '', 'a chunk sent again adds nothing');
  assert.equal(data(chunk(33, ' done\nthree\n')), 'three\n', 'an overlapping chunk adds only what is new');
  assert.equal(data(chunk(80, 'four\n')), '\n… 35 characters of output not kept …\nfour\n', 'a gap is marked instead of joined silently');
  assert.equal(data(chunk(10, 'x', 'p2')), '', 'another tool call\'s chunk is not this command\'s output');
  assert.equal(started.command!.truncated, true);

  const done = log.apply(event('tool', { name: 'bash', status: 'completed', partId: 'p1', output: '…the tail OpenCode kept\n' }, 'run-1', '2026-10-10T10:00:02.000Z'));
  assert.deepEqual(done.actions.map(item => item.type), ['terminal/commandFinished', 'terminal/exited'], 'the completed event does not repeat output the terminal already showed');
  for (const item of done.actions) state = reduceTerminal(state, item);
  assert.equal(state.content[0].output, 'one\ntwo Bearer [redacted] done\nthree\n\n… 35 characters of output not kept …\nfour\n');
  assert.deepEqual(JSON.parse(JSON.stringify(state)), log.state(started.command!, claim), 'a live client and a later snapshot see the same terminal');
  assert.equal(done.content!.result.preview, state.content[0].output);
  assert.equal(done.content!.result.truncated, true);
  assert.deepEqual(chunk(85, 'late\n'), { actions: [] }, 'a finished command takes no more output');
});

test('live output is bounded: a held line is released at its limit, an oversized chunk keeps its tail, and a stop flushes what is held', () => {
  const log = new CommandLog('session-bounds', plainRedactedText);
  const started = log.apply(event('tool', { name: 'bash', status: 'running', partId: 'b1', input: JSON.stringify({ command: 'yes' }) }, 'run-b'));
  const command = started.command!;
  const long = 'y'.repeat(liveOutputLimits.heldLine + 1);
  assert.equal(log.apply(event('tool.output', { partId: 'b1', offset: 0, data: long }, 'run-b')).actions[0].data, long, 'a line longer than the hold limit is shown rather than held forever');
  const flood = 'z'.repeat(liveOutputLimits.chunk + 10) + '\n';
  const flooded = log.apply(event('tool.output', { partId: 'b1', offset: long.length, data: flood }, 'run-b')).actions[0].data;
  assert.match(flooded, /^\n… 11 characters of output not kept …\nz+\n$/);
  for (let offset = long.length + flood.length, index = 0; command.output.length <= liveOutputLimits.kept; index++) {
    const line = `${index} ${'w'.repeat(1000)}\n`;
    log.apply(event('tool.output', { partId: 'b1', offset, data: line }, 'run-b'));
    offset += line.length;
  }
  assert.ok(command.output.length <= liveOutputLimits.kept + 1, 'the kept output never outgrows its bound');
  assert.ok(command.output.startsWith('…'));
  log.apply(event('tool.output', { partId: 'b1', offset: command.streamed, data: 'partial' }, 'run-b'));
  const stopped = log.apply(event('session.interrupted', {}, 'run-b'));
  assert.deepEqual(stopped.actions.map(item => item.type), ['terminal/data', 'terminal/commandFinished', 'terminal/exited']);
  assert.equal(stopped.actions[0].data, 'partial', 'a stop shows the unfinished line it held');
  for (const invalid of [{ offset: -1, data: 'x' }, { offset: 1.5, data: 'x' }, { offset: 0, data: 7 }, { offset: 0, data: '' }]) assert.deepEqual(log.apply(event('tool.output', { partId: 'b1', ...invalid }, 'run-b')).actions, []);
});

test('a terminal receives live output while its command runs, and a reconnecting client gets the same output', { timeout: testTimeout(60_000) }, async t => {
  const server = await application('live');
  t.after(() => server.close());
  const auth = await login(server.url, 'admin', adminPassword);
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie: auth.cookie, body: { label: 'live-output' } });
  const attach = async () => {
    const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
    t.after(() => client.close());
    await client.open;
    await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: `live-${randomUUID()}`, clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
    return client;
  };
  const client = await attach();
  const session = server.app.engine.create({ title: 'Live output', objective: 'Fix the order rounding regression and provide the actual verification result.', repositoryId: 'order-service', crewId: 'delivery', runtime: 'opencode', budgetUsd: 1 }, { id: 'admin', name: 'admin', role: 'admin' });
  const chat = defaultChatOf(`ahp-session:/${session.id}`);
  await client.rpc('subscribe', { channel: chat });
  server.app.store.appendEvent(session.id, 'tool', 'system', { name: 'bash', status: 'running', partId: 'call-live', input: JSON.stringify({ command: 'npm test' }) }, 'run-1');
  const attached = await client.until(message => action(message, chat, 'chat/toolCallContentChanged'));
  const terminal = attached.params.action.content[0].resource;
  let state = (await client.rpc('subscribe', { channel: terminal })).snapshot.state;
  server.app.store.appendEvent(session.id, 'tool.output', 'system', { partId: 'call-live', offset: 0, data: `\u001b[32m1 passing\u001b[0m\npassword=${adminPassword}\n` }, 'run-1');
  const live = await client.until(message => action(message, terminal, 'terminal/data'));
  state = reduceTerminal(state, live.params.action);
  assert.equal(shownOutput(state), '1 passing\r\npassword=[redacted]\r\n');
  assert.equal(state.content[0].isComplete, false, 'the output arrived while the command still runs');
  const later = await attach();
  const resumed = (await later.rpc('subscribe', { channel: terminal })).snapshot.state;
  assert.equal(shownOutput(resumed), shownOutput(state), 'a client that connects later gets the output so far');
  assert.equal(JSON.stringify([...client.inbox, ...later.inbox]).includes(adminPassword), false, 'the secret never crossed the wire');
});
