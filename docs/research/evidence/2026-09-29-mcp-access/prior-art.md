# Prior art: agent platforms exposed over MCP

> Raw research-agent report, 2026-09-29, kept as evidence for [the MCP access dossier](../../2026-09-29-mcp-access.md). Agent output, not independently verified line by line; the dossier states which claims were checked first-hand.

MCP PRIOR ART FOR AGENT DISPATCH — research report (crawled 2026-09-29; findings come from five sub-agents fetching docs and live endpoints; URLs inline; claims marked "unverified" came only from secondary or third-party sources)

## 0. Headline findings
- There is a newer MCP spec than 2025-11-25: **2026-07-28** (https://modelcontextprotocol.io/specification/2026-07-28/changelog). What changed:
  - The protocol is stateless: no `initialize`, no `Mcp-Session-Id`; version and capabilities travel in `_meta`; new `server/discover`.
  - The experimental core Tasks feature became the `io.modelcontextprotocol/tasks` extension with a different design.
  - DCR is deprecated in favour of CIMD.
  - MRTR (`resultType:"input_required"`) replaces server-initiated elicitation, sampling and roots. `subscriptions/listen` replaces `resources/subscribe`.
  - `Mcp-Method`/`Mcp-Name` headers are required. Roots, Sampling and Logging are deprecated.
  - Cloudflare's summary: https://blog.cloudflare.com/mcp-v2/
- Only three first-party MCP servers let an external client dispatch coding-agent work: **Devin MCP**, **Warp Factory MCP** and **Tembo MCP**. GitHub's MCP exposes Copilot coding-agent assignment as a few tools inside a large forge server. Every other product is an MCP client only, or exposes dispatch via REST/CLI/SDK.
- None of those dispatch servers uses MCP Tasks or progress notifications for runs. The shipped pattern is: create returns an id and URL, then status is polled, sometimes plus one blocking "wait" tool.

## 1. Per-product findings

### 1.1 Devin (Cognition)
**Devin MCP** (https://docs.devin.ai/work-with-devin/devin-mcp)
- Endpoint `https://mcp.devin.ai/mcp` (Streamable HTTP; SSE deprecated).
- Auth is a Bearer `cog_` key, one of three types:
  - org service-user key
  - enterprise service-user key + `X-Org-Id`
  - PAT + `X-Org-Id`
- No OAuth is documented. Legacy `apk_` keys are rejected.
- 13 tools:
  - Wiki: `read_wiki_structure`, `read_wiki_contents`, `ask_question` (up to 10 repos), `list_available_repos`.
  - `devin_session_create`: creates one or more sessions; each takes prompt, title, playbook, tags and an ACU limit.
  - `devin_session_search`: filter by tags, playbook, origin or time.
  - `devin_session_interact`: one multiplexed tool; actions are status, send message, sleep, terminate, archive, read messages/attachments, manage tags.
  - `devin_session_events`: list, detail or search events.
  - `devin_session_gather`: "Wait for multiple sessions to reach a settled state (finished, errored, sleeping, or waiting) before returning… instead of polling in a loop". This is a blocking fan-in.
  - `devin_playbook_manage`, `devin_knowledge_manage`, `devin_schedule_manage` (cron and one-time runs), `devin_list_integrations`.
- Not documented: resources, prompts, read-only mode, annotations, MCP Tasks, progress notifications, webhooks.
- Blast radius comes from key RBAC. For example, Get Session requires that the caller created the session, holds `session.view`, or has `ViewOrgSessions` (https://docs.devin.ai/api-reference/v3/sessions/get-organizations-session). Spend is guarded by a per-session ACU limit.

**DeepWiki MCP** (https://docs.devin.ai/work-with-devin/deepwiki-mcp)
- `https://mcp.deepwiki.com/mcp` (SSE `/sse` deprecated). No auth, free, public repos only.
- Tools: `read_wiki_structure`, `read_wiki_contents`, `ask_question`.

**Devin REST API v3** (https://docs.devin.ai/api-reference/overview)
- Create: `POST /v3/organizations/{org_id}/sessions` (https://docs.devin.ai/api-reference/v3/sessions/post-organizations-sessions).
- Create body: `prompt`, `devin_mode`, `repos`, `playbook_id`, `knowledge_ids`, `secret_ids`, `structured_output_schema`, `tags`, `title`, `create_as_user_id`, `security_profile`, `max_acu_limit`, `resumable`.
- Response: `session_id`, `url`, `status` (new/claimed/running/exit/error/suspended/resuming), `status_detail` (working/waiting_for_user/waiting_for_approval/finished), `pull_requests[{pr_url,pr_state}]`, `acus_consumed`, `structured_output`.
- Suspension reasons include `usage_limit_exceeded` and `out_of_credits`.
- Messages: `POST …/sessions/{id}/messages`.
- The API is available only on the Max, Team and Enterprise plans (https://devin.ai/pricing).

### 1.2 OpenAI Codex
- **`codex mcp-server` has been removed.** "The `codex mcp-server` command and the standalone `codex-mcp-server` binary have been removed" (https://learn.chatgpt.com/docs/mcp-server; developers.openai.com/codex now 308-redirects there).
  - It was deprecated in 0.149.1 (2026-08-24) and removed in 0.154.0 (secondary source: https://github.com/KjellKod/quest/issues/176).
  - Former tools: `codex` (start) and `codex-reply` (continue a session).
  - Community shims re-expose them, e.g. https://glama.ai/mcp/servers/PyYoshi/codex-app-mcp.
- **Replacement: Codex app server** (https://learn.chatgpt.com/docs/app-server). JSON-RPC over stdio, WebSocket or a Unix socket; "not an MCP server".
  - Methods: `thread/start|resume|fork|list|archive|delete`, `turn/start`, `turn/steer`, `turn/interrupt`.
  - Notifications streamed: `turn/started|completed`, `turn/plan/updated`, `item/*`, `item/agentMessage/delta`.
  - Approvals: `approvalPolicy` plus `item/permissions/requestApproval`.
- **Codex cloud** has no public REST or MCP. Scripting goes through the CLI (https://learn.chatgpt.com/docs/developer-commands?surface=cli):
  - `codex cloud exec --env <ID> [--attempts 1-4]`
  - `codex cloud list --json --cursor`
  - Open request for a wait/log/message lifecycle: https://github.com/openai/codex/issues/24777
- **Codex SDK** (`@openai/codex-sdk`, `openai-codex`) runs local threads only (https://learn.chatgpt.com/docs/codex-sdk).

### 1.3 Cursor Cloud Agents
- **No official MCP server for dispatch.** "Cursor Cloud MCP" exists only inside agents, for run diagnostics (https://cursor.com/docs/cloud-agent).
- **REST API** (https://cursor.com/docs/cloud-agent/api/endpoints)
  - Auth: Basic or Bearer user key. Service-account keys can mint 1-hour user-scoped tokens via `POST /v1/sub-tokens`.
  - Agents: `POST /v1/agents` launch, `GET /v1/agents`, `GET /v1/agents/{id}`.
  - Runs: `POST /v1/agents/{id}/runs` (follow-up), `GET …/runs/{runId}`, `GET …/runs/{runId}/stream` (SSE, resumable via `Last-Event-ID`, 410 once retention expires), `POST …/runs/{runId}/cancel`.
  - Other: `GET …/usage` (per-run tokens), `GET …/artifacts`, archive/unarchive, `DELETE`, `/v1/models`, `/v1/repositories` (rate-limited).
  - Launch options: `autoCreatePR`, `mode` plan|agent, inline `mcpServers`.
  - **Idempotency:** a client-supplied `agentId` (`bc-<uuid>`) makes create idempotent.
  - States: agent ACTIVE/IDLE/ARCHIVED; run CREATING/RUNNING/FINISHED/ERROR/CANCELLED/EXPIRED.
  - SSE events: `status`, `assistant`, `thinking`, `tool_call`, `heartbeat`, `result` (carries git/PR), `error`, `done`.
  - Webhooks are "coming soon" in v1. v0 has a `statusChange` webhook, HMAC-SHA256 signed, with `target.prUrl` (https://cursor.com/docs/cloud-agent/api/webhooks).
  - Billing is at model API pricing, and spend limits are required.
- **Community MCP servers:**
  - https://github.com/samuelbalogh/cursor-background-agent-mcp: `launchAgent`, `listAgents`, `listModels`, `addFollowup`, `getAgentConversation`, `getAgentStatus`.
  - TygartMedia/cursor-cloud-agents-mcp adds a spend-check tool.

### 1.4 Google Jules
- **No official MCP server.** The official agent-to-agent path is a Gemini CLI extension (https://github.com/gemini-cli-extensions/jules).
- **REST, v1alpha** (https://developers.google.com/jules/api/reference/rest)
  - Auth: `X-Goog-Api-Key`, max 3 keys.
  - Methods: `sessions.create|get|list|:approvePlan|:sendMessage`, `sessions.activities.get|list`, `sources.get|list`. There is no cancel or delete method.
  - Session fields (https://developers.google.com/jules/api/reference/rest/v1alpha/sessions): `requirePlanApproval`, `automationMode: AUTO_CREATE_PR`, `outputs[].pullRequest{url,title,description}`.
  - States: QUEUED, PLANNING, AWAITING_PLAN_APPROVAL, AWAITING_USER_FEEDBACK, IN_PROGRESS, PAUSED, FAILED, COMPLETED.
  - Activity types: agentMessaged, userMessaged, planGenerated, planApproved, progressUpdated, sessionCompleted, sessionFailed. Artifacts: changeSet (git patch), bashOutput, media.
  - Polling only; no webhooks.
- **Limits** (https://jules.google/docs/usage-limits/): Free 15 tasks/day and 3 concurrent; Pro 100/15; Ultra 300/60.
- **Community MCP** https://github.com/Avicennasis/jules-mcp (about 23 tools):
  - `jules_create_session`, `jules_approve_plan`, `jules_send_message`, `jules_get_session_diff`, `jules_pull_session`, `jules_create_session_from_issue`.
  - `jules_run_task`: a blocking create → approve → poll. It returns early when input is needed, and on timeout returns the id and state rather than an error.

### 1.5 Anthropic
- **`claude mcp serve`** is local stdio and exposes only Claude Code's primitive tools; "your own client is responsible for implementing user confirmation". It is not dispatch (https://code.claude.com/docs/en/mcp).
- **Claude Code on the web** has no public REST or MCP to create or list sessions. It is reached via `claude --cloud "task"` and `claude -p "msg" --cloud <session-id>`, which returns `{ok,session_id,url}` (https://code.claude.com/docs/en/claude-code-on-the-web).
- **Routines fire endpoint** (research preview; https://code.claude.com/docs/en/routines)
  - `POST https://api.anthropic.com/v1/claude_code/routines/{trig_id}/fire` with a per-routine bearer token.
  - Returns `claude_code_session_id` and `claude_code_session_url`.
  - The payload is wrapped as untrusted `<routine-fire-payload>`.
  - Pushes are allowed only to `claude/` branches.
- **Claude Managed Agents** (beta; https://platform.claude.com/docs/en/managed-agents/overview)
  - Create: `POST /v1/sessions` with `initial_events` and `budget`.
  - User events: `user.message`, `user.interrupt`, `user.tool_confirmation`.
  - Session events: `session.status_*`, `session.usage` (cumulative `list_cost`).
  - Delivery by SSE plus thin standard-webhooks (type and id only; fetch the object after). Webhook events include `session.budget_reached`.
  - **Hard budget:** `budget.max_list_cost`. When it is reached the session goes idle with `stop_reason: budget_reached`; it is not killed. See /budgets and /webhooks under the same docs root.
  - Managed Agents consume MCP; nothing exposes them as an MCP server.
- **Agent SDK** is an in-process library, not an MCP server (https://code.claude.com/docs/en/agent-sdk/overview).
- **Claude Code client behaviour** (https://code.claude.com/docs/en/mcp):
  - An MCP tool call still running after 2 min is auto-backgrounded (`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`).
  - `MCP_TOOL_TIMEOUT` defaults to about 28 h.
  - The HTTP idle timeout is 5 min and is reset by progress notifications.
  - The docs do not mention MCP Tasks. A third-party claim that Claude Code polls `tasks/get` is unverified: https://github.com/openai/codex/issues/48617

### 1.6 GitHub MCP server + Copilot coding agent (https://github.com/github/github-mcp-server, v1.12.2 of 2026-09-16)
**Endpoints**
- Remote `https://api.githubcopilot.com/mcp/`. Local via `github-mcp-server stdio` or Docker.

**Auth** (https://github.com/github/github-mcp-server/blob/main/docs/host-integration.md)
- Remote accepts an OAuth token or PAT. There is **no DCR**; each host registers its own OAuth or GitHub App.
- Local OAuth shows the authorization URL through **URL elicitation**, so it never enters the model context (https://github.com/github/github-mcp-server/blob/main/docs/oauth-login.md).
- Scope filtering hides tools the token cannot use (https://github.com/github/github-mcp-server/blob/main/docs/scope-filtering.md).

**Toolsets**
- Default: `context`, `repos`, `issues`, `pull_requests`, `users`.
- Optional: `actions`, `code_security`, `copilot`, `copilot_issue_intents`, `projects`, `notifications`, `orgs`, `labels`, `git`, `governance`, and others.
- Remote-only: `copilot`, `copilot_spaces`, `github_support_docs_search`.

**Config** (https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md, https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md)
- Headers: `X-MCP-Toolsets`, `X-MCP-Tools`, `X-MCP-Exclude-Tools`, `X-MCP-Readonly`, `X-MCP-Lockdown`, `X-MCP-Insiders`.
- URL paths: `/readonly`, `/x/{toolset}`, `/x/{toolset}/readonly`, `/insiders`.
- Read-only beats explicitly requested write tools.

**Lockdown mode**
- Hides or errors on content whose author lacks push access. It is framed as "best-effort… **not** an authorization boundary" against prompt injection.
- The operator setting is an upper bound; a header can turn it on but not off.

**Dynamic toolsets removed in v1.1.0** (2026-05-28; https://github.com/github/github-mcp-server/pull/2512)
- Removed: `enable_toolset`, `list_available_toolsets`, `get_toolset_tools`.
- Reason: "Dynamic mode was local-only — never offered by the remote server. It carried real complexity…"

**Annotations**
- `readOnlyHint` so hosts can skip confirmation. `destructiveHint` on delete tools (release notes: https://github.com/github/github-mcp-server/releases).

**Tools**
- 96 in the README, as consolidated `method`-param tools: `issue_read`, `issue_write`, `sub_issue_write`, `pull_request_read`, `pull_request_review_write`, `projects_get|list|write`, `actions_get|list|run_trigger`.
- Old names are kept as aliases (https://github.com/github/github-mcp-server/blob/main/docs/tool-renaming.md).

**Copilot dispatch tools**
- `assign_copilot_to_issue(owner, repo, issue_number, base_ref?, custom_instructions?)`.
- `assign_copilot_to_issue_with_intent`: adds `confidence` (HIGH/MEDIUM/LOW), `rationale` and `is_suggestion`. When `is_suggestion` is true it "records a pending Copilot assignment intent rather than launching the agent. Approval later supplies the launch context". **Propose-then-approve dispatch.**
- `create_pull_request_with_copilot(owner, repo, problem_statement, title, base_ref?)`. Remote-only. Its description says to confirm the repo with the user.
- `request_copilot_review`.
- `get_copilot_job_status`: query by job ID or PR number. "Task assignments now return a job ID or pull request link immediately" (https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/). It is not in the current README; the call shape `{id, owner, repo}` and its return of status, workflow-run URL and timestamps come from https://github.com/github/github-mcp-server/issues/1818.
- Absent: no cancel tool, no streaming.

**Agent tasks REST** (preview; https://docs.github.com/en/rest/agent-tasks/agent-tasks)
- Create: `POST /agents/repos/{owner}/{repo}/tasks` with `prompt`, `model`, `custom_agent`, `create_pull_request`, `base_ref`.
- List and get endpoints return `sessions[]`, each with a `usage` field.
- States: queued, in_progress, completed, failed, idle, waiting_for_user, timed_out, cancelled.
- No cancel endpoint.

### 1.7 Linear
**Remote MCP** (https://linear.app/docs/mcp)
- Endpoints: `https://mcp.linear.app/mcp`; read-only via `/mcp/readonly` or a `read`-only scope. `/sse` is being removed (https://linear.app/changelog/2026-02-05-linear-mcp-for-product-management).
- Live 401 probe:
  - `resource_metadata=https://mcp.linear.app/.well-known/oauth-protected-resource/mcp` (RFC 9728 challenge), `scope="read write"`, served behind Cloudflare.
  - Advertises DCR `/register`, `client_id_metadata_document_supported: true`, PKCE S256.
  - Also a jwt-bearer `id-jag` grant for enterprise-managed authorization (Okta; https://linear.app/changelog/2026-07-02-initiative-properties).
- Launched 2025-05-01 on Cloudflare (https://linear.app/changelog/2025-05-01-mcp, https://blog.cloudflare.com/mcp-demo-day/).
- **No official full tool list.** Names seen in changelogs:
  - `list_issues`, `get_issue`, `save_issue` (upsert, replacing `create_issue`/`update_issue` by 2026-04-30)
  - `list_comments`, `list_projects`, `get_project`, `save_project`, `save_document`
  - `list_cycles`, `list_users`, `get_user` ("me"), `list_issue_labels`, `list_teams`, `get_team`, `save_customer_need`
- Changelog lessons:
  - Accept names instead of UUIDs (2025-08-14).
  - "Made LLM aware of multiple pages of responses" (2025-07-17).
  - Unknown params now raise a validation error instead of being silently dropped (2026-05-14).
  - Token cut via "loading Linear resources through URLs" (2026-02-05).
- No Linear engineering post on the build was found.

**Agent model** (https://linear.app/developers/agents)
- Install is OAuth `actor=app`; scopes `app:assignable`, `app:mentionable`.
- "Assigning an issue to your app now sets it as the `delegate`, not the `assignee`—so humans maintain ownership."
- Agents are not billable seats.

**Agent Interaction Guidelines** (https://linear.app/developers/aig)
- Disclose that it is an agent; inhabit the platform natively; instant feedback; clear internal state; respect disengage; a human stays accountable.

**Sessions** (https://linear.app/developers/agent-interaction)
- `AgentSession` states: pending, active, error, awaitingInput, complete, stale. The state is derived from the last activity.
- Webhooks `AgentSessionEvent` `created` / `prompted`, with `promptContext`.
- Timing: the receiver answers the webhook within 5 s; the first activity or external URL is due within 10 s, or the session shows as unresponsive; it goes `stale` after 30 min without an activity, which is recoverable (https://linear.app/developers/agent-best-practices).
- `agentActivityCreate` types: `thought`, `action{action,parameter,result}`, `elicitation`, `response`, `error`. `ephemeral` is allowed on thought and action.
- `agentSessionUpdate.externalUrls[{label,url}]`: **the PR link goes here.** `plan[{content,status}]` is replaced in full on each update.
- Proactive sessions: `agentSessionCreateOnIssue` / `agentSessionCreateOnComment`.

**Signals** (https://linear.app/developers/agent-signals)
- Human `stop` → halt, then a final response.
- Elicitation `auth` (account linking URL) and `select` (options).

**Best practices**
- Move the issue to the first `started` state when work begins.
- Rebuild the conversation from activities (immutable), not comments.
- Absent: per-session cost, and a cancel API other than the human stop signal.

### 1.8 Atlassian Rovo MCP + Jira Coding Agent (Rovo Dev)
**Endpoints and auth** (https://github.com/atlassian/atlassian-mcp-server)
- `https://mcp.atlassian.com/v2/mcp`; `/v1/sse` ended 2026-06-30.
- OAuth 2.1, or an API token (Basic email:token, or a service-account Bearer). An admin must enable token auth.
- Some products are auth-restricted: JSM needs a token, Compass/Teams/`search_code` need OAuth.

**Multi-tenancy**
- `getAccessibleAtlassianResources` returns `cloudId`s and must be called first; every tool needs a `cloudId`. `atlassianUserInfo` identifies the user (https://developer.atlassian.com/cloud/rovo-mcp/guides/supported-tools/).

**Tiered exposure**
- Primary tools appear in `tools/list`. The rest are deferred behind `discover` (natural-language search), then invoked through `executeRead` / `executeWrite` / `executeDestructive` "depending on the operation's risk tier", "with agent-level confirmation".
- Permission groups map to scopes of the form `<verb>:<product>:agent-interface`:
  - `read_jira`: primary `getJiraIssue`.
  - `write_jira`: primary `createJiraIssue`, `editJiraIssue`, `transitionJiraIssue`, `addOrEditJiraIssueComment`.
  - `search_jira`: `searchJiraIssuesUsingJql`.
  - `delete_jira` and `manage_jira`: off by default; an admin enables them.
- Similar groups exist for Confluence, Bitbucket, JSM and Loom.
- Teamwork Graph tools and `search` "may consume up to 10 Rovo credits per call". There is no `fetch` tool.

**Admin controls**
- Domain allow/block list, per-call audit-log events, IP allowlisting.

**Rate limits** (https://www.atlassian.com/platform/rovo-mcp)
- Free 500 calls/h; Standard 1000/h; Premium/Enterprise 1000/h + 20 per user, up to 10,000. Limits are per site.
- 429s after about 20 parallel calls are reported, with only `Retry-After` (https://github.com/atlassian/atlassian-mcp-server/issues/171).
- Built on Cloudflare's Agents SDK (https://www.atlassian.com/blog/announcements/remote-mcp-server).

**Jira Coding Agent**
- Dispatch is by UI "Start work" or by assigning the work item. It opens a draft PR and never merges; sessions expire after 7 days of inactivity (https://support.atlassian.com/rovo/docs/generate-code-from-a-work-item-in-jira/).
- Automation action exposes `{{jiracodingagent.codeGeneration.jobId}}` and bills the connection owner's credits (https://support.atlassian.com/rovo/docs/work-with-rovo-dev-in-automations/).
- **No MCP or REST dispatch.** Pricing is $20/dev/month with 2,000 credits and $0.01 per credit overage (https://www.atlassian.com/software/rovo-dev/pricing).

**Remote agents in Jira** (https://developer.atlassian.com/platform/forge/remote-agents-in-jira/)
- This is the closest route for making Glide assignable from Jira.
- A Forge `rovo:agentConnector` speaks a subset of **A2A 1.0** over JSON-RPC:
  - `SendMessage` on assign, mention or trigger.
  - Jira polls `GetTask`.
  - Optional `SendStreamingMessage` SSE with `statusUpdate` / `artifactUpdate`.
  - `CancelTask`.
- States: `TASK_STATE_SUBMITTED|WORKING|INPUT_REQUIRED|AUTH_REQUIRED|COMPLETED|FAILED|REJECTED|CANCELED`.
- Auth is a Forge Invocation Token verified via JWKS.

### 1.9 Sentry MCP (https://github.com/getsentry/sentry-mcp)
**Endpoints**
- `https://mcp.sentry.dev/mcp`, with path scoping `/mcp/{org}` and `/mcp/{org}/{project}`; stdio via `npx @sentry/mcp-server`.
- **Path constraints:** slugs are validated when the client connects. Constrained params are removed from the tool schemas and injected by the server, so "scoped sessions cannot override them". Tools that no longer apply are hidden (https://raw.githubusercontent.com/getsentry/sentry-mcp/main/docs/specs/subpath-constraints.md).

**OAuth** (https://raw.githubusercontent.com/getsentry/sentry-mcp/main/docs/cloudflare/oauth-architecture.md)
- Uses `@cloudflare/workers-oauth-provider`. The server is an OAuth provider to clients and an OAuth client to Sentry; the Sentry token is encrypted inside the MCP token.

**Skills picked at consent** (https://raw.githubusercontent.com/getsentry/sentry-mcp/main/packages/mcp-core/src/skills.ts)
- `inspect` (default on), `seer` (default on), `triage` (off), `project-management` (off).
- Sentry API scopes are derived from the skills granted. The choice is remembered per clientId.

**Tools**
- 66 in the catalog (https://raw.githubusercontent.com/getsentry/sentry-mcp/main/packages/mcp-core/src/tools/catalog/index.ts).
- Default surface (https://raw.githubusercontent.com/getsentry/sentry-mcp/main/packages/mcp-core/src/tools/surfaces.ts): `find_organizations`, `find_projects`, `update_issue`, `search_events`, `search_issues`, `analyze_issue_with_seer`, `get_sentry_resource`.
- Plus `search_sentry_tools(query, limit≤20)` and `execute_sentry_tool(name, arguments)`. The latter is annotated `destructiveHint: true` and has constraints auto-injected.
- `use_sentry` (an embedded-LLM "agent mode") was removed. Reason: it doubled latency, and "too many [tools] worsen the behavior of agents due to context noise" (https://cra.mr/a-bigger-toolbox-for-mcp).

**Seer long-running analysis**
- One tool call blocks and polls internally: 5 s interval, **5 min cap**. It streams "Processing: …" text.
- On timeout it returns partial progress and tells the user to "check the status later by running the same command again". Re-invoking is the poll; there is no job handle and no Tasks (https://raw.githubusercontent.com/getsentry/sentry-mcp/main/packages/mcp-core/src/internal/tool-helpers/seer.ts).

### 1.10 Other coding-agent products
**Warp Factory MCP** (closed beta; https://docs.warp.dev/factories/factory-mcp/)
- Endpoint `https://app.warp.dev/api/v1/mcp/factory`. OAuth, or an agent API key.
- "No read-only or per-factory scopes: a connected client acts with the full permissions of the account."
- Tools (18):
  - Tasks: `send_task`, `get_task` (accepts URL, PR, branch or issue), `list_tasks`, `search_task`, `complete_task`.
  - Conversation: `message_foreman`, `get_conversation`.
  - Factories: `list_factories`, `create_factory`, `validate_factory_files`, `get_factory_file_schema`, `list_notification_routes`.
  - Teams and connections: `list_teams`, `create_team`, `join_team`, `start_connection`, `get_connection_status`.
- Stages: Intake → Triage → Planning → Building → Reviewing → Human handoff → Complete/Cancelled (https://docs.warp.dev/factories/how-factories-work/). Polling only; no cancel tool.
- REST, Oz API (https://docs.warp.dev/reference/api-and-sdk/): `POST /agent/run`, `GET /agent/runs/{id}`, `POST …/followups`, `POST …/cancel`.

**Tembo MCP** (https://docs.tembo.io/api/mcp.md; announced 2026-09-24 at https://www.tembo.io/blog/announcing-tembo-api-sdk-mcp)
- `https://mcp.tembo.io/mcp`. OAuth (Clerk org picker) or a Bearer API key. Self-hosted at `https://{origin}/mcp`.
- Local package `@tembo-io/mcp` requires **`--allow-writes`** before it will run mutations.
- Tools are generated from 125 OpenAPI operations:
  - direct mode: kebab-case, one tool per operation
  - compact mode `MCP_TOOL_MODE=compact`: `search_tools`, `get_tool_schema`, `call_read_tool`, `call_write_tool`
- Sessions support create, get, list, update, delete and **stop**; plus events, diffs, and `artifacts[].pullRequests[].url/status`.
- Pricing: VM usage plus about 15% on gateway tokens, with per-org overage caps (https://docs.tembo.io/resources/pricing.md).

**MCP client only, no dispatch MCP found:**
- **OpenHands:** feature request closed (https://github.com/OpenHands/OpenHands/issues/5760). REST: `POST /api/v1/app-conversations` → start-task, polled until READY (https://docs.openhands.dev/openhands/usage/cloud/cloud-api). The agent-server's `ConversationInfo.metrics` carries cost.
- **Factory:** Sessions API with `/interrupt` and `factoryCredits` (https://docs.factory.ai/api-reference/sessions). `droid exec` is read-only by default, with org autonomy ceilings.
- **Codegen:** discontinued 2026-01-09 after the ClickUp acquisition (https://codegen.com/an-update-on-codegen/). Its legacy API returned `github_pull_requests[]` and 402 when the plan was exhausted.
- **Sweep:** pivoted to a JetBrains plugin.
- **Charlie:** no public API or MCP (https://docs.charlielabs.ai/changelog).
- **Kilo Cloud Agent:** CLI and webhooks, no MCP (https://kilo.ai/docs/code-with-ai/platforms/cloud-agent).
- **Cline:** no dispatch API.
- **Augment:** MCP is retrieval-only.
- **Amp:** SDK only.

### 1.11 Reference remote MCP designs
**Vercel** (https://vercel.com/docs/agent-resources/vercel-mcp)
- `https://mcp.vercel.com`, OAuth. It supports the 2026-07-28 spec while 2025 clients keep working (https://vercel.com/changelog/vercel-mcp-now-supports-the-2026-07-28-mcp-specification).
- **Client allowlist:** only reviewed clients. Explicit consent is required per client connection.
- Team selection happens at OAuth consent. A `/<team>/<project>` path form is unverified (https://github.com/anthropics/claude-code/issues/93777).
- Tools: about 213 across 28 categories, including a 4-tool "Agent Runs" category (https://vercel.com/changelog/agent-runs-vercel-mcp-cli).
- `mcp-handler` library provides `withMcpAuth` and `protectedResourceHandler`, with CIMD support (https://github.com/vercel/mcp-handler).

**Cloudflare**
- Domain servers at `https://<x>.mcp.cloudflare.com/mcp` (https://github.com/cloudflare/mcp-server-cloudflare).
- **Code Mode API server** `https://mcp.cloudflare.com/mcp` has 3 tools, `docs`, `search` and `execute`, covering about 2,500 endpoints.
  - Context cost: about 1.1k tokens, against about 1.17M for native MCP.
  - Output cap: about 6k tokens.
  - OAuth consent lets the user downscope permissions (https://blog.cloudflare.com/code-mode-mcp/, https://github.com/cloudflare/mcp).
- **workers-oauth-provider** (https://github.com/cloudflare/workers-oauth-provider):
  - The Worker is the OAuth 2.1 authorization server. It stores hashes only; props are encrypted so only the token holder can unwrap them.
  - Supports PKCE, DCR, CIMD, RFC 8693 token exchange and upstream IdPs.
- Pattern: "issues its own token to the client"; the upstream token stays server-side (https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/).

**Stripe** (https://docs.stripe.com/mcp)
- `https://mcp.stripe.com`. OAuth consent picks accounts and environments, with permissions per environment. Headless clients use a Bearer **Agent-tagged restricted key**.
- "Beginning October 31, 2026, Stripe MCP no longer accepts full-access secret keys or restricted API keys without the Agent tag."
- 10 tools: `stripe_api_search`, `stripe_api_details`, `stripe_api_read`, `stripe_api_write`, `get_stripe_account_info`, `stripe_analytics`, `get_balance_summary`, `search_stripe_documentation`, `stripe_implementation_planner`, `send_stripe_feedback`.
- **Server-side human approval:** risky writes (refunds, payouts) return an approval URL valid for 24 h, and the agent retries after approval.
- Admins toggle MCP per live or sandbox environment.

### 1.12 Tracker and forge MCP servers
- **Vikunja** (official, ≥2.7.0; https://vikunja.io/help/mcp/)
  - `/api/v2/mcp`, bearer API token with expiry, no OAuth.
  - Presets: Read only / Typed read+write / Full access. The tool count is not stated.
- **Gitea** (https://gitea.com/gitea/gitea-mcp)
  - 50+ tools. stdio or stateless HTTP.
  - Auth: static token, per-request Bearer, or OAuth 2.1.
  - Filters: `-r` read-only, `-S` categories, `-O` named tools.
- **Forgejo** (goern/forgejo-mcp, now at https://git.b4mad.industries/agentic-forges/forgejo-mcp)
  - 60+ tools. Streamable HTTP with a per-request token (multi-tenant).
  - No read-only mode.
- **ClickUp** (https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server)
  - `https://mcp.clickup.com/mcp`, OAuth only; API keys are not allowed.
  - Without the AI add-on: 50 calls/24 h on Free, 300 on Unlimited+.
  - Tool count is 43–51 depending on source (48 itemized at https://developer.clickup.com/docs/mcp-tools).

### 1.13 Spec and client-requirement facts
**2025-11-25 Tasks, experimental** (https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)
- `tasks/get|result|list|cancel`; tool-level `execution.taskSupport` forbidden|optional|required.
- Statuses: working, input_required, completed, failed, cancelled.
- Tasks must be bound to the auth context.

**2026-07-28 Tasks extension** (https://modelcontextprotocol.io/extensions/tasks/overview, https://github.com/modelcontextprotocol/ext-tasks)
- The server decides per request whether to return `resultType:"task"` with `taskId`, `ttlMs` and `pollIntervalMs`; the task is durably created before the response is sent.
- `tasks/get` returns the result inline at a terminal state. `tasks/update` answers input requests. `tasks/cancel` is cooperative.
- `tasks/list` and blocking `tasks/result` were removed.
- Push via `notifications/tasks` over `subscriptions/listen`.

**Client support for Tasks**
- The extension client matrix does not list Tasks (https://modelcontextprotocol.io/extensions/client-matrix).
- No Tasks support is documented for Claude Code, VS Code or Codex.

**Authorization, 2026-07-28** (https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- RFC 9728 PRM and RFC 8707 `resource` are required; servers must validate audience.
- CIMD is SHOULD; DCR is MAY and deprecated.
- "MUST NOT accept or transit any other tokens."

**Tools** (https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- Annotations `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`. Clients must treat them as untrusted unless the server is trusted.
- `outputSchema` → `structuredContent`; the `resource_link` content type.

**ChatGPT** (https://developers.openai.com/api/docs/mcp)
- Deep research requires `search(query)` → `results[{id,title,url}]` and `fetch(id)` → `{id,title,text,url,metadata}`. Citations only render when `url` is non-empty.
- Developer mode (https://developers.openai.com/api/docs/guides/developer-mode): "Write actions by default require confirmation". A tool without `readOnlyHint` is treated as a write.

**Claude connectors** (https://claude.com/docs/connectors/building/authentication)
- Callback `https://claude.ai/api/mcp/auth_callback`. Auth types `oauth_dcr` or `oauth_cimd`; no `client_credentials`.
- **Per-customer URL patterns** such as `^https://[a-z0-9-]+\.mcp\.example\.com/mcp$` are supported. Egress range `160.79.104.0/21`.
- Directory review (https://claude.com/docs/connectors/building/review-criteria):
  - Every tool needs a `title` and `readOnlyHint` or `destructiveHint`; these "determine auto-permissions".
  - **Catch-all `api_request` tools with a `method` param are rejected.** Reads and writes must be separate tools.
  - Names ≤64 chars.

## 2. Synthesis

### (a) Common tool vocabulary for agent-dispatch MCPs and APIs
The operations converge across Devin MCP, Warp Factory MCP, Tembo, the GitHub Copilot tools, Cursor/Jules/OpenHands/Factory/Oz REST, Managed Agents and Jira A2A:

| Operation | Shipped names |
|---|---|
| **Create/dispatch** (prompt + repo + base ref + optional budget/mode) | `devin_session_create` (batch, ACU limit); `send_task`; `create-session`; `assign_copilot_to_issue` / `create_pull_request_with_copilot`; `POST /v1/agents`; `sessions.create`; A2A `SendMessage` |
| **Propose-then-approve variant** | `assign_copilot_to_issue_with_intent(is_suggestion=true, confidence, rationale)`; Jules `requirePlanApproval` + `:approvePlan`; Cursor `mode: plan`; Stripe approval-URL writes |
| **Get status** | `devin_session_interact(action=status)`; `get_task`; `get_copilot_job_status`; `GET …/runs/{id}`; A2A `GetTask` |
| **List/search** | `devin_session_search`; `list_tasks` / `search_task`; `GET /agents/tasks?state=`; `list-sessions` |
| **Follow-up message** | `devin_session_interact(send message)`; `message_foreman`; `POST …/runs` (Cursor follow-up); `:sendMessage`; `turn/steer`; `user.message` |
| **Events/transcript** | `devin_session_events`; `get_conversation`; `sessions.activities.list`; `…/stream` SSE; Linear `agentActivity` |
| **Cancel/stop** | `devin_session_interact(terminate)`; Tembo stop; `POST …/cancel` (Cursor, Oz); Factory `/interrupt`; `user.interrupt`; A2A `CancelTask`; Linear human `stop` signal |
| **Wait** | `devin_session_gather` (blocking fan-in); `jules_run_task` (blocking with early return) |

Absences:
- No cancel exists in GitHub's MCP or agent-tasks REST, Warp Factory MCP, or the Jules API.
- Terminate/archive are separate actions in Devin and Cursor.

Result/PR is a field on the run object, not a separate fetch:
- Devin `pull_requests[{pr_url,pr_state}]`
- Cursor `result.git` / `target.prUrl`
- Jules `outputs[].pullRequest`
- Tembo `artifacts[].pullRequests[]`
- Codegen `github_pull_requests[]`
- Linear `externalUrls`
- Warp: `get_task` accepts a PR URL as its lookup key

Spend on the run object:
- Devin `acus_consumed` / `max_acu_limit`
- Cursor `GET …/usage`
- GitHub `sessions[].usage`
- Managed Agents `session.usage.list_cost` + hard `budget` (idles on breach, with `session.budget_reached` webhook)
- Factory `factoryCredits`
- OpenHands `metrics`
- Absent: Jules, Linear, Warp

Common state vocabulary: queued → working/running → waiting_for_user / awaiting_plan_approval / input_required → completed | failed | cancelled | timed_out/expired, plus idle/stale/suspended. The A2A and MCP-Tasks enums line up with this.

### (b) Long-running work over MCP as actually shipped
1. **Id + poll tool** is universal: Devin, Warp, Tembo, GitHub `get_copilot_job_status`, community Cursor and Jules servers. GitHub changed create to "return a job ID or pull request link immediately".
2. **Blocking wait tool with a cap and partial return:**
   - Devin `devin_session_gather` waits for settled states.
   - Sentry Seer blocks and polls for at most 5 min, then returns progress text and "run the same command again".
   - Community `jules_run_task` returns early on input-needed and returns id and state on timeout.
   - Client ceilings: Claude Code auto-backgrounds after 2 min and has a 5-min HTTP idle timeout that progress notifications reset. A blocking tool must stay under that or emit progress.
3. **MCP Tasks: no production dispatch server uses it,** and no major client documents support. The 2025-11-25 design was replaced by the 2026-07-28 extension (server-directed, `pollIntervalMs`, inline result, cooperative cancel). Treat it as an optional upgrade on top of a polling tool, not the base contract.
4. **Push lives outside MCP:**
   - SSE: Cursor `/stream` with `Last-Event-ID`; Managed Agents; Codex app-server notifications; A2A `SendStreamingMessage`.
   - Webhooks: Cursor v0 HMAC; Managed Agents thin standard-webhooks; Linear `AgentSessionEvent`.
5. **Status-as-activity-log** (Linear, Jules): typed append-only activities (thought/action/elicitation/response/error; planGenerated/progressUpdated). The state is derived from the last activity. Linear adds liveness rules: first activity in 10 s, stale after 30 min.
6. **Input-needed is a first-class state:** Devin waiting_for_user/approval, Jules AWAITING_*, A2A INPUT_REQUIRED/AUTH_REQUIRED, Linear elicitation `select`/`auth`, Seer `awaiting_user_input`. It is answered through the follow-up-message tool.

### (c) Multi-tenancy patterns
- **Discovery tool, then an id on every call:**
  - Atlassian `getAccessibleAtlassianResources` → `cloudId` on every tool.
  - Warp `list_factories` / `list_teams`.
  - Sentry `find_organizations`.
  - Costs: an extra round-trip, and the model can pick the wrong tenant.
- **Tenant in the URL path, removed from schemas and injected server-side:**
  - Sentry `/mcp/{org}/{project}`, where scoped sessions cannot override the tenant and irrelevant tools are hidden.
  - GitHub `/x/{toolset}/readonly` for surface, not tenant.
  - Vercel `/<team>/<project>` is unverified.
- **Tenant chosen at OAuth consent and bound into the token:**
  - Vercel teams, Stripe accounts/environments, Tembo Clerk org picker, Cloudflare permission downscoping, Sentry skills.
- **Header-based:** Devin `X-Org-Id` for enterprise keys and PATs; Stripe `Stripe-Account` for Connect.
- **Per-customer hostnames:** Claude connectors accept a URL regex such as `https://[a-z0-9-]+.mcp.example.com/mcp`. Tembo self-hosted is `https://{origin}/mcp`. This fits the "self-hosted first, hosted later" split.
- **Headless/agent credentials separate from human OAuth:**
  - Stripe Agent-tagged restricted keys (untagged keys rejected from 2026-10-31).
  - Devin service-user keys.
  - Cursor 1-hour sub-tokens.
  - Atlassian service-account keys, which an admin must enable.
  - Claude connectors do not support `client_credentials`.
- **Token architecture:** the MCP server is its own OAuth authorization server and keeps upstream tokens encrypted server-side (workers-oauth-provider, Sentry, Cloudflare). The spec forbids token passthrough and requires audience validation (RFC 8707). CIMD over DCR (Claude: DCR "creates a new client on every fresh connection").
- **Admin plane:** Atlassian (domain allowlist, IP allowlist, audit log per call, delete/manage off by default). Stripe (MCP on/off per environment, session revocation). Vercel (client allowlist + per-client consent).

### (d) Anti-patterns and published lessons
- **Tool count hurts selection and context.**
  - GitHub cut defaults to 5 toolsets and merged tools into `method`-param tools, saving "~60-90%" context with 3–10 tools (https://github.blog/changelog/2025-12-10-the-github-mcp-server-adds-support-for-tool-specific-configuration-and-more/). Projects consolidation saved about 23k tokens, or 50% (https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/). Consolidation rationale: https://github.blog/changelog/2025-10-14-github-mcp-server-now-supports-github-projects-and-more/
  - Copilot's built-in tools went from 40 to 13 with virtual tools, and SWE-bench rose 2–5 pts (https://github.blog/ai-and-ml/github-copilot/how-were-making-github-copilot-smarter-with-fewer-tools/).
  - Cramer: "too many [tools] worsen the behavior of agents due to context noise" (https://cra.mr/a-bigger-toolbox-for-mcp).
- **Tension:** Anthropic's directory rejects `api_request`-style catch-alls with a `method` param mixing read and write, and requires separate read/write tools (https://claude.com/docs/connectors/building/review-criteria). GitHub's `issue_write(method=create|update)` stays write-only per tool; Stripe's `stripe_api_read`/`_write` split conforms. **Consolidate within a risk tier, never across tiers.** Atlassian `executeRead`/`executeWrite`/`executeDestructive`, Tembo `call_read_tool`/`call_write_tool` and Sentry's `execute_sentry_tool` (annotated destructive) all encode this.
- **Search-then-execute catalogs have displaced dynamic toolsets.**
  - GitHub removed dynamic toolsets (`enable_toolset` etc.) for complexity (https://github.com/github/github-mcp-server/pull/2512).
  - Sentry replaced the embedded-LLM `use_sentry` agent mode (2× latency) with `search_sentry_tools` + `execute_sentry_tool`.
  - Atlassian `discover` + `execute*`; Tembo compact mode; Cloudflare Code Mode `search`/`execute` (~1.1k tokens for ~2,500 endpoints).
  - Caveat, Cramer: "Progressive disclosure in any form hides context from the agent… description-based steering disappears" (https://cra.mr/context-management-and-mcp/). Keep the core workflow tools native.
- **Don't wrap the API 1:1.** "The ability to steer the LLM is the entire value prop"; responses should be "LLM-catered… not remotely what our API would output" (https://cra.mr/context-management-and-mcp/). Bloated payloads take a call "from a dollar to $10" (https://ai.engineer/talks/FCi4jT86gSw-mcp-is-not-good-yet). Cloudflare Code Mode caps output at about 6k tokens.
- **Linear's small fixes:**
  - Accept names instead of UUIDs.
  - Tell the model there are more pages.
  - Reject unknown params rather than dropping them.
  - Pass resources by URL.
  - Don't truncate text needlessly.
- **Stateful sessions were a mistake, per Cloudflare.** They needed "sticky sessions, holding open streams, message replay". The 2026-07-28 spec is stateless and SSE resumability is gone (https://blog.cloudflare.com/mcp-v2/). Don't build run progress on MCP session state; persist runs server-side and address them by id.
- **Read-only and write gating must be server-enforced, not hint-only.**
  - Annotations are untrusted.
  - GitHub read-only beats explicit tool requests.
  - Linear `/mcp/readonly`; Tembo `--allow-writes`; Atlassian delete/manage are admin-enabled.
  - Warp's "no read-only or per-factory scopes" is the counter-example.
  - Host UX depends on accurate hints: ChatGPT treats a tool with no hint as a write; Claude auto-approves read-only and always prompts destructive.
- **Prompt-injection hygiene:**
  - GitHub lockdown ("not an authorization boundary") plus content sanitisation.
  - Routines wrap external payloads as untrusted.
  - OAuth URLs go through URL elicitation to keep them out of model context.
  - Elicitation form mode must never ask for secrets.
- **Human accountability for agent-dispatched work:**
  - Linear's delegate-not-assignee model and AIG principle 6.
  - GitHub's intent/suggestion tool.
  - Jira Coding Agent only drafts PRs and never merges.
  - Stripe's approval URLs for risky writes.
- **Observability:** trace every tool call with its inputs (https://cra.mr/instrumenting-an-mcp-server/). "MCP protocol often returns errors inside JSON-RPC responses instead of throwing, so your app logs can look fine while tools fail" (https://blog.sentry.io/introducing-mcp-server-monitoring/). Atlassian writes one audit-log event per call.
- **Rate limits:** Atlassian sends only `Retry-After`, with 429s reported at about 20 parallel calls; ClickUp allows 50 calls/day on free. Budget for agent fan-out.
- **Stability:** Codex's MCP server was removed within about a year; OpenAI moved to a JSON-RPC app server. Cursor webhooks regressed to "coming soon" in v1. Codegen shut down. Prefer contracts that can survive a spec revision: id-addressed runs over REST, with MCP as a thin surface.

**Absences to note:** no Linear official tool list; no Linear build-lessons post; no official Jules, Cursor-dispatch, OpenHands, Factory or Codex-cloud MCP; no cancel in the GitHub agent-tasks API or Jules; no documented Tasks support in any major client; the `get_copilot_job_status` schema is not in the current README.
