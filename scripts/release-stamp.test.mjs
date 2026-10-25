import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { stampVersion, versionSources } from '../apps/unfold/scripts/stamp-version.mjs';

const application = resolve(import.meta.dirname, '../apps/unfold');
const sourceFiles = Object.values(versionSources).flat().map(([file]) => file);
const committedVersion = JSON.parse(readFileSync(join(application, 'package.json'), 'utf8')).version;
const stale = '0.0.1-rc.1';
const release = '0.4.0-rc.999';

function applicationCopy(t) {
  const root = mkdtempSync(join(tmpdir(), 'unfold-stamp-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of [...sourceFiles, 'scripts/stamp-version.mjs']) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(application, file), join(root, file));
  }
  return root;
}

const snapshot = root => Object.fromEntries(sourceFiles.map(file => [file, readFileSync(join(root, file), 'utf8')]));
const stampCommand = (root, ...args) => spawnSync(process.execPath, [join(root, 'scripts/stamp-version.mjs'), ...args], { encoding: 'utf8' });

function versionsIn(root) {
  const json = file => JSON.parse(readFileSync(join(root, file), 'utf8'));
  const chart = readFileSync(join(root, 'ops/helm/unfold/Chart.yaml'), 'utf8');
  return {
    app: json('package.json').version,
    appLockfile: json('package-lock.json').version,
    appLockfileRoot: json('package-lock.json').packages[''].version,
    extension: json('extensions/vscode/package.json').version,
    extensionLockfile: json('extensions/vscode/package-lock.json').version,
    extensionLockfileRoot: json('extensions/vscode/package-lock.json').packages[''].version,
    chart: chart.match(/^version: (.+)$/m)[1],
    chartApp: chart.match(/^appVersion: (.+)$/m)[1],
  };
}

const everywhere = version => Object.fromEntries(Object.keys(versionsIn(application)).map(key => [key, version]));

test('the committed tree already carries its version in every source, so stamping it with that version changes no byte', t => {
  assert.deepEqual(versionsIn(application), everywhere(committedVersion));
  const root = applicationCopy(t);
  const before = snapshot(root);
  assert.deepEqual(stampVersion(committedVersion, { root }), []);
  assert.deepEqual(snapshot(root), before);
});

test('a stale committed version in every source is overwritten by the stamp from the tag', t => {
  const root = applicationCopy(t);
  stampVersion(stale, { root });
  assert.deepEqual(versionsIn(root), everywhere(stale));
  const result = stampCommand(root, release);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`Stamped ${release.replace(/\./g, '\\.')} into package\\.json, package-lock\\.json, extensions/vscode/package\\.json, extensions/vscode/package-lock\\.json, ops/helm/unfold/Chart\\.yaml`));
  assert.deepEqual(versionsIn(root), everywhere(release));
});

test('stamping twice is a no-op the second time', t => {
  const root = applicationCopy(t);
  assert.equal(stampCommand(root, release).status, 0);
  const once = snapshot(root);
  const again = stampCommand(root, release);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /already carries/);
  assert.deepEqual(snapshot(root), once);
});

test('the image build stamps only the application manifests it copies', t => {
  const root = applicationCopy(t);
  stampVersion(stale, { root });
  assert.deepEqual(stampVersion(release, { root, sources: ['app'] }), ['package.json', 'package-lock.json']);
  assert.deepEqual(versionsIn(root), { ...everywhere(stale), app: release, appLockfile: release, appLockfileRoot: release });
  rmSync(join(root, 'extensions'), { recursive: true });
  rmSync(join(root, 'ops'), { recursive: true });
  const result = stampCommand(root, release, 'app');
  assert.equal(result.status, 0, result.stderr);
});

test('a version that is not bare semver, or an unknown source, is refused before any file changes', t => {
  const root = applicationCopy(t);
  const before = snapshot(root);
  for (const args of [['dev'], [`v${release}`], ['unfold-v0.4.0-rc.1'], [''], [], [release, 'site']]) {
    const result = stampCommand(root, ...args);
    assert.equal(result.status, 2, `${JSON.stringify(args)}: ${result.stdout}`);
    assert.match(result.stderr, /^usage: stamp-version\.mjs/);
  }
  assert.deepEqual(snapshot(root), before);
});

test('a chart without appVersion fails the stamp and leaves every other source untouched', t => {
  const root = applicationCopy(t);
  const chart = join(root, 'ops/helm/unfold/Chart.yaml');
  writeFileSync(chart, readFileSync(chart, 'utf8').replace(/^appVersion:.*\n/m, ''));
  const before = snapshot(root);
  const result = stampCommand(root, release);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Chart\.yaml must declare version and appVersion/);
  assert.deepEqual(snapshot(root), before);
});

test('the release prepare step stamps through the same script', () => {
  const prepare = readFileSync(join(application, 'scripts/release-prepare.mjs'), 'utf8');
  assert.match(prepare, /from '\.\/stamp-version\.mjs'/);
  assert.match(prepare, /^stampVersion\(version\);$/m);
  assert.doesNotMatch(prepare, /\.version = version/);
});
