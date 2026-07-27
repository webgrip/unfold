'use strict';

// Ploeg ships an app (ploegd image) + its Helm chart on ONE v* train (Go modules need the
// v-prefix). manifest:'helm' bumps ops/helm/ploeg/Chart.yaml `.version` AND `.appVersion`
// in lockstep (shared-config ≥1.1.0, dependency-free node — the old yq prepareCmd here
// failed the 2026-07-26 release: yq wasn't on the runner). The image is built separately
// by on_release_published.
const { makeConfig } = require('@webgrip/semantic-release-config');

module.exports = makeConfig({
  manifest: 'helm',
  chartPath: 'ops/helm/ploeg',
});
