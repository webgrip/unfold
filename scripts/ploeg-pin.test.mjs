import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLOEG_PATH, PLOEG_URL, pinProblems, pinnedCommit } from './ploeg-pin.mjs';

const identity = ['-c', 'user.name=Pin fixture', '-c', 'user.email=pin@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', '-c', 'protocol.file.allow=always'];
const git = (cwd, ...args) => execFileSync('git', [...identity, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'unfold-ploeg-pin-'));
  const upstream = join(directory, 'ploeg');
  mkdirSync(upstream);
  git(upstream, 'init', '-q', '-b', 'main');
  writeFileSync(join(upstream, 'go.mod'), 'module example.invalid/ploeg\n');
  git(upstream, 'add', 'go.mod');
  git(upstream, 'commit', '-q', '-m', 'feat: start');
  const released = git(upstream, 'rev-parse', 'HEAD');
  git(upstream, 'checkout', '-q', '-b', 'proposal');
  writeFileSync(join(upstream, 'change.go'), 'package ploeg\n');
  git(upstream, 'add', 'change.go');
  git(upstream, 'commit', '-q', '-m', 'feat: propose');
  const proposed = git(upstream, 'rev-parse', 'HEAD');
  git(upstream, 'checkout', '-q', 'main');
  const root = join(directory, 'unfold');
  mkdirSync(root);
  git(root, 'init', '-q', '-b', 'development');
  git(root, 'submodule', 'add', '-q', upstream, PLOEG_PATH);
  git(root, 'commit', '-q', '-m', 'build(ploeg): pin');
  return { directory, upstream, root, released, proposed, close: () => rmSync(directory, { recursive: true, force: true }) };
}

test('an initialised gitlink at the pinned commit to the expected repository passes', () => {
  const { root, upstream, released, close } = fixture();
  try {
    assert.equal(pinnedCommit(root), released);
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
    git(checkout, 'fetch', '-q', 'origin', 'proposal');
    git(checkout, 'checkout', '-q', proposed);
    assert.match(pinProblems(root, { url: upstream }).join('\n'), new RegExp(`checked out at ${proposed}`));
    git(root, 'submodule', 'update', '-q');
    writeFileSync(join(checkout, 'go.mod'), 'module example.invalid/changed\n');
    assert.match(pinProblems(root, { url: upstream }).join('\n'), /has local changes; change Ploeg upstream/);
    git(root, 'submodule', 'deinit', '-q', '-f', PLOEG_PATH);
    assert.match(pinProblems(root, { url: upstream }).join('\n'), /is not initialised; run git submodule update --init --recursive/);
  } finally { close(); }
});

test('a published pin must be on the upstream main branch', () => {
  const { root, upstream, proposed, close } = fixture();
  try {
    assert.deepEqual(pinProblems(root, { url: upstream, published: true }), []);
    const checkout = join(root, PLOEG_PATH);
    git(checkout, 'fetch', '-q', 'origin', 'proposal');
    git(checkout, 'checkout', '-q', proposed);
    git(root, 'add', PLOEG_PATH);
    assert.deepEqual(pinProblems(root, { url: upstream }), []);
    assert.match(pinProblems(root, { url: upstream, published: true }).join('\n'), new RegExp(`pins ${proposed}, which is not on .* main; land the Ploeg change upstream first`));
    git(upstream, 'merge', '-q', '--ff-only', 'proposal');
    assert.deepEqual(pinProblems(root, { url: upstream, published: true }), []);
  } finally { close(); }
});

test('a shallow checkout, as CI makes it, still proves the pin is on main', () => {
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
