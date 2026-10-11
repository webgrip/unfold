---
type: Pitfall
title: "A tool version bump without mise.lock breaks every run"
description: "CI refuses a tool the committed mise.lock does not hold; commit the rewritten lockfile with the bump."
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/operations/ci-troubleshooting.md
tags: [mise, mise.toml, mise.lock, lockfile, tool, version, upgrade, dependency]
timestamp: 2026-10-11T00:00:00Z
---

# A tool version bump without mise.lock breaks every run

`checks` fails in under a minute with `<tool>@<version> is not in the lockfile`. Run `mise install` from the repository root after changing a version in any `mise.toml`, and commit `mise.lock` in the same commit. A tool named in several `mise.toml` files carries the same version in each.
