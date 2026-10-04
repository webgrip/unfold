import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startFakeLiteLLM } from './fake-litellm.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.build/qualification');
mkdirSync(output, { recursive: true });

function run(command, args, options, timeoutSeconds = 240) {
  return new Promise(done => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const append = chunk => { if (log.length < 16 * 1024 * 1024) log += chunk; };
    child.stdout.setEncoding('utf8').on('data', append);
    child.stderr.setEncoding('utf8').on('data', append);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutSeconds * 1000);
    child.on('error', error => { clearTimeout(timer); done({ status: null, error, log }); });
    child.on('close', status => { clearTimeout(timer); done({ status, log, error: timedOut ? new Error(`killed after ${timeoutSeconds} s`) : undefined }); });
  });
}

const gateway = await startFakeLiteLLM();
const checks = [
  { name: 'standalone', cwd: 'apps/unfold', command: process.execPath, args: ['--test', 'test/api-workflow.test.ts', 'test/api-process.test.ts'] },
  { name: 'managed', cwd: 'apps/ploeg/pkg/httpapi', build: { command: 'go', args: ['test', '-c', '-o', resolve(output, 'httpapi.test'), '.'] }, command: resolve(output, 'httpapi.test'), args: ['-test.run', '^TestOperatorWorkbench(Inference)?Qualification$', '-test.count=1', '-test.v'], env: { PLOEG_QUALIFICATION_LITELLM_URL: gateway.url, PLOEG_QUALIFICATION_LITELLM_MASTER_KEY: gateway.masterKey } },
];
const results = [];
try {
  for (const check of checks) {
    console.log(`Qualifying ${check.name} execution`);
    const options = { cwd: resolve(root, check.cwd), env: { ...process.env, PLOEG_WORKBENCH_PATH: resolve(root, 'apps/unfold'), ...check.env } };
    if (check.build) {
      const built = await run(check.build.command, check.build.args, options, 900);
      if (built.error || built.status !== 0) throw new Error(`${check.name} build failed: ${built.error ? `${built.error.message}\n` : ''}${built.log}`);
    }
    const result = await run(check.command, check.args, options);
    const log = result.log.replaceAll(gateway.masterKey, '[redacted]');
    writeFileSync(resolve(output, `${check.name}.log`), log);
    if (result.error || result.status !== 0) throw new Error(`${check.name} failed: ${result.error ? `${result.error.message}\n` : ''}${log}`);
    if (check.name === 'managed') {
      assert.match(log, /--- PASS: TestOperatorWorkbenchQualification /);
      assert.match(log, /--- PASS: TestOperatorWorkbenchInferenceQualification /);
      const keys = [...gateway.keys.values()];
      assert.equal(gateway.stats.generated, 2, 'each managed execution mints exactly one gateway key');
      assert.ok(keys.every(key => key.blocked && key.key_alias.startsWith('ploeg-') && key.max_budget === 1 && key.duration === '600s' && key.models.join() === 'qualification-coding'), 'every minted key is capped, scoped and blocked');
      assert.equal(gateway.stats.modelCalls, 0, 'no inference request reached the gateway');
      assert.equal(gateway.stats.unauthorized, 0, 'only Ploeg called the admin API, with its master key');
      assert.equal(gateway.stats.unexpected, 0);
    } else {
      assert.match(log, /pass [1-9]/);
      assert.match(log, /real server crash/);
      assert.match(log, /pause, instructions, resume/);
      assert.doesNotMatch(log, /skipped [1-9]/);
    }
    results.push({ name: check.name, passed: true, command: [check.command, ...check.args], log: `${check.name}.log` });
  }
} finally {
  await gateway.close();
}
const { generated, blocked, info, list, modelCalls } = gateway.stats;
const report = {
  schemaVersion: 1,
  at: new Date().toISOString(),
  runtime: 'deterministic fixture; actual HTTP, filesystem checks and PostgreSQL',
  modelCalls: 0,
  spendUsd: 0,
  gateway: { kind: 'fake LiteLLM admin API', keysMinted: generated, blockRequests: blocked, spendReads: info, keyListings: list, inferenceRequests: modelCalls },
  checks: results,
  limits: ['No paid provider or Kubernetes qualification', 'No proof of interchangeable native harness session state', 'Managed inference uses a local fake LiteLLM gateway: key minting, blocking and spend reads follow the real admin API shape, but no real gateway, model or budget enforcement is exercised'],
};
writeFileSync(resolve(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
