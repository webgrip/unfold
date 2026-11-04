# Identity, delegation and authorization

Generated from [`standards.yaml`](standards.yaml); see the [catalogue](index.md).

## AAuth Protocol (Hardt) { #aauth }

Not to be confused with: Dick Hardt's non-OAuth-compatible agent protocol over HTTP Signature Keys (draft-hardt-oauth-aauth-protocol-11, plus -r3, -budgets, -events, -bootstrap, -headers). NOT the same as Rosenberg's 'AAuth - Agentic Authorization OAuth 2.1 Extension' (draft-rosenberg-oauth-aauth-02, 2026-11-01), which is an OAuth grant.

| | |
| --- | --- |
| Steward | individual (D. Hardt) (community) |
| Status | draft |
| Latest | [draft-hardt-oauth-aauth-protocol-11 2026-09-25](https://datatracker.ietf.org/doc/draft-hardt-oauth-aauth-protocol/) |
| Radar | **hold**: Maturity and fit both decided it: two incompatible individual drafts share the name, and it is not OAuth-compatible while every client Unfold serves speaks OAuth. |
| Moves when | One AAuth draft is adopted by a working group and an MCP client people use implements it. |
| Competes with | [The OAuth 2.1 Authorization Framework](identity.md#oauth-2-1), [Mission-Bound Authorization for OAuth 2.0 (plus Mission Resource Access Profile)](identity.md#mission-bound-authz) |
| Complements | [Web Bot Auth (HTTP Message Signatures for automated traffic)](web-content.md#web-bot-auth) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md) |
| Watchlist | T6 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: agents sign requests to unfold-mcp | unfold-mcp | Accept AAuth HTTP-signature agent identity alongside OAuth bearer tokens. | L | Agent-level identity without a browser flow. |
| Proposed: Run budgets via aauth-budgets | Ploeg budgets | Express a Run's Budget as an AAuth budget grant. | L | Spend limits carried in the protocol. |
| Proposed: AAuth events for revocation | Unfold identity revocation | Receive AAuth events next to SSF. | M | Revocation for AAuth agents. |
| Proposed: bootstrap Runs with AAuth | Ploeg Run credentials | Use aauth-bootstrap for worker identity. | L | Key-based Run identity. |
| Proposed: AAuth for the A2A facade | A2A facade | Authenticate delegating agents with AAuth (T6). | M | Identify external agents. |

**Shipped adoption:** Explainer: https://github.com/dickhardt/AAuth ; demo with Keycloak: https://github.com/christian-posta/aauth-full-demo

**Open problems:** Two incompatible drafts share the name; neither is WG-adopted

**Watched:** ietf-draft `draft-hardt-oauth-aauth-protocol` at 11, ietf-draft `draft-rosenberg-oauth-aauth` at 02, ietf-draft `draft-hardt-httpbis-signature-key` at 09

## Agent Name Service (ANS v2) { #ans }

Not to be confused with: Not Ethereum Name Service; draft-narajala-ans-00 (v1, 2025-11-18) superseded by ansv2

| | |
| --- | --- |
| Steward | Linux Foundation (intent to launch 2026-06-23); authors from GoDaddy, OWASP, DistributedApps.ai, Cisco (foundation) |
| Status | draft |
| Latest | [draft-narajala-courtney-ansv2-02 2026-10-26](https://datatracker.ietf.org/doc/draft-narajala-courtney-ansv2/) |
| Radar | **hold**: Maturity and fit both decided it: an independent-stream draft with one reference implementation, and Unfold has no public endpoint to name yet. |
| Moves when | The hosted offering exposes a public unfold-mcp endpoint and an MCP client people use resolves ANS names, or the draft moves into an IETF working group. |
| Competes with | [Project NANDA Index / AgentFacts](discovery.md#nanda-index) |
| Complements | [DNS-AID (DNS-based Agent Identification and Discovery)](discovery.md#dns-aid), [AI Catalog (formerly AI Card)](discovery.md#ai-catalog), [Agent2Agent Protocol](agent-agent.md#a2a), [Model Context Protocol](tool.md#mcp) |
| Builds on | [DNS-AID (DNS-based Agent Identification and Discovery)](discovery.md#dns-aid) |
| Superseded by | — |
| Decisions | [adr-0005-unfold-is-offered-to-agencies](../../../../../docs/adr/adr-0005-unfold-is-offered-to-agencies.md), [adr-0009-one-tenant-per-agency](../../../../../docs/adr/adr-0009-one-tenant-per-agency.md), [0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team](../../../../../apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md), [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md) |
| Watchlist | T33, T6 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: publish Unfold's MCP endpoint under a verifiable agent name | unfold-mcp discovery | Register the hosted unfold-mcp URL with an ANS registry and serve the receipt next to the Server Card of watchlist item T33. Needs a hosted endpoint, which does not exist yet. | M | An Agency's tooling could check that the endpoint it finds really belongs to the hosted Unfold service. |
| Proposed: name each Agency's Tenant endpoint for its Clients | Tenant, Client Portal | Give each Tenant a subdomain with an ANS record, so a Client's AI client can resolve the right Tenant. Waits on the hosted offering of ADR-0005 and ADR-0009. | M | Clients reach their own Agency's Unfold, not a look-alike. |
| Proposed: verify a third-party MCP server before a Run may reach it | Ploeg Run tool access (LiteLLM gateway) | Before an MCP server joins a LiteLLM access group under Ploeg ADR-0078, check its ANS registration and transparency-log entry as part of admission. | M | Lowers the risk of a Run calling an impostor tool server. |
| Proposed: an A2A facade discoverable by name | A2A facade over proposals | If watchlist item T6 fires, list the facade's Agent Card under an ANS name so an Agency's orchestrator can find and trust it. | S | Makes the facade discoverable without hand-shared URLs. |
| Proposed: show a server's verified name on its tool calls | Action Records, OCSF audit | Record the ANS name of any MCP server a Run called next to the call in the audit trail of the ocsf-audit change. | S | Reviewers see which verified service a Run used. |

**Shipped adoption:** LF press release: https://www.linuxfoundation.org/press/linux-foundation-announces-intent-to-launch-agent-name-service-to-establish-trusted-identity-infrastructure-for-ai-agents; Go reference implementation (registry, transparency log, verifier) v0.1.6 2026-06-26: https://github.com/agentnameservice/ans; ans-gateway-auth: DPoP plus SCITT receipts enforced in agentgateway and Agent Router (repo, no release): https://github.com/agentnameservice/ans-gateway-auth; CSA security analysis: https://labs.cloudsecurityalliance.org/research/agentic-identity-ans-security-analysis-v1-0/

**Open problems:** Independent-stream Informational draft, not an IETF consensus document: https://datatracker.ietf.org/doc/draft-narajala-courtney-ansv2/; Critique: the registrar-centric trust hierarchy [secondary]: https://thenewstack.io/can-dns-become-the-basis-for-ai-agent-identity; ans-spec #43 cross-RA reputation carry-forward: https://github.com/agentnameservice/ans-spec/issues/43

**Watched:** ietf-draft `draft-narajala-courtney-ansv2` at 02, github-releases `agentnameservice/ans` at v0.1.6

## AI Identity Management System (AIMS) { #wimse-aims }

Not to be confused with: Informational best-practice composition of WIMSE, SPIFFE and OAuth for agents. Formerly draft-klrc-aiagent-auth. Defines no new protocol.

| | |
| --- | --- |
| Steward | IETF WIMSE WG (sdo) |
| Status | draft |
| Latest | [draft-ietf-wimse-aims-01 2026-11-02](https://datatracker.ietf.org/doc/draft-ietf-wimse-aims/) |
| Radar | **assess**: Maturity decided it: an informational working-group draft that defines no protocol, useful as a checklist and nothing to build against. |
| Moves when | AIMS reaches working-group last call, or an Agency security review asks for conformance to it. |
| Competes with | — |
| Complements | [SPIFFE / SPIRE (plus OAuth SPIFFE Client Authentication, MCP SEP-1933)](identity.md#spiffe-spire), [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange), [OAuth Transaction Tokens](identity.md#transaction-tokens), [OpenID Shared Signals Framework 1.0, CAEP 1.0, RISC 1.0](identity.md#openid-ssf-caep-risc) |
| Builds on | [SPIFFE / SPIRE (plus OAuth SPIFFE Client Authentication, MCP SEP-1933)](identity.md#spiffe-spire), [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange) |
| Superseded by | — |
| Decisions | [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md), [adr-0009-one-tenant-per-agency](../../../../../docs/adr/adr-0009-one-tenant-per-agency.md), [0034-the-harness-gets-placeholders-the-worker-keeps-credentials](../../../../../apps/ploeg/docs/adrs/0034-the-harness-gets-placeholders-the-worker-keeps-credentials.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Use AIMS as the checklist for RFC-0011's chain | Ploeg Run credentials | RFC-0011 already cites AIMS for property P3 and P7; keep its gap list as the review checklist for each stage. | S | A standards-backed definition of done for agent credentials. |
| Proposed: WIMSE workload credentials for workers | Ploeg worker | When a second cluster needs trust, follow workload-creds instead of a custom token. | L | Standard cross-cluster workload proof. |
| Proposed: HTTP signatures between Ploeg services | Ploeg internal | Adopt WIMSE http-signature for worker to broker calls once published. | M | Request-level proof without a mesh. |
| Proposed: document Unfold's agent identity model against AIMS | docs/concepts | A concept page mapping person, Run, Role and Team onto AIMS terms for Agency security reviews. | S | Faster Agency security questionnaires. |
| Proposed: Tenant isolation review | Tenant | Check ADR-0009's per-Tenant credentials against AIMS's guidance before the second Agency joins. | S | Catches gaps before multi-Tenant launch. |

**Shipped adoption:** Reference architecture only. Sibling WIMSE docs: workload-creds-03 (2026-10-30), http-signature-08 (Publication Requested), workload-identity-practices-08 (IETF Last Call): https://datatracker.ietf.org/wg/wimse/documents/

**Open problems:** The gap list is still evolving (the doc's purpose)

**Watched:** ietf-draft `draft-ietf-wimse-aims` at 01, ietf-draft `draft-ietf-wimse-workload-creds` at 03

## Amazon Bedrock AgentCore Identity (plus AgentCore Policy) { #aws-agentcore-identity }

Not to be confused with: Workload-identity directory and token vault, with Cedar-based Policy on AgentCore Gateway.

| | |
| --- | --- |
| Steward | AWS (single-vendor) |
| Status | stable |
| Latest | [Identity docs current; Policy GA 2026-03-03 2026-03-03](https://aws.amazon.com/about-aws/whats-new/2026/03/policy-amazon-bedrock-agentcore-generally-available) |
| Radar | **hold**: Fit decided it: single-vendor, names none of the open grants, and Unfold's production runs on a rented EU Talos cluster, not AWS. |
| Moves when | An Agency self-hosts on AWS and asks Ploeg to use its AgentCore vault or gateway. |
| Competes with | [Okta Cross App Access (XAA)](identity.md#okta-xaa), [Microsoft Entra Agent ID](identity.md#entra-agent-id) |
| Complements | — |
| Builds on | [Cedar policy language](identity.md#cedar), [The OAuth 2.1 Authorization Framework](identity.md#oauth-2-1) |
| Superseded by | — |
| Decisions | [adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging](../../../../../docs/adr/adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md), [0008-litellm-is-the-credential-and-metering-seam](../../../../../apps/ploeg/docs/adrs/0008-litellm-is-the-credential-and-metering-seam.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: an Agency on AWS runs Ploeg workers under AgentCore Identity | Ploeg Run credentials | A worker adapter that obtains forge and model credentials from AgentCore's token vault instead of Ploeg's broker. | L | Agencies on AWS reuse their own credential vault. |
| Proposed: Cedar policies on AgentCore Gateway for Run tools | Ploeg Run tool access | An alternative to the LiteLLM gateway of Ploeg ADR-0078 for an AWS-hosted Agency. | L | Policy at the gateway the Agency already pays for. |
| Proposed: AgentCore as a model gateway implementation | Ploeg gateway contract | ADR-0050 makes the gateway a generic Ploeg contract; AgentCore could be a third implementation. Ploeg work upstream. | L | Bring-your-own-gateway for AWS estates. |
| Proposed: AWS-hosted Tenant isolation | Tenant | Map a Tenant to an AgentCore workload identity directory. | M | AWS-native separation between Agencies. |
| Proposed: inbound auth from AgentCore agents | unfold-mcp OAuth | Accept tokens from an Agency's AgentCore agents calling unfold-mcp. | M | Agency agents on AWS can read Unfold. |

**Shipped adoption:** Identity features: OAuth client_credentials and authorization_code, token vault, workload identity ARNs, impersonation flow: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/key-features-and-benefits.html; Policy (Cedar) GA 2026-03-03: https://aws.amazon.com/about-aws/whats-new/2026/03/policy-amazon-bedrock-agentcore-generally-available

**Open problems:** The docs name no RFC 8693, ID-JAG or CIMD; impersonation is credential-passing (features page). The Identity GA date was not verified.

**Watched:** changelog-page `https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/key-features-and-benefits.html`

## Attenuating Authorization Tokens for Agentic Delegation Chains (AAT) { #attenuating-agent-tokens }

Not to be confused with: Offline-derivable, tool- and argument-constrained tokens profiling RAR. Individual draft by Niyikiza (Tenuo). Not macaroons or biscuits, though similar in spirit.

| | |
| --- | --- |
| Steward | individual (N. Niyikiza) (community) |
| Status | draft |
| Latest | [draft-niyikiza-oauth-attenuating-agent-tokens-02 2026-10-27](https://datatracker.ietf.org/doc/draft-niyikiza-oauth-attenuating-agent-tokens/) |
| Radar | **hold**: Maturity decided it: an individual draft with competing alternatives and one small implementation. |
| Moves when | One attenuation draft is adopted by the OAuth or WIMSE working group with a Go implementation. |
| Competes with | [Delegate SD-JWT](identity.md#delegate-sd-jwt), [Mission-Bound Authorization for OAuth 2.0 (plus Mission Resource Access Profile)](identity.md#mission-bound-authz) |
| Complements | [OAuth 2.0 Rich Authorization Requests (RFC 9396)](identity.md#rar), [COAZ-MCP Binding (COAZ Binding for the Model Context Protocol) plus the COAZ Framework](identity.md#coaz-mcp) |
| Builds on | [OAuth 2.0 Rich Authorization Requests (RFC 9396)](identity.md#rar) |
| Superseded by | — |
| Decisions | [0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team](../../../../../apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md), [adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance](../../../../../docs/adr/adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance.md), [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md) |
| Watchlist | T34 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: tool- and argument-scoped Run tokens | Ploeg Run credentials | Ploeg mints an AAT naming the read-only tools and arguments of Ploeg ADR-0078 that a Run may call. | L | A Run cannot use a tool beyond its task even if the gateway allows it. |
| Proposed: offline narrowing for sub-agents | Harness, Ploeg worker | The worker derives a narrower token for a harness sub-agent without calling Ploeg. | L | Least privilege inside a Run. |
| Proposed: attenuated Ask tokens | Ask, unfold-mcp | Scope an Ask to one Work Item and the Ask Allowance of ADR-0031. | M | An Ask cannot read beyond its Work Item. |
| Proposed: Client-scoped tokens for the portal | Client Portal | Attenuate an Agency token down to one Client. | M | Clients get exactly their scope. |
| Proposed: audit chains of attenuation | Action Records | Record the derivation chain in the audit trail of Unfold ADR-0061. | S | Reviewers see how authority narrowed. |

**Shipped adoption:** Tenuo: task-scoped warrants for agents (105 stars, pushed 2026-11-04): https://github.com/tenuo-ai/tenuo

**Open problems:** Individual draft. Competing attenuation drafts: draft-hamr-oauth-agent-delegation-03, draft-asor-wimse-agent-delegation-chain-03: https://datatracker.ietf.org/doc/draft-hamr-oauth-agent-delegation/

**Watched:** ietf-draft `draft-niyikiza-oauth-attenuating-agent-tokens` at 02, github-releases `tenuo-ai/tenuo` at v0.3.5

## Cedar policy language { #cedar }

Not to be confused with: ABAC/RBAC policy language with formal analysis. AWS-originated. cedar-for-agents adds an MCP schema generator.

| | |
| --- | --- |
| Steward | CNCF (Sandbox since 2025-10-08) (foundation) |
| Status | stable |
| Latest | [v4.14.1 2026-11-02](https://github.com/cedar-policy/cedar/releases) |
| Radar | **hold**: Fit decided it: the engine is stable, but Unfold's access questions are relationship-shaped, and no requirement yet needs Cedar's attribute conditions or analysis. |
| Moves when | A policy requirement appears that relations cannot express (for example spend or time conditions per Agency), or OpenFGA is rejected. |
| Competes with | [OpenFGA (Zanzibar-style ReBAC)](identity.md#openfga) |
| Complements | [OpenID AuthZEN Authorization API 1.0](identity.md#authzen-authorization-api) |
| Builds on | — |
| Superseded by | — |
| Decisions | [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md), [0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team](../../../../../apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md), [0031-runs-create-work-items-held-for-approval-within-limits](../../../../../apps/ploeg/docs/adrs/0031-runs-create-work-items-held-for-approval-within-limits.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: policies for which tools a Run may call | Ploeg Run tool access | Express ADR-0078's read-only access groups as Cedar policies with cedar-for-agents' MCP schema generator. | M | Analysable tool policy instead of hand-kept lists. |
| Proposed: spend and approval rules | Ploeg budgets | Express Ploeg ADR-0031's limits on created work as Cedar conditions. Ploeg work upstream. | M | Budget rules become reviewable policy. |
| Proposed: Agency-written guardrails | Tenant | Let a Tenant admin add Cedar rules on top of defaults. | L | Agencies tune policy without code. |
| Proposed: verify policies before release | CI | Use Cedar's analysis to prove no Client policy grants another Client's Work Items. | M | Formal evidence for isolation claims. |
| Proposed: a decision point behind AuthZEN | Ploeg operator API | Cedar as an alternative PDP to OpenFGA once checks are AuthZEN-shaped. | M | Keeps the PDP replaceable. |

**Shipped adoption:** CNCF Sandbox: https://www.cncf.io/projects/cedar/; AgentCore Policy GA (Cedar): https://aws.amazon.com/about-aws/whats-new/2026/03/policy-amazon-bedrock-agentcore-generally-available; cedar-for-agents mcp-tools-sdk-v0.5.0 (2026-10-22): https://github.com/cedar-policy/cedar-for-agents/releases

**Open problems:** Sandbox maturity; no AuthZEN endpoint in Cedar core (not verified)

**Watched:** rss `https://github.com/cedar-policy/cedar/releases.atom`, rss `https://github.com/cedar-policy/cedar-for-agents/releases.atom`

## COAZ-MCP Binding (COAZ Binding for the Model Context Protocol) plus the COAZ Framework { #coaz-mcp }

Not to be confused with: COAZ = "Compatible with OpenID AuthZEN". The MCP tool inputSchema carries `x-authzen-mapping`. It replaces the earlier "AuthZEN MCP profile".

| | |
| --- | --- |
| Steward | OpenID Foundation AuthZEN WG (foundation) |
| Status | draft |
| Latest | [Draft 1 (header date 2026-02-13; last commit 2026-08-25) 2026-08-25](https://openid.github.io/authzen/authzen-coaz-mcp-binding-1_0.html) |
| Radar | **hold**: Maturity decided it: not yet an Implementer's Draft, its status as a profile is disputed, and no client or gateway Unfold uses implements it. |
| Moves when | COAZ becomes an Implementer's Draft and a gateway Ploeg or an Agency uses enforces x-authzen-mapping. |
| Competes with | [Cedar policy language](identity.md#cedar) |
| Complements | [OpenID AuthZEN Authorization API 1.0](identity.md#authzen-authorization-api), [MCP Authorization (core spec, revision 2026-07-28)](identity.md#mcp-authorization), [OpenFGA (Zanzibar-style ReBAC)](identity.md#openfga) |
| Builds on | [OpenID AuthZEN Authorization API 1.0](identity.md#authzen-authorization-api) |
| Superseded by | — |
| Decisions | [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation](../../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md), [0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team](../../../../../apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md) |
| Watchlist | T30, T34 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: annotate unfold-mcp action tools for policy enforcement | unfold-mcp | Add x-authzen-mapping to the inputSchema of unfold_approve_work and similar tools so a gateway can call a PDP before forwarding. | S | An Agency's MCP gateway can enforce its own rules on Unfold's tools. |
| Proposed: the same for ploeg-mcp steer tools | ploeg-mcp | Map Work Item id and action to AuthZEN resource and action in ploeg-mcp's schemas. Ploeg work upstream. | S | Consistent policy at both MCP servers. |
| Proposed: gateway-side checks on tools a Run reaches | Ploeg Run tool access (LiteLLM gateway) | If LiteLLM or another gateway gains COAZ support, enforce per-argument limits on the read-only tools of Ploeg ADR-0078. | M | Narrows what a Run can ask a tool for, not only which tool. |
| Proposed: Client-safe tool listing | Client Portal, claude.ai connector | For the phase-3 Client-facing connector, let the PDP decide per argument which Work Items a Client may query. | M | Clients cannot query outside their own Client scope. |
| Proposed: audit the mapping in Action Records | Action Records | Record the AuthZEN decision id next to each MCP action under ADR-0037. | S | Reviewers can see which policy allowed an action. |

**Shipped adoption:** Announced 2026-07-31: https://openid.net/getting-cozy-with-coaz-securing-apis-and-ai-agents-with-standardized-authorization/; Traefik Hub AuthZEN MCP middleware, early access; COAZ conformance not verified: https://doc.traefik.io/traefik-hub/mcp-gateway/guides/authzen-mcp

**Open problems:** Debate over whether COAZ is a profile at all (2026-03): https://lists.openid.net/pipermail/openid-specs-authzen/2026-March/000542.html; Not yet an Implementer's Draft (per the 2026-07-31 post)

**Watched:** changelog-page `https://github.com/openid/authzen/commits/main/profiles/authzen-coaz-mcp-binding-1_0.md`

## Delegate SD-JWT { #delegate-sd-jwt }

Not to be confused with: Extends RFC 9901 so the Key Binding JWT can itself be an SD-JWT, chaining holder→delegate holder. Not SD-JWT VC.

| | |
| --- | --- |
| Steward | IETF OAuth WG (sdo) |
| Status | draft |
| Latest | [draft-ietf-oauth-delegate-sd-jwt-00 2026-10-30](https://datatracker.ietf.org/doc/draft-ietf-oauth-delegate-sd-jwt/) |
| Radar | **hold**: Maturity decided it: a -00 working-group draft adopted days ago, with one hobby implementation. |
| Moves when | The draft reaches working-group last call and Authentik or a Go library implements it. |
| Competes with | [Attenuating Authorization Tokens for Agentic Delegation Chains (AAT)](identity.md#attenuating-agent-tokens), [W3C Decentralized Identifiers v1.1 and Verifiable Credentials Data Model 2.0](identity.md#w3c-did-vc) |
| Complements | [OAuth 2.0 Demonstrating Proof of Possession (RFC 9449)](identity.md#dpop) |
| Builds on | — |
| Superseded by | — |
| Decisions | [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md), [0057-a-delivery-brief-is-one-evidence-backed-record-rendered-per-audience](../../../../../apps/unfold/docs/adrs/0057-a-delivery-brief-is-one-evidence-backed-record-rendered-per-audience.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: a person delegates a narrowed grant to a Run | Ploeg Run credentials | The person's credential carries a delegate key binding to the Run, disclosing only the repository and Budget claims. | L | Offline-verifiable delegation from person to Run. |
| Proposed: an Agency delegates to a Client Approver | Client Portal | Chain Agency to Client Approver for sign-off rights under ADR-0049. | M | Delegation chains that a receiver can check without calling Unfold. |
| Proposed: selective disclosure in Client-facing briefs | Delivery brief | Sign the Client-safe brief of ADR-0057 so a Client can share parts of it. | M | Clients forward proof without exposing internal detail. |
| Proposed: editor credentials as delegated SD-JWTs | VS Code extension | Derive the editor credential from the person's credential with a delegate binding. | M | Revocation and scope follow the parent credential. |
| Proposed: hand-offs between Roles | Ploeg Shift | Pass a narrowed delegate token from writing Role to reviewing Role within one Shift. | L | Each Role holds only what it needs. |

**Shipped adoption:** WG repo: https://github.com/oauth-wg/oauth-delegate-sd-jwt; TypeScript implementation of the -gco-00 draft: https://github.com/Dtitkaio/delegate-sd-jwt

**Open problems:** Just adopted (-00); replaces draft-gco-oauth-delegate-sd-jwt-00 of 2026-10-23: https://datatracker.ietf.org/doc/draft-gco-oauth-delegate-sd-jwt/

**Watched:** ietf-draft `draft-ietf-oauth-delegate-sd-jwt` at 00, rss `https://github.com/oauth-wg/oauth-delegate-sd-jwt/tags.atom`

## FIDO Alliance Agentic Authentication Technical Working Group { #fido-agentic-auth }

Not to be confused with: A FIDO working group. It has published no specification yet. The Payments TWG (AP2, Mastercard Verifiable Intent inputs) is separate.

| | |
| --- | --- |
| Steward | FIDO Alliance (consortium) |
| Status | draft |
| Latest | [WG formed (no deliverable) 2026-04-28](https://fidoalliance.org/fido-alliance-to-develop-standards-for-trusted-ai-agent-interactions/) |
| Radar | **hold**: Maturity decided it: the working group has published no specification. |
| Moves when | The FIDO Agentic Authentication working group publishes a first draft specification. |
| Competes with | — |
| Complements | [Delegate SD-JWT](identity.md#delegate-sd-jwt) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver](../../../../../docs/adr/adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver.md), [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: passkey-backed approvals | Approval, PWA | When a spec exists, require a FIDO authenticator for spend approvals on the PWA. | M | Phishing-resistant approval of paid work. |
| Proposed: Client Sign-off with a passkey | Client Portal, Client Sign-off | Bind ADR-0049 sign-offs to a FIDO assertion. | M | Strong proof a Client signed off. |
| Proposed: device-bound editor credentials | VS Code extension | Tie the editor credential to a platform authenticator. | M | Credentials cannot be copied. |
| Proposed: agent attestation for Runs | Ploeg Run credentials | Use any FIDO agent attestation for worker identity. | L | Hardware-rooted Run identity. |
| Proposed: step-up at Authentik | Authentik | Use Authentik's WebAuthn stage for step-up before approvals now; revisit when FIDO publishes agent specs. | S | Stronger approvals with tools already available. |

**Shipped adoption:** None. Chairs: CVS Health, Google, OpenAI; vice-chairs: Amazon, Google, Okta (same page)

**Open problems:** No spec titles or dates announced

**Watched:** changelog-page `https://fidoalliance.org/specifications/`

## Identity Assertion JWT Authorization Grant (ID-JAG) { #id-jag }

Not to be confused with: The IdP issues a JWT (via token exchange) that the client presents to a third-party AS (RFC 7523-style). The basis of Okta XAA and MCP Enterprise-Managed Authorization.

| | |
| --- | --- |
| Steward | IETF OAuth WG (sdo) |
| Status | draft |
| Latest | [draft-ietf-oauth-identity-assertion-authz-grant-06 2026-10-31](https://datatracker.ietf.org/doc/draft-ietf-oauth-identity-assertion-authz-grant/) |
| Radar | **assess**: Maturity of Authentik decided it: clients ship it, but the grant is a working-group draft and Authentik's PR is unmerged. |
| Moves when | Authentik releases ID-JAG (PR 26973 or issue 25542), or an Agency on Okta asks. |
| Competes with | — |
| Complements | [MCP Enterprise-Managed Authorization extension](identity.md#mcp-ema-ext), [OAuth Identity and Authorization Chaining Across Domains](identity.md#identity-chaining) |
| Builds on | [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange) |
| Superseded by | — |
| Decisions | [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md), [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md), [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md), [serve-unfold-mcp-over-https](../../../../../docs/how-to/serve-unfold-mcp-over-https.md) |
| Watchlist | T31 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: accept ID-JAG at unfold-mcp | unfold-mcp OAuth, Agency IdP | Watchlist item T31: once Authentik ships PR 26973, configure an authorization server that redeems ID-JAGs for unfold-mcp tokens; or front the resource server with agentgateway or Keycloak. | M | Agency IdPs grant Unfold access centrally to Claude, VS Code and Codex. |
| Proposed: the same for ploeg-mcp | ploeg-mcp OAuth | Redeem ID-JAGs for ploeg-mcp's audience. Ploeg work upstream. | M | One enterprise grant covers both servers. |
| Proposed: Runs reach Agency tools with ID-JAG | Ploeg Run tool access (LiteLLM gateway) | LiteLLM's oauth2_id_jag mode could fetch per-person tokens for the MCP servers a Run reaches. | L | Run tool calls act for the person without stored tokens. |
| Proposed: Unfold requests tracker access via ID-JAG | Tracker connections | For an Agency whose IdP issues ID-JAG, replace stored tracker tokens. | M | No long-lived tracker secret per Tenant. |
| Proposed: test fixture in the e2e suite | unfold-mcp e2e tests | Extend test/e2e/mcp-over-https.e2e.ts with an ID-JAG redemption once Authentik supports it. | S | Regression safety for Agency SSO. |

**Shipped adoption:** LiteLLM MCPAuth `oauth2_id_jag`: https://github.com/BerriAI/litellm/blob/main/litellm/types/mcp.py; Okta XAA (see okta-xaa); Authentik PR #26973 'providers/oauth2: add id-jag' is open and unmerged; issue #25542 (EMA/ID-JAG) is open: https://github.com/goauthentik/authentik/pull/26973

**Open problems:** WG document, not yet in WGLC (state: WG Document)

**Watched:** ietf-draft `draft-ietf-oauth-identity-assertion-authz-grant` at 06

## KYAPay (Know Your Agent + Pay) tokens { #kyapay }

Not to be confused with: Skyfire's JWT agent identity+payment token. "KYA" here is Skyfire's, not a generic KYC-for-agents standard.

| | |
| --- | --- |
| Steward | Skyfire (single-vendor) |
| Status | draft |
| Latest | [draft-skyfire-oauth-kyapay-token-03 2026-11-02](https://datatracker.ietf.org/doc/draft-skyfire-oauth-kyapay-token/) |
| Radar | **hold**: Fit and maturity both decided it: a single-vendor draft tied to a payment rail, while ADR-0050 says billing lines go to the Agency's own accounting tool. |
| Moves when | An Agency asks Runs to buy from paid APIs, or KYAPay is adopted by an IETF working group. |
| Competes with | [Web Bot Auth (HTTP Message Signatures for automated traffic)](web-content.md#web-bot-auth) |
| Complements | [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange) |
| Builds on | [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange) |
| Superseded by | — |
| Decisions | [adr-0006-the-ticket-is-the-billing-unit](../../../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md) |
| Watchlist | T6 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: Runs pay for external APIs | Ploeg Run credentials | A Run presents a KYAPay token to a paid API, with spend bounded by its Budget. | L | Paid data sources without shared accounts. |
| Proposed: Agencies pay Unfold per Ticket | Billing | Accept KYAPay as a payment rail for ADR-0006's per-Ticket billing. | L | Machine-payable billing. |
| Proposed: identify external agents calling Unfold | A2A facade | Accept KYA tokens from agents delegating to the A2A facade (T6). | M | Know which agent is asking. |
| Proposed: settle Asks from an external wallet | Ask Allowance | Top up an Ask Allowance with KYAPay. | M | Pay-as-you-go Asks. |
| Proposed: bot protection on the Client Portal | Client Portal | Use KYA identity to admit verified agents only. | S | Fewer unknown bots. |

**Shipped adoption:** Repos: https://github.com/skyfire-xyz/kyapay , A2A extension https://github.com/skyfire-xyz/kyapay_a2a; Related drafts: draft-skyfire-oauth-kyapay-token-exchange-02, draft-skyfire-oauth-using-kyapay-tokens-02 (2026-11-02), draft-skyfire-kyapayprofile-02; 2025-06-26 launch; Ory, DataDome, Forter partners [secondary]: https://www.businesswire.com/news/home/20250626772489/en

**Open problems:** Individual vendor drafts; payment rail coupling

**Watched:** ietf-draft `draft-skyfire-oauth-kyapay-token` at 03, ietf-draft `draft-skyfire-oauth-kyapay-token-exchange` at 02, rss `https://github.com/skyfire-xyz/kyapay/commits/HEAD.atom`

## MCP Authorization (core spec, revision 2026-07-28) { #mcp-authorization }

Not to be confused with: The core MCP HTTP authorization profile. Separate from the ext-auth extensions.

| | |
| --- | --- |
| Steward | Model Context Protocol project (foundation) |
| Status | stable |
| Latest | [2026-07-28 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) |
| Radar | **adopt**: Maturity and fit both decided it: a stable spec revision that unfold-mcp already implements. |
| Moves when | A new MCP revision changes the authorization profile, or DPoP (SEP-1932) or workload federation (SEP-1933) is accepted. |
| Competes with | — |
| Complements | [OAuth Client ID Metadata Document](identity.md#cimd), [MCP Enterprise-Managed Authorization extension](identity.md#mcp-ema-ext), [COAZ-MCP Binding (COAZ Binding for the Model Context Protocol) plus the COAZ Framework](identity.md#coaz-mcp) |
| Builds on | [The OAuth 2.1 Authorization Framework](identity.md#oauth-2-1), [OAuth Client ID Metadata Document](identity.md#cimd) |
| Superseded by | — |
| Decisions | [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp](../../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md), [adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation](../../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md), [0055-unfold-proves-the-person-to-ploeg-with-a-token-exchanged-from-their-sign-in](../../../../../apps/unfold/docs/adrs/0055-unfold-proves-the-person-to-ploeg-with-a-token-exchanged-from-their-sign-in.md), [serve-unfold-mcp-over-https](../../../../../docs/how-to/serve-unfold-mcp-over-https.md), [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md) |
| Watchlist | T5, T32 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| unfold-mcp follows the 2026-07-28 authorization profile (built) | unfold-mcp OAuth | Built: protected resource metadata, RFC 9207 issuer check, no token passthrough (the token is exchanged under ADR-0055), and both protocol eras on one URL. | S | Works with current MCP clients without a local process. |
| Proposed: close the audience gap with Authentik | unfold-mcp, ploeg-mcp OAuth | UNFOLD_MCP_TOKEN_AUDIENCE=client-id is a transition setting because Authentik ignores the resource parameter; switch to resource audience once Authentik honours RFC 8707. | S | Meets RFC-0011 property P4 fully. |
| Proposed: confirmed write tools on ploeg-mcp over HTTP | ploeg-mcp | Phase 2 item 6: propose, approve and cancel through MRTR elicitation as ADR-0011 decided. Ploeg work upstream. | M | Act on work from chat with a person's confirmation. |
| Proposed: step-up before approvals | unfold-mcp action tools | Use insufficient_scope challenges to require a fresh sign-in before a spend, a trigger listed in ADR-0055. | M | A stale session cannot approve paid work. |
| Proposed: Client-facing connector | Client Portal, claude.ai connector | Phase 3 item 10: a separate resource limited to the Client-safe brief, after tenancy and the Ask Allowance exist. | M | Clients follow their work from their own AI app. |

**Shipped adoption:** LiteLLM supports protocol 2026-07-28: https://github.com/BerriAI/litellm/blob/main/litellm/types/mcp.py; laravel/mcp v1.1.2 (2026-10-26): https://github.com/laravel/mcp/releases

**Open problems:** No token passthrough (servers 'MUST NOT accept or transit any other tokens'), which forces exchange or delegation designs: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization; DPoP and workload federation are still SEPs (#1932, #1933)

**Watched:** changelog-page `https://modelcontextprotocol.io/specification/2026-07-28/changelog`, github-releases `modelcontextprotocol/modelcontextprotocol` at 2026-07-28

## MCP Enterprise-Managed Authorization extension { #mcp-ema-ext }

Not to be confused with: An MCP ext-auth extension applying ID-JAG to MCP. Separate from the core MCP authorization spec.

| | |
| --- | --- |
| Steward | MCP project (Linux Foundation / Agentic AI Foundation, not verified) (foundation) |
| Status | stabilising |
| Latest | [2026-07-28 (published as dated revision 2026-10-23) 2026-10-23](https://github.com/modelcontextprotocol/ext-auth/tree/main/specification/stable/enterprise-managed-authorization/2026-07-28) |
| Radar | **assess**: Maturity of its dependency decided it: the extension is stable, but it rests on the ID-JAG draft that Authentik does not implement. |
| Moves when | Authentik ships ID-JAG, or an Agency asks for enterprise-managed access. |
| Competes with | — |
| Complements | [MCP Authorization (core spec, revision 2026-07-28)](identity.md#mcp-authorization) |
| Builds on | [Identity Assertion JWT Authorization Grant (ID-JAG)](identity.md#id-jag) |
| Superseded by | — |
| Decisions | [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md), [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md), [adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp](../../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md) |
| Watchlist | T31 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: declare EMA support on unfold-mcp | unfold-mcp OAuth | Advertise the extension in server/discover and protected resource metadata once an authorization server can redeem ID-JAGs. | S | Enterprise clients pick the managed path automatically. |
| Proposed: Agency-managed access for Clients | Client Portal, claude.ai connector | The phase-3 Client-facing connector uses EMA so an Agency manages which Clients connect. | M | Agencies control Client AI access. |
| Proposed: EMA for ploeg-mcp | ploeg-mcp | Same declaration for ploeg-mcp. Ploeg work upstream. | S | Consistent enterprise sign-in. |
| Proposed: document EMA in the HTTPS how-to | docs/how-to | Add an Agency-IdP section to serve-unfold-mcp-over-https.md. | S | Self-hosting Agencies can turn it on. |
| Proposed: Tenant mapping from the ID-JAG | Tenant | Map the assertion's issuer to a Tenant so one endpoint serves several Agencies. | M | Hosted multi-Tenant SSO without per-Agency endpoints. |

**Shipped adoption:** Sibling stable ext: oauth-client-credentials (moved to stable 2026-10-23): https://github.com/modelcontextprotocol/ext-auth; Authentik issue #25542: https://github.com/goauthentik/authentik/issues/25542

**Open problems:** Depends on the ID-JAG draft

**Watched:** changelog-page `https://github.com/modelcontextprotocol/ext-auth/commits/main`

## Microsoft Entra Agent ID { #entra-agent-id }

Not to be confused with: Agent identity blueprints and agent identities in Entra. The OBO flow is Microsoft's jwt-bearer+fmi_path, not RFC 8693.

| | |
| --- | --- |
| Steward | Microsoft (single-vendor) |
| Status | stable |
| Latest | [GA (what's-new page ms.date 2026-05-01, updated 2026-08-13) 2026-05-01](https://learn.microsoft.com/en-us/entra/agent-id/whats-new-agent-id) |
| Radar | **hold**: Fit decided it: generally available, but a proprietary OBO shape for agents hosted in Microsoft's ecosystem, while Unfold's Runs live in Ploeg. |
| Moves when | An Agency on Microsoft asks to govern Unfold's agents in Entra, or watchlist item T9 fires for Teams. |
| Competes with | [Okta Cross App Access (XAA)](identity.md#okta-xaa), [Amazon Bedrock AgentCore Identity (plus AgentCore Policy)](identity.md#aws-agentcore-identity) |
| Complements | — |
| Builds on | [The OAuth 2.1 Authorization Framework](identity.md#oauth-2-1) |
| Superseded by | — |
| Decisions | [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md), [0059-the-identity-provider-provisions-and-deprovisions-people-through-scim-and-pushed-shared-signals](../../../../../apps/unfold/docs/adrs/0059-the-identity-provider-provisions-and-deprovisions-people-through-scim-and-pushed-shared-signals.md) |
| Watchlist | T9 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: register Unfold's Teams as Entra agent identities | Agency IdP, Ploeg Teams | For an Agency on Microsoft, create an agent identity per Team so its Runs show in the Agency's Entra. | M | Agencies on Microsoft see Unfold's agents in their own governance tools. |
| Proposed: Entra OBO for Teams and Copilot Studio | Teams agent app | If watchlist item T9 fires, use Entra's jwt-bearer OBO flow for the Teams path. | M | Work followed from Teams acts as the person. |
| Proposed: accept Entra tokens on unfold-mcp | unfold-mcp OAuth | Add Entra as a configured issuer per Tenant; mcp-auth.ts already validates any OIDC issuer. | S | Agencies on Entra sign in without Authentik. |
| Proposed: SCIM from Entra | SCIM endpoint | Test src/identity/scim.ts against Entra's provisioning, as ADR-0059 expects. | S | Agencies on Microsoft provision people automatically. |
| Proposed: blueprint for Unfold as an agent | Agency IdP | Publish an Entra agent blueprint for self-hosting Agencies. | M | Lower setup cost on Microsoft estates. |

**Shipped adoption:** GA page: https://learn.microsoft.com/en-us/entra/agent-id/whats-new-agent-id; OBO flow: client_credentials with fmi_path, then jwt-bearer with requested_token_use=on_behalf_of: https://learn.microsoft.com/en-us/entra/agent-id/agent-on-behalf-of-oauth-flow; Some blueprint wizard features are still Preview (same page)

**Open problems:** Proprietary OBO grant shape; not RFC 8693 (OBO page above)

**Watched:** changelog-page `https://learn.microsoft.com/en-us/entra/agent-id/whats-new-agent-id`

## Mission-Bound Authorization for OAuth 2.0 (plus Mission Resource Access Profile) { #mission-bound-authz }

Not to be confused with: A durable "Mission" object via PAR+RAR binding a task to consented authority. By McGuinness (Okta). Individual draft.

| | |
| --- | --- |
| Steward | individual (K. McGuinness), IETF OAuth WG list (community) |
| Status | draft |
| Latest | [draft-mcguinness-oauth-mission-02 2026-11-02](https://datatracker.ietf.org/doc/draft-mcguinness-oauth-mission/) |
| Radar | **assess**: Fit decided the ring: a Mission maps closely onto a Shift, but maturity caps it at assess as an individual draft with no implementation. |
| Moves when | The OAuth working group adopts the draft, or an authorization server ships it. |
| Competes with | [Attenuating Authorization Tokens for Agentic Delegation Chains (AAT)](identity.md#attenuating-agent-tokens), [AAuth Protocol (Hardt)](identity.md#aauth) |
| Complements | [OAuth 2.0 Rich Authorization Requests (RFC 9396)](identity.md#rar), [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange) |
| Builds on | [OAuth 2.0 Rich Authorization Requests (RFC 9396)](identity.md#rar), [The OAuth 2.1 Authorization Framework](identity.md#oauth-2-1) |
| Superseded by | — |
| Decisions | [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md), [adr-0007-clients-approve-ready-work](../../../../../docs/adr/adr-0007-clients-approve-ready-work.md), [0012-two-level-budgets-authorized-and-settled](../../../../../apps/ploeg/docs/adrs/0012-two-level-budgets-authorized-and-settled.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: a Shift as a Mission | Ploeg Shift, Run credentials | Bind a Shift's consented scope (repository, Budget, Roles) to a Mission object pushed by PAR when the person approves the Work Item. | L | Every Run in a Shift draws authority from one approved object. |
| Proposed: approvals with a stated purpose | unfold-mcp action tools | Map the confirmed effect text of the approval flow onto a Mission description the IdP shows at consent. | M | People consent at the IdP to what a Run will do, not a scope string. |
| Proposed: Mission revocation stops a Shift | Ploeg, Approval | Revoking the Mission at the IdP ends the Shift's credentials. | M | One revocation stops all of a Shift's access. |
| Proposed: Client-approved Missions | Client Portal | A Client approves a Quote as a Mission in the hosted phase, per ADR-0007. | L | Client approval becomes machine-checkable authority. |
| Proposed: Missions for MCP tools a Run reaches | Ploeg Run tool access | Use the Mission Resource Access profile so tool servers check the Mission. | L | Tool calls are bounded by the Work Item's purpose. |

**Shipped adoption:** Companion draft-mcguinness-oauth-mission-resource-access-00 (2026-10-22): https://datatracker.ietf.org/doc/draft-mcguinness-oauth-mission-resource-access/; No shipped AS implementation found

**Open problems:** Individual draft, not WG-adopted (group 1027)

**Watched:** ietf-draft `draft-mcguinness-oauth-mission` at 02, ietf-draft `draft-mcguinness-oauth-mission-resource-access` at 00

## OAuth 2.0 Demonstrating Proof of Possession (RFC 9449) { #dpop }

Not to be confused with: Sender-constrained access tokens via a per-request signed JWT. Distinct from OIDC Key Binding (bound ID tokens), which also uses DPoP proofs.

| | |
| --- | --- |
| Steward | IETF OAuth WG (sdo) |
| Status | stable |
| Latest | [RFC 9449 2023-09-01](https://www.rfc-editor.org/rfc/rfc9449) |
| Radar | **assess**: Maturity of the surrounding stack decided it: the RFC is stable, but Authentik binds only ID tokens and MCP's DPoP profile is still an open SEP. |
| Moves when | An Authentik release issues DPoP-bound access tokens, or MCP SEP-1932 is accepted into the specification. |
| Competes with | — |
| Complements | [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange), [The OAuth 2.1 Authorization Framework](identity.md#oauth-2-1), [Web Bot Auth (HTTP Message Signatures for automated traffic)](web-content.md#web-bot-auth) |
| Builds on | — |
| Superseded by | — |
| Decisions | [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md), [0055-unfold-proves-the-person-to-ploeg-with-a-token-exchanged-from-their-sign-in](../../../../../apps/unfold/docs/adrs/0055-unfold-proves-the-person-to-ploeg-with-a-token-exchanged-from-their-sign-in.md), [0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential](../../../../../apps/unfold/docs/adrs/0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md), [0034-the-harness-gets-placeholders-the-worker-keeps-credentials](../../../../../apps/ploeg/docs/adrs/0034-the-harness-gets-placeholders-the-worker-keeps-credentials.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: sender-constrained access tokens on unfold-mcp | unfold-mcp OAuth | Validate DPoP proofs in mcp-auth.ts and require a cnf.jkt match once Authentik binds access tokens; RFC-0011 property P10 is deferred until then. | M | A leaked MCP access token is useless without the client's key. |
| Proposed: bind exchanged person tokens to Unfold's key | Unfold to Ploeg operator API | ADR-0055 lists Authentik DPoP as a re-evaluation trigger: request DPoP-bound exchanged tokens and have Ploeg check the proof. | M | A person token stolen from a log or proxy cannot be replayed at Ploeg. |
| Proposed: DPoP-bound editor credentials | VS Code extension, editor sign-in | Give the 30-day editor credential of ADR-0037 a key held in SecretStorage and require a proof per request. | M | A copied editor credential stops working on another machine. |
| Proposed: bind a Run's capability to its worker | Ploeg Run credentials | Ploeg's broker issues Run capabilities bound to a key the non-dumpable worker of Ploeg ADR-0034 holds. Ploeg work upstream. | L | A Run capability exfiltrated by a prompt-injected harness cannot be used elsewhere. |
| Proposed: DPoP for Client Portal sessions on phones | Client Portal, PWA | Bind the PWA's tokens to a non-extractable WebCrypto key in the hosted phase. | M | Hardens Client access on shared or lost devices. |

**Shipped adoption:** Authentik 2026.8 binds ID tokens only via OIDC Key Binding (scope bound_key, dpop_jkt). Its docs say: 'Access tokens remain bearer tokens'. https://github.com/goauthentik/authentik/blob/main/website/docs/add-secure-apps/providers/oauth2/key-binding.mdx; Authentik PR; MCP SEP-1932 'DPoP Profile for MCP' is still open with label draft/extension (opened 2025-12-05, updated 2026-11-02): https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1932; WorkOS says the MCP TypeScript SDK added DPoP in 2.1.0 [secondary; the release notes I checked (v2.4.0 etc.) do not mention DPoP]: https://workos.com/blog/mcp-sdk-dpop-and-scope-challenges

**Open problems:** {"DPoP is not part of the MCP core spec; SEP-1932 is open": "https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1932"}; Authentik does not issue DPoP-bound access tokens (see key-binding doc above)

**Watched:** rss `https://www.rfc-editor.org/errata/rfc9449`, changelog-page `https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1932`

## OAuth 2.0 Rich Authorization Requests (RFC 9396) { #rar }

Not to be confused with: The `authorization_details` JSON array that replaces flat scopes. The base layer for Mission-Bound Authorization and AAT.

| | |
| --- | --- |
| Steward | IETF OAuth WG (sdo) |
| Status | stable |
| Latest | [RFC 9396 2023-05-01](https://www.rfc-editor.org/rfc/rfc9396) |
| Radar | **assess**: Maturity of support decided it: a stable RFC with a strong fit for approvals, but no evidence that Authentik accepts authorization_details. |
| Moves when | Authentik (or an Agency IdP Unfold supports) documents authorization_details support, or Mission-Bound Authorization is adopted by the OAuth working group. |
| Competes with | — |
| Complements | [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange), [OpenID AuthZEN Authorization API 1.0](identity.md#authzen-authorization-api) |
| Builds on | [The OAuth 2.1 Authorization Framework](identity.md#oauth-2-1) |
| Superseded by | — |
| Decisions | [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md), [adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver](../../../../../docs/adr/adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver.md), [adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach](../../../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md), [0013-push-rights-are-minted-per-run](../../../../../apps/ploeg/docs/adrs/0013-push-rights-are-minted-per-run.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: a structured approval grant for a spend | unfold-mcp action tools, Approval | Express the confirmed effect (Work Item, action, cost cap) as an authorization_details entry instead of the sealed requestState hash, matching RFC-0011 property P8. | M | An approval names its target and limit in a form any receiver can verify. |
| Proposed: Run credentials scoped by repository and budget | Ploeg Run credentials | Encode a Run's repository, branch and Budget as authorization_details in the Run token Ploeg mints. Ploeg work upstream, alongside Ploeg ADR-0013 and ADR-0016. | L | One credential format states exactly what a Run may touch. |
| Proposed: Client Sign-off scoped to a head commit | Client Portal, Client Sign-off | Carry the Work Item and head commit of ADR-0049 as authorization_details when a Client signs off through an OAuth flow. | M | A Client Sign-off cannot be replayed against a later commit. |
| Proposed: Tenant and Client as authorization details | Tenant | Request tokens for a specific Tenant and Client rather than inferring them from groups, building on ADR-0017. | M | People who belong to several Tenants get a token for exactly one. |
| Proposed: fine-grained grants for linked tracker accounts | Integration Account linking | Where a tracker's authorization server supports RAR, request board-scoped access when a person links an account under ADR-0016. | S | Linked accounts reach only the boards a person chose. |

**Shipped adoption:** Profiled by draft-mcguinness-oauth-mission-02 and draft-niyikiza-oauth-attenuating-agent-tokens-02 (see those records); {"WG follow-on draft-ietf-oauth-rar-metadata-remediation-00 (2026-08-23)": "https://datatracker.ietf.org/doc/draft-ietf-oauth-rar-metadata-remediation/"}; Not verified: commercial AS support (Authlete, Connect2id, Keycloak)

**Open problems:** No standard metadata or error remediation yet (WG draft above); {"Agent intent/lifecycle extensions are individual drafts only": "https://datatracker.ietf.org/doc/draft-chen-oauth-rar-agent-extensions/"}

**Watched:** ietf-draft `draft-ietf-oauth-rar-metadata-remediation` at 00, ietf-draft `draft-chen-oauth-rar-agent-extensions` at 01

## OAuth 2.0 Token Exchange (RFC 8693) { #oauth-token-exchange }

Not to be confused with: Generic STS grant (subject_token/actor_token, `act` claim). Not Microsoft's proprietary OBO (jwt-bearer + requested_token_use=on_behalf_of).

| | |
| --- | --- |
| Steward | IETF OAuth WG (sdo) |
| Status | stable |
| Latest | [RFC 8693 2020-01-01](https://www.rfc-editor.org/rfc/rfc8693) |
| Radar | **adopt**: Maturity and fit both decided it: a stable RFC that Authentik implements, already built into Unfold's person proof and unfold-mcp path. |
| Moves when | Authentik drops or changes its delegation grant, or Ploeg replaces person tokens with a different proof such as ID-JAG or DPoP-bound tokens. |
| Competes with | — |
| Complements | [OAuth 2.0 Demonstrating Proof of Possession (RFC 9449)](identity.md#dpop), [OAuth 2.0 Rich Authorization Requests (RFC 9396)](identity.md#rar), [OpenID AuthZEN Authorization API 1.0](identity.md#authzen-authorization-api), [OAuth Transaction Tokens](identity.md#transaction-tokens) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0055-unfold-proves-the-person-to-ploeg-with-a-token-exchanged-from-their-sign-in](../../../../../apps/unfold/docs/adrs/0055-unfold-proves-the-person-to-ploeg-with-a-token-exchanged-from-their-sign-in.md), [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md), [adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation](../../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md), [adr-0051-an-unowned-work-item-belongs-to-the-default-tenant-and-delegated-credentials-keep-shared-memberships](../../../../../docs/adr/adr-0051-an-unowned-work-item-belongs-to-the-default-tenant-and-delegated-credentials-keep-shared-memberships.md), [0025-management-authority-stays-in-the-control-plane](../../../../../apps/ploeg/docs/adrs/0025-management-authority-stays-in-the-control-plane.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Prove the person to Ploeg on every change (built behind a flag) | Unfold to Ploeg operator API | Built in src/person-proof.ts under ADR-0055 (status proposed): Unfold exchanges the person's kept Authentik access token for a five-minute token with Ploeg's audience and sends it as X-Ploeg-Person-Token. Remaining work is turning ploeg.personTokens on in each deployment. | S | Ploeg records changes as proven rather than asserted and refuses a forged actor header. |
| unfold-mcp over HTTP exchanges the caller's token, never forwards it (built) | unfold-mcp OAuth | Built: mcp-http.ts exchanges the request's access token once per request for the Ploeg audience, as ADR-0055 clause 4 says; the exchange client must federate the unfold-mcp provider. | S | Meets MCP's no-pass-through rule while keeping actions attributable. |
| Proposed: a Run token that names the person and the acting Team and Role | Ploeg Run credentials | RFC-0011 stage: Ploeg mints a Run token with sub set to the person and an act claim for Team and Role, using Authentik's delegation grant once chained act ships in a release. Ploeg work upstream. | L | Every write below Ploeg names both the person and the agent acting for them. |
| Proposed: exchange for the MCP servers a Run reaches through the gateway | Ploeg Run tool access (LiteLLM gateway) | Replace the gateway's static per-server credentials with tokens exchanged per Run with aud set to each server, as the RFC-0011 chain diagram proposes. | L | Removes shared static credentials from tool calls and narrows each to one audience. |
| Proposed: an Agency IdP token exchanged into a Tenant-scoped Unfold token | Agency IdP, Tenant | In the hosted phase, accept an Agency's IdP token at Unfold's token endpoint and exchange it for a token carrying the Tenant, building on ADR-0017's group mapping. | M | An Agency brings its own IdP without Unfold storing its passwords. |

**Shipped adoption:** {"Authentik token exchange grant. Impersonation, plus delegation/OBO with an `act` claim since 2026.8; the actor must be an authentik Actor": "https://github.com/goauthentik/authentik/blob/main/website/docs/add-secure-apps/providers/oauth2/token_exchange.mdx"}; Authentik chained `act` (PR; Authentik token-for-SAML exchange (PR; {"LiteLLM MCPAuth enum has `oauth2_token_exchange`, `oauth2_id_jag`, `oauth_delegate` and `true_passthrough`": "https://github.com/BerriAI/litellm/blob/main/litellm/types/mcp.py"}; Base protocol under ID-JAG, Identity Chaining and Transaction Tokens (see those records)

**Open problems:** In Authentik, OBO actors can only be created through the enterprise Agents API. Expiring actors are reaped, and there is no Terraform resource (issue; {"The RFC leaves exchange policy undefined. An AuthZEN binding is proposed": "https://datatracker.ietf.org/doc/draft-gazitt-oauth-authzen-token-exchange/"}; {"league/oauth2-server (Laravel Passport) has no RFC 8693 grant; the issue has been open since 2022": "https://github.com/thephpleague/oauth2-server/issues/1315"}

**Watched:** rss `https://www.rfc-editor.org/errata/rfc8693`, ietf-draft `draft-gazitt-oauth-authzen-token-exchange` at 01, ietf-draft `draft-zhu-oauth-async-delegation` at 05

## OAuth Client ID Metadata Document { #cimd }

Not to be confused with: A URL as client_id, resolved to a JSON metadata document. It replaces DCR in MCP; it is not RFC 7591.

| | |
| --- | --- |
| Steward | IETF OAuth WG (sdo) |
| Status | draft |
| Latest | [draft-ietf-oauth-client-id-metadata-document-03 2026-11-02](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/) |
| Radar | **trial**: Fit decided it: MCP 2026-07-28 prefers CIMD and unfold-mcp already accepts it, but Authentik's lack of support keeps it from being the default path. |
| Moves when | An Authentik release closes issue 27431 and advertises client_id_metadata_document_supported (move to adopt). |
| Competes with | — |
| Complements | [MCP Authorization (core spec, revision 2026-07-28)](identity.md#mcp-authorization), [The OAuth 2.1 Authorization Framework](identity.md#oauth-2-1) |
| Builds on | [The OAuth 2.1 Authorization Framework](identity.md#oauth-2-1) |
| Superseded by | — |
| Decisions | [adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp](../../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md), [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md), [2026-10-10-ahp-sign-in-spike](../../../../../apps/unfold/docs/research/2026-10-10-ahp-sign-in-spike.md), [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md) |
| Watchlist | T11, T18 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Accept CIMD clients on unfold-mcp (partly built) | unfold-mcp OAuth | Built on the resource side: UNFOLD_MCP_CLIENT_IDS accepts a Client ID Metadata Document URL. It works end to end only once the authorization server fetches those documents, which Authentik does not (issue 27431). | S | Claude Code, VS Code and Cursor connect without a hand-registered client per tool. |
| Proposed: drop per-client registration in Authentik for ploeg-mcp | ploeg-mcp OAuth | When Authentik ships CIMD, remove the pre-registered clients ADR-0011's refinement requires and accept metadata URLs, keeping the audience check. | S | Less manual identity-provider setup per AI client. |
| Proposed: a CIMD for the VS Code extension and plugin | VS Code extension, Agent Plugin | Publish a metadata document at a stable HTTPS URL and name it as the OAuth client id in the plugin's MCP configuration once watchlist item T18 fires. | S | The extension signs in without a stored or pasted client id. |
| Proposed: AHP sign-in through CIMD instead of open registration | AHP sign-in | Item 9 of the AHP sign-in spike: advertise client_id_metadata_document_supported so VS Code uses its own published metadata, once watchlist item T11 fires. | M | VS Code's Agents window signs a person in without a pasted connection token. |
| Proposed: Agency-specific clients without an admin ticket | Agency IdP, Tenant | In the hosted phase, an Agency's own tool identifies itself with a metadata URL that the Tenant admin allowlists, with SSRF limits on the fetch. | M | An Agency adds a new AI client without the owner touching the identity provider. |

**Shipped adoption:** {"The MCP 2026-07-28 spec says servers and clients SHOULD support CIMD and deprecates DCR (it cites draft -00)": "https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization"}; {"LiteLLM MCP OAuth code handles client_id_metadata": "https://github.com/BerriAI/litellm/blob/main/litellm/proxy/mcp_server/oauth_utils.py"}; laravel/mcp PR; {"WorkOS supports CIMD for MCP auth": "https://workos.com/changelog/client-id-metadata-support-for-mcp-auth"}; Keycloak 26.6.0 experimental behind a cimd flag [secondary]: https://medium.com/@peeyush113/client-identity-in-mcp-a-practitioners-guide-to-cimd-and-dcr-71371d5d1a8c

**Open problems:** Authentik has no CIMD: issue #27431 opened 2026-11-02, plus #27564 and #27566 opened 2026-11-04: https://github.com/goauthentik/authentik/issues/27431; {"SSRF and metadata-fetch trust are covered in the MCP security considerations": "https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations"}

**Watched:** ietf-draft `draft-ietf-oauth-client-id-metadata-document` at 03, rss `https://github.com/goauthentik/authentik/releases.atom`

## OAuth Identity and Authorization Chaining Across Domains { #identity-chaining }

Not to be confused with: Token exchange plus a JWT grant to carry identity across trust domains. Okta XAA cites it.

| | |
| --- | --- |
| Steward | IETF OAuth WG (sdo) |
| Status | stabilising |
| Latest | [draft-ietf-oauth-identity-chaining-17 (RFC Editor queue) 2026-08-21](https://datatracker.ietf.org/doc/draft-ietf-oauth-identity-chaining/) |
| Radar | **assess**: Fit decided it: the draft is in the RFC Editor queue, but cross-domain trust only matters once the hosted multi-Tenant offering exists. |
| Moves when | The hosted offering onboards its first Agency with its own IdP, or the RFC is published and Authentik implements the JWT grant side. |
| Competes with | — |
| Complements | [Identity Assertion JWT Authorization Grant (ID-JAG)](identity.md#id-jag), [OAuth Transaction Tokens](identity.md#transaction-tokens) |
| Builds on | [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange) |
| Superseded by | — |
| Decisions | [adr-0009-one-tenant-per-agency](../../../../../docs/adr/adr-0009-one-tenant-per-agency.md), [adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach](../../../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md), [0064-people-add-tracker-connections-from-the-screen-and-unfold-keeps-them-with-an-encrypted-service-account-token](../../../../../apps/unfold/docs/adrs/0064-people-add-tracker-connections-from-the-screen-and-unfold-keeps-them-with-an-encrypted-service-account-token.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: carry a person from an Agency's IdP into hosted Unfold | Agency IdP, Tenant | Token exchange at the Agency's AS plus a JWT grant at Unfold's AS, so hosted Unfold trusts the Agency's domain. | M | Cross-domain sign-in without federating every Agency into one IdP. |
| Proposed: Ploeg reaches a Client's forge in another domain | Ploeg Run credentials | Chain the person's identity to a Client-owned forge's authorization server for per-Run tokens. | L | Runs push to Client repositories without stored Client secrets. |
| Proposed: Unfold to an Agency's tracker | Tracker connections | Replace the stored service-account token of Unfold ADR-0064 with a chained grant. | M | No long-lived tracker token. |
| Proposed: staging to production trust | Deployment | Chain identity between the staging and production clusters' identity providers if they diverge (ADR-0040). | M | One person identity across environments. |
| Proposed: Client Portal for Clients with their own IdP | Client Portal | Accept a Client's IdP identity chained through the Agency. | M | Clients sign in with their own accounts. |

**Shipped adoption:** Referenced by Okta XAA: https://developer.okta.com/docs/concepts/xaa/

**Open problems:** Pending RFC number

**Watched:** ietf-draft `draft-ietf-oauth-identity-chaining` at 17

## OAuth Transaction Tokens { #transaction-tokens }

Not to be confused with: Short-lived intra-trust-domain call-chain JWTs (Txn-Token). Agent extensions exist as individual drafts.

| | |
| --- | --- |
| Steward | IETF OAuth WG (sdo) |
| Status | stabilising |
| Latest | [draft-ietf-oauth-transaction-tokens-11 2026-08-21](https://datatracker.ietf.org/doc/draft-ietf-oauth-transaction-tokens/) |
| Radar | **assess**: Maturity decided it: the draft is near the end of the working group, and it fits RFC-0011's Run token, but nothing is built and Ploeg would own it. |
| Moves when | The draft gets an RFC number, or Ploeg starts the RFC-0011 Run-token stage. |
| Competes with | — |
| Complements | [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange), [SPIFFE / SPIRE (plus OAuth SPIFFE Client Authentication, MCP SEP-1933)](identity.md#spiffe-spire), [OAuth Identity and Authorization Chaining Across Domains](identity.md#identity-chaining) |
| Builds on | [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange) |
| Superseded by | — |
| Decisions | [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md), [0076-run-health-is-observable-by-team-and-role-through-one-correlation-key](../../../../../apps/ploeg/docs/adrs/0076-run-health-is-observable-by-team-and-role-through-one-correlation-key.md), [0062-background-work-runs-through-one-durable-job-queue-in-the-workbench-database](../../../../../apps/unfold/docs/adrs/0062-background-work-runs-through-one-durable-job-queue-in-the-workbench-database.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: the Run token as a Txn-Token | Ploeg Run credentials | RFC-0011's Run token (sub person, act Team and Role, txn Run, aud ploeg, exp deadline) maps onto Txn-Token claims; mint it in that format. Ploeg work upstream. | L | A standard format for the person-and-Run context inside Ploeg. |
| Proposed: carry the Txn-Token from worker to broker | Ploeg worker and broker | The worker presents the Txn-Token with its projected service-account token when asking the broker for forge or model credentials. | M | Every credential request names its Run and person. |
| Proposed: the Txn-Token on Unfold's internal calls | Unfold control service | Pass a Txn-Token from the request edge through the job queue of Unfold ADR-0062 to the Ploeg call. | M | Background jobs keep the person's context. |
| Proposed: audit by transaction id | OCSF audit | Use the txn claim as the correlation key of Ploeg ADR-0076 in audit records. | S | One id follows an action across services. |
| Proposed: Tenant in the transaction context | Tenant | Add the Tenant to the Txn-Token so every internal hop checks it. | S | Tenant scope cannot be lost between services. |

**Shipped adoption:** Tokenetes Transaction Tokens Service: https://github.com/tokenetes/tokenetes; Agent extensions: draft-araut-oauth-transaction-tokens-for-agents-03 (2026-10-31), draft-oauth-transaction-tokens-for-agents-06; Implementation status draft: https://datatracker.ietf.org/doc/draft-agnihotri-oauth-agent-impl-status/

**Open problems:** Waiting for the shepherd write-up (state 43)

**Watched:** ietf-draft `draft-ietf-oauth-transaction-tokens` at 11, ietf-draft `draft-araut-oauth-transaction-tokens-for-agents` at 03

## Okta Cross App Access (XAA) { #okta-xaa }

Not to be confused with: Okta's productisation of ID-JAG, also sold as part of "Agent SSO".

| | |
| --- | --- |
| Steward | Okta (single-vendor) |
| Status | stabilising |
| Latest | [Early Access per help.okta.com; GA 2026-08-24 [secondary] 2026-08-24](https://developer.okta.com/docs/concepts/xaa/) |
| Radar | **assess**: Fit decided it: clients already ship it, but it needs Okta on both sides and no Agency on Okta has asked. |
| Moves when | An Agency on Okta asks for centrally managed access to Unfold from Claude or VS Code. |
| Competes with | [Microsoft Entra Agent ID](identity.md#entra-agent-id), [Amazon Bedrock AgentCore Identity (plus AgentCore Policy)](identity.md#aws-agentcore-identity) |
| Complements | [MCP Enterprise-Managed Authorization extension](identity.md#mcp-ema-ext) |
| Builds on | [Identity Assertion JWT Authorization Grant (ID-JAG)](identity.md#id-jag), [OAuth Identity and Authorization Chaining Across Domains](identity.md#identity-chaining) |
| Superseded by | — |
| Decisions | [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md), [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md), [0064-people-add-tracker-connections-from-the-screen-and-unfold-keeps-them-with-an-encrypted-service-account-token](../../../../../apps/unfold/docs/adrs/0064-people-add-tracker-connections-from-the-screen-and-unfold-keeps-them-with-an-encrypted-service-account-token.md) |
| Watchlist | T31 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: an Okta Agency connects Claude to unfold-mcp centrally | unfold-mcp OAuth, Agency IdP | Accept ID-JAG assertions from an Agency's Okta at Unfold's authorization layer, possibly by fronting the resource server with agentgateway or Keycloak, as watchlist item T31 says. | M | An Agency's people get Unfold in Claude without each one signing in. |
| Proposed: Agency admins grant Unfold per group | Agency IdP, Tenant | Map the Okta XAA policy grant onto ADR-0017's unfold/<tenant>/<role> groups. | S | Access is managed where the Agency manages everything else. |
| Proposed: Unfold as an XAA requesting app to trackers | Tracker connections | For an Okta Agency, obtain Jira or Linear access via XAA instead of the encrypted service-account token of Unfold ADR-0064. | M | No stored long-lived tracker token. |
| Proposed: revocation through Okta | Unfold identity revocation | Combine XAA with the SSF receiver so an Okta policy change ends access. | S | Central off-switch for an Agency. |
| Proposed: document the Okta path for self-hosting Agencies | Self-hosting docs | A how-to beside serve-unfold-mcp-over-https.md for Agencies on Okta. | S | Shortens Agency onboarding. |

**Shipped adoption:** Okta help: Early Access label: https://help.okta.com/oie/en-us/content/topics/apps/apps-cross-app-access.htm; GA as Agent SSO on 2026-08-24 [secondary]: https://workos.com/blog/cross-app-access-converged-in-eight-days; Auth0 XAA resource-app beta: https://auth0.com/docs/xaa-resource-app; Rides on draft-ietf-oauth-identity-assertion-authz-grant and draft-ietf-oauth-identity-chaining (Okta concept page)

**Open problems:** Okta must be the IdP for both apps: https://help.okta.com/oie/en-us/content/topics/apps/apps-cross-app-access.htm

**Watched:** changelog-page `https://help.okta.com/oie/en-us/content/topics/apps/apps-cross-app-access.htm`

## OpenFGA (Zanzibar-style ReBAC) { #openfga }

Not to be confused with: Relationship-based authz engine. Model DSL plus tuples. Ships an experimental AuthZEN endpoint.

| | |
| --- | --- |
| Steward | CNCF (Incubating since 2025-10-28) (foundation) |
| Status | stable |
| Latest | [v1.22.1 2026-10-27](https://github.com/openfga/openfga/releases) |
| Radar | **assess**: Fit decided it: mature and CNCF Incubating, and its relationship model matches the Tenant design, but the rules still fit in code today. |
| Moves when | Team permissions outgrow code, or the hosted offering needs per-Agency custom roles. |
| Competes with | [Cedar policy language](identity.md#cedar) |
| Complements | [OpenID AuthZEN Authorization API 1.0](identity.md#authzen-authorization-api), [COAZ-MCP Binding (COAZ Binding for the Model Context Protocol) plus the COAZ Framework](identity.md#coaz-mcp) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach](../../../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md), [adr-0051-an-unowned-work-item-belongs-to-the-default-tenant-and-delegated-credentials-keep-shared-memberships](../../../../../docs/adr/adr-0051-an-unowned-work-item-belongs-to-the-default-tenant-and-delegated-credentials-keep-shared-memberships.md), [adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant](../../../../../docs/adr/adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant.md), [adr-0048-projects-share-accounts-and-repositories-within-a-tenant-and-a-work-item-has-one-origin](../../../../../docs/adr/adr-0048-projects-share-accounts-and-repositories-within-a-tenant-and-a-work-item-has-one-origin.md), [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: model Tenant, Client, Team and Work Item as relations | Tenant | Write an OpenFGA model for ADR-0017's ownership (Tenant owns Client owns source owns Work Item) and the memberships of ADR-0051, behind an adapter. | L | One relationship model answers who may see what across both apps. |
| Proposed: Ploeg's operator checks through OpenFGA's AuthZEN endpoint | Ploeg operator API | Once Ploeg shapes checks as AuthZEN requests (RFC-0011), point them at OpenFGA. Ploeg work upstream. | M | Policy changes without Ploeg releases. |
| Proposed: Client Approver relations | Client Portal, Client Sign-off | Represent ADR-0049's Approver per Client as a relation. | S | Approver changes are data, not code. |
| Proposed: Knowledge Scope access | Agent knowledge | Check ADR-0034's Tenant, Client, repository and Work Item knowledge scopes through OpenFGA. | M | Knowledge never crosses a Client boundary. |
| Proposed: shared repositories within a Tenant | Projects | Model ADR-0048's shared accounts and repositories as relations. | M | Sharing rules stay consistent as projects grow. |

**Shipped adoption:** CNCF Incubating 2025-10-28: https://www.cncf.io/projects/openfga/; Experimental AuthZEN 1.0 (v1.12.0, 2026-03-13): https://github.com/openfga/openfga/blob/main/CHANGELOG.md; No LiteLLM OpenFGA integration found (code search for 'openfga' returned 0 hits)

**Open problems:** AuthZEN context shadowing (issue #3063): https://github.com/openfga/openfga/issues/3063

**Watched:** github-releases `openfga/openfga` at v1.22.1

## OpenID AuthZEN Authorization API 1.0 { #authzen-authorization-api }

Not to be confused with: PEP→PDP decision API (/access/v1/evaluation(s), /search/*). It is not a policy language; it fronts OpenFGA, Cedar, OPA and others.

| | |
| --- | --- |
| Steward | OpenID Foundation AuthZEN WG (foundation) |
| Status | stable |
| Latest | [1.0 Final 2026-01-12](https://openid.net/specs/authorization-api-1_0.html) |
| Radar | **assess**: Fit decided it: the spec is final, but RFC-0011 judges that Ploeg's rules still fit in code. |
| Moves when | Team permissions outgrow code, or an Agency asks to plug in its own decision point. |
| Competes with | — |
| Complements | [OpenFGA (Zanzibar-style ReBAC)](identity.md#openfga), [Cedar policy language](identity.md#cedar), [COAZ-MCP Binding (COAZ Binding for the Model Context Protocol) plus the COAZ Framework](identity.md#coaz-mcp), [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange) |
| Builds on | — |
| Superseded by | — |
| Decisions | [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md), [adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach](../../../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md), [adr-0051-an-unowned-work-item-belongs-to-the-default-tenant-and-delegated-credentials-keep-shared-memberships](../../../../../docs/adr/adr-0051-an-unowned-work-item-belongs-to-the-default-tenant-and-delegated-credentials-keep-shared-memberships.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: shape Ploeg's object checks as AuthZEN requests | Ploeg operator API | RFC-0011 already asks Ploeg to shape its checks as AuthZEN subject, action, resource requests now, so a move to an external decision point is mechanical. Ploeg work upstream. | M | Keeps the door open to OpenFGA or Cedar without rewriting call sites. |
| Proposed: one decision point for Tenant and Client scoping | Tenant | Route Unfold's tenancy.enforce checks (tenant-client-scoping change, ADR-0017, ADR-0051) through an AuthZEN evaluation call behind a registry adapter, per ADR-0050 rule 1. | L | Unfold and Ploeg answer the same access question the same way. |
| Proposed: an Agency brings its own policy engine | Agency IdP, Tenant | In the hosted or self-hosted Agency phase, let a Tenant point Unfold at its own AuthZEN PDP for extra rules. | M | An Agency reuses the policy engine it already runs, as ADR-0050 asks. |
| Proposed: AuthZEN search to filter lists | Unfold Now and Work Item lists | Use the /search endpoints to list the Work Items a person may see instead of filtering in code. | M | Large Tenants get correct lists without loading every object. |
| Proposed: decide which MCP tools a person sees | unfold-mcp, ploeg-mcp | Ask the PDP which toolsets a person may list, replacing the owner-only steer grant of ADR-0011. | S | Tool visibility follows the same policy as the screen. |

**Shipped adoption:** Final approval: 81 approve, 1 object, 25 abstain (2026-01-12): https://openid.net/authorization-api-1-0-final-specification-approved/; {"OpenFGA has experimental AuthZEN 1.0 since v1.12.0 (2026-03-13), plus a discovery-metadata fix in v1.14.1": "https://github.com/openfga/openfga/blob/main/CHANGELOG.md"}; {"Traefik Hub MCP Gateway AuthZEN middleware (early access)": "https://doc.traefik.io/traefik-hub/mcp-gateway/guides/authzen-mcp"}; {"Gravitee AM AuthZEN engine": "https://documentation.gravitee.io/am/guides/authorization-engines/authzen"}; WG drafts: Access Request & Approval profile, Obligations profile; OAuth issuance work merged 2026-10-13 in openid/authzen: https://github.com/openid/authzen

**Open problems:** OpenFGA AuthZEN context-key overlap (issue; Profiles binding AuthZEN to OAuth issuance and token exchange are individual drafts: https://datatracker.ietf.org/doc/draft-gazitt-oauth-authzen-issuance/

**Watched:** changelog-page `https://openid.net/wg/authzen/specifications/`, github-tags `openid/authzen` at v0.1.22

## OpenID Shared Signals Framework 1.0, CAEP 1.0, RISC 1.0 { #openid-ssf-caep-risc }

Not to be confused with: SET (RFC 8417) push/poll streams for session/credential events. The 1.0 Finals define no agent-specific event types.

| | |
| --- | --- |
| Steward | OpenID Foundation Shared Signals WG (foundation) |
| Status | stable |
| Latest | [1.0 Final (SSF, CAEP, RISC) 2025-09-02](https://openid.net/specs/openid-sharedsignals-framework-1_0-final.html) |
| Radar | **adopt**: Maturity and fit both decided it: 1.0 Finals that Authentik and Okta transmit, already built into Unfold behind a flag. |
| Moves when | An agent- or delegation-specific CAEP event type is published (extend the receiver), or Authentik moves SSF out of the enterprise licence. |
| Competes with | — |
| Complements | [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange), [SCIM extensions for AI agents (draft-wzdk-scim-agent-resource, draft-kushwaha-scim-agent-governance; earlier draft-abbey/draft-scim-agent-extension, draft-wahl-scim-agent-schema)](identity.md#scim-agent-extensions), [Token Status List (TSL)](identity.md#oauth-status-list) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0059-the-identity-provider-provisions-and-deprovisions-people-through-scim-and-pushed-shared-signals](../../../../../apps/unfold/docs/adrs/0059-the-identity-provider-provisions-and-deprovisions-people-through-scim-and-pushed-shared-signals.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md), [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md), [design](../../../../../openspec/changes/scim-and-shared-signals/design.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| End every credential when the IdP revokes a session (built behind a flag) | Unfold identity revocation | Built: src/identity/shared-signals.ts receives pushed SETs at /ssf/events behind identity.shared-signals and calls Revocation in src/identity/revocation.ts, per ADR-0059 (status proposed). | S | Removing a person at the IdP ends browser, editor, Agents-window and kept tokens at once. |
| Proposed: turn on the Authentik transmitter in each deployment | Authentik, live operation | Configure the SSF provider and stream per the provision-and-deprovision-people operations page; Authentik's transmitter is enterprise-licensed, so the deployment needs that licence or another transmitter. | S | Makes the built receiver actually fire. |
| Proposed: an Agency's Okta or Entra feeds its Tenant | Agency IdP, Tenant | Register one transmitter per Tenant and map events to that Tenant's people only. | M | An Agency offboards a developer in its own IdP and Unfold follows. |
| Proposed: transmit Unfold's own events to Ploeg | Unfold to Ploeg | Ploeg could receive session-revoked for a person and stop their pending approvals and in-flight person tokens. Ploeg work upstream. | M | Revocation reaches the execution side, not only the workbench. |
| Proposed: revoke a Client's portal access from the Agency's IdP | Client Portal | Map RISC account-disabled for Client users to Client membership removal in the hosted phase. | S | A Client contact who leaves loses access the same day. |

**Shipped adoption:** Authentik SSF provider (enterprise, transmitter) sends MFA add/remove, logout, session revoked and credential change. Its docs still cite SSF ID3: https://github.com/goauthentik/authentik/blob/main/website/docs/add-secure-apps/providers/ssf/index.mdx; CAEP Final: https://openid.net/specs/openid-caep-1_0-final.html ; RISC Final: https://openid.net/specs/openid-risc-1_0-final.html; Keycloak 26.7 SSF transmitter (experimental) [secondary]: https://startwithidentity.com/reports/agent-identity-standards-map-2026/; Final status, Apple/Okta adoption [secondary]: https://sgnl.ai/2025/09/sgnl-welcomes-the-publication-of-the-final-shared-signals-and-caep-specifications/

**Open problems:** No agent- or delegation-specific event types; agent revocation must map onto session events [secondary]: https://startwithidentity.com/reports/agent-identity-standards-map-2026/; Authentik SSF is enterprise-only and has had conformance fixes through 2026 (e.g. PR #27519, 2026-11-03): https://github.com/goauthentik/authentik/pull/27519

**Watched:** changelog-page `https://openid.net/wg/sharedsignals/`

## SCIM extensions for AI agents (draft-wzdk-scim-agent-resource, draft-kushwaha-scim-agent-governance; earlier draft-abbey/draft-scim-agent-extension, draft-wahl-scim-agent-schema) { #scim-agent-extensions }

Not to be confused with: Agent resource types for RFC 7643/7644 provisioning. No SCIM WG adoption.

| | |
| --- | --- |
| Steward | individual authors (IETF SCIM WG has not adopted) (community) |
| Status | draft |
| Latest | [draft-kushwaha-scim-agent-governance-00 (builds on draft-wzdk-scim-agent-resource-00 2026-07-27](https://datatracker.ietf.org/doc/draft-kushwaha-scim-agent-governance/) |
| Radar | **hold**: Maturity and fit both decided it: individual drafts with no working-group adoption, and Unfold's Runs act for people rather than holding standing agent identities. |
| Moves when | The SCIM working group adopts an agent resource draft and Authentik, Okta or Entra provisions agents over it. |
| Competes with | — |
| Complements | [OpenID Shared Signals Framework 1.0, CAEP 1.0, RISC 1.0](identity.md#openid-ssf-caep-risc), [Microsoft Entra Agent ID](identity.md#entra-agent-id) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0059-the-identity-provider-provisions-and-deprovisions-people-through-scim-and-pushed-shared-signals](../../../../../apps/unfold/docs/adrs/0059-the-identity-provider-provisions-and-deprovisions-people-through-scim-and-pushed-shared-signals.md), [0025-management-authority-stays-in-the-control-plane](../../../../../apps/ploeg/docs/adrs/0025-management-authority-stays-in-the-control-plane.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: provision Teams and Roles as agent resources | SCIM endpoint, Ploeg Teams | Extend src/identity/scim.ts with an Agent resource type so an IdP can create the identity a Team's Runs act under. | M | An Agency could govern agent identities in the same IdP as people. |
| Proposed: deprovision an agent identity | Ploeg Run credentials | Map a SCIM Agent delete to blocking that Team's keys in Ploeg's control plane under Ploeg ADR-0025. | M | An Agency can switch off an agent identity centrally. |
| Proposed: show an Agency who sponsors each agent identity | Tenant admin | Read the governance draft's owner attribute and show it next to each Team. | S | Clear accountability for agent identities. |
| Proposed: export agent identities with a Tenant | Tenant export | Include agent resources in the tenant-export change so an Agency can leave with them, per ADR-0050 rule 6. | S | No lock-in on agent identity data. |
| Proposed: an Entra Agent ID bridge | Agency IdP | If Entra provisions agent identities over SCIM, accept them as Teams' identities. | M | An Agency on Microsoft could reuse its agent registry. |

**Shipped adoption:** None found. draft-abbey-scim-agent-extension-00, draft-scim-agent-extension-00 and draft-wahl-scim-agent-schema-01 are Expired (datatracker state 2)

**Open problems:** The SCIM WG's adopted work is roles/entitlements (draft-ietf-scim-roles-entitlements-01, 2026-04-19, expired), not agents: https://datatracker.ietf.org/doc/draft-ietf-scim-roles-entitlements/; Authentik SCIM discovery/ResourceTypes listing missing (issue #25333): https://github.com/goauthentik/authentik/issues/25333

**Watched:** ietf-draft `draft-wzdk-scim-agent-resource` at 00, ietf-draft `draft-kushwaha-scim-agent-governance` at 00, ietf-draft `draft-ietf-scim-roles-entitlements` at 01

## SPIFFE / SPIRE (plus OAuth SPIFFE Client Authentication, MCP SEP-1933) { #spiffe-spire }

Not to be confused with: Workload identity (X.509-/JWT-SVID). It identifies the agent workload, not the human it acts for.

| | |
| --- | --- |
| Steward | CNCF (SPIFFE/SPIRE graduated projects), IETF OAuth WG for the client-auth draft (foundation) |
| Status | stable |
| Latest | [SPIRE v1.15.5 2026-10-20](https://github.com/spiffe/spire/releases) |
| Radar | **hold**: Fit decided it: SPIRE is mature, but RFC-0011 found projected service-account tokens give the same proof in one cluster for less. |
| Moves when | A second cluster or cell site must trust another cluster's workloads, or Authentik closes issue 26787. |
| Competes with | — |
| Complements | [AI Identity Management System (AIMS)](identity.md#wimse-aims), [OAuth 2.0 Token Exchange (RFC 8693)](identity.md#oauth-token-exchange), [OAuth Transaction Tokens](identity.md#transaction-tokens) |
| Builds on | — |
| Superseded by | — |
| Decisions | [rfc-0011-every-agent-action-names-its-person](../../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md), [adr-0009-one-tenant-per-agency](../../../../../docs/adr/adr-0009-one-tenant-per-agency.md), [adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging](../../../../../docs/adr/adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging.md), [0034-the-harness-gets-placeholders-the-worker-keeps-credentials](../../../../../apps/ploeg/docs/adrs/0034-the-harness-gets-placeholders-the-worker-keeps-credentials.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: worker identity across the staging and production clusters | Ploeg Run credentials | If workers in one cluster must call a Ploeg in another (ADR-0040), issue SVIDs instead of projected service-account tokens. | L | Cross-cluster workload trust without shared secrets. |
| Proposed: SVID client authentication to the IdP | Ploeg broker, Authentik | Use draft-ietf-oauth-spiffe-client-auth so Ploeg's broker authenticates to an authorization server with a JWT-SVID; Authentik has no SPIFFE support (issue 26787). | M | Removes a client secret from Ploeg's configuration. |
| Proposed: per-Tenant egress gateways with workload identity | Tenant isolation | ADR-0009's per-Tenant egress gateway could identify Run pods by SVID before swapping placeholders for credentials. | L | Stronger proof of which Tenant's Run is asking. |
| Proposed: mTLS between Unfold and Ploeg | Unfold to Ploeg operator API | Replace the static Operator Consumer token with X.509-SVID mTLS once a mesh exists. | L | No long-lived consumer token to steal. |
| Proposed: workload federation for MCP | Ploeg Run tool access | If MCP SEP-1933 lands, let the gateway authenticate to MCP servers with workload identity. | M | Tool calls stop depending on static credentials. |

**Shipped adoption:** draft-ietf-oauth-spiffe-client-auth-03 (2026-11-02, WG doc): JWT-/WIT-/X509-SVID as OAuth client credentials: https://datatracker.ietf.org/doc/draft-ietf-oauth-spiffe-client-auth/; Microsoft identity-spiffe ADR: SPIFFE rather than custom mTLS for agents: https://microsoft.github.io/identity-spiffe/decisions/002-spiffe-not-custom-mtls/; MCP SEP-1933 Workload Identity Federation, open draft: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1933

**Open problems:** Authentik has no SPIFFE support (issue #26787, open): https://github.com/goauthentik/authentik/issues/26787; It identifies the workload but not intent or authority [secondary]: https://www.informationweek.com/responsible-ai/spiffe-can-identify-your-ai-agents-but-can-it-control-them-

**Watched:** github-releases `spiffe/spire` at v1.15.5, ietf-draft `draft-ietf-oauth-spiffe-client-auth` at 03, changelog-page `https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1933`

## The OAuth 2.1 Authorization Framework { #oauth-2-1 }

Not to be confused with: A consolidation of OAuth 2.0 plus BCPs (PKCE required, no implicit or password grant).

| | |
| --- | --- |
| Steward | IETF OAuth WG (sdo) |
| Status | stabilising |
| Latest | [draft-ietf-oauth-v2-1-17 2026-10-31](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/) |
| Radar | **adopt**: Fit decided it: still a draft, but MCP 2026-07-28 is built on it and unfold-mcp already implements its profile. |
| Moves when | A change in the draft breaks a client Unfold supports, or MCP moves its base away from OAuth 2.1. |
| Competes with | [AAuth Protocol (Hardt)](identity.md#aauth) |
| Complements | [OAuth Client ID Metadata Document](identity.md#cimd), [OAuth 2.0 Demonstrating Proof of Possession (RFC 9449)](identity.md#dpop), [OAuth 2.0 Rich Authorization Requests (RFC 9396)](identity.md#rar) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp](../../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md), [2026-10-10-ahp-sign-in-spike](../../../../../apps/unfold/docs/research/2026-10-10-ahp-sign-in-spike.md), [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md), [0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential](../../../../../apps/unfold/docs/adrs/0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md), [serve-unfold-mcp-over-https](../../../../../docs/how-to/serve-unfold-mcp-over-https.md) |
| Watchlist | T11 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| unfold-mcp as an OAuth 2.1 resource server (built, off by default) | unfold-mcp OAuth | Built in mcp-auth.ts and mcp-http.ts: PKCE S256, protected resource metadata, exact issuer and audience, 10-minute token limit; documented in serve-unfold-mcp-over-https.md. A public route and security review remain, per phase 2 item 7. | S | Claude Code, VS Code and Cursor sign in once in the browser. |
| Proposed: a public route for claude.ai and ChatGPT | unfold-mcp OAuth | Phase 2 item 7 of the 2026-10-13 dossier: put /mcp and the well-known paths on a public route after a security review; the identity provider must be reachable too. | M | Hosted AI apps reach Unfold. |
| Proposed: OAuth 2.1 for the AHP host | AHP sign-in | Spike items 5 to 9: Unfold as authorization server in front of Authentik for the Agents window, when watchlist item T11 fires. | L | No pasted connection tokens in VS Code. |
| Proposed: OAuth 2.1 profile for editor credentials | VS Code extension | Move ADR-0037's device-code editor sign-in onto standard device authorization with PKCE-protected refresh. | M | Standard, revocable editor credentials. |
| Proposed: Client Portal sign-in | Client Portal | Use the same OAuth 2.1 profile for Client users in the hosted phase. | M | One sign-in model for Agencies and Clients. |

**Shipped adoption:** The MCP 2026-07-28 core is based on it (cites -13): https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization

**Open problems:** Still a WG document after 17 revisions

**Watched:** ietf-draft `draft-ietf-oauth-v2-1` at 17

## Token Status List (TSL) { #oauth-status-list }

Not to be confused with: A compressed bitstring for revoking JWT/CWT/SD-JWT credentials. Not SSF.

| | |
| --- | --- |
| Steward | IETF OAuth WG (sdo) |
| Status | stabilising |
| Latest | [draft-ietf-oauth-status-list-21 (RFC Editor queue) 2026-11-03](https://datatracker.ietf.org/doc/draft-ietf-oauth-status-list/) |
| Radar | **hold**: Fit decided it: the draft is nearly an RFC, but Unfold issues no long-lived JWT credentials that a status list would revoke; its own Revocation function covers its credentials. |
| Moves when | Unfold or Ploeg starts issuing self-contained credentials that receivers verify offline, such as delivery VCs or SD-JWTs. |
| Competes with | — |
| Complements | [Delegate SD-JWT](identity.md#delegate-sd-jwt), [OpenID Shared Signals Framework 1.0, CAEP 1.0, RISC 1.0](identity.md#openid-ssf-caep-risc) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0059-the-identity-provider-provisions-and-deprovisions-people-through-scim-and-pushed-shared-signals](../../../../../apps/unfold/docs/adrs/0059-the-identity-provider-provisions-and-deprovisions-people-through-scim-and-pushed-shared-signals.md), [0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential](../../../../../apps/unfold/docs/adrs/0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: revoke editor credentials by status list | VS Code extension | Publish a status list for editor credentials so offline checks see revocation. | M | Revocation without a lookup per request. |
| Proposed: revoke signed delivery credentials | Delivery, Evidence | If Unfold issues delivery VCs, revoke them via a status list. | M | Withdrawn proofs stop verifying. |
| Proposed: revoke Run tokens in Ploeg | Ploeg Run credentials | A status list for Run tokens checked by the broker. Ploeg work upstream. | M | Fast revocation of a stopped Run. |
| Proposed: revoke Client Sign-offs | Client Sign-off | Revoke a sign-off credential when the head commit changes. | S | Stale sign-offs cannot be reused. |
| Proposed: revoke exported Tenant signatures | Tenant export | Mark signed export bundles revoked after a key rotation. | S | Old exports cannot be passed off as current. |

**Shipped adoption:** Not verified

**Open problems:** Pending RFC number

**Watched:** ietf-draft `draft-ietf-oauth-status-list` at 21

## W3C Decentralized Identifiers v1.1 and Verifiable Credentials Data Model 2.0 { #w3c-did-vc }

Not to be confused with: Decentralised identifiers and credentials. Agent use is via individual drafts (e.g. draft-xu-mcp-agent-did-framework).

| | |
| --- | --- |
| Steward | W3C DID WG / VC WG (sdo) |
| Status | stabilising |
| Latest | [VC DM 2.0 REC 2025-05-15; DID v1.1 CR Snapshot 2026-03-05 2026-03-05](https://www.w3.org/TR/2026/CR-did-1.1-20260305/) |
| Radar | **hold**: Fit decided it: VC 2.0 is a Recommendation, but nothing Unfold integrates with consumes DIDs or VCs, and DID 1.1 is stuck at CR. |
| Moves when | An Agency or Client asks for portable, verifiable delivery proof, or an MCP client people use accepts DID-based agent identity. |
| Competes with | [Delegate SD-JWT](identity.md#delegate-sd-jwt) |
| Complements | [KYAPay (Know Your Agent + Pay) tokens](identity.md#kyapay) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0014-signed-candidates](../../../../../apps/unfold/docs/adrs/0014-signed-candidates.md), [adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver](../../../../../docs/adr/adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: a verifiable credential for a delivered pull request | Delivery, Evidence | Issue a VC stating which Run, Work Item and Acceptance produced a merged change, next to the signed candidates of Unfold ADR-0014. | M | An Agency could hand its Client portable proof of delivery. |
| Proposed: Client Sign-off as a VC | Client Portal, Client Sign-off | Represent the ADR-0049 sign-off as a credential bound to the head commit. | M | The sign-off can be verified outside Unfold. |
| Proposed: an Agency identified by a DID | Agency, Tenant | Let a Tenant publish a did:web for signing exports and briefs. | S | Clients verify which Agency signed a brief. |
| Proposed: Run Card provenance | Run Cards | Attach a VC to a Run Card's delivery facts so collected cards prove their origin. | M | Cards cannot be forged across installs. |
| Proposed: agent identity via DID for MCP | unfold-mcp | Follow draft-xu-mcp-agent-did-framework if it gains a client. | M | Interop with DID-based agent ecosystems. |

**Shipped adoption:** VC DM 2.0 Recommendation: https://www.w3.org/TR/2025/REC-vc-data-model-2.0-20250515/; DID v1.1 has no PR or REC as of 2026-11-04: https://www.w3.org/standards/history/did-1.1/; Agent profiles only individual: draft-xu-mcp-agent-did-framework-00, draft-kushwaha-scim-didvc-binding-01: https://datatracker.ietf.org/doc/draft-xu-mcp-agent-did-framework/

**Open problems:** DID v1.1 is stuck at CR; the DID WG charter ran to 2026-04-28: https://www.w3.org/TR/2026/CR-did-1.1-20260305/

**Watched:** changelog-page `https://www.w3.org/standards/history/did-1.1/`, changelog-page `https://www.w3.org/TR/vc-data-model-2.0/`
