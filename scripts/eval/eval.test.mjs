import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { LIVE_ENV, composePrompt, loadFixture, loadFixtures, loadVariants, openGateway, runEvaluation, runTrial, summarize, toCsv, wilson } from './eval.mjs';

const here = import.meta.dirname;
const fixturesDirectory = join(here, 'fixtures');

async function scratch(t) {
  const directory = await mkdtemp(join(tmpdir(), 'glide-eval-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('the deterministic variants calibrate every fixture without model calls or spend', async () => {
  const fixtures = await loadFixtures(fixturesDirectory);
  assert.deepEqual(fixtures.map(fixture => fixture.id), ['order-rounding', 'split-bill']);
  const report = await runEvaluation({ fixtures, variants: await loadVariants(join(here, 'variants/deterministic.json')), trials: 1 });
  assert.equal(report.mode, 'deterministic');
  const outcome = Object.fromEntries(report.trials.map(trial => [`${trial.variant}/${trial.fixture}`, trial]));
  for (const fixture of ['order-rounding', 'split-bill']) {
    const oracle = outcome[`scripted-oracle/${fixture}`];
    assert.equal(oracle.passed, true, `${fixture}: the known-good fix passes the check\n${oracle.checkOutput}`);
    assert.deepEqual(oracle.tamperedPaths, []);
    assert.equal(oracle.steps, 2);
    const tampered = outcome[`scripted-tamper-tests/${fixture}`];
    assert.equal(tampered.passed, false, `${fixture}: editing the tests does not pass, because the grader restores them`);
    assert.ok(tampered.tamperedPaths.some(path => path.startsWith('test/')));
    const idle = outcome[`scripted-no-op/${fixture}`];
    assert.equal(idle.passed, false, `${fixture}: the tests detect the unfixed bug`);
    assert.deepEqual(idle.changedFiles, []);
  }
  assert.ok(report.trials.every(trial => trial.mode === 'deterministic' && trial.modelCalls === 0 && trial.spendUsd === null));
  assert.deepEqual(report.summary.byVariant.map(({ variant, passed, trials }) => [variant, passed, trials]), [['scripted-oracle', 2, 2], ['scripted-tamper-tests', 0, 2], ['scripted-no-op', 0, 2]]);
  assert.match(report.limits.join(' '), /no model calls and no spend/);
});

test('refuses a harness that can call models unless the live switch is set', async () => {
  const fixtures = await loadFixtures(fixturesDirectory, ['order-rounding']);
  const variants = await loadVariants(join(here, 'variants/live.example.json'));
  await assert.rejects(runEvaluation({ fixtures, variants }), new RegExp(`Set ${LIVE_ENV}=1`));
  await assert.rejects(runEvaluation({ fixtures, variants, live: true, env: {} }), /GLIDE_EVAL_LITELLM_URL/);
});

test('a command harness gets the prompt, a capped trial key and an outcome file, never the master key', async t => {
  const directory = await scratch(t);
  const agent = join(directory, 'agent.mjs');
  await writeFile(agent, [
    "import { readFileSync, writeFileSync } from 'node:fs';",
    "const prompt = readFileSync(process.env.GLIDE_EVAL_PROMPT_FILE, 'utf8');",
    "if (!prompt.includes('Split a bill') || !prompt.includes('node --test test/split.test.js')) process.exit(3);",
    "if (!process.env.AGENT_KEY?.startsWith('sk-fake-') || JSON.stringify(process.env).includes('sk-fake-master')) process.exit(4);",
    "const path = 'src/split.js';",
    "writeFileSync(path, readFileSync(path, 'utf8').replace('  return Array.from({ length: people }, () => share);', '  const remainder = totalCents % people;\\n  return Array.from({ length: people }, (_, index) => share + (index < remainder ? 1 : 0));'));",
    "writeFileSync(process.env.GLIDE_EVAL_OUTCOME_FILE, JSON.stringify({ steps: 7 }));",
  ].join('\n'));
  const variantsFile = join(directory, 'variants.json');
  await writeFile(variantsFile, JSON.stringify({ variants: [{ id: 'local-agent', harness: { kind: 'command', command: ['node', agent, '{model}'], env: { AGENT_KEY: '{gatewayKey}' } }, prompt: join(here, 'prompts/baseline.md'), model: 'test-model' }] }));
  const [variant] = await loadVariants(variantsFile);
  const fixture = await loadFixture(join(fixturesDirectory, 'split-bill'));
  const gateway = await openGateway({ live: false });
  t.after(() => gateway.close());
  const record = await runTrial({ fixture, variant, trial: 1, gateway });
  assert.equal(record.harnessExitCode, 0, record.harnessOutput);
  assert.equal(record.passed, true, record.checkOutput);
  assert.equal(record.steps, 7);
  assert.deepEqual(record.changedFiles, ['src/split.js']);
  assert.equal(record.modelCalls, 0);
});

test('rejects fixtures whose protected paths leave the repository', async t => {
  const directory = await scratch(t);
  await mkdir(join(directory, 'repo'));
  await writeFile(join(directory, 'task.md'), 'Task');
  await writeFile(join(directory, 'fixture.json'), JSON.stringify({ id: 'escaping', repo: 'repo', check: ['node', '--test'], protected: ['../outside'] }));
  await assert.rejects(loadFixture(directory), /escapes/);
});

test('composes prompts, intervals, summaries and CSV deterministically', () => {
  assert.equal(composePrompt('Do: {{task}} Check: {{check}}', { task: 'fix it\n', check: ['node', '--test'] }), 'Do: fix it Check: node --test');
  assert.deepEqual(wilson(0, 0), [0, 1]);
  const [low, high] = wilson(5, 5);
  assert.ok(low > 0.56 && low < 0.57 && high === 1);
  const trials = [
    { fixture: 'a', variant: 'v', trial: 1, passed: true, steps: 2, tamperedPaths: [], changedFiles: ['src/x.js'], spendUsd: 0.25, mode: 'live' },
    { fixture: 'b', variant: 'v', trial: 1, passed: false, steps: null, tamperedPaths: ['test/x.test.js'], changedFiles: ['test/x.test.js', 'src/y,z.js'], spendUsd: 0.5, mode: 'live' },
  ];
  const [overall] = summarize(trials).byVariant;
  assert.deepEqual({ ...overall, passRate95: undefined }, { variant: 'v', trials: 2, passed: 1, passRate: 0.5, passRate95: undefined, allPassed: false, tamperedTrials: 1, meanSteps: 2, spendUsd: 0.75 });
  assert.deepEqual(summarize(trials).byVariantAndFixture.map(row => row.fixture), ['a', 'b']);
  const csv = toCsv(trials).trim().split('\n');
  assert.equal(csv[0], 'fixture,variant,trial,mode,passed,checkExitCode,harnessExitCode,steps,tamperedPaths,changedFiles,spendUsd,modelCalls,durationMs');
  assert.equal(csv[2], 'b,v,1,live,false,,,,test/x.test.js,"test/x.test.js src/y,z.js",0.5,,');
});
