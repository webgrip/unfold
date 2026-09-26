'use strict';

const { makeConfig } = require('@webgrip/semantic-release-config');

const config = makeConfig({
  monorepo: true,
  manifest: 'helm',
  chartPath: 'ops/helm/de-vloer',
  prepareCmd: 'node scripts/release-prepare.mjs ${nextRelease.version}',
  extraAssets: ['package.json', 'package-lock.json', 'extensions/vscode/package.json', 'extensions/vscode/package-lock.json', 'extensions/vscode/CHANGELOG.md'],
});

const analyzers = config.plugins.filter((plugin) => Array.isArray(plugin) && plugin[0] === '@semantic-release/commit-analyzer');
if (analyzers.length !== 1 || !Array.isArray(analyzers[0][1]?.releaseRules)) {
  throw new Error('Vloer release policy requires one configured commit analyzer.');
}
const rules = analyzers[0][1].releaseRules;
if (!rules.some((rule) => rule.breaking === true && rule.release === 'major')) {
  throw new Error('Vloer release policy requires review of the changed breaking rule.');
}
analyzers[0][1].releaseRules = rules.map((rule) => rule.breaking === true && rule.release === 'major'
  ? { ...rule, release: 'minor' }
  : rule);
if (analyzers[0][1].releaseRules.some((rule) => rule.release === 'major')) {
  throw new Error('Vloer release policy rejects additional major release rules.');
}
config.tagFormat = 'vloer-v${version}';
config.plugins.unshift(require.resolve('./scripts/release-policy.cjs'));

module.exports = config;
