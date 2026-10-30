# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-30
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `notify-slack-teams`

## Accepted Records Reviewed

- `docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md` — Slack and Teams are adapters in the channel registry; the personal Slack link is exported, tokens and webhook URLs are not.
- `docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md` — a permission answered from Slack is an Action Record naming the person, the channel `slack` and the confirmation.
- `docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md` — recipients stay scoped per person.
- `docs/adr/adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md` — the form of this change.
- `apps/unfold/docs/adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md` — the two flags.

## Proposed Records Reviewed

- `docs/adr/adr-0026-unfold-is-an-installable-web-app-that-notifies-from-the-server.md` — unchanged; this change adds channels to the notifier it describes.

## Records Created

- none.

## Supersessions

- none.
