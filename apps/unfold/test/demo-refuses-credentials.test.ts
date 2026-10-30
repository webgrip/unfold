import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { loadConfig, refuseDemoCredentials } from '../src/config.ts';
import { createApplication } from '../src/main.ts';
import { demoRefusesRealPloeg, validatePloeg } from '../src/ploeg.ts';
import { testTimeout } from './timeframes.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const realPloeg = { url: 'https://ploeg.example', tokenEnv: 'PLOEG_OPERATOR_UNFOLD_TOKEN' };
const personTokens = { tokenUrl: 'https://authentik.example/application/o/token/', clientId: 'unfold-exchange', clientSecretEnv: 'UNFOLD_EXCHANGE_CLIENT_SECRET', audience: 'ploeg-for-unfold' };
const vikunja = { id: 'board', name: 'Board', provider: 'vikunja', baseUrl: 'https://vikunja.example', project: '7', repositoryId: 'order-service', executionOwner: 'interactive' };

const refused: [string, Record<string, unknown>, RegExp][] = [
  ['a real Ploeg with the operator token', { ploeg: realPloeg }, /Demo mode gives every visitor admin; it cannot use a real Ploeg\. Set mode: live, or use ploeg\.demo$/],
  ['a real Ploeg without a token', { ploeg: { url: realPloeg.url } }, /cannot use a real Ploeg/],
  ['the demo Ploeg with a token', { ploeg: { url: realPloeg.url, demo: true, tokenEnv: realPloeg.tokenEnv } }, /cannot use ploeg\.tokenEnv/],
  ['person tokens', { ploeg: { url: realPloeg.url, demo: true, personTokens } }, /cannot use ploeg\.personTokens/],
  ['execution', { execution: { team: 'delivery' } }, /cannot use execution, which runs agent work under a real Ploeg/],
  ['delivery with its verifier and publisher', { delivery: { verifierTokenEnv: 'UNFOLD_VERIFIER_TOKEN', policies: [], publisher: { kind: 'forgejo', apiUrl: 'https://forge.example/api/v1', tokenEnv: 'UNFOLD_PUBLISHER_TOKEN' } } }, /cannot use delivery, whose verifier and publisher hold forge credentials/],
  ['links', { links: { gitlab: { baseUrl: 'https://gitlab.example', clientId: 'unfold-gitlab-app' } } }, /cannot use links: a GitLab or ClickUp account one visitor links would act for every visitor/],
  ['a task source token', { taskSources: [{ ...vikunja, tokenEnv: 'UNFOLD_TASK_VIKUNJA_TOKEN' }] }, /cannot use the token of task source board \(tokenEnv\)/],
  ['a reports connection', { reports: { provider: 'forgejo', baseUrl: 'https://forge.example', project: 'webgrip/unfold', tokenEnv: 'UNFOLD_REPORTS_TOKEN' } }, /cannot use reports\.tokenEnv/],
  ['a flag provider credential', { flags: { providers: [{ kind: 'ofrep', url: 'https://flags.example', apiKeyEnv: 'UNFOLD_FLAGS_KEY' }] } }, /cannot use a flag provider credential/],
];

async function demoConfig(t: test.TestContext, value: Record<string, unknown>) {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-demo-refusal-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataDir = join(directory, 'data');
  const file = join(directory, 'config.json');
  await writeFile(file, JSON.stringify({ mode: 'demo', dataDir, ...value }));
  return { file, dataDir };
}

const withEnvironment = (t: test.TestContext, values: Record<string, string | undefined>) => {
  const previous = Object.fromEntries(Object.keys(values).map(name => [name, process.env[name]]));
  for (const [name, value] of Object.entries(values)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  t.after(() => { for (const [name, value] of Object.entries(previous)) if (value === undefined) delete process.env[name]; else process.env[name] = value; });
};

test('demo mode refuses every configuration that would reach a real system with a credential, before it creates its data directory', async t => {
  withEnvironment(t, { UNFOLD_CONFIG: undefined, UNFOLD_MODE: undefined, LITELLM_MASTER_KEY: undefined, UNFOLD_TASK_VIKUNJA_TOKEN: 'example-task-token', UNFOLD_REPORTS_TOKEN: 'example-report-token', UNFOLD_EXCHANGE_CLIENT_SECRET: 'example-secret' });
  for (const [name, value, message] of refused) {
    const { file, dataDir } = await demoConfig(t, value);
    assert.throws(() => loadConfig(['--config', file]), message, name);
    assert.throws(() => loadConfig(['--demo', '--config', file]), message, `${name} with --demo`);
    assert.equal(existsSync(dataDir), false, `${name}: refused before the data directory exists`);
  }
});

test('demo mode refuses the LiteLLM master key in the environment', async t => {
  withEnvironment(t, { UNFOLD_CONFIG: undefined, UNFOLD_MODE: undefined, LITELLM_MASTER_KEY: 'sk-master', LITELLM_BASE_URL: 'https://litellm.example/v1' });
  const { file } = await demoConfig(t, {});
  assert.throws(() => loadConfig(['--config', file]), /cannot use the LiteLLM master key in LITELLM_MASTER_KEY\. Unset LITELLM_MASTER_KEY, or set mode: live/);
  assert.throws(() => refuseDemoCredentials({}, { LITELLM_MASTER_KEY: 'sk-master' }), /LITELLM_MASTER_KEY/);
});

test('validatePloeg refuses a real Ploeg in demo mode and keeps the demo Ploeg', () => {
  assert.throws(() => validatePloeg(realPloeg, 'demo'), (error: Error) => error.message === demoRefusesRealPloeg);
  assert.throws(() => validatePloeg({ url: realPloeg.url, demo: true, tokenEnv: realPloeg.tokenEnv }, 'demo'), /cannot hold ploeg\.tokenEnv/);
  assert.deepEqual(validatePloeg({ url: realPloeg.url, demo: true }, 'demo'), { url: realPloeg.url, demo: true });
  assert.equal(validatePloeg(realPloeg, 'live')?.tokenEnv, realPloeg.tokenEnv);
});

test('demo mode keeps what reaches nobody with a credential: task sources without a token and error reports', () => {
  assert.doesNotThrow(() => refuseDemoCredentials({ taskSources: [vikunja], reports: false, ploeg: { url: realPloeg.url, demo: true }, flags: { providers: [{ kind: 'ofrep', url: 'https://flags.example' }] } }, { UNFOLD_SENTRY_DSN: 'https://key@sentry.example/1', UNFOLD_ERROR_OTLP_URL: 'https://otel.example/v1/logs' }));
});

test('the deterministic demo and the replay recorder still start, with and without the demo Ploeg, and say they are a demo', { timeout: testTimeout(30_000) }, async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'unfold-demo-start-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  withEnvironment(t, { UNFOLD_CONFIG: undefined, UNFOLD_MODE: undefined, LITELLM_MASTER_KEY: undefined, UNFOLD_DATA_DIR: dataDir });
  const { file } = await demoConfig(t, { ploeg: { url: realPloeg.url, demo: true } });
  for (const argv of [['--demo'], ['--demo', '--config', file]]) {
    const config = loadConfig(argv);
    assert.equal(config.mode, 'demo');
    assert.equal(config.litellm, undefined);
    const app = await createApplication({ ...config, dataDir: await mkdtemp(join(dataDir, 'app-')) });
    t.after(() => app.close());
    await new Promise<void>(done => (app.server as Server).listen(0, '127.0.0.1', done));
    const address = app.server.address();
    assert(address && typeof address === 'object');
    const health = await (await fetch(`http://127.0.0.1:${address.port}/api/health`)).json() as { mode: string; litellm: boolean };
    assert.equal(health.mode, 'demo', argv.join(' '));
    assert.equal(health.litellm, false, `${argv.join(' ')}: the demo has no model gateway`);
    await app.close();
  }
});

test('the server process refuses to start demo mode with a real Ploeg and says why', { timeout: testTimeout(30_000) }, async t => {
  const { file, dataDir } = await demoConfig(t, { ploeg: realPloeg });
  const env: NodeJS.ProcessEnv = { ...process.env, UNFOLD_PORT: '0', PLOEG_OPERATOR_UNFOLD_TOKEN: 'operator-token' };
  for (const name of Object.keys(env)) if ((name.startsWith('UNFOLD_') && name !== 'UNFOLD_PORT') || name.startsWith('LITELLM_')) delete env[name];
  const child = spawn(process.execPath, ['src/main.ts', '--demo', '--config', file], { cwd: repositoryRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const code = await new Promise<number | null>(resolve => child.once('exit', resolve));
  assert.equal(code, 1, output);
  assert.match(output, /"event":"startup.failed","message":"Demo mode gives every visitor admin; it cannot use a real Ploeg\. Set mode: live, or use ploeg\.demo"/);
  assert.doesNotMatch(output, /server\.ready/);
  assert.equal(existsSync(dataDir), false);
});
