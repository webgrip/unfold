# Glide

Glide turns units of work (Work Items) into pull requests that are ready for human review. Ploeg (`apps/ploeg`, Go) authorizes, budgets and executes every agent Run. Vloer (`apps/vloer`, TypeScript) is its front end; without Ploeg it runs only the deterministic demo ([ADR-0002](docs/adr/adr-0002-ploeg-is-the-only-engine.md)). Use the [glossary](docs/reference/glossary.md) terms: a Run is one Role executing against a Work Item, and a Shift is the whole attempt.

## Commands

- Run `mise run setup` once, then run every tool through `mise exec --`.
- Run `mise run verify` before delivery. It runs both application gates and the cross-application qualification. Live-provider tests stay opt-in.
- Run `mise run docs-check` after changing anything under `docs/`, an application's `docs/`, or an `AGENTS.md`.

## Rules

- Trunk is `development`. Use conventional commits.
- Stage only the paths you wrote. Never use `git add -A`, `git add .` or `git commit -a`: other sessions share this checkout, and a whole-tree commit absorbs their uncommitted work.
- Source comments are limited to machine directives and exported API documentation. Put reasoning in names, tests, docs or an ADR.
- Until Vloer's engine is retired, a managed execution never falls back to standalone, whatever the failure. Do not add execution features to Vloer's engine.
- A deterministic demo says it is one and never invents model calls or spend.
- Keep each application's package, module, image and chart identities.
- Never change production desired state as part of a repository refactor. It lives in `webgrip/homelab-cluster`.
- Code and executable tests describe the implementation. Label proposed behavior as proposed.

## Where things live

- Each application's `AGENTS.md` adds its own rules. Read it before changing that application.
- Shared guides are in `docs/`, starting at [docs/index.md](docs/index.md). Application contracts, ADRs and research stay inside the application.
- Before changing behavior that crosses Ploeg and Vloer, read [managed execution](docs/workflows/managed-execution.md).
- `.openhands/`, `.opencode/` and `.agents/` hold configuration for agents working on Glide itself. What Ploeg supports for other repositories is defined in `apps/ploeg/pkg/harness` and `apps/ploeg/docs/contracts/`.
