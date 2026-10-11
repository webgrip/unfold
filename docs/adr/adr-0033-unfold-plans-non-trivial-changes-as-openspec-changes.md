---
status: accepted
date: 2026-10-11
decision-makers: Ryan Grippeling
---

# Unfold plans non-trivial changes as OpenSpec changes

## Context and Problem Statement

What Unfold should build is spread over Vikunja tickets, RFCs in `docs/design/`, ADRs in two ledgers and research notes. None of them states requirements in a form a check can validate, and an agent that picks up a ticket has to reconstruct what "done" means. Ploeg already plans its own work with OpenSpec and its `spec-driven-with-adr` schema (Ploeg ADR-0001), and Ploeg can run a Work Item straight from an OpenSpec change (`openspec: <change-id>` in the description, validated after the Run). Unfold pinned the OpenSpec CLI but never set it up. Should Unfold plan its own changes the same way?

## Decision Drivers

* An agent working on Unfold needs the requirements of a change in the repository, not only in a ticket.
* Ploeg's OpenSpec Work Items should be exercised on Unfold itself.
* No second ledger: durable decisions stay in the ADR ledgers.

## Considered Options

* OpenSpec with Ploeg's `spec-driven-with-adr` schema, adapted to Unfold's ledgers
* OpenSpec specs only, with proposals kept as RFCs
* No OpenSpec in Unfold

## Decision Outcome

Chosen option: "OpenSpec with Ploeg's `spec-driven-with-adr` schema, adapted to Unfold's ledgers", because it puts requirements in the repository in a checkable form, keeps decisions in the existing ledgers, and lets Ploeg run Unfold's own changes from their OpenSpec briefs.

* `openspec/config.yaml` points at Unfold's docs; `openspec/schemas/spec-driven-with-adr/` is Ploeg's schema with Unfold's ledgers, supersession convention and gates.
* A non-trivial change is an OpenSpec change under `openspec/changes/<id>/`: proposal, specs, design, an ADR review, tasks. A trivial fix needs none.
* Durable decisions are written to `docs/adr/` or `apps/unfold/docs/adrs/` in the change's `adr` step, never inside `openspec/`.
* `openspec/specs/` holds current requirements; an archived change is a record.
* `openspec init` generated the `/opsx` commands for Claude Code and the `openspec-*` skills in `.agents/skills/`, which every other agent reads. `openspec update` regenerates them.
* Telemetry and update checks are off through the root `mise.toml` environment.

### Consequences

* Good, because a change's requirements are validated in CI and travel with the code.
* Good, because Unfold exercises Ploeg's OpenSpec Work Items on itself.
* Bad, because an OpenSpec proposal overlaps an RFC; an open design question stays an RFC, and a change that is ready to build becomes an OpenSpec change.
* Bad, because Unfold and Ploeg each carry a copy of the schema, and the two can drift.

### Confirmation

`mise run verify` runs `openspec validate --all --strict` as its `openspec` group, and `scripts/validate_adr_consistency.py` (in `mise run docs-check`) checks the ledgers the `adr` step writes to.

## Pros and Cons of the Options

### OpenSpec specs only, with proposals kept as RFCs

* Good, because nothing overlaps the RFCs.
* Bad, because Ploeg's OpenSpec Work Items need a change, not only specs, so Unfold would not exercise them.

### No OpenSpec in Unfold

* Good, because there is nothing new to learn.
* Bad, because requirements stay outside the repository and outside any check.

## More Information

* Ploeg's schema: `apps/ploeg/openspec/schemas/spec-driven-with-adr/` at the pinned commit.
* 2026-10-11: decided by the owner while setting up how agents work on Unfold.
