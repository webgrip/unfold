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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unfold-release-branches-'));
  const remote = path.join(directory, 'origin.git');
  const cwd = path.join(directory, 'checkout');
  try {
    git(directory, 'init', '--bare', '-b', 'development', remote);
    git(directory, 'init', '-b', 'development', cwd);
    git(cwd, 'config', 'user.name', 'Unfold qualification');
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

test('one Unfold release selects Vloer commits and ignores the site, the Ploeg pin and changes outside the applications', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unfold-release-'));
  const previous = process.cwd();
  try {
    git(directory, 'init', '-b', 'development');
    git(directory, 'config', 'user.name', 'Unfold qualification');
    git(directory, 'config', 'user.email', 'qualification@example.invalid');
    for (const app of ['vloer', 'ploeg', 'site']) fs.mkdirSync(path.join(directory, 'apps', app), { recursive: true });
    fs.mkdirSync(path.join(directory, 'scripts'));
    fs.mkdirSync(path.join(directory, 'docs'));
    const files = ['apps/.releaserc.cjs', 'scripts/release-policy.cjs', 'scripts/release-floors.cjs', 'scripts/release-floors.json'];
    for (const file of files) fs.copyFileSync(path.join(root, file), path.join(directory, file));
    fs.writeFileSync(path.join(directory, 'apps/package.json'), JSON.stringify({ name: 'unfold', version: '0.0.0', private: true }));
    files.push('apps/package.json');
    git(directory, 'add', '--', ...files);
    git(directory, 'commit', '-m', 'chore: establish fixture');
    const commits = [];
    for (const [name, message, paths] of [
      ['vloer', 'fix: correct interactive work', ['apps/vloer/change.txt']],
      ['ploeg-pin', 'build(ploeg): pin ploeg-hq/ploeg v0.1.1', ['apps/ploeg/change.txt']],
      ['ploeg-fix', 'fix(ploeg): pin the Ploeg fix for stuck reviewers', ['apps/ploeg/change.txt']],
      ['ploeg-breaking', 'feat(ploeg)!: pin a Ploeg with a new operator contract', ['apps/ploeg/change.txt']],
      ['both', 'fix: show the field the newly pinned Ploeg sends', ['apps/vloer/change.txt', 'apps/ploeg/change.txt']],
      ['docs', 'fix: clarify shared documentation', ['docs/guide.md']],
      ['site', 'feat(site): add the landing page', ['apps/site/change.txt']],
      ['site-breaking', 'feat(site)!: move the site to a new domain', ['apps/site/change.txt']],
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
    const { options, plugins } = await getConfig(input, { repositoryUrl: 'https://example.invalid/unfold.git' });
    assert.equal(options.tagFormat, 'unfold-v${version}');
    const expected = { vloer: 'patch', 'ploeg-pin': null, 'ploeg-fix': null, 'ploeg-breaking': null, both: 'patch', docs: null, site: null, 'site-breaking': null };
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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unfold-publisher-'));
  const output = path.join(directory, 'output');
  try {
    const workflow = parse(fs.readFileSync(path.join(root, '.forgejo/workflows/on_release_published.yml'), 'utf8'));
    const shell = workflow.jobs['parse-release-tag'].steps.find(step => step.id === 'parse').run;
    const valid = 'unfold-v0.4.0-rc.5';
    for (const [tag, ref, accepted] of [
      [valid, `refs/tags/${valid}`, true],
      [valid, 'refs/heads/development', false],
      ['vloer-v0.4.0-rc.5', 'refs/tags/vloer-v0.4.0-rc.5', false],
      ['ploeg-v0.4.0-rc.5', 'refs/tags/ploeg-v0.4.0-rc.5', false],
      ['unfold-site-v0.1.0-rc.1', 'refs/tags/unfold-site-v0.1.0-rc.1', false],
      ["unfold-v0.4.0'; exit 0; #", 'refs/heads/development', false],
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

test('the site train selects only site commits and cuts unfold-site-v tags', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unfold-site-release-'));
  const previous = process.cwd();
  try {
    git(directory, 'init', '-b', 'development');
    git(directory, 'config', 'user.name', 'Unfold qualification');
    git(directory, 'config', 'user.email', 'qualification@example.invalid');
    for (const app of ['vloer', 'ploeg', 'site']) fs.mkdirSync(path.join(directory, 'apps', app), { recursive: true });
    fs.mkdirSync(path.join(directory, 'docs'));
    const site = JSON.parse(fs.readFileSync(path.join(root, 'apps/site/package.json'), 'utf8'));
    fs.writeFileSync(path.join(directory, 'apps/site/package.json'), JSON.stringify({ name: site.name, version: site.version, private: true }));
    fs.copyFileSync(path.join(root, 'apps/site/.releaserc.cjs'), path.join(directory, 'apps/site/.releaserc.cjs'));
    git(directory, 'add', '--', 'apps/site/package.json', 'apps/site/.releaserc.cjs');
    git(directory, 'commit', '-m', 'chore: establish fixture');
    const commits = [];
    for (const [name, message, paths] of [
      ['site', 'feat(site): add the landing page', ['apps/site/change.txt']],
      ['site-fix', 'fix(site): correct a link', ['apps/site/change.txt']],
      ['vloer', 'feat: extend interactive work', ['apps/vloer/change.txt']],
      ['ploeg', 'fix: correct managed work', ['apps/ploeg/change.txt']],
      ['docs', 'fix: clarify shared documentation', ['docs/guide.md']],
    ]) {
      for (const file of paths) fs.writeFileSync(path.join(directory, file), name);
      git(directory, 'add', '--', ...paths);
      git(directory, 'commit', '-m', message);
      commits.push({ name, hash: git(directory, 'rev-parse', 'HEAD'), message });
    }
    const moduleRoot = path.dirname(require.resolve('semantic-release'));
    const { default: getConfig } = await import(pathToFileURL(path.join(moduleRoot, 'lib/get-config.js')).href);
    const cwd = path.join(directory, 'apps/site');
    process.chdir(cwd);
    const input = { cwd, env: process.env, logger, stdout: process.stdout, stderr: process.stderr };
    const { options, plugins } = await getConfig(input, { repositoryUrl: 'https://example.invalid/unfold.git' });
    assert.equal(options.tagFormat, 'unfold-site-v${version}');
    assert.equal(options.tagFormat, `${site.name}-v\${version}`, 'semantic-release-monorepo names release notes after the package');
    assert.ok(!options.plugins.some(plugin => (Array.isArray(plugin) ? plugin[0] : plugin).includes('release-policy')), 'the Unfold zero-major policy is not the site policy');
    const expected = { site: 'minor', 'site-fix': 'patch', vloer: null, ploeg: null, docs: null };
    for (const commit of commits) {
      const actual = await plugins.analyzeCommits({ ...input, options, commits: [commit] });
      assert.equal(actual ?? null, expected[commit.name], commit.name);
    }
  } finally {
    process.chdir(previous);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('each train reads only its own tags', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unfold-release-tags-'));
  try {
    git(directory, 'init', '-b', 'development');
    git(directory, 'config', 'user.name', 'Unfold qualification');
    git(directory, 'config', 'user.email', 'qualification@example.invalid');
    git(directory, 'commit', '--allow-empty', '-m', 'chore: establish fixture');
    const tags = ['unfold-v0.3.0', 'unfold-v0.4.0-rc.1', 'unfold-site-v0.0.0', 'unfold-site-v0.1.0-rc.1', 'vloer-v0.3.0', 'ploeg-v0.3.0'];
    for (const tag of tags) git(directory, 'tag', tag);
    const moduleRoot = path.dirname(require.resolve('semantic-release'));
    const { default: getTags } = await import(pathToFileURL(path.join(moduleRoot, 'lib/branches/get-tags.js')).href);
    const read = async tagFormat => (await getTags({ cwd: directory, env: process.env, options: { tagFormat } }, [{ name: 'development' }]))[0].tags.map(tag => tag.gitTag).sort();
    const unfold = require(path.join(root, 'apps/.releaserc.cjs'));
    const site = require(path.join(root, 'apps/site/.releaserc.cjs'));
    assert.deepEqual(await read(unfold.tagFormat), ['unfold-v0.3.0', 'unfold-v0.4.0-rc.1']);
    assert.deepEqual(await read(site.tagFormat), ['unfold-site-v0.0.0', 'unfold-site-v0.1.0-rc.1']);
    const policy = require(path.join(root, 'scripts/release-policy.cjs'));
    const branch = { name: 'development', type: 'prerelease', prerelease: 'rc', channel: 'development' };
    assert.throws(() => policy.verifyConditions({}, { branch, options: { tagFormat: site.tagFormat } }), /unfold-v/);
    assert.throws(() => policy.verifyRelease({}, { branch, options: { tagFormat: unfold.tagFormat }, nextRelease: { version: '0.1.0-rc.1', gitTag: 'unfold-site-v0.1.0-rc.1', channel: 'development' } }), /must agree/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
