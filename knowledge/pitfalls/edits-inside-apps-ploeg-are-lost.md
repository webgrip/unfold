---
type: Pitfall
title: "Edits inside apps/ploeg are lost on the next pin"
description: "Ploeg's code, docs, domain model and ADRs come from the pinned ploeg-hq release; change them in ploeg-hq."
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/adr/adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md
tags: [ploeg, apps/ploeg, contract bundle, pin, go, engine, contract]
timestamp: 2026-10-18T00:00:00Z
---

# Edits inside apps/ploeg are lost on the next pin

`apps/ploeg` is the unpacked contract bundle of the pinned Ploeg release, ignored by Git. Anything changed there is never committed and disappears on the next `mise run setup` or pin move. An Unfold change that needs new Ploeg behaviour waits for the Ploeg release that carries it ([ADR-0039](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/adr/adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md)).
