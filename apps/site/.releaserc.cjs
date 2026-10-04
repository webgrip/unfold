'use strict';

const { makeConfig } = require('@webgrip/semantic-release-config');

const config = makeConfig({ monorepo: true });
config.tagFormat = 'unfold-site-v${version}';

module.exports = config;
