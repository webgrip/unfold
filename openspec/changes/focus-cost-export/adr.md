# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-30
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `focus-cost-export`

## In-Force ADR Context Reviewed

- `docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md`:
  rule 3, cost and usage leave in FinOps FOCUS and through the API. This
  change is that export.
- `docs/adr/adr-0006-the-ticket-is-the-billing-unit.md`: the Token Charge is
  model cost per attempt. The export carries the settled cost before any
  Markup and charges nothing.
- `docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md`:
  a row belongs to the Work Item's owner, and the reader sees only what they
  reach.
- `docs/adr/adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md`:
  the form of this change.

## Repository-Level ADRs Created

None. The change implements ADR-0050 rule 3 inside the scoping ADR-0017 sets.
