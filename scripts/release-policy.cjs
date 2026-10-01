'use strict';

function verifyConditions(_pluginConfig, { branch, options }) {
  if (branch?.name !== 'development' || branch.type !== 'prerelease' || branch.prerelease !== 'rc' || branch.channel !== 'development') {
    throw new Error('Unfold automatically releases only development release candidates. Stable promotion requires an explicit human-approved release-policy change.');
  }
  if (options?.tagFormat !== 'unfold-v${version}') {
    throw new Error('Unfold release tags must use unfold-v${version}.');
  }
}

function verifyRelease(pluginConfig, context) {
  verifyConditions(pluginConfig, context);
  const release = context.nextRelease;
  if (!release || typeof release.version !== 'string' || !/^0\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-rc\.[1-9][0-9]*$/.test(release.version)) {
    throw new Error('Unfold automatically releases only 0.x.y-rc.N versions. Version 1.x and stable releases require an explicit human-approved release-policy change.');
  }
  if (release.channel !== 'development' || release.gitTag !== `unfold-v${release.version}`) {
    throw new Error('Unfold release version, development channel and unfold-v-prefixed tag must agree.');
  }
}

module.exports = { verifyConditions, verifyRelease };
