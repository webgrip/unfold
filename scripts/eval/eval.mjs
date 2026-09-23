import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { startFakeLiteLLM } from '../fake-litellm.mjs';

export const LIVE_ENV = 'GLIDE_EVAL_LIVE';
export const LIVE_URL_ENV = 'GLIDE_EVAL_LITELLM_URL';
export const LIVE_MASTER_KEY_ENV = 'GLIDE_EVAL_LITELLM_MASTER_KEY';

const here = import.meta.dirname;
const root = resolve(here, '../..');
const IDENTIFIER = /^[a-z0-9][a-z0-9-]*$/;
const OUTPUT_TAIL = 4096;
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules']);

function inside(base, path) {
  if (typeof path !== 'string' || !path || isAbsolute(path)) throw new Error(`Path must be relative: ${path}`);
  const target = resolve(base, path);
  if (target !== base && !target.startsWith(base + sep)) throw new Error(`Path escapes its directory: ${path}`);
  return target;
}

function requireCommand(value, label) {
  if (!Array.isArray(value) || !value.length || !value.every(part => typeof part === 'string' && part)) throw new Error(`${label} must be a non-empty array of strings`);
  return value;
}

/**
 * Loads one fixture Work Item: a small repository at its pre-fix state, the ticket text,
 * the known-good check command, and the test paths the grader restores before checking.
 *
 * @param {string} directory Fixture directory containing fixture.json.
 * @returns {Promise<{ id: string, title: string, directory: string, repo: string, task: string, check: string[], protected: string[], timeoutSeconds: number }>}
 */
export async function loadFixture(directory) {
  const base = resolve(directory);
  const spec = JSON.parse(await readFile(join(base, 'fixture.json'), 'utf8'));
  const id = spec.id ?? base.split(sep).pop();
  if (!IDENTIFIER.test(id)) throw new Error(`Invalid fixture id: ${id}`);
  if (typeof spec.repo !== 'string' || !spec.repo) throw new Error(`${id}: repo is required`);
  const repo = resolve(base, spec.repo);
  const protectedPaths = spec.protected ?? [];
  if (!Array.isArray(protectedPaths) || !protectedPaths.length) throw new Error(`${id}: list the test files under protected`);
  for (const path of protectedPaths) inside(repo, path);
  return {
    id,
    title: String(spec.title ?? id),
    directory: base,
    repo,
    task: await readFile(inside(base, spec.task ?? 'task.md'), 'utf8'),
    check: requireCommand(spec.check, `${id}: check`),
    protected: protectedPaths,
    timeoutSeconds: Number(spec.timeoutSeconds ?? 120),
  };
}

/**
 * Loads every fixture directory below a parent directory, in name order.
 *
 * @param {string} directory
 * @param {string[]} [only] Fixture ids to keep; empty keeps all.
 */
export async function loadFixtures(directory, only = []) {
  const entries = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  const fixtures = await Promise.all(entries.map(name => loadFixture(join(directory, name))));
  const kept = only.length ? fixtures.filter(fixture => only.includes(fixture.id)) : fixtures;
  const missing = only.filter(id => !fixtures.some(fixture => fixture.id === id));
  if (missing.length) throw new Error(`Unknown fixture: ${missing.join(', ')}`);
  return kept;
}

/**
 * Loads a variants file. A variant fixes one prompt template, one model and one harness,
 * so that two variants differing in one of them form an A/B pair.
 *
 * @param {string} file JSON file with a top-level "variants" array.
 */
export async function loadVariants(file) {
  const base = dirname(resolve(file));
  const spec = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(spec.variants) || !spec.variants.length) throw new Error(`${file}: variants must be a non-empty array`);
  const seen = new Set();
  const variants = [];
  for (const raw of spec.variants) {
    if (!IDENTIFIER.test(raw.id ?? '') || seen.has(raw.id)) throw new Error(`Invalid or duplicate variant id: ${raw.id}`);
    seen.add(raw.id);
    const harness = raw.harness ?? {};
    if (harness.kind === 'scripted') {
      if (!IDENTIFIER.test(harness.script ?? '')) throw new Error(`${raw.id}: a scripted harness names a script`);
    } else if (harness.kind === 'command') {
      requireCommand(harness.command, `${raw.id}: harness.command`);
      if (harness.env !== undefined && (typeof harness.env !== 'object' || Object.values(harness.env).some(value => typeof value !== 'string'))) throw new Error(`${raw.id}: harness.env maps names to strings`);
    } else {
      throw new Error(`${raw.id}: harness.kind must be scripted or command`);
    }
    const template = raw.prompt ? await readFile(resolve(base, raw.prompt), 'utf8') : '{{task}}';
    const maxBudgetUsd = Number(raw.maxBudgetUsd ?? 1);
    if (!(maxBudgetUsd > 0)) throw new Error(`${raw.id}: maxBudgetUsd must be positive`);
    variants.push({
      id: raw.id,
      description: String(raw.description ?? ''),
      model: String(raw.model ?? 'none'),
      harness,
      prompt: raw.prompt ?? null,
      template,
      promptSha256: createHash('sha256').update(template).digest('hex'),
      maxBudgetUsd,
      timeoutSeconds: Number(raw.timeoutSeconds ?? 900),
    });
  }
  return variants;
}

/**
 * Fills a prompt template with a fixture's ticket text and check command.
 */
export function composePrompt(template, fixture) {
  return template.replaceAll('{{task}}', fixture.task.trim()).replaceAll('{{check}}', fixture.check.join(' '));
}

function run(command, args, { cwd, env, timeoutSeconds }) {
  return new Promise(done => {
    const started = Date.now();
    const executable = command === 'node' ? process.execPath : command;
    const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const append = chunk => { output = (output + chunk).slice(-OUTPUT_TAIL); };
    child.stdout.setEncoding('utf8').on('data', append);
    child.stderr.setEncoding('utf8').on('data', append);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutSeconds * 1000);
    child.on('error', error => { clearTimeout(timer); done({ exitCode: null, output: `${output}${error.message}`, timedOut, durationMs: Date.now() - started }); });
    child.on('close', exitCode => { clearTimeout(timer); done({ exitCode, output, timedOut, durationMs: Date.now() - started }); });
  });
}

async function fingerprint(directory) {
  const files = new Map();
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.set(relative(directory, path).split(sep).join('/'), createHash('sha256').update(await readFile(path)).digest('hex'));
    }
  }
  await walk(directory);
  return files;
}

function changed(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])].filter(path => before.get(path) !== after.get(path)).sort();
}

function baseEnvironment(home) {
  const env = { HOME: home };
  for (const name of ['PATH', 'LANG', 'LC_ALL', 'TERM', 'TZ']) if (process.env[name] !== undefined) env[name] = process.env[name];
  return env;
}

async function runScripted(variant, fixture, workdir, home) {
  const file = join(fixture.directory, 'scripted', `${variant.harness.script}.json`);
  const script = JSON.parse(await readFile(file, 'utf8'));
  let steps = 0;
  for (const step of script.steps ?? []) {
    if (step.edit !== undefined) {
      const path = inside(workdir, step.edit);
      const source = await readFile(path, 'utf8');
      if (!source.includes(step.find)) return { exitCode: 1, steps, output: `scripted step ${steps + 1}: text not found in ${step.edit}` };
      await writeFile(path, source.replace(step.find, step.replace));
    } else if (step.write !== undefined) {
      const path = inside(workdir, step.write);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, step.content);
    } else if (step.run !== undefined) {
      const [command, ...args] = requireCommand(step.run, `scripted step ${steps + 1}`);
      await run(command, args, { cwd: workdir, env: baseEnvironment(home), timeoutSeconds: fixture.timeoutSeconds });
    } else {
      throw new Error(`${file}: step ${steps + 1} has no edit, write or run`);
    }
    steps++;
  }
  return { exitCode: 0, steps, output: '' };
}

async function runCommand(variant, fixture, workdir, home, context) {
  const values = { '{model}': variant.model, '{prompt}': context.prompt, '{promptFile}': context.promptFile, '{workdir}': workdir, '{gatewayUrl}': context.gatewayUrl, '{gatewayKey}': context.gatewayKey, '{outcomeFile}': context.outcomeFile };
  const fill = text => Object.entries(values).reduce((result, [name, value]) => result.replaceAll(name, value), text);
  const env = { ...baseEnvironment(home), GLIDE_EVAL_MODEL: variant.model, GLIDE_EVAL_PROMPT_FILE: context.promptFile, GLIDE_EVAL_OUTCOME_FILE: context.outcomeFile };
  for (const [name, value] of Object.entries(variant.harness.env ?? {})) env[name] = fill(value);
  const [command, ...args] = variant.harness.command.map(fill);
  const result = await run(command, args, { cwd: workdir, env, timeoutSeconds: variant.timeoutSeconds });
  let steps = null;
  try {
    const outcome = JSON.parse(await readFile(context.outcomeFile, 'utf8'));
    if (Number.isInteger(outcome.steps) && outcome.steps >= 0) steps = outcome.steps;
  } catch {}
  return { exitCode: result.timedOut ? null : result.exitCode, steps, output: result.timedOut ? `harness timed out after ${variant.timeoutSeconds}s\n${result.output}` : result.output };
}

/**
 * Opens the LiteLLM admin API used to mint one capped key per trial. Without the live
 * switch it starts the local fake gateway, which refuses inference and reports no spend.
 *
 * @param {{ live: boolean, env?: NodeJS.ProcessEnv }} options
 */
export async function openGateway({ live, env = process.env }) {
  let url;
  let masterKey;
  let fake;
  if (live) {
    url = env[LIVE_URL_ENV];
    masterKey = env[LIVE_MASTER_KEY_ENV];
    if (!url || !masterKey) throw new Error(`Live runs need ${LIVE_URL_ENV} and ${LIVE_MASTER_KEY_ENV}`);
  } else {
    fake = await startFakeLiteLLM();
    ({ url, masterKey } = fake);
  }
  const call = async (path, body) => {
    const response = await fetch(url.replace(/\/$/, '') + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${masterKey}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) throw new Error(`gateway ${path} returned ${response.status}`);
    return response.json();
  };
  return {
    live,
    url,
    mint: (alias, maxBudgetUsd, model) => call('/key/generate', { key_alias: alias, max_budget: maxBudgetUsd, duration: '2h', ...(live ? { models: [model] } : {}) }).then(body => body.key),
    block: key => call('/key/block', { key }),
    spend: key => call(`/key/info?key=${encodeURIComponent(key)}`).then(body => Number(body.info?.spend ?? 0)),
    remove: key => call('/key/delete', { keys: [key] }),
    modelCalls: () => (fake ? fake.stats.modelCalls : null),
    close: () => fake?.close(),
  };
}

/**
 * Runs one trial: copies the fixture repository, lets the variant's harness work on it
 * with a freshly minted capped key, restores the protected tests and runs the fixture's check.
 */
export async function runTrial({ fixture, variant, trial, gateway, keep = false }) {
  const started = Date.now();
  const workroot = await mkdtemp(join(tmpdir(), `glide-eval-${fixture.id}-`));
  const workdir = join(workroot, 'repo');
  const home = join(workroot, 'home');
  const promptFile = join(workroot, 'prompt.md');
  const outcomeFile = join(workroot, 'outcome.json');
  const alias = `glide-eval-${randomBytes(6).toString('hex')}`;
  let key;
  try {
    await cp(fixture.repo, workdir, { recursive: true, filter: source => !SKIPPED_DIRECTORIES.has(source.split(sep).pop()) });
    await mkdir(home);
    const prompt = composePrompt(variant.template, fixture);
    await writeFile(promptFile, prompt);
    const before = await fingerprint(workdir);
    key = await gateway.mint(alias, variant.maxBudgetUsd, variant.model);
    const callsBefore = gateway.modelCalls();
    let harness;
    try {
      harness = variant.harness.kind === 'scripted'
        ? await runScripted(variant, fixture, workdir, home)
        : await runCommand(variant, fixture, workdir, home, { prompt, promptFile, outcomeFile, gatewayUrl: gateway.url, gatewayKey: key });
    } catch (error) {
      harness = { exitCode: null, steps: null, output: error.message };
    }
    await gateway.block(key);
    const spendUsd = gateway.live ? await gateway.spend(key) : null;
    const modelCalls = gateway.live ? null : gateway.modelCalls() - callsBefore;
    const after = await fingerprint(workdir);
    const changedFiles = changed(before, after);
    const tamperedPaths = fixture.protected.filter(path => changedFiles.some(file => file === path || file.startsWith(`${path}/`)));
    for (const path of fixture.protected) {
      await rm(inside(workdir, path), { recursive: true, force: true });
      await cp(inside(fixture.repo, path), inside(workdir, path), { recursive: true });
    }
    const [command, ...args] = fixture.check;
    const check = await run(command, args, { cwd: workdir, env: baseEnvironment(home), timeoutSeconds: fixture.timeoutSeconds });
    return {
      fixture: fixture.id,
      variant: variant.id,
      trial,
      mode: gateway.live ? 'live' : 'deterministic',
      passed: check.exitCode === 0,
      checkExitCode: check.exitCode,
      harnessExitCode: harness.exitCode,
      steps: harness.steps,
      changedFiles,
      tamperedPaths,
      spendUsd,
      modelCalls,
      keyAlias: alias,
      durationMs: Date.now() - started,
      harnessOutput: harness.output,
      checkOutput: check.output,
      ...(keep ? { workdir } : {}),
    };
  } finally {
    if (key) await gateway.remove(key).catch(() => {});
    if (!keep) await rm(workroot, { recursive: true, force: true });
  }
}

/**
 * Wilson score interval for a pass rate at 95% confidence.
 *
 * @returns {[number, number]}
 */
export function wilson(passed, trials) {
  if (!trials) return [0, 1];
  const z = 1.959964;
  const p = passed / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = (p + (z * z) / (2 * trials)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))) / denominator;
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

/**
 * Aggregates trial records per variant, and per variant and fixture.
 */
export function summarize(trials) {
  const group = (keyOf, perFixture) => {
    const groups = new Map();
    for (const trial of trials) {
      const key = keyOf(trial);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(trial);
    }
    return [...groups.values()].map(items => {
      const passed = items.filter(item => item.passed).length;
      const steps = items.map(item => item.steps).filter(Number.isInteger);
      const spends = items.map(item => item.spendUsd).filter(value => typeof value === 'number');
      return {
        variant: items[0].variant,
        ...(perFixture ? { fixture: items[0].fixture } : {}),
        trials: items.length,
        passed,
        passRate: passed / items.length,
        passRate95: wilson(passed, items.length),
        allPassed: passed === items.length,
        tamperedTrials: items.filter(item => item.tamperedPaths.length).length,
        meanSteps: steps.length ? steps.reduce((sum, value) => sum + value, 0) / steps.length : null,
        spendUsd: spends.length ? spends.reduce((sum, value) => sum + value, 0) : null,
      };
    });
  };
  return { byVariant: group(trial => trial.variant, false), byVariantAndFixture: group(trial => JSON.stringify([trial.variant, trial.fixture]), true) };
}

const CSV_COLUMNS = ['fixture', 'variant', 'trial', 'mode', 'passed', 'checkExitCode', 'harnessExitCode', 'steps', 'tamperedPaths', 'changedFiles', 'spendUsd', 'modelCalls', 'durationMs'];

/**
 * Renders trial records as CSV, one row per trial.
 */
export function toCsv(trials) {
  const cell = value => {
    const text = value === null || value === undefined ? '' : Array.isArray(value) ? value.join(' ') : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [CSV_COLUMNS.join(','), ...trials.map(trial => CSV_COLUMNS.map(column => cell(trial[column])).join(','))].join('\n') + '\n';
}

/**
 * Runs every variant against every fixture for the given number of trials and returns
 * the report. Command harnesses make model calls, so they run only when live is true.
 */
export async function runEvaluation({ fixtures, variants, trials = 1, live = false, env = process.env, keep = false, log = () => {} }) {
  if (!Number.isInteger(trials) || trials < 1) throw new Error('trials must be a positive integer');
  const commandVariants = variants.filter(variant => variant.harness.kind === 'command').map(variant => variant.id);
  if (commandVariants.length && !live) throw new Error(`Variants ${commandVariants.join(', ')} run a real harness and can call models. Set ${LIVE_ENV}=1 to allow a live run.`);
  const gateway = await openGateway({ live, env });
  const records = [];
  try {
    for (const variant of variants) {
      for (const fixture of fixtures) {
        for (let trial = 1; trial <= trials; trial++) {
          const record = await runTrial({ fixture, variant, trial, gateway, keep });
          log(`${variant.id} ${fixture.id} #${trial}: ${record.passed ? 'pass' : 'fail'}${record.tamperedPaths.length ? ' (tests tampered)' : ''}`);
          records.push(record);
        }
      }
    }
  } finally {
    await gateway.close();
  }
  return {
    schemaVersion: 1,
    at: new Date().toISOString(),
    mode: live ? 'live' : 'deterministic',
    limits: live
      ? ['spendUsd is the spend LiteLLM reported on the trial key right after the harness exited; late spend-log entries can add to it', 'Wilson intervals are reported because small trial counts rarely separate two variants']
      : ['Deterministic run: scripted harnesses and a local fake gateway; no model calls and no spend', 'Scripted results calibrate the grader; they say nothing about any model or prompt'],
    variants: variants.map(({ id, description, model, harness, prompt, promptSha256, maxBudgetUsd }) => ({ id, description, model, harness: harness.kind === 'command' ? { kind: 'command', command: harness.command } : harness, prompt, promptSha256, maxBudgetUsd })),
    fixtures: fixtures.map(({ id, title, check }) => ({ id, title, check })),
    trials: records,
    summary: summarize(records),
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      variants: { type: 'string', default: join(here, 'variants/deterministic.json') },
      fixtures: { type: 'string', default: join(here, 'fixtures') },
      fixture: { type: 'string', multiple: true, default: [] },
      trials: { type: 'string', default: '1' },
      out: { type: 'string' },
      keep: { type: 'boolean', default: false },
    },
  });
  const live = process.env[LIVE_ENV] === '1';
  const report = await runEvaluation({
    fixtures: await loadFixtures(values.fixtures, values.fixture),
    variants: await loadVariants(values.variants),
    trials: Number(values.trials),
    live,
    keep: values.keep,
    log: line => console.log(line),
  });
  const out = resolve(values.out ?? join(root, '.build/eval', report.at.replaceAll(':', '-')));
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(out, 'trials.csv'), toCsv(report.trials));
  console.table(report.summary.byVariant.map(({ variant, trials, passed, passRate95, tamperedTrials, meanSteps, spendUsd }) => ({ variant, trials, passed, 'pass rate 95%': passRate95.map(value => value.toFixed(2)).join('–'), tamperedTrials, meanSteps, spendUsd: spendUsd === null ? '' : spendUsd.toFixed(2) })));
  console.log(`${report.mode} run; results in ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
