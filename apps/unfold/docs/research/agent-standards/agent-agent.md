# Agent to agent

Generated from [`standards.yaml`](standards.yaml); see the [catalogue](index.md).

## Agent Network Protocol { #anp }

Not to be confused with: ANP is also used for unrelated network protocols

| | |
| --- | --- |
| Steward | ANP open-source community (agent-network-protocol org) (community) |
| Status | stabilising |
| Latest | [v1.2 2026-09-24](https://github.com/agent-network-protocol/AgentNetworkProtocol/releases) |
| Radar | **hold**: Fit and adoption decided it: a community-governed agent-agent protocol with no shipped product adoption, competing with A2A, which itself fails on fit for Unfold. |
| Moves when | A product an Agency or Client uses ships ANP, or A2A's facade is built and an ANP peer asks to connect. |
| Competes with | [Agent2Agent Protocol](agent-agent.md#a2a), [Eclipse LMOS Protocol (Language Model Operating System)](agent-agent.md#eclipse-lmos-protocol) |
| Complements | — |
| Builds on | — |
| Superseded by | — |
| Decisions | [0007-a2a-adopt-nothing-watchlist-a-facade](../../../../../apps/ploeg/docs/adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: DID-based identity for an Agency's agents | Agency | Proposed: study whether ANP's DID identity layer could name an Agency's Ploeg install to outside agents; nothing in Unfold needs it today. | M | Prior art for agent identity if a hosted offering needs cross-organisation trust. |
| Proposed: ANP meta-protocol as a facade | Ploeg dispatch | Proposed: an ANP endpoint over proposals, the same shape as the A2A facade of Ploeg ADR-0007. | L | Would reach ANP agents, of which none was found in production. |
| Proposed: compare ANP discovery with Server Cards | unfold-mcp | Proposed: a desk comparison of ANP's agent description documents against Server Cards and AI Catalog. | S | Confirms which discovery format to bet on. |
| Proposed: ANP in the protocol ledger | Research | Proposed: add one dated row to the appendix of apps/unfold/docs/research/2026-09-11-ecosystem-alternatives.md so it is not re-researched. | S | Saves a future survey. |
| Proposed: Client agent marketplaces | Client portal | Proposed: only if a Client's agent network speaks ANP, accept Requests through it. | L | Speculative reach into decentralised agent networks. |

**Shipped adoption:** No shipped product adoption found in this crawl.

**Open problems:** Not crawled (verify-only scope).

**Watched:** github-releases `agent-network-protocol/AgentNetworkProtocol` at v1.2

## Agent2Agent Protocol { #a2a }

Not to be confused with: A2A is also 'application-to-application'; IETF draft names using a2a are unrelated

| | |
| --- | --- |
| Steward | AAIF (Linux Foundation) (foundation) |
| Status | stable |
| Latest | [v1.0.1 (stable); v1.1.0-rc tag 2026-10-29 2026-05-28](https://github.com/a2aproject/A2A/releases/tag/v1.0.1) |
| Radar | **assess**: Fit decided it, not maturity: A2A 1.0 is stable under AAIF with a Go SDK, but no agent among Unfold's people delegates work, consistent with Ploeg ADR-0007 and the 2026-10-13 verdict; that ADR's 2026-10-31 review date has passed with no dated re-confirmation. |
| Moves when | An Agency or Client asks to delegate from Gemini Enterprise, Copilot Studio or ServiceNow, or A2A grows a queue or pub-sub transport (a2aproject/A2A#1029) (T6). |
| Competes with | [Agent Network Protocol](agent-agent.md#anp), [Open Floor Protocol (Open Voice Interoperability Initiative)](agent-agent.md#open-floor-protocol), [LangChain Agent Protocol (runs/threads/store API)](client-ui.md#langchain-agent-protocol), [Coral Protocol / CoralOS](agent-agent.md#coral-protocol), [Eclipse LMOS Protocol (Language Model Operating System)](agent-agent.md#eclipse-lmos-protocol) |
| Complements | [Model Context Protocol](tool.md#mcp), [AI Catalog (formerly AI Card)](discovery.md#ai-catalog) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0007-a2a-adopt-nothing-watchlist-a-facade](../../../../../apps/ploeg/docs/adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md), [0031-runs-create-work-items-held-for-approval-within-limits](../../../../../apps/ploeg/docs/adrs/0031-runs-create-work-items-held-for-approval-within-limits.md), [0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills](../../../../../apps/ploeg/docs/adrs/0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills.md), [2026-07-28-a2a-fit](../../../../../apps/ploeg/docs/research/2026-07-28-a2a-fit.md), [2026-10-17-team-manifest-standards](../../../../../apps/ploeg/docs/research/2026-10-17-team-manifest-standards.md), [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md), [adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach](../../../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md) |
| Watchlist | T6 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: an A2A facade over proposals | Ploeg dispatch, separate facade service | Proposed, watchlisted in Ploeg ADR-0007: an Agent Card plus SendMessage that creates a proposed Work Item a person approves (Ploeg ADR-0031, ADR-0175), GetTask that maps to the Work Item, INPUT_REQUIRED for needs-a-person. | M | A Client's Gemini Enterprise or Copilot Studio agent could delegate work without anyone retyping a ticket. |
| Proposed: a Team described as an AgentSkill | Ploeg dispatch | Proposed: one AgentSkill per Team in the Agent Card, as the 2026-10-17 team-manifest sweep concluded; the Team manifest itself stays Ploeg's own (Ploeg ADR-0110). | S | An outside agent can see what kinds of work an Agency's Teams take. |
| Trial through the gateway, away from Ploeg credentials | LiteLLM gateway | LiteLLM's A2A agent gateway is already deployable; a bounded spike would route one external agent through it with per-key access control, never through a Run's key. | S | Cheap evidence of whether any Agency actually has an agent to delegate from. |
| Proposed: hand-off results back to a calling agent | unfold-mcp, facade | Proposed: the pull request link and delivery brief (Unfold ADR 0057) returned as an A2A Artifact, using push notifications instead of polling. | M | A delegating agent gets the reviewable result, not just a status. |
| Proposed: Client agents talk to the Client Portal | Client portal | Proposed, after tenancy (system ADR-0017): a Client's own agent submits Requests to the Portal over A2A, scoped to that Client's sources. | L | Clients with their own agents can file and follow requests machine to machine. |

**Shipped adoption:** LiteLLM A2A agent gateway, /a2a/{agent}/message/send, per-key access control: https://docs.litellm.ai/docs/a2a; agentgateway A2A gateway: https://github.com/agentgateway/agentgateway; kagent A2A push notifications (v1.0.0-rc1): https://github.com/kagent-dev/kagent/releases/tag/v1.0.0-rc1; IBM ACP folded into A2A: https://github.com/i-am-bee/acp

**Open problems:** v1.1.0 still RC: https://github.com/a2aproject/A2A/tags

**Watched:** github-releases `a2aproject/A2A` at v1.0.1, github-tags `a2aproject/A2A` at v1.1.0-rc

## AGNTCY Secure Low-latency Interactive Messaging { #agntcy-slim }

| | |
| --- | --- |
| Steward | AGNTCY (Linux Foundation) (foundation) |
| Status | stabilising |
| Latest | [slim-v3.4.6 2026-10-20](https://github.com/agntcy/slim/releases) |
| Radar | **hold**: Fit decided it: Ploeg's dispatch has one trust boundary and a lease queue, and no seam a person uses needs agent-agent messaging; no third-party adoption was verified. |
| Moves when | Ploeg needs cross-organisation execution cells, or LiteLLM or another gateway Ploeg uses ships SLIM. |
| Competes with | [Coral Protocol / CoralOS](agent-agent.md#coral-protocol) |
| Complements | [Agent2Agent Protocol](agent-agent.md#a2a), [Model Context Protocol](tool.md#mcp) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0107-execution-runs-in-cells-that-pull-from-one-hub](../../../../../apps/ploeg/docs/adrs/0107-execution-runs-in-cells-that-pull-from-one-hub.md), [0005-build-a-dedicated-dispatch-plane](../../../../../apps/ploeg/docs/adrs/0005-build-a-dedicated-dispatch-plane.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: SLIM as a transport between cells and the hub | Ploeg dispatch | Proposed: compare SLIM's secure messaging with how execution cells pull from one hub (Ploeg ADR-0107); Ploeg's Postgres lease queue already gives claim and backpressure. | M | Prior art only; replacing the lease queue is not wanted. |
| Proposed: MCP over SLIM for remote tools | LiteLLM gateway | Proposed: study SLIM's MCP transport as an alternative to Streamable HTTP for tools inside a Run. | M | Would matter only if the gateway route proves insufficient. |
| Proposed: live Run events to many followers | PWA, AHP host | Proposed: compare SLIM group messaging with Unfold's SSE stream and AHP fan-out. | S | Confirms the existing stream is enough. |
| Proposed: cross-Tenant messaging isolation | Agency, hosted offering | Proposed: read SLIM's MLS-based groups as prior art for Tenant-isolated channels. | S | Design input for hosted isolation. |
| Proposed: ledger row | Research | Proposed: record the verdict in the protocol ledger. | S | Saves a future survey. |

**Shipped adoption:** No third-party production adoption verified.

**Open problems:** Not crawled (verify-only scope).

**Watched:** rss `https://github.com/agntcy/slim/releases.atom`

## Coral Protocol / CoralOS { #coral-protocol }

Not to be confused with: Unrelated to Google Coral Edge TPU

| | |
| --- | --- |
| Steward | Coral Protocol (company) (single-vendor) |
| Status | stabilising |
| Latest | [coral-server v1.5.0 2026-10-12](https://github.com/Coral-Protocol/coral-server/releases) |
| Radar | **hold**: Maturity and fit decided it: single-vendor, no versioned public spec, no licence shown, and Ploeg already has its own coordination model. |
| Moves when | Coral publishes a versioned open spec under an open licence and an Agency uses it. |
| Competes with | [Agent2Agent Protocol](agent-agent.md#a2a), [AGNTCY Secure Low-latency Interactive Messaging](agent-agent.md#agntcy-slim), [kagent](inference-infra.md#kagent) |
| Complements | [Model Context Protocol](tool.md#mcp) |
| Builds on | [Model Context Protocol](tool.md#mcp) |
| Superseded by | — |
| Decisions | [0124-agents-communicate-through-a-blackboard-of-four-owned-sources-that-ploeg-reads-at-a-version-vector](../../../../../apps/ploeg/docs/adrs/0124-agents-communicate-through-a-blackboard-of-four-owned-sources-that-ploeg-reads-at-a-version-vector.md), [0033-board-control-planes-are-mined-for-design-never-depended-on](../../../../../apps/ploeg/docs/adrs/0033-board-control-planes-are-mined-for-design-never-depended-on.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: compare threads and mentions with the blackboard | Ploeg dispatch | Proposed: a desk check of Coral's thread and mention addressing against Ploeg's blackboard of owned sources (Ploeg ADR-0124). | S | Design input only. |
| Proposed: Coral agents as a harness | Ploeg dispatch | Proposed: only through ACP and the gateway; Coral speaks MCP, not ACP. | L | Speculative. |
| Proposed: payments prior art | Agency | Proposed: note its escrow claims as prior art for per-ticket billing (system ADR-0006), with low confidence. | S | Marginal. |
| Proposed: licence check | Release | Proposed: record that no licence was shown, which blocks any dependency under the estate's Apache-2.0 policy. | S | Avoids a licence risk. |
| Proposed: ledger row | Research | Proposed: record the verdict in the protocol ledger. | S | Saves a future survey. |

**Shipped adoption:** Coral v1: MCP-based runtime with threads and mention addressing [secondary]: https://dataconomy.com/2025/09/22/coral-v1-released-with-model-context-protocol-runtime; Docs moved to docs.coralos.ai: https://docs.coralos.ai/

**Open problems:** No public versioned protocol spec found; the repo has no license shown in the API response: https://github.com/Coral-Protocol/coral-server; Payments and escrow status contradictory across sources [secondary]: https://madeonsol.com/compare/coral-protocol-vs-elizaos

**Watched:** github-releases `Coral-Protocol/coral-server` at v1.5.0

## Eclipse LMOS Protocol (Language Model Operating System) { #eclipse-lmos-protocol }

Not to be confused with: LMOS also names the LMOS runtime, operator and router; Arc is its Kotlin agent DSL

| | |
| --- | --- |
| Steward | Eclipse Foundation (eclipse-lmos) (foundation) |
| Status | draft |
| Latest | [unversioned WIP spec (runtime 0.32.0 on 2026-08-10; operator 0.11.0 on 2026-06-26) 2026-08-10](https://eclipse.dev/lmos/docs/lmos_protocol/introduction/) |
| Radar | **hold**: Maturity decided it: the spec is unversioned work in progress with empty sections, and no seam in Unfold needs it. |
| Moves when | LMOS publishes a versioned protocol and an Agency or Client runs it. |
| Competes with | [Agent2Agent Protocol](agent-agent.md#a2a), [Agent Network Protocol](agent-agent.md#anp) |
| Complements | — |
| Builds on | — |
| Superseded by | — |
| Decisions | [0071-ploeg-keeps-its-state-in-postgresql-and-is-not-a-kubernetes-operator](../../../../../apps/ploeg/docs/adrs/0071-ploeg-keeps-its-state-in-postgresql-and-is-not-a-kubernetes-operator.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: compare LMOS Kubernetes operator with Ploeg | Ploeg dispatch | Proposed: a desk comparison with Ploeg's dispatch plane, which is not a Kubernetes operator (Ploeg ADR-0071). | S | Design input only. |
| Proposed: WoT Thing Descriptions for Teams | Ploeg dispatch | Proposed: check whether a Team manifest maps to a Thing Description. | S | Prior art for Team descriptions. |
| Proposed: an LMOS router as an intake path | Ploeg dispatch | Proposed: route work from an LMOS deployment into proposals. | L | Speculative; no Agency runs LMOS. |
| Proposed: DID-signed agent identity | Agency | Proposed: prior art for signed agent identity across organisations. | S | Design input for a hosted offering. |
| Proposed: ledger row | Research | Proposed: record the verdict in the protocol ledger. | S | Saves a future survey. |

**Shipped adoption:** Reference runtime, operator and router on Kubernetes: https://github.com/eclipse-lmos

**Open problems:** The spec says it is work in progress with empty sections and not on the W3C track (builds on WoT Thing Description, DID-signed, mDNS and directory discovery): https://eclipse.dev/lmos/docs/lmos_protocol/introduction/ and https://eclipse.dev/lmos/docs/lmos_protocol/discovery/; lmos-runtime #103 replace the GraphQL client with kotlin-wot: https://github.com/eclipse-lmos/lmos-runtime/issues/103

**Watched:** github-releases `eclipse-lmos/lmos-runtime` at 0.32.0, github-releases `eclipse-lmos/lmos-operator` at 0.11.0

## IETF Agent Communication Protocols WG (agentproto) { #ietf-agentproto }

Not to be confused with: Not LangChain 'Agent Protocol'; mailing list formerly agent2agent@ietf.org

| | |
| --- | --- |
| Steward | IETF ART area (chairs Leslie Daigle, Orie Steele; AD Charles Eckel) (sdo) |
| Status | draft |
| Latest | [Charter approved, WG active 2026-10-08](https://datatracker.ietf.org/doc/charter-ietf-agentproto/) |
| Radar | **hold**: Maturity decided it: the WG is chartered but has no adopted drafts, and its protocol milestone is 2027-03-31. |
| Moves when | The WG adopts a protocol draft, or the use-cases draft is adopted and names a seam Unfold has. |
| Competes with | — |
| Complements | [IETF Discovery of Agents With Names WG (DAWN)](discovery.md#ietf-dawn) |
| Builds on | [Agent2Agent Protocol](agent-agent.md#a2a), [Model Context Protocol](tool.md#mcp) |
| Superseded by | — |
| Decisions | [0007-a2a-adopt-nothing-watchlist-a-facade](../../../../../apps/ploeg/docs/adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md), [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md) |
| Watchlist | T6, T36 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: contribute the Work Item delegation use case | Ploeg dispatch | Proposed: submit the proposal-approval-delegation case (Ploeg ADR-0031, ADR-0175) to the use-cases draft before its 2026-12-31 adoption milestone; an owner decision. | S | A future standard would carry budgets and human approval, which no agent protocol has today. |
| Proposed: contribute cost and allowance metadata | unfold-mcp | Proposed: bring the cost-metadata idea of T36 to the WG's architecture work as well as to the MCP Tasks and Events WG. | S | Unfold's lead on per-work spend could become a shared convention. |
| Proposed: track the PS protocol draft | Research | Proposed: a watch on the datatracker feed; revisit the A2A facade decision when a protocol draft is adopted (milestone 2027-03-31). | S | Early warning if an IETF protocol supersedes A2A. |
| Proposed: map Ploeg's lifecycle onto the architecture draft | Ploeg dispatch | Proposed: when the architecture draft appears (milestone 2027-02-28), check that queued, leased, needs-a-person and done map cleanly. | S | Keeps a future facade cheap. |
| Proposed: Agency procurement evidence | Agency | Proposed: note in agency-facing docs which standards bodies Unfold tracks, once a WG document exists. | S | Helps Agencies that ask about standards alignment. |

**Shipped adoption:** None; milestones: use-cases draft adoption 2026-12-31, architecture 2027-02-28, PS protocol adoption 2027-03-31, to IESG 2028-03-31: https://datatracker.ietf.org/api/v1/group/groupevent/?group__acronym=agentproto&format=json

**Open problems:** No WG-adopted drafts yet; candidate inputs include draft-nandakumar-agentproto-pace-00 (2026-11-01).

**Watched:** changelog-page `https://datatracker.ietf.org/group/agentproto/documents/`, rss `https://datatracker.ietf.org/feed/group-changes/agentproto/`

## IETF Dynamic Multi-agent Secured Collaboration (DMSC) BoF { #ietf-dmsc }

| | |
| --- | --- |
| Steward | IETF (BoF chairs Joe Clarke, Laurent Ciavaglia; AD Charles Eckel) (sdo) |
| Status | dormant |
| Latest | [BOF Concluded (no WG chartered) 2026-10-08](https://datatracker.ietf.org/doc/minutes-126-dmsc-202607220700/) |
| Radar | **hold**: Maturity decided it: the BoF concluded without a WG and its work was folded into agentproto and DAWN. |
| Moves when | The IESG charters a DMSC working group. |
| Competes with | — |
| Complements | [IETF Agent Communication Protocols WG (agentproto)](agent-agent.md#ietf-agentproto), [IETF Discovery of Agents With Names WG (DAWN)](discovery.md#ietf-dawn) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0156-each-run-carries-a-transaction-token-that-names-its-person-and-a-team-without-a-sponsor-runs-nothing](../../../../../apps/ploeg/docs/adrs/0156-each-run-carries-a-transaction-token-that-names-its-person-and-a-team-without-a-sponsor-runs-nothing.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: read the problem statement for gateway security | LiteLLM gateway | Proposed: check the draft-song problem statement against Ploeg's gateway and transaction-token rules (Ploeg ADR-0156). | S | Design input only. |
| Proposed: follow the fold into agentproto | Research | Proposed: track where the requirements land in agentproto and DAWN. | S | Avoids watching a dead BoF. |
| Proposed: multi-agent collaboration security | Ploeg dispatch | Proposed: compare MACP with Ploeg's blackboard and per-Run credentials. | S | Design input only. |
| Proposed: Agency security questionnaire | Agency | Proposed: none until a WG exists. | S | Marginal. |
| Proposed: ledger row | Research | Proposed: record the BoF conclusion in the protocol ledger. | S | Saves a future survey. |

**Shipped adoption:** None. About 15 individual draft-*-dmsc-* drafts remain active, e.g. draft-li-dmsc-macp-07 (2026-11-02): https://datatracker.ietf.org/doc/draft-li-dmsc-macp/

**Open problems:** The AD advised folding the requirements into agentproto and the discovery work; gateway standardisation was judged premature (minutes): https://datatracker.ietf.org/doc/minutes-126-dmsc-202607220700/

**Watched:** ietf-draft `draft-li-dmsc-macp` at 07, ietf-draft `draft-song-dmsc-problem-statement` at 00

## Open Floor Protocol (Open Voice Interoperability Initiative) { #open-floor-protocol }

Not to be confused with: OFP; not OpenFlow

| | |
| --- | --- |
| Steward | LF AI & Data, Open Voice Interoperability Initiative (incubation) (foundation) |
| Status | stabilising |
| Latest | [Conversation Envelope 1.1.1 + Assistant Manifest 1.0.1 (Dialog Events 1.0.2) 2026-10-15](https://github.com/open-voice-interoperability/openfloor-docs/commit/HEAD) |
| Radar | **hold**: Fit decided it: OFP targets conversational and voice assistants, a seam Unfold does not have, and its repository showed a supply-chain incident in 2026-08. |
| Moves when | An Agency or Client asks for voice or multi-assistant conversation, and OFP closes agent authentication (issue #21). |
| Competes with | [Agent2Agent Protocol](agent-agent.md#a2a) |
| Complements | — |
| Builds on | — |
| Superseded by | — |
| Decisions | — |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: a voice front end to the Now queue | PWA | Proposed: an OFP assistant that reads what waits for a person; no voice requirement exists. | L | Speculative hands-free triage. |
| Proposed: a refinement agent in a multi-party conversation | Client portal | Proposed: the Portal's refinement agent joining an OFP conversation with a Client's assistant. | L | Speculative; no Client uses OFP. |
| Proposed: compare envelopes with CloudEvents | Outbound events | Proposed: a desk check of OFP's conversation envelope against Unfold's CloudEvents envelope. | S | Confirms nothing is missing from Unfold's event shape. |
| Proposed: supply-chain lesson | Release | Proposed: note the removed credential-exfiltration workflow as a reason never to depend on its SDKs without review. | S | Avoids a risky dependency. |
| Proposed: ledger row | Research | Proposed: record the verdict in the protocol ledger. | S | Saves a future survey. |

**Shipped adoption:** 1.1.0 multi-agent release announced 2026-01-23: https://lfaidata.foundation/?p=7887; SDKs openfloor-python and openfloor-js (reference only): https://github.com/open-voice-interoperability

**Open problems:** #21 authentication of agents: https://github.com/open-voice-interoperability/openfloor-docs/issues/21; A malicious credential-exfiltration workflow was removed 2026-08-10 (supply-chain signal): https://github.com/open-voice-interoperability/openfloor-docs/commits/main

**Watched:** rss `https://github.com/open-voice-interoperability/openfloor-docs/commits/HEAD.atom`, changelog-page `https://github.com/open-voice-interoperability/openfloor-docs/commits/main`
