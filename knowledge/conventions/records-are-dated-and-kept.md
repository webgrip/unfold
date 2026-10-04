---
type: Convention
title: Records are dated and kept
description: "Research, evidence and OpenSpec changes are records: dated, never edited, out of navigation."
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/documentation.md
tags: [docs, research, records, adr]
timestamp: 2026-10-04T00:00:00Z
---

# Records are dated and kept

Research, evidence, superseded explanations, design baselines, planning exports and
OpenSpec changes are records. A record keeps its path and content; only a
superseded-by link may be added. The docs build marks records as not current guidance
and leaves them out of search, navigation and `llms.txt`.

Current pages carry front matter (`type`, `audience`, `owner`, `last_verified`,
`verified_by`). Decisions go in the ledger of their scope: system (`docs/adr`), Ploeg or
Unfold. A `proposed` ADR is a question, not a decision.
