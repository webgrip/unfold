import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { LinkedSessions, parseLinkedEvent, resumeCommand, type LinkedPloeg } from '../src/linked-sessions.ts';
import { parseAgentTrace } from '../src/agent-trace.ts';
import type { AppConfig, User } from '../src/types.ts';
import { patchWrites, pullRequestUrls } from '../extensions/shared/linked-report.mjs';
import { openCodeWrites } from '../extensions/opencode/writes.mjs';

const extensions = fileURLToPath(new URL('../extensions/', import.meta.url));
const codexHook = join(extensions, 'codex/unfold-codex.mjs');
const secrets = ['SECRET-PROMPT', 'SECRET-OUTPUT', 'SECRET-TITLE', 'SECRET-ANSWER'];
const owner: User = { id: 'u-ryan', name: 'ryan', role: 'operator' };
const ploeg: LinkedPloeg = { async detail() { throw Object.assign(new Error('not found'), { status: 404 }); }, async trackerItems() { return { items: [] }; } };

test('Unfold accepts OpenCode and Codex sessions and presents the command that resumes each in its own harness', async () => {
  const at = new Date('2026-10-24T10:00:00.000Z');
  const linked = new LinkedSessions(new DatabaseSync(':memory:'), {} as AppConfig, ploeg, { now: () => at, fetch: (async () => { throw new Error('no telemetry for other harnesses'); }) as typeof fetch });
  const opencode = await linked.report(owner, parseLinkedEvent({ harness: 'opencode', sessionId: 'ses_e951b7c6bffejTN5V7xZ3MreKz', event: 'start', harnessVersion: '1.18.33', model: 'anthropic/claude-sonnet-5' }, at), 'https://unfold.example.org');
  assert.equal(opencode.session.resume, 'opencode --session ses_e951b7c6bffejTN5V7xZ3MreKz');
  assert.equal(opencode.session.model, 'anthropic/claude-sonnet-5');
  assert.match(opencode.context, /^Unfold records this OpenCode session as https:\/\/unfold\.example\.org\/#linked-session\/ses_/);
  const codex = await linked.report(owner, parseLinkedEvent({ harness: 'codex', sessionId: '0199a213-81c0-7800-8aa1-bbab2a035a53', event: 'start' }, at), 'https://unfold.example.org');
  assert.equal(codex.session.resume, 'codex resume 0199a213-81c0-7800-8aa1-bbab2a035a53');
  assert.match(codex.context, /this Codex session/);
  assert.equal(resumeCommand('claude-code', 'abcd1234'), 'claude --resume abcd1234');
  const viewed = await linked.view(owner, codex.session.id, 'https://unfold.example.org', true);
  assert.equal(viewed.telemetry, undefined, 'Claude Code telemetry is not looked up for another harness');
  await assert.rejects(linked.report(owner, parseLinkedEvent({ harness: 'claude-code', sessionId: codex.session.id, event: 'idle' }, at), 'https://unfold.example.org'), { code: 'linked_harness' });
});

test('edits are read from OpenCode tool arguments and apply_patch patches, and only pull request addresses come out of a command', () => {
  assert.deepEqual(openCodeWrites('write', { filePath: '/r/a.ts', content: 'const a = 1;' }), [{ path: '/r/a.ts', text: 'const a = 1;' }]);
  assert.deepEqual(openCodeWrites('edit', { filePath: 'b.ts', oldString: 'x', newString: 'const b = 2;' }), [{ path: 'b.ts', text: 'const b = 2;' }]);
  assert.deepEqual(openCodeWrites('multiedit', { filePath: 'c.ts', edits: [{ newString: 'one' }, { newString: 'two' }] }), [{ path: 'c.ts', text: 'one\ntwo' }]);
  assert.deepEqual(openCodeWrites('bash', { command: 'ls' }), []);
  const patch = ['*** Begin Patch', '*** Add File: src/new.ts', '+export const fresh = true;', '*** Update File: src/old.ts', '*** Move to: src/moved.ts', '@@ function old()', '-  return 1;', '+  return 2;', ' }', '*** Delete File: src/gone.ts', '*** End Patch'].join('\n');
  assert.deepEqual(patchWrites(patch), [{ path: 'src/new.ts', text: 'export const fresh = true;' }, { path: 'src/moved.ts', text: '  return 2;' }]);
  assert.deepEqual(openCodeWrites('apply_patch', { patchText: patch }).map((entry: { path: string }) => entry.path), ['src/new.ts', 'src/moved.ts']);
  assert.deepEqual(pullRequestUrls('gh pr create --fill', 'SECRET-OUTPUT https://github.com/o/r/pull/7\n'), ['https://github.com/o/r/pull/7']);
  assert.deepEqual(pullRequestUrls('cat notes.txt', 'https://github.com/o/r/pull/7'), []);
});

async function fakeUnfold() {
  const received: { path: string; auth: string; client: string; body: any }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk as Buffer));
    req.on('end', () => {
      received.push({ path: String(req.url), auth: String(req.headers.authorization), client: String(req.headers['x-unfold-client']), body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') });
      res.writeHead(200, { 'content-type': 'application/json' });
      const id = received.at(-1)!.body.sessionId;
      if (req.url === '/api/linked-sessions/events') res.end(JSON.stringify({ session: { link: `http://unfold.test/#linked-session/${id}`, workItems: [{ id: '184', how: 'branch' }] }, context: `Unfold records this session as http://unfold.test/#linked-session/${id}.` }));
      else res.end(JSON.stringify({ stored: true }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, received, close: () => new Promise<void>(done => server.close(() => done())) };
}

async function repository(dir: string) {
  const repo = join(dir, 'repo');
  execFileSync('git', ['init', '-q', '-b', 'feat/vik-2051-login', repo]);
  const gitIn = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  gitIn('config', 'user.email', 'test@example.org'); gitIn('config', 'user.name', 'Test');
  gitIn('commit', '-q', '--allow-empty', '-m', 'root');
  await mkdir(join(repo, 'src'), { recursive: true });
  return { repo, gitIn };
}

async function until(check: () => boolean, what: string) {
  for (let tries = 0; tries < 250 && !check(); tries++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(check(), what);
}

function events(received: { path: string; body: any }[]) {
  return received.filter(entry => entry.path === '/api/linked-sessions/events').map(entry => entry.body.event);
}

test('the OpenCode plugin reports start, working, waiting, idle, commits with Agent Trace, and end, and never sends a prompt, title, answer or tool output', async t => {
  const unfold = await fakeUnfold();
  const dir = await mkdtemp(join(tmpdir(), 'unfold-opencode-'));
  const saved = { ...process.env };
  t.after(async () => { process.env = saved; await unfold.close(); await rm(dir, { recursive: true, force: true }); });
  const { repo, gitIn } = await repository(dir);
  Object.assign(process.env, { UNFOLD_URL: `${unfold.url}/`, UNFOLD_TOKEN: 'vle_test', XDG_STATE_HOME: join(dir, 'state') });
  const { UnfoldPlugin } = await import('../extensions/opencode/unfold-plugin.mjs');
  const plugin: Record<string, any> = await UnfoldPlugin({ directory: repo });
  const id = 'ses_e951b7c6bffejTN5V7xZ3MreKz';
  const child = 'ses_e951b7c6bffechildsession01';
  const info = { id, slug: 'witty-falcon', version: '1.18.33', projectID: 'p', directory: repo, title: 'SECRET-TITLE', time: { created: 1, updated: 1 } };

  await plugin.event({ event: { type: 'session.created', properties: { sessionID: id, info } } });
  await until(() => unfold.received.length === 1, 'session.created reports a start');
  assert.deepEqual([unfold.received[0].body.harness, unfold.received[0].body.event, unfold.received[0].body.harnessVersion, unfold.received[0].body.branch], ['opencode', 'start', '1.18.33', 'feat/vik-2051-login']);
  assert.equal(unfold.received[0].auth, 'Bearer vle_test');
  assert.equal(unfold.received[0].client, 'opencode-plugin');
  assert.equal('title' in unfold.received[0].body, false, 'OpenCode titles are written from the prompt, so they stay on the machine');

  await plugin['chat.message']({ sessionID: id, agent: 'build', model: { providerID: 'anthropic', modelID: 'claude-sonnet-5' } }, { message: {}, parts: [{ type: 'text', text: 'SECRET-PROMPT' }] });
  await plugin.event({ event: { type: 'session.status', properties: { sessionID: id, status: { type: 'busy' } } } });
  await until(() => events(unfold.received).includes('prompt'), 'a prompt reports working');
  assert.equal(unfold.received.at(-1)!.body.model, 'anthropic/claude-sonnet-5');
  const system = { system: ['You are OpenCode.'] };
  await plugin['experimental.chat.system.transform']({ sessionID: id, model: {} }, system);
  assert.deepEqual(system.system, ['You are OpenCode.', `Unfold records this session as http://unfold.test/#linked-session/${id}.`], 'the session learns its Unfold page and trailer');

  await plugin.event({ event: { type: 'permission.asked', properties: { id: 'per_1', sessionID: id, permission: 'bash', patterns: ['git push'] } } });
  await until(() => events(unfold.received).includes('waiting'), 'a permission request reports waiting');
  assert.equal(unfold.received.at(-1)!.body.waitingFor, 'permission_prompt');
  await plugin.event({ event: { type: 'permission.replied', properties: { sessionID: id, requestID: 'per_1', reply: 'once' } } });
  await plugin.event({ event: { type: 'question.asked', properties: { id: 'que_1', sessionID: id, questions: [{ question: 'SECRET-PROMPT?' }] } } });
  await until(() => events(unfold.received).filter(event => event === 'waiting').length === 2, 'a question reports waiting');
  assert.equal(unfold.received.at(-1)!.body.waitingFor, 'agent_needs_input');
  await plugin.event({ event: { type: 'question.replied', properties: { sessionID: id, requestID: 'que_1', answers: [['SECRET-ANSWER']] } } });

  const content = 'export function login(user) {\n  return check(user);\n}\n';
  await plugin['tool.execute.after']({ tool: 'write', sessionID: id, callID: 'c1', args: { filePath: join(repo, 'src/login.ts'), content } }, { title: 'write', output: 'SECRET-OUTPUT', metadata: {} });
  await plugin.event({ event: { type: 'session.created', properties: { sessionID: child, info: { ...info, id: child, parentID: id } } } });
  const helper = 'export const reviewed = (value: string) => value.trim();\n';
  await plugin['tool.execute.after']({ tool: 'apply_patch', sessionID: child, callID: 'c2', args: { patchText: `*** Begin Patch\n*** Add File: src/review.ts\n+${helper.trim()}\n*** End Patch` } }, { title: 'patch', output: 'SECRET-OUTPUT', metadata: {} });
  await writeFile(join(repo, 'src/login.ts'), `${content}// a person added this line\n`);
  await writeFile(join(repo, 'src/review.ts'), helper);
  gitIn('add', 'src');
  gitIn('commit', '-q', '-m', `feat: login\n\nUnfold-Session: http://unfold.test/#linked-session/${id}`);
  const head = gitIn('rev-parse', 'HEAD');
  await plugin['tool.execute.after']({ tool: 'bash', sessionID: id, callID: 'c3', args: { command: 'git commit -m "feat: login" && gh pr create --fill' } }, { title: 'bash', output: 'SECRET-OUTPUT\nhttps://github.com/o/r/pull/9', metadata: {} });
  await until(() => unfold.received.some(entry => entry.path.endsWith('/traces')), 'a commit sends its Agent Trace record');
  await until(() => unfold.received.some(entry => entry.body.pullRequests?.length), 'an opened pull request is reported');
  const commit = unfold.received.find(entry => entry.body.event === 'commit');
  assert.deepEqual(commit?.body.commit, { sha: head, subject: 'feat: login', trailer: true });
  const record = parseAgentTrace(unfold.received.find(entry => entry.path === `/api/linked-sessions/${id}/traces`)!.body);
  assert.equal(record.tool?.name, 'opencode');
  assert.equal(record.tool?.version, '1.18.33');
  assert.equal((record.metadata as Record<string, any>)['dev.unfoldhq'].harness, 'opencode');
  assert.deepEqual(record.files.map(file => [file.path, file.conversations.map(conversation => [String(conversation.url).replace(/^.*#/, '#'), conversation.ranges.map(range => [range.start_line, range.end_line])])]), [
    ['src/login.ts', [[`#linked-session/${id}`, [[1, 3]]]]],
    ['src/review.ts', [[`#linked-session/${id}?agent=subagent`, [[1, 1]]]]],
  ]);
  assert.equal(JSON.parse(gitIn('notes', '--ref=agent-trace', 'show', head)).id, record.id);
  assert.deepEqual(unfold.received.find(entry => entry.body.pullRequests?.length)!.body.pullRequests, ['https://github.com/o/r/pull/9']);

  await plugin.event({ event: { type: 'session.idle', properties: { sessionID: child } } });
  await plugin.event({ event: { type: 'session.idle', properties: { sessionID: id } } });
  await until(() => events(unfold.received).at(-1) === 'idle', 'session.idle reports idle');
  await plugin.event({ event: { type: 'session.deleted', properties: { info } } });
  await until(() => events(unfold.received).at(-1) === 'end', 'session.deleted reports the end');
  assert.ok(unfold.received.every(entry => entry.body.sessionId === undefined || entry.body.sessionId === id), 'a subagent session reports as part of its parent');
  const sent = JSON.stringify(unfold.received);
  for (const secret of secrets) assert.ok(!sent.includes(secret), `${secret} never leaves the machine`);
  assert.ok(!sent.includes('return check(user)'), 'file contents never leave the machine');

  const count = unfold.received.length;
  const other = 'ses_e951b7c6bffeotherresumed1';
  await plugin['chat.message']({ sessionID: other, model: { providerID: 'openai', modelID: 'gpt-5.5' } }, { message: {}, parts: [] });
  await plugin.dispose();
  assert.deepEqual(unfold.received.slice(count).map(entry => entry.body.event), ['start', 'prompt', 'end'], 'a resumed session OpenCode never announced still starts, and closing OpenCode ends it');
});

test('without UNFOLD_URL and UNFOLD_TOKEN the OpenCode plugin registers no hooks', async t => {
  const saved = { ...process.env };
  t.after(() => { process.env = saved; });
  delete process.env.UNFOLD_URL; delete process.env.UNFOLD_TOKEN;
  const { UnfoldPlugin } = await import('../extensions/opencode/unfold-plugin.mjs');
  assert.deepEqual(await UnfoldPlugin({ directory: tmpdir() }), {});
  const exported = Object.keys(await import('../extensions/opencode/unfold-plugin.mjs'));
  assert.deepEqual(exported, ['UnfoldPlugin'], 'OpenCode calls every exported function as a plugin, so the file exports one');
});

function runCodex(payload: Record<string, unknown> | null, env: Record<string, string>, argument?: Record<string, unknown>): Promise<{ stdout: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [codexHook, ...(argument ? [JSON.stringify(argument)] : [])], { env: { PATH: process.env.PATH ?? '', HOME: env.HOME, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ stdout, code }));
    child.stdin.end(payload ? JSON.stringify(payload) : '');
  });
}

test('the Codex hook reports start, working, waiting for approval, commits with Agent Trace, idle and end, and the notify program reports a finished turn', async t => {
  const unfold = await fakeUnfold();
  const dir = await mkdtemp(join(tmpdir(), 'unfold-codex-'));
  t.after(async () => { await unfold.close(); await rm(dir, { recursive: true, force: true }); });
  const { repo, gitIn } = await repository(dir);
  const env = { HOME: dir, UNFOLD_URL: unfold.url, UNFOLD_TOKEN: 'vle_test', XDG_STATE_HOME: join(dir, 'state') };
  const transcript = join(dir, 'rollout.jsonl');
  await writeFile(transcript, `${JSON.stringify({ type: 'session_meta', payload: { id: '0199a213-81c0-7800-8aa1-bbab2a035a53', cli_version: '0.130.0', instructions: 'SECRET-PROMPT' } })}\n`);
  const base = { session_id: '0199a213-81c0-7800-8aa1-bbab2a035a53', cwd: repo, transcript_path: transcript, model: 'gpt-5.5-codex', permission_mode: 'default' };

  const started = await runCodex({ ...base, hook_event_name: 'SessionStart', source: 'startup' }, env);
  assert.equal(started.code, 0);
  assert.deepEqual(JSON.parse(started.stdout), { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `Unfold records this session as http://unfold.test/#linked-session/${base.session_id}.` } });
  assert.deepEqual([unfold.received[0].body.harness, unfold.received[0].body.event, unfold.received[0].body.harnessVersion, unfold.received[0].body.model, unfold.received[0].body.branch], ['codex', 'start', '0.130.0', 'gpt-5.5-codex', 'feat/vik-2051-login']);
  assert.equal(unfold.received[0].client, 'codex-hook');

  await runCodex({ ...base, hook_event_name: 'UserPromptSubmit', turn_id: 't1', prompt: 'SECRET-PROMPT' }, env);
  assert.equal(unfold.received.at(-1)!.body.event, 'prompt');
  const asked = await runCodex({ ...base, hook_event_name: 'PermissionRequest', turn_id: 't1', tool_name: 'Bash', tool_input: { command: 'git push', description: 'SECRET-PROMPT' } }, env);
  assert.equal(asked.stdout, '', 'the hook never answers an approval itself');
  assert.deepEqual([unfold.received.at(-1)!.body.event, unfold.received.at(-1)!.body.waitingFor], ['waiting', 'permission_prompt']);

  const content = 'export function login(user) {\n  return check(user);\n}';
  await runCodex({ ...base, hook_event_name: 'PostToolUse', turn_id: 't1', tool_name: 'apply_patch', tool_use_id: 'u1', tool_input: { command: `*** Begin Patch\n*** Add File: src/login.ts\n${content.split('\n').map(line => `+${line}`).join('\n')}\n*** End Patch` }, tool_response: 'SECRET-OUTPUT' }, env);
  assert.equal(unfold.received.at(-1)!.body.event, 'prompt', 'the first tool call after an approval reports working again');
  const before = unfold.received.length;
  await runCodex({ ...base, hook_event_name: 'PostToolUse', turn_id: 't1', tool_name: 'apply_patch', tool_use_id: 'u2', tool_input: { command: '*** Begin Patch\n*** End Patch' } }, env);
  assert.equal(unfold.received.length, before, 'remembering an edit sends nothing');
  await writeFile(join(repo, 'src/login.ts'), `${content}\n// a person added this line\n`);
  gitIn('add', 'src');
  gitIn('commit', '-q', '-m', 'feat: login');
  const head = gitIn('rev-parse', 'HEAD');
  await runCodex({ ...base, hook_event_name: 'PostToolUse', turn_id: 't1', tool_name: 'Bash', tool_use_id: 'u3', tool_input: { command: 'git commit -m "feat: login"' }, tool_response: 'SECRET-OUTPUT' }, env);
  assert.deepEqual(unfold.received.find(entry => entry.body.event === 'commit')?.body.commit, { sha: head, subject: 'feat: login', trailer: false });
  const record = parseAgentTrace(unfold.received.find(entry => entry.path.endsWith('/traces'))!.body);
  assert.deepEqual([record.tool?.name, record.tool?.version, record.vcs?.revision], ['codex', '0.130.0', head]);
  assert.deepEqual(record.files.map(file => [file.path, file.conversations[0].ranges.map(range => [range.start_line, range.end_line])]), [['src/login.ts', [[1, 3]]]]);
  assert.equal(record.files[0].conversations[0].contributor?.model_id, 'gpt-5.5-codex');

  await runCodex({ ...base, hook_event_name: 'Stop', turn_id: 't1', stop_hook_active: false, last_assistant_message: 'SECRET-OUTPUT' }, env);
  assert.equal(unfold.received.at(-1)!.body.event, 'idle');
  await runCodex({ ...base, hook_event_name: 'SessionEnd', reason: 'exit' }, env);
  assert.equal(unfold.received.at(-1)!.body.event, 'end');

  const notify = await runCodex(null, env, { type: 'agent-turn-complete', 'thread-id': '0199a213-81c0-7800-8aa1-bbab2a035a54', 'turn-id': 't9', cwd: repo, 'input-messages': ['SECRET-PROMPT'], 'last-assistant-message': 'SECRET-OUTPUT' });
  assert.equal(notify.code, 0);
  assert.deepEqual([unfold.received.at(-1)!.body.sessionId, unfold.received.at(-1)!.body.event], ['0199a213-81c0-7800-8aa1-bbab2a035a54', 'idle']);
  const sent = JSON.stringify(unfold.received);
  for (const secret of secrets) assert.ok(!sent.includes(secret), `${secret} never leaves the machine`);
  assert.ok(!sent.includes('return check(user)'), 'file contents never leave the machine');

  const hooks = JSON.parse(await readFile(join(extensions, 'codex/hooks.json'), 'utf8')).hooks;
  assert.deepEqual(Object.keys(hooks).sort(), ['Interrupt', 'PermissionRequest', 'PostToolUse', 'SessionEnd', 'SessionStart', 'Stop', 'UserPromptSubmit']);
  for (const [name, groups] of Object.entries(hooks) as [string, { hooks: { command: string; timeout: number }[] }[]][]) for (const group of groups) for (const handler of group.hooks) {
    assert.match(handler.command, /extensions\/codex\/unfold-codex\.mjs/);
    assert.ok(handler.timeout > 0 && handler.timeout <= (['SessionEnd', 'Interrupt'].includes(name) ? 3 : 20), `${name} never holds a session up for long`);
  }
});

test('without UNFOLD_URL and UNFOLD_TOKEN, or with Unfold down, the Codex hook prints nothing and exits 0', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-codex-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const payload = { session_id: '0199a213-81c0-7800-8aa1-bbab2a035a53', cwd: dir, hook_event_name: 'SessionStart', source: 'startup' };
  assert.deepEqual(await runCodex(payload, { HOME: dir }), { stdout: '', code: 0 });
  assert.deepEqual(await runCodex(payload, { HOME: dir, UNFOLD_URL: 'http://127.0.0.1:9', UNFOLD_TOKEN: 'vle_x', UNFOLD_HOOK_TIMEOUT_MS: '500', XDG_STATE_HOME: join(dir, 'state') }), { stdout: '', code: 0 });
  assert.deepEqual(await runCodex(null, { HOME: dir }, { type: 'agent-turn-complete', 'thread-id': '0199a213-81c0-7800-8aa1-bbab2a035a53' }), { stdout: '', code: 0 });
});
