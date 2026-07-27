## [0.2.0-rc.3](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.2...v0.2.0-rc.3) (2026-07-27)

## [0.2.0-rc.2](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.1...v0.2.0-rc.2) (2026-07-27)

## [0.2.0-rc.1](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0...v0.2.0-rc.1) (2026-07-27)

## [1.0.0-rc.1](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0...v1.0.0-rc.1) (2026-07-26)

### ⚠ BREAKING CHANGES

* **deps:** Update postgres Docker tag ( 17 ➔ 18 )

### Added

* **deps:** update docker.io/golang docker tag ( 1.24 ➔ 1.26 ) ([999eda8](https://forgejo.webgrip.dev/webgrip/ploeg/commit/999eda8942e83d47c31d8144171fbb4fc511417d))
* **deps:** Update postgres Docker tag ( 17 ➔ 18 ) ([41cba65](https://forgejo.webgrip.dev/webgrip/ploeg/commit/41cba65819694ce00ed58ae7c0e764eada76d4c4))

### Fixed

* assignment webhooks revive finished work items ([30558e5](https://forgejo.webgrip.dev/webgrip/ploeg/commit/30558e5f3ff032c161d41665ae5b121f32764284))
* **ci:** adopt the shared forgejo-distribute reusable for the Forgejo mirror ([5d524a9](https://forgejo.webgrip.dev/webgrip/ploeg/commit/5d524a9b5cd57cd28eadf1d2858e035187fc242d))
* **ci:** mirror image and chart to the Forgejo registry and link them to the repo ([0ad0ced](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0ad0ced79b82c4092c5c7e0280af6f6fad131e33))
* **ci:** release and publish as the webgrip-ci bot, not the per-job token ([8a5a994](https://forgejo.webgrip.dev/webgrip/ploeg/commit/8a5a994c05228017e363da8e446a5ac1231f72e1))
* **deps:** update harbor.webgrip.dev/webgrip/agent-runner docker tag ( 1.0.1 ➔ 1.0.2 ) ([2cfdc01](https://forgejo.webgrip.dev/webgrip/ploeg/commit/2cfdc01c767ff5cf9d8c87a54a210d00d3160839))
* Guaranteed QoS for every factory pod — out of the OOMController's kill zone ([cbde89d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/cbde89d4625a0e55a95673646e3a16d9caff67c2))
* ploeg-worker owns the per-run LiteLLM key lifecycle (mint + always-revoke) ([450ec5f](https://forgejo.webgrip.dev/webgrip/ploeg/commit/450ec5f67f821e24e7e8b20a0ea6c56d9bb7f7de))
* worker owns the per-run LiteLLM key lifecycle (mint + always-revoke) ([1edb4af](https://forgejo.webgrip.dev/webgrip/ploeg/commit/1edb4af494130c06450763dfd288d9cb283cd951))
* worker targets a configurable base branch end to end ([18f80de](https://forgejo.webgrip.dev/webgrip/ploeg/commit/18f80de7314e11df8521f3eb5897f17924fa273c)), closes [#6](https://forgejo.webgrip.dev/webgrip/ploeg/issues/6)

### CI

* **actions:** Pin dependencies ([27ddc29](https://forgejo.webgrip.dev/webgrip/ploeg/commit/27ddc2964426da2ef01581c22fa9893ac59c6e28))
* **actions:** Update dependency helm ( v3.18.4 ➔ v4.2.3 ) ([c72b289](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c72b289ef7a09a304151a037d0e2fa52bbbb17d0))
* **actions:** Update https://github.com/actions/setup-go action ( v6.5.0 ➔ v7.0.0 ) ([6a97b93](https://forgejo.webgrip.dev/webgrip/ploeg/commit/6a97b93da496e36927dc94b4fd11c1215935329d))
* adopt @webgrip/semantic-release-config ([ab021b7](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ab021b7ec1cfd72fd36b1f50e0a2427a6b528b00))
* drop the manual release dispatch — bot-cut releases fire the release event natively ([ffa5158](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ffa515890c296161ca9eb782458688f4ec0bbae5))
* **release:** drop the local semantic-release toolchain — the shared config pins it ([faad578](https://forgejo.webgrip.dev/webgrip/ploeg/commit/faad5783e5010f438c7785bc98ce078b34c4227b))
* retrigger release train (rc release died on missing yq, now fixed) ([4dcbf12](https://forgejo.webgrip.dev/webgrip/ploeg/commit/4dcbf129442e945804d7a8588236f8cc7a17a83f))

### Internal

* **release:** v0.1.0-rc.5 [skip ci] ([ec87f95](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ec87f950ecd8e9df2708457fc7ab8aebdac3912e))
* **release:** v0.1.0-rc.6 [skip ci] ([e54e015](https://forgejo.webgrip.dev/webgrip/ploeg/commit/e54e015a37125af130e6e0d59156d3242664de32))
* **release:** v0.1.0-rc.7 [skip ci] ([5191286](https://forgejo.webgrip.dev/webgrip/ploeg/commit/51912865704ce97db6c044e946976650b5893026))
* **release:** v0.1.0-rc.8 [skip ci] ([de8c498](https://forgejo.webgrip.dev/webgrip/ploeg/commit/de8c4988e0a887ccc9c9cf5cdfe7ae949a94c281))
* **release:** v0.1.0-rc.9 [skip ci] ([4e84645](https://forgejo.webgrip.dev/webgrip/ploeg/commit/4e84645a92538895650f912037e67da23cf54252))
* **release:** v1.0.0-rc.1 [skip ci] ([08963a6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/08963a652cd09a24396549ecf04dc213c8746e48))

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
