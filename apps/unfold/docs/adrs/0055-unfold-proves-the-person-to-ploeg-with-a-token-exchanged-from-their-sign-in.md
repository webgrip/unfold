---
status: proposed
date: 2026-10-24
decision-makers: Ryan Grippeling
review-by: 2027-01-31
---

# Unfold proves the person to Ploeg with a token exchanged from their sign-in

## Context and Problem Statement

Unfold verifies a person's Authentik sign-in, then calls Ploeg's operator API with one static consumer token and *names* the person in `X-Ploeg-Actor` and `X-Ploeg-Acting-User`. Ploeg cannot check those headers ([RFC-0011](../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md), property P2). Ploeg ADR-0150 (ploeg-hq/ploeg #255, #272) now accepts a person token next to the consumer token in `X-Ploeg-Person-Token`: a JWT the identity provider issued for an audience the consumer declares. Ploeg then records the change as *proven* and refuses a header that names someone else. Headers alone still work, recorded as *asserted*.

To send such a token, Unfold needs something to exchange. Until now it kept only the ID token's claims and discarded the access token at sign-in.

How does Unfold get a person token for each change it makes for a person, without handing tokens to the browser or breaking anything when the token cannot be had?

## Decision Drivers

* RFC-0011 section 1: Unfold stays a confidential backend for the browser. Tokens stay on the server.
* RFC-0011 section 2 and MCP's "no pass-through" rule: a service exchanges the token it received and never forwards it.
* A person must never be locked out of their work because the identity provider or the exchange is down. Ploeg accepts asserted headers for one more release.
* Authentik exchanges only an access token that is still in its database, and issues refresh tokens only when the provider allows that grant. The `unfold` provider's access tokens live one hour; Unfold sessions last twelve.
* Off by default, so a deployment that has not set up the exchange behaves exactly as before.

## Considered Options

* **Keep the access and refresh token per login, encrypted; exchange before each change; fall back to headers and say so**
* Forward the person's access token to Ploeg unchanged
* Refuse the change when no person token can be had

## Decision Outcome

Chosen option: "**keep the tokens per login, exchange before each change, fall back and say so**", because it proves the person whenever it can and never stops their work when it cannot.

1. **Configuration.** `ploeg.personTokens` = `{ tokenUrl, clientId, clientSecretEnv, audience }`: the identity provider's token endpoint, the confidential exchange client, the environment variable holding its secret, and the target audience. Without it, nothing below happens. It needs `auth.oidc`.
2. **Keeping.** At single sign-on Unfold keeps the access token, its expiry and the refresh token when the provider returns one. They are kept in the store's encrypted internal state, keyed by the hash of that browser login. Signing out deletes them, and store upkeep deletes them once the login expires. They never leave the server.
3. **Exchanging.** Before each operator change for a person (`X-Ploeg-Actor` and `X-Ploeg-Acting-User` both naming them), Unfold exchanges the kept access token (RFC 8693, `subject_token_type` access token, `audience` from the configuration). It checks that the returned token's `sub` is the person's, caches it per login until 30 seconds before it expires, and sends it as `X-Ploeg-Person-Token` beside the existing headers. Reads send no person token.
4. **Which login.** A browser request uses its own login. A change from an editor credential, the Agents window, the Agents-window chat's tools or background execution work uses the person's newest live browser login. `unfold-mcp` over HTTP uses no kept login: it exchanges the access token of that request, which the credential Unfold delegates for that request carries for the same person. It is exchanged at most once per request, never refreshed or kept, and dropped with the credential when the request ends or the token expires, whichever comes first.
5. **Falling back.** When the access token has expired, Unfold uses the refresh token, and the refreshed tokens replace the kept ones. A provider that refuses the subject token gets one refresh and one more try. In every other case the change goes out with the headers alone: no kept tokens, an expired token without a refresh token, an unreachable provider, a missing secret, or a token for another subject. When Ploeg answers 401 to a change carrying a person token, Unfold sends the change once more without it; Ploeg refuses such a request before acting on it. The Status page then tells the person, in plain words, that Ploeg records their actions as named by Unfold, not proven, and what restores it.
6. **Not proven, on purpose.** An administrator acting for another person's session, the `unfold-cards` actor and the delivery verifier's own credential send no person token. Neither does a delegated credential that carries no proof for the person it acts as.

### Consequences

* Good, because Ploeg records most changes made in Unfold as proven by the person's own sign-in, and refuses a forged actor header on them.
* Good, because nothing changes for a deployment without `ploeg.personTokens`, and no failure of the exchange blocks a person.
* Bad, because Unfold now holds bearer tokens for each signed-in person: the access token for an hour and, with refresh, a refresh token for as long as the provider allows. Accepted: they are encrypted under the same key as linked accounts, bound to one login and deleted with it, and an exchanged token lives at most five minutes.
* Bad, because without the provider's `refresh_token` grant and `offline_access`, proof lapses one hour after sign-in for the rest of a twelve-hour session. Accepted for the first step. The Status page says so, and a deployment turns on refresh to close it.
* Neutral, because a change for one person may use the token of that person's other browser login, when it does not come from a browser. It proves the same person.
* Neutral, because the exchange client federates both providers people sign in to Unfold with, the browser's and `unfold-mcp`'s, and exchanges both for the one audience Ploeg knows Unfold by. Until it federates `unfold-mcp`, the identity provider refuses those exchanges and the changes stay asserted.

### Confirmation

* `test/person-proof.test.ts` in `apps/unfold`: configuration validation and off-by-default, the exchange request's form fields, caching until 30 seconds before expiry, refresh on expiry and after a refused subject token, fallback to headers with the Status page line, no token for another acting person, `unfold-cards` or `unfold-mcp` over HTTP, a token for another subject never sent, retry without the token after Ploeg's 401, encryption at rest and deletion at sign-out and expiry, and a signed-in browser approval whose POST carries the token while reads, responses and logs do not. For delegated credentials: `unfold-mcp` over HTTP exchanges that request's access token once per request and never the kept sign-in, falls back on an expired, refused, foreign or rejected token without logging it, and the chat's tools use the kept sign-in.
* `test/mcp-http.test.ts`: an approval through `unfold-mcp` over HTTP reaches Ploeg with a person token exchanged from the caller's access token, which itself is never forwarded.
* `test/auth-delegate.test.ts`: a delegated credential hands over its proof only while it and the carried token are live, and only for its own person.
* `test/execution.test.ts`: execution changes go through person proof with their owner and acting person; refreshes do not.
* All of it runs through `mise run verify`.

## Pros and Cons of the Options

### Forward the person's access token to Ploeg unchanged

* Good, because it needs no exchange client.
* Bad, because the token's audience is Unfold, so Ploeg would accept a token minted for someone else, and MCP and RFC 9700 forbid that pass-through.

### Refuse the change when no person token can be had

* Good, because every change Ploeg accepts from Unfold would be proven.
* Bad, because an identity provider outage or an expired token would stop people's work, and Ploeg still accepts headers for one release.

## Re-evaluation triggers

* Ploeg stops accepting asserted headers: the fallback then becomes a refusal with a sign-in prompt.
* Unfold registers for back-channel logout or adds step-up before approvals (RFC-0011 section 1).
* `unfold-mcp` gets its own exchange client, or the exchange client stops federating it.
* Authentik binds access tokens to a key (DPoP).

## More Information

* Ticket VIK-2392. Design: [RFC-0011](../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md) sections 1 and 2. Ploeg ADR-0150.
* Configure it: [Live operation, Proving people to Ploeg](../operations/live.md#proving-people-to-ploeg).
* 2026-10-24: proposed with its implementation.
* 2026-10-25: still proposed. `unfold-mcp` over HTTP and the Agents-window chat's tools now prove the person too (VIK-2392). The exchange client federates the `unfold-mcp` provider from homelab-cluster [#903](https://forgejo.webgrip.dev/webgrip/homelab-cluster/pulls/903) on; before that, those exchanges are refused and fall back to the headers.
