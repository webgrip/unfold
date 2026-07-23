// Forgejo is the SOLE release authority. GitHub is a tags-only push-mirror.
const onForgejo = !!process.env.GITEA_ACTIONS;
const noteKeywords = ['BREAKING CHANGE', 'BREAKING CHANGES', 'BREAKING'];

const commitAnalyzer = ['@semantic-release/commit-analyzer', {
  preset: 'conventionalcommits',
  releaseRules: [
    { breaking: true, release: 'major' },
    { revert: true, release: 'patch' },
    { type: 'feat', release: 'minor' },
    { type: 'fix', release: 'patch' },
    { type: 'perf', release: 'patch' },
    { type: 'refactor', release: 'patch' },
    { type: 'chore', scope: 'deps', release: 'patch' },
    { type: 'chore', release: false }, { type: 'ci', release: false },
    { type: 'docs', release: false }, { type: 'style', release: false },
    { type: 'test', release: false }, { type: 'build', release: false },
  ],
  parserOpts: { noteKeywords },
}];

const releaseNotes = ['@semantic-release/release-notes-generator', {
  preset: 'conventionalcommits',
  presetConfig: { types: [
    { type: 'feat', section: 'Added' },
    { type: 'fix', section: 'Fixed' },
    { type: 'perf', section: 'Performance' },
    { type: 'refactor', section: 'Changed' },
    { type: 'revert', section: 'Reverts' },
    { type: 'chore', section: 'Internal', hidden: true },
    { type: 'docs', section: 'Docs', hidden: false },
    { type: 'test', section: 'Tests', hidden: false },
  ] },
  parserOpts: { noteKeywords },
}];

// successCmd feeds the composite's `version` output (bare semver; the dispatch step prepends `v`).
const exec = ['@semantic-release/exec', {
  successCmd: 'echo "version=${nextRelease.version}" >> $GITHUB_OUTPUT',
}];

// Commit-back + publish ONLY on Forgejo. [skip ci] keeps the release commit inert on both forges.
const commitBack = onForgejo ? [
  ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
  ['@semantic-release/git', {
    assets: ['CHANGELOG.md'],
    message: 'chore(release): ${nextRelease.gitTag} [skip ci]\n\n${nextRelease.notes}',
  }],
] : [];
const publish = onForgejo ? ['@saithodev/semantic-release-gitea'] : [];

module.exports = {
  // development is the working branch: every push cuts a vX.Y.Z-rc.N prerelease.
  // Merging development -> main promotes to the stable vX.Y.Z.
  branches: ['main', { name: 'development', prerelease: 'rc' }],
  // v-prefixed (org deviation): Go modules require vX.Y.Z tags for
  // `go install github.com/webgrip/ploeg/cmd/ploegd@vX.Y.Z`. Image tags strip the v at publish.
  tagFormat: 'v${version}',
  plugins: [commitAnalyzer, releaseNotes, exec, ...commitBack, ...publish],
};
