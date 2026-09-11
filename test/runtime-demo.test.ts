import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
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
