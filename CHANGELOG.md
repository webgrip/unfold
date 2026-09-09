# Changelog

## Unreleased

### Added

- A `docker` workspace backend. The clone and the OpenCode server run inside a hardened container from the pinned agent image, bind-mounted to the session directory, with only the session's scoped LiteLLM key inside. Candidate capture waits for a confirmed container stop. Qualified against the locally built image by `scripts/probe-docker.mjs` without inference.
- Per-session workspace placement. `runtime.backends` lists the enabled backends, `POST /api/sessions` and task imports accept `placement`, and the browser and VS Code extension offer the choice when more than one backend is enabled. [ADR 0009](docs/adrs/0009-workspace-placement-is-a-session-choice.md).
- `runtime.agentEnvironment`, an allow-list of environment variable names copied from the server process into local and Docker workspaces, refusing names that carry workbench, gateway, cluster or vault authority. `kubernetes.agentSecrets` and the chart's `workspaceAgentSecrets` mount named Secrets into the agent container only.

### Changed

- Workspace failures now record the actual cause. The failing command, its exit code or signal and the tail of its standard error are captured for `git` steps and the OpenCode launch, redacted, bounded and shown in the browser and VS Code failure notice as `failure.detail`. Runtime exception text still never enters the failure record.

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
