# Reaching Glide from AI clients over MCP

Date: 29 September 2026, against `origin/development` at `6de34d0`. This is a record. The decision it supports is [ADR-0011](../adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), **accepted on 2026-09-30** with the remote phase in scope. How to build it is in the follow-up record, [Building ploeg-mcp: patterns and traps](2026-09-30-mcp-server-patterns.md). Nothing described here as a tool, route or phase is implemented.

> **Method.** Eight research agents: the MCP specification, its repositories and SDKs, the client ecosystem with absence checks for every component Glide runs, a second client matrix, prior art from agent platforms that already expose themselves over MCP, security, and a read-only seam map of this repository. Their raw reports are in [evidence/2026-09-29-mcp-access/](evidence/2026-09-29-mcp-access/). These claims were checked first-hand rather than taken from an agent: `/specification/latest` redirects to `2026-07-28`; the Go SDK's latest release is v1.8.0 (2026-09-14) and its Tasks issue [go-sdk#626](https://github.com/modelcontextprotocol/go-sdk/issues/626) is open; `StreamableHTTPOptions.Stateless` exists in the SDK source; Claude Code documents elicitation dialogs; Claude.ai lists static request headers as a limited beta and lists resource subscriptions and sampling as unsupported; every Ploeg operator route named below exists on `origin/development`, and `POST /api/v1/operator/work-items` answers `405`; no local or remote branch implements that route; the homelab runs LiteLLM `v1.102.1`.

## Verdict

**Adopt MCP narrowly and north-facing: one small Glide MCP server, a separate `ploeg-mcp` command that is a named consumer of Ploeg's existing operator API.** It reads everything, proposes work, and only lets paid work start after a person approves it through a channel the model cannot answer for. Runs do not get a Glide MCP server; they keep reporting through the outcome drop box. MCP fits the one seam Glide leaves open, which is a person's own AI client talking to Glide. The protocol is mature enough: a stable Tier-1 Go SDK, a stateless 2026-07-28 revision that matches Ploeg's stateless HTTP, and support in more than twenty clients. MCP carries no budget, authority or tenant, so Ploeg keeps all three.

Summary:

1. **Glide is already reachable over MCP, indirectly.** Creating and assigning a ticket through a tracker's MCP server (the Vikunja MCP bridge the owner uses today, [Vikunja's native server](https://vikunja.io/help/mcp/) from 2.7.0, or [ClickUp's official server](https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server)) fires the assignment webhook, and Ploeg opens a Shift. What that path cannot show is Glide's own state: Runs, spend, `needs_human`, reviewer Verdicts, the pull request, proposed work waiting for approval. That gap is what a Glide server is for.
2. **Most of the server's backend already exists.** The operator API has named consumers with Team scope, an `execute` flag and a budget ceiling, plus read routes for teams, Work Items, Runs, summary and events, and write routes for approve, reject and cancel ([operator.go](../../apps/ploeg/pkg/httpapi/operator.go), [operator_proposed.go](../../apps/ploeg/pkg/httpapi/operator_proposed.go), [withdraw.go](../../apps/ploeg/pkg/httpapi/withdraw.go)). The one missing route is `POST /api/v1/operator/work-items`, proposed in [Unfold ADR-0023](../../apps/unfold/docs/adrs/0023-unfold-submits-work-to-ploeg-and-never-executes-it.md) and not built on any branch.
3. **Paid work stays behind a human.** A Work Item created over MCP enters as `proposed`, the same state Run-created work waits in ([Ploeg ADR-0031](../../apps/ploeg/docs/adrs/0031-runs-create-work-items-held-for-approval-within-limits.md)) and the agency offering uses for client approval. Approval over MCP requires an elicitation form the client shows to the person; a client without elicitation gets a link to approve elsewhere and nothing is dispatched.
4. **Local first, remote with OAuth later.** Phase one is stdio with an operator token from the environment, which the spec prescribes for local servers and which Claude Code, Codex, Cursor, Zed, opencode, Goose and Qwen Code all run. Claude.ai and ChatGPT accept only OAuth (Claude.ai's static headers are a limited beta), so the remote phase needs an OAuth resource server against Authentik and a public route, and it gets its own security review.
5. **No Tasks, no sessions.** Every shipped agent-dispatch server returns an id and polls; none uses MCP Tasks, no client documents Tasks support, and the Go SDK does not implement the Tasks extension. Glide does the same: tools return Work Item ids, and a `changes since` tool reads the audit cursor.
6. **The south side has a real gap to close first.** `claude-code` Runs load no MCP servers, but the ACP profiles do not neutralise repository MCP configuration for opencode, Goose (`.agents/plugins/`) and Qwen Code (`.qwen/settings.json`). That is fixable independently and is the higher-risk finding of this sweep.

## 1. What MCP is today

Current revision **`2026-07-28`**, released 2026-07-28 ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)). It is a breaking redesign that made the protocol smaller:

- **Stateless.** The `initialize` handshake and `Mcp-Session-Id` are gone (SEP-2575, SEP-2567). Every request carries its protocol version and client capabilities in `_meta`; servers must implement `server/discover`. State that spans requests "**MUST** be referenced by an explicit identifier the client passes on each request."
- **No resumability.** SSE `Last-Event-ID` and redelivery are removed; "a broken response stream loses the in-flight request; clients **MUST** re-issue it." Mutating tools must therefore be idempotent ([spec#3394](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3394) documents the double-execution this causes).
- **Multi Round-Trip Requests (MRTR)** replace server-initiated requests. A tool returns `resultType: "input_required"` with an elicitation request, and the client retries with the answer. `requestState` is attacker-controlled input and must be integrity-protected.
- **Tasks became an extension** (`io.modelcontextprotocol/tasks`, SEP-2663, Final): server-directed, poll-based (`tasks/get`, `tasks/update`, `tasks/cancel`), statuses `working | input_required | completed | cancelled | failed`, cooperative cancel. It is not wire-compatible with the 2025-11-25 experimental Tasks. The [extension client matrix](https://modelcontextprotocol.io/extensions/client-matrix) lists no client for it.
- **Deprecated:** Roots, Sampling, Logging, the HTTP+SSE transport, and Dynamic Client Registration in favour of Client ID Metadata Documents (CIMD).
- **Authorization** is optional, and when used over HTTP the server is an OAuth 2.1 resource server: it must publish Protected Resource Metadata (RFC 9728), validate that tokens were issued for it (RFC 8707 audience), and "**MUST NOT** accept or transit any other tokens" ([authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)). Local stdio servers "retrieve credentials from the environment".
- **Tool annotations** (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) are hints; clients must not trust them from untrusted servers, and servers must still authorize every call.
- **MCP Apps** (`io.modelcontextprotocol/ui`, SEP-1865) renders server-supplied HTML in a sandboxed iframe. Claude web and desktop, ChatGPT, VS Code, Cursor, Goose and M365 Copilot render it; Claude Code does not.
- **Nothing about money.** The normative schema has no budget, cost, quota, tenant or lease concept; the only `cost` field is a sampling hint, and sampling is deprecated. This matches what the [2026-09-18 interaction-layer dossier](../../apps/unfold/docs/research/2026-09-18-band-and-the-interaction-layer.md) found.

Governance: donated to the Agentic AI Foundation (a Linux Foundation directed fund) on 2025-12-09. Four of eight lead and core maintainer seats are Anthropic; Microsoft, Google, AWS and OpenAI hold the others. A proposed release cadence ([SEP-3398](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3398)) would put revisions in March and September from 2027.

SDKs in Glide's languages ([evidence](evidence/2026-09-29-mcp-access/sdks-and-repos.md)):

| | Go: `modelcontextprotocol/go-sdk` | TypeScript: `@modelcontextprotocol/server` v2 |
| --- | --- | --- |
| Status | Tier 1, v1.8.0 (2026-09-14), maintained by Google's Go team; used by github-mcp-server, gopls, gitea-mcp and Vikunja | Tier 1, v2.2.0 (2026-09-28) |
| 2026-07-28 over HTTP | Only with `StreamableHTTPOptions{Stateless: true}` | Native |
| OAuth resource server | `auth.RequireBearerToken`, `auth.ProtectedResourceMetadataHandler` | `requireBearerAuth`, `buildOAuthProtectedResourceMetadata` |
| Elicitation (MRTR) | Yes | Yes |
| Tasks extension | **No** (issue #626 open) | **No** in v2; separate `ext-tasks` package |
| Testing | `mcp.NewInMemoryTransports()`; [official conformance suite](https://github.com/modelcontextprotocol/conformance) | In-process `fetch` handler; same suite |

## 2. What Glide can already do over MCP

| Job a person wants from their AI client | Today | Through what |
| --- | --- | --- |
| Create a Work Item and hand it to agents | Works | Tracker MCP: create a task, assign it to the Team's agent user; the webhook opens the Shift |
| Stop work | Works | Tracker MCP: unassign or close the task ([withdraw.go](../../apps/ploeg/pkg/httpapi/withdraw.go)) |
| See Runs, Verdicts, spend, the PR, what is stuck | **No** | Only Unfold's screens and the operator API |
| Approve or reject work a Run proposed | **No** | Only Unfold or a direct operator API call |
| Create a Work Item with no tracker | **No** | No route exists |
| Ask "what changed since this morning" | **No** | Operator events, polled by Unfold only |

The first two rows need documentation, not code. The rest need the server this record proposes.

## 3. Layer map

| Seam | Implements it today | What MCP claims | Fit |
| --- | --- | --- | --- |
| A person's AI client → Glide state | **Nobody** | Tools and resources | **The honest fit** |
| A person's AI client → creating and steering work | The tracker's own MCP server | Tools | Complementary: MCP adds tracker-less work, approve and cancel |
| Human approval of paid work | Unfold, tracker assignment, `/approve` | Elicitation (form mode, via MRTR); MCP Apps; SEP-2848 async approval (proposal) | Partial: client support is uneven, so a fallback link is required |
| Long-running Run progress | Operator events, cursor-polled | Tasks extension | Not yet: no client, no Go SDK support |
| Identity of the person | Static named consumer bearers; Unfold's Authentik OIDC | OAuth 2.1 resource server, CIMD, ID-JAG | Fits for the remote phase |
| **Budget, spend authorization** | Ploeg ([ADR-0012](../../apps/ploeg/docs/adrs/0012-two-level-budgets-authorized-and-settled.md)) | **Nothing** | Ploeg keeps it |
| **Tenancy** | Nothing in code; agency ADR-0009 proposes it | **Nothing** | Ploeg will own it |
| **Leases, claims, exactly-once** | Ploeg ([ADR-0010](../../apps/ploeg/docs/adrs/0010-shift-owns-the-item-lease-owns-the-branch.md)) | **Nothing**; Tasks cancel is cooperative | Ploeg keeps it |
| Agent in a Run → tools | Deliberately none; `--strict-mcp-config`, empty ACP `mcpServers` | Tools via ACP `mcpServers` | Only through LiteLLM's gateway (VIK-1300) |
| Agent in a Run → Glide ("work creates work") | Outcome drop box ([ADR-0018](../../apps/ploeg/docs/adrs/0018-the-outcome-drop-box-is-every-harnesss-return-path.md), [ADR-0031](../../apps/ploeg/docs/adrs/0031-runs-create-work-items-held-for-approval-within-limits.md)) | Tools | **Rejected**: the worker never calls Ploeg APIs ([ADR-0011](../../apps/ploeg/docs/adrs/0011-the-pull-request-is-the-blackboard.md)) |
| Discovery | Nothing | Registry (preview, no private servers), Server Cards (experimental) | Later |

The bold rows are the same four absences the interaction-layer dossier found: MCP has "a defined purpose: connecting AI applications to data sources", and budget, authority and delivery stay with Glide.

## 4. Component by component

- **ploegd** — complementary. Its operator API is the backend; it is not exposed to the internet ([Unfold ADR-0015](../../apps/unfold/docs/adrs/0015-ploeg-operator-read-api.md): "the external gateway keeps `/webhooks/` only"), and it holds the LiteLLM master key and forge admin token. Putting an internet-facing OAuth surface into the same process would widen the most privileged process in Glide; a separate command keeps ploegd internal.
- **ploeg-worker and harnesses** — orthogonal, and kept that way. Runs reach only the gateway, the forge and ploegd, and never call Ploeg's API ([ADR-0011](../../apps/ploeg/docs/adrs/0011-the-pull-request-is-the-blackboard.md), [ADR-0034](../../apps/ploeg/docs/adrs/0034-the-harness-gets-placeholders-the-worker-keeps-credentials.md)). What Ploeg does today with MCP inside a Run:
  - `claude-code`: `--strict-mcp-config` with no `--mcp-config`, so no server loads, including the target's `.mcp.json` ([claudecode.go](../../apps/ploeg/pkg/harness/adapters/claudecode/claudecode.go), live test `TestLiveClaudeCodeIgnoresTargetHooksAndMCPServers`).
  - `acp`: `session/new` sends `mcpServers: []` ([acp.go](../../apps/ploeg/pkg/harness/adapters/acp/acp.go)). That empty list does **not** stop an agent reading MCP servers from the repository's own configuration: Goose enables servers from `.agents/plugins/` ([acp-profiles.md](../../apps/ploeg/docs/contracts/acp-profiles.md)), Qwen Code merges `.qwen/settings.json`, and opencode's project `opencode.json` is not addressed in the profile (unverified whether it merges). This is the most urgent finding here.
  - `.mcp.json` is scanned and hashed before the harness starts ([instructions.go](../../apps/ploeg/pkg/worker/instructions.go)) but not stripped.
- **LiteLLM** — complementary, south side. Its MCP gateway grants servers per key, team or access group, tracks MCP cost and keeps upstream credentials out of the sandbox. VIK-1300 already uses it to give Runs Omnigraph tools. The deployed `v1.102.1` is past the fix for [CVE-2026-30623](https://docs.litellm.ai/blog/mcp-stdio-command-injection-april-2026) (authenticated RCE through MCP server creation, fixed in 1.83.7).
- **Unfold** — adjacent. It already has Authentik sign-in, roles and per-user Team scope, and it proxies approve, reject and cancel. It is not the home for the server: its production npm dependency set must stay empty ([Unfold ADR-0002](../../apps/unfold/docs/adrs/0002-native-node-and-single-writer-storage.md), enforced by `scripts/check.mjs`), so it would have to hand-roll the protocol, and an install that runs Ploeg without the Unfold application would have no MCP. Unfold stays the place a person approves work when their client cannot show an elicitation form.
- **Vikunja** — complementary. Its native MCP server (merged 2026-09-15, [PR #3860](https://github.com/go-vikunja/vikunja/pull/3860), released from 2.7.0) is stateless, token-authenticated, has no OAuth ([#3930](https://github.com/go-vikunja/vikunja/issues/3930)), and uses 24 typed tools plus `find_action`/`do_action`.
- **ClickUp** — complementary. Official remote server, OAuth only with a redirect allowlist, 50 calls a day on the free plan and 300 on Unlimited.
- **Forgejo** — absent. No official MCP server; the community [forgejo-mcp](https://git.b4mad.industries/agentic-forges/forgejo-mcp) left Codeberg over its LLM policy. `gitea-mcp` never mentions Forgejo.
- **Authentik** — needed for the remote phase. Whether it supports CIMD or dynamic client registration was not established; Claude.ai and ChatGPT both accept a pre-registered client, which is the safe assumption.
- **Glide, Ploeg and Vloer (now the Unfold application) by name** — zero external MCP presence (GitHub and code search, 2026-09-29).

## 5. Prior art

Full per-product findings: [prior-art.md](evidence/2026-09-29-mcp-access/prior-art.md). What changes the design:

- **Few products expose agent dispatch over MCP at all.** Only Devin (`mcp.devin.ai`, 13 tools), Warp Factory (closed beta) and Tembo (generated from OpenAPI) do, plus the Copilot tools inside GitHub's server. Cursor, Jules, OpenHands, Factory and Codex cloud expose REST or a CLI; OpenAI **removed** `codex mcp-server` in 2026.
- **Id plus poll is universal.** Create returns an id and URL; status is a separate tool. Two products add a capped blocking wait (Devin `devin_session_gather`; Sentry's Seer polls for at most five minutes, then tells the user to run the same call again). Nobody uses MCP Tasks or progress notifications for runs. Claude Code backgrounds a tool call after two minutes, and Claude.ai times out at 240 seconds.
- **Propose, then approve.** GitHub's `assign_copilot_to_issue_with_intent` with `is_suggestion: true` "records a pending Copilot assignment intent rather than launching the agent". Stripe returns an approval URL for risky writes and the agent retries afterwards. Jules has `requirePlanApproval`. This is Glide's `proposed` state under another name.
- **The PR and the spend live on the run object.** Devin `pull_requests[]` and `acus_consumed`; Cursor `result.git` and `/usage`; Anthropic Managed Agents a hard `budget.max_list_cost` that idles the session and fires `session.budget_reached`.
- **Fewer tools, split by risk.** GitHub cut its default surface and consolidated tools for 60–90% less context; Copilot went from 40 to 13 built-in tools and scored higher. Anthropic's connector directory rejects catch-all `api_request` tools and requires reads and writes to be separate tools. Consolidate within a risk tier, never across tiers. GitHub removed dynamic toolsets as too complex.
- **Server-enforced read-only.** GitHub `/readonly` beats any requested write tool; Linear `/mcp/readonly`; Tembo requires `--allow-writes`. Warp's "a connected client acts with the full permissions of the account" is the counter-example.
- **Tenancy.** Chosen at OAuth consent and bound into the token (Vercel, Stripe, Tembo), or fixed by URL path and removed from tool schemas so the model cannot override it (Sentry `/mcp/{org}/{project}`). Claude connectors accept a per-customer URL pattern, which suits self-hosted installs.
- **Small fixes that matter.** Accept names and URLs instead of ids (Linear); say when there are more pages; reject unknown parameters; cap output (Claude Code warns at 10,000 tokens).

## 6. The design this record proposes

### Placement

| Option | Verdict |
| --- | --- |
| **A separate `ploeg-mcp` command in `apps/ploeg`, a named operator-API consumer, on go-sdk** | **Chosen.** Tier-1 SDK in Ploeg's language; works without the Unfold application; ploegd stays internal; the operator API is already the contract for named consumers ([Ploeg ADR-0024](../../apps/ploeg/docs/adrs/0024-operator-work-uses-one-execution-authority.md)). Same image, own Deployment, off by default. |
| A `/mcp` route inside ploegd | Rejected: an internet-facing OAuth surface in the process that holds the master keys. |
| Inside Unfold's server | Rejected: needs a production npm dependency or a hand-rolled protocol, and ties MCP to Unfold. |
| Generate MCP from an API description (for example LiteLLM's OpenAPI-to-MCP) | Rejected: Ploeg publishes JSON Schema, not OpenAPI, and a 1:1 wrapper exposes routes without approval semantics. |
| A CLI and a skill instead (`ploegctl`, VIK-568) | Complementary, not a replacement: works in terminal agents only, never in Claude.ai, ChatGPT or on a phone. Both should share one Go client for the operator API. |

### Tools (proposed)

Nine tools, namespaced, returned in a fixed order, each with `title`, annotations, `outputSchema` and a short text summary. Money is shown with two decimals.

| Tool | Toolset | Backed by | Annotation |
| --- | --- | --- | --- |
| `glide_overview` | read | `/summary`, `/teams` | read-only |
| `glide_find_work` (team, state, needs-human, text; paged, says when more pages exist) | read | `/work-items` | read-only |
| `glide_get_work` (by Ploeg id **or** tracker URL; `detail: brief\|full`) | read | `/work-items/{id}`, `/work-items/lookup` | read-only |
| `glide_recent_runs` | read | `/runs` | read-only |
| `glide_changes_since` (cursor) | read | `/events` | read-only |
| `glide_propose_work` | propose | `POST /work-items` in proposed mode (**new route**) | not read-only, not destructive, idempotent |
| `glide_approve_work` | steer | `/work-items/{id}/approve` | destructive (it spends) |
| `glide_reject_work` | steer | `/work-items/{id}/reject` | not destructive |
| `glide_cancel_work` | steer | `/work-items/{id}/cancel` | destructive |

A `glide_message_work` tool waits for the proposed commands route. One prompt, `glide_draft_work_item`, turns a conversation into a Ready Work Item ([Glide ADR-0003](../adr/adr-0003-the-unit-of-work-is-the-work-item.md)). Resources and MCP Apps come later: tools are the only primitive every client supports.

### Rules the server keeps

- **Toolsets are granted, not requested.** The read toolset is the default. Propose and steer are enabled per consumer or per OAuth scope and enforced by the server; a disabled tool is absent from `tools/list`.
- **Proposals never dispatch.** `glide_propose_work` creates a `proposed` Work Item with the MCP principal as its source, counted against per-Team limits like Run-created work. Its idempotency key is derived from principal, Team, title and description, so a retried request after a lost response creates nothing new.
- **Approval needs a person, not a model.** `glide_approve_work` and `glide_cancel_work` return an elicitation form showing the Work Item, Team and budget; only `accept` acts. A client that does not support elicitation gets a refusal with a link to approve in Unfold or the tracker. The operator consumer behind the approve tool needs `execute`.
- **Ploeg still decides.** Every call is authorized again by the operator API (Team scope, `execute`, budget ceiling). Tool annotations are advice to the client, never the control.
- **Ticket text is untrusted.** Tool results that echo Work Item descriptions, findings or comments are delimited and labelled as third-party content.
- **Every call is audited** with principal, tool, argument hash, decision and approval, through Ploeg's existing audit log via `X-Ploeg-Actor` and `X-Ploeg-Acting-User`.

### Identity, by phase

1. **Local (stdio).** `ploeg-mcp` reads the Ploeg URL and one operator consumer token from its environment. One person, one token. Reaching ploegd from a laptop needs an internal route or a port-forward; ploegd has no route today.
2. **Remote for command-line clients.** Streamable HTTP, stateless, behind the internal gateway, with a static bearer: Claude Code, Codex, Cursor, Zed and Goose all send headers.
3. **Remote with OAuth.** `ploeg-mcp` becomes an OAuth resource server for Authentik tokens: Protected Resource Metadata, audience equal to its own URL, Authentik groups mapped to Teams and toolsets, the person's identity passed as the acting user. It never forwards the client's token. Claude.ai reaches it from Anthropic's egress range (`160.79.104.0/21`), so this phase needs a public route and its own security review.

### Never

- A Glide MCP server inside a Run.
- A generic "call any route" or SQL tool.
- A tool that starts paid work without a person's approval.
- Passing the MCP client's token to Ploeg, LiteLLM or the forge.
- MCP Tasks or protocol sessions as the contract for a Run.
- ploegd itself on a public route.
- Repository-supplied MCP configuration loading inside a Run.

## 7. Security requirements

Derived from the spec's [security best practices](https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices), the [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/), the [OWASP MCP cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html) and real incidents ([evidence](evidence/2026-09-29-mcp-access/security.md)). The incidents that shaped these: the GitHub MCP "toxic agent flow" (an issue's text made an over-scoped agent leak private repositories), Supabase (a support ticket plus a service-role token), the Asana cross-tenant leak (about 1,000 organisations, a logic flaw in the MCP layer), and the Claude Code project-file CVEs (CVE-2025-59536, CVE-2026-21852).

**The lethal trifecta applies directly.** Ticket text is untrusted content, customer repositories are private data, and dispatching a Run both spends money and can open a pull request. A tool that lets a model dispatch Runs from ticket text holds all three. That is why proposing and approving are separate tools with separate grants, and why approval needs a person.

Server side:

1. The remote server validates token audience and issuer, rejects every other token, and never forwards one.
2. The read toolset is the default; write toolsets are granted per consumer or scope and enforced before the call; there is no omnibus scope.
3. Every call is authorized at call time against Team scope; ids are never authentication.
4. No tool dispatches paid work without a recorded human approval; `decline` and `cancel` spend nothing.
5. Proposals count against per-Team limits for count, depth and open items; calls are rate-limited per principal.
6. Third-party text in results is delimited and labelled.
7. Every call is in the audit log; secrets are never in a result.
8. `tools/list` is filtered by grant and returned in a fixed order.
9. Tool definitions are versioned in the repository; a change is visible in review.
10. The conformance suite and an in-memory test suite run in CI.

Run side (independent of the server):

1. No harness loads repository-supplied MCP configuration; each ACP profile proves it with a canary like the `claude-code` one.
2. MCP servers reach a Run only through LiteLLM's gateway, with per-Run keys and access groups, never with credentials inside the pod.
3. MCP server processes, if any ever run in a pod, stay under the same default-deny egress as the agent.

## 8. Implementation path

Cheapest first. Epic: [VIK-1512](https://vikunja.webgrip.dev/tasks/1512).

| Phase | Result | Ticket | Needs |
| --- | --- | --- | --- |
| Decide | ADR-0011 accepted or rejected | [VIK-1502](https://vikunja.webgrip.dev/tasks/1502) | The owner |
| 0 | A how-to: drive Glide from an AI client through the tracker's MCP server | [VIK-1503](https://vikunja.webgrip.dev/tasks/1503) | Nothing new |
| 0 | Close the repository-MCP gap in the ACP profiles | [VIK-1504](https://vikunja.webgrip.dev/tasks/1504) | Independent of everything else |
| Foundations | `POST /api/v1/operator/work-items` with a proposed mode | [VIK-1505](https://vikunja.webgrip.dev/tasks/1505) | Also unblocks [VIK-1189](https://vikunja.webgrip.dev/tasks/1189) |
| Foundations | One Go client for the operator API | [VIK-1506](https://vikunja.webgrip.dev/tasks/1506) | Also serves `ploegctl` |
| 1 | `ploeg-mcp` over stdio with the five read tools | [VIK-1507](https://vikunja.webgrip.dev/tasks/1507) | The decision and the client; a port-forward to ploegd |
| 2 | Propose, approve, reject and cancel with confirmation | [VIK-1508](https://vikunja.webgrip.dev/tasks/1508) | The submission route |
| 3 | Remote Streamable HTTP with Authentik OAuth | [VIK-1509](https://vikunja.webgrip.dev/tasks/1509), cluster side [VIK-1511](https://vikunja.webgrip.dev/tasks/1511) | A route and an Authentik application in `homelab-cluster`; a security review |
| Later | MCP Apps approval card, Tasks, registry listing | [VIK-1510](https://vikunja.webgrip.dev/tasks/1510) | The triggers below |

## 9. Recommendations

1. Record the placement and the rules above as [ADR-0011](../adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md) and let the owner accept or reject it before any server code is written.
2. Close the ACP repository-MCP gap now, regardless of the ADR's outcome.
3. Write the phase-0 how-to now; it is true today and costs nothing.
4. Build Ploeg's `POST /api/v1/operator/work-items` once, for Unfold ([VIK-1189](https://vikunja.webgrip.dev/tasks/1189)) and MCP together, with a proposed mode.
5. Build one Go client for the operator API and use it in both `ploeg-mcp` and `ploegctl`.
6. Treat Unfold backlog item PV-063 ("scoped read-only MCP tools") as superseded by this design: the same acceptance criteria, placed in Ploeg instead of Unfold.
7. Treat the MCP server as the answer to Ploeg ADR-0007's accepted consequence that "Ploeg has no standard programmatic dispatch API". The A2A facade stays on its watchlist; MCP gets there first because people's clients speak it.

## 10. Re-evaluation triggers

Any one of these reopens a part of this record:

- **Go SDK ships the Tasks extension** ([go-sdk#626](https://github.com/modelcontextprotocol/go-sdk/issues/626)) **and** Claude Code or Claude.ai documents Tasks support → consider returning a task from `glide_approve_work`.
- **SEP-2848 (asynchronous approval for tool calls) reaches Final** and a target client supports it → replace the elicitation-or-link approval.
- **Claude Code renders MCP Apps** → an approval card with spend becomes worth building.
- **SEP-2127 Server Cards is accepted** → publish a card from `ploeg-mcp`.
- **The MCP Registry leaves preview** with templated remote URLs → publish a `server.json` for self-hosted installs.
- **Authentik supports CIMD or dynamic client registration** → drop the pre-registered clients.
- **Agency ADR-0009's tenancy is implemented** → the tenant becomes a token claim and a filter on every call, and the scopes are reviewed.
- **Polling `/operator/events` measurably loads ploegd**, the same trigger as Unfold ADR-0023 → `glide_changes_since` becomes a subscription.
- **The next MCP revision** → rerun the conformance suite.
- **Vikunja 2.7.0 is deployed** → the phase-0 how-to points at Vikunja's native server.

## 11. Corrections to earlier records

- **VIK-1189** says the Work Item submission is "in progress on a local branch". No local or remote branch implements `POST /api/v1/operator/work-items` at `6de34d0`, and [operator_test.go](../../apps/ploeg/pkg/httpapi/operator_test.go) still expects `405`.
- **VIK-1300** plans to hand OpenHands its MCP server through `[mcp] shttp_servers` in `config.toml`. Current OpenHands releases no longer read that section ([OpenHands MCP settings](https://docs.openhands.dev/openhands/usage/settings/mcp-settings): "That format belongs to legacy OpenHands (V0)"). Check which OpenHands version the agent image runs before building that path.
- **The protocol ledger** in [ecosystem-alternatives](../../apps/unfold/docs/research/2026-09-11-ecosystem-alternatives.md) said a Ploeg/Unfold MCP interface "remains proposed". It now points here.
- **The [interaction-layer dossier](../../apps/unfold/docs/research/2026-09-18-band-and-the-interaction-layer.md)** said MCP Tasks "has zero clients on MCP's own extension support matrix". Still true on 2026-09-29, and the Go and TypeScript SDKs do not implement the extension either.
- **The official MCP client feature matrix was deleted** on 2026-05-27; only the extension matrix remains. Client support in this record comes from each client's own documentation and source ([client-matrix.md](evidence/2026-09-29-mcp-access/client-matrix.md), [ecosystem-and-clients.md](evidence/2026-09-29-mcp-access/ecosystem-and-clients.md)).

## 12. Limits

No MCP server was built or run against Ploeg. Client support is taken from documentation and source, not from connecting each client. Tool token counts are not measured. Whether opencode merges a repository's `opencode.json` over `OPENCODE_CONFIG` was not tested. Authentik's client registration support was not checked. Adoption figures are proxies.
