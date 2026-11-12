'use strict';

const COMMITTING_PLUGINS = Object.freeze(['@semantic-release/git']);

function pluginName(entry) {
  return Array.isArray(entry) ? entry[0] : entry;
}

function committingPlugins(plugins = []) {
  return plugins.map(pluginName).filter((name) => COMMITTING_PLUGINS.includes(name));
}

function verifyConditions(_pluginConfig, { options }) {
  const offenders = committingPlugins(options?.plugins);
  if (offenders.length === 0) return;
  const error = new Error(`Release commits are not allowed: remove ${offenders.join(', ')} from the plugins`);
  error.name = 'SemanticReleaseError';
  error.code = 'ERELEASECOMMIT';
  error.semanticRelease = true;
  error.details =
    'A release is the tag alone. Stamp versions into Chart.yaml, package.json or other ' +
    'manifests in the workspace at package time, from the tag, and never commit them.';
  throw error;
}

module.exports = { verifyConditions, COMMITTING_PLUGINS };
