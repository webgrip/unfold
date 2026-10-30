# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-30
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `tenant-export`

## In-Force ADR Context Reviewed

- System ADR-0050 (accepted 2026-10-30, pull request #697, not merged when
  this change was written) — rule 6 is what this change builds; rule 3's
  "a CSV download does not count" is why the bundle is JSON Lines with
  schemas; rule 8 is why the Ploeg half is written as a generic contract in
  `design.md` D6.
- `docs/adr/adr-0009-one-tenant-per-agency.md` and
  `docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md`
  — the Tenant is the unit of export, and the scope rules follow ADR-0017's
  memberships and repository ownership.
- `docs/adr/adr-0002-ploeg-is-the-only-engine.md` and
  `docs/adr/adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md`
  — Ploeg's records stay Ploeg's; no Ploeg contract changes here.
- `docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md`
  — each start, download and deletion is an Action Record.
- `docs/adr/adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md`
  — the form of this change.
- `apps/unfold/docs/adrs/0002-native-node-and-single-writer-storage.md` — one
  SQLite writer; the export reads through a second, read-only connection.
- `apps/unfold/docs/adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md`
  — the `tenant.export` flag.

## Repository-Level ADRs Created

None. The change implements ADR-0050 rule 6 within accepted records. JSON
Lines without Parquet is a version 1 scope choice, stated in `design.md` D4
and on the operations page, not a decision against the ADR.
