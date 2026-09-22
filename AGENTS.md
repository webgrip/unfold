# Glide

Trunk is `development`. The owner authorized this monorepo import. Use conventional commits and stage explicit paths. Keep source comments limited to machine directives and exported API documentation.

Glide turns work items into pull requests that are ready for human review. Ploeg authorizes, budgets and executes every agent run; Vloer is its front end, and without Ploeg it runs only the deterministic demo ([ADR-0002](docs/adr/adr-0002-ploeg-is-the-only-engine.md)). Until Vloer's engine is retired, a managed execution never falls back to standalone, whatever the cause. Do not add execution features to Vloer's engine. Use Ploeg's terms: a Run is one Role executing against a Work Item, and a Shift is the whole attempt. Preserve application-specific package, module, image and chart identities.

Read the [system guide](docs/index.md), each application's architecture and its scoped AGENTS.md before changing behavior. Source and executable tests describe implementation; label proposed behavior. Shared guides belong in root docs; application contracts and decision history stay with their application.
Use `mise exec --` for tooling. Run `mise run verify` before delivery; live providers remain opt-in. A deterministic demo must say so and must never invent model calls or spend. Do not change production desired state as part of a repository refactor.
