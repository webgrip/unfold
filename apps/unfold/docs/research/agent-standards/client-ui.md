# Client, editor and UI

Generated from [`standards.yaml`](standards.yaml); see the [catalogue](index.md).

## A2UI (Agent-to-User Interface) { #a2ui }

| | |
| --- | --- |
| Steward | Google (single-vendor) |
| Status | stabilising |
| Latest | [v0.9.1 production; v1.0 release candidate; packages a2ui-core 0.5.0 / a2ui-agent-sdk 0.10.0 (exact v0.9.1 date not found) 2026-11-02](https://github.com/google/A2UI) |
| Radar | **hold**: Fit decided it: Unfold already built MCP Apps, its direct competitor, and A2UI is single-vendor with v1.0 still a release candidate. |
| Moves when | A2UI 1.0 is final and a client people use (Gemini Enterprise, an A2A caller) renders it while not rendering MCP Apps, or the A2A facade (T6) is built. |
| Competes with | [MCP Apps (MCP extension, SEP-1865)](client-ui.md#mcp-apps) |
| Complements | [AG-UI (Agent-User Interaction Protocol)](client-ui.md#ag-ui) |
| Builds on | — |
| Superseded by | — |
| Decisions | [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md), [0007-a2a-adopt-nothing-watchlist-a-facade](../../../../../apps/ploeg/docs/adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md) |
| Watchlist | T6, T7 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| A2UI rendering of the Work Item card for A2A callers | Proposed A2A facade | Proposed: if the A2A facade of Ploeg ADR-0007 is built, return the Work Item card as an A2UI payload alongside text for Gemini Enterprise callers. | M | Delegating Clients would see the same card the MCP App shows. |
| Second renderer for the MCP App views | unfold-mcp (src/mcp-apps.ts) | Proposed: generate A2UI descriptions of the two ui:// views from the same data, so hosts that render A2UI but not MCP Apps get a card. | M | Covers hosts outside the MCP Apps matrix if any appear. |
| Declarative approval form in the Client portal | Client portal | Proposed: describe a Client sign-off form (Unfold ADR-0049) in A2UI so it can render in an Agency's chosen chat surface. | M | A Client could approve a Quote where it already chats. |
| Phone triage view from declarative components | PWA | Proposed: study A2UI's component catalogue as a model for the offline phone triage view of Unfold ADR-0052, borrowing ideas only. | S | May shorten design work for the triage view. |
| Watch for an MCP Apps and A2UI bridge | Research watchlist | Proposed: track the v1.0 release candidate and whether AG-UI or an MCP host renders A2UI natively. | S | Avoids building a second card format before a host needs it. |

**Shipped adoption:** a2ui-adk and a2ui-a2a packages (Google ADK, A2A bindings) (https://github.com/google/A2UI/releases); AG-UI positions A2UI as a complementary generative-UI spec (https://docs.ag-ui.com/introduction)

**Open problems:** v1.0 still a release candidate; v0.8 legacy per README (https://github.com/google/A2UI)

**Watched:** rss `https://github.com/google/A2UI/releases.atom`

## AG-UI (Agent-User Interaction Protocol) { #ag-ui }

| | |
| --- | --- |
| Steward | CopilotKit (born from CopilotKit's partnership with LangChain and CrewAI) (https://github.com/ag-ui-protocol/ag-ui) (single-vendor) |
| Status | stabilising |
| Latest | [@ag-ui/core 1.0.3; GitHub releases are date-tagged (Release 2026-11-03) 2026-11-03](https://github.com/ag-ui-protocol/ag-ui/releases) |
| Radar | **hold**: Fit decided it, as on 2026-10-13: Unfold's own SSE events already serve its UI and AG-UI stays single-vendor; the wider adoption since then does not create a seam a person uses. |
| Moves when | Unfold embeds a third-party chat front end, or an Agency chooses Slack or Teams through CopilotKit Channels (T7). |
| Competes with | [Agent Host Protocol (AHP)](client-ui.md#agent-host-protocol) |
| Complements | [A2UI (Agent-to-User Interface)](client-ui.md#a2ui), [MCP Apps (MCP extension, SEP-1865)](client-ui.md#mcp-apps), [Open Agent Specification (Agent Spec)](definition.md#open-agent-spec) |
| Builds on | — |
| Superseded by | — |
| Decisions | [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md), [2026-09-11-ecosystem-alternatives](../../../../../apps/unfold/docs/research/2026-09-11-ecosystem-alternatives.md), [2026-09-18-band-and-the-interaction-layer](../../../../../apps/unfold/docs/research/2026-09-18-band-and-the-interaction-layer.md), [adr-0026-unfold-is-an-installable-web-app-that-notifies-from-the-server](../../../../../docs/adr/adr-0026-unfold-is-an-installable-web-app-that-notifies-from-the-server.md) |
| Watchlist | T7, T9 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| AG-UI adapter over Unfold's SSE events | PWA event stream | Proposed: a thin translator from Unfold's own SSE events to AG-UI events, served on a separate route so the PWA keeps its own stream. | M | Lets a third-party chat front end follow a Work Item without new server logic. |
| Slack or Teams through CopilotKit Channels | Agency chat workplace | Proposed: only if an Agency names Slack or Teams (T9), use the AG-UI adapter with CopilotKit Channels instead of a bespoke Slack app. | M | One adapter could cover two chat workplaces. |
| Client portal embedded agent view | Client portal | Proposed: render a Client-safe Work Item status (Unfold ADR-0031 brief) in an Agency's own site through an AG-UI client component. | M | An Agency could embed Work Item progress in its own customer site. |
| Bedrock AgentCore harness events | Ploeg dispatch | Proposed: if a harness exposes only AG-UI events, map them into Ploeg's Run transcript (Ploeg ADR-0090) rather than writing a vendor adapter. | M | Keeps vendor-specific code out of Ploeg if AG-UI becomes a harness output format. |
| Event vocabulary cross-check | AHP host projection | Proposed: compare AG-UI's event names with the AHP projection in src/ahp/runs.ts and borrow names where they converge, adding no dependency. | S | Cheap consistency win for future adapters. |

**Shipped adoption:** Amazon Bedrock AgentCore runtime AG-UI support, marked 1st party (https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-agui.html); Integrations listed as supported: Microsoft Agent Framework, Google ADK, Google Antigravity, AWS Strands, LangGraph, CrewAI, Oracle Agent Spec, MCP Apps (https://github.com/ag-ui-protocol/ag-ui)

**Open problems:** GitHub releases are date-tagged per package; the protocol packages carry semver (@ag-ui/core 1.0.3, https://registry.npmjs.org/@ag-ui/core/latest)

**Watched:** rss `https://github.com/ag-ui-protocol/ag-ui/releases.atom`

## Agent Client Protocol (ACP) { #agent-client-protocol }

Not to be confused with: IBM/BeeAI 'Agent Communication Protocol' (also ACP), which merged into A2A in Aug 2025 (https://research.ibm.com/projects/agent-communication-protocol); 'Agentic Commerce Protocol' (OpenAI/Stripe, commerce layer)

| | |
| --- | --- |
| Steward | Zed Industries + JetBrains (lead maintainers Ben Brandt (Zed) and Sergey Ignatov (JetBrains)); "working toward transitioning to an independent foundation" (https://agentclientprotocol.com/community/governance) (consortium) |
| Status | stable |
| Latest | [Schema v1.29.1 (wire v1); Schema v2.0.0-alpha.13 (v2 draft); Rust crate v1.15.1 2026-11-02](https://github.com/agentclientprotocol/agent-client-protocol/releases) |
| Radar | **adopt**: Maturity and fit both hold: Ploeg launches harnesses over ACP v1 and unfold-acp-agent is now built, which moves the 2026-10-13 verdict from a phase 3 owner decision to adopt (ADR 0058 still proposed). |
| Moves when | ACP v2 leaves draft and drops v1 support in the editors Unfold targets, or its foundation transition stalls and JetBrains or Zed withdraws, which would move it to trial for new work. |
| Competes with | [Agent Host Protocol (AHP)](client-ui.md#agent-host-protocol) |
| Complements | [MCP Apps (MCP extension, SEP-1865)](client-ui.md#mcp-apps), [AG-UI (Agent-User Interaction Protocol)](client-ui.md#ag-ui) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0058-an-acp-editor-uses-unfold-as-the-agent-unfold-which-follows-one-work-item](../../../../../apps/unfold/docs/adrs/0058-an-acp-editor-uses-unfold-as-the-agent-unfold-which-follows-one-work-item.md), [0007-thin-editor-client](../../../../../apps/unfold/docs/adrs/0007-thin-editor-client.md), [0118-the-unmaintained-openhands-cli-is-retired-as-a-harness](../../../../../apps/ploeg/docs/adrs/0118-the-unmaintained-openhands-cli-is-retired-as-a-harness.md), [0148-every-acp-profile-asks-before-a-mutation-outside-allow-always-and-openhands-refuses-a-repository-that-ships-hooks](../../../../../apps/ploeg/docs/adrs/0148-every-acp-profile-asks-before-a-mutation-outside-allow-always-and-openhands-refuses-a-repository-that-ships-hooks.md), [0100-an-attended-run-relays-its-harnesss-requests-through-ploegd-and-falls-back-to-its-teams-policy](../../../../../apps/ploeg/docs/adrs/0100-an-attended-run-relays-its-harnesss-requests-through-ploegd-and-falls-back-to-its-teams-policy.md), [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md) |
| Watchlist | T1, T2, T3, T4 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Publish unfold-acp-agent to npm and the ACP Registry | ACP agent (apps/unfold/extensions/acp-agent), JetBrains and Zed | The agent is built but private (package.json 0.1.0, installed from a checkout); publish it and submit the prepared registry/ entry with its terminal auth method, under Unfold ADR 0058 (proposed). | S | One-click install for Agency developers in PhpStorm and Zed instead of a checkout. |
| Ploeg south adapter on schema 1.29 and an official Go SDK | Ploeg dispatch, ACP adapter | Proposed: bump the ACP adapter (pkg/harness/adapters/acp) past the community coder/acp-go-sdk to pick up session close and elicitation, and swap SDKs when T4 fires. | M | Keeps OpenCode, Qwen Code and Goose Runs on the current wire without drift. |
| Guard the permission relay against issue 1979 | Ploeg attended relay | Proposed: add a conformance test that a session/request_permission always carries its tool-call context before Ploeg ADR-0100 relays it to a person, refusing per Ploeg ADR-0148 when context is missing. | S | A person never approves a mutation without seeing what it is. |
| Cost in usage_update without relying on PromptResponse.usage | ACP agent, Ploeg Run facts | The agent already sends usage_update with a USD cost from Shift spend; proposed: pin that choice in Unfold ADR 0058 and ignore PromptResponse.usage until issue 1860 settles. | S | Spend shown in the editor stays the gateway's number, not the harness's guess. |
| Remote ACP endpoint instead of a local bridge | ACP agent, hosted offering | Proposed: when the Streamable HTTP and WebSocket RFD completes and the TypeScript SDK ships it (T3), serve ACP from the Unfold app next to the AHP host so editors connect by URL. | M | Agency developers and later Client staff need no local Node process. |

**Shipped adoption:** Editor clients listed: Zed, JetBrains, Neovim (CodeCompanion, avante.nvim and others), Emacs agent-shell.el, VS Code (several extensions), Visual Studio via Poolside, Qt Creator, Sublime Text, Obsidian, Unity (https://agentclientprotocol.com/get-started/clients); AHP-ACP Gateway runs ACP agents behind an AHP host (https://github.com/formulahendry/ahp-acp-gateway); AgentConnect puts Claude Code, Codex and other ACP agents into Slack, Telegram and Discord (https://github.com/agentconnect-md/agentconnect)

**Open problems:** Remote transport (HTTP/WebSocket) is still 'a work in progress' per the homepage (https://agentclientprotocol.com/); #1979: permission prompts can silently lose tool-call context (https://github.com/agentclientprotocol/agent-client-protocol/issues/1979); #1860: PromptResponse.usage semantics are self-contradictory (https://github.com/agentclientprotocol/agent-client-protocol/issues/1860); #1978: session/rename and title semantics (https://github.com/agentclientprotocol/agent-client-protocol/issues/1978)

**Watched:** rss `https://github.com/agentclientprotocol/agent-client-protocol/releases.atom`

## Agent Host Protocol (AHP) { #agent-host-protocol }

| | |
| --- | --- |
| Steward | Microsoft (VS Code team) (single-vendor) |
| Status | stable |
| Latest | [AHP Spec v1.0.0 2026-10-02](https://github.com/microsoft/agent-host-protocol/releases) |
| Radar | **adopt**: Fit decided it: the host already serves AHP 1.0.0 to VS Code (Unfold ADR 0012); single-vendor governance keeps it off Ploeg's dispatch path as Ploeg ADR-0006 says, which the new facts do not change. |
| Moves when | VS Code drops or deprecates remote agent hosts, or a device policy disables chat.remoteAgentHosts by default for managed fleets (T25). |
| Competes with | [Agent Client Protocol (ACP)](client-ui.md#agent-client-protocol) |
| Complements | [Agent Client Protocol (ACP)](client-ui.md#agent-client-protocol) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0012-agent-host-protocol-host](../../../../../apps/unfold/docs/adrs/0012-agent-host-protocol-host.md), [0036-the-agent-host-speaks-websocket-through-ws](../../../../../apps/unfold/docs/adrs/0036-the-agent-host-speaks-websocket-through-ws.md), [0006-ahp-is-the-wrong-layer](../../../../../apps/ploeg/docs/adrs/0006-ahp-is-the-wrong-layer.md), [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md), [2026-10-23-vscode-1-143-fit](../../../../../apps/unfold/docs/research/2026-10-23-vscode-1-143-fit.md), [2026-10-17-vscode-1-142-integration-surfaces](../../../../../apps/unfold/docs/research/2026-10-17-vscode-1-142-integration-surfaces.md) |
| Watchlist | T11, T12, T13, T14, T16, T20, T21, T22, T23, T25, T26, T27 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Desktop qualification pass of the AHP host | AHP host (apps/unfold/src/ahp), VS Code | Proposed: run VIK-1922 against VS Code 1.144 so the 26 handled commands are seen rendering, and replace the fetchTurns and disposeChat stubs (Unfold ADR 0012). | S | Nothing in the host counts as supported until it renders on a desktop. |
| Live Run commands as background work with Stop | AHP host, Ploeg Run transcript | Proposed: project a Run's live shell steps as chat/backgroundWorkSet with a terminal and vscode.stopBackgroundWork meta, per RFC-0006 and T12, once Ploeg ADR-0090 transcripts are accepted. | M | Reviewers see what a Run is executing now and can stop it from VS Code. |
| Each Role's harness as a chat of one session | AHP host | Proposed: after AHP 1.1.0 ships per-chat provider (T26, T29 in the 1.144 rows), advertise multipleChatProviders and show writer and reviewer Roles as chats instead of the subagent detour. | M | A Shift's Roles appear as they really are, each with its own harness and model. |
| Pull request and delivery evidence as session artifacts | AHP host, VS Code extension | Proposed: when session artifacts (AHP PR 508) merge and VS Code renders them from remote hosts (T14), attach the pull request, preview environment and walkthrough as artifacts. | S | Review starts from the evidence without leaving the Agents window. |
| Sign-in without a pasted token | AHP host, unfold-mcp OAuth resource | Proposed: implement authenticate and protectedResources against the same OAuth resource as unfold-mcp once VS Code resolves non-GitHub authorization servers (T11, the 2026-10-10 spike). | M | Removes the last manual credential step for Agency developers in VS Code. |

**Shipped adoption:** VS Code built-in Agent Sessions client; reference server at src/vs/platform/agentHost/node (https://github.com/microsoft/agent-host-protocol); SDKs: Rust, TypeScript @microsoft/agent-host-protocol, Kotlin, Go, Swift, .NET (https://github.com/microsoft/agent-host-protocol); Third-party hosts: ahpd, pi-ahp, hydra-ahp, AHP-ACP Gateway, AgentConnect (https://github.com/microsoft/agent-host-protocol)

**Open problems:** Single-vendor stewardship with no published governance; not investigated further

**Watched:** rss `https://github.com/microsoft/agent-host-protocol/releases.atom`

## LangChain Agent Protocol (runs/threads/store API) { #langchain-agent-protocol }

Not to be confused with: AI Engineer Foundation 'Agent Protocol' (dead, see below)

| | |
| --- | --- |
| Steward | LangChain (single-vendor) |
| Status | stabilising |
| Latest | [langchain-protocol==0.0.20 2026-10-20](https://github.com/langchain-ai/agent-protocol/releases) |
| Radar | **hold**: Both maturity and fit decided it: single-vendor at 0.0.x, and it duplicates Ploeg's own Run lifecycle and the AHP host that Unfold already serves. |
| Moves when | The protocol reaches 1.0 with a second independent implementer, or an Agency asks to drive or read Unfold work from LangGraph Platform. |
| Competes with | [AG-UI (Agent-User Interaction Protocol)](client-ui.md#ag-ui), [Agent Host Protocol (AHP)](client-ui.md#agent-host-protocol) |
| Complements | — |
| Builds on | — |
| Superseded by | — |
| Decisions | [2026-09-11-ecosystem-alternatives](../../../../../apps/unfold/docs/research/2026-09-11-ecosystem-alternatives.md), [0015-ploeg-operator-read-api](../../../../../apps/unfold/docs/adrs/0015-ploeg-operator-read-api.md), [0118-the-unmaintained-openhands-cli-is-retired-as-a-harness](../../../../../apps/ploeg/docs/adrs/0118-the-unmaintained-openhands-cli-is-retired-as-a-harness.md), [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Runs and threads facade over ploeg-mcp reads | ploeg-mcp, Ploeg operator API | Proposed: map Agent Protocol threads to Work Items and runs to Ploeg Runs as a read-only facade beside the operator read API (Unfold ADR 0015), with no create-run route so nothing dispatches without a person. | M | Lets LangGraph-based dashboards read Unfold work if an Agency already uses them. |
| LangGraph agent as a Ploeg harness | Ploeg dispatch | Proposed: a harness adapter that drives a LangGraph server through its runs API, routed only through the LiteLLM gateway under Ploeg ADR-0177 and qualified like the ACP profiles of Ploeg ADR-0118. | L | Would let an Agency bring an existing LangGraph agent under Ploeg's budgets. |
| Store API as a knowledge backend comparison | Ploeg knowledge graphs | Proposed: compare the protocol's store namespace model with the per-Tenant knowledge scopes of Ploeg ADR-0087 and Unfold ADR-0034, and borrow only naming if it fits. | S | Cheap check that Unfold's knowledge scopes are not missing a common shape. |
| Client portal progress via Agent Protocol streaming | Client portal | Proposed: stream a Work Item's state to a Client portal widget using the protocol's run stream shape instead of Unfold's own SSE events. | M | Only useful if a Client's tooling already consumes Agent Protocol streams. |
| Conformance watch at 0.0.x | Research watchlist | Proposed: add a row to the protocol ledger in apps/unfold/docs/research/2026-09-11-ecosystem-alternatives.md and re-read the releases feed when it leaves 0.0.x. | S | Records why it was not adopted so the question is not re-argued. |

**Shipped adoption:** Repo active, last commit 2026-11-03 (https://github.com/langchain-ai/agent-protocol)

**Open problems:** 0.0.x versioning (https://github.com/langchain-ai/agent-protocol/releases)

**Watched:** rss `https://github.com/langchain-ai/agent-protocol/releases.atom`

## MCP Apps (MCP extension, SEP-1865) { #mcp-apps }

Not to be confused with: OpenAI Apps SDK (ChatGPT apps), now an MCP Apps host plus window.openai extras

| | |
| --- | --- |
| Steward | Model Context Protocol project (AAIF) (foundation) |
| Status | stable |
| Latest | [spec 2026-01-26 (Stable); SDK @modelcontextprotocol/ext-apps v2.0.4 2026-10-27](https://github.com/modelcontextprotocol/ext-apps) |
| Radar | **adopt**: Maturity and fit both hold: the extension is Stable and foundation-governed, and Unfold already ships two ui:// views (PR 722), so the 2026-10-13 phase 2 recommendation is done. |
| Moves when | The ext-apps sandbox and namespacing bugs (761, 745, 753) remain open while a major host drops MCP Apps, or WebMCP replaces it (ext-apps 797). |
| Competes with | [A2UI (Agent-to-User Interface)](client-ui.md#a2ui) |
| Complements | [AG-UI (Agent-User Interaction Protocol)](client-ui.md#ag-ui), [Skills Extension for MCP (io.modelcontextprotocol/skills, SEP-2640)](tool.md#skills-over-mcp) |
| Builds on | — |
| Superseded by | — |
| Decisions | [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md), [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md), [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp](../../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md), [adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation](../../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md) |
| Watchlist | T13, T30 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Live Work Item card where Tasks does not reach | unfold-mcp (src/mcp-apps.ts) | Proposed: add an app-only polling tool so the existing ui://unfold/work-item card stays current in claude.ai, VS Code and ChatGPT, idea 3 of the 2026-10-30 dossier. | S | People follow a Run in the chat client they already use. |
| Server-side confirmation for every app-initiated call | unfold-mcp, ploeg-mcp | Built in principle; proposed: add a test that approve and note tools from the card still go through elicitation or Ploeg ADR-0152 signed confirmation, since app and model calls are indistinguishable (ext-apps 746). | S | Keeps the person-confirms rule of ADR-0037 intact inside rendered cards. |
| Strict CSP that does not depend on the host proxy | unfold-mcp | Proposed: make the ui:// resources self-contained with no remote resourceDomains, because ext-apps 761 shows the sandbox proxy ignores _meta.ui.csp. | S | The card stays safe in hosts with a broken sandbox proxy. |
| Agency gateway compatibility check | Agency deployment, LiteLLM MCP gateway | Proposed: document that unfold-mcp must be connected directly, not through a namespacing aggregator such as LiteLLM, until ext-apps 745 and 753 are fixed, and test with agentgateway's ui:// passthrough. | S | An Agency that fronts MCP with a gateway does not get silently broken cards. |
| Client-safe card for the hosted connector | Client portal, claude.ai and ChatGPT connectors | Proposed: a third ui:// view built only on the Client-safe brief of ADR-0031, shipped with the phase 3 connector listing after tenancy (ADR-0017). | M | Clients see their Work Item status in ChatGPT or Claude without seeing Agency internals. |

**Shipped adoption:** Open WebUI v0.13.0 'MCP Apps in chat' (2026-11-03) (https://github.com/open-webui/open-webui/releases); ChatGPT MCP Apps compatibility (https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt); VS Code MCP Apps support, 2026-01-26 (https://code.visualstudio.com/blogs/2026/01/26/mcp-apps-support); agentgateway ui:// passthrough and rewrite (https://agentgateway.dev/docs/kubernetes/main/mcp/apps/); CopilotKit/AG-UI MCP Apps support (https://github.com/ag-ui-protocol/ag-ui)

**Open problems:** #761: sandbox proxy ignores _meta.ui.csp, so resourceDomains has no effect (https://github.com/modelcontextprotocol/ext-apps/issues/761); #746: app-initiated vs model-initiated tools/call indistinguishable (https://github.com/modelcontextprotocol/ext-apps/issues/746); #745/#753: apps cannot call their server's tools through a namespacing aggregator; bare tool names break multi-server hosts. This hits LiteLLM as an MCP gateway directly (https://github.com/modelcontextprotocol/ext-apps/issues/745, https://github.com/modelcontextprotocol/ext-apps/issues/753); #797: WebMCP convergence (https://github.com/modelcontextprotocol/ext-apps/issues/797)

**Watched:** github-releases `modelcontextprotocol/ext-apps` at v2.0.4

## MCP-UI { #mcp-ui }

| | |
| --- | --- |
| Steward | MCP-UI-Org (community) (community) |
| Status | merged |
| Latest | [client/v7.1.1 2026-05-09](https://github.com/MCP-UI-Org/mcp-ui/releases) |
| Radar | **hold**: Maturity decided it: MCP-UI merged into MCP Apps and is now only a client SDK, so there is nothing to adopt as a standard beyond MCP Apps itself. |
| Moves when | Unfold decides to render MCP App resources in its own PWA or extension, which would make the MCP-UI client SDK a trial dependency. |
| Competes with | — |
| Complements | [MCP Apps (MCP extension, SEP-1865)](client-ui.md#mcp-apps) |
| Builds on | — |
| Superseded by | [MCP Apps (MCP extension, SEP-1865)](client-ui.md#mcp-apps) |
| Decisions | [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md), [0002-native-node-and-single-writer-storage](../../../../../apps/unfold/docs/adrs/0002-native-node-and-single-writer-storage.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Render Unfold's ui:// views inside the PWA | PWA | Proposed: use the @mcp-ui client renderer as a dev-only dependency to preview the two MCP App views in Unfold's own UI, bundled at build time so Unfold ADR 0002 holds. | S | One card implementation shown in both chat clients and Unfold itself. |
| MCP App test harness | unfold-mcp tests | Proposed: drive src/mcp-apps.ts through the MCP-UI client SDK in an end-to-end test to catch host-compatibility regressions before release. | S | Catches card breakage without a real Claude or ChatGPT session. |
| Remove any legacy UIResourceRenderer pattern | unfold-mcp | Proposed: confirm no code or doc uses the legacy MCP-UI resource shape, since MCP Apps superseded it. | S | Avoids shipping a deprecated rendering path. |
| Ploeg Run card in the extension webview | VS Code extension | Proposed: render the ui:// card in the extension's webview through the MCP-UI client instead of a separate HTML page. | M | Same card in the editor without new UI code. |
| Agency custom card via MCP-UI SDK | Agency | Proposed: point Agencies who want branded cards at the MCP Apps spec and MCP-UI client SDK rather than a separate Unfold format. | S | No Unfold-specific theming API to maintain. |

**Shipped adoption:** README: @mcp-ui/* packages 'fully compliant with the MCP Apps specification'; the legacy UIResourceRenderer pattern is labelled legacy (https://github.com/MCP-UI-Org/mcp-ui)

**Open problems:** Last commit 2026-07-08; project now an MCP Apps client SDK, not a separate spec

**Watched:** rss `https://github.com/MCP-UI-Org/mcp-ui/releases.atom`
