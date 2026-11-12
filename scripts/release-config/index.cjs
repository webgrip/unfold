'use strict';

const { STANDARD_TYPES, MINIMUM_WAIVER_SHA_LENGTH, isWaiverSha } = require('./lib/conventional-commits.cjs');

const GITHUB_RELEASE_PLUGIN = '@semantic-release/github';
const COMMIT_ANALYZER_PLUGIN = require.resolve('./lib/commit-analyzer.cjs');
const RELEASE_NOTES_PLUGIN = require.resolve('./lib/release-notes.cjs');
const TAGS_ONLY_PLUGIN = require.resolve('./lib/tags-only.cjs');

const NOTE_KEYWORDS = ['BREAKING CHANGE', 'BREAKING CHANGES', 'BREAKING'];
const BREAKING_HEADER_PATTERN = '^(\\w*)(?:\\((?!(?:deps|gitops)\\))([^)]*)\\))?!: (.+)$';

const RELEASE_RULES = [
  { breaking: true, release: 'major' },
  { revert: true, release: 'patch' },
  { type: 'feat', release: 'minor' },
  { type: 'fix', release: 'patch' },
  { type: 'perf', release: 'patch' },
  { type: 'refactor', release: 'patch' },
  { type: 'chore', scope: 'deps', release: 'patch' },
  { type: 'build', scope: 'deps', release: 'patch' },
];

const NOTES_TYPES = [
  { type: 'chore', scope: 'deps', section: 'Dependencies' },
  { type: 'build', scope: 'deps', section: 'Dependencies' },
  { type: 'feat', section: 'Added' },
  { type: 'fix', section: 'Fixed' },
  { type: 'perf', section: 'Performance' },
  { type: 'refactor', section: 'Changed' },
  { type: 'revert', section: 'Reverts' },
  { type: 'docs', section: 'Docs' },
  { type: 'test', section: 'Tests' },
  { type: 'build', section: 'Build' },
  { type: 'ci', section: 'CI' },
  { type: 'style', section: 'Style' },
  { type: 'chore', section: 'Internal' },
];

const DEFAULT_BRANCHES = ['main', { name: 'development', prerelease: 'rc' }];
const KNOWN_OPTIONS = new Set(['monorepo', 'draftRelease', 'initialDevelopment', 'waivedCommits']);

const OUTPUT_CMD =
  'echo "version=${nextRelease.version}" >> "$GITHUB_OUTPUT" && ' +
  'echo "tag=${nextRelease.gitTag}" >> "$GITHUB_OUTPUT"';

function configError(message) {
  return new Error(`unfold-release-config: ${message}`);
}

function trainName(monorepo) {
  if (monorepo === null || typeof monorepo !== 'object' || typeof monorepo.name !== 'string' || monorepo.name === '') {
    throw configError('monorepo must be { name: "<train>" }; the train is named in the tag <name>-v${version}.');
  }
  const unknown = Object.keys(monorepo).filter((key) => key !== 'name');
  if (unknown.length > 0) throw configError(`monorepo only takes name, not ${unknown.join(', ')}.`);
  return monorepo.name;
}

/**
 * Builds the semantic-release configuration of one Unfold release train.
 * A train releases the commits under the directory semantic-release runs in, tags them `<name>-v${version}`,
 * cuts release candidates from `development` and stable versions from `main`, commits nothing, and files a GitHub release.
 */
function makeConfig(opts = {}) {
  for (const key of Object.keys(opts)) {
    if (!KNOWN_OPTIONS.has(key)) throw configError(`unknown option "${key}". Known options: ${[...KNOWN_OPTIONS].join(', ')}`);
  }
  const { monorepo, draftRelease = false, initialDevelopment = true, waivedCommits = [] } = opts;
  if (!process.env.GITHUB_TOKEN) {
    throw configError(
      'GITHUB_TOKEN is not set. Releases run from a GitHub Actions workflow that passes it. ' +
        'For a local preview: GITHUB_TOKEN="$(gh auth token)" npx semantic-release --dry-run --no-ci'
    );
  }
  if (typeof initialDevelopment !== 'boolean') throw configError('initialDevelopment must be true or false.');
  if (typeof draftRelease !== 'boolean') throw configError('draftRelease must be true or false.');
  if (!Array.isArray(waivedCommits) || !waivedCommits.every(isWaiverSha)) {
    throw configError(`waivedCommits must be a list of lowercase commit shas, each at least ${MINIMUM_WAIVER_SHA_LENGTH} characters.`);
  }
  const name = trainName(monorepo);
  const parserOpts = { noteKeywords: NOTE_KEYWORDS, breakingHeaderPattern: BREAKING_HEADER_PATTERN };
  const train = { train: { path: undefined } };
  return {
    branches: DEFAULT_BRANCHES,
    tagFormat: `${name}-v\${version}`,
    plugins: [
      TAGS_ONLY_PLUGIN,
      [
        COMMIT_ANALYZER_PLUGIN,
        {
          preset: 'conventionalcommits',
          releaseRules: [...RELEASE_RULES],
          parserOpts,
          allowedTypes: [...STANDARD_TYPES],
          waivedCommits,
          initialDevelopment,
          ...train,
        },
      ],
      [RELEASE_NOTES_PLUGIN, { preset: 'conventionalcommits', presetConfig: { types: [...NOTES_TYPES] }, parserOpts, ...train }],
      ['@semantic-release/exec', { successCmd: OUTPUT_CMD }],
      [GITHUB_RELEASE_PLUGIN, { successComment: false, failComment: false, releasedLabels: false, draftRelease }],
    ],
  };
}

module.exports = { makeConfig, GITHUB_RELEASE_PLUGIN, COMMIT_ANALYZER_PLUGIN, RELEASE_NOTES_PLUGIN, TAGS_ONLY_PLUGIN };
