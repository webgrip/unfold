import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { dispatchedSession, remoteName, workItemArgument } from '../extensions/claude-code/scripts/unfold-start.mjs';

const plugin = fileURLToPath(new URL('../extensions/claude-code/', import.meta.url));
const script = join(plugin, 'scripts/unfold-start.mjs');
const run = promisify(execFile);

test('the start command reads a Work Item id or link, a remote’s owner and name, and the session id of a dispatch', () => {
  assert.equal(workItemArgument('184'), '184');
  assert.equal(workItemArgument('#184'), '184');
  assert.equal(workItemArgument('https://unfold.example.org/#work/184'), '184');
  assert.equal(workItemArgument('184; rm -rf /'), '');
  assert.equal(remoteName('git@forgejo.example.org:Example/order-service.git'), 'example/order-service');
  assert.equal(remoteName('https://forgejo.example.org/example/order-service'), 'example/order-service');
  assert.equal(dispatchedSession('starting\n{"ok":true,"session_id":"session_01abc"}\n'), 'session_01abc');
  assert.throws(() => dispatchedSession('{"ok":false,"error":"API keys cannot dispatch"}'), /API keys cannot dispatch/);
  assert.throws(() => dispatchedSession('not json'), /no dispatch result/);
});

test('the plugin ships /unfold:start, which runs only the start script', async () => {
  const command = await readFile(join(plugin, 'commands/start.md'), 'utf8');
  assert.match(command, /^---\ndescription: .+\nargument-hint: .+\nallowed-tools: Bash\(node:\*\)\n---\n/);
  assert.match(command, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/unfold-start\.mjs" \$ARGUMENTS/);
});

async function unfold(waiting = true) {
  const calls: { method: string; path: string; body: unknown; authorization?: string }[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    calls.push({ method: req.method!, path: req.url!, body: text ? JSON.parse(text) : null, authorization: req.headers.authorization });
    const send = (data: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(data));
    if (req.url === '/api/ploeg/work-items/184') return send({ item: { id: '184', target: { owner: 'example', repo: 'order-service' }, waitingForClient: waiting ? { reason: 'start_from_claude_code', actsFor: 'op' } : null } });
    if (req.url === '/api/ploeg/work-items/184/claim') return send({ run: { id: '9001', role: 'implementer', round: 1 }, dispatch: { environmentId: 'ccpool_team', ref: 'main', branch: 'claude/vik-9', prompt: "Do the work; don't stop." }, deadline: '2026-10-24T11:00:00Z' });
    if (req.url === '/api/ploeg/work-items/184/claude-session') return send({ recorded: true });
    res.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, calls, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

async function workspace(remote: string, dispatch: string) {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-start-'));
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', remote]);
  const fake = join(dir, 'fake-claude.mjs');
  await writeFile(fake, `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(join(dir, 'argv.json'))}, JSON.stringify(process.argv.slice(2)));\nprocess.stdout.write(${JSON.stringify(dispatch)});\n`);
  await chmod(fake, 0o755);
  return { dir, fake };
}

test('/unfold:start claims through Unfold, dispatches with the person’s own claude, and records the session it printed', async t => {
  const server = await unfold();
  const { dir, fake } = await workspace('git@forgejo.example.org:example/order-service.git', '{"ok":true,"session_id":"session_01abcdef"}\n');
  t.after(async () => { await server.close(); await rm(dir, { recursive: true, force: true }); });
  const { stdout } = await run(process.execPath, [script, '184'], { cwd: dir, env: { ...process.env, UNFOLD_URL: server.url, UNFOLD_TOKEN: 'vle_test', UNFOLD_CLAUDE_BIN: fake } });
  assert.match(stdout, /Started: session session_01abcdef runs Work Item 184 on branch claude\/vik-9/);
  assert.match(stdout, /https:\/\/claude\.ai\/code\/session_01abcdef/);
  assert.deepEqual(server.calls.map(call => `${call.method} ${call.path}`), ['GET /api/ploeg/work-items/184', 'POST /api/ploeg/work-items/184/claim', 'POST /api/ploeg/work-items/184/claude-session']);
  assert.deepEqual(server.calls[2].body, { runId: '9001', sessionId: 'session_01abcdef' });
  assert.equal(server.calls[0].authorization, 'Bearer vle_test');
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'argv.json'), 'utf8')), ['-p', "Do the work; don't stop.", '--environment', 'ccpool_team', '--ref', 'main', '--output-format', 'json'], 'the prompt is one argument, never a shell string');
});

test('/unfold:start claims nothing outside a clone of the repository or when no Run waits, and says what lapses when the dispatch fails', async t => {
  const server = await unfold();
  const other = await workspace('https://forgejo.example.org/example/elsewhere.git', '');
  const failing = await workspace('https://forgejo.example.org/example/order-service.git', '{"ok":false,"error":"no seat"}');
  t.after(async () => { await server.close(); await rm(other.dir, { recursive: true, force: true }); await rm(failing.dir, { recursive: true, force: true }); });
  const env = { ...process.env, UNFOLD_URL: server.url, UNFOLD_TOKEN: 'vle_test' };
  const wrong = await run(process.execPath, [script, '184'], { cwd: other.dir, env: { ...env, UNFOLD_CLAUDE_BIN: other.fake } }).catch(error => error);
  assert.match(wrong.stdout, /in a clone of example\/order-service.*Nothing was claimed/);
  assert.equal(server.calls.some(call => call.path.endsWith('/claim')), false);
  const failed = await run(process.execPath, [script, '184'], { cwd: failing.dir, env: { ...env, UNFOLD_CLAUDE_BIN: failing.fake } }).catch(error => error);
  assert.match(failed.stdout, /The dispatch failed: Claude Code refused the dispatch: no seat/);
  assert.match(failed.stdout, /stays claimed until 2026-10-24T11:00:00Z/);
  assert.equal(server.calls.some(call => call.path.endsWith('/claude-session')), false);
  const idle = await unfold(false);
  t.after(() => idle.close());
  const none = await run(process.execPath, [script, '184'], { cwd: failing.dir, env: { ...env, UNFOLD_URL: idle.url } }).catch(error => error);
  assert.match(none.stdout, /No Run of Work Item 184 waits for your Claude Code/);
  const missing = await run(process.execPath, [script, 'abc'], { cwd: failing.dir, env }).catch(error => error);
  assert.match(missing.stdout, /Name the Work Item/);
});
