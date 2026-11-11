'use strict';

const onGitHub = process.env.UNFOLD_RELEASE_FORGE === 'github';
const { makeConfig } = require(
  onGitHub
    ? process.env.UNFOLD_RELEASE_CONFIG ||
        require('node:path').join(__dirname, '../../scripts/release-config')
    : '@webgrip/semantic-release-config',
);

module.exports = makeConfig({ monorepo: { name: 'unfold-site' } });
