# Agent to tool and context

Generated from [`standards.yaml`](standards.yaml); see the [catalogue](index.md).

## Model Context Protocol { #mcp }

Not to be confused with: MCP is also Microsoft Certified Professional; do not confuse with the MCP Registry or MCP Server Cards (separate records)

| | |
| --- | --- |
| Steward | Agentic AI Foundation (AAIF, Linux Foundation) (foundation) |
| Status | stable |
| Latest | [2026-07-28 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/releases/tag/2026-07-28) |
| Radar | **adopt**: Both maturity and fit decided it: MCP is a stable foundation-governed standard, both servers already speak it over stdio and HTTP with Apps, Tasks and Events, and it is the rule-2 wire for tools in system ADR-0050; consistent with the 2026-10-13 verdict. |
| Moves when | A core revision (planned for late March 2027) removes something unfold-mcp or ploeg-mcp depends on, or a client people use drops support for the revisions both servers serve. |
| Competes with | — |
| Complements | [Agent2Agent Protocol](agent-agent.md#a2a), [WebMCP (Web Model Context API)](commerce.md#webmcp), [MCP Server Cards (SEP-2127, ext-server-card)](discovery.md#mcp-server-card), [AI Catalog (formerly AI Card)](discovery.md#ai-catalog) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp](../../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md), [adr-0035-interactive-sessions-reach-tenant-knowledge-only-through-unfold-mcp](../../../../../docs/adr/adr-0035-interactive-sessions-reach-tenant-knowledge-only-through-unfold-mcp.md), [adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation](../../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md), [0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team](../../../../../apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md), [0081-ploeg-serves-its-operator-reads-as-mcp-tools-through-ploeg-mcp](../../../../../apps/ploeg/docs/adrs/0081-ploeg-serves-its-operator-reads-as-mcp-tools-through-ploeg-mcp.md), [0174-ploeg-mcp-accepts-a-token-only-for-its-own-resource-from-an-https-issuer](../../../../../apps/ploeg/docs/adrs/0174-ploeg-mcp-accepts-a-token-only-for-its-own-resource-from-an-https-issuer.md), [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md), [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md), [2026-09-29-mcp-access](../../../../../docs/research/2026-09-29-mcp-access.md) |
| Watchlist | T5, T29, T30, T31, T32, T34, T35, T36 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Keep both MCP servers on the current revision | unfold-mcp, ploeg-mcp | Already built: unfold-mcp serves 2026-07-28 next to the 2025 revisions (apps/unfold/src/mcp.ts) and ploeg-mcp serves stateless Streamable HTTP through the Go SDK (apps/ploeg/cmd/ploeg-mcp/http.go). The remaining work is a conformance run per release, as the Confirmation of system ADR-0011 asks. | S | Every AI client a person already uses can reach Work Items without a client falling off the handshake. |
| Hand off a Work Item as an MCP task | unfold-mcp | Built behind a flag in apps/unfold/src/mcp-tasks.ts, as section 6 of the 2026-10-30 MCP extensions dossier designs it; the remaining step is a terminal Claude Code proof against the deterministic demo, so no paid model runs. | S | A developer follows a handed-off Work Item from the agent session that handed it off, with no polling by hand. |
| Tell a chat client when a Client's pull request is ready | unfold-mcp, outbound events | Built: apps/unfold/src/mcp-events.ts maps SEP-3415 subscriptions onto the Standard Webhooks outbox, pinned to one SEP commit. Next is an owner-approved trial with ChatGPT and a re-pin when the SEP changes (T29). | S | An Agency's project manager hears about ready work in the chat tool they already sit in. |
| Proposed: a cost quote in the hand-off confirmation | unfold-mcp, Ploeg dispatch | Proposed, not built: the MRTR confirmation reads 'Ploeg will spend at most X from Client Y's allowance' from the per-Round cap Ploeg already reports, idea 1 of the 2026-10-30 dossier. Whether the cap is known before dispatch is unverified. | S | No competitor shows spend over MCP, and a person confirms paid work knowing its ceiling. |
| Read-only gateway tools inside a Run | Ploeg dispatch, LiteLLM gateway | Built: a Run reaches MCP tools only through the gateway, bounded by a LiteLLM team (Ploeg ADR-0078). Extending it means adding vetted read-only servers to a Team's access group, never unfold-mcp or ploeg-mcp. | S | Runs get the tools a Team needs while budgets, keys and audit stay in one place. |

**Shipped adoption:** LiteLLM MCP gateway: https://docs.litellm.ai/docs/mcp; agentgateway MCP gateway (federation, Streamable HTTP, OAuth): https://github.com/agentgateway/agentgateway; Agent Router MCP tool routing: https://aaif.io/blog/agent-router-joins-aaif

**Open problems:** SEP-1913 Trust and Sensitivity Annotations, open: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1913; SEP-3415 Events Extension, open: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3415; #540 should a server expose its resource list before auth: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/540

**Watched:** github-releases `modelcontextprotocol/modelcontextprotocol` at 2026-07-28

## OAI Arazzo Specification { #arazzo }

| | |
| --- | --- |
| Steward | OpenAPI Initiative (Linux Foundation) (foundation) |
| Status | stable |
| Latest | [1.1.0 (AsyncAPI sources, querystring, $self) 2026-05-18](https://github.com/OAI/Arazzo-Specification/releases) |
| Radar | **assess**: Fit decided it: Arazzo is stable and pairs with Unfold's OpenAPI and AsyncAPI contracts, but no Agency has asked for workflow descriptions and its MCP step types are roadmap only. |
| Moves when | An Agency asks to automate the hand-off flow, or Arazzo ships MCP step types. |
| Competes with | — |
| Complements | [OpenAPI Specification 3.2](tool.md#openapi-3-2) |
| Builds on | [OpenAPI Specification 3.2](tool.md#openapi-3-2) |
| Superseded by | — |
| Decisions | [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md), [adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation](../../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: describe the hand-off flow as an Arazzo workflow | Unfold HTTP API | Proposed: an Arazzo file next to openapi.yaml for propose, approve, follow and accept, reusing the same operations the MCP tools call (system ADR-0037). | S | Agencies automate the whole flow from one machine-readable description. |
| Proposed: Tenant export round-trip as a workflow test | Tenant export | Proposed: the export round-trip test that system ADR-0050 lists as not built, written as an Arazzo workflow run in CI. | M | Proves an Agency can leave with its data. |
| Proposed: generate MCP tools from workflows | unfold-mcp | Proposed: compare hand-written tools with an Arazzo-to-MCP generator; MCP step types are still roadmap only. | M | Could cut tool code if the generator respects confirmations. |
| Proposed: AsyncAPI sources for event-driven steps | Outbound events | Proposed: Arazzo 1.1's AsyncAPI sources tie apps/unfold/docs/contracts/events.asyncapi.yaml into the flow, waiting for pull_request.ready. | S | One description covers calls and events. |
| Proposed: Client portal integration recipes | Client portal | Proposed: publish a workflow for submitting a Request and approving a Quote. | S | Clients with automation can integrate without custom docs. |

**Shipped adoption:** Bump.sh hosted MCP servers run Arazzo workflows (2026-04-17) (https://docs.bump.sh/product-updates/2026/04/17/mcp-server-arazzo-support/); WSO2 arazzo-mcp-gen exposes a workflow as an MCP tool (https://wso2.com/api-platform/docs/guides/ai-and-mcp/expose-a-multi-step-api-workflow-as-an-mcp-tool.md); UseArazzo runner/MCP; 1.1.0 only partly supported for run (https://github.com/usearazzo)

**Open problems:** MCP and A2A step types are roadmap only, not shipped (https://www.openapis.org/arazzo-specification)

**Watched:** github-releases `OAI/Arazzo-Specification` at 1.1.0

## OpenAPI Specification 3.2 { #openapi-3-2 }

| | |
| --- | --- |
| Steward | OpenAPI Initiative (Linux Foundation) (foundation) |
| Status | stable |
| Latest | [OAS 3.2.1 (editorial; 3.2.0 released 2025-09-19) 2026-09-10](https://github.com/OAI/OpenAPI-Specification/releases) |
| Radar | **adopt**: Fit decided it: system ADR-0050 requires OpenAPI for Unfold's own API and a 3.1.0 description already ships; 3.2 is stable and adds event-stream schemas Unfold needs, so the bump is due once the validators in use support 3.2. |
| Moves when | A tool in the docs or test pipeline cannot read 3.2, which would hold the description at 3.1. |
| Competes with | — |
| Complements | [OAI Arazzo Specification](tool.md#arazzo) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md), [adr-0027-unfold-checks-its-ploeg-client-against-ploegs-published-schemas](../../../../../docs/adr/adr-0027-unfold-checks-its-ploeg-client-against-ploegs-published-schemas.md), [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md) |
| Watchlist | T32 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: move the Unfold HTTP API description to 3.2 | Unfold HTTP API | Proposed: bump apps/unfold/docs/contracts/openapi.yaml from 3.1.0 to 3.2.0, using itemSchema to describe the text/event-stream endpoint instead of prose. | S | Agencies can generate clients that understand Unfold's live event stream. |
| Proposed: hierarchical tags per audience | Unfold HTTP API | Proposed: 3.2's parent tags group operations by Agency, Client portal and operator, matching the per-audience rendering of Unfold ADR 0057. | S | Readers find the part of the API meant for them. |
| Proposed: OpenAPI tool servers for chat clients | Agency | Proposed: document that Open WebUI-style clients can call the API directly from the OpenAPI description, as a path besides MCP. | S | Agencies on clients without MCP still reach Work Items. |
| Proposed: a contract test against the description | Release, mise run verify | Proposed: validate responses against openapi.yaml in the integration tests, so the API description required by system ADR-0050 cannot drift. | M | The documented API is the real one. |
| Proposed: OAuth flows declared for programs | Unfold HTTP API | Proposed: declare the device-authorization and client-credentials flows with 3.2's oauth2MetadataUrl, preparing T32. | S | A program reading Unfold learns how to authenticate from the description. |

**Shipped adoption:** Open WebUI consumes OpenAPI tool servers (v0.11.4 note on 'OpenAPI server' tools) (https://github.com/open-webui/open-webui/releases); Moonwalk SIG is examining agent-oriented capabilities [secondary] (https://www.openapis.org/?p=4159)

**Open problems:** No dedicated 'OpenAPI for agents' spec found; only the Moonwalk SIG focus [secondary]

**Watched:** github-releases `OAI/OpenAPI-Specification` at 3.2.1

## Skills Extension for MCP (io.modelcontextprotocol/skills, SEP-2640) { #skills-over-mcp }

| | |
| --- | --- |
| Steward | MCP Skills Over MCP Working Group (AAIF) (foundation) |
| Status | stabilising |
| Latest | [SEP-2640 Final (merged 2026-09-13); extension at Beta (SEP-3392 lifecycle); targets base revision 2026-07-28 2026-09-13](https://github.com/modelcontextprotocol/experimental-ext-skills) |
| Radar | **assess**: Fit is good but adoption decided it: the extension is Beta with no Claude or VS Code consumer and no Go SDK release, so T10 has not fired; consistent with the 2026-10-13 and 2026-10-30 'wait, ship skills in plugins'. |
| Moves when | Claude Code or VS Code appears under Skills in the MCP client matrix, or the Go SDK releases the extension (T10). |
| Competes with | — |
| Complements | [Agent Skills (SKILL.md)](definition.md#agent-skills), [MCP Apps (MCP extension, SEP-1865)](client-ui.md#mcp-apps) |
| Builds on | [Agent Skills (SKILL.md)](definition.md#agent-skills) |
| Superseded by | — |
| Decisions | [0092-a-team-pins-its-skills-in-a-catalogue-that-ploegd-fetches-once-and-serves-by-digest](../../../../../apps/ploeg/docs/adrs/0092-a-team-pins-its-skills-in-a-catalogue-that-ploegd-fetches-once-and-serves-by-digest.md), [0083-a-run-is-told-which-skills-bear-on-its-work-item](../../../../../apps/ploeg/docs/adrs/0083-a-run-is-told-which-skills-bear-on-its-work-item.md), [2026-10-13-sharing-agent-skills](../../../../../apps/ploeg/docs/research/2026-10-13-sharing-agent-skills.md), [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md), [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md) |
| Watchlist | T10 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: a Team's pinned skills served by ploeg-mcp | ploeg-mcp | Proposed, upstream in Ploeg: skills/list and skills/get over the Team catalogue that ploegd serves by digest (Ploeg ADR-0092), once the Go SDK ships the extension (go-sdk #1238). | M | A developer's own agent gets exactly the skills a Team's Runs use. |
| Proposed: Unfold's session skills over unfold-mcp | unfold-mcp | Proposed: serve the operate-session and review skills as skill:// resources from the hand-written server, using the TypeScript ext/skills shape; today they ship in the Claude Code plugin. | S | Clients that support the extension get the skills without installing a plugin. |
| Proposed: Client-specific instructions as skills | Client portal, unfold-mcp | Proposed: a Client Profile's agent instructions (system ADR-0049) served as a scoped skill to Agency developers working on that Client. | M | Client rules reach interactive sessions as well as Runs. |
| Proposed: digests checked against the catalogue | VS Code extension, Claude Code plugin | Proposed: the plugin compares the served skill digest with the Team's pinned digest and warns on drift. | S | No stale skill silently differs from what Runs use. |
| Proposed: skills for the Agents window chat | AHP host | Proposed: the Unfold chat of ADR 0049 loads skills from the same server. | S | One skill source for every surface. |

**Shipped adoption:** Implementations list and client matrix linked from the repo, contents not verified (https://github.com/modelcontextprotocol/experimental-ext-skills)

**Open problems:** No releases; 14 open issues (https://github.com/modelcontextprotocol/experimental-ext-skills/issues)

**Watched:** rss `https://github.com/modelcontextprotocol/experimental-ext-skills/commits/HEAD.atom`
