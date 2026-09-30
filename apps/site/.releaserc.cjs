'use strict';

const { makeConfig } = require('@webgrip/semantic-release-config');

const config = makeConfig({ monorepo: true });
config.tagFormat = 'glide-site-v${version}';

module.exports = config;
