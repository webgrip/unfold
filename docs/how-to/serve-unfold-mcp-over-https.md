---
type: how-to
audience: [operator, owner]
owner: unfold
last_verified: 2026-10-30
verified_by: "Read against apps/unfold/src/mcp.ts, mcp-http.ts and mcp-auth.ts and the MCP 2026-07-28 changelog, authorization, client registration, versioning, Streamable HTTP and MRTR pages; ran apps/unfold/test/mcp-http.test.ts and mcp.test.ts. The Authentik steps were last run end to end with apps/unfold/test/e2e/mcp-over-https.e2e.ts on 2026-10-17 against Authentik 2026.5.2 with the official MCP TypeScript client 2.3.1, before UNFOLD_MCP_TOKEN_AUDIENCE existed. Not checked against Claude Code, VS Code or Cursor themselves, or the homelab. The Tasks section was read against apps/unfold/src/mcp.ts and mcp-tasks.ts, the Tasks extension 2026-07-28 and Claude Code's MCP tasks pages, and apps/unfold/test/mcp-tasks.test.ts passed; no real client was tried."
---

# Serve Unfold's MCP tools over HTTPS with a browser sign-in

**Goal:** people connect Claude Code, VS Code or Cursor to one HTTPS URL, sign in once in the browser, and use Unfold's `unfold_*` tools as themselves, with no local checkout, `vle_…` credential or port-forward ([ADR-0032, entry of 2026-10-16](../adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md#more-information)). The stdio server in [Ask Unfold and Ploeg from an AI client](ask-from-an-ai-client.md) keeps working unchanged.

The Unfold server itself serves the MCP endpoint on its own path, off until you configure it. It is a stateless Streamable HTTP endpoint that speaks MCP 2026-07-28 and still serves 2025-11-25, 2025-06-18 and 2025-03-26 clients, and an OAuth resource server: it checks that the person's access token from Authentik was issued for this endpoint, finds the Unfold account the same person has from single sign-on, and runs every tool as that account. The person's token never goes further than the endpoint. Ploeg's twin is [Serve Ploeg's MCP tools over HTTPS](../../apps/ploeg/docs/how-to/serve-ploeg-mcp-over-https.md).

Before you start, Unfold must run in live mode with single sign-on (`auth.oidc`) configured, and each person must have signed in to Unfold in the browser once, so their account exists.

## 1. Register a client at the identity provider

Create one public client (no secret, authorization code with PKCE S256) whose access tokens are signed JWTs. The steps use Authentik's names.

1. Application and provider: client id `unfold-mcp`, client type public. Keep it separate from Unfold's own browser client, so a token for one is never accepted by the other. A client that signs in with a Client ID Metadata Document instead uses its own HTTPS URL as client id, and needs no registration here when your provider fetches those documents (it advertises `client_id_metadata_document_supported`). Dynamic Client Registration is deprecated in MCP 2026-07-28; Unfold never needs it.
2. Redirect URIs, one per client you support:

   | Client | Redirect URI |
   | --- | --- |
   | Claude Code | `http://localhost:<port>/callback` and `http://127.0.0.1:<port>/callback`, any port, or the port you pass as `--callback-port` |
   | VS Code | `http://127.0.0.1:33418` and `https://vscode.dev/redirect` |
   | Cursor | `http://localhost:8787/callback` |

   In Authentik, a regular-expression redirect such as `^http://(localhost|127\.0\.0\.1):[0-9]+/callback$` covers Claude Code's changing port.
3. A scope `unfold:mcp` whose mapping returns the person's groups, so the access token carries them. Unfold decides the role from them with the same `auth.oidc.roles` map as browser sign-in, refuses a token that entitles no role, and acts at the lower of that role and the stored one:

   ```python
   return {"groups": [group.name for group in request.user.ak_groups.all()]}
   ```

   Authentik 2026.5 logs `ak_groups` as deprecated in favour of `groups`; the expression still works there.

   If your browser provider puts a role claim (`auth.oidc.roleClaim`) in its tokens instead, return the same claim here. Also attach `openid` and `offline_access`, so clients get a refresh token and do not open the browser every time a token expires.
4. Audience. Unfold accepts a token whose `aud` is its exact resource URL, `UNFOLD_MCP_RESOURCE`, as RFC 8707 and RFC 9728 require: clients send that URL as the `resource` parameter. A provider that ignores the `resource` parameter puts the client id in `aud` instead. Authentik 2026.5.2 does, as the end-to-end suite asserts, so with Authentik set `UNFOLD_MCP_TOKEN_AUDIENCE=client-id` in step 2.
5. Access token validity: 10 minutes. Unfold refuses a token that lives longer, unless you raise `UNFOLD_MCP_MAX_TOKEN_LIFETIME`.
6. Subject mode: exactly the same as Unfold's own browser provider. Unfold finds a person's account by the token's `sub` alone, under the browser issuer (or `auth.oidc.subjectNamespace`), and never by email or name, so both providers must give one person the same subject. Authentik's default, "Based on the User's hashed ID", gives one person the same subject in every provider of one Authentik; the end-to-end suite checks this on each run.
7. Bind the application to the same groups that may sign in to Unfold.

## 2. Configure the Unfold server

Set these variables on the existing Unfold Deployment. There are no default domains.

| Variable | Required | Meaning |
| --- | --- | --- |
| `UNFOLD_MCP_RESOURCE` | yes | The exact public URL clients connect to, such as `https://unfold.example.com/mcp`. Setting it turns the endpoint on; its path, outside `/api/` and `/.well-known/`, is where the endpoint is served |
| `UNFOLD_MCP_ISSUER` | yes | The issuer of the `unfold-mcp` provider, matched byte for byte, such as `https://id.example.com/application/o/unfold-mcp/` |
| `UNFOLD_MCP_CLIENT_IDS` | with `client-id` | Comma-separated client ids whose tokens are accepted, matched against the token's `client_id` or `azp`. An entry may be a Client ID Metadata Document URL (https, with a path, no query or fragment). Empty accepts any client your provider issued a token for this resource |
| `UNFOLD_MCP_TOKEN_AUDIENCE` | no | `resource` (default): `aud` must name `UNFOLD_MCP_RESOURCE`. `client-id`: also accept an `aud` that names one of `UNFOLD_MCP_CLIENT_IDS`, for a provider that ignores the `resource` parameter; a token for the resource is still accepted. The name and value match `ploeg-mcp`'s `PLOEG_MCP_TOKEN_AUDIENCE`. It is a transition setting: Unfold logs a warning at start, and each request it admits on a client id logs `"audience":"client"` on its `mcp.request` line, so you can see when the provider issues resource audiences and switch back to `resource`. Give the endpoint a client no other resource uses, because under `client-id` any token issued to that client is accepted |
| `UNFOLD_MCP_JWKS_URL` | no | The provider's key set; default is the `jwks_uri` of the issuer's discovery document |
| `UNFOLD_MCP_SCOPE` | no | The scope a token must carry; default `unfold:mcp` |
| `UNFOLD_MCP_REQUEST_SCOPES` | no | Space-separated scopes clients are told to request, such as `openid unfold:mcp offline_access`; the required scope is always added |
| `UNFOLD_MCP_MAX_TOKEN_LIFETIME` | no | Longest accepted `exp` minus `iat`, such as `10m`; default `10m`, at most `24h` |
| `UNFOLD_MCP_SUBJECT_NAMESPACE` | only across origins | The namespace browser accounts were created under. Unfold refuses to start when `UNFOLD_MCP_ISSUER` is on another origin than `auth.oidc.issuer` and this is unset, because subjects from another provider are not the same people |

There is no listen variable: the endpoint shares the Unfold server's port. Unfold refuses to start when an `UNFOLD_MCP_*` variable is set without `UNFOLD_MCP_RESOURCE`, outside live mode, or without `auth.oidc`.

```yaml
env:
  - {name: UNFOLD_MCP_RESOURCE, value: "https://unfold.example.com/mcp"}
  - {name: UNFOLD_MCP_ISSUER, value: "https://id.example.com/application/o/unfold-mcp/"}
  - {name: UNFOLD_MCP_CLIENT_IDS, value: unfold-mcp}
  - {name: UNFOLD_MCP_TOKEN_AUDIENCE, value: client-id}  # Authentik puts the client id in aud
  - {name: UNFOLD_MCP_REQUEST_SCOPES, value: "openid unfold:mcp offline_access"}
```

The pod needs egress to the provider's discovery and key URLs. Route `/mcp`, `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` on Unfold's host to the Service without stripping the `Authorization` header and without authentication at the gateway: Unfold answers the 401 that starts the client's sign-in. claude.ai and ChatGPT connectors cannot use it while the provider is reachable on the LAN and VPN only.

## 3. Connect a client

Each client finds the provider through `/.well-known/oauth-protected-resource/mcp`, opens the browser for sign-in, and stores and refreshes the token itself. The metadata names the provider's exact issuer: an MCP 2026-07-28 client records it, compares the `iss` of the authorization response to it before it redeems the code (RFC 9207), sends `resource` with the endpoint's URL, and keeps its client credentials per issuer. A client that asks for `offline_access` with `prompt=consent`, as the official MCP SDK does, gets Authentik's consent page ("Access to request new tokens without interaction") even under the implicit-consent flow; the person chooses **Continue** once. Name the pre-registered client id, because Authentik neither fetches Client ID Metadata Documents nor accepts dynamic registration.

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

## Protocol revisions

The endpoint serves both eras on the same URL and decides per request:

* **2026-07-28.** No handshake and no session: each request carries `_meta["io.modelcontextprotocol/protocolVersion"]` and `_meta["io.modelcontextprotocol/clientCapabilities"]`, and the `MCP-Protocol-Version`, `Mcp-Method` and, for `tools/call`, `Mcp-Name` headers, which must match the body (400 with `-32020` otherwise). `server/discover` lists the supported revisions, an unknown revision gets 400 with `-32022` and that list, and an unknown method, such as `ping`, which this revision removed, gets 404 with `-32601`. Every result carries `resultType` and the server's identity in `_meta`.
* **2025-11-25, 2025-06-18 and 2025-03-26.** The client sends `initialize`, Unfold answers it, mints no `Mcp-Session-Id`, and serves each later request on its own. A request without `MCP-Protocol-Version` is treated as 2025-03-26.

GET and DELETE on the endpoint get 405: there is no server-to-client stream and no session to end. Unfold uses none of the features 2026-07-28 deprecates or moves out of the core (Roots, Sampling, Logging), and never sends a request to the client over HTTP. The one extension it serves besides MCP Apps is Tasks, for a hand-off, behind the `mcp.tasks` flag ([below](#follow-a-hand-off-as-a-task)).

## What changes over HTTP

* `unfold_ask` spends only after the person confirms. A 2026-07-28 client that declares form elicitation gets an `input_required` result with the question, and retries the call with the answer under `inputResponses` and the `requestState` it received. That state is sealed for that person, that question and 10 minutes, and spends at most once. A retry without an answer is asked again. A client that closes the form without an answer (`cancel`) spends nothing and is told to ask in Unfold, with the link. A 2025 client, such as VS Code 1.142, cannot be asked over stateless HTTP, so it is refused with a link to the Work Item and nothing is spent. Ask it over stdio, or in Unfold.
* The action tools (`unfold_hand_off`, `unfold_approve_work`, `unfold_reject_work`, `unfold_stop_work`, `unfold_retry_work`, `unfold_add_note`, `unfold_take_over`, `unfold_hand_back`, `unfold_steer_session`, `unfold_message_session`, `unfold_answer_permission`) confirm the same way: `input_required` with the exact effect and cost, then one use of the sealed confirmation. They act only if the text the person agreed to is still what the action would do, and a 2025 client over HTTP is refused with a link to the Unfold page ([Act on work from an AI client](ask-from-an-ai-client.md#act-on-work)).
* `unfold_digest` without `since` covers the last 24 hours, because the "since your previous digest" mark is kept per machine by the stdio server.
* Every tool reads with the person's own account and Teams, at the lower of the stored role and the role the token's groups entitle. Its credential reaches only the API calls the tools make; it cannot approve editor sign-ins, manage credentials or reach the agent host.
* Every action is recorded in Unfold's Action Records and at Ploeg with the channel `mcp:<client name and version>` and, for a spend, the hash of the confirmation text the person agreed to ([ADR-0037](../adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md)). A 2025 client over HTTP names no client on its calls and shows as `mcp:unnamed client`.
* The confirmation key and its replay ledger live in the one Unfold process. A restart, or a second replica, refuses a pending confirmation, so the person is asked again and nothing is spent twice.
* A message is at most 1 MiB, and receiving it may take at most 15 seconds (the server's `requestTimeout`).

## Follow a hand-off as a task

With the `mcp.tasks` [feature flag](../../apps/unfold/docs/operations/feature-flags.md) on for a person, a confirmed `unfold_hand_off` answers a 2026-07-28 request that declares `io.modelcontextprotocol/tasks` in its `_meta` capabilities with a task ([Tasks extension 2026-07-28](https://github.com/modelcontextprotocol/ext-tasks/blob/main/specification/2026-07-28/tasks.md)) instead of its summary. `server/discover` lists the extension, and `tasks/get`, `tasks/update` and `tasks/cancel` answer, only while the flag is on; otherwise they get 404 with `-32601`. A request that does not declare the extension, any 2025 client and the stdio server get the synchronous result.

* **Confirm first.** The confirmation round trip finishes before the task is returned, and the task is returned only after Unfold assigned the Team's tracker user, so `tasks/get` answers at once.
* **No task store.** The task id is the tracker task, the Team, the highest Work Item id that existed for that task before the hand-off and the hand-off time, followed by a MAC over those, the person and the Tenant that owns the task connection. The person and Tenant come from each request's own sign-in, so another person, another Tenant, someone who lost the connection, a changed id or an unknown id all get `-32602`. A `tasks/*` request that sends `Mcp-Name` must send the task id there (`-32020` otherwise). The signing keys live in Unfold's encrypted internal state; a new key signs from every 30 days and the previous one still opens, so a task lives at least 30 and at most 60 days.
* **What `tasks/get` says.** It reads the tracker task's Work Items through `GET /api/task-sources/:source/tasks/:id/ploeg` and follows the first one of that Team with a higher id than before the hand-off. Until Ploeg makes it, the task is `working` with "Ploeg has not picked it up yet"; if the Team's tracker user is taken off the task first, it is `completed` with `isError`. Then it is `working` with why the Work Item waits and its fix, as `unfold_now` says it, and the Unfold link; `input_required` while it waits on questions for a person; and `completed` once a pull request waits for review or the Work Item is done, withdrawn or stale, with the pull request, the spend and the link. Withdrawn or stale is `completed` with `isError: true`; `failed` is not used. Every answer carries `statusMessage`, `ttlMs: null` and `pollIntervalMs: 30000`. One answer serves the same person and task for 15 seconds.
* **Questions.** Each waiting question is one form elicitation, at most 16, keyed `<question id>.<8 hex>` from the exact text shown, so a key never names two requests. The form quotes the agent's question as data and says what answering does: wait for the other questions, resume the Round or start over, with what it may spend. An `accept` with an `answer` goes through the same route and checks as `unfold_answer_question`, with the confirmation hash of that form's text. A `decline` or `cancel` records nothing and leaves the question open in Unfold. Keys that are unknown, already answered, or superseded because the effect changed are ignored.
* **Cancel stops following, never the work.** `tasks/cancel` is acknowledged and changes nothing in Unfold or Ploeg; `tasks/get` keeps reporting the Work Item's real state. Stop the Work Item with `unfold_stop_work`, which asks you to confirm.

## Verify

```sh
curl -si -X POST https://unfold.example.com/mcp | grep -i www-authenticate
curl -s https://unfold.example.com/.well-known/oauth-protected-resource/mcp
```

The first answers 401 with `resource_metadata` and `scope`; the second names the issuer under `authorization_servers` and the exact URL as `resource`. After signing in, ask the client "what waits for me in Unfold?".

## Test it end to end

`npm run test:mcp-e2e` in `apps/unfold` starts a throwaway Authentik with Docker Compose, provisions both providers as this page says, signs people in on Authentik's own login page in Chromium, and connects the official MCP TypeScript client through the real sign-in. A stand-in Ploeg and inference gateway count every admitted Ask, so nothing reaches a model and nothing is spent. It checks:

* that the access token carries `groups`, `azp`, `scope` and a 10-minute lifetime, and the same `sub` as the browser provider, so a person's MCP sign-in finds their browser account;
* refresh tokens, and that a refreshed token carries the groups Authentik has now: a demoted admin acts as a viewer, and a person in no admitted group gets 403;
* that a person reads only their own Teams' Work Items;
* that one `unfold_ask` confirmation spends exactly once, and that a replayed, tampered, foreign or other-question confirmation spends nothing; a 2025 client never spends;
* that Unfold's browser-client access token, the ID token and the refresh token are refused;
* that the session cookie alone gets 401, another origin cannot send a bearer token, and a wrong `Origin`, method or content type is refused;
* the MCP conformance scenarios `server-initialize`, `ping` and `tools-list`, which are 2025 scenarios;
* that no token, delegated credential or upstream key appears in a tool result or log line.

Set `UNFOLD_E2E_AUTHENTIK_URL` and `UNFOLD_E2E_AUTHENTIK_TOKEN` to run it against an Authentik you already have; each run provisions its own names. The nightly workflow runs it with Authentik as job services.

## Symptom → cause → fix

| Symptom | Cause | Fix |
| --- | --- | --- |
| `/mcp` answers 404 or the Unfold page | `UNFOLD_MCP_RESOURCE` is unset, or its path differs from the routed one | Set it to the exact URL, path included |
| The client never opens a browser | It cannot read the metadata or the provider's discovery | Check both URLs above from the client's machine |
| 401 `the token lives longer than 600s` | The provider issues longer access tokens | Set the access token validity to 10 minutes, or raise `UNFOLD_MCP_MAX_TOKEN_LIFETIME` |
| 401 `the token has no azp or scope` | The client sent an ID token | Use a client that sends the access token |
| 401 `the token is meant for another audience; its aud must be …` | The provider put the client id in `aud`, not the resource URL | Have the provider honour the `resource` parameter, or set `UNFOLD_MCP_TOKEN_AUDIENCE=client-id` and list the client id |
| 401 `the token is meant for another audience` under `client-id` | The token's `aud` names neither the resource nor a listed client id | Pass `unfold-mcp` as the client id, or add the id to `UNFOLD_MCP_CLIENT_IDS` |
| 401 `the token was issued to a client this server does not accept` | `UNFOLD_MCP_CLIENT_IDS` is set and the token's `client_id` or `azp` is not in it | Add the client id or its Client ID Metadata Document URL, or empty the list under `resource` |
| 401 `the token was issued by another issuer` | The token's `iss` differs from `UNFOLD_MCP_ISSUER` by even one character, such as a trailing slash | Copy the issuer exactly from the provider's discovery document |
| 403 `insufficient_scope` | The token lacks `unfold:mcp` | Attach the scope to the provider and sign in again |
| 403 "no Unfold account belongs to this identity" | The person never signed in to Unfold in the browser, or the two providers give different subjects | Sign in to Unfold in the browser once first, then connect again; if it persists, set both providers to the same subject mode |
| 403 "holds none of the groups this workbench admits" | The token carries no admitted group or role | Check the `unfold:mcp` mapping returns groups, and that the person is in an admitted group |
| 503 "signing keys are unavailable" | Unfold cannot reach the provider's key set | Check egress and `UNFOLD_MCP_JWKS_URL` |
| `unfold_ask` or an action tool says the client cannot confirm | The client speaks 2025 over HTTP, or declares no form elicitation | Use it over stdio, or act in Unfold |
| An action says "the confirmation was closed without an answer" and you never saw a question | The client declares elicitation but cancels it unseen; Claude Code's VS Code extension does, within about 50 ms | Open the link it gives and act in Unfold, or use the terminal `claude` |
