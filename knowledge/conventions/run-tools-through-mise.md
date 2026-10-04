---
type: Convention
title: Run every tool through mise
description: Run mise run setup once, then every tool through mise exec --; mise run verify before delivery.
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/CLAUDE.md
tags: [mise, toolchain, verify, test]
timestamp: 2026-10-04T00:00:00Z
---

# Run every tool through mise

- Run `mise run setup` once, then run every tool through `mise exec --`.
- Run `mise run verify` before delivery. It runs both application gates and the
  cross-application qualification. Live-provider tests stay opt-in.
- After changing anything under `docs/`, an application's `docs/` or an `AGENTS.md`,
  run `mise run docs-check`. See [records](records-are-dated-and-kept.md).
