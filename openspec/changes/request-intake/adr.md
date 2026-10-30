# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-30
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `request-intake`

## Accepted Records Reviewed

- `docs/adr/adr-0002-ploeg-is-the-only-engine.md`: a Request is stored in Unfold and never reaches Ploeg, so it cannot become a Run.
- `docs/adr/adr-0005-unfold-is-offered-to-agencies.md` and `docs/adr/adr-0007-clients-approve-ready-work.md`: Unfold never contacts a Client, so the intake has no outbound mail and never answers a sender beyond the HTTP response.
- `docs/adr/adr-0009-one-tenant-per-agency.md` and `docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md`: every source and Request has a Tenant and optionally a Client, scoped through `tenancy.enforce`.
- `docs/adr/adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md`: the form of this change.
- `docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md`: administration routes are Action Records; deliveries come from no person.
- System ADR-0050, open as pull request #697: registries for templates and verifiers, Standard Webhooks on the wire, Tenant export (rule 6) listed as a risk in design.md.
- `apps/unfold/docs/adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md`: the `intake.requests` flag.

## Records Created

- none. The intake applies ADR-0050 and the domain model's Request; the one
  candidate for a durable record, email only as an inbound webhook, is an open
  question in design.md for the owner.

## Supersessions

- none

## Validation

```
$ python3 scripts/validate_adr_consistency.py .
validate-adr-consistency: OK (49 record(s) in docs/adr, registry-checked)
```
