# SCIM provisioning and Shared Signals: the identity provider's decisions apply at once

## Why

The security audit of 2026-10-29 found that removing someone at the identity
provider does not remove their Unfold access. Browser sessions last up to
`auth.sessionHours`, editor credentials 30 days, Agents-window connection
tokens slide with use, and kept refresh tokens go on minting Ploeg person
tokens. Role and group changes apply only at the next browser sign-in, and
nothing provisions or deprovisions anyone. System ADR-0050 names SCIM 2.0 as
the provisioning standard and lists its absence as a known violation.

Application: `apps/unfold`. No ticket is filed yet; task 1.1 files one.

## What Changes

- A SCIM 2.0 service provider (RFC 7643, RFC 7644) at `/scim/v2`, behind the
  `identity.scim` flag, off by default, with a bearer token from the
  environment.
- A Shared Signals receiver for pushed SETs (RFC 8935) at `/ssf/events`,
  behind the `identity.shared-signals` flag, off by default, acting on CAEP
  1.0, RISC 1.0 and RFC 9967 events.
- One revocation function used by sign-out, SCIM and Shared Signals.
- An account the identity provider turned off is refused on every sign-in
  path.
- Every provisioning change and revocation is an Action Record and a log line.

## Non-goals

- Polling for SETs (RFC 8936) and calling a transmitter's stream management
  API.
- SCIM bulk operations, sorting, ETags and password changes.
- Provisioning per Tenant: one SCIM token serves the install.
- Transmitting SETs from Unfold.

## Impact

`src/identity/` (new), `src/auth.ts`, `src/ahp/host.ts`, `src/store.ts`,
`src/http.ts` (one mount, the sign-in check and sign-out), `src/config.ts`,
`src/flag-registry.json`, the operations page and the HTTP contract.
Application ADR 0058 (proposed).
