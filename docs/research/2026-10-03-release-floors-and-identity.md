# Release floors, public Go history and repository identity, 3 October 2026

Status: research record, 2026-10-03, for VIK-1794 (handoff OPS-04). It is a read-only audit of what every Ploeg and Vloer release destination holds after the history rewrite and the move to `webgrip/unfold`. The remote reads were made against `development @ 77f2bda`; the candidate values use `25f0252`. Commit ids are the ones after the 2026-10-03 history rewrite unless a column says *pre-rewrite*. The [inventory](2026-10-03-release-floors-and-identity.json) holds every row behind the tables below.

## Verdict

* **Floors.** Every Ploeg and Vloer version up to `0.4.0-rc.34` is taken in at least one destination. Ploeg's withdrawn `1.0.0-rc.1` is also still published. The proposed first independent versions in [ADR-0018](../adr/adr-0018-ploeg-releases-on-its-own-schedule-behind-a-tested-contract-version.md), `0.5.0-rc.1` for both applications, are above every floor. That holds only while the joint train stays below `0.5.0`. Every `unfold-v` tag counts against both components, so [the floor check](#what-this-pull-request-changes) refuses a component version that a later joint release has taken once the component trains call it.
* **Public Go history.** `github.com/webgrip/ploeg` has 66 versions in the public module proxy. 35 of them download from the origin with the bytes the checksum database recorded. For 14 versions (`v0.3.0-rc.5` and every `v0.4.0-rc.*` export) the origin now serves different bytes, and a direct download fails with `SECURITY ERROR`. 17 versions exist only in the proxy because GitHub no longer has their tags. Downloads through the proxy are unaffected. `go get github.com/webgrip/ploeg@latest` resolves to `v0.2.0` from August, and the withdrawn `v1.0.0-rc.1` is the highest version.
* **Identity.** The canonical source is Forgejo `webgrip/unfold`, the mirror is GitHub `webgrip/unfold`, and the signing identity is the Actions OIDC claim `repository: webgrip/unfold`. Release scripts name that identity since `4637099`. Published metadata still names the deleted repositories, and the release preflight would stop at the deleted `webgrip/ploeg` and `webgrip/de-vloer` Forgejo repositories.

## What this pull request changes

* [scripts/release-floors.json](../../scripts/release-floors.json) records each component's floor, the versions above it that can never be used, and the tag prefixes that have carried it.
* The [release policy](../../scripts/release-policy.cjs) refuses a computed `unfold-v` version that is at or below either component's floor, or at or below any existing tag that carried Ploeg or Vloer. The tag check covers tags no longer reachable from `development`, so an orphaned release tag (the `glide-v0.4.0-rc.24` case) stops the release before semantic-release commits a duplicate release commit.
* Both [publishers](../../scripts/publish_release.py) refuse a version at or below its application's floor before they read a registry or the forge.
* The [preflight](../../scripts/release_preflight.py) requires the Forgejo and GitHub APIs to answer as `webgrip/unfold` itself, so a rename redirect does not pass. It accepts a retired name that is deleted or redirects, and refuses one that has been recreated with Actions enabled.
* The editor extension's homepage, repository, issue and Q&A links name `webgrip/unfold`.

The floors file never changes a published version. Raise a floor only with new audit evidence. Never lower one.

## Floors and the cutover boundary

| Component | Floor | Occupied above the floor | Highest version per destination |
| --- | --- | --- | --- |
| Ploeg | `0.4.0-rc.34` | `1.0.0-rc.1` (withdrawn on 2026-09-11, see Ploeg [ADR-0028](../../apps/ploeg/docs/adrs/0028-automatic-releases-stay-zero-major-candidates.md)) | source tag `unfold-v0.4.0-rc.34`; Harbor `ploegd` and `charts/ploeg` `0.4.0-rc.34` (deployed in the estate); GHCR `ploegd` and `charts/ploeg` and Forgejo `ploegd` `1.0.0-rc.1`, otherwise `0.4.0-rc.32`; Forgejo `charts/ploeg` `0.4.0-rc.32`; Go `v1.0.0-rc.1`, otherwise `v0.4.0-rc.32` |
| Vloer | `0.4.0-rc.34` | none | source tag `unfold-v0.4.0-rc.34`; GHCR and Forgejo `de-vloer`, `de-vloer-agent` and `charts/de-vloer` `0.4.0-rc.34`; Open VSX `webgrip/de-vloer` `0.4.0-rc.34` |

The cutover boundary is the first component release under OPS-05. It must come from release-engine channel state, be above both the floor and every existing tag that carried the component, and never alias an old version. Today a `ploeg-v` train would compute from `ploeg-v0.3.0-rc.7` and propose `0.3.0-rc.8`, whatever the commit type. The floor check refuses that, so OPS-05 needs channel state that starts above `0.4.0-rc.34` before it can cut a component release, and its trains must call `refuseOccupied` for their component the way the `unfold-v` policy calls it for both.

The site is outside these floors: its own `unfold-site-v` train ends at `0.1.0-rc.8` and publishes no registry artifact.

## Joint release completion

A release is *complete* here when Forgejo holds both applications' `release-artifacts-*.json` evidence. All registry digests in that evidence still match GHCR and Forgejo.

| Versions | State |
| --- | --- |
| `0.4.0-rc.8` to `rc.11`, `rc.14`, `rc.18` to `rc.21`, `rc.29` to `rc.32` | Complete: images, charts, Open VSX and Go module |
| `0.4.0-rc.1` to `rc.7` | Release page, VSIX and Open VSX; registry copies only for some images; no evidence |
| `0.4.0-rc.13`, `rc.28` | Vloer complete, Ploeg not distributed |
| `0.4.0-rc.12`, `rc.15` to `rc.17`, `rc.22` to `rc.25`, `rc.27` | Release page with at most the VSIX; `rc.15` also on Open VSX, `rc.15` and `rc.16` with one Forgejo image (off-site storage full or failed jobs) |
| `0.4.0-rc.26` | Tag only: Forgejo lost the release to the tag race and it was never created |
| `0.4.0-rc.33` | VSIX on Forgejo and Open VSX only; the agent image failed its CVE budget |
| `0.4.0-rc.34` | Vloer images and chart on GHCR and Forgejo (`de-vloer@sha256:fbe104efddff…`), VSIX on Open VSX, no Vloer evidence (the publisher hung on the old repository name); Ploeg only in Harbor |

GitHub `webgrip/unfold` and `webgrip/ploeg` were recreated on 2026-10-02 and hold no releases. The GitHub release copies that the evidence of `rc.8` to `rc.32` refers to were on the deleted `webgrip/glide` and no longer exist. Images built before the rewrite, up to `rc.32`, carry the pre-rewrite source commit in `org.opencontainers.image.revision` (`9a7bda3` for `rc.32`, now `888011d`); `rc.34` carries the current commit but the source label `https://github.com/webgrip/glide`. Published bytes cannot change, so the mapping below resolves them.

## Go module history

All downloads used an empty module cache, `GOSUMDB=sum.golang.org`, Go 1.27.1, and either `GOPROXY=https://proxy.golang.org` or `GOPROXY=direct`.

| Versions | Through the proxy | From the origin |
| --- | --- | --- |
| `v0.0.0` to `v0.2.0-rc.22`, `v0.2.0-rc.24` (35) | Verified | Same bytes as the checksum database |
| `v0.3.0-rc.5`, `v0.4.0-rc.8` to `rc.11`, `rc.14`, `rc.18` to `rc.21`, `rc.29` to `rc.32` (14) | Verified | **Stop**: checksum mismatch |
| `v0.2.0`, `v0.2.0-rc.23`, `rc.25` to `rc.31`, `v0.2.1-rc.1`, `v0.3.0-rc.1` to `rc.4`, `rc.6`, `rc.7`, `v1.0.0-rc.1` (17) | Verified | Unknown revision: GitHub refused to recreate these tags |

The 14 mismatched versions differ from their recorded bytes in 9 to 11 files: `.mailmap`, five `_test.go` files under `pkg/config`, `pkg/httpapi` and `pkg/worker`, four OpenSpec documents and one research note. No non-test Go source differs. For `v0.4.0-rc.32` the checksum database has `h1:g7VbZFYTSwX5NdZqhKEpGQNGja3nUsIh/BApPg5eLl4=` and the origin now gives `h1:dlSozq7OV4jTy2rs6vtehifvVUsw6L7p2xi9xC7A2Wk=`. `go list -m -retracted -versions` shows no retracted version.

### Export mapping

Each export is one commit whose tree is `apps/ploeg` at the source tag and whose parent is `05b93bb4` (the rewritten `ploeg-v0.3.0-rc.7`). Every current export's trailers and tree match its current source tag. The current exporter reproduces the `unfold-v` exports byte for byte. The `glide-v` exports keep their original `Glide release` author and trailers, so a re-export of those versions with today's script would be refused at the tag comparison.

| Version | Source tag | Source, pre-rewrite | Source, current | Export, pre-rewrite (proxy origin) | Export, current |
| --- | --- | --- | --- | --- | --- |
| `v0.4.0-rc.8` | `glide-v0.4.0-rc.8` | `b8b2f00` | `4a6267e` | `7642315` | `8894c9a` |
| `v0.4.0-rc.14` | `glide-v0.4.0-rc.14` | `6de34d0` | `3d46061` | `193ba48` | `69d227c` |
| `v0.4.0-rc.29` | `glide-v0.4.0-rc.29` | `043b9c2` | `ca6f289` | `08c30e6` | `09705d5` |
| `v0.4.0-rc.30` | `unfold-v0.4.0-rc.30` | `9512fc8` | `c456e08` | `33e810e` | `37244b4` |
| `v0.4.0-rc.31` | `unfold-v0.4.0-rc.31` | `c00ad7a` | `81da39a` | `25b56cf` | `d86f224` |
| `v0.4.0-rc.32` | `unfold-v0.4.0-rc.32` | `9a7bda3` | `888011d` | `ee056fa` | `d1f6b34` |

The inventory has every version, with full ids, the recorded `Sum` and `GoModSum`, and the files that differ. The audit also computed the candidate a `v0.5.0-rc.1` export of `25f0252` would produce: tree `bf15fda`, parent `05b93bb4`, `h1:qq8HtN99W8a9eK3g5fXvNuKLZdilPKQZeyEd2ebNWpU=` and `go.mod` `h1:iMLLEaBEXVLMDzDZVevMMpW+uKPPN+VoK0Z+QczKyHQ=`. These values change with every Ploeg commit. The audit's hash implementation matched `go mod download` for all 14 current exports.

## Identities

| Identity | Observed | Verdict |
| --- | --- | --- |
| Forgejo source | `GET /repos/webgrip/unfold` answers 200 as `webgrip/unfold`, `mirror: false`; `webgrip/glide` answers 301 to it; `webgrip/ploeg` and `webgrip/de-vloer` answer 404 | Canonical |
| GitHub mirror | `webgrip/unfold` answers 200, default branch `development`; `webgrip/glide` and `webgrip/de-vloer` answer 404. All 116 tags and every branch equal Forgejo's; the 111 release-channel notes stay on Forgejo | Canonical, in sync |
| Go module home | GitHub `webgrip/ploeg`, recreated 2026-10-02; `main` at `aa5a295` (`ploeg-v0.2.0`), `development` at `05b93bb4`, a `codex/ploeg-migration-review` branch and a `withdrawn-v1.0.0-rc.1` tag | Module path unchanged |
| Signing | The `rc.34` [Ploeg signing job](https://forgejo.webgrip.dev/webgrip/unfold/actions/runs/750) printed `"repository":"webgrip/unfold","event_name":"release","workflow":"on_release_published.yml","aud":"openbao-cosign"` and signed | Canonical claim, not a redirect |
| OpenBao signing role | The estate's desired state binds `repository` to `webgrip/infrastructure`, `webgrip/ploeg`, `webgrip/de-vloer`, `webgrip/glide`, `webgrip/unfold` and two other repositories | Three retired names can still mint a signing token if a repository with that name is created |
| Release scripts | `publish_release.py`, `release_preflight.py`, `release_registry.py`, image labels and chart metadata name `webgrip/unfold` | Correct since `4637099` |
| Release preflight | It read the deleted `webgrip/ploeg` and `webgrip/de-vloer` and raised on any error, including 404 | No preview has run since the deletions; the next one would have stopped there. Fixed here |
| Editor extension | Homepage, repository, issues and Q&A pointed at the deleted `webgrip/de-vloer`, on every published VSIX | Fixed for the next version; its README links also still point there |
| Docs site | `mkdocs.yml`, `scripts/docs.py` and the docs bucket use `webgrip/glide` and `docs-glide` | Redirects work; rename is listed in ADR-0013's coordinated step |
| Site package | `apps/site/package.json` names `webgrip/glide` as its repository | Private and never published; left for the site's own change |

## Stops and forward-only remediation

Nothing below may be fixed by moving a tag, force-pushing, republishing changed bytes or bypassing a checksum.

1. **The 14 mismatched Go versions are stopped.** Never export, re-tag or republish them. Users who go through the proxy keep getting the recorded bytes; users with `GOPROXY=direct` or a private-module setting get a checksum error. Owner decision: leave the origin tags in place and document it, or delete those 14 GitHub tags so direct downloads fail as "unknown revision" like the 17 proxy-only versions. Neither changes a recorded checksum.
2. **`v1.0.0-rc.1` stays the highest Ploeg version** in the Go proxy, GHCR (`ploegd@sha256:abf044687012…`, `charts/ploeg@sha256:b8b67baf91a8…`) and Forgejo (`ploegd`). Tools that sort versions will rank it above every `0.x` release. The floors file marks it as never reusable. Owner decision: keep it and document it, or delete the registry versions. Go cannot drop it; a `retract` only takes effect from a release version above every other version, which the zero-major policy forbids.
3. **`@latest` is `v0.2.0`.** Release candidates never become `latest`, so consumers must pin a version. Changing this needs a stable Ploeg release, which needs an owner-approved change to ADR-0028.
4. **Partial releases stay as they are.** `rc.33` and `rc.34` reached only part of their destinations; the next release is a new version, not a repair of these. `rc.26` remains a tag without a release.
5. **Retired names in the signing role** (`webgrip/glide`, `webgrip/ploeg`, `webgrip/de-vloer`) should be removed in `webgrip/homelab-cluster` in a separate change. The preflight now refuses a recreated retired repository with Actions enabled, but only the role binding removes the risk.

## Reproduce

A second reviewer can repeat one stopped version from scratch:

```sh
export GOMODCACHE="$(mktemp -d)" GOFLAGS=-modcacherw GOSUMDB=sum.golang.org GONOSUMDB= GOPRIVATE=
GOPROXY=https://proxy.golang.org go mod download -json github.com/webgrip/ploeg@v0.4.0-rc.32   # Sum h1:g7Vb…
GOPROXY=direct go mod download -json github.com/webgrip/ploeg@v0.4.0-rc.32                     # checksum mismatch, downloaded h1:dlSo…
```

The other reads were `git ls-remote` against both forges and the module home, unauthenticated Forgejo and GitHub REST reads, anonymous `tags/list` and manifest reads on GHCR and Forgejo, the Open VSX API, and the proxy's `list`, `.info` and `@latest` plus `sum.golang.org/lookup` for every version.

## Not checked

* Harbor's tags and digests: it needs credentials. The estate's desired state pins Harbor `ploegd@sha256:b7881db70505…`, `charts/ploeg`, `de-vloer@sha256:fbe104efddff…` and `charts/de-vloer@sha256:8a7c71818264…` at `0.4.0-rc.34`, so Harbor holds Ploeg `rc.34` although GHCR and Forgejo do not.
* Forgejo package-to-repository links, the push-mirror configuration and GitHub immutable-release or ruleset settings: they need a token.
* The live OpenBao role: only the estate's desired state was read.
* `UNFOLD_RELEASE_HISTORY=true` against the real tags: the worktree's Git directory is not inside the release container's mount. CI can run it from a full clone.
