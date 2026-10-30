# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-30
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `scim-and-shared-signals`

## Accepted Records Reviewed

- `docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md` — SCIM 2.0 for provisioning; this change removes the "no SCIM provisioning" violation.
- `docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md` — the membership groups a SCIM Group grants.
- `docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md` — provisioning and revocation are Action Records.
- `apps/unfold/docs/adrs/0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md` — editor credentials end with the person.
- `apps/unfold/docs/adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md` — the two flags.
- `apps/unfold/docs/adrs/0055-unfold-proves-the-person-to-ploeg-with-a-token-exchanged-from-their-sign-in.md` — kept sign-in tokens end with the person.

## Records Created

- `apps/unfold/docs/adrs/0059-the-identity-provider-provisions-and-deprovisions-people-through-scim-and-pushed-shared-signals.md` (proposed).
