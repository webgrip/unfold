# Identity lifecycle

## ADDED Requirements

### Requirement: Deprovisioning ends every credential at once

When the identity provider deactivates or deletes a person through SCIM, or
sends a Shared Signals event that disables their account, Unfold SHALL turn the
account off and, in the same request, end every browser session, editor
credential, Agents-window connection token, delegated credential and kept
sign-in token of that person. A turned-off account MUST NOT sign in again
until the channel that turned it off turns it back on. Revocation spends
nothing, and a retry revokes nothing more.

#### Scenario: SCIM sets active to false

- **WHEN** the identity provider PATCHes a User with `active` false
- **THEN** the person's next request with any credential they held is 401,
  and their next single sign-on is refused with `account_disabled`

#### Scenario: A session-revoked event

- **WHEN** a configured transmitter pushes a verified CAEP `session-revoked`
  SET about a person
- **THEN** every credential of that person ends, and the account stays on

### Requirement: Membership changes apply to the next request

A SCIM Group change SHALL recompute the Tenant and Client memberships and role
of each member it touched, so that the next request of that member is
authorized with them.

#### Scenario: A member is removed from a Tenant group

- **WHEN** the identity provider removes a User from `unfold/acme/member`
  while `tenancy.enforce` is on
- **THEN** the person's next request no longer reaches Tenant acme's
  repositories

### Requirement: Only verified SETs act

The receiver SHALL act only on a SET whose `typ` is `secevent+jwt`, whose
signature verifies with a key of the configured transmitter that `iss` names,
whose `aud` names this workbench and whose `iat` is recent. It MUST act on a
`jti` at most once per transmitter, and SHALL acknowledge an unknown event
without acting on it.

#### Scenario: A replayed SET

- **WHEN** a transmitter pushes a SET whose `jti` it already sent
- **THEN** Unfold answers 202 and does nothing

### Requirement: Both parts are off by default

`/scim/v2` and `/ssf/events` SHALL answer 404 while their flag is off or their
`identity` settings are absent.

#### Scenario: A fresh install

- **WHEN** a workbench starts without the flags turned on
- **THEN** a SCIM or SET request is 404 and changes nothing
