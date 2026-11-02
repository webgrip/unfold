# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-11-02
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `ci-integration`

## Accepted Records Reviewed

- `docs/adr/adr-0002-ploeg-is-the-only-engine.md` — Ploeg owns CI's meaning; Unfold renders it.
- `docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md` — each CI action names its person, channel and confirmation.
- `docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md` — commit statuses stay the fallback for any CI.
- `docs/adr/adr-0053-a-person-accepts-a-pull-request-in-unfold-and-ploeg-asks-the-forge-to-merge-it-at-that-head.md` (proposed) — Ignore for Ploeg never lets a merge past the forge's required checks.

## Records Created

- `docs/adr/adr-0054-unfold-shows-why-ci-stopped-a-work-item-on-every-surface-and-offers-ploegs-ci-actions.md` (proposed). Ploeg's records are ploeg-hq ADR-0189 and ADR-0190.

## Supersessions

- none

## Validation

- `python3 scripts/validate_adr_consistency.py .`
