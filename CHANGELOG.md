# Changelog

## 0.2.0 — 2026-09-09

### Added

- One server-side task connection contract with Forgejo, GitHub, GitLab, ClickUp and Vikunja adapters, plus explicit demonstration tasks.
- Task browse, preview and operator-led import into queued sessions, retaining source identity and revision. A separate start action authorizes execution.
- Repository/source execution ownership declarations that keep the interactive lane separate from sources reserved for Ploeg.
- Candidate export with a manifest, binary-capable patch and Git snapshot bundle for supported workspaces.
- VS Code 0.2.0 Linked Tasks view, task import and retained snapshot commands, and explicit candidate downloads.
- A full example configuration for all five task providers, provider setup guidance, a coworker walkthrough and the current Vloer self-improvement loop.

### Scope

Task adapters read provider APIs. They do not change assignment/status, install webhooks or publish proposals. Connection registration uses administrator configuration; OAuth/App installation and a graphical connection wizard remain planned. Ploeg continues to own unattended dispatch; distributed claims and canonical WorkOrders are not supplied by an interactive import.

Candidate export preserves reviewable repository changes. Independent live verification, forge publication, merge and release remain human operations. See [the iteration guide](docs/operations/iteration-0.2.0.md) for supported scope and [validation](docs/validation.md) for executed checks and unqualified integrations.

## 0.1.1 extension and first implementation increment — 2026-09-09

- Browser/editor keyboard evidence navigation, durable draft/focus/reading behavior and safe actionable failure guidance.
- Reviewable Ploeg foundation patch for scope preservation, authenticated intake and required explicit review approval, with Go/PostgreSQL qualification pending.
- Backlog candidate evidence and remaining acceptance work preserved in generated briefs and exports.

## 0.1.0 — 2026-09-09

- Initial native Node 24/SQLite workbench with durable sessions, crews, event replay, local authentication, budget authorization and human intervention.
- Deterministic Git/Node demo with real regression evidence and zero model calls.
- OpenCode integration, command bridge, LiteLLM virtual-key lifecycle and Kubernetes workspace provisioning.
- Initial VS Code extension, complete product/market design, 78-ticket backlog, import artifacts and deployment examples.
