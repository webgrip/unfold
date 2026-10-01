'use strict';

const { makeConfig } = require('@webgrip/semantic-release-config');

const config = makeConfig({
  monorepo: true,
  prepareCmd: 'node ../scripts/release-prepare.mjs ${nextRelease.version}',
  extraAssets: [
    'vloer/ops/helm/de-vloer/Chart.yaml',
    'ploeg/ops/helm/ploeg/Chart.yaml',
    'vloer/package.json',
    'vloer/package-lock.json',
    'vloer/extensions/vscode/package.json',
    'vloer/extensions/vscode/package-lock.json',
    'vloer/extensions/vscode/CHANGELOG.md',
    'vloer/ops/cluster/agent-sandbox/warm-pool.yaml',
    'vloer/ops/local/config.live.example.json',
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
analyzers[0][1].releaseRules.push({ scope: 'site', release: false });
if (analyzers[0][1].releaseRules.some((rule) => rule.release === 'major')) {
  throw new Error('Unfold release policy rejects additional major release rules.');
}
config.tagFormat = 'unfold-v${version}';
config.plugins.unshift(require.resolve('../scripts/release-policy.cjs'));

module.exports = config;
