---
status: proposed
date: 2026-09-12
decision-makers: Ryan Grippeling
supersedes: none
review-by: none
---

# Qualify Glide before changing Ploeg distribution

## Context and Problem Statement

The owner authorized developing Ploeg and Vloer together in Glide. Ploeg's public module and artifact sources currently name its separate mirror. A directory import cannot make those publication claims true for new Glide commits.

## Decision Drivers

* Preserve the existing module and artifact identities.
* Keep source provenance verifiable under ADR 0020.
* Avoid coupling a local repository move to production changes.

## Considered Options

* Qualify the local import, then migrate distribution with explicit evidence
* Change source URLs and deployments while importing files

## Decision Outcome

Chosen option: "Qualify the local import, then migrate distribution with explicit evidence", because buildable code, public source provenance and deployed artifacts require different checks.

Glide holds Ploeg under `apps/ploeg`. Keep the Go module path, chart and image identities. Prefix Glide release tags with `ploeg-v`; the version policy remains zero-major release candidates. The existing Forgejo and GitHub repositories remain available. Before enabling artifact publication from Glide, prove that the advertised source contains the built revision and that the public module remains resolvable. ADR 0004 continues to describe the existing remote distribution arrangement until a separately recorded cutover supersedes it.

### Consequences

* Good, because the local import is reversible and independently verifiable.
* Bad, because remote publication needs an additional distribution migration.

### Confirmation

Run the imported Go, chart, ledger and release-policy gates, plus the Vloer qualification. Publication from Glide must be explicitly enabled after remote source and secret wiring have been verified; the default migration workflow runs checks only.

## Pros and Cons of the Options

### Change publication during the file import

* Good, because there is one rollout window.
* Bad, because a green local build cannot prove that a public source URL resolves the released commit.

## More Information

* Technical story: [assemble-glide-monorepo](../../openspec/changes/archive/2026-09-23-assemble-glide-monorepo/proposal.md).
* 2026-09-12 — Recorded before import. The owner approved Glide and the local migration; this distribution sequencing remains proposed and does not ratify earlier proposed decisions.
* Related: [0004](0004-forgejo-leading-home-github-mirror-module-path.md), [0020](0020-published-artifacts-name-the-mirror-as-source.md), [0028](0028-automatic-releases-stay-zero-major-candidates.md).
