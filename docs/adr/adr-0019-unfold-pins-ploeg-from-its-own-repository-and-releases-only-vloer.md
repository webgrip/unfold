---
status: accepted
date: 2026-10-03
decision-makers: Ryan Grippeling
---

# Unfold pins Ploeg from its own repository and releases only Vloer

## Context and Problem Statement

[ADR-0001](adr-0001-unfold-contains-independent-applications.md) put Vloer and Ploeg in this repository, and [ADR-0004](adr-0004-unfold-releases-one-version.md) released them under one `unfold-v…` version. An Unfold release built and signed `ploegd`, published the Ploeg chart, and exported Ploeg as the Go module `github.com/webgrip/ploeg`.

On 2026-10-03 the owner approved moving Ploeg to its own project, [github.com/ploeg-hq/ploeg](https://github.com/ploeg-hq/ploeg) ([webgrip/unfold#1](https://github.com/webgrip/unfold/issues/1)). Its fresh root commit `88cce444` was extracted from Unfold `9c1d53f`. Its module is `github.com/ploeg-hq/ploeg`, its releases start at `v0.1.0`, GitHub Actions publishes them, and Forgejo keeps a one-way pull mirror. Ploeg ADR-0062 and ADR-0063 record the upstream side.

Unfold still needs Ploeg: Vloer runs managed work only through it ([ADR-0002](adr-0002-ploeg-is-the-only-engine.md)), and the managed qualification and the unified demo run real Ploeg code. How does Unfold keep testing Vloer against Ploeg without a second copy of Ploeg's source or a second publisher of Ploeg's artifacts?

## Decision Drivers

* Ploeg has one source, one backlog and one release authority: `ploeg-hq/ploeg` and its GitHub Actions.
* Unfold tests the exact Ploeg it runs with.
* A fresh clone works with public access only: no sibling checkout and no GitHub credential.
* Vloer, extension and site releases keep their version history, floors and identities.
* Existing paths under `apps/ploeg` keep working for the qualification, the unified demo and the documentation.

## Considered Options

* A Git submodule at `apps/ploeg`, pinned to a commit on Ploeg's `main`
* A vendored copy kept in sync with upstream
* Released Ploeg artifacts and the Go module only, with no source checkout

## Decision Outcome

Chosen option: "A Git submodule at `apps/ploeg`, pinned to a commit on Ploeg's `main`", because it keeps one source of truth, gives every Unfold commit a reproducible Ploeg, and keeps the paths the qualification, the unified demo and the documentation already use.

* `apps/ploeg` is a gitlink (mode `160000`) to `https://github.com/ploeg-hq/ploeg.git`. The first pin is `v0.1.0`, commit `87f8dc45a0ea768c6ab95196d8b99d481df10c65`. `mise run setup`, the CI checkouts and the documentation builds initialise it.
* [scripts/ploeg-pin.mjs](../../scripts/ploeg-pin.mjs) refuses vendored source, another repository, and an uninitialised or modified checkout; `mise run verify` runs it. The `ploeg-pin` CI job also requires the pinned commit to be on Ploeg's `main`, and the Unfold release waits for that job.
* A Ploeg change lands upstream first. Unfold then moves the pin in a commit scoped `ploeg`, for example `build(ploeg): pin ploeg-hq/ploeg v0.1.1`. [apps/.releaserc.cjs](../../apps/.releaserc.cjs) never releases a commit scoped `ploeg`. A Vloer change that needs the new Ploeg is a separate commit with its own scope.
* `mise run verify` runs Ploeg's own `scripts/verify.sh` at the pin, compiles the unified demo helper against it, and runs the managed qualification with the pinned Ploeg and this Vloer. The verify cache keys those gates on the pinned commit.
* The `unfold-v…` train versions Vloer only. Unfold no longer builds, signs or publishes `ploegd`, the Ploeg chart or a Go module. [scripts/publish_release.py](../../scripts/publish_release.py) refuses `ploeg` before any Git, network or file access, and the Vloer publisher takes the GitHub release out of draft itself.
* Earlier Ploeg versions stay published and recorded. [scripts/release-floors.json](../../scripts/release-floors.json) keeps Ploeg's floor and its withdrawn `1.0.0-rc.1`, marks the component retired with `0.4.0-rc.35` as the last version Unfold published, and refuses any train that versions it. `github.com/webgrip/ploeg` keeps the old module versions.
* Unfold's documentation site still renders Ploeg's documentation from the pinned commit. Unfold no longer regenerates or validates Ploeg's generated pages or decision ledger; Ploeg's own `mise run docs-check` does. Links into Ploeg's source point at GitHub at the pinned commit.
* Production adopts the `ghcr.io/ploeg-hq` artifacts in a separate `homelab-cluster` change. This decision changes no deployment.

### Consequences

* Good, because Ploeg has one source and one publisher, and Unfold cannot drift from it unnoticed.
* Good, because every Unfold commit names the Ploeg it was tested with, and a fresh clone reproduces it.
* Good, because a Vloer release no longer republishes an unchanged Ploeg, and a Ploeg fix no longer waits for a Vloer release.
* Bad, because a change that crosses both projects becomes two pull requests: Ploeg first, then the Unfold pin with the Vloer change.
* Bad, because a clone without the submodule fails the pin check and the documentation build. Both name `git submodule update --init --recursive`.
* Bad, because only the pinned pair is tested. Runtime contract discovery and compatibility across versions remain the proposal in [ADR-0018](adr-0018-ploeg-releases-on-its-own-schedule-behind-a-tested-contract-version.md).

### Confirmation

* `node scripts/ploeg-pin.mjs` runs in `mise run verify`; `node scripts/ploeg-pin.mjs --published` is the `ploeg-pin` CI job.
* [scripts/workflow-policy.test.cjs](../../scripts/workflow-policy.test.cjs) fails when a release job builds or publishes Ploeg, when a verify, documentation or demo checkout skips the submodule, or when the release stops waiting for `ploeg-pin`.
* [scripts/test_release_floors.py](../../scripts/test_release_floors.py), [scripts/release-floors.test.cjs](../../scripts/release-floors.test.cjs) and [scripts/test_release_distribution.py](../../scripts/test_release_distribution.py) fail when the train versions Ploeg, when Ploeg's record disappears, or when the Ploeg publisher reaches Git, the network or a file.
* [scripts/release-isolation.test.cjs](../../scripts/release-isolation.test.cjs) fails when a commit scoped `ploeg` releases Unfold.
* [scripts/docs-rules.test.py](../../scripts/docs-rules.test.py) fails when a Ploeg page counts as an orphan or must carry Unfold's front matter.

## Pros and Cons of the Options

### A vendored copy kept in sync with upstream

* Good, because a plain clone contains everything.
* Bad, because it keeps a second writable copy of Ploeg, the drift the separation removes, and every sync is a large diff.

### Released Ploeg artifacts and the Go module only, with no source checkout

* Good, because it is how other consumers will use Ploeg.
* Bad, because the managed qualification and the unified demo build Ploeg's handlers and test helpers from source, and Ploeg's documentation would leave Unfold's site.
* Neutral, because Unfold can move to artifacts later; the submodule keeps the path stable until then.

## More Information

* 2026-10-03 — The owner approved the separation ([webgrip/unfold#1](https://github.com/webgrip/unfold/issues/1)) and the consumer cutover ([webgrip/unfold#2](https://github.com/webgrip/unfold/issues/2)). Changes made in Unfold after the extraction are reconciled upstream in [ploeg-hq/ploeg#45](https://github.com/ploeg-hq/ploeg/issues/45).
* Supersedes [ADR-0004](adr-0004-unfold-releases-one-version.md). These parts of it stay: the zero-major candidate policy, the `glide-v0.3.0` baseline, Forgejo-only release-channel notes, and Vloer's artifact names.
* Refines [ADR-0001](adr-0001-unfold-contains-independent-applications.md): Vloer and Ploeg stay independently deployable, and Ploeg's source is a pinned reference.
* 2026-10-04 — Unfold's documentation build stops applying its own checks to Ploeg's pages. The links, anchors, nav reachability and front matter of `ploeg/` pages belong to Ploeg's `mise run docs-check`, and a link that does not resolve in a Ploeg page points at the pinned file on GitHub instead of failing the build. The nav names only Ploeg's overview, runbook index and configuration reference, and lychee and Vale skip `apps/ploeg/docs`. Unfold's own pages, the combined glossary and the decision register still read Ploeg's files at the pin, so a pin move that changes Ploeg's domain model or ADR ledger also runs `mise run domain` and `mise run docs-decisions`.
* Overtakes sections 1 and 5 of [ADR-0018](adr-0018-ploeg-releases-on-its-own-schedule-behind-a-tested-contract-version.md), which split the train inside this repository. Its contract version, bundles and cross-version qualification remain proposed.
