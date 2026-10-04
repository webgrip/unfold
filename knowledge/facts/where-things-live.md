---
type: Fact
title: Where things live
description: Applications, shared docs, ledgers and agent configuration in the Unfold repository.
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/CLAUDE.md
tags: [layout, docs, agents, unfold, ploeg]
timestamp: 2026-10-04T00:00:00Z
---

# Where things live

- `apps/ploeg` (submodule) and `apps/unfold`; each application's `AGENTS.md` adds its own
  rules. Read it before changing that application.
- Shared guides in `docs/`, starting at `docs/index.md`. Application contracts, ADRs and
  research stay inside the application.
- `.openhands/`, `.opencode/` and `.agents/` configure agents working on Unfold itself.
  What Ploeg supports for other repositories is in `apps/ploeg/pkg/harness` and
  `apps/ploeg/docs/contracts/`.
- The application's routes that talk to Ploeg sit under `/api/ploeg/`.

Words: a Run is one Role executing against a Work Item; a Shift is the whole attempt
(`docs/reference/glossary.md`). See [Ploeg is the only engine](../decisions/ploeg-is-the-only-engine.md).
