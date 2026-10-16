---
status: accepted
date: 2026-10-10
decision-makers: Ryan Grippeling
---

# Unfold also serves its own read-only MCP tools, next to ploeg-mcp

## Context and Problem Statement

[ADR-0011](adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md) put the only MCP server on Ploeg's operator API, and rejected a server inside the Unfold application. Since then, more of what a person asks about lives only in Unfold. Unfold decides why a Work Item waits and what fixes it (`public/core/reasons.js`), owns the Run card ([ADR-0030](adr-0030-run-cards-are-an-unfold-domain-on-top-of-ploegs-delivery-facts.md)), and runs workbench sessions. Ploeg names none of its consumers ([Ploeg ADR-0069](../../apps/ploeg/docs/adrs/0069-ploeg-names-none-of-its-consumers.md)), so `ploeg-mcp` can say a Work Item is `needs_human` and quote Ploeg's close reason. It cannot say what Unfold says next: "Budget held, not spent. Find out why those Runs failed first." On 2026-10-10 the owner asked for MCP access to both. Where does Unfold's part live?

## Decision Drivers

* A person asks their own AI client "why does Work Item 184 wait, and what do I do?" and gets the answer the Unfold page gives.
* Unfold ships no production npm dependencies ([Unfold ADR-0002](../../apps/unfold/docs/adrs/0002-native-node-and-single-writer-storage.md)).
* The reason and fix are computed once, by the code the browser uses.
* The server reads as the person, with that person's Teams, never with an operator token.

## Considered Options

* A separate `unfold-mcp` process in the Unfold application that reads Unfold's HTTP API with the person's editor credential
* Only `ploeg-mcp`, with Unfold's reasons moved into Ploeg
* An MCP route inside Unfold's HTTP server

## Decision Outcome

Chosen option: "A separate `unfold-mcp` process", because it gives the client Unfold's own reasons and fixes without a dependency, without a new server route, and without giving Ploeg a consumer's vocabulary.

* `apps/unfold/src/mcp.ts` implements MCP over newline-delimited stdio JSON-RPC by hand: `initialize` (revisions 2025-11-25, 2025-06-18 and 2025-03-26), `ping`, `tools/list` and `tools/call`. `npm run mcp` starts it.
* It reads `UNFOLD_URL` and `UNFOLD_TOKEN`, an editor credential ([Unfold ADR-0037](../../apps/unfold/docs/adrs/0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md)). `npm run mcp -- login` runs the editor sign-in and prints the credential. The person approves it in the browser, and can revoke it there.
* Four read-only tools: `unfold_now`, `unfold_find_work`, `unfold_get_work` and `unfold_sessions`. Each waiting Work Item carries the reason, chip, sentence and fix from `listReason` and `detailReason`, the same functions Now and the Work Item page use, and a link to its Unfold page.
* Text from trackers and agents sits under `untrusted`. A demo answer says it is the demo and invents no spend.
* `ploeg-mcp` stays as [Ploeg ADR-0081](../../apps/ploeg/docs/adrs/0081-ploeg-serves-its-operator-reads-as-mcp-tools-through-ploeg-mcp.md) records it: Ploeg's facts for any consumer, under the operator token. ADR-0011's tool names become `ploeg_*` for that reason.
* ADR-0011's other rules still hold for both servers: read first, Runs get neither server, and write tools need a person's confirmation. Neither server has write tools yet.

### Consequences

* Good, because a client gets the same verdict and fix as the Unfold page, from the same code.
* Good, because the person's own Teams and revocation apply; no shared token sits on a laptop.
* Bad, because two MCP servers exist, and a person who wants both registers both.
* Bad, because the hand-written protocol covers only the old `initialize` handshake over stdio. A client that only speaks the stateless 2026-07-28 revision cannot use `unfold-mcp` until it gains `server/discover`.
* Bad, because the editor credential is labelled "VS Code" in the credential list until the sign-in takes a client name.

### Confirmation

`apps/unfold/test/mcp.test.ts` drives every tool against the demo application and a live application with an editor credential. It covers the stdio framing, a refused token that never appears in the answer, a timeout, a redirect and an unreachable server. `mise exec -- npm test` runs it.

## Pros and Cons of the Options

### Only ploeg-mcp, with Unfold's reasons moved into Ploeg

* Good, because one server.
* Bad, because it puts a consumer's words and fixes into Ploeg, against Ploeg ADR-0069, and duplicates the browser's code.

### An MCP route inside Unfold's HTTP server

* Good, because no extra process and no port-forward.
* Bad, because a remote MCP route needs the OAuth resource-server work ADR-0011 left for phase 3, and a public route without it would accept long-lived bearer credentials from anywhere.

## More Information

* Amends ADR-0011's "where": Unfold's own facts come from `unfold-mcp`, and Ploeg's facts come from `ploeg-mcp`.
* How-to: [Ask Unfold and Ploeg from an AI client](../how-to/ask-from-an-ai-client.md).
* 2026-10-11 — A fifth read-only tool, `unfold_spend`, reports spend per Team and the finished Runs whose budget hold Ploeg has not released. It reads the same summary the Activity page shows, so a blocked account still unsettled an hour after its Run appears once Ploeg reports it ([ploeg-hq #105](https://github.com/ploeg-hq/ploeg/pull/105)).
* 2026-10-11 — Amended, as decided by the owner: `unfold_ask` is the first tool that can spend. It answers standing questions from the record for free (`recordOnly`), and asks a model only with `use_model: true` after the person accepts an MCP elicitation that names the per-Ask Budget and what is left of the Ask Allowance. A client without elicitation is refused with a link to the Work Item. The other tools stay read-only. The editor sign-in now names its client (`unfold-mcp on <host>`), so an `unfold-mcp` credential no longer shows as "VS Code"; Unfold builds the name, never the client.
* 2026-10-13 — `unfold_digest` reports what changed since a moment, by default since the person's previous digest, which `unfold-mcp` remembers in a local state file per Unfold URL. It counts with the Now page's own `digestCounts` and reads only, like the other tools except `unfold_ask`.
* 2026-10-16 — Amended: `unfold-mcp` is also served over stateless Streamable HTTP, as an OAuth 2.1 resource server for Authentik, from the Unfold server itself, and speaks MCP 2026-07-28 next to the 2025 revisions, on stdio too. This takes the option "An MCP route inside Unfold's HTTP server", which this record rejected only because a remote route needed the resource-server work ADR-0011 left for later; that work is now done, following [Ploeg ADR-0081's amendment of 2026-10-13](../../apps/ploeg/docs/adrs/0081-ploeg-serves-its-operator-reads-as-mcp-tools-through-ploeg-mcp.md#amendment-2026-10-13-a-remote-transport) ([gap dossier](../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md), phase 2 items 5 and 7; [VS Code 1.142 fit](../../apps/unfold/docs/research/2026-10-16-vscode-1-142-fit.md), recommendation 6). How-to: [Serve Unfold's MCP tools over HTTPS](../how-to/serve-unfold-mcp-over-https.md).
    * Where: the route lives in the existing Unfold process, on the path of `UNFOLD_MCP_RESOURCE` (such as `/mcp`), and is off unless that variable is set. It is the smallest shape: no second Deployment or image, and the tools reach Unfold's API on the process's own loopback address. It needs live mode and `auth.oidc`.
    * Transport: one POST endpoint with JSON responses and no session id. A request carrying `_meta["io.modelcontextprotocol/protocolVersion"]` of 2026-07-28 must match its `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers and gets `resultType`; `server/discover` answers with the supported revisions and the instructions. An `initialize` request is answered under 2025-11-25, 2025-06-18 or 2025-03-26, statelessly. GET answers 405, and a foreign `Origin` 403.
    * Tokens (`src/mcp-auth.ts`, written with `node:crypto` because the application takes no new dependency): a signed JWT access token with an asymmetric algorithm (RS, PS or ES); `iss` matched byte for byte; `aud` naming and `azp` being one of `UNFOLD_MCP_CLIENT_IDS`; `exp`, `iat`, `sub` and `scope` required; 60 seconds of skew; at most 10 minutes from `iat` to `exp` unless `UNFOLD_MCP_MAX_TOKEN_LIFETIME` says otherwise. An unknown key id refetches the key set at most once per 30 seconds. RFC 9728 metadata is served at `/.well-known/oauth-protected-resource` and its path-inserted form; refusals are RFC 6750 challenges with `resource_metadata`, and a token without `UNFOLD_MCP_SCOPE` (default `unfold:mcp`) gets 403 `insufficient_scope`.
    * Identity: the token's subject alone maps to the Unfold account browser sign-in gives the same subject, under `auth.oidc.subjectNamespace` or its issuer, as Ploeg maps by subject. No email or name is ever used, because neither is bound to the subject. `UNFOLD_MCP_ISSUER` must share the origin of `auth.oidc.issuer`, unless `UNFOLD_MCP_SUBJECT_NAMESPACE` names the namespace explicitly, and both providers must use the same subject mode. An unmapped subject is 403; there is no shared service identity.
    * Role: the token's own groups or role claim are entitled by the same `auth.oidc` roles map as browser sign-in. A token that entitles no role is 403, and the request acts at the lower of that role and the stored one, so removing a person from a group at the provider takes effect at their next token, and a token never raises the stored role.
    * Reach: every tool calls Unfold's API as that account through an in-memory credential that lives for the one request, holds the capped role, and is accepted only on the method and path pairs the tools call (`delegatedRoutes` in `src/auth.ts`); every other route, the agent host and editor-credential routes included, refuses it. The caller's access token never leaves the MCP endpoint.
    * Limits: a message is cut off at 1 MiB while it streams in, the server's `requestTimeout` of 15 seconds bounds how long receiving it may take, and the identity provider's discovery and key set are cut off at 1 MiB while they stream in.
    * `unfold_ask` over 2026-07-28 asks for confirmation through an `input_required` result with a form `elicitation/create` and a `requestState` sealed with a per-process HMAC key, bound to the account and the question, valid for 10 minutes and redeemable once. Key and ledger are per process and fail closed: another replica or a restart refuses the confirmation, and nothing is spent. Over stateless HTTP, a 2025 client cannot be asked, because the server sends no requests of its own there; it is refused before anything is spent, like a client without elicitation. The `unfold_digest` default of "since your previous digest" falls back to the last 24 hours over HTTP, because the state file is per machine.
    * Confirmation: `apps/unfold/test/mcp-http.test.ts` signs tokens with generated RSA and EC keys against a local key set and covers the metadata, the 401 challenge, a wrong audience or client, expiry beyond the skew, a long lifetime, an ID token, HS256 and `none`, 403 `insufficient_scope`, a mapped account listing and calling tools, an unmapped subject's 403 even with another account's verified email, demotion and de-provisioning at the provider, each verifier rule on its own (time claims, `crit`, curve, JWK `alg`, RSA size, `use`, a missing `kid`, the discovery issuer, canonical base64url, the size caps), `server/discover`, header mismatches, a 2025 `initialize`, the key refetch limit, `unfold_ask` refusing to spend, and that the API never sees the caller's token. `apps/unfold/test/mcp.test.ts` covers the confirmation round trip: tampered, foreign, other-question, expired and replayed state spend nothing. `apps/unfold/test/auth-delegate.test.ts` covers the delegated credential's routes, role cap, expiry and revocation.
    * Re-evaluation triggers: Authentik supports RFC 8707, so `aud` can name the resource; claude.ai or ChatGPT connectors must reach Unfold, which needs a public route and a public authorization server; Unfold runs more than one replica, which needs a shared confirmation key and ledger.
* 2026-10-17 — Amended by [ADR-0037](adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md): both MCP servers act (assign, approve, reject, retry, stop, steer) after the person confirms, and every action names its person, channel and confirmation.
