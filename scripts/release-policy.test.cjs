'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync, spawnSync } = require('node:child_process');
const os = require('node:os');
const vm = require('node:vm');
const { parse } = require('yaml');

process.env.SEMANTIC_RELEASE_GITEA = 'true';
const { makeConfig } = require('@webgrip/semantic-release-config');
const root = path.resolve(__dirname, '..');
const config = require(path.join(root, 'apps/.releaserc.cjs'));
const policy = require('./release-policy.cjs');
const semanticReleaseRoot = path.dirname(require.resolve('semantic-release'));
const shared = makeConfig({});
const pluginOptions = (source, name) => source.plugins.find((entry) => Array.isArray(entry) && entry[0] === name)[1];
const logger = { log() {}, success() {}, warn() {}, error() {}, scope() { return this; } };
const historicalCommit = fs.readFileSync(path.join(__dirname, 'fixtures/release-breaking-commit.txt'), 'utf8');
const baseline = { version: '0.3.0', gitTag: 'unfold-v0.3.0', channels: [null] };
const branch = {
  name: 'development', type: 'prerelease', prerelease: 'rc', channel: 'development',
  tags: [baseline],
};
const context = (version = '0.4.0-rc.1') => ({
  branch, options: { tagFormat: config.tagFormat },
  nextRelease: { version, gitTag: `unfold-v${version}`, channel: 'development' },
});
const loadCore = (name) => import(pathToFileURL(path.join(semanticReleaseRoot, 'lib', name)).href);
const analyze = async (options, message = historicalCommit) => {
  const { analyzeCommits } = await import(pathToFileURL(require.resolve('@semantic-release/commit-analyzer')).href);
  return analyzeCommits(options, { commits: [{ hash: '9028cf0718c65acbfc4f8bfd1be71f32417221ce', message }], logger, cwd: root });
};
const nextVersion = async (tags, type) => {
  const { default: getLastRelease } = await loadCore('get-last-release.js');
  const { default: getNextVersion } = await loadCore('get-next-version.js');
  const candidate = { ...branch, tags };
  const lastRelease = getLastRelease({ branch: candidate, options: config });
  return getNextVersion({ branch: candidate, lastRelease, nextRelease: { type, channel: branch.channel }, logger });
};
const publisher = () => parse(fs.readFileSync(path.join(root, '.forgejo/workflows/on_release_published.yml'), 'utf8'));
const floors = require('./release-floors.cjs');
const gitIdentity = (home) => ({ ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Release test', GIT_AUTHOR_EMAIL: 'release-test@example.invalid', GIT_COMMITTER_NAME: 'Release test', GIT_COMMITTER_EMAIL: 'release-test@example.invalid' });
const repositoryWithOrphanedTags = (tags) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unfold-release-tags-'));
  const run = (...args) => execFileSync('git', args, { cwd: directory, env: gitIdentity(directory), encoding: 'utf8' });
  run('-c', 'init.defaultBranch=development', 'init', '--quiet');
  run('commit', '--quiet', '--allow-empty', '-m', 'trunk');
  run('commit', '--quiet', '--allow-empty', '-m', 'release commit dropped by a stale merge');
  for (const tag of tags) run('tag', tag);
  run('reset', '--quiet', '--hard', 'HEAD~1');
  return { directory, env: gitIdentity(directory), cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
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

test('the baseline started Unfold at 0.4.0-rc.1, a version now below the release floor', async () => {
  const type = await analyze(pluginOptions(config, '@semantic-release/commit-analyzer'));
  const version = await nextVersion([baseline], type);
  assert.equal(version, '0.4.0-rc.1');
  assert.throws(() => policy.verifyRelease({}, context(version), { tags: [] }), /at or below its release floor 0\.4\.0-rc\.34/);
  assert.equal(await nextVersion([baseline], 'patch'), '0.3.1-rc.1');
  assert.throws(() => policy.verifyRelease({}, context('0.3.1-rc.1'), { tags: [] }), /at or below its release floor/);
});

test('later candidates advance the release candidate number above the floor, even for a breaking change', async () => {
  const floor = { version: '0.4.0-rc.34', gitTag: 'unfold-v0.4.0-rc.34', channels: ['development'] };
  const type = await analyze(pluginOptions(config, '@semantic-release/commit-analyzer'), 'feat!: change API');
  const version = await nextVersion([baseline, floor], type);
  assert.equal(version, '0.4.0-rc.35');
  policy.verifyRelease({}, context(version), { tags: [floor.gitTag] });
});

test('a computed version at or below the floor or any existing tag stops before preparation', () => {
  const recorded = floors.load();
  for (const component of recorded.trains.unfold.components) {
    assert.throws(() => policy.verifyRelease({}, context(recorded.components[component].floor), { tags: [] }), /at or below its release floor/);
  }
  assert.throws(() => policy.verifyRelease({}, context('0.4.0-rc.36'), { tags: ['unfold-v0.4.0-rc.36'] }), /existing tag unfold-v0\.4\.0-rc\.36/);
  assert.throws(() => policy.verifyRelease({}, context('0.4.0-rc.35'), { tags: ['unfold-v0.4.0-rc.36'] }), /existing tag unfold-v0\.4\.0-rc\.36/);
  assert.throws(() => policy.verifyRelease({}, context('0.5.0-rc.1'), { tags: ['vloer-v0.5.0-rc.2'] }), /Unfold 0\.5\.0-rc\.1/);
  policy.verifyRelease({}, context('0.5.0-rc.1'), { tags: ['ploeg-v0.5.0-rc.1', 'unfold-v0.4.0-rc.35'] });
  policy.verifyRelease({}, context('0.4.0-rc.35'), { tags: ['unfold-v0.4.0-rc.34', 'unfold-site-v0.9.0-rc.1', 'ploeg-v0.3.0-rc.7'] });
});

test('the tag check reads tags a stale merge left unreachable from the release branch', () => {
  const repository = repositoryWithOrphanedTags(['unfold-v0.4.0-rc.40']);
  try {
    assert.equal(execFileSync('git', ['tag', '--merged', 'HEAD'], { cwd: repository.directory, env: repository.env, encoding: 'utf8' }), '');
    assert.deepEqual(policy.repositoryTags({ cwd: repository.directory, env: repository.env }), ['unfold-v0.4.0-rc.40']);
    const inRepository = (version) => ({ ...context(version), cwd: repository.directory, env: repository.env });
    assert.throws(() => policy.verifyRelease({}, inRepository('0.4.0-rc.40')), /existing tag unfold-v0\.4\.0-rc\.40/);
    policy.verifyRelease({}, inRepository('0.4.0-rc.41'));
  } finally {
    repository.cleanup();
  }
});

test('a mistaken 1.x tag is rejected instead of producing another 1.x release', async () => {
  const version = await nextVersion([baseline, { version: '1.0.0-rc.1', gitTag: 'unfold-v1.0.0-rc.1', channels: ['development'] }], 'minor');
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

test('the actual release notes retain a breaking-change compatibility warning', async () => {
  const { generateNotes } = await import(pathToFileURL(require.resolve('@semantic-release/release-notes-generator')).href);
  const notes = await generateNotes(pluginOptions(config, '@semantic-release/release-notes-generator'), {
    commits: [{ hash: '9028cf0718c65acbfc4f8bfd1be71f32417221ce', message: historicalCommit }],
    lastRelease: { version: '0.3.0', gitTag: 'unfold-v0.3.0' },
    nextRelease: { version: '0.4.0-rc.1', gitTag: 'unfold-v0.4.0-rc.1' },
    options: { repositoryUrl: 'https://forgejo.webgrip.dev/webgrip/glide.git' }, cwd: root, env: {}, logger,
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
  for (const gitTag of ['wrong', 'vloer-v0.4.0-rc.1', 'ploeg-v0.4.0-rc.1']) {
    assert.throws(() => policy.verifyRelease({}, { ...context(), nextRelease: { ...context().nextRelease, gitTag } }), /must agree/);
  }
  assert.throws(() => policy.verifyRelease({}, { ...context(), nextRelease: { ...context().nextRelease, channel: null } }), /must agree/);
});

test('condition verification blocks stable promotion even before a next version exists', () => {
  policy.verifyConditions({}, { branch, options: config });
  for (const rejected of [undefined, { ...branch, name: 'main' }, { ...branch, type: 'release' }, { ...branch, prerelease: 'beta' }, { ...branch, channel: null }]) {
    assert.throws(() => policy.verifyConditions({}, { branch: rejected, options: config }), /only development/);
  }
  for (const tagFormat of ['vloer-v${version}', 'ploeg-v${version}', 'v${version}']) {
    assert.throws(() => policy.verifyConditions({}, { branch, options: { tagFormat } }), /tags must use/);
  }
});

test('the installed plugin pipeline loads and enforces both local release gates', async () => {
  const { default: loadPlugins } = await loadCore('plugins/index.js');
  const options = { ...config, plugins: [config.plugins[0], ['@semantic-release/commit-analyzer', pluginOptions(config, '@semantic-release/commit-analyzer')]] };
  const input = { cwd: root, env: {}, options, logger, stdout: process.stdout, stderr: process.stderr };
  const pipeline = await loadPlugins(input, {});
  const repository = repositoryWithOrphanedTags(['unfold-v0.4.0-rc.40']);
  try {
    const inRepository = { ...input, cwd: repository.directory, env: repository.env };
    await pipeline.verifyConditions({ ...input, branch });
    await pipeline.verifyRelease({ ...inRepository, ...context('0.4.0-rc.41'), options });
    await assert.rejects(pipeline.verifyConditions({ ...input, branch: { ...branch, name: 'main' } }), /only development/);
    await assert.rejects(pipeline.verifyRelease({ ...inRepository, ...context('1.0.0-rc.1'), options }), /only 0.x.y-rc.N/);
    await assert.rejects(pipeline.verifyRelease({ ...inRepository, ...context('0.4.0-rc.1'), options }), /at or below its release floor/);
    await assert.rejects(pipeline.verifyRelease({ ...inRepository, ...context('0.4.0-rc.40'), options }), /existing tag unfold-v0\.4\.0-rc\.40/);
  } finally {
    repository.cleanup();
  }
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

test('one release prepares and commits Unfold at the Unfold version and never touches the pinned Ploeg', () => {
  const exec = pluginOptions(config, '@semantic-release/exec');
  assert.equal(exec.prepareCmd, 'node ../scripts/release-prepare.mjs ${nextRelease.version}');
  const assets = pluginOptions(config, '@semantic-release/git').assets;
  for (const asset of ['CHANGELOG.md', 'unfold/ops/helm/unfold/Chart.yaml', 'unfold/package.json', 'unfold/extensions/vscode/package.json', 'unfold/ops/cluster/agent-sandbox/warm-pool.yaml', 'unfold/ops/local/config.live.example.json']) {
    assert.ok(assets.includes(asset), asset);
    if (asset !== 'CHANGELOG.md') assert.ok(fs.existsSync(path.join(root, 'apps', asset)), asset);
  }
  assert.deepEqual(assets.filter(asset => asset.startsWith('ploeg')), []);
  const prepare = fs.readFileSync(path.join(root, 'scripts/release-prepare.mjs'), 'utf8');
  for (const chart of ['apps/unfold/ops/helm/unfold/Chart.yaml', 'apps/unfold/scripts/release-prepare.mjs']) {
    assert.ok(prepare.includes(chart), chart);
  }
  assert.doesNotMatch(prepare, /apps\/ploeg/);
});

test('effective configuration uses unfold-v tags and CI tests it before invoking release', () => {
  assert.equal(config.tagFormat, 'unfold-v${version}');
  assert.equal(config.plugins[0], path.join(__dirname, 'release-policy.cjs'));
  const workflow = parse(fs.readFileSync(path.join(root, '.forgejo/workflows/on_source_change.yml'), 'utf8'));
  const steps = workflow.jobs.release.steps;
  const policy = steps.findIndex(step => step.uses === './.forgejo/actions/release-policy');
  assert.ok(policy >= 0 && policy < steps.findIndex(step => step.id === 'release'));
  const action = parse(fs.readFileSync(path.join(root, '.forgejo/actions/release-policy/action.yml'), 'utf8'));
  const gate = action.runs.steps.find(step => step.run?.includes('node --test scripts/release-policy.test.cjs'));
  assert.equal(gate['working-directory'], undefined);
  assert.match(gate.run, /NODE_PATH="\$\{SEMREL_PREBAKED:\?/);
});

test('the actual artifact-publisher shell rejects application, major and stable tags before emitting outputs', () => {
  const parseStep = publisher().jobs['parse-release-tag'].steps.find(step => step.id === 'parse');
  const shell = parseStep.run;
  assert.match(parseStep.env.RELEASE_TAG, /\$\{\{/);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unfold-release-policy-'));
  const output = path.join(directory, 'output');
  try {
    for (const tag of ['unfold-v1.0.0-rc.1', 'unfold-v0.4.0', 'unfold-v1.0.0', 'unfold-v0.4.0-beta.1', 'vloer-v0.4.0-rc.1', 'ploeg-v0.4.0-rc.1', 'unfold-v0.04.0-rc.1', "unfold-v0.4.0-rc.1'\nexit 0\n'", '']) {
      fs.writeFileSync(output, '');
      const result = spawnSync('bash', ['-c', shell], { env: { ...process.env, RELEASE_TAG: tag, GITHUB_OUTPUT: output }, encoding: 'utf8' });
      assert.equal(result.status, 1, `${tag}: ${result.stderr}`);
      assert.equal(fs.readFileSync(output, 'utf8'), '');
    }
    const result = spawnSync('bash', ['-c', shell], { env: { ...process.env, RELEASE_TAG: 'unfold-v0.4.0-rc.1', GITHUB_OUTPUT: output }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(output, 'utf8'), /^version=0\.4\.0-rc\.1\ncreated=\d{4}-/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('artifact jobs accept validated parse output without unavailable job results', () => {
  const workflow = publisher();
  const shell = workflow.jobs['parse-release-tag'].steps.find(step => step.id === 'parse').run;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unfold-publish-input-'));
  const output = path.join(directory, 'output');
  try {
    for (const tag of ['unfold-v0.4.0-rc.1', 'unfold-v1.0.0-rc.1', 'unfold-v0.4.0', '']) {
      fs.writeFileSync(output, '');
      const result = spawnSync('bash', ['-c', shell], { env: { ...process.env, RELEASE_TAG: tag, GITHUB_OUTPUT: output }, encoding: 'utf8' });
      const version = fs.readFileSync(output, 'utf8').match(/^version=(.*)$/m)?.[1] || '';
      for (const [name, job] of Object.entries(workflow.jobs).filter(([name]) => name !== 'parse-release-tag' && !name.startsWith('site-'))) {
        assert.ok(job.if, `${name} must have an explicit publication condition`);
        assert.ok(job.needs.includes('parse-release-tag'), name);
        for (const unavailableResult of [undefined, '']) {
          const enabled = vm.runInNewContext(job.if.replace(/needs\.([a-z-]+)/g, "needs['$1']"), {
            always: () => true,
            needs: {
              'parse-release-tag': { outputs: { version }, result: unavailableResult },
            },
          });
          assert.equal(enabled, result.status === 0, `${name} input gate for ${tag}`);
        }
      }
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the actual Git history calculates the next Unfold candidate above every floor and tag without publishing', { skip: process.env.UNFOLD_RELEASE_HISTORY !== 'true' }, async () => {
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
  assert.match(lastRelease.gitTag, /^unfold-v/);
  if (!type) {
    console.log(JSON.stringify({ lastRelease: lastRelease.gitTag, analyzedCommits: commits.length, type, nextRelease: null, publication: false }));
    return;
  }
  const version = getNextVersion({ branch: actualBranch, lastRelease, nextRelease: { type, channel: actualBranch.channel }, logger });
  policy.verifyRelease({}, { ...context(version), cwd: root, env });
  console.log(JSON.stringify({ lastRelease: lastRelease.gitTag, analyzedCommits: commits.length, type, nextRelease: `unfold-v${version}`, publication: false }));
});
