---
type: Pitfall
title: "mise run setup puts the pinned Ploeg bundle back"
description: "setup unpacks the Ploeg contract bundle that apps/unfold/ploeg-release.json pins, replacing any other bundle in apps/ploeg."
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/adr/adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md
tags: [ploeg, pin, contract bundle, setup, apps/ploeg, upgrade, release]
timestamp: 2026-10-18T00:00:00Z
---

# mise run setup puts the pinned Ploeg bundle back

`mise run setup` runs `scripts/ploeg-contract.py fetch`, which replaces whatever bundle is in `apps/ploeg` with the one `apps/unfold/ploeg-release.json` pins. A bundle unpacked with `fetch-unpinned` to try a newer or unreleased Ploeg is silently replaced. Move the pin with `mise run ploeg-pin 0.x.y-rc.N` instead ([ADR-0039](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/adr/adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md)).
