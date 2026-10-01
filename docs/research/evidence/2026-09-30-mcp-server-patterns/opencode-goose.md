# Client addendum: opencode and Goose

> Raw research-agent report, 2026-09-30, kept as evidence for [the MCP server patterns guide](../../2026-09-30-mcp-server-patterns.md). Agent output, not independently verified line by line; the guide states which claims were checked first-hand.

Addendum to the MCP client report: the opencode and Goose findings, which arrived after my hand-off, and five corrections to its trap list. These come from sub-agent source reads that I did not re-verify.

OPENCODE: two release lines ship side by side
- v1 is npm opencode-ai 1.18.33 (2026-09-28). v2 is npm @opencode/cli 2.0.20 (2026-09-29), docs at https://opencode.ai/v2/docs/mcp-servers/.
- Protocol:
  - v1 pins @modelcontextprotocol/sdk 1.29.0 plus a local patch. It always sends initialize with 2025-11-25 and cannot speak 2026-07-28. An SDK v2 upgrade was merged and reverted on 2026-07-28 (commits 921b1c6a3 and 982a9044c). Issue #41540 is open.
  - v2 pins the @modelcontextprotocol/client, core and server 2.0.0 packages. These support 2026-07-28: server/discover, MRTR and the Mcp-Method/Mcp-Name headers. The SDK also drops tools that declare an invalid x-mcp-header.
  - v2's per-server `protocol` setting defaults to `legacy`, which sends initialize. Users must set `"auto"` (probe with server/discover, fall back to legacy) or `"2026-07-28"` (pinned).
- Schema:
  - v1 (mcp/catalog.ts) forces type:object and additionalProperties:false, then applies per-provider rewrites in provider/transform.ts. structuredContent reaches the model only when `content` is empty (#38923).
  - Open v1 schema bugs: #49464 (a boolean sub-schema causes "Failed to get tools"), #47543/#46628 (Anthropic rejects root anyOf/oneOf/allOf), #50297 (nesting deeper than 10 levels).
  - v2 uses the raw schema and prefers structuredContent as the output.
  - v2 "Code Mode" is on by default: tools become tools.<server>.<tool>() unless `"codemode": false`. It also appends `?codemode=false` to remote URLs and retries once without it on a 400 or 404.
- Limits:
  - Tool names are <server>_<tool>, with any character outside [a-zA-Z0-9_-] replaced by _.
  - v1 timeouts: the docs say 5000 ms. The code uses 30 s for connect and tools/list, and 60 s for tool calls unless the server's timeout or experimental.mcp_timeout is set.
  - v2 timeouts are 30 s startup, 30 s catalog and 12 h execution.
  - v1 truncates output at 2000 lines or 50 KB and silently drops resource_link and audio. v2 shows resource_link as its URI in text.
  - Both lines follow pagination.
- Elicitation:
  - v1 advertises only roots.
  - v2 advertises form (applyDefaults) and url modes, and handles both legacy elicitation/create and the MRTR retry.
  - #51856: elicitation over Streamable HTTP hangs until the 30 s timeout.
  - Neither line supports sampling.
- Permissions:
  - Wildcard rules work, e.g. `"permission": {"myserver_*": "ask"}` in v1 and `permissions: [{action: "myserver_*", resource: "*", effect: "deny"}]` in v2. This is not documented for MCP.
  - Neither line reads annotations such as readOnlyHint.
- Auth:
  - v1 uses DCR with a fixed redirect of http://127.0.0.1:19876/mcp/oauth/callback. Config fields are clientId, clientSecret, scope, callbackPort, redirectUri. Tokens are stored in ~/.local/share/opencode/mcp-auth.json.
  - v1 sends the RFC 8707 resource parameter only when the server publishes Protected Resource Metadata. #49773: v1 never refreshes tokens.
  - v2 uses snake_case fields, an ephemeral callback port, CIMD (client_id https://opencode.ai/oauth/opencode/client.json) and a SQLite credential store.
  - Open bugs: #50036 (issuer mismatch on a trailing slash), #50510 (CIMD redirect_uris mismatch). #34733 (Keycloak) was closed as not planned. No Authentik issues found.
- Interop:
  - v1 tries Streamable HTTP, then falls back to SSE. v2 is Streamable HTTP only.
  - #49851: a GET that returns 405 appears fatal in v1.
  - list_changed is honored in both lines.
- Install:
  - v1 opencode.json: `"mcp": {name: {"type": "local", "command": [...], "environment": {}} | {"type": "remote", "url", "headers", "oauth": {...} | false}}`.
  - v1 CLI: `opencode mcp add [name] [--url U] [--header K=V] [--env K=V] [-- cmd]`, plus `mcp list`, `mcp auth`, `mcp logout`, `mcp debug`.
  - v2 nests servers: `"mcp": {"servers": {name: {..., "protocol": "auto", "codemode": false}}}`.

GOOSE: the repo moved to aaif-goose/goose and the docs to https://goose-docs.ai/docs/
- Versions: latest release v1.52.0 (2026-09-23) uses rmcp 3.2.0. main uses rmcp 3.4.1 (PR #12483).
- Protocol:
  - rmcp defines 2026-07-28 and supports server/discover, MRTR and the Mcp-Method/Mcp-Name headers.
  - agents/mcp_client.rs prefers 2026-07-28, falling back to 2025-11-25. It probes with server/discover and falls back to initialize on a legacy reply or after a 10 s timeout.
  - This has worked since v1.51: PR #12066 (2026-09-14) fixed the regressions from #11827. The fix for JSON discover rejections (#12257) is in main only.
  - Goose is the only client that speaks 2026-07-28 by default.
- Schema:
  - Unions of string consts are collapsed into enums, and trivial $defs are inlined.
  - For OpenAI it rewrites oneOf to anyOf, strips nullability and always sends strict:false.
  - For Google it sends the raw schema as parametersJsonSchema, but only when properties is non-empty.
  - outputSchema is not sent to the model, and structuredContent does not reach it.
- Limits:
  - Tool names are {extkey}__{tool}.
  - Pagination is followed. There is no tool-count limit (the docs suggest at most 50 tools).
  - The timeout defaults to 300 s.
  - Text over 200,000 characters is spilled to a temp file.
  - resource_link is dropped.
- Elicitation:
  - It advertises elicitation: {}, which means form mode only; URL mode is cancelled.
  - Desktop shows a form and the CLI a prompt, with a 5-minute timeout.
  - Headless runs cancel every elicitation.
  - MRTR works through rmcp's call_tool (confirmed in #11194).
  - Sampling was removed in main (PR #12193).
- Permissions:
  - In smart_approve mode, readOnlyHint:true is auto-approved and readOnlyHint:false asks first (permission/permission_inspector.rs). Tools without the hint go to an LLM classifier.
  - This is in the code only, not documented.
- Auth:
  - Remote servers must use streamable_http; SSE is rejected.
  - Headers support $VAR substitution.
  - OAuth tries a pre-registered client_id first, then CIMD (https://goose-docs.ai/oauth/client-metadata.json), then DCR.
  - Redirect is http://127.0.0.1:<ephemeral>/oauth_callback. Pin the port with GOOSE_OAUTH_CALLBACK_PORT.
  - It sends RFC 8707 resource and handles scope step-up.
  - #11582: rmcp rejects authorization-server metadata on private, CGNAT or loopback IP literals. This breaks a Keycloak addressed by IP; a DNS name passes.
  - #12016: a refresh failure wipes stored credentials. #11158: query parameters in the URL break OAuth.
- Interop:
  - Sends Accept: text/event-stream, application/json.
  - A 405 on GET or DELETE is tolerated.
  - list_changed is honored.
  - main no longer follows redirects (PR #11501), so a /mcp to /mcp/ redirect will break.
- Install:
  - ~/.config/goose/config.yaml: `extensions: {name: {type: streamable_http, name, uri, headers, env_keys, timeout: 300, enabled: true}}`, or for stdio `{type: stdio, cmd, args, envs, timeout, enabled, bundled}`.
  - Deeplinks: `goose://extension?cmd=npx&arg=...&name=...` or `goose://extension?url=<enc>&name=...&header=K%3DV`. The cmd must be on an allowlist, and links that carry env or header values open a form instead of installing.

CORRECTIONS TO THE EARLIER TRAP LIST
1. A dual-era server (2026-07-28 plus legacy initialize) is still required. Goose v1.51+ and opencode v2 with protocol set to auto do speak 2026-07-28. Zed, Gemini CLI, Antigravity, JetBrains and opencode v1 need initialize.
2. Form elicitation works in Goose and opencode v2. URL mode works only in opencode v2.
3. Goose and opencode paginate tools/list; Gemini CLI and Zed do not, so still put every tool on the first page.
4. resource_link is dropped by Zed, Goose and opencode v1. structuredContent is invisible to the model almost everywhere, so always mirror it into text.
5. readOnlyHint auto-approves only in Goose smart_approve mode. Private-IP identity providers break in both Gemini CLI and Goose.

OAuth redirect URIs to allow in the IdP:
- opencode v1: http://127.0.0.1:19876/mcp/oauth/callback (fixed port)
- Goose: http://127.0.0.1:*/oauth_callback
- Zed: http://127.0.0.1:*/callback
- Gemini CLI: http://localhost:*/oauth/callback
- Antigravity: https://antigravity.google/oauth-callback
