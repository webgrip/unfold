---
status: proposed
date: 2026-10-30
decision-makers: Ryan Grippeling
review-by: 2027-01-31
---

# The identity provider provisions and deprovisions people through SCIM and pushed Shared Signals

## Context and Problem Statement

The security audit of 2026-10-29 found that removing someone at the identity provider does not remove their access to Unfold. A browser session lasts up to `auth.sessionHours`, an editor credential 30 days, an Agents-window connection token slides with use, and the sign-in tokens Unfold keeps to prove a person to Ploeg go on refreshing. A changed role or group applies only at the next browser sign-in, and nothing provisions or deprovisions anyone.

System ADR-0050 ([pull request #697](https://forgejo.webgrip.dev/webgrip/unfold/pulls/697), accepted by the owner and not yet merged) names SCIM 2.0 as the standard for provisioning and lists its absence as a known violation. How does the identity provider's decision reach Unfold at once, and how does Unfold make it take effect everywhere?

## Decision Drivers

* Removing a person ends every credential they hold within one request, not at an expiry.
* A membership or role change applies to the next request.
* An agency uses Authentik, Okta or Entra ID; one standard implementation serves all of them (system ADR-0050 rule 2).
* Each new route is off until an administrator turns it on.

## Considered Options

* **A SCIM 2.0 service provider, a Shared Signals receiver for pushed SETs, and one revocation function every path calls**
* SCIM only
* Shorter credential lifetimes, and an OIDC check at every request

## Decision Outcome

Chosen option: "**A SCIM 2.0 service provider, a Shared Signals receiver for pushed SETs, and one revocation function every path calls**", because SCIM is the only standard all three identity providers speak for provisioning, and Shared Signals adds session and credential events that SCIM does not carry.

* Unfold serves SCIM 2.0 ([RFC 7643](https://www.rfc-editor.org/rfc/rfc7643.html), [RFC 7644](https://www.rfc-editor.org/rfc/rfc7644.html)) at `/scim/v2` behind the `identity.scim` flag, authenticated by one bearer token from the environment. A Group's display name grants the membership `unfold/<tenant>/<role>` or `unfold/<tenant>/client/<client>` already names at sign-in.
* Unfold receives SETs ([RFC 8417](https://www.rfc-editor.org/rfc/rfc8417.html)) by push ([RFC 8935](https://www.rfc-editor.org/rfc/rfc8935.html)) at `/ssf/events` behind the `identity.shared-signals` flag, verified against each configured transmitter's JWKS, issuer, audience and `jti`, and acts on CAEP 1.0, RISC 1.0 and [RFC 9967](https://www.rfc-editor.org/rfc/rfc9967.html) events. It does not poll ([RFC 8936](https://www.rfc-editor.org/rfc/rfc8936.html)): push needs one route and no cursor that must survive restarts.
* `Revocation` in `src/identity/revocation.ts` is the one way credentials end: sign-out for one sign-in, SCIM and Shared Signals for a whole person.
* An account the identity provider turned off stays off for every sign-in path until the same channel turns it back on.

### Consequences

* Good, because deprovisioning at the identity provider ends Unfold access at once, on every credential type.
* Good, because the same SCIM code serves Authentik, Okta and Entra ID, quirks included.
* Bad, because a SCIM Group the identity provider does not push is a membership Unfold removes at the next Group change; the operator has to push every `unfold/…` group.
* Bad, because a SaaS identity provider must reach Unfold's public URL to push, and Unfold leaves stream creation at the transmitter to the operator.
* Bad, because only Okta and Authentik transmit SETs today, and only `session-revoked` and `credential-change`.

### Confirmation

`test/identity-scim.test.ts` deactivates and deletes a SCIM User and checks that the browser session, editor credential, Agents-window tokens and kept sign-in tokens are gone, that the next sign-in is refused, and that a Group member removed through SCIM loses the Tenant's repositories on the next request. `test/identity-revocation.test.ts` checks every credential type against `Revocation`, and `test/identity-shared-signals.test.ts` checks the SET signature, typ, issuer, audience, age, `jti` replay and an unknown event.

## Pros and Cons of the Options

### SCIM only

* Good, because it is one protocol.
* Bad, because it carries no session revocation or credential change, which Okta and Authentik already send as CAEP events.

### Shorter lifetimes and an OIDC check at every request

* Good, because it needs nothing from the identity provider.
* Bad, because editor credentials and Agents-window tokens have no OIDC token to check, and a check per request ties every request to the identity provider's availability.

## More Information

* Operations: [Provision and deprovision people](../operations/provision-and-deprovision-people.md).
* OpenSpec change: `openspec/changes/scim-and-shared-signals/`.
* Specifications: [OpenID Shared Signals Framework 1.0](https://openid.net/specs/openid-sharedsignals-framework-1_0-final.html), [CAEP 1.0](https://openid.net/specs/openid-caep-1_0-final.html), [RISC 1.0](https://openid.net/specs/openid-risc-1_0-final.html), [RFC 9493](https://www.rfc-editor.org/rfc/rfc9493.html).
* Builds on [ADR 0037](0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md) (editor credentials) and [ADR 0055](0055-unfold-proves-the-person-to-ploeg-with-a-token-exchanged-from-their-sign-in.md) (kept sign-in tokens).
