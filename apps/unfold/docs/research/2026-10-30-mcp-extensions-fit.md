# MCP extensions against Unfold and Ploeg: who ships what, what competitors do, and where we lead

Research date: 2026-10-30. The owner asked for a full exploration of every extension on [modelcontextprotocol.io/extensions/overview](https://modelcontextprotocol.io/extensions/overview): what Unfold and Ploeg can integrate with, what borders them, and what to leave alone. After the first pass the owner accepted the Tasks recommendation and asked for wider research: who supports each extension, what competitors and adjacent products do, and creative uses. This dossier follows the MCP section of [the protocol-gap dossier](2026-10-13-protocol-integration-gaps.md#mcp).

Sources:

- the [extensions overview](https://modelcontextprotocol.io/extensions/overview), the [client matrix](https://modelcontextprotocol.io/extensions/client-matrix) and its source [`client-matrix.mdx`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/extensions/client-matrix.mdx) with its commit history, because the rendered page drops the support marks;
- every `ext-` and `experimental-ext-` repository in the [modelcontextprotocol organisation](https://github.com/modelcontextprotocol), and the open SEPs in the specification repository;
- client documentation and release notes: [Claude Code's MCP page](https://code.claude.com/docs/en/mcp), [Claude's enterprise-managed auth](https://claude.com/docs/connectors/building/enterprise-managed-auth.md), VS Code release notes, Codex, Goose, Gemini, LibreChat, Cursor and others, each linked where used;
- vendor documentation of 25 competitors and of identity providers, MCP gateways, tracker MCP servers and registries, each linked where used;
- this repository at `origin/development` `5b5e16f0`, with Ploeg's contract bundle at 0.2.0-rc.97 (`10911fdc`).

**Method.** A first pass read the specifications first-hand and mapped them onto [`mcp.ts`](../../src/mcp.ts), [`mcp-http.ts`](../../src/mcp-http.ts), [`mcp-apps.ts`](../../src/mcp-apps.ts) and [`ploeg-mcp`](../../../ploeg/cmd/ploeg-mcp/main.go). A second pass ran five research agents in parallel: a census of who ships each extension, competitors' MCP and hand-off surfaces, adjacent identity providers, gateways, trackers and registries, Tasks, Events and Apps in practice, and the protocol's frontier. Load-bearing claims were then re-checked first-hand, among them the matrix history and the channel server's protocol versions. A support claim needs a shipped artifact: documentation, a release note or a merged pull request. Vendor pages without a date were read on 2026-10-30. One competitor changelog contained a prompt injection addressed to the reader; it was ignored.

**Landing.** `AGENTS.md` has no protocol-research contract block, so the destinations follow the earlier dossiers: this dossier, a dated re-survey on the MCP row of [the protocol ledger](2026-09-11-ecosystem-alternatives.md#appendix-adjacent-components-and-communication-protocols), the owner's decision on [ADR-0011](../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), and updated and new rows on [the watchlist](2026-10-13-protocol-integration-gaps.md#watchlist).

## Verdict

**Build Tasks for hand-offs now, try Events for ChatGPT next, and wait on the rest with named triggers.**

1. **Tasks** (`io.modelcontextprotocol/tasks`). Claude Code ships it as a public beta from v2.1.304. A Work Item maps onto a task cleanly, and no competitor's MCP server returns tasks. The owner accepted it on 2026-10-30. It reaches fewer people than the matrix suggests: the Claude Code *terminal*, Agent SDK and GitHub Actions only. Not the VS Code extension, not the desktop app, and claude.ai is unconfirmed outside the matrix. So the synchronous answer stays the main path, and the task is the upgrade.
2. **Events** (`io.modelcontextprotocol/events`, [SEP-3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415), open). ChatGPT already ships its webhook mode, signed as Standard Webhooks, and so does Unfold's outbound delivery. "Tell me when client X's pull request is ready" in ChatGPT would cost little to build. It is an open SEP, so it needs an owner decision and a pin.
3. **MCP Apps** is built ([#722](https://forgejo.webgrip.dev/webgrip/unfold/pulls/722)). The extension is Stable, renders in Claude, ChatGPT, VS Code, M365 Copilot, Gemini Enterprise, Cursor and Goose, and not in Claude Code.
4. **Everything else waits.** Skills over MCP has no Claude or VS Code consumer. Enterprise-Managed Authorization has clients (Claude, VS Code, Codex CLI) but not on our side: Authentik has only an open issue. The annotation drafts, Server Cards, Interceptors, Variants, Filesystems and File Uploads have no consumer or no text.

**Where Unfold leads.** Among 25 competitors, none exposes over MCP:

- a queue of what waits for a person (our `unfold_now`);
- spend or budget per piece of work;
- per-client tenancy;
- a task handle for agent work.

The closest are Devin's blocking `devin_session_gather`, Lovable's send-then-poll pair and GitHub's `assign_copilot_to_issue`, which returns a pull request URL. The protocol has no SEP for cost, budget or tenancy either.

## 1. What MCP extensions are

The overview defines an extension as an optional addition "that define[s] capabilities beyond the core protocol", named `{vendor-prefix}/{extension-name}`, with `io.modelcontextprotocol` for official ones. Extensions became part of the protocol in `2026-07-28`.

- **Negotiation.** A `2026-07-28` client lists the extensions it supports in `_meta["io.modelcontextprotocol/clientCapabilities"].extensions` on every request. A server lists its own in `capabilities.extensions` of the `server/discover` result. Older revisions carry the same field through `initialize`, outside the published schema.
- **Opt-in always.** "Extensions are always disabled by default and require explicit opt-in from the developer, at every stage." A side that supports an extension the other lacks falls back to core behaviour, or refuses if the extension is mandatory.
- **Lifecycle** ([SEP-3392](https://modelcontextprotocol.io/seps/3392-extension-lifecycle)). There are three stages:
  - **Experimental:** anything may change, and "implementers should pin to a tag or commit".
  - **Beta:** needs an Extensions Track SEP and one reference implementation in an official SDK. Breaking changes are rare and signalled by a `revision` string.
  - **Stable:** needs a second SEP, two interoperating implementations and a conformance scenario. Revisions are keyed to core protocol revisions and are immutable.

  A Beta extension may instead be promoted into core.
- **Cadence.** The next core revision is planned for late March 2027, then every six months ([SEP-3398](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3398)). Tasks is headed for core ([roadmap](https://modelcontextprotocol.io/development/roadmap)).

`unfold-mcp` already negotiates this way: [`mcp.ts`](../../src/mcp.ts) reads the per-request client capabilities, and [`mcp-apps.ts`](../../src/mcp-apps.ts) advertises `io.modelcontextprotocol/ui`. Adding an extension is a wire change in a hand-written server. `ploeg-mcp` is on the Go SDK, which so far ships only the two auth extensions.

## 2. Who ships each extension

"Shipped" means a release, documentation or a merged pull request. The official matrix lags reality in both directions; corrections are marked.

| Extension | Stage | Clients that ship it | SDKs | Gateways | Servers of note |
| --- | --- | --- | --- | --- | --- |
| **MCP Apps** `io.modelcontextprotocol/ui` | Stable, `@modelcontextprotocol/ext-apps` 2.0.4 | Claude web and Desktop, ChatGPT, VS Code Copilot ([1.109](https://github.com/microsoft/vscode-docs/blob/main/release-notes/v1_109.md)), M365 Copilot, Cursor, Goose, Postman, MCPJam, PostHog Code, Kiro Crew; **also** Gemini Enterprise ([2026-10-20](https://cloud.google.com/blog/topics/developers-practitioners/devs-guide-to-mcp-apps-in-gemini)), Codex Desktop (undocumented, from bug reports), LibreChat 0.8.9-rc1; **not** Claude Code, Gemini CLI, Zed, JetBrains, opencode | TypeScript (ext-apps), C# | agentgateway 1.4.0, IBM ContextForge 1.0.8, Envoy AI Gateway 1.2.0 (partial) | Claude launch partners (Asana, Slack, Figma, Canva, Box, monday.com…), GitHub MCP (`pr-write`, `issue-write` forms), Lovable (build progress) |
| **Tasks** `io.modelcontextprotocol/tasks` | Beta, to core; [SEP-2663](https://github.com/modelcontextprotocol/ext-tasks/blob/main/seps/2663-tasks-extension.md) Final | **Claude Code** public beta from 2.1.304, terminal, Agent SDK and GitHub Actions only ([docs](https://code.claude.com/docs/en/mcp)); claude.ai (matrix only, [#3459](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3459), no public documentation); MCPJam; mcpc 0.8.0-beta (missing from the matrix); **not** Claude Desktop, the Claude Code VS Code extension, ChatGPT, VS Code (only the 2025-era SEP-1686), Codex, Goose, opencode, Gemini | C# (`ModelContextProtocol.Extensions.Tasks`), Rust rmcp; TypeScript requester only (server side in open [#2782](https://github.com/modelcontextprotocol/typescript-sdk/pull/2782)); Python v2 and Go not | agentgateway 1.4.1 | No large vendor server; references only (the `everything` server, mcpkit, Upstash agentkit) |
| **Skills over MCP** `io.modelcontextprotocol/skills` | Beta; SEP-2640 Final | MCPJam, mcpc, fast-agent; ChatGPT partial (snapshot at plugin submission); VS Code planned ([#338300](https://github.com/microsoft/vscode/issues/338300)); **not** Claude (any surface), Codex, Copilot CLI | TypeScript 2.4.0 (`ext/skills`), FastMCP 4.1.2; Python, C# and Rust merged, unreleased; Go open ([#1238](https://github.com/modelcontextprotocol/go-sdk/pull/1238)) | agentgateway in progress | Hugging Face, Cloudflare API, Outline, n8n, Salesforce B2C, Ansible AAP, Qodo ("managed skills") |
| **Enterprise-Managed Authorization** (ID-JAG) | Stable | **Claude** Team and Enterprise, GA 2026-08-24, Okta only ([docs](https://claude.com/docs/connectors/building/enterprise-managed-auth.md)); **VS Code** preview ([1.123](https://github.com/microsoft/vscode-docs/blob/main/release-notes/v1_123.md)); **Codex CLI** 0.164; Archestra, mcpc. The matrix shows only the last two | TypeScript, Go (`auth/extauth`), Rust | agentgateway 1.4.0, LiteLLM 1.107-rc | Asana, Atlassian, Canva, Figma, Linear, Notion, Slack, Supabase, monday.com behind Claude's Okta flow |
| **OAuth Client Credentials** | Stable | mcpc only; Claude **explicitly does not** support it ([docs](https://claude.com/docs/connectors/building/authentication.md)) | TypeScript, Python, Go, Rust | — | — |
| **Server Cards** | Beta; [SEP-2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127) merged 2026-10-06 (the repository README still says Experimental) | none consume them | open PRs in TypeScript, Python, Go | none | GitHub MCP (1.12.0), Resend (`/.well-known/ai-catalog.json`), Sanity |
| **Events** `io.modelcontextprotocol/events` | open [SEP-3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415) | **ChatGPT**, webhook mode only ([docs](https://developers.openai.com/plugins/build/mcp-events)); Claude Code requested ([#101434](https://github.com/anthropics/claude-code/issues/101434)) | Vercel AI SDK, Upstash agentkit, Hookdeck Outpost | — | Upstash "Deploy Watch" ([blog](https://upstash.com/blog/mcp-tasks-and-events)) |
| Interceptors (SEP-2624), Variants (SEP-2053), trust annotations and action metadata, Filesystems, File Uploads | Experimental | none | reference repositories only | Docker and AWS AgentCore have vendor-specific interceptors, not SEP-2624 | — |

**The Tasks WG.** Tasks and Events now share one Working Group, formed on 2026-10-16 ([#3440](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3440)). Its leads come from AWS, Anthropic and Microsoft.

**Open SEPs that border Unfold directly:**

- [SEP-2848](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2848) **Asynchronous Approval for Tool Calls**. A denied call returns a task, and an out-of-band approver (a person, a supervising agent or a policy engine) releases it.
- [SEP-2793](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2793) **Tool Risk Metadata**: blast radius, reversibility, and an `approvalRecommendation` of none, single or multi.
- [SEP-2817](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2817) **AI Invocation Audit Context**: model, user intent and turn id in `_meta`.

Rejected recently: tamper-evident audit records, signed execution records, passkey approval per call, and multi-party authorization.

## 3. What competitors expose

Twenty-five products were checked for an MCP server that starts, follows or steers their agent, and for how they surface "the agent needs you".

| Product | MCP server for its agent | Long-running pattern | "Needs you" surface |
| --- | --- | --- | --- |
| Devin | Yes: `devin_session_create/interact/gather`…, remote, **API key, no OAuth** ([docs](https://docs.devin.ai/work-with-devin/devin-mcp.md)) | `devin_session_gather` blocks until sessions settle | session state "waiting" |
| GitHub Copilot cloud agent | Inside the GitHub MCP server: `assign_copilot_to_issue`, `create_pull_request_with_copilot`; OAuth; MCP Apps forms | returns the pull request URL | review request; no mid-run question |
| Lovable | Yes: `send_message(wait=false)` + `get_message`, OAuth, an MCP Apps build-progress widget, workspace skills over MCP ([docs](https://docs.lovable.dev/integrations/lovable-mcp-server)) | send, then poll | — |
| Tembo, Replit, Qodo | Yes (Tembo generated from OpenAPI; Replit with OAuth; Qodo serves review skills) | API | — |
| Cursor, Factory, Amp, Augment, OpenHands, Warp, Jules, Kilo, Cline, Continue, Junie | **No** official server; REST APIs only (Cursor `/v1/agents` with SSE, Jules `AWAITING_USER_FEEDBACK`, Warp `BLOCKED`) | SSE or polling | iOS push (Cursor), "Snooze until I'm needed" (Amp) |
| OpenAI Codex | **Removed** its `codex mcp-server` on 2026-09-05 ([#42993](https://github.com/openai/codex/pull/42993)) | — | — |
| Linear | Linear MCP is tracker-only; its **AgentSession API** is the most complete "needs you" protocol found: `awaitingInput`, an elicitation activity, `externalUrls`, a 10-second first-response rule ([docs](https://linear.app/developers/agent-interaction)) | agent activities | `awaitingInput` |

What competitors do as MCP *clients* converges: org-managed server allowlists (Factory, Amp's registry allowlist, Cline, Copilot), security profiles that make a server read-only (Devin), and per-scope spend limits (CodeRabbit, Kilo sub-organisations as cost centres). No one offers per-client tenancy or per-client billing.

Distinctive ideas worth borrowing:

- **Devin Handoff** ([repo](https://github.com/club-cog/devin-handoff)) sends the local `git diff` and the local agent's hypotheses into a cloud session from Claude Code, Codex or Cursor.
- **Amp's "Snooze until I'm needed"** wakes the agent silently and resurfaces the thread only when it needs approval.
- **GitHub's `assign_copilot_to_issue_with_intent`** carries the caller's rationale and confidence.
- **Lovable** shows tools only to the clients they suit.

## 4. Adjacent products

**Identity providers.** ID-JAG issuers and acceptors:

- **Okta:** Cross App Access (issuing capped at 250 per user per app per month; accepting is a paid product).
- **Ping** 13.1, **Descope**, **Stytch** (B2B).
- **Auth0**, **WorkOS**, **Scalekit:** early access.
- **Keycloak:** experimental from 26.7.0.

**Authentik**, which Unfold uses, has RFC 8693 delegation with chained `act` (October 2026) and an enterprise-licensed DCR. ID-JAG is only an open issue there ([#25542](https://github.com/goauthentik/authentik/issues/25542)). No CIMD or RFC 8707 issue was found. Google's MCP servers accept pre-registered clients only.

**Gateways.** Two lead on extensions:

- **agentgateway** (now an AAIF project): 2026-07-28, ID-JAG, MCP Apps, Tasks pass-through and USD budgets.
- **LiteLLM**, Ploeg's gateway: guardrails `pre_mcp_call`, `during_mcp_call` and `post_mcp_call`, a fixed cost per tool, and ID-JAG redemption in release candidates. Its config reference still shows `2025-11-25` negotiation, and there is no evidence of Apps, Tasks or Skills.

No gateway implements SEP-2624 Interceptors; Docker and AWS AgentCore have their own interceptor hooks.

**Trackers and tools.**

- Slack, Atlassian Rovo, Linear, Notion, monday.com and Figma ship remote MCP with Claude's enterprise auth.
- GitHub's MCP server ships Apps forms and a Server Card.
- None ships Tasks.
- **Vikunja now ships its own MCP server** (v2.7.0, [#3860](https://github.com/go-vikunja/vikunja/pull/3860)).
- Gitea has an official server; Forgejo has only community ones.

**Registries.** The official MCP Registry is still a preview at API v0.1. No directory reads Server Cards or `ai-catalog.json` yet.

## 5. Layer map

| Seam | What implements it today | Extension that claims it | Fit |
| --- | --- | --- | --- |
| A person follows one Work Item from an AI client | `unfold_get_work`, polled by hand | **Tasks** | **Build** (accepted) |
| An AI client is told when work changes | outbound CloudEvents over Standard Webhooks ([outbound events](../operations/outbound-events.md)); the Claude Code channel | **Events** | **Try**, ChatGPT first (owner decision) |
| The Work Item as a card in a chat client | [`mcp-apps.ts`](../../src/mcp-apps.ts) | MCP Apps | Built |
| A Team's skills reaching a person's own agent | Ploeg's digest catalogue ([Ploeg ADR-0092](../../../ploeg/docs/adrs/0092-a-team-pins-its-skills-in-a-catalogue-that-ploegd-fetches-once-and-serves-by-digest.md), proposed); [the Claude Code plugin](../../extensions/claude-code/plugin.json) | Skills over MCP | Wait (T10) |
| A person approves an action another tool wants | confirmations in both MCP servers ([Ploeg ADR-0108](../../../ploeg/docs/adrs/0108-every-operator-action-names-its-person-and-channel-and-an-mcp-action-needs-the-persons-confirmation.md)); Unfold's Needs-you page | SEP-2848 tool approval | Wait (T35) |
| Marking tracker and agent text as untrusted; risk and audit metadata | the `untrusted` sub-object in [`mcp.ts`](../../src/mcp.ts); AI marking ([contract](../contracts/ai-marking.md)) | trust annotations, action metadata, SEP-2793, SEP-2817 | Wait (T30) |
| An agency's IdP decides which MCP servers its people use | **nobody** | Enterprise-Managed Authorization | Wait (T31) |
| A program without a person reads Unfold | the HTTP API ([OpenAPI](../contracts/openapi.yaml)) | OAuth Client Credentials | Wait (T32) |
| Discovering an Unfold endpoint | **nobody** | Server Cards | Wait (T33) |
| Policy on tool calls inside a Run | Ploeg's LiteLLM gateway ([Ploeg ADR-0078](../../../ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md)) | Interceptors | Ignore (T34) |
| Cost or allowance of a piece of work | `unfold_spend`, Run cost in tool results | **no extension or SEP** | Lead (T36) |
| Different tool text per model; files on resources; uploads | **nobody** | Variants, Filesystems, File Uploads | Ignore |

## 6. Tasks, as built

The owner accepted Tasks for `unfold_hand_off` on 2026-10-30 ([ADR-0011](../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md)). The design below folds in what the specification and Claude Code's documentation require.

| Concern | Rule | Why |
| --- | --- | --- |
| Gate | A task only for a `2026-07-28` request whose capabilities name the extension, and only behind a flag; otherwise today's synchronous answer | "A server MUST NOT return `CreateTaskResult` to a client that did not include the extension capability on its request" |
| Confirm first | The person confirms the hand-off through the existing MRTR exchange; the task is returned only once `tasks/get` would resolve | The spec says to resolve MRTR synchronously before returning a task; Claude's connector relay hangs up at about 240 s ([#102347](https://github.com/anthropics/claude-code/issues/102347)) |
| Task id | Opaque: a reference plus a **hand-off generation** plus a key id plus a MAC over those and the authenticated person and Tenant; at most 128 printable characters; a key ring for rotation | Terminal states are final, so a re-hand-off needs a new id. Person and Tenant come from the caller, which satisfies the auth-binding MUST. A rotated key would otherwise show Claude Code "outcome unknown" |
| `working` | Always send `statusMessage`: what the work does or why it waits, plus the Unfold link | Claude Code shows the latest value and clears it when it is omitted |
| `input_required` | One form-mode elicitation per open question, keyed `<question>.<revision>`, at most 16; server-written framing with the agent's text quoted as data; never a URL taken from agent text | Keys must be unique for the task's life. "A task is not a higher-trust channel." |
| Decline or Esc | Not recorded as the person saying no; the question stays open in Unfold | Claude Code treats both as answers, and cancels the task when it cannot show a dialog (non-interactive sessions, or `/tasks` open) |
| `completed` | A model-readable result with the pull request, outcome, spend and link. A Work Item that ends without a pull request is `completed` with `isError: true`; `failed` is only for protocol errors | The result goes to the model, not into the transcript |
| `tasks/cancel` | Acknowledge, stop following, never stop the Work Item; keep reporting its real state | Cancellation is "cooperative: … A server is not obligated to actually stop the work" ([spec](https://github.com/modelcontextprotocol/ext-tasks/blob/main/specification/2026-07-28/tasks.md)). Claude Code sends cancel on `x`, Esc while waiting, timeouts and unserviceable input, so a stop would kill hours of work by accident |
| Polling | `pollIntervalMs` 30000, `ttlMs` `null`, short-lived caching of the derived state | Claude Code clamps the interval to 250–30000 ms and ignores TTL; a day-long Work Item is about 2,900 polls per follower |
| Not built | `subscriptions/listen`, `notifications/tasks`, `tasks/list` | Claude Code uses none of them; reconnect gaps are unresolved ([ext-tasks#24](https://github.com/modelcontextprotocol/ext-tasks/issues/24)) |

**Reach.** The owner works in the Claude Code VS Code extension, where Tasks does not run. The feature shows only in a terminal `claude` session, version 2.1.304 or later, connected to `unfold-mcp` over `2026-07-28`.

**Guard found on the way.** Claude Code cannot deliver channel messages from a server that negotiates `2026-07-28`. The plugin's channel server ([`unfold-channel.mjs`](../../extensions/claude-code/channel/unfold-channel.mjs)) offers only 2025 revisions and must keep doing so.

## 7. Ideas the evidence supports

Ordered by value for the cost:

1. **A cost quote in the hand-off confirmation.** The confirmation would read "Ploeg will spend at most €X on this from client Y's allowance", using the per-Round cap Ploeg already reports (as `unfold_get_work`'s resume offer does), and later a Team's typical spend. Supabase confirms the cost of a new project in its MCP server, and no agent vendor exposes cost over MCP. S, if the cap is known before dispatch; that is unverified.
2. **Events for ChatGPT.** An `events/list` of `work_item.needs_you`, `pull_request.ready` and `run.finished`, with `events/subscribe` mapped onto the existing Standard Webhooks outbox. An agency project manager in a ChatGPT Work chat then gets told when a client's work is ready. M; pin SEP-3415 at a commit.
3. **A live Work Item card where Tasks does not reach.** claude.ai, Desktop, VS Code and ChatGPT render MCP Apps but not Tasks. An app-only polling tool ([pattern](https://github.com/modelcontextprotocol/ext-apps/blob/main/docs/patterns.md)) keeps the existing card current. Every action still goes through the server-side confirmation, because an app's call is indistinguishable from the model's ([ext-apps#738](https://github.com/modelcontextprotocol/ext-apps/issues/738)). S.
4. **Hand off with local context.** `/unfold:handoff` in the Claude Code plugin would attach the current diff and the session's findings to the Work Item, like Devin Handoff. It builds on linked sessions. S–M.
5. **Wait on several Work Items at once.** With Tasks, a person who hands off five items follows five tasks; that does Devin's `gather` without a blocking call. Free with Tasks.
6. **Lead on cost metadata.** Propose a `_meta` convention for cost, allowance and budget on tool results and tasks, where no SEP exists and ACP has only begun a `usage_update`. Outward-facing; owner decision.
7. **Be an approver for SEP-2848.** If asynchronous tool approval lands, Unfold's Needs-you page is a natural approver for agency tools: two-person approval per client, using SEP-2793's `approvalRecommendation`. Wait (T35).
8. **Team skills over MCP.** Once the Go SDK ships the extension, `ploeg-mcp` serves a Team's pinned catalogue, so a developer's agent gets exactly the Runs' skills, as Qodo and Lovable already do. Wait (T10).
9. **Agency single sign-on.** Claude's Okta flow already auto-connects Linear, Notion and Slack for an enterprise. Unfold can join once Authentik ships ID-JAG, or by fronting the resource server with agentgateway or Keycloak. Wait (T31).
10. **Audit context on Ploeg's tool calls.** Record SEP-2817's model, intent and turn id beside the AI-marking trailer for the EU AI Act story. Wait (T30).
11. **OpenTelemetry for tasks and events.** The MCP semantic conventions still model sessions and sampling ([semantic-conventions-genai](https://github.com/open-telemetry/semantic-conventions-genai)), so attributes for tasks, events and cost are open to contribute. Outward-facing; owner decision.

Do not build on sampling: [SEP-2577](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2577-deprecate-roots-sampling-and-logging.md) deprecates it.

## 8. Recommendations

1. **Build Tasks for `unfold_hand_off`** as in [section 6](#6-tasks-as-built), behind a flag, with the channel guard as a test. Prove it in a terminal Claude Code session against the deterministic demo, so no paid model runs.
2. **Add the cost quote to the hand-off confirmation** (idea 1).
3. **Decide on Events for ChatGPT (owner).** Recommended as an experiment pinned to SEP-3415, after Tasks ships.
4. **Keep MCP Apps' text whole** and consider the live card (idea 3).
5. **Wait on the rest** with the triggers below.
6. **Outward-facing, owner decides:** the field-level `untrusted` pattern on [SEP-1913](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1913), and a cost-metadata proposal to the Tasks and Events WG.

## Watchlist changes

Recorded on [the watchlist](2026-10-13-protocol-integration-gaps.md#watchlist):

- **T5 fired**; Tasks accepted for hand-offs.
- **T10** re-confirmed, not fired.
- **T29** (Events): half fired, since SEP-3415 is filed and ChatGPT ships it; it waits on the owner's decision.
- **T31** (enterprise auth): fired on the client side (Claude, VS Code and Codex CLI ship it); it waits on Authentik.
- **T30, T32, T33 and T34:** updated with this sweep's evidence.
- **New:** T35 (asynchronous tool approval) and T36 (cost metadata).

## Not verified

- claude.ai's Tasks support: the matrix lists it ([#3459](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3459)), but no Anthropic documentation describes it, and Claude Code's documentation names only the terminal, Agent SDK and GitHub Actions.
- Claude Code's behaviour with several `inputRequests` keys at once, and with a re-asked question after a decline.
- ChatGPT's limits on event-triggered runs (a third-party claim only).
- Competitor features behind sign-in or without public documentation: Zencoder, Sweep, Charlie Labs and Bolt returned nothing usable.
