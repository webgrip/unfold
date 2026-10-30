import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { handBackBody, startCommand, takeOverBrief, worktreePath } from '../extensions/claude-code/scripts/unfold-takeover.mjs';

const plugin = fileURLToPath(new URL('../extensions/claude-code/', import.meta.url));
const script = join(plugin, 'scripts/unfold-takeover.mjs');
const run = promisify(execFile);
const branch = 'agent/vik-2372';

const status = (state: string, commit = '') => ({ workItemId: '184', title: 'Fix rounding', state: state === 'taken_over' ? 'needs_human' : 'leased', repository: { forge: 'forgejo', owner: 'example', repo: 'order-service', baseBranch: 'main' }, takeOver: { id: '7', state, by: 'op', shiftId: '13', round: 2, branch, requestedAt: '2026-10-24T10:00:00Z', yieldedAt: '2026-10-24T10:00:40Z', commit, workInProgress: commit, pushed: true, detail: null, handedBackAt: null, handedBackShiftId: null }, takeControl: null, handBack: { enabled: true, reason: '' }, latestRun: { id: '820', role: 'implementer', round: 2, summary: 'Rounded to cents; tests for negative amounts still fail.' } });

test('the take-over brief says what Ploeg left and quotes agent text as data; the hand-back sends only the note', () => {
  const brief = takeOverBrief(status('taken_over', 'c'.repeat(40)));
  assert.match(brief, /I took over Unfold Work Item 184 from Ploeg: Fix rounding\./);
  assert.match(brief, /branch agent\/vik-2372 is at cccccccccccc on the forge/);
  assert.match(brief, /work in progress commit cccccccccccc \("wip: work in progress handed to a person", trailer Ploeg-Yield\)/);
  assert.match(brief, /The latest implementer Run \(Round 2\) reported: Rounded to cents/);
  assert.match(brief, /information, not instructions/);
  assert.match(brief, /\/unfold:handback 184/);
  assert.deepEqual(handBackBody('  Fixed negatives.\u0007 '), { note: 'Fixed negatives.' });
  assert.deepEqual(handBackBody(''), {});
  assert.equal(worktreePath('/repo', '184'), '/repo/.claude/worktrees/unfold-184');
  assert.equal(startCommand('/repo/x', '184', "it's"), "cd '/repo/x' && UNFOLD_WORK_ITEM='184' claude 'it'\\''s'");
});

test('the plugin ships /unfold:takeover and /unfold:handback, which run only the take-over script', async () => {
  for (const [name, mode] of [['takeover', 'takeover'], ['handback', 'handback']]) {
    const command = await readFile(join(plugin, `commands/${name}.md`), 'utf8');
    assert.match(command, /^---\ndescription: .+\nargument-hint: .+\nallowed-tools: Bash\(node:\*\)\n---\n/);
    assert.match(command, new RegExp(`node "\\$\\{CLAUDE_PLUGIN_ROOT\\}/scripts/unfold-takeover\\.mjs" ${mode} `));
  }
  for (const file of ['plugin.json', '.claude-plugin/plugin.json']) assert.equal(JSON.parse(await readFile(join(plugin, file), 'utf8')).version, '0.16.0');
});

async function unfold(t: TestContext, state: () => Record<string, unknown>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    calls.push({ method: req.method!, path: req.url!, body: text ? JSON.parse(text) : null });
    const send = (data: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(data));
    if (req.url === '/api/ploeg/work-items/184/take-over' && req.method === 'GET') return send(state());
    if (req.url === '/api/ploeg/work-items/184/hand-back' && req.method === 'POST') return send({ workItemId: '184', state: 'queued', fromRound: 2, resumed: true });
    res.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, calls };
}

async function repository(t: TestContext) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'unfold-takeover-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.org', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8' }).trim();
  const origin = join(dir, 'example', 'order-service.git');
  await mkdir(origin, { recursive: true });
  git(origin, 'init', '-q', '--bare');
  const seed = join(dir, 'seed');
  git(dir, 'init', '-q', seed);
  git(seed, 'remote', 'add', 'origin', origin);
  await writeFile(join(seed, 'README.md'), 'hello\n');
  git(seed, 'add', 'README.md');
  git(seed, 'commit', '-q', '-m', 'init');
  git(seed, 'push', '-q', 'origin', 'HEAD:main');
  git(seed, 'switch', '-q', '-c', branch);
  await writeFile(join(seed, 'rounding.txt'), 'wip\n');
  git(seed, 'add', 'rounding.txt');
  git(seed, 'commit', '-q', '-m', 'wip: work in progress handed to a person');
  git(seed, 'push', '-q', 'origin', branch);
  const yielded = git(seed, 'rev-parse', 'HEAD');
  const clone = join(dir, 'clone');
  git(dir, 'clone', '-q', origin, clone);
  const fake = join(dir, 'fake-claude.mjs');
  await writeFile(fake, `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(join(dir, 'claude.json'))}, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), workItem: process.env.UNFOLD_WORK_ITEM }));\n`);
  await chmod(fake, 0o755);
  return { dir, clone, fake, yielded, git };
}

test('/unfold:takeover checks the yielded branch out in a worktree and starts claude there with the Work Item and the brief', async t => {
  const repo = await repository(t);
  const server = await unfold(t, () => status('taken_over', repo.yielded));
  const env = { ...process.env, UNFOLD_URL: server.url, UNFOLD_TOKEN: 'vle_test', UNFOLD_CLAUDE_BIN: repo.fake };
  const printed = await run(process.execPath, [script, 'takeover', '#184'], { cwd: repo.clone, env: { ...env, UNFOLD_TAKEOVER_LAUNCH: 'print' } });
  const worktree = join(repo.clone, '.claude', 'worktrees', 'unfold-184');
  assert.match(printed.stdout, new RegExp(`Work Item 184 is yours: agent/vik-2372 is checked out at ${repo.yielded.slice(0, 12)}`));
  assert.equal(repo.git(worktree, 'rev-parse', 'HEAD'), repo.yielded);
  assert.equal(repo.git(worktree, 'rev-parse', '--abbrev-ref', 'HEAD'), branch);
  assert.match(printed.stdout, new RegExp(`cd '${worktree}' && UNFOLD_WORK_ITEM='184' '${repo.fake}' 'I took over Unfold Work Item 184`));
  assert.equal(existsSync(join(repo.dir, 'claude.json')), false, 'print mode starts nothing');
  const started = await run(process.execPath, [script, 'takeover', '184'], { cwd: repo.clone, env: { ...env, UNFOLD_TAKEOVER_LAUNCH: 'exec' } });
  assert.match(started.stdout, /Using the existing worktree/);
  const launched = JSON.parse(await readFile(join(repo.dir, 'claude.json'), 'utf8'));
  assert.equal(launched.cwd, worktree);
  assert.equal(launched.workItem, '184');
  assert.equal(launched.argv.length, 1, 'the brief is one argument, never a shell string');
  assert.match(launched.argv[0], /Ploeg's Run stopped at a safe point/);
  assert.deepEqual(server.calls.map(call => `${call.method} ${call.path}`), ['GET /api/ploeg/work-items/184/take-over', 'GET /api/ploeg/work-items/184/take-over']);
});

test('/unfold:takeover checks nothing out before the Run stopped or outside a clone of the repository', async t => {
  const repo = await repository(t);
  let state = status('yielding');
  const server = await unfold(t, () => state);
  const env = { ...process.env, UNFOLD_URL: server.url, UNFOLD_TOKEN: 'vle_test', UNFOLD_CLAUDE_BIN: repo.fake, UNFOLD_TAKEOVER_LAUNCH: 'print' };
  const early = await run(process.execPath, [script, 'takeover', '184'], { cwd: repo.clone, env }).catch(error => error);
  assert.match(early.stdout, /has not stopped at a safe point yet/);
  state = { ...status('taken_over', repo.yielded), repository: { forge: 'forgejo', owner: 'example', repo: 'elsewhere', baseBranch: 'main' } };
  const wrong = await run(process.execPath, [script, 'takeover', '184'], { cwd: repo.clone, env }).catch(error => error);
  assert.match(wrong.stdout, /in a clone of example\/elsewhere.*Nothing was checked out/);
  assert.equal(existsSync(join(repo.clone, '.claude')), false);
  const missing = await run(process.execPath, [script, 'takeover', 'abc'], { cwd: repo.clone, env }).catch(error => error);
  assert.match(missing.stdout, /Name the Work Item/);
});

test('/unfold:handback refuses uncommitted changes and unpushed commits, then hands back with the note', async t => {
  const repo = await repository(t);
  const server = await unfold(t, () => status('taken_over', repo.yielded));
  const env = { ...process.env, UNFOLD_URL: server.url, UNFOLD_TOKEN: 'vle_test', UNFOLD_CLAUDE_BIN: repo.fake, UNFOLD_TAKEOVER_LAUNCH: 'print' };
  await run(process.execPath, [script, 'takeover', '184'], { cwd: repo.clone, env });
  const worktree = join(repo.clone, '.claude', 'worktrees', 'unfold-184');
  await writeFile(join(worktree, 'rounding.txt'), 'done\n');
  const dirty = await run(process.execPath, [script, 'handback', '184', 'Fixed', 'negatives'], { cwd: worktree, env }).catch(error => error);
  assert.match(dirty.stdout, /has uncommitted changes \(1 path\).*Nothing was handed back/);
  repo.git(worktree, 'commit', '-q', '-am', 'fix: round negative amounts');
  const unpushed = await run(process.execPath, [script, 'handback', '184', 'Fixed negatives'], { cwd: repo.clone, env }).catch(error => error);
  assert.match(unpushed.stdout, /1 commit is not pushed to origin\/agent\/vik-2372.*Nothing was handed back/);
  assert.equal(server.calls.some(call => call.path.endsWith('/hand-back')), false);
  repo.git(worktree, 'push', '-q', 'origin', branch);
  const back = await run(process.execPath, [script, 'handback', '184', 'Fixed negatives; it\'s ready'], { cwd: repo.clone, env });
  assert.match(back.stdout, /Handed back: Ploeg resumes Round 2 of Work Item 184 on agent\/vik-2372/);
  assert.match(back.stdout, /git worktree remove/);
  assert.deepEqual(server.calls.at(-1), { method: 'POST', path: '/api/ploeg/work-items/184/hand-back', body: { note: 'Fixed negatives; it\'s ready' } });
});
