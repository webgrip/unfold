# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-30
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `outbound-events`

## Accepted Records Reviewed

- `docs/adr/adr-0002-ploeg-is-the-only-engine.md` — events only report what Ploeg and Unfold recorded; nothing executes.
- `docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md` — the `tenant` and `client` attributes and the subscription scope use its ownership.
- `docs/adr/adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md` — Unfold reads Ploeg's existing operator API; the CloudEvents need is described as a Ploeg contract for ploeg-hq.
- `docs/adr/adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md` — the form of this change.

## Records Created

- none. The wire format and the delivery guarantees are published as
  contracts (`events.asyncapi.yaml`, `cloudevent.v1.schema.json`) behind an
  off-by-default flag. The owner decides whether they become an Unfold ADR
  before the flag turns on for an Agency.

## Supersessions

- `apps/unfold/docs/contracts/event-envelope.v1.schema.json`, a proposed
  design contract and not a ledger record, is superseded by
  `cloudevent.v1.schema.json` for the events Unfold publishes.
