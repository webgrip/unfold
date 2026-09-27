'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { parse } = require('yaml');

process.env.SEMANTIC_RELEASE_GITEA = 'true';
const root = path.resolve(__dirname, '..');
const logger = { log() {}, success() {}, warn() {}, error() {}, scope() { return this; } };

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('the shared prerelease configuration needs an existing main baseline', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'glide-release-branches-'));
  const remote = path.join(directory, 'origin.git');
  const cwd = path.join(directory, 'checkout');
  try {
    git(directory, 'init', '--bare', '-b', 'development', remote);
    git(directory, 'init', '-b', 'development', cwd);
    git(cwd, 'config', 'user.name', 'Glide qualification');
    git(cwd, 'config', 'user.email', 'qualification@example.invalid');
    git(cwd, 'commit', '--allow-empty', '-m', 'chore: establish fixture');
    git(cwd, 'remote', 'add', 'origin', remote);
    git(cwd, 'push', 'origin', 'development');
    const moduleRoot = path.dirname(require.resolve('semantic-release'));
    const { default: getBranches } = await import(pathToFileURL(path.join(moduleRoot, 'lib/branches/index.js')).href);
    const options = require(path.join(root, 'apps/.releaserc.cjs'));
    const context = { cwd, env: process.env, options, logger };
    await assert.rejects(getBranches(remote, 'development', context), error => {
      assert.ok(error.errors, error.stack);
      return error.errors.some(item => item.code === 'ERELEASEBRANCHES');
    });
    git(cwd, 'push', 'origin', 'HEAD:refs/heads/main');
    const branches = await getBranches(remote, 'development', context);
    assert.equal(branches.find(branch => branch.name === 'main').type, 'release');
    const development = branches.find(branch => branch.name === 'development');
    assert.equal(development.type, 'prerelease');
    assert.equal(development.prerelease, 'rc');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('one Glide release selects commits in either application and ignores changes outside them', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'glide-release-'));
  const previous = process.cwd();
  try {
    git(directory, 'init', '-b', 'development');
    git(directory, 'config', 'user.name', 'Glide qualification');
    git(directory, 'config', 'user.email', 'qualification@example.invalid');
    for (const app of ['vloer', 'ploeg']) fs.mkdirSync(path.join(directory, 'apps', app), { recursive: true });
    fs.mkdirSync(path.join(directory, 'scripts'));
    fs.mkdirSync(path.join(directory, 'docs'));
    const files = ['apps/.releaserc.cjs', 'scripts/release-policy.cjs'];
    for (const file of files) fs.copyFileSync(path.join(root, file), path.join(directory, file));
    fs.writeFileSync(path.join(directory, 'apps/package.json'), JSON.stringify({ name: 'glide', version: '0.0.0', private: true }));
    files.push('apps/package.json');
    git(directory, 'add', '--', ...files);
    git(directory, 'commit', '-m', 'chore: establish fixture');
    const commits = [];
    for (const [name, message, paths] of [
      ['vloer', 'fix: correct interactive work', ['apps/vloer/change.txt']],
      ['ploeg', 'feat: extend managed work', ['apps/ploeg/change.txt']],
      ['both', 'fix: align a shared contract', ['apps/vloer/change.txt', 'apps/ploeg/change.txt']],
      ['docs', 'fix: clarify shared documentation', ['docs/guide.md']],
    ]) {
      for (const file of paths) fs.writeFileSync(path.join(directory, file), name);
      git(directory, 'add', '--', ...paths);
      git(directory, 'commit', '-m', message);
      commits.push({ name, hash: git(directory, 'rev-parse', 'HEAD'), message });
    }
    const moduleRoot = path.dirname(require.resolve('semantic-release'));
    const { default: getConfig } = await import(pathToFileURL(path.join(moduleRoot, 'lib/get-config.js')).href);
    const cwd = path.join(directory, 'apps');
    process.chdir(cwd);
    const input = { cwd, env: process.env, logger, stdout: process.stdout, stderr: process.stderr };
    const { options, plugins } = await getConfig(input, { repositoryUrl: 'https://example.invalid/glide.git' });
    assert.equal(options.tagFormat, 'glide-v${version}');
    const expected = { vloer: 'patch', ploeg: 'minor', both: 'patch', docs: null };
    for (const commit of commits) {
      const actual = await plugins.analyzeCommits({ ...input, options, commits: [commit] });
      assert.equal(actual ?? null, expected[commit.name], commit.name);
    }
  } finally {
    process.chdir(previous);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the publisher shell rejects application tags and mismatched manual refs before producing a version', () => {
  const { spawnSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'glide-publisher-'));
  const output = path.join(directory, 'output');
  try {
    const workflow = parse(fs.readFileSync(path.join(root, '.forgejo/workflows/on_release_published.yml'), 'utf8'));
    const shell = workflow.jobs['parse-release-tag'].steps.find(step => step.id === 'parse').run;
    const valid = 'glide-v0.4.0-rc.5';
    for (const [tag, ref, accepted] of [
      [valid, `refs/tags/${valid}`, true],
      [valid, 'refs/heads/development', false],
      ['vloer-v0.4.0-rc.5', 'refs/tags/vloer-v0.4.0-rc.5', false],
      ['ploeg-v0.4.0-rc.5', 'refs/tags/ploeg-v0.4.0-rc.5', false],
      ["glide-v0.4.0'; exit 0; #", 'refs/heads/development', false],
    ]) {
      fs.writeFileSync(output, '');
      const result = spawnSync('bash', ['-c', shell], { env: { ...process.env, GITHUB_OUTPUT: output, WORKFLOW_EVENT: 'workflow_dispatch', RELEASE_TAG: tag, SELECTED_REF: ref }, encoding: 'utf8' });
      assert.equal(result.status, accepted ? 0 : 1, `${tag}: ${result.stderr}`);
      assert.equal(fs.readFileSync(output, 'utf8').includes('version='), accepted);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
