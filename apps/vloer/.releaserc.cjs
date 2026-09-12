'use strict';

const { makeConfig } = require('@webgrip/semantic-release-config');

const config = makeConfig({
  monorepo: true,
  manifest: 'helm',
  chartPath: 'ops/helm/de-vloer',
  prepareCmd: 'node scripts/release-prepare.mjs ${nextRelease.version}',
  extraAssets: ['package.json', 'package-lock.json', 'extensions/vscode/package.json', 'extensions/vscode/package-lock.json', 'extensions/vscode/CHANGELOG.md'],
});

config.tagFormat = 'vloer-v${version}';
module.exports = config;
