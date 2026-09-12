---
status: proposed
date: 2026-09-11
decision-makers: Ryan Grippeling
---

# Bind tracker imports to existing Ploeg work

## Context and Problem Statement

Shared execution currently creates manual Work Items. Tracker imports must reuse the tracker's existing Ploeg mirror without racing unattended dispatch or creating a second execution authority. De Vloer's content hash and Ploeg's native tracker revision have different meanings.

## Decision Drivers

- Preserve one Work Item and its tracker priority.
- Reject stale content, changed routing and ambiguous source identity before paid execution.
- Keep operator drafts private and start commands idempotent.
- Extend the existing task browser and session workflow.

## Considered Options

- Register an explicit source target and claim the existing pristine Work Item on Start.
- Import tracker content into a new manual Work Item.
- Adopt already executing unattended work and its native harness state.

## Decision Outcome

Chosen option: "Register an explicit source target and claim the existing pristine Work Item on Start", because it preserves the existing authority and supports qualification without transferring opaque runtime state.

The [tracker binding contract](../contracts/ploeg-tracker-binding.md) specifies the supported singleton Vikunja and ClickUp sources, exact target mapping, separate revisions, owner-authorized refresh, lookup and admission expectations. Import prepares a queued De Vloer session; it does not alter assignment or start work. Ploeg performs the atomic claim when Start is explicitly requested. Missing mappings, unsupported providers and historical or active Ploeg work remain unavailable for this path.

### Consequences

- Good, because interactive and unattended work retain the same Work Item identity.
- Good, because an uncertain admission replays the original persisted payload.
- Bad, because source outages and changed content require refresh before a new admission.
- Bad, because this boundary supports one configured Ploeg tracker instance per provider and does not adopt existing harness workspaces.

### Confirmation

Run `mise exec -- npm test`, `mise exec -- npm run check` and `mise exec -- npm run typecheck`. Tests must prove native revision separation, mapping validation, closed/moved/changed source rejection, target freshness, owner privacy, admission replay and no manual duplicate. Cross-service qualification must verify one pre-existing PostgreSQL Work Item survives interactive admission and races with unattended claim.

## More Information

- [Shared execution](0017-delegate-interactive-execution-to-ploeg.md)
- [Task connections](0008-task-connections-and-candidate-handoff.md)
- 2026-09-11 — Proposed during the owner's authorized next milestone; implementation and qualification are tracked separately from architecture ratification.
