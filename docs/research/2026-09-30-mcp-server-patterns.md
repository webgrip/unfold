# Building ploeg-mcp: patterns and traps

Date: 30 September 2026, against `docs/mcp-access` at `dd00f38`. This is a record and a build guide for [ADR-0011](../adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md) (accepted). It refines that decision; it does not reopen it. Nothing here is implemented.

> **Method.** Six research agents, one per area: tool and result design, the Go SDK's source at v1.8.0, client compatibility (twelve clients, with opencode, Goose and Codex read in source), security engineering (with Authentik read in source), testing and operations, and advanced protocol patterns. Their raw reports are in [evidence/2026-09-30-mcp-server-patterns/](evidence/2026-09-30-mcp-server-patterns/), with a [verified skeleton](evidence/2026-09-30-mcp-server-patterns/skeleton.md).
>
> **Checked first-hand rather than taken from an agent:**
> - The skeleton passes `go vet` and `go test` with Go 1.25.0 against go-sdk v1.8.0.
> - go-sdk v1.8.0 has no `recover()` outside tests.
> - go-sdk defaults an empty `cacheScope` to `public` (`mcp/protocol.go`).
> - Stateless mode rejects server-to-client requests ("stateless servers cannot make requests", `mcp/streamable.go`).
> - These issues are open: [claude-code#79944](https://github.com/anthropics/claude-code/issues/79944) (text dropped when `structuredContent` is present), [go-sdk#1134](https://github.com/modelcontextprotocol/go-sdk/issues/1134) (no RFC 6750 `error=`), [authentik#14545](https://github.com/goauthentik/authentik/issues/14545) (no audience per resource) and [authentik#22070](https://github.com/goauthentik/authentik/issues/22070) (no RFC 9068 access tokens).
> - In Authentik at `97d105a`, the authorize and token views never read `resource`, the authorize response carries no `iss`, PKCE `plain` is advertised, and access tokens get no `typ` header.
>
> Claims about ChatGPT, Cursor, JetBrains and Devin come from forum and issue reports that no one here reproduced; the evidence files mark them.

## Summary

Nine findings change how `ploeg-mcp` must be built. Each one either corrects the ADR as written or adds a rule it did not have.

1. **Serve both protocol eras on one URL.** ChatGPT and Claude.ai open with the new stateless revision (`server/discover`), and ChatGPT is observed not to fall back. VS Code, Cursor, Zed, Gemini CLI, opencode v1, JetBrains and Codex by default still open with the old `initialize` handshake. go-sdk v1.8 does both on one endpoint when `Stateless: true`.
2. **Both result channels must carry the full answer.** Claude Code, Codex and VS Code show the model only `structuredContent`. Gemini CLI, Zed, Cursor and opencode show only `content`. So `structuredContent` holds the data and every hint, and `content` holds the same data as JSON text. A short summary in `content` loses the data in half the clients.
3. **An elicitation "accept" is consent from the client, not proof of a person.** A Claude Code hook, the Agent SDK or a headless run can answer the form. Claude.ai web has no elicitation, and Cowork hangs for 180 seconds. What protects spend:
   - approve and cancel are granted only to the owner's identity;
   - `requestState` is sealed and single-use;
   - Claude Code is forced to prompt with `_meta["anthropic/requiresUserInteraction"]`;
   - Unfold is the approval path whenever the form is missing.
4. **The approval form never reaches old-era clients over stateless HTTP.** go-sdk synthesizes their session without capabilities and rejects server-to-client requests. Over HTTP, only new-era clients get the form; everyone else gets the Unfold link. Over stdio the SDK's compatibility shim works.
5. **The Go SDK leaves real gaps you must fill:**
   - no panic recovery (a panic kills the process);
   - plain errors go out as JSON-RPC code `0`;
   - `cacheScope` defaults to `public`;
   - no `requestState` codec and no capability check before asking for input;
   - no Origin check by default;
   - the auth middleware returns 500 with the verifier's error text and omits `error="insufficient_scope"`;
   - pointer and slice fields become nullable type arrays that Cursor and JetBrains reject.
6. **Tool schemas must use the common subset.** No `$schema`, `$ref`, `anyOf`/`oneOf`/`allOf`, `const` or nullable type arrays; only `enum` of strings for closed sets. Every property is declared and every array has `items`. Codex silently drops `format`, `default`, `pattern` and bounds, so the server validates them.
7. **Every tool call returns in 30 seconds or less.** Claude Code's HTTP default, Cursor, Zed and ChatGPT sit around 60 seconds, and Codex's documented default is 60 seconds. Long work returns a Work Item id and is polled. No MCP Tasks.
8. **Authentik can serve the remote phase only for clients registered in advance, and some clients break.** It has no client metadata documents, no anonymous dynamic registration, no `resource` audience, no typed access tokens and no `iss` in the authorize response. Gemini CLI 0.61 and later refuses the missing `iss`. The owner chose Authentik with pre-registered clients on 2026-09-30 (§6).
9. **The conformance command in the ADR's Confirmation cannot pass against the real binary.** Most required scenarios call fixture tools, such as `test_simple_text`, that a production server does not have. The fix is a build with those fixtures behind the same middleware, plus a per-check baseline.

## 1. Protocol and transport

**One endpoint, both eras.** `mcp.NewStreamableHTTPHandler(getServer, &mcp.StreamableHTTPOptions{Stateless: true})` answers `server/discover` requests carrying the new `_meta` and old `initialize` requests on the same `/mcp`. A stateful handler negotiates new clients down to 2025-11-25. That breaks ChatGPT, which does not fall back.

How the handler behaves:
- **Versions.** `ServerOptions.SupportedProtocolVersions` narrows the list. Keep 2026-07-28, 2025-11-25 and 2025-06-18: Junie requests 2025-06-18 and aborts on a newer reply.
- **Error bodies.** A new-era request with a bad version gets `-32022`, and a header that disagrees with the body gets `-32020`, both as HTTP 400.
- **Plain-text 400.** A legacy request whose `MCP-Protocol-Version` header names an unsupported version still gets a plain-text 400 in v1.8. Wrap it, so every error body is JSON-RPC.

**HTTP rules** from the transport spec and client bugs:
- **GET and DELETE:** answer 405 with `Allow: POST` at once. Junie's GET has a 10-second timeout that kills its session, and Antigravity does not fall back after a slow reply.
- **Notifications:** answer every one with 202 and no body, including removed ones like `notifications/roots/list_changed`. Antigravity drops the connection on a 400.
- **HEAD** without a token gets 401 with `WWW-Authenticate`; Gemini CLI probes with HEAD.
- **Response format:** return JSON by default and SSE only when a tool emits progress. ChatGPT failed when discovery came back as SSE.
- **SSE through proxies:** send `X-Accel-Buffering: no`, an immediate `:` comment, and a keep-alive every 15–20 seconds. The keep-alive option exists only on go-sdk's unreleased `main`.
- **Paths and ports:** the exact path is `/mcp`, with no trailing slash, no redirect and port 443. Claude.ai fails on other paths and ports, and a 307 drops the POST body.
- **Sessions:** never mint `Mcp-Session-Id`, and ignore it and `Last-Event-ID` when sent.
- **Batches:** reject any request body that is a JSON array. go-sdk skips its `Mcp-Method`/`Mcp-Name` header checks for batches, so any policy keyed on those headers is bypassable with a batch.

**Hardening that go-sdk leaves to you:**
- **Host allowlist.** Localhost protection is on by default: it rejects a loopback connection whose `Host` is not loopback. That stops DNS rebinding locally, but it also returns 403 for a sidecar proxy that connects over 127.0.0.1. Keep it on, and add a Host allowlist rather than `DisableLocalhostProtection`.
- **Origin check.** The deprecated `CrossOriginProtection` option is nil by default, which means no check. Wrap the handler in `http.NewCrossOriginProtection()` with an allowlist. Go's check does not stop DNS rebinding, because a rebound page is same-origin, so the Host allowlist is still required.
- **Body size.** Set `MaxRequestBodyBytes` explicitly to about 256 KiB; the default is 4 MiB.
- **Timeouts.** The SDK sets no `http.Server` timeouts. Set `ReadHeaderTimeout` of about 5 seconds, `IdleTimeout` and `MaxHeaderBytes`. Set no `WriteTimeout` on `/mcp`, because it kills SSE ([go-sdk#1262](https://github.com/modelcontextprotocol/go-sdk/issues/1262)).
- **CORS.** Never send `Access-Control-Allow-Origin: *` on `/mcp` (the Java SDK's CVE-2026-34237). `*` is fine on the Protected Resource Metadata. Expose `WWW-Authenticate`.
- **stdio.** Accept either `server/discover` or `initialize` as the first message, and tolerate `initialize` after a successful discover (Claude Code [#96183](https://github.com/anthropics/claude-code/issues/96183)). Write only JSON-RPC to stdout and all logs to stderr.

## 2. Tools and results

The nine tools of ADR-0011 stay. These rules decide how they are written.

**Names.** Use `glide_<verb>_<noun>`, matching `^[a-z][a-z0-9_]{0,29}$`, and tell people to register the server as `glide`. That keeps `mcp_glide_` plus the tool name within Gemini's 63 characters, Cursor's 60 for server and tool together, and VS Code's and Claude.ai's 64. Codex rewrites hyphens and dots, so use neither. Never rename a published tool. When a rename is unavoidable, keep the old name as an alias for at least one release (GitHub's `tool-renaming` pattern).

**Descriptions.**
- Write 3–6 sentences under 1,000 characters.
- Order them: purpose, when to use it, when not to (naming the sibling tool), what it returns, and limits and side effects.
- Front-load the verb and Glide's nouns, because Claude Code and Codex find deferred tools by searching these words.
- Keep them static: no data, no imperative instructions to the model, no reference to other servers. Claude's and OpenAI's directory reviews reject those, and data in a description is a tool-poisoning path.
- Server `instructions` are at most 500 characters, static and self-contained. ChatGPT weighs the first 512, and Claude Code cuts at 2,048. Use them to say what Glide is, to read before proposing or steering, and that approving spend needs a person.

**Input schemas.** Build them with `jsonschema.For[T]`, then post-process to the common subset:
- Remove `null` from every type array, because go-sdk makes pointers and slices nullable.
- Strip `$schema`, and add `enum` by hand where needed (the `jsonschema` struct tag sets only a description).
- Keep the root an object with declared properties, `additionalProperties: false` and no combinators.
- Use `string` fields for ids and cursors. Never use `json.RawMessage` or `[]byte`, which become arrays of integers.
- Keep each schema under 4 KB serialized, since Codex compacts larger ones by stripping descriptions.

Accept names and URLs where people have them: `glide_get_work` takes a Ploeg id or a tracker task URL. Never ask the model for the principal or Team when the token already says it. Coerce a JSON-stringified array or a number sent as a string, because Linear's server wiped labels when it didn't.

**Annotations.** Set `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` explicitly on every tool. The spec defaults are "destructive" and "open world". Codex and ChatGPT prompt on a tool with none, and ChatGPT's submission requires all of them.

| Tool | readOnly | destructive | idempotent | openWorld | Extra |
| --- | --- | --- | --- | --- | --- |
| The five read tools | true | false | true | false | `glide_overview` may set `_meta["anthropic/alwaysLoad"]` |
| `glide_propose_work` | false | false | true | false | Server-derived idempotency key |
| `glide_approve_work` | false | true | true | false | `_meta["anthropic/requiresUserInteraction"]: true` |
| `glide_reject_work` | false | true | true | false | Same; OpenAI: "cancellation" is destructive, and undo does not make it safe |
| `glide_cancel_work` | false | true | true | false | Same |

Annotations advise clients; they never enforce. Claude Code ignores them for permissions ([claude-code#87452](https://github.com/anthropics/claude-code/issues/87452), closed as not planned), which is why `requiresUserInteraction` matters.

**Results.**
- `structuredContent` holds the full answer, including the fields below:
  - `has_more` and `next_cursor`;
  - `truncated` with a narrowing hint;
  - `untrusted` for third-party text (§5);
  - `next_steps` that name the exact follow-up tool and arguments (Sentry's pattern).
- `content` is one `text` block with the same data as compact JSON. go-sdk writes that by default when `Content` is nil.
- Declare an `outputSchema` in the same subset and contract-test outputs against it. In go-sdk a result that fails its own schema becomes a protocol error the model never sees.
- **Errors** are `isError: true` with one text block and no `structuredContent`: Cursor validates `structuredContent` even on errors. Name the cause, the valid alternatives and the tool to try next. Wrap go-sdk's raw `validating "arguments": …` text.
- **Size and content types.** Target 8 KB per result, VS Code's inline threshold, with a hard cap of 40,000 characters (Gemini truncates there). Page by default at 25 items. Use text content only: no `resource_link`, embedded blobs, audio or `annotations.priority`, which break Zed, Codex and Claude.ai in different ways.
- **Money.** Minor units plus currency in `structuredContent`, and two decimals in the text.
- **Diagnostic ids.** Trace and request ids stay out of the model's view; put them in `_meta` or the audit log.

**Lists and caching.**
- Return `tools/list` in one page, with no `nextCursor`, in go-sdk's alphabetical order. Codex, Cursor, Gemini, Zed and Claude Desktop never follow `nextCursor`.
- The list varies by grant, so set `cacheScope` to `private` in `SetCacheable`, with a `ttlMs` of about one hour.
- Keep the tool set static per release. Cursor, Codex and Claude.ai cache tool lists and ignore `list_changed`, so a change needs a client restart.

**Per-person tool sets.** go-sdk has one static tool set per `Server`. Build one `Server` per grant set (read; read+propose; owner), cache them, and choose one in `getServer` from the verified token. `getServer` runs twice per request, so it must be cheap.

Hiding a tool is not enforcement. Check the grant again inside the handler, because a hidden tool can still be called by name. That gap is how mcp-atlassian CVE-2026-77243 and mcp-server-kubernetes CVE-2026-46519 happened.

## 3. Human confirmation

This is how approve, reject and cancel work, within the owner's rules: only the owner may steer, and a client without the form is sent to Unfold.

1. **Check the grant.** A caller without the steer toolset gets a tool error and nothing else.
2. **Check the client.** If the request's `clientCapabilities` do not declare elicitation, return a normal result, not an error, with `status: "awaiting_human_approval"` and the Unfold approval URL. The same applies to Claude.ai web, which has none, and Cowork, which declares it and hangs; detect `clientInfo.name` `Anthropic/ClaudeAI`, or make it configurable.
3. **Return the form.** Send an `input_required` result: `InputRequests` with one form elicitation and a sealed `RequestState`.
   - The `message` is a digest: Work Item title, Team, budget authorized and remaining, and the expiry.
   - The schema is a single boolean `confirm`, with no root `title`, which breaks Codex.
4. **On the retry,** open the state and check it: its expiry, that `sub` equals the caller, that `tool` equals this tool, and that the argument digest matches. Act only on `accept` with `confirm == true`.
5. **Single use.** Pass the state's `jti` to Ploeg as the idempotency key of the approve or cancel call. A retried or replayed confirmation then does nothing twice, even across replicas.

**Sealing `requestState`.** The spec says servers MUST treat it as attacker-controlled and protect its integrity. go-sdk provides no codec. Build it like this:
- **Cipher:** AEAD, not just HMAC, so the client cannot read the budget or ids. XChaCha20-Poly1305 (`golang.org/x/crypto/chacha20poly1305.NewX`), with random nonces.
- **Envelope:** `v1.<kid>.<b64url(nonce‖ciphertext)>`. The associated data covers a domain string, `kid` and the tool name.
- **Payload:** `iss`, `sub`, `azp`, `tool`, a SHA-256 over the canonical JSON (RFC 8785) of the validated arguments, `iat`, an `exp` of 5 minutes at most, and a 128-bit `jti`.
- **Keys:** a current and a previous key, the same on every replica, from the secret store. Rotate with an overlap longer than the TTL. Every failure returns one generic error.

**Above a spend threshold, prefer URL mode later.** URL-mode elicitation to an Unfold approval page, where the owner signs in with Authentik, is the only confirmation a local hook cannot answer. It has three rules:
- `accept` means only "opened"; the server checks completion on the retry.
- The URL is never pre-authenticated.
- The server checks that the same `sub` completed it.

This needs the remote phase and is listed as a later step.

**Rejected:** the "preview, then apply with a signed confirmation handle" fallback that one agent proposed. The model can pass the handle back itself, so it would let the model approve on its own, which the owner ruled out.

## 4. Clients

The limits that bind the design, from [clients.md](evidence/2026-09-30-mcp-server-patterns/clients.md) and [opencode-goose.md](evidence/2026-09-30-mcp-server-patterns/opencode-goose.md):

| Client | Protocol it opens with | What the model sees | Approval form | Tool timeout | Result limit |
| --- | --- | --- | --- | --- | --- |
| Claude Code | New era over HTTP; old over stdio unless `MCP_PROTOCOL_NEGOTIATION=auto` | `structuredContent` only | Yes, form and URL; the VS Code extension auto-declines | 60 s per request; backgrounded after 2 min | 25,000 tokens |
| Claude.ai, Desktop | New era, falls back | Both | None on web; Cowork hangs | 240 s | ~150,000 characters |
| ChatGPT | New era, no fallback observed | Both | OpenAI's own extension, form only | ~60 s (anecdotal) | Not documented |
| Codex | Old (2025-06-18) unless a feature flag | `structuredContent` only | Form and URL | 300 s in code, 60 s in docs | 8 MiB |
| Cursor | Old | `content` only | Old-style form only, often hidden | ~60 s | Large results to a file |
| VS Code Copilot | Old (2025-11-25) | `structuredContent` only | Old-style | Not documented | 8 KB inline |
| Zed | Old | `content` only | None | 60 s, progress ignored | Not documented |
| Gemini CLI | Old (2025-06-18) | `content` only | None | 600 s | 40,000 characters |
| opencode | Old (v1); v2 new era with `protocol: auto` | `content` (v1) | None (v1); form and URL (v2) | 60 s (v1) | 50 KB (v1) |
| Goose | Both, prefers new | `content` | Form only; no MRTR | 300 s | 200,000 characters |

**OAuth redirect URIs** that an identity provider must allow for these clients:
- **Hosted callbacks:**
  - `https://claude.ai/api/mcp/auth_callback`
  - `https://chatgpt.com/connector_platform_oauth_redirect`
  - `https://chatgpt.com/connector/oauth/{callback_id}`
  - `https://vscode.dev/redirect`
  - `https://www.cursor.com/agents/mcp/oauth/callback`
  - `cursor://anysphere.cursor-mcp/oauth/callback`
- **Loopback callbacks:**
  - `http://localhost:<port>/callback` (Claude Code, random port)
  - `http://127.0.0.1:<port>/callback` (Codex, Zed)
  - `http://127.0.0.1:19876/mcp/oauth/callback` (opencode v1, fixed)
  - `http://127.0.0.1:<port>/oauth_callback` (Goose)
  - `http://localhost:8787/callback` (Cursor, bound to `[::1]` only)

In Authentik's regex mode, escape the dots: an unescaped `claude.ai` also matches `claudeXai`.

**Install snippets** for the how-to (VIK-1503) and the server's docs are listed per client in [clients.md §4](evidence/2026-09-30-mcp-server-patterns/clients.md). For example:
- Claude Code: `claude mcp add --transport http glide https://HOST/mcp`
- Codex: `codex mcp add glide --url https://HOST/mcp`
- Cursor, VS Code and Goose have one-click deeplinks.

## 5. Security

The full checklist of 39 testable requirements is in [security.md §10](evidence/2026-09-30-mcp-server-patterns/security.md). The ones that change the design:

**Identity and the trusted consumer.** `ploeg-mcp` holds one operator consumer token and asserts the acting person in `X-Ploeg-Actor`. Anyone holding that token can claim any actor in its Teams. Mitigations, cheapest first:
1. **Per-consumer allowlist in Ploeg.** Ploeg gains an allowlist of actors each consumer may assert, like Kubernetes' `impersonate` with `resourceNames`. It also gets a capability set per consumer (read, propose, steer).
2. **Phase 1: one consumer token per person.** The actor then equals the consumer and cannot diverge.
3. **Network policy.** A NetworkPolicy admits only `ploeg-mcp` and Unfold to the operator port, and the ingress strips `X-Ploeg-*`.
4. **Later: signed assertion or token exchange.** Either a short-lived signed assertion per request, or RFC 8693 exchange of the person's Authentik token for a Ploeg token. Authentik 2026.8 supports the exchange.

**Token validation for the remote phase.** Use `lestrrat-go/jwx/v3`, or `golang-jwt/jwt/v5` with `jwkset`. Not go-oidc: it does not rate-limit refetches on an unknown key id, so junk tokens amplify onto Authentik, and it cannot tell an ID token from an access token.
- **Algorithm and issuer:** pin `alg` to Authentik's key type, and match `iss` byte for byte against the configured public issuer.
- **Audience and ID-token rejection:** check `aud` against the allowlist of pre-registered client ids, because Authentik ignores `resource`. Reject an ID token presented as an access token by requiring the `azp` and `scope` claims, and pin that with a test using a real Authentik ID token.
- **Time claims:** require `exp`, with clock skew of 60 seconds at most.
- **Key rotation:** keep access tokens at 10 minutes or less, because Authentik's JWKS publishes only the current key.
- **Error handling:** wrap every verifier failure in `auth.ErrInvalidToken`, so go-sdk never answers 500 with an internal URL in the body. Write the RFC 6750 challenge yourself, `error="insufficient_scope"` included.
- **Scopes and roles:** `ploeg:read`, `ploeg:propose` and `ploeg:steer`, where each includes the ones before it. Require the owner group as well as the scope for steer, and check both in the handler.

**Text from third parties.** Ticket bodies, reviewer findings and agent output are data written by other people.
- **Placement:** return them only in `structuredContent` fields under `untrusted`, and in the text block inside a random `<untrusted-data-…>` boundary.
- **Normalisation:** apply NFKC and strip Unicode Tag characters, zero-width characters, bidi controls and C0/C1 controls. Report how many were stripped.
- **Defanging:** turn markdown images, reference links, autolinks and raw HTML into inert text, so a client cannot fetch an attacker's URL (the EchoLeak pattern).
- **Caps and secrets:** cap each field (4 KiB for a ticket body) with `truncated: true`. Scrub token-shaped strings from agent output.

Delimiting lowers attack success; it is not a boundary. The boundaries are the grant, the confirmation and Ploeg's budget.

**Supply chain.**
- Run `govulncheck` in CI and on the binary; go-sdk had four advisories in 2026.
- Pin the toolchain, sign the image by digest with a key reference, and attach an SBOM. Keyless signing from Forgejo does not work today, because public Fulcio does not trust Forgejo's OIDC issuer.

## 6. The identity provider for the remote phase

The owner accepted the remote phase. Research found that Authentik, the estate's identity provider, supports MCP clients only partly:

| What MCP clients expect | Authentik 2026.8 |
| --- | --- |
| Client ID Metadata Documents (Claude.ai's zero-config path) | Absent |
| Anonymous dynamic client registration | Absent: registration needs a bearer token |
| `resource` sets the audience (RFC 8707) | Ignored; `aud` is the client id |
| Typed access tokens (RFC 9068 `at+jwt`) | Absent |
| `iss` in the authorize response (RFC 9207) | Absent; Gemini CLI 0.61+ refuses |
| PKCE S256 | Advertised, with `plain`; not enforced |
| Refresh token rotation | Yes |
| RFC 8414 metadata at the path clients probe | Yes |

**Options:**
1. **Authentik with pre-registered clients.**
   - How: one confidential client for Claude.ai (its client id and secret are entered in the connector's advanced settings), one for ChatGPT, and a public client with a loopback redirect pattern for Claude Code, Codex and the other CLIs. `ploeg-mcp` checks `aud` against those client ids.
   - Pros: no new infrastructure; works with the clients the owner uses.
   - Cons: no zero-config onboarding, and Gemini CLI fails until Authentik sends `iss`.
2. **Keycloak** as the identity provider for MCP.
   - Pros: broader client coverage (`iss`, audience mappers, anonymous registration by policy).
   - Cons: a second identity provider to run.
3. **A thin authorization server in front of Authentik.** ory/hydra or fosite issues MCP-correct tokens and delegates login to Authentik.
   - Pros: every client works, including zero-config Claude.ai.
   - Cons: a new security-critical component with its own consent-page duties.

**Decided (owner, 2026-09-30): option 1.** It serves the owner's own clients with no new component. Revisit option 3 when the agency phase needs arbitrary clients to connect, or when Gemini CLI matters before Authentik sends `iss`.

Phase 1 (stdio with a token) and phase 2 (a static bearer on the internal gateway) need none of this. JetBrains AI Assistant has no OAuth at all, so the static bearer path stays even after phase 3.

## 7. Testing

- **In-process tests** with `mcp.NewInMemoryTransports()` against a test ploegd. Cover every tool, and both eras: `ClientSessionOptions{ProtocolVersion: "2025-11-25"}` and the default. Add the ADR's own cases: propose stays `proposed`, a declined approval dispatches nothing, a read-only caller cannot list or call write tools.
- **HTTP tests** with `httptest` and raw POSTs asserting the status codes:
  - 405 on GET and DELETE;
  - 404 with `-32601`;
  - 400 with `-32020` and `-32022`;
  - 403 on a bad Host or Origin;
  - 413 on a large body;
  - 400 on a batch.
- **Snapshot tests.** One snapshot per tool and one `tools/list` snapshot per grant set, failing in CI on a missing or changed snap (GitHub's `toolsnaps`). This is the regression test for "a tool that is not granted is not listed". Also validate every schema against both the draft-07 and 2020-12 meta-schemas.
- **Fuzzing** of tool arguments and header decoding: no panic, only `isError` or `-32602`.
- **Conformance.** Pin `@modelcontextprotocol/conformance@0.2.0-alpha.11`, because the npm `latest` (0.1.16) predates 2026-07-28. Two runs:
  - Against the real binary, the protocol scenarios: `server-stateless`, `tools-list`, `caching`, `dns-rebinding-protection` (only against `127.0.0.1`).
  - Against a `-tags conformance` build that adds the fixture tools behind the same middleware, for the full required set with `--requirements 2026-07-28` and again with `2025-11-25`.

  Use per-check baseline entries only. A stale entry fails the run.
- **Inspector.** `npx @modelcontextprotocol/inspector@2 --cli <url> --method tools/list --strict` fails on non-portable schemas (exit 6) and on `isError` (exit 5).
- **Evals** (nightly and on description changes).
  - Use about 30 realistic multi-call tasks with a held-out set, run through `claude --bare -p … --mcp-config … --strict-mcp-config --tools "" --output-format stream-json` via LiteLLM.
  - Gate each run on the init event's `mcp_servers` status: a broken config is skipped silently and still exits 0.
  - Track task success, wrong-tool rate, argument errors, retries, calls, tokens and cost.
  - Evals through LiteLLM load every tool up front (tool search is off behind a custom base URL), so their token numbers do not transfer to first-party use.

## 8. Operations

- **Telemetry.** A receiving middleware, outermost, recovers panics and emits OTel spans and metrics named after the MCP semantic conventions, which are still in development: span `{mcp.method.name} {gen_ai.tool.name}` and histogram `mcp.server.operation.duration`.
  - Record `error.type=tool_error` for `isError` results. They are HTTP 200, so RED metrics look green while tools fail.
  - Parent spans on `_meta.traceparent` (unprefixed).
  - go-sdk exposes no JSON-RPC id to middleware.
- **Logs.** One line per call: principal, tool, grant, client name and version, protocol version, duration, result bytes, `isError` and the operator API status. Never the token, and no arguments by default.
- **Alerts:**
  - `tool_error` ratio per tool;
  - p95 above 50 seconds;
  - 5xx above 1%;
  - spikes of `-32020`, `-32022` or 401 after a deploy.
- **Timeouts end to end:**
  - server tool deadline of 30 seconds or less;
  - HTTPRoute `timeouts.request` set explicitly (Envoy's default route timeout is 15 seconds);
  - Cilium's stream idle timeout checked on the cluster; the Helm value is ignored on 1.18.x.
- **Replicas.** Stateless replicas scale horizontally, sharing the `requestState` keys.
- **Probes.** Liveness `/healthz`, readiness a cheap operator API check, and never `/mcp`: stateless GET answers 405.
- **Shutdown.** Cancel a `BaseContext` on SIGTERM, bound `Shutdown` below the grace period, and add a `preStop` sleep.
- **Lifecycle.**
  - Only additive schema changes, with aliases for renames and removal only in a major version.
  - `Implementation.Version` equals the image tag, and a changelog section is generated from snapshot diffs.
  - The MCP Registry only accepts public URLs and public image registries, so it waits for a public endpoint.

## 9. Patterns: adopt, later, never

| Pattern | Verdict for ploeg-mcp |
| --- | --- |
| Handle plus poll (Work Item id, `glide_changes_since`) | **Now** |
| A capped wait inside `glide_get_work` | **Later**, if polling feels slow; cap at 30 s with progress |
| MCP Tasks extension | **Later**: no target client declares it and go-sdk lacks it |
| Form elicitation for approval | **Now**, as §3 |
| URL-mode elicitation to Unfold above a threshold | **Later**, with the remote phase |
| Asynchronous tool approval (SEP-2848) | **Later**: still a draft that depends on Tasks |
| One resource template `glide://work-items/{id}` and two prompts | **Now**, cheap and carries no authority |
| Resource subscriptions | **Later**: no target client uses them |
| Static server instructions, 500 characters at most | **Now** |
| A `glide-operator` skill file in a Claude plugin with `.mcp.json` | **Now**; the Skills extension itself **later** |
| Search-and-execute or code mode | **Never** at nine tools; search-and-execute only past about 25 tools |
| MCP Apps read-only run and spend view | **Later**, if Claude.ai or ChatGPT becomes where people read Glide |
| MCP Apps button as the approval path | **Never**: an app click is not a human signal |
| A narrow-only `/readonly` path or `?toolsets=` | **Now**; grants from the token decide, paths only narrow |
| Runs reaching ploeg-mcp through LiteLLM's gateway | **Never** |

## 10. The sharpest traps

1. **A server that speaks only one protocol era** loses either ChatGPT or most other clients.
2. **A short summary in `content` with the data in `structuredContent`** loses the data in half the clients; the reverse loses it in the other half.
3. **Treating an elicitation `accept` as a human click.**
4. **Unsealed or reusable `requestState`.** A client can swap the Work Item or the budget, or replay an approval.
5. **Returning an elicitation to a client that did not declare it.** The spec says MUST NOT; Zed hangs until it times out.
6. **Relying on the old-style elicitation shim over stateless HTTP.** It fails with a protocol error.
7. **`cacheScope: "public"` on a per-person tool list.** A shared cache serves the owner's steer tools to others.
8. **Filtering `tools/list` without checking in the handler.**
9. **A panic in a handler.** It kills the process; go-sdk has no recovery.
10. **Plain Go errors from middleware.** They go out as code `0`.
11. **Nullable type arrays from pointers and slices.** Cursor and JetBrains reject the tool.
12. **`$schema` in an `outputSchema`.** A draft-07 `$schema` disables every tool in Claude Desktop, and 2020-12 makes VS Code skip validation.
13. **Tool calls longer than 60 seconds**, or a blocking wait longer than the client's timeout.
14. **JSON-RPC batches** that slip past header-based policy.
15. **Sidecar proxies on loopback.** They get 403 from localhost protection; fix with a Host allowlist, not by disabling it.
16. **The auth middleware's 500 body** leaking internal identity-provider URLs.
17. **Authentik ID tokens accepted as access tokens.**
18. **Authentik key rotation invalidating every live token.**
19. **Conformance run with the npm `latest`, or against the production binary.**
20. **Evals that pass with zero tools**, because a bad MCP config is skipped silently.
21. **Renaming a tool.** Cursor caches until quit, Codex for 30 minutes, and Claude Code's discovery cache for hours.
22. **Idempotency on propose only.** A client must re-send a lost request with a new id, so approve, reject and cancel need it too.

## 11. What this changes

- **[ADR-0011](../adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md)** gets a dated refinement: both eras are served, both result channels are full, approval is described as consent backed by grants and single use, the OAuth phase uses Authentik with pre-registered clients, and the Confirmation uses the fixture build.
- **Tickets on the Glide board:**
  - VIK-1507, 1508 and 1509 gain these rules as comments.
  - New tickets cover the OAuth resource server, the per-consumer actor allowlist in Ploeg, and the eval harness.
  - VIK-1511 gains the Authentik client list.

## 12. Limits

- No `ploeg-mcp` code exists beyond the skeleton.
- No client was connected to a real server in this sweep.
- ChatGPT's "no fallback" behaviour rests on third-party observations.
- Several client limits are undocumented and marked so in the evidence.
- Token cost of the nine tool definitions is not measured yet; the eval harness will measure it.
