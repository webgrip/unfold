import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

export function committedTrees(root, paths) {
  return Object.fromEntries(paths.map(path => {
    try { return [path, git(root, ['rev-parse', `HEAD:${path}`])]; } catch { return [path, 'absent']; }
  }));
}

export function unchangedSinceCommit(root, paths) {
  return git(root, ['status', '--porcelain', '--untracked-files=all', '--', ...paths]) === '';
}

export function gateKey(root, gate, shared) {
  const paths = [...shared.paths, ...gate.inputs];
  if (!unchangedSinceCommit(root, paths)) return undefined;
  const material = { gate: [gate.scope, gate.command, ...gate.args], trees: committedTrees(root, paths), tools: shared.tools, env: shared.env, platform: `${process.platform}-${process.arch}` };
  return createHash('sha256').update(JSON.stringify(material)).digest('hex');
}

export function resultCache(directory, { reuse, retentionDays = 14 }) {
  const location = directory.replace(/^~(?=\/|$)/, homedir());
  mkdirSync(location, { recursive: true });
  const marker = key => join(location, key);
  const cutoff = Date.now() - retentionDays * 86_400_000;
  for (const name of readdirSync(location)) {
    if (statSync(marker(name)).mtimeMs < cutoff) rmSync(marker(name), { force: true });
  }
  return {
    passed(key) {
      if (!reuse) return false;
      try {
        statSync(marker(key));
        const now = new Date();
        utimesSync(marker(key), now, now);
        return true;
      } catch { return false; }
    },
    record(key, label) { writeFileSync(marker(key), `${label}\n`); },
  };
}
