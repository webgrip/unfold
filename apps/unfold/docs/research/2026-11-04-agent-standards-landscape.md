# The agent-standards landscape against Unfold: 160 standards, 30 concepts, and what still needs a standard

Research date: 2026-11-04. The owner asked for deep research into AHP, ACP and A2A, every other standard in the agent space, what is coming, where the field stands conceptually and which gaps still need standards. The owner also asked for five uses per standard, a comparison across the full breadth, and a catalogue that keeps itself current. This dossier follows [the protocol-gap dossier](2026-10-13-protocol-integration-gaps.md) and [the MCP extensions dossier](2026-10-30-mcp-extensions-fit.md), and it is the first one built on [the catalogue](agent-standards/index.md).

**Method.**

1. *Landscape pass.* Ten research agents crawled specs, repositories, the IETF datatracker and foundation pages in twelve layers:
   - tool and agent protocols
   - discovery
   - client and UI
   - definition and LLM APIs
   - identity
   - observability
   - security and supply chain
   - inference infrastructure
   - commerce
   - web and content
   - governance
   - concepts that are not standards yet
2. *Rewrite for Unfold.* Seven agents rewrote every entry against this repository at `origin/development` `dc088eee`: the five uses, the ring, the flip trigger, the decisions it bears on and the watchlist ids it feeds. They read the dossiers above, the architecture, the ADR ledgers and the code.
3. *Spot checks.* Facts the rewrite agents found wrong were re-checked and corrected: Kata and gVisor in Talos, the AG-UI version, and the Server Card SEP status.

Claims resting only on secondary reporting are marked so in the catalogue.

**Landing.** `AGENTS.md` has no protocol-research contract block, so the destinations follow the earlier dossiers:

- this dossier;
- the [catalogue](agent-standards/index.md) and [ADR 0065](../adrs/0065-unfold-tracks-agent-standards-in-a-catalogue-that-renovate-and-a-weekly-survey-keep-current.md), which keeps it current;
- a dated re-survey note on [the protocol ledger](2026-09-11-ecosystem-alternatives.md#appendix-adjacent-components-and-communication-protocols);
- new rows T37 to T42 on [the watchlist](2026-10-13-protocol-integration-gaps.md#watchlist).

## Verdict

**The protocols Unfold bet on are the ones that won. What is left open is trust, and Unfold has built ahead of the standards there.**

1. **The bet holds.** MCP (agent to tool) and A2A (agent to agent) are the two survivors, both under the Agentic AI Foundation, which now hosts ten projects. AHP and ACP own the editor seams, and Unfold speaks all four where a person meets the work:
   - the AHP host;
   - `unfold-mcp` and `ploeg-mcp` over Streamable HTTP;
   - MCP Apps;
   - the ACP agent ([ADR 0058](../adrs/0058-an-acp-editor-uses-unfold-as-the-agent-unfold-which-follows-one-work-item.md), proposed and built).
   A2A stays on the watchlist because no seam fits it, not because it is immature.
2. **The repository is past the 2026-10-13 plan.** The following are built, most of them behind a switch:
   - phase 1 and most of phase 2;
   - the OAuth 2.1 resource server;
   - RFC 8693 person tokens to Ploeg ([ADR 0055](../adrs/0055-unfold-proves-the-person-to-ploeg-with-a-token-exchanged-from-their-sign-in.md));
   - SCIM with Shared Signals ([ADR 0059](../adrs/0059-the-identity-provider-provisions-and-deprovisions-people-through-scim-and-pushed-shared-signals.md));
   - MCP Apps and Tasks.
   Of 160 standards, 23 are **adopt** and 9 are **trial**. The rest are assess (44) or hold (84), almost all on fit, not maturity.
3. **The open gaps are all trust gaps:**
   - delegated authorization across hops;
   - trust in discovery metadata;
   - audit across boundaries;
   - a shared threat model;
   - memory portability;
   - cost attribution between agents.
   Unfold already holds a proprietary answer to several of them:
   - a signed audit chain;
   - per-Run minted credentials;
   - Tenant scoping;
   - budget per Work Item.
   Where a standard lands, Unfold should map onto it rather than invent a second one.

## What changed since 2026-10-13

| Area | Then | Now |
| --- | --- | --- |
| AHP | 1.0.0 just out | 1.0 with per-channel stability; ACP's own multi-client RFD ([#533](https://github.com/agentclientprotocol/agent-client-protocol/pull/533)) would overlap AHP's reason to exist |
| ACP | "phase 3, owner decision" | The agent is built in `apps/unfold/extensions/acp-agent` under proposed ADR 0058; v2 is still a draft (T2) |
| A2A | 1.0, AAIF joined | 1.0.1, v1.1 RC; signed Agent Cards do not interoperate ([#2122](https://github.com/a2aproject/A2A/issues/2122)); the [Ploeg ADR-0007](../../../ploeg/docs/adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md) review due on 2026-10-31 has not been recorded |
| Discovery | Server Card SEP pending | SEP-2127 merged 2026-10-06, extension in Beta; the AI Card became the [AI Catalog](https://ai-catalog.io/); IETF chartered DAWN (DNS discovery) and agentproto (dialog layer under MCP and A2A); DMSC concluded without a WG |
| Identity | Authentik as the gate | Authentik 2026.8 issues RFC 8693 tokens with `act` (Actors are enterprise-only), still lacks CIMD, access-token DPoP and ID-JAG; OAuth 2.1 at -17, Transaction Tokens at WG consensus, Identity Chaining in the RFC Editor queue |
| LLM APIs | — | Open Responses joined AAIF (2026-10-22); LiteLLM serves Responses, Messages and Interactions shapes |
| Gateways | — | Envoy AI Gateway is Agent Router, an AAIF project; [Ploeg ADR-0177](../../../ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md) already names it the second gateway; no MCP-gateway standard exists |

## The layers, compared

The [catalogue's radar](agent-standards/index.md#radar) shows every ring. In short:

| Layer | Settled? | What Unfold adopts | What it watches |
| --- | --- | --- | --- |
| [Tool](agent-standards/tool.md) | Yes | MCP; OpenAPI 3.2 for the HTTP contract ([system ADR-0050](../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md) rule 2) | Skills over MCP (T10), Arazzo |
| [Agent to agent](agent-standards/agent-agent.md) | On paper | — | A2A facade (T6); agentproto |
| [Discovery](agent-standards/discovery.md) | No | — | Server Card and AI Catalog once a hosted endpoint exists (T33) |
| [Client and UI](agent-standards/client-ui.md) | Per niche | AHP, ACP, MCP Apps | AG-UI, A2UI (hold: MCP Apps covers it) |
| [Definition](agent-standards/definition.md) | Packaging yes | AGENTS.md, Agent Skills | devcontainer for Run toolchains (trial) |
| [Identity](agent-standards/identity.md) | No, most active | OAuth 2.1, MCP Authorization, RFC 8693, Shared Signals | CIMD (trial), ID-JAG (T31), Transaction Tokens as the Run token's format |
| [Observability](agent-standards/observability.md) | No | — | OTel GenAI conventions for [Ploeg ADR-0113](../../../ploeg/docs/adrs/0113-a-runs-harness-exports-opentelemetry-to-a-collector-set-per-team-and-role.md) (trial, pin a commit) |
| [Security](agent-standards/security-supply-chain.md) | Partly | OWASP Agentic Top 10, MCP conformance | MITRE ATLAS, CoSAI (trial); SCITT for the audit-chain head |
| [Inference infra](agent-standards/inference-infra.md) | De facto | LiteLLM, Chat Completions, Messages, Kata, gVisor | Agent Router (trial), agent-sandbox CRDs (trial); GPU standards on hold, no GPU runs |
| [Commerce](agent-standards/commerce.md) | No | iDEAL \| Wero, Schema.org for Agencies' Clients | UCP and agent checkout once open to Dutch shoppers |
| [Web](agent-standards/web-content.md) | Partly | llms.txt (move to v2), Content Signals | WebMCP, Web Bot Auth |
| [Governance](agent-standards/governance.md) | Law moves | EU AI Act | ISO/IEC 42001, AIUC-1 for agency procurement |

## Findings that need someone

1. **The A2A review is overdue.** Ploeg ADR-0007's review-by date (2026-10-31) has passed without a dated re-confirmation. The evidence says the same as on 2026-10-13: maturity no longer blocks it, and fit does.
2. **The watchlist reuses T29 to T33.** Rows added on 2026-10-29 and 2026-10-30 each took T29 to T33. The catalogue cites the 2026-10-30 meanings (MCP Events, trust annotations, ID-JAG, Client Credentials, Server Card). The 2026-10-29 rows need new ids.
3. **The EU AI Act has a date.** The Article 50(2) grace period ends on 2026-12-02. The AI-marking contract covers text but not generated images, such as Run Card art and the pull-request card image. Who is provider and who is deployer in the Agency contract needs counsel.
4. **Unfold has no threat model of its own.** Ploeg maps to the OWASP agentic risks; Unfold does not. MCP conformance runs only three scenarios for `unfold-mcp`.
5. **MCP Apps behind an aggregator.** ext-apps #745 and #753 break apps behind a namespacing gateway such as LiteLLM, so an Agency connects `unfold-mcp` directly.
6. **"ACP" is ambiguous in Unfold's own docs.** System ADR-0050 uses it for the Agent Client Protocol. Commerce work should write out "Agentic Commerce Protocol".
7. **Cheap wins:**
   - a `Content-Signal` line in the site's `robots.txt` (the owner picks the `ai-train` value);
   - llms.txt v2;
   - publishing the ACP agent to npm and the ACP Registry.

## What is coming

| When | What |
| --- | --- |
| 2026-11-14 | IETF 127: AUDIT BoF on delegation traceability; agentproto's first WG meeting |
| 2026-12-02 | AI Act Article 50(2) grace period ends |
| Dec 2026 | OAuth 2.1 and Transaction Tokens to the IESG |
| 2027-03 | agentproto protocol draft |
| 2027-12 | DAWN to the IESG |
| undated | MCP: events and webhooks, Agent Identity WG (DPoP, workload identity, ID-JAG); A2A v1.1; ACP v2; A2UI 1.0 |

## The conceptual frontier

The [concepts page](agent-standards/concepts.md) holds 30 ideas that are not standards yet. Unfold already embodies a third of them:

- harness engineering (four harness adapters);
- capability security (per-Run minted credentials);
- durable execution (Postgres claims and leases);
- the gateway as control plane;
- bounded multi-agent topology (a writer, reviewers and a capped fix loop);
- delegated identity and an accountability chain.

The three patterns most worth adopting next, each as a trial:

1. **Evals as contracts.** A golden set of Work Items gates model and harness changes on the release train. It builds on [Ploeg ADR-0135](../../../ploeg/docs/adrs/0135-a-bake-off-runs-one-work-item-on-several-configurations-and-a-shadow-judge-recommends-while-a-person-picks.md)'s bake-off. Effort L.
2. **A tamper-evident flight recorder.** The audit log and transcripts are hash-chained into the Tenant export. Effort M.
3. **Exportable approval receipts.** Signed confirmations become verifiable receipts an Agency hands its Client. Effort M.

The ones most likely to become standards by the end of 2027:

- Skills packaging;
- a Responses-style LLM API;
- OCI model packaging;
- agent identity as workload identity plus a delegation chain;
- payment intent mandates.

The most over-hyped:

- agent micropayment economies;
- guardian agents;
- llms.txt as SEO;
- multi-agent swarms as a default;
- on-chain agent reputation.

## Gaps that need a standard

| Gap | Who works on it | What Unfold has meanwhile |
| --- | --- | --- |
| Delegation across hops: a resource server cannot see whether an intermediary narrowed authority | IETF OAuth and WIMSE, MCP Agent Identity WG | Run token with `sub` = person, `act` = Team/Role, `txn` = Run (RFC-0011) |
| Trust in discovery metadata | AI Catalog trust manifests; DAWN excludes trust | none needed until hosted |
| Audit across boundaries | IETF AUDIT (BoF) | signed audit-chain head (ADR 0061) |
| Shared threat model | MCP Security IG, CoSAI, OWASP | Ploeg's ASI mapping; none for Unfold |
| Async lifecycle | MCP Tasks and Events WG, A2A v1.1 | Tasks built; Events proposed (T29) |
| Memory portability | one W3C community group | portable hand-offs through repository changes |
| Cost attribution between agents | nobody | budget per Work Item; a cost `_meta` convention is T36 |

## New watchlist rows

Added to [the watchlist](2026-10-13-protocol-integration-gaps.md#watchlist) as T37 to T42: OTel GenAI conventions, Transaction Tokens, IETF AUDIT, CIMD in Authentik, Open Responses compliance, and agentic checkout for Dutch shoppers. Every other trigger lives on its catalogue entry as `flip_trigger`, which Renovate and the survey watch.

## Not verified

- The five uses per standard were drafted by agents against this repository's documents and code, and not each reviewed by a person.
- Built-versus-proposed status comes from ADRs, RFCs and the code paths the agents read. No feature was run for this dossier.
- AG-UI and A2UI release dates, and the March 2026 narrowing of the Agentic Commerce Protocol, rest partly on secondary sources.
- The survey workflow has not run on Forgejo yet.
