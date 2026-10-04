---
status: superseded by ADR-0019
date: 2026-10-03
decision-makers: Ryan Grippeling
---

# Unfold releases Vloer and Ploeg under one version

## Context and Problem Statement

[ADR-0001](adr-0001-unfold-contains-independent-applications.md) kept a release version per application: `vloer-v…` and `ploeg-v…` tags, two semantic-release jobs and two publication routes. That fitted two products that could run apart. [ADR-0002](adr-0002-ploeg-is-the-only-engine.md) removed that case: Vloer runs real work only through Ploeg, and the owner is Unfold's only adopter. Contract changes already land in one commit across both applications. Two versions still had to be released in sequence, previewed separately and kept on separate release-channel notes, and none of that told anyone which Vloer works with which Ploeg. Should Unfold keep a version per application?

## Decision Drivers

* Every commit already builds and tests both applications together; a release should name that pair.
* One loop to operate: fewer release jobs, previews and notes to keep correct.
* Keep every published identity: image, chart, extension and Go module names, and the zero-major candidate policy.
* The first Unfold release must not reuse or go below an already published version.

## Considered Options

* One Unfold version for both applications
* Keep a version per application

## Decision Outcome

Chosen option: "One Unfold version for both applications", because the applications no longer ship apart and a single version removes the bookkeeping that kept breaking.

* One semantic-release train, configured in [apps/.releaserc.cjs](../../apps/.releaserc.cjs), runs with `package-path: apps` and `package-name: unfold`. Only commits that touch `apps/` count. Tags are `unfold-v<version>`.
* [scripts/release-policy.cjs](../../scripts/release-policy.cjs) keeps the zero-major candidate policy of Ploeg [ADR-0028](../../apps/ploeg/docs/adrs/0028-automatic-releases-stay-zero-major-candidates.md) for both applications: a breaking change raises the minor version, and only `0.x.y-rc.N` from `development` is released.
* [scripts/release-prepare.mjs](../../scripts/release-prepare.mjs) sets both charts, Vloer's package manifests and the extension to the same version. The notes go to `apps/CHANGELOG.md`; the application changelogs stay as history.
* A `unfold-v…` release publishes both applications' images, charts, extension and Go module export. Artifact names and paths do not change.
* The annotated tag `glide-v0.3.0` at `0092618` marks where the last Vloer (`vloer-v0.3.0-rc.16`) and Ploeg (`ploeg-v0.3.0-rc.7`) candidates met. It is a baseline, not a release. The first Unfold candidate is `0.4.0-rc.1`, above every version either application has published.
* Release-channel notes stay on Forgejo only. The GitHub notes mirror is removed, and the preflight compares branches and tags.

### Consequences

* Good, because one tag names the Vloer and Ploeg that were built and tested together.
* Good, because one release job, one preview and one set of release-channel notes replace two of each.
* Bad, because an application with no changes still gets a new version when the other one changes.
* Bad, because historical `vloer-v…` and `ploeg-v…` tags and notes remain for reference and the import verifier, next to the new `unfold-v…` train.

### Confirmation

`mise run release-check` runs [the policy suite](../../scripts/release-policy.test.cjs), [release isolation](../../scripts/release-isolation.test.cjs) and [workflow routing](../../scripts/workflow-policy.test.cjs) in the pinned release toolchain. With `UNFOLD_RELEASE_HISTORY=true`, the policy suite computes `glide-v0.3.0` → `glide-v0.4.0-rc.1` from the actual history. The release preview reports one Unfold version.

## Pros and Cons of the Options

### Keep a version per application

* Good, because an application without changes keeps its version.
* Bad, because nobody runs the two applications at different versions, so a compatibility matrix between them is pure overhead.
* Bad, because two release jobs push version commits to the same branch and must run one after the other.

## More Information

* Supersedes the separate release versions in [ADR-0001](adr-0001-unfold-contains-independent-applications.md). Two independently deployable applications remain.
* 2026-09-27 — The owner chose one Unfold version after the [notes loss](../research/2026-09-23-forgejo-notes-loss.md) happened again and before the first Unfold release.
* Refined by [ADR-0012](adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md): the marketing site in `apps/site` has its own `unfold-site-v…` train and is not part of the Unfold version.
* 2026-10-01 — Refined by ADR-0012; site-scoped commits no longer release Unfold.
* 2026-10-03 — Superseded by [ADR-0019](adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-vloer.md). Ploeg moved to github.com/ploeg-hq/ploeg, which versions and publishes it; Unfold pins it as a submodule and the `unfold-v…` train versions Vloer only.
