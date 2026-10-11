---
type: Pitfall
title: "mise run setup puts the old Ploeg pin back"
description: "setup checks out apps/ploeg at the committed pin; commit a moved pin before running it again."
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/contributing/set-up-a-worktree.md
tags: [ploeg, pin, submodule, setup, apps/ploeg, upgrade, release]
timestamp: 2026-10-11T00:00:00Z
---

# mise run setup puts the old Ploeg pin back

`mise run setup` runs `git submodule update`, which checks `apps/ploeg` out at the commit the superproject records. A pin moved in the working tree but not yet committed is silently reverted. See [Set up a worktree](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/contributing/set-up-a-worktree.md).
