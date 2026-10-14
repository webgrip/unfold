import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, managedExecutionGuide, requirePloegExecution } from '../src/config.ts';
import { testTimeout } from './timeframes.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const ploeg = { url: 'https://ploeg.example', tokenEnv: 'PLOEG_OPERATOR_UNFOLD_TOKEN' };
const execution = { team: 'delivery' };

test('live mode without Ploeg execution is refused and the error names what to configure', () => {
  assert.throws(() => requirePloegExecution({ mode: 'live' }), (error: Error) => {
    assert.match(error.message, /standalone live mode is retired/);
    assert.match(error.message, /ploeg\.url, ploeg\.tokenEnv, execution\.team/);
    assert(error.message.includes(managedExecutionGuide));
    return true;
  });
  assert.throws(() => requirePloegExecution({ mode: 'live', ploeg }), /Configure execution\.team /);
  assert.throws(() => requirePloegExecution({ mode: 'live', execution }), /Configure ploeg\.url, ploeg\.tokenEnv /);
  assert.throws(() => requirePloegExecution({ mode: 'live', ploeg: { url: ploeg.url }, execution }), /Configure ploeg\.tokenEnv /);
});

test('live mode with Ploeg execution starts, and demo mode never needs Ploeg', () => {
  assert.doesNotThrow(() => requirePloegExecution({ mode: 'live', ploeg, execution }));
  assert.doesNotThrow(() => requirePloegExecution({ mode: 'demo' }));
  assert.doesNotThrow(() => requirePloegExecution({ mode: 'demo', ploeg: { url: ploeg.url, demo: true } }));
});

test('the supplied live examples configure Ploeg execution', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'unfold-live-example-'));
  const previous = process.env.UNFOLD_DATA_DIR;
  process.env.UNFOLD_DATA_DIR = dataDir;
  t.after(async () => { if (previous === undefined) delete process.env.UNFOLD_DATA_DIR; else process.env.UNFOLD_DATA_DIR = previous; await rm(dataDir, { recursive: true, force: true }); });
  for (const file of ['config/live.example.json', 'ops/local/config.live.example.json', 'config/unified.example.json']) {
    const config = loadConfig(['--config', join(repositoryRoot, file)]);
    assert.equal(config.mode, 'live', file);
    assert.doesNotThrow(() => requirePloegExecution(config), file);
  }
});

test('the server process refuses to start live without Ploeg execution before it opens a store', { timeout: testTimeout(30_000) }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-live-refusal-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataDir = join(directory, 'data');
  const file = join(directory, 'config.json');
  await writeFile(file, JSON.stringify({
    mode: 'live', dataDir,
    models: [{ id: 'coding', name: 'Coding', providerId: 'gateway', modelId: 'coding' }],
    repositories: [{ id: 'app', name: 'App', description: '', url: 'https://forge.example/app.git', baseBranch: 'main', verify: ['npm', 'test'] }],
    runtime: { kind: 'opencode', backend: 'local', timeoutMs: 60000 },
  }));
  const env: NodeJS.ProcessEnv = { ...process.env, UNFOLD_ADMIN_PASSWORD: 'a-long-enough-password', UNFOLD_PORT: '0' };
  for (const name of ['UNFOLD_MODE', 'UNFOLD_CONFIG', 'UNFOLD_DATA_DIR']) delete env[name];
  const child = spawn(process.execPath, ['src/main.ts', '--config', file], { cwd: repositoryRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const code = await new Promise<number | null>(resolve => child.once('exit', resolve));
  assert.equal(code, 1, output);
  assert.match(output, /"event":"startup.failed"/);
  assert.match(output, /standalone live mode is retired/);
  assert.doesNotMatch(output, /server\.ready/);
  assert.deepEqual(await readdir(dataDir), []);
});
