# MCP client compatibility for ploeg-mcp

> Raw research-agent report, 2026-09-30, kept as evidence for [the MCP server patterns guide](../../2026-09-30-mcp-server-patterns.md). Forum and issue citations for Cursor, ChatGPT, JetBrains and Devin were not re-verified by the agent; opencode and Goose were read in source. See also [opencode-goose.md](opencode-goose.md).

MCP CLIENT COMPATIBILITY FOR ploeg-mcp (spec 2026-07-28 server over stdio + Streamable HTTP, OAuth 2.1). Research date 2026-09-30.

Method: five research agents ran in parallel against changelogs, cloned sources, GitHub issues and vendor forums. I read opencode and Goose source myself: anomalyco/opencode dev @2fa3363 (2026-09-29, release v1.18.33) and aaif-goose/goose main @ac15f93 (2026-09-30, release v1.52.0).

Conventions:
- SRC means read in source. OBS means observed on the wire by third parties in issues.
- "n/d" means not documented and no evidence either way. It is not the same as "unsupported".
- I did not personally re-verify the forum and issue citations for Cursor, ChatGPT, JetBrains or Devin. They come from agent reports that quote the issue or topic numbers given.

======================================================================
0. HEADLINE
======================================================================
- **Dual-era serving is mandatory.**
  - Only three priority clients speak 2026-07-28 by default today: Claude Code (HTTP only), the claude.ai/Desktop hosted connector (observed) and ChatGPT (observed). Goose auto-negotiates.
  - ChatGPT is observed never falling back to `initialize`.
  - VS Code, Cursor, Zed, Gemini CLI, Antigravity, opencode, JetBrains/Junie and Devin Desktop all still open with `initialize` (2025-11-25 or older). Codex defaults to legacy 2025-06-18.
  - A modern-only endpoint breaks the majority of clients. A legacy-only endpoint breaks ChatGPT.
- **MRTR elicitation works in only about three places:** the Claude Code terminal CLI, Codex behind a flag, and ChatGPT's own extension. Every elicitation needs a non-interactive fallback.
- **The model-visible result diverges by client.**
  - Claude Code, Codex and VS Code show the model ONLY structuredContent when it is present.
  - Gemini CLI, Zed, Cursor and opencode show ONLY content (opencode falls back to structuredContent when content is empty).
  - So both must carry the same information.

======================================================================
1. COMPATIBILITY MATRIX (the 8 axes)
======================================================================
Legend: P = protocol, S = schema/results, L = limits, E = elicitation, A = annotations, Au = auth, B = key bugs, I = install.

**Claude Code CLI (v2.1.285, 2026-09-29)**
- P: The v2 client (TS SDK 2.0) negotiates 2026-07-28 via server/discover on HTTP by default; this has been the default everywhere since 2.1.274 (2026-09-17). It does NOT probe stdio unless MCP_PROTOCOL_NEGOTIATION=auto, so stdio stays on legacy `initialize`. Opt out with MCP_SDK_GENERATION=v1 or MCP_PROTOCOL_NEGOTIATION=legacy.
- S:
  - A root anyOf/oneOf/allOf is rewritten lossily; if the rewrite fails the tool is dropped.
  - Tools are dropped if a top-level property name falls outside [A-Za-z0-9_.-]{1,64} or the schema is invalid 2020-12.
  - An outputSchema with a draft-07 `$schema` broke every tool (#86142, fixed 2026-08-17).
  - If structuredContent is present, only it reaches the model (#79944, open).
- L:
  - API tool names ^[a-zA-Z0-9_-]{1,128}$.
  - Descriptions and instructions truncated at 2,048 chars (CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH).
  - MAX_MCP_OUTPUT_TOKENS 25,000 (warning at 10k). Oversize results go to a file.
  - `_meta["anthropic/maxResultSizeChars"]` raises the text cap up to 500k.
  - MCP_TIMEOUT startup is 30 s. HTTP per-request default is 60 s.
  - Idle timeout 5 min (HTTP) or 30 min (stdio); progress resets it.
  - Calls over 2 min move to the background.
  - Tool search defers tools; no tool cap.
- E: Form and URL both supported. Legacy since 2.1.76; MRTR works in the CLI (claude-ai-mcp #1085). URL mode on 2026-07-28 since 2.1.281. The VS Code extension auto-declines (#98256).
- A: Annotations do NOT gate permissions (#87452 closed not-planned). `_meta["anthropic/requiresUserInteraction"]:true` forces a prompt on every call.
- Au:
  - Static: `--header`, `headersHelper`.
  - PRM first, then RFC 8414.
  - Registration: CIMD (https://claude.ai/oauth/claude-code-client-metadata), DCR, or `--client-id/--client-secret/--callback-port`.
  - Redirect http://localhost:PORT/callback on a random port.
  - Step-up on 403 is supported.
- B: #90477 (stateless without session id shows 0 tools), #96733 (404 triggers double initialize), #96183 (initialize after discover on stdio), #97391 (a -32601 discover reply mislabels the era).
- I: `claude mcp add --transport http NAME URL`, `.mcp.json`, plugins, `claude mcp add-json`.

**claude.ai web / Desktop / Cowork (hosted connector, clientInfo Anthropic/ClaudeAI)**
- P: The docs cite only up to 2025-11-25 auth. OBS: sends server/discover with 2026-07-28 and Mcp-Method headers (claude-ai-mcp #1027, #1044), and falls back to `initialize` for 1.x servers (#975, #1005).
- S: Only the API rule is documented (no root combinators). A draft-07 outputSchema is still rejected in Desktop and Cowork (#1016, open). Embedded blob resources are dropped (#1086).
- L:
  - Result about 150,000 chars; call timeout 240 s.
  - OAuth endpoints 10 s (refresh 30 s).
  - Tool names ≤64 chars (review criteria).
  - About 256 tools in total across connectors (#77704).
- E: Web has NONE (#153). Cowork declares form and URL but never renders, and the call hangs for 180 s (#1046, #1085). MRTR state-only rounds error out (#1027).
- A: readOnlyHint splits tools into "Read-only" (auto-allowable) and "Other"; destructiveHint always prompts. Settings are Always allow / Needs approval / Blocked.
- Au:
  - DCR, CIMD (only if the AS advertises `client_id_metadata_document_supported` AND `none` auth), or a custom client ID/secret. Static headers are beta only.
  - Callback https://claude.ai/api/mcp/auth_callback.
  - RFC 8707 resource is sent. Scopes come from WWW-Authenticate, else PRM.
  - Step-up via 403 insufficient_scope. Egress IPs 160.79.104.0/21.
- B: Never echoes Mcp-Session-Id (#975). A missing resultType is rejected (#859). Non-443 ports fail (#719, #750). Paths other than /mcp fail (#878, #738). Stale tool list (#1044). Desktop ignores nextCursor (#66537) and list_changed (#960).
- I: Deeplink `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=NAME&connectorUrl=ENC_URL`. Desktop: `claude_desktop_config.json` (stdio) or `.mcpb` bundles.

**ChatGPT (developer mode / Apps / "Plugins")**
- P: The docs cite 2025-06-18. OBS: it opens with a POST server/discover at 2026-07-28 (UA openai-mcp/1.0.0) and does NOT fall back to `initialize` after a 422 or 500, or after a DiscoverResult listing only legacy versions (macuse-mcp#5 2026-09-24; kagura memory-cloud#1544; community t/1389258).
- S: Schema limits n/d. Both structuredContent and content reach the model; `_meta` goes to the widget only. search/fetch are required only for deep research.
- L: No documented tool-count, size or timeout limits. Anecdotally about a 60 s timeout (t/1366562) and a manifest around 100 KB. Instructions: first 512 chars. No Tasks support.
- E: Via OpenAI's extension `openai/elicitation/create`, form mode only, Desktop and Web only. Registered servers need 2026-07-28 with MRTR (openai/mcp-extensions spec.md). Standard URL mode n/d.
- A: Tools without readOnlyHint get write confirmation. Submission requires explicit readOnly, destructive and openWorld booleans.
- Au:
  - Order: static, then CIMD, then DCR. CIMD client_id https://chatgpt.com/oauth/client.json.
  - Redirect https://chatgpt.com/connector_platform_oauth_redirect (if the AS returns `iss`), otherwise https://chatgpt.com/connector/oauth/{callback_id}.
  - resource param is sent and aud must equal it. PKCE S256 must be advertised.
- B: Discovery answered with SSE failed (t/1400791). Legacy sessions dropped (t/1372031). Cloudflare blocks CIMD fetches from Workers (t/1392271).
- I: Settings → Security and login → Developer mode, then Plugins → "+" → URL → Scan Tools. Remote HTTPS only.

**Codex CLI (rust-v0.159.2, 2026-09-29, rmcp 3.2.0)**
- P: Legacy `initialize` 2025-06-18 by default. 2026-07-28 is behind `[features] mcp_2026_07_28=true`; stdio additionally needs env `CODEX_MCP_PROTOCOL_VERSION=2026-07-28`.
- S:
  - Tools are sent with `strict:false`.
  - Kept: $ref/$defs, anyOf/oneOf/allOf, enum, type arrays, additionalProperties. `const` becomes enum.
  - DROPPED silently: format, default, pattern, min/max, minLength, title, examples.
  - An array without items gets items `{type:string}`.
  - Schemas over 5,000 B are compacted (descriptions stripped, $defs dropped).
  - structuredContent, if present, is the ONLY thing the model sees.
- L:
  - Names sanitized to [A-Za-z0-9_] (hyphen and dot become _). `mcp__srv__tool` capped at 128.
  - The legacy path ignores nextCursor (#28858).
  - Startup 30 s and tool 300 s in code; the docs' 10 s and 60 s are stale.
  - Always deferred behind tool_search. 30-minute catalog cache.
- E: Form and URL, legacy and MRTR (in 2026 mode). Auto-declined when approval_policy=never. Bugs: #41797 (numeric/enum fields), #46003 (root `title` rejected), #40657 (URL mode in input_required).
- A: A tool with no annotations always prompts. readOnly=true never prompts. Otherwise prompt unless destructive=false AND openWorld=false. Per-tool `approval_mode`.
- Au:
  - Static: bearer_token_env_var, http_headers, http_headers_helper.
  - Order: pre-registered, then CIMD (https://chatgpt.com/oauth/codex/client.json), then DCR.
  - Redirect http://127.0.0.1:PORT/callback (or /callback/<sha256> without `iss`). Pin with mcp_oauth_callback_port.
  - resource is always sent. PRM must be same-origin (#42427).
- B: A fractional `priority` fails the whole call (#38979). resource_link is rejected in the Codex App (#33404). list_changed is only logged (#37417). Refresh rotation races (#45944, #48507).
- I: `codex mcp add NAME --url URL`, or `-- CMD`. `~/.codex/config.toml [mcp_servers.NAME]`.

**Cursor (3.21.x)**
- P: Legacy `initialize` 2025-11-25. Staff (forum 172536, 2026-09-21): "doesn't yet negotiate 2026-07-28 … no timeline". A 400 is misread as a cue to fall back to SSE.
- S: Rejects `type:[..,"null"]` and anyOf unions (topic 142477). Mangles arrays (151180). A structured-only result reaches the model empty (167346). Validates structuredContent even when isError (160503). $ref: n/d.
- L: Server+tool name ≤60 chars (153918). Dynamic tool discovery (no hard cap). About 60 s timeout. Large results go to a file.
- E: Legacy form only. The prompt can hide in a collapsed row and time out after about 60 s (172829). No MRTR.
- A: Annotations n/d. Gating is by run mode or `mcpAllowlist` in permissions.json.
- Au:
  - DCR or static CLIENT_ID/SECRET; no CIMD (148096).
  - Redirects: http://localhost:8787/callback, https://www.cursor.com/agents/mcp/oauth/callback, cursor://anysphere.cursor-mcp/oauth/callback.
  - Listener bound to [::1] only (165019). Static headers are ignored once OAuth is discovered (156054).
- B: Desktop reads only the first tools/list page (165213). Ignores list_changed and caches tools on disk until quit (166216). Keeps a stale session id after refresh (172782).
- I: `~/.cursor/mcp.json` or `.cursor/mcp.json` (`mcpServers`). Deeplink `cursor://anysphere.cursor-deeplink/mcp/install?name=N&config=BASE64`, max 10,000 chars.

**VS Code Copilot (1.139, 2026-09-23)**
- P: `LATEST_PROTOCOL_VERSION="2025-11-25"` (SRC modelContextProtocol.ts:43). 2026-07-28 support is requested in microsoft/vscode#329848 (open, no milestone). Any non-auth 4xx on the first POST triggers the legacy SSE fallback.
- S:
  - Validates inputSchema against draft-07; invalid tools are omitted.
  - The Copilot Ajv validator is draft-07 only, so declaring `$schema` 2020-12 silently skips validation (#318984).
  - structuredContent present means the model sees only its JSON (#290063).
- L:
  - Names [a-z0-9_-]; others become _. Id `mcp_<srv≤13>_<tool>` ≤64.
  - 128 tools per request (virtual-tool grouping above the threshold).
  - Results over 8 KB are written to disk (largeToolResultsToDisk).
  - Timeout n/d.
- E: Legacy form and URL. No MRTR.
- A: readOnlyHint skips confirmation. openWorldHint adds a result confirmation. destructiveHint is unused.
- Au:
  - Order: CIMD, then DCR, then client-ID prompt.
  - Redirects: http://127.0.0.1:33418/, http://127.0.0.1/, https://vscode.dev/redirect, https://insiders.vscode.dev/redirect.
  - Requests all scopes_supported (#269907). Step-up on a 401/403 scope challenge.
- B: MCP-Protocol-Version is not sent on normal requests (#308766). The Agent Host has a separate MCP stack (#337052).
- I: `.vscode/mcp.json` (`servers`, `inputs`), `code --add-mcp '{json}'`, `vscode:mcp/install?{urlenc json}`.

**Zed (v1.21.0)**
- P: `initialize` 2025-11-25 only; rejects other reply versions. No 2026-07-28.
- S: Inlines #/$defs (recursive refs become {}). Full JSON Schema is passed to Gemini since #63342. outputSchema and structuredContent are ignored; only content reaches the model.
- L: Names ≤64 chars, [A-Za-z0-9_-]. No pagination. 60 s timeout, and progress does not extend it (#56774). audio, embedded and resource_link content is dropped.
- E: None. Server requests are silently dropped.
- A: Ignored. `agent.tool_permissions` with `mcp:<srv>:<tool>`.
- Au:
  - Order: CIMD (https://zed.dev/oauth/client-metadata.json), then DCR, then pre-registered.
  - Redirect http://127.0.0.1:EPHEMERAL/callback. Sends resource.
  - Bugs: #56210 (port mismatch), #62553 (secret required for a public client).
- B: POST only, no GET. Non-2xx responses hang until timeout. No re-initialize on 404 (#57180).
- I: settings.json `context_servers` with `{url, headers}` or `{command, args}`. No deeplink.

**opencode (v1.18.33; SRC by me)**
- P: @modelcontextprotocol/sdk 1.29.0, patched (packages/opencode/package.json:83), so LATEST=2025-11-25 and it uses `initialize`. #41540 "Support MCP 2026-07-28" is open (2026-08-10).
- S:
  - **Forces `additionalProperties:false` and `type:"object"` onto the root inputSchema** (src/mcp/catalog.ts convertTool).
  - Uses content if it is non-empty, else JSON.stringify(structuredContent).
  - An isError result is thrown as text.
  - #31002: non-standard `format` values cause warnings.
- L:
  - Names `sanitize(server)_sanitize(tool)` with [^a-zA-Z0-9_-] replaced by _.
  - Paginates tools, prompts and resources (catalog.ts paginate).
  - Connect default 30 s in code; the docs say 5 s. `resetTimeoutOnProgress:true`.
- E: None. Capabilities declare only `roots`; elicitation, sampling and tasks are commented out (index.ts:40-49). #23066 is closed.
- A: n/d (opencode permission config).
- Au:
  - Static `headers`, or `oauth:false`.
  - OAuth via the SDK: DCR, or `oauth.clientId/clientSecret/scope`.
  - Redirect **http://127.0.0.1:19876/mcp/oauth/callback** (oauth-provider.ts:11-12; the host line is not shown in my grep), overridable via callbackPort or redirectUri.
  - Commands: `opencode mcp auth` and `opencode mcp debug`.
- B: Tries StreamableHTTP, then falls back to SSE (index.ts:268-283).
- I: opencode.json `"mcp":{"ploeg":{"type":"remote","url":…,"headers":{…},"oauth":{…}}}`.

**Goose (v1.52.0, rmcp 3.4.1; SRC by me)**
- P: **Dual-era.** With no pinned version it uses `ClientLifecycleMode::Auto{preferred:[2026-07-28, 2025-11-25], legacy:2025-11-25}` (agents/mcp_client.rs:555-576). On an empty discover SSE it retries with 2025-11-25 (streamable_http.rs:231-262). v1.50 regressions against legacy servers were fixed in #11965, #12040 and #12257 (Sept 2026).
- S: Collapses const-unions into enum and inlines trivial $defs (tool_schema_normalize.rs).
- L: Text over 200,000 chars goes to a file (large_response_handler.rs). Default extension timeout 300 s (config/extensions.rs:10).
- E: Legacy form and URL (mcp_client.rs:395-457). **No MRTR**: #11194 is open.
- A: readOnlyHint=true is treated as read-only (no ask in smart-approve). readOnlyHint=false is set to AskBefore (permission_inspector.rs:58, config/permission.rs:97).
- Au: Headers, client_id, scopes. Redirect **http://127.0.0.1:EPHEMERAL/oauth_callback**; pin it with GOOSE_OAUTH_CALLBACK_PORT (oauth/mod.rs:440-453). Refresh races: #12016 (open).
- B: #12016.
- I: `goose://extension?type=streamable_http&url=ENC&id=ploeg&name=Ploeg&description=…&header=Authorization%3D…`. config.yaml extension `{type: streamable_http, uri, headers, timeout}`.

**Gemini CLI (v0.62.0)**
- P: SDK 1.23.0, so `initialize` 2025-06-18. Capabilities: roots only.
- S:
  - Sent as `parametersJsonSchema`. Only rewrites [T,"null"] to nullable.
  - Validates with Ajv draft-07 unless `$schema` is exactly 2020-12.
  - The model sees only content; structuredContent with empty content becomes an empty result (#29526).
- L:
  - Name `mcp_{server}_{tool}`; over 63 chars it is mangled to 30…30. Avoid `_` in the server name.
  - tools/list is NOT paginated.
  - Text over 40,000 chars is truncated and saved to a file.
  - 600 s timeout.
  - resource_link becomes text. A server with no tools is disconnected.
- E: None (#28074 NOT_PLANNED). No MRTR.
- A: readOnly only matters for Plan-mode policy. `trust:true` bypasses confirmation; `includeTools` and `excludeTools` exist.
- Au:
  - Custom OAuth: PRM, then AS metadata, then DCR (public client).
  - resource sent on authorize, token and refresh.
  - Redirect http://localhost:RANDOM/oauth/callback.
  - **RFC 9207 `iss` is required since 0.61** (#29117).
  - **SSRF guard: the AS must be publicly resolvable; RFC1918 and CGNAT addresses are blocked** (#29081).
- B: HEAD probe for auth. The GET stream is opened without auth (#25473).
- I: `gemini mcp add -s user -t http ploeg URL`. settings.json `mcpServers {url, type:"http", headers}`. Extensions via gemini-extension.json.

**Antigravity CLI (`agy` 1.2.14)**
- P: Legacy. Request for server/discover support: #615 (open).
- S: n/d.
- L: Possibly lazy dispatcher (`call_mcp_tool`), per changelog.
- E: n/d.
- A: Ask by default, with `mcp(server/tool)` patterns.
- Au: DCR and CIMD (1.1.14). Manual redirect https://antigravity.google/oauth-callback. Omits offline_access (#1038).
- B:
  - Rejecting `roots/list_changed` kills the connection (#1124).
  - No fallback after a 405 on GET (#877).
  - DCR expects 201 (#1127).
  - Stale session (#1031).
- I: `~/.gemini/config/mcp_config.json` with `serverUrl`. `agy mcp add`.

**JetBrains AI Assistant / Junie**
- P: Kotlin SDK 0.15 (≤2025-11-25). Junie requests 2025-06-18 and ABORTS if the reply is 2025-11-25 (JUNIE-5181).
- S: AIA rejects `type:[..,"null"]` (LLM-28733) and drops const and anyOf (LLM-25450). structuredContent n/d.
- L: Junie allows 100 tools maximum and warns above 40. Its GET has a 10 s read timeout that kills the session (JUNIE-4021). Timeouts are not configurable. AIA loops on nextCursor (LLM-30455).
- E: None (JUNIE-1079).
- A: n/d. Junie allowlist uses `mcpTools` prefixes.
- Au: **AIA has no OAuth** (LLM-25012), so static headers only. Junie does browser OAuth on a 401; redirect n/d.
- B: 405 on GET (LLM-30889).
- I: AIA Settings | Tools | AI Assistant | MCP (Claude-style JSON). Junie `.junie/mcp/mcp.json`.

**Windsurf → Devin Desktop (renamed 2026-06-02)**
- P: n/d; follows 2025-03-26 back-compat and falls back to SSE on 4xx. No 2026-07-28.
- S: n/d.
- L: Cascade allows 100 tools in total. Initialization 60 s.
- E: MCP elicitation n/d.
- A: readOnlyHint is allowed in plan mode only; otherwise `mcp__srv__tool` allow/ask rules.
- Au: DCR or pre-registered (`oauthClientId`). Redirect http://localhost:8765/callback (since v3000.10.21). resource is sent. The old client requested all scopes.
- B: n/d.
- I: `~/.config/devin/mcp_config.json` (`serverUrl`/`url`, `headers`) and `.devin/mcp_config.json`. `devin mcp add`. No deeplink.

======================================================================
2. TRAPS (numbered, with evidence)
======================================================================

**Protocol and era**

1. **A modern-only server is unreachable from most clients.**
   - VS Code: SRC LATEST 2025-11-25; #329848.
   - Cursor: forum 172536.
   - Zed: context_server/types.rs.
   - Gemini: SDK 1.23.0.
   - opencode: SDK 1.29.0.
   - Junie, Antigravity (#615) and Codex (default 2025-06-18) are legacy too.
   - Spec versioning: a legacy client against a modern-only server "fails".
2. **ChatGPT probes modern and is observed NOT to fall back.** A legacy-only or half-modern server shows an empty tool list or "MCP_ACTION_DISCOVERY_FAILED" (macuse-mcp#5, kagura#1544, community t/1389258). A DiscoverResult that lists only legacy versions stops the fallback.
3. **A bare 4xx on a legacy client's first POST sends VS Code, Cursor and Devin into the legacy HTTP+SSE fallback (GET).** The failure then looks like a 405 on GET (#329848, Cursor 172536). Answer legacy `initialize` properly on the same URL.
4. **Version echo.**
   - Junie aborts if the reply version is newer than requested (JUNIE-5181).
   - Zed errors on any version it doesn't list.
   - Always reply with the client's requested version if you support it.
5. **stdio era detection is client-specific.**
   - Claude Code does not probe stdio unless MCP_PROTOCOL_NEGOTIATION=auto. It has sent `initialize` after a successful discover (#96183, open).
   - A -32601 with a custom message mislabels the era (#97391).
   - Codex needs `CODEX_MCP_PROTOCOL_VERSION` in env.
   - A dual-era stdio server must accept either first message.
6. **resultType must always be present.** claude.ai rejects results without it (claude-ai-mcp #859), even though the spec says clients should treat missing as complete.
7. **Mcp-Method, Mcp-Name, MCP-Protocol-Version and `_meta` are absent from legacy clients.** VS Code doesn't send MCP-Protocol-Version even post-init (#308766). Enforce the headers only on modern-era requests.
8. **The go-sdk Stateless=true mode is the only way it speaks 2026-07-28** (v1.7.0 release notes). In stateless mode "any server→client request is rejected immediately", so legacy `elicitation/create` and list_changed pushes to VS Code, Cursor and Goose are lost unless you add a stateful legacy router.

**Results and schema**

9. **structuredContent hides content in Claude Code** (#79944), Codex (models.rs ~2314) and VS Code (#290063).
10. **The opposite, content-only, applies in Gemini (#29526, empty result), Zed, Cursor (#167346) and opencode.** Both fields must carry equivalent information.
11. **Cursor validates structuredContent against outputSchema even on isError** (160503). Never attach structuredContent to errors.
12. **Draft-07 `$schema` in outputSchema** disables all tools in Claude Desktop and Cowork (#1016). **2020-12 `$schema`** makes the Copilot Ajv silently skip validation (#318984). Gemini uses draft-07 unless 2020-12 is declared. So omit `$schema` and use only keywords common to draft-07 and 2020-12.
13. **Nullable type arrays `["string","null"]`** break Cursor (142477) and JetBrains AIA (LLM-28733). Gemini rewrites them.
14. **anyOf/oneOf/const** are rejected or dropped by Cursor and AIA (LLM-25450). A root combinator is rejected by the Claude API and rewritten lossily by Claude Code.
15. **opencode forces `additionalProperties:false` at the root** (catalog.ts). Free-form or pass-through root objects break, so every argument must be a declared property.
16. **Codex silently drops format, default, pattern, minimum/maximum and minLength**, and compacts schemas over 5 KB by stripping descriptions and $defs. Constraints must be enforced server-side and repeated in descriptions.
17. **$ref/$defs.** Zed inlines them and turns recursive refs into {}. An old Zed bug dropped $ref tools (#60165). Codex prunes them. Inline everything.
18. **Strict deserializers (Codex rmcp).** A fractional `annotations.priority` fails the whole call (#38979). resource_link is rejected in the Codex App (#33404). claude.ai drops embedded blob resources (#1086). Zed drops resource_link, audio and embedded content.

**Limits**

19. **Tool name budgets.**
    - Gemini: `mcp_{server}_{tool}` ≤63, otherwise mangled.
    - Cursor: server+tool ≤60.
    - VS Code: `mcp_<srv≤13>_<tool>` ≤64.
    - Claude.ai: ≤64.
    - Codex: rewrites `-` and `.`.
    - VS Code: rewrites uppercase and dots.
    - Gemini policy splits on the first `_` after `mcp_`, so there must be no underscore in the server name.
20. **Pagination is ignored.** Codex legacy (#28858), Cursor desktop (165213), Gemini CLI, Zed and Claude Desktop (#66537) never follow nextCursor. JetBrains AIA looped forever (LLM-30455).
21. **Tool count.** Junie max 100 (warns above 40), Cascade 100, VS Code 128 per request, claude.ai about 256 in total (#77704).
22. **Result size.**
    - VS Code writes results over 8 KB to disk.
    - Claude Code: 25k tokens.
    - Gemini: 40k chars truncated.
    - claude.ai: 150k chars.
    - Goose: 200k chars.
23. **Timeouts.**
    - About 60 s: Claude Code HTTP default, Cursor, Zed (progress doesn't help, #56774), ChatGPT (anecdotal).
    - 240 s: claude.ai.
    - 300 s: Codex and Goose.
    - 600 s: Gemini.
    - Junie and AIA are not configurable.
24. **Descriptions** are truncated at 2,048 chars (Claude Code). Codex and Claude Code defer tools behind tool search, so descriptions are search text. ChatGPT reads only the first 512 chars of instructions reliably.
25. **list_changed and caches.**
    - Cursor ignores list_changed and caches tools on disk until quit (166216).
    - Codex only logs it (#37417) and caches the catalog for 30 minutes.
    - Claude Desktop ignores re-list (#960).
    - claude.ai stays stuck on an old list (#1044).
    - Tool sets must be effectively static per release.

**Elicitation**

26. **MRTR only works in Claude Code CLI, Codex (flag) and ChatGPT (its own extension).**
    - claude.ai web: none (#153). A state-only InputRequiredResult errors there (#1027).
    - Cowork hangs for 180 s (#1085).
    - The Claude Code VS Code extension auto-declines (#98256).
    - Goose: no MRTR (#11194).
    - All Claude surfaces send the same clientInfo, so capability detection lies.
27. **No elicitation at all:** Gemini, Zed (requests are silently dropped, which hangs until timeout), opencode, Junie, Antigravity and JetBrains. The spec says a server MUST NOT send input requests for undeclared capabilities.
28. **Buggy form renderers.** Codex rejects a root `title` (#46003) and breaks on numeric or enum fields (#41797). Cursor hides the form (172829).

**Transport**

29. **GET handling.** Junie's GET has a 10 s timeout that kills the session (JUNIE-4021). Antigravity has no fallback after a 405 (#877). Gemini opens GET without auth (#25473). Answer GET instantly with 405 and `Allow: POST`.
30. **Rejecting notifications kills clients.** Antigravity dies if `notifications/roots/list_changed` gets a 400 (#1124). Return 202 for every notification, even unknown or removed ones.
31. **Session ids.**
    - claude.ai never echoes Mcp-Session-Id (#975).
    - Zed (#57180), Antigravity (#1031) and the Cursor CLI (161132) don't re-initialize on 404.
    - Cursor keeps an old session id after refresh (172782).
    - Claude Code shows 0 tools on one stateless server (#90477).
32. **Discovery answered as SSE failed ChatGPT** (t/1400791). Proxies buffer SSE (go-sdk #1155: no bytes until completion). An `http.Server.WriteTimeout` kills streams (#1262).
33. **Paths and ports.**
    - Only exactly /mcp and port 443 work reliably with claude.ai (#878, #738, #719, #750).
    - Its UI strips a trailing slash (#1056) and uppercases paths (#779).
    - Starlette-style 307 redirects break POST (python-sdk #732).
    - Cross-host 3xx redirects drop Authorization.
34. **HEAD probe.** Gemini probes with HEAD and expects 401 + WWW-Authenticate.

**Auth**

35. **Keycloak ignores the RFC 8707 `resource` parameter** ("Partially Supported without Resource Indicators", keycloak.org/securing-apps/mcp-authz-server). An experimental `--features=resource-indicators` exists, with an aud-widening bug (#53261). Audience must come from an Audience-mapper client scope.
36. **Authentik has no RFC 8707** (#14545 open), so aud = client_id. Its DCR (2026.8) requires a bearer token, so generic clients can't use it. Its authorize redirect has no RFC 9207 `iss` (authorize.py), and Gemini CLI ≥0.61 then fails with "Missing issuer parameter" (#29117; fix PR #29488 open). **Keycloak is the viable IdP for broad client coverage.**
37. **Keycloak DCR** is anonymously disabled by default (Trusted Hosts policy empty; Allowed Client Scopes limited to realm defaults). CIMD is experimental (`--features=cimd`) and needed #49730 to advertise `none`. claude.ai uses CIMD only if both `client_id_metadata_document_supported` and `none` are advertised.
38. **Redirect URI zoo.** Loopback clients use random ports on both localhost and 127.0.0.1:
    - Claude Code CIMD declares both.
    - Codex uses 127.0.0.1 at DCR but localhost at authorize (#31038), and appends `/callback/<sha256>` when there is no `iss` (#30460).
    - Cursor is fixed at :8787 and binds [::1] only.
    - opencode is fixed at :19876/mcp/oauth/callback.
    - Goose and Zed use ephemeral 127.0.0.1 ports.
    - Hosted callbacks must be exact: claude.ai, ChatGPT (two forms), vscode.dev, cursor.com, antigravity.google.
39. **Scope over-request.** VS Code (#269907) and old Windsurf request ALL of `scopes_supported`, and Keycloak answers "invalid scopes". Claude Code uses the challenge scope. offline_access must be advertised for refresh (Antigravity #1038), but the spec says not to list it in PRM scopes_supported.
40. **Refresh-token rotation races** in Codex (#45944, #48507) and Goose (#12016). Strict reuse revocation logs users out.
41. **PRM location and exactness.**
    - Codex ignores a cross-origin `resource_metadata` (#42427).
    - Codex, Gemini (#24484) and claude.ai require PRM `resource` to equal or prefix the entered URL.
    - claude.ai uses only the FIRST `authorization_servers` entry.
    - go-sdk RequireBearerToken omits `error=` in its challenge, which breaks step-up (#1134).
42. **Gemini CLI's SSRF guard** rejects an IdP on RFC1918, 100.64/10 (Tailscale) or `.internal`/`.local` names (#29081). A split-DNS homelab IdP fails.
43. **JetBrains AIA has no OAuth** (LLM-25012), so a static bearer path is required for that client and for headless CI agents.

======================================================================
3. WHAT ploeg-mcp MUST DO (concrete rules)
======================================================================

**Era and wire**

R1. **One URL `https://<host>/mcp` serves both eras on go-sdk ≥ v1.8.0** (StreamableHTTPOptions.Stateless=true).
- Set SupportedProtocolVersions = [2026-07-28, 2025-11-25, 2025-06-18, 2025-03-26].
- Route per request:
  - `params._meta["io.modelcontextprotocol/protocolVersion"]` present means the modern path.
  - `method=="initialize"` means the legacy path.
- Echo the client's requested legacy version.
- Accept a request with no MCP-Protocol-Version header as 2025-03-26.
- Accepted limitation: stateless legacy means no server→client requests (no legacy elicitation or list_changed push). It is worth it because claude.ai never echoes session ids. Revisit only if VS Code, Cursor or Goose elicitation matters, via a front router to a stateful legacy handler.

R2. **Modern path.**
- Implement server/discover with supportedVersions including 2026-07-28, capabilities, instructions, `_meta` serverInfo, ttlMs and cacheScope.
- Put `resultType` on EVERY result, including legacy-era responses, which are harmless.
- Put serverInfo in the result `_meta`.
- Answer discover with `Content-Type: application/json`, never SSE.
- Error bodies are always JSON-RPC, never plain text:
  - Unsupported version: 400 with -32022 and data.supported.
  - Missing or mismatched headers: 400 with -32020.
  - Missing `_meta`: 400 with -32602.
  - Unknown method: 404 with -32601.
  go-sdk writes plain-text 400s in some paths, so wrap or verify them.

R3. **HTTP hygiene.**
- POST returns application/json by default; use SSE only when progress is emitted.
- GET and DELETE return 405 immediately with `Allow: POST`.
- HEAD without a token returns 401 plus WWW-Authenticate.
- Every notification (incl. roots/list_changed, notifications/initialized, cancelled) returns 202 with no body.
- Treat a missing Accept header or wildcards as acceptable.
- Never mint Mcp-Session-Id; ignore it and Last-Event-ID.
- No 30x anywhere on /mcp. Exact path, no trailing slash, port 443.
- SSE responses:
  - Headers `X-Accel-Buffering: no` and `Cache-Control: no-cache`.
  - Write an immediate `:` comment, then keepalive every 15–20 s (go-sdk StreamKeepAlive is not released yet, so implement it).
  - Set WriteTimeout=0 on the MCP route. Proxy read timeout above 125 s.

R4. **stdio.**
- Accept either `server/discover` or `initialize` as the first message.
- Also tolerate `initialize` after discover (Claude Code #96183).
- Nothing but JSON-RPC on stdout; logs go to stderr.

R5. **Origin and CORS.**
- Validate Origin against an allowlist (403). Bind to 127.0.0.1 for local HTTP.
- Apply CORS to /mcp and the PRM endpoint.
- Allow headers: Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID.
- Expose headers: WWW-Authenticate, MCP-Protocol-Version.
- Do NOT use x-mcp-header / Mcp-Param-* (browser clients skip them, and conforming servers would then reject).

**Tool catalogue**

R6. **Server name `ploeg`**: lowercase, no `_` or `-`.
- Tool names match `^[a-z][a-z0-9_]{0,29}$` (≤30 chars, snake_case, no hyphens or dots).
- This fits Gemini `mcp_ploeg_` + 30 ≤ 63, Cursor ≤ 60, VS Code ≤ 64, claude.ai ≤ 64, and Codex's sanitizer.

R7. **Keep the catalogue at ≤ 40 tools** (Junie warns above 40, hard 100).
- tools/list returns ALL tools in ONE page with no nextCursor, in deterministic order.
- The catalogue is static per server version.
- ttlMs = 300000; cacheScope "private" if the tool set depends on the user's scopes, else "public".
- Tell users that tool changes need a client restart (Cursor, Codex, Desktop).

R8. **Descriptions.**
- ≤ 1,000 chars per tool (under Codex's plugin cap and Claude Code's 2,048).
- Front-load a verb and the domain nouns (Run, Shift, Work Item) for tool search.
- Server instructions ≤ 2,048 chars, with the first 512 self-contained.

R9. **inputSchema subset (the lowest common denominator).**
- Root `{"type":"object","properties":{…},"required":[…]}`. Every property is declared (opencode forces additionalProperties:false).
- No `$schema`, `$ref`, `$defs` or `definitions` (inline everything).
- No anyOf, oneOf, allOf, not, if/then or const. Use `enum` of strings for closed sets.
- No type arrays or nullable. Make fields optional instead of null.
- Allowed: type (single), properties, required, items (always present on arrays), enum, description, additionalProperties:false.
- Nested objects ≤ 3 levels; arrays of objects are fine.
- Do NOT rely on format, default, pattern or min/max being enforced (Codex drops them). State them in the description and validate server-side, returning isError text.
- Top-level property names `[a-z][a-z0-9_]{0,63}`.
- Each tool schema < 4 KB serialized (Codex compacts above 5 KB).
- CI must validate every schema against both draft-07 and 2020-12 meta-schemas.

R10. **outputSchema and results.**
- Declare outputSchema without `$schema` using the same subset.
- Every success result carries BOTH:
  - `structuredContent` that is self-sufficient for the model (the Claude Code, Codex and VS Code view);
  - a single `text` content block with the same information: compact JSON, or a short summary plus JSON (the Gemini, Zed, Cursor and opencode view).
- Errors: `isError:true` with a text block only and no structuredContent.
- Content types: `text` only. Use images only if essential.
- No resource_link, embedded blobs, audio, or `annotations.priority`.

R11. **Size caps.**
- Target ≤ 8 KB per result (VS Code inline threshold).
- Hard cap 40,000 chars (Gemini truncation, below Claude Code's 25k tokens).
- Larger data is paginated through tool arguments (`cursor` handle, `limit`), never by returning bulk.
- Optionally set `_meta["anthropic/maxResultSizeChars"]` only on tools that truly need more (Claude Code only).

R12. **Time caps.**
- Every tool returns in ≤ 30 s (under the 60 s floor of Claude Code HTTP, Cursor, Zed and ChatGPT).
- Anything longer (starting a Shift or Run, waiting on a PR) returns a handle immediately; the client polls a `*_status` tool.
- Emit progress notifications where a call may exceed 10 s (this resets Claude Code idle and opencode timeouts; Zed ignores them).
- Don't use the Tasks extension (ChatGPT and opencode lack it; Goose #11208).

**Annotations and approval**

R13. **Every tool sets title, readOnlyHint, destructiveHint, idempotentHint and openWorldHint as explicit booleans** (ChatGPT submission; Codex prompts on missing ones).
- Reads: readOnly=true, openWorld=false. They auto-run in VS Code, Codex, claude.ai, Goose and ChatGPT.
- Mutations (create a Work Item, start a Run): readOnly=false, destructive=false, openWorld=false.
- Irreversible actions (cancel a Shift, merge, delete): destructive=true, plus `_meta["anthropic/requiresUserInteraction"]:true`. That is the only lever in Claude Code, where annotations don't gate.
- Never ship one catch-all read+write tool (claude.ai directory rule).

**Elicitation**

R14. **Elicitation is an enhancement, never a dependency.**
- Send MRTR `input_required` only when the request's clientCapabilities declare elicitation (the modern path), and only form mode with flat string, boolean and enum fields and no root `title` (Codex #46003, #41797).
- The universal fallback for every confirmable action is a two-step pattern: the tool returns a preview plus a short-lived HMAC-signed `confirmation` handle as structured text, and the model calls the apply tool with that handle. The same HMAC/AEAD, principal binding and expiry protect MRTR `requestState` (spec MUST).
- Treat claude.ai, Cowork, and the Claude Code VS Code extension as no-elicitation, even though they declare it. Offer a server-side config switch, or detect `clientInfo.name` Anthropic/ClaudeAI.

**Auth**

R15. **Protected resource metadata and challenges.**
- Serve PRM at `/.well-known/oauth-protected-resource/mcp` AND `/.well-known/oauth-protected-resource`, on the same origin as /mcp.
- `resource` = `https://<host>/mcp`: lowercase, no trailing slash, no port.
- Exactly one `authorization_servers` entry, equal to the issuer string.
- Minimal `scopes_supported` (e.g. `ploeg:read`, `ploeg:write`, plus the audience scope), all valid at the IdP. Omit offline_access there.
- 401: `WWW-Authenticate: Bearer resource_metadata="…", scope="ploeg:read"`.
- 403: `Bearer error="insufficient_scope", scope="<ALL needed scopes>", resource_metadata="…"`. Write it yourself (go-sdk #1134).
- Validate iss, exp and aud (aud = the resource URL) server-side.

R16. **IdP: Keycloak.**
- Realm client scope `ploeg-mcp` with an Audience mapper (included custom audience = `https://<host>/mcp`), set as a default scope, because RFC 8707 is ignored.
- The reverse proxy exposes `/.well-known/oauth-authorization-server/realms/<realm>`.
- Advertise S256, `none` in token_endpoint_auth_methods_supported, `authorization_response_iss_parameter_supported` (on by default), and offline_access.
- The IdP needs a public DNS name and public IP (Gemini SSRF guard), on port 443.
- Enable anonymous DCR via the Trusted Hosts policy, scoped to the client redirect patterns. CIMD (`--features=cimd`) is optional and experimental.
- Pre-register public clients with these redirects:
  - https://claude.ai/api/mcp/auth_callback
  - https://chatgpt.com/connector_platform_oauth_redirect
  - https://chatgpt.com/connector/oauth/*
  - https://vscode.dev/redirect
  - https://insiders.vscode.dev/redirect
  - http://127.0.0.1:33418/
  - http://localhost:8787/callback
  - https://www.cursor.com/agents/mcp/oauth/callback
  - cursor://anysphere.cursor-mcp/oauth/callback
  - http://127.0.0.1:19876/mcp/oauth/callback
  - http://localhost:8765/callback
  - https://antigravity.google/oauth-callback
  - loopback wildcards `http://127.0.0.1:*`, `http://localhost:*`
- Refresh tokens: enable rotation, but disable strict reuse revocation (or allow reuse ≥ 1) because of the Codex and Goose races.
- Keep token endpoint latency under 10 s.
- Do NOT use Authentik for the MCP AS until RFC 9207 `iss`, RFC 8707 and anonymous DCR land.

R17. **Static bearer path.**
- Keep a static bearer path as well: a personal access token accepted in `Authorization: Bearer`. It covers JetBrains AIA, headless CI, Codex `bearer_token_env_var`, Gemini, Zed and opencode headers, and claude.ai static-header beta orgs.
- On stdio, take credentials from env only.

**Testing**

R18. **Qualification.**
- Run the `@modelcontextprotocol/conformance` server suite in CI twice (`--spec-version 2025-11-25` and `2026-07-28`).
- Run Inspector 2.8.0 with protocolEra legacy, auto and modern.
- Smoke-test manually:
  - Claude Code with MCP_PROTOCOL_NEGOTIATION=auto and =legacy;
  - claude.ai via the deeplink;
  - ChatGPT developer mode;
  - Codex with and without `mcp_2026_07_28`;
  - VS Code;
  - Cursor;
  - Gemini CLI (OAuth against the public Keycloak).

======================================================================
4. ONE-LINE INSTALLS (for docs)
======================================================================
- **Claude Code:**
  - `claude mcp add --transport http ploeg https://HOST/mcp`
  - stdio: `claude mcp add ploeg -- ploeg-mcp stdio`
  - A pre-registered client adds `--client-id ID --client-secret --callback-port N`.
- **claude.ai:** `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Ploeg&connectorUrl=https%3A%2F%2FHOST%2Fmcp` (prefill fails on iOS Safari, #895).
- **Claude Desktop:** a `.mcpb` bundle (manifest 0.3, server type `binary`) for stdio, or the connector above for remote.
- **ChatGPT:** Settings → Security and login → Developer mode, then Plugins → "+" → URL `https://HOST/mcp` → Scan Tools.
- **Codex:** `codex mcp add ploeg --url https://HOST/mcp`, then `codex mcp login ploeg`. Or `[mcp_servers.ploeg] url="https://HOST/mcp"` in `~/.codex/config.toml`.
- **Cursor:** `cursor://anysphere.cursor-deeplink/mcp/install?name=ploeg&config=` + base64(`{"url":"https://HOST/mcp"}`). Web variant `https://cursor.com/install-mcp?name=…&config=…`.
- **VS Code:** `code --add-mcp '{"name":"ploeg","type":"http","url":"https://HOST/mcp"}'`, or `vscode:mcp/install?` + encodeURIComponent(same JSON) (`vscode-insiders:` for Insiders).
- **Gemini CLI:** `gemini mcp add -s user -t http ploeg https://HOST/mcp`.
- **Antigravity:** `agy mcp add` or `~/.gemini/config/mcp_config.json` `{"mcpServers":{"ploeg":{"serverUrl":"https://HOST/mcp"}}}`.
- **opencode:** `opencode.json` `{"mcp":{"ploeg":{"type":"remote","url":"https://HOST/mcp"}}}`, then `opencode mcp auth ploeg`.
- **Goose:** `goose://extension?type=streamable_http&url=https%3A%2F%2FHOST%2Fmcp&id=ploeg&name=Ploeg&description=Glide%20Ploeg`.
- **Zed:** settings.json `"context_servers":{"ploeg":{"url":"https://HOST/mcp"}}`.
- **JetBrains:** AIA uses Settings | Tools | AI Assistant | MCP with `{"mcpServers":{"ploeg":{"type":"streamable-http","url":"https://HOST/mcp","headers":{"Authorization":"Bearer …"}}}}`. Junie uses `.junie/mcp/mcp.json`.
- **Devin Desktop:** `~/.config/devin/mcp_config.json` `{"mcpServers":{"ploeg":{"serverUrl":"https://HOST/mcp"}}}`, or `devin mcp add`.

======================================================================
5. GAPS AND CONFIDENCE
======================================================================
- **ChatGPT:**
  - "No fallback" rests on three third-party observations (Aug–Sep 2026); OpenAI's own mcp-extensions spec documents the `initialize` locations too. Retest.
  - ChatGPT schema limits and timeouts are n/d.
- **Not documented (n/d):**
  - Devin: protocol, schema, elicitation.
  - JetBrains: structuredContent handling and Junie OAuth redirect.
  - Antigravity: elicitation.
  - opencode: annotations.
  - VS Code: tool-call timeout.
  - Goose: exact tool-name prefix and CIMD support were not verified.
- **Unconfirmed wire behaviour:**
  - Whether any client honours `ttlMs`/`cacheScope`: no client code found reading them (Codex was checked; the others were not).
  - The opencode OAuth callback host is 127.0.0.1 or localhost; the host line was not shown in my grep.
- **Raw evidence** (clones of the Codex, opencode and Goose sources; VS Code source excerpts, release notes and forum JSON) is in <scratch>
- No repository files were modified.
