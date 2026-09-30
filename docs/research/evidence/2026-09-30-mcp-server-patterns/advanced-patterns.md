# Advanced MCP server patterns

> Raw research-agent report, 2026-09-30, kept as evidence for [the MCP server patterns guide](../../2026-09-30-mcp-server-patterns.md). Agent output, not independently verified line by line; the guide states which claims were checked first-hand.

# Advanced MCP server patterns: research report for `ploeg-mcp` (as of 2026-09-30)

Sources are primary unless marked otherwise. "Not documented" means I looked in the vendor's own docs and found nothing. I read Glide's accepted ADR (`docs/adr/adr-0011-glide-is-reachable-over-mcp-through-a-read-first-server.md`, 2026-09-30) so the verdicts can be checked against it. It defines 9 tools across read, propose and steer toolsets, stateless 2026-07-28 on go-sdk, elicitation-gated approve/cancel, polling, and no Tasks.

## 0. Client facts that decide most verdicts

| Client | Elicitation | Tasks ext | MCP Apps | Timeouts / size | Other |
|---|---|---|---|---|---|
| **Claude Code** ([mcp doc](https://code.claude.com/docs/en/mcp)) | form + URL. It declares `elicitation:{form:{},url:{}}` on 2026-07-28 connections; URL mode arrived in v2.1.281 (2026-09-23, changelog). An **`Elicitation` hook can auto-respond without showing a dialog.** | Not documented. Claude Code has its own client-side auto-backgrounding after 2 min (`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`), which is not the extension. | **Not rendered.** "MCP Apps UI resources … don't appear in the @ suggestions or in the resource list tool" | Idle timeout 5 min for HTTP, reset by progress notifications. Wall clock is the per-server `timeout` or `MCP_TOOL_TIMEOUT` (default about 28 h). Per-request first-byte timer is max(60 s, tool timeout, `MCP_TIMEOUT`). Output warning at 10k tokens, cap 25k (`MAX_MCP_OUTPUT_TOKENS`). `_meta["anthropic/maxResultSizeChars"]` allows up to 500k chars. | Tool search is on by default: only tool names and server instructions load at start. Each description and each server's instructions are **truncated at 2,048 chars** (`CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`, v2.1.280+). `_meta["anthropic/requiresUserInteraction"]: true` forces a prompt on every call, even in bypassPermissions (v2.1.199+). Also `_meta["anthropic/alwaysLoad"]`. Prompts appear as `/server:prompt (MCP)`; resources via `@server:uri`. |
| **Claude.ai / Desktop** ([building](https://claude.com/docs/connectors/building)) | Not documented | Not supported ("Advanced or draft capabilities" are listed as unsupported) | Yes ([client matrix](https://modelcontextprotocol.io/extensions/client-matrix)) | **240 s per tool call; about 150,000-char result** | Tools, prompts, resources. **No resource subscriptions, no sampling.** OAuth follows the 2025-03-26, 2025-06-18 and 2025-11-25 auth specs. |
| **ChatGPT** ([OpenAI MCP server doc](https://developers.openai.com/plugins/build/mcp-server)) | The docs recommend it ("Use MCP elicitation when the server needs structured information…"); the mode is not specified | Not documented | Yes, plus the `window.openai` compatibility layer | Not documented | "ChatGPT and Codex use these instructions… Keep the most important details in the first 512 characters." Annotations "help ChatGPT and Codex choose appropriate confirmation". Skills support is partial. |
| **Cursor** ([docs](https://cursor.com/docs/mcp)) | Supported; mode not stated | Not documented | Yes, since 2.6 (2026-03-03) | Not documented | Tools, prompts, resources, roots |
| **Codex** ([docs](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)) | Custom-server elicitation arrived in [PR #17043](https://github.com/openai/codex/pull/17043). **Empty-schema elicitations render as message-only approval prompts.** MRTR `input_required` came in [PR #35725](https://github.com/openai/codex/pull/35725) (merged 2026-07-28). An app-server auto-decline bug was reported in [#45621](https://github.com/openai/codex/issues/45621) (closed). | Not documented | Not documented | **`tool_timeout_sec` default 60**, `startup_timeout_sec` 10, 8 MiB response limit | `default_tools_approval_mode` takes `auto`/`prompt`/`writes`/`approve`, with per-tool `tools.<tool>.approval_mode`. Uses `instructions`. |

The official [extension client matrix](https://modelcontextprotocol.io/extensions/client-matrix) has **no Tasks column** and **does not list Claude Code or Codex at all**. The Go SDK [v1.7.0](https://github.com/modelcontextprotocol/go-sdk/releases/tag/v1.7.0) implements the 2026-07-28 core: MRTR with a legacy-client shim, `server/discover`, `subscriptions/listen`, and `ttlMs`/`cacheScope`. It requires `StreamableHTTPOptions.Stateless=true` for 2026-07-28 over HTTP; stateful servers negotiate down to 2025-11-25. v1.8.0 adds `ServerOptions.SetCacheable` and `SupportedProtocolVersions`. **Neither release mentions Tasks, Apps or Skills.** Custom JSON-RPC methods are allowed (#956).

---

## 1. Search + execute, "code mode" and progressive disclosure

**Mechanics.**
- **Cloudflare** exposes `search()` and `execute()` over an OpenAPI spec, with model-written JavaScript running in a Dynamic Worker V8 isolate. That covers about 2,500 endpoints, "from more than 1.17 million tokens to roughly 1,000" ([InfoQ](https://www.infoq.com/news/2026/04/cloudflare-code-mode-mcp-server/)). Cloudflare's own docs: "Code execution does not replace authorization. Enforce permissions and any required approval inside upstream tool handlers" ([patterns](https://developers.cloudflare.com/agents/model-context-protocol/codemode/)).
- **Anthropic**, "code execution with MCP": 150,000 to 2,000 tokens (98.7%), but it "add[s] operational overhead and security considerations that direct tool calls avoid" ([post](https://www.anthropic.com/engineering/code-execution-with-mcp)).
- **Atlassian Rovo**: primary tools plus `discover` (natural-language search of deferred tools), executed through **risk-tiered** `executeRead` / `executeWrite` / `executeDestructive`. Reported context reduction is over 50% ([supported tools](https://developer.atlassian.com/cloud/rovo-mcp/guides/supported-tools/)).
- **Sentry** ([`surfaces.ts`](https://github.com/getsentry/sentry-mcp/blob/main/packages/mcp-core/src/tools/surfaces.ts)): `TOP_LEVEL_TOOL_NAMES` = `find_organizations, find_projects, update_issue, search_events, analyze_issue_with_seer, search_issues, get_sentry_resource, search_sentry_tools, execute_sentry_tool`. Everything else sits in a catalog.
- **Stripe**: `stripe_api_search`, `stripe_api_details`, `stripe_api_read` (GET), `stripe_api_write` (POST/PATCH/PUT/DELETE) ([docs](https://docs.stripe.com/mcp)).
- **Tembo** reversed course. [tembo/mcp PR #5](https://github.com/tembo/mcp/pull/5), merged 2026-09-23, flips the default from the four-tool compact wrapper (`search_tools`, `get_tool_schema`, `call_read_tool`, `call_write_tool`) to 125 direct tools. `MCP_TOOL_MODE=compact` stays opt-in.
- **Anthropic tool search** (`tool_search_tool_regex_20251119` / `_bm25_20251119`, `defer_loading: true`) ([doc](https://platform.claude.com/docs/en/agents-and-tools/tool-search-tool)):
  - "Claude's ability to pick the right tool degrades once you exceed 30–50 available tools."
  - "Standard tool calling, without tool search, is a better fit when you have fewer than 10 tools."
  - Keep 3–5 tools non-deferred. Deferred tools preserve the prompt-cache prefix.
- **The WG**: the progressive-disclosure repo is the Primitive Grouping IG ([repo](https://github.com/modelcontextprotocol/progressive-disclosure-wg)). It has no SEP; its work item is "MCP Grouping Convention v0.1" (proposed). The [roadmap](https://modelcontextprotocol.io/development/roadmap) (2026-08-22) puts "Progressive discovery" under a Core Primitives WG that is still forming.

**Measured versus modeled.** [Archestra](https://archestra.ai/blog/progressive-disclosure-for-mcp-tools) models about 77% savings for 70 tools but measures about 13% on real transcripts: "Schema prefix is not where the budget goes in production. Conversation is." On a 20-step run, the extra router round trip "eats the savings."

**When a small server benefits.** Almost never. The host already does the disclosure: Claude Code loads only tool names and instructions, and the Messages API defers tools. A 9-tool server costs perhaps 2–4k tokens.

**Risks.**
- A generic `execute` collapses per-tool `annotations`, Claude Code permission rules and `requiresUserInteraction`, Codex `enabled_tools`/`approval_mode`, and gateway allowlists into a single name. That is why Atlassian kept risk tiers as separate tools.
- Hidden schemas skip client-side `inputSchema` validation.
- The discovery call adds a round trip.
- Code mode needs a sandbox, which ploeg-mcp does not have.

**Verdict.** Code mode: **NEVER**. ploeg-mcp has no large API to script, and a sandbox would be a new attack surface next to paid work. Search/execute: **LATER**, triggered only if the listed tools exceed about 25–30 (for example, per-Team custom actions). Even then keep read, propose and steer as separate execute tools, Atlassian-style. **ADOPT NOW** the cheap part: keep the `glide_` prefix and write instructions that tell tool search when to look for Glide tools.

---

## 2. Handles for long-running work

**Mechanics.**
- **Handle plus status tool.** The spec's non-normative "Stateful Tools" section ([tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)) says:
  - "a handle is a name, not a capability", so re-check authorization on every call;
  - handles should be opaque;
  - state the lifetime in the creating tool's description;
  - return a tool execution error for an expired handle.
- **Capped blocking wait with partial return.**
  - Sentry `analyze_issue_with_seer`: `SEER_TIMEOUT = 5 * 60 * 1000`, `SEER_POLLING_INTERVAL = 5000`. On timeout it returns the current status and "You can check the status later by running the same command again" ([seer.ts](https://github.com/getsentry/sentry-mcp/blob/main/packages/mcp-core/src/internal/tool-helpers/seer.ts)).
  - Devin `devin_session_gather` takes `session_ids`, `poll_interval_seconds` and `timeout_seconds` and waits for sessions to reach "finished, errored, sleeping, or waiting" ([Devin MCP](https://docs.devin.ai/work-with-devin/devin-mcp)). Its max and its timeout behaviour are not documented.
- **Tasks extension** (`io.modelcontextprotocol/tasks`, [SEP-2663](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2663), merged 2026-05-15; [spec](https://github.com/modelcontextprotocol/ext-tasks/blob/main/specification/2026-07-28/tasks.md)):
  - `tools/call` returns `CreateTaskResult` with `resultType:"task"`, `taskId`, `status` (`working|input_required|completed|failed|cancelled`), `ttlMs`, `pollIntervalMs`, `statusMessage`.
  - Methods are `tasks/get`, `tasks/update` (carries `inputResponses`) and `tasks/cancel` (cooperative). There is no `tasks/list` and no blocking `tasks/result`.
  - Push is `notifications/tasks` via `subscriptions/listen`.
  - A server "MUST NOT return `CreateTaskResult` to a client that did not include the extension capability", or it returns `-32021`.
  - A task must be durably created before responding.
  - "`notifications/progress` … are not supported on tasks."
  - Over HTTP, `Mcp-Name` MUST equal `taskId` so load balancers can route.
  - A tool result with `isError:true` is `completed`, not `failed`.
  - Task IDs MUST be unguessable and auth-checked on every call.
- **Progress** ([spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/progress)): the client sends `_meta.progressToken`, and the server emits `notifications/progress` {`progressToken`,`progress`,`total`,`message`} on that request's response stream. Progress must increase.

**Client support and timeout interplay.** Tasks is not supported by any of the five target clients (section 0). The hard limits are:
- Codex: 60 s.
- Claude.ai: 240 s.
- Claude Code: 5-minute idle timeout (progress resets it) and a move to the background after 2 minutes. That backgrounded call "doesn't survive exiting the session".

Sentry's 5-minute wait already exceeds both the claude.ai and Codex limits.

**Which to use when.**
- Handle plus poll: always. It is the universal baseline.
- Capped wait: only when a result usually lands within seconds to a minute.
- Tasks: only when clients declare the extension.

**Verdict.** **ADOPT NOW** handle plus poll, as the ADR already does:
- Work Item IDs as handles; `glide_changes_since` with an opaque cursor as the cheap poll.
- Put the expected cadence in the description ("Runs take minutes to hours; poll no more than every 60 s").
- Optionally add a `wait_seconds` argument to `glide_get_work`, clamped to **≤45 s** so it stays under Codex's 60 s. It returns the partial state plus the same handle, and emits `notifications/progress` while waiting whenever a `progressToken` is present.

Tasks: **LATER**. Trigger: two or more target clients declare `io.modelcontextprotocol/tasks` in the matrix **and** go-sdk ships it. Hand-rolling `tasks/*` as custom methods before then is wasted work.

---

## 3. Human in the loop

**Form elicitation via MRTR** ([MRTR](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr), [elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)).

Wire flow:
1. `tools/call` with id 1.
2. The server returns a result with `resultType:"input_required"`, `inputRequests:{ "<key>": {method:"elicitation/create", params:{mode:"form", message, requestedSchema}} }` and an optional `requestState`.
3. The client asks the user.
4. The client retries `tools/call` with a **new id** and the same `name`/`arguments`, plus `inputResponses:{ "<key>": {action, content} }` and the **exact** `requestState`.

Rules:
- Allowed only on `tools/call`, `prompts/get` and `resources/read`.
- The server MUST NOT send `inputRequests` for capabilities the client did not declare in `_meta["io.modelcontextprotocol/clientCapabilities"].elicitation`. An empty `{}` means form only.
- The server "MUST NOT assume that clients will fulfill the `inputRequests` or retry."
- `requestState` is attacker-controlled. The server MUST protect its integrity (HMAC/AEAD) when it affects authorization or business logic, and SHOULD bind principal, a short TTL and a digest of method plus parameters. Single use "MUST [be enforced] server-side".
- `notifications/elicitation/complete` and `elicitationId` were **removed** in 2026-07-28. Correlate through `requestState` instead.

**`requestedSchema` limits.**
- A flat object of primitives only: string (with `minLength`, `maxLength`, `format` of `email|uri|date|date-time`, `default`), number/integer (`minimum`/`maximum`), boolean, and enums.
- Enum forms: single-select `enum` or `oneOf[{const,title}]`; multi-select `type:"array"` with `items.enum` or `items.anyOf`, plus `minItems`/`maxItems`.
- No nesting and no arrays of objects.
- Form mode MUST NOT request "passwords, API keys, access tokens, or payment credentials."

**Actions.** `accept` carries `content`. `decline` is an explicit no. `cancel` means the user dismissed it, or the "browser failed to load".

**URL mode.** `{mode:"url", url, message}`.
- `accept` means "consented to open", **not** that the interaction completed. The server decides on the retry from `requestState` or its own store.
- The server MUST NOT include PII or credentials in the URL, and "MUST NOT provide a URL which is pre-authenticated".
- The server MUST verify that the user who opens the URL is the one who triggered it (the spec's `sub`-matching phishing example).
- "MCP servers MUST NOT rely on URL mode elicitation to authorize users for themselves." MCP auth stays OAuth.
- Its stated uses include "auth flows, payment processing, and other sensitive or secure operations".
- Claude Code caps URL length at about 8,000 unescaped chars (about 4,000 when heavily percent-encoded).

**[SEP-2848](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2848)** (async tool approval, `io.modelcontextprotocol/tool-approval`): a *requestable denial* returns a Tasks handle, the approval resolves out of band, and the server re-evaluates and executes at most once. It adds `io.modelcontextprotocol/tool-approval-disposition`. Status: **open, draft**; no WG, no reference implementation; depends on Tasks and on SEP-2643 (open).

**Prior art without elicitation.**
- **Stripe**: certain `stripe_api_write` actions (refunds, outbound payments) return a URL. The human approves in the Stripe dashboard, "Stripe provides the agent with an approval token", the user tells the agent to retry, and approval expires after 24 h ([docs](https://docs.stripe.com/mcp)).
- **GitHub**: `assign_copilot_to_issue_with_intent` takes `is_suggestion` ("records a pending Copilot assignment intent rather than launching the agent. Approval later supplies the launch context"), plus required `rationale` and `confidence` (`HIGH|MEDIUM|LOW`), in toolset `copilot_issue_intents` ([README](https://github.com/github/github-mcp-server)).

**Evidence that elicitation is not proof of a human.**
- The Claude Code `Elicitation` hook can auto-respond.
- The Agent SDK's `canUseTool` can approve.
- Codex app-server auto-declined elicitations ([#45621](https://github.com/openai/codex/issues/45621)).
- The roadmap lists "human-presence attestation" as only "under discussion".

**Design for clients without elicitation.** Check `clientCapabilities.elicitation` on every request. When it is absent, return a normal result that is **not** `isError`, with `status:"awaiting_human_approval"`, the Vloer approval URL (Stripe pattern) as text plus a `resource_link`, and no side effect.

**Verdict.** **ADOPT NOW**, with these changes to the ADR's plan:
1. Put an **approval digest** in the form `message`: Work Item, Team, estimated and authorized budget, and expiry.
2. The schema is a single boolean `confirm` (Codex renders empty or trivial schemas as approval prompts). Act only on `accept` && `confirm===true`.
3. Seal `requestState` with AEAD, containing {principal `sub`, workItemId, budget, a digest of the *current* Work Item version, `exp`≤5 min}. Enforce **single use in Ploeg** with an idempotency key, and re-read budget and state at execution.
4. Set `_meta["anthropic/requiresUserInteraction"]: true` on `glide_approve_work`, `glide_reject_work` and `glide_cancel_work`, and `annotations.destructiveHint:true` on approve and cancel.
5. Fall back to the Vloer link when elicitation is not declared.

URL-mode elicitation to a Vloer approval page, verified against the same Authentik `sub`: **LATER**. Trigger: the remote OAuth phase is live. After that, use it for approvals above a spend threshold, because it is the only path that is not answerable by a local hook. SEP-2848: **LATER**, triggered by Final status plus Tasks client support.

---

## 4. MCP Apps (`io.modelcontextprotocol/ui`)

**Mechanics** ([SEP-1865](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1865), merged 2026-01-28; [draft spec](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx); stable spec `2026-01-26`; ext-apps **v2.0.0** released 2026-09-08 as a TS SDK 2.x migration, "2.x Views run in 1.x hosts").
- A tool points to its UI with `_meta.ui.resourceUri: "ui://…"`. The flat `_meta["ui/resourceUri"]` is deprecated.
- The resource has `mimeType: "text/html;profile=mcp-app"`, and its `_meta.ui` carries:
  - `csp` {`connectDomains`, `resourceDomains`, `frameDomains`, `baseUriDomains`}. The host MUST NOT allow undeclared domains.
  - `permissions`, `domain` and `prefersBorder`.
- `visibility` defaults to `["model","app"]`. For app-only tools, the host MUST hide them from the model and MUST reject app calls to tools without `"app"`.
- The postMessage JSON-RPC bridge uses:
  - lifecycle: `ui/initialize`, `ui/notifications/initialized`, `ui/resource-teardown`;
  - tool data pushed to the view: `ui/notifications/tool-input`, `…/tool-input-partial`, `…/tool-result`, `…/tool-cancelled`;
  - requests from the view: `ui/message`, `ui/update-model-context`, `ui/open-link`, `ui/request-display-mode`, `ui/download-file`;
  - plus `tools/call` and `resources/read` from the app, proxied by the host.
- Security model: a sandboxed iframe, and all traffic goes through the host. "Host … MAY decide to block some messages or subject them to further user approval". The approval granularity (per-app-instance, per-server or per-tool) is left to host discretion.
- On content fields the conventions diverge:
  - The Apps spec says `structuredContent` is "optimized for UI rendering (not added to model context)".
  - ChatGPT says `structuredContent` is "Surfaced to the model and the component" and `_meta` is "Hidden from the model" ([reference](https://developers.openai.com/apps-sdk/reference)).
- ChatGPT keeps `window.openai` (`callTool`, `setWidgetState`, `sendFollowUpMessage`, `requestDisplayMode`, `openExternal`, `requestModal`) as optional extensions, with `openai/outputTemplate` as a compatibility alias.

**Renderers.** Claude web and Desktop, ChatGPT, Cursor, VS Code Copilot, M365 Copilot, Goose, Postman, MCPJam, Archestra, PostHog Code. **Not** Claude Code; Codex is not documented.

**Is an approval card a good idea?** Not as the approval path.
- A click in an app becomes a `tools/call` that the host may auto-approve under a per-server trust policy.
- The server cannot tell an app click from a model call; there is no attestation.
- An app-only (`visibility:["app"]`) approve tool is invisible in Claude Code and Codex.

**Is a run dashboard a good idea?** It is a decent read-only fit ("Real-time monitoring" is a listed use case). It still means building and securing a vanilla-JS bundle, it only renders on hosts people use for Glide, and every host still needs a text fallback.

**Gateway interaction.** agentgateway's default prefixing "can interfere with app-originated tool calls that use the tool's plain name" ([solo docs](https://docs.solo.io/agentgateway/kubernetes/latest/documentation/mcp/apps/)).

**Verdict.** **LATER**. Trigger: the remote OAuth phase is live **and** Claude.ai or ChatGPT is where people actually read Glide state. Then build a read-only run and spend view (tables, not timeseries) with `connectDomains:[]`. Approval card as the approval path: **NEVER**.

---

## 5. Resources, resource templates and prompts

**Mechanics.**
- Resources and `resources/templates/list` (for example `glide://work-items/{id}`); `resources/read` supports MRTR.
- `resource_link` content in tool results is allowed, and the linked resources are "not guaranteed to appear in `resources/list`".
- Updates come through `subscriptions/listen` with `resourceSubscriptions:[uris]`, delivering `notifications/resources/updated` ([subscriptions](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions)). `resources/subscribe` was removed.
- The not-found error code is now `-32602`.
- Prompts are "user-controlled", for example slash commands; `prompts/get` supports MRTR ([prompts](https://modelcontextprotocol.io/specification/2026-07-28/server/prompts)).

**Support.**
- Claude Code: `@server:protocol://path` mentions, a resource list tool for the model, and prompts as `/server:prompt (MCP)` with arguments split on whitespace.
- Claude.ai: tools, prompts and resources, no subscriptions.
- Cursor: prompts and resources.
- ChatGPT and Codex: prompts and resources not documented. ChatGPT's "company knowledge" expects standard `search`/`fetch` tools.

**Cost/benefit.** A template is cheap, mirrors `glide_get_work`, and gives Claude Code users @-mention context without a tool call. Prompts are cheap, carry no authority, and work as discoverable workflows. Subscriptions have no consumer among the target clients.

**Verdict.** **ADOPT NOW**:
- One template, `glide://work-items/{id}`, with `cacheScope:"private"` and a short `ttlMs`.
- `resource_link` in `glide_find_work` results.
- 2–3 prompts, for example `glide_whats_waiting` and `glide_propose_from_description`.

Subscriptions: **LATER**, triggered when a target client documents `resourceSubscriptions`. ChatGPT `search`/`fetch` compatibility: **LATER**, triggered if Glide should appear as a ChatGPT company-knowledge source.

---

## 6. Server instructions

**Mechanics.** `DiscoverResult.instructions`: "Optional natural-language guidance for LLMs" ([discover](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)). The discover result is cacheable (`ttlMs`, `cacheScope`).

**Client use.**
- Claude Code loads instructions at session start next to tool names. With tool search "Server instructions help Claude understand when to search for your tools". Truncated at 2,048 chars; counted in `/context`.
- ChatGPT and Codex use them; OpenAI says to keep the key details in the first 512 chars and not to change the model's personality.

**Evidence.** A [scan of 8,235 live registry servers](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3213) (2026-08-28, in comments on #3213):
- 66% return instructions;
- median 577 chars, max 68,669;
- concealment phrases occur ("do not mention it to the user");
- "no client I'm aware of displays it".

**Injection concern.** [#3213](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3213) (open): instructions are an unsanitized, server-controlled system-prompt path. Combined with `cacheScope:"public"` a shared cache can serve them across users ([#3207](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3207), open; a comment notes the spec's cache key omits server identity).

**Verdict.** **ADOPT NOW**, at ≤512 chars, static, with no per-user data (so `public` is safe). Content:
- what Glide is (Work Item, Run, Shift);
- "read `glide_overview` first";
- "proposals never start paid work";
- "never approve or cancel on the user's behalf; the approve tool asks the human";
- handle and polling cadence.

---

## 7. Skills extension (`io.modelcontextprotocol/skills`)

**Mechanics** ([SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640), Final, merged 2026-09-13; [overview](https://modelcontextprotocol.io/extensions/skills/overview)).
- Requires the `resources` capability plus the extension, with an optional `directoryRead`.
- `skills/list` and `skills/get` return {`uri` (normally `skill://<name>/SKILL.md`), `frontmatter`, `resources`: a manifest of uri, sha256 `digest` and `size`, or `"dynamic"`}. Content is fetched through `resources/read`; `resources/directory/read` is optional.
- Hosts MUST verify digests, bind approval to the manifest, and not prefetch.
- Servers SHOULD NOT exceed 512 files or 16 MiB per skill.
- The content format is the [Agent Skills spec](https://agentskills.io/specification), the same `SKILL.md` format Anthropic's Agent Skills use.

**Support** (matrix): ChatGPT partial (import limits of 5 skills, `SKILL.md` ≤256 KiB, 100 files, 5 MiB per skill), fast-agent partial, Inspector partial, mcpc full. **Claude Code, Claude.ai, Cursor and Codex are not listed.** Anthropic's documented route is a **plugin** that bundles `.mcp.json` with skills: "any skills you include teach Claude how to use it" ([building](https://claude.com/docs/connectors/building)). Stripe ships the same way (`stripe agent setup`).

**Does it help a server teach its workflow?** Yes, in principle: it carries versioned, digest-pinned workflow text that is too long for instructions. Today it reaches almost none of the target clients.

**Verdict.** **LATER**. Trigger: Claude Code or Codex appears in the matrix for Skills (go-sdk would need custom methods). **ADOPT NOW** the portable half: write one `glide-operator` `SKILL.md` (agentskills.io format) and ship it in a Claude plugin with the `.mcp.json`. The same file can be served over the extension later unchanged.

---

## 8. Structured output and response shape

**Mechanics.**
- `outputSchema` now takes any JSON Schema 2020-12, and `structuredContent` any JSON value ([SEP-2106](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2106)).
- With an `outputSchema`, servers "MUST provide structured results that conform".
- "a tool that returns structured content SHOULD also return the serialized JSON in a TextContent block."
- Business errors go in `isError:true` results; protocol errors are JSON-RPC errors.

**Practice.**
- OpenAI's example returns `structuredContent:{projects}` plus text `"Found N projects."`.
- Anthropic recommends a `response_format` enum (`concise`/`detailed`); their Slack example was 206 tokens detailed versus 72 concise. It also recommends semantic IDs over UUIDs, pagination and filters, and actionable errors ([post](https://www.anthropic.com/engineering/writing-tools-for-agents)).
- The roadmap admits the `content`/`structuredContent` duality "has confused server and client authors alike and produced diverging implementations" and plans a "Tool result shape" redesign (see the divergence in section 4).

**Verdict.** **ADOPT NOW** on every read tool: `outputSchema` plus `structuredContent`, and a `content` text block that holds a short human summary followed by compact JSON. That satisfies the SHOULD and survives clients that drop either field.
- Money: integer minor units plus `currency` in structured output; the text shows it with 2 decimals in nl-NL format.
- Add a `detail:"summary"|"full"` argument only to `glide_get_work` and `glide_recent_runs`.
- Keep responses under 25k tokens (Claude Code) and 150k chars (claude.ai).

---

## 9. Caching

**Mechanics** ([caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching), [SEP-2549](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2549)).
- `ttlMs` (≥0; 0 means stale) and `cacheScope` (`public`|`private`) are MUST on `server/discover`, `tools/list`, `prompts/list`, `resources/list`, `resources/templates/list` and `resources/read`.
- Results from MRTR retries MUST NOT be cached.
- `private` means caches "MUST NOT be shared across authorization contexts", and it is required for "filtered list results that vary per user".
- The same scope applies to every page.
- `listChanged` notifications invalidate. Servers "SHOULD return tools … in a deterministic order" for prompt-cache hits.
- Claude Code keeps a discovery cache ("cached 2h ago · connects on first use").
- ETags are roadmap-only: "extend our caching approach to support ETags … in particular tool calls."

**Verdict.** **ADOPT NOW**:
- Sort tools by name, and keep descriptions byte-stable across releases unless they actually change.
- `tools/list` and `prompts/list` are `private` because they vary by toolset grant, with `ttlMs` about 1 h.
- `server/discover` is `public` with no user data.
- `resources/read` of Work Items is `private` with `ttlMs` 0–30 s.
- Use go-sdk v1.8 `SetCacheable`.

ETag: **LATER**, once it is specified.

---

## 10. Per-principal tool surfaces

**Mechanics.** `tools/list` "MUST NOT vary per-connection … MAY vary by the authorization presented on the request."

Prior art:
- **Sentry**: `/mcp/{organizationSlug}/{projectSlug}` scoping, where "unnecessary discovery tools are hidden", plus `?skills=` and `?disable-skills=`.
- **GitHub** ([remote docs](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md)): `/readonly`, `/x/{toolset}[/readonly]`, `/insiders`, and the headers `X-MCP-Toolsets`, `X-MCP-Tools`, `X-MCP-Readonly`, `X-MCP-Lockdown`, `X-MCP-Insiders`. Read-only "takes priority" over explicitly requested write tools.
- **Stripe**: the `Stripe-Account` header.
- `x-mcp-header` mirrors primitive arguments into `Mcp-Param-*` headers for routing. It SHOULD NOT carry secrets.

**Traps.**
- Path and header narrowing is client configuration, not authorization. Intersect it with token grants: narrow, never widen.
- Per-principal lists must be `private`.
- A revoked grant must also be refused at call time, not just omitted from the list.

**Verdict.** **ADOPT NOW** token-derived toolsets, as the ADR already specifies. Add optional narrow-only `/readonly` and `?toolsets=read,propose`: cheap, and it lets people give a coding agent a read-only Glide. Team scoping via `/mcp/teams/{team}`: **LATER**, triggered by multi-Team principals.

---

## 11. Gateways and composition

**Mechanics.**
- **LiteLLM** ([docs](https://docs.litellm.ai/docs/mcp)):
  - endpoint `/mcp`, with `x-mcp-servers` selecting servers;
  - per-server auth via `x-mcp-{alias}-{header}`, `auth_type: "true_passthrough"` (forwards the client `Authorization` verbatim) or `static_headers`;
  - tool names become `{server}{sep}{tool}`, default separator `-` (`MCP_TOOL_PREFIX_SEPARATOR`), and server names cannot contain `-`;
  - the docs describe `initialize`-based negotiation; 2026-07-28 support is not documented.
- **agentgateway**: `prefixMode` `Conditional|Always|Never`, rewrites `ui://` URIs, authorizes on the origin tool name, and has announced 2026-07-28 support ([blog](https://agentgateway.dev/blog/2026-08-03-new-mcp-spec-revision/)).
- **Docker sbx gateway** silently drops one of two same-named tools ([#636](https://github.com/docker/sbx-releases/issues/636)).
- The spec says aggregators SHOULD prefix and that `serverInfo.name` is not unique.

**Should ploeg-mcp sit behind LiteLLM for agents?** The ADR says Runs get no Glide MCP server, and that holds. Exposing approve or propose to Run agents would give a model a path toward paid work. `true_passthrough` would also forward user tokens, which is token passthrough and fails audience validation.

**Verdict.** South side (Runs through LiteLLM): **NEVER**. North side behind a shared gateway: **LATER**, triggered by an estate-wide MCP gateway. Before that:
- verify that MRTR `input_required`, `_meta["anthropic/requiresUserInteraction"]` and `cacheScope:"private"` survive the gateway;
- keep names unique and `glide_`-prefixed (they become `glide-glide_*`, ugly but collision-free);
- never let an app depend on plain tool names.

---

## Fifteen sharpest traps

1. **Elicitation `accept` is not proof of a human.** Claude Code `Elicitation` hooks, Agent SDK `canUseTool` and headless modes can answer it. Paid-work approval must be single-use and server-verified, and approvals above a threshold should go out of band to Vloer with a `sub` match.
2. **`requestState` is attacker-controlled.** Unsealed state carrying workItemId or budget lets a client swap the target. AEAD-seal {sub, workItem, version digest, budget, exp}, and enforce single use in Ploeg because the spec's measures don't guarantee it.
3. **The client's capability can vary on each request.** Sending `elicitation/create` without the declared capability violates a MUST, and an empty `elicitation:{}` means form only, never URL.
4. **URL-mode `accept` means "opened", not "approved".** The server must check completion on retry. The URL must not be pre-authenticated, and the server must verify the same user opened it, or one user's link can approve another's work.
5. **Timeout mismatch.** Codex defaults to 60 s, claude.ai caps at 240 s, and Claude Code has a 5-minute idle timeout and backgrounds calls at 2 minutes. A Sentry-style 5-minute blocking wait fails on two of the five target clients. Cap waits at 45 s or less and return partial state.
6. **Tasks without declaration.** Returning `CreateTaskResult` to a client that didn't declare it is a MUST NOT (`-32021`). None of the target clients declare it and go-sdk lacks it.
7. **`cacheScope:"public"` on a per-principal `tools/list`** leaks one principal's tool set to others through shared caches. Filtered lists must be `private`. The cache key has no server identity (#3207).
8. **Instructions are truncated and untrusted.** Claude Code cuts at 2,048 chars and ChatGPT weighs the first 512. Anything critical placed later is lost, and per-user text in a cacheable discover result leaks.
9. **A generic `execute` tool erases per-tool annotations, permission rules, `requiresUserInteraction`, Codex approval modes and gateway allowlists.** Never route approve through a generic executor.
10. **Divergent `content`/`structuredContent` semantics.** The Apps spec says `structuredContent` is not model context; ChatGPT shows it to the model. Always put the decision-relevant summary in `content` as well.
11. **An MCP Apps button is not a human signal.** App `tools/call` goes through host policy that may be per-server auto-approve, and app-only tools vanish in Claude Code and Codex.
12. **Gateway prefixing breaks apps and hides `_meta`.** agentgateway notes that prefixing breaks app-originated calls, and Docker's gateway silently drops duplicates. Verify that `anthropic/requiresUserInteraction` passes through.
13. **Header or path toolsets treated as authorization.** `/readonly`, `?toolsets=` and `X-MCP-*` headers are client-editable. Only token grants decide; the others may only narrow.
14. **Non-deterministic tool order or churned descriptions** invalidate client discovery caches and upstream prompt caches on every deploy.
15. **go-sdk stateful HTTP silently downgrades to 2025-11-25.** 2026-07-28 over HTTP needs `Stateless=true`. MRTR then reaches legacy clients only through the SDK shim, so test the elicitation path against both protocol versions (Claude.ai OAuth docs stop at 2025-11-25).

## Summary of verdicts

| Pattern | Verdict |
|---|---|
| 1. Search + execute | Search/execute LATER (trigger: more than about 25 tools); code mode NEVER |
| 2. Long-running work | Handle + poll + ≤45 s capped wait with progress: NOW; Tasks LATER |
| 3. Human in the loop | Sealed single-use form elicitation + `requiresUserInteraction` + Vloer link fallback: NOW; URL mode LATER (OAuth phase); SEP-2848 LATER |
| 4. MCP Apps | Read-only dashboard LATER; approval card as the approval path NEVER |
| 5. Resources and prompts | Work-item template + `resource_link` + 2–3 prompts: NOW; subscriptions LATER |
| 6. Instructions | NOW, ≤512 chars, static |
| 7. Skills | Extension LATER; `SKILL.md` in a Claude plugin NOW |
| 8. Structured output | `outputSchema` + summary text + JSON: NOW |
| 9. Caching | Sorted tools, private per-principal lists: NOW; ETag LATER |
| 10. Per-principal surfaces | Token-derived toolsets + narrow-only `/readonly`: NOW; Team paths LATER |
| 11. Gateways | Runs through LiteLLM NEVER; north-side gateway LATER |

## Absences found

- Tasks client support is not documented for Claude Code, Claude.ai, ChatGPT, Cursor or Codex.
- Claude.ai elicitation is not documented.
- URL-mode support in Cursor, ChatGPT and Codex is not documented.
- ChatGPT timeouts are not documented.
- Devin gather's maximum and timeout behaviour are not documented.
- LiteLLM's 2026-07-28 support is not documented.
- Neither go-sdk v1.7.0 nor v1.8.0 mentions the Tasks, Apps or Skills extensions.
- No MCP mechanism attests human presence; it is only "under discussion" on the roadmap.
