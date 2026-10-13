# Protocol integration gaps: what AHP, ACP, MCP and their neighbours offer that Unfold and Ploeg do not use yet

Research date: 2026-10-13. The owner asked: "What can AHP, ACP and the like do that we don't use yet? I want complete integrations so our people have access to all tools." "Our people" means the owner now, and agencies' developers and their Clients later ([ADR-0005](../../../../docs/adr/adr-0005-unfold-is-offered-to-agencies.md)).

**Method.** Five research agents ran in parallel:

1. AHP 1.x and VS Code's agent extension APIs. This agent cloned `microsoft/agent-host-protocol` at `cb6ba61`, and read `vscode.d.ts` and the proposed API files on `microsoft/vscode` main.
2. Zed's Agent Client Protocol. This agent cloned `agentclientprotocol/agent-client-protocol` and its registry, and checked npm, PyPI and crates.io.
3. MCP `2026-07-28` with its extensions, the OpenAI Apps SDK (now "plugins"), and Claude Code plugins and hooks.
4. A2A, AG-UI, GitHub Copilot's agent surfaces, Slack and Teams.
5. A read-only seam map of this repository at `3b2b19bb`, with Ploeg pinned at `2f128c8`.

The host's command table, the extension's `package.json`, `ploeg-mcp`, `unfold-mcp` and the ACP adapter were then checked first-hand.

**Landing.** `AGENTS.md` has no protocol-research contract block, so the destinations follow the [1.141 dossier](2026-10-08-vscode-1-141-fit.md):

- this dossier;
- dated updates on the MCP, ACP, A2A and AHP rows of the [protocol ledger](2026-09-11-ecosystem-alternatives.md#appendix-adjacent-components-and-communication-protocols), plus a new row for AG-UI and the client-app stores;
- the [watchlist](#watchlist) below, because no Unfold watchlist file exists. Ploeg's backlog lives in `ploeg-hq/ploeg` ([ADR-0019](../../../../docs/adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md)).

## Verdict

**Adopt more MCP, adopt nothing new besides it now, and stage an ACP agent as the one new protocol worth building.** Unfold already speaks the two protocols that reach the most places, AHP and MCP. The biggest gap is breadth: the MCP servers people already have reach only clients that run a local stdio command. Missing protocols are a smaller gap.

Six facts drive this:

1. **MCP is the one protocol every surface the owner named can reach.** That includes Claude Code, claude.ai, ChatGPT, VS Code Copilot, Cursor, JetBrains AI Assistant, Codex, M365 Copilot and Copilot Studio.
2. **Both MCP servers are behind that reach.**
   - [`unfold-mcp`](../../src/mcp.ts) speaks only the 2025 handshake revisions over stdio, so a client that speaks only `2026-07-28` cannot use it ([ADR-0032](../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md)).
   - [`ploeg-mcp`](../../../ploeg/cmd/ploeg-mcp/main.go) is stdio only. No pushed branch of `ploeg-hq/ploeg` contains a remote HTTP transport on 2026-10-13: there are zero `StreamableHTTP` hits on `origin/development` and on every MCP branch.
   - Neither server has OAuth. claude.ai connectors and ChatGPT plugins need a public HTTPS endpoint with OAuth 2.1.
   - [ADR-0011](../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md)'s write toolsets are not built either.
3. **Three cheap distribution channels are unused.**
   - VS Code has a stable API that lets an extension register MCP servers (`vscode.lm.registerMcpServerDefinitionProvider`), and Unfold's extension does not use it.
   - Claude Code and Codex install *plugins* that bundle MCP servers, skills and hooks. This repository has no `.claude-plugin`.
   - Each would put both MCP servers in front of people without hand-written configuration.
4. **AHP coverage is broad. Its remaining gaps are qualification and sign-in, not methods.** The host handles 26 of AHP 1.0.0's 31 client commands. The gaps are the desktop acceptance pass ([VIK-1922](https://vikunja.webgrip.dev/tasks/1922)) and sign-in, which VS Code itself blocks ([spike](2026-10-10-ahp-sign-in-spike.md)). The five unhandled commands are writes and moves the host refuses by design. Three of the handled ones are stubs (`authenticate`, `fetchTurns`, `disposeChat`).
5. **ACP has changed since September, and it is the only way into JetBrains, Zed, Neovim and Emacs as an *agent session*. MCP only reaches them as tools.**
   - Zed and JetBrains govern it jointly.
   - Schema 1.25.0 shipped on 2026-10-09, and the TypeScript and Rust SDKs reached 1.0 on 2026-06-25.
   - The ACP Agent Registry has been stable in JetBrains IDEs and Zed since 2026-03-09.
   - GitHub Copilot CLI, Cursor, Junie and Codex (through an adapter) all speak it.
   - Unfold speaks it nowhere. Ploeg speaks it only southward, as a client launching harnesses.
   - Its remote transport is still an Active RFD, so an Unfold ACP agent today would be a local stdio bridge to Unfold's API.
6. **A2A, AG-UI, Slack and Teams fit no seam a person uses today.**
   - A2A reached 1.0.0 (2026-03-12) and joined the Agentic AI Foundation (2026-08-17), and its Go SDK is stable. Maturity no longer blocks it. Fit still does: no agent our people use calls another agent to hand over work.
   - AG-UI 1.0 duplicates Unfold's own event stream.
   - Copilot Extensions shut down on 2025-11-10.
   - GitHub's Agent HQ has no public partner API.

## 1. What each protocol is, as of today

| Protocol | Current version | Self-description | Governance | SDK in our languages |
| --- | --- | --- | --- | --- |
| AHP | 1.0.0, 2026-10-02; 1.1.0 in development | "AHP is a coordination layer. ACP is a communication layer." AHP coordinates many clients over shared sessions ([ahp-and-acp.md](https://github.com/microsoft/agent-host-protocol/blob/main/docs/guide/ahp-and-acp.md)) | Microsoft only | Client SDKs in TypeScript, Go and others, all at 1.0.0. No server SDK |
| ACP (Zed's Agent **Client** Protocol) | wire v1 stable, schema 1.25.0 (2026-10-09); v2 is a draft ("don't ship it by default in production") | "similar to how the Language Server Protocol standardized language server integration"; "re-uses MCP types where possible" ([introduction](https://agentclientprotocol.com/get-started/introduction)) | Zed and JetBrains jointly, "working toward transitioning to an independent foundation" ([governance](https://agentclientprotocol.com/community/governance)) | `@agentclientprotocol/sdk` 1.8.0. **No official Go SDK**; Ploeg uses the community `coder/acp-go-sdk` v0.13.5, last pushed 2026-06-05 |
| MCP | `2026-07-28` (Current): stateless, `server/discover`, MRTR, Tasks moved to an extension ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)) | Tools, resources and prompts for model clients | Agentic AI Foundation (Linux Foundation) | Go `go-sdk` v1.8.0 implements `2026-07-28` with MRTR; TypeScript SDK v2.3.1 |
| MCP Apps | extension `io.modelcontextprotocol/ui`, `@modelcontextprotocol/ext-apps` 2.0.3 | A tool's `_meta.ui.resourceUri` points to a `ui://` HTML resource rendered in a sandboxed iframe ([docs](https://apps.extensions.modelcontextprotocol.io)) | AAIF | Wire-level; no Go code needed beyond a resource |
| Skills over MCP | extension `io.modelcontextprotocol/skills`, SEP-2640 Final | `skills/list`, `skills/get`, `skill://<name>/SKILL.md` with digests ([overview](https://modelcontextprotocol.io/extensions/skills/overview)) | AAIF Skills WG | none needed |
| A2A | 1.0.0 (2026-03-12), 1.0.1 (2026-05-28) | Discovery, messages and long-running tasks between agent services | AAIF since 2026-08-17 | `a2a-go/v2` v2.6.0, `@a2a-js/sdk` 1.3.0 |
| AG-UI | `@ag-ui/core` 1.0.2 (2026-10-05) | Event stream from an agent back end to a front end | CopilotKit | Go is community only |

ACP's name collides with IBM's Agent **Communication** Protocol, which was archived on 2025-08-27 and merged into A2A. Everything here about ACP means Zed's.

## 2. Layer map

| Seam: where a person meets the work | What implements it today | What we bet on | Protocols that claim it |
| --- | --- | --- | --- |
| Browser and phone | PWA (`apps/unfold/public/`), server notifications ([ADR-0026](../../../../docs/adr/adr-0026-unfold-is-an-installable-web-app-that-notifies-from-the-server.md)) | own UI | AG-UI (event vocabulary) |
| VS Code session UI (follow, steer, review) | [AHP host](../../src/ahp/host.ts) plus [extension](../../extensions/vscode/package.json) | AHP ([ADR 0012](../adrs/0012-agent-host-protocol-host.md)) | AHP; VS Code `chatSessionsProvider` (proposed) |
| JetBrains, Zed, Neovim and Emacs session UI | **nobody** | none | **ACP** |
| AI chat clients (Claude, ChatGPT, Copilot Chat, Cursor) asking about work | `unfold-mcp` and `ploeg-mcp` over stdio | MCP ([ADR-0011](../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [ADR-0032](../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md)) | MCP, MCP Apps, Skills over MCP |
| Hosted AI apps (claude.ai, ChatGPT, M365 Copilot) | **nobody**: no remote endpoint, no OAuth | MCP phase 3 of ADR-0011, not built | MCP with OAuth 2.1; ChatGPT plugins; claude.ai connectors |
| Packaging for agent CLIs (Claude Code, Codex, opencode) | **nobody**: skills live only in this repository's `.claude/` | none | Claude Code plugins and marketplaces; Codex plugins |
| Chat workplaces (Slack, Teams) | **nobody** | none | Slack Agents API; Teams custom engine agents; Copilot Studio via A2A or MCP |
| Another organisation's agent delegating work | **nobody** | A2A watchlist ([Ploeg ADR-0007](../../../ploeg/docs/adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md)) | A2A |
| Ploeg launching a harness | [ACP adapter](../../../ploeg/pkg/harness/adapters/acp/acp.go), OpenHands, `claude -p` | ACP v1 (homelab-cluster ADR-0051) | ACP |
| Tools inside a Run | the LiteLLM gateway MCP only ([Ploeg ADR-0078](../../../ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md)) | gateway only | MCP |

Five seams have no implementation. Three of them, the JetBrains-family editors, hosted AI apps and agent-CLI packaging, are where "people can use all the tools from wherever they work" is concretely false today.

## 3. Capability matrix

Effort: **S** is up to three days, **M** is one to three weeks, **L** is more than three weeks. "Have" cites the file that implements it.

### AHP (VS Code Agents window)

| Feature | What it gives people | Have? | Gap | Effort | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Sessions, chats, turns, tool calls, subagents, questions | Follow and steer a crew in VS Code's own UI | Yes: [`host.ts`](../../src/ahp/host.ts) (26 of 31 commands), [`runs.ts`](../../src/ahp/runs.ts), [`questions.ts`](../../src/ahp/questions.ts) | Never rendered in a desktop VS Code ([VIK-1922](https://vikunja.webgrip.dev/tasks/1922)); `fetchTurns` and `disposeChat` are stubs | S | Do the desktop pass first. Nothing below counts as "supported" until it renders |
| Ploeg Work Items as sessions | Every Work Item in one list, with Stop, Try Again and notes | Yes: [`work-items.ts`](../../src/ahp/work-items.ts), [`work-item-commands.ts`](../../src/ahp/work-item-commands.ts) | ADR 0012's 2026-10-11 paragraph still says "Not yet implemented" | S | Corrected in a dated note on ADR 0012 and the ledger row |
| Changesets and review | Accept, Request changes or Reject from the Changes view | Yes: [`review.ts`](../../src/ahp/review.ts) | Not qualified on desktop | — | Covered by VIK-1922 |
| `authenticate`, `protectedResources`, `auth/required` | Sign in without a pasted token | No: `authenticate` returns `{}`, `protectedResources: []` | VS Code 1.141 and 1.142 only resolve GitHub and Microsoft authorization servers ([spike](2026-10-10-ahp-sign-in-spike.md)) | blocked upstream | Keep the token; file the upstream issue the spike owes |
| `chat/backgroundWorkSet`, `session/mcpServerBackgroundRequested` (new in 1.0.0) | Background shells and subagents shown as running | No | Not projected | S | Project long Run steps as background work when 1.142 renders it |
| MCP Apps over the `mcp://` side channel; `ClientCapabilities.mcpApps` | An Unfold widget inside the Agents window | No | Would need an MCP App first (see below) | M | After an MCP App exists |
| OTLP telemetry channel | Host traces in the client | No | No value for people | — | Never needed |
| `resourceWrite`, `resourceCopy`, `resourceDelete`, `resourceMove`, `resourceMkdir`, terminal input, `chat/truncated`, automation create | Edit the sandbox and shell in | Refused by design ([ADR 0012](../adrs/0012-agent-host-protocol-host.md)) | — | — | Never. The candidate contract forbids it |

### VS Code extension APIs

| Feature | What it gives people | Have? | Gap | Effort | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `vscode.lm.registerMcpServerDefinitionProvider` (stable) | `unfold-mcp` and `ploeg-mcp` appear in Copilot Chat and agent mode with the person's editor credential and no `mcp.json` editing | **No**: zero hits in [`extensions/vscode`](../../extensions/vscode/package.json) | Credential delivery without plaintext `env` ([VIK-1653](https://vikunja.webgrip.dev/tasks/1653)) | S | **Phase 1.** The provider resolves the token from SecretStorage at start, so nothing is written to settings |
| `vscode.lm.registerTool` (stable) | Unfold tools without MCP | No | Duplicates MCP | — | Skip; the MCP provider covers it |
| `vscode.chat.createChatParticipant` (stable) | `@unfold` in Copilot Chat | No | Overlaps the Agents window and needs Copilot | S | Skip unless people ask for `@unfold` in the side panel |
| `chatSessionsProvider`, `chatPromptFiles`, `chatHooks`, `chatContextProvider` (proposed) | Contributed agent sessions, skills and hooks from an extension | No | Proposed APIs cannot ship on the Marketplace or Open VSX | — | Never while proposed; AHP already covers sessions |
| `.github/agents/*.agent.md`, `SKILL.md`, `AGENTS.md` (file-based) | An "Unfold" custom agent in Copilot, preconfigured with the MCP tools | No | — | S | Ship with the plugin bundle (phase 1) |

### ACP (Zed's Agent Client Protocol)

| Feature | What it gives people | Have? | Gap | Effort | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Ploeg as ACP client (south) | One adapter for opencode, Goose, Qwen Code and OpenHands | Yes: [`acp.go`](../../../ploeg/pkg/harness/adapters/acp/acp.go), [`profiles.go`](../../../ploeg/pkg/harness/adapters/acp/profiles.go) | The Go SDK is community-maintained and four months behind schema 1.25 (session close, elicitation and logout are newer); Copilot CLI, Cursor and Codex (`codex-acp` 2.2.2) are not profiles | S per profile | Keep v1. Add a profile only when a harness is qualified |
| An Unfold ACP agent (north): `session/new`, `session/prompt`, `session/update`, `session/request_permission`, `session/list`, `session/resume`, `elicitation/create` | Start, follow, steer and answer a Work Item session from PhpStorm, IntelliJ, Zed, Neovim (CodeCompanion, avante) or Emacs (agent-shell) | **No**: zero hits in `apps/unfold/src` and `extensions` | No bridge process; ACP assumes a local working directory and a single client | M | **Phase 3, owner decision.** A stdio `unfold-acp` alongside `unfold-mcp`, reading Unfold's HTTP API with the editor credential. Listed in the ACP Registry with Terminal Auth (`unfold-acp login`) |
| ACP Agent Registry | One-click install in JetBrains and Zed | No | Registry listing needs valid `authMethods` and an npm, PyPI or GitHub-release binary | S after the agent | With the agent |
| Streamable HTTP and WebSocket transport (Active RFD) | No local process | No | Not in any SDK; only a Goose reference implementation | — | Watchlist (trigger T3) |
| ACP v2 | Upserts, `state_update`, no client fs or terminal | No | Draft | — | Watchlist. v2 drops client-side files, which suits a remote agent like ours |

### MCP

| Feature | What it gives people | Have? | Gap | Effort | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Read tools | "What waits for me and why" from any MCP client | Yes: 5 `ploeg_*` tools in [`tools.go`](../../../ploeg/cmd/ploeg-mcp/tools.go); 6 `unfold_*` tools in [`mcp.ts`](../../src/mcp.ts) | — | — | Keep |
| `2026-07-28` in `unfold-mcp` (`server/discover`, version in each request's `_meta`, `resultType`) | Works with clients that dropped the handshake | No: [`mcp.ts:5`](../../src/mcp.ts) lists 2025 revisions only | Hand-written protocol | S | **Phase 1.** Serve both eras, as ADR-0011 requires for `ploeg-mcp` |
| Streamable HTTP | One URL instead of a local command; usable from Cursor, JetBrains and remote machines | No, in either server | `ploeg-mcp` uses `StdioTransport` only; no pushed branch adds HTTP | S for Ploeg (`StreamableHTTPOptions{Stateless: true}`); M for Unfold (hand-written) | **Phase 2**, on the internal gateway with a bearer (ADR-0011 identity phase 2) |
| OAuth 2.1 resource server (RFC 9728 PRM, PKCE, RFC 8707 audience, CIMD) | claude.ai custom connectors, ChatGPT developer mode and plugins, M365 Copilot | No | Needs a public route, Authentik as authorization server, and a security review | M | **Phase 2, owner decision.** One resource shared with the AHP sign-in plan (spike item 9) |
| Write tools with confirmation (`*_propose_work`, `*_approve_work`, `*_cancel_work`) | Propose and approve work from chat; proposals never dispatch | No: only `unfold_ask` writes, confirmed through `elicitation/create` | Under `2026-07-28`, confirmation comes back through MRTR (`InputRequiredResult` with `requestState`); go-sdk v1.8.0 has MRTR | M | **Phase 2**, exactly as ADR-0011 decided |
| Elicitation | The person confirms spend or approval in their client | Partly: `unfold_ask` only ([`mcp.ts`](../../src/mcp.ts)) | The 2025-style server request; `2026-07-28` uses MRTR | S | With the write tools |
| MCP Apps (`io.modelcontextprotocol/ui`) | The Work Item page or Run card rendered inline in Claude, ChatGPT, VS Code Copilot, M365 Copilot, Cursor and Goose | No: zero `ui://` hits | A `ui://` resource plus a `_meta.ui.resourceUri` on `*_get_work`; strict CSP; no npm dependency needed server-side | M | **Phase 2.** One read-only Work Item view; actions call the same confirmed tools |
| Prompts | `/unfold-what-waits`-style slash commands in Claude Code, VS Code and Cursor | No | — | S | Phase 2, two or three prompts |
| Resources | Attach a Work Item as context | No | — | S | Optional; tools cover it |
| Server instructions | The client knows how to read `untrusted` | Yes in both ([`tools.go`](../../../ploeg/cmd/ploeg-mcp/tools.go), [`mcp.ts`](../../src/mcp.ts)) | Where instructions live without `initialize` was not verified | — | Re-check when `unfold-mcp` adds `server/discover` |
| Tasks extension | Long work as an MCP task | No, excluded by ADR-0011 | No client in the support matrix implements it | — | Keep excluded (trigger T5) |
| Skills over MCP | Skills delivered by the server | No | Clients: ChatGPT (partial), fast-agent, Inspector, mcpc | S | Watchlist; ship skills in plugins instead |
| Server Card, MCP Registry | Discovery of a public server | No | The registry is still "preview" (`/v0.1/servers`) | S | When a hosted offering exists |
| Enterprise-managed authorization (ID-JAG) | An agency's IdP grants access centrally | No | No mainstream client | — | Watchlist for agencies |

### Packaging and client stores

| Feature | What it gives people | Have? | Gap | Effort | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Claude Code plugin and marketplace (`.claude-plugin/plugin.json`, `marketplace.json`) | One install of `unfold-mcp`, `ploeg-mcp`, the `investigate-session` and `unfold:review` skills and an operate-session skill, with the token prompted as `userConfig` `sensitive` (kept in the keychain) | **No** `.claude-plugin` in the repository | The skills exist in [`.claude/skills`](../../../../.claude/skills/investigate-session/SKILL.md) and [`skills/`](../../skills/operate-agent-session/SKILL.md) | S | **Phase 1** |
| Codex and opencode plugins | The same for Codex and opencode users | No | Codex's manifest path comes from a secondary source only | S | Phase 1, after the Claude plugin |
| claude.ai custom connector, ChatGPT plugin | Owner and Clients in hosted apps | No | Needs remote MCP plus OAuth | S after phase 2 | Phase 3. A Client-facing listing uses only the Client-safe brief of [ADR-0031](../../../../docs/adr/adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance.md) |
| MCPB desktop bundle | Claude Desktop one-click | No | — | S | Optional; the plugin can reference one |

### A2A, AG-UI, Copilot, Slack and Teams

| Feature | What it gives people | Have? | Gap | Effort | Recommendation |
| --- | --- | --- | --- | --- | --- |
| A2A 1.0 server facade (Agent Card, `SendMessage` → proposal, `GetTask` → Work Item, `INPUT_REQUIRED` → needs a person) | Gemini Enterprise and Copilot Studio users delegate to Unfold | No ([Ploeg ADR-0007](../../../ploeg/docs/adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md)) | No counterpart agent among our people; Gemini Enterprise documents A2A v0.3 only | M | Watchlist (T6). Re-confirm ADR-0007 at its 2026-10-31 review: maturity is no longer the blocker, fit is |
| AG-UI 1.0 | A standard run-event stream for web front ends and CopilotKit's Slack and Teams channels | No | Unfold's SSE events already serve its own UI | M | Reject as a dependency; reconsider only with CopilotKit Channels (T7) |
| Copilot Extensions (GitHub App) | — | — | Shut down 2025-11-10 | — | Never |
| GitHub Agent HQ third-party agent | Unfold as a coding agent in GitHub's Agents tab | No | No public partner API (only Claude and Codex, onboarded by GitHub); Forgejo is the forge | — | Watchlist (T8) |
| Copilot CLI as a Ploeg harness (ACP) | Copilot's model plans inside Runs | No profile | Copilot's own billing sits outside LiteLLM; only a BYOK route through the gateway would let Ploeg budget it | S | Only through the gateway, under [ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md) budgets |
| Slack agent app (`agents.sessions.*`, `chat.startStream` with plan and task cards) | Runs visible and Asks answerable in Slack | No | A Slack app per workspace; some features need a paid plan | M | Watchlist (T9) |
| Teams (custom engine agent, or Copilot Studio over A2A or MCP) | The same in Teams | No | Azure Bot Service plus an Entra app; or remote MCP | M | After remote MCP: Copilot Studio can add an MCP server as a tool, so phase 2 covers the cheap path |

## 4. Component-by-component fit

**Unfold's AHP host** competes with nothing here. ACP and AHP sit at different layers. AHP's own guide says a host can speak AHP to clients and ACP to agents, and calls AHP "a mutex over ACP". VS Code has no ACP client of its own (community extensions only), so AHP stays the VS Code path and ACP would be the path for every other editor.

**`unfold-mcp` and `ploeg-mcp`** are complementary with everything else. They are the substrate for VS Code's MCP provider, the Claude and Codex plugins, MCP Apps, claude.ai, ChatGPT and Copilot Studio. Each new surface in this dossier except the ACP agent is a distribution of these two servers, not a new server. That keeps [ADR-0011](../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md)'s rules in force everywhere: read first, proposals never dispatch, approval needs a person, Runs get neither server.

**Ploeg's ACP adapter** is orthogonal to the north-facing question. It stays on v1 with the community Go SDK. Absence check: ACP has **no official Go SDK**, and `coder/acp-go-sdk` was last released on 2026-06-02.

**The VS Code extension** ([ADR 0007](../adrs/0007-thin-editor-client.md)) is the cheapest place to close a gap. It already holds the person's editor credential, and the stable MCP provider API lets it hand that credential to `unfold-mcp` at start-up without writing plaintext into `settings.json`. That is the constraint VIK-1653 recorded.

**Absences confirmed by the sweep:**

- AHP's docs never mention ACP's registry or stdio.
- ACP's docs mention AHP zero times and A2A only in passing.
- VS Code has no ACP API proposal.
- Forgejo has no official agent or AI integration (community MCP servers only).
- GitHub documents no onboarding path for third-party coding agents.
- No MCP client in the extension support matrix implements Tasks.
- Claude Code is not listed in that matrix for any extension.

## 5. The one honest scenario for a new protocol: an Unfold ACP agent

An agency's developers mostly work in PhpStorm. MCP gives them Unfold's *tools* in JetBrains AI Assistant: they can ask what waits. It does not give them the *session*: following a crew's turns, answering its question, accepting the candidate. In VS Code, AHP gives exactly that. In JetBrains, Zed, Neovim and Emacs, only ACP does. JetBrains has backed ACP since October 2025 and ships the ACP Registry in its IDEs.

**The tension.** ACP models a local agent working in the client's directory, with the client lending its file system and terminal. ACP v1 makes these client capabilities optional, so an agent that never asks for them is conforming, and v2 removes them. An Unfold ACP agent would be a bridge:

- `session/new` creates a Work Item session through Unfold's API, under [ADR-0023](../adrs/0023-unfold-submits-work-to-ploeg-and-never-executes-it.md)'s rule that Unfold submits and never executes.
- `session/prompt` becomes an instruction for the next Round, or an Ask, with the same `/ask` and `/steer` split the AHP host uses.
- `session/update` streams the projection the AHP host already builds.
- `session/request_permission` and `elicitation/create` carry questions and approvals.

The shape that survives: one stdio process like `unfold-mcp`, hand-written or built on `@agentclientprotocol/sdk` as a dev-only dependency bundled at build time, so [ADR 0002](../adrs/0002-native-node-and-single-writer-storage.md) holds. It reuses `src/ahp`'s projection rather than a second one. It asks for no client `fs` or `terminal` capability and applies no edits to the developer's checkout. Review stays in Unfold or on the forge until ACP grows a changeset concept.

## 6. Phased plan

**Phase 1: reach every client the owner uses today (S each, about two weeks in total).**

1. `unfold-mcp` speaks `2026-07-28` beside the 2025 revisions: `server/discover`, the version in each request's `_meta`, and `resultType` on results.
2. The VS Code extension registers `unfold-mcp` and `ploeg-mcp` through `registerMcpServerDefinitionProvider`, with the token from SecretStorage (closes VIK-1653's constraint).
3. A Claude Code plugin and a marketplace in this repository bundle both MCP servers, the session skills and an `unfold` custom agent file. The token is a `sensitive` `userConfig` value, and `unfold-mcp login` is documented. The Codex plugin follows.
4. The AHP desktop pass ([VIK-1922](https://vikunja.webgrip.dev/tasks/1922)), and the 1.142 changes the [1.141 dossier](2026-10-08-vscode-1-141-fit.md) lists.

**Phase 2: one URL and acting from chat (M each).**

5. Streamable HTTP for `ploeg-mcp` (go-sdk, stateless) and `unfold-mcp`, on the internal gateway with a bearer. Copilot Studio, Cursor and JetBrains can then use a URL.
6. ADR-0011's propose, approve and cancel toolsets, confirmed through MRTR elicitation.
7. An OAuth 2.1 resource server with PRM, PKCE, audience checks and CIMD, with Authentik as the authorization server, behind a public route and a security review. claude.ai and ChatGPT then work, and the AHP sign-in can reuse it later.
8. An MCP App for the Work Item view (read-only, strict CSP), plus two or three MCP prompts.

**Phase 3: other editors and other people (L, each an owner decision).**

9. An `unfold-acp` agent and an ACP Registry listing (section 5).
10. Client-facing listings: a claude.ai connector and a ChatGPT plugin built only on the Client-safe brief, after tenancy ([ADR-0017](../../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md)) and the Ask Allowance ([ADR-0031](../../../../docs/adr/adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance.md)) exist.
11. Only on a trigger: an A2A facade, a Slack agent app, a Teams custom engine agent.

**Never:**

- proposed VS Code APIs in a shipped extension;
- Copilot Extensions;
- MCP Tasks or A2A as a path that dispatches work without a person;
- either MCP server inside a Run;
- AHP sandbox writes or shell input;
- any harness whose model spend bypasses the gateway, Copilot CLI on Copilot billing included;
- ACP v2 before it leaves draft.

## 7. Recommendations

1. **Build phase 1 now.** Four small items close most of the "from wherever they work" gap for the owner, and none needs a new decision record. Items 1 and 3 belong in Unfold; item 2 is the extension's.
2. **Corrected: ADR 0012's 2026-10-11 paragraph.** The Ploeg Work Item projection shipped in [`work-items.ts`](../../src/ahp/work-items.ts) (PRs #296, #299, #304). The record said "Not yet implemented"; this change adds a dated correction to ADR 0012.
3. **Decide the public route and OAuth for MCP** (phase 2, item 7). It is the single gate for claude.ai, ChatGPT and M365 Copilot.
4. **Treat ADR-0011's write toolsets as the next MCP feature,** ahead of MCP Apps. Acting from chat matters more than seeing a card there.
5. **Record an ACP decision before building it:** a north-facing `unfold-acp` agent amends [ADR 0007](../adrs/0007-thin-editor-client.md), whose trigger "a concrete harness/editor requirement" this question meets once an agency developer works in JetBrains.
6. **Re-confirm [Ploeg ADR-0007](../../../ploeg/docs/adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md) (A2A) at its 2026-10-31 review** with the new evidence: 1.0, AAIF, stable Go SDK, shipped acceptors in Gemini Enterprise and Copilot Studio. Maturity no longer blocks it, and fit still does. The same review date applies to [Ploeg ADR-0006](../../../ploeg/docs/adrs/0006-ahp-is-the-wrong-layer.md).
7. **Correct the ledger's MCP row.** It still says the ACP session passes an empty MCP list; since [Ploeg ADR-0078](../../../ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md) a Run gets the gateway server when its key has MCP access groups.

## Watchlist

Each item below is conditional. Any one of the listed triggers reopens it.

| Id | Item | Prerequisites | Trigger |
| --- | --- | --- | --- |
| T1 | ACP agent `unfold-acp` (phase 3, item 9) | Phase 1 item 1; remote MCP is not required | An agency developer or the owner works in a JetBrains IDE, Zed, Neovim or Emacs and asks to follow sessions there; **or** VS Code ships a first-party ACP client |
| T2 | ACP v2 for Ploeg's adapter | — | `protocolVersion` 2 leaves draft in [agent-client-protocol](https://github.com/agentclientprotocol/agent-client-protocol/releases) |
| T3 | ACP remote transport (no local bridge process) | T1 | The [Streamable HTTP and WebSocket RFD](https://agentclientprotocol.com/rfds/streamable-http-websocket-transport) reaches Completed **and** `@agentclientprotocol/sdk` ships it |
| T4 | An official ACP Go SDK, replacing `coder/acp-go-sdk` | — | An official Go SDK appears on [the libraries page](https://agentclientprotocol.com/libraries/community), or `coder/acp-go-sdk` goes six months without a release |
| T5 | MCP Tasks extension | Phase 2 item 5 | Claude, ChatGPT or VS Code appears under Tasks in the [client matrix](https://modelcontextprotocol.io/extensions/client-matrix) |
| T6 | A2A facade over proposals | Phase 2 item 6 (proposals exist) | An agency or Client asks to delegate from Gemini Enterprise, Copilot Studio or ServiceNow; **or** Ploeg ADR-0007's 2026-10-31 review says otherwise |
| T7 | AG-UI or CopilotKit Channels | — | Unfold embeds a third-party chat front end, or Slack/Teams is chosen through CopilotKit Channels |
| T8 | GitHub Agent HQ third-party agent | A GitHub-hosted repository in use | GitHub documents a public partner onboarding path for coding agents |
| T9 | Slack or Teams agent app | Phase 2 item 7 for Teams via Copilot Studio | An agency names Slack or Teams as where its people or Clients follow work |
| T10 | Skills over MCP | — | Claude Code or VS Code appears under Skills in the client matrix |
| T11 | AHP sign-in | — | VS Code resolves a protected resource on a non-GitHub, non-Microsoft authorization server ([spike](2026-10-10-ahp-sign-in-spike.md)) |

Rejected shapes, so they are not argued again:

- a chat participant in place of the Agents window;
- an MCP server inside ploegd;
- giving Runs `unfold-mcp` or `ploeg-mcp`;
- A2A or MCP Tasks starting paid work without a person;
- an ACP agent that edits the developer's checkout.

## Not verified

- Desktop rendering of anything in the AHP host.
- Where server `instructions` live in `2026-07-28`.
- OpenAI developer-mode plan limits and the Codex plugin manifest path; these come from secondary sources.
- JetBrains AI Assistant's per-version ACP feature dates.
- Whether `coder/acp-go-sdk` lacks specific newer methods; this is inferred from its release date.
- Gemini Enterprise and ServiceNow support for A2A 1.0; their docs name 0.3 and 0.2.1.
- No ACP, MCP-over-HTTP or MCP App was built or run in this sweep.
