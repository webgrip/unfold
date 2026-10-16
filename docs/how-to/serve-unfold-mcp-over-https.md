---
type: how-to
audience: [operator, owner]
owner: unfold
last_verified: 2026-10-16
verified_by: "Read apps/unfold/src/mcp-http.ts, src/mcp-auth.ts, src/mcp.ts and src/auth.ts; ran apps/unfold/test/mcp-http.test.ts and test/mcp.test.ts. Not checked against a live Authentik, a running client or the homelab."
---

# Serve Unfold's MCP tools over HTTPS with a browser sign-in

**Goal:** people connect Claude Code, VS Code or Cursor to one HTTPS URL, sign in once in the browser, and use Unfold's seven `unfold_*` tools as themselves, with no local checkout, `vle_…` credential or port-forward ([ADR-0032, entry of 2026-10-16](../adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md#more-information)). The stdio server in [Ask Unfold and Ploeg from an AI client](ask-from-an-ai-client.md) keeps working unchanged.

The Unfold server itself serves the MCP endpoint on its own path, off until you configure it. It is a stateless Streamable HTTP endpoint and an OAuth resource server: it checks the person's access token from Authentik, finds the Unfold account the same person has from single sign-on, and runs every tool as that account. The person's token never goes further than the endpoint. Ploeg's twin is [Serve Ploeg's MCP tools over HTTPS](../../apps/ploeg/docs/how-to/serve-ploeg-mcp-over-https.md).

Before you start, Unfold must run in live mode with single sign-on (`auth.oidc`) configured, and each person must have signed in to Unfold in the browser once, so their account exists.

## 1. Register a client at the identity provider

Create one public client (no secret, authorization code with PKCE S256) whose access tokens are signed JWTs. The steps use Authentik's names.

1. Application and provider: client id `unfold-mcp`, client type public. Keep it separate from Unfold's own browser client, so a token for one is never accepted by the other.
2. Redirect URIs, one per client you support:

   | Client | Redirect URI |
   | --- | --- |
   | Claude Code | `http://localhost:<port>/callback` and `http://127.0.0.1:<port>/callback`, any port, or the port you pass as `--callback-port` |
   | VS Code | `http://127.0.0.1:33418` and `https://vscode.dev/redirect` |
   | Cursor | `http://localhost:8787/callback` |

   In Authentik, a regular-expression redirect such as `^http://(localhost|127\.0\.0\.1):[0-9]+/callback$` covers Claude Code's changing port.
3. A scope `unfold:mcp`. Its mapping adds nothing; it exists so the token's `scope` claim carries it:

   ```python
   return {}
   ```

   Also attach `openid`, `email` and `offline_access`, so clients get a refresh token and do not open the browser every time a token expires.
4. Access token validity: 10 minutes. Unfold refuses a token that lives longer, unless you raise `UNFOLD_MCP_MAX_TOKEN_LIFETIME`.
5. Subject mode: the same as Unfold's own browser provider. Unfold finds a person's account by the token's `sub`, under the browser issuer (or `auth.oidc.subjectNamespace`), so both providers must give one person the same subject. Authentik's default, "Based on the User's hashed ID", does. Not verified: that it is identical across two providers of one Authentik. If it is not, Unfold falls back to a verified email (`email_verified: true`) that names a single sign-on account.
6. Bind the application to the same groups that may sign in to Unfold.

## 2. Configure the Unfold server

Set these variables on the existing Unfold Deployment. There are no default domains.

| Variable | Required | Meaning |
| --- | --- | --- |
| `UNFOLD_MCP_RESOURCE` | yes | The exact public URL clients connect to, such as `https://unfold.example.com/mcp`. Setting it turns the endpoint on; its path, outside `/api/` and `/.well-known/`, is where the endpoint is served |
| `UNFOLD_MCP_ISSUER` | yes | The issuer of the `unfold-mcp` provider, matched byte for byte, such as `https://id.example.com/application/o/unfold-mcp/` |
| `UNFOLD_MCP_CLIENT_IDS` | yes | Comma-separated client ids whose tokens are accepted (`aud` and `azp`) |
| `UNFOLD_MCP_JWKS_URL` | no | The provider's key set; default is the `jwks_uri` of the issuer's discovery document |
| `UNFOLD_MCP_SCOPE` | no | The scope a token must carry; default `unfold:mcp` |
| `UNFOLD_MCP_REQUEST_SCOPES` | no | Space-separated scopes clients are told to request, such as `openid email unfold:mcp offline_access`; the required scope is always added |
| `UNFOLD_MCP_MAX_TOKEN_LIFETIME` | no | Longest accepted `exp` minus `iat`, such as `10m`; default `10m`, at most `24h` |

There is no listen variable: the endpoint shares the Unfold server's port. Unfold refuses to start when an `UNFOLD_MCP_*` variable is set without `UNFOLD_MCP_RESOURCE`, outside live mode, or without `auth.oidc`.

```yaml
env:
  - {name: UNFOLD_MCP_RESOURCE, value: "https://unfold.example.com/mcp"}
  - {name: UNFOLD_MCP_ISSUER, value: "https://id.example.com/application/o/unfold-mcp/"}
  - {name: UNFOLD_MCP_CLIENT_IDS, value: unfold-mcp}
  - {name: UNFOLD_MCP_REQUEST_SCOPES, value: "openid email unfold:mcp offline_access"}
```

The pod needs egress to the provider's discovery and key URLs. Route `/mcp`, `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` on Unfold's host to the Service without stripping the `Authorization` header and without authentication at the gateway: Unfold answers the 401 that starts the client's sign-in. claude.ai and ChatGPT connectors cannot use it while the provider is reachable on the LAN and VPN only.

## 3. Connect a client

Each client finds the provider through `/.well-known/oauth-protected-resource/mcp`, opens the browser for sign-in, and stores and refreshes the token itself. Name the pre-registered client id, because the provider does not accept dynamic registration.

Claude Code:

```sh
claude mcp add --scope user --transport http --client-id unfold-mcp unfold https://unfold.example.com/mcp
```

Then run `/mcp` in Claude Code, choose `unfold` and **Authenticate**. If the provider lists exact redirect ports only, add `--callback-port <port>` and register `http://localhost:<port>/callback`.

VS Code, in the user `mcp.json` (command **MCP: Open User Configuration**):

```json
{
  "servers": {
    "unfold": {
      "type": "http",
      "url": "https://unfold.example.com/mcp",
      "oauth": { "clientId": "unfold-mcp" }
    }
  }
}
```

Cursor, in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "unfold": {
      "url": "https://unfold.example.com/mcp",
      "auth": { "CLIENT_ID": "unfold-mcp" }
    }
  }
}
```

## What changes over HTTP

* `unfold_ask` spends only after the person confirms. A 2026-07-28 client that declares form elicitation is asked through an `input_required` result, and the confirmation it sends back can be used once, by that person, for that question, within 10 minutes. A 2025 client, such as VS Code 1.142, cannot be asked over stateless HTTP, so it is refused with a link to the Work Item and nothing is spent. Ask it over stdio, or in Unfold.
* `unfold_digest` without `since` covers the last 24 hours, because the "since your previous digest" mark is kept per machine by the stdio server.
* Every tool reads with the person's own account and Teams, and reaches what an editor credential reaches: it cannot approve editor sign-ins or manage credentials.

## Verify

```sh
curl -si -X POST https://unfold.example.com/mcp | grep -i www-authenticate
curl -s https://unfold.example.com/.well-known/oauth-protected-resource/mcp
```

The first answers 401 with `resource_metadata` and `scope`; the second names the issuer under `authorization_servers` and the exact URL as `resource`. After signing in, ask the client "what waits for me in Unfold?".

## Symptom → cause → fix

| Symptom | Cause | Fix |
| --- | --- | --- |
| `/mcp` answers 404 or the Unfold page | `UNFOLD_MCP_RESOURCE` is unset, or its path differs from the routed one | Set it to the exact URL, path included |
| The client never opens a browser | It cannot read the metadata or the provider's discovery | Check both URLs above from the client's machine |
| 401 `the token lives longer than 600s` | The provider issues longer access tokens | Set the access token validity to 10 minutes, or raise `UNFOLD_MCP_MAX_TOKEN_LIFETIME` |
| 401 `the token has no azp or scope` | The client sent an ID token | Use a client that sends the access token |
| 401 `the token is meant for another audience` | The client signed in with a client id missing from `UNFOLD_MCP_CLIENT_IDS` | Pass `unfold-mcp` as the client id, or add the id |
| 403 `insufficient_scope` | The token lacks `unfold:mcp` | Attach the scope to the provider and sign in again |
| 403 "no Unfold account belongs to this identity" | The person never signed in to Unfold in the browser, or the two providers give different subjects | Sign in to Unfold once; align the subject mode, or include a verified `email` |
| 503 "signing keys are unavailable" | Unfold cannot reach the provider's key set | Check egress and `UNFOLD_MCP_JWKS_URL` |
| `unfold_ask` says the client cannot confirm | The client speaks 2025 over HTTP, or declares no form elicitation | Ask over stdio or in Unfold |
