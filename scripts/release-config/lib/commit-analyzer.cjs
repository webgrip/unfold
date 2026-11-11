'use strict';

const { assertConventional } = require('./conventional-commits.cjs');
const { mergeCommitHashes } = require('./merge-commits.cjs');
const { trainCommits } = require('./train.cjs');

function selectTrainCommits(train, context) {
  if (train === undefined) return context.commits;
  const { trainPath, commits } = trainCommits(context.commits, { cwd: context.cwd, path: train.path });
  context.logger.log(
    'Train "%s": %d of %d commits since the last release touch it',
    trainPath || '.',
    commits.length,
    context.commits.length
  );
  return commits;
}

function isInitialDevelopment(lastRelease) {
  return Number.parseInt(lastRelease?.version ?? '', 10) === 0;
}

function capBreakingDuringInitialDevelopment(releaseType, { initialDevelopment, lastRelease }) {
  return initialDevelopment && releaseType === 'major' && isInitialDevelopment(lastRelease) ? 'minor' : releaseType;
}

async function analyzeCommits(pluginConfig, context) {
  const { train, allowedTypes, waivedCommits, initialDevelopment = true, ...analyzerConfig } = pluginConfig;
  const commits = selectTrainCommits(train, context);
  assertConventional(commits, {
    allowedTypes,
    waivedCommits,
    mergeCommits: mergeCommitHashes(commits, { cwd: context.cwd }),
  });
  const { analyzeCommits: analyze } = await import('@semantic-release/commit-analyzer');
  const releaseType = await analyze(analyzerConfig, { ...context, commits });
  return capBreakingDuringInitialDevelopment(releaseType, { initialDevelopment, lastRelease: context.lastRelease });
}

module.exports = { analyzeCommits, capBreakingDuringInitialDevelopment };
