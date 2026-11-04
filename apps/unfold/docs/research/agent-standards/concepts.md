# Concepts that are not standards yet

Generated from [`standards.yaml`](standards.yaml); see the [catalogue](index.md). The ring is for adopting the pattern in Unfold.

| Concept | Maturity | Radar | Unfold today |
| --- | --- | --- | --- |
| ["Everything is a tool" vs "agents as tools", and MCP-vs-A2A convergence](#mcp-a2a-convergence) | pattern | hold | MCP for tools and operator reads, A2A on a watchlist (apps/ploeg/docs/adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md). |
| [Agent economy (micropayments, agent-to-agent markets)](#agent-economy) | pre-standard | hold | Nothing of agent payments; spend is metered per Run and billed per ticket (docs/adr/adr-0006-the-ticket-is-the-billing-unit.md). |
| [Agent identity as workload identity vs as a delegated human](#agent-identity-workload-vs-delegated) | pre-standard | adopt | Runs carry a transaction token naming their person, with per-Run forge identities (apps/ploeg/docs/adrs/0156-each-run-carries-a-transaction-token-that-names-its-person-and-a-team-without-a-sponsor-runs-nothing.md). |
| [Agent lifecycle management (registration, versioning, retirement), "AgentOps"](#agentops-lifecycle) | pre-standard | trial | Teams are declared manifests with recorded configuration per Run (apps/ploeg/docs/adrs/0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills.md). |
| [Agent memory (episodic/semantic/procedural) and memory portability](#agent-memory-portability) | pre-standard | trial | Designed, not shipped: per-Tenant knowledge graphs served by scope, with reviewed learnings (apps/ploeg/docs/adrs/0087-ploegd-holds-a-tenants-knowledge-graphs-and-serves-a-run-only-its-work-items-scopes.md). |
| [Agent mesh / the gateway as the control plane](#agent-gateway-control-plane) | de-facto-convention | adopt | LiteLLM mints per-Run capped keys and fronts MCP tools (apps/ploeg/docs/adrs/0008-litellm-is-the-credential-and-metering-seam.md). |
| [Agent observability as audit ("flight recorders")](#flight-recorder-audit) | pre-standard | trial | Transcripts, Run configuration, Action Records and an audit log are kept (apps/ploeg/docs/adrs/0090-a-runs-agent-session-is-kept-as-a-bounded-redacted-transcript.md). |
| [Agent OS concepts](#agent-os) | idea | hold | Nothing called an agent OS; ploegd, KEDA and cells do the scheduling (apps/ploeg/docs/adrs/0107-execution-runs-in-cells-that-pull-from-one-hub.md). |
| [Capability-based / object-capability security for agents (and the lethal trifecta)](#capability-security-agents) | pattern | adopt | Every credential is minted per Run and kept out of the harness (apps/ploeg/docs/adrs/0034-the-harness-gets-placeholders-the-worker-keeps-credentials.md). |
| [Code mode / tools-as-code-API](#code-mode-tools-as-code) | pattern | assess | Nothing yet as a pattern; Runs use a shell and toolchains in the pod and reach a few read-only MCP tools through the gateway (apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md). |
| [Computer use / browser agents as the universal fallback interface](#computer-use-fallback) | pattern | assess | Nothing yet; the nearest is the repeatable walkthrough of Ploeg ADR-0125 (apps/ploeg/docs/adrs/0125-a-writing-run-shows-its-change-in-a-walkthrough-a-person-can-repeat.md). |
| [Context engineering](#context-engineering) | de-facto-convention | adopt | Ploeg briefs each Run from a bounded set: told skills, context bundles under limits and steering that reaches the next Run (apps/ploeg/docs/adrs/0067-context-bundles-are-stored-per-work-item-and-unpacked-by-the-worker-under-fixed-limits.md). |
| [Context files as portable artifacts (AGENTS.md, CLAUDE.md, rule files)](#context-as-portable-artifact) | de-facto-convention | adopt | Ploeg reads target-repository instruction files below its delivery contract and scans them for hidden characters (apps/ploeg/docs/adrs/0030-target-repository-instructions-rank-below-the-delivery-contract.md). |
| [Durable execution for agents (workflow-as-code)](#durable-execution-agents) | de-facto-convention | adopt | Postgres-backed claims, Leases, checkpoints and a durable inbox (apps/ploeg/docs/adrs/0075-a-stopped-writing-run-leaves-a-checkpoint-its-retry-starts-from.md). |
| [Evals as contracts / eval-driven development](#evals-as-contracts) | pattern | trial | KPIs, pilot batches and the attack drill exist; the bake-off is proposed (apps/ploeg/docs/adrs/0135-a-bake-off-runs-one-work-item-on-several-configurations-and-a-shadow-judge-recommends-while-a-person-picks.md). |
| [Guardian / overseer agents and agent firewalls](#guardian-agents) | pattern | trial | Reviewer Roles review every writer, and the decider tripwire is built as a shadow on a branch (docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md). |
| [Human-in-the-loop approval semantics and signed approval/consent receipts](#hitl-approval-receipts) | pre-standard | trial | ploeg-mcp signs and single-uses confirmations, and approvals bind to a revision or head commit (apps/ploeg/docs/adrs/0152-ploeg-mcp-signs-each-confirmation-and-acts-on-it-once.md). |
| [Intent-based delegation, mandates and verifiable intent](#intent-mandates) | pre-standard | assess | The ticket's capped Shift budget and the client's Ready approval act as the mandate (docs/adr/adr-0006-the-ticket-is-the-billing-unit.md). |
| [Liability and accountability chains for agents](#liability-accountability-chains) | idea | adopt | Every action names its person, a Run needs a sponsor and a person merges (docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md). |
| [LLM API convergence (Responses-style stateful/item-based APIs)](#llm-api-convergence) | standardising | assess | LiteLLM normalises provider APIs behind a gateway contract (apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md). |
| [Local-first / on-device agents](#local-first-agents) | pattern | trial | Self-hosted by design, with laptop Runs proposed in RFC-0010 (docs/design/rfc-0010-agents-on-your-own-machine.md). |
| [Open-weight model packaging as OCI artifacts](#open-weight-model-packaging) | standardising | assess | Nothing for models; toolchains already ship as read-only mounted images (apps/ploeg/docs/adrs/0035-runs-get-ploeg-owned-skills-mounted-toolchains-and-worker-verification.md). |
| [Policy-as-code for agents (a PDP on every tool call)](#policy-as-code-agents) | de-facto-convention | assess | Policy is enforced in code at the forge proxy, ACP permission modes and the egress allowlist (apps/ploeg/docs/adrs/0148-every-acp-profile-asks-before-a-mutation-outside-allow-always-and-openhands-refuses-a-repository-that-ships-hooks.md). |
| [Semantic interoperability (ontologies, shared vocabularies, knowledge graphs as agent context)](#semantic-interop-knowledge-graphs) | pattern | trial | One shared vocabulary is in use and a two-graph knowledge design is proposed (docs/adr/adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant.md). |
| [Skills / progressive disclosure as a packaging paradigm](#skills-progressive-disclosure) | standardising | adopt | Runs get Ploeg-owned skills, are told which apply, and Teams pin them by digest (apps/ploeg/docs/adrs/0092-a-team-pins-its-skills-in-a-catalogue-that-ploegd-fetches-once-and-serves-by-digest.md). |
| [Sovereign AI / EU sovereignty stacks](#sovereign-ai-eu) | pattern | adopt | Production is on an EU cluster and site sign-ups are stored in the EU (docs/adr/adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging.md). |
| [Swarms and multi-agent orchestration topologies](#multi-agent-topologies) | pattern | adopt | Shifts run Rounds of one writer or several reviewers with a capped fix loop (docs/concepts/how-work-flows.md). |
| [The agent harness vs the model ("the loop" as architecture)](#harness-engineering) | de-facto-convention | adopt | ploeg-worker wraps four harness adapters and owns credentials, verification and the outcome (docs/concepts/inside-a-run.md). |
| [The agentic web (agent-readable sites, WebMCP, NLWeb, llms.txt)](#agentic-web) | pre-standard | hold | Nothing yet; agents reach Unfold over read-first MCP servers (docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md). |
| [Trust and reputation systems for agents](#trust-reputation) | pre-standard | hold | Run card grades and repository maturity serve as internal trust signals (docs/adr/adr-0047-unfold-describes-a-repository-with-the-ai-codebase-maturity-model-and-delivers-at-level-5.md). |

## "Everything is a tool" vs "agents as tools", and MCP-vs-A2A convergence { #mcp-a2a-convergence }

Should a remote agent be called as an MCP tool, or be a peer over A2A? With MCP Tasks adding async handles, do the protocols merge or stay layered?

| | |
| --- | --- |
| Maturity | pattern |
| Outlook | Both protocols are under LF. Real convergence would be decided in AAIF/LF governance or by IETF agentproto. Low chance of a formal merge in 24 months, high chance of de facto MCP dominance for tools. |
| Related standards | [Model Context Protocol](tool.md#mcp), [Agent2Agent Protocol](agent-agent.md#a2a) |
| Critique | Wrapping agents as MCP tools loses negotiation, streaming state and identity semantics, while A2A adds a second stack most teams never need. https://www.arcade.dev/blog/a2a-vs-mcp-layering-decision |
| Radar | **hold**: Ploeg has decided MCP for tools and nothing of A2A; convergence changes nothing until MCP Tasks is dated. |
| Watch for | AAIF announces an MCP-A2A alignment WG, or the A2A spec references MCP Tasks. |
| Decisions | [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp](../../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md), [0006-ahp-is-the-wrong-layer](../../../../../apps/ploeg/docs/adrs/0006-ahp-is-the-wrong-layer.md), [0007-a2a-adopt-nothing-watchlist-a-facade](../../../../../apps/ploeg/docs/adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md), [0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team](../../../../../apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md), [0081-ploeg-serves-its-operator-reads-as-mcp-tools-through-ploeg-mcp](../../../../../apps/ploeg/docs/adrs/0081-ploeg-serves-its-operator-reads-as-mcp-tools-through-ploeg-mcp.md), [0012-agent-host-protocol-host](../../../../../apps/unfold/docs/adrs/0012-agent-host-protocol-host.md), [2026-09-29-mcp-access](../../../../../docs/research/2026-09-29-mcp-access.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** MCP keynote (Tasks, Skills over MCP) and maintainer roundtable on "not picking one standard", AGNTCon NA 2026-10-22 [secondary]. https://lucaberton.com/blog/agntcon-mcpcon-north-america-2026/; Arcade, "A2A vs MCP layering decision". https://www.arcade.dev/blog/a2a-vs-mcp-layering-decision; IETF 126 agentproto: Jonathan Rosenberg argued one protocol could serve user-agent, agent-agent and agent-tool. https://datatracker.ietf.org/meeting/126/materials/minutes-126-agentproto-202607230700-00

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| A2A: adopt nothing, keep a watchlist | Ploeg protocols | Decided: Ploeg adopts nothing of A2A and keeps a watchlist and a possible facade (Ploeg ADR-0007). | S | No peer protocol to secure while it settles. |
| AHP is the wrong layer for Ploeg | Ploeg protocols | Decided: AHP is the wrong layer for Ploeg (Ploeg ADR-0006), while the Unfold workbench may host it for editors (Unfold ADR-0012). | S | Each protocol sits where it fits. |
| Operator reads as MCP tools | ploeg-mcp, unfold-mcp | Decided: Ploeg serves operator reads as MCP tools and Unfold serves its own beside them (Ploeg ADR-0081, system ADR-0032). | S | Any MCP client can follow work. |
| Long Runs as MCP Tasks | ploeg-mcp | Proposed: when MCP Tasks is in a dated spec, expose starting and following a Shift as a task handle instead of polling tools. | M | Clients can follow a Shift natively without custom polling. |
| Agents as tools only through the gateway | Gateway MCP | Decided: Runs reach tools only through the gateway (Ploeg ADR-0078); a remote agent would be called the same way, never as a peer. | S | One authorization and metering path for tools and agents. |

## Agent economy (micropayments, agent-to-agent markets) { #agent-economy }

Agents pay per request (HTTP 402 + stablecoins) and buy services from other agents, creating machine-to-machine markets.

| | |
| --- | --- |
| Maturity | pre-standard |
| Outlook | x402 Foundation (LF) and FIDO for mandates. Medium chance of a stable spec in 24 months, low chance of real volume. |
| Related standards | [x402 (HTTP 402 payments)](commerce.md#x402), [Agent Payments Protocol (AP2)](commerce.md#ap2), [Verifiable Intent](commerce.md#verifiable-intent) |
| Critique | Developers already pay through subscriptions and credits, so volumes stay tiny despite the build-out. https://www.kucoin.com/news/flash/agent-payments-after-one-year-hype-vs-reality-in-ai-powered-commerce |
| Radar | **hold**: Unfold's money model is an authorized budget per ticket; agent-to-agent payments would bypass it and lack real volume. |
| Watch for | Sustained non-test x402 volume reported by an independent analytics source, or a major PSP making agent payments default in checkout. |
| Decisions | [adr-0006-the-ticket-is-the-billing-unit](../../../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md), [adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance](../../../../../docs/adr/adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance.md), [0008-litellm-is-the-credential-and-metering-seam](../../../../../apps/ploeg/docs/adrs/0008-litellm-is-the-credential-and-metering-seam.md), [0012-two-level-budgets-authorized-and-settled](../../../../../apps/ploeg/docs/adrs/0012-two-level-budgets-authorized-and-settled.md), [0039-a-run-calls-only-its-roles-model-and-the-advisor-waits-for-metering](../../../../../apps/ploeg/docs/adrs/0039-a-run-calls-only-its-roles-model-and-the-advisor-waits-for-metering.md), [0155-an-operator-settles-an-account-the-gateway-cannot-answer-for-from-evidence-and-never-below-what-ploeg-observed](../../../../../apps/ploeg/docs/adrs/0155-an-operator-settles-an-account-the-gateway-cannot-answer-for-from-evidence-and-never-below-what-ploeg-observed.md), [0162-a-team-spends-at-most-its-cap-per-period-and-a-claim-over-it-starts-nothing](../../../../../apps/ploeg/docs/adrs/0162-a-team-spends-at-most-its-cap-per-period-and-a-claim-over-it-starts-nothing.md), [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** Linux Foundation launches the x402 Foundation (protocol from Coinbase), 2026-04-02, MCP Dev Summit NYC. https://www.linuxfoundation.org/press/linux-foundation-is-launching-the-x402-foundation-and-welcoming-the-contribution-of-the-x402-protocol; Cloudflare Monetization Gateway waitlist, 2026-07-01, and AWS x402 at the edge [secondary]. https://infoq.com/news/2026/07/cloudflare-aws-x402-micropayment/; {"Skeptical view": "~$17k/day on-chain volume, about half of it tests (CoinDesk 2026-03, via KuCoin) [secondary]. https://www.kucoin.com/news/flash/agent-payments-after-one-year-hype-vs-reality-in-ai-powered-commerce"}

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| The ticket is the market unit | Agency billing | Accepted: Agencies sell a quoted, capped Shift budget charged on delivery (system ADR-0006), a human-facing price, not agent micropayments. | S | Clients buy outcomes they understand. |
| Internal metering is the ledger | LiteLLM and ploegd | Already built: LiteLLM meters each Run's key and ploegd settles spend into the Shift (Ploeg ADR-0008, ADR-0012), and an operator settles from evidence when the gateway cannot answer (Ploeg ADR-0155). | S | Spend is exact without any payment rail. |
| Allowances for Asks and chat | Asks | Accepted: Asks are paid from a monthly allowance (system ADR-0031) and a Team spends at most its cap per period (Ploeg ADR-0162). | S | Read-only agent use is budgeted like any other. |
| No agent pays outside the Run | Workers | Resist: workers have no internet route and Runs call only their Role's model (Ploeg ADR-0039), so x402-style payments have nowhere to happen. | S | No agent can spend money the budget did not authorize. |
| Revisit for paid tool servers | Gateway MCP tools | Watch: if paid MCP tools appear that a Team needs, meter them through the gateway contract (Ploeg ADR-0177) rather than giving Runs a wallet. | M | Keeps one budget authority even when tools cost money. |

## Agent identity as workload identity vs as a delegated human { #agent-identity-workload-vs-delegated }

Should an agent authenticate as its own workload (SPIFFE/WIMSE), act as a user (impersonation), or carry both, with its own identity plus an on-behalf-of chain?

| | |
| --- | --- |
| Maturity | pre-standard |
| Outlook | IETF WIMSE/OAuth plus OpenID. High chance that "both" (workload identity plus a delegation chain) becomes the norm in 24 months. The specs themselves are a sibling's scope. |
| Related standards | [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange), [Identity Assertion JWT Authorization Grant (ID-JAG)](identity.md#id-jag) |
| Critique | The OpenID paper flags user impersonation as an anti-pattern because it erases accountability. That directly challenges "agents act as a named human". https://openid.net/new-whitepaper-tackles-ai-agent-identity-challenges/ |
| Radar | **adopt**: Ploeg has decided to carry both a workload identity and a delegated person on every Run, and RFC-0011 is rolling it out. |
| Watch for | WIMSE adopts an agent-identity draft as a WG item, or MCP authorization mandates ID-JAG or token exchange. |
| Decisions | [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md), [adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation](../../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md), [0086-github-is-a-forge-and-a-run-pushes-with-its-own-github-app-installation-token](../../../../../apps/ploeg/docs/adrs/0086-github-is-a-forge-and-a-run-pushes-with-its-own-github-app-installation-token.md), [0108-every-operator-action-names-its-person-and-channel-and-an-mcp-action-needs-the-persons-confirmation](../../../../../apps/ploeg/docs/adrs/0108-every-operator-action-names-its-person-and-channel-and-an-mcp-action-needs-the-persons-confirmation.md), [0112-a-claude-environment-run-uses-the-claude-login-of-the-person-it-acts-for](../../../../../apps/ploeg/docs/adrs/0112-a-claude-environment-run-uses-the-claude-login-of-the-person-it-acts-for.md), [0149-a-declared-plugin-may-receive-a-signed-run-identity-that-names-its-run-and-authorizes-nothing](../../../../../apps/ploeg/docs/adrs/0149-a-declared-plugin-may-receive-a-signed-run-identity-that-names-its-run-and-authorizes-nothing.md), [0150-an-operator-consumer-proves-the-person-it-acts-for-with-a-token-exchanged-for-ploegs-audience](../../../../../apps/ploeg/docs/adrs/0150-an-operator-consumer-proves-the-person-it-acts-for-with-a-token-exchanged-for-ploegs-audience.md), [0156-each-run-carries-a-transaction-token-that-names-its-person-and-a-team-without-a-sponsor-runs-nothing](../../../../../apps/ploeg/docs/adrs/0156-each-run-carries-a-transaction-token-that-names-its-person-and-a-team-without-a-sponsor-runs-nothing.md), [0171-an-operator-change-needs-a-proven-person-and-the-chart-refuses-asserted-attribution-from-0-3-0](../../../../../apps/ploeg/docs/adrs/0171-an-operator-change-needs-a-proven-person-and-the-chart-refuses-asserted-attribution-from-0-3-0.md), [0180-a-call-without-a-live-person-is-attributed-to-its-run-or-a-proven-workload-and-an-administrator-overrides-as-themselves](../../../../../apps/ploeg/docs/adrs/0180-a-call-without-a-live-person-is-attributed-to-its-run-or-a-proven-workload-and-an-administrator-overrides-as-themselves.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** OpenID Foundation AIIM CG whitepaper "Identity Management for Agentic AI", 2025-10-07, arXiv 2510.25819 (Tobin South et al.). https://openid.net/new-whitepaper-tackles-ai-agent-identity-challenges/ ; https://arxiv.org/abs/2510.25819; draft-klrc-aiagent-auth (AIMS) treats agents as workloads, 2026-03 [secondary]. https://securew2.com/blog/ietf-aims; draft-ni-wimse-ai-agent-identity "dual-identity credentials", CSA note 2026-09-02 [secondary]. https://labs.cloudsecurityalliance.org/research/csa-research-note-ietf-agent-identity-standards-20260902-csa/; MCP authorization roadmap (DPoP, workload identity federation, ID-JAG), AGNTCon NA 2026-10-22 [secondary]. https://lucaberton.com/blog/agntcon-mcpcon-north-america-2026/

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Every agent action names its person | Identity across Ploeg and Unfold | Proposed, stage 1 in review: credentials that prove both the person and the agent for every action (RFC-0011). | L | Answers who did this for every push, comment and merge. |
| Transaction token with person and Team | Run identity | Decided: each Run carries a transaction token naming its person, and an unsponsored Team runs nothing (Ploeg ADR-0156); calls without a live person are attributed to the Run or a proven workload (Ploeg ADR-0180). | M | Combines workload identity with an on-behalf-of chain. |
| Token exchange for operator consumers | Unfold to Ploeg | Decided: an operator consumer proves its person with a token exchanged for Ploeg's audience (Ploeg ADR-0150), and Unfold asserts no attribution from chart 0.3.0 (Ploeg ADR-0171). | M | Unfold cannot impersonate a person to Ploeg. |
| Signed Run identity that authorizes nothing | Plugins | Decided: a declared plugin may receive a signed Run identity that names its Run and authorizes nothing (Ploeg ADR-0149). | S | Third-party tools can attribute without gaining power. |
| Push as the Run's own app installation | Forge credentials | Decided: on GitHub a Run pushes with its own app installation token (Ploeg ADR-0086), and a Claude environment Run uses the login of the person it acts for (Ploeg ADR-0112). | S | Forge history shows the agent and the person distinctly. |

## Agent lifecycle management (registration, versioning, retirement), "AgentOps" { #agentops-lifecycle }

Agents get registered, owned, versioned, reviewed and retired like services or employees, with directories and SCIM-like provisioning.

| | |
| --- | --- |
| Maturity | pre-standard |
| Outlook | SCIM extension (IETF SCIM WG) and the MCP Registry. Medium chance for SCIM agent schema in 24 months. |
| Related standards | [MCP Registry](discovery.md#mcp-registry) |
| Critique | The registry approaches are split (DHT, OCI, VC, enterprise directory), and none of the sources found describes an end-to-end retire flow (absence). https://arxiv.org/abs/2508.03095 |
| Radar | **trial**: The Team manifest covers registration and versioning; ownership review and retirement from Unfold are not built. |
| Watch for | IETF SCIM WG adopts an agent resource draft, or MCP Registry GA with ownership and deprecation fields. |
| Decisions | [adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach](../../../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md), [0091-each-run-records-the-model-harness-plan-and-ploegd-version-it-was-configured-with](../../../../../apps/ploeg/docs/adrs/0091-each-run-records-the-model-harness-plan-and-ploegd-version-it-was-configured-with.md), [0097-a-run-records-its-harness-version-and-the-teams-read-shows-each-roles-harness-and-model](../../../../../apps/ploeg/docs/adrs/0097-a-run-records-its-harness-version-and-the-teams-read-shows-each-roles-harness-and-model.md), [0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills](../../../../../apps/ploeg/docs/adrs/0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills.md), [0118-the-unmaintained-openhands-cli-is-retired-as-a-harness](../../../../../apps/ploeg/docs/adrs/0118-the-unmaintained-openhands-cli-is-retired-as-a-harness.md), [0134-ploeg-keeps-each-release-compatible-with-the-one-before-and-removes-only-after-a-deprecated-minor](../../../../../apps/ploeg/docs/adrs/0134-ploeg-keeps-each-release-compatible-with-the-one-before-and-removes-only-after-a-deprecated-minor.md), [0162-a-team-spends-at-most-its-cap-per-period-and-a-claim-over-it-starts-nothing](../../../../../apps/ploeg/docs/adrs/0162-a-team-spends-at-most-its-cap-per-period-and-a-claim-over-it-starts-nothing.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** "Evolution of AI Agent Registry Solutions" (MCP Registry, A2A Agent Cards, AGNTCY ADS, Entra Agent ID, NANDA), arXiv 2508.03095, 2025-08. https://arxiv.org/abs/2508.03095; OpenID AIIM whitepaper proposes a SCIM AgenticIdentity resource type, 2025-10-07. https://openid.net/new-whitepaper-tackles-ai-agent-identity-challenges/; IETF DAWN (discovery) BoF deferred at IETF 126. https://datatracker.ietf.org/meeting/126/materials/minutes-126-agentproto-202607230700-00

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| The Team manifest registers an agent crew | Team manifest | Decided: a Team is Ploeg's own manifest of charter, crew, permissions, intake and skills (Ploeg ADR-0110). | M | Each agent crew has an owner, a scope and a version. |
| Configuration recorded per Run | Run records | Decided: each Run records model, harness and plan (Ploeg ADR-0091, ADR-0097). | S | Versions of an agent are traceable in history. |
| Retirement with a deprecation window | Releases | Decided: Ploeg removes only after a deprecated minor (Ploeg ADR-0134), and retired the OpenHands CLI harness that way (Ploeg ADR-0118). | S | Agents retire predictably. |
| Team cap per period | Budgets | Decided: a Team spends at most its cap per period (Ploeg ADR-0162). | S | A forgotten agent cannot run up a bill. |
| Provision Teams from the Tenant directory | Unfold tenancy | Proposed: create and retire Teams per Tenant from Unfold with an owner and review date, under the Tenant bound of system ADR-0017. | M | Agencies manage agent crews like staff, with owners and end dates. |

## Agent memory (episodic/semantic/procedural) and memory portability { #agent-memory-portability }

Persistent agent memory outside the context window, plus the idea that a user's or agent's memory should move between vendors with signed, erasable records.

| | |
| --- | --- |
| Maturity | pre-standard |
| Outlook | W3C CG plus an IETF independent submission. Low chance of real cross-vendor adoption in 24 months, because the hyperscalers are absent and their memory is a lock-in asset. |
| Related standards | [Model Context Protocol](tool.md#mcp) |
| Critique | Letta reported a plain filesystem agent scoring 74% on LoCoMo, beating specialised memory systems. In that reading memory is "files plus tools", not a protocol [secondary]. https://www.36kr.com/p/3423823155252610 |
| Radar | **trial**: Unfold's scoped, reviewed, exportable knowledge base is designed but still proposed, so it should be proven on one Tenant first. |
| Watch for | Any of OpenAI, Anthropic, Google or Microsoft joining the W3C memory CG, or an export/import memory API across two vendors. |
| Decisions | [adr-0021-agents-are-briefed-from-a-per-tenant-knowledge-base-exchanged-as-okf](../../../../../docs/adr/adr-0021-agents-are-briefed-from-a-per-tenant-knowledge-base-exchanged-as-okf.md), [adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant](../../../../../docs/adr/adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md), [0066-a-runs-learnings-are-proposals-a-person-reviews-before-any-run-sees-them](../../../../../apps/ploeg/docs/adrs/0066-a-runs-learnings-are-proposals-a-person-reviews-before-any-run-sees-them.md), [0087-ploegd-holds-a-tenants-knowledge-graphs-and-serves-a-run-only-its-work-items-scopes](../../../../../apps/ploeg/docs/adrs/0087-ploegd-holds-a-tenants-knowledge-graphs-and-serves-a-run-only-its-work-items-scopes.md), [0088-a-run-writes-work-item-notes-without-review-and-a-wider-scope-is-a-promotion-a-person-accepts](../../../../../apps/ploeg/docs/adrs/0088-a-run-writes-work-item-notes-without-review-and-a-wider-scope-is-a-promotion-a-person-accepts.md), [0122-every-note-carries-its-provenance-untrusted-text-is-quoted-and-a-wider-level-needs-evidence-or-a-person](../../../../../apps/ploeg/docs/adrs/0122-every-note-carries-its-provenance-untrusted-text-is-quoted-and-a-wider-level-needs-evidence-or-a-person.md), [0179-a-consumer-exports-its-tenant-as-one-consistent-jsonl-archive-with-a-checksummed-manifest](../../../../../apps/ploeg/docs/adrs/0179-a-consumer-exports-its-tenant-as-one-consistent-jsonl-archive-with-a-checksummed-manifest.md), [2026-10-04-rfc-agent-knowledge](../../../../../docs/research/2026-10-04-rfc-agent-knowledge.md), [2026-10-14-hermes-agent-fit](../../../../../docs/research/2026-10-14-hermes-agent-fit.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** W3C AI Agent Memory Interoperability CG, charter v1.0 adopted 2026-06-19, chair Russell Jackson. Normatively references IETF independent submission draft-saihm-memory-protocol. https://www.w3.org/community/ai-agent-memory-interop/2026/07/16/charter-ai-agent-memory-interoperability-community-group-v1-0/; Chhikara et al., "Mem0", arXiv 2504.19413, 2025-04. https://arxiv.org/abs/2504.19413; Portable Agent Memory preprint (episodic/semantic/procedural/working/identity), arXiv 2605.11032, 2026-05 (not opened). https://arxiv.org/html/2605.11032; Anthropic's "structured note-taking" as agentic memory, 2025-09-29. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| OKF as the portable memory format | Tenant knowledge base | Proposed: exchange each Tenant's knowledge as OKF, a directory of markdown files with frontmatter, so it can leave Unfold intact (system ADR-0021, ADR-0050). | M | An Agency's accumulated knowledge is not locked into Unfold or a model vendor. |
| Learnings are proposals a person reviews | Run outcome, knowledge base | Proposed: a Run proposes learnings and a person accepts each before any Run sees it (Ploeg ADR-0066); work-item notes need no review but a wider scope is a promotion a person accepts (Ploeg ADR-0088). | M | Stops one hijacked Run from poisoning the memory every later Run reads. |
| Provenance on every note | ploegd knowledge graphs | Proposed: every note carries its provenance, untrusted text is quoted, and a wider level needs evidence or a person (Ploeg ADR-0122). | S | Memory records stay attributable and erasable, which the portability critique asks for. |
| Tenant export carries the memory | Tenant archive | Proposed: include the knowledge graphs in the consistent JSONL archive with a checksummed manifest (Ploeg ADR-0179). | S | An Agency that leaves takes its memory with it. |
| Do not depend on harness-native memory | Harness adapters | Resist: native harness session state stays opaque and portable hand-offs use repository changes and structured evidence (apps/unfold/AGENTS.md), so no Run relies on a vendor's memory feature. | S | Switching harness or model never loses what the Tenant has learned. |

## Agent mesh / the gateway as the control plane { #agent-gateway-control-plane }

All agent-to-model, agent-to-tool and agent-to-agent traffic flows through gateways that apply auth, policy, budget, observability and routing, with a registry and runtime forming an "agent mesh".

| | |
| --- | --- |
| Maturity | de-facto-convention |
| Outlook | Implementations at AAIF/CNCF. Gateway API extensions (Kubernetes SIG) could standardise config. Medium chance in 24 months. |
| Related standards | [Model Context Protocol](tool.md#mcp), [Agent2Agent Protocol](agent-agent.md#a2a) |
| Critique | Centralising all traffic creates a single point of failure and a high-value target, and "mesh" adds sidecar-era complexity most teams don't need. Critics prefer a thin gateway plus a PDP. https://davepatten.substack.com/p/ai-agent-gateways-the-new-security |
| Radar | **adopt**: The gateway already authorizes, caps and meters every Run; Ploeg has made it a contract with two implementations. |
| Watch for | A Kubernetes Gateway API GEP for MCP/A2A routing, or AAIF publishing a gateway conformance profile. |
| Decisions | [0008-litellm-is-the-credential-and-metering-seam](../../../../../apps/ploeg/docs/adrs/0008-litellm-is-the-credential-and-metering-seam.md), [0025-management-authority-stays-in-the-control-plane](../../../../../apps/ploeg/docs/adrs/0025-management-authority-stays-in-the-control-plane.md), [0037-teams-opt-into-registry-egress-through-a-logged-allowlist-proxy](../../../../../apps/ploeg/docs/adrs/0037-teams-opt-into-registry-egress-through-a-logged-allowlist-proxy.md), [0049-a-run-card-reads-the-gateway-for-usage-so-far-while-a-run-is-running](../../../../../apps/ploeg/docs/adrs/0049-a-run-card-reads-the-gateway-for-usage-so-far-while-a-run-is-running.md), [0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team](../../../../../apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md), [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md), [2026-10-14-litellm-and-fireworks-update](../../../../../docs/research/2026-10-14-litellm-and-fireworks-update.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** Linux Foundation accepts agentgateway (Solo.io), 2025-08-25. https://linuxfoundation.org/press/linux-foundation-welcomes-agentgateway-project-to-accelerate-ai-agent-adoption-while-maintaining-security-observability-and-governance; AAIF adds agentgateway as hosted project, ~2026-06-04 [secondary]. https://itbrief.com.au/story/agentic-ai-foundation-adds-agentgateway-as-hosted-project; {"Workshop": "gateway + registry + runtime agent mesh with agentgateway and kagent (CNCF Sandbox). https://pretalx.com/workshop-tage-2026/talk/WN8QU7/"}; AGNTCon NA 2026 interviews (Stephen Watt / Red Hat on agent gateways; Michael Levan / Solo.io) [secondary]. https://lucaberton.com/blog/agntcon-mcpcon-north-america-2026/

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| LiteLLM as the credential and metering seam | Model gateway | Already built: only ploegd holds the master key and mints capped per-Run keys at the gateway (Ploeg ADR-0008). | S | Every model call is authorized, capped and counted in one place. |
| A gateway contract with two implementations | Gateway contract | Decided: Ploeg reaches models through a gateway contract with LiteLLM and Envoy AI Gateway as implementations (Ploeg ADR-0177). | M | No lock-in to one gateway product. |
| MCP tools only through the gateway | Gateway MCP | Decided: Runs reach read-only MCP tools only through the gateway, bounded by a LiteLLM team (Ploeg ADR-0078). | M | Tool traffic gets the same auth, limits and logs as model traffic. |
| Live usage read from the gateway | Run card | Decided: a running Run's card reads usage so far from the gateway (Ploeg ADR-0049). | S | People see spend while it happens, not after settlement. |
| Authority stays in the control plane | ploegd | Resist: management authority stays in Ploeg's control plane (Ploeg ADR-0025); the gateway enforces keys and limits but does not decide who may run. | S | A gateway compromise, like the LiteLLM advisory of 2026-09-30, cannot grant new work. |

## Agent observability as audit ("flight recorders") { #flight-recorder-audit }

A tamper-evident, append-only record of every agent decision, tool call, approval and policy decision, kept for forensics and regulation rather than just debugging.

| | |
| --- | --- |
| Maturity | pre-standard |
| Outlook | OTel GenAI conventions cover the telemetry. The IETF audit-trail format is an individual draft. Medium chance that "audit profile of OTel" emerges in 24 months. |
| Related standards | — |
| Critique | Most "flight recorder" projects are self-certified hobby or vendor tools, and their compliance claims are unaudited. https://hnshowcase.com/post/47159401/unworldly-a-flight-recorder-for-ai-agents-tamper-proof-hipaa |
| Radar | **trial**: The recording exists or is decided; tamper evidence and an export for auditors are still missing. |
| Watch for | OTel GenAI SIG publishes an audit/compliance profile, or the agent-audit-trail draft gets adopted by a WG. |
| Decisions | [adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation](../../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md), [0045-keep-run-usage-and-merge-facts](../../../../../apps/ploeg/docs/adrs/0045-keep-run-usage-and-merge-facts.md), [0076-run-health-is-observable-by-team-and-role-through-one-correlation-key](../../../../../apps/ploeg/docs/adrs/0076-run-health-is-observable-by-team-and-role-through-one-correlation-key.md), [0090-a-runs-agent-session-is-kept-as-a-bounded-redacted-transcript](../../../../../apps/ploeg/docs/adrs/0090-a-runs-agent-session-is-kept-as-a-bounded-redacted-transcript.md), [0091-each-run-records-the-model-harness-plan-and-ploegd-version-it-was-configured-with](../../../../../apps/ploeg/docs/adrs/0091-each-run-records-the-model-harness-plan-and-ploegd-version-it-was-configured-with.md), [0108-every-operator-action-names-its-person-and-channel-and-an-mcp-action-needs-the-persons-confirmation](../../../../../apps/ploeg/docs/adrs/0108-every-operator-action-names-its-person-and-channel-and-an-mcp-action-needs-the-persons-confirmation.md), [0113-a-runs-harness-exports-opentelemetry-to-a-collector-set-per-team-and-role](../../../../../apps/ploeg/docs/adrs/0113-a-runs-harness-exports-opentelemetry-to-a-collector-set-per-team-and-role.md), [0114-each-run-records-the-limits-that-stop-its-prompt](../../../../../apps/ploeg/docs/adrs/0114-each-run-records-the-limits-that-stop-its-prompt.md), [0179-a-consumer-exports-its-tenant-as-one-consistent-jsonl-archive-with-a-checksummed-manifest](../../../../../apps/ploeg/docs/adrs/0179-a-consumer-exports-its-tenant-as-one-consistent-jsonl-archive-with-a-checksummed-manifest.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** IETF draft-sharif-agent-audit-trail-01 (Agent Audit Trail, JSON with hash chaining). https://datatracker.ietf.org/doc/html/draft-sharif-agent-audit-trail-01; EU AI Act automatic event recording for high-risk systems from Aug 2026 (cited by the draft).; Vorlon "AI Agent Flight Recorder" at RSAC 2026 [secondary]. https://son-website.pages.dev/insights/2026-03-26-vorlon-agent-flight-recorder-forensics; {"IETF 126 agentproto": "Altanai Bisht argued for audit signals that the charter excludes. https://datatracker.ietf.org/meeting/126/materials/minutes-126-agentproto-202607230700-00"}

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Bounded, redacted transcript per Run | Run records | Decided: a Run's agent session is kept as a bounded, redacted transcript (Ploeg ADR-0090). | S | Every decision an agent made can be read back after the fact. |
| Configuration and limits recorded per Run | Run records | Decided: each Run records its model, harness, plan, ploegd version and the limits that stop its prompt (Ploeg ADR-0091, ADR-0114). | S | A forensic reader knows exactly what ran under which rules. |
| Action Records name person and channel | Operator actions | Decided: every operator action names its person and channel and an MCP action needs confirmation (Ploeg ADR-0108, system ADR-0037). | S | Human interventions sit in the same record as agent actions. |
| One correlation key across telemetry | Observability | Decided: run health is observable by Team and Role through one correlation key, and harnesses export OpenTelemetry per Team and Role (Ploeg ADR-0076, ADR-0113). | M | Logs, traces and spend join on one id. |
| Make the record tamper-evident | Audit log | Proposed: hash-chain the audit log and transcripts and include them in the checksummed Tenant export (Ploeg ADR-0179). | M | Gives Agencies evidence that holds up with a client or regulator. |

## Agent OS concepts { #agent-os }

Model the agent runtime as an operating system (kernel, scheduler, LLM syscalls, memory and storage managers), with agents as apps.

| | |
| --- | --- |
| Maturity | idea |
| Outlook | none. Low chance in 24 months. In practice the "OS" role is being filled by harness, sandbox and gateway projects. |
| Related standards | — |
| Critique | No 2026 production adoption turned up in searches. Kubernetes plus gateways plus sandboxes already deliver scheduling and isolation, so the OS metaphor adds vocabulary rather than mechanism (absence finding). |
| Radar | **hold**: The concept is an idea without an interface, and Ploeg already provides the scheduling and isolation it describes. |
| Watch for | A major runtime adopting an LLM-syscall interface, or AIOS cited by a foundation project. |
| Decisions | [adr-0036-ploeg-and-unfold-use-one-vocabulary-with-named-screen-words](../../../../../docs/adr/adr-0036-ploeg-and-unfold-use-one-vocabulary-with-named-screen-words.md), [0107-execution-runs-in-cells-that-pull-from-one-hub](../../../../../apps/ploeg/docs/adrs/0107-execution-runs-in-cells-that-pull-from-one-hub.md), [0143-a-persons-machine-is-a-personal-cell-and-a-run-gets-a-capability-only-when-its-person-grants-it](../../../../../apps/ploeg/docs/adrs/0143-a-persons-machine-is-a-personal-cell-and-a-run-gets-a-capability-only-when-its-person-grants-it.md), [rfc-0010-agents-on-your-own-machine](../../../../../docs/design/rfc-0010-agents-on-your-own-machine.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** {"Mei et al. (Rutgers, Yongfeng Zhang), \"AIOS": "LLM Agent Operating System\", arXiv 2403.16971 (v4 2025-05). https://arxiv.org/html/2403.16971v5"}; Ge et al., "LLM as OS, Agents as Apps", arXiv 2312.03815, 2023-12. https://ar5iv.labs.arxiv.org/html/2312.03815

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Ploeg is already the scheduler | ploegd, KEDA | Ploeg schedules Runs, holds Leases and enforces budgets (docs/concepts/how-work-flows.md); calling it an OS adds a metaphor, not a capability. | S | Avoids a rename that confuses the one vocabulary of system ADR-0036. |
| Cells pull from one hub | Execution cells | Decided: execution runs in cells that pull from one hub (Ploeg ADR-0107), the useful part of the OS idea: one kernel, many places to run. | M | Scales execution without a new runtime abstraction. |
| No LLM-syscall layer under harnesses | Harness adapters | Resist: harness session state stays opaque (apps/unfold/AGENTS.md); wrapping harnesses in an LLM-syscall interface would fight every vendor's loop. | S | Keeps harnesses swappable. |
| Personal cells as user space | Laptop daemon | Proposed: a person's machine is a personal cell (Ploeg ADR-0143, RFC-0010), giving local Runs the same scheduling without a new OS layer. | M | Local work joins the same accounting and identity. |
| Watch for an AIOS-style runtime standard | Architecture | Watch only: revisit if a foundation project standardises an agent kernel interface. | S | No effort spent until there is something to conform to. |

## Capability-based / object-capability security for agents (and the lethal trifecta) { #capability-security-agents }

Agents get unforgeable, minimal, attenuable capabilities and data carries provenance. Untrusted data can never steer privileged actions, and private data, untrusted content and an outbound channel are never combined.

| | |
| --- | --- |
| Maturity | pattern |
| Outlook | none directly. The ideas leak into OAuth attenuation, MCP permission models and AAuth. Low chance as a standard, high as a design norm. |
| Related standards | [MCP Authorization (core spec, revision 2026-07-28)](identity.md#mcp-authorization) |
| Critique | CaMeL drops task success (77% vs 84% on AgentDojo), assumes a trusted user prompt and leaves side channels open. https://arxiv.org/html/2505.22852v1 |
| Radar | **adopt**: Minimal, per-Run, attenuated credentials and quoted untrusted input are already Ploeg's core design. |
| Watch for | MCP or OAuth specs adopting attenuable capability tokens, or a CaMeL-style interpreter in a mainstream agent SDK. |
| Decisions | [0008-litellm-is-the-credential-and-metering-seam](../../../../../apps/ploeg/docs/adrs/0008-litellm-is-the-credential-and-metering-seam.md), [0013-push-rights-are-minted-per-run](../../../../../apps/ploeg/docs/adrs/0013-push-rights-are-minted-per-run.md), [0034-the-harness-gets-placeholders-the-worker-keeps-credentials](../../../../../apps/ploeg/docs/adrs/0034-the-harness-gets-placeholders-the-worker-keeps-credentials.md), [0122-every-note-carries-its-provenance-untrusted-text-is-quoted-and-a-wider-level-needs-evidence-or-a-person](../../../../../apps/ploeg/docs/adrs/0122-every-note-carries-its-provenance-untrusted-text-is-quoted-and-a-wider-level-needs-evidence-or-a-person.md), [0138-a-harness-runs-in-its-own-container-and-no-credential-enters-it](../../../../../apps/ploeg/docs/adrs/0138-a-harness-runs-in-its-own-container-and-no-credential-enters-it.md), [0143-a-persons-machine-is-a-personal-cell-and-a-run-gets-a-capability-only-when-its-person-grants-it](../../../../../apps/ploeg/docs/adrs/0143-a-persons-machine-is-a-personal-cell-and-a-run-gets-a-capability-only-when-its-person-grants-it.md), [0170-tracker-and-forge-text-enters-the-prompt-in-an-untrusted-frame-it-cannot-close](../../../../../apps/ploeg/docs/adrs/0170-tracker-and-forge-text-enters-the-prompt-in-an-untrusted-frame-it-cannot-close.md), [rfc-0010-agents-on-your-own-machine](../../../../../docs/design/rfc-0010-agents-on-your-own-machine.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** Debenedetti et al. (Google DeepMind/ETH), "Defeating Prompt Injections by Design" (CaMeL), arXiv 2503.18813, 2025-03 (rev. 2025-06). https://arxiv.org/abs/2503.18813; "Operationalizing CaMeL", arXiv 2505.22852, 2025-05. https://arxiv.org/html/2505.22852v1; Simon Willison, "The lethal trifecta", 2025-06-16. https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Per-Run minted credentials | ploegd, worker | Already built: model key capped at the Run's budget, push token for the Run's repository only, control capability for that Run only (Ploeg ADR-0008, ADR-0013). | S | A stolen credential is worth one Run, one repository and one budget. |
| Placeholders in the harness | Worker loopback proxies | Already built: the harness gets placeholder credentials and runs in its own container that no credential enters (Ploeg ADR-0034, ADR-0138). | S | Prompt injection cannot exfiltrate a real key. |
| Untrusted text in a frame it cannot close | Run prompt | Decided: tracker and forge text enters the prompt in an untrusted frame (Ploeg ADR-0170), and notes carry provenance (Ploeg ADR-0122). | S | Data from the ticket cannot pose as instructions. |
| Breaking the lethal trifecta by network | Worker network policy | Already built: a worker has no route to the internet, so private code, untrusted content and an outbound channel are never combined (docs/concepts/inside-a-run.md, Network reach). | S | Exfiltration needs a channel that does not exist. |
| Capabilities granted by the person on a laptop | Personal cell | Proposed: on a person's machine a Run gets a capability only when its person grants it (Ploeg ADR-0143, RFC-0010). | M | Extends the same model to local Runs with more rights. |

## Code mode / tools-as-code-API { #code-mode-tools-as-code }

Instead of exposing hundreds of tools, give the model a sandbox and a typed API and let it write code that calls the tools. Tool definitions shrink from millions of tokens to about a thousand.

| | |
| --- | --- |
| Maturity | pattern |
| Outlook | Could land in MCP as a server pattern or sandbox profile (AAIF). Medium chance in 24 months. |
| Related standards | [Model Context Protocol](tool.md#mcp) |
| Critique | It requires a secure sandbox and correct model-written code, and it moves policy enforcement from per-tool grants into arbitrary code [secondary]. https://wikidocs.net/blog/@jaehong/8269/ |
| Radar | **assess**: Runs already write code against a shell, and the MCP surfaces are small, so the pattern solves a problem Unfold barely has. |
| Watch for | An MCP SEP or AAIF sandbox profile that defines code-execution tool servers. |
| Decisions | [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp](../../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md), [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), [0035-runs-get-ploeg-owned-skills-mounted-toolchains-and-worker-verification](../../../../../apps/ploeg/docs/adrs/0035-runs-get-ploeg-owned-skills-mounted-toolchains-and-worker-verification.md), [0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team](../../../../../apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md), [0117-every-release-publishes-a-contract-bundle-for-consumers](../../../../../apps/ploeg/docs/adrs/0117-every-release-publishes-a-contract-bundle-for-consumers.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** Cloudflare, "Code Mode" MCP server (search() + execute() over 2,500+ endpoints in ~1,000 tokens). https://ghost.blog.cloudflare.com/code-mode-mcp/; Anthropic, "Code execution with MCP" (cited by Cloudflare; not fetched) [secondary]. https://www.anthropic.com/engineering/code-execution-with-mcp

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| The Run already has code mode | Harness in the worker pod | A Run's harness has a shell and toolchains inside a sandboxed pod (Ploeg ADR-0035, system ADR-0045), so it already composes tools in code; nothing to add. | S | Avoids building a second code sandbox inside the first. |
| Small MCP surfaces need no code mode | ploeg-mcp and unfold-mcp | Resist: both servers are read-first with a small tool set (system ADR-0011, ADR-0032), so tool definitions are cheap and code mode buys nothing. | S | Keeps the operator surfaces simple to audit. |
| Keep per-call visibility for the tripwire | Decider tripwire | Resist inside Runs: the proposed tripwire scores each tool call (system ADR-0042); a generated script that batches many calls hides them unless the script itself is scored. | S | Preserves the per-action signal oversight depends on. |
| Typed client for operator consumers | Operator consumers of Ploeg | Proposed: publish a typed client from the contract bundle (Ploeg ADR-0117) so an operator agent can script many reads in one step instead of many tool calls. | M | Cheaper bulk reads for agents that triage a whole board. |
| Re-evaluate on an MCP code-execution profile | Gateway MCP tools | Watch: if MCP defines code-execution tool servers, assess them for the read-only tools Runs reach through the gateway (Ploeg ADR-0078). | S | Picks the pattern up only when it is standard and fits the gateway bound. |

## Computer use / browser agents as the universal fallback interface { #computer-use-fallback }

When no API or MCP exists, agents operate the GUI or browser like a human. APIs come first and computer use fills the gaps.

| | |
| --- | --- |
| Maturity | pattern |
| Outlook | WebMCP is the standards answer that makes it unnecessary. Web Bot Auth handles identification. Low chance of standardising computer use itself. |
| Related standards | [WebMCP (Web Model Context API)](commerce.md#webmcp), [Web Bot Auth (HTTP Message Signatures for automated traffic)](web-content.md#web-bot-auth) |
| Critique | Token-hungry (an image per step), brittle, hard to audit, and it bypasses API-level authorization. https://openid.net/new-whitepaper-tackles-ai-agent-identity-challenges/ |
| Radar | **assess**: Browser checks of preview environments could raise review quality, but they need an egress design and reliability Unfold has not tested. |
| Watch for | OSWorld strict-grading scores above 80%, or Web Bot Auth adopted by the major agent browsers. |
| Decisions | [adr-0008-every-pull-request-gets-a-preview-environment](../../../../../docs/adr/adr-0008-every-pull-request-gets-a-preview-environment.md), [0125-a-writing-run-shows-its-change-in-a-walkthrough-a-person-can-repeat](../../../../../apps/ploeg/docs/adrs/0125-a-writing-run-shows-its-change-in-a-walkthrough-a-person-can-repeat.md), [0137-the-chart-renders-a-default-deny-networkpolicy-for-every-pod-with-an-allowlist-derived-from-its-urls](../../../../../apps/ploeg/docs/adrs/0137-the-chart-renders-a-default-deny-networkpolicy-for-every-pod-with-an-allowlist-derived-from-its-urls.md), [0183-ploegs-core-reaches-trackers-and-forges-only-through-ports-and-every-adapter-passes-its-ports-conformance-suite](../../../../../apps/ploeg/docs/adrs/0183-ploegs-core-reaches-trackers-and-forges-only-through-ports-and-every-adapter-passes-its-ports-conformance-suite.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** OSWorld progress, from about 15% (late 2024) to roughly 70%+ (2026), with the strict-vs-partial grading caveat [secondary]. https://deck.co/blog/state-of-computer-use-agents-2026; OpenID AIIM whitepaper flags browser agents bypassing API controls, 2025-10-07. https://openid.net/new-whitepaper-tackles-ai-agent-identity-challenges/; Hybrid API-first guidance [secondary]. https://unicoconnect.com/blogs/computer-use-vs-api-integration

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| A walkthrough a person can repeat | Writing Runs | Decided: a writing Run shows its change in a walkthrough a person can repeat (Ploeg ADR-0125); a browser-driving step could record it for UI changes. | M | Reviewers see the change work, not only read it. |
| Reviewer checks the preview environment | Preview environments | Proposed: a reviewer Role drives the preview environment of system ADR-0008 with a browser to check the acceptance criteria. | L | Catches UI regressions CI does not test. |
| Integrations stay API-first | Tracker and forge ports | Resist: trackers and forges are reached only through ports with conformance suites (Ploeg ADR-0183); GUI automation would be brittle and unauditable. | S | Integrations keep working across UI changes. |
| Network blocks browsing from Runs | Worker network | Resist for now: workers have no internet route (docs/concepts/inside-a-run.md); a browser Run may reach only the preview environment through an allowlist. | S | Keeps the exfiltration channel closed. |
| Unfold's UI is usable by agents | Unfold browser UI | Already a rule: labels wrap rather than clip and accessibility is checked (apps/unfold/AGENTS.md), which also makes the UI legible to a computer-use agent. | S | A person's own browser agent can operate Unfold. |

## Context engineering { #context-engineering }

Treat the context window as a scarce, curated resource. Choose the smallest high-signal set of tokens (instructions, tools, retrieved data, history) at each step, using just-in-time retrieval, compaction, notes and sub-agents.

| | |
| --- | --- |
| Maturity | de-facto-convention |
| Outlook | none. It is a discipline, not an interface. Low chance (under 10%) in 24 months. Its standardisable parts move into Skills, MCP resources and memory specs. |
| Related standards | [Model Context Protocol](tool.md#mcp), [Agent Skills (SKILL.md)](definition.md#agent-skills), [AGENTS.md](definition.md#agents-md) |
| Critique | Fresh labelling of old ideas (RAG plus prompt design). The 2026 harness-engineering discourse already treats it as a subset of the harness. https://www.faros.ai/blog/harness-engineering |
| Radar | **adopt**: Ploeg already curates each Run's context under fixed limits; the remaining work is measuring and compacting it. |
| Watch for | A spec defines a portable compaction or summary format, for example in MCP or Open Responses state handling. |
| Decisions | [adr-0021-agents-are-briefed-from-a-per-tenant-knowledge-base-exchanged-as-okf](../../../../../docs/adr/adr-0021-agents-are-briefed-from-a-per-tenant-knowledge-base-exchanged-as-okf.md), [adr-0022-people-give-a-work-item-context-files-at-the-start-and-while-steering](../../../../../docs/adr/adr-0022-people-give-a-work-item-context-files-at-the-start-and-while-steering.md), [0065-a-run-is-briefed-with-an-okf-knowledge-pack-written-outside-the-clone](../../../../../apps/ploeg/docs/adrs/0065-a-run-is-briefed-with-an-okf-knowledge-pack-written-outside-the-clone.md), [0067-context-bundles-are-stored-per-work-item-and-unpacked-by-the-worker-under-fixed-limits](../../../../../apps/ploeg/docs/adrs/0067-context-bundles-are-stored-per-work-item-and-unpacked-by-the-worker-under-fixed-limits.md), [0068-context-added-while-a-shift-runs-reaches-the-next-run](../../../../../apps/ploeg/docs/adrs/0068-context-added-while-a-shift-runs-reaches-the-next-run.md), [0083-a-run-is-told-which-skills-bear-on-its-work-item](../../../../../apps/ploeg/docs/adrs/0083-a-run-is-told-which-skills-bear-on-its-work-item.md), [0121-findings-carry-ids-writers-answer-them-and-a-run-asks-instead-of-guessing](../../../../../apps/ploeg/docs/adrs/0121-findings-carry-ids-writers-answer-them-and-a-run-asks-instead-of-guessing.md), [0163-a-reviewer-reads-the-base-branchs-instruction-files-and-a-team-can-require-a-reviewer-unlike-its-writer](../../../../../apps/ploeg/docs/adrs/0163-a-reviewer-reads-the-base-branchs-instruction-files-and-a-team-can-require-a-reviewer-unlike-its-writer.md), [2026-10-04-rfc-agent-knowledge](../../../../../docs/research/2026-10-04-rfc-agent-knowledge.md), [2026-10-04-rfc-context-bundles-and-steering](../../../../../docs/research/2026-10-04-rfc-context-bundles-and-steering.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** Anthropic Engineering, "Effective context engineering for AI agents", 2025-09-29, Rajasekaran/Dixon/Ryan/Hadfield. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents; Mei et al., "A Survey of Context Engineering for LLMs", arXiv 2507.13334, 2025-07. https://arxiv.org/html/2507.13334V1; HumanLayer "12-factor agents", factor 3 "Own your context window" (Dex Horthy), AI Engineer talk. https://github.com/humanlayer/12-factor-agents ; https://ai.engineer/talks/12-factor-agents; AI Engineer World's Fair 2026 (SF, Jun 29-Jul 2) listed context engineering as a track theme [secondary]. https://en.people.cn/n3/2026/0707/c98649-20475333.html

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Context bundles under fixed limits | Ploeg worker, Run briefing | Already built: files a person attaches to a Work Item are stored once and unpacked next to the clone under fixed size limits, with an index in the prompt instead of the full text (Ploeg ADR-0067, system ADR-0022). | S | The Run pulls in only the files it needs, so attached context does not crowd out the task. |
| Knowledge pack per Run | ploegd knowledge graphs, Run briefing | Proposed: brief each Run with only the OKF concepts that bear on its Work Item, written as files and indexed in the prompt (system ADR-0021, Ploeg ADR-0065, the agent-knowledge RFC). | M | Cuts the tokens and Rounds each Run spends rediscovering how a repository builds. |
| Clean-context reviewer | Shift plan, reviewer Rounds | Already built: a reviewer Round starts a fresh Run that reads the branch and base-branch instruction files, never the writer's transcript (Ploeg ADR-0163, the models and topology record). | S | An uncontaminated context is what makes the second look worth paying for. |
| Compact hand-off between Rounds | Shift engine, fix Rounds and retries | Proposed: give a fix Round or a retry a short structured hand-off (findings with ids, the checkpoint, the last verify result) built from Ploeg ADR-0121, ADR-0075 and the bounded transcript of ADR-0090, rather than replaying history. | M | Fix Rounds start oriented without paying for the previous Run's whole conversation. |
| Measure context spend per briefing section | Run telemetry | Proposed: tag the prompt sections a worker assembles (task, skills, bundle index, knowledge pack) and export their token counts through the OpenTelemetry collector of Ploeg ADR-0113. | M | Shows which briefing section costs most and lets the owner cut it with evidence. |

## Context files as portable artifacts (AGENTS.md, CLAUDE.md, rule files) { #context-as-portable-artifact }

Repository-resident instruction files that any coding agent reads, so project context travels with the code rather than living in one vendor's settings.

| | |
| --- | --- |
| Maturity | de-facto-convention |
| Outlook | AAIF already hosts AGENTS.md. Medium chance in 24 months of a formalised schema (sections, precedence, nesting). The format itself is free text. |
| Related standards | [AGENTS.md](definition.md#agents-md), [Agent Skills (SKILL.md)](definition.md#agent-skills) |
| Critique | The ETH study found context files do not raise task success, LLM-generated ones may lower it, and they add 20%+ inference cost. Repo overviews in particular do not help. https://arxiv.org/abs/2602.11988 |
| Radar | **adopt**: AGENTS.md is the cross-tool file and Ploeg already reads it with a clear precedence and a safety scan. |
| Watch for | An AAIF-published AGENTS.md schema or versioned spec. Major agents honouring nested-precedence rules identically. |
| Decisions | [0030-target-repository-instructions-rank-below-the-delivery-contract](../../../../../apps/ploeg/docs/adrs/0030-target-repository-instructions-rank-below-the-delivery-contract.md), [0163-a-reviewer-reads-the-base-branchs-instruction-files-and-a-team-can-require-a-reviewer-unlike-its-writer](../../../../../apps/ploeg/docs/adrs/0163-a-reviewer-reads-the-base-branchs-instruction-files-and-a-team-can-require-a-reviewer-unlike-its-writer.md), [adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant](../../../../../docs/adr/adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant.md), [adr-0047-unfold-describes-a-repository-with-the-ai-codebase-maturity-model-and-delivers-at-level-5](../../../../../docs/adr/adr-0047-unfold-describes-a-repository-with-the-ai-codebase-maturity-model-and-delivers-at-level-5.md), [2026-09-22-agents-md](../../../../../docs/research/2026-09-22-agents-md.md), [2026-10-27-ai-codebase-maturity-model-fit](../../../../../docs/research/2026-10-27-ai-codebase-maturity-model-fit.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** AAIF founding projects incl. AGENTS.md (OpenAI), 2025-12-09 [secondary]. https://www.techzine.eu/news/infrastructure/137131/newly-launched-agentic-ai-foundation-to-take-charge-of-mcps-future; AGENTS.md in "60k+" repos per recaps [secondary]. https://lucaberton.com/blog/agntcon-mcpcon-europe-2026-recap-takeaways/; Gloaguen, Mündler, Müller, Raychev, Vechev, "Evaluating AGENTS.md", arXiv 2602.11988, 2026-02-12, ICLR 2026. https://arxiv.org/abs/2602.11988

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Delivery contract outranks the repository's files | Worker prompt | Already decided: a target repository's AGENTS.md or CLAUDE.md is read but ranks below Ploeg's delivery contract (Ploeg ADR-0030). | S | A repository cannot instruct a Run out of its budget, branch or review rules. |
| Reviewer reads the base branch's instruction files | Reviewer Runs | Already decided: a reviewer reads instruction files from the base branch, so a pull request cannot rewrite the rules it is judged by (Ploeg ADR-0163). | S | Closes the trick of a change that edits AGENTS.md to excuse itself. |
| Hidden-character scan before the agent starts | ploeg-worker prepare step | Already built: the worker stops a Run when the repository's agent instruction files contain hidden characters (docs/concepts/inside-a-run.md, step 5). | S | Treats repository-resident context as untrusted input, as it should be. |
| Repository readiness check on connect | Unfold, Connect a repository | Proposed: when a repository is connected, report whether it has AGENTS.md with exact commands and a CLAUDE.md bridge, as the AGENTS.md record recommends, and fold it into the maturity level of system ADR-0047. | S | An Agency sees before the first Shift why Runs on a repository will waste tokens. |
| Keep Tenant knowledge out of the repository files | Agent knowledge | Resist: client and Tenant knowledge belongs in the scoped graphs and OKF packs (system ADR-0034), not pushed into a client's AGENTS.md, which travels to every tool and every fork. | S | Keeps one client's knowledge from leaking through a file the client's other vendors read. |

## Durable execution for agents (workflow-as-code) { #durable-execution-agents }

Checkpoint every agent step (LLM call, tool call, wait for a human), so crashes resume rather than restart and long-running agents survive deploys.

| | |
| --- | --- |
| Maturity | de-facto-convention |
| Outlook | no standards body for the engines. The MCP Tasks primitive standardises the protocol-side handle. Low chance for the engine, high for task handles. |
| Related standards | — |
| Critique | Deterministic replay clashes with nondeterministic LLM calls, and the frameworks add operational weight. Restate and DBOS argue Temporal is too heavy, so the pattern has no agreed shape [secondary]. https://www.remio.ai/post/restate-series-a-pits-a-20m-bet-against-database-backed-durable-execution |
| Radar | **adopt**: Ploeg already checkpoints, leases and settles every step in PostgreSQL, which is durable execution without a separate engine. |
| Watch for | MCP Tasks GA in a dated spec, and a durable-execution engine shipping MCP Tasks natively. |
| Decisions | [0060-authenticated-webhooks-go-through-a-durable-inbox-and-required-publications-through-an-outbox](../../../../../apps/ploeg/docs/adrs/0060-authenticated-webhooks-go-through-a-durable-inbox-and-required-publications-through-an-outbox.md), [0071-ploeg-keeps-its-state-in-postgresql-and-is-not-a-kubernetes-operator](../../../../../apps/ploeg/docs/adrs/0071-ploeg-keeps-its-state-in-postgresql-and-is-not-a-kubernetes-operator.md), [0075-a-stopped-writing-run-leaves-a-checkpoint-its-retry-starts-from](../../../../../apps/ploeg/docs/adrs/0075-a-stopped-writing-run-leaves-a-checkpoint-its-retry-starts-from.md), [0101-a-paused-run-keeps-its-pod-and-session-for-a-bounded-time-and-is-never-retried-automatically](../../../../../apps/ploeg/docs/adrs/0101-a-paused-run-keeps-its-pod-and-session-for-a-bounded-time-and-is-never-retried-automatically.md), [0173-a-webhook-delivery-is-claimed-under-a-lease-and-marked-seen-only-after-its-effects-commit](../../../../../apps/ploeg/docs/adrs/0173-a-webhook-delivery-is-claimed-under-a-lease-and-marked-seen-only-after-its-effects-commit.md), [0002-native-node-and-single-writer-storage](../../../../../apps/unfold/docs/adrs/0002-native-node-and-single-writer-storage.md), [2026-10-20-high-availability-and-scaling](../../../../../docs/research/2026-10-20-high-availability-and-scaling.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** {"Temporal, OpenAI Agents SDK integration": "public preview 2025-07-30, GA (Python) noted 2026-03-23. https://temporal.io/blog/announcing-openai-agents-sdk-integration"}; Restate $20M Series A (2026, after Temporal's Series E) [secondary]. https://www.remio.ai/post/restate-series-a-pits-a-20m-bet-against-database-backed-durable-execution; DBOS Postgres-only durable agents [secondary]. https://dev.to/mr_manushukla/durable-ai-agents-without-temporal-exactly-once-workflows-on-postgres-with-dbos-2026-5a6n; MCP Tasks (long-running handles) in the AGNTCon NA keynote, 2026-10-22 [secondary]. https://lucaberton.com/blog/agntcon-mcpcon-north-america-2026/

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| A stopped writer resumes from a checkpoint | ploeg-worker, retries | Already decided: a stopped writing Run leaves a checkpoint its retry starts from (Ploeg ADR-0075). | S | A crash costs one step, not the Run's whole spend. |
| Leases and the sweep recover dead Runs | ploegd sweep | Already built: Leases expire, the 15-second sweep blocks keys, settles spend and repairs Shifts (docs/concepts/how-work-flows.md). | S | No Run is left holding a branch or a budget after its pod dies. |
| Durable inbox and outbox | Webhook intake and publications | Already decided: authenticated webhooks go through a durable inbox claimed under a lease and marked seen only after effects commit (Ploeg ADR-0060, ADR-0173). | S | Tracker and forge events are processed exactly once across restarts. |
| Pause never becomes a retry | Unfold sessions, attended Runs | Already decided: a paused Run keeps its pod and session for a bounded time and is never retried automatically (Ploeg ADR-0101), and a restart never silently repeats paid work (apps/unfold/AGENTS.md). | S | Waiting for a human cannot quietly double the bill. |
| Do not add a workflow engine | ploegd state | Resist: state lives in PostgreSQL and Ploeg is not a Kubernetes operator (Ploeg ADR-0071); a Temporal-style engine would duplicate Leases, claims and settlement already proven there. | S | One fewer stateful system for every self-hosted Agency. |

## Evals as contracts / eval-driven development { #evals-as-contracts }

Define the evaluation before changing a prompt, model or harness. The eval suite is the spec and the definition of done, and it scores trajectories as well as final answers.

| | |
| --- | --- |
| Maturity | pattern |
| Outlook | OpenEnv at AAIF could standardise the environment/task interface. Medium chance in 24 months. Eval metrics themselves stay domain-specific. |
| Related standards | — |
| Critique | Final-output evals pass agents that reached the answer through unsafe trajectories, and LLM-as-judge is noisy, so evals can give false contracts [secondary]. https://dev.to/sebastian_chedal/evaluation-led-agent-development-five-disciplines-that-separate-production-from-pilot-2cch |
| Radar | **trial**: Ploeg has the pieces (bake-off, drills, KPIs) but no eval suite yet gates a model or harness change. |
| Watch for | OpenEnv v1 adopted by two or more labs for public evals, or eval-result attestations attached to model or skill releases. |
| Decisions | [adr-0046-an-hourly-release-train-versions-unfold-from-a-checked-development-head](../../../../../docs/adr/adr-0046-an-hourly-release-train-versions-unfold-from-a-checked-development-head.md), [0050-a-run-cards-grade-is-a-versioned-formula-over-stored-facts](../../../../../apps/ploeg/docs/adrs/0050-a-run-cards-grade-is-a-versioned-formula-over-stored-facts.md), [0126-a-recurring-attack-drill-runs-every-harness-against-a-hostile-repository](../../../../../apps/ploeg/docs/adrs/0126-a-recurring-attack-drill-runs-every-harness-against-a-hostile-repository.md), [0135-a-bake-off-runs-one-work-item-on-several-configurations-and-a-shadow-judge-recommends-while-a-person-picks](../../../../../apps/ploeg/docs/adrs/0135-a-bake-off-runs-one-work-item-on-several-configurations-and-a-shadow-judge-recommends-while-a-person-picks.md), [0183-ploegs-core-reaches-trackers-and-forges-only-through-ports-and-every-adapter-passes-its-ports-conformance-suite](../../../../../apps/ploeg/docs/adrs/0183-ploegs-core-reaches-trackers-and-forges-only-through-ports-and-every-adapter-passes-its-ports-conformance-suite.md), [kpis](../../../../../docs/reference/kpis.md), [run-a-pilot-batch](../../../../../docs/how-to/run-a-pilot-batch.md), [2026-09-27-loop-baseline](../../../../../docs/research/2026-09-27-loop-baseline.md), [2026-10-11-cost-per-merged-work-item](../../../../../docs/research/2026-10-11-cost-per-merged-work-item.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** {"Xia et al., \"Evaluation-Driven Development of LLM Agents": "A Process Model and Reference Architecture\", arXiv 2411.13768 (rev. 2025-03-27). https://arxiv.org/abs/2411.13768v2"}; OpenEnv (Hugging Face) donated to AAIF for RL environments, 2026-10-22. https://www.linuxfoundation.org/press/agentic-ai-foundation-announces-four-new-projects-agent-skills-open-responses-openenv-and-opensandbox; Stephen Watt (Red Hat) on "evals against skills" to choose models, AGNTCon NA 2026 [secondary]. https://lucaberton.com/blog/agntcon-mcpcon-north-america-2026/; {"Absence": "no Hamel Husain primary source turned up, and no primary source uses the phrase \"evals as contracts\"."}

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Bake-off as an eval | Operator admission | Proposed: run one Work Item on several configurations and let a shadow judge recommend while a person picks (Ploeg ADR-0135). | M | Model and harness choices rest on measured outcomes. |
| Recurring attack drill | Harness qualification | Decided: a recurring drill runs every harness against a hostile repository (Ploeg ADR-0126). | M | A security eval gates every harness, not just a one-off test. |
| Pilot batches against the KPIs | Loop measurement | Built as a procedure: run a pilot batch and measure it against the KPIs (docs/how-to/run-a-pilot-batch.md, docs/reference/kpis.md), as the loop baseline and cost-per-merge records did. | S | Cost per merged Work Item becomes the contract a change must not worsen. |
| Golden Work Items gate the release train | Release train | Proposed: a small fixed set of Work Items with known-good outcomes runs before a Team's model or harness changes, alongside the hourly train of system ADR-0046. | L | Regressions in agent behaviour are caught before an Agency sees them. |
| Conformance suites for ports and the gateway | Ploeg ports | Decided: every tracker and forge adapter passes its port's conformance suite (Ploeg ADR-0183); the exec adapter is the harness conformance target. | S | Integration correctness is specified as tests, not docs. |

## Guardian / overseer agents and agent firewalls { #guardian-agents }

Separate supervising software, often itself AI, that watches other agents' actions and blocks or flags those outside policy.

| | |
| --- | --- |
| Maturity | pattern |
| Outlook | none. It is a market category. Low chance in 24 months. OWASP may publish control guidance. |
| Related standards | [OWASP Top 10 for Agentic Applications 2026 (with OWASP Top 10 for LLM Applications 2026 and Agent Control Standard)](security-supply-chain.md#owasp-agentic-top10) |
| Critique | "Just adding more AI agents" to secure agents (ITPro headline). Willison judges probabilistic guardrails that block 95% "a failing grade". https://www.itpro.com/technology/artificial-intelligence/enterprises-are-worried-about-agentic-ai-security-risks-gartner-says-the-answer-is-just-adding-more-ai-agents ; https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/ |
| Radar | **trial**: The decider and judge are built on branches as shadows; they need calibration data before any of them may act. |
| Watch for | OWASP or CSA publishing a normative agent-control standard that names an independent oversight component. |
| Decisions | [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), [rfc-0007-run-health](../../../../../docs/design/rfc-0007-run-health.md), [rfc-0008-decision-models](../../../../../docs/design/rfc-0008-decision-models.md), [rfc-0009-judging-a-run-by-its-kind-of-work](../../../../../docs/design/rfc-0009-judging-a-run-by-its-kind-of-work.md), [0096-a-shadow-reader-records-its-verdict-and-never-acts](../../../../../apps/ploeg/docs/adrs/0096-a-shadow-reader-records-its-verdict-and-never-acts.md), [0017-the-review-loop-is-verdict-driven-and-capped](../../../../../apps/ploeg/docs/adrs/0017-the-review-loop-is-verdict-driven-and-capped.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** Gartner Market Guide for Guardian Agents, 2026-02 (G00836388; Litan, Plummer) [secondary]. https://www.gartner.com/en/documents/7856181 ; https://astrix.security/learn/blog/market-guide-guardian-agents/; Gartner forecast that guardian agents take 10-15% of agentic AI markets by 2030 (2025) [secondary]. https://www.itpro.com/technology/artificial-intelligence/enterprises-are-worried-about-agentic-ai-security-risks-gartner-says-the-answer-is-just-adding-more-ai-agents; OWASP Top 10 for Agentic Applications, 2025-12-09. https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Decider as an early tripwire | Self-hosted decider | Proposed: a small self-hosted decision model scores each builder tool call for hijack or carelessness, as a shadow that never acts at first (system ADR-0042, RFC-0008). | M | Catches a hijacked Run early at near-zero cost. |
| Run health with an advising judge | Run card | Proposed, partly built: deterministic health signals plus an optional judge that only advises (RFC-0007). | M | A person sees a Run veering off track without reading its transcript. |
| Judge by kind of work | Run health | Proposed: classify the Work Kind and each tool call's Activity and judge against the kind (RFC-0009). | M | Fewer false alarms than one threshold for all work. |
| A shadow reader never acts | Ploeg policy | Already decided: a shadow reader records its verdict and never acts (Ploeg ADR-0096); any later automatic stop acts as a named service actor. | S | Keeps guardian mistakes from stopping good work while it is calibrated. |
| Keep the guardian out of band | LiteLLM gateway | Resist: the owner chose an out-of-band reader over an inline gateway guardrail (RFC-0008), so no guardian sits in the model path. | S | A guardian outage cannot stop every Run. |

## Human-in-the-loop approval semantics and signed approval/consent receipts { #hitl-approval-receipts }

A risky agent action pauses for a human, and the approval becomes a signed, single-use, action-bound receipt that anyone can verify later.

| | |
| --- | --- |
| Maturity | pre-standard |
| Outlook | IETF OAuth WG is the likely home (the agentproto BoF pushed authorization to OAuth, IETF 126 minutes). Medium chance in 24 months. |
| Related standards | [AAuth Protocol (Hardt)](identity.md#aauth) |
| Critique | Consent fatigue. The OpenID Foundation's whitepaper (2025-10-07) names consent fatigue and impersonation as core gaps, so receipts do not fix rubber-stamping. https://openid.net/new-whitepaper-tackles-ai-agent-identity-challenges/ |
| Radar | **trial**: The receipts are designed and partly built in ploeg-mcp, but the exportable, verifiable form is not yet in use. |
| Watch for | OAuth WG adopts a delegation or approval-receipt draft, or MCP standardises an approval record attached to elicitation. |
| Decisions | [adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation](../../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md), [adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver](../../../../../docs/adr/adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver.md), [adr-0053-a-person-accepts-a-pull-request-in-unfold-and-ploeg-asks-the-forge-to-merge-it-at-that-head](../../../../../docs/adr/adr-0053-a-person-accepts-a-pull-request-in-unfold-and-ploeg-asks-the-forge-to-merge-it-at-that-head.md), [0108-every-operator-action-names-its-person-and-channel-and-an-mcp-action-needs-the-persons-confirmation](../../../../../apps/ploeg/docs/adrs/0108-every-operator-action-names-its-person-and-channel-and-an-mcp-action-needs-the-persons-confirmation.md), [0152-ploeg-mcp-signs-each-confirmation-and-acts-on-it-once](../../../../../apps/ploeg/docs/adrs/0152-ploeg-mcp-signs-each-confirmation-and-acts-on-it-once.md), [0153-a-person-confirms-a-ploeg-mcp-action-by-signing-in-afresh-at-a-ploeg-mcp-page](../../../../../apps/ploeg/docs/adrs/0153-a-person-confirms-a-ploeg-mcp-action-by-signing-in-afresh-at-a-ploeg-mcp-page.md), [0175-a-proposed-work-item-starts-a-shift-only-when-every-named-approval-was-given-at-its-revision](../../../../../apps/ploeg/docs/adrs/0175-a-proposed-work-item-starts-a-shift-only-when-every-named-approval-was-given-at-its-revision.md), [0188-ploeg-merges-a-work-items-pull-request-at-a-named-head-for-a-proven-person-with-a-merge-identity-no-run-holds](../../../../../apps/ploeg/docs/adrs/0188-ploeg-merges-a-work-items-pull-request-at-a-named-head-for-a-proven-person-with-a-merge-identity-no-run-holds.md), [0014-signed-candidates](../../../../../apps/unfold/docs/adrs/0014-signed-candidates.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** IETF individual drafts draft-nelson-agent-delegation-receipts (-11, 2026-10), draft-schrock-ep-authorization-receipts (-06), draft-kumaresan-counter-sign-00 (2026-07). https://www.ietf.org/archive/id/draft-nelson-agent-delegation-receipts-11.txt ; https://datatracker.ietf.org/doc/draft-schrock-ep-authorization-receipts/; MCP elicitation guarding tools that delete, deploy or spend, AGNTCon NA keynote 2026-10-22 [secondary]. https://lucaberton.com/blog/agntcon-mcpcon-north-america-2026/; 12-factor agents "contact humans with tool calls" / break the loop for approval. https://github.com/humanlayer/12-factor-agents; Hardt's AAuth with a Person Server approving missions. https://dickhardt.github.io/AAuth/draft-hardt-aauth-mission.html

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Signed, single-use MCP confirmations | ploeg-mcp | Already decided: ploeg-mcp signs each confirmation and acts on it once (Ploeg ADR-0152), after the person signs in afresh at a ploeg-mcp page (Ploeg ADR-0153). | S | An approval cannot be replayed or forged by the client that asked for it. |
| Approvals bound to a revision | Proposed Work Items | Already decided: a proposed Work Item starts a Shift only when every named approval was given at its current revision (Ploeg ADR-0175). | S | An approval does not carry over to a changed request. |
| Client sign-off bound to the head commit | Acceptance in Unfold | Accepted: a Client Sign-off is input to acceptance and binds to the head commit (system ADR-0049); a person's acceptance asks the forge to merge at that head (system ADR-0053, Ploeg ADR-0188). | S | The client approved exactly the code that ships. |
| Signed candidates as receipts | Unfold delivery | Decided in Unfold ADR-0014: candidates are signed, so the approval of a candidate is verifiable later. | M | Gives an Agency proof of what was approved when a client disputes a change. |
| Exportable approval receipts for clients | Agency reporting | Proposed: export each Action Record (system ADR-0037) with its signed confirmation as a verifiable receipt an Agency can hand its client. | M | Makes Unfold's approvals auditable outside Unfold. |

## Intent-based delegation, mandates and verifiable intent { #intent-mandates }

The human signs a constrained statement of intent (what, limits, until when), and the agent carries it as a credential that downstream parties verify before acting.

| | |
| --- | --- |
| Maturity | pre-standard |
| Outlook | FIDO for payments and IETF OAuth for generic missions. Medium-high chance for payments in 24 months, medium for generic missions. |
| Related standards | [Agent Payments Protocol (AP2)](commerce.md#ap2), [Verifiable Intent](commerce.md#verifiable-intent), [AAuth Protocol (Hardt)](identity.md#aauth), [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange) |
| Critique | Natural-language intent rarely maps cleanly onto machine-checkable constraints, and the IETF 126 room rejected the agentproto scope 38-124, showing no agreement on where intent lives. https://datatracker.ietf.org/meeting/126/materials/minutes-126-agentproto-202607230700-00 |
| Radar | **assess**: Unfold already bounds intent with ticket budgets and approvals; a portable mandate credential is pre-standard and only worth it when a downstream party verifies it. |
| Watch for | FIDO publishes a Payments WG draft, or the OAuth WG adopts a mission/intent draft. |
| Decisions | [adr-0006-the-ticket-is-the-billing-unit](../../../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md), [adr-0007-clients-approve-ready-work](../../../../../docs/adr/adr-0007-clients-approve-ready-work.md), [0012-two-level-budgets-authorized-and-settled](../../../../../apps/ploeg/docs/adrs/0012-two-level-budgets-authorized-and-settled.md), [0156-each-run-carries-a-transaction-token-that-names-its-person-and-a-team-without-a-sponsor-runs-nothing](../../../../../apps/ploeg/docs/adrs/0156-each-run-carries-a-transaction-token-that-names-its-person-and-a-team-without-a-sponsor-runs-nothing.md), [0175-a-proposed-work-item-starts-a-shift-only-when-every-named-approval-was-given-at-its-revision](../../../../../apps/ploeg/docs/adrs/0175-a-proposed-work-item-starts-a-shift-only-when-every-named-approval-was-given-at-its-revision.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** Mastercard Verifiable Intent, announced 2026-03-05, co-developed with Google, Draft v0.1, SD-JWT delegation chain [secondary]. https://verifiableintent.dev ; https://atxp.ai/blog/verifiable-intent-mastercard-ai-agents; FIDO Alliance Payments WG receiving AP2 + Verifiable Intent [secondary]. https://ppc.land/fido-alliance-forms-working-groups-to-lock-down-ai-agent-payments/; AAuth Mission draft (Hardt), 2026-04. https://dickhardt.github.io/AAuth/draft-hardt-aauth-mission.html; Karl McGuinness, "Mission-Bound OAuth" vs AAuth. https://mcguinness-blog.pages.dev/notes/mission-architecture-on-aauth/

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| The ticket is the mandate | Shift budget | Accepted: the ticket carries a quoted, capped Shift budget charged on delivery (system ADR-0006), which is a signed scope of what, how much and for which Work Item. | S | Every Run already acts inside a bounded statement of intent. |
| Clients approve Ready work | Client approval | Accepted: clients approve Ready work under their own definitions of Ready and Done (system ADR-0007). | S | The human statement of intent comes before any spend. |
| A transaction token names the person | Run identity | Decided: each Run carries a transaction token that names its person, and a Team without a sponsor runs nothing (Ploeg ADR-0156). | M | Downstream checks can verify on whose behalf a Run acts. |
| Bind the mandate to the Work Item revision | Work Item approvals | Proposed: put the approved Work Item revision and budget into the transaction token so the forge proxy and gateway can reject work outside it (builds on Ploeg ADR-0175). | M | Turns approval from a database row into a credential the Run carries. |
| Resist payment mandates | Runs | Resist: no Run buys anything and workers have no internet route (docs/concepts/inside-a-run.md), so payment mandate schemes add no value. | S | Avoids importing a payments trust model for a problem Unfold does not have. |

## Liability and accountability chains for agents { #liability-accountability-chains }

Who is liable when an agent harms someone: model provider, agent developer, deployer, tool operator or the delegating human? How is that chain evidenced?

| | |
| --- | --- |
| Maturity | idea |
| Outlook | Law, not standards. The PLD applies from Dec 2026. Technical evidence (receipts, audit trails) is the standardisable part. Low chance for an agent-specific regime in 24 months. |
| Related standards | [EU Artificial Intelligence Act, Regulation (EU) 2024/1689, as amended by Regulation (EU) 2026/1744 (Digital Omnibus on AI)](governance.md#eu-ai-act) |
| Critique | Professional AI uses often fall outside the PLD, leaving national tort law and pure economic losses uncovered. https://www.aiactblog.nl/en/posts/ai-liability-directive-withdrawal |
| Radar | **adopt**: Unfold already names a person at every decision point; packaging that chain is cheap and valuable to Agencies. |
| Watch for | A first EU court case under PLD transposition involving an AI agent, or insurer requirements for agent audit trails. |
| Decisions | [adr-0005-unfold-is-offered-to-agencies](../../../../../docs/adr/adr-0005-unfold-is-offered-to-agencies.md), [adr-0008-every-pull-request-gets-a-preview-environment](../../../../../docs/adr/adr-0008-every-pull-request-gets-a-preview-environment.md), [adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation](../../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md), [adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver](../../../../../docs/adr/adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver.md), [adr-0053-a-person-accepts-a-pull-request-in-unfold-and-ploeg-asks-the-forge-to-merge-it-at-that-head](../../../../../docs/adr/adr-0053-a-person-accepts-a-pull-request-in-unfold-and-ploeg-asks-the-forge-to-merge-it-at-that-head.md), [0091-each-run-records-the-model-harness-plan-and-ploegd-version-it-was-configured-with](../../../../../apps/ploeg/docs/adrs/0091-each-run-records-the-model-harness-plan-and-ploegd-version-it-was-configured-with.md), [0156-each-run-carries-a-transaction-token-that-names-its-person-and-a-team-without-a-sponsor-runs-nothing](../../../../../apps/ploeg/docs/adrs/0156-each-run-carries-a-transaction-token-that-names-its-person-and-a-team-without-a-sponsor-runs-nothing.md), [0188-ploeg-merges-a-work-items-pull-request-at-a-named-head-for-a-proven-person-with-a-merge-identity-no-run-holds](../../../../../apps/ploeg/docs/adrs/0188-ploeg-merges-a-work-items-pull-request-at-a-named-head-for-a-proven-person-with-a-merge-identity-no-run-holds.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** EU AI Liability Directive withdrawn (2025 work programme 2025-02-11, formal withdrawal reported 2025-10-06) [secondary]. https://www.mondaq.com/new-technology/1590676/eu-commission-withdraws-ai-liability-directive; Revised Product Liability Directive (EU) 2024/2853: software is a product, transposition by 2026-12-09. https://www.osborneclarke.com/insights/physical-ai-and-strict-liability-what-impact-eu-product-liability-directive; "Trustworthy Agentic AI: Failure Modes... Lifecycle Framework", arXiv 2609.22712 (not opened). https://arxiv.org/pdf/2609.22712

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| A person merges, never an agent | Merge | Decided: a person accepts in Unfold and Ploeg asks the forge to merge at that head with a merge identity no Run holds (system ADR-0053, Ploeg ADR-0188). | S | The accountable human act is explicit and recorded. |
| No sponsor, no Run | Run identity | Decided: a Team without a sponsor runs nothing (Ploeg ADR-0156). | S | Every Run has a named person responsible for it. |
| Delivery ends at a reviewed pull request | Agency offering | Accepted: delivery ends at a reviewed pull request with a preview, and production stays with the Agency (system ADR-0005, ADR-0008). | S | The liability boundary between Unfold, Agency and client is drawn in the offering. |
| Client sign-off as evidence | Acceptance | Accepted: a Client Sign-off is bound to the head commit and each client has an approver (system ADR-0049). | S | The chain includes the client's own decision. |
| Accountability pack for an Agency contract | Agency reporting | Proposed: export per Work Item who approved, who ran, which model and who merged, from Action Records and Run facts (system ADR-0037, Ploeg ADR-0091). | M | An Agency can answer a client or insurer with evidence. |

## LLM API convergence (Responses-style stateful/item-based APIs) { #llm-api-convergence }

Providers converge on one request/response shape (items, tool calls, semantic streaming events, optional server state), so harnesses and gateways are provider-agnostic.

| | |
| --- | --- |
| Maturity | standardising |
| Outlook | AAIF owns it. High chance of a governed v1 with compliance tests in 24 months. Stateful mode is still future work. |
| Related standards | [Open Responses](inference-infra.md#open-responses), [OpenAI Chat Completions API (de facto /v1/chat/completions)](inference-infra.md#openai-chat-completions) |
| Critique | Defaults are stateless and stateful is deferred. Anthropic and Google keep native APIs, so the "standard" may stay an OpenAI-shaped superset. https://www.openresponses.org/ |
| Radar | **assess**: The gateway already hides provider differences; stateful APIs conflict with Ploeg owning state and spend. |
| Watch for | Anthropic or Google ship native Open Responses endpoints, or the spec publishes a stateful-mode version. |
| Decisions | [0039-a-run-calls-only-its-roles-model-and-the-advisor-waits-for-metering](../../../../../apps/ploeg/docs/adrs/0039-a-run-calls-only-its-roles-model-and-the-advisor-waits-for-metering.md), [0041-the-openai-agents-api-stays-outside-the-run-until-it-takes-an-authorized-budget](../../../../../apps/ploeg/docs/adrs/0041-the-openai-agents-api-stays-outside-the-run-until-it-takes-an-authorized-budget.md), [0090-a-runs-agent-session-is-kept-as-a-bounded-redacted-transcript](../../../../../apps/ploeg/docs/adrs/0090-a-runs-agent-session-is-kept-as-a-bounded-redacted-transcript.md), [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md), [2026-10-14-litellm-and-fireworks-update](../../../../../docs/research/2026-10-14-litellm-and-fireworks-update.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** Open Responses spec, announced by OpenAI 2026-01-15. https://www.openresponses.org/specification; Donated to AAIF 2026-10-22. https://www.linuxfoundation.org/press/agentic-ai-foundation-announces-four-new-projects-agent-skills-open-responses-openenv-and-opensandbox; Gateway compliance claims (Portkey). https://portkey.ai/docs/aigw/product/ai-gateway/responses-api

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| The gateway normalises providers | Gateway contract | Built: LiteLLM presents one API to harnesses, and the gateway contract admits Envoy AI Gateway as well (Ploeg ADR-0177). | S | Harnesses never care which provider serves them. |
| No server-side agent state inside a Run | Runs | Decided: the OpenAI Agents API stays outside the Run until it takes an authorized budget (Ploeg ADR-0041). | S | Stateful provider APIs cannot hold conversation or spend outside Ploeg's view. |
| A Run calls only its Role's model | Model routing | Decided: a Run calls only its Role's model (Ploeg ADR-0039). | S | API convergence cannot widen which models a Run reaches. |
| Conformance test against Open Responses | Gateway contract | Proposed: add an Open Responses shaped test to the gateway contract's conformance checks once a stateful mode is published. | M | Catches gateway drift before harnesses break. |
| Transcripts in an item-based shape | Run transcripts | Proposed: store the bounded transcript of Ploeg ADR-0090 as provider-neutral items, so replays and judges read one format. | M | Judges and deciders work across harnesses and providers. |

## Local-first / on-device agents { #local-first-agents }

Run the model and the loop on device or on-prem first and escalate to cloud only when needed, for privacy, latency and cost.

| | |
| --- | --- |
| Maturity | pattern |
| Outlook | Via API convergence (Open Responses) and model packaging (ModelPack). Local-first itself is not standardisable. Medium chance for enabling specs. |
| Related standards | [Open Responses](inference-infra.md#open-responses) |
| Critique | Small models fail at multi-step tool use, so "local first" often means "cloud anyway" with extra complexity (absence: no strong 2026 benchmark found). |
| Radar | **trial**: Unfold is self-hosted first and has designs for local Runs and local models; they need one real trial. |
| Watch for | Open-weight models under 30B passing agentic tool-use benchmarks within ~5 points of frontier. |
| Decisions | [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), [adr-0052-unfold-works-as-an-offline-shell-and-offers-a-phone-triage-view](../../../../../docs/adr/adr-0052-unfold-works-as-an-offline-shell-and-offers-a-phone-triage-view.md), [0143-a-persons-machine-is-a-personal-cell-and-a-run-gets-a-capability-only-when-its-person-grants-it](../../../../../apps/ploeg/docs/adrs/0143-a-persons-machine-is-a-personal-cell-and-a-run-gets-a-capability-only-when-its-person-grants-it.md), [0009-workspace-placement-is-a-session-choice](../../../../../apps/unfold/docs/adrs/0009-workspace-placement-is-a-session-choice.md), [rfc-0010-agents-on-your-own-machine](../../../../../docs/design/rfc-0010-agents-on-your-own-machine.md), [2026-11-02-t3code-fit](../../../../../docs/research/2026-11-02-t3code-fit.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** Apple Foundation Models framework (~3B on-device model, tool calling, guided generation), WWDC 2025 [secondary]. https://adtmag.com/articles/2025/06/10/apple-launches-ondevice-ai-framework-and-tools.aspx; On-device tool protocol write-up. https://blakecrosley.com/blog/foundation-models-on-device-llm; Open Responses participants include Ollama, LM Studio and vLLM (local runtimes on a common API). https://www.openresponses.org/

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Start on my laptop | unfold-daemon | Proposed: a small daemon takes commands from Unfold and starts a session in a worktree on the person's machine (RFC-0010). | L | People can use local rights and tools while Unfold keeps the record. |
| A person's machine is a personal cell | Ploeg cells | Proposed: a laptop becomes a personal cell and a Run gets a capability only when its person grants it (Ploeg ADR-0143). | M | Local Runs keep the same identity and budget rules. |
| Workspace placement is a session choice | Unfold workspaces | Decided: where a workspace runs is chosen per session (Unfold ADR-0009). | S | Local or remote is a setting, not a fork of the product. |
| Self-hosted small models for deciders | Decider | Proposed: the decider is a small self-hosted model scaled to zero (system ADR-0042). | M | Cheap oversight with no client code leaving the cluster. |
| Offline shell and phone triage | Unfold UI | Proposed: Unfold works as an offline shell with a phone triage view (system ADR-0052). | M | People triage without a connection. |

## Open-weight model packaging as OCI artifacts { #open-weight-model-packaging }

Distribute models (weights, tokenizer, config, licence) as OCI artifacts in standard registries with signing and SBOM-like metadata.

| | |
| --- | --- |
| Maturity | standardising |
| Outlook | CNCF/OCI. High chance in 24 months, since Docker convergence makes it de facto. |
| Related standards | — |
| Critique | Hugging Face Hub remains the de facto distribution channel, and the spec version is still pre-1.0. https://pkg.go.dev/github.com/modelpack/model-spec |
| Radar | **assess**: Only the small decider model would be self-hosted, and ModelPack is not yet v1. |
| Watch for | ModelPack v1.0 release or CNCF incubation, and Hugging Face offering OCI/ModelPack export. |
| Decisions | [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), [0035-runs-get-ploeg-owned-skills-mounted-toolchains-and-worker-verification](../../../../../apps/ploeg/docs/adrs/0035-runs-get-ploeg-owned-skills-mounted-toolchains-and-worker-verification.md), [0145-a-release-publishes-no-image-over-its-cve-budget-and-attaches-signed-openvex-to-every-digest](../../../../../apps/ploeg/docs/adrs/0145-a-release-publishes-no-image-over-its-cve-budget-and-attaches-signed-openvex-to-every-digest.md), [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md), [0010-one-release-train-with-zero-cve-images](../../../../../apps/unfold/docs/adrs/0010-one-release-train-with-zero-cve-images.md), [2026-10-11-cost-per-merged-work-item](../../../../../docs/research/2026-10-11-cost-per-merged-work-item.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** CNCF ModelPack (Sandbox), manifest media type application/vnd.cncf.model.manifest.v1+json. https://pkg.go.dev/github.com/modelpack/model-spec; CNCF blog "Advancing AI model interoperability with Docker and ModelPack", 2026-08-12 (docker model package --format=cncf). https://www.cncf.io/blog/2026/08/12/advancing-ai-model-interoperability-with-docker-and-modelpack/; {"Red Hat KubeCon India 2026 deck \"ModelPack": "Bringing the OCI Standard to AI/ML\". https://hosted-files.sched.co/kccncind2026/6d/ModelPack_%20Bringing%20the%20OCI%20Standard%20to%20AI_ML.pptx.pdf"}

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Toolchains already ship as mounted images | Worker toolchains | Built: toolchains are container images the kubelet mounts read-only (Ploeg ADR-0035), the same mechanism ModelPack weights would use. | S | Proves the image-volume path Unfold would reuse. |
| Package the decider's weights as OCI | Decider | Proposed: ship the small decider model of system ADR-0042 as an OCI artifact mounted as an image volume. | M | Air-gapped and self-hosted Agencies install it like any image. |
| Same CVE and signing gate for models | Release | Proposed: apply the zero-CVE and signed OpenVEX gate (Ploeg ADR-0145, Unfold ADR-0010) to model artifacts. | M | Models get the supply-chain checks images already have. |
| Open-weight Teams through the gateway | Gateway | Already used: bronze runs open-weight models through the gateway (the cost-per-merged record); hosting stays with the provider. | S | Cheap Teams without running GPUs. |
| Do not self-host frontier-size models | Infrastructure | Resist: large models stay behind the gateway contract (Ploeg ADR-0177); only small helper models are worth packaging. | S | Keeps self-hosting within an Agency's hardware. |

## Policy-as-code for agents (a PDP on every tool call) { #policy-as-code-agents }

Every tool call passes a policy decision point (OPA/Rego, Cedar, OpenFGA) that gets identity, tool, arguments and context, and the decision is logged.

| | |
| --- | --- |
| Maturity | de-facto-convention |
| Outlook | Engines exist. What is missing is a standard decision input schema for tool calls (AuthZEN at OpenID could fit). Medium chance in 24 months. |
| Related standards | [Model Context Protocol](tool.md#mcp), [OpenFGA (Zanzibar-style ReBAC)](identity.md#openfga) |
| Critique | A policy engine can only check what it can see. With code mode or free-form arguments, policies degrade to coarse allow-lists, and engine choice fragments the ecosystem. https://www.harness.io/blog/policy-as-code-in-2026-opa-kyverno-cedar-and-what-s-next |
| Radar | **assess**: Ploeg enforces policy at its credential seams in code; a general policy engine is only worth it once Team permissions outgrow configuration. |
| Watch for | OpenID AuthZEN or MCP defines a standard tool-call authorization request profile. |
| Decisions | [0015-routing-is-core-policy-over-provider-opaque-scopes](../../../../../apps/ploeg/docs/adrs/0015-routing-is-core-policy-over-provider-opaque-scopes.md), [0037-teams-opt-into-registry-egress-through-a-logged-allowlist-proxy](../../../../../apps/ploeg/docs/adrs/0037-teams-opt-into-registry-egress-through-a-logged-allowlist-proxy.md), [0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills](../../../../../apps/ploeg/docs/adrs/0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills.md), [0137-the-chart-renders-a-default-deny-networkpolicy-for-every-pod-with-an-allowlist-derived-from-its-urls](../../../../../apps/ploeg/docs/adrs/0137-the-chart-renders-a-default-deny-networkpolicy-for-every-pod-with-an-allowlist-derived-from-its-urls.md), [0148-every-acp-profile-asks-before-a-mutation-outside-allow-always-and-openhands-refuses-a-repository-that-ships-hooks](../../../../../apps/ploeg/docs/adrs/0148-every-acp-profile-asks-before-a-mutation-outside-allow-always-and-openhands-refuses-a-repository-that-ships-hooks.md), [0154-the-chart-refuses-values-that-leave-profile-p1-unless-they-declare-the-deployment-unsupported](../../../../../apps/ploeg/docs/adrs/0154-the-chart-refuses-values-that-leave-profile-p1-unless-they-declare-the-deployment-unsupported.md), [0168-profile-p1-turns-on-the-worker-admission-policy-and-a-sandbox-team-names-its-runtime-class-there](../../../../../apps/ploeg/docs/adrs/0168-profile-p1-turns-on-the-worker-admission-policy-and-a-sandbox-team-names-its-runtime-class-there.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** {"Tian Pan, \"Policy-as-Code for Agents": "OPA, Rego, and the Decision Point Your Tool Loop Doesn't Have\", 2026-04-25. https://tianpan.co/blog/2026-04-25-policy-as-code-agent-permissions-opa-rego"}; {"Harness, \"Policy as code in 2026": "OPA, Kyverno, Cedar\". https://www.harness.io/blog/policy-as-code-in-2026-opa-kyverno-cedar-and-what-s-next"}; Bedrock AgentCore Policy using Cedar at the gateway (2026-03) [secondary, via Tian Pan]; Matt DeBergalis (Apollo) on a deterministic policy layer between agents and APIs, AGNTCon NA 2026 [secondary]. https://lucaberton.com/blog/agntcon-mcpcon-north-america-2026/

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| ACP permission modes as a decision point | ACP adapter | Already built: the adapter answers each permission request from the Team's mode and asks before a mutation outside allow-always (Ploeg ADR-0148). | S | Each harness request already passes a Team-level policy. |
| The forge proxy refuses other repositories | Worker forge proxy | Already built: the loopback forge proxy adds the token and refuses anything outside the Run's own repository (docs/concepts/inside-a-run.md). | S | A policy on every forge call that the agent cannot bypass. |
| Egress through a logged allowlist | Registry egress proxy | Decided: Teams opt into registry egress through a logged allowlist proxy (Ploeg ADR-0037), with default-deny network policy (Ploeg ADR-0137). | M | Network reach is declared, enforced and logged. |
| Team manifest permissions as policy | Team manifest, ploegd | Proposed: express the permissions in a Team's manifest (Ploeg ADR-0110) as Cedar or OPA policies evaluated in ploegd, and log each decision to the audit log. | L | One readable policy file per Team instead of settings scattered through config. |
| No PDP on every shell command | Harness in the pod | Resist: the pod is the boundary for Claude Code runs (docs/concepts/inside-a-run.md); a policy call on each shell command adds latency and false denials without stopping a sandboxed process. | S | Puts enforcement at the seams that hold credentials, where it pays. |

## Semantic interoperability (ontologies, shared vocabularies, knowledge graphs as agent context) { #semantic-interop-knowledge-graphs }

Agents ground on governed knowledge graphs with shared ontologies, so facts carry identity, provenance and meaning across agents and tools.

| | |
| --- | --- |
| Maturity | pattern |
| Outlook | W3C (RDF, SHACL, schema.org) exists. What is missing is a convention for exposing graphs to agents over MCP with provenance. Low-medium chance in 24 months. |
| Related standards | — |
| Critique | Translating natural language to structured queries remains a challenge (SEMIC), and ontology upkeep is costly, so vendors fall back to plain retrieval. https://interoperable-europe.ec.europa.eu/node/733148 |
| Radar | **trial**: Unfold has a scoped graph design and a shared vocabulary, but the graph is not yet serving Runs. |
| Watch for | An MCP extension or W3C CG note standardising graph-fact responses with provenance. |
| Decisions | [adr-0021-agents-are-briefed-from-a-per-tenant-knowledge-base-exchanged-as-okf](../../../../../docs/adr/adr-0021-agents-are-briefed-from-a-per-tenant-knowledge-base-exchanged-as-okf.md), [adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant](../../../../../docs/adr/adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant.md), [adr-0035-interactive-sessions-reach-tenant-knowledge-only-through-unfold-mcp](../../../../../docs/adr/adr-0035-interactive-sessions-reach-tenant-knowledge-only-through-unfold-mcp.md), [adr-0036-ploeg-and-unfold-use-one-vocabulary-with-named-screen-words](../../../../../docs/adr/adr-0036-ploeg-and-unfold-use-one-vocabulary-with-named-screen-words.md), [0087-ploegd-holds-a-tenants-knowledge-graphs-and-serves-a-run-only-its-work-items-scopes](../../../../../apps/ploeg/docs/adrs/0087-ploegd-holds-a-tenants-knowledge-graphs-and-serves-a-run-only-its-work-items-scopes.md), [0122-every-note-carries-its-provenance-untrusted-text-is-quoted-and-a-wider-level-needs-evidence-or-a-person](../../../../../apps/ploeg/docs/adrs/0122-every-note-carries-its-provenance-untrusted-text-is-quoted-and-a-wider-level-needs-evidence-or-a-person.md), [model](../../../../../docs/domain/model.yaml), [2026-10-04-rfc-agent-knowledge](../../../../../docs/research/2026-10-04-rfc-agent-knowledge.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** EU SEMIC report on GraphRAG for semantic interoperability [secondary]. https://interoperable-europe.ec.europa.eu/node/733148; {"Siemens \"AI context layer": "knowledge graph\" (context graphs for agents). https://blogs.sw.siemens.com/rapidminer/ai-context-layer-knowledge-graph/"}; ANP uses JSON-LD graphs for agent discovery (survey arXiv 2505.02279). https://arxiv.org/abs/2505.02279; W3C AI KR Community Group (hosts WebMCP notes). https://w3c-cg.github.io/aikr/webMCP/webmcp-technical-notes.html

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Two scoped graphs per Tenant | Agent knowledge | Proposed: knowledge is scoped to Tenant, Client, repository and Work Item in two graphs per Tenant (system ADR-0034, Ploeg ADR-0087). | L | Runs ground on facts with identity and scope, not loose text. |
| OKF as the exchange vocabulary | Knowledge exchange | Proposed: the knowledge base is exchanged as OKF (system ADR-0021). | M | Knowledge moves between tools without a custom format. |
| One vocabulary across Ploeg and Unfold | Domain model | Accepted: Ploeg and Unfold use one vocabulary with named screen words (system ADR-0036, docs/domain/model.yaml). | S | People and agents mean the same thing by Run, Shift and Round. |
| Interactive sessions read knowledge through unfold-mcp | unfold-mcp | Proposed: interactive sessions reach Tenant knowledge only through unfold-mcp (system ADR-0035). | M | One governed path to the graph with scope checks. |
| Resist a heavy ontology | Knowledge base | Resist: keep concepts as markdown with frontmatter rather than an OWL ontology; provenance per note (Ploeg ADR-0122) matters more than formal semantics. | S | Agencies can read and edit their own knowledge. |

## Skills / progressive disclosure as a packaging paradigm { #skills-progressive-disclosure }

Package expertise as a folder (SKILL.md plus scripts and references). Only name and description load up front, the body loads when triggered, and references load on demand.

| | |
| --- | --- |
| Maturity | standardising |
| Outlook | AAIF now owns it. High chance (over 70%) of a governed v1 with conformance in 24 months. |
| Related standards | [Agent Skills (SKILL.md)](definition.md#agent-skills), [Model Context Protocol](tool.md#mcp), [AGENTS.md](definition.md#agents-md) |
| Critique | Supply-chain risk. Snyk found 13.4% of 3,984 skills had critical issues and 76 carried malicious payloads, with no signing or review in place (2026-02). https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub |
| Radar | **adopt**: Ploeg already ships, selects and pins skills per Run; it is the cheapest context lever it has. |
| Watch for | AAIF publishes a Skills spec version with signing/provenance fields and a conformance suite. |
| Decisions | [0035-runs-get-ploeg-owned-skills-mounted-toolchains-and-worker-verification](../../../../../apps/ploeg/docs/adrs/0035-runs-get-ploeg-owned-skills-mounted-toolchains-and-worker-verification.md), [0083-a-run-is-told-which-skills-bear-on-its-work-item](../../../../../apps/ploeg/docs/adrs/0083-a-run-is-told-which-skills-bear-on-its-work-item.md), [0092-a-team-pins-its-skills-in-a-catalogue-that-ploegd-fetches-once-and-serves-by-digest](../../../../../apps/ploeg/docs/adrs/0092-a-team-pins-its-skills-in-a-catalogue-that-ploegd-fetches-once-and-serves-by-digest.md), [0139-a-team-declares-claude-code-plugins-pinned-to-a-commit-whose-hooks-run-guarded-with-only-their-declared-environment](../../../../../apps/ploeg/docs/adrs/0139-a-team-declares-claude-code-plugins-pinned-to-a-commit-whose-hooks-run-guarded-with-only-their-declared-environment.md), [0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills](../../../../../apps/ploeg/docs/adrs/0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** Agent Skills donated by Anthropic to AAIF, LF press release 2026-10-22. https://www.linuxfoundation.org/press/agentic-ai-foundation-announces-four-new-projects-agent-skills-open-responses-openenv-and-opensandbox; Open standard released 2025-12-18, maintained at agentskills.io [secondary]. https://agentskills.io ; https://www.candede.com/articles/mastering-agent-skills-open-standard; "Skills over MCP" in the MCP keynote by David Soria Parra, AGNTCon NA 2026-10-22 [secondary]. https://lucaberton.com/blog/agntcon-mcpcon-north-america-2026/; Liu et al., "Malicious Agent Skills in the Wild", arXiv 2602.06547, 2026-02 (157 malicious of 98,380 skills). https://fugumt.com/fugumt/paper_check/2602.06547v1_enmode

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Ploeg-owned skills installed per Run | Worker prepare step | Already built: the worker installs Ploeg's own skills under the Run's home directory (Ploeg ADR-0035). | S | Every Run gets the same procedures without bloating the prompt. |
| Tell a Run which skills bear on its Work Item | Run briefing | Already decided: the briefing names the skills relevant to the Work Item rather than all of them (Ploeg ADR-0083). | S | Applies progressive disclosure at the Run level, not just the tool level. |
| A Team pins its skills by digest | Team manifest, ploegd | Already decided: a Team pins skills in a catalogue that ploegd fetches once and serves by digest (Ploeg ADR-0092), and plugins are pinned to a commit with guarded hooks (Ploeg ADR-0139). | S | A skill cannot change under a running Shift, which covers the provenance gap the spec still has. |
| Agency-authored skills per client | Team manifest | Proposed: let an Agency add client-specific skills to a Team's catalogue, reviewed like code, instead of long prompts or AGENTS.md edits. | M | Client conventions become reusable and versioned across that client's repositories. |
| Adopt the signed Skills spec when it lands | Skill catalogue | Proposed: when the Skills spec gains signing and provenance fields, verify them in ploegd next to the digest pin. | S | Lets a Team take third-party skills with the same assurance as its own. |

## Sovereign AI / EU sovereignty stacks { #sovereign-ai-eu }

European-controlled compute, models and agent infrastructure (EuroStack, Mistral, OpenEuroLLM) so EU organisations aren't exposed to US access cut-offs.

| | |
| --- | --- |
| Maturity | pattern |
| Outlook | EU "sovereign" labelling under the proposed Cloud and AI Development Act [secondary]. Medium chance of a label or certification in 24 months. |
| Related standards | [EU Artificial Intelligence Act, Regulation (EU) 2024/1689, as amended by Regulation (EU) 2026/1744 (Digital Omnibus on AI)](governance.md#eu-ai-act) |
| Critique | Sacra argues national-model sovereignty "died" when Mistral defaulted to a Chinese open model. Sovereignty may mean hosting control, not model origin [secondary]. https://sacra.com/research/european-sovereign-ai-chinese-ai/ |
| Radar | **adopt**: EU hosting and EU-only routing are already owner decisions and a selling point for Agencies. |
| Watch for | EU adopts a "sovereign AI/cloud" label with criteria covering agents or inference. |
| Decisions | [adr-0016-site-sign-ups-are-stored-in-cloudflare-d1-in-the-eu](../../../../../docs/adr/adr-0016-site-sign-ups-are-stored-in-cloudflare-d1-in-the-eu.md), [adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging](../../../../../docs/adr/adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging.md), [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md), [0015-routing-is-core-policy-over-provider-opaque-scopes](../../../../../apps/ploeg/docs/adrs/0015-routing-is-core-policy-over-provider-opaque-scopes.md), [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md), [rfc-0008-decision-models](../../../../../docs/design/rfc-0008-decision-models.md), [2026-10-11-agentic-models-and-topology](../../../../../docs/research/2026-10-11-agentic-models-and-topology.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** EuroStack white paper (Bria et al., UCL IIPP), 2025-02. https://www.ucl.ac.uk/bartlett/public-purpose/publications/2025/feb/eurostack-european-alternative-digital-sovereignty; EU Apply AI strategy update 2026-03-10 (sovereignty objective) [secondary]. https://ai.underside.be/en/article-ue-apply-ai-souverainete-2026; Mistral sovereign infrastructure pivot, region choice [secondary]. https://www.bankinfosecurity.net/mistral-expands-sovereign-ai-push-european-compute-a-32527; Counter-view: "European sovereign AI = Chinese AI" (Sacra, 2026-09) [secondary]. https://sacra.com/research/european-sovereign-ai-chinese-ai/

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Production on an EU cluster | Hosting | Accepted: Unfold's production runs on a rented EU Talos cluster (system ADR-0040). | S | Agencies can tell EU clients where their code is processed. |
| EU route for client code | Gateway routing | Proposed: route a Tenant's Runs only to EU-hosted inference through core routing policy (Ploeg ADR-0015, ADR-0177), as the models and topology record plans. | M | Lets an Agency promise EU processing per client. |
| Self-hosted decider in the EU | Decider | Proposed: the decider runs EU-hosted or self-hosted only (system ADR-0042, RFC-0008). | M | Oversight adds no foreign processor. |
| No lock-in through open standards | Integrations | Accepted: Unfold integrates through open standards and registries and never locks a customer in (system ADR-0050). | S | An Agency can move stacks if jurisdiction demands it. |
| Label sovereignty per Team honestly | Run card, Team settings | Proposed: show per Team whether its models are EU-hosted, since frontier models still run on non-EU providers. | S | No implied sovereignty the routing does not deliver. |

## Swarms and multi-agent orchestration topologies { #multi-agent-topologies }

Organise work as orchestrator-worker, pipelines, debates or swarms of specialised agents rather than one agent.

| | |
| --- | --- |
| Maturity | pattern |
| Outlook | Topology is not standardisable. A2A covers inter-agent transport. Low chance in 24 months. |
| Related standards | [Agent2Agent Protocol](agent-agent.md#a2a), [Model Context Protocol](tool.md#mcp) |
| Critique | Cognition argues that context fragmentation and conflicting implicit decisions make multi-agent setups fragile for coupled work such as coding. https://cognition.com/blog/dont-build-multi-agents |
| Radar | **adopt**: Ploeg's Round structure is the minimal topology the evidence supports, and it is already built. |
| Watch for | Benchmarks showing multi-agent beating single-agent on coupled tasks at equal token budget. |
| Decisions | [0007-a2a-adopt-nothing-watchlist-a-facade](../../../../../apps/ploeg/docs/adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md), [0011-the-pull-request-is-the-blackboard](../../../../../apps/ploeg/docs/adrs/0011-the-pull-request-is-the-blackboard.md), [0017-the-review-loop-is-verdict-driven-and-capped](../../../../../apps/ploeg/docs/adrs/0017-the-review-loop-is-verdict-driven-and-capped.md), [0031-runs-create-work-items-held-for-approval-within-limits](../../../../../apps/ploeg/docs/adrs/0031-runs-create-work-items-held-for-approval-within-limits.md), [0124-agents-communicate-through-a-blackboard-of-four-owned-sources-that-ploeg-reads-at-a-version-vector](../../../../../apps/ploeg/docs/adrs/0124-agents-communicate-through-a-blackboard-of-four-owned-sources-that-ploeg-reads-at-a-version-vector.md), [0151-a-request-for-changes-sends-work-back-only-from-a-named-or-writing-reviewer-and-only-up-to-a-cap](../../../../../apps/ploeg/docs/adrs/0151-a-request-for-changes-sends-work-back-only-from-a-named-or-writing-reviewer-and-only-up-to-a-cap.md), [0163-a-reviewer-reads-the-base-branchs-instruction-files-and-a-team-can-require-a-reviewer-unlike-its-writer](../../../../../apps/ploeg/docs/adrs/0163-a-reviewer-reads-the-base-branchs-instruction-files-and-a-team-can-require-a-reviewer-unlike-its-writer.md), [2026-10-11-agentic-models-and-topology](../../../../../docs/research/2026-10-11-agentic-models-and-topology.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** Anthropic, "How we built our multi-agent research system", 2025-06-13 (Hadfield et al.). +90.2% vs single-agent on an internal eval, about 15x the tokens of chat. https://www.anthropic.com/engineering/multi-agent-research-system; Walden Yan (Cognition), "Don't Build Multi-Agents", 2025-06-12. https://cognition.com/blog/dont-build-multi-agents; Survey arXiv 2505.02279 (MCP/ACP/A2A/ANP roadmap), 2025-05. https://arxiv.org/abs/2505.02279

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| One writer, reviewers from another family | Shift plan | Already built: a Round holds one writer or several read-only reviewers, never both, and a Team can require a reviewer unlike its writer (docs/concepts/how-work-flows.md, Ploeg ADR-0163). | S | Matches the topology the evidence converged on. |
| Capped, verdict-driven fix loop | Shift engine | Already decided: the review loop is verdict-driven and capped (Ploeg ADR-0017, ADR-0151). | S | Agents cannot loop on each other's opinions without limit. |
| The pull request is the blackboard | Agent communication | Decided: agents communicate through the pull request and a blackboard of four owned sources read at a version vector (Ploeg ADR-0011, ADR-0124). | S | No agent-to-agent protocol to secure or debug. |
| Planner Roles create held work | Planner Role | Built behind approval: a planner splits or clarifies a Work Item and created items wait as proposed within limits (Ploeg ADR-0031). | M | Orchestrator-worker where it pays, without autonomous fan-out. |
| No swarms or debates | Team shape | Resist: the models and topology record found no swarm, debate or agent-to-agent protocol worth adding; A2A stays a watchlist (Ploeg ADR-0007). | S | Spend goes to cost per accepted pull request, not coordination overhead. |

## The agent harness vs the model ("the loop" as architecture) { #harness-engineering }

Agent = model + harness. The loop, tools, context policy, sandbox, feedback and guardrails around the model decide most real-world performance and cost.

| | |
| --- | --- |
| Maturity | de-facto-convention |
| Outlook | none for the harness as a whole. Its parts standardise separately (MCP, Skills, sandboxes such as OpenSandbox in AAIF, 2026-10-22). Chance in 24 months: low. |
| Related standards | [Model Context Protocol](tool.md#mcp), [Agent Skills (SKILL.md)](definition.md#agent-skills) |
| Critique | The evidence is mostly vendor benchmark anecdotes (Terminal Bench rank jumps, "HarnessTax"), not peer-reviewed work [secondary]. https://www.faros.ai/blog/harness-engineering |
| Radar | **adopt**: Ploeg is a harness around harnesses: the loop, credentials, verification and outcome are already owned outside the model. |
| Watch for | OpenSandbox/OpenEnv reaching v1 APIs under AAIF, or a shared harness-trace format adopted by two vendors. |
| Decisions | [0018-the-outcome-drop-box-is-every-harnesss-return-path](../../../../../apps/ploeg/docs/adrs/0018-the-outcome-drop-box-is-every-harnesss-return-path.md), [0035-runs-get-ploeg-owned-skills-mounted-toolchains-and-worker-verification](../../../../../apps/ploeg/docs/adrs/0035-runs-get-ploeg-owned-skills-mounted-toolchains-and-worker-verification.md), [0091-each-run-records-the-model-harness-plan-and-ploegd-version-it-was-configured-with](../../../../../apps/ploeg/docs/adrs/0091-each-run-records-the-model-harness-plan-and-ploegd-version-it-was-configured-with.md), [0097-a-run-records-its-harness-version-and-the-teams-read-shows-each-roles-harness-and-model](../../../../../apps/ploeg/docs/adrs/0097-a-run-records-its-harness-version-and-the-teams-read-shows-each-roles-harness-and-model.md), [0098-an-operator-admission-may-choose-each-runs-harness-from-its-teams-allowlist](../../../../../apps/ploeg/docs/adrs/0098-an-operator-admission-may-choose-each-runs-harness-from-its-teams-allowlist.md), [0099-each-allowed-harness-runs-in-its-own-workload-and-the-claim-selects-on-it](../../../../../apps/ploeg/docs/adrs/0099-each-allowed-harness-runs-in-its-own-workload-and-the-claim-selects-on-it.md), [0118-the-unmaintained-openhands-cli-is-retired-as-a-harness](../../../../../apps/ploeg/docs/adrs/0118-the-unmaintained-openhands-cli-is-retired-as-a-harness.md), [0119-a-pull-request-is-ready-for-review-only-when-the-forges-ci-passed-on-its-head](../../../../../apps/ploeg/docs/adrs/0119-a-pull-request-is-ready-for-review-only-when-the-forges-ci-passed-on-its-head.md), [0126-a-recurring-attack-drill-runs-every-harness-against-a-hostile-repository](../../../../../apps/ploeg/docs/adrs/0126-a-recurring-attack-drill-runs-every-harness-against-a-hostile-repository.md), [0135-a-bake-off-runs-one-work-item-on-several-configurations-and-a-shadow-judge-recommends-while-a-person-picks](../../../../../apps/ploeg/docs/adrs/0135-a-bake-off-runs-one-work-item-on-several-configurations-and-a-shadow-judge-recommends-while-a-person-picks.md), [2026-10-11-agentic-models-and-topology](../../../../../docs/research/2026-10-11-agentic-models-and-topology.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** Mitchell Hashimoto, "My AI Adoption Journey", 2026-02-05 ("engineering the harness") [secondary attribution]. https://mitchellh.com/writing/my-ai-adoption-journey; OpenAI, "Harness engineering: leveraging Codex in an agent-first world", ~2026-02-11 [secondary]. https://openai.com/index/harness-engineering/; Anthropic definition of agents as "LLMs autonomously using tools in a loop", 2025-09-29. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents; Preprint on harness architecture, Preprints.org 202603.1756, 2026-03. https://www.preprints.org/manuscript/202603.1756

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| The worker wraps any harness | ploeg-worker, harness adapters | Already built: the worker starts openhands, an ACP agent, Claude Code or any executable as a child process, holds the credentials, verifies and reports (docs/concepts/inside-a-run.md; Ploeg ADR-0099). | S | Ploeg owns the guarantees, so the harness can be swapped without losing them. |
| Worker-run verification | Worker wrap-up | Already built: the worker runs the verify commands itself, without credentials, after the harness exits (Ploeg ADR-0035), and readiness waits for the forge's CI on the head (Ploeg ADR-0119). | S | Delivery does not rest on the agent's claim that tests passed. |
| Record the harness version on each Run | Run configuration facts | Already decided: each Run records the model, harness, plan and ploegd version it was configured with (Ploeg ADR-0091, ADR-0097). | S | Cost and merge rate can be attributed to a harness change, not guessed. |
| Bake-off between harness configurations | Operator admission | Proposed: run one Work Item on several configurations and let a shadow judge recommend while a person picks (Ploeg ADR-0135). | M | Turns harness choices into measured decisions per kind of work. |
| Retire a harness on evidence | Harness allowlist | Already decided once: the unmaintained OpenHands CLI was retired (Ploeg ADR-0118); keep a per-Team allowlist (Ploeg ADR-0098) and a recurring attack drill (Ploeg ADR-0126) as the gate. | S | The harness estate stays small and each member is tested against hostile repositories. |

## The agentic web (agent-readable sites, WebMCP, NLWeb, llms.txt) { #agentic-web }

Websites expose structured, callable surfaces for agents (in-page tools, a natural-language endpoint, LLM-oriented text) instead of agents scraping HTML.

| | |
| --- | --- |
| Maturity | pre-standard |
| Outlook | W3C. WebMCP has a CG draft and a Chrome origin trial. Medium chance of a WG/incubation in 24 months; NLWeb low; llms.txt low. |
| Related standards | [WebMCP (Web Model Context API)](commerce.md#webmcp), [Model Context Protocol](tool.md#mcp), [Web Bot Auth (HTTP Message Signatures for automated traffic)](web-content.md#web-bot-auth) |
| Critique | llms.txt has about 0.1% of crawler traffic and no citation benefit, and WebMCP's API shape is still moving (navigator vs document). https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/ ; https://chudi.dev/blog/what-is-webmcp |
| Radar | **hold**: Unfold's agent surface is MCP and its Runs have no web access, so agent-readable web standards add little today. |
| Watch for | WebMCP moving to a W3C WG or shipping unflagged in a stable Chrome release, plus a second engine signalling support. |
| Decisions | [adr-0008-every-pull-request-gets-a-preview-environment](../../../../../docs/adr/adr-0008-every-pull-request-gets-a-preview-environment.md), [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [adr-0012-the-marketing-site-releases-and-deploys-on-its-own](../../../../../docs/adr/adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md), [adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp](../../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** WebMCP, Draft Community Group Report, W3C Web Machine Learning CG; editors Walderman (Microsoft), Sagar and Farolino (Google). https://webmachinelearning.github.io/webmcp; W3C AI KR CG technical notes on WebMCP. https://w3c-cg.github.io/aikr/webMCP/webmcp-technical-notes.html; Microsoft NLWeb (Build 2025, schema.org/RSS based, open source). https://github.com/microsoft/NLWeb ; https://yoast.com/scaling-the-agentic-web-with-nlweb/; llms.txt adoption around 6-10% of top sites, with crawlers largely ignoring it (2026) [secondary]. https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/ ; https://commoncrawl.org/blog/a-content-analysis-of-llms-txt-files-from-the-july-2026-crawl-archive

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| llms.txt on the docs and marketing site | Marketing site, docs | Proposed: publish an llms.txt index for the docs and the separately released marketing site (system ADR-0012). | S | Prospects' agents can read what Unfold does accurately. |
| MCP is Unfold's agent surface | unfold-mcp, ploeg-mcp | Already decided: agents reach Unfold through read-first MCP servers (system ADR-0011, ADR-0032), so WebMCP in the browser UI would be a second surface to secure. | S | One agent surface to authorise and audit. |
| Runs do not browse the web | Worker network | Resist: workers have no internet route (docs/concepts/inside-a-run.md), so agent-readable sites cannot help a Run without opening an exfiltration channel. | S | Keeps the lethal trifecta broken. |
| Preview environments readable by reviewers | Preview environments | Proposed: give each preview environment (system ADR-0008) a structured summary page that a reviewer Run or a client's agent can read. | M | Reviewers can check a deployed change, not only its diff. |
| Watch WebMCP for the Agents window | Unfold browser UI | Watch: if WebMCP ships unflagged, assess exposing the Agents window's actions to the person's own browser agent. | S | Lets a person's assistant act in Unfold with their session when the standard is real. |

## Trust and reputation systems for agents { #trust-reputation }

Public registries of agent identity, feedback and third-party validation, so unknown agents can be trusted (on-chain or VC-based).

| | |
| --- | --- |
| Maturity | pre-standard |
| Outlook | Ethereum EIP process for on-chain. W3C VC for off-chain. Low chance of enterprise-relevant adoption in 24 months. |
| Related standards | — |
| Critique | Registered mainnet agents often show no reputation feedback at all, and reputation is sybil-prone. https://erc-8004.quicknode.com/agents/ethereum-mainnet/23034 |
| Radar | **hold**: Unfold never runs unknown agents, so public reputation systems solve a problem it does not have. |
| Watch for | A non-crypto enterprise registry (Entra Agent ID, AGNTCY) adopting a shared reputation/attestation format. |
| Decisions | [adr-0030-run-cards-are-an-unfold-domain-on-top-of-ploegs-delivery-facts](../../../../../docs/adr/adr-0030-run-cards-are-an-unfold-domain-on-top-of-ploegs-delivery-facts.md), [adr-0047-unfold-describes-a-repository-with-the-ai-codebase-maturity-model-and-delivers-at-level-5](../../../../../docs/adr/adr-0047-unfold-describes-a-repository-with-the-ai-codebase-maturity-model-and-delivers-at-level-5.md), [0050-a-run-cards-grade-is-a-versioned-formula-over-stored-facts](../../../../../apps/ploeg/docs/adrs/0050-a-run-cards-grade-is-a-versioned-formula-over-stored-facts.md), [0098-an-operator-admission-may-choose-each-runs-harness-from-its-teams-allowlist](../../../../../apps/ploeg/docs/adrs/0098-an-operator-admission-may-choose-each-runs-harness-from-its-teams-allowlist.md), [0141-the-claude-runner-image-carries-no-claude-code-and-installs-anthropics-signed-release-at-start](../../../../../apps/ploeg/docs/adrs/0141-the-claude-runner-image-carries-no-claude-code-and-installs-anthropics-signed-release-at-start.md), [0145-a-release-publishes-no-image-over-its-cve-budget-and-attaches-signed-openvex-to-every-digest](../../../../../apps/ploeg/docs/adrs/0145-a-release-publishes-no-image-over-its-cve-budget-and-attaches-signed-openvex-to-every-digest.md) |
| Reviewed | 2026-11-04 |

**Where it lives:** ERC-8004 "Trustless Agents" (Identity, Reputation and Validation registries), mainnet ~2026-01-29, EIP still draft [secondary]. https://eips.ethereum.org/EIPS/eip-8004; "Can Trustless Agents Be Trusted? An Empirical Study", arXiv 2606.26028 (abstract only). https://www.alphaxiv.org/abs/2606.26028.md; NANDA AgentFacts (VC-backed) in "Evolution of AI Agent Registry Solutions", arXiv 2508.03095. https://arxiv.org/abs/2508.03095

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Run card grade as internal reputation | Run cards | Accepted: Run cards grade each Run with a versioned formula over stored facts (system ADR-0030, Ploeg ADR-0050), which can roll up per Team configuration. | M | An Agency sees which Team setups earn trust. |
| Repository maturity sets autonomy | Connect a repository | Accepted: Unfold describes a repository with the AI Codebase Maturity Model and delivers at level 5 (system ADR-0047). | S | Trust is earned per repository, not assumed. |
| Harness allowlist as a trust list | Team configuration | Decided: an operator may choose a harness only from the Team's allowlist (Ploeg ADR-0098). | S | Unknown agents never run on client code. |
| Signed artefacts as supply-chain trust | Images and harness installs | Decided: images carry signed OpenVEX and the Claude runner installs a signed release at start (Ploeg ADR-0145, ADR-0141). | S | Trust rests on verifiable signatures, not reputation scores. |
| No public agent registry | Product | Resist: Unfold runs known Teams for known Tenants; a public reputation registry or on-chain scheme adds attack surface without a use. | S | Keeps trust decisions inside the Agency. |
