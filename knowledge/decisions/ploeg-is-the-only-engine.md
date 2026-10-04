---
type: Decision
title: Ploeg is the only engine; Unfold is its front end
description: "ADR-0002: Ploeg authorizes, budgets and executes every Run; Unfold gains no execution features."
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/adr/adr-0002-ploeg-is-the-only-engine.md
tags: [adr, ploeg, unfold, engine, execution]
timestamp: 2026-10-04T00:00:00Z
---

# Ploeg is the only engine; Unfold is its front end (ADR-0002)

- Ploeg (`apps/ploeg`, Go) authorizes, budgets and executes every agent Run.
- The Unfold application (`apps/unfold`, TypeScript) is where people define, follow and review work. Without Ploeg it runs only the
  deterministic demo, which says it is one and never invents model calls or spend.
- Until the application's engine is retired, a managed execution never falls back to standalone,
  whatever the failure, and the application's engine gains no execution features.

A feature that changes what an agent receives belongs in Ploeg; Unfold collects and shows.
See [Ploeg changes land in ploeg-hq first](ploeg-changes-land-upstream-first.md).
