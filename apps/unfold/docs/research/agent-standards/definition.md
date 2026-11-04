# Agent definition, packaging and LLM APIs

Generated from [`standards.yaml`](standards.yaml); see the [catalogue](index.md).

## Agent Skills (SKILL.md) { #agent-skills }

| | |
| --- | --- |
| Steward | AAIF (contributed by Anthropic, 2026-10-22) (foundation) |
| Status | stable |
| Latest | [unversioned spec; last commit in agentskills/agentskills 2026-08-09](https://agentskills.io/specification) |
| Radar | **adopt**: Maturity and fit both hold: now an AAIF project with wide client support, and Unfold already ships SKILL.md skills while Ploeg ADR-0083 and ADR-0092 build on the same unit. |
| Moves when | The specification adds a version, lock or index format that conflicts with Ploeg's digest catalogue (Ploeg ADR-0092's own trigger), which would move it to trial for the catalogue part. |
| Competes with | [goose recipes](definition.md#goose-recipes) |
| Complements | [AGENTS.md](definition.md#agents-md), [Skills Extension for MCP (io.modelcontextprotocol/skills, SEP-2640)](tool.md#skills-over-mcp) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0092-a-team-pins-its-skills-in-a-catalogue-that-ploegd-fetches-once-and-serves-by-digest](../../../../../apps/ploeg/docs/adrs/0092-a-team-pins-its-skills-in-a-catalogue-that-ploegd-fetches-once-and-serves-by-digest.md), [0083-a-run-is-told-which-skills-bear-on-its-work-item](../../../../../apps/ploeg/docs/adrs/0083-a-run-is-told-which-skills-bear-on-its-work-item.md), [0035-runs-get-ploeg-owned-skills-mounted-toolchains-and-worker-verification](../../../../../apps/ploeg/docs/adrs/0035-runs-get-ploeg-owned-skills-mounted-toolchains-and-worker-verification.md), [0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills](../../../../../apps/ploeg/docs/adrs/0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills.md), [0047-people-link-their-own-agent-sessions-through-a-plugin-agent-trace-and-telemetry-never-a-claude-sign-in](../../../../../apps/unfold/docs/adrs/0047-people-link-their-own-agent-sessions-through-a-plugin-agent-trace-and-telemetry-never-a-claude-sign-in.md), [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md) |
| Watchlist | T10, T17, T28 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Team skill catalogue pinned by digest | Ploeg dispatch, skill catalogue | Proposed: implement Ploeg ADR-0092 (proposed) so a Team pins SKILL.md directories by commit and hash and ploegd serves them to every harness, validated with skills-ref. | M | Every Run gets the same reviewed skills whichever harness runs it. |
| Name the relevant skills in the Run prompt | Ploeg worker | Decided in Ploeg ADR-0083 (accepted): the worker selects skills with the knowledge pack matcher and names them in the prompt. | S | Weaker models still load the right skill. |
| Ship Unfold's skills in the Agent Plugin | Agent Plugin (apps/unfold/extensions/claude-code) | Built: the plugin ships the unfold and link-work-item skills under the Agent Plugins 1.0.0 manifest; proposed: add an operate-session skill and offer the enabledPlugins snippet to connected repositories (T17). | S | Developers' own agents know how to use Unfold without setup. |
| Same skills for people and Runs over MCP | ploeg-mcp | Proposed: serve a Team's pinned catalogue through Skills over MCP once the Go SDK ships the extension and Claude Code or VS Code consumes it (T10). | S | A developer's agent uses exactly the skills the Team's Runs use. |
| Treat allowed-tools as advisory only | Ploeg Team manifest | Proposed: document that SKILL.md allowed-tools never grants anything; permissions come from the Team's may list in Ploeg ADR-0110 and the worker enforces them. | S | An experimental field cannot widen what a Run may do. |

**Shipped adoption:** AAIF project since 2026-10-22 (https://www.linuxfoundation.org/press/agentic-ai-foundation-announces-four-new-projects-agent-skills-open-responses-openenv-and-opensandbox); skills-ref validator (https://github.com/agentskills/agentskills/tree/main/skills-ref); 'Over 70 platforms, 1M skills' [secondary] (https://www.flowhunt.io/blog/agentic-ai-foundation-agent-skills-open-responses/)

**Open problems:** allowed-tools field is experimental and varies by implementation (https://agentskills.io/specification)

**Watched:** rss `https://github.com/agentskills/agentskills/commits/HEAD.atom`

## AGENTS.md { #agents-md }

| | |
| --- | --- |
| Steward | Agentic AI Foundation (AAIF) (foundation) |
| Status | stable |
| Latest | [unversioned; last repo commit 2026-09-10](https://github.com/agentsmd/agents.md) |
| Radar | **adopt**: Maturity and fit both hold: AAIF-governed, read by every harness Ploeg runs, and already the canonical instruction file in Unfold and in the prepare-a-repository guide. |
| Moves when | AAIF publishes a versioned AGENTS.md schema or precedence rules that conflict with Ploeg ADR-0030's ordering, which would need a new decision. |
| Competes with | — |
| Complements | [Agent Skills (SKILL.md)](definition.md#agent-skills) |
| Builds on | — |
| Superseded by | — |
| Decisions | [2026-09-22-agents-md](../../../../../docs/research/2026-09-22-agents-md.md), [0030-target-repository-instructions-rank-below-the-delivery-contract](../../../../../apps/ploeg/docs/adrs/0030-target-repository-instructions-rank-below-the-delivery-contract.md), [0163-a-reviewer-reads-the-base-branchs-instruction-files-and-a-team-can-require-a-reviewer-unlike-its-writer](../../../../../apps/ploeg/docs/adrs/0163-a-reviewer-reads-the-base-branchs-instruction-files-and-a-team-can-require-a-reviewer-unlike-its-writer.md), [adr-0047-unfold-describes-a-repository-with-the-ai-codebase-maturity-model-and-delivers-at-level-5](../../../../../docs/adr/adr-0047-unfold-describes-a-repository-with-the-ai-codebase-maturity-model-and-delivers-at-level-5.md), [0066-a-runs-learnings-are-proposals-a-person-reviews-before-any-run-sees-them](../../../../../apps/ploeg/docs/adrs/0066-a-runs-learnings-are-proposals-a-person-reviews-before-any-run-sees-them.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Prepare-a-repository check for target repositories | Unfold repository readiness, Agency onboarding | Built in docs (docs/how-to/prepare-a-repository.md); proposed: a readiness check that flags a missing AGENTS.md or a CLAUDE.md that is not a symlink to it, feeding the maturity level of ADR-0047. | S | Agency repositories give Runs the same instructions whatever harness runs. |
| Reviewer reads base-branch AGENTS.md | Ploeg dispatch, reviewer Role | Decided in Ploeg ADR-0163: the reviewer reads instruction files from the base branch so a writer cannot edit the rules it is judged by; keep the delivery contract above them per Ploeg ADR-0030. | S | Review stays honest even when a Run edits AGENTS.md. |
| Generated AGENTS.md for Unfold's own repository | Unfold repository (.apm, AGENTS.md) | Built: the root AGENTS.md is generated by APM from .apm/instructions; keep mise run agents-check in CI so hand edits do not drift. | S | One source of agent instructions for every harness contributors use. |
| Suggest AGENTS.md edits from repeated review findings | Ploeg learnings, Unfold review | Proposed: when the same finding recurs across Work Items in one repository, draft an AGENTS.md change as a proposal a person reviews, per Ploeg ADR-0066. | M | Fewer review rounds per Work Item over time. |
| Size guard for instruction files | Ploeg worker prompt | Proposed: warn in the Run card when a target AGENTS.md exceeds Codex's 32 KiB read limit or contains generic overview text, from the 2026-09-22 research. | S | Cuts token cost the research showed these files add. |

**Shipped adoption:** AAIF hosted project (https://www.linuxfoundation.org/press/agentic-ai-foundation-announces-four-new-projects-agent-skills-open-responses-openenv-and-opensandbox)

**Open problems:** No versioning or schema; precedence with tool-specific files (CLAUDE.md) is left to tools; not investigated further

**Watched:** rss `https://github.com/agentsmd/agents.md/commits/HEAD.atom`

## AGNTCY Open Agentic Schema Framework { #agntcy-oasf }

| | |
| --- | --- |
| Steward | AGNTCY (Linux Foundation) (foundation) |
| Status | stabilising |
| Latest | [v1.1.0 2026-07-10](https://github.com/agntcy/oasf/releases) |
| Radar | **hold**: Fit decided it: Ploeg ADR-0110 already rejected OASF as the Team manifest because it describes what an agent offers, not what it may do or spend, and no person Unfold serves reads OASF today. |
| Moves when | The A2A facade (T6) is built, or OASF adds a permission grant or monetary budget object, or an Agency asks to be listed in an AGNTCY directory. |
| Competes with | [AI Catalog (formerly AI Card)](discovery.md#ai-catalog) |
| Complements | [AGNTCY Agent Directory](discovery.md#agntcy-dir), [AGNTCY Secure Low-latency Interactive Messaging](agent-agent.md#agntcy-slim) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills](../../../../../apps/ploeg/docs/adrs/0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills.md), [0007-a2a-adopt-nothing-watchlist-a-facade](../../../../../apps/ploeg/docs/adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md), [0092-a-team-pins-its-skills-in-a-catalogue-that-ploegd-fetches-once-and-serves-by-digest](../../../../../apps/ploeg/docs/adrs/0092-a-team-pins-its-skills-in-a-catalogue-that-ploegd-fetches-once-and-serves-by-digest.md) |
| Watchlist | T6, T33 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| OASF record beside the proposed A2A Agent Card | Ploeg dispatch, outward description | Proposed: when the A2A facade of Ploeg ADR-0007 is built, publish each Team's charter and intake as one OASF record next to its AgentSkill, exactly the outward-only use Ploeg ADR-0110 allows; permissions and spend stay out. | S | A Team becomes findable in an AGNTCY directory without a second description to maintain. |
| Agency directory listing for a hosted Tenant | Agency, hosted offering | Proposed: once hosted Unfold exists, list each Agency's public Teams in an AGNTCY Directory instance through generated OASF records, read from the Team manifest of Ploeg ADR-0110. | M | Gives an Agency a standard way to advertise what its Teams take on, if directories gain buyers. |
| Skill unit cross-check against OASF's agentskills module | Ploeg skill catalogue | Proposed: add a test that maps a Team's pinned skill catalogue (Ploeg ADR-0092) to OASF's agentskills module fields, so the catalogue stays exportable if a directory is adopted later. | S | Keeps the door open to OASF without a runtime dependency. |
| Import a third-party agent record as a proposed Team | Unfold Teams page, PWA | Proposed: read an OASF record and prefill a draft Team charter and skills for a person to edit; nothing runs until the Team is saved and reviewed. | M | Lowers the cost of starting a Team from an existing agent description. |
| Watch OASF for permission or budget objects | Ploeg ADR review calendar | Proposed: track agntcy/oasf releases against Ploeg ADR-0110's first re-evaluation trigger (a foundation spec adds a permission grant or monetary budget). | S | Turns the ADR's trigger into an observable check instead of a memory. |

**Shipped adoption:** Consumed by AGNTCY Directory: https://github.com/agntcy/dir

**Open problems:** Not crawled (verify-only scope).

**Watched:** github-releases `agntcy/oasf` at v1.1.0

## Compose Specification 'models' element (the closest thing to 'compose for agents') { #compose-models }

Not to be confused with: docker/compose-for-agents is a demo repo, not a spec (only release 'msbuild-demo' 2025-06-04, last commit 2026-10-23)

| | |
| --- | --- |
| Steward | Compose Specification (compose-spec org, Docker-led) (community) |
| Status | stable |
| Latest | ['## models' top-level section in spec.md; Docker Compose >= v2.38 required (no spec release tags) 2026-11-04](https://github.com/compose-spec/compose-spec/blob/main/spec.md) |
| Radar | **hold**: Fit decided it: Unfold runs on Kubernetes and every model call must pass the gateway, so a models element adds nothing to a Run today. |
| Moves when | The owner decides to ship a compose-based quickstart, or compose-spec adds an agents element read by a harness Ploeg runs. |
| Competes with | — |
| Complements | [Docker Agent (formerly cagent) agent YAML](definition.md#docker-agent), [Development Container Specification (devcontainer.json)](definition.md#devcontainer-spec) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0002-ploeg-is-the-only-engine](../../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md), [0181-a-delivered-pull-request-can-have-a-preview-environment-through-one-provision-status-and-teardown-contract](../../../../../apps/ploeg/docs/adrs/0181-a-delivered-pull-request-can-have-a-preview-environment-through-one-provision-status-and-teardown-contract.md), [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Local demo stack with a models element | Self-hosted quickstart | Proposed: a compose file for a laptop demo where models point at LiteLLM, never directly at Docker Model Runner, so the gateway rule of ADR-0002 holds. | S | A faster first look for self-hosters without a cluster. |
| Local model behind the gateway | LiteLLM gateway, self-hosted | Proposed: document a Docker Model Runner endpoint as a LiteLLM backend for self-hosters who want local models, metered as any provider. | S | Self-hosters can try Unfold without a paid model provider. |
| Preview environments from compose | Preview environment contract | Proposed: let a repository's compose file describe its preview environment under Ploeg ADR-0181, ignoring the models element. | M | Agencies with compose-based apps get previews without Kubernetes manifests. |
| Toolchain hints from compose | Ploeg worker toolchains | Proposed: read services in compose to suggest mounted toolchains (Ploeg ADR-0035). | S | Minor setup help. |
| Watch for a compose-for-agents spec | Research watchlist | Proposed: track compose-spec for an agents element beyond models. | S | Records the absence. |

**Shipped adoption:** Docker Compose models + Docker Model Runner (https://docs.docker.com/ai/compose/models-and-compose/)

**Open problems:** No dedicated compose-for-agents spec exists (absence verified via repo)

**Watched:** rss `https://github.com/compose-spec/compose-spec/commits/HEAD.atom`

## Development Container Specification (devcontainer.json) { #devcontainer-spec }

| | |
| --- | --- |
| Steward | Microsoft (containers.dev, devcontainers org) (single-vendor) |
| Status | stable |
| Latest | [unversioned spec; last spec repo commit 2026-03-20](https://github.com/devcontainers/spec) |
| Radar | **trial**: Fit decided it: the spec is mature and widely read, and the 2026-10-01 research already keeps devcontainer toolchains as a bounded spike behind Ploeg ADR-0035, though building images needs a container engine. |
| Moves when | The VIK-1679 spike builds a working toolchain image from a real Agency repository and a Run passes its checks with it (adopt), or no build path without privileged containers is found (hold). |
| Competes with | — |
| Complements | [AGENTS.md](definition.md#agents-md), [Compose Specification 'models' element (the closest thing to 'compose for agents')](definition.md#compose-models) |
| Builds on | — |
| Superseded by | — |
| Decisions | [2026-10-01-vscode-surface-and-agency-fit](../../../../../docs/research/2026-10-01-vscode-surface-and-agency-fit.md), [0035-runs-get-ploeg-owned-skills-mounted-toolchains-and-worker-verification](../../../../../apps/ploeg/docs/adrs/0035-runs-get-ploeg-owned-skills-mounted-toolchains-and-worker-verification.md), [0126-a-recurring-attack-drill-runs-every-harness-against-a-hostile-repository](../../../../../apps/ploeg/docs/adrs/0126-a-recurring-attack-drill-runs-every-harness-against-a-hostile-repository.md), [0143-a-persons-machine-is-a-personal-cell-and-a-run-gets-a-capability-only-when-its-person-grants-it](../../../../../apps/ploeg/docs/adrs/0143-a-persons-machine-is-a-personal-cell-and-a-run-gets-a-capability-only-when-its-person-grants-it.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Run toolchain image from a repository's devcontainer | Ploeg worker toolchains | Proposed: an operator-run job builds a toolchain image from a target repository's devcontainer.json and mounts it per Ploeg ADR-0035, the VIK-1679 spike from the 2026-10-01 research. | M | Runs get the exact toolchain the Agency's developers use, so checks pass the first time. |
| Readiness check for devcontainer.json | Repository readiness, Agency onboarding | Proposed: note a devcontainer.json in the repository description of ADR-0047 as a sign the toolchain is declared. | S | Tells an Agency what to add for better pull requests. |
| Guard against devcontainer lifecycle commands | Ploeg worker, attack drill | Proposed: never execute postCreateCommand or features from an untrusted repository inside a Run; add a hostile devcontainer.json to the Ploeg ADR-0126 drill. | S | Keeps the repository from running code in the Run. |
| A devcontainer for Unfold's own repository | Unfold repository contributors | Proposed: add a .devcontainer with mise for contributors, so VS Code agent sessions in dev containers work on Unfold itself. | S | Faster contributor setup. |
| Personal cell inside a dev container | Personal cell, VS Code extension | Proposed: let a person's machine run as a personal cell (Ploeg ADR-0143) inside a dev container so its capabilities are bounded by the container. | M | A safer local execution option for developers. |

**Shipped adoption:** Claude Code Dev Container Feature ghcr.io/anthropics/devcontainer-features/claude-code:1.0 and reference firewall container (https://code.claude.com/docs/en/devcontainer); VS Code 1.138 (2026-09-16) agent sessions in local dev containers [secondary] (https://www.infoworld.com/article/4225351/visual-studio-code-1-138-brings-agent-sessions-to-dev-containers.html)

**Open problems:** Not verified whether Codex Cloud, Cursor background agents or the Copilot coding agent read devcontainer.json; Spec repo quiet since 2026-03-20

**Watched:** rss `https://github.com/devcontainers/spec/commits/HEAD.atom`

## Docker Agent (formerly cagent) agent YAML { #docker-agent }

Not to be confused with: Compose 'models' element (separate record)

| | |
| --- | --- |
| Steward | Docker Inc. (single-vendor) |
| Status | stabilising |
| Latest | [v1.156.2; config 'version' enum '0'..'16' in agent-schema.json 2026-11-02](https://github.com/docker/docker-agent/releases) |
| Radar | **hold**: Maturity and fit both decided it: single-vendor with heavy schema churn, and it competes with Ploeg's own Team manifest rather than filling a seam. |
| Moves when | The config schema stays on one version for six months and an Agency asks to run its Docker agents through Ploeg. |
| Competes with | [Microsoft Agent Framework declarative agents (kind: Prompt YAML)](definition.md#maf-declarative), [goose recipes](definition.md#goose-recipes), [Open Agent Specification (Agent Spec)](definition.md#open-agent-spec) |
| Complements | [Compose Specification 'models' element (the closest thing to 'compose for agents')](definition.md#compose-models) |
| Builds on | — |
| Superseded by | — |
| Decisions | [2026-09-10-sandbox-landscape](../../../../../apps/unfold/docs/research/2026-09-10-sandbox-landscape.md), [0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills](../../../../../apps/ploeg/docs/adrs/0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Docker Agent as a Ploeg harness | Ploeg dispatch | Proposed: a harness profile for the docker agent CLI, only if it speaks ACP or can be driven headless with model calls through the LiteLLM gateway (Ploeg ADR-0177). | M | Would let Agencies on Docker Desktop reuse their agents under Ploeg's budget. |
| OCI-distributed agent configs compared with the skill catalogue | Ploeg skill catalogue | Proposed: compare pushing agents to OCI registries with Ploeg ADR-0092's digest catalogue; consider OCI as a transport for catalogues later. | S | Possible reuse of an Agency's existing registry. |
| Local reproduction of a Run | Agency developer machine | Proposed: export a Team to a docker agent YAML for local runs on a personal cell (Ploeg ADR-0143). | M | Developer convenience only. |
| Hostile agent YAML in the attack drill | Ploeg attack drill | Proposed: if a profile is added, include a repository-shipped agent YAML in the Ploeg ADR-0126 drill. | S | Keeps repository content from configuring a Run. |
| Schema churn watch | Research watchlist | Proposed: track the agent-schema.json version enum; reconsider after it is stable for six months. | S | Avoids building on a schema that changed 17 times. |

**Shipped adoption:** docker agent CLI plugin bundled in Docker Desktop 4.63+; push/pull agents to OCI registries; MCP toolsets (https://github.com/docker/docker-agent)

**Open problems:** Schema 'version' went through 17 values, so breaking churn is likely (https://github.com/docker/docker-agent/blob/main/agent-schema.json)

**Watched:** github-releases `docker/docker-agent` at v1.156.2

## Dotprompt { #dotprompt }

| | |
| --- | --- |
| Steward | Google (Firebase Genkit) (single-vendor) |
| Status | stabilising |
| Latest | [dotpromptz v0.2.0 2026-10-05](https://github.com/google/dotprompt/releases) |
| Radar | **hold**: Fit decided it: a single-vendor prompt format at v0.2 with no seam in Unfold or Ploeg that needs it. |
| Moves when | A foundation adopts a prompt file format that Dotprompt implements, or a Go implementation ships and Ploeg decides to externalise its prompts. |
| Competes with | [Prompty](definition.md#prompty) |
| Complements | — |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0015-the-hosted-demo-is-a-recorded-replay-of-the-deterministic-demo](../../../../../docs/adr/adr-0015-the-hosted-demo-is-a-recorded-replay-of-the-deterministic-demo.md), [0018-the-outcome-drop-box-is-every-harnesss-return-path](../../../../../apps/ploeg/docs/adrs/0018-the-outcome-drop-box-is-every-harnesss-return-path.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Ask prompt as a Dotprompt file | Unfold Ask (src/ask) | Proposed: same as Prompty, with Dotprompt's front matter for model and schema; the model name must stay a gateway alias. | S | Reviewed prompt changes. |
| Typed output schema for outcomes | Ploeg outcome | Proposed: compare Dotprompt output schemas with the outcome file of Ploeg ADR-0018; keep Ploeg's own. | S | Design check only. |
| Genkit-based Agency agent as a harness | Ploeg dispatch | Proposed: only if a Genkit agent can speak ACP and route through the gateway. | L | Narrow audience. |
| Prompt fixtures for the deterministic demo | Unfold demo | Proposed: use Dotprompt files as named fixtures for the recorded demo replay of ADR-0015. | S | Reusable demo assets. |
| Watch Python dotpromptz and Go support | Research watchlist | Proposed: track releases for a Go implementation Ploeg could use. | S | Makes the hold observable. |

**Shipped adoption:** Repo releases (https://github.com/google/dotprompt/releases)

**Open problems:** Not investigated

**Watched:** rss `https://github.com/google/dotprompt/releases.atom`

## goose recipes { #goose-recipes }

| | |
| --- | --- |
| Steward | AAIF (goose project, repo aaif-goose/goose) (foundation) |
| Status | stable |
| Latest | [goose v1.57.0; recipe version field defaults to '1.0.0' 2026-10-28](https://goose-docs.ai/docs/guides/recipes/recipe-reference) |
| Radar | **hold**: Fit decided it: a goose-only format with no cross-tool consumer, and Ploeg keeps its own Team manifest; Goose matters as a harness, not its recipe format. |
| Moves when | A second agent tool reads goose recipes, or AAIF positions recipes as a cross-tool standard. |
| Competes with | [Agent Skills (SKILL.md)](definition.md#agent-skills), [Docker Agent (formerly cagent) agent YAML](definition.md#docker-agent), [Microsoft Agent Framework declarative agents (kind: Prompt YAML)](definition.md#maf-declarative) |
| Complements | — |
| Builds on | — |
| Superseded by | — |
| Decisions | [0118-the-unmaintained-openhands-cli-is-retired-as-a-harness](../../../../../apps/ploeg/docs/adrs/0118-the-unmaintained-openhands-cli-is-retired-as-a-harness.md), [0126-a-recurring-attack-drill-runs-every-harness-against-a-hostile-repository](../../../../../apps/ploeg/docs/adrs/0126-a-recurring-attack-drill-runs-every-harness-against-a-hostile-repository.md), [0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills](../../../../../apps/ploeg/docs/adrs/0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Block recipes and plugins in the Goose harness | Ploeg dispatch, acp-goose profile | Proposed: make the acp-goose profile ignore repository-supplied recipes and .agents/plugins so a target repository cannot start processes in a Run, the qualification Ploeg ADR-0118 sets. | S | Goose can qualify as a harness without widening the attack surface. |
| Hostile recipe in the attack drill | Ploeg attack drill | Proposed: add a malicious recipe file to the hostile repository of Ploeg ADR-0126 and assert the Goose Run ignores it. | S | Proves the block instead of assuming it. |
| Generate a goose recipe from a Team for local runs | Agency developer machine | Proposed: export a Team's charter, skills and MCP gateway URL as a goose recipe so a developer can reproduce a Run locally on a personal cell (Ploeg ADR-0143). | M | Helps a developer debug a Run with the same setup. |
| Retry checks as a model for worker verification | Ploeg worker verification | Proposed: compare recipe retry checks with the worker verification of Ploeg ADR-0035 and borrow ideas only. | S | Cheap design input. |
| Recipe response schema versus the outcome drop box | Ploeg outcome | Proposed: compare response.json_schema with the outcome file of Ploeg ADR-0018; keep Ploeg's own. | S | Confirms Ploeg's return path is not missing a common field. |

**Shipped adoption:** goose CLI and Desktop; extensions stdio/builtin/platform/streamable_http; sub_recipes; response.json_schema; retry checks (https://goose-docs.ai/docs/guides/recipes/recipe-reference)

**Open problems:** Not investigated; goose-only format with no cross-tool consumer found

**Watched:** github-releases `aaif-goose/goose` at v1.57.0

## Microsoft Agent Framework declarative agents (kind: Prompt YAML) { #maf-declarative }

Not to be confused with: Microsoft 365 Copilot 'declarative agents' manifest (different format, Copilot extensibility)

| | |
| --- | --- |
| Steward | Microsoft (single-vendor) |
| Status | stabilising |
| Latest | [agent-framework python-1.24.0 / dotnet-1.27.0; .NET Microsoft.Agents.AI.Declarative is --prerelease; doc ms.date 2026-10-23 2026-10-30](https://learn.microsoft.com/en-us/agent-framework/agents/declarative) |
| Radar | **hold**: Maturity and fit both decided it: single-vendor, .NET prerelease, Go only promised, and it competes with Ploeg's own Team manifest. |
| Moves when | The Go loader ships and an Agency asks to run its Agent Framework agents under Ploeg. |
| Competes with | [Open Agent Specification (Agent Spec)](definition.md#open-agent-spec), [Docker Agent (formerly cagent) agent YAML](definition.md#docker-agent), [goose recipes](definition.md#goose-recipes) |
| Complements | [AG-UI (Agent-User Interaction Protocol)](client-ui.md#ag-ui) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills](../../../../../apps/ploeg/docs/adrs/0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills.md) |
| Watchlist | T6, T9 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Microsoft Agent Framework agent as a harness | Ploeg dispatch | Proposed: run a declarative Prompt agent as a harness only through the LiteLLM gateway, and only when the Go loader ships. | L | Would serve Agencies standardised on Microsoft tooling. |
| Export a Role as a Prompt YAML | Ploeg Team manifest | Proposed: generate a kind: Prompt YAML from a Role's model and instructions for local reproduction. | S | Developer convenience only. |
| Teams or Copilot Studio delegation | Agency chat workplace | Proposed: only via remote MCP or the A2A facade (T6, T9), not via this format. | M | Points Microsoft-shop Agencies at the path that exists. |
| Compare with Ploeg's Role binding | Ploeg design | Proposed: read the format against a Role's model, harness and image binding and borrow names only. | S | Cheap design check. |
| Watch the .NET package leave prerelease | Research watchlist | Proposed: re-read when the .NET package is stable and Go exists. | S | Makes the hold observable. |

**Shipped adoption:** "Python agent-framework-declarative AgentFactory; .NET ChatClientPromptAgentFactory; Go 'coming soon' (https://learn.microsoft.com/en-us/agent-framework/agents/declarative)"

**Open problems:** ".NET package still prerelease (https://learn.microsoft.com/en-us/agent-framework/agents/declarative)"

**Watched:** rss `https://github.com/microsoft/agent-framework/releases.atom`

## Open Agent Specification (Agent Spec) { #open-agent-spec }

Not to be confused with: Microsoft Agent Framework declarative agents; M365 Copilot declarative agents

| | |
| --- | --- |
| Steward | Oracle (single-vendor) |
| Status | stabilising |
| Latest | [Agent Spec 26.3.1 2026-09-11](https://github.com/oracle/agent-spec/releases) |
| Radar | **hold**: Fit decided it: single-vendor and Python-centric, and it describes agent flows rather than what a Team may do or spend, which Ploeg ADR-0110 keeps in its own manifest. |
| Moves when | Agent Spec moves to a foundation and adds permission or budget fields, or an Agency asks to run an Agent Spec agent under Ploeg. |
| Competes with | [Microsoft Agent Framework declarative agents (kind: Prompt YAML)](definition.md#maf-declarative), [Docker Agent (formerly cagent) agent YAML](definition.md#docker-agent), [goose recipes](definition.md#goose-recipes) |
| Complements | [AG-UI (Agent-User Interaction Protocol)](client-ui.md#ag-ui) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills](../../../../../apps/ploeg/docs/adrs/0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills.md), [0034-the-harness-gets-placeholders-the-worker-keeps-credentials](../../../../../apps/ploeg/docs/adrs/0034-the-harness-gets-placeholders-the-worker-keeps-credentials.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Export a Team as an Agent Spec document | Ploeg Team manifest | Proposed: generate an Agent Spec flow from a Team's crew of Rounds and Roles for documentation, never as the source of truth (Ploeg ADR-0110). | M | Gives Agencies a portable picture of a Team if they use Agent Spec tools. |
| Import an Agent Spec agent as a harness | Ploeg dispatch | Proposed: run a WayFlow agent as a harness only if it can route model calls through the LiteLLM gateway and accept Ploeg's credential boundary (Ploeg ADR-0034). | L | Would let an Agency bring an Oracle-ecosystem agent under Ploeg's budget. |
| Compare Agent Spec flows with Ploeg Rounds | Ploeg design | Proposed: read Agent Spec's flow and node model against the Round and Role crew and borrow vocabulary where it converged. | S | Cheap check against a published shape. |
| AG-UI pairing for the Client portal | Client portal | Proposed: only together with an AG-UI adapter (T7), since Agent Spec's front-end story runs through AG-UI. | M | Not useful on its own today. |
| Review calendar entry | Research watchlist | Proposed: add Agent Spec to Ploeg ADR-0110's re-evaluation list for a team object, permissions or budget. | S | Makes the hold observable. |

**Shipped adoption:** WayFlow reference runtime; pyagentspec adapters for LangGraph, AutoGen, CrewAI (https://github.com/oracle/agent-spec); AG-UI integration listed as supported (https://github.com/ag-ui-protocol/ag-ui)

**Open problems:** Not investigated; single-vendor with Python-centric adapters

**Watched:** rss `https://github.com/oracle/agent-spec/releases.atom`

## Prompty { #prompty }

| | |
| --- | --- |
| Steward | Microsoft (single-vendor) |
| Status | stable |
| Latest | [Prompty TypeScript 2.1.0 / rust 2.1.0 2026-10-21](https://github.com/microsoft/prompty/releases) |
| Radar | **hold**: Fit decided it: a single-vendor prompt file format with no seam in Unfold or Ploeg that needs it, and no Go runtime for Ploeg. |
| Moves when | A foundation adopts a prompt file format that Prompty implements, or Unfold decides to externalise its prompts as assets. |
| Competes with | [Dotprompt](definition.md#dotprompt) |
| Complements | — |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance](../../../../../docs/adr/adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance.md), [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Ask and chat prompts as versioned files | Unfold Ask (src/ask) | Proposed: keep the Ask prompt of ADR-0031 in a .prompty file so changes are reviewed and diffed as assets; the TypeScript runtime would need to stay dependency-free per Unfold ADR 0002. | S | Clearer review of prompt changes. |
| Worker prompt templates | Ploeg worker prompt | Proposed: compare Prompty with Ploeg's Go prompt builder; no Go runtime exists, so borrow the file layout only. | S | Small maintainability gain. |
| Prompt evaluation fixtures | Unfold tests | Proposed: use Prompty sample inputs as fixtures for the deterministic demo, which must never invent model calls. | S | Reusable test inputs. |
| Judge prompts for the decider | Unfold decider | Proposed: store the shadow judge prompt of ADR-0042 as a versioned asset. | S | Judge changes become auditable. |
| Watch for a cross-vendor prompt file standard | Research watchlist | Proposed: track whether Prompty and Dotprompt converge under a foundation. | S | Avoids picking a vendor format early. |

**Shipped adoption:** Releases in TypeScript and Rust (https://github.com/microsoft/prompty/releases)

**Open problems:** Not investigated

**Watched:** rss `https://github.com/microsoft/prompty/releases.atom`
