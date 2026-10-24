---
status: accepted
date: 2026-10-18
decision-makers: Ryan Grippeling
---

# A Ploeg release opens Unfold's pin pull request by running Unfold's recipe

## Context and Problem Statement

[ADR-0039](adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md) let Renovate move the Ploeg pin. Renovate looks only on its schedule, and merges only while it runs: on 2026-10-18 Ploeg `v0.2.0-rc.27` published itself at 07:08 and then waited for the hourly run of the homelab's `webgrip-forgejo` Renovate job, once to open the bump and once to merge it. The owner rejected schedules as the way a release moves along the delivery chain and chose, on 2026-10-18, that the producer opens the bump pull request ("pattern 3" in phase P1b of the [delivery contract RFC](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/docs/techdocs/docs/rfc/rfc-unfold-release-train.md)). [Ploeg ADR 0119](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0119-a-release-opens-each-consumers-update-by-running-the-consumers-own-recipe.md) runs a consumer's own recipe after each candidate and asks Forgejo to merge the result when its checks succeed. What does Unfold give Ploeg to run, and what happens to the Renovate group?

## Decision Drivers

* Ploeg names none of its consumers and must learn nothing about how Unfold pins it beyond "run this file with the version".
* One writer per pin: Renovate and Ploeg's release must not race on `apps/unfold/ploeg-release.json` and `go.mod`.
* The pull request is the one ADR-0039 describes: both pins, the regenerated Ploeg-derived pages, a `fix(ploeg)` commit that cuts the next Unfold candidate, held by a red `ploeg-docs`.
* A missed or failed release run must still show, without a person looking for it.

## Considered Options

* An executable recipe, `scripts/consume-ploeg-release.sh <version>`, that runs `ploeg-contract.py pin` and `renovate-ploeg-docs.sh`
* An updatecli manifest
* Keep the Renovate group and trigger its run from Ploeg's release

## Decision Outcome

Chosen option: "An executable recipe", because it reuses the two scripts Renovate already ran, and the producer needs no tool beyond a shell to run it.

* [scripts/consume-ploeg-release.sh](../../scripts/consume-ploeg-release.sh) takes the release version (`0.2.0-rc.28`, a leading `v` is dropped), trusts and installs Go and uv from this repository's `mise.toml`, runs `scripts/ploeg-contract.py pin`, which moves the bundle pin and the Go module and runs `go mod tidy`, and then `scripts/renovate-ploeg-docs.sh`, which regenerates the decision register, the domain pages and the combined glossary, or writes `ploeg-glossary-conflicts.txt` on a term clash. It leaves the changes in the working tree; Ploeg commits them. A person may run it too: it is `mise run ploeg-pin` plus the regeneration.
* Ploeg's release candidate workflow runs it from the entry `{"forge": "forgejo", "url": "https://forgejo.webgrip.dev", "repo": "webgrip/unfold", "base": "development", "recipe": "scripts/consume-ploeg-release.sh", "message": "fix(ploeg): update Ploeg to {version}"}` in its `RELEASE_CONSUMERS` variable. The pull request comes from `ploeg/<version>`, authored by a Forgejo user that may write only this repository, and merges itself when the required checks of `development` succeed. The commit is still `fix(ploeg)`, so the merge cuts the next Unfold candidate.
* Renovate's `Ploeg` group is replaced by a rule that disables `ghcr.io/ploeg-hq/ploeg-contract` and `github.com/ploeg-hq/ploeg`.
* The weekly `ploeg-behind` job in [on_schedule.yml](../../.forgejo/workflows/on_schedule.yml) runs `scripts/ploeg-contract.py behind` and fails when GHCR lists a newer Ploeg release than the pin. `ploeg-ahead` keeps checking the glossary against the newest release and Ploeg's `development` head.
* The rest of ADR-0039 stands: the bundle and the Go module, their checks, and the release identities.

### Consequences

* Good, because a Ploeg candidate opens its Unfold pull request minutes after its bundle is published, and the merge waits only for the checks.
* Good, because how Unfold pins Ploeg stays in this repository: changing it changes the recipe, not Ploeg.
* Bad, because the recipe runs on Ploeg's GitHub runner, which must reach `ghcr.io`, the Go module proxy, PyPI and mise's tool sources. The runner has no browser, so a release that changes the glossary still leaves a stale landscape for a person, as with Renovate.
* Bad, because Forgejo merges on the branch's required contexts only: if `ploeg-docs` is not required on `development`, a pull request with a term clash merges red.
* Bad, because a pull request held red is caught by `ploeg-behind` up to a week later, unless a person sees it first.

### Confirmation

* [scripts/workflow-policy.test.cjs](../../scripts/workflow-policy.test.cjs), run by `mise run release-check`, fails when the Ploeg packages are enabled in Renovate again, when the recipe is not executable or stops calling `ploeg-contract.py pin` and then `renovate-ploeg-docs.sh`, or when `ploeg-behind` stops running `ploeg-contract.py behind`.
* [scripts/ploeg-contract.test.py](../../scripts/ploeg-contract.test.py), run by `mise run verify`, fails when `behind` passes with a newer candidate or stable release published, or fails on the newest one.
* The first Ploeg candidate after the owner sets the variable, the secret and the bot user shows a `fix(ploeg)` pull request from `ploeg/<version>` with a scheduled merge.

## Pros and Cons of the Options

### An updatecli manifest

* Good, because updatecli is a standard format for a producer to run.
* Bad, because its targets would be shell commands calling the same two scripts, and the producer would need updatecli as well.

### Keep the Renovate group and trigger its run

* Good, because Renovate already writes this pull request.
* Bad, because the operator drops a trigger for a project it is running, so each trigger must repeat, and Ploeg would need a route into the homelab's Renovate operator.

## More Information

* 2026-10-18 — Decided by the owner: pattern 3, the producer opens the bump pull request; decision 1B, a dedicated Forgejo user with write access to `webgrip/unfold` only.
* Amends [ADR-0039](adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md): its Renovate bullet, and the `allowedCommands` entry homelab-cluster's Renovate configuration needed for `renovate-ploeg-docs.sh`.
* 2026-10-18 — Interim, decided by the owner after rejecting hand-made users and tokens: until the Forgejo user, its permission, its token and Ploeg's GitHub secret and variable come from declarative state, Renovate's Ploeg group in `renovate.json` is enabled again and bumps the pin. Ploeg's release step stays dormant because `RELEASE_CONSUMERS` is unset, so the two never write the same pin at once. The out-of-git state is inventoried in homelab-cluster `docs/techdocs/docs/general/delivery-chain-external-state.md`.
* 2026-10-18 — Interim ended: the Forgejo user (homelab VIK-2222), the GitHub App `ploeg-hq-gitops`, the token bridge (VIK-2224) and the `RELEASE_CONSUMERS` variable (VIK-2223) now come from declarative state, so Renovate's Ploeg group is disabled again and Ploeg's release is the one writer on the pin.
* 2026-10-24 — Amended by [ADR-0046](adr-0046-an-hourly-release-train-versions-unfold-from-a-checked-development-head.md) (owner decision D14): the pin pull request no longer merges itself once the `RELEASE_CONSUMERS` entry carries `"merge": "by-consumer"`; the release train merges the newest green pin before it reads the `development` head.
