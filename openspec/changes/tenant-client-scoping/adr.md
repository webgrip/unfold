# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-29
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `tenant-client-scoping`

## Accepted Records Reviewed

- `docs/adr/adr-0009-one-tenant-per-agency.md` — a Client is inside its Agency's Tenant, never a Tenant of its own.
- `docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md` — the Tenant and Client ownership, the 404 rule, checking before any service-token read, and the Confirmation's Unfold HTTP test and configuration test that this change writes.
- `docs/adr/adr-0002-ploeg-is-the-only-engine.md` — Ploeg's checks are the binding ones; Unfold's are the first line, so the Ploeg-read filter is defence in depth.
- `docs/adr/adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md` — the form of this change.
- `docs/adr/adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md` — nothing in `apps/ploeg` changes; the Ploeg need is described as a generic contract for ploeg-hq.

## Records Created

- none: design.md D4 to D8 apply ADR-0017 inside Unfold and introduce no decision beyond it. D7 (the owner of a Work Item without a matching repository) and D8 (delegated memberships) are the choices the owner may want to ratify; they become an Unfold ADR if the owner wants them recorded beyond this change.

## Supersessions

- none

## Validation

```sh
$ python3 scripts/validate_adr_consistency.py .
validate-adr-consistency: OK (47 record(s) in docs/adr, registry-checked)
```

## Notes

ADR-0017's Confirmation still lists its Unfold tests as proposed; it changes
when enforcement is on in a deployment, which is the owner's change.
