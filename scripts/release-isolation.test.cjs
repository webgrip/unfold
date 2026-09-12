'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

process.env.SEMANTIC_RELEASE_GITEA = 'true';
const root = path.resolve(__dirname, '..');
const logger = { log() {}, success() {}, warn() {}, error() {}, scope() { return this; } };

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('the installed release pipeline selects only commits within the application package', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'glide-release-'));
  const previous = process.cwd();
  try {
    git(directory, 'init', '-b', 'development');
    git(directory, 'config', 'user.name', 'Glide qualification');
    git(directory, 'config', 'user.email', 'qualification@example.invalid');
    const files = [];
    for (const app of ['vloer', 'ploeg']) {
      const target = path.join(directory, 'apps', app);
      fs.mkdirSync(path.join(target, 'scripts'), { recursive: true });
      for (const file of ['package.json', '.releaserc.cjs', ...(app === 'ploeg' ? ['scripts/release-policy.cjs'] : [])]) {
        fs.copyFileSync(path.join(root, 'apps', app, file), path.join(target, file));
        files.push(`apps/${app}/${file}`);
      }
    }
    fs.mkdirSync(path.join(directory, 'docs'));
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
    for (const app of ['vloer', 'ploeg']) {
      const cwd = path.join(directory, 'apps', app);
      process.chdir(cwd);
      const input = { cwd, env: process.env, logger, stdout: process.stdout, stderr: process.stderr };
      const { options, plugins } = await getConfig(input, { repositoryUrl: 'https://example.invalid/glide.git' });
      assert.equal(options.tagFormat, `${app}-v${'${version}'}`);
      for (const commit of commits) {
        const expected = commit.name === 'both' || (app === 'vloer' && commit.name === 'vloer') ? 'patch' : app === 'ploeg' && commit.name === 'ploeg' ? 'minor' : null;
        const actual = await plugins.analyzeCommits({ ...input, options, commits: [commit] });
        assert.equal(actual ?? null, expected, `${app} from ${commit.name}`);
      }
    }
  } finally {
    process.chdir(previous);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('publisher shells reject the other application and mismatched manual refs before producing a version', () => {
  const { spawnSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'glide-publisher-'));
  const output = path.join(directory, 'output');
  try {
    for (const app of ['vloer', 'ploeg']) {
      const workflow = fs.readFileSync(path.join(root, '.forgejo/workflows', `publish-${app}.yml`), 'utf8');
      const job = workflow.slice(workflow.indexOf('  parse-release-tag:'), workflow.indexOf('\n  release-publish-chart:'));
      const shell = job.slice(job.indexOf('          set -euo pipefail')).replace(/^          /gm, '');
      const valid = `${app}-v0.3.0-rc.5`;
      for (const [tag, ref, accepted] of [
        [valid, `refs/tags/${valid}`, true],
        [valid, 'refs/heads/development', false],
        [`${app === 'vloer' ? 'ploeg' : 'vloer'}-v0.3.0-rc.5`, 'refs/tags/unrelated', false],
        ["vloer-v0.3.0'; exit 0; #", 'refs/heads/development', false],
      ]) {
        fs.writeFileSync(output, '');
        const result = spawnSync('bash', ['-c', shell], { env: { ...process.env, GITHUB_OUTPUT: output, WORKFLOW_EVENT: 'workflow_dispatch', RELEASE_TAG: tag, SELECTED_REF: ref }, encoding: 'utf8' });
        assert.equal(result.status, accepted ? 0 : 1, `${app}: ${tag}: ${result.stderr}`);
        assert.equal(fs.readFileSync(output, 'utf8').includes('version='), accepted);
      }
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
