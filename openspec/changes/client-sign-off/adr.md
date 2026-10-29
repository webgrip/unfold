# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-29
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `client-sign-off`

## Accepted Records Reviewed

- `docs/adr/adr-0002-ploeg-is-the-only-engine.md` — Ploeg is the Authority, so Ploeg refuses the Shift without approval (design.md D1).
- `docs/adr/adr-0005-unfold-is-offered-to-agencies.md` — the Agency owns the Client relationship and merging.
- `docs/adr/adr-0006-the-ticket-is-the-billing-unit.md` — Acceptance charges the Delivery Fee and stays the Agency's; the client view shows the Agency's price, not Unfold's charge.
- `docs/adr/adr-0007-clients-approve-ready-work.md` — Client approval, approval on the Client's behalf, the Agency's own approval, never contacting a Client, signed preview links; its Confirmation is the Ploeg admission test in tasks 2.2.
- `docs/adr/adr-0008-every-pull-request-gets-a-preview-environment.md` — P2.5 depends on its previews.
- `docs/adr/adr-0009-one-tenant-per-agency.md` and `docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md` — a Client is a user inside its Agency's Tenant; client memberships and scoping come from ADR-0017's P1 slices.
- `docs/adr/adr-0010-pull-requests-are-small-whole-and-explained.md` — the pull request the Client signs off.
- `docs/adr/adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance.md` (proposed) — the Work Item Brief's allow-list pattern; its US dollar spend is why the client view has its own projection.
- `docs/adr/adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md` — the form of this change.
- `docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md` — approvals and sign-offs name their person and confirmation.
- `apps/ploeg/docs/adrs/0031-runs-create-work-items-held-for-approval-within-limits.md` — the proposed state and approve route that D1 extends.
- `apps/ploeg/docs/adrs/0079-run-cards-belong-to-the-consumer-and-ploeg-supplies-delivery-facts.md` — the keyed pull request comment and the delivery facts the sign-off reads.
- `apps/unfold/docs/adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md` — the `client.verdict-comment` flag.

## Records Created

- none yet. One durable decision qualifies: the Client Sign-off's name, its
  weight against Acceptance, and its binding to the head commit and Sign-off
  Paths. Its content depends on open questions 1 and 2, so it is written as a
  proposed system ADR after the owner answers (tasks.md 1.3). The Ploeg
  contract's record belongs to ploeg-hq (tasks.md 2.1).

## Supersessions

- none

## Validation

```sh
$ python3 scripts/validate_adr_consistency.py .
validate-adr-consistency: OK (47 record(s) in docs/adr, registry-checked)
```

## Notes

Nothing here is accepted or implemented. The owner decides open questions 1
to 4 in design.md before the ADR in tasks.md 1.3 is written.
