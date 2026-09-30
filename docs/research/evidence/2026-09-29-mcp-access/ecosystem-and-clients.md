# MCP ecosystem, client support and absence checks

> Raw research-agent report, 2026-09-29, kept as evidence for [the MCP access dossier](../../2026-09-29-mcp-access.md). Agent output, not independently verified line by line; the dossier states which claims were checked first-hand.

MCP ECOSYSTEM, CLIENT MATRIX AND ABSENCE CHECKS (crawled 2026-09-29)

Scope note: every item below comes from a page or API I fetched in this session. Where a page showed no date, the line says "undated". "Not documented" means the fetched doc page did not mention the feature. It does not prove the feature is missing. The modelcontextprotocol.io/clients feature-matrix page no longer exists: that URL now serves the "What is MCP" intro (https://modelcontextprotocol.io/clients, fetched 2026-09-29). So there is no longer an official matrix to cite, and the per-client docs are the only source.

== 0. HEADLINE FINDINGS ==
1. **A new MCP spec revision is current: 2026-07-28.** It went GA on 2026-07-28 (https://blog.modelcontextprotocol.io/posts/2026-07-28/ ; changelog https://modelcontextprotocol.io/specification/2026-07-28/changelog.md). What changed:
   - MCP is now **stateless**. The `initialize` handshake and `Mcp-Session-Id` are gone. Every request carries its protocol version and client capabilities in `_meta`. `server/discover` is new (SEP-2575, SEP-2567).
   - `subscriptions/listen` replaces the GET stream and `resources/subscribe`.
   - SSE resumability (`Last-Event-ID`) is removed.
   - **MRTR (Multi Round-Trip Requests) replaces server-initiated requests** (sampling, elicitation, roots). The server returns `resultType:"input_required"` (SEP-2322).
   - **Tasks moved out of core** into the extension `io.modelcontextprotocol/tasks`. It is poll-based (`tasks/get`, `tasks/update`) and `tasks/list` was removed (SEP-2663).
   - A formal extensions framework now covers Tasks, MCP Apps and Enterprise Managed Authorization (EMA).
   - **Deprecated: Roots, Sampling, Logging** (SEP-2577), the HTTP+SSE transport (SEP-2596), and **OAuth Dynamic Client Registration (DCR) in favour of Client ID Metadata Documents (CIMD)** (PR #2858).
   - New HTTP headers `Mcp-Method` and `Mcp-Name` are required (SEP-2243).
   - List results must carry `ttlMs`/`cacheScope` so clients can cache them (SEP-2549).
   - Servers SHOULD return tools in a deterministic order, for prompt-cache hits.
   - Clients MUST validate RFC 9207 `iss`.
   - Tier-1 SDKs (TypeScript, Python, Go, C#) support the revision; Rust is in beta.
2. **ACP now has a v2** (https://agentclientprotocol.com/protocol/v2/migration.md, labelled draft, undated). In `session/new`, `mcpServers` becomes optional. Every server object needs a `type` discriminator, SSE is removed, and stdio becomes an explicit capability (`session.mcp.stdio`). The Client fs/terminal APIs are removed, and v2 says Client-side tools should be exposed "through MCP servers passed in `mcpServers`". An RFD adds `"type":"acp"` (MCP-over-ACP, which targets only the 2026-07-28 spec).
3. **Vikunja has merged a native MCP server** at `/api/v2/mcp` (PR #3860, merged 2026-09-15). It is not yet in a release: the latest release is v2.6.0 from 2026-08-31.
4. **OpenHands V1 no longer reads `[mcp]` from config.toml.** Configuration moved to the UI, the `openhands mcp add` CLI and the SDK `mcp_config`.
5. **Glide's own code (local repo, development branch):**
   - The Ploeg ACP adapter sends `McpServers: []sdk.McpServer{}` on `session/new` (apps/ploeg/pkg/harness/adapters/acp/acp.go line ~230). This is the v1 shape: required, empty.
   - The Claude Code adapter passes `--strict-mcp-config` (apps/ploeg/pkg/harness/adapters/claudecode/claudecode.go line 77).
   - acp-profiles.md already flags that Goose v1.52.0 auto-enables MCP servers from `.agents/plugins/` in the repository (apps/ploeg/docs/contracts/acp-profiles.md line 36).

== 1a. TIMELINE ==
- 2024-11-25: Anthropic open-sources MCP. https://www.anthropic.com/news/model-context-protocol
- 2025-03-26: spec revision that adds the Streamable HTTP transport and OAuth. https://modelcontextprotocol.io/specification/2026-07-28/changelog.md (the revision chain is listed at https://modelcontextprotocol.io/llms.txt)
- 2025-03-26: Sam Altman says OpenAI will support MCP. It ships first in the Agents SDK, with the ChatGPT desktop app and Responses API to follow. https://x.com/sama/status/1904957253456941061
- 2025-04-09: Demis Hassabis says MCP support is coming to Gemini models and the SDK. https://x.com/demishassabis/status/1910107859041271977 ; https://techcrunch.com/2025/04/09/google-says-itll-embrace-anthropics-standard-for-connecting-ai-models-to-data/
- 2025-04-09: Google launches A2A. https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/
- 2025-05-19: Microsoft Build announces native MCP in Windows 11, a Windows MCP Registry, and system MCP servers. https://blogs.windows.com/windowsdeveloper/2025/05/19/advancing-windows-for-ai-development-new-platform-capabilities-and-tools-introduced-at-build-2025/
- 2025-06-18: spec revision adding elicitation, structured tool output and resource links. The docs tree is at https://modelcontextprotocol.io/docs/2025-06-18/.
- 2025-06-23: Linux Foundation launches the A2A project. https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents
- 2025-08 (month only): IBM's ACP (Agent Communication Protocol) winds down and merges into A2A. https://github.com/orgs/i-am-bee/discussions/5
- 2025-08-27: Zed launches "bring your own agent", i.e. the Agent Client Protocol. https://zed.dev/blog/bring-your-own-agent-to-zed
- 2025-09-08: MCP Registry preview. https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/
- 2025-09-10 (secondary sources): ChatGPT developer mode beta with full read/write MCP. https://community.openai.com/t/mcp-server-tools-now-in-chatgpt-developer-mode/1357233 ; https://devops.com/chatgpt-developer-mode-full-mcp-access-with-serious-responsibilities/
- 2025-10 (DevDay): OpenAI Apps SDK, built on MCP. https://openai.com/index/introducing-apps-in-chatgpt/ (returned 403 to curl, so the date comes from secondary sources)
- 2025-11-21: MCP Apps proposal (SEP-1865) from Anthropic, OpenAI and MCP-UI. https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/
- 2025-11-25: spec 2025-11-25 (experimental Tasks, CIMD, URL-mode elicitation) and the first-anniversary post. https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/
- 2025-12-09: Linux Foundation forms the Agentic AI Foundation (AAIF). Founding projects are MCP (Anthropic), goose (Block) and AGENTS.md (OpenAI). Google, Microsoft, AWS, Cloudflare and Bloomberg support it. https://blog.modelcontextprotocol.io/posts/2025-12-09-mcp-joins-agentic-ai-foundation/ ; https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation ; https://techcrunch.com/2025/12/09/openai-anthropic-and-block-join-new-linux-foundation-effort-to-standardize-the-ai-agent-era/
- 2025-12-10: Google launches managed remote MCP servers. https://techcrunch.com/2025/12/10/google-is-going-all-in-on-mcp-servers-agent-ready-by-design/
- 2026-01-26: MCP Apps becomes the first official extension. At launch it works in Claude web and desktop, Goose, VS Code Insiders, and ChatGPT ("starting this week"). JetBrains, Kiro and Antigravity stated intent. https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/ ; spec at https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx
- 2026-01-28: ACP support in Copilot CLI enters public preview. https://github.blog/changelog/2026-01-28-acp-support-in-copilot-cli-is-now-in-public-preview/
- 2026-03-12: A2A v1.0, with JSON-RPC, gRPC and HTTP+JSON bindings. https://a2a-protocol.org/latest/blog/2026/03/12/a2a-protocol-ships-v10-production-ready-standard-for-agent-to-agent-communication/
- 2026-04-29 (Cloud Next '26): Google says 50+ Google-managed MCP servers are GA or in preview. https://cloud.google.com/blog/products/ai-machine-learning/google-managed-mcp-servers-are-available-for-everyone
- 2026-07-28: spec 2026-07-28 GA (stateless). https://blog.modelcontextprotocol.io/posts/2026-07-28/ ; Google's write-up: https://developers.googleblog.com/scaling-ai-agent-infrastructure-with-the-mcp-stateless-updates/

== 1b. CLIENT SUPPORT MATRIX ==
Transport and auth first, then protocol features. "n/d" means not documented on the fetched page.

**Claude Code** (https://code.claude.com/docs/en/mcp, undated, fetched 2026-09-29)
- Transports: `http` (Streamable HTTP), `sse` (deprecated), WebSocket (static headers only), stdio.
- OAuth: DCR is the default. Pre-registered clients work via `--client-id`, `--client-secret` and `--callback-port`, or an `oauth.clientId` in JSON. CIMD is "automatically discovered". Headless login: `claude mcp login <name> --no-browser`.
- Static auth: `--header "Authorization: Bearer …"`, with `${VAR}` expansion in `.mcp.json`. Protected variables (ANTHROPIC_API_KEY, NPM_TOKEN, …) expand to empty in remote url/headers.
- Features: tools, resources, prompts, elicitation dialogs, and `list_changed` (v2 runtime). Tasks, sampling and roots are n/d.
- Context control: tool search / deferred loading is on by default (`ENABLE_TOOL_SEARCH=false` disables it). `MAX_MCP_OUTPUT_TOKENS` defaults to 25,000 with a warning at 10,000. A server can raise its own limit per tool with `_meta["anthropic/maxResultSizeChars"]`, up to 500,000 chars.
- Scopes: local / project (`.mcp.json`) / user. Org control via `managed-mcp.json` and `managedMcpServers` with `allowedMcpServers`/`deniedMcpServers`, and `--strict-mcp-config` with `--mcp-config`.
- Serving: `claude mcp serve` runs Claude Code itself as a **stdio-only** MCP server exposing its tools.

**Claude.ai custom connectors** (https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp, dated 2026-08-11)
- Plans: Free (one connector), Pro, Max, Team, Enterprise.
- Install model: on Team/Enterprise **only Owners add a connector**, then each member connects individually. Pro/Max/Free users add their own.
- Auth: OAuth. "Advanced settings" takes a pre-registered OAuth Client ID and Secret. Static bearer is n/d.
- Network: Anthropic's cloud calls the server, so it must be reachable from Anthropic's IP ranges.
- Features: MCP Apps is live on Claude web and desktop (MCP blog, 2026-01-26).

**Claude Desktop**
- Remote servers go through the same connectors as Claude.ai (same article).
- Local stdio servers come from `claude_desktop_config.json`. The `mcpServers` example is on the Claude Code page above.

**ChatGPT** (https://developers.openai.com/api/docs/guides/developer-mode, undated)
- Developer mode: Pro, Plus, Business, Enterprise and Education, web only. Enabled under Settings → Security and login.
- Transports: SSE and streaming HTTP.
- Auth: OAuth (CIMD and DCR), no-auth, or mixed. Static bearer is n/d.
- Features: full read/write tools, resources, prompts, and MCP Apps / Apps SDK UI.
- Plan conflict: OpenAI's help center restricts full MCP to Business and Enterprise/Edu, with Pro read/fetch only (https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt; returned 403 to me, so the conflict comes from the search summary).
- Admin: on Business, only admins/owners enable developer mode and deploy apps.
- The Apps SDK is MCP-based and has converged with MCP Apps. Known protocol differences: https://github.com/modelcontextprotocol/ext-apps/issues/201

**OpenAI Codex CLI** (https://learn.chatgpt.com/docs/extend/mcp?surface=cli, which developers.openai.com/codex/mcp now redirects to; undated)
- Transports: stdio and Streamable HTTP.
- Config: `[mcp_servers.<name>]` with `url`, `command`, `bearer_token_env_var`, `http_headers`, `env_http_headers`.
- OAuth: DCR and CIMD, `codex mcp login <name>`, and pre-registered client IDs.
- Tool control: `enabled_tools`, `disabled_tools`, `default_tools_approval_mode` (auto/prompt/writes/approve), and per-tool `tools.<t>.approval_mode`.
- Codex acting as an MCP server is n/d on that page.
- ACP support comes via the adapter https://github.com/agentclientprotocol/codex-acp.

**Cursor** (https://cursor.com/docs/context/mcp, undated)
- Transports: stdio, SSE, Streamable HTTP.
- Auth: headers with `${env:VAR}` bearer. For servers without DCR, a static OAuth `CLIENT_ID`, `CLIENT_SECRET` and `scopes`. DCR itself is not explicitly named.
- Features: tools, prompts, resources, roots, elicitation, and Apps (MCP Apps).
- Admin: an Enterprise "MCP Allowlist" (command patterns for stdio, URL patterns for remote) plus tool allowlists.
- No tool-count cap is documented.
- Cursor also ships an ACP agent (https://cursor.com/docs/cli/acp).

**VS Code / GitHub Copilot** (https://code.visualstudio.com/docs/copilot/customization/mcp-servers, last updated 2026-09-16)
- Transports: stdio (can be sandboxed) and `type:"http"`. SSE is n/d on this page.
- Features: tools, resources, prompts, and MCP Apps.
- Admin: "Organizations can centrally manage access to MCP servers via GitHub policies".
- The OAuth flavour and tool cap are n/d here.
- Copilot CLI speaks ACP (public preview since 2026-01-28, link above).

**Windsurf, now documented as "Devin Desktop"/Cascade** (https://docs.devin.ai/desktop/cascade/mcp; docs.windsurf.com redirects there with a 307)
- Transports: stdio, Streamable HTTP, SSE, each with OAuth.
- Features: tools, resources, prompts.
- **Hard cap of 100 tools** across all servers; `disabledTools` turns individual tools off.
- Admin: team MCP allowlist (anchored regex) and custom MCP registries that follow the official registry schema.

**Zed** (https://zed.dev/docs/ai/mcp, undated)
- Transports: stdio, and remote HTTP with headers or the standard MCP OAuth flow when no auth header is set.
- Features: tools (with `tools/list_changed`) and prompts as slash commands. Discovery, sampling and elicitation are listed as not implemented.
- ACP bridge: servers configured in Zed are **forwarded to external agents via ACP `mcpServers`**.

**JetBrains AI Assistant** (https://www.jetbrains.com/help/ai-assistant/mcp.html, undated)
- Transports: stdio, Streamable HTTP, SSE (legacy).
- Serving: since 2025.2 the IDE ships a bundled MCP server that Claude Code, Codex, VS Code and Copilot CLI can connect to.
- OAuth, headers, resources, prompts, elicitation and sampling are n/d.
- Junie is listed as an ACP agent (https://agentclientprotocol.com/get-started/agents.md). Junie's MCP docs were not fetched.

**Gemini CLI** (https://geminicli.com/docs/tools/mcp-server/, undated)
- Transports: stdio, SSE (`url`), Streamable HTTP (`httpUrl`), with headers.
- OAuth: auto-discovery plus DCR, `google_credentials` (ADC), and `service_account_impersonation` for IAP.
- Features: tools, prompts as slash commands, resources via `@server://…`, rich content.
- Tool control: `includeTools`/`excludeTools`, and `trust`.
- The MCP page does not mention ACP, but the ACP agents list includes Gemini CLI.

**Goose**
- CLI flags `--with-extension` (stdio), `--with-streamable-http-extension <URL>`, and builtins. https://goose-docs.ai/docs/guides/goose-cli-commands/
- MCP Apps at launch (MCP blog, 2026-01-26).
- `goose acp` runs Goose as an ACP agent over stdio. https://goose-docs.ai/docs/gdk/acp/
- Goose is now an AAIF project.

**opencode** (https://opencode.ai/docs/mcp-servers/, undated)
- Config: `"mcp":{"<name>":{"type":"local"|"remote","command":[…]|"url":…,"headers":{},"environment":{},"enabled":true,"timeout":5000}}`.
- OAuth: automatic on 401 via DCR (RFC 7591), or preset `clientId`/`clientSecret`/`scope`. Commands: `opencode mcp auth|logout|list`. Tokens are stored in `~/.local/share/opencode/mcp-auth.json`.
- Tools only: resources, prompts, elicitation and sampling are n/d.
- The docs warn that servers eat context.

**OpenHands** (https://docs.openhands.dev/openhands/usage/settings/mcp-settings, undated)
- Transports: SSE, SHTTP, stdio.
- **The V0 `config.toml [mcp]` (sse_servers/shttp_servers/stdio_servers) is no longer read.** Configuration is now Agent Canvas "Customize > MCP Servers", `openhands mcp add` (https://docs.openhands.dev/openhands/usage/cli/mcp-servers), or SDK `mcp_config` (https://docs.openhands.dev/sdk/guides/mcp).
- OAuth via FastMCP with token refresh. Pre-conversation OAuth endpoints `/api/mcp/oauth/start` and `/api/mcp/oauth/status/{flow_id}` (https://github.com/OpenHands/software-agent-sdk/pull/3573).
- **OpenHands Cloud does not expose its own MCP server** in any doc found. It offers a REST Cloud API (`POST https://app.all-hands.dev/api/v1/app-conversations`, https://docs.openhands.dev/openhands/usage/cloud/cloud-api) and an OpenAI-compatible `/v1` gateway (https://docs.openhands.dev/sdk/guides/agent-server/openai-gateway).
- ACP support: https://docs.openhands.dev/openhands/usage/run-openhands/acp

**Qwen Code** (https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/, undated)
- Transports: stdio, `http` (Streamable), `sse`.
- Auth: OAuth 2.0. Tokens are stored unencrypted by default.
- Features: tools, prompts as slash commands, resources via `@server:uri`.
- Config: include/exclude, trust, `qwen mcp add`. Settings merge from `~/.qwen` and `.qwen/settings.json`.
- Qwen Code is an ACP agent.

**Continue**
- `config.yaml` `mcpServers` with `type: sse | stdio | streamable-http` and `requestOptions`. https://docs.continue.dev/reference ; https://docs.continue.dev/customize/deep-dives/mcp
- OAuth and other features were not verified.

**LibreChat**
- `librechat.yaml` `mcpServers` with `type: streamable-http`/`sse`.
- OAuth callback is `${DOMAIN_SERVER}/api/mcp/<name>/oauth/callback`, with explicit `authorization_url`/`token_url`.
- Per-user header templating (`{{LIBRECHAT_USER_ID}}`).
- Can exchange the user's OpenID token for a delegated downstream token.
- Sources: https://www.librechat.ai/docs/features/mcp ; https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/mcp_servers

**Open WebUI**
- Native MCP since v0.6.31, **Streamable HTTP only**, added by an admin under Admin > Integrations.
- Auth: "OAuth 2.1 (Static)" with a client ID and secret.
- stdio/SSE servers go through the `mcpo` proxy.
- Sources: https://docs.openwebui.com/features/extensibility/mcp/ ; https://github.com/open-webui/mcpo

**Tasks (async)**: no fetched client doc claims support. On 2026-07-28 Tasks was redesigned as an extension, so treat client support as absent or unverified everywhere.
**Sampling and roots**: now deprecated (SEP-2577). Only Cursor documents roots.

== ACP `mcpServers` EXACT SHAPE ==
**v1** (https://agentclientprotocol.com/protocol/v1/session-setup.md)
- `session/new` params are `cwd` plus `mcpServers`, and `mcpServers` is required (may be empty). The same applies to `session/load` and `session/resume`.
- stdio: `{"name","command","args":[],"env":[{"name","value"}]}`, with no `type` field. Agents **MUST** support stdio.
- http: `{"type":"http","name","url","headers":[{"name","value"}]}`, allowed only if the agent advertises `agentCapabilities.mcpCapabilities.http`.
- sse: `{"type":"sse","name","url","headers":[…]}`, gated by `mcpCapabilities.sse` and marked deprecated.
- "New Agents SHOULD support the HTTP transport."

**v2** (https://agentclientprotocol.com/protocol/v2/session-setup.md and …/migration.md; the v2 surface is labelled draft)
- `mcpServers` is optional on `session/new`/`session/resume` (omitted means the same as `[]`).
- `session/load` is removed; use `session/resume` with `replayFrom`.
- Every server needs `type`, and stdio becomes `{"type":"stdio",…}`.
- SSE is removed.
- Capabilities move to `capabilities.session.mcp.{stdio:{},http:{}}`. Stdio is now opt-out.
- `_`-prefixed custom types are allowed.

**MCP-over-ACP RFD** (https://agentclientprotocol.com/rfds/mcp-over-acp.md)
- Declaration: `{"type":"acp","name","serverId"}`.
- Calls travel as `mcp/message` over the existing ACP connection. Targets MCP 2026-07-28 only.

**ACP agents** (https://agentclientprotocol.com/get-started/agents.md): Claude Agent (via zed-industries/claude-agent-acp), Codex CLI (via codex-acp), Cursor, Gemini CLI, GitHub Copilot (preview), Goose, Junie, OpenCode, OpenHands, Qwen Code.

== 1c. ADJACENT PROTOCOLS AND NAME COLLISIONS ==
- **MCP**: agent ↔ tools and context.
- **A2A (Agent2Agent)**: agent ↔ agent. Google, 2025-04-09; Linux Foundation since 2025-06-23; v1.0 on 2026-03-12 with JSON-RPC/gRPC/REST bindings (links above). Spec: https://a2a-protocol.org/latest/specification/
- **"ACP" means two different things:**
  - (1) **Agent Client Protocol**: Zed (2025-08-27), editor/client ↔ coding agent, JSON-RPC over stdio. https://agentclientprotocol.com. It carries MCP server declarations to the agent. Glide uses this one.
  - (2) **Agent Communication Protocol**: IBM/BeeAI (https://github.com/i-am-bee/acp). Merged into A2A in August 2025 and is being wound down (https://github.com/orgs/i-am-bee/discussions/5).
- **AG-UI**: CopilotKit, agent ↔ user-facing app, event-based. It positions itself as the third leg next to MCP and A2A and can carry MCP Apps. https://docs.ag-ui.com/ ; https://docs.copilotkit.ai/ag-ui/agentic-protocols ; https://www.copilotkit.ai/blog/bring-mcp-apps-into-your-own-app-with-copilotkit-and-ag-ui
- **OpenAI Apps SDK**: yes, it is built on MCP (an MCP server plus UI resources). It has been folded into the MCP Apps standard (2026-01-26 post: "builds upon the foundations of MCP-UI and the ChatGPT Apps SDK").
- **AGENTS.md** is an instruction file, not a wire protocol (AAIF co-project).

== 1d. CRITIQUES AND WHAT THEY MEAN FOR SERVER DESIGN ==
1. **Tool poisoning and prompt injection.**
   - Invariant Labs, tool-poisoning attacks (2025-04): https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks
   - GitHub MCP exploit, 2025-05-26: https://invariantlabs.ai/blog/mcp-github-vulnerability
   - Simon Willison's "lethal trifecta" (private data + untrusted content + exfiltration), 2025-06-16: https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/
   - SQL injection in the reference Postgres MCP server, Datadog, 2025-08-21: https://securitylabs.datadoghq.com/articles/mcp-vulnerability-case-study-SQL-injection-in-the-postgresql-mcp-server/
   - OpenAI's own developer-mode page calls the feature "powerful but dangerous".
2. **Context bloat.** Anthropic "Advanced tool use", 2025-11-24 (https://www.anthropic.com/engineering/advanced-tool-use):
   - Five servers cost about 55K tokens (GitHub: 35 tools ≈ 26K; Slack: 11 tools ≈ 21K). Internally Anthropic saw 134K tokens of tool definitions.
   - Tool Search with `defer_loading:true` cuts tokens by about 85%. Accuracy rose from 49% to 74% (Opus 4) and from 79.5% to 88.1% (Opus 4.5).
   - Use it when definitions exceed 10K tokens or there are 10+ tools. "Keep your three to five most-used tools always loaded, defer the rest."
   - Programmatic tool calling cut tokens 37% (43,588 → 27,297). Tool-use examples raised accuracy from 72% to 90%.
   - Claude Code now defers MCP tools by default.
3. **Code execution instead of direct tool calls.**
   - Anthropic "Code execution with MCP", 2025-11-04: a Drive→Salesforce workflow drops from ~150K to ~2K tokens (−98.7%) when tools are presented as code APIs. https://www.anthropic.com/engineering/code-execution-with-mcp
   - Cloudflare "Code Mode", 2025-09-26: MCP schemas are turned into a TypeScript API run in V8 isolates. https://blog.cloudflare.com/code-mode/
   - Cloudflare's Code Mode MCP server exposes only `search()` and `execute()` for 2,500+ endpoints, going from 1.17M tokens to about 1K. https://www.infoq.com/news/2026/04/cloudflare-code-mode-mcp-server/ ; https://github.com/cloudflare/mcp
4. **Auth complexity.** DCR is now deprecated for CIMD (2026-07-28). Clients differ widely:
   - Cursor and Open WebUI document only static client credentials.
   - Claude.ai needs a pre-registered client ID in Advanced settings when DCR isn't available.
   - Gitea itself has no DCR (gitea-mcp README).
5. **Statefulness.** Sticky sessions and `Mcp-Session-Id` forced affinity or shared session stores. The 2026-07-28 revision removes them. Commentary: https://equixly.com/blog/2026/08/05/stateless-mcp/
6. **Tool-count caps.** Windsurf/Devin Desktop hard-caps at 100 tools.

**Design implication.** Anthropic "Writing tools for agents", 2025-09-11 (https://www.anthropic.com/engineering/writing-tools-for-agents):
- "More tools don't always lead to better outcomes." Consolidate: one `schedule_event` instead of `list_users` + `list_events` + `create_event`.
- Namespace tool names.
- Add a `response_format` concise/detailed option (72 vs 206 tokens in their example).

For a Glide-facing server, the pattern that fits current guidance is a small set of typed, high-level tools plus search/do escape hatches, with a deterministic tool order and cacheable lists. Vikunja's new server does exactly this: 24 typed tools plus `find_action` and `do_action`.

== 1e. SHIPPED vs ANNOUNCED ==
Shipped, with documented endpoints or config:
- Anthropic: Claude Code, Claude.ai, Desktop.
- OpenAI: Agents SDK, developer mode, Codex, Apps SDK.
- Google: Gemini CLI, and 50+ managed servers GA or preview per 2026-04-29.
- Microsoft/GitHub: VS Code, Copilot, ACP preview.
- Cursor, Windsurf/Devin, Zed, JetBrains (client and IDE server), Goose, opencode, OpenHands, Qwen Code, LibreChat, Open WebUI (HTTP only).
- Cloudflare: Code Mode, cloudflare/mcp.
- ClickUp: remote server.
- Grafana: mcp-grafana.
- LiteLLM: gateway.
Announced or preview-only:
- Windows 11 native MCP was announced 2025-05-19 and reached Insider build 26220.7344 on 2025-12-05 (https://blogs.windows.com/windows-insider/2025/12/05/announcing-windows-11-insider-preview-build-26220-7344-dev-beta-channels/). No GA source was found.
- MCP Apps "intent" from JetBrains, Kiro and Antigravity (2026-01-26 post).
- Some Google managed servers are still in preview.

== 2. ABSENCE CHECKS ==
**Vikunja**
- OFFICIAL SERVER MERGED, NOT RELEASED. `/api/v2/mcp`, Streamable HTTP, POST only, stateless.
- Auth: API token with the `mcp:access` scope plus per-route scopes. JWTs are rejected.
- Tools: 24 typed tools plus `find_action`/`do_action`. Credentials and webhooks are excluded.
- PR #3860 merged 2026-09-15 (https://github.com/go-vikunja/vikunja/pull/3860). Settings → MCP page is PR #3864, also merged 2026-09-15 (https://github.com/go-vikunja/vikunja/pull/3864). "OAuth support remains out of scope."
- OAuth/PRM for ChatGPT-type clients is open issue #3930, filed 2026-09-16 (https://github.com/go-vikunja/vikunja/issues/3930).
- Latest release is v2.6.0 (2026-08-31), which predates the merge.
- Community servers: democratize-technology/vikunja-mcp ★108 (push 2026-02-15), aimbitgmbh/vikunja-mcp ★11 (v2 API, 2026-09-02), ufna/vikunja-mcp ★4 (2026-09-28).

**ClickUp**
- OFFICIAL REMOTE SERVER: `https://mcp.clickup.com/mcp`, Streamable HTTP.
- **OAuth only** (OAuth 2.1 + PKCE + DCR). API keys and tokens are not accepted.
- All plans including Free Forever.
- Sources: https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server ; https://help.clickup.com/hc/en-us/articles/33335772678423-What-is-ClickUp-MCP (both undated; details via search summary).
- Community: taazkareem/clickup-mcp-server ★52 (push 2026-09-29), hauptsacheNet/clickup-mcp ★49.

**Forgejo**
- NO OFFICIAL SERVER. A Codeberg API search of forgejo/forgejo issues for "MCP" returned no MCP-titled issues (2026-09-29).
- Main community server: goern/forgejo-mcp, now at https://git.b4mad.industries/agentic-forges/forgejo-mcp (v3.2.0, 2026-09-16). It moved off Codeberg over Codeberg's LLM policy (https://blog.codeberg.org/protecting-our-floss-commons-from-llms.html); the Codeberg repo is a read-only mirror. Supports stdio and Streamable HTTP, including multi-tenant HTTP.
- Others: raohwork/forgejo-mcp ★69 (2025-10-28), Sqcows/forgejo-mcp (103 tools, 2026-06-18), kepatrick/forgejo-mcp (2026-09-09).

**gitea-mcp** (https://gitea.com/gitea/gitea-mcp, v1.7.0, 2026-08-27)
- HTTP is **stateless per 2026-07-28** (POST only, no session ID).
- Auth: bearer/`token` credential passthrough, or optional `-oauth` against a Gitea OAuth2 app with PKCE ("Gitea has no dynamic client registration").
- Forgejo compatibility is **undocumented**. No gitea-mcp issue mentions "forgejo" (API query 2026-09-29). The Forgejo-specific forks exist because the two APIs have diverged.

**LiteLLM** (https://docs.litellm.ai/docs/mcp, undated)
- MCP gateway over Streamable HTTP, SSE and stdio, configured under `mcp_servers` in config.yaml.
- Access control per key, team and org, plus tool-level allowlists and semantic filtering.
- Auth: static headers, OAuth 2.0 (PKCE and client credentials), DCR, OAuth passthrough, AWS SigV4.
- **"MCP Cost" tracking per key/team.**
- Guardrails and tool search. MCP tools are callable through `/chat/completions` and `/v1/responses`.
- When each feature was added is not stated on the page.
- Glide's ADR-0008 is the LiteLLM seam; its only MCP line (line 58) concerns OmniRoute's endpoints, not LiteLLM's.

**OpenHands**
- CLIENT: yes. SERVER: none found (see the 1b entry).

**opencode**
- CLIENT: yes, config shown in 1b.

**Claude Code**
- CLIENT: yes. SERVER: `claude mcp serve`, stdio only.

**Goose and Qwen Code**
- CLIENT: yes (1b).
- Glide's acp-profiles.md already notes the repository-supplied-config risk for both.

**ACP**: exact shapes are above. Ploeg currently sends v1 `mcpServers: []`.

**Grafana**
- OFFICIAL: grafana/mcp-grafana ★3,511, v1.6.2 (2026-09-29). Transports `stdio`/`sse`/`streamable-http` via `-t`. Grafana Cloud works by pointing `GRAFANA_URL` at the instance. https://github.com/grafana/mcp-grafana

**Prometheus**
- OFFICIAL-ORG: prometheus/prometheus-mcp ★113, v0.18.0 (2026-04-25), push 2026-09-29. Its README still carries tjhop's badges, i.e. it is the tjhop server adopted into the Prometheus org. `mcp.transport` is stdio or http. https://github.com/prometheus/prometheus-mcp
- Popular community: pab1it0/prometheus-mcp-server ★518.

**Kubernetes**
- containers/kubernetes-mcp-server (Red Hat) ★2,135, v0.0.67 (2026-09-18). Includes Helm install/list tools. https://github.com/containers/kubernetes-mcp-server
- Azure/mcp-kubernetes ★61 (2026-09-21).
- Google managed GKE MCP server per 2026-04-29.
- No kubernetes-sigs MCP server was found.

**Helm**
- NO OFFICIAL Helm-project MCP server. Community only: SCGIS-Wales/helm-mcp ★2 (2026-09-25), kubedoll-heavy-industries/helm-mcp ★0.

**Postgres**
- The reference server is archived in modelcontextprotocol/servers-archived (archived=true), and had the SQL-injection flaw (Datadog, 2025-08-21).
- crystaldba/postgres-mcp ("Postgres MCP Pro") ★3,350, push 2026-08-17: `--access-mode=restricted|unrestricted`, sse/stdio.
- googleapis/mcp-toolbox ★16,534 (2026-09-29).
- pgEdge/pgedge-postgres-mcp ★230.
- microsoft/postgres-mcp ★29.

**Zensical / MkDocs**
- Zensical ships **no llms.txt and no MCP**. Issue #252 (closed 2026-01-05) moved to backlog item zensical/backlog#83, still open. `.md` raw-serving issue #859 closed 2026-08-14 as "will provide once we work on this topic".
- For MkDocs: pawamoy/mkdocs-llmstxt ★132 (push 2026-09-29) and noklam/mkdocs-llmstxt-md.
- No Zensical-native or MkDocs-native docs MCP server exists.

**Glide / Ploeg / Vloer (webgrip)**
- ZERO external MCP presence. GitHub search "ploeg mcp" returned nothing. "vloer" hits only unrelated Dutch flooring repos (akashsewdajal/tony, houssin-99/vloer, …). Code search "webgrip glide mcp" returned nothing (2026-09-29).
- Internally, MCP appears only as the empty ACP `mcpServers`, Claude Code's `--strict-mcp-config`, and worker instructions that treat `.mcp.json` changes as a finding (apps/ploeg/pkg/worker/task.go lines 244 and 265).

ADDENDUM TO MY MCP REPORT: corrections and additions, from three research subagents that finished after I handed back (each crawled 2026-09-29). Where a line below contradicts my first report, this addendum is the one to use.

CORRECTIONS
1. **Zensical.** I wrote "no llms.txt". Wrong: PR #986 "support mkdocs-llmstxt plugin" merged 2026-09-29T18:35Z (https://github.com/zensical/zensical/pull/986). It is not released yet (latest is v0.0.66, 2026-09-28), and zensical.org/llms.txt does not exist today. Neither Zensical nor MkDocs has an MCP server. mkdocs-material has no llms.txt (its /llms.txt returns 404). pawamoy/mkdocs-llmstxt is in maintenance mode. Mintlify auto-generates `/mcp` for sites it hosts (https://www.mintlify.com/docs/ai/model-context-protocol); nothing equivalent exists for self-hosted docs.
2. **Gemini CLI is being retired in favour of Antigravity CLI** (Google I/O 2026-05-19). Free-tier and AI Pro/Ultra serving stopped 2026-06-18; paid API keys still work. https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ . No documented MCP story for Antigravity CLI was found. The google-genai SDK's MCP support is "experimental" (https://googleapis.github.io/python-genai/).
3. **Claude Code does NOT render MCP Apps.** `ui://` resources are hidden. Sampling is not supported ("Claude doesn't yet support … Sampling", https://claude.com/docs/connectors/building/index.md). Roots is supported (launch dir plus `--add-dir`, v2.1.203+). The v2 runtime implements spec 2026-07-28. `headersHelper` supplies dynamic headers. Claude Code's own CIMD is https://claude.ai/oauth/claude-code-client-metadata.
4. **Claude.ai auth types** (https://claude.com/docs/connectors/building/authentication.md):
   - `oauth_dcr` and `oauth_cimd` are both on by default. CIMD is used only when the authorization server advertises `client_id_metadata_document_supported: true` plus `none`; otherwise it falls back to DCR.
   - Anthropic-held or custom client credentials go through mcp-review@anthropic.com.
   - **Static headers are an Owner-only beta for a limited set of organizations**: up to 4 headers, and custom header names need approval.
   - The `client_credentials` grant is not supported.
   - Resource subscriptions and sampling are not supported.
   - Limits: about 150k-character tool results, 240 s timeout.
5. **ChatGPT (renamed "Plugins"; apps-sdk now redirects to https://developers.openai.com/plugins).**
   - CIMD is preferred (`https://chatgpt.com/oauth/client.json`), DCR is the fallback, and predefined clients are allowed.
   - **No static bearer, no API keys, no client_credentials** (https://developers.openai.com/plugins/build/auth.md).
   - Supports structuredContent/outputSchema and MCP Apps via `ui/*` plus a `window.openai` compatibility layer.
   - Enterprise RBAC can grant developer mode to specific users (https://learn.chatgpt.com/docs/enterprise/apps-and-connectors.md).
6. **Codex.**
   - `codex mcp login --oauth-client-registration auto|cimd|dcr`. CIMD document: `https://chatgpt.com/oauth/codex/client.json`.
   - Extra keys: `http_headers_helper`, `oauth_resource`, `output_token_limit`, `required`.
   - Elicitation is supported. SSE is not listed.
   - Admin allowlist is `requirements.toml` `mcp_servers` (https://learn.chatgpt.com/docs/enterprise/managed-configuration.md).
   - **Codex's MCP-server mode has been removed** (https://learn.chatgpt.com/docs/mcp-server.md).
7. **VS Code Copilot** (https://code.visualstudio.com/docs/agents/reference/mcp-configuration and https://code.visualstudio.com/docs/enterprise/ai-settings):
   - Transports: Streamable HTTP with SSE fallback, stdio, Unix sockets / named pipes.
   - Supports sampling (`chat.mcp.serverSampling`), roots, elicitation and MCP Apps.
   - `oauth.enterpriseManaged` is in preview.
   - Admin: `chat.mcp.access` all|registry|none, `McpGalleryServiceUrl`, `allowedMcpServers`/`deniedMcpServers` (1.130+).
8. **GitHub Copilot cloud/coding agent** (https://docs.github.com/en/copilot/concepts/agents/cloud-agent/mcp-and-cloud-agent):
   - Tools only.
   - **No OAuth remote servers**; static headers use `COPILOT_MCP_*` secrets.
   - The org policy "MCP servers in Copilot" is off by default and covers Business/Enterprise seats only.
9. **Cursor.** DCR is the default ("static OAuth … instead of dynamic client registration"); CIMD is not documented. Docs moved to https://cursor.com/docs/mcp.md. Team admins distribute servers via Dashboard > Plugins & MCPs.
10. **Windsurf/Devin Desktop.** The Cascade MCP page is labelled "legacy Cascade agent"; the new "Devin Local" agent uses the Devin CLI MCP config (https://docs.devin.ai/cli/extensibility/mcp/configuration.md), which does DCR plus pre-registered clients and `devin mcp login`.
11. **Official client matrix.** The docs/clients.mdx page was deleted 2026-05-27 (commit 2075a21). The last version (2026-05-26) is at https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/87993a68166cfec740ca4d6a99cbe661f7aed32c/docs/clients.mdx . **The live matrix covers extensions only**: https://modelcontextprotocol.io/extensions/client-matrix . MCP Apps is listed for Claude web and Desktop, VS Code, ChatGPT, Cursor, M365 Copilot and Goose. No client in scope supports OAuth client-credentials or Enterprise-Managed Auth.
12. **Tasks.** The deleted matrix (pre-2026-07-28) listed Tasks only for VS Code Copilot and Copilot CLI. No current client doc claims support for the new Tasks extension.

ADDITIONS
- **Vikunja.**
  - Help page https://vikunja.io/help/mcp/ states the MCP server needs "Vikunja 2.7.0 and later, or unstable builds".
  - Token presets: Read-only, Typed read+write (default), Full.
  - ChatGPT cannot connect because there is no OAuth.
  - Earlier MCP PRs #2499 and #2800 were closed.
  - Correction: PR #3864 merged 2026-09-12 per the subagent. The PR API showed 2026-09-15 to me.
- **ClickUp.**
  - Public beta. Docs updated 2026-08-13.
  - OAuth 2.1 + PKCE with a **client redirect-URI allowlist**: unlisted clients must request access. OpenCode had to request it (https://github.com/anomalyco/opencode/issues/5583, 2025-12-15).
  - Rate limits: 50 calls/24h on Free, 300/24h on Unlimited+.
  - No delete tools.
- **gitea-mcp vs Forgejo.** None of the ~282 gitea-mcp issues or PRs mention Forgejo or Codeberg. It probably works through the shared /api/v1, but that is unverified and upstream does not support it. goern/forgejo-mcp moved off Codeberg on 2026-07-29 (Codeberg LLM policy blog post, 2026-07-23).
- **LiteLLM MCP dates** (release notes, https://docs.litellm.ai/release_notes):
  - Per key/team/org access control: v1.72.6 (2025-06-19)
  - MCP cost tracking: v1.74.3 (2025-07-18)
  - MCP OAuth: v1.77.5 (2025-10-04)
  - Per-user OAuth tokens: v1.83.7 (2026-04-19)
  - DCR + RFC 8707: v1.95.0 (2026-08-01)
  - Tool-result guardrails: v1.97.0 (2026-08-15)
  - Access-group budgets for MCP: v1.100.0 (2026-09-06)
  - Semantic tool search: v1.101.0 (2026-09-14)
  - Latest release: v1.103.0 (2026-09-28)
  - Guardrail hooks `pre_mcp_call`/`during_mcp_call`/`post_mcp_call` (https://docs.litellm.ai/docs/mcp_guardrail).
- **Grafana Cloud remote MCP**: `https://mcp.grafana.com/mcp`, OAuth 2.1, Streamable HTTP only, billed as Assistant users (https://grafana.com/docs/grafana-cloud/ai-tools/mcp-servers/cloud-mcp/). mcp-grafana logs an error when `--server-auth-token` is unset on a non-loopback address.
- **Kubernetes and Helm.**
  - kubernetes-sigs/mcp-lifecycle-operator (created 2026-02-25) deploys MCP servers; it is not a server itself.
  - helm/helm#30832 was closed 2025-05-19 without a Helm-org server.
  - Community: zekker6/mcp-helm ★26.
  - containers/kubernetes-mcp-server offers OAuth/OIDC in HTTP mode, `read_only`, and a helm toolset.
- **Postgres.**
  - The reference server was archived 2025-05-28. The npm package is still v0.6.2 (vulnerable, about 21k weekly downloads). The patched fork is @zeddotdev/postgres-context-server.
  - crystaldba/postgres-mcp's last release is v0.3.0 (2025-05-16).
  - Supabase remote `https://mcp.supabase.com/mcp` uses OAuth.
  - googleapis/mcp-toolbox v1.13.1 (2026-09-25).
- **Timeline additions.**
  - OpenAI Responses API remote MCP: 2025-05-21.
  - Copilot Studio MCP GA: 2025-05-29. VS Code MCP GA: 2025-07-14.
  - GitHub remote MCP GA: 2025-09-04.
  - 2026-07-28 release candidate: 2026-05-21.
  - Enterprise-Managed Authorization: 2026-06-18.
  - New MCP roadmap 2026-08-22, including "progressive tool discovery" and Streamable HTTP over stdio.
  - agentgateway became an AAIF project 2026-06-04. AAIF has 247 members (2026-08-13).
  - AWS MCP Server GA 2026-05-06.
  - Atlassian Rovo MCP GA: February 2026.
  - Salesforce hosted MCP GA: April 2026.
  - Cloudflare Code Mode MCP server: 2026-02-20 (https://blog.cloudflare.com/code-mode-mcp/).
  - Claude Code MCP Tool Search: 2026-01-14, auto-enabled when tools exceed 10% of context.
  - OpenAI Responses `tool_search` auto-defers MCP tools (https://developers.openai.com/api/docs/guides/tools-tool-search).
  - The MCP Registry is still "preview" (https://modelcontextprotocol.io/registry/about).
- **Adjacent protocols.**
  - A2A's current version is v1.0.1 (2026-05-28, https://github.com/a2aproject/A2A/releases).
  - AG-UI 1.0 schema frozen 2026-09-17 (https://github.com/ag-ui-protocol/ag-ui/releases).
  - Agent Client Protocol: schema v1.23.0 (2026-09-18). JetBrains has co-developed it since 2025-10. The ACP Agent Registry launched 2026-01.
  - Agent Skills was published as an open standard 2025-12-18 (agentskills.io).
- **More critique sources.**
  - Christian Posta, "MCP auth spec is a mess for enterprise" (2025-03-31): https://blog.christianposta.com/the-updated-mcp-oauth-spec-is-a-mess/
  - MCP's own post on DCR problems (2025-08-22): https://blog.modelcontextprotocol.io/posts/client_registration/
  - Transport working group on session pain (2025-12-19): https://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/
  - Tool annotations are "hints, not a security boundary" (2026-03-16): https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/
  - OWASP MCP Top 10, MCP03 Tool Poisoning.

DESIGN TAKEAWAY for a Glide-facing server:
- Use **CIMD-first OAuth with DCR fallback**. Static bearer works only in the developer CLIs (Claude Code, Codex, Cursor, VS Code, opencode, Copilot cloud agent). It is not portable to ChatGPT, and on Claude.ai it is a beta.
- Tools are the only universally supported primitive.
- Keep the tool set small, typed and consolidated, plus a search/execute escape hatch.
- Make it stateless (spec 2026-07-28) with a deterministic `tools/list` order.

## Addendum (corrections from late sub-reports; where they conflict, this wins)

CORRECTIONS ADDENDUM to my MCP research report: late subagent results overturn several lines. Where they conflict, this message wins.

CORRECTIONS
1. Zensical: I said it has no llms.txt. That is now wrong. PR #986 ("support mkdocs-llmstxt plugin") merged 2026-09-29T18:35Z (https://github.com/zensical/zensical/pull/986).
   - Not in a release yet: the latest is v0.0.66 (2026-09-28), and zensical.org/llms.txt does not exist yet.
   - Still no MCP server in Zensical or MkDocs.
   - mkdocs-material: /llms.txt returns 404.
   - pawamoy/mkdocs-llmstxt is in maintenance mode.
   - Mintlify auto-generates a /mcp endpoint, but only for sites it hosts (https://www.mintlify.com/docs/ai/model-context-protocol).
2. Gemini CLI is being retired in favour of Antigravity CLI (announced 2026-05-19). Free and AI Pro/Ultra serving stopped 2026-06-18; paid API keys still work.
   - Source: https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/
   - No documented MCP support found for Antigravity CLI.
   - MCP in the google-genai SDK is marked "experimental".
3. Claude Code:
   - Does not render MCP Apps: ui:// resources are hidden.
   - Does not support sampling (https://claude.com/docs/connectors/building/index.md).
   - Does support roots (the launch directory plus --add-dir), since v2.1.203.
   - Its v2 runtime implements spec 2026-07-28.
   - headersHelper supplies dynamic headers.
   - Its CIMD document is https://claude.ai/oauth/claude-code-client-metadata.
4. Claude.ai auth (https://claude.com/docs/connectors/building/authentication.md):
   - oauth_dcr and oauth_cimd are both on by default. CIMD is used only when the server advertises client_id_metadata_document_supported plus "none"; otherwise it falls back to DCR.
   - Static headers are an Owner-only beta for a limited set of orgs, max 4 headers.
   - No client_credentials grant.
   - No resource subscriptions and no sampling.
   - Tool results are capped at about 150k characters, with a 240s timeout.
5. ChatGPT (connectors are now called "Plugins"; https://developers.openai.com/plugins):
   - CIMD preferred (https://chatgpt.com/oauth/client.json), DCR as fallback, predefined clients allowed.
   - No static bearer, no API keys, no client_credentials (https://developers.openai.com/plugins/build/auth.md).
   - Supports MCP Apps (ui/* plus window.openai) and structuredContent.
   - Enterprise RBAC can grant developer mode to specific users.
6. Codex:
   - Login command: `codex mcp login --oauth-client-registration auto|cimd|dcr`.
   - Supports elicitation. SSE is not listed.
   - Admin allowlist lives in requirements.toml.
   - Codex's MCP-server mode has been removed (https://learn.chatgpt.com/docs/mcp-server.md).
7. VS Code Copilot:
   - Supports sampling (chat.mcp.serverSampling), roots, elicitation and Apps.
   - Transports: HTTP with fallback to SSE, and Unix sockets.
   - Admin controls: chat.mcp.access (all / registry / none), allowedMcpServers and deniedMcpServers.
8. Copilot cloud/coding agent:
   - Tools only.
   - No OAuth remote servers; static headers come from COPILOT_MCP_* secrets.
   - The org policy "MCP servers in Copilot" is off by default and applies to Business/Enterprise only.
9. Cursor: DCR is the default. CIMD is not documented. Docs are now at https://cursor.com/docs/mcp.md.
10. The official client feature matrix was deleted on 2026-05-27. The last copy: https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/87993a68166cfec740ca4d6a99cbe661f7aed32c/docs/clients.mdx
    - The live matrix covers extensions only: https://modelcontextprotocol.io/extensions/client-matrix
    - MCP Apps is listed for Claude web/Desktop, VS Code, ChatGPT, Cursor, M365 Copilot and Goose.
    - No client in scope documents the new Tasks extension.

ADDITIONS
- Vikunja:
  - Help page https://vikunja.io/help/mcp/ says the MCP server needs 2.7.0+ or an unstable build.
  - Token presets: Read-only, Typed (default), Full.
  - ChatGPT cannot connect because Vikunja has no OAuth.
- ClickUp:
  - Public beta; docs updated 2026-08-13.
  - OAuth only, with a client redirect allowlist: opencode had to request access (https://github.com/anomalyco/opencode/issues/5583).
  - Rate limits: 50 calls/24h on Free, 300/24h on Unlimited+.
  - No delete tools.
- gitea-mcp on Forgejo: none of its ~282 issues or PRs mention Forgejo. Probably works via /api/v1, but unverified and not supported upstream. goern's forgejo-mcp left Codeberg on 2026-07-29.
- LiteLLM, when each MCP feature landed (release notes):
  - Access control per key/team/org: v1.72.6 (2025-06-19)
  - MCP cost tracking: v1.74.3 (2025-07-18)
  - MCP OAuth: v1.77.5 (2025-10-04)
  - Per-user OAuth: v1.83.7 (2026-04-19)
  - DCR plus RFC 8707: v1.95.0 (2026-08-01)
  - Tool-result guardrails: v1.97.0
  - MCP budgets: v1.100.0
  - Semantic tool search: v1.101.0 (2026-09-14)
  - Latest release: v1.103.0 (2026-09-28)
- Grafana Cloud has a hosted remote MCP at https://mcp.grafana.com/mcp: OAuth 2.1, Streamable HTTP only, billed as Assistant users.
- Kubernetes and Helm:
  - kubernetes-sigs/mcp-lifecycle-operator deploys MCP servers; it is not one itself.
  - The Helm issue helm/helm#30832 was closed 2025-05-19 without an official server.
- Postgres:
  - Reference server archived 2025-05-28, but the npm package is still v0.6.2 (vulnerable, about 21k weekly downloads). Patched fork: @zeddotdev/postgres-context-server.
  - Supabase has a remote server at https://mcp.supabase.com/mcp with OAuth.
- Timeline:
  - 2025-05-21: Responses API supports remote MCP.
  - 2025-07-14: VS Code MCP GA.
  - 2025-09-04: GitHub remote MCP GA.
  - 2026-01-14: Claude Code MCP Tool Search (auto when tools exceed 10% of context).
  - 2026-02-20: Cloudflare Code Mode MCP server.
  - 2026-05-06: AWS MCP Server GA.
  - 2026-05-21: spec 2026-07-28 release candidate.
  - 2026-06-18: Enterprise-Managed Authorization.
  - 2026-08-22: new MCP roadmap, including progressive tool discovery.
  - The MCP Registry is still in preview.
- Adjacent protocols:
  - A2A is at v1.0.1 (2026-05-28).
  - AG-UI froze its 1.0 schema on 2026-09-17.
  - Agent Client Protocol schema v1.23.0 (2026-09-18). JetBrains co-develops it since 2025-10; its agent registry launched 2026-01.
  - Agent Skills published as an open standard 2025-12-18.

DESIGN TAKEAWAY
- Auth: CIMD first, DCR as fallback. A static bearer token works only in the developer CLIs; ChatGPT does not take one and Claude.ai has it only as a beta.
- Tools are the only primitive every client supports.
- Keep the tool set small and consolidated, plus a search/execute escape hatch.
- Stay stateless and return tools/list in a deterministic order.
