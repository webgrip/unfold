---
type: Decision
title: Ploeg changes land in ploeg-hq first
description: "ADR-0019: apps/ploeg is a submodule pinned to ploeg-hq/ploeg releases."
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-vloer.md
tags: [adr, ploeg, submodule, release, pin]
timestamp: 2026-10-04T00:00:00Z
---

# Ploeg changes land in ploeg-hq first (ADR-0019)

`apps/ploeg` is a submodule pinned to `github.com/ploeg-hq/ploeg`. A Ploeg change lands
in that repository first; Unfold then pins its release in a `ploeg`-scoped commit.
Ploeg's pages, model and decision ledger come from the pinned commit, so editing them
inside `apps/ploeg` here is lost on the next pin.

A Unfold change that needs new Ploeg behavior waits for that Ploeg release.
