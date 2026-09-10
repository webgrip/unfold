## [0.3.0-rc.6](https://forgejo.webgrip.dev/webgrip/de-vloer/compare/v0.3.0-rc.5...v0.3.0-rc.6) (2026-09-10)

### Added

* **links:** link ClickUp or GitLab by pasting a personal token, with no application registered ([46d8a10](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/46d8a1056f849460014797c79e660d7cde91b313))

## [0.3.0-rc.5](https://forgejo.webgrip.dev/webgrip/de-vloer/compare/v0.3.0-rc.4...v0.3.0-rc.5) (2026-09-10)

### Added

* **auth:** sign in with the estate's identity provider ([cc8073b](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/cc8073b3fdf4cf5c68a69bf850556a4858ed404f))
* **links:** let a person link their GitLab account and clone private repositories with it ([3e03be9](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/3e03be94b5c5d638926775ce999a82880cbf2363))
* **sessions:** a Gateway tab that shows who served each request and what the gateway did ([4ff8ce8](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/4ff8ce8fd46740c3e43a81b9594f1f8d9b136e34))
* **sessions:** automatic tool approval in isolated placements, live observed spend, and a budget-exhausted failure ([03ef124](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/03ef124639d7775c2069e54c7ce114c47abd5329))
* **sessions:** gateway policy that fails closed, the brief each role received, and a cost curve ([95a52a2](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/95a52a28e3cf1ce8d8caeb16ab886f64a9a2df2d))
* **sessions:** link every session to the estate's dashboards, traces and logs, and list strict aliases ([7b8ce25](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/7b8ce2580bd124fecd73bc9c064549bba34bc367))
* **sessions:** show what the crew did, which model answered, and let analysis roles answer without a verdict ([fe0b9b4](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/fe0b9b4a994c3f6e53ad10262557967d81a7b75d))
* **sessions:** try a failed session again, duplicate it, and link ClickUp beside GitLab ([e0ffac5](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/e0ffac5eb3b7ca3cf99433aedd1aca1c7b788a09))
* **vscode:** bring the editor to parity with the workbench ([4102bb4](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/4102bb451a99f269a79ae1b0b052440b1f7b9664))

### Fixed

* **links:** name the GitLab exchange failure and explain a confidential application ([b609714](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/b609714b08e0aff506d72e214934a267e24ec5e8))
* **runtime:** tell a gateway outage from a refusal, and let the clone step report git's error ([86c18f0](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/86c18f054ba69a6fc8f19295889eebbbbcd4369e))
* **ui:** declare the observed spend before the session template uses it ([3efb458](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/3efb4588fe3a1cd04c74b7f787fa431cff15c234))
* **workspace:** keep the linked credential on the repository the manager validates ([87c9096](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/87c90960fb492105861b446cb4938ad86b64bba6))

### Docs

* propose that people sign in with the estate and link their own accounts ([4b605b8](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/4b605b843f1d45c1f2d7fbd5cd75a8c9b9a853eb))
* record what Ploeg and De Vloer each do, propose the operator read API, list gateway capabilities ([4927342](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/4927342d429d0653be052bb3ed57902cc348dd75))
* regenerate the consolidated design for tickets PV-079 through PV-085 ([0700edc](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/0700edcf3fc347242afd9e3ebb818ff6ce776898))

## [0.3.0-rc.4](https://forgejo.webgrip.dev/webgrip/de-vloer/compare/v0.3.0-rc.3...v0.3.0-rc.4) (2026-09-10)

### Fixed

* **release:** take the distribute lanes that use the runner's own cosign ([7fdea66](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/7fdea66ad07bde155fffd3d8b714f89da97792dd))

### Docs

* record the outcome of the first three hosted releases ([8ad8e43](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/8ad8e431e3328ab7bc755794fe7c27ec68554ed7))

## [0.3.0-rc.3](https://forgejo.webgrip.dev/webgrip/de-vloer/compare/v0.3.0-rc.2...v0.3.0-rc.3) (2026-09-10)

### Added

* **kubernetes:** offer user namespaces for workspace pods ([432eb7e](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/432eb7ea2eea54ccedf1ccb04d1b8f7beb916ebc))

### Fixed

* **release:** hold the GitHub mirror until its repository exists ([c94ce15](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/c94ce1538f134fb81242b5d3ab674eac58389cdc))

## [0.3.0-rc.2](https://forgejo.webgrip.dev/webgrip/de-vloer/compare/v0.3.0-rc.1...v0.3.0-rc.2) (2026-09-10)

### Fixed

* **release:** create the release directly so Forgejo emits the published event ([1898da7](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/1898da740851a34218d0ca6fad8599530a740bad))

## [0.3.0-rc.1](https://forgejo.webgrip.dev/webgrip/de-vloer/compare/v0.2.0...v0.3.0-rc.1) (2026-09-10)

### Added

* let sandboxes dial out through a pull-based relay instead of exposing a port ([d11ad43](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/d11ad4399e2306aa938cd613f7731f9951e0ecc9))
* release images, chart and extension on one hardened Forgejo train ([00d9eca](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/00d9ecac5a2091edc402de7d19adff2cea5f5a0b))
* run agent workspaces in a sandboxed container and choose placement per session ([da04129](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/da041290a853e1220da5d01e0bd319c4204527ef))
* serve every session as an Agent Host Protocol host over WebSocket ([70abc39](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/70abc3923283c12f0b3511b756f4971961505337))
* show the recorded cause of workspace failures ([e16003e](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/e16003e8b131f31097045734b8cd73e8d40d0cda))
* sign every captured candidate with in-toto provenance and an Agent Trace record ([f11cc14](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/f11cc146b2dc0d6d451fafb20cfce0a0110bc988))
* **vscode:** attach the workbench as an agent host from the command palette ([83b34c6](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/83b34c6fa2e4d496af9a8f3e15ff7ef778d6b6ed))
* **vscode:** rebuild the operator experience for review, decisions and live progress ([0f03acb](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/0f03acbf3653b7e583a9ff6c95c38be9fb4a66dd))
* warm Kata sandboxes through the Sandbox CRDs, pool assignment and in-place capture ([2321943](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/2321943a54c6441a987556c939afc5fbe76d6588))

### Docs

* record which release prerequisites are done and which are deferred ([0251314](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/02513144103bc3976ba016199cb5679020343c65))

### CI

* build the docs site from the repository root like the generate step ([64d950c](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/64d950c8c4644f5b07aece0ac584d90d8d546ddf))

### Internal

* pin opencode 1.18.30 through mise and ignore local launch scripts ([aa05979](https://forgejo.webgrip.dev/webgrip/de-vloer/commit/aa05979f106cd692125fc25bdd549a15c3f156bc))

# Changelog

## Unreleased

### Added

- A pull transport for sandboxes: the agent image bakes a worker that dials out to the workbench, so a Docker container publishes no port and a pod needs no Service or ingress rule; candidates are captured in place through the same channel, and warm pods receive their session over it. [ADR 0011](docs/adrs/0011-sandboxes-dial-out-through-a-relay.md).
- An Agent Host Protocol 0.9.0 host on the workbench port: sessions, chats, permissions, questions and changesets over WebSocket for any number of clients, with personal connection tokens from `POST /api/agent-host/tokens` and a VS Code `chat.remoteAgentHosts` entry. [ADR 0012](docs/adrs/0012-agent-host-protocol-host.md).
- A `sandbox` provisioner for Kubernetes using the agent-sandbox CRDs: cold `Sandbox` objects under a RuntimeClass or `SandboxClaim`s against a warm Kata pool, with an example template under `ops/cluster/agent-sandbox`. [ADR 0013](docs/adrs/0013-sandbox-crd-placement-with-warm-kata-pools.md).
- Signed candidates: an in-toto provenance statement and an Agent Trace record in DSSE envelopes, a public key endpoint and `scripts/verify-candidate.mjs`. [ADR 0014](docs/adrs/0014-signed-candidates.md).
- Research notes on the sandbox landscape, the Agent Host Protocol and Kubernetes 1.36 and 1.37 features under `docs/research/`.
- A `docker` workspace backend. The clone and the OpenCode server run inside a hardened container from the pinned agent image, bind-mounted to the session directory, with only the session's scoped LiteLLM key inside. Candidate capture waits for a confirmed container stop. Qualified against the locally built image by `scripts/probe-docker.mjs` without inference.
- Per-session workspace placement. `runtime.backends` lists the enabled backends, `POST /api/sessions` and task imports accept `placement`, and the browser and VS Code extension offer the choice when more than one backend is enabled. [ADR 0009](docs/adrs/0009-workspace-placement-is-a-session-choice.md).
- `runtime.agentEnvironment`, an allow-list of environment variable names copied from the server process into local and Docker workspaces, refusing names that carry workbench, gateway, cluster or vault authority. `kubernetes.agentSecrets` and the chart's `workspaceAgentSecrets` mount named Secrets into the agent container only.

- Forgejo release pipeline in the estate's shape: `on_pull_request`, `on_source_change`, `on_release_published` and `on_docs_change`, semantic-release on one `v<semver>` train that versions the chart, both `package.json` files and the VSIX, Harbor images built from the tag, a CVE budget gate before cosign signing, chart push, Forgejo and GitHub mirrors, and extension publication to Open VSX and optionally the Marketplace. [ADR 0010](docs/adrs/0010-one-release-train-with-zero-cve-images.md), [releases](docs/operations/release.md).

### Changed

- Both images are rebuilt on Docker Hardened Images (Alpine) through the Harbor proxy. The workbench image is shell-less and package-manager-free; the agent image fetches the musl OpenCode binary at build time and upgrades from the hardened feed. Trivy reports zero findings at every severity for both, against 14 critical and 83 high on the previous Debian agent image.
- The Helm chart defaults both images to its `appVersion`, so pinning the chart pins the images; `workspaceImage` and `image.tag` become overrides.
- `/api/health` and `/healthz` report the version from `package.json` instead of a hardcoded string.
- The GitHub workflow tree is removed; Forgejo is the sole workflow tree and GitHub a mirror.
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
