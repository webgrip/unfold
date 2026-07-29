# Architecture Decision Records

This directory is **the** decision ledger for Ploeg ([0001](0001-adrs-are-the-decision-ledger.md)).
If a decision outlives the change that prompted it, it is a record here — not a
row in `design.md`, not a paragraph in a research dossier, not an assistant's
memory.

Format is [MADR 4.0.0](https://adr.github.io/madr/) with two local extensions.

## The two local rules

**1. Supersession is append-only.** An accepted record's own `status:` is never
flipped. The superseding record carries `supersedes: NNNN`; the Records table
below shows `superseded by NNNN` for readers. The file is the historical
artefact; this index is the current view. Files are never renamed and numbers
are never reused.

**2. A decision that can change carries a dated review.** `review-by:
YYYY-MM-DD` in the front matter plus a `## Re-evaluation triggers` section
naming the observable events that reopen it. Prefer facts someone could check in
five minutes ("spec reaches 1.0", "issue #1029 closes") over judgements someone
has to form. `review-by: none` is a legitimate answer for a decision that only
changes if the project changes shape.

Both rules are enforced, not merely requested — see *Validation* below.

## Writing one

Copy [adr-template.md](adr-template.md) to `NNNN-kebab-title.md` with the next
number. The title names the *decision*, not the topic: "Go is the implementation
language", not "Language choice".

Every record needs a `### Confirmation` subsection naming how compliance is
actually checked — a CI gate with its command, a review step, or a script.
"Reviewers will notice" is not a confirmation, and the validator rejects a
record that omits the section.

The evidence stays out. A survey's working belongs in
`docs/research/YYYY-MM-DD-<topic>.md`, linked from *More Information*. The ADR
carries the verdict, the reasoning, and the triggers.

The [`adr-writer`](https://forgejo.webgrip.dev/webgrip/webgrip-ai-skills) skill
knows this format. Its **bundled validator does not apply here** — it assumes
vanilla status-flip supersession and would reject this corpus. Use the local
script.

## Validation

```sh
python3 scripts/check_adr_consistency.py
```

Runs in `.forgejo/workflows/on_pull_request.yml`. It gates filename and number
discipline, status legality, `supersedes:` integrity, file↔index parity in both
directions, the status and date mirrors, the presence of `### Confirmation`, and
that a dated `review-by` is backed by a `## Re-evaluation triggers` section.

Adding a record means adding its row below in the same commit; the parity check
fails otherwise.

## Status legend

| Status | Meaning |
| --- | --- |
| `proposed` | Written, not ratified. Do not design against it yet. |
| `accepted` | In force. Design within it or supersede it. |
| `rejected` | Considered and declined. Kept so the reasoning is not re-derived. |
| `deprecated` | No longer relevant, and nothing replaced it. |
| `superseded by NNNN` | **Index-only.** The file's own status stays as it was. |

## Records

| ADR | Decision | Status | Last updated |
| --- | --- | --- | --- |
| [0001](0001-adrs-are-the-decision-ledger.md) | ADRs in `docs/adrs/` are the single decision ledger; append-only supersession, dated re-evaluation triggers | accepted | 2026-07-29 |
| [0002](0002-go-as-the-implementation-language.md) | Go is the implementation language | accepted | 2026-07-29 |
| [0003](0003-apache-2-0-license.md) | Ploeg ships under Apache-2.0 | accepted | 2026-07-29 |
| [0004](0004-forgejo-leading-home-github-mirror-module-path.md) | Forgejo-leading home, GitHub push-mirror, module path from the mirror | accepted | 2026-07-29 |
| [0005](0005-build-a-dedicated-dispatch-plane.md) | Build a dedicated dispatch plane rather than adopt an existing orchestrator | accepted | 2026-07-29 |
| [0006](0006-ahp-is-the-wrong-layer.md) | AHP is parked: a live-run surface above Ploeg, not a seam inside it | accepted | 2026-07-29 |
| [0007](0007-a2a-adopt-nothing-watchlist-a-facade.md) | A2A: adopt nothing now; watchlist a north-facing dispatch facade | accepted | 2026-07-29 |
| [0008](0008-litellm-is-the-credential-and-metering-seam.md) | LiteLLM stays the per-run credential and metering seam | accepted | 2026-07-29 |
| [0009](0009-paperclip-mine-for-design-never-integrate.md) | Paperclip: mine it for design, never depend on it | accepted | 2026-07-29 |

## Review calendar

Derived from `review-by`; the validator guarantees every dated entry has named
triggers.

| Due | ADRs |
| --- | --- |
| 2026-10-31 | [0006](0006-ahp-is-the-wrong-layer.md), [0007](0007-a2a-adopt-nothing-watchlist-a-facade.md), [0008](0008-litellm-is-the-credential-and-metering-seam.md), [0009](0009-paperclip-mine-for-design-never-integrate.md) — the quarterly market re-scan (`design.md` §10) |
| 2027-04-01 | [0005](0005-build-a-dedicated-dispatch-plane.md) — the project review gate (`design.md` §10) |
