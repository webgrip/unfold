'use strict';

const { makeConfig, COMMIT_ANALYZER_PLUGIN } = require('@webgrip/semantic-release-config');

const siteCommitsReleaseNothing = { scope: 'site', release: false };

function releaseRulesThatReachTheSiteVeto(rules) {
  const breakingStopsAtMinor = rules.map((rule) => (rule.breaking === true ? { ...rule, release: 'minor' } : rule));
  return [...breakingStopsAtMinor, siteCommitsReleaseNothing];
}

const config = makeConfig({ monorepo: { name: 'unfold' } });

const analyzers = config.plugins.filter((plugin) => Array.isArray(plugin) && plugin[0] === COMMIT_ANALYZER_PLUGIN);
if (analyzers.length !== 1 || !Array.isArray(analyzers[0][1]?.releaseRules)) {
  throw new Error('Unfold release policy requires one configured commit analyzer.');
}
const analyzer = analyzers[0][1];
analyzer.releaseRules = releaseRulesThatReachTheSiteVeto(analyzer.releaseRules);
if (analyzer.releaseRules.some((rule) => rule.release === 'major')) {
  throw new Error('Unfold release policy rejects major release rules, which would end the analysis before the site veto.');
}
config.plugins.unshift(require.resolve('../scripts/release-policy.cjs'));

module.exports = config;
