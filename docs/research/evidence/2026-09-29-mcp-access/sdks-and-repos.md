# MCP repositories, SDKs and dependents

> Raw research-agent report, 2026-09-29, kept as evidence for [the MCP access dossier](../../2026-09-29-mcp-access.md). Agent output, not independently verified line by line; the dossier states which claims were checked first-hand.

MCP source repo and SDK research (as of 2026-09-29). Facts come from `gh api` against github.com, clones of go-sdk, typescript-sdk and the spec repo, pkg.go.dev, the npm registry, registry.modelcontextprotocol.io, gitea.com, codeberg.org and vendor docs.

## 1. The github.com/modelcontextprotocol org

Columns are stars / language / last push.
- servers 90,682 / TS / 2026-09-29. Reference servers live in `src/` and are now only `everything fetch filesystem git memory sequentialthinking time`. GitHub, GitLab, Postgres, Slack and others were moved to `servers-archived`.
- python-sdk 24,437 / Py / 09-29. Latest releases are v2.2.0 (2026-09-07) and v1.30.0.
- typescript-sdk 13,488 / TS / 09-29
- inspector 10,981 / TS / 09-29
- modelcontextprotocol (the spec, docs and blog) 9,337 / TS / 09-28
- registry 7,302 / Go / 09-23 (v1.8.1, 2026-08-06)
- go-sdk 5,169 / Go / 09-29
- csharp-sdk 4,554; rust-sdk 3,964; java-sdk 3,715
- ext-apps 2,880 / TS / 09-25 (v2.0.3, 2026-09-25)
- mcpb 2,121; php-sdk 1,618; swift-sdk 1,506; kotlin-sdk 1,464; quickstart-resources 1,209; ruby-sdk 921; ext-skills 710; ext-auth 164
- conformance 127 / TS / 09-28
- example-remote-server 83; financial-services-interest-group 62
- ext-tasks 50 / TS / 09-23 (v0.2.0, 2026-09-23)
- access 48; example-remote-client 27; experimental-ext-triggers-events 25; transports-wg 24; experimental-ext-interceptors 23 (C#); progressive-disclosure-wg 14; dns 12; agents-wg 12; experimental-ext-variants 10 (Go); static 9; ext-server-card 8; actions 7; experimental-ext-tool-annotations 2
- Archived: use-mcp, create-python-server, docs, servers-archived, create-typescript-server.

Where the normative schema lives, in github.com/modelcontextprotocol/modelcontextprotocol:
- `schema/<version>/schema.ts` is the source of truth. `schema.json` is generated beside it, along with `schema.mdx` and `examples/`.
- Version directories: `2024-11-05`, `2025-03-26`, `2025-06-18`, `2025-11-25`, `2026-07-28`, `draft`.
- Prose is in `docs/specification/<version>/`. The changelog is `docs/specification/2026-07-28/changelog.mdx` and deprecations are in `deprecated.mdx`.
- SEPs are markdown files in `seps/`, numbered by PR (SEP-1850).
- Extensions carry their own schema. For example, ext-tasks has `schema/2026-07-28/schema.ts|json`.

## 2. Release cadence

**Spec tags and releases:**
- 2024-10-07 (published 2024-11-06)
- 2024-11-05 (2025-01-17)
- 2025-03-26
- 2025-06-18
- 2025-11-25-RC (2025-11-15), then 2025-11-25 (2025-11-25)
- 2026-07-28-RC (2026-05-29), then **2026-07-28 GA (2026-07-28)**, which is the current version

SEP-3398 "Release Cycle Updates" (https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3398, opened 2026-09-29) proposes March and September releases, overlapping 8-month cycles and rotating release managers, with the change taking effect in March 2027. The next revision has no fixed date.

**2026-07-28 is a breaking redesign** (https://modelcontextprotocol.io/specification/2026-07-28/changelog). The major changes:
- No `initialize` handshake. Every request carries `_meta` `io.modelcontextprotocol/protocolVersion|clientCapabilities|clientInfo` (SEP-2575).
- No `Mcp-Session-Id`. Protocol-level sessions are gone (SEP-2567).
- A new required RPC, `server/discover`.
- The HTTP GET stream and resources/subscribe are replaced by a single `subscriptions/listen` POST stream.
- `ping` and `logging/setLevel` are removed.
- **SSE resumability (`Last-Event-ID`) and message redelivery are removed.**
- Tasks moved out of core into the `io.modelcontextprotocol/tasks` extension (SEP-2663). Polling uses `tasks/get` and `tasks/update`, and `tasks/list` is removed.
- Multi Round-Trip Requests (MRTR) replace server-initiated `elicitation/create`, `sampling/createMessage` and `roots/list` (SEP-2322). The server returns `resultType:"input_required"` and the client retries with `inputResponses`.
- `resultType` is required on every result.

Minor changes:
- `Mcp-Method` and `Mcp-Name` headers plus `x-mcp-header` (SEP-2243).
- `ttlMs` and `cacheScope` on list results (SEP-2549).
- JSON Schema 2020-12 is allowed for input and output schemas (SEP-2106).
- RFC 9207 `iss` validation (SEP-2468).
- Client credentials are bound to the issuer (SEP-2352).
- OTel trace context in `_meta` (SEP-414).

Deprecated: Roots, Sampling and Logging (SEP-2577); HTTP+SSE; Dynamic Client Registration, in favour of Client ID Metadata Documents (PR #2858). There is a 12-month minimum deprecation window (SEP-2596).

**Go SDK** (github.com/modelcontextprotocol/go-sdk):
- v1.0.0 was released 2025-09-30. It is stable and Tier 1 (`docs/docs/2026-07-28/sdk.mdx`).
- Releases: v1.1.0 (2025-10-30), v1.2.0 (12-22), v1.3.0 (2026-02-09), v1.4.0 (02-27), v1.4.1 (03-13), v1.5.0 (04-07), v1.6.0 (05-08), v1.6.1 (05-22), **v1.7.0 (2026-07-28, full 2026-07-28 support)**, **v1.8.0 (2026-09-14, latest)**. That is roughly one minor release a month, each preceded by `-pre.N` tags.
- go.mod declares `go 1.25.0`. Dependencies: google/jsonschema-go, golang.org/x/oauth2, golang-jwt, segmentio/encoding.
- Negotiates 2026-07-28 down to 2024-11-05.
- **2026-07-28 over HTTP is served only when `StreamableHTTPOptions.Stateless = true`.** A stateful handler negotiates clients down to 2025-11-25. In v1.8, a stateful handler answers a 2026-07-28 request with JSON-RPC `-32022`.
- `ServerOptions.SupportedProtocolVersions` narrows the versions a server offers (v1.8).
- `ServerOptions.SetCacheable` sets cache fields on results (v1.8).
- `MCPGODEBUG` escape hatches, all removed in v1.9.0.

Go SDK feature support:
- Streamable HTTP server: yes. `mcp.NewStreamableHTTPHandler(getServer func(*http.Request) *mcp.Server, *mcp.StreamableHTTPOptions)`. Options: `Stateless, JSONResponse, EventStore, SessionTimeout, CrossOriginProtection, MaxRequestBodyBytes, PropagateRequestCancellation, OnRequestSummary, StreamKeepAlive, DisableLocalhostProtection, Logger`. Other transports: `mcp.NewSSEHandler`, `mcp.StdioTransport`, `mcp.NewInMemoryTransports()`, `StreamableClientTransport`.
- Stateless mode: yes (`Stateless: true`).
- OAuth resource-server helpers: yes.
  - `auth.RequireBearerToken(verifier auth.TokenVerifier, *auth.RequireBearerTokenOptions) func(http.Handler) http.Handler`
  - `auth.TokenInfoFromContext`
  - `auth.ProtectedResourceMetadataHandler(*oauthex.ProtectedResourceMetadata)`
  - `oauthex.GetProtectedResourceMetadata`, `GetAuthServerMeta`, `RegisterClient`, `ParseWWWAuthenticate`, `MatchesResource`
  - Client side: `auth/authorization_code.go` and `auth/extauth` (client_credentials, enterprise_handler, oidc_login). The conformance `baseline.yml` still lists client-credentials, EMA, DPoP and WIF client scenarios as expected failures.
- Tasks: **no.** Issue #626 "SEP-1686 (experimental): Implement Tasks" has been open since the tasks-support PR #755 stalled in Feb 2026. On 2026-08-14 the plan was re-scoped to capability negotiation only. `mcp.Tool` has no `execution` field. There is no SEP-2663 support. ROADMAP.md lists Tasks as "Experimental".
- Elicitation: yes. `ServerSession.Elicit` for legacy peers, and MRTR `InputRequiredResult` in `mcp/mrtr.go` with a compatibility shim for legacy clients.
- Structured output / outputSchema: yes. The generic `mcp.AddTool[In, Out any](s, *mcp.Tool, mcp.ToolHandlerFor[In,Out])` infers `Tool.InputSchema` and `OutputSchema` from Go types.
- Sampling: yes, but deprecated. `ServerSession.CreateMessage` and `CreateMessageWithTools`.
- Resumability: `mcp.EventStore` and `MemoryEventStore`, legacy stateful mode only. It is removed on 2026-07-28.
- Other API: `mcp.NewServer(*mcp.Implementation, *mcp.ServerOptions)`, `(*Server).AddTool/AddPrompt/AddResource/AddResourceTemplate`, `Server.Run(ctx, transport)`, `AddReceivingMiddleware`, `AddReceivingCustomMethod`.
- Next go-sdk work: SEP-2640 skills (#1238), and #683 "StreamableClientTransport: connection poisoned by transient errors" (the most-reacted open issue).

**TypeScript SDK:**
- **v2 split packages**: `@modelcontextprotocol/server`, `client`, `core`, `server-legacy` and `codemod`, plus the middleware packages `node`, `express`, `hono` and `fastify`.
  - v2.0.0 released 2026-07-27 with full 2026-07-28 support.
  - v2.1.0 2026-09-23; **v2.2.0 2026-09-28 (latest)**.
  - `engines: node >=20`.
  - Negotiates the "modern" era (2026-07-28) and the "legacy" era (2024-10-07 to 2025-11-25) from one entry point (`docs/protocol-versions.md`). The client uses `versionNegotiation: {mode:'auto'}`.
- **v1**: `@modelcontextprotocol/sdk` 1.31.0, released 2026-09-28, on the `v1.x` branch.
  - Targets 2025-11-25.
  - Gets fixes for at least 6 months after v2, so to about 2027-01-27.
  - Ships experimental Tasks under `src/experimental/tasks` (SEP-1686 style).
- npm weekly downloads: `sdk` 64.7M, `server` 7.8M, `client` 6.1M.
- Tier 1.

TS v2 feature support:
- Streamable HTTP server: `createMcpHandler(factory)`, which serves both eras and returns a `.fetch` handler. Also `WebStandardStreamableHTTPServerTransport`, `PerRequestHTTPServerTransport`, `McpServer.registerTool`, and `legacyStatelessFallback`.
- Stateless mode: yes, native. The factory must return a fresh `McpServer` per request.
- Auth: `requireBearerAuth`, `verifyBearerToken`, `OAuthTokenVerifier`, `bearerAuthChallengeResponse`, `requireScopes`, `buildOAuthProtectedResourceMetadata`, `getOAuthProtectedResourceMetadataUrl`, `oauthMetadataResponse` (RFC 9728 / RFC 8414). Client providers: `ClientCredentialsProvider`, `PrivateKeyJwtProvider`, `CrossAppAccessProvider`, plus a DPoP API.
- Tasks: **not in v2.** ROADMAP.md says v2 "does not serve" SEP-1686. SEP-2663 is tracked in issue #2189 (open). A separate package, `@modelcontextprotocol/ext-tasks` 0.1.0, covers the requester lifecycle and 2025-11-25 receiver support.
- Elicitation and MRTR: `inputRequired`, `inputResponse`, `acceptedContent`, `createRequestStateCodec`.
- Structured output: Zod `outputSchema` and `structuredContent`, plus `fromJsonSchema`.
- Sampling: legacy only, deprecated.
- Resumability: an `EventStore` interface on the streamable transport, legacy era only.
- `server-legacy` is described as "Frozen v1 SSE transport and OAuth Authorization Server helpers… Deprecated."

## 3. Go alternatives

- **mark3labs/mcp-go**: 9,151 stars. v1.0.0 (2026-09-02) added 2026-07-28 support (PR #951), serving both eras on one endpoint and bridging MRTR. Latest is v1.1.1 (2026-09-23). The README still claims 2025-11-25. It has SEP-1686-style tasks: `mcp.WithTaskSupport`, `s.AddTaskTool`, `CreateTaskResult`. About 230 contributors, but it is effectively a single maintainer: ezynda3 has 210 commits, and 42 of about 100 commits in the last 6 months. The go-sdk README credits it as prior art. Issues #928 (SEP-2575 stateless) and #1009 are open.
- **metoro-io/mcp-golang**: 1,229 stars, last release v0.16.1 on 2026-02-25. Dormant.
- **ThinkInAIXYZ/go-mcp**: 676 stars, v0.2.29 (2026-06-29).
- **viant/mcp**: 5 stars, active.
- **strowk/foxy-contexts**, **riza-io/mcp-go**, **llmcontext/gomcp**: stale.
- pkg.go.dev "Known importers": `go-sdk/mcp` 1,443; `mcp-go/mcp` 1,880; `mcp-go/server` 1,630; `metoro-io/mcp-golang` 92.
- Comparison: go-sdk is the official Tier 1 SDK, with a Google-staffed team, conformance runs in CI, first-to-spec releases, and OAuth resource and client helpers, but no Tasks. mcp-go has comparable reach and has tasks, but relies on one maintainer.

## 4. Governance and contributor concentration

Governance:
- Anthropic donated MCP to the **Agentic AI Foundation (AAIF)**, a directed fund under the Linux Foundation, on 2025-12-09 (`blog/content/posts/2025-12-09-mcp-joins-agentic-ai-foundation.md`).
- AAIF was co-founded by Anthropic, Block and OpenAI, with support from Google, Microsoft, AWS, Cloudflare and Bloomberg. Its other founding projects are goose and AGENTS.md.
- The legal entity is "Model Context Protocol a Series of LF Projects, LLC", and contributions are Apache-2.0 (`docs/community/governance.mdx`).
- The Steering Group consists of Lead Maintainers (BDFL), Core Maintainers and Maintainers. Membership is individual, not tied to the employer.
- Lead Maintainers: David Soria Parra and Den Delimarsky, both Anthropic. Den was promoted on 2026-04-08.
- Core Maintainers:
  - Peter Alexander (Anthropic)
  - Paul Carleton (Anthropic)
  - Caitie McCaffrey (Microsoft)
  - Kurtis Van Gent (Google Cloud)
  - Clare Liguori (AWS, since 2026-04)
  - Nick Cooper (OpenAI)
- That makes 4 of the 8 lead and core seats Anthropic.
- Top spec committers: localden 958, dsp-ant 499, jspahrsummers 343, olaservo 244, jonathanhefner 236, LucaButBoring 204, CaitieM20 168.

go-sdk:
- Maintainers per `MAINTAINERS.md`: Maciej Kisiel, Yaroslav Shevchuk, Guglielmo Colombo and Jonathan Amsterdam. All four list Google as their company.
- All-time top contributors: findleyr (Rob Findley, Go team) 202, jba 180, guglielmo-san 64, maciej-kisiel 47, samthanawalla 37.
- Last 12 months: 348 commits from about 107 distinct authors. google.com plus golang.org emails account for 158; add Guglielmo's commits and Google authors are the clear majority.
- Last 6 months: Guglielmo Colombo 64 of 204 commits.
- So yes, Google effectively maintains go-sdk.

TS SDK maintainers: Inna Harper, Felix Weinberger, Olivier Chafik, Konstantin Konstantinov and Matt Carey.

## 5. Most important open SEPs and issues

- SEP-2127 MCP Server Cards, HTTP discovery via `.well-known` (in-review, by dsp-ant, 50 comments). https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127 (repo ext-server-card)
- SEP-1933 Workload Identity Federation for agent and workload identity. https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1933
- SEP-1932 DPoP profile. https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1932
- SEP-2343 says elicitation requires authorization on remote servers. https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2343
- SEP-1913 Trust and Sensitivity Annotations (51 comments). https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1913
- SEP-2145 standardizes how `tools/call` reports failures. https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2145
- SEP-2817 AI invocation audit context in `_meta`. https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2817
- SEP-2848 asynchronous approval for tool calls. https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2848
- SEP-2694 resumable task event streams. https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2694
- SEP-2598 pluggable transports (deferred). The roadmap priority is unifying stdio and HTTP into one transport. https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2598
- SEP-3371 consistent SDK extension points; SEP-3392 extension lifecycle.
- Issue #3394: retrying a lost response to a mutating `tools/call` re-executes its side effects. This is the direct cost of removing resumability. https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3394
- Issue #3213 "MCP-2026-015": the `server/discover` instructions field enables prompt injection. https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3213
- Already Final: SEP-2663 Tasks extension, SEP-1865 MCP Apps (ext-apps v2.0.3), SEP-2640 Skills extension, SEP-2133 Extensions.
- 2026-08-22 roadmap (https://modelcontextprotocol.io/development/roadmap) has five priorities: agentic messaging primitives, HTTP-native transport unification, agent identity and enterprise security (DPoP, WIF, ID-JAG), improved primitives (result variants, progressive discovery), and SDK developer experience.

## 6. Inspector and testing

- **MCP Inspector** is `@modelcontextprotocol/inspector` 2.8.0 (2026-09-23), released weekly. It has web, CLI and TUI clients. Use `npx @modelcontextprotocol/inspector --cli` for CI. v1 is on the `v1-latest` tag. On machines without a keychain it stores secrets in plaintext at `~/.mcp-inspector/secrets.json`.
- **The official conformance suite exists**: github.com/modelcontextprotocol/conformance, published on npm as `@modelcontextprotocol/conformance` (latest 0.1.16; `alpha` 0.2.0-alpha.11).
  - Server run: `npx @modelcontextprotocol/conformance server --url http://localhost:3000/mcp [--scenario X] [--spec-version 2026-07-28] [--expected-failures baseline.yml]`.
  - Suites: `all, core, extensions, backcompat, auth, metadata, draft`.
  - The Tier 1 SDK bar is a 100% pass rate (`docs/community/sdk-tiers.mdx`). SEP-2484 requires conformance tests before a SEP can be final.
- **Go e2e testing**:
  - `mcp.NewInMemoryTransports()` pairs a `Client` and `Server` in-process.
  - Alternatively, run `httptest.NewServer(mcp.NewStreamableHTTPHandler(...))` with `StreamableClientTransport`.
  - The go-sdk's own harness is `conformance/everything-server/main.go` plus `scripts/server-conformance.sh`, with `conformance/baseline.yml` for expected failures; the server side has none.
  - Its CI workflow is `.github/workflows/conformance.yml`.
- **TS e2e testing** (`docs/testing.md`): pass `createMcpHandler(createServer).fetch` as the `fetch` option of `StreamableHTTPClientTransport`, then drive a real `Client` in-process with no port. The TS SDK runs conformance against 2025-11-25 and 2026-07-28 on every push.

## 7. Real Go dependents (verified in go.mod on default branches)

**On the official go-sdk:**
- github/github-mcp-server, 33,285 stars, v1.7.0. It migrated from mcp-go in Nov 2025 (PRs #1475 and #1479). v1.7.0-pre.3 served over 500k users per the go-sdk v1.7.0 notes.
- golang/tools gopls, v1.8.0
- containers/kubernetes-mcp-server, v1.8.0
- github/gh-aw, v1.8.0
- docker/mcp-gateway, v1.4.1
- mcp-proxy/mcp-proxy, v1.8.0
- stacklok/toolhive, indirect v1.8.0
- gitea/gitea-mcp, v1.8.0
- go-vikunja/vikunja, v1.6.1
- hashicorp/terraform-mcp-server, which uses both go-sdk v1.7.0 and mcp-go v0.58.0

**On mcp-go:**
- grafana/mcp-grafana on main, at v1.1.1. Its v2 branch has migrated to go-sdk (#1180; tracking PR #1210 "Release v2.0.0" is open).
- TBXark/mcp-proxy, gravitational/teleport, hashicorp/vault-mcp-server
- goern/forgejo-mcp

googleapis/mcp-toolbox (16.5k stars) depends on neither SDK.

## 8. Reference servers for forges and trackers

- **Official reference servers** in modelcontextprotocol/servers: only `git` among forge-related ones, plus everything, fetch, filesystem, memory, sequentialthinking and time. The GitHub and GitLab reference servers are **archived**.
- **GitHub**: github/github-mcp-server v1.12.2 (2026-09-16), official, Go, go-sdk.
- **GitLab**: official remote endpoint `https://gitlab.com/api/v4/mcp`, registry name `com.gitlab/mcp`, built into gitlab-org/gitlab.
- **Gitea**: official **gitea.com/gitea/gitea-mcp**, 96 stars, v1.7.0 (2026-08-27). Go 1.27, go-sdk v1.8.0, gitea.dev/sdk.
- **Forgejo**: **no official Forgejo MCP server.** A search of Forgejo issues for "mcp" found nothing relevant.
  - The main community server is goern/forgejo-mcp (131 stars on Codeberg), which has moved to https://git.b4mad.industries/agentic-forges/forgejo-mcp (v3.2.0, 2026-09-16). Go 1.26 on mcp-go v1.1.1. It moved because of Codeberg's anti-LLM policy (https://blog.codeberg.org/protecting-our-floss-commons-from-llms.html).
  - Also: brechanbech/forgejo-mcp-rs (Rust, in the registry) and werebear73/gitea-mcp, which also covers Forgejo.
- **Vikunja**: **built-in, official** MCP endpoint `/api/v2/mcp`.
  - Merged 2026-09-15 in go-vikunja/vikunja PRs #3860 and #3864. It is not yet in a tagged release; the latest is v2.6.0 from 2026-08-31.
  - Stateless Streamable HTTP, POST only. It needs an API token with the `mcp:access` scope, and JWTs are rejected.
  - 24 typed tools plus `find_action`/`do_action`, derived from the v2 OpenAPI document. Built on go-sdk.
  - Issue #3930 (OAuth 2.1 / Protected Resource Metadata) is open.
  - Community alternatives: democratize-technology/vikunja-mcp (108 stars) and others.
- **ClickUp**: an **official hosted** server at `https://mcp.clickup.com/mcp`, in public beta. It accepts OAuth 2.1 with PKCE only, not API keys (developer.clickup.com). Community: taazkareem/clickup-mcp-server and hauptsacheNet/clickup-mcp.
- **LiteLLM** (BerriAI/litellm v1.103.0, 2026-09-28) has an MCP Gateway at `/mcp/`, `/mcp/<alias>` and `/mcp-rest/tools/{list,call}`.
  - Upstream transports: Streamable HTTP, SSE and stdio.
  - Access control per key, team or access group (`x-mcp-servers`), with per-server credential headers `x-mcp-<alias>-<header>`.
  - Upstream auth: api_key, bearer, basic, OAuth2 client_credentials, OAuth passthrough, OBO, ID-JAG (Okta), AWS SigV4 and JWT-signer "zero trust".
  - Also: semantic tool filter, tool search, MCP cost tracking, MCP guardrails, toolsets, tool policies, and MCP from OpenAPI specs (https://docs.litellm.ai/docs/mcp).
- **OpenHands** is an MCP client. It supports SHTTP (Streamable HTTP, recommended), SSE and STDIO servers via `mcp_config`, with OAuth through FastMCP (browser flow and stored tokens). Docs were updated 2026-09-27: https://docs.openhands.dev/openhands/usage/settings/mcp-settings. I did not verify whether OpenHands exposes an MCP server itself.

## What this means for Glide

- A Go server beside Ploeg on go-sdk v1.8.0 is supported, and go-sdk's `go 1.25` requirement fits Ploeg.
- **Serving 2026-07-28 requires `Stateless: true`**. That matches the stateless net/http model with a Postgres backing store.
- Removing resumability means mutating tools must be idempotent (see issue #3394).
- Async Runs cannot use SEP-2663 Tasks in go-sdk today. The options are to model them as handles returned by tools, or to use mcp-go's older SEP-1686 tasks.
- `auth.RequireBearerToken` and `auth.ProtectedResourceMetadataHandler` cover the resource-server side of OAuth.
- For TypeScript, use v2 `@modelcontextprotocol/server` with `createMcpHandler`, not the `sdk` 1.x line.

Scratch clones of go-sdk, typescript-sdk and the spec repo are in <scratch>
