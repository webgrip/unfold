# MCP specification crawl

> Raw research-agent report, 2026-09-29, kept as evidence for [the MCP access dossier](../../2026-09-29-mcp-access.md). Agent output, not independently verified line by line; the dossier states which claims were checked first-hand.

MCP SPEC CRAWL: state as of 2026-09-29
Sources: a shallow clone of github.com/modelcontextprotocol/modelcontextprotocol (HEAD 046fa30, committed 2026-09-28), plus live checks of modelcontextprotocol.io, registry.modelcontextprotocol.io and `gh`. MIO means https://modelcontextprotocol.io. BLOG means https://blog.modelcontextprotocol.io/posts. REPO means github.com/modelcontextprotocol/modelcontextprotocol/blob/main.

## 1. Versions
- **Current version: `2026-07-28`, released 2026-07-28.**
  - The blog post "The 2026-07-28 Specification" is dated 2026-07-28T09:00Z (BLOG/2026-07-28/). The git tag `2026-07-28` is on a commit dated Jul 28 2026.
  - A release candidate was announced 2026-05-21 (BLOG/2026-07-28-release-candidate/; tag `2026-07-28-RC`).
  - Live, `curl -I MIO/specification/latest` returns 307 to `/specification/2026-07-28`.
  - `schema.ts` has `LATEST_PROTOCOL_VERSION = "2026-07-28"`.
- **Prior versions:** `2025-11-25` (tag commit Nov 25 2025), `2025-06-18`, `2025-03-26`, `2024-11-05`. There is also a `draft`. The draft changelog currently says only "Changes since the most recent release will accumulate here." (MIO/specification/draft/changelog)
- **Next version: no date and no version string announced anywhere.**
  - The roadmap (MIO/development/roadmap, "Last updated: 2026-08-22") covers the "coming six to twelve months".
  - It adds: "This roadmap reflects current thinking rather than firm commitments."
- **Versioning statements** (MIO/docs/2026-07-28/learn/versioning), verbatim:
  - "string-based version identifiers following the format `YYYY-MM-DD`, to indicate the last date backwards incompatible changes were made."
  - "The protocol version will _not_ be incremented when the protocol is updated, as long as the changes maintain backwards compatibility."
  - Revisions are Draft, Current ("ready for use and may continue to receive backwards compatible changes"), or Final ("will not be changed").
- **Feature lifecycle policy (SEP-2596, MIO/community/feature-lifecycle):**
  - Feature states are Active, Deprecated and Removed.
  - The deprecation window is a minimum of 12 months ("or at least ninety days under the policy's expedited-removal exception").
  - Registry of deprecated features: MIO/specification/2026-07-28/deprecated. Roots, Sampling, Logging and DCR all show "First revision released on or after 2027-07-28".
- **2026-07-28 changelog** (MIO/specification/2026-07-28/changelog). This release breaks compatibility heavily.
  - SEP-2567: protocol-level sessions and `Mcp-Session-Id` removed.
  - SEP-2575: `initialize`/`notifications/initialized` removed. Every request carries `_meta` `io.modelcontextprotocol/protocolVersion` and `io.modelcontextprotocol/clientCapabilities` (both required), plus `io.modelcontextprotocol/clientInfo` (SHOULD). Results carry `io.modelcontextprotocol/serverInfo`. Version mismatch returns `UnsupportedProtocolVersionError` (-32022).
  - New `server/discover`, which servers MUST implement.
  - The HTTP GET stream, `resources/subscribe` and `resources/unsubscribe` are replaced by `subscriptions/listen`.
  - `ping`, `logging/setLevel` and `notifications/roots/list_changed` are removed.
  - Tasks moved out of core into the extension `io.modelcontextprotocol/tasks` (SEP-2663).
  - The MRTR pattern (SEP-2322) replaces server-initiated requests.
  - Required `resultType` on every result.
  - SSE resumability and `Last-Event-ID` removed.
  - Minor changes:
    - `extensions` capability field.
    - OpenTelemetry `traceparent`/`tracestate`/`baggage` in `_meta` (SEP-414).
    - Deterministic `tools/list` order.
    - `Mcp-Method`, `Mcp-Name` and `x-mcp-header` → `Mcp-Param-{Name}` (SEP-2243).
    - `ttlMs` and `cacheScope` required on list/read results (SEP-2549).
    - Resource-not-found changed from -32002 to -32602.
    - RFC 9207 `iss` validation (SEP-2468).
    - DCR `application_type` (SEP-837).
    - Issuer-bound client credentials (SEP-2352).
    - Full JSON Schema 2020-12 in input/outputSchema (SEP-2106).
    - `notifications/elicitation/complete` and `elicitationId` removed.
    - Error-code allocation: -32000..-32019 are implementation-defined; -32020..-32099 are reserved for MCP.
  - Deprecated: Roots, Sampling and Logging (SEP-2577); HTTP+SSE; `includeContext` "thisServer"/"allServers"; Dynamic Client Registration (PR #2858).
- **2025-11-25 changelog** (MIO/specification/2025-11-25/changelog):
  - OIDC Discovery; icons (SEP-973); incremental scope via `WWW-Authenticate` (SEP-835); tool-name guidance (SEP-986); enum schema rework (SEP-1330).
  - URL-mode elicitation (SEP-1036); sampling with `tools`/`toolChoice` (SEP-1577); CIMD (SEP-991); experimental tasks (SEP-1686).
  - Input-validation errors are returned as tool errors (SEP-1303); SSE polling (SEP-1699); RFC 9728 alignment (SEP-985); JSON Schema 2020-12 as the default dialect (SEP-1613); governance SEPs.
- **2025-06-18 changelog:**
  - JSON-RPC batching removed; structured tool output; MCP servers classified as OAuth resource servers; RFC 8707 required.
  - Elicitation; resource links; `MCP-Protocol-Version` header; `_meta` on more types; `title` fields; completion `context`.

## 2. Core abstractions in 2026-07-28 (spelling from REPO/schema/2026-07-28/schema.ts)

**Participants and base protocol**
- Participants: Host, Client, Server.
- MIO/specification/2026-07-28/basic/patterns: "Servers **MUST NOT** initiate JSON-RPC requests, and clients do not send JSON-RPC responses."
- `ResultType = "complete" | "input_required" | string`. Tasks adds `"task"`.
- Statelessness: "State that needs to span multiple requests (e.g., long-running tasks, application-level handles) **MUST** be referenced by an explicit identifier the client passes on each request."

**Server features**
- **Tools:** `Tool{name, title?, description?, inputSchema (type:"object"), outputSchema?, annotations?, icons?, _meta?}`.
  - The `tools/list` set "**MUST NOT** vary per-connection … **MAY** vary by the authorization presented on the request".
- **Structured output:** `CallToolResult{content: ContentBlock[], structuredContent?: unknown, isError?}`. The server MUST conform to `outputSchema`, and SHOULD also return serialized JSON in a TextContent block.
- **ToolAnnotations** (all "hints"; "Clients should never make tool use decisions based on `ToolAnnotations` received from untrusted servers"):
  - `title`
  - `readOnlyHint` (default false)
  - `destructiveHint` (default true)
  - `idempotentHint` (default false)
  - `openWorldHint` (default true)
- **ContentBlock:** `TextContent` ("text"), `ImageContent` ("image"), `AudioContent` ("audio"), `ResourceLink` ("resource_link"), `EmbeddedResource` ("resource"). Sampling also has `tool_use` and `tool_result`.
- **Resources:** `Resource{uri, name, title?, description?, mimeType?, annotations?, size?, icons?, _meta?}`.
- **Resource templates:** `ResourceTemplate{uriTemplate (RFC 6570), …}`.
- `Annotations{audience?: Role[], priority?, lastModified?}`.
- **Prompts:** `Prompt{name, title?, description?, arguments?: PromptArgument[]}`.
- **Completions:** `completion/complete` with `ref` of type "ref/prompt" or "ref/resource".
- **Logging:** Deprecated. Uses `notifications/message` and `LoggingLevel` debug…emergency, and is opted in per request via `_meta` `io.modelcontextprotocol/logLevel`.
- **Caching:** `CacheableResult{ttlMs, cacheScope: "public"|"private"}`.

**Client features**
- **Sampling:** `sampling/createMessage`. Deprecated. `modelPreferences` includes `costPriority`.
- **Roots:** `roots/list`. Deprecated.
- **Elicitation:** `elicitation/create`, with capability `elicitation: {form?, url?}`.
  - Form mode takes `requestedSchema` (flat primitives only).
  - URL mode (`mode:"url"`, `message`, `url`) is marked "introduced in the `2025-11-25` version … may change in future protocol revisions".
  - Result: `action: "accept"|"decline"|"cancel"`, `content?`.
- **In 2026-07-28 all three client features are delivered only as MRTR `inputRequests`** (a union of CreateMessageRequest, ListRootsRequest and ElicitRequest). They are never standalone server→client requests.

**Utilities and patterns**
- **Progress:** `_meta.progressToken` → `notifications/progress{progressToken, progress, total?, message?}`.
- **Cancellation:** `notifications/cancelled{requestId, reason?}` on stdio only. On Streamable HTTP, "Closing the SSE response stream **MUST** be treated by the server as cancellation".
- **Pagination:** `cursor` / `nextCursor`.
- **Subscriptions:** `subscriptions/listen{notifications: SubscriptionFilter{toolsListChanged?, promptsListChanged?, resourcesListChanged?, resourceSubscriptions?: string[]}}`, answered by `notifications/subscriptions/acknowledged`.
- **ping: removed.**

**MRTR** (MIO/specification/2026-07-28/basic/patterns/mrtr)
- The server returns `InputRequiredResult{resultType:"input_required", inputRequests?, requestState?}`. The client retries with a new JSON-RPC id plus `inputResponses` and the echoed `requestState`.
- Allowed only on `tools/call`, `resources/read` and `prompts/get`.
- On `requestState`, servers "**MUST** treat `requestState` as an attacker-controlled input … **MUST** protect its integrity (e.g. HMAC or AEAD)". They SHOULD bind it to the principal, a TTL and a request digest.

**Metadata fields**
- Icons: `Icon{src, mimeType?, sizes?, theme?: "light"|"dark"}`.
- `title`: `BaseMetadata{name, title?}`. Tool display precedence is `title`, then `annotations.title`, then `name`.
- `_meta` key rules: an optional reverse-DNS prefix plus `/`. A prefix whose second label is `modelcontextprotocol` or `mcp` is reserved.
- `Implementation{name, version, title?, description?, websiteUrl?, icons?}`.

**Tasks (extension, not core)**
- Identifier `io.modelcontextprotocol/tasks`. SEP-2663 is Final, Extensions Track (MIO/seps/2663-tasks-extension, MIO/extensions/tasks/overview, github.com/modelcontextprotocol/ext-tasks).
- Supported methods: **only `tools/call`**.
- Server-directed: "The server is the sole decider; clients do not signal task preference on the request itself." It MUST NOT return a task unless the client declared the extension on that request.
- `CreateTaskResult` has `resultType:"task"` and `Task{taskId, status, statusMessage?, createdAt, lastUpdatedAt, ttlMs: number|null, pollIntervalMs?}`.
- **Status enum:** `"working" | "input_required" | "completed" | "cancelled" | "failed"`.
  - `completed` "includes tool calls that returned results with `isError: true`". In 2025-11-25, `failed` covered isError instead.
  - `failed` is for JSON-RPC errors only.
- Methods:
  - `tasks/get`: an idempotent read returning a DetailedTask with `result`, `error` or `inputRequests`.
  - `tasks/update{taskId, inputResponses}`: returns an empty ack, eventually consistent.
  - `tasks/cancel{taskId}`: returns an empty ack. It is cooperative, and "Eventual transition to `cancelled` is not guaranteed". `notifications/cancelled` MUST NOT be used for tasks.
- Push: `notifications/tasks`, subscribed via `subscriptions/listen` `notifications.taskIds`. "Polling is the default."
- Durability: "A server **MUST NOT** return `CreateTaskResult` until the task is durably created."
- TTL: servers "MAY mark a task as `failed` at any point after the TTL elapses, and subsequently delete it".
- Clients "SHOULD persist task IDs to durable storage".
- On HTTP, `Mcp-Name` = taskId, for routing.
- `notifications/progress` and `notifications/message` are "not supported on tasks in general".
- Security:
  - Servers "**MUST** perform authentication and authorization checks on each task-related request".
  - Task IDs need sufficient entropy.
  - "Because there is no `tasks/list`, a server cannot inadvertently leak the existence of one caller's tasks to another."
  - "A task is not a higher-trust channel."
- **Not wire-compatible with the 2025-11-25 experimental tasks.** Those had `tasks/get`, `tasks/result`, `tasks/list`, `tasks/cancel`, `notifications/tasks/status`, and the `task` param on CallToolRequest.
- SEP-2663 references a protocol version "`2026-06-30`". That is a stale name inside the SEP; the release shipped as 2026-07-28.
- **The client matrix (MIO/extensions/client-matrix) lists no client supporting Tasks.** Tasks has no column at all. Claude Code is not listed for any extension.

## 3. JSON-RPC method inventory (2026-07-28)
**Client→server requests** (the server implements them):
- `server/discover`: server MUST implement it; clients MAY call it.
- `tools/list`, `tools/call`: required if the `tools` capability is declared.
- `resources/list`, `resources/templates/list`, `resources/read`: required if `resources` is declared.
- `prompts/list`, `prompts/get`: required if `prompts` is declared.
- `completion/complete`: required if `completions` is declared.
- `subscriptions/listen`: optional (a server may acknowledge a subset).

**Server-issued requests** (carried only inside `InputRequiredResult.inputRequests`, fulfilled by the client):
- `elicitation/create`: client capability `elicitation`.
- `sampling/createMessage`: deprecated.
- `roots/list`: deprecated.

**Notifications:**
- Client→server: `notifications/cancelled` (stdio). The server also uses it on stdio, only to end a listen stream.
- Server→client, request-scoped: `notifications/progress`, `notifications/message` (deprecated).
- Server→client, listen-stream only: `notifications/subscriptions/acknowledged`, `notifications/tools/list_changed`, `notifications/prompts/list_changed`, `notifications/resources/list_changed`, `notifications/resources/updated`.
- Tasks extension adds `tasks/get`, `tasks/update`, `tasks/cancel` and `notifications/tasks`. The `tasks/` prefix is reserved.

**Error codes:**
- -32020 HeaderMismatch
- -32021 MissingRequiredClientCapability (`data.requiredCapabilities`)
- -32022 UnsupportedProtocolVersion (`data.supported`, `data.requested`)
- Standard JSON-RPC codes -32700/-32600/-32601/-32602/-32603
- Retired: -32002 and -32042

## 4. Transports
- **stdio** (MIO/specification/2026-07-28/basic/transports/stdio): newline-delimited messages. Legacy fallback is a probe with `server/discover`.
- **Streamable HTTP** (MIO/specification/2026-07-28/basic/transports/streamable-http):
  - Single POST endpoint. The client MUST send `Accept` with both `application/json` and `text/event-stream`. The response is either JSON or a per-request SSE stream.
  - Required headers are `MCP-Protocol-Version` (MUST match the `_meta` value, otherwise 400), `Mcp-Method` and `Mcp-Name` (for tools/call, resources/read and prompts/get), plus optional `Mcp-Param-{Name}` from `x-mcp-header`. Non-ASCII values use `=?base64?…?=`.
  - The server MUST validate `Origin` (invalid means 403).
  - SHOULD send `X-Accel-Buffering: no`.
  - "Resumable SSE streams via `Last-Event-ID` are not supported." "A broken response stream loses the in-flight request; clients **MUST** re-issue it."
  - Legacy traffic: GET/DELETE get 405; ignore `Mcp-Session-Id`; ignore `Last-Event-ID`.
  - Intermediaries "(e.g., routing or rate-limiting by tenant) **SHOULD** verify" `MCP-Protocol-Version` before trusting mirrored headers.
- **HTTP+SSE (2024-11-05): Deprecated** (SEP-2596).
- **Stateless and sessionless work is already shipped** (SEP-2575 and SEP-2567, both Final).
- Roadmap next step: "HTTP over stdio … HTTP/2 over stdio" and ETag caching (MIO/development/roadmap).

## 5. Authorization (MIO/specification/2026-07-28/basic/authorization and subpages)
**Scope and roles**
- "Authorization is **OPTIONAL**." HTTP implementations SHOULD conform. For STDIO: "**SHOULD NOT** follow this specification, and instead retrieve credentials from the environment."
- The MCP server is an OAuth 2.1 resource server, the MCP client is an OAuth 2.1 client, and the authorization server (AS) is out of scope.
- Base specs: draft-ietf-oauth-v2-1-13, RFC 6750, 8414, 7591, 8707, 9728, 9207, CIMD draft-00, OIDC Discovery, OIDC Registration.

**Discovery**
- "MCP servers **MUST** implement OAuth 2.0 Protected Resource Metadata (RFC9728)", and the PRM MUST list at least one `authorization_servers` entry.
- The resource metadata URL is advertised either in `WWW-Authenticate: Bearer resource_metadata="…"` on 401, or at a well-known path. Path form: `https://example.com/.well-known/oauth-protected-resource/public/mcp`. Root form: `https://example.com/.well-known/oauth-protected-resource`.
- The AS MUST offer RFC 8414 or OIDC Discovery; clients MUST support both.
- Probe order for an issuer with a path:
  1. `/.well-known/oauth-authorization-server/tenant1`
  2. `/.well-known/openid-configuration/tenant1`
  3. `/tenant1/.well-known/openid-configuration`
- The `issuer` in the metadata MUST equal the issuer used to build the URL.

**Registration** (MIO/…/authorization/client-registration)
- Priority order: pre-registered, then CIMD (AS metadata `client_id_metadata_document_supported: true`), then DCR (`registration_endpoint`), then prompt the user.
- CIMD: `client_id` is an https URL with a path. The document MUST contain `client_id`, `client_name` and `redirect_uris`. `private_key_jwt` is allowed.
- DCR: "Dynamic Client Registration is deprecated." Clients MUST send `application_type`.
- Credentials are keyed by issuer and must not be reused across authorization servers. CIMD IDs are portable.

**Tokens**
- RFC 8707 `resource` "**MUST** be included in both authorization requests and token requests", using the canonical server URI (e.g. `https://mcp.example.com/mcp`, no fragment, preferably no trailing slash).
- Audience: "MCP servers **MUST** validate that access tokens were issued specifically for them".
- "MCP servers **MUST NOT** accept or transit any other tokens."
- "The MCP server **MUST NOT** pass through the token it received from the MCP client."
- Token passthrough is "explicitly forbidden" (MIO/docs/2026-07-28/tutorials/security/security_best_practices#token-passthrough).
- Bearer in the header on every request; never in the query string.
- Refresh: servers SHOULD NOT put `offline_access` in challenges.

**Scopes and step-up**
- 401 carries `scope=`. Runtime insufficiency returns `403` with `WWW-Authenticate: Bearer error="insufficient_scope", scope="…", resource_metadata="…"`.
- Servers SHOULD include all required scopes in one challenge.
- Clients re-authorize with the union of scopes and retry "no more than a few times". `client_credentials` clients MAY abort.
- Servers MUST account for scope hierarchies.

**Elicitation and third-party authorization**
- URL-mode elicitation handles third-party OAuth. "MCP servers **MUST NOT** rely on URL mode elicitation to authorize users for themselves." Third-party credentials "MUST NOT transit through the MCP client".
- "Servers **MUST NOT** use form mode elicitation to request sensitive information such as passwords, API keys, access tokens, or payment credentials."

**State handles**
- "MCP servers **MUST NOT** treat possession of a state handle as authentication." Handles SHOULD be bound to `<user_id>:<handle>`.

**Extensions** (github.com/modelcontextprotocol/ext-auth)
- `io.modelcontextprotocol/oauth-client-credentials`: machine-to-machine; JWT bearer assertions (RFC 7523) recommended. Spec path is `specification/draft/`.
- `io.modelcontextprotocol/enterprise-managed-authorization`: IdP ID token, exchanged for an **ID-JAG** (Identity Assertion JWT Authorization Grant), exchanged for an MCP access token. Spec path is `specification/stable/`. BLOG/mcp-roadmap says EMA is "now stable".
- Draft SEPs: SEP-1932 DPoP and SEP-1933 Workload Identity Federation (PR labels: draft, roadmap/security).
- Roadmap: "MCP authorization assumes a person with a browser at consent time. Increasingly the caller is an agent … acting for a user who isn't present".

## 6. Discovery
**Registry**
- MIO/registry/about: "The MCP Registry is currently in preview. Breaking changes or data resets may occur before general availability." The preview launched 2025-09-08 (BLOG/2025-09-08-mcp-registry-preview).
- API is `GET /v0.1/servers`, `/v0.1/servers/{serverName}/versions[/{version}|latest]`, with cursor and `updated_since`. Live check today returned data.
- `server.json` `$schema` is `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`.
- Fields: `name` (reverse-DNS, e.g. `io.github.user/server`), `title`, `description`, `version`, `packages`, and `remotes[{type:"streamable-http"|"sse", url (templated e.g. `{tenant_id}`), headers}]`. Registry metadata lives under `_meta` `io.modelcontextprotocol.registry/official`.
- Namespace verification is via GitHub, DNS or HTTP.
- "does **not** support private servers … host your own private MCP registry". "Not designed for self-hosting". "Not intended to be directly consumed by host applications."

**Server Cards**
- SEP-2127 "MCP Server Cards - HTTP Server Discovery" is an OPEN PR labeled `in-review`, `extension`, `roadmap/transport`. Its file on the SEP branch claims Final; that is inconsistent with the PR state.
- The spec is delegated to github.com/modelcontextprotocol/experimental-ext-server-card, whose README says: "Status: Experimental … not an accepted or official MCP extension."
- Discovery: `/.well-known/ai-catalog.json` (`application/ai-catalog+json`) links to cards of type `application/mcp-server-card+json`.
- "Clients MUST NOT treat Server Card contents as authoritative for security".
- Working group: MIO/community/working-groups/server-card.
- Also open: SEP-2633 `mcp.json` client configuration format.

## 7. Extensions framework and MCP Apps
**Framework** (SEP-2133 Final; MIO/extensions/overview)
- Identifier format `{vendor-prefix}/{extension-name}`, advertised in `capabilities.extensions`. Clients advertise per request; servers advertise via `server/discover`.
- "Extensions are always disabled by default and require explicit opt-in."
- Fallback: "the supporting party **MUST** either revert to core protocol behavior or reject the request".
- A breaking change requires a new identifier (e.g. `-v2`).
- Repos are named `ext-*` (official) and `experimental-ext-*` (incubating).
- SEP-3392 "Extension Lifecycle" is in draft.
- Official extensions: `io.modelcontextprotocol/ui`, `/tasks`, `/oauth-client-credentials`, `/enterprise-managed-authorization`, `/skills` (SEP-2640).

**MCP Apps** (SEP-1865, Final, Extensions Track; spec at github.com/modelcontextprotocol/ext-apps/…/specification/2026-01-26/apps.mdx; MIO/extensions/apps/overview)
- Identifier `io.modelcontextprotocol/ui`. Client capability `{"mimeTypes":["text/html;profile=mcp-app"]}`.
- UI resources use `ui://`.
- A tool links to its UI with `_meta.ui.resourceUri` and `_meta.ui.visibility: ["model","app"]`. `"app"`-only tools are hidden from the model. The flat `_meta["ui/resourceUri"]` form is deprecated.
- Resource `_meta.ui.csp` and `_meta.ui.permissions`.
- Rendering is a sandboxed iframe speaking a postMessage JSON-RPC dialect: `ui/initialize`, `ui/open-link`, `ui/message`, `ui/request-display-mode`, `ui/update-model-context`, `ui/notifications/tool-input`, `ui/notifications/tool-result`. Apps can call `tools/call`.
- Listed use cases include "Approving expense reports, reviewing code changes".
- Client matrix shows support in Claude web, Claude Desktop, VS Code Copilot, M365 Copilot, Goose, Postman, MCPJam, ChatGPT, Cursor, Archestra, PostHog Code.

## 8. Positioning versus A2A, ACP and function calling
**Confirmed absence:** the 2026-07-28 spec, the docs, the community pages and the blog contain no statement positioning MCP against A2A, the Agent Client Protocol (Zed), or "function calling". The only hit for "Agent-to-Agent" is a SEP-1686 use-case heading.

Closest verbatim scope and anti-goal statements:
- "MCP focuses solely on the protocol for context exchange—it does not dictate how AI applications use LLMs or manage the provided context." (MIO/docs/2026-07-28/learn/architecture)
- Spec design principles (MIO/specification/2026-07-28/architecture): "Servers should be extremely easy to build"; "Servers should not be able to read the whole conversation, nor 'see into' other servers"; "Host applications handle complex orchestration responsibilities".
- MIO/community/design-principles:
  - "There should be one way to solve a problem in MCP."
  - "We don't add protocol features for use cases that can be constructed from these existing building blocks."
  - "Capability over compensation."
  - "Standardization over innovation."
- MCP describes itself as taking inspiration from LSP (spec index).

## 9. Governance
- Donated 2025-12-09 to the **Agentic AI Foundation (AAIF), "a directed fund under the Linux Foundation"**, co-founded by Anthropic, Block and OpenAI. Co-founding projects are goose and AGENTS.md. "individual projects, such as MCP, maintain full autonomy over their technical direction". (BLOG/2025-12-09-mcp-joins-agentic-ai-foundation/)
- Maintainers (REPO/MAINTAINERS.md, updated Aug 5, 2026):
  - Lead Maintainers (BDFL): David Soria Parra, Den Delimarsky.
  - Core Maintainers: Caitie McCaffrey, Clare Liguori, Kurtis Van Gent, Nick Cooper, Paul Carleton, Peter Alexander.
  - Emeritus: Justin Spahr-Summers.
- Core Maintainers meet biweekly to vote (MIO/community/governance).
- SEP process (MIO/community/sep-guidelines; SEP-1850 PR-based):
  - Statuses: draft, in-review, accepted, final, dormant, withdrawn, rejected.
  - A sponsor is required, and linked prior WG/IG discussion is required.
  - Final requires a reference implementation plus a conformance test (SEP-2484).
  - Types: Standards, Process, Informational, Extensions Track.
- Tier-1 SDKs speaking 2026-07-28: TypeScript, Python, **Go**, C#. Rust is in beta. (BLOG/2026-07-28/)

## 10. Long-running work, human-in-the-loop, approvals, multi-tenancy, rate limits, cost
**Long-running work**
- Covered by the Tasks extension (§2). The overview names "CI pipelines, batch processing, human approvals — take seconds, minutes, or longer".
- Progress is only request-scoped.
- Roadmap priority 1 is "Agentic Messaging Primitives": "work that runs for minutes, servers that push … steer work mid-flight", with the risk of "three answers to 'the server isn't done yet'". Planned: server-initiated events and webhooks (Triggers & Events WG), and moving Tasks into core.
- Open proposals:
  - SEP-2848 "Asynchronous Approval for Tool Calls" (`io.modelcontextprotocol/tool-approval`; returns a task while an out-of-band approver decides; status: proposal).
  - SEP-2694 "Resumable Task Event Streams".
  - SEP-2495 "Event-Driven Tool Invocation".

**Human-in-the-loop** (MIO/specification/2026-07-28/server/tools)
- "there **SHOULD** always be a human in the loop with the ability to deny tool invocations".
- Clients SHOULD "Prompt for user confirmation on sensitive operations".
- Elicitation (form or URL, via MRTR, or via task `input_required` + `tasks/update`) is the only protocol-level approval mechanism.

**Multi-tenancy**
- No protocol concept of tenants.
- Tool lists "MAY vary by the authorization presented on the request".
- `cacheScope:"private"` means caches "MUST NOT be shared across authorization contexts".
- PRM supports multiple `authorization_servers`. Registry `remotes` URLs can be templated with `{tenant_id}`.
- Handles and tasks must be authorization-checked on every call.

**Rate limiting**
- Servers "**MUST** … Rate limit tool invocations".
- Servers "MAY rate-limit clients polling more frequently than the recorded `pollIntervalMs`".
- Progress, logging and completion SHOULD be rate-limited.
- `Mcp-Method`, `Mcp-Name` and `Mcp-Param-*` exist so gateways can "route and meter on those headers".

**Cost, budgets, spend: none in the protocol.** The only cost-related field is the sampling `modelPreferences.costPriority` (0–1), and Sampling is deprecated. No open SEP about cost, budget or multi-tenant was found by `gh` title search ("SEP cost", "SEP multi-tenant", "SEP rate limit" all returned empty).
