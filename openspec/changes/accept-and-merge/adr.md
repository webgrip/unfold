# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-11-01
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `accept-and-merge`

## Accepted Records Reviewed

- `docs/adr/adr-0002-ploeg-is-the-only-engine.md` — Ploeg performs the merge; Unfold only asks.
- `docs/adr/adr-0005-unfold-is-offered-to-agencies.md` — the Agency owns merging; a person of the Agency still decides.
- `docs/adr/adr-0006-the-ticket-is-the-billing-unit.md` — Acceptance charges the Delivery Fee; one Acceptance per head (design.md D8).
- `docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md` — Accept and merge names its person, channel and confirmation.
- `docs/adr/adr-0047-unfold-describes-a-repository-with-the-ai-codebase-maturity-model-and-delivers-at-level-5.md` (proposed) — it rejected merges without a person; this change keeps a person's click on every merge.
- `docs/adr/adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver.md` (proposed) — the same head binding.
- `apps/unfold/docs/adrs/0040-accept-opens-a-pull-request-through-the-trusted-publisher-in-the-unfold-control-service.md` — the Session candidate's Accept keeps its name and meaning; this action is Accept and merge.

## Records Created

- `docs/adr/adr-0053-a-person-accepts-a-pull-request-in-unfold-and-ploeg-asks-the-forge-to-merge-it-at-that-head.md` (proposed). Ploeg's merge contract is ploeg-hq ADR-0188, in Ploeg's words.

## Supersessions

- none

## Validation

- `python3 scripts/validate_adr_consistency.py .`
