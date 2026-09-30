# MCP client support matrix and ACP mcpServers

> Raw research-agent report, 2026-09-29, kept as evidence for [the MCP access dossier](../../2026-09-29-mcp-access.md). Agent output, not independently verified line by line; the dossier states which claims were checked first-hand.

MCP CLIENT SUPPORT MATRIX: research as of 2026-09-29. Evidence is from docs pages plus shallow clones of each repo's default branch taken on 2026-09-29. Where I say "code", the claim comes from source, not docs.

## 0. The modelcontextprotocol.io/clients feature matrix no longer exists
- https://modelcontextprotocol.io/clients now redirects to the intro page (https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro).
- The page was removed in commit 2075a21d on 2026-05-27, "Remove Example Clients overview page", in modelcontextprotocol/modelcontextprotocol. Its file was `docs/clients.mdx`.
- Last-known `supports=` values, from commit 87993a68 (2026-05-26), https://github.com/modelcontextprotocol/modelcontextprotocol/blob/87993a68/docs/clients.mdx:
  - Continue: Resources, Prompts, Tools, Apps
  - Gemini CLI: Prompts, Tools, Instructions, DCR
  - goose: Apps, DCR, Discovery, Elicitation, Instructions, Prompts, Resources, Roots, Sampling, Tools
  - JetBrains AI Assistant: Tools
  - JetBrains Junie: Tools
  - LibreChat: Tools, Instructions, DCR
  - opencode: Resources, Prompts, Tools
  - Zed: Prompts, Tools
  - OpenHands, Open WebUI and Qwen Code were not listed.
- The only matrix still published is the Extension Support Matrix, https://modelcontextprotocol.io/extensions/client-matrix. Of the target clients, only Goose appears there, with a check for MCP Apps (`io.modelcontextprotocol/ui`). None of the targets are listed for OAuth Client Credentials, Enterprise-Managed Authorization or Skills.

## 1. Per client

**Zed.** Docs: https://zed.dev/docs/ai/mcp (source docs/src/ai/mcp.md, last commit 2026-09-19).
- Transports: local `command`/`args`/`env`, or remote `url` plus `headers`. The code has only `stdio_transport.rs` and `http.rs`. `http.rs` is Streamable HTTP ("Mcp-Session-Id", text/event-stream responses). The legacy HTTP+SSE transport is not documented.
- Static bearer: documented, e.g. `"headers": {"Authorization": "Bearer <token>"}`.
- OAuth: docs say "When a remote MCP server has no configured "Authorization" header, Zed will prompt you to authenticate yourself against the MCP server using the standard MCP OAuth flow."
  - Code (crates/context_server/src/oauth.rs) tries **CIMD first, then DCR**. Zed's client_id is `https://zed.dev/oauth/client-metadata.json`. Tokens go to the keychain.
  - Pre-registered client IDs: not documented.
- Features: "Zed currently supports MCP's Tools and Prompts features". It handles `notifications/tools/list_changed`. Resources, sampling, elicitation, tasks, MCP Apps and structured output are not supported ("We welcome contributions…").
- Install model: per-user settings.json (Settings → AI → MCP Servers), plus context-server extensions.
- ACP: Zed forwards the MCP servers configured in Zed to external agents over ACP.

**JetBrains AI Assistant.** Docs: https://www.jetbrains.com/help/ai-assistant/mcp.html (version 2026.2, page dated 14 Aug 2026).
- Transports: STDIO, Streamable HTTP, and SSE "for legacy MCP servers". Config is `{"mcpServers":{"x":{"url":…}}}`, scoped global or project.
- OAuth and headers: not documented.
- Features: tools only. Nothing else is documented.
- Admin: "An administrator can preconfigure the MCP servers available to you and control whether you can add your own" through IDE Services or JetBrains Central.
- The IDE is also an MCP server (since 2025.2). The page mentions a router mode that can apply to "ACP agents only".

**Junie** (CLI and IDE plugin). Docs: https://www.jetbrains.com/help/junie/junie-cli-mcp-configuration.html. That URL redirects to junie.jetbrains.com/docs/…html; page dated 28 Sep 2026.
- Config shape: `mcp.json` `{"mcpServers":{"Context7":{"command","args","env"},"RemoteServer":{"url","headers":{"Authorization":"Bearer token"}}}}`.
- Scopes: project `.junie/mcp/mcp.json` or user `~/.junie/mcp/mcp.json`. Flags: `--mcp-location`, `--mcp-default-locations`.
- Remote is "HTTP/HTTPS". The specific wire transport (Streamable HTTP vs SSE) is not documented.
- OAuth: supported. Servers show an "Authorization required" status, then you use "→ Authorize" in the browser. DCR/CIMD specifics are not documented.
- Features beyond tools: not documented.
- Admin policy: not documented.
- ACP: `junie --acp true` (https://www.jetbrains.com/help/junie/junie-cli-acp.html). In ACP mode `/mcp` is a read-only list that includes "MCP servers the client passed at session init".

**Gemini CLI.** Docs: https://geminicli.com/docs/tools/mcp-server/ (repo docs/tools/mcp-server.md).
- Transports: stdio `command`, SSE via `url`, Streamable HTTP via `httpUrl`. `headers` are supported.
- OAuth: dynamic discovery, and "Perform dynamic client registration if supported". Pre-registered `oauth.clientId`/`clientSecret`/`authorizationUrl`/`tokenUrl`/`scopes`/`redirectUri`/`audiences`. Also `authProviderType` `google_credentials` or `service_account_impersonation`. CIMD: not documented, and no `client_id_metadata_document_supported` found in code.
- Features: tools; prompts as slash commands; resources via `@server://…`; rich content (text, image, audio, `resource_link`).
- Client capabilities in code (packages/core/src/tools/mcp-client.ts): only `roots {listChanged:true}` is registered. Elicitation, sampling, tasks and MCP Apps are not advertised.
- Install model: settings.json at user (`~/.gemini`), project (`.gemini`) and system level. Per-server `trust`, `includeTools`/`excludeTools`.

**Goose.** Now `aaif-goose/goose`; governance moved from Block to AAIF in April 2026. Docs: https://goose-docs.ai/docs/getting-started/using-extensions. Latest release v1.52.0, 2026-09-23.
- Transports: `stdio`, `builtin`, `platform`, `streamable_http`. **SSE has been removed.** The code (crates/goose/src/config/extensions.rs) warns "SSE is unsupported, migrate to streamable_http".
- `streamable_http` fields: `uri`, `headers`, `envs`, `env_keys`, `timeout`, `socket`, `client_id`, `client_secret_key`, `scopes`.
- OAuth: normally via DCR. A pre-registered `client_id` is documented under "Remote extensions with a pre-registered OAuth client". `GOOSE_OAUTH_CALLBACK_PORT` sets a fixed callback port. CIMD: not found.
- Client capabilities in code (crates/goose/src/agents/mcp_client.rs): `enable_roots`, `enable_elicitation`, and `extensions` with `io.modelcontextprotocol/ui` (MCP Apps). There is an explicit test, `test_client_capabilities_do_not_advertise_sampling`, so **sampling is no longer advertised**. That contradicts the old matrix. The code also lists prompts and resources.
- Install model: per-user `~/.config/goose/config.yaml`, `goose://extension?…` deeplinks. Admin control via the `GOOSE_ALLOWLIST` URL (https://goose-docs.ai/docs/guides/config-files; env-var docs).

**opencode.** Docs: https://opencode.ai/docs/mcp-servers/. The repo is now anomalyco/opencode, default branch `dev`.
- Config: `type:"local"` with a `command[]`, or `type:"remote"` with `url`, `headers` and `oauth`. Code uses StreamableHTTPClientTransport with an SSEClientTransport fallback.
- OAuth: automatic on a 401, using "Dynamic Client Registration (RFC 7591)". Pre-registered `clientId`/`clientSecret`/`scope` are supported. `"oauth": false` disables it for API-key servers. Commands: `opencode mcp auth|logout|list`.
- Admin: org defaults can be served from `.well-known/opencode`.
- Code (packages/opencode/src/mcp/index.ts) advertises only `roots`. Sampling (#11948), elicitation (#23066) and tasks (#28567) are commented out. It calls listPrompts/listResources and handles `structuredContent`.

**OpenHands.** docs.all-hands.dev redirects (308) to docs.openhands.dev. Page: https://docs.openhands.dev/openhands/usage/settings/mcp-settings (updated 2026-09-27).
- **The `config.toml [mcp]` format is gone.** Docs: "Current OpenHands releases don't read MCP servers from a config.toml [mcp] section (sse_servers, shttp_servers, stdio_servers). That format belongs to legacy OpenHands (V0)." Where to configure now:
  - Agent Canvas: Customize > MCP Servers; stored in `~/.openhands/settings.json`, encrypted.
  - CLI: `openhands mcp add`, which writes `~/.openhands/mcp.json`.
  - SDK: `mcp_config`.
  - Docs: "no per-project MCP configuration file".
- Transports: SHTTP (recommended), SSE, stdio. The docs recommend running stdio servers behind supergateway.
- Auth options: None, Bearer (`API Key` becomes `Authorization: Bearer`), Header (`NAME=value`), and OAuth via FastMCP. OAuth takes an optional client ID, secret and scopes; tokens are cached in `~/.fastmcp/oauth-mcp-client-cache/`. DCR/CIMD are not stated explicitly.
- Features: tools only ("Registers the tools"). Resources, prompts, elicitation and sampling are not documented.
- Cloud: "Team-wide configuration sharing", https://docs.openhands.dev/overview/model-context-protocol.
- **OpenHands' own MCP server: internal, undocumented.**
  - The app server mounts a FastMCP server with tools `create_pr`, `create_mr`, `create_bitbucket_pr`, `create_bitbucket_data_center_pr` and `create_azure_devops_pr`, plus a Tavily proxy. Source: openhands/app_server/mcp/mcp_router.py in OpenHands/sandbox-server and OpenHands/enterprise.
  - The OpenHands-Cloud Helm chart exposes it at `/mcp/mcp` (charts/openhands/templates/ingress-mcp.yaml).
  - It keys on the header `X-OpenHands-ServerConversation-ID` and the user's auth. It is meant for sandboxes, not a public product: the user docs never mention it.

**Continue.** Docs: https://docs.continue.dev/customize/deep-dives/mcp. **The repo README says: "The continuedev/continue repository is no longer actively maintained and is read-only for all users." Last commit 2026-07-20.**
- Transports: `stdio`, `sse`, `streamable-http`. Headers go through `requestOptions`, "for sse and streamable-http servers" (docs/reference.mdx).
- "MCP can only be used in the agent mode."
- OAuth: not in the docs. Code has core/context/mcp/MCPOauth.ts (an SDK OAuthClientProvider with `clientMetadata`, which implies DCR).
- Code calls listResources, listPrompts and readResource.
- Install model: local `.continue/mcpServers/`, plus the former hub.

**LibreChat.** Docs: https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/mcp_servers.
- Transports: `stdio`, `websocket`, `sse`, `streamable-http`.
- OAuth block: `authorization_url`, `token_url`, `client_id`, `client_secret`, `redirect_uri`, `scope`. Docs: "If no client id & client secret is provided, Dynamic Client Registration (DCR) will be used." CIMD: not found.
- Headers: templated (`{{LIBRECHAT_USER_ID}}`, `{{LIBRECHAT_USER_EMAIL}}`, …). `apiKey` takes `source: admin|user` and `authorization_type: bearer|basic|custom`. Per-user secrets via `customUserVars`. Also `serverInstructions` and `chatMenu`.
- Install model: stdio servers are admin-only (librechat.yaml). Remote servers can be added by admin API or user UI.
- Features: docs cover tools only. Code lists resources and prompts only as connection probes, and renders `ui://` embedded resources. No elicitation or sampling in code.

**Open WebUI.** Docs: https://docs.openwebui.com/features/extensibility/mcp (source docs/features/extensibility/mcp.mdx, updated 2026-09-09).
- **Native MCP since v0.6.31, Streamable HTTP only.** For stdio or SSE, use the mcpo proxy (it converts them to OpenAPI).
- Auth options: None, Bearer, "OAuth 2.1" (DCR), and "OAuth 2.1 (Static)" (pre-registered client ID/secret, with an optional separate OAuth Server URL). It forwards the RFC 8707 `resource` parameter and supports discovered or custom scopes. CIMD: not documented.
- Custom headers with templates: `{{USER_ID}}`, `{{USER_EMAIL}}`, `{{USER_ROLE}}`, `{{USER_GROUPS}}`, `{{CHAT_ID}}`, etc.
- **Admin-only install**: "MCP servers can only be added by administrators, under Settings > Admin > Integrations". Access is scoped with Access Control per user or group.
- OAuth grants are per user. OAuth 2.1 tools cannot be set as model default tools.
- Features: tools. Resources, prompts, elicitation and sampling are not documented as supported.

**Qwen Code.** Docs: https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/ (repo docs/users/features/mcp.md).
- Transports: `httpUrl` (Streamable HTTP, "recommended"), `url` (SSE, "legacy/deprecated"), stdio.
- Scopes: user `~/.qwen/settings.json`, project `.qwen/settings.json`.
- OAuth: `oauth {enabled, clientId (optional with dynamic registration), clientSecret, authorizationUrl, tokenUrl, scopes, redirectUri (default localhost:7777), audiences}`. Also Google service-account impersonation. Tokens are stored in plaintext in `~/.qwen/mcp-oauth-tokens.json` unless `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`.
- Features: prompts as slash commands; resources via `@server:uri`.
- **MCP Apps**: the client advertises `extensions[io.modelcontextprotocol/ui]` (packages/core/src/tools/mcp-client.ts). Settings `appResourceMaxBytes` and `appResourceTimeoutMs`. The host is WebShell.
- **MCP 2026-07-28 stateless protocol**: stdio servers can opt in with `versionNegotiation:"auto"`. Remote servers stay legacy. Interactive elicitation is deferred. Source: docs/design/mcp-2026-core-client-foundation.md, 2026-09-27.
- Also: global `mcp.allowed`/`mcp.excluded`, and per-server `trust`.

## 2. Summary table
| Client | stdio | SHTTP | SSE | OAuth DCR / CIMD / pre-reg | Static headers | Tools | Prompts | Resources | Elicit | Sampling | Tasks | Apps | Install model |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Zed | Y | Y | n/d | Y / **Y** (CIMD first) / n/d | Y | Y | Y | N | N | N | N | N | per-user settings + extensions |
| JB AI Assistant | Y | Y | Y (legacy) | n/d | n/d | Y | N | N | N | N | N | N | user/project, admin preconfig via IDE Services |
| Junie | Y | "HTTP" | n/d | Y (flow unspecified) | Y | Y | n/d | n/d | n/d | n/d | n/d | n/d | user/project mcp.json |
| Gemini CLI | Y | Y | Y | Y / N / Y | Y | Y | Y | Y | N (code) | N | N | N | user/project/system |
| Goose | Y | Y | **removed** | Y / N / Y | Y | Y | Y | Y | Y | **N now** | N | **Y** | per-user yaml + GOOSE_ALLOWLIST |
| opencode | Y | Y | fallback | Y / N / Y | Y | Y | Y (code) | Y (code) | N | N | N | N | user/project + .well-known org defaults |
| OpenHands | Y | Y | Y | FastMCP OAuth (DCR n/d) / n/d / Y | Y | Y | n/d | n/d | n/d | n/d | n/d | N | per-user UI/CLI; no project file; `[mcp]` toml = V0 only |
| Continue (unmaintained) | Y | Y | Y | code only | Y (requestOptions) | Y | Y | Y | n/d | n/d | N | old matrix: Y | local dir |
| LibreChat | Y | Y | Y (+ws) | Y / N / Y | Y (templated) | Y | probe | probe | N | N | N | ui:// render | admin yaml (stdio) + user UI (remote) |
| Open WebUI | N | Y only | N (use mcpo) | Y / N / Y | Y (templated) | Y | n/d | n/d | n/d | n/d | N | N | **admin-only** |
| Qwen Code | Y | Y | Y | Y (optional clientId) / N / Y | Y | Y | Y | Y | deferred | N | N | **Y** | user/project |

n/d = not documented. N in the Tasks column = not documented and not advertised in the code I checked.

## 3. Agent Client Protocol (ACP)
**v1**, https://agentclientprotocol.com/protocol/v1/session-setup. The `mcpServers` array applies to `session/new`, `session/load` and `session/resume`.

- stdio has no `type` field. Required fields: `name`, `command` ("absolute path"), `args`. Optional: `env` as an `EnvVariable[]`.
  ```json
  {"name":"filesystem","command":"/path/to/mcp-server","args":["--stdio"],"env":[{"name":"API_KEY","value":"secret123"}]}
  ```
- http. `headers` is a **required** `HttpHeader[]`.
  ```json
  {"type":"http","name":"api-server","url":"https://api.example.com/mcp","headers":[{"name":"Authorization","value":"Bearer token123"},{"name":"Content-Type","value":"application/json"}]}
  ```
- sse. Marked "This transport was deprecated by the MCP spec."
  ```json
  {"type":"sse","name":"event-stream","url":"https://events.example.com/mcp","headers":[{"name":"X-API-Key","value":"apikey456"}]}
  ```
- Mandatory vs gated: "All Agents **MUST** support the stdio transport, while HTTP and SSE transports are optional capabilities". Clients must check `agentCapabilities.mcpCapabilities.{http,sse}` first. "new Agents **SHOULD** support the HTTP transport".
- `session/load` requires `loadSession:true`. In v1, `mcpServers` is required on `session/new`, even if empty.

**v2** (whole surface labelled draft), https://agentclientprotocol.com/protocol/v2/session-setup and https://agentclientprotocol.com/protocol/v2/migration.
- `session/load` is **removed**; use `session/resume` with `"replayFrom":{"type":"start"}`.
- `mcpServers` is now optional.
- **SSE is removed.**
- Every server needs a `type` discriminator; stdio becomes `"type":"stdio"`. Custom types start with `_`.
- `headers` becomes optional.
- Capabilities move to `capabilities.session.mcp.{stdio:{},http:{}}`, so stdio is now capability-gated too.
- The client fs/terminal APIs are removed; clients should expose their own tools as an MCP server in `mcpServers` instead.

**Which agents support ACP** (list: https://agentclientprotocol.com/get-started/agents). Advertised MCP capabilities are from code, all v1 SDKs.
| Agent | How | mcpCapabilities | loadSession |
|---|---|---|---|
| Claude Code | adapter `agentclientprotocol/claude-agent-acp`, npm `@agentclientprotocol/claude-agent-acp` (renamed from zed-industries/claude-code-acp, which redirects). README: "Client MCP servers". | http:true, sse:true | true |
| Codex | adapter `@agentclientprotocol/codex-acp`; not native | `{acp:false, http:true, sse:false}` | true |
| Gemini CLI | native, `gemini --acp` (https://geminicli.com/docs/cli/acp-mode/) | http, sse true | true |
| Goose | native, `goose acp`; also `goose serve` over HTTP/WebSocket (https://goose-docs.ai/docs/gdk/acp/) | **http only**, no sse | true |
| opencode | native, `opencode acp` (https://opencode.ai/docs/acp/); registers client-passed `mcpServers` (src/acp/service.ts) | http, sse true | true |
| OpenHands | native, `openhands acp` (https://docs.openhands.dev/openhands/usage/run-openhands/acp); stdio only | http, sse true | true |
| Qwen Code | native, `qwen --acp` (docs/users/integration-zed.md) | sse, http true | true |
| Junie | native, `junie --acp true` | not checked | not checked |

Details behind the table:
- Codex source: src/CodexAcpServer.ts.
- Goose source: crates/goose/src/acp/server.rs, `McpCapabilities::new().http(true)`. Goose also ships agent-client-protocol 2.2.0.
- OpenHands source: OpenHands-CLI openhands_cli/acp_impl/agent/base_agent.py, `McpCapabilities(http=True, sse=True)`. That repo's last commit was 2026-08-11.
- Qwen Code source: packages/cli/src/acp-integration/acpAgent.ts. It also advertises `sessionCapabilities.list` and `resume`.
- SDK versions: claude-agent-acp and codex-acp use the ACP TypeScript SDK 1.5.x. Gemini CLI uses 0.16.1, opencode 0.21.0, Qwen Code ^0.14.1.
- **Implication:** no surveyed agent implements ACP v2 yet. Anyone targeting ACP should send v1 `mcpServers` with `type:"http"` and a `headers` array, which every listed agent accepts. SSE fails on Codex and Goose.
