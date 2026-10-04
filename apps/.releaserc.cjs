'use strict';

const { makeConfig } = require('@webgrip/semantic-release-config');

const config = makeConfig({
  monorepo: true,
  prepareCmd: 'node ../scripts/release-prepare.mjs ${nextRelease.version}',
  extraAssets: [
    'unfold/ops/helm/unfold/Chart.yaml',
    'unfold/package.json',
    'unfold/package-lock.json',
    'unfold/extensions/vscode/package.json',
    'unfold/extensions/vscode/package-lock.json',
    'unfold/extensions/vscode/CHANGELOG.md',
    'unfold/ops/cluster/agent-sandbox/warm-pool.yaml',
    'unfold/ops/local/config.live.example.json',
  ],
});

const analyzers = config.plugins.filter((plugin) => Array.isArray(plugin) && plugin[0] === '@semantic-release/commit-analyzer');
if (analyzers.length !== 1 || !Array.isArray(analyzers[0][1]?.releaseRules)) {
  throw new Error('Unfold release policy requires one configured commit analyzer.');
}
const rules = analyzers[0][1].releaseRules;
if (!rules.some((rule) => rule.breaking === true && rule.release === 'major')) {
  throw new Error('Unfold release policy requires review of the changed breaking rule.');
}
analyzers[0][1].releaseRules = rules.map((rule) => rule.breaking === true && rule.release === 'major'
  ? { ...rule, release: 'minor' }
  : rule);
analyzers[0][1].releaseRules.push({ scope: 'site', release: false }, { scope: 'ploeg', release: false });
if (analyzers[0][1].releaseRules.some((rule) => rule.release === 'major')) {
  throw new Error('Unfold release policy rejects additional major release rules.');
}
config.tagFormat = 'unfold-v${version}';
config.plugins.unshift(require.resolve('../scripts/release-policy.cjs'));

module.exports = config;
