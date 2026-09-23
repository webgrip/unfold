import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdir, readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { application, createInput } from './api-support.ts';
import { DemoRuntime } from '../src/runtime/demo.ts';

const command = promisify(execFile);

test('demo resumes after interrupted repository initialization and preserves subsequent working changes', async t => {
  const server = await application();
  t.after(() => server.close());
  const session = server.app.engine.create(createInput() as any, { id: 'demo', name: 'Demo', role: 'admin' });
  const directory = join(server.config.dataDir, 'workspaces', session.id);
  await mkdir(directory, { recursive: true });
  await cp(new URL('../examples/order-service/', import.meta.url), directory, { recursive: true });
  await command('git', ['init', '--initial-branch=main'], { cwd: directory });
  const runtime = new DemoRuntime(server.config);
  const workspace = await runtime.prepare(session, server.config.repositories[0], undefined, new AbortController().signal);
  assert.match(workspace.metadata?.baseSha ?? '', /^[a-f0-9]{40}$/);
  assert.equal((await command('git', ['branch', '--show-current'], { cwd: directory })).stdout.trim(), session.branch);
  const path = join(directory, 'src/order.js');
  const changed = (await readFile(path, 'utf8')).replace('Math.round(amount * 100)', 'Math.round((amount + Number.EPSILON) * 100)');
  await writeFile(path, changed);
  const resumed = await runtime.prepare({ ...session, workspace }, server.config.repositories[0], undefined, new AbortController().signal);
  assert.equal(resumed.metadata?.baseSha, workspace.metadata?.baseSha);
  assert.equal(await readFile(path, 'utf8'), changed);
  assert.match((await command('git', ['diff'], { cwd: directory })).stdout, /Number.EPSILON/);
});


test('demo resumes an incomplete Git directory without replacing existing fixture changes', async t => {
  const server = await application();
  t.after(() => server.close());
  const session = server.app.engine.create(createInput() as any, { id: 'demo', name: 'Demo', role: 'admin' });
  const directory = join(server.config.dataDir, 'workspaces', session.id);
  await cp(new URL('../examples/order-service/', import.meta.url), directory, { recursive: true });
  await mkdir(join(directory, '.git', 'hooks'), { recursive: true });
  await writeFile(join(directory, '.git', 'description'), 'Interrupted demo initialization\n');
  const manifest = join(directory, 'package.json');
  const retained = JSON.stringify({ ...JSON.parse(await readFile(manifest, 'utf8')), description: 'Preserve work present before initialization finished' });
  await writeFile(manifest, retained);
  const workspace = await new DemoRuntime(server.config).prepare(session, server.config.repositories[0], undefined, new AbortController().signal);
  assert.match(workspace.metadata?.baseSha ?? '', /^[a-f0-9]{40}$/);
  assert.equal((await command('git', ['branch', '--show-current'], { cwd: directory })).stdout.trim(), session.branch);
  assert.equal(await readFile(manifest, 'utf8'), retained);
});

test('demo cancellation waits until its child has actually stopped', async t => {
  const root = await mkdtemp(join(tmpdir(), 'vloer-demo-command-'));
  t.after(async () => { await delay(100); await rm(root, { recursive: true, force: true }); });
  const runtime = new DemoRuntime(root) as unknown as { command(binary: string, args: string[], cwd: string, signal: AbortSignal): Promise<unknown> };
  const controller = new AbortController();
  const program = `const fs = require('node:fs'); process.on('SIGTERM', () => setTimeout(() => { fs.writeFileSync('stopped', 'confirmed'); process.exit(0); }, 50)); fs.writeFileSync('ready', 'ready'); setInterval(() => {}, 1000);`;
  const outcome = runtime.command(process.execPath, ['-e', program], root, controller.signal).catch(error => error);
  const deadline = Date.now() + 3000;
  while (await access(join(root, 'ready')).then(() => false, () => true)) {
    assert.ok(Date.now() < deadline, 'child did not start');
    await delay(1);
  }
  controller.abort(new DOMException('Operator paused', 'AbortError'));
  assert.equal((await outcome as Error).name, 'AbortError');
  assert.equal(await readFile(join(root, 'stopped'), 'utf8'), 'confirmed');
});

test('demo cancellation terminates a child that ignores its initial stop signal', async t => {
  const root = await mkdtemp(join(tmpdir(), 'vloer-demo-stop-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = new DemoRuntime(root) as unknown as { command(binary: string, args: string[], cwd: string, signal: AbortSignal): Promise<unknown> };
  const controller = new AbortController();
  const program = `const fs = require('node:fs'); process.on('SIGTERM', () => {}); fs.writeFileSync('ready', String(process.pid)); setInterval(() => {}, 1000);`;
  const outcome = runtime.command(process.execPath, ['-e', program], root, controller.signal).catch(error => error);
  const deadline = Date.now() + 3000;
  while (await access(join(root, 'ready')).then(() => false, () => true)) {
    assert.ok(Date.now() < deadline, 'child did not start');
    await delay(1);
  }
  const pid = Number(await readFile(join(root, 'ready'), 'utf8'));
  controller.abort(new DOMException('Operator paused', 'AbortError'));
  assert.equal((await outcome as Error).name, 'AbortError');
  const gone = Date.now() + 5000;
  while ((() => { try { process.kill(pid, 0); return true; } catch { return false; } })() && Date.now() < gone) await delay(10);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('demo finishes an in-flight Git initialization before acknowledging pause', async t => {
  const server = await application();
  t.after(() => server.close());
  const session = server.app.engine.create(createInput() as any, { id: 'demo', name: 'Demo', role: 'admin' });
  const runtime = new DemoRuntime(server.config);
  const commands = runtime as unknown as { command(binary: string, args: string[], cwd: string, signal: AbortSignal): Promise<unknown> };
  const original = commands.command.bind(runtime);
  const controller = new AbortController();
  let initialized = false;
  commands.command = (binary, args, cwd, signal) => {
    const result = original(binary, args, cwd, signal);
    if (args.includes('init')) {
      initialized = true;
      controller.abort(new DOMException('Pause during Git initialization', 'AbortError'));
    }
    return result;
  };
  await assert.rejects(runtime.prepare(session, server.config.repositories[0], undefined, controller.signal), { name: 'AbortError' });
  assert.equal(initialized, true);
  const directory = join(server.config.dataDir, 'workspaces', session.id);
  assert.equal((await command('git', ['rev-parse', '--resolve-git-dir', '.git'], { cwd: directory })).stdout.trim(), '.git');
  const workspace = await runtime.prepare(session, server.config.repositories[0], undefined, new AbortController().signal);
  assert.match(workspace.metadata?.baseSha ?? '', /^[a-f0-9]{40}$/);
});
