# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-13
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `feature-flags`

## In-Force ADR Context Reviewed

- `apps/unfold/docs/adrs/0002-native-node-and-single-writer-storage.md` and `0036-the-agent-host-speaks-websocket-through-ws.md` — no runtime dependency without a decision; the reason this change adds none.
- `docs/adr/adr-0023-unfold-measures-happiness-and-confusion-with-first-party-events-surveys-and-bug-reports.md` — `flag.exposed` is a product event in that catalogue and export.
- `apps/unfold/docs/adrs/0038-the-application-shows-unfold-and-is-organised-around-work.md` and `0041-the-work-item-page-shows-plain-figures-and-the-card-has-its-own-page.md` — the stage strip and status panel the flight profile sits beside; Baken marks the current step.
- `apps/unfold/docs/adrs/0040-accept-opens-a-pull-request-through-the-trusted-publisher-in-the-unfold-control-service.md` — the landing leg names the Unfold bot when the publisher is configured.
- `docs/adr/adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md` — this change's form.

## Repository-Level ADRs Created

- `apps/unfold/docs/adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md`

## Supersessions

- none

## Validation

```sh
$ mise run verify
$ mise run docs-check
```

## Notes

ADR 0043 stays `proposed`; the owner accepts or rejects it (VIK-2042).
