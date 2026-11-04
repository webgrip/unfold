# Discovery, description and registries

Generated from [`standards.yaml`](standards.yaml); see the [catalogue](index.md).

## AGNTCY Agent Directory { #agntcy-dir }

| | |
| --- | --- |
| Steward | AGNTCY (Linux Foundation) (foundation) |
| Status | stabilising |
| Latest | [v1.8.0 2026-10-15](https://github.com/agntcy/dir/releases) |
| Radar | **hold**: Fit and adoption decided it: Unfold has no directory seam, no third-party production adoption was verified, and it competes with the MCP Registry, which is itself on hold. |
| Moves when | An Agency names AGNTCY Dir as where it lists approved agents, or a client people use reads it. |
| Competes with | [MCP Registry](discovery.md#mcp-registry), [Project NANDA Index / AgentFacts](discovery.md#nanda-index) |
| Complements | [AGNTCY Open Agentic Schema Framework](definition.md#agntcy-oasf) |
| Builds on | [AGNTCY Open Agentic Schema Framework](definition.md#agntcy-oasf) |
| Superseded by | — |
| Decisions | [0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills](../../../../../apps/ploeg/docs/adrs/0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: publish Team descriptions as OASF records | Ploeg dispatch | Proposed: export each Team manifest (Ploeg ADR-0110) as an OASF record into a directory. | M | An outside directory could list what an Agency's Teams do. |
| Proposed: an Agency-private directory of approved agents | Agency | Proposed: an Agency runs AGNTCY Dir to list the harnesses and MCP servers it allows, which Ploeg's Team allowlists (Ploeg ADR-0098) could read. | L | One signed list of allowed agents and tools per Agency. |
| Proposed: signed harness provenance | Ploeg dispatch | Proposed: compare Dir's signed records with how Ploeg records harness versions per Run (Ploeg ADR-0097). | S | Prior art for provenance of what ran. |
| Proposed: discovery for the hosted offering | Agency, hosted offering | Proposed: list hosted Unfold in a Dir instance if Agencies use one. | S | Reach to Agencies that browse AGNTCY directories. |
| Proposed: ledger row | Research | Proposed: record the verdict in the protocol ledger so it is not re-surveyed. | S | Saves a future survey. |

**Shipped adoption:** No third-party production adoption verified.

**Open problems:** Not crawled (verify-only scope).

**Watched:** github-releases `agntcy/dir` at v1.8.0

## AI Catalog (formerly AI Card) { #ai-catalog }

Not to be confused with: Repo still named Agent-Card/ai-card; unrelated to A2A AgentCard or draft-aevum-agentcard

| | |
| --- | --- |
| Steward | AI Catalog TSC (Google, Microsoft, Anthropic, PulseMCP); Resend credits an LF 'Agent Card Working Group' [secondary] (consortium) |
| Status | draft |
| Latest | [specVersion 1.0 (editor's draft, untagged) 2026-10-28](https://ai-catalog.io/) |
| Radar | **hold**: Maturity decided it: specVersion 1.0 is an untagged editor's draft whose trust manifests are still changing, and no client reads it. |
| Moves when | AI Catalog tags a release and one client people use fetches /.well-known/ai-catalog.json. |
| Competes with | [AGNTCY Open Agentic Schema Framework](definition.md#agntcy-oasf) |
| Complements | [MCP Server Cards (SEP-2127, ext-server-card)](discovery.md#mcp-server-card), [Agent2Agent Protocol](agent-agent.md#a2a), [DNS-AID (DNS-based Agent Identification and Discovery)](discovery.md#dns-aid), [Agent Name Service (ANS v2)](identity.md#ans) |
| Builds on | — |
| Superseded by | — |
| Decisions | [2026-09-29-mcp-access](../../../../../docs/research/2026-09-29-mcp-access.md), [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md) |
| Watchlist | T33 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: /.well-known/ai-catalog.json on hosted Unfold | unfold-mcp, hosted offering | Proposed: one catalog listing the unfold-mcp and ploeg-mcp Server Cards, the ACP agent package and, if ever built, an A2A Agent Card. | S | One discovery document for every way to reach Unfold. |
| Proposed: a catalog for a self-hosted install | Agency | Proposed: the Helm chart serves the catalog at the Agency's own domain, generated from the enabled servers. | S | A self-hosting Agency publishes its endpoints without writing the file by hand. |
| Proposed: catalog entries in the Tenant export | Tenant export | Proposed: include the Tenant's catalog in the export of system ADR-0050 rule 6, so an Agency that leaves keeps its integration map. | S | Leaving Unfold does not lose the description of what was connected. |
| Proposed: trust manifest for Client-facing listings | Client portal | Proposed, once trust manifests settle: sign the catalog entries of Client-safe tools (system ADR-0031's brief) so a Client's client can check them. | M | Clients can verify that a listing is the Agency's own. |
| Proposed: read Agency catalogs to suggest tools | PWA, Ploeg dispatch | Proposed: when an Agency adds a tracker or tool, read its vendor's catalog to prefill the MCP endpoint for a Team's gateway group. | M | Fewer hand-typed endpoints when wiring tools. |

**Shipped adoption:** MCP Server Card discovery via AI Catalog: https://github.com/modelcontextprotocol/ext-server-card; NANDA Index stores AI Catalog records: https://github.com/projnanda/nanda-index-v2

**Open problems:** No tagged release; trust manifests are still changing (PR #117 2026-10-28): https://github.com/Agent-Card/ai-card

**Watched:** rss `https://github.com/Agent-Card/ai-card/commits/HEAD.atom`, changelog-page `https://ai-catalog.io/`

## DNS-AID (DNS-based Agent Identification and Discovery) { #dns-aid }

Not to be confused with: BANDAID = earlier Brokered Agent Network for DNS AI Discovery draft

| | |
| --- | --- |
| Steward | Linux Foundation (DNS-AID project, launched 2026-05-27) (foundation) |
| Status | draft |
| Latest | [draft-mozleywilliams-dnsop-dnsaid-02; dns-aid-core v0.28.1 (2026-08-09) 2026-05-27](https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/) |
| Radar | **hold**: Maturity and fit decided it: an individual draft awaiting DAWN adoption, and self-hosted Unfold has no public endpoint to announce. |
| Moves when | DAWN adopts the DNS-AID draft and a hosted Unfold endpoint exists. |
| Competes with | [Project NANDA Index / AgentFacts](discovery.md#nanda-index) |
| Complements | [Agent Name Service (ANS v2)](identity.md#ans), [AI Catalog (formerly AI Card)](discovery.md#ai-catalog), [IETF Discovery of Agents With Names WG (DAWN)](discovery.md#ietf-dawn) |
| Builds on | — |
| Superseded by | — |
| Decisions | — |
| Watchlist | T33 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: SVCB records for Unfold endpoints | Agency | Proposed: the Helm chart documents DNS-AID SVCB records for unfold-mcp, ploeg-mcp and the ACP agent at the Agency's domain. | S | Self-hosted discovery with no registry. |
| Proposed: per-Tenant records on hosted Unfold | Agency, hosted offering | Proposed: one record set per Tenant subdomain. | S | Agencies discover their own Tenant under their own name. |
| Proposed: check tool endpoints before a Team adds them | LiteLLM gateway | Proposed: resolve a vendor's DNS-AID record when a Team adds an MCP server to its gateway group (Ploeg ADR-0078). | M | Tool endpoints tied to their vendor's domain. |
| Proposed: reference implementation spike | Research | Proposed: try dns-aid-core against a test zone once DAWN adopts the draft. | S | Evidence before any commitment. |
| Proposed: link records to the AI Catalog | unfold-mcp | Proposed: point the record at /.well-known/ai-catalog.json. | S | One chain from domain to endpoints. |

**Shipped adoption:** LF announcement: https://linuxfoundation.org/press/linux-foundation-announces-dns-aid-project-to-advance-decentralized-ai-agent-discovery; Reference implementation: https://github.com/dns-aid/dns-aid-core; ANS v2 uses DNS-AID SVCB by default: https://datatracker.ietf.org/doc/draft-narajala-courtney-ansv2/

**Open problems:** Input to DAWN; WG adoption pending: https://datatracker.ietf.org/group/dawn/documents/

**Watched:** ietf-draft `draft-mozleywilliams-dnsop-dnsaid` at 02, github-releases `dns-aid/dns-aid-core` at v0.28.1

## IETF Discovery of Agents With Names WG (DAWN) { #ietf-dawn }

Not to be confused with: Unrelated to DAWN in other fields

| | |
| --- | --- |
| Steward | IETF (sdo) |
| Status | draft |
| Latest | [charter-ietf-dawn-01 (WG active) 2026-10-22](https://datatracker.ietf.org/doc/charter-ietf-dawn/) |
| Radar | **hold**: Maturity and fit decided it: no WG draft is adopted and self-hosted Unfold has nothing public to discover. |
| Moves when | DAWN adopts a draft and a hosted Unfold endpoint exists. |
| Competes with | — |
| Complements | [DNS-AID (DNS-based Agent Identification and Discovery)](discovery.md#dns-aid), [Agent Name Service (ANS v2)](identity.md#ans), [AI Catalog (formerly AI Card)](discovery.md#ai-catalog) |
| Builds on | [DNS-AID (DNS-based Agent Identification and Discovery)](discovery.md#dns-aid) |
| Superseded by | — |
| Decisions | — |
| Watchlist | T33 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: name a hosted Tenant's agents in DNS | Agency, hosted offering | Proposed: publish discovery records for each Tenant endpoint once DAWN adopts a draft. | S | Discovery tied to a domain an Agency already controls. |
| Proposed: self-hosted discovery | Agency | Proposed: document the DNS records a self-hosting Agency adds for its Unfold endpoints. | S | No central registry needed for discovery. |
| Proposed: link DNS records to the AI Catalog | unfold-mcp | Proposed: point a DAWN record at /.well-known/ai-catalog.json. | S | One chain from a domain to every Unfold endpoint. |
| Proposed: verify tool endpoints for Runs | LiteLLM gateway | Proposed: check a gateway MCP server's DNS identity before a Team adds it. | M | Harder to spoof a tool a Run calls. |
| Proposed: track IETF 127 outcomes | Research | Proposed: a watch on the WG documents page. | S | Early warning when a draft is adopted. |

**Shipped adoption:** None; agenda for IETF 127 posted 2026-11-03: https://datatracker.ietf.org/doc/agenda-127-dawn/

**Open problems:** No WG drafts adopted yet: https://datatracker.ietf.org/group/dawn/documents/

**Watched:** changelog-page `https://datatracker.ietf.org/group/dawn/documents/`, ietf-draft `draft-mozleywilliams-dnsop-dnsaid` at 02

## MCP Registry { #mcp-registry }

Not to be confused with: Not the GitHub MCP Registry or vendor marketplaces; server.json format

| | |
| --- | --- |
| Steward | MCP project (AAIF) (foundation) |
| Status | stabilising |
| Latest | [v1.8.7 (service); API frozen at v0.1 since 2025-10-24, README still says preview 2026-10-30](https://github.com/modelcontextprotocol/registry/releases) |
| Radar | **hold**: Maturity decided it: the API is still frozen at preview v0.1 with a warning of data resets, and self-hosted Unfold has no public endpoint to list; consistent with the 2026-10-13 'when a hosted offering exists'. |
| Moves when | The registry declares GA with templated remote URLs, or a hosted Unfold endpoint goes live. |
| Competes with | [AGNTCY Agent Directory](discovery.md#agntcy-dir), [Project NANDA Index / AgentFacts](discovery.md#nanda-index) |
| Complements | [MCP Server Cards (SEP-2127, ext-server-card)](discovery.md#mcp-server-card), [AI Catalog (formerly AI Card)](discovery.md#ai-catalog) |
| Builds on | [Model Context Protocol](tool.md#mcp) |
| Superseded by | — |
| Decisions | [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md), [2026-09-29-mcp-access](../../../../../docs/research/2026-09-29-mcp-access.md), [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md), [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md) |
| Watchlist | T33 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: a server.json for self-hosted installs | unfold-mcp, ploeg-mcp | Proposed: publish a server.json per server with a templated remote URL, so a self-hosting Agency installs from the registry and fills in its own host. docs/research/2026-09-29-mcp-access.md names the registry leaving preview as the trigger. | S | An Agency finds and installs the servers without copying configuration from documentation. |
| Proposed: list the hosted Unfold endpoint | Agency, hosted offering | Proposed, after a hosted offering exists: register the public unfold-mcp URL under a verified domain namespace; the registry accepts only public URLs and public images. | S | Clients that browse the registry, and sub-registries built on it, find hosted Unfold. |
| Proposed: an Agency-private sub-registry | Agency | Proposed: document how an Agency that runs its own registry fork lists unfold-mcp, ploeg-mcp and its tracker servers; the public registry does not support private servers. | M | An Agency can whitelist exactly the servers its people may connect to. |
| Proposed: vet gateway tools for Runs against registry metadata | Ploeg dispatch, LiteLLM gateway | Proposed: when a Team adds an MCP server to its gateway access group (Ploeg ADR-0078), record the registry entry and its namespace verification as provenance. | M | A Team knows who published a tool a Run can call. |
| Proposed: plugin bundles reference registry entries | VS Code extension, Claude Code plugin | Proposed: the plugins under apps/unfold/extensions point at registry names instead of embedding a URL, once clients resolve registry names. | S | One listing to update when an endpoint moves. |

**Shipped adoption:** Public registry announced in preview 2025-09-08: https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/

**Open problems:** GA not declared; README still warns of possible breaking changes or data resets: https://github.com/modelcontextprotocol/registry

**Watched:** github-releases `modelcontextprotocol/registry` at v1.8.7

## MCP Server Cards (SEP-2127, ext-server-card) { #mcp-server-card }

Not to be confused with: Distinct from A2A Agent Card and AI Catalog entries

| | |
| --- | --- |
| Steward | MCP Server Card Working Group (AAIF) (foundation) |
| Status | stabilising |
| Latest | [ext-server-card main (no tagged release); SEP-2127 closed 2026-10-06 2026-10-26](https://github.com/modelcontextprotocol/ext-server-card) |
| Radar | **assess**: Maturity and absent consumers decided it: SEP-2127 is merged but nothing consumes cards yet and they are reachable only through a draft AI Catalog; consistent with the 2026-10-30 'wait'. |
| Moves when | A client people use (Claude, VS Code, ChatGPT, Cursor) reads Server Cards, or a hosted Unfold endpoint exists (T33). |
| Competes with | — |
| Complements | [AI Catalog (formerly AI Card)](discovery.md#ai-catalog), [MCP Registry](discovery.md#mcp-registry) |
| Builds on | [Model Context Protocol](tool.md#mcp), [AI Catalog (formerly AI Card)](discovery.md#ai-catalog) |
| Superseded by | — |
| Decisions | [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [2026-09-29-mcp-access](../../../../../docs/research/2026-09-29-mcp-access.md), [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md), [0069-ploeg-names-none-of-its-consumers](../../../../../apps/ploeg/docs/adrs/0069-ploeg-names-none-of-its-consumers.md) |
| Watchlist | T33 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: a Server Card for unfold-mcp | unfold-mcp | Proposed: serve an application/mcp-server-card+json document from the HTTP endpoint in apps/unfold/src/mcp-http.ts, linked from an AI Catalog, listing tools, extensions and the protected-resource metadata. | S | A client can learn what Unfold offers before it signs in. |
| Proposed: a Server Card for ploeg-mcp | ploeg-mcp | Proposed, upstream in Ploeg: the same card from ploeg-mcp's HTTP handler, as docs/research/2026-09-29-mcp-access.md planned once SEP-2127 was accepted; it names no consumer (Ploeg ADR-0069). | S | Every Ploeg install describes itself the same way. |
| Proposed: a card per Tenant on hosted Unfold | Agency, hosted offering | Proposed: each Tenant's endpoint publishes its own card with its authorization server, so an Agency's IdP-driven client config can discover it. | M | An Agency onboards its people by pointing them at one URL. |
| Proposed: show cards in the PWA's connection screen | PWA | Proposed: the settings page that lists /api/mcp-servers renders the card fields, so a person sees what each server can do. | S | People connect the right server for the job without reading docs. |
| Proposed: card check in the release gate | Release, mise run verify | Proposed: a test that the card's tool list matches tools/list, so the card cannot drift from the server. | S | A published card never promises a tool that is gone. |

**Shipped adoption:** Resend publishes an AI Catalog plus a Server Card [secondary vendor changelog]: https://resend.com/changelog/ai-catalog-mcp-server-card.md

**Open problems:** The card is reachable only through an AI Catalog, not a generic well-known URI (maintainer comment 2026-09-24): https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2127; #2963 stdio install manifests in server.json/Server Card: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2963

**Watched:** rss `https://github.com/modelcontextprotocol/ext-server-card/commits/HEAD.atom`, changelog-page `https://modelcontextprotocol.io/community/working-groups/server-card`

## Project NANDA Index / AgentFacts { #nanda-index }

Not to be confused with: NANDA = Networked AI Agents in Decentralized Architecture (MIT origin)

| | |
| --- | --- |
| Steward | Project NANDA (MIT origin, multi-institution) (community) |
| Status | draft |
| Latest | [nanda-index-v2 main (no releases) 2026-11-04](https://github.com/projnanda/nanda-index-v2) |
| Radar | **hold**: Maturity and fit decided it: no releases, a tiny mostly first-party index, open privacy issues, and no discovery seam in Unfold. |
| Moves when | NANDA tags a release and a client people use resolves agents through it. |
| Competes with | [MCP Registry](discovery.md#mcp-registry), [AGNTCY Agent Directory](discovery.md#agntcy-dir), [Agent Name Service (ANS v2)](identity.md#ans) |
| Complements | [AI Catalog (formerly AI Card)](discovery.md#ai-catalog), [Agent2Agent Protocol](agent-agent.md#a2a), [DNS-AID (DNS-based Agent Identification and Discovery)](discovery.md#dns-aid) |
| Builds on | [AI Catalog (formerly AI Card)](discovery.md#ai-catalog) |
| Superseded by | — |
| Decisions | — |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed: list hosted Unfold in the index | Agency, hosted offering | Proposed: an AgentFacts record pointing at the hosted endpoint. | S | Marginal reach; the live index has about 105 entries. |
| Proposed: AgentFacts for Teams | Ploeg dispatch | Proposed: describe Teams as AgentFacts records. | S | Prior art only. |
| Proposed: privacy lesson for Tenant identifiers | Agency | Proposed: note issue #95 (URNs leak email addresses) as a rule for any public identifier Unfold publishes. | S | Avoids leaking people's addresses in discovery records. |
| Proposed: CRDT updates as prior art | Research | Proposed: read the AgentFacts update model for multi-cell state. | S | Design input only. |
| Proposed: ledger row | Research | Proposed: record the verdict in the protocol ledger. | S | Saves a future survey. |

**Shipped adoption:** Live index has 105 entries, 103 in the org.projectnanda namespace (per README): https://github.com/projnanda/nanda-index-v2; Paper 'Beyond DNS' (AgentFacts, CRDT updates), arXiv 2507.14263: https://arxiv.org/abs/2507.14263

**Open problems:** #95 personal entry URNs leak full email addresses: https://github.com/projnanda/nanda-index-v2/issues/95; #67 public pages client-rendered, so agents see 0 entries: https://github.com/projnanda/nanda-index-v2/issues/67; No IETF draft found for NANDA or AgentFacts (datatracker search 2026-11-04).

**Watched:** rss `https://github.com/projnanda/nanda-index-v2/commits/HEAD.atom`, changelog-page `https://github.com/projnanda/nanda-index-v2/commits/main`
