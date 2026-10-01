# Designing MCP tools and results for LLM clients

> Raw research-agent report, 2026-09-30, kept as evidence for [the MCP server patterns guide](../../2026-09-30-mcp-server-patterns.md). Agent output, not independently verified line by line; the guide states which claims were checked first-hand.

# Designing MCP tools and tool results for LLM clients: research for ploeg-mcp (sources read 2026-09-30)

## 0. What changes in the §6 plan

1. **"Short text summary" plus structuredContent breaks two Claude clients, in opposite directions.**
   - Claude Code forwards **only `structuredContent`** to the model when both fields are present. Every `content[].text` block is dropped, including appended notices. This was still reproducible on v2.1.283 ([anthropics/claude-code#79944](https://github.com/anthropics/claude-code/issues/79944), open, filed 2026-07-21; earlier [#55677](https://github.com/anthropics/claude-code/issues/55677)).
   - Claude Desktop read **only `content`**. Blockscout moved `content` to a short summary and Desktop lost the data ([blockscout/mcp-server#324](https://github.com/blockscout/mcp-server/issues/324), 2026-02-09).
   - Rule: each channel must stand on its own. Put pagination hints, truncation notices and untrusted-content labels **inside structuredContent**. Make `content` the full serialized JSON, which is go-sdk v1.8's default when `Content` is nil (`mcp/server.go`, ~L470).
2. **Annotation defaults are unsafe, and one of our choices contradicts OpenAI's rules.**
   - In spec 2026-07-28, `destructiveHint` defaults to true and `openWorldHint` defaults to true ([schema](https://modelcontextprotocol.io/specification/2026-07-28/schema)). Set every hint explicitly.
   - OpenAI's guidelines say to use destructiveHint=true for "deletion, overwriting, **cancellation**…" and that "being able to undo an action does not, by itself, justify setting destructiveHint to false." They also say readOnlyHint=false for "starting stateful jobs or workflows, **queuing work**" ([plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)).
   - So `glide_reject_work` ("not destructive" in §6) needs a written justification or should flip to true. `openWorldHint` should be false on all nine tools (bounded private workspace).
3. **Elicitation on spec 2026-07-28 is multi round-trip (MRTR), not a server→client request.** The tool returns `InputRequiredResult` with `inputRequests` plus `requestState`, and the client retries `tools/call` ([spec tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).
   - Servers "MUST treat `requestState` as an attacker-controlled input." If it influences authorization they MUST protect it with HMAC or AEAD. They SHOULD bind principal, a short TTL and a digest of the arguments. Single-use MUST be enforced server-side ([MRTR](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr.md)).
   - go-sdk v1.8.0 supports this (`mcp/mrtr.go`, `res.InputRequests`).
4. **An elicitation "accept" does not prove a person clicked.**
   - Claude Code users can "auto-respond to elicitation requests without showing a dialog" with the Elicitation hook ([Claude Code MCP](https://code.claude.com/docs/en/mcp)).
   - Claude.ai/Desktop connector docs never mention elicitation: a grep of claude.com/docs/llms-full.txt, 3.3 MB, finds nothing. Absence noted.
   - Stripe's model is server-side: the agent gets a URL, the human approves in Stripe, the agent retries with an approval token, and approval expires after 24h ([docs.stripe.com/mcp](https://docs.stripe.com/mcp)). The Vloer-link fallback should be a first-class path, not a degraded one.
   - Also set `_meta["anthropic/requiresUserInteraction"]: true`. Claude Code then prompts on every call, even in auto/bypass modes, with no "don't ask again" (v2.1.199+).
5. **go-sdk v1.8.0 error behaviour.**
   - Typed `AddTool` handlers return schema-validation failures as `isError` results (SEP-1303 compliant), but the text is the raw validator message (`validating "arguments": …`). Wrap it.
   - A plain `error` from the handler becomes `isError`. A `*jsonrpc.Error` becomes a protocol error.
   - **Output-schema validation failure becomes a protocol error** (`validating tool output`) that the model never sees ([go-sdk tool.go/server.go v1.8.0], local module cache).
   - Tool names over 128 characters, or with invalid characters, are rejected at registration.

## 1. Anthropic guidance

**"Writing effective tools for agents"** ([anthropic.com/engineering/writing-tools-for-agents](https://www.anthropic.com/engineering/writing-tools-for-agents))
- Don't wrap API endpoints. Consolidate chained operations:
  - `schedule_event` instead of `list_users` + `list_events` + `create_event`.
  - `search_logs` instead of `read_logs`.
  - `get_customer_context` instead of three getters.
- "Too many tools or overlapping tools can also distract agents." Each tool should have "a clear, distinct purpose."
- Namespace by service and by resource (`asana_search`, `asana_projects_search`). Prefix vs suffix "non-trivial effects… vary by LLM"; choose by eval.
- Return high-signal fields and avoid `uuid`, `256px_image_url`, `mime_type`. "Merely resolving arbitrary alphanumeric UUIDs to more semantically meaningful… language (or even a 0-indexed ID scheme) significantly improves Claude's precision… by reducing hallucinations."
- `response_format` enum `concise|detailed`. Measured on Slack: detailed 206 tokens, concise 72 tokens (~⅓). Concise drops the IDs needed for follow-up calls.
- Response structure (XML/JSON/Markdown) affects eval results; "no one-size-fits-all."
- Offer pagination, range selection, filtering and truncation "with sensible default parameter values." Claude Code caps responses at 25,000 tokens by default.
- When truncating, "steer agents with helpful instructions." Errors should give "specific and actionable improvements, rather than opaque error codes or tracebacks."
- Name parameters unambiguously (`user_id`, not `user`). Describe the tool "to a new hire."
- Web search example: Claude appended "2025" to queries, which was fixed by editing the description. Precise description refinements helped Sonnet 3.5 reach SOTA on SWE-bench Verified.
- Eval metrics to track: accuracy, runtime per call and per task, number of calls, tokens, tool errors. Use held-out test sets.

**"Advanced tool use"** (2025-11-24) ([anthropic.com/engineering/advanced-tool-use](https://www.anthropic.com/engineering/advanced-tool-use))
- Tool-definition cost by server: GitHub 35 tools ~26K tokens; Slack 11 ~21K; Sentry 5 ~3K; Grafana 5 ~3K; Splunk 2 ~2K. That is 58 tools ≈ 55K; Jira alone is ~17K. Anthropic internally saw 134K.
- Tool Search: ~8.7K tokens instead of ~77K (85% less). Accuracy with tool search: Opus 4 49%→74%, Opus 4.5 79.5%→88.1%. Recommended when definitions exceed 10K tokens or there are 10+ tools. "Keep your three to five most-used tools always loaded."
- Programmatic tool calling: tokens 43,588→27,297 (−37%). Internal knowledge retrieval 25.6%→28.5%; GIA 46.5%→51.2%. Document return formats in the description. Opt in tools that are parallel-safe and idempotent.
- Tool Use Examples raised accuracy on complex parameter handling from 72% to 90%. Use 1–5 realistic examples per tool, focused on ambiguity. Not useful for "simple single-parameter tools."
- Bad vs good: `query_db_orders` / "Execute order query" vs `search_customer_orders` with scope and return info.

**"Code execution with MCP"** (2025-11-04) ([anthropic.com/engineering/code-execution-with-mcp](https://www.anthropic.com/engineering/code-execution-with-mcp))
- Loading tools as files cut 150,000→2,000 tokens (98.7%). Intermediate results pass through the model; a 2-hour transcript is ~50,000 extra tokens.
- This needs client-side sandboxing. The server can't do it for Claude.ai or ChatGPT.

**Claude API "Define tools"** ([platform.claude.com/…/define-tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools))
- Name regex is `^[a-zA-Z0-9_-]{1,128}$`, so **no dots**.
- "Provide extremely detailed descriptions. This is by far the most important factor." Cover what it does, when to use it "(and when it shouldn't)", each parameter's meaning, caveats and what it does not return. "Aim for at least 3–4 sentences."
- Consolidate related operations "into a single tool with an action parameter" (create_pr/review_pr/merge_pr).
- Prefix names with the service. Return "semantic, stable identifiers."
- `input_examples` must validate against the schema (else HTTP 400). Cost is ~20–50 tokens simple, ~100–200 nested. This is an **API field; MCP's Tool type has no examples field**: name, title, description, icons, inputSchema, outputSchema, annotations, `_meta` ([spec](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

**Strict mode / structured outputs (Claude)** ([platform.claude.com/…/structured-outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs))
- Per-request limits: 20 strict tools, 24 optional parameters in total across strict schemas, 16 union-typed parameters.
- `additionalProperties` must be false. Not supported: recursive schemas and numeric constraints (min/max/multipleOf).
- "Schema is too complex for compilation" returns 400. Compiled grammars are cached for 24h.
- MCP servers can't turn strict on; the client decides. Per Ronacher (below), Claude Code does not use strict mode.

**Tool search docs** ([platform.claude.com/…/tool-search-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool))
- "Claude's ability to pick the right tool degrades once you exceed 30–50 available tools."
- Search matches names, descriptions, argument names and argument descriptions. It returns up to 5 tools by default.

**Claude connector review criteria** ([claude.com/docs/connectors/building/review-criteria](https://claude.com/docs/connectors/building/review-criteria))
- A tool that mixes safe and unsafe HTTP methods "is rejected." Split reads from writes, ideally create/update/delete separately. "Documenting safe versus unsafe operations within one tool's description doesn't satisfy this."
- Every tool needs `title` plus `readOnlyHint: true` or `destructiveHint: true`. "Read-only tools can run without per-call confirmation, and destructive tools always prompt."
- Names must be 64 characters or fewer.
- Descriptions must "match the tool's actual behavior." They are rejected if they:
  - instruct Claude to call unrequested tools;
  - interfere with other tools;
  - pull instructions from external sources;
  - hide or encode instructions;
  - override system instructions or promote products.
- Generic "Internal Server Error"/"Bad Request" fails review. "Validate inputs and return actionable error messages." Don't return "a full database dump when a summary was requested."
- Don't query Claude's memory or chat history.

**Claude connector limits** ([claude.com/docs/connectors/building](https://claude.com/docs/connectors/building))
- claude.ai/Desktop: max result ~150,000 characters; timeout **240 s per tool call**.
- Claude Code: 25,000 tokens (`MAX_MCP_OUTPUT_TOKENS`); timeout configurable (`MCP_TOOL_TIMEOUT`).
- Resource subscriptions are unsupported.

**Claude Code specifics** ([code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp))
- Warns above 10,000 tokens.
- Over the limit, the result is saved to a file and replaced by a file-path message.
- `_meta["anthropic/maxResultSizeChars"]` raises this per tool, ceiling 500,000.
- Tool search is on by default: "Only tool names and server instructions load at session start." Server instructions should say what category of tasks the tools handle and when to search for them.
- **Each tool description and the server instructions are truncated at 2,048 characters**; put critical details first.
- `_meta["anthropic/alwaysLoad"]: true` for tools needed on every turn.
- Root-level `anyOf`/`oneOf`/`allOf` gets flattened, and the requirement moves into prose that is not enforced, so keep validating server-side.
- Property names must be 1–64 characters of `[A-Za-z0-9_.-]`. Invalid schemas exclude the tool.
- Idle timeout is 5 minutes for HTTP. Calls running past 2 minutes move to the background. Progress notifications do not extend the wall-clock limit.
- Plugin tool names take the form `mcp__plugin_<plugin>_<server>__<tool>`.

## 2. OpenAI guidance

**Function calling** ([developers.openai.com/api/docs/guides/function-calling](https://developers.openai.com/api/docs/guides/function-calling))
- Describe the purpose, each parameter with its format, and what the output represents.
- "Use enums and object structure to prevent invalid states" (bad example: `toggle_light(on, off)`).
- "Pass the intern test."
- "Don't make the model fill arguments you already know." Combine functions that are always called in sequence.
- "Aim for fewer than 20 functions available at the start of a turn" (a soft rule). Examples "may hurt performance for reasoning models."
- Namespaces plus `defer_loading`: keep the namespace description concise and put detail in each function.
- Definitions are billed as input tokens.
- Strict mode is "recommend[ed] always." It requires `additionalProperties:false` and every field in `required`, with optional fields expressed as `["type","null"]`.

**Other OpenAI limits**
- Function name: a-z, A-Z, 0-9, `_`, `-`, max 64 ([openai-openapi spec](https://raw.githubusercontent.com/openai/openai-openapi/manual_spec/openapi.yaml)). Max 128 functions.
- Structured outputs: ≤5000 properties, ≤10 nesting levels, ≤1000 enum values, 120,000 characters of names and enums ([structured-outputs](https://developers.openai.com/api/docs/guides/structured-outputs)).

**Plugins (formerly Apps SDK; old URLs redirect)** ([plan/tools](https://developers.openai.com/plugins/plan/tools), [build/mcp-server](https://developers.openai.com/plugins/build/mcp-server), [guidelines](https://developers.openai.com/plugins/plugin-guidelines), [reference](https://developers.openai.com/plugins/reference))
- Tool shape:
  - "Do not mirror an internal API."
  - "Split operations when they have different permissions, safety risks, or confirmation requirements."
  - Descriptions say "what the tool does… when to use it… distinguish it from similar tools… limits or prerequisites."
  - "Do not depend on the model guessing identifiers, account scope." "Return stable identifiers."
- Server instructions and results:
  - Server instructions are for cross-tool sequences and rate limits. "Keep the most important details in the first 512 characters. Do not repeat every tool description or try to change the model's personality."
  - Results: `structuredContent` is "concise data the model can inspect"; `content` is text; `_meta` is "hidden from the model." The model "reads [structuredContent] verbatim."
  - "Keep published tool names and schemas backward compatible."
- Guidelines:
  - Annotations are required as **explicit booleans**.
  - Metadata must not "manipulate how the model selects or uses other plugins." "Do not instruct the model to invoke another plugin."
  - No generic executor "to enable operations not individually exposed for review."
  - "Tools should be safe to retry where possible, or explicitly indicate when retries may cause repeated effects."
  - Don't request the conversation history.
  - Response minimisation: no "session IDs, trace IDs, request IDs, timestamps" unless required.
  - Annotations "do not… replace… human confirmation for irreversible operations."
- Confirmation: `destructiveHint` means "the host knows to elicit explicit approval first." For approval-gated tools, ChatGPT withholds `toolInput` from widgets until approved ([reference](https://developers.openai.com/plugins/reference)).

## 3. What server builders changed after launch

- **GitHub MCP server**
  - Consolidated into multi-method tools that stay split by risk: `issue_read`, `issue_write`, `sub_issue_write`, `pull_request_review_write` ([changelog 2025-10-29](https://github.blog/changelog/2025-10-29-github-mcp-server-now-comes-with-server-instructions-better-tools-and-more/)). Same post added server instructions for ordering ("always use tool A before tool B") and a `default` toolset.
  - Projects consolidation (`projects_list/get/write`) saved ~23,000 tokens (50%). Tools the token's scopes can't use are hidden ([2026-01-28](https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/)).
  - `X-MCP-Tools` loads 3–10 tools, cutting context "~60-90%". Content sanitisation (invisible Unicode, hidden HTML) is on by default. Migrated to the official Go SDK ([2025-12-10](https://github.blog/changelog/2025-12-10-the-github-mcp-server-adds-support-for-tool-specific-configuration-and-more/)).
  - Warning from the same changelog: "If you notice that a commonly used tool is missing, it's likely been consolidated." Renames break users.
- **GitHub Copilot (VS Code)**: default tools cut from 40 to 13. Resolution +2–5 pp on SWE-Lancer and SWE-bench Verified; −400 ms latency. The full toolset *reduced* resolution 2–5 pp: the "agent ends up ignoring explicit instructions… calling tools that are unnecessary." Embedding routing reached 94.5% coverage vs 69.0% for the static list ([github.blog, 2025-11-19](https://github.blog/ai-and-ml/github-copilot/how-were-making-github-copilot-smarter-with-fewer-tools/)).
- **Sentry (David Cramer)**
  - "Agent mode" (a single `use_sentry` tool) "worsened… steering… response times were ~doubled."
  - Overloading into `get_sentry_resource` accepts a URL and "auto-detects resource type."
  - Moved from 14 native tools to 8 native + 19 behind `search_tools`/`execute_tool`. Instruments `gen_ai.tool.name` and result counts to find no-result queries ([A Bigger Toolbox, 2026-06](https://cra.mr/a-bigger-toolbox-for-mcp)).
  - Responses carry next-step hints, e.g. "use `search_issue_events(organizationSlug=…, issueId=…)`". "Fewer params." Progressive disclosure "hides context… description-based steering disappears" ([Context Management and MCP, 2026-02-02](https://cra.mr/context-management-and-mcp/)).
  - Return LLM-usable errors instead of throwing ([Instrumenting, 2025-05-09](https://cra.mr/instrumenting-an-mcp-server/)).
  - VS Code/gpt-4o "seems to have a 1024 character limit on tool descriptions" (anecdote, [2025-05-06](https://cra.mr/mcp-is-not-good-yet/)).
- **Block (60+ servers)** ([playbook, 2025-06-16](https://engineering.block.xyz/blog/blocks-playbook-for-designing-mcp-servers))
  - Design workflow-first.
  - "Build tools with one risk level only." Goose's permission levels are per tool.
  - The Goose file reader errors above 400 KB with an actionable message suggesting `sed -n`.
  - Don't put dynamic data such as timestamps in instructions (it breaks prompt caching).
  - "Hard for them to chain together 20 tool calls."
  - The Linear v1 server needed 4–6 calls per question, so they merged into `get_team_info` / `get_issue_info` with a category enum.
- **Vercel**: build tools around "complete user intentions"; respond conversationally rather than `{status:200,data:{id}}` ([2025-09-09](https://vercel.com/blog/the-second-wave-of-mcp-building-for-llms-not-developers)).
- **Cloudflare**
  - Code Mode: "LLMs are better at writing code to call MCP, than at calling MCP directly" ([2025-09-26](https://blog.cloudflare.com/code-mode/)).
  - API server with 2 tools (`search`, `execute`) at ~1,000 tokens vs 1.17M for more than 2,500 endpoints ([2026-02-20](https://blog.cloudflare.com/code-mode-mcp/)). Not relevant at nine tools.
- **Atlassian Rovo MCP v2** (GA 2026-09-08): default tool exposure cut context >50%; "optimised tool responses"; discover/execute tools; `tools/list` paginated at 50 ([changelog](https://developer.atlassian.com/cloud/rovo-mcp/changelog/)).
- **Stripe**: `stripe_api_read` and `stripe_api_write` split by HTTP method, plus server-side human approval via URL and token with 24h expiry. From 2026-10-31, only keys tagged as agent keys are accepted ([docs.stripe.com/mcp](https://docs.stripe.com/mcp)).
- **Linear**: upsert-style `save_*` tools. Fix: "label arrays sent as JSON strings are parsed instead of silently wiping existing labels" ([2026-05-14](https://linear.app/changelog/2026-05-14-code-intelligence)). Added read-only skill tools ([2026-07-02](https://linear.app/changelog/2026-07-02-initiative-properties)).
- **Supabase**: read-only mode, project scoping, feature groups, and "wrapping query results with warnings to the LLM not to follow embedded commands." Tested on weaker models. "Beware of user fatigue" with per-call approval ([2025-09-16](https://supabase.com/blog/defense-in-depth-mcp)).
- **Neon**: two-step `prepare_database_migration` / `complete_database_migration`. The eval pass rate went from 60% to 100% by changing descriptions only ([2025-06-18](https://neon.com/blog/test-evals-for-mcp)).

## 4. Research numbers

- **"MCP Tool Descriptions Are Smelly!"** (arXiv [2602.14878](https://arxiv.org/abs/2602.14878)): 856 tools from 103 servers.
  - 97.1% have at least one smell; 56% have Unclear Purpose. Common smells: Unstated Limitations, Missing Usage Guidelines, Opaque Parameters.
  - Full augmentation: +5.85 pp median success, +15.12% partial completion, **+67.46% execution steps**, regressions in 16.67% of cases.
  - Removing Examples "does not statistically degrade performance." Compact variants are statistically equivalent.
- **"From Docs to Descriptions"** (arXiv [2602.18914](https://arxiv.org/abs/2602.18914)): 10,831 servers; 73% repeated tool names. Fixing functionality and accuracy smells gives +11.6% and +8.8% selection. Compliant descriptions reach 72% selection vs a 20% baseline.
- **RAG-MCP** (arXiv [2505.03275](https://arxiv.org/abs/2505.03275)): retrieval raises selection from 13.62% to 43.13%; prompt tokens cut >50%.
- **LiveMCPBench** (arXiv [2508.01780](https://arxiv.org/abs/2508.01780)): 70 servers, 527 tools. Claude-Sonnet-4 78.95%, most models 30–50%. "Retrieval errors account for nearly half of all failures."
- **MCP-Bench** (arXiv [2508.20453](https://arxiv.org/abs/2508.20453)): 28 servers, 250 tools, 20 LLMs, "persistent challenges."
- **MCPToolBench++** (arXiv [2508.07575](https://arxiv.org/abs/2508.07575)): more than 4k servers. The abstract gives no headline number.
- **DynamicMCPBench** (arXiv [2607.20531](https://arxiv.org/abs/2607.20531), EMNLP 2026): 121 servers, 750 tasks, scored pass^3. Best agents solve ~half. Accuracy falls from 39% on the shortest chains to 13% on the longest.
- **ToolTweak** (arXiv [2510.02554](https://arxiv.org/abs/2510.02554)): manipulated names and descriptions raise selection from ~20% to 81%.
- **Tool poisoning / shadowing** (Invariant Labs, [blog](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks)): a malicious server's description redirected a trusted email tool in Cursor.
- **Ronacher, "Better Models: Worse Tools"** ([lucumr, 2026-07-04](https://lucumr.pocoo.org/2026/7/4/better-models-worse-tools/)):
  - Opus 4.8 and Sonnet 5, but no older models, invent keys inside **nested `edits[]` objects**. Failure rate ~20% in one session; stripping thinking blocks halved it; strict mode eliminated it.
  - Hypothesis: post-training in Claude Code's forgiving harness, which filters unknown keys, aliases parameters and does not use strict mode.
  - Top-level string parameters are emitted inline, while arrays of objects are emitted as JSON inside a parameter.
  - Codex models did not regress.

## 5. Concrete rules by topic

**Naming**
- Charset `[A-Za-z0-9_-]`: the MCP spec allows `.`, but the Claude API regex and OpenAI's 64-character regex exclude it.
- Length: ≤64 characters (Claude directory, OpenAI). Cursor suppresses tools whose server name plus tool name exceeds 60 characters ([awslabs/mcp#1283](https://github.com/awslabs/mcp/issues/1283), 2025-09; [composio#2788](https://github.com/ComposioHQ/composio/issues/2788), 2026-02). The 40-tool Cursor cap appears only in 2025 forum posts, not in current [Cursor docs](https://cursor.com/docs/context/mcp).
- Service prefix. Uniqueness is per server, and `serverInfo.name` "SHOULD NOT be relied upon for disambiguation" ([spec](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).
- Return tools in deterministic order (spec SHOULD; helps prompt caching). The tool list may vary by authorization but "MUST NOT vary per-connection."

**Descriptions**
- Front-load purpose, then when to use it and when not to, what it returns, limits, and side effects. Keep under 2,048 characters (Claude Code truncation). Anthropic recommends at least 3–4 sentences.
- Don't instruct behaviour or reference other servers (Claude and OpenAI review rules).
- Server instructions: first 512 characters matter for OpenAI; truncated at 2,048 in Claude Code. They carry cross-tool order and are what tool search sees.

**Parameters**
- Keep them flat and use top-level primitives (Ronacher; MCP elicitation schemas are also flat).
- Use enums for states.
- Accept human identifiers such as a tracker URL alongside ids (Anthropic UUIDs; Sentry URL mode).
- Don't ask for what the token already implies (OpenAI).
- Use `additionalProperties:false` with no-parameter tools declared as `{"type":"object","additionalProperties":false}` (spec).
- No root `anyOf`.
- Coerce JSON-stringified arrays, per the Linear bug.

**Responses**
- Offer `detail: brief|full`.
- Use cursor pagination with `has_more`/`next_cursor` inside structuredContent.
- Truncation must be explicit and include a narrowing hint.
- Use `resource_link` for large content, though Claude.ai lacks resource subscriptions.
- Provide next-step hints that carry exact ids (Sentry).
- Stay under 25k tokens (Claude Code) and ~150k characters (Claude.ai).

**Errors**
- Use `isError:true` for validation, business-rule and upstream failures (SEP-1303 Final, [modelcontextprotocol.io/seps/1303](https://modelcontextprotocol.io/seps/1303-input-validation-errors-as-tool-execution-errors)). Its evidence: Cursor repeated the same bad call 3 times while receiving protocol errors.
- An expired or unknown handle returns a tool error that says so.
- SEP-2145 (unknown tool and output validation as tool errors) is a **proposal**, not in 2026-07-28 ([PR #2145](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2145)).

**Idempotency**
- There are no normative retry semantics in 2026-07-28. SEP-3182 "Request Idempotency" was closed ([PR #3182](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3182)). Issue [#3394](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3394) (2026-09-27, open) documents lost-response retries re-executing side effects.
- So derive keys server-side, as §6 already does.
- SEP-2848 "Asynchronous Approval for Tool Calls" (open, an extension on Tasks) is the proposed standard for out-of-band approval ([PR #2848](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2848)).

**How many tools**
- Nine is below OpenAI's soft limit of 20 and Anthropic's 30–50 degradation zone.
- Claude Code defers MCP tools anyway, so `glide_overview` and `glide_find_work` are the candidates for `anthropic/alwaysLoad`.

**Measuring the token budget**
- POST `/v1/messages/count_tokens` with and without the `tools` array; the difference is the cost. It is free but rate-limited ([token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting)).
- Use tiktoken for OpenAI.
- Put the number in CI next to the tool-list snapshot.

## 6. Traps (numbered, with evidence)

1. **Overlapping or near-duplicate tools cause wrong selection.** Evidence: Anthropic ("overlap… vague purpose, agents can get confused"); GitHub −2–5 pp with the full toolset; Sentry saw splitting `search_errors`/`search_traces`/`search_logs` → "calling the wrong tool even more often."
2. **Too many tools.** Evidence: 30–50 degradation (Anthropic docs); RAG-MCP 13.62% baseline; LiveMCPBench retrieval errors are ~half of failures.
3. **UUID-only parameters and outputs.** Evidence: Anthropic's precision and hallucination finding; OpenAI says don't make the model guess identifiers.
4. **Huge JSON dumps.** Evidence: Claude Code persists anything over 25k tokens to a file and warns at 10k; Claude.ai's limit is ~150k characters; the directory rejects "full database dump" responses; Atlassian optimised its responses.
5. **Silent truncation, or a pagination hint only in text.** Evidence: Claude Code drops text when structuredContent exists (#79944).
6. **Summary-only `content`.** Evidence: Claude Desktop sees only the summary (blockscout#324).
7. **Raw validator or opaque errors.** Evidence: directory review fails "Internal Server Error"; SEP-1303's Cursor repeated the call 3×; go-sdk's default text is raw.
8. **Output-schema drift.** In go-sdk, an output that doesn't match `outputSchema` becomes a protocol error the model never sees. Contract-test outputs.
9. **Nested arrays of objects and complex unions.** Evidence: Ronacher (~20% invented keys); Claude Code flattens root combinators into prose; Claude strict mode caps 24 optional and 16 union parameters.
10. **Type coercion wiping data.** Evidence: Linear's label arrays sent as JSON strings "silently wiping existing labels."
11. **Descriptions that command the model.** They look like prompt injection and get rejected by Claude and OpenAI reviews. ToolTweak shows metadata can bias selection from 20% to 81%.
12. **Abusing server instructions.** Evidence: OpenAI says not to repeat tool docs or change personality; Claude Code truncates at 2,048; Block says no dynamic data (breaks caching).
13. **Tool-name collisions across servers.** Evidence: 73% repeated tool names (arXiv 2602.18914); the spec says clients may collide. Generic names like `search` and `get_status` are exposed to shadowing (Invariant).
14. **Treating annotations as safety.** Evidence: spec "clients MUST consider tool annotations to be untrusted"; OpenAI and Claude reviews say annotations don't replace authorization or confirmation.
15. **Relying on annotation defaults.** Evidence: destructive and open-world default to true, which leads to over-prompting and approval fatigue (Supabase).
16. **Assuming elicitation proves a human.** Evidence: Claude Code's Elicitation hook auto-responds; clients that don't declare the capability MUST NOT receive it; Claude.ai documents no support.
17. **Unprotected `requestState` in stateless MRTR.** Evidence: the spec requires integrity protection, principal binding, TTL and an argument digest; single-use is server-enforced.
18. **Long blocking tools.** Evidence: Claude.ai 240 s hard limit; Claude Code 5 min idle and backgrounding at 2 min; progress notifications don't extend the wall clock. `glide_approve_work` must return a Work Item/Shift id and state immediately, never wait for the Run.
19. **Lost-response retries duplicating side effects.** Evidence: #3394, no spec key. OpenAI requires retry-safety or a disclosure.
20. **Echoing untrusted ticket text.** Evidence: Supabase stored injection; GitHub sanitisation. Delimiters must live in structuredContent (trap 5).
21. **Renaming or merging tools after launch.** Evidence: GitHub's "likely been consolidated" note; OpenAI backward-compat rule. Claude Code permission rules and hooks match on `mcp__server__tool`.
22. **Mixed-risk "action" tools.** Evidence: Anthropic's API doc suggests an action parameter, but the directory rejects mixed safe and unsafe operations; Goose says one risk level per tool; OpenAI says split on different confirmation needs.
23. **Diagnostic noise in results** (trace or request ids, timestamps). Evidence: OpenAI response minimisation. Put them in `_meta` (hidden from the model per OpenAI).
24. **Enum drift.** No direct measured evidence found (absence). The closest sources are OpenAI's backward-compat rule and Anthropic's "2025" query-bias example of model priors overriding schemas.

## 7. ploeg-mcp checklist

1. Tool names `glide_<verb>_<noun>` using only `[a-z_]`, ≤40 characters (leaves room for Cursor's 60-character combined limit) — Claude/OpenAI name regexes; [awslabs#1283](https://github.com/awslabs/mcp/issues/1283).
2. Fixed registration order and a CI snapshot of `tools/list` — spec ordering SHOULD.
3. Toolsets decided by the token's scopes; hidden tools absent from the list — spec ("MAY vary by the authorization"); GitHub scope filtering.
4. Never rename a published tool; add fields only — [OpenAI build](https://developers.openai.com/plugins/build/mcp-server); GitHub changelog.
5. Description order: purpose sentence, then use-when, don't-use-when (naming the sibling tool), returns, limits and side effects. 3–6 sentences, under 1,000 characters — [define-tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools); arXiv 2602.14878; Claude Code 2,048 cut.
6. No imperative model instructions, no references to other servers, no promotion — [review criteria](https://claude.com/docs/connectors/building/review-criteria); OpenAI guidelines.
7. Server instructions ≤500 characters and static: what Glide is, read before propose before steer, spend needs a person — OpenAI 512; Block caching.
8. Explicit `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint:false` on all nine tools — spec defaults; OpenAI explicit booleans.
9. Set `glide_reject_work` destructiveHint=true or write down why not; approve and cancel are true — OpenAI "cancellation… undo doesn't justify false."
10. `glide_propose_work`: readOnly=false, destructive=false, idempotent=true — OpenAI "queuing work."
11. Keep approve, reject and cancel as separate tools, never one `action` tool — directory read/write split; Goose one risk level; OpenAI split on confirmation.
12. Flat input schemas, top-level primitives, no nested object arrays, no root combinators — Ronacher; Claude Code flattening.
13. `additionalProperties:false`; empty-input tools use the recommended empty-object schema — spec.
14. Enums for `state` and `detail`, with a default for every optional parameter — OpenAI enums; Anthropic defaults.
15. `glide_get_work` accepts a Ploeg id **or** tracker URL and auto-detects — Sentry `get_sentry_resource`; Anthropic UUIDs.
16. Never ask the model for principal or Team when the token implies them — OpenAI "don't make the model fill arguments you already know."
17. Coerce JSON-stringified arrays and numbers-as-strings on input; reject when ambiguous — Linear label bug.
18. Output: `structuredContent` holds the full answer plus `next_cursor`, `has_more`, `truncated` and `hint`. `content` is the same data serialized, not a lossy summary — #79944, blockscout#324, spec back-compat SHOULD.
19. Declare `outputSchema` on every tool and contract-test outputs, because a failure is a protocol error — go-sdk v1.8.0 server.go.
20. `detail: brief|full` defaulting to brief, with brief still including ids needed for follow-ups — Anthropic 206 vs 72 tokens.
21. Page size ≤25 by default and a hard cap of ~8k tokens per result; state explicitly when results are truncated or more pages exist — Claude Code 10k warning; Block.
22. Show names first (Team name, Work Item title, tracker key) and ids second; money as 2-decimal strings plus currency — Anthropic interpretable ids.
23. End each result with `next_steps` naming the exact follow-up tool and arguments — Sentry hints; Vercel conversational responses.
24. Leave trace and request ids out of model-visible output; use `_meta` or audit only — OpenAI response minimisation.
25. Wrap echoed ticket text in labelled `untrusted_content` fields inside structuredContent and strip invisible Unicode — Supabase; GitHub sanitisation.
26. Business errors are `isError:true` with cause, the valid alternatives, and the tool or argument to try next. Wrap go-sdk's raw validation text — SEP-1303; review criteria.
27. Unknown or expired ids and cursors give a tool error that says how to recover (e.g. call `glide_find_work`) — spec handle guidance.
28. Steer tools return within ~10 s with Work Item id and state, never waiting for Run completion — Claude.ai 240 s; Claude Code idle and backgrounding.
29. Approval runs through MRTR `InputRequiredResult`, only when the client declared elicitation. `requestState` is AEAD-protected with principal, TTL ≤10 min and a digest of tool plus arguments, and is single-use in Ploeg — [MRTR spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr.md).
30. Treat a form "accept" as the principal's consent, not proof of a person. Prefer URL mode to a Vloer approval page where the person authenticates; the fallback link is the default on Claude.ai — Claude Code Elicitation hook; Stripe approval URL and token.
31. Set `_meta["anthropic/requiresUserInteraction"]: true` on approve and cancel — Claude Code docs.
32. Consider `_meta["anthropic/alwaysLoad"]` for `glide_overview` only — Claude Code docs; Anthropic "3–5 always loaded."
33. Derive the propose idempotency key server-side and return `deduplicated: true` on replay; state retry behaviour in the description — OpenAI retry rule; #3394; SEP-3182 closed.
34. Token budget in CI: `count_tokens` with the tools minus without, failing above ~3k tokens for all nine tools — token-counting docs; Anthropic server cost table.
35. Eval suite of 30+ realistic multi-call prompts with held-out tasks. Track accuracy, calls, tokens and tool errors, and gate description changes on it — Anthropic; Neon 60%→100%; arXiv 2602.14878 (augmentation can regress 16.67%).
36. Instrument each call with `gen_ai.tool.name`, result count, and error class, and review zero-result queries — Sentry.
37. No `examples` field is available in MCP; put at most one inline example in the description, and only for the cursor or URL formats — MCP Tool fields; smell paper (Examples removable); Anthropic 1–5 only where ambiguous.

**Not found:**
- No Claude.ai/Desktop documentation of elicitation support.
- No current Cursor documentation of a tool-count cap.
- No published numbers on prefix vs suffix naming.
- No measured study of enum drift.
- MCPToolBench++ gives no headline number in its abstract.
