'use strict';

// Ploeg ships an app (ploegd image) + its Helm chart on ONE v* train (Go modules need the
// v-prefix). manifest:'helm' bumps ops/helm/ploeg/Chart.yaml `.version` (built-in), and the
// prepareCmd bumps `.appVersion` in lockstep — matching the previous semantic-release-helm3 setup.
// The image is built separately by on_release_published. Replaces the hand-written .releaserc.js.
const { makeConfig } = require('@webgrip/semantic-release-config');

module.exports = makeConfig({
  manifest: 'helm',
  chartPath: 'ops/helm/ploeg',
  prepareCmd: 'yq -i \'.appVersion = "${nextRelease.version}"\' ops/helm/ploeg/Chart.yaml',
});
