---
description: Rules for this repository
---
# Unfold

Unfold turns units of work (Work Items) into pull requests that are ready for human review. Ploeg (`apps/ploeg`, Go) authorizes, budgets and executes every agent Run. The Unfold application (`apps/unfold`, TypeScript) is where people define, follow and review that work ([ADR-0002](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/adr/adr-0002-ploeg-is-the-only-engine.md)). Use the [glossary](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/reference/glossary.md) terms: a Run is one Role executing against a Work Item, and a Shift is the whole attempt.

## Commands

- Run `mise run setup` once, then run every tool through `mise exec --`.
- Run `mise run verify` before delivery. It runs every application's gates and the cross-application qualification. Live-provider tests stay opt-in.
- Run `mise run docs-check` after changing anything under `docs/` or an application's `docs/`, and `mise run agents-check` after changing anything under `.apm/`.

## Rules

- Trunk is `development`.
- Unfold depends on a released [ploeg-hq/ploeg](https://github.com/ploeg-hq/ploeg) ([ADR-0039](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/adr/adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md)). `apps/ploeg` is its unpacked contract bundle; never edit it. Change Ploeg upstream.
- Unfold never executes new work types; until the engine is deleted, a managed execution never falls back to standalone.
- A deterministic demo says it is one and never invents model calls or spend.
- Keep each application's package, module, image and chart identities. [ADR-0020](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/adr/adr-0020-unfold-is-the-application-and-the-name-vloer-is-retired.md) records the one exception.
- Never change production desired state as part of a repository refactor. It lives in `webgrip/homelab-cluster`.
- Code and executable tests describe the implementation. Label proposed behavior as proposed.

## Where things live

- Rules for one directory live in `.apm/instructions/<name>.instructions.md` with an `applyTo` glob; Claude Code gets them as `.claude/rules`, the other agents in that directory's generated `AGENTS.md`. Never edit a generated `AGENTS.md`.
- Before product, pricing, portal or tenancy work, read [Who Unfold is for](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/concepts/who-unfold-is-for.md): self-hosted first, then a hosted service for agencies (system ADRs 0005–0010), none of it built yet.
- Shared guides start at [docs/index.md](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/index.md); application contracts, ADRs and research stay inside the application.
- Before changing behavior that crosses Ploeg and Unfold, read [managed execution](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/workflows/managed-execution.md).
- Before opening or reviewing a pull request, read [How work on Unfold is done](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/contributing/way-of-working.md) and the [review guide](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/contributing/review.md).
- Before adding an agent rule, skill or command, read [Agent instructions](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/contributing/agent-instructions.md) for where it belongs.
