'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const COMMIT_SEPARATOR = '\u0000';
const GIT_OUTPUT_LIMIT_BYTES = 256 * 1024 * 1024;

function git(cwd, args, input) {
  return execFileSync('git', args, { cwd, input, encoding: 'utf8', maxBuffer: GIT_OUTPUT_LIMIT_BYTES });
}

function normalizeTrainPath(trainPath) {
  const normalized = path.posix.normalize(String(trainPath).replaceAll('\\', '/')).replace(/\/+$/, '');
  return normalized === '.' ? '' : normalized.replace(/^\.\//, '');
}

function resolveTrainPath(cwd, configuredPath) {
  if (configuredPath !== undefined) return normalizeTrainPath(configuredPath);
  return normalizeTrainPath(git(cwd, ['rev-parse', '--show-prefix']).trim() || '.');
}

function filesByCommit(cwd, hashes) {
  const log = git(
    cwd,
    ['log', '--stdin', '--no-walk=unsorted', '--diff-merges=off', '--format=%x00%H', '--name-only'],
    `${hashes.join('\n')}\n`
  );
  const files = new Map();
  for (const entry of log.split(COMMIT_SEPARATOR).slice(1)) {
    const [hash, ...paths] = entry.split('\n').filter(Boolean);
    files.set(hash, paths);
  }
  return files;
}

function touchesTrain(files, trainPath) {
  return files.some((file) => file === trainPath || file.startsWith(`${trainPath}/`));
}

function trainCommits(commits, { cwd, path: configuredPath }) {
  const trainPath = resolveTrainPath(cwd, configuredPath);
  if (trainPath === '' || commits.length === 0) return { trainPath, commits };
  const files = filesByCommit(cwd, commits.map((commit) => commit.hash));
  return {
    trainPath,
    commits: commits.filter((commit) => touchesTrain(files.get(commit.hash) ?? [], trainPath)),
  };
}

module.exports = { normalizeTrainPath, resolveTrainPath, trainCommits };
