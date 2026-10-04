# Security engineering for ploeg-mcp

> Raw research-agent report, 2026-09-30, kept as evidence for [the MCP server patterns guide](../../2026-09-30-mcp-server-patterns.md). Agent output; code-read and synthesis claims are labelled as such inside.


This goes deeper than `docs/research/evidence/2026-09-29-mcp-access/security.md` and does not repeat its threat model. Sources were crawled on 2026-09-30. For code-level claims I read source at these pinned commits:
- go-sdk `bab4bf1e` (2026-09-29, v1.8.0 line): https://github.com/modelcontextprotocol/go-sdk
- typescript-sdk `7f4c12a6`: https://github.com/modelcontextprotocol/typescript-sdk
- MCP spec repo `046fa30e`: https://github.com/modelcontextprotocol/modelcontextprotocol
- authentik `97d105a0` (2026-09-30): https://github.com/goauthentik/authentik
- go-oidc `c914bd38`: https://github.com/coreos/go-oidc

Where a claim comes from my reading of code rather than from a doc or advisory, it is labelled **[code-read]**. Where it is my own synthesis, it is labelled **[synthesis]**.

---

## 1. OAuth resource server in Go

### 1.1 Normative targets (MCP 2026-07-28)

Source: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization and https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations

- **Validation.** Validate per OAuth 2.1 §5.2. "MUST validate that access tokens were issued specifically for them as the intended audience" (RFC 8707 §2). "Invalid or expired tokens MUST receive a HTTP 401." "MUST NOT accept or transit any other tokens." An upstream call uses a separate token; never pass through the one you received.
- **Error codes.** 401 means missing or invalid token. 403 means insufficient scope or permissions. 400 means a malformed request.
- **401 format** (spec example):
  ```
  WWW-Authenticate: Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource", scope="files:read"
  ```
- **403 step-up format:**
  ```
  WWW-Authenticate: Bearer error="insufficient_scope", scope="files:write", resource_metadata="…", error_description="…"
  ```
  The server SHOULD emit all scopes the operation needs in one challenge, not one scope per round trip. It "MUST account for scope hierarchies". Clients union the old and new scopes.
- **Scope advertising.** `scopes_supported` in PRM is meant to be the *minimal* set. Servers SHOULD NOT put `offline_access` in the WWW-Authenticate `scope` or in PRM `scopes_supported`.
- **Canonical URI.** No fragment, lowercase scheme and host, and the no-trailing-slash form is preferred. Servers "SHOULD accept uppercase scheme and host components".
- **PRM discovery.** The document MUST include `authorization_servers` (at least one). Clients use `resource_metadata` from the 401 first. Otherwise they probe `/.well-known/oauth-protected-resource/<mcp-path>`, then the root. https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery
- **RFC 9728 rules** (https://www.rfc-editor.org/rfc/rfc9728.html):
  - Path insertion: `https://h/mcp` has its metadata at `https://h/.well-known/oauth-protected-resource/mcp`.
  - The `resource` field "MUST be identical" to the identifier the client used, or the client MUST NOT use the data.
  - `resource` is REQUIRED. `scopes_supported` is RECOMMENDED. `bearer_methods_supported` should be `["header"]`, because tokens MUST NOT go in query strings.
- **Proposed PRM for ploeg-mcp:**
  ```json
  {"resource":"https://ploeg-mcp.example/mcp",
   "authorization_servers":["https://auth.example/application/o/ploeg-mcp/"],
   "scopes_supported":["ploeg:read"],
   "bearer_methods_supported":["header"],
   "resource_documentation":"https://…"}
  ```
  Claude requires three things (https://claude.com/docs/connectors/building/authentication):
  - `resource` equals the URL exactly as the user typed it, including the path.
  - Claude uses **only the first** `authorization_servers` entry.
  - Claude ignores WWW-Authenticate on non-401 responses.

### 1.2 go-sdk `auth` package: what it does and does not do [code-read, `auth/auth.go`]

- **What it provides.** `auth.RequireBearerToken(verifier, &RequireBearerTokenOptions{ResourceMetadataURL, Scopes, AllowMissingExpiration, ClockSkew})` puts `TokenInfo{Scopes, Expiration, UserID, Extra}` into the request context. `TokenInfoFromContext` reads it back.
- **No audience or issuer check.** The whole JWT check is your `TokenVerifier`. go-sdk offers a helper, `oauthex.MatchesResource(claims, resource)`. It tolerates only a trailing slash; scheme, host, port and path must match exactly.
- **Trap: missing `error` params in WWW-Authenticate.** The 403 path emits `WWW-Authenticate: Bearer resource_metadata=…, scope=…` **without `error="insufficient_scope"`**. The 401 path has no `error="invalid_token"`. RFC 6750 §3.1 defines those codes (https://www.rfc-editor.org/rfc/rfc6750#section-3.1). Write your own challenge writer.
- **Trap: 500 responses leak verifier errors.** Any verifier error that does not wrap `auth.ErrInvalidToken` or `auth.ErrOAuth` becomes a **500 whose body is `err.Error()`**. A JWKS fetch failure can therefore leak internal Authentik URLs to the caller. Wrap every failure in `ErrInvalidToken` and log the detail server-side only.
- **`Scopes` is one static list for the whole handler.** Per-tool step-up has to be done by you. See the batch trap in §4.
- **Scope in the handler.** Always re-check scope in the tool handler via `auth.TokenInfoFromContext`. MCP tools/list "MAY vary by the authorization presented" (https://modelcontextprotocol.io/specification/2026-07-28/server/tools), but list filtering is not enforcement. mcp-atlassian and mcp-server-kubernetes both shipped list-only filtering (§9).

### 1.3 Library choice

| Library | Fit | Must-set options / traps |
|---|---|---|
| `github.com/coreos/go-oidc/v3/oidc` v3.21.0 (2026-09-01) https://pkg.go.dev/github.com/coreos/go-oidc/v3/oidc | Built for **ID tokens**. `Config.ClientID` is "Expected audience", so you can set it to the resource URL. `SupportedSigningAlgs` is the alg allowlist. Discovery requires the issuer to match. | See the two traps below. |
| `github.com/golang-jwt/jwt/v5` v5.3.1 (2026-01-28) + `MicahParks/keyfunc/v3` / `jwkset` https://pkg.go.dev/github.com/golang-jwt/jwt/v5 | Generic. | You **must** pass `WithValidMethods` ("Heavily encouraged … to prevent attacks"), `WithAudience`, `WithIssuer`, `WithExpirationRequired` (a missing `exp` is otherwise accepted), `WithLeeway`, `WithIssuedAt`. The JOSE `typ` header is not checked, so check it in the keyfunc. `jwkset` provides `RefreshUnknownKID *rate.Limiter`, a rate-limited refetch on unknown kid. https://pkg.go.dev/github.com/MicahParks/jwkset |
| `github.com/lestrrat-go/jwx/v3/jwt` v3.3.0 (2026-09-08); v4 is tagged https://pkg.go.dev/github.com/lestrrat-go/jwx/v3/jwt | Most complete. A bare `Parse` without a key "returns an error instead of silently accepting". Time claims are validated by default, but only **when present**. | Use `WithKeySet`, `WithAudience`, `WithIssuer`, `WithAcceptableSkew`, `WithRequiredClaim("exp")`, `WithValidator` (for a `typ`, `azp` or `scope` check). `jwk.Cache` (httprc) refreshes within a 15 min to 30 day window, driven by Cache-Control. https://pkg.go.dev/github.com/lestrrat-go/httprc/v3 |

The two go-oidc traps:
- **Unknown-kid refetch is not rate-limited [code-read, `oidc/jwks.go`].** `RemoteKeySet` coalesces concurrent fetches (`inflight`) but has **no rate limit**. Every token with an unknown `kid` triggers a JWKS fetch, so a flood of junk tokens is amplified onto Authentik.
- **No `typ` check.** It will not reject an ID token presented as an access token.

**Recommendation [synthesis]:** use jwx v3 or golang-jwt v5 + jwkset with a rate-limited unknown-kid refresh.

### 1.4 Validation recipe (RFC 9068 §4 + RFC 8725)

RFC 9068 (https://www.rfc-editor.org/rfc/rfc9068.html):
- the `typ` header MUST be `at+jwt` or `application/at+jwt`;
- `iss` must match exactly;
- `aud` must contain the RS identifier;
- `alg=none` must be rejected;
- `exp` must be enforced;
- the required claims are `iss exp aud sub client_id iat jti`.

The typing exists to stop "ID Token Confusion". Authorization servers "MUST use a distinct identifier as an 'aud'" per resource. RFC 8725 (JWT BCP, https://www.rfc-editor.org/rfc/rfc8725) calls for explicit typing and algorithm allowlisting.

Practical recipe:
1. Pin `alg` to the Authentik key type (`RS256` or `ES256`). Reject HS*.
2. Match `iss` byte-for-byte against configuration, never against the token.
3. Check `aud` (see §2 for Authentik's values).
4. Require `exp`, and require `iat` to be not in the future. Skew ≤ 60 s.
5. Require `sub`.
6. Check `azp`/`client_id` against an allowlist when clients are pre-registered.
7. Discriminate ID tokens from access tokens (§2).
8. Authorize on scope ∧ role claim.

**Opaque tokens and revocation.** Local JWT validation ignores revocation. RFC 7662 introspection (https://www.rfc-editor.org/rfc/rfc7662) gives near-real-time revocation. Authentik exposes `/application/o/introspect/`: a confidential provider can introspect its own tokens, or another provider's tokens via "Federated OAuth2/OpenID Providers" (https://docs.goauthentik.io/add-secure-apps/providers/oauth2/). **Pattern [synthesis]:** validate locally for read tools; introspect, with a cache of 30 s or less, before `steer`/dispatch tools.

### 1.5 Scope design [synthesis, grounded in the spec's Scope Minimization and step-up rules]

- **`ploeg:read`** is the only scope in `scopes_supported`. It covers list/get Work Items, Runs and Shifts, and the estimate-only tool.
- **`ploeg:propose`** covers creating or updating proposed Work Items. It spends nothing and still goes through owner approval.
- **`ploeg:steer`** covers dispatch, cancel, approve and publish. Anything that spends money or changes state is here.
- **Hierarchy.** `steer` ⊇ `propose` ⊇ `read`. The spec says the server MUST honour hierarchies.
- **Challenge contents.** Name the full needed set in one 403.
- **No omnibus scope.** Never define `ploeg:*`.
- **Scope is not enough.** Also require a role or group claim, per the spec's "common mistake" list ("Treating claimed scopes in token as sufficient").

---

## 2. Authentik as the MCP authorization server

Sources: https://docs.goauthentik.io/add-secure-apps/providers/oauth2/ plus the source tree at `97d105a0`.

| Capability | Status in Authentik 2026.8 | Evidence |
|---|---|---|
| RFC 8414 AS metadata at the MCP-probed path | **Yes.** Root route `.well-known/oauth-authorization-server/application/o/<slug>/` exists (`urls_root.py`). Per-provider issuer is `https://auth/application/o/<slug>/`. MCP clients try path-insertion RFC 8414 first, and it resolves. OIDC discovery lives at `/application/o/<slug>/.well-known/openid-configuration`, which is the third MCP probe. | [code-read] `authentik/providers/oauth2/urls_root.py`; probe order in the MCP AS-discovery page |
| `code_challenge_methods_supported` | Advertised as `["plain","S256"]` (`views/provider.py`). MCP clients refuse to proceed if it is absent. | [code-read] |
| PKCE required | **No.** It is only verified when a challenge was sent. Public clients can omit it, and `plain` is accepted. Open feature request. | https://github.com/goauthentik/authentik/issues/25520 |
| RFC 8707 `resource` | **Not implemented.** On the code/refresh grant path, `resource` is silently ignored (no handling in `views/authorize.py` or `views/token.py`). On token exchange it is **rejected with `invalid_target`**, and docs say to use `audience` instead. Open requests: #14545 and #22070. | [code-read]; https://docs.goauthentik.io/add-secure-apps/providers/oauth2/token_exchange ; https://github.com/goauthentik/authentik/issues/14545 ; https://github.com/goauthentik/authentik/issues/22070 |
| Default access-token `aud` | `aud = provider.client_id` (`id_token.py` `IDToken.new`). A scope mapping returning `aud` overrides it (#4021). **Bug:** the same override also rewrites the **ID token** `aud`, and mappings can overwrite `sub`/`iss` too. | https://github.com/goauthentik/authentik/issues/25235 |
| RFC 9068 `typ: at+jwt` | **No.** Access token = ID-token payload + `azp`, `uid`, `scope` (`to_access_token`). The header `typ` is default JWT. RS cannot type-discriminate. | [code-read] `id_token.py`; #22070 |
| Signing | If no signing key is selected, it uses **HS256 with the client secret** and publishes no JWKS. **Always select an RSA/EC key.** | docs, "Signing Key" section |
| JWKS rotation | The JWKS publishes only the **current** signing key (`views/jwks.py` `get_keys`). There is no overlap, so switching keys immediately invalidates every outstanding JWT. | [code-read] |
| Issuer derivation | `get_issuer()` uses `request.build_absolute_uri`, so the issuer depends on the **Host the request came in on**. "authentik doesn't know what domain it's running on" (BeryJu). | [code-read] `models.py`; https://github.com/goauthentik/authentik/issues/17706 |
| RFC 7591 DCR | **New in 2026.8**, moved to OSS for .8 (#8751). Endpoint `/application/o/<slug>/register/`. **Requires a Bearer access token carrying `goauthentik.io/oidc/dcr`**, so it is not anonymous. It creates a new application+provider per registration. Settings are copied, not inherited. No RFC 7592 update/delete. "Allowed grant types: if left empty, all grant types are allowed" (incl. `implicit`, `password`). A CSRF bug blocked all non-browser clients until fixed in 2026.8 (#24969). | https://github.com/goauthentik/authentik/issues/8751 ; https://github.com/goauthentik/authentik/issues/24969 ; website/docs/…/oauth2/dynamic-client-registration.mdx ; https://docs.goauthentik.io/releases/2026.8/ |
| CIMD | **Absent.** No issue or PR found for "client id metadata document". | gh search, 2026-09-30 |
| RFC 9207 `iss` in authz response | Not found in metadata (`authorization_response_iss_parameter_supported` not advertised). | [code-read], grep negative |
| Refresh tokens | Only with `offline_access` scope + mapping. Rotation is configurable ("automatic refresh token rotation"). | docs |
| Token exchange (RFC 8693) | **Yes (2026.8)**, incl. OBO with `actor_token` → `act` claim. `audience=<target client_id>` mints a token signed by, and with `aud`/`iss` of, the target provider. The target must list the exchanger under Federated Providers, and the user must pass the target app's policies. | token_exchange.mdx; release notes |
| Group claims | The default `profile` mapping emits `"groups": [group.name …]` (names, not IDs). | `blueprints/system/providers-oauth2.yaml` |
| Redirect URI matching | Strict or Regex (`RedirectURIMatchingMode`). Regex uses `re.fullmatch`, so it is anchored. | [code-read] `views/authorize.py` |
| Other | DPoP metadata is advertised, but "Access tokens remain bearer tokens not DPoP" (only ID tokens are key-bound). MCP EMA/ID-JAG is requested: https://github.com/goauthentik/authentik/issues/25542 | [code-read] |

### Consequences for ploeg-mcp phase 3

- **Client registration for Claude.ai.** Claude picks CIMD only if AS metadata advertises `client_id_metadata_document_supported: true` and `none` auth. Otherwise it uses DCR, and it needs a `registration_endpoint` that accepts anonymous calls (https://claude.com/docs/connectors/building/authentication). Authentik offers neither CIMD nor anonymous DCR, so **zero-config Claude.ai onboarding against Authentik does not work.**
- **Working option: pre-registered clients.**
  - Create one confidential Authentik provider for hosted Claude (redirect `https://claude.ai/api/mcp/auth_callback`). Enter its client ID/secret in the connector's advanced settings, or use Anthropic-held creds (`oauth_anthropic_creds`).
  - Create one public provider for Claude Code.
    - Claude Code uses a loopback redirect on an ephemeral port. Claude docs require a port-agnostic match for both `localhost` and `127.0.0.1`.
    - In Authentik use the regex `http://(localhost|127\.0\.0\.1):[0-9]+/callback`.
    - **Escape the dots.** An unescaped `claude.ai` also matches `claudeXai`.
- **Reachability.** Authentik discovery must be reachable from Anthropic egress `160.79.104.0/21`. A WAF in front of the IdP breaks the flow (same Claude doc).
- **Audience.** `resource` is ignored.
  - Either validate `aud == <the known client_ids>` (a static allowlist of pre-registered providers), or add an `aud` scope mapping emitting the canonical URL.
  - The second route triggers #25235: ID tokens then carry the same `aud` and become replayable as access tokens.
  - Until #22070 lands, discriminate by requiring the `azp` and `scope` claims. Those are set only in `to_access_token` [code-read]. This is a heuristic; pin it with a test that presents a real Authentik ID token and expects a 401.
- **Issuer.** Configure the expected `iss` explicitly as the public URL. Fetch discovery and JWKS through the **public** hostname, or through an internal URL with the Host header forced to public. An internal-Host fetch yields a different `iss` and every token fails. go-oidc offers `InsecureIssuerURLContext` for split-horizon setups.
- **Rotation.** Because the JWKS has no overlap, keep access-token TTL short (≤ 10 min). Ensure the RS refetches on unknown kid, rate-limited.
- **PKCE.** Authentik will not enforce PKCE. Your registered clients all use S256 (the MCP spec requires this of clients). Do not register public clients you do not control.
- **If DCR is used anyway.**
  - Every registration creates a provider with a **new `client_id`, so a new `aud`**, and in per-provider issuer mode a new `iss` and JWKS URL.
  - Use **global issuer mode**, plus an `aud` scope mapping in "Override property mappings".
  - Restrict "Allowed grant types" to `authorization_code`/`refresh_token`.
  - Add a cleanup job, because there is no RFC 7592.
  - It still needs a bootstrap token, so Claude.ai cannot use it.

### Workarounds, ranked [synthesis]

1. **Pre-registered clients + audience allowlist** (above). Lowest effort, and it works today.
2. **A thin AS façade that fronts Authentik.** Examples: Cloudflare `workers-oauth-provider` (the pattern holds: the MCP side is its own AS). It implements "Pre-registered clients, CIMD, DCR", stores "Tokens, codes and secrets … only as hashes; `props` are encrypted with a key only the token holder can unwrap", and is RFC 8707-centred. It "advertises the required scopes but doesn't enforce them" (https://github.com/cloudflare/workers-oauth-provider). In Go the equivalent is ory/fosite or Hydra with Authentik as the upstream login. You then own consent-page duties: per-client consent, `__Host-` cookies, exact redirects (MCP Security BP, already in security.md).
3. **Pomerium** as an MCP gateway: downstream OAuth 2.1, per-tool PPL `mcp_tool`, and a signed identity header (§3). https://www.pomerium.com/docs/capabilities/mcp
4. **Keycloak.** It also lacks RFC 8707 ("planning to support", https://www.keycloak.org/securing-apps/mcp-authz-server ; https://github.com/keycloak/keycloak/issues/14355), so switching IdP does not fix audience binding.

---

## 3. "Trusted consumer asserting the acting user"

**Current Ploeg contract.** One operator consumer token. `X-Ploeg-Actor` names the owner, and `X-Ploeg-Acting-User` records the human. "The caller must derive these identities from its authenticated session". Ploeg rejects duplicate headers and regex-validates names (`apps/ploeg/pkg/httpapi/operator_execution.go`, `operator_delivery.go`, `apps/ploeg/docs/contracts/operator-delivery.md`).

**Risks:**
- **Confused deputy.** Whoever holds the ploeg-mcp consumer token can assert *any* actor within the consumer's Team scope. A ploeg-mcp bug (e.g. taking the actor from a tool argument, or from an elicitation form: "Servers MUST NOT rely on client-provided user identification without server verification", MCP elicitation spec) or a token leak becomes full impersonation.
- **Header spoofing.** If Ploeg's operator API is reachable by anything other than ploeg-mcp, any other holder of *a* consumer token can set these headers.
- **Phase 1 stdio is self-asserted.** The token sits in the user's env or config, and the actor comes from config. It proves only token possession, not identity.

**What serious systems do:**
- **Kubernetes impersonation.** The caller must be authenticated *and* hold the `impersonate` verb, restrictable with `resourceNames` (only certain users). Audit logs record both impersonator and impersonated user. https://kubernetes.io/docs/reference/access-authn-authz/authentication/#user-impersonation . KEP-5284 "Constrained Impersonation" (alpha 1.35) adds `impersonate-on:<mode>:<verb>`, so you "won't be able to perform any action while impersonating someone that [you] couldn't perform on [your] own". https://github.com/kubernetes/enhancements/issues/5284
- **Google IAP.** "If an attacker bypasses IAP, the attacker can forge the IAP unsigned identity headers"; verify `x-goog-iap-jwt-assertion` (ES256, `aud`, `iss`, `exp`, `iat`). https://docs.cloud.google.com/iap/docs/signed-headers-howto
- **Pomerium.** Upstreams verify `X-Pomerium-Jwt-Assertion` against `/.well-known/pomerium/jwks.json` rather than trusting plain headers. https://www.pomerium.com/docs/get-started/fundamentals/core/jwt-verification
- **RFC 8693 delegation.** The `act` claim records the actor. Authentik 2026.8 can mint these: subject = user, `act.sub` = an Authentik Actor whose parent must be that user, `audience` = Ploeg's provider (token_exchange.mdx).
- **AWS AgentCore on-behalf-of exchange** (already cited in security.md).

**Mitigations, from cheapest to strongest [synthesis]:**
1. **Constrain the consumer in Ploeg.** Add a per-consumer allowlist of assertable actors, like k8s `resourceNames`, and a per-consumer capability set (`read|propose|steer`). A phase-2/3 ploeg-mcp consumer never gets `verify` or admin powers.
2. **Phase 1: one consumer token per human.** Ploeg binds actor = consumer, so the header becomes redundant and cannot diverge.
3. **Network.** Put a NetworkPolicy on Ploeg's operator port allowing only ploeg-mcp and Vloer pods. Strip `X-Ploeg-*` at the ingress so no external request can carry it.
4. **Signed assertion.** ploeg-mcp mints a short-lived JWS per request, e.g.:
   - `{iss: ploeg-mcp, aud: ploeg-operator-api, sub: <authentik sub>, act: {sub: ploeg-mcp}, tool, argsDigest, jti, exp ≤ 60s}`.
   - Ploeg verifies it against ploeg-mcp's JWK and rejects a `jti` it has seen before.
5. **Strongest: exchange the user's token.** ploeg-mcp exchanges the user's Authentik access token (RFC 8693, `audience=<ploeg provider client_id>`, optional `actor_token`) for a per-user Ploeg token. Ploeg validates it as its own RS and derives the actor from `sub`. The MCP spec forbids passthrough, not exchange ("it may act as an OAuth client … a separate token"). Caveat: this adds an Authentik round trip per session, so cache the exchanged token until its `exp`.

---

## 4. Transport hardening

- **Origin and DNS rebinding.**
  - The spec says servers "MUST validate the `Origin` header on all incoming connections"; invalid → 403; bind to 127.0.0.1 when local (spec `basic/transports/streamable-http.mdx`).
  - go-sdk rejects requests whose local address is loopback but whose Host is not loopback (`DisableLocalhostProtection` defaults false), since v1.4.0. That fixed CVE-2026-34742: https://github.com/modelcontextprotocol/go-sdk/security/advisories/GHSA-xw59-hvm2-8pj6
  - Origin/CSRF checking is **opt-in**. `CrossOriginProtection` is nil by default and now deprecated in favour of wrapping with `http.NewCrossOriginProtection().Handler(h)`. Content-Type enforcement was added for CVE-2026-33252 (text/plain cross-site POST reached tools): https://github.com/modelcontextprotocol/go-sdk/security/advisories/GHSA-89xv-2j6f-qhc8
- **Trap: Go's CrossOriginProtection does not stop DNS rebinding.** It compares Origin with Host and Sec-Fetch-Site. Under rebinding, the attacker page is *same-origin* with the rebound host, and requests with neither header "are … allowed" (https://pkg.go.dev/net/http#CrossOriginProtection).
  - Rebinding is stopped by **Host allowlisting**, not Origin. Keep localhost protection on. For non-loopback deployments, add your own Host allowlist (`ploeg-mcp.example`, internal service name), plus an Origin allowlist when Origin is present.
- **Trap: sidecars on loopback [code-read].** go-sdk's localhost check keys on the *local address*. An in-pod proxy (Envoy/Istio sidecar, oauth2-proxy sidecar) that connects over 127.0.0.1 while forwarding a public Host gets **403 on every request**. The tempting fix, `DisableLocalhostProtection`, removes rebinding protection for phase 1. Configure the Host allowlist instead.
- **CORS.**
  - Browser MCP clients need `Access-Control-Expose-Headers: WWW-Authenticate` to read challenges (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Expose-Headers).
  - Never set `Access-Control-Allow-Origin: *` on the MCP endpoint. The Java SDK shipped exactly that as CVE-2026-34237: https://github.com/modelcontextprotocol/java-sdk/security/advisories/GHSA-hv2w-8mjj-jw22
  - `*` is fine on PRM only: go-sdk's `ProtectedResourceMetadataHandler` sets it deliberately.
- **Body limits.** go-sdk `MaxRequestBodyBytes` defaults to `DefaultMaxRequestBodyBytes = 4 MiB`, enforced while reading so it covers chunked and HTTP/2. **Negative disables it.** Lower it (e.g. 256 KiB) for ploeg-mcp. Kotlin (CVE-2026-63658), Ruby (CVE-2026-67432) and Java (GHSA-4x8c-5vv7-973f) shipped unbounded bodies.
- **Timeouts and slowloris.** The SDK sets no `http.Server` timeouts [code-read, grep negative]. Set:
  - `ReadHeaderTimeout` (≈5 s), `ReadTimeout`, `IdleTimeout` (https://pkg.go.dev/net/http#Server);
  - `WriteTimeout` large enough for SSE, or use `http.ResponseController` per stream;
  - `MaxHeaderBytes`.
- **Handler context.** In 2026-07-28 the POST is the request lifecycle. `StreamableHTTPOptions.PropagateRequestCancellation=true` cancels handlers when the client goes away.
- **HTTP/2.** Stay on a patched Go toolchain: Rapid Reset GO-2023-2102 / CVE-2023-39325 (https://pkg.go.dev/vuln/GO-2023-2102) and CONTINUATION flood GO-2024-2687 / CVE-2023-45288 (https://pkg.go.dev/vuln/GO-2024-2687). Let the gateway terminate h2 and speak h1 or h2c inward only if needed.
- **Trap: protocol-version downgrade and JSON-RPC batches [code-read, `mcp/streamable.go`].**
  - Batches are rejected only when the `MCP-Protocol-Version` header is ≥ 2025-06-18.
  - `Mcp-Method`/`Mcp-Name` header-vs-body validation (the `HeaderMismatch`, -32020 MUST) runs only when `!isBatch && len(incoming)==1`, and `OnRequestSummary` is also skipped for batches.
  - So any HTTP-level policy keyed on `Mcp-Name` (per-tool scope gate, per-tool rate limit, audit) is **bypassable** by sending a batch with an old or absent protocol header.
  - Fix: set `ServerOptions.SupportedProtocolVersions` to `["2026-07-28"]` (plus `2025-11-25` only if a real client needs it). Reject bodies whose first non-space byte is `[`. Make handler-level checks authoritative.
- **Parser differentials.** go-sdk moved from `encoding/json`, which is case-insensitive and folds ſ/K (CVE-2026-27896, https://github.com/modelcontextprotocol/go-sdk/security/advisories/GHSA-wvj2-96wp-fq3f), to segmentio, then fixed its NUL-suffix key folding (GHSA-q382-vc8q-7jhj).
  - **Trap for ploeg-mcp:** do not forward raw client JSON to Ploeg. Ploeg's `encoding/json` would accept `"Actor"`/`"actor"` duplicates that ploeg-mcp's validator saw differently.
  - Decode into typed structs (go-sdk's `jsonschema.For[T]` already emits `additionalProperties: false` for structs, https://pkg.go.dev/github.com/google/jsonschema-go/jsonschema#For), then re-marshal.
- **Reverse-proxy headers.** Go does not parse `X-Forwarded-*`. `RemoteAddr` is the proxy. For per-IP limits, use the rightmost IP not added by a trusted proxy. "Any security-related use of X-Forwarded-For … must only use IP addresses added by a trusted proxy" (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For). Build PRM and challenge URLs from config, never from `Host` or `X-Forwarded-Host`.
- **Rate limits and denial of wallet [synthesis on OWASP LLM10 + spec "MUST rate limit"].** Apply these as separate limits:
  - per IP (pre-auth, protects the JWKS and 401 paths);
  - per `sub` (all tools);
  - per `sub`+tool for `steer` (e.g. token bucket 5/min);
  - a global dispatch concurrency cap.
  - Ploeg remains the spend authority. ploeg-mcp limits are defence in depth.
  - Use quote-then-confirm (§5) and an idempotency key per confirmed dispatch.
  - For recursion, refuse `steer` tools when the caller token's `azp` is a Glide-internal agent client.

---

## 5. MRTR `requestState` integrity

**Spec (`basic/patterns/mrtr.mdx`, 2026-07-28):**
- Servers "MUST treat `requestState` as an attacker-controlled input". If it "influences authorization, resource access, or business logic, servers MUST protect its integrity (e.g. HMAC or AEAD) and MUST reject state that fails verification".
- To prevent replay, include and verify "the authenticated principal", "a short expiry (TTL)", and "an identifier for the originating request, e.g. the method name and a digest of its salient parameters".
- These "do not by themselves guarantee single-use… Servers for which a given `requestState` must be consumed at most once … MUST enforce that invariant server-side".
- Clients echo it verbatim, and it is valid only for that retry.
- Caching: requests carrying `inputResponses`/`requestState` "MUST NOT be cached" (`server/utilities/caching.mdx`).

**go-sdk** ships **no codec**. The field doc says "Unauthenticated servers must encrypt, sign and verify this value" (`mcp/protocol.go`) [code-read].

**TS SDK `createRequestStateCodec`** (`packages/server/src/server/requestStateCodec.ts`):
- HMAC-SHA256 with a key ≥ 32 bytes, TTL defaulting to 600 s.
- Wire format: `"v1." b64url({"p":payload,"exp":…,"b":bindTag}) "." b64url(mac)`. The MAC covers the version prefix.
- The optional `bind(ctx)` value is stored as a domain-separated, truncated HMAC tag, never raw.
- It verifies the MAC first, uses constant-time comparison, and returns opaque failure reasons (`malformed|mac|expired|bind`).
- "**signed, not encrypted** … the client can base64url-decode it and read the payload". Use AEAD "if confidentiality is required".
- **No `kid`, so no rotation.** It notes the D SDK's `secureRequestState` adds AES-256-GCM plus HKDF sub-keys.

**Design for ploeg-mcp [synthesis]:**
- **AEAD, not HMAC.** The payload holds the quote, cost ceiling and internal IDs, which the client and LLM should not read or learn from. Use `golang.org/x/crypto/chacha20poly1305.NewX`, so random 24-byte nonces are safe, or AES-256-GCM with random 96-bit nonces under a low per-key volume.
- **Envelope:** `v1.<kid>.<b64url(nonce‖ciphertext)>`, with AAD = `"ploeg-mcp/requestState/v1" ‖ kid ‖ Mcp-Method ‖ tool name`.
- **Plaintext fields:**
  - `iss` (AS issuer) and `sub` (from the verified token, never from headers);
  - `azp`/`client_id`;
  - `tool`;
  - `argsDigest` = SHA-256 of the RFC 8785 JCS canonical JSON of the validated typed args (https://www.rfc-editor.org/rfc/rfc8785);
  - `quoteId` and `costCeiling`;
  - `iat`, `exp` (≤ 5 min for steer);
  - `jti` (128-bit random);
  - `elicitationId`.
- **Verify on retry.** Decrypt, then check `exp`, `sub`/`iss`/`azp` equal the current token, `tool` equals the current call, and `argsDigest` equals the recomputed digest. Then consume the `jti` **in Ploeg**: pass it as the idempotency key of the dispatch/approval call, so single-use survives stateless replicas.
- **Keys.** Hold a keyring {current, previous} in the secret store, shared by all replicas. Rotate with overlap ≥ max TTL. Failures return one generic error.
- **Trap: an elicitation "accept" is not proof of a human.** `inputResponses` are produced by the client. An auto-approving or compromised client can answer `accept`.
  - The spec only requires that servers "MUST bind elicitation requests to the client and user identity" (`client/elicitation.mdx`).
  - For spend above a threshold, use **URL-mode elicitation** to a Vloer/Ploeg approval page where the user re-authenticates with Authentik. That is verifiable human presence.
  - Constraints: the URL "MUST NOT … be pre-authenticated" and "MUST NOT include sensitive information"; "Servers MUST NOT rely on URL mode elicitation to authorize users for themselves", so it approves a transaction, it is not login.

---

## 6. Prompt injection in tool results carrying third-party text

**Evidence.**
- **Spotlighting** (Hines et al., Microsoft; delimiting, datamarking, encoding) cut ASR "from greater than 50% to below 2%" on GPT models (https://arxiv.org/abs/2403.14720). MSRC calls it probabilistic and pairs it with **deterministic** blocking of exfil channels (https://www.microsoft.com/en-us/msrc/blog/2025/07/how-microsoft-defends-against-indirect-prompt-injection-attacks).
- **Adaptive attacks** bypassed 12 published defences with ASR "above 90% for most", including defences that reported near-zero (Nasr, Carlini et al., 2025-10-10, https://arxiv.org/abs/2510.09023). **Delimiting is a speed bump, not a boundary**; the boundaries are the scope, confirmation and budget controls.
- **Supabase MCP** wraps SQL results with instructions and says it "is not foolproof" (https://supabase.com/docs/guides/getting-started/mcp). A per-response random boundary tag means data cannot close it (pattern described in https://github.com/Strom-Capital/mcp-server-db2i/issues/148).

**Exfil channels to neutralise:**
- **EchoLeak** (CVE-2025-32711, CVSS 9.3): reference-style markdown images bypassed link redaction, and auto-fetch did zero-click exfil (https://arxiv.org/html/2509.10540v1).
- **Anthropic Slack MCP link unfurling** (CVE-2025-34072): the fix was `unfurl_links:false, unfurl_media:false`; the server was archived (https://embracethered.com/blog/posts/2025/security-advisory-anthropic-slack-mcp-server-data-leakage/).
- **ASCII smuggling** with Unicode Tags U+E0000–E007F: invisible, and it defeats visual review (https://www.microsoft.com/en-us/security/blog/2026/09/03/ascii-smuggling-crosses-over-from-ai-prompt-injection-to-phishing-evasion/).

**Server-side recipe [synthesis]:**
1. Return third-party text only in `structuredContent` fields named for provenance (`untrusted.ticketBody`, `untrusted.reviewerFinding`), plus a text block wrapped in `<untrusted-data-{128-bit random}> … </untrusted-data-{same}>` with a one-line notice.
2. **Normalise:** NFKC; strip the Tags block, zero-width characters (U+200B–U+200F, U+2060–U+2064, U+FEFF), and bidi controls (U+202A–U+202E, U+2066–U+2069); strip C0/C1 controls except `\n\t`. Report the count stripped as metadata so a human sees tampering.
3. **Defang active markdown:** rewrite `![…](…)`, reference definitions `[x]: http…`, autolinks and raw HTML into inert code spans, or into `hxxps://` for URLs not on an allowlist (the Glide forge and Ploeg hosts).
4. **Length caps** per field (e.g. 4 KiB ticket body, 16 KiB agent output) with an explicit `truncated: true` and a fetch-more handle, so the model cannot be flooded.
5. **Never echo secrets.** Ploeg responses "never include execution credentials" (contract). Additionally run a secret-pattern scrub (tokens, JWTs, `Authorization:` lines) on agent output before returning it.
6. **Prefer IDs over text.** Steer tools take IDs (Work Item, Run), not free text drawn from ticket content. Put the human-readable diff in the confirmation, not in the model's hands.
7. The tool **descriptions** state that fields under `untrusted` are data. The confirmation elicitation shows provenance, e.g. "text originates from client ticket #123".

---

## 7. Integrity of our own tool definitions

- **Static definitions.** Descriptions, `title`, `inputSchema` and `instructions` are compile-time constants. Nothing in them is interpolated from Ploeg data (repo names, ticket titles, tenant names). Otherwise a ticket title becomes a tool-poisoning vector. The spec: the tool set "MUST NOT vary per-connection or as a side effect of other requests", "MAY vary by the authorization presented" (https://modelcontextprotocol.io/specification/2026-07-28/server/tools).
- **Hash in CI.** Compute a SHA-256 over the canonical JSON of the tools/list output for each scope set. Commit it as a golden file, and fail CI on drift unless the version bumps. Publish the digest in release notes so clients or gateways (Snyk Agent Scan, OWASP "pin tool definitions using cryptographic hashes") can pin it.
- **Deterministic order**, a SHOULD in the spec. No `listChanged` churn within a release.
- **`instructions` field.** https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3213 (open, 2026-08-07): `instructions` goes "directly into the LLM's system prompt"; there is "no length limit, no content validation"; `cacheScope:"public"` lets a shared intermediary spread poisoned instructions. No maintainer resolution yet.
  - For us: keep `instructions` ≤ a few hundred chars, static, no data.
  - Mark `tools/list` `cacheScope:"private"` whenever the list varies by scope. The caching spec says `"public"` "may be shared outside of the initial requests authorization context" and that servers "MUST NOT rely on cacheScope alone" (`server/utilities/caching.mdx`).
- **No signing standard exists.** The "Server Identity and Tool Attestation" SEP (#2267) was closed on 2026-02-21 and redirected to ext-auth (https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2267). Absence confirmed.
- **Annotations.** Set `readOnlyHint:true` on read tools and `destructiveHint:true`, `openWorldHint:false` on steer tools. They are hints only; enforcement is server-side.
- **`x-mcp-header`.** Do not mark sensitive params; header values are "visible to network intermediaries" (tools spec).

---

## 8. Audit, redaction, supply chain

- **Audit record per call** (OWASP when/where/who/what, https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html):
  - timestamp, request ID, `iss`, `sub`, `azp`, token `jti` (never the token);
  - tool name, protocol version, decision (allow/deny/step-up/elicit/accept/decline), scope set;
  - argsDigest plus redacted args (IDs kept, free text hashed);
  - Ploeg approval/dispatch ID, cost estimate and actual;
  - source IP (trusted-proxy-derived), latency, error class.
- **Also log** 401/403, `HeaderMismatch`, rejected `requestState` (reason code only) and rate-limit hits. OWASP: log authz failures and "use of higher-risk functionality".
- **Exclude:** access tokens, session IDs, keys (OWASP "Data to exclude"). Encode CR/LF to stop log injection.
- **go-sdk hooks:**
  - `StreamableHTTPOptions.OnRequestSummary` gives *redacted* metadata before dispatch, but is not called for batches or pre-auth rejections, so add HTTP middleware.
  - `Server.AddReceivingMiddleware` sees dispatched messages.
  - stdio: log to **stderr only**, because stdout is the protocol.
- **Errors.** Tool errors use a fixed catalogue. Never wrap upstream errors verbatim (see go-sdk's 500-body trap in §1.2). Map Ploeg 4xx/5xx to codes.
- **Supply chain:**
  - `govulncheck ./...` in CI and `govulncheck -mode=binary` on the release artifact. It is call-graph reachability-based: "only surfaces vulnerabilities that actually affect you" (https://go.dev/doc/security/vuln/).
  - Pin the toolchain (`toolchain` in go.mod, `GOTOOLCHAIN=local` in CI), use `-trimpath`, `-mod=readonly`, and `go mod verify`.
  - Renovate on go-sdk with a security fast-lane. go-sdk had 4 advisories in 2026.
  - SBOM via syft, attached with `cosign attest`.
  - Sign by digest with `cosign sign --key hashivault://…` (KMS-style key refs: https://docs.sigstore.dev/cosign/signing/signing_with_containers/).
  - **Keyless is unavailable from Forgejo.** Forgejo v15 Actions has OIDC (`enable-openid-connect: true`, https://forgejo.org/docs/v15.0/user/actions/security-openid-connect/), but public Fulcio does not trust Forgejo issuers (https://github.com/sigstore/fulcio/issues/2442, open).
  - Verify signatures at admission in homelab-cluster, which is out of scope for this repo.

---

## 9. 2025–2026 advisories in MCP servers and SDKs: root cause → trap

| # | Advisory | Root cause | Trap for ploeg-mcp |
|---|---|---|---|
| 1 | go-sdk CVE-2026-34742 (<1.4.0) https://github.com/modelcontextprotocol/go-sdk/security/advisories/GHSA-xw59-hvm2-8pj6 | No DNS-rebinding protection by default | Keep `DisableLocalhostProtection=false`; add a Host allowlist |
| 2 | go-sdk CVE-2026-33252 (≤1.4.0) GHSA-89xv-2j6f-qhc8 | Cross-site `text/plain` POST accepted, no Origin check | Enforce Content-Type and Origin; stateless + no-auth is the worst case |
| 3 | go-sdk CVE-2026-27896 GHSA-wvj2-96wp-fq3f | Case-insensitive JSON keys, ſ/K folding | Parser differential between ploeg-mcp and Ploeg; re-marshal typed structs |
| 4 | go-sdk GHSA-q382-vc8q-7jhj | NUL-suffixed duplicate keys, "last key wins" | Same class; fuzz with duplicate keys |
| 5 | TS SDK CVE-2025-66414 / Python CVE-2025-66416 / Java CVE-2026-35568 / Rust CVE-2026-42559 / Ruby CVE-2026-63118 (advisories on each repo) | Same rebinding default across SDKs | Systemic: never trust SDK defaults |
| 6 | TS SDK CVE-2026-25536 GHSA-345p-7cg4-v4c7 | A shared transport or server instance across clients routes responses to the wrong client (JSON-RPC ID collisions) | Per-request server/transport in stateless mode; no process-global per-user state |
| 7 | github-mcp-server CVE-2026-48529 GHSA-pjp5-fpmr-3349 | Singleton initialised with the *first* user's GraphQL client | Never cache a per-user Ploeg client or actor in a global |
| 8 | Python SDK CVE-2026-52869 GHSA-jpw9-pfvf-9f58 | Session routed by ID without checking the principal | Bind every handle and `requestState` to `sub` |
| 9 | Python SDK CVE-2026-52870 GHSA-hvrp-rf83-w775 | Task handlers ignore the owner; `tasks/list` returns everything | Owner-scoped list/get/cancel for Runs and Shifts (Ploeg already 404s unknown/unauthorised) |
| 10 | mcp-atlassian CVE-2026-77243 GHSA-3r68-hf9h-887v; mcp-server-kubernetes CVE-2026-46519 GHSA-cr22-wjx7-2w6m | Tool filtering at `tools/list` only; `tools/call` dispatches the full registry | Enforce scope in `tools/call`; test by calling a hidden tool |
| 11 | mcp-atlassian GHSA-5j8j-256g-vvp5 (critical, fixed 0.23.1) | Auth middleware path-matched `/mcp`; the SSE transport paths never matched, so every request ran as the operator | Default-deny auth wrapping the whole mux, not path-matched |
| 12 | mcp-atlassian CVE-2026-73497 / CVE-2026-77242 | SSRF fix bypassed by DNS rebinding TOCTOU (validated IP not pinned) | If ploeg-mcp ever fetches URLs (JWKS, CIMD), pin the resolved IP |
| 13 | Rust rmcp CVE-2026-63127 GHSA-33f5-2c5q-wgwj; Python GHSA-qx49-fqc8-xw99 | Clients skipped the RFC 9728 `resource` check or AS issuer binding | Our PRM `resource` must equal the exact URL, or conformant clients reject us |
| 14 | Kotlin CVE-2026-63658; Ruby CVE-2026-67432; Java GHSA-4x8c-5vv7-973f | Unbounded request bodies | Keep `MaxRequestBodyBytes` > 0 and small |
| 15 | Ruby CVE-2026-67430; rmcp CVE-2026-63128 | Unbounded session tables (initialize flood) | Stateless mode avoids it; do not reintroduce server-side session maps |
| 16 | TS SDK CVE-2026-0621 GHSA-cqwc-fm46-7fff | ReDoS in UriTemplate | Use Go's RE2 (linear-time) regexp only, and bound input lengths |
| 17 | awslabs postgres-mcp-server CVE-2026-87911 (critical) GHSA-fph8-pg5w-78fv; mysql CVE-2026-85788 | "Read-only" enforced by denylisting SQL verbs | Enforce read-only by credential or capability (a Ploeg consumer without steer), not by input filtering |
| 18 | mcp-server-kubernetes CVE-2026-75603 / CVE-2026-85986 | Flag injection through tool args, and an incomplete fix | Never build argv or URLs from args; typed enums and IDs only |
| 19 | Inspector CVE-2025-49596 / CVE-2025-58444 | Unauthenticated local proxy; XSS → command execution | Phase-2 internal HTTP still needs auth even on "internal" networks |
| 20 | Anthropic Slack MCP CVE-2025-34072 | Server let output trigger link unfurling | Our outputs must not create fetchable links (§6) |
| 21 | Anthropic Git MCP CVE-2025-68143/68144/68145, CVE-2026-27735 (https://github.com/modelcontextprotocol/servers/security/advisories) | Path and argument validation | Same lesson as #18 |

Advisory lists were pulled via the GitHub API on 2026-09-30 for the `modelcontextprotocol/*` SDKs, `servers`, `inspector`, and the named third-party repos. `csharp-sdk` and `swift-sdk` have **no published advisories**.

---

## 10. Security checklist for ploeg-mcp (testable)

**AuthN / tokens (phase 3)**
1. Missing or invalid bearer → 401 with `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="<exact PRM URL>", scope="ploeg:read"`. *Test:* httptest, no header / garbage / expired token; assert status and exact header params.
2. `alg` allowlist = the Authentik key alg. HS256, `none` and `RS256`-signed-with-public-key-as-HMAC are rejected. *Test:* forge tokens for each; expect 401.
3. `iss` must equal the configured public issuer byte-for-byte. *Test:* token from the same key with a trailing-slash-variant `iss` → 401.
4. `aud` must match the configured audience set (client_ids or canonical URL), with no substring or prefix match. *Test:* `aud` = other Authentik app, `aud` = `https://ploeg-mcp.example.evil`, array without ours → 401.
5. An Authentik **ID token** presented as the bearer is rejected. *Test:* live Authentik fixture: complete the code flow, send the id_token → 401.
6. `exp` is required and skew ≤ 60 s. `nbf`/`iat` in the future is rejected. *Test:* table test with a fake clock.
7. Unknown `kid` triggers at most N JWKS fetches per minute. *Test:* 1,000 tokens with random kids; count upstream fetches ≤ limit.
8. Verifier failures never produce 5xx bodies containing internal URLs. *Test:* JWKS endpoint down → 401 with a generic body; grep body for `authentik`/`svc`.
9. PRM at `/.well-known/oauth-protected-resource/mcp` returns `resource` equal to the connector URL and `authorization_servers[0]` = Authentik issuer; no `offline_access` in `scopes_supported`. *Test:* golden JSON.
10. Tokens in the query string are ignored or rejected. *Test:* `?access_token=` → 401.

**AuthZ / scopes**
11. Each steer tool without `ploeg:steer` → HTTP 403 `error="insufficient_scope", scope="ploeg:steer"` (full set in one challenge). *Test:* read-scoped token calls each steer tool.
12. Scope is checked in the handler, not just in `tools/list`. *Test:* call a tool absent from the filtered list → denied.
13. Scope ∧ role: a token with `ploeg:steer` but without the Ploeg role group → denied. *Test:* fixture tokens.
14. Batches and legacy protocol versions are rejected. *Test:* POST `[...]` with `MCP-Protocol-Version: 2025-03-26` or none → 400; assert the tool is not executed.
15. `Mcp-Name` header ≠ body tool name → 400 `-32020`. *Test:* mismatched header.
16. Actor derivation: `X-Ploeg-Actor` = mapping(`sub`) only; tool args or elicitation content cannot change it. *Test:* property test injecting `actor` fields everywhere; Ploeg mock asserts the header.
17. Ploeg rejects `X-Ploeg-Actor` values outside the ploeg-mcp consumer's allowlist. *Test:* Ploeg httpapi test with an unlisted actor → 403/404.

**Confirmation / MRTR**
18. Every steer tool first returns `InputRequiredResult` (no spend). *Test:* Ploeg mock records zero dispatches after the first call.
19. `requestState` tampering (bit flip, truncation, wrong kid) → generic rejection, no dispatch. *Test:* fuzz.
20. `requestState` replayed by a different `sub`, for a different tool, with changed args, or after `exp` → rejected. *Test:* table test.
21. The same `requestState` + accept twice produces exactly one dispatch (Ploeg idempotency on `jti`). *Test:* concurrent double retry.
22. `decline`/`cancel` or a missing `inputResponses` → no spend, and a re-prompt or an explicit error. *Test.*
23. `requestState` ciphertext does not reveal cost, IDs or `sub`. *Test:* base64-decode the output; assert no plaintext JSON.
24. Key rotation: state minted under the previous key verifies during the overlap and fails after removal. *Test.*
25. Above the spend threshold, confirmation uses URL mode and the URL carries no token or PII. *Test:* inspect the elicitation params.

**Transport**
26. Host not in the allowlist → 403 (both loopback and pod IP). *Test:* `Host: evil.example` against 127.0.0.1 and against a non-loopback listener.
27. A present, disallowed `Origin` → 403; `Content-Type: text/plain` POST → 415. *Test.*
28. Body > limit → 413; slow-header client is disconnected after `ReadHeaderTimeout`. *Test:* a slowloris goroutine.
29. No `Access-Control-Allow-Origin: *` on `/mcp`; the PRM may have it. *Test:* OPTIONS/GET header assertions.
30. The rate limiter keys on the trusted client IP; spoofed `X-Forwarded-For` does not reset buckets. *Test:* rotate XFF values from one RemoteAddr.
31. Per-`sub` steer rate limit and global dispatch concurrency cap. *Test:* burst → 429 or tool error; Ploeg mock sees ≤ cap.

**Outputs / definitions / ops**
32. Third-party text is wrapped in a random boundary, normalised (Tags, zero-width and bidi stripped), markdown images and links defanged, and length-capped. *Test:* corpus with `![](https://x/?q=)`, `[a]: http://x`, U+E0041…, U+202E → assert neutralised.
33. Secret scrubber: agent output with a JWT or `Authorization:` line is redacted. *Test.*
34. tools/list digest matches the committed golden file for each scope set; descriptions contain no runtime data. *Test:* CI golden plus a grep for template calls.
35. `instructions` is static and ≤ 512 chars; `tools/list` `cacheScope` is `"private"` when it is scope-filtered. *Test.*
36. Audit line per call with the listed fields and no token substrings; CR/LF encoded. *Test:* log capture plus a regex for `eyJ`.
37. stdio mode writes nothing but JSON-RPC to stdout; the token is read from env once and not inherited by child processes. *Test:* spawn and parse stdout strictly.
38. CI: `govulncheck` clean, SBOM attached, image signed by digest, verification succeeds. *Test:* pipeline gates.
39. Authentik configuration (IaC) asserts: signing key set (no HS256), redirect regexes escaped and anchored, grant types restricted to code+refresh, `offline_access` rotation on. *Test:* a Terraform/blueprint lint job.

---

### Absences confirmed
- CIMD in Authentik.
- RFC 8707 `resource` honoured by Authentik or Keycloak.
- RFC 9068 `at+jwt` in Authentik.
- A `requestState` codec in go-sdk.
- An MCP-spec tool-definition signing standard (SEP #2267 closed).
- A maintainer resolution on spec issue #3213.
- Published advisories for csharp-sdk and swift-sdk.
- A guide for Authentik with Claude.ai or ChatGPT connectors (none found; the closest is https://github.com/agentydragon/ducktape/issues/6883, which records that Authentik DCR "is not anonymous registration" and has no RFC 7592).
