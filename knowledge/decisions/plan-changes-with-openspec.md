---
type: Decision
title: "Non-trivial changes are planned as OpenSpec changes"
description: "ADR-0033: a change with requirements is an OpenSpec change whose adr step writes to the ADR ledgers."
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/adr/adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md
tags: [openspec, spec, proposal, design, adr, requirements, planning]
timestamp: 2026-10-11T00:00:00Z
---

# Non-trivial changes are planned as OpenSpec changes

A change with requirements lives under `openspec/changes/<id>/` with the `spec-driven-with-adr` schema: proposal, specs, design, an ADR review, tasks. Durable decisions go to `docs/adr/` or `apps/unfold/docs/adrs/`, never inside `openspec/`. See [How work on Unfold is done](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/contributing/way-of-working.md).
