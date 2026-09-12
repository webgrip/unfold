'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const vm = require('node:vm');
const { parse } = require('yaml');

process.env.SEMANTIC_RELEASE_GITEA = 'true';
const { makeConfig } = require('@webgrip/semantic-release-config');
const config = require('../.releaserc.cjs');
const policy = require('./release-policy.cjs');
const root = path.resolve(__dirname, '..');
const semanticReleaseRoot = path.dirname(require.resolve('semantic-release'));
const shared = makeConfig({ manifest: 'helm', chartPath: 'ops/helm/ploeg' });
const pluginOptions = (source, name) => source.plugins.find((entry) => Array.isArray(entry) && entry[0] === name)[1];
const logger = { log() {}, success() {}, warn() {}, error() {}, scope() { return this; } };
const historicalCommit = fs.readFileSync(path.join(__dirname, 'fixtures/managed-authentication-breaking.txt'), 'utf8');
const branch = {
  name: 'development', type: 'prerelease', prerelease: 'rc', channel: 'development',
  tags: [{ version: '0.3.0-rc.4', gitTag: 'ploeg-v0.3.0-rc.4', channels: ['development'] }],
};
const context = (version = '0.3.0-rc.5') => ({
  branch, options: { tagFormat: config.tagFormat },
  nextRelease: { version, gitTag: `ploeg-v${version}`, channel: 'development' },
});
const loadCore = (name) => import(pathToFileURL(path.join(semanticReleaseRoot, 'lib', name)).href);
const analyze = async (options, message = historicalCommit) => {
  const { analyzeCommits } = await import(pathToFileURL(require.resolve('@semantic-release/commit-analyzer')).href);
  return analyzeCommits(options, { commits: [{ hash: '7714cd5eb3268fd8291075a13fcb3736ddc88c76', message }], logger, cwd: root });
};

test('the installed release toolchain is the one exercised by this suite', () => {
  for (const name of ['semantic-release', '@semantic-release/commit-analyzer', '@webgrip/semantic-release-config']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve(name)), 'package.json'), 'utf8'));
    console.log(`${name}: ${manifest.version}`);
  }
});

test('the actual historical breaking commit reproduces major before the policy and minor after it', async () => {
  assert.equal(await analyze(pluginOptions(shared, '@semantic-release/commit-analyzer')), 'major');
  assert.equal(await analyze(pluginOptions(config, '@semantic-release/commit-analyzer')), 'minor');
});

test('the real version calculator advances the last valid candidate to ploeg-v0.3.0-rc.5', async () => {
  const { default: getLastRelease } = await loadCore('get-last-release.js');
  const { default: getNextVersion } = await loadCore('get-next-version.js');
  const lastRelease = getLastRelease({ branch, options: config });
  const type = await analyze(pluginOptions(config, '@semantic-release/commit-analyzer'));
  const version = getNextVersion({ branch, lastRelease, nextRelease: { type, channel: branch.channel }, logger });
  assert.equal(version, '0.3.0-rc.5');
  policy.verifyRelease({}, context(version));
});

test('a remaining mistaken 1.x tag is rejected instead of producing another 1.x release', async () => {
  const { default: getLastRelease } = await loadCore('get-last-release.js');
  const { default: getNextVersion } = await loadCore('get-next-version.js');
  const contaminated = { ...branch, tags: [...branch.tags, { version: '1.0.0-rc.1', gitTag: 'ploeg-v1.0.0-rc.1', channels: ['development'] }] };
  const lastRelease = getLastRelease({ branch: contaminated, options: config });
  const version = getNextVersion({ branch: contaminated, lastRelease, nextRelease: { type: 'minor', channel: branch.channel }, logger });
  assert.match(version, /^1\./);
  assert.throws(() => policy.verifyRelease({}, context(version)), /only 0.x.y-rc.N/);
});

test('breaking headers and footers remain minor while ordinary commit behavior is preserved', async () => {
  const options = pluginOptions(config, '@semantic-release/commit-analyzer');
  for (const message of ['feat!: change API', 'fix(api)!: change API', 'docs: migration\n\nBREAKING CHANGE: required upgrade']) {
    assert.equal(await analyze(options, message), 'minor');
  }
  assert.equal(await analyze(options, 'fix: correct behavior'), 'patch');
  assert.equal(await analyze(options, 'feat: add behavior'), 'minor');
  assert.equal(await analyze(options, 'docs: explain behavior'), null);
});

test('the actual release notes retain the managed-authentication compatibility warning', async () => {
  const { generateNotes } = await import(pathToFileURL(require.resolve('@semantic-release/release-notes-generator')).href);
  const notes = await generateNotes(pluginOptions(config, '@semantic-release/release-notes-generator'), {
    commits: [{ hash: '7714cd5eb3268fd8291075a13fcb3736ddc88c76', message: historicalCommit }],
    lastRelease: { version: '0.3.0-rc.4', gitTag: 'ploeg-v0.3.0-rc.4' },
    nextRelease: { version: '0.3.0-rc.5', gitTag: 'ploeg-v0.3.0-rc.5' },
    options: { repositoryUrl: 'https://forgejo.webgrip.dev/webgrip/ploeg.git' }, cwd: root, env: {}, logger,
  });
  assert.match(notes, /BREAKING CHANGES/);
  assert.match(notes, /managed worker authentication is now the default/);
  assert.match(notes, /explicit legacy authentication/);
});

test('version verification rejects major, stable, malformed and missing releases', () => {
  for (const version of ['1.0.0-rc.1', '2.3.4-rc.1', '0.4.0', '1.0.0', '0.4.0-beta.1', '0.04.0-rc.1', '0.4.0-rc.0', '', null]) {
    assert.throws(() => policy.verifyRelease({}, context(version)), /only 0.x.y-rc.N/);
  }
  assert.throws(() => policy.verifyRelease({}, { ...context(), nextRelease: undefined }), /only 0.x.y-rc.N/);
  assert.throws(() => policy.verifyRelease({}, { ...context(), nextRelease: { ...context().nextRelease, gitTag: 'wrong' } }), /must agree/);
  assert.throws(() => policy.verifyRelease({}, { ...context(), nextRelease: { ...context().nextRelease, channel: null } }), /must agree/);
});

test('condition verification blocks stable promotion even before a next version exists', () => {
  policy.verifyConditions({}, { branch, options: config });
  for (const rejected of [undefined, { ...branch, name: 'main' }, { ...branch, type: 'release' }, { ...branch, prerelease: 'beta' }, { ...branch, channel: null }]) {
    assert.throws(() => policy.verifyConditions({}, { branch: rejected, options: config }), /only development/);
  }
  assert.throws(() => policy.verifyConditions({}, { branch, options: { tagFormat: 'other-${version}' } }), /tags must use/);
});

test('the installed plugin pipeline loads and enforces both local release gates', async () => {
  const { default: loadPlugins } = await loadCore('plugins/index.js');
  const options = { ...config, plugins: [config.plugins[0], ['@semantic-release/commit-analyzer', pluginOptions(config, '@semantic-release/commit-analyzer')]] };
  const input = { cwd: root, env: {}, options, logger, stdout: process.stdout, stderr: process.stderr };
  const pipeline = await loadPlugins(input, {});
  await pipeline.verifyConditions({ ...input, branch });
  await pipeline.verifyRelease({ ...input, ...context(), options });
  await assert.rejects(pipeline.verifyConditions({ ...input, branch: { ...branch, name: 'main' } }), /only development/);
  await assert.rejects(pipeline.verifyRelease({ ...input, ...context('1.0.0-rc.1'), options }), /only 0.x.y-rc.N/);
});

test('the installed release engine checks conditions before promotion and verifies versions before preparation', () => {
  const engine = fs.readFileSync(path.join(semanticReleaseRoot, 'index.js'), 'utf8');
  const positions = ['await plugins.verifyConditions(context)', 'getReleaseToAdd(context)', 'await plugins.verifyRelease(context)', 'await plugins.prepare(context)', 'await tag(nextRelease.gitTag', 'await plugins.publish(context)'].map((step) => {
    const index = engine.indexOf(step);
    assert.ok(index >= 0, `review changed release lifecycle: ${step}`);
    return index;
  });
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test('effective configuration retains standard tags and CI tests it before invoking release', () => {
  assert.equal(config.tagFormat, 'ploeg-v${version}');
  assert.equal(config.plugins[0], path.join(__dirname, 'release-policy.cjs'));
  const workflow = parse(fs.readFileSync(path.resolve(root, '../../.forgejo/workflows/on_source_change.yml'), 'utf8'));
  assert.ok(workflow.jobs['release-ploeg'].needs.includes('release-policy'));
  assert.ok(workflow.jobs['release-policy'].steps.some(step => step.uses === './.forgejo/actions/release-policy'));
  const action = parse(fs.readFileSync(path.resolve(root, '../../.forgejo/actions/release-policy/action.yml'), 'utf8'));
  const gate = action.runs.steps.find(step => step.run?.includes('node --test scripts/release-policy.test.cjs'));
  assert.equal(gate['working-directory'], 'apps/ploeg');
  assert.match(gate.run, /NODE_PATH="\$\{SEMREL_PREBAKED:\?/);
});

test('the actual artifact-publisher shell rejects major and stable tags before emitting outputs', () => {
  const workflow = parse(fs.readFileSync(path.resolve(root, '../../.forgejo/workflows/on_release_published.yml'), 'utf8'));
  const parseStep = workflow.jobs['ploeg-parse-release-tag'].steps.find(step => step.id === 'parse');
  const shell = parseStep.run;
  assert.match(parseStep.env.RELEASE_TAG, /\$\{\{/);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ploeg-release-policy-'));
  const output = path.join(directory, 'output');
  try {
    for (const tag of ['ploeg-v1.0.0-rc.1', 'ploeg-v0.3.0', 'ploeg-v1.0.0', 'ploeg-v0.3.0-beta.1', 'withdrawn-v1.0.0-rc.1', 'ploeg-v0.03.0-rc.1', "ploeg-v0.3.0-rc.1'\nexit 0\n'", '']) {
      fs.writeFileSync(output, '');
      const result = spawnSync('bash', ['-c', shell], { env: { ...process.env, RELEASE_TAG: tag, GITHUB_OUTPUT: output }, encoding: 'utf8' });
      assert.equal(result.status, 1, `${tag}: ${result.stderr}`);
      assert.equal(fs.readFileSync(output, 'utf8'), '');
    }
    const result = spawnSync('bash', ['-c', shell], { env: { ...process.env, RELEASE_TAG: 'ploeg-v0.3.0-rc.5', GITHUB_OUTPUT: output }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(output, 'utf8'), 'version=0.3.0-rc.5\nlatest_tag=\n');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the actual current Git history calculates the corrected replacement without publishing', { skip: process.env.PLOEG_RELEASE_HISTORY !== 'true' }, async () => {
  const { default: getTags } = await loadCore('branches/get-tags.js');
  const { default: getLastRelease } = await loadCore('get-last-release.js');
  const { default: getCommits } = await loadCore('get-commits.js');
  const { default: getNextVersion } = await loadCore('get-next-version.js');
  const env = { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: root };
  const input = { cwd: root, env, logger, options: config };
  const [actualBranch] = await getTags(input, [{ ...branch, tags: [] }]);
  const lastRelease = getLastRelease({ ...input, branch: actualBranch });
  const commits = await getCommits({ ...input, lastRelease });
  const { analyzeCommits } = await import(pathToFileURL(require.resolve('@semantic-release/commit-analyzer')).href);
  const type = await analyzeCommits(pluginOptions(config, '@semantic-release/commit-analyzer'), { ...input, commits });
  const version = getNextVersion({ branch: actualBranch, lastRelease, nextRelease: { type, channel: actualBranch.channel }, logger });
  assert.equal(lastRelease.gitTag, 'ploeg-v0.3.0-rc.4');
  assert.equal(version, '0.3.0-rc.5');
  policy.verifyRelease({}, context(version));
  console.log(JSON.stringify({ lastRelease: lastRelease.gitTag, analyzedCommits: commits.length, type, nextRelease: `ploeg-v${version}`, publication: false }));
});

test('reusable artifact jobs accept validated parse output without unavailable job results', () => {
  const workflow = parse(fs.readFileSync(path.resolve(root, '../../.forgejo/workflows/on_release_published.yml'), 'utf8'));
  const parseStep = workflow.jobs['ploeg-parse-release-tag'].steps.find(step => step.id === 'parse');
  const shell = parseStep.run;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ploeg-publish-input-'));
  const output = path.join(directory, 'output');
  try {
    for (const tag of ['ploeg-v0.3.0-rc.5', 'ploeg-v1.0.0-rc.1', 'ploeg-v0.3.0', '']) {
      fs.writeFileSync(output, '');
      const result = spawnSync('bash', ['-c', shell], { env: { ...process.env, RELEASE_TAG: tag, GITHUB_OUTPUT: output }, encoding: 'utf8' });
      const version = fs.readFileSync(output, 'utf8').match(/^version=(.*)$/m)?.[1] || '';
      for (const name of ['release-publish-chart', 'release-distribute-forgejo', 'release-distribute-github']) {
        const job = workflow.jobs[`ploeg-${name}`];
        const expression = job.with.enabled.match(/\$\{\{ (.+) \}\}/)?.[1];
        assert.ok(expression, `${name} must pass an explicit guarded enabled input`);
        for (const unavailableResult of [undefined, '']) {
          const enabled = vm.runInNewContext(expression.replace(/needs\.([a-z-]+)/g, "needs['$1']"), {
            needs: {
              'ploeg-parse-release-tag': { outputs: { version }, result: unavailableResult },
              'ploeg-release-distribute-harbor': { outputs: {}, result: unavailableResult },
              'ploeg-release-sign-harbor': { outputs: { signed: 'true' }, result: unavailableResult },
            },
          });
          assert.equal(enabled, result.status === 0, `${name} input gate for ${tag}`);
        }
        if (name !== 'release-publish-chart') {
          assert.ok(job.needs.includes('ploeg-release-distribute-harbor'));
          assert.ok(job.needs.includes('ploeg-release-sign-harbor'));
        }
      }
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
