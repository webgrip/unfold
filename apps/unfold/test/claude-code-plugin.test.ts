import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addedLines, attribute, limits, modelId, remember, traceRecord, writtenText } from '../extensions/claude-code/scripts/agent-trace.mjs';
import { parseAgentTrace, traceLines } from '../src/agent-trace.ts';
import { permissionBounds } from '../extensions/claude-code/scripts/permission.mjs';

const plugin = fileURLToPath(new URL('../extensions/claude-code/', import.meta.url));
const hook = join(plugin, 'scripts/unfold-hook.mjs');
const sha = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';

test('the plugin manifest, hooks and marketplace entry are what Claude Code loads', async () => {
  const manifest = JSON.parse(await readFile(join(plugin, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'unfold');
  assert.equal(manifest.license, 'Apache-2.0');
  const hooks = JSON.parse(await readFile(join(plugin, 'hooks/hooks.json'), 'utf8')).hooks;
  assert.deepEqual(Object.keys(hooks).sort(), ['Notification', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure', 'SessionEnd', 'SessionStart', 'Stop', 'UserPromptSubmit']);
  for (const [event, entries] of Object.entries(hooks) as [string, { hooks: { type: string; command: string; timeout: number }[] }[]][]) for (const entry of entries) for (const command of entry.hooks) {
    assert.equal(command.type, 'command');
    assert.match(command.command, /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/unfold-hook\.mjs/);
    if (event === 'PermissionRequest') assert.ok(command.timeout > permissionBounds.maxWaitSeconds && command.timeout <= permissionBounds.maxWaitSeconds + 15, 'the permission hook outlasts its longest wait; Claude Code shows its own prompt meanwhile, so the wait holds nothing up');
    else assert.ok(command.timeout > 0 && command.timeout <= 20, 'a hook never holds a session up for long');
  }
  const marketplace = JSON.parse(await readFile(new URL('../../../.claude-plugin/marketplace.json', import.meta.url), 'utf8'));
  assert.deepEqual(marketplace.plugins.map((entry: { name: string; source: string }) => [entry.name, entry.source]), [['unfold', './apps/unfold/extensions/claude-code']]);
});

test('lines the agent wrote are matched by fingerprint in the commit, short lines follow their neighbours, and lines it did not write stay out', () => {
  const written: Record<string, any> = {};
  remember(written, 'src/login.ts', writtenText('Write', { content: 'export function login(user) {\n  return check(user);\n}\n' }));
  remember(written, 'src/login.ts', writtenText('MultiEdit', { edits: [{ new_string: '    const audited = audit(user);' }] }));
  assert.equal(writtenText('Edit', { new_string: 'x' }), 'x');
  assert.equal(writtenText('Bash', { command: 'rm -rf /' }), '');
  const diff = ['diff --git a/src/login.ts b/src/login.ts', '--- /dev/null', '+++ b/src/login.ts', '@@ -0,0 +1,6 @@', '+export function login(user) {', '+    return check(user);', '+  // written by a person', '+  const audited = audit(user);', '+}', '+', 'diff --git a/README.md b/README.md', '--- a/README.md', '+++ b/README.md', '@@ -3,0 +4 @@', '+A person wrote this.'].join('\n');
  const added = addedLines(diff);
  assert.deepEqual([...added.keys()], ['src/login.ts', 'README.md']);
  const files = attribute(added, written);
  assert.deepEqual(files.map(file => [file.path, file.ranges.map(range => [range.start_line, range.end_line])]), [['src/login.ts', [[1, 2], [4, 5]]]]);
  assert.match(files[0].ranges[0].content_hash, /^sha256:[0-9a-f]{16}$/);
  assert.equal(modelId('claude-opus-5-5[1m]'), 'anthropic/claude-opus-5-5');
  assert.equal(modelId(''), '');
});

test('lines written by a subagent are attributed to it, in their own conversation, and an older state counts as the main agent', () => {
  const written: Record<string, any> = {};
  remember(written, 'src/a.ts', 'const main = 1;\nconst shared = 2;');
  remember(written, 'src/a.ts', 'const reviewed = 3;\nconst shared = 2;', 'code-reviewer');
  const diff = ['+++ b/src/a.ts', '@@ -0,0 +1,4 @@', '+const main = 1;', '+const shared = 2;', '+const reviewed = 3;', '+}'].join('\n');
  const files = attribute(addedLines(diff), written);
  assert.deepEqual(files[0].ranges.map((range: any) => [range.start_line, range.end_line, range.agent]), [[1, 1, 'main'], [2, 4, 'code-reviewer']], 'the last agent to write a line owns it, and a closing brace follows its neighbour');
  const record = traceRecord({ revision: sha, timestamp: '2026-10-18T10:00:00Z', files, sessionId: 'abcd1234', sessionUrl: 'https://unfold.example.org/#linked-session/abcd1234' });
  const parsed = parseAgentTrace(record);
  assert.deepEqual(parsed.files[0].conversations.map(conversation => [conversation.url, conversation.ranges.length]), [['https://unfold.example.org/#linked-session/abcd1234', 1], ['https://unfold.example.org/#linked-session/abcd1234?agent=code-reviewer', 1]]);
  assert.deepEqual(parsed.files[0].conversations[1].related, [{ type: 'parent-session', url: 'https://unfold.example.org/#linked-session/abcd1234' }]);
  assert.deepEqual((parsed.metadata as Record<string, any>)['dev.unfoldhq'].agents, ['main', 'code-reviewer']);
  const legacy: Record<string, any> = { 'src/b.ts': [] };
  remember(legacy, 'src/b.ts', 'const old = true;');
  assert.deepEqual(Object.values(legacy['src/b.ts']), ['main']);
});

test('a record from the plugin passes Unfold’s strict Agent Trace check and links the session and its Work Items', () => {
  const record = traceRecord({ revision: sha, timestamp: '2026-10-17T10:00:00+02:00', files: [{ path: 'src/login.ts', ranges: [{ start_line: 1, end_line: 2, content_hash: 'sha256:00' }] }], sessionId: 'abcd1234', sessionUrl: 'https://unfold.example.org/#linked-session/abcd1234', remoteUrl: 'https://claude.ai/code/session_0123456789', model: 'claude-opus-5-5', harnessVersion: '2.1.301', workItems: [{ id: '184', url: 'https://unfold.example.org/#work/184' }] });
  const parsed = parseAgentTrace(record);
  assert.deepEqual(traceLines(parsed), { ai: 2, human: 0, mixed: 0, unknown: 0, files: 1 });
  assert.deepEqual(parsed.files[0].conversations[0].related, [{ type: 'session', url: 'https://claude.ai/code/session_0123456789' }, { type: 'work-item', url: 'https://unfold.example.org/#work/184' }]);
  assert.equal((parsed.metadata as Record<string, any>)['dev.unfoldhq'].method, 'line-fingerprint');
  assert.equal(traceRecord({ revision: sha, timestamp: 'x', files: [], sessionId: 'a', sessionUrl: 'https://x.example' }), null);
  const huge = Array.from({ length: 3000 }, (_, index) => ({ path: `src/file-${index}.ts`, ranges: [{ start_line: 1, end_line: 2, content_hash: 'sha256:0123456789abcdef' }] }));
  const shrunk = traceRecord({ revision: sha, timestamp: '2026-10-17T10:00:00Z', files: huge, sessionId: 'abcd1234', sessionUrl: 'https://unfold.example.org/#linked-session/abcd1234' });
  assert.ok(JSON.stringify(shrunk).length <= limits.recordBytes);
  assert.equal((shrunk!.metadata as Record<string, any>)['dev.unfoldhq'].truncated, true);
  parseAgentTrace(shrunk);
});

async function fakeUnfold() {
  const received: { path: string; auth: string; body: any }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk as Buffer));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      received.push({ path: String(req.url), auth: String(req.headers.authorization), body });
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url === '/api/linked-sessions/events') res.end(JSON.stringify({ session: { link: 'http://unfold.test/#linked-session/plugin-session-1', workItems: [{ id: '184', how: 'branch' }] }, context: 'Unfold records this Claude Code session as http://unfold.test/#linked-session/plugin-session-1.', suggestedTitle: 'VIK-2051 Fix login' }));
      else res.end(JSON.stringify({ stored: true }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, received, close: () => new Promise<void>(done => server.close(() => done())) };
}

function runHook(payload: Record<string, unknown>, env: Record<string, string>): Promise<{ stdout: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hook], { env: { PATH: process.env.PATH ?? '', HOME: env.HOME, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ stdout, code }));
    child.stdin.end(JSON.stringify(payload));
  });
}

test('the hook reports a session, names it after its Work Item, and sends an Agent Trace record and a git note for its commit, also when the repository is reached through a symlink', async t => {
  const unfold = await fakeUnfold();
  const real = await mkdtemp(join(tmpdir(), 'unfold-plugin-'));
  const dir = `${real}-link`;
  await symlink(real, dir);
  t.after(async () => { await unfold.close(); await rm(dir, { force: true }); await rm(real, { recursive: true, force: true }); });
  const repo = join(dir, 'repo');
  const gitIn = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  execFileSync('git', ['init', '-q', '-b', 'feat/vik-2051-login', repo]);
  gitIn('config', 'user.email', 'test@example.org'); gitIn('config', 'user.name', 'Test');
  gitIn('commit', '-q', '--allow-empty', '-m', 'root');
  const env = { HOME: dir, UNFOLD_URL: `${unfold.url}/`, UNFOLD_TOKEN: 'vle_test', CLAUDE_PLUGIN_DATA: join(dir, 'data') };
  const base = { session_id: 'plugin-session-1', cwd: repo, transcript_path: join(dir, 'missing.jsonl') };

  const started = await runHook({ ...base, hook_event_name: 'SessionStart', source: 'startup', model: 'claude-opus-5-5' }, env);
  assert.equal(started.code, 0);
  const output = JSON.parse(started.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(output.hookSpecificOutput.additionalContext, /Unfold records this Claude Code session/);
  assert.equal(output.hookSpecificOutput.sessionTitle, 'VIK-2051 Fix login');
  assert.equal(unfold.received[0].auth, 'Bearer vle_test');
  assert.deepEqual([unfold.received[0].body.event, unfold.received[0].body.branch, unfold.received[0].body.model], ['start', 'feat/vik-2051-login', 'claude-opus-5-5']);
  assert.equal('prompt' in unfold.received[0].body, false);

  const content = 'export function login(user) {\n  return check(user);\n}\n';
  await runHook({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: join(repo, 'src/login.ts'), content } }, env);
  assert.equal(unfold.received.length, 1, 'remembering an edit sends nothing');
  execFileSync('mkdir', ['-p', join(repo, 'src')]);
  await writeFile(join(repo, 'src/login.ts'), `${content}// a person added this line\n`);
  gitIn('add', 'src/login.ts');
  gitIn('commit', '-q', '-m', 'feat: login\n\nUnfold-Session: http://unfold.test/#linked-session/plugin-session-1');
  const head = gitIn('rev-parse', 'HEAD');
  await writeFile(join(dir, 'missing.jsonl'), `${JSON.stringify({ type: 'user', version: '2.1.302', sessionId: 'plugin-session-1' })}\n${JSON.stringify({ type: 'assistant', version: '2.1.302', message: { model: 'claude-haiku-5-5', role: 'assistant' } })}\n`);
  await runHook({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -m "feat: login"' }, tool_response: { stdout: '' } }, env);

  const commit = unfold.received.find(entry => entry.body.event === 'commit');
  assert.deepEqual(commit?.body.commit, { sha: head, subject: 'feat: login', trailer: true });
  const traced = unfold.received.find(entry => entry.path === '/api/linked-sessions/plugin-session-1/traces');
  assert.ok(traced, 'the commit’s Agent Trace record reaches Unfold');
  const record = parseAgentTrace(traced!.body);
  assert.equal(record.vcs?.revision, head);
  assert.equal(record.tool?.version, '2.1.302', 'a session started with an empty transcript learns its version when it commits');
  assert.equal(record.files[0].conversations[0].contributor?.model_id, 'anthropic/claude-opus-5-5', 'the model SessionStart reported wins over the transcript');
  assert.equal(commit?.body.harnessVersion, '2.1.302');
  assert.deepEqual(record.files.map(file => [file.path, file.conversations[0].ranges.map(range => [range.start_line, range.end_line])]), [['src/login.ts', [[1, 3]]]]);
  assert.equal(record.files[0].conversations[0].url, 'http://unfold.test/#linked-session/plugin-session-1');
  assert.equal(JSON.parse(gitIn('notes', '--ref=agent-trace', 'show', head)).id, record.id);

  const before = unfold.received.length;
  await runHook({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }, env);
  assert.equal(unfold.received.length, before, 'a Bash command that made no commit reports nothing');
  await runHook({ ...base, hook_event_name: 'Notification', notification_type: 'auth_success' }, env);
  assert.equal(unfold.received.length, before, 'only notifications that wait for the person are reported');
  await runHook({ ...base, hook_event_name: 'Notification', notification_type: 'permission_prompt' }, env);
  assert.deepEqual([unfold.received.at(-1)!.body.event, unfold.received.at(-1)!.body.waitingFor], ['waiting', 'permission_prompt']);

  const worktree = join(dir, 'worktree');
  gitIn('worktree', 'add', '-q', '-b', 'subagent/branch', worktree);
  const content2 = 'export const reviewed = (value: string) => value.trim();\n';
  await runHook({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Write', agent_id: 'agent-7', agent_type: 'code-reviewer', tool_input: { file_path: join(worktree, 'src/review.ts'), content: content2 } }, env);
  execFileSync('mkdir', ['-p', join(worktree, 'src')]);
  await writeFile(join(worktree, 'src/review.ts'), content2);
  execFileSync('git', ['-C', worktree, 'add', 'src/review.ts']);
  execFileSync('git', ['-C', worktree, 'commit', '-q', '-m', 'feat: review helper']);
  const worktreeHead = execFileSync('git', ['-C', worktree, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  await runHook({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }, env);
  const subTrace = unfold.received.filter(entry => entry.path === '/api/linked-sessions/plugin-session-1/traces').map(entry => parseAgentTrace(entry.body)).find(entry => entry.vcs?.revision === worktreeHead);
  assert.ok(subTrace, 'a commit in a worktree the session edited gets its Agent Trace record');
  assert.deepEqual(subTrace!.files.map(file => [file.path, file.conversations.map(conversation => conversation.url)]), [['src/review.ts', ['http://unfold.test/#linked-session/plugin-session-1?agent=code-reviewer']]]);
  assert.equal(JSON.parse(execFileSync('git', ['-C', worktree, 'notes', '--ref=agent-trace', 'show', worktreeHead], { encoding: 'utf8' })).id, subTrace!.id);
});

test('without UNFOLD_URL and UNFOLD_TOKEN, or with Unfold down, the hook prints nothing and exits 0', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-plugin-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const payload = { session_id: 'plugin-session-2', cwd: dir, hook_event_name: 'SessionStart', source: 'startup' };
  assert.deepEqual(await runHook(payload, { HOME: dir }), { stdout: '', code: 0 });
  assert.deepEqual(await runHook(payload, { HOME: dir, UNFOLD_URL: 'http://127.0.0.1:9', UNFOLD_TOKEN: 'vle_x', UNFOLD_HOOK_TIMEOUT_MS: '500', CLAUDE_PLUGIN_DATA: join(dir, 'data') }), { stdout: '', code: 0 });
});
