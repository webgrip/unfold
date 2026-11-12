'use strict';

const { execFileSync } = require('node:child_process');

const GIT_OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;

function mergeCommitHashes(commits, { cwd }) {
  if (commits.length === 0) return new Set();
  const merges = execFileSync('git', ['rev-list', '--stdin', '--no-walk', '--merges'], {
    cwd,
    input: `${commits.map((commit) => commit.hash).join('\n')}\n`,
    encoding: 'utf8',
    maxBuffer: GIT_OUTPUT_LIMIT_BYTES,
  });
  return new Set(merges.split('\n').filter(Boolean));
}

module.exports = { mergeCommitHashes };
