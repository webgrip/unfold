# Go MCP SDK v1.8.0 source-level findings

> Raw research-agent report, 2026-09-30, kept as evidence for [the MCP server patterns guide](../../2026-09-30-mcp-server-patterns.md). Agent output, not independently verified line by line; the guide states which claims were checked first-hand.

# Go MCP SDK (github.com/modelcontextprotocol/go-sdk) at v1.8.0: source-level findings for ploeg-mcp

**Source basis.** Tag v1.8.0 = commit 3f3b699 (2026-09-04, released 2026-09-14). It is the newest release. There is no v1.8.1 and no v1.9 pre-release. The clone is at `<scratch>`. Another process re-created it as a shallow clone during the session; HEAD is still v1.8.0. `main` has 32 unreleased commits after v1.8.0, read through `gh api compare`. The SDK needs Go ≥1.25.0 and pulls in `github.com/google/jsonschema-go v0.4.3`, `golang.org/x/oauth2`, `x/time`, `segmentio/encoding` and `golang-jwt/jwt/v5` (the last one only in an example and in tests).

**Verified skeleton.** `.../scratchpad/skel/cmd/ploeg-mcp/main.go`, with tests in `main_test.go` and `shim_test.go` next to it. It compiles, passes `go vet` and passes its tests against v1.8.0 through a `replace`. The file is about 136 lines with imports and about 113 without; gofmt adds blank lines back.

---

## 1. Server construction (`mcp/server.go`)

`func NewServer(impl *Implementation, options *ServerOptions) *Server` panics on a nil `impl`, a negative PageSize, or a SubscribeHandler set without an UnsubscribeHandler (or the reverse). It always installs `serverMultiRoundTripMiddleware()` as the first, innermost receiving middleware.

`Implementation` (protocol.go:2211) has these fields: `Name`, `Title`, `Description`, `Version`, `WebsiteURL`, `Icons []Icon`. `Icon` has `Source` (json `src`), `MIMEType`, `Sizes`, `Theme`.

`ServerOptions` fields, all of them:
- `Instructions string`
- `Logger *slog.Logger` (nil means discard)
- `InitializedHandler`
- `PageSize int` (0 means `DefaultPageSize = 1000`)
- `RootsListChangedHandler` (deprecated)
- `ProgressNotificationHandler`
- `CompletionHandler func(ctx, *CompleteRequest) (*CompleteResult, error)`
- `KeepAlive time.Duration`
- `KeepAliveFailureThreshold int`
- `SubscribeHandler`, `UnsubscribeHandler`
- `Capabilities *ServerCapabilities`
- `HasPrompts`, `HasResources`, `HasTools` (all three deprecated)
- `SchemaCache *SchemaCache`
- `GetSessionID func() string` (ignored when Stateless)
- `SetCacheable func(ctx, req Request, c *Cacheable)`
- `SupportedProtocolVersions []string`

Behaviour of the important fields:

- **Capabilities.** A nil value advertises `{"logging":{}}`. Tools, prompts and resources are added automatically once features exist, with `listChanged:true`. Completions are added when CompletionHandler is set. Any non-nil sub-field overrides what would be inferred. To advertise tools with no listChanged and no logging, pass `&mcp.ServerCapabilities{Tools: &mcp.ToolCapabilities{}}`.
- **SupportedProtocolVersions.** It can only narrow the list. An unknown version panics. A new-protocol request at an excluded version gets `-32022` (`CodeUnsupportedProtocolVersion`) with `UnsupportedProtocolVersionData{Supported, Requested}`. Legacy `initialize` never rejects. The full set is 2026-07-28, 2025-11-25, 2025-06-18, 2025-03-26 and 2024-11-05 (`shared.go:50-58`).
- **SetCacheable.** It runs after the handler for `server/discover`, the four list methods and `resources/read`. Afterwards `Cacheable.normalize()` fills an empty `CacheScope` with `"public"`, and `TTLMs` stays at 0. It can run while `s.mu` is held, so calling back into the Server (AddTool, Sessions()) deadlocks.
  - **Trap for per-principal tool lists:** the default `cacheScope` is `public`. Set it to `private`.
- **KeepAlive.** It sends server-initiated pings. On a stateless transport those are rejected, so leave it at 0.

**How `server/discover` is answered** (`Server.discover`, server.go:926):
- It is automatic and cannot be customised; open issue #1092 asks for that.
- It returns `DiscoverResult{SupportedVersions, Capabilities, Instructions, Cacheable}`.
- `SupportedVersions` is the server list filtered by the transport's `SupportsProtocolVersion`. `StreamableServerTransport` reports 2026-07-28 only when `Stateless` is set (streamable.go:871).
- `serverInfo` is not a field of the result. `annotateServerInfo` stamps `_meta["io.modelcontextprotocol/serverInfo"]` on every new-protocol result.
- `server/discover` without new-protocol `_meta` gets MethodNotFound. In the other direction, `initialize`, `ping`, `logging/setLevel`, `resources/subscribe` and `resources/unsubscribe` are MethodNotFound on 2026-07-28.

---

## 2. Tools

**Signatures** (`mcp/tool.go`, `server.go:603`):
```go
type ToolHandlerFor[In, Out any] func(_ context.Context, request *CallToolRequest, input In) (result *CallToolResult, output Out, _ error)
func AddTool[In, Out any](s *Server, t *Tool, h ToolHandlerFor[In, Out])
```
`CallToolRequest = ServerRequest[*CallToolParamsRaw]` (requests.go:10). `req.Params` has `Name`, `Arguments json.RawMessage`, `InputResponses InputResponseMap`, `RequestState string` and `Meta`. `req.Extra` is a `*RequestExtra{TokenInfo *auth.TokenInfo, Header http.Header, CloseSSEStream}` and is set only by the streamable transport; it is nil over stdio. Accessors: `req.ProtocolVersion()`, `req.ClientInfo()`, `req.ClientCapabilities()` (per-request `_meta` on 2026, session state on legacy).

`Tool` (protocol.go:1895) has `Meta` (`_meta`), `Annotations *ToolAnnotations`, `Description`, `InputSchema any`, `Name`, `OutputSchema any`, `Title`, `Icons []Icon`.

`ToolAnnotations` has `DestructiveHint *bool`, `IdempotentHint bool`, `OpenWorldHint *bool`, `ReadOnlyHint bool`, `Title`. Since v1.7, `idempotentHint` and `readOnlyHint` are always serialized, even when false; `MCPGODEBUG=hintomitempty=1` restores the old behaviour until v1.9. If `destructiveHint` is not set it is omitted, which clients read as the spec default `true`.

**Tool names** are checked with `validateToolName`: 1–128 characters from `[A-Za-z0-9_.-]`. An invalid name is only logged, not rejected. A nil `InputSchema`, or one whose type is not `"object"`, panics in `Server.AddTool`. An invalid `x-mcp-header` annotation also panics.

**Schema inference.** The SDK calls `jsonschema.ForType(rt, &jsonschema.ForOptions{})` in `setSchema` (server.go:509). A pointer `In`/`Out` is dereferenced first. I checked the output by running the inference on a sample type (`scratchpad/skel/cmd/schemadump`):
- The `jsonschema:"..."` tag is used only as the **description**. A tag starting with `WORD=` is an error. There are no tag keys for enum, default, format, min or max.
- **Required:** every field without `omitempty` or `omitzero` is required.
- A struct becomes `"additionalProperties": false`. Extra arguments from the model are therefore rejected. Open issue #892 asks for this to be configurable.
- **No `$defs`/`$ref`**: nested types are inlined, and recursive types are an error ("cycle detected"; issue #749).
- `*T` becomes `"type":["null",T]`. A **slice** becomes `"type":["null","array"]` even when required. A `map[string]V` becomes an object with `additionalProperties: V`.
- `uint*` gets `minimum:0`, and `int8/16/32` get min/max bounds. `time.Time` becomes a plain `{"type":"string"}` with no `format`. `time.Duration` becomes an integer (nanoseconds). `any`/interface becomes `true`. Maps with non-string keys, funcs, channels and complex numbers are errors.
- **`json.RawMessage` / `[]byte` become an array of integers 0–255**, not a string. Never use them in In/Out.
- To add `enum`, `default` or `format`: build `s, _ := jsonschema.For[In](nil)`, change `s.Properties["x"].Enum = []any{...}`, and pass it as `Tool.InputSchema`. It is still resolved with `ValidateDefaults:true` and still enforced.
- Env `JSONSCHEMAGODEBUG=typeschemasnull=1` changes the nullable-slice behaviour.
- Use `ServerOptions.SchemaCache` (`mcp.NewSchemaCache()`) when Servers are rebuilt often. It caches by `reflect.Type` or by schema pointer, has no size bound, and assumes schemas are never mutated after registration.

**Call pipeline** (`toolForErr`, server.go:365):
1. `applySchema(args, resolved, false)` unmarshals into `map[string]any`, applies defaults and validates. A failure becomes a **tool error** (`isError:true`, text `validating "arguments": ...`), not a JSON-RPC error. This is the SEP-1303 behaviour, and I confirmed it in a test.
2. Unmarshalling into `In` fails the same way, as a tool error.
3. Handler `err`: if `err.(*jsonrpc.Error)` matches by **direct type assertion**, it is returned as a protocol error. Any other error, **including a wrapped `*jsonrpc.Error`**, goes through `CallToolResult.SetError` and becomes `isError:true` with `err.Error()` as the text. `SetError` keeps any `Content` already set. `GetError()` exposes the original error to middleware.
4. `Out` is marshalled into `StructuredContent`. If `Content` is nil, a `TextContent` holding the JSON is added. If Content is set and the output is not an object, the JSON text is appended.
5. **Output-schema validation failure** returns `fmt.Errorf("validating tool output: ...")`, which is a protocol error with **code 0** (see §6).
6. If `res.InputRequests != nil`, the output is skipped.

Other call-path behaviour:
- An unknown tool returns `&jsonrpc.Error{Code:-32602}`, which is HTTP 400 on 2026-07-28 (streamable.go:1046).
- Returning a nil `*CallToolResult` is fine.
- A result with both content and InputRequests returns `-32603 "server bug"`.

**Ordering.** `featureSet.all()` returns items sorted by name (`slices.Sorted(maps.Keys)`, features.go:99), so `tools/list` is deterministic and alphabetical. Pagination uses a cursor, an opaque token around the last name.

**Per-principal tools.** A single Server has one static tool set, and there is no per-request filtering API (`Server.SetTools` is proposal #639). You have two options:
- (a) `NewStreamableHTTPHandler(getServer func(*http.Request) *Server, ...)` returns a Server chosen by `auth.TokenInfoFromContext(r.Context())`. Cache one Server per grant set. **`getServer` is called twice per HTTP request**: once in `ServeHTTP` for the version-header check (streamable.go:340) and again in `serveStateless`. A Server can be shared safely across concurrent sessions.
- (b) Use one Server with receiving middleware that filters the `*ListToolsResult` and rejects `tools/call` for tools the principal was not granted.

Either way, set `SetCacheable` to `private`. A tool absent from a principal's Server returns `-32602 unknown tool`.

---

## 3. Transports (`mcp/streamable.go`)

```go
func NewStreamableHTTPHandler(getServer func(*http.Request) *Server, opts *StreamableHTTPOptions) *StreamableHTTPHandler
```

**`StreamableHTTPOptions` in v1.8.0** has exactly these fields:
- `Stateless bool`
- `JSONResponse bool`
- `Logger *slog.Logger`
- `EventStore EventStore`
- `SessionTimeout time.Duration`
- `DisableLocalhostProtection bool`
- `CrossOriginProtection *http.CrossOriginProtection` (deprecated)
- `MaxRequestBodyBytes int64` (0 means `DefaultMaxRequestBodyBytes = 4<<20`; a negative value means no limit; an oversized body gets 413)
- `PropagateRequestCancellation bool`

**Not in v1.8.0:** `OnRequestSummary func(context.Context, StreamableHTTPRequestSummary)` (PR #1101) and `StreamKeepAlive time.Duration` (`DefaultStreamKeepAlive = 30s`, PR #1232, only for `subscriptions/listen` streams) exist only on `main` and are unreleased.

**What `Stateless: true` does:**
- Only POST is accepted; GET and DELETE get 405 with an `Allow: POST` header.
- `Content-Type: application/json` is required (otherwise 415). `Accept` must contain both `application/json` and `text/event-stream` (otherwise 400).
- Each POST gets an ephemeral `ServerSession`, closed when the request finishes.
- No `Mcp-Session-Id` is read or set, and `ss.ID()` is `""`. `MCPGODEBUG=allowsessionsinstateless=1` restores the old behaviour until v1.9.
- For legacy requests the SDK synthesizes `InitializeParams{ProtocolVersion: header or "2025-03-26"}`, with **no client capabilities or clientInfo**, and `LogLevel "info"`.
- **Server→client requests are rejected** with `"stateless servers cannot make requests"` (Write, streamable.go:1829). Notifications sent with the request's ctx travel on that POST's SSE stream.
- **Trap:** with `JSONResponse:true`, non-response messages such as progress notifications go to the standalone stream. There is none in stateless mode, so they are lost.

**Version negotiation on one endpoint:**
- `ServeHTTP` rejects an `Mcp-Protocol-Version` header below 2026-07-28 that is not supported with a **plain-text 400** (still true in v1.8.0).
- A header ≥2026-07-28 is passed to `ServerSession.handle`. `validateRequestMeta` requires `_meta.io.modelcontextprotocol/protocolVersion`. A version outside `protocolVersions` gets `-32022` with data `{supported, requested}`, as HTTP 400.
- New-protocol requests also need the headers `Mcp-Method`, `Mcp-Name` (for tools/call, prompts/get and resources/read), and `Mcp-Protocol-Version` equal to the `_meta` version. A mismatch gets `-32020 CodeHeaderMismatch`. `validateMcpHeaders` skips these checks below 2026-07-28 (`minVersionForStandardHeaders`).
- A **stateful** handler that receives a 2026-07-28 request answers `-32022` with the legacy versions (new in v1.8, #1143; `plaintextstatefulrejection=1` restores the old plain-text 400).
- The SDK client tries `server/discover` first, falls back to `initialize` on any error, and retries on `-32022` data.
- HTTP status mapping on 2026: -32601 → 404; -32602, -32022 and -32021 → 400.
- Open #1313: a server restricted to `[2026-07-28]` still serves legacy clients that send no header or `_meta`.

**PropagateRequestCancellation** ties the handler ctx to the HTTP request ctx. It applies to 2026-07-28 requests only; `subscriptions/listen` always propagates.

**DNS-rebinding and Origin checks:**
- Localhost protection is on by default. If the local address is loopback and the `Host` is not, the server answers 403 (streamable.go:318).
- **Trap:** behind a same-pod proxy that connects over 127.0.0.1 and keeps the public Host header, every request gets 403. Set `DisableLocalhostProtection: true` in that case.
- There is **no Origin validation** by default: a nil `CrossOriginProtection` has meant none since v1.6, and the `enableoriginverification` knob was removed in v1.8. Wrap the handler in `http.NewCrossOriginProtection().Handler(h)` if browsers can reach it.

**Stdio.** `&mcp.StdioTransport{MaxLineLength: 0}` (0 means `DefaultMaxLineLength = 16 MiB`), run with `server.Run(ctx, t)`. It is stateful, so MRTR works for both protocol eras. Log to stderr only.

**MCPGODEBUG knobs still present in v1.8.0 (all removed in v1.9.0):**
- From v1.7: `customresnotfounderrcode`, `hintomitempty`, `allowsessionsinstateless`, `nomethodnotfoundcodeinerror`, `noprotocolerrorbody`, `nowrapinvalidparams`, `disablecompleteparamsvalidation`
- From v1.8: `plaintextstatefulrejection`, `blockingcancelnotify`

Removed in v1.8: `seterroroverwrite`, `enableoriginverification`, `disablecontenttypecheck`, `disablelocalhostprotection` (use the struct field). Source: `docs/mcpgodebug.md`.

---

## 4. MRTR and elicitation (`mcp/mrtr.go`, `protocol.go:40-160, 2122-2195`)

**There is no exported `InputRequiredResult` type.** You return a normal `*CallToolResult` (or `GetPromptResult` / `ReadResourceResult`) with:
```go
InputRequests InputRequestMap // map[string]InputRequest: *ElicitParams | *CreateMessageParams | *CreateMessageWithToolsParams | *ListRootsParams
RequestState  string          // "Unauthenticated servers must encrypt, sign and verify this value."
```
Leave Content, StructuredContent and Out empty. `handleMultiRoundTripResult` sets `resultType: "input_required"` for 2026 clients. On the retry, the handler reads `req.Params.InputResponses[key]`. The type is decided by which key is present (`action` gives `*ElicitResult`), so use a checked type assertion. `ElicitResult{Action, Content map[string]any}`. `ElicitParams{Mode, Message, RequestedSchema any, URL, ElicitationID}`; the mode is inferred as `form` unless URL or ElicitationID is set.

**Legacy shim.** `serverMultiRoundTripMiddleware` runs when the negotiated version is below 2026-07-28. It calls `ss.Elicit`, `CreateMessageWithTools` or `ListRoots` for each request in parallel, then **re-invokes the handler exactly once**. Two things break it:
- `ServerSession.Elicit` requires `InitializeParams.Capabilities.Elicitation` to be non-nil.
- Server-initiated requests are rejected on stateless transports.

**Result, which I verified:**
- In memory, and on stdio, the shim works for 2025-11-25.
- On **stateless HTTP, a 2025-11-25 client's call fails with a protocol error**: `multi-round-trip: fulfilling input request "c": client does not support elicitation`. The synthesized legacy state has no capabilities.
- So for the write tools you must detect this and return a tool error, or refuse legacy clients for write tools.

**What the SDK does not do for you:**
- **It does not check client capability before returning InputRequests.** Check `req.ClientCapabilities().Elicitation` yourself. `ElicitationCapabilities{Form *FormElicitationCapabilities; URL *URLElicitationCapabilities}`; both nil means form is supported. The spec error for a missing capability is `&jsonrpc.Error{Code: mcp.CodeMissingRequiredClientCapabilities (-32021), Data: json(MissingRequiredClientCapabilityData{RequiredCapabilities: ...})}`. The conformance server does this (`conformance/everything-server/main.go:606`).
- **It has no requestState codec**: no HMAC or AEAD anywhere in `mcp`, `auth` or `oauthex`. The everything-server only checks for a `"-TAMPERED"` suffix (main.go:701). You must sign or encrypt the state yourself: bind principal, tool, args hash and expiry, and use `hmac.Equal`. The conformance scenario `input-required-result-tampered-state` expects a rejection, and the reference server uses `-32602`.
- **Elicitation responses are not re-validated on the MRTR path.** `validateElicitSchema` plus `Resolve().Validate` runs only inside `ServerSession.Elicit` (legacy). Validate `InputResponses` content yourself.

**Form schema restrictions** (`client.go:923 validateElicitSchema`):
- The root must be an object, with no nested properties.
- Property types can only be `string`, `number`, `integer`, `boolean`, or `array` (multi-select).
- String formats are limited to `email`, `uri`, `date`, `date-time`.
- Enums are string-only. The legacy `enumNames` list must match `enum` in length, or use `oneOf` titled enums.
- `minLength`/`maxLength` must be ≥0 and ordered.
- Defaults are type-checked.

**Other MRTR details:**
- The client loop is capped at 10 retries, and 3 when it keeps receiving an empty `inputRequests` map (load shedding). A server shim receiving an empty map returns "the server is busy".
- `ClientOptions.MultiRoundTripOptions.Disabled` switches off the automatic client loop; check `res.NeedsInput()` instead.

---

## 5. Auth (`auth/auth.go`, `oauthex/`)

```go
type TokenInfo struct { Scopes []string; Expiration time.Time; UserID string; Extra map[string]any }
type TokenVerifier func(ctx context.Context, token string, req *http.Request) (*TokenInfo, error)
type RequireBearerTokenOptions struct { ResourceMetadataURL string; Scopes []string; AllowMissingExpiration bool; ClockSkew time.Duration }
func RequireBearerToken(verifier TokenVerifier, opts *RequireBearerTokenOptions) func(http.Handler) http.Handler
func TokenInfoFromContext(ctx context.Context) *TokenInfo
var ErrInvalidToken, ErrOAuth error
func ProtectedResourceMetadataHandler(metadata *oauthex.ProtectedResourceMetadata) http.Handler // CORS *, GET/OPTIONS only
func oauthex.MatchesResource(claims []string, resource string) bool // trailing-slash-tolerant aud match
```
`oauthex.ProtectedResourceMetadata` has `Resource`, `AuthorizationServers`, `JWKSURI`, `ScopesSupported`, `BearerMethodsSupported`, `ResourceSigningAlgValuesSupported`, `ResourceName`, `ResourceDocumentation`, `ResourcePolicyURI`, `ResourceTOSURI`, `TLSClientCertificateBoundAccessTokens`, `AuthorizationDetailsTypesSupported`, `DPOPSigningAlgValuesSupported`, `DPOPBoundAccessTokensRequired`. The handler does not validate any of them.

How `verify()` behaves:
- A missing or malformed `Bearer` header gets 401.
- An error wrapping `ErrInvalidToken` gets 401. `ErrOAuth` gets 400. **Any other error gets 500 with `err.Error()` in the body.** A nil TokenInfo also gets 500.
- `opts.Scopes` must all be present, otherwise 403 `"insufficient scope"`. This check is per endpoint, not per tool.
- A zero `Expiration` gets 401 unless `AllowMissingExpiration`. Expiry is checked with `ClockSkew`.
- On 401 or 403 it adds `WWW-Authenticate: Bearer resource_metadata="…", scope="…"`, and **only when opts is non-nil**. **It never adds `error="invalid_token"` or `error="insufficient_scope"`** (open #1134; even the SDK's own step-up client depends on that value). Error bodies are plain text.

`TokenInfo` reaches handlers as `req.Extra.TokenInfo` (streamable.go:1586), and in `getServer` through `auth.TokenInfoFromContext(r.Context())`. `UserID` is used only for the stateful session-hijack check (streamable.go:568).

**What we must implement ourselves:**
- JWT parsing, signature checks against the Authentik JWKS (fetching and caching keys), alg pinning, `iss`, `aud` (with `oauthex.MatchesResource` or exact byte comparison), `nbf`/`exp`, and mapping scopes and `sub` into TokenInfo.
- Per-tool scope checks.
- A correct RFC 6750 `error=` challenge; wrap the handler or write our own middleware.
- Serving PRM at `/.well-known/oauth-protected-resource/<path>`.

`examples/server/auth-middleware/main.go` shows a JWT verifier built on golang-jwt.

---

## 6. Middleware

```go
type MethodHandler func(ctx context.Context, method string, req Request) (Result, error)
type Middleware func(MethodHandler) MethodHandler
func (s *Server) AddReceivingMiddleware(middleware ...Middleware) // m1(m2(m3(h))); a later call wraps OUTSIDE earlier ones
func (s *Server) AddSendingMiddleware(middleware ...Middleware)
func AddReceivingCustomMethod[P, R, T](s *Server, method string, handler func(ctx, *ServerSession, P) (R, error)) error
```
- `Request` is an interface with `GetSession()`, `GetParams()` and `GetExtra()`; type-switch to `*mcp.CallToolRequest` and so on. Method names are wire names (`"tools/call"`).
  - **Trap:** `examples/server/rate-limiting` keys its limiters as `"callTool"` and `"listTools"`, which never match.
- The MRTR shim sits innermost. User middleware sees one call per legacy logical call, but **each round trip as a separate request for 2026 clients**.
- **Requests rejected in `handle()`** (bad `_meta`, -32022, removed methods) never reach middleware. `OnRequestSummary` on main is meant to cover them.
- **Error codes:** a plain `error` from middleware or a handler becomes a wire error with **`"code":0`** (`internal/jsonrpc2/messages.go:129 toWireError`). Always return a `*jsonrpc.Error` (`jsonrpc.CodeInternalError`, `CodeInvalidParams`, …).
- **There is no panic recovery anywhere.** A grep for `recover()` finds nothing in `mcp`, `internal` or `jsonrpc`. Handlers run in a bare `go func()` (`internal/jsonrpc2/conn.go:684`), so a panic kills the process. Issue #958 was closed without adding recovery. Add a recover middleware as the outermost layer; it runs on the handler goroutine, so it works.
- **Tracing (SEP-414):** the SDK does nothing (#934 closed as "no SDK work"). Read `req.GetParams().GetMeta()["traceparent"]` and `["tracestate"]` yourself, or use `otelhttp` on the HTTP header, and start the span in receiving middleware.
- **Metrics and logging:** time `next(...)`. For tool errors, check `res.(*mcp.CallToolResult).IsError` and `GetError()`.
- **Rate limiting:** key on `req.GetExtra().TokenInfo.UserID`. `Session.ID()` is `""` when stateless, and `Extra` is nil on stdio. Use `golang.org/x/time/rate`, which is already a dependency.
- On main, `HasParams` (#1269) lets middleware see whether params were present.

---

## 7. Brief: progress, cancellation, subscriptions, resources, prompts, completion

- **Progress:** read `req.Params.GetProgressToken()`, then call `req.Session.NotifyProgress(ctx, &mcp.ProgressNotificationParams{ProgressToken, Progress, Total, Message})`. Pass the handler's ctx so the notification goes on that POST's stream.
- **Cancellation:** the handler ctx is cancelled by `notifications/cancelled` (the reason is only plumbed on main, #1255) or, when `PropagateRequestCancellation` is on, by the HTTP disconnect. In v1.8 the client-side cancel notification is asynchronous (`blockingcancelnotify=1` restores the old wait). Open #1259 and #1235: a response is still written after cancellation.
- **Subscriptions:** `subscriptions/listen` is served automatically. `allowedSubscriptions` grants only what the capabilities advertise: `ListChanged` for tools, prompts and resources, and `Subscribe` for resources. List-changed notifications go only to sessions on the **same `*Server` object in the same process**. A static toolset with `ToolCapabilities{}` means listen acknowledges nothing, which is fine for us. Changes are debounced by 10 ms (`notificationDelay`).
- **Resources and prompts:** `AddResource(*Resource, ResourceHandler)`, `AddResourceTemplate(*ResourceTemplate, ResourceHandler)`, `AddPrompt(*Prompt, PromptHandler)`, and `Remove*`. `ResourceNotFoundError(uri)` is -32602. `readResource` fills in missing `URI` and `MIMEType`.
- **Completion:** `ServerOptions.CompletionHandler`. The SDK validates `ref` and `argument.name`.
- **Logging:** `ServerSession.Log` is deprecated in 2026; log to stderr or OTel.

---

## 8. Testing

**In-memory, verified:**
```go
ct, st := mcp.NewInMemoryTransports()
_, _ = srv.Connect(ctx, st, nil)
cs, _ := mcp.NewClient(&mcp.Implementation{Name:"t",Version:"0"}, &mcp.ClientOptions{
    ElicitationHandler: func(context.Context, *mcp.ElicitRequest) (*mcp.ElicitResult, error) {
        return &mcp.ElicitResult{Action:"accept", Content: map[string]any{"confirm": true}}, nil }}).
    Connect(ctx, ct, &mcp.ClientSessionOptions{ProtocolVersion: "2025-11-25"}) // "" = 2026-07-28
res, err := cs.CallTool(ctx, &mcp.CallToolParams{Name: "cancel_shift", Arguments: map[string]any{"shiftId":"s1"}})
lt, _ := cs.ListTools(ctx, nil) // or iterate cs.Tools(ctx, nil)
```
Setting `ClientOptions.ElicitationHandler` makes the client advertise the elicitation capability. `cs.InitializeResult().ProtocolVersion` shows the negotiated version.

**HTTP:** `httptest.NewServer(auth.RequireBearerToken(v, nil)(mcp.NewStreamableHTTPHandler(getServer, &mcp.StreamableHTTPOptions{Stateless:true})))` plus `&mcp.StreamableClientTransport{Endpoint: srv.URL, HTTPClient: hcWithBearerRoundTripper}`. Other `StreamableClientTransport` fields: `MaxRetries`, `DisableStandaloneSSE`, `OAuthHandler`, `MaxEventSize`. Both protocol eras are covered in `scratchpad/skel/cmd/ploeg-mcp/*_test.go`.

**In-repo harness:**
- `mcp/conformance_test.go` (`TestServerConformance`, package-internal) replays txtar golden JSON-RPC files from `mcp/testdata/conformance/server/*.txtar`. Copy the pattern; it cannot be imported.
- `conformance/everything-server/main.go` takes flags `-http=addr` (empty means stdio) and `-stateless` (default true) and serves the fixture tools at `/mcp`.
- `scripts/server-conformance.sh` is stale: it pins `-stateless=false` and `--spec-version 2025-11-25` against `@latest`.
- The real CI is `.github/workflows/conformance.yml` with `CONFORMANCE_VERSION: "0.2.0-alpha.11"`. It runs `npx -y @modelcontextprotocol/conformance@0.2.0-alpha.11 server --url http://localhost:3001/mcp --requirements 2026-07-28 --expected-failures ./conformance/baseline.yml`, plus a stateful leg with `--requirements 2025-11-25`.
- npm dist-tags: `latest` is 0.1.16 and `alpha` is 0.2.0-alpha.11. Use the alpha; only it has `--requirements`.
- `baseline.yml` lists only client auth expected failures, so the server side has zero expected failures.

**Running it against ploeg-mcp:** most of the 37 server scenarios required for 2026-07-28 call fixture tools such as `test_simple_text` and the `input-required-result-*` family. Options:
- Run `--scenario server-stateless`, `--scenario tools-list`, `--scenario dns-rebinding-protection` and `--scenario caching` individually (list them with `npx … list --server --requirements 2026-07-28`).
- Keep our own `--expected-failures` YAML.
- Build a test binary that also registers the fixture tools.

Auth must be disabled or stubbed for these runs. Other CLI commands: `authorization` (for the authorization-server side) and `tier-check`.

---

## 9. Traps and issues

**Traps found in the source** (details in the sections above):
- Plain errors become code 0.
- A wrapped `*jsonrpc.Error` becomes isError.
- Output-schema failure is a code-0 protocol error.
- No panic recovery.
- `getServer` is called twice per request.
- `cacheScope` defaults to `public`.
- The MRTR shim fails for legacy clients over stateless HTTP.
- The SDK neither checks elicitation capability on the MRTR path nor provides a state codec.
- `JSONResponse` drops progress notifications in stateless mode.
- Localhost protection breaks proxies that connect over 127.0.0.1.
- There is no Origin check by default.
- Hint fields are always serialized.
- `json.RawMessage` in schemas becomes an array.
- `time.Time` has no format.
- Slices are nullable.
- `additionalProperties:false`.
- No `$ref`, and cycles fail.
- `KeepAlive` breaks in stateless mode.
- Stateless session bookkeeping logs at Info per request if you pass a Logger (#1204).
- The HTTP server `WriteTimeout` kills long SSE responses (#1262); a POST writes no headers until the tool finishes (#1155).
- **Keep root input schemas free of `anyOf`/`oneOf`/`allOf`**: the Claude API rejects the whole tool list (github-mcp-server#3126, and go-sdk #1188 on dual-era schemas).

**Open issues:**

| # | Summary |
|---|---|
| #1313 | A 2026-only server still serves legacy clients |
| #1310 | Numbers in schemas and `_meta` lose precision |
| #1201 | Typed args lose int64 values above 2^53 |
| #1262 | WriteTimeout kills SSE |
| #1259 / #1235 | A cancelled request is still answered |
| #1258 | The declared version, not the negotiated one, decides what is served |
| #1257 | Index of nine audit findings |
| #1204 | Info-level log spam in stateless mode |
| #1188 | Modern schemas are served to legacy clients |
| #1155 | Long calls look dead |
| #1134 | No RFC 6750 `error=` |
| #1092 | Discover is not customisable |
| #1061 | Stdio drops responses on stdin EOF |
| #1209 | A malformed frame ends the stdio session |
| #892 | `additionalProperties` not configurable |
| #749 | Schema cycles |
| #691 | Nil pointers with a user output schema (v2) |
| #639 | `SetTools` proposal |
| #218 | ErrorHandler proposal |

**Closed but relevant:**

| # | Summary |
|---|---|
| #1276 | v1.8.0 import primes `ProxyFromEnvironment` at init (oauthex `defaultDiscoveryTransport`), so `HTTPS_PROXY` set later is ignored. Fixed on main (#1278), **not released** |
| #1236 / #1239 | structuredContent precision; fix is post-1.8.0 |
| #1073 | Stateless Read goroutine leak |
| #1093 | Aborted POST did not cancel → `PropagateRequestCancellation` |
| #958 | Panic recovery; closed, not implemented |
| #934 | SEP-414; no SDK work |
| #1062 / #1043 | Elicit and null-id panics, fixed |
| #1137 / #1158 / #1166 | Session leaks and deadlocks, fixed in v1.8 |

**Breaking changes v1.6 → v1.8:**
- v1.6: `SetError` keeps existing Content; no default cross-origin protection.
- v1.7: hints always serialized; ResourceNotFound changed to -32602; stateless ignores session IDs and DELETE returns 405; stdio includes -32601; decode failures become -32602; 2026-07-28 accepted only when Stateless; roots, sampling and logging deprecated; server-initiated requests blocked on 2026 sessions.
- v1.8: Content-Type check mandatory; the localhost-protection knob exists only as a struct field; a stateful handler returns -32022 JSON for 2026 requests; cancel notification is asynchronous; `SupportedProtocolVersions` added; body, SSE and stdio size limits added.

**Downstream reports:**
- github-mcp-server#3311 (open): `-32020` "missing Mcp-Param-owner" for 2025-11-25 clients since v1.12.0. The go-sdk check is version-gated on the `Mcp-Protocol-Version` header (`streamable_headers.go:359`), so avoid `x-mcp-header` unless needed.
- github-mcp-server#3327: CORS `*` with no CrossOriginProtection.
- **Nothing found for gitea-mcp**; it lives on gitea.com, which gh cannot search.
- **Nothing found for a Vikunja MCP that uses go-sdk**; the search returned only unrelated third-party repos.

---

## 10. Skeleton

The full file is at `.../scratchpad/skel/cmd/ploeg-mcp/main.go`, compiled against v1.8.0. These are the key excerpts.

```go
func cancelShift(ctx context.Context, req *mcp.CallToolRequest, in CancelShiftIn) (*mcp.CallToolResult, CancelShiftOut, error) {
	if st := req.Params.RequestState; st != "" {
		if !hmac.Equal([]byte(st), []byte(sign(in.ShiftID))) {
			return nil, CancelShiftOut{}, &jsonrpc.Error{Code: jsonrpc.CodeInvalidParams, Message: "invalid requestState"}
		}
		r, ok := req.Params.InputResponses["confirm"].(*mcp.ElicitResult)
		if !ok || r.Action != "accept" || r.Content["confirm"] != true {
			return nil, CancelShiftOut{}, errors.New("not confirmed; nothing changed")
		}
		return nil, CancelShiftOut{ShiftID: in.ShiftID, Canceled: true}, nil
	}
	if c := req.ClientCapabilities(); c == nil || c.Elicitation == nil {
		return nil, CancelShiftOut{}, errors.New("this tool needs a client that supports elicitation")
	}
	schema := &jsonschema.Schema{Type: "object", Required: []string{"confirm"},
		Properties: map[string]*jsonschema.Schema{"confirm": {Type: "boolean"}}}
	return &mcp.CallToolResult{
		InputRequests: mcp.InputRequestMap{"confirm": &mcp.ElicitParams{Message: fmt.Sprintf("Cancel Shift %s?", in.ShiftID), RequestedSchema: schema}},
		RequestState:  sign(in.ShiftID),
	}, CancelShiftOut{}, nil
}

func middleware(next mcp.MethodHandler) mcp.MethodHandler {
	return func(ctx context.Context, method string, req mcp.Request) (res mcp.Result, err error) {
		defer func() {
			if p := recover(); p != nil {
				log.Error("panic", "method", method, "panic", p, "stack", string(debug.Stack()))
				res, err = nil, &jsonrpc.Error{Code: jsonrpc.CodeInternalError, Message: "internal error"}
			}
		}()
		principal := "stdio"
		if ex := req.GetExtra(); ex != nil && ex.TokenInfo != nil {
			principal = ex.TokenInfo.UserID
		}
		res, err = next(ctx, method, req)
		log.Info("mcp", "method", method, "principal", principal, "err", err)
		return res, err
	}
}

func serverFor(grants ...string) *mcp.Server { // cached per sorted grant key in a sync.Map
	s := mcp.NewServer(&mcp.Implementation{Name: "ploeg-mcp", Version: "0.1.0"}, &mcp.ServerOptions{
		Instructions: "Read and steer Ploeg Work Items and Shifts.",
		Capabilities: &mcp.ServerCapabilities{Tools: &mcp.ToolCapabilities{}},
		SchemaCache:  schemas,
		SetCacheable: func(_ context.Context, _ mcp.Request, c *mcp.Cacheable) { c.CacheScope = "private" },
	})
	s.AddReceivingMiddleware(middleware)
	if slices.Contains(grants, "read") {
		mcp.AddTool(s, &mcp.Tool{Name: "get_work_item", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true}}, getWorkItem)
	}
	if slices.Contains(grants, "write") {
		mcp.AddTool(s, &mcp.Tool{Name: "cancel_shift", Annotations: &mcp.ToolAnnotations{DestructiveHint: &yes}}, cancelShift)
	}
	/* LoadOrStore */ return s
}

// main: stdio
serverFor("read", "write").Run(context.Background(), &mcp.StdioTransport{})
// main: HTTP
h := mcp.NewStreamableHTTPHandler(func(r *http.Request) *mcp.Server {
	if ti := auth.TokenInfoFromContext(r.Context()); ti != nil { return serverFor(ti.Scopes...) }
	return nil // 400
}, &mcp.StreamableHTTPOptions{Stateless: true, PropagateRequestCancellation: true, Logger: log})
mux.Handle("/.well-known/oauth-protected-resource/mcp", auth.ProtectedResourceMetadataHandler(&oauthex.ProtectedResourceMetadata{
	Resource: resource, AuthorizationServers: []string{issuer}, ScopesSupported: []string{"read", "write"}}))
mux.Handle("/mcp", auth.RequireBearerToken(verify, &auth.RequireBearerTokenOptions{ResourceMetadataURL: prm})(h))
```

**Results of the tests next to it:**
- With a 2026-07-28 client, the MRTR confirm flow works in memory and over stateless HTTP. The result carries `resultType:"complete"` and `_meta.serverInfo`.
- With a 2025-11-25 client it works in memory. Over stateless HTTP it returns our isError guard; without the guard it is a protocol error.
- Invalid input comes back as an isError tool result.
- An unknown tool on 2026-07-28 gets HTTP 400.
- `tools/list` is alphabetical and includes `ttlMs:0,cacheScope:"private"`, also for legacy clients.
