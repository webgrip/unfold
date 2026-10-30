# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-30
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `billing-export`

## In-Force ADR Context Reviewed

- `docs/adr/adr-0006-the-ticket-is-the-billing-unit.md`: Acceptance by merge,
  approval or silence, and the 14-day Reversal. This change writes the
  Agency's lines for them. It charges nothing for Unfold.
- System ADR-0050 (PR #697, accepted 2026-10-30): a billing registry,
  Simplicate first, Unfold never sends Peppol, and whatever leaves Unfold is
  reachable through the API.
- `docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md`:
  a line belongs to the Work Item's owner.
- `apps/unfold/docs/adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md`:
  the `billing.export` flag.
- `docs/adr/adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md`:
  the form of this change.

## Repository-Level ADRs Created

None. The change stays inside ADR-0006 and ADR-0050. Which Simplicate object a
line becomes is an open owner decision, recorded in design.md.
