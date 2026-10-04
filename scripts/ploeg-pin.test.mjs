import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLOEG_PATH, PLOEG_URL, pinProblems, pinnedCommit, pinnedRelease } from './ploeg-pin.mjs';

const identity = ['-c', 'user.name=Pin fixture', '-c', 'user.email=pin@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', '-c', 'protocol.file.allow=always'];
const git = (cwd, ...args) => execFileSync('git', [...identity, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'unfold-ploeg-pin-'));
  const upstream = join(directory, 'ploeg');
  mkdirSync(upstream);
  git(upstream, 'init', '-q', '-b', 'main');
  writeFileSync(join(upstream, 'go.mod'), 'module example.invalid/ploeg\n');
  git(upstream, 'add', 'go.mod');
  git(upstream, 'commit', '-q', '-m', 'feat: start');
  git(upstream, 'tag', '-a', 'v0.1.0', '-m', 'Ploeg 0.1.0');
  const released = git(upstream, 'rev-parse', 'HEAD');
  git(upstream, 'checkout', '-q', '-b', 'development');
  writeFileSync(join(upstream, 'change.go'), 'package ploeg\n');
  git(upstream, 'add', 'change.go');
  git(upstream, 'commit', '-q', '-m', 'feat: propose');
  const proposed = git(upstream, 'rev-parse', 'HEAD');
  git(upstream, 'checkout', '-q', 'main');
  const root = join(directory, 'unfold');
  mkdirSync(root);
  git(root, 'init', '-q', '-b', 'development');
  git(root, 'submodule', 'add', '-q', upstream, PLOEG_PATH);
  git(root, 'config', '--file', '.gitmodules', `submodule.${PLOEG_PATH}.branch`, 'v0.1.0');
  git(root, 'add', '.gitmodules');
  git(root, 'commit', '-q', '-m', 'build(ploeg): pin v0.1.0');
  return { directory, upstream, root, released, proposed, close: () => rmSync(directory, { recursive: true, force: true }) };
}

function pinTo(root, commit, release) {
  const checkout = join(root, PLOEG_PATH);
  git(checkout, 'fetch', '-q', 'origin', '+refs/heads/*:refs/remotes/origin/*');
  git(checkout, 'checkout', '-q', commit);
  git(root, 'add', PLOEG_PATH);
  git(root, 'config', '--file', '.gitmodules', `submodule.${PLOEG_PATH}.branch`, release);
}

test('an initialised gitlink at the release commit of the expected repository passes', () => {
  const { root, upstream, released, close } = fixture();
  try {
    assert.equal(pinnedCommit(root), released);
    assert.equal(pinnedRelease(root), 'v0.1.0');
    assert.deepEqual(pinProblems(root, { url: upstream }), []);
    assert.match(pinProblems(root).join('\n'), new RegExp(`expected ${PLOEG_URL.replaceAll('.', '\\.')}`));
  } finally { close(); }
});

test('vendored source under the Ploeg path is refused', () => {
  const { root, upstream, close } = fixture();
  try {
    git(root, 'rm', '-q', '--cached', PLOEG_PATH);
    rmSync(join(root, PLOEG_PATH), { recursive: true, force: true });
    mkdirSync(join(root, PLOEG_PATH));
    writeFileSync(join(root, PLOEG_PATH, 'go.mod'), 'module example.invalid/ploeg\n');
    writeFileSync(join(root, PLOEG_PATH, 'main.go'), 'package main\n');
    git(root, 'add', PLOEG_PATH);
    assert.equal(pinnedCommit(root), undefined);
    assert.match(pinProblems(root, { url: upstream }).join('\n'), /tracks 2 files; Ploeg must be a submodule gitlink/);
  } finally { close(); }
});

test('an uninitialised, moved or modified checkout is refused', () => {
  const { root, upstream, proposed, close } = fixture();
  try {
    const checkout = join(root, PLOEG_PATH);
    git(checkout, 'fetch', '-q', 'origin', 'development');
    git(checkout, 'checkout', '-q', proposed);
    assert.match(pinProblems(root, { url: upstream }).join('\n'), new RegExp(`checked out at ${proposed}`));
    git(root, 'submodule', 'update', '-q');
    writeFileSync(join(checkout, 'go.mod'), 'module example.invalid/changed\n');
    assert.match(pinProblems(root, { url: upstream }).join('\n'), /has local changes; change Ploeg upstream/);
    git(root, 'submodule', 'deinit', '-q', '-f', PLOEG_PATH);
    assert.match(pinProblems(root, { url: upstream }).join('\n'), /is not initialised; run git submodule update --init --recursive/);
  } finally { close(); }
});

test('the pin names a Ploeg release tag, a stable version or a candidate', () => {
  const { root, upstream, close } = fixture();
  try {
    for (const release of ['main', 'development', 'v1.0.0', 'v0.1', 'v0.2.0-rc.0', 'v0.2.0-beta.1']) {
      git(root, 'config', '--file', '.gitmodules', `submodule.${PLOEG_PATH}.branch`, release);
      assert.match(pinProblems(root, { url: upstream }).join('\n'), new RegExp(`names branch ${release.replaceAll('.', '\\.')} for .*expected the Ploeg release tag`), release);
    }
    git(root, 'config', '--file', '.gitmodules', '--unset', `submodule.${PLOEG_PATH}.branch`);
    assert.match(pinProblems(root, { url: upstream }).join('\n'), /names no release for/);
    for (const release of ['v0.1.0', 'v0.2.0-rc.1', 'v0.12.3-rc.40']) {
      git(root, 'config', '--file', '.gitmodules', `submodule.${PLOEG_PATH}.branch`, release);
      assert.deepEqual(pinProblems(root, { url: upstream }), [], release);
    }
  } finally { close(); }
});

test('a published pin is the commit of the release tag it names, candidates included', () => {
  const { root, upstream, released, proposed, close } = fixture();
  try {
    assert.deepEqual(pinProblems(root, { url: upstream, published: true }), []);
    pinTo(root, proposed, 'v0.1.0');
    assert.deepEqual(pinProblems(root, { url: upstream }), []);
    assert.match(pinProblems(root, { url: upstream, published: true }).join('\n'), new RegExp(`pins ${proposed}, but Ploeg release v0\\.1\\.0 is ${released}`));
    pinTo(root, proposed, 'v0.2.0-rc.1');
    assert.match(pinProblems(root, { url: upstream, published: true }).join('\n'), /could not fetch the release tag v0\.2\.0-rc\.1 .*publish the Ploeg release first/);
    git(upstream, 'tag', '-a', 'v0.2.0-rc.1', '-m', 'Ploeg 0.2.0-rc.1', proposed);
    assert.deepEqual(pinProblems(root, { url: upstream, published: true }), []);
  } finally { close(); }
});

test('a shallow checkout, as CI makes it, still proves the pin is its release', () => {
  const { root, upstream, close } = fixture();
  try {
    const url = `file://${upstream}`;
    git(root, 'config', '--file', '.gitmodules', `submodule.${PLOEG_PATH}.url`, url);
    git(root, 'submodule', 'deinit', '-q', '-f', PLOEG_PATH);
    rmSync(join(root, '.git', 'modules', PLOEG_PATH), { recursive: true, force: true });
    for (const name of ['first.go', 'second.go']) {
      writeFileSync(join(upstream, name), 'package ploeg\n');
      git(upstream, 'add', name);
      git(upstream, 'commit', '-q', '-m', `feat: add ${name}`);
    }
    git(root, 'submodule', 'sync', '-q');
    git(root, 'submodule', 'update', '-q', '--init', '--depth=1');
    assert.equal(git(join(root, PLOEG_PATH), 'rev-parse', '--is-shallow-repository'), 'true');
    assert.deepEqual(pinProblems(root, { url, published: true }), []);
  } finally { close(); }
});
