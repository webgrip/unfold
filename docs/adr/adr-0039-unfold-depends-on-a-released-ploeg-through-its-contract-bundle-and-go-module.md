---
status: accepted
date: 2026-10-18
decision-makers: Ryan Grippeling
---

# Unfold depends on a released Ploeg through its contract bundle and Go module

## Context and Problem Statement

[ADR-0019](adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md) pinned Ploeg as a Git submodule at `apps/ploeg`, at the commit of a Ploeg release tag. Every verification then ran Ploeg's own `scripts/verify.sh` at the pin, and a person merged each pin move, which never released Unfold. A Ploeg fix therefore needed two hand steps in Unfold before it reached the homelab, and a Ploeg test that failed only in Unfold's CI blocked Unfold's releases (2026-10-04).

The homelab's one delivery contract ([homelab ADR-0069](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/docs/techdocs/docs/adr/adr-0069-one-delivery-contract.md), decision D2 of its [RFC](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/docs/techdocs/docs/rfc/rfc-unfold-release-train.md)) says a dependency between projects is a released version Renovate bumps, never a source submodule, and that registries carry what forges produce. How does Unfold keep reading Ploeg's contract, building against its packages and republishing its documentation without a source checkout?

Unfold reads Ploeg in four ways:

| Use | Reads | Where |
| --- | --- | --- |
| Contract | the published schemas, the domain model's lifecycles and the string codes Ploeg defines only in its code | `apps/unfold/test/ploeg-contract.test.ts` |
| Documentation | the domain model, the ADR ledger and every page under `docs/`, plus links into Ploeg's source | `scripts/docs.py`, `scripts/docs-decisions.py`, `scripts/generate-domain.py`, `scripts/docs-vale.py`, `docs/domain/model.yaml` |
| Build | `pkg/httpapi` and `pkg/store`, compiled into the unified demo's helper | `apps/unfold/scripts/unified-demo/main.go` |
| Test harness | Ploeg's managed workbench qualification and its harness conformance tests | `scripts/integration.mjs`, `mise run harness-conformance` |

## Decision Drivers

* One hand step per change: reviewing the code ([homelab ADR-0069](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/docs/techdocs/docs/adr/adr-0069-one-delivery-contract.md)).
* Unfold tests against exactly the Ploeg release it names, verified by digest.
* Unfold stops running Ploeg's own test suite; Ploeg's CI owns it.
* A fresh clone works with public access only.
* Existing paths under `apps/ploeg` keep working for the tests and the documentation, so history pages and links stay valid.

## Considered Options

* Ploeg's contract bundle from GHCR and its Go module, both pinned to one release
* The Go module alone, read from the module cache
* Keep the submodule and let Renovate merge it

## Decision Outcome

Chosen option: "Ploeg's contract bundle from GHCR and its Go module, both pinned to one release", because each consumer gets the released artifact made for it, both are verified by digest, and Renovate moves them together.

* Every Ploeg release publishes `ghcr.io/ploeg-hq/ploeg-contract:<version>`, an OCI artifact of type `application/vnd.ploeg.contract.v1+json` with one gzipped tar layer: `docs/`, the non-test Go files under `pkg/` and `cmd/`, `files.txt` (every tracked path) and `ploeg-contract.json` (version and commit). Ploeg's [contracts README](../../apps/ploeg/docs/contracts/README.md) defines it from the first release that publishes it.
* [apps/unfold/ploeg-release.json](../../apps/unfold/ploeg-release.json) pins the bundle as `ghcr.io/ploeg-hq/ploeg-contract:<version>@sha256:<manifest digest>`. [scripts/ploeg-contract.py](../../scripts/ploeg-contract.py) fetches it anonymously, checks the manifest against the pinned digest, the artifact type, and the layer against the manifest's digest and size, refuses an entry outside the directory, and unpacks it into `apps/ploeg`, which Git ignores. `mise run setup` and every CI job that reads Ploeg run it first. `UNFOLD_PLOEG_CONTRACT_REGISTRY` points it at a mirror such as `harbor.webgrip.dev/ghcr/ploeg-hq`; the digest makes the source irrelevant.
* [apps/unfold/scripts/unified-demo/go.mod](../../apps/unfold/scripts/unified-demo/go.mod) requires `github.com/ploeg-hq/ploeg` at the same release; `go.sum` and the Go checksum database verify it. The demo helper builds in that module, and the managed qualification and harness conformance compile Ploeg's test packages from it (`go test -c github.com/ploeg-hq/ploeg/pkg/httpapi`). Unfold no longer runs Ploeg's `scripts/verify.sh`.
* `scripts/ploeg-contract.py check` fails when the Go module and the bundle name different releases or `apps/ploeg` does not hold the pinned bundle; `mise run verify` runs it. The `ploeg-pin` CI job adds `--published`: the registry tag must still be the pinned digest. The Unfold release waits for that job.
* The documentation keeps reading `apps/ploeg`. A link into a Ploeg file the bundle leaves out, such as a test or an `ops/` file, is valid when `files.txt` lists it, and points at GitHub at the bundle's commit. Decision evidence may name such a file the same way.
* Renovate proposes one `fix(ploeg): update Ploeg to …` pull request on `renovate/ploeg` for each newer release, release candidates included: the bundle's tag and digest through a regex manager, the Go module through `gomod` with `go mod tidy`. It regenerates the Ploeg-derived pages after fetching the new bundle, and merges itself when every check, `ploeg-docs` included, is green. The commit touches `apps/`, so [apps/.releaserc.cjs](../../apps/.releaserc.cjs) releases it as the next Unfold candidate; the rule that a commit scoped `ploeg` never releases Unfold is removed.
* What ADR-0019 decided about release identities stays: the `unfold-v…` train versions the Unfold application only, Unfold publishes no Ploeg artifact, and Ploeg's release floor stays retired.

### Consequences

* Good, because a Ploeg release reaches an Unfold candidate with no hand step, and the homelab takes that candidate the same way.
* Good, because Unfold's CI no longer builds or tests Ploeg's whole source tree, so a Ploeg test can no longer block an Unfold release.
* Good, because the pin is two digests: the contract Unfold checks against and the code it compiles against cannot drift apart unnoticed.
* Bad, because a pin can move only after Ploeg publishes the bundle, so a Ploeg change Unfold needs waits for a Ploeg release candidate, as with the submodule.
* Bad, because a Ploeg release that changes the glossary still needs `mise run landscape` from a person: Renovate's runner has no browser, so that pull request stays red and does not merge itself.
* Bad, because every Ploeg candidate cuts an Unfold candidate, so Unfold tags multiply with Ploeg's.
* Bad, because `apps/ploeg` is no longer a checkout: Ploeg work happens in a clone of `ploeg-hq/ploeg`, and an unreleased Ploeg can be tried only through a local `go.work` and a locally built bundle (`scripts/ploeg-contract.py fetch-unpinned`).

### Confirmation

* `python3 scripts/ploeg-contract.py check` runs in `mise run verify`; `check --published` is the `ploeg-pin` CI job, and the `release` job needs it.
* [scripts/ploeg-contract.test.py](../../scripts/ploeg-contract.test.py) fails when a manifest or layer that differs from the pin is unpacked, when another artifact type or an entry outside the directory is accepted, when a Go module on another release passes the check, when a moved tag passes `--published`, or when the old submodule checkout is overwritten. `mise run verify` runs it.
* [scripts/workflow-policy.test.cjs](../../scripts/workflow-policy.test.cjs) fails when `.gitmodules` returns, when a workflow checks out submodules, or when a job that reads Ploeg does not fetch the bundle first.
* [scripts/release-isolation.test.cjs](../../scripts/release-isolation.test.cjs) fails when a `fix(ploeg)` bump of the pin stops releasing Unfold or a `build(ploeg)` commit starts to.
* The managed qualification in `mise run verify` passes only when `TestOperatorWorkbenchQualification` and `TestOperatorWorkbenchInferenceQualification`, built from the pinned module, pass.

## Pros and Cons of the Options

### Ploeg's contract bundle from GHCR and its Go module, both pinned to one release

* Good, because the bundle is the artifact Ploeg defines for consumers, and an OCI registry is where the delivery contract carries artifacts.
* Good, because the Go module is how Go code depends on Go code, verified by `go.sum`.
* Bad, because two pins must agree, which the check and the Renovate group enforce.

### The Go module alone, read from the module cache

* Good, because one pin, `go.mod`, covers everything, and the module zip holds the whole repository.
* Bad, because the documentation build, which runs in a container without Go, would need Go to locate the source.
* Bad, because the module proxy fetches from the forge on first request, which is not the registry layer of the delivery contract.

### Keep the submodule and let Renovate merge it

* Good, because nothing else changes.
* Bad, because Unfold keeps building and testing Ploeg's source, which homelab ADR-0069 removes.

## More Information

* Technical story: [RFC: One delivery contract for every project](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/docs/techdocs/docs/rfc/rfc-unfold-release-train.md), phase P3.
* 2026-10-17 — The owner chose decision D2 of that RFC: Unfold depends on a released Ploeg, not the `apps/ploeg` submodule.
* 2026-10-18 — Accepted. Ploeg publishes the bundle from [ploeg-hq/ploeg#163](https://github.com/ploeg-hq/ploeg/pull/163) on.
* Supersedes [ADR-0019](adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md). Its release identities, the retired Ploeg floor and Unfold's refusal to publish Ploeg stay.
* Supported by [ADR-0027](adr-0027-unfold-checks-its-ploeg-client-against-ploegs-published-schemas.md), whose schema checks now read the bundle.
