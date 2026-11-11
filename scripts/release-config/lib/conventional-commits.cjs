'use strict';

const STANDARD_TYPES = Object.freeze([
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'docs',
  'test',
  'build',
  'ci',
  'style',
  'chore',
]);

const CONVENTIONAL_HEADER = /^(?<type>[a-z][a-z0-9-]*)(?:\((?<scope>[^()\r\n]+)\))?!?: \S/;
const FORGE_MERGE_HEADER = /^Merge (?:pull request|branch|remote-tracking branch|tag|commit) /;
const GIT_REVERT_HEADER = /^Revert "(?<reverted>.+)"$/;
const MINIMUM_WAIVER_SHA_LENGTH = 7;

function headerOf(message) {
  return String(message ?? '').split('\n', 1)[0].trim();
}

function isAcceptedHeader(header, allowedTypes) {
  if (FORGE_MERGE_HEADER.test(header)) return true;
  const revert = GIT_REVERT_HEADER.exec(header);
  if (revert) return isAcceptedHeader(revert.groups.reverted, allowedTypes);
  const match = CONVENTIONAL_HEADER.exec(header);
  return match !== null && allowedTypes.has(match.groups.type);
}

function isWaived(hash, waivedCommits) {
  return waivedCommits.some((waived) => String(hash).startsWith(waived));
}

function nonConventionalCommits(
  commits,
  { allowedTypes = STANDARD_TYPES, waivedCommits = [], mergeCommits = new Set() } = {}
) {
  const types = new Set(allowedTypes);
  return commits.filter(
    (commit) =>
      !mergeCommits.has(commit.hash) &&
      !isWaived(commit.hash, waivedCommits) &&
      !isAcceptedHeader(headerOf(commit.message), types)
  );
}

class NonConventionalCommitsError extends Error {
  constructor(offenders, allowedTypes) {
    const listing = offenders.map((commit) => `- ${String(commit.hash).slice(0, 12)} ${headerOf(commit.message)}`);
    super(`${offenders.length} commit(s) in the release range are not conventional commits`);
    this.name = 'SemanticReleaseError';
    this.code = 'ENONCONVENTIONAL';
    this.semanticRelease = true;
    this.details = [
      'A release refuses to guess what these commits mean, so it fails instead of releasing nothing:',
      '',
      ...listing,
      '',
      `Accepted headers: \`<type>(<scope>)!: <subject>\` with type one of ${[...allowedTypes].join(', ')}; ` +
        'a forge or git merge header (`Merge pull request …`, `Merge branch …`); or `Revert "<accepted header>"`. ' +
        'A merge commit (two or more parents) passes whatever its header says.',
      'History cannot be rewritten once pushed. To release past one of these commits, list its sha in the ' +
        '`waivedCommits` option of makeConfig, with the reason in the pull request that adds it.',
    ].join('\n');
  }
}

function assertConventional(
  commits,
  { allowedTypes = STANDARD_TYPES, waivedCommits = [], mergeCommits = new Set() } = {}
) {
  const offenders = nonConventionalCommits(commits, { allowedTypes, waivedCommits, mergeCommits });
  if (offenders.length > 0) throw new NonConventionalCommitsError(offenders, allowedTypes);
}

function isWaiverSha(value) {
  return typeof value === 'string' && new RegExp(`^[0-9a-f]{${MINIMUM_WAIVER_SHA_LENGTH},40}$`).test(value);
}

module.exports = {
  STANDARD_TYPES,
  MINIMUM_WAIVER_SHA_LENGTH,
  headerOf,
  isAcceptedHeader,
  nonConventionalCommits,
  assertConventional,
  isWaiverSha,
  NonConventionalCommitsError,
};
