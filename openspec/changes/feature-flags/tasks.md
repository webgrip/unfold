# Tasks — feature-flags

## 1. Decisions

- [x] 1.1 Application ADR 0043 (proposed) with its index row
- [ ] 1.2 The owner accepts or rejects ADR 0043 (VIK-2042)

## 2. Unfold application

- [x] 2.1 Flag registry, flagd evaluator behind OpenFeature's interface, watched flag file, configuration `flags`
- [x] 2.2 `/api/bootstrap` flag values, `/api/flags` Labs routes, `/api/admin/flags` with overrides and audit trail
- [x] 2.3 Settings › Labs page
- [x] 2.4 `flag.exposed` product event
- [x] 2.5 Lifecycle checks in `npm run check`
- [x] 2.6 Helm `featureFlags` ConfigMap, mounted and watched
- [x] 2.7 `work.flight-profile`: the flight profile on the Work Item page, with tests for every route shape
- [x] 2.8 Operations guide, API contract, chart README
- [x] 2.9 flagd's integer bucketing; rollouts authored in Unfold (segments, splits, windows, ramps, prerequisites) compiled to flagd and exportable
- [x] 2.10 OFREP client provider with first-match and first-successful strategies; OFREP endpoints for clients
- [x] 2.11 Experiment readout from `flag.exposed` and `flag.tracked`; settled-flag hint

## 3. Cluster (Homelab Roadmap, not this repository)

- [ ] 3.1 Decide whether to roll `work.flight-profile` out on the homelab through `featureFlags` (owner)

## 4. Gates

- [ ] 4.1 `mise run verify` and `mise run docs-check` pasted in the pull request
