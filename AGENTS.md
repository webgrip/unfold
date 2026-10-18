# Unfold

Unfold turns units of work (Work Items) into pull requests that are ready for human review. Ploeg (`apps/ploeg`, Go) authorizes, budgets and executes every agent Run. The Unfold application (`apps/unfold`, TypeScript) is where people define, follow and review that work ([ADR-0002](docs/adr/adr-0002-ploeg-is-the-only-engine.md)). Use the [glossary](docs/reference/glossary.md) terms: a Run is one Role executing against a Work Item, and a Shift is the whole attempt.

## Commands

- Run `mise run setup` once, then run every tool through `mise exec --`.
- Run `mise run verify` before delivery. It runs every application's gates and the cross-application qualification. Live-provider tests stay opt-in.
- Run `mise run docs-check` after changing anything under `docs/`, an application's `docs/`, or an `AGENTS.md`.

## Rules

- Trunk is `development`. Use conventional commits.
- Unfold depends on a released [ploeg-hq/ploeg](https://github.com/ploeg-hq/ploeg) ([ADR-0039](docs/adr/adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md)). `apps/ploeg` is its unpacked contract bundle; never edit it. Change Ploeg upstream.
- Stage only the paths you wrote. Never use `git add -A`, `git add .` or `git commit -a`: other sessions share this checkout, and a whole-tree commit absorbs their uncommitted work.
- Source comments are limited to machine directives and exported API documentation. Put reasoning in names, tests, docs or an ADR.
- Unfold never executes new work types; until the engine is deleted, a managed execution never falls back to standalone.
- A deterministic demo says it is one and never invents model calls or spend.
- Keep each application's package, module, image and chart identities. [ADR-0020](docs/adr/adr-0020-unfold-is-the-application-and-the-name-vloer-is-retired.md) records the one exception.
- Never change production desired state as part of a repository refactor. It lives in `webgrip/homelab-cluster`.
- Code and executable tests describe the implementation. Label proposed behavior as proposed.

## Where things live

- A directory's `AGENTS.md` adds rules for the files under it, such as each application's and `.forgejo/`'s. Read the nearest one before changing a file.
- Before product, pricing, portal or tenancy work, read [Who Unfold is for](docs/concepts/who-unfold-is-for.md): self-hosted first, then a hosted service for agencies (system ADRs 0005–0010), none of it built yet.
- Shared guides start at [docs/index.md](docs/index.md); application contracts, ADRs and research stay inside the application.
- Before changing behavior that crosses Ploeg and Unfold, read [managed execution](docs/workflows/managed-execution.md).
- Before opening or reviewing a pull request, read [How work on Unfold is done](docs/contributing/way-of-working.md) and the [review guide](docs/contributing/review.md).
- Before adding an agent rule, skill or command, read [Agent instructions](docs/contributing/agent-instructions.md) for where it belongs.
