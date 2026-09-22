---
status: accepted
date: 2026-09-12
decision-makers: Ryan Grippeling
---

# Glide contains independently deployable Vloer and Ploeg

## Context and Problem Statement

The owner chose Glide and instructed execution of the reviewed monorepo plan. Cross-application changes need one reviewable source tree while standalone work and independent deployments remain useful.

## Decision Drivers

* Preserve history and the audited working trees.
* Keep standalone Vloer usable without a Ploeg service.
* Check both sides of shared contracts in one checkout.

## Considered Options

* Glide with separate applications and shared system documentation
* Continue coordinating two repositories
* Merge the execution engines during the repository move

## Decision Outcome

Chosen option: "Glide with separate applications and shared system documentation", because it makes joint changes atomic without requiring a shared runtime or release version.

Use `apps/vloer`, `apps/ploeg` and root `docs` on the `development` trunk. Preserve original commits and namespace imported tags by application. Existing package, Go module, image and chart names remain unchanged. Application records retain their scope and acceptance status. Shared product concepts and workflows have one source in root documentation.

Standalone Vloer retains local authority. Ploeg authority applies to explicitly admitted work and never silently changes on a connection failure. Keep the current execution engines; extraction requires a separate comparison showing equivalent responsibilities and a concrete benefit.

Remote publication and production cutover require their own verified migration steps. In particular, preserving Ploeg's Go module path requires preserving its public distribution source; moving files alone does not accomplish that.

### Consequences

* Good, because shared contracts can be tested at one commit.
* Good, because the original source histories remain reachable.
* Bad, because release and documentation tooling must account for application paths.

### Confirmation

Run `mise run verify`, `mise run integration` and `mise run docs-check`. The import verifier checks original commit ancestry, tag targets and the exact imported file snapshot. Release checks assert separate tag formats and preserve Ploeg's zero-major candidate policy.

## Pros and Cons of the Options

### Continue coordinating two repositories

* Good, because release tooling stays unchanged.
* Bad, because shared contract edits and documentation can drift between checkouts.

### Merge the execution engines during the move

* Good, because genuinely common behavior could become easier to maintain.
* Bad, because TypeScript interactive sessions and Go worker lifecycles have different responsibilities; a repository move supplies no evidence that a common engine is useful.

## More Information

* Technical story: [migration plan](../migration.md).
* 2026-09-12 — The owner selected Glide and explicitly instructed execution of the reviewed plan. This record captures that approval before assembling the source trees.
* The [application decision ledgers](../index.md) remain scoped to their respective applications.
* 2026-09-22 — [ADR-0002](adr-0002-ploeg-is-the-only-engine.md) supersedes the standalone Vloer authority and the retention of both engines. Two independently deployable applications remain.
