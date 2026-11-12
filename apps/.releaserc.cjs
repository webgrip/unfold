'use strict';

const onGitHub = process.env.UNFOLD_RELEASE_FORGE === 'github';
const { makeConfig, COMMIT_ANALYZER_PLUGIN } = require(onGitHub ? process.env.UNFOLD_RELEASE_CONFIG || require('node:path').join(__dirname, '../scripts/release-config') : '@webgrip/semantic-release-config');

const siteCommitsReleaseNothing = { scope: 'site', release: false };

function releaseRulesThatReachTheSiteVeto(rules) {
  const breakingStopsAtMinor = rules.map((rule) => (rule.breaking === true ? { ...rule, release: 'minor' } : rule));
  return [...breakingStopsAtMinor, siteCommitsReleaseNothing];
}

const config = makeConfig({ monorepo: { name: 'unfold' }, ...(onGitHub ? { draftRelease: true } : {}) });

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
