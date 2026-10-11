---
type: Pitfall
title: "Edits inside apps/ploeg are lost on the next pin"
description: "Ploeg's code, docs, domain model and ADRs come from the pinned ploeg-hq release; change them in ploeg-hq."
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md
tags: [ploeg, apps/ploeg, submodule, pin, go, engine, contract]
timestamp: 2026-10-11T00:00:00Z
---

# Edits inside apps/ploeg are lost on the next pin

Anything changed inside `apps/ploeg` in this repository disappears when the pin next moves, and a pull request that edits it here cannot be merged upstream as is. An Unfold change that needs new Ploeg behaviour waits for the Ploeg release that carries it ([ADR-0019](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md)).
