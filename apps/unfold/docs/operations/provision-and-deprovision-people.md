---
type: how-to
audience: [owner, operator, integrator]
owner: unfold
last_verified: 2026-10-30
verified_by: "Written with the implementation on branch feat/scim-and-shared-signals: src/identity/ (settings.ts, accounts.ts, revocation.ts, scim.ts, shared-signals.ts, lifecycle.ts), src/auth.ts, src/ahp/host.ts and src/http.ts; test/identity-scim.test.ts, test/identity-shared-signals.test.ts and test/identity-revocation.test.ts passed. The specifications were read at the URLs cited on 2026-10-30. The identity provider rows were read in each vendor's documentation on 2026-10-30; none was run against a real Authentik, Okta or Entra ID tenant, and the rows marked unverified were not confirmed at all."
---

# Provision and deprovision people (SCIM and Shared Signals)

Your identity provider decides who may use Unfold. Two standard channels carry its decisions to Unfold as they happen, instead of at the person's next browser sign-in:

- **SCIM 2.0** ([RFC 7643](https://www.rfc-editor.org/rfc/rfc7643.html), [RFC 7644](https://www.rfc-editor.org/rfc/rfc7644.html)) provisions people and groups. Unfold is the *service provider* at `/scim/v2`; the identity provider is the client that pushes Users and Groups to it.
- **Shared Signals** ([OpenID Shared Signals Framework 1.0](https://openid.net/specs/openid-sharedsignals-framework-1_0-final.html), with [CAEP 1.0](https://openid.net/specs/openid-caep-1_0-final.html) and [RISC 1.0](https://openid.net/specs/openid-risc-1_0-final.html), all Final) carries security events, such as "this session was revoked", as signed [Security Event Tokens](https://www.rfc-editor.org/rfc/rfc8417.html) (SETs). Unfold is a *receiver* at `/ssf/events`.

Both need single sign-on (`auth.oidc`, see [live operation](live.md#signing-in-with-the-estate)), because they name the people single sign-on signs in. Each part has its own feature flag, off by default, and while its flag is off its path answers 404.

## What ending someone's access ends

When the identity provider deactivates or deletes a person, Unfold turns their account off and ends every credential they hold, in one call ([`Revocation.person`](../../src/identity/revocation.ts)). Sign-out ends one sign-in through the same code ([`Revocation.signIn`](../../src/identity/revocation.ts)).

| Credential | How long it lasts on its own | After revocation |
| --- | --- | --- |
| Browser session | `auth.sessionHours` (12 at the estate) | Deleted; the next request is 401 |
| Editor credential (`vle_…`, VS Code and `unfold-mcp`) | 30 days, 14 idle | Deleted; the next request is 401 |
| Agents-window connection token | Slides with use | Deleted, and its open connections close with 1008 |
| Delegated credential (`vlm_…`, MCP over HTTP and the Agents-window chat) | 5 minutes, in memory | Dropped |
| Kept sign-in tokens (access and refresh token for [person proof](live.md)) | Until the refresh token stops | Deleted, so no new Ploeg person token can be minted |
| Editor sign-in approved but not yet collected | 10 minutes | Dropped |

A turned-off account cannot sign in again: the single sign-on callback answers `/?login_error=account_disabled`, MCP over HTTP refuses its access token, and an Agents-window token that survived a restart is refused at its next use. The account turns back on only through the channel that turned it off: SCIM `active: true` undoes a SCIM deactivation or deletion, and RISC `account-enabled` undoes a Shared Signals disable.

Memberships and roles read from the store on every request, so a Group change applies to the very next request. An open Agents-window connection picks up a role change at its next message or its once-a-minute check.

## Turn it on

1. Generate a long random token, at least 32 characters, and put it in the workbench's environment, for example `UNFOLD_SCIM_TOKEN` from the credentials Secret. Never put it in the configuration file.
2. Add the `identity` block to the configuration profile:

   ```json
   "identity": {
     "scim": { "tokenEnv": "UNFOLD_SCIM_TOKEN", "linkBy": "externalId" },
     "sharedSignals": {
       "audience": "https://unfold.example",
       "transmitters": [
         { "name": "authentik", "issuer": "https://auth.example/application/ssf/unfold/", "jwksUri": "https://auth.example/application/ssf/unfold/jwks/", "authorizationEnv": "UNFOLD_SSF_AUTHENTIK_AUTHORIZATION" }
       ]
     }
   }
   ```

3. Turn the flags on in the flag document ([feature flags](feature-flags.md)): `identity.scim` and `identity.shared-signals`.

| Setting | Meaning |
| --- | --- |
| `scim.tokenEnv` | The `UNFOLD_` environment variable holding the bearer token. Unfold refuses to start when it is unset or shorter than 32 characters |
| `scim.linkBy` | Which SCIM attribute names the person single sign-on signs in: `externalId` (the default) or `userName` when that attribute carries the identity provider's OIDC `sub`, or `email` to link by the email the person signs in with |
| `sharedSignals.audience` | The `aud` every SET must name. Defaults to `baseUrl` |
| `sharedSignals.maxAgeHours` | How old a SET's `iat` may be, 1 to 168 hours, default 24 |
| `transmitters[].name` | A short name for records and logs |
| `transmitters[].issuer` | The `iss` its SETs carry |
| `transmitters[].jwksUri` | Where its signing keys are published (https) |
| `transmitters[].audience` | An audience for this transmitter only |
| `transmitters[].authorizationEnv` | An `UNFOLD_` environment variable holding the exact `Authorization` header the transmitter sends with each push, when its stream has one |

## SCIM

### What Unfold serves

| Path | Behaviour |
| --- | --- |
| `GET /scim/v2/ServiceProviderConfig` | PATCH and filtering supported; bulk, sort, ETags and password change not |
| `GET /scim/v2/ResourceTypes`, `/Schemas` | `User` and `Group`, with the attributes below |
| `GET /scim/v2/Users`, `/Groups` | Pages with `startIndex` (from 1) and `count` (at most 200); `filter` takes one `eq` on `userName`, `externalId`, `id` or `emails` for Users, and `displayName`, `externalId` or `id` for Groups; `excludedAttributes=members` leaves Group members out |
| `POST /scim/v2/Users`, `/Groups` | 201 with `Location`; 409 `uniqueness` for a `userName` or `displayName` already held, without regard to case |
| `GET`, `PUT`, `PATCH`, `DELETE /scim/v2/Users/{id}`, `/Groups/{id}` | `PATCH` takes `add`, `replace` and `remove` in any case, with or without a path; `remove` on `members[value eq "…"]` or on `members` with a list; booleans also as `"True"` and `"False"` |

A User keeps `userName`, `externalId`, `displayName` (or `name.formatted`, or given and family name), `emails` and `active`, and shows its `groups`. Unfold ignores other attributes. Errors are SCIM Error responses (`urn:ietf:params:scim:api:messages:2.0:Error`) with a `scimType` where RFC 7644 defines one. Every request without the right `Authorization: Bearer <token>` is 401.

### How a User becomes an Unfold account

Unfold keys an account by the identity provider's issuer and OIDC `sub`. With `linkBy: externalId` or `userName`, a new SCIM User names that account straight away, and Unfold creates it if the person never signed in. The attribute that links cannot change afterwards; a `PUT` that changes it is 400 `mutability`. With `linkBy: email`, a User whose primary email (or email-shaped `userName`) is already an account's name links to it; otherwise it waits and links at that person's first sign-in with that email.

### Groups

A Group's `displayName` grants what a sign-in group grants:

- `unfold/<tenant>/viewer`, `unfold/<tenant>/member` or `unfold/<tenant>/admin`: that Access Role in the Tenant ([system ADR-0017](../../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md));
- `unfold/<tenant>/client/<client>`: that Client membership;
- a group in `auth.oidc.roles` (such as `unfold-admins`): that role.

When a Group changes, each member whose Groups changed gets their memberships recomputed from all their SCIM Groups, and their role set from the role groups. A member who loses the last role group a SCIM Group gave them is signed out everywhere, so their next sign-in asks the identity provider again. Push every `unfold/…` group the identity provider grants: a group it does not push is a membership Unfold removes at the next Group change.

### Set up the identity provider

| | Authentik | Okta | Entra ID |
| --- | --- | --- | --- |
| Where | A SCIM provider as a backchannel provider of the Unfold application ([docs](https://docs.goauthentik.io/add-secure-apps/providers/scim/)) | Provisioning on a SCIM 2.0 app integration ([docs](https://developer.okta.com/docs/guides/scim-provisioning-integration-prepare/main/)) | Enterprise application → Provisioning → Automatic ([docs](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/use-scim-to-provision-users-and-groups)) |
| URL | `https://unfold.example/scim/v2` | `https://unfold.example/scim/v2`, user name field `userName` | Tenant URL `https://unfold.example/scim/v2` |
| Token | The token, as the provider's token | HTTP header authentication with the token | Secret Token: the token |
| `linkBy` | `externalId`: Authentik sends `externalId` = the user's `uid`, which is its default OIDC `sub` (subject mode "hashed user ID") | `email`: the OIDC `sub` is the Okta user id, which Okta does not send in SCIM by default (unverified) | `email`: the ID token's `sub` is pairwise per application and is not a SCIM attribute; check the ID token carries `email` (unverified) |
| Updates | `PUT` for Users, `PATCH` for membership, a full sync every hour | `PUT` for attributes, `PATCH` for `active` and membership | `PATCH` with capitalised `op` and string booleans, unless the `aadOptscim062020` flag is set; both forms work |
| Deprovisioning | `DELETE /Users/{id}` | `active: false`; Okta never deletes Users | `active: false` on unassignment or soft delete, `DELETE` at hard delete |
| Groups | Every group bound to the application, by `displayName` | Only groups chosen under Push Groups | Assigned groups, by `displayName` |

Each identity provider's behaviour above comes from its documentation and Authentik's source; none of it was run against a real tenant.

## Shared Signals

### Push, not poll

Unfold accepts SETs pushed to `POST /ssf/events` ([RFC 8935](https://www.rfc-editor.org/rfc/rfc8935.html)) and does not poll ([RFC 8936](https://www.rfc-editor.org/rfc/rfc8936.html)). Push needs one route and acts the moment the transmitter sends; polling would need a poller per transmitter, its cursor and acknowledgements to survive restarts, and would still act only at the next poll. Push needs the identity provider to reach Unfold's public URL, which a SaaS identity provider can.

Each push carries `Content-Type: application/secevent+jwt`. Unfold answers 202 with an empty body when it took the SET, and otherwise 400 (401 for a wrong `Authorization` header) with RFC 8935's `{"err","description"}`:

| Check | Refusal |
| --- | --- |
| A JWS whose header `typ` is `secevent+jwt` (SSF 1.0 section 4.1.1) | `invalid_request` |
| `iss` is a configured transmitter | `invalid_issuer` |
| Signed with a key from that transmitter's JWKS (RS, PS or ES, 256 to 512) | `invalid_key` |
| `aud` names the audience | `invalid_audience` |
| `jti` present, `iat` present, not in the future and not older than `maxAgeHours` | `invalid_request` |
| The `Authorization` header matches, when `authorizationEnv` is set | `authentication_failed` |

A SET whose `jti` the same transmitter already sent is acknowledged with 202 and not acted on again. Unfold remembers each `jti` for twice `maxAgeHours`, longer than it accepts any SET.

### Events

| Event | What Unfold does |
| --- | --- |
| CAEP `session-revoked`, `credential-change`, `token-claims-change` | Ends every credential of the person; the account stays on, so they sign in again and the identity provider decides |
| RISC `account-credential-change-required`, `credential-compromise` | The same |
| RISC `account-disabled`, `account-purged` | Turns the account off and ends every credential |
| RISC `account-enabled` | Turns back on an account a SET turned off |
| SCIM events ([RFC 9967](https://www.rfc-editor.org/rfc/rfc9967.html)) `prov:deactivate`, `prov:delete` | Turns the account off and ends every credential |
| SCIM `prov:activate` | Turns back on an account a SET turned off |
| SSF `verification`, `stream-updated` | Acknowledged and logged |
| Anything else | Acknowledged, logged as `ssf.event_ignored`, nothing changes |

The subject comes from `sub_id` ([RFC 9493](https://www.rfc-editor.org/rfc/rfc9493.html)), or from an event's own `subject` member. Unfold reads `iss_sub` (when `iss` is the single sign-on issuer), `email` (an account named by it, or a SCIM User with it), `complex` (its `user` member), `aliases`, and RFC 9967's `scim` format (its `externalId`, `userName` or `emails`). A subject that names nobody is acknowledged and logged as `ssf.subject_unknown`. CAEP `session-revoked` ends all of the person's sign-ins, because an identity provider's session is not one Unfold login.

### Set up a stream

Unfold does not call a transmitter's stream management API. Create the stream once at the transmitter (SSF 1.0 section 8) with push delivery to Unfold, for example:

```json
{ "delivery": { "method": "urn:ietf:rfc:8935", "endpoint_url": "https://unfold.example/ssf/events", "authorization_header": "Bearer <a long random value>" },
  "events_requested": ["https://schemas.openid.net/secevent/caep/event-type/session-revoked", "https://schemas.openid.net/secevent/caep/event-type/credential-change"] }
```

Put the same `Bearer …` value in the environment variable `authorizationEnv` names, and the stream's `aud` in `audience`.

| | Authentik | Okta | Entra ID |
| --- | --- | --- | --- |
| Transmits SETs to a third party | Yes, through an SSF provider on the Unfold application, an Enterprise feature ([docs](https://docs.goauthentik.io/add-secure-apps/providers/ssf/)) | Yes, through the SSF Transmitter API at `/.well-known/ssf-configuration` ([docs](https://developer.okta.com/docs/reference/ssf-transmitter-sets/)) | No transmitter for third parties found. Continuous Access Evaluation is used only by Microsoft's own services (unverified absence) |
| Delivery | Push only | Push; poll unverified | — |
| Events it sends | CAEP `session-revoked` (logout or an administrator ending a session) and `credential-change` (password and MFA device changes) | CAEP `session-revoked` and `credential-change` | — |
| Subject | `complex` with `user` as `email`, so the person must sign in to Unfold with that email | `iss_sub`, matched when it is the single sign-on issuer | — |
| Stream | The receiver creates it | The receiver creates it, with an OIDC client holding `ssf.manage`; one stream per client, ten per org | — |
| Unverified | The release that introduced it | Whether a plan or Identity Threat Protection is required | — |

No identity provider above sends RISC `account-disabled` or the RFC 9967 SCIM events today, as far as their documentation says. Unfold handles them for transmitters that do. For deprovisioning, use SCIM.

## Audit

Every SCIM call that changes something, every refused SCIM call, every SET event and every revocation is an Action Record, readable at `GET /api/actions` with channel `scim` or `ssf` ([HTTP contract](../contracts/api.md#provisioning-and-shared-signals)). Its person is `scim` (SCIM provisioning) or `ssf:<transmitter>`, its role `system`, and its target the Unfold account (`person`) or SCIM Group (`group`). A revocation is recorded as `REVOKE <cause>` with what it ended. Each also writes a log line: `identity.provisioned`, `identity.updated`, `identity.deactivated`, `identity.reactivated`, `identity.deleted`, `identity.memberships`, `identity.reauthenticate`, `identity.revoked`, `identity.signed_out`, `login.refused`, `ssf.event`, `ssf.duplicate`, `ssf.event_ignored`, `ssf.event_acknowledged`, `ssf.subject_unknown` and `ssf.refused`.
