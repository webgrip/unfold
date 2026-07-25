## [0.1.0-rc.6](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.5...v0.1.0-rc.6) (2026-07-25)

### Fixed

* Guaranteed QoS for every factory pod — out of the OOMController's kill zone ([cbde89d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/cbde89d4625a0e55a95673646e3a16d9caff67c2))

## [0.1.0-rc.5](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.4...v0.1.0-rc.5) (2026-07-25)

### Fixed

* assignment webhooks revive finished work items ([30558e5](https://forgejo.webgrip.dev/webgrip/ploeg/commit/30558e5f3ff032c161d41665ae5b121f32764284))
* worker targets a configurable base branch end to end ([18f80de](https://forgejo.webgrip.dev/webgrip/ploeg/commit/18f80de7314e11df8521f3eb5897f17924fa273c)), closes [#6](https://forgejo.webgrip.dev/webgrip/ploeg/issues/6)

### Docs

* AGENTS.md + team-silver repo skill — make the repo factory-workable ([c7fbfc9](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c7fbfc97335076701dbf0a307808489f3dd4839f))

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
