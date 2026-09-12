'use strict';

const { makeConfig } = require('@webgrip/semantic-release-config');

const config = makeConfig({
  manifest: 'helm',
  chartPath: 'ops/helm/ploeg',
});

const analyzers = config.plugins.filter((plugin) => Array.isArray(plugin) && plugin[0] === '@semantic-release/commit-analyzer');
if (analyzers.length !== 1 || !Array.isArray(analyzers[0][1]?.releaseRules)) {
  throw new Error('Ploeg release policy requires one configured commit analyzer.');
}
const rules = analyzers[0][1].releaseRules;
if (!rules.some((rule) => rule.breaking === true && rule.release === 'major')) {
  throw new Error('Ploeg release policy requires review of the changed breaking rule.');
}
analyzers[0][1].releaseRules = rules.map((rule) => rule.breaking === true && rule.release === 'major'
  ? { ...rule, release: 'minor' }
  : rule);
if (analyzers[0][1].releaseRules.some((rule) => rule.release === 'major')) {
  throw new Error('Ploeg release policy rejects additional major release rules.');
}
config.plugins.unshift('./scripts/release-policy.cjs');

module.exports = config;
