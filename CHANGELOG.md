## [1.0.0-rc.1](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.9...v1.0.0-rc.1) (2026-07-26)

### ⚠ BREAKING CHANGES

* **deps:** Update postgres Docker tag ( 17 ➔ 18 )

### Added

* **deps:** Update postgres Docker tag ( 17 ➔ 18 ) ([41cba65](https://forgejo.webgrip.dev/webgrip/ploeg/commit/41cba65819694ce00ed58ae7c0e764eada76d4c4))

### Fixed

* **deps:** update harbor.webgrip.dev/webgrip/agent-runner docker tag ( 1.0.1 ➔ 1.0.2 ) ([2cfdc01](https://forgejo.webgrip.dev/webgrip/ploeg/commit/2cfdc01c767ff5cf9d8c87a54a210d00d3160839))
* worker owns the per-run LiteLLM key lifecycle (mint + always-revoke) ([1edb4af](https://forgejo.webgrip.dev/webgrip/ploeg/commit/1edb4af494130c06450763dfd288d9cb283cd951))

## [0.1.0-rc.9](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.8...v0.1.0-rc.9) (2026-07-26)

### Fixed

* **ci:** release and publish as the webgrip-ci bot, not the per-job token ([8a5a994](https://forgejo.webgrip.dev/webgrip/ploeg/commit/8a5a994c05228017e363da8e446a5ac1231f72e1))

## [0.1.0-rc.8](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.7...v0.1.0-rc.8) (2026-07-25)

### Fixed

* **ci:** mirror image and chart to the Forgejo registry and link them to the repo ([0ad0ced](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0ad0ced79b82c4092c5c7e0280af6f6fad131e33))

## [0.1.0-rc.7](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.6...v0.1.0-rc.7) (2026-07-25)

### Fixed

* ploeg-worker owns the per-run LiteLLM key lifecycle (mint + always-revoke) ([450ec5f](https://forgejo.webgrip.dev/webgrip/ploeg/commit/450ec5f67f821e24e7e8b20a0ea6c56d9bb7f7de))

## [0.1.0-rc.6](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.5...v0.1.0-rc.6) (2026-07-25)

### Fixed

* Guaranteed QoS for every factory pod — out of the OOMController's kill zone ([cbde89d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/cbde89d4625a0e55a95673646e3a16d9caff67c2))

## [0.1.0-rc.5](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.4...v0.1.0-rc.5) (2026-07-25)

### Fixed

* assignment webhooks revive finished work items ([30558e5](https://forgejo.webgrip.dev/webgrip/ploeg/commit/30558e5f3ff032c161d41665ae5b121f32764284))
* worker targets a configurable base branch end to end ([18f80de](https://forgejo.webgrip.dev/webgrip/ploeg/commit/18f80de7314e11df8521f3eb5897f17924fa273c)), closes [#6](https://forgejo.webgrip.dev/webgrip/ploeg/issues/6)

### Docs

* AGENTS.md + team-silver repo skill — make the repo factory-workable ([c7fbfc9](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c7fbfc97335076701dbf0a307808489f3dd4839f))

## [0.1.0](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.0.0...v0.1.0) (2026-07-25)

### Added

* **executor:** OpenHands worker, Helm chart, and chart publishing ([f0956b6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/f0956b6e1accc2b43ba09e849a98532ff8b8c2bc))
* **ploegd:** working dispatch-plane prototype — ingest, leases, run API ([7b69724](https://forgejo.webgrip.dev/webgrip/ploeg/commit/7b69724cf0ccbbe8a2b35e224a53f8d3ff084c38)), closes [#31](https://forgejo.webgrip.dev/webgrip/ploeg/issues/31) [#49](https://forgejo.webgrip.dev/webgrip/ploeg/issues/49)
* **work:** align WorkItem with domain model — needs_human state, origin, priority ([b71f2b7](https://forgejo.webgrip.dev/webgrip/ploeg/commit/b71f2b76062ca72c83ed7cfa32c9d4ccd9169e1b)), closes [#12](https://forgejo.webgrip.dev/webgrip/ploeg/issues/12)

### Fixed

* **chart:** default the KEDA scaler host to a namespace-qualified FQDN ([31f81e9](https://forgejo.webgrip.dev/webgrip/ploeg/commit/31f81e9af716906a87e5c98c63a13c814b97f72b))
* never lose a run's outcome to the links constraint ([3b1f5c8](https://forgejo.webgrip.dev/webgrip/ploeg/commit/3b1f5c89003bc9df5983c1c432e172b15340b940))
* **ploegd:** retry database connectivity at startup instead of crash-looping ([02877cf](https://forgejo.webgrip.dev/webgrip/ploeg/commit/02877cf28d4387646e229b38bad399848fbd512d))
* **release:** pin notes toolchain so release notes render sections ([7feecd6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/7feecd6476fbe6984feeae0c56a7da873984c7e9))

## [0.1.0-rc.4](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.3...v0.1.0-rc.4) (2026-07-24)

### Fixed

* **chart:** default the KEDA scaler host to a namespace-qualified FQDN ([31f81e9](https://forgejo.webgrip.dev/webgrip/ploeg/commit/31f81e9af716906a87e5c98c63a13c814b97f72b))
* never lose a run's outcome to the links constraint ([3b1f5c8](https://forgejo.webgrip.dev/webgrip/ploeg/commit/3b1f5c89003bc9df5983c1c432e172b15340b940))
* **ploegd:** retry database connectivity at startup instead of crash-looping ([02877cf](https://forgejo.webgrip.dev/webgrip/ploeg/commit/02877cf28d4387646e229b38bad399848fbd512d))

## [0.1.0-rc.3](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.2...v0.1.0-rc.3) (2026-07-23)

### Added

* **executor:** OpenHands worker, Helm chart, and chart publishing ([f0956b6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/f0956b6e1accc2b43ba09e849a98532ff8b8c2bc))

## [0.1.0-rc.2](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.1...v0.1.0-rc.2) (2026-07-23)

### Added

* **ploegd:** working dispatch-plane prototype — ingest, leases, run API ([7b69724](https://forgejo.webgrip.dev/webgrip/ploeg/commit/7b69724cf0ccbbe8a2b35e224a53f8d3ff084c38)), closes [#31](https://forgejo.webgrip.dev/webgrip/ploeg/issues/31) [#49](https://forgejo.webgrip.dev/webgrip/ploeg/issues/49)

### Fixed

* **release:** pin notes toolchain so release notes render sections ([7feecd6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/7feecd6476fbe6984feeae0c56a7da873984c7e9))

## [0.1.0-rc.1](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.0.0...v0.1.0-rc.1) (2026-07-23)
