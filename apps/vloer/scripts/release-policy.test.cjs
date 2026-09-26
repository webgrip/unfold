'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { parse } = require('yaml');

process.env.SEMANTIC_RELEASE_GITEA = 'true';
const { makeConfig } = require('@webgrip/semantic-release-config');
const config = require('../.releaserc.cjs');
const policy = require('./release-policy.cjs');
const root = path.resolve(__dirname, '..');
const semanticReleaseRoot = path.dirname(require.resolve('semantic-release'));
const shared = makeConfig({ manifest: 'helm', chartPath: 'ops/helm/de-vloer' });
const pluginOptions = (source, name) => source.plugins.find((entry) => Array.isArray(entry) && entry[0] === name)[1];
const logger = { log() {}, success() {}, warn() {}, error() {}, scope() { return this; } };
const branch = {
  name: 'development', type: 'prerelease', prerelease: 'rc', channel: 'development',
  tags: [{ version: '0.3.0-rc.16', gitTag: 'vloer-v0.3.0-rc.16', channels: ['development'] }],
};
const context = (version = '0.3.0-rc.17') => ({
  branch, options: { tagFormat: config.tagFormat },
  nextRelease: { version, gitTag: `vloer-v${version}`, channel: 'development' },
});
const loadCore = (name) => import(pathToFileURL(path.join(semanticReleaseRoot, 'lib', name)).href);
const analyze = async (options, message) => {
  const { analyzeCommits } = await import(pathToFileURL(require.resolve('@semantic-release/commit-analyzer')).href);
  return analyzeCommits(options, { commits: [{ hash: '0000000000000000000000000000000000000001', message }], logger, cwd: root });
};

test('a breaking commit is major under the shared config and minor under Vloer policy', async () => {
  assert.equal(await analyze(pluginOptions(shared, '@semantic-release/commit-analyzer'), 'feat!: change the workbench API'), 'major');
  for (const message of ['feat!: change API', 'fix(api)!: change API', 'docs: migration\n\nBREAKING CHANGE: required upgrade']) {
    assert.equal(await analyze(pluginOptions(config, '@semantic-release/commit-analyzer'), message), 'minor');
  }
  assert.equal(await analyze(pluginOptions(config, '@semantic-release/commit-analyzer'), 'fix: correct behavior'), 'patch');
  assert.equal(await analyze(pluginOptions(config, '@semantic-release/commit-analyzer'), 'docs: explain'), null);
});

test('the real version calculator advances vloer-v0.3.0-rc.16 to rc.17, even for a breaking change', async () => {
  const { default: getLastRelease } = await loadCore('get-last-release.js');
  const { default: getNextVersion } = await loadCore('get-next-version.js');
  const lastRelease = getLastRelease({ branch, options: config });
  const type = await analyze(pluginOptions(config, '@semantic-release/commit-analyzer'), 'feat!: change API');
  const version = getNextVersion({ branch, lastRelease, nextRelease: { type, channel: branch.channel }, logger });
  assert.equal(version, '0.3.0-rc.17');
  policy.verifyRelease({}, context(version));
});

test('version verification rejects major, stable, malformed and missing releases', () => {
  for (const version of ['1.0.0-rc.1', '2.3.4-rc.1', '0.4.0', '1.0.0', '0.4.0-beta.1', '0.04.0-rc.1', '0.4.0-rc.0', '', null]) {
    assert.throws(() => policy.verifyRelease({}, context(version)), /only 0.x.y-rc.N/);
  }
  assert.throws(() => policy.verifyRelease({}, { ...context(), nextRelease: undefined }), /only 0.x.y-rc.N/);
  assert.throws(() => policy.verifyRelease({}, { ...context(), nextRelease: { ...context().nextRelease, gitTag: 'ploeg-v0.3.0-rc.17' } }), /must agree/);
});

test('condition verification blocks stable promotion before a version exists', () => {
  policy.verifyConditions({}, { branch, options: config });
  for (const rejected of [undefined, { ...branch, name: 'main' }, { ...branch, type: 'release' }, { ...branch, prerelease: 'beta' }, { ...branch, channel: null }]) {
    assert.throws(() => policy.verifyConditions({}, { branch: rejected, options: config }), /only development/);
  }
  assert.throws(() => policy.verifyConditions({}, { branch, options: { tagFormat: 'v${version}' } }), /tags must use/);
});

test('the installed plugin pipeline loads and enforces both gates', async () => {
  const { default: loadPlugins } = await loadCore('plugins/index.js');
  const options = { ...config, plugins: [config.plugins[0], ['@semantic-release/commit-analyzer', pluginOptions(config, '@semantic-release/commit-analyzer')]] };
  const input = { cwd: root, env: {}, options, logger, stdout: process.stdout, stderr: process.stderr };
  const pipeline = await loadPlugins(input, {});
  await pipeline.verifyConditions({ ...input, branch });
  await pipeline.verifyRelease({ ...input, ...context(), options });
  await assert.rejects(pipeline.verifyRelease({ ...input, ...context('1.0.0-rc.1'), options }), /only 0.x.y-rc.N/);
});

test('the effective configuration keeps the vloer-v tag and CI runs this suite before releasing', () => {
  assert.equal(config.tagFormat, 'vloer-v${version}');
  assert.equal(config.plugins[0], path.join(__dirname, 'release-policy.cjs'));
  const workflow = parse(fs.readFileSync(path.resolve(root, '../../.forgejo/workflows/on_source_change.yml'), 'utf8'));
  assert.ok(workflow.jobs['release-vloer'].needs.includes('release-policy'));
  const action = parse(fs.readFileSync(path.resolve(root, '../../.forgejo/actions/release-policy/action.yml'), 'utf8'));
  const gate = action.runs.steps.find(step => step['working-directory'] === 'apps/vloer' && step.run?.includes('node --test scripts/release-policy.test.cjs'));
  assert.ok(gate, 'the release-policy action must run the Vloer policy suite');
  assert.match(gate.run, /NODE_PATH="\$\{SEMREL_PREBAKED:\?/);
});
