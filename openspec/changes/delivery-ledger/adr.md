# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-29
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `delivery-ledger`

## In-Force ADR Context Reviewed

- `docs/adr/adr-0006-the-ticket-is-the-billing-unit.md` — the Acceptance
  kinds, the 10 working days of silence and the Token Charge per attempt. This
  change reads them. It charges nothing.
- `docs/adr/adr-0002-ploeg-is-the-only-engine.md` — the ledger only reads
  Ploeg's delivery facts. It adds no execution path.
- `docs/adr/adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md`
  — no Ploeg contract change. The missing ready-for-review moment is
  approximated, not added.
- `docs/adr/adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md`
  — the form of this change.

## Repository-Level ADRs Created

None. The change stays inside ADR-0006. The holiday calendar is an open owner
decision, so the setting is marked proposed in the operations guide and the
API contract, not recorded as a decision.
