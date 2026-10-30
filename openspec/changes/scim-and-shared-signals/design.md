# Design — scim-and-shared-signals

## Decisions

- **Push, not poll.** RFC 8935 push needs one route; RFC 8936 poll needs a
  poller per transmitter with a cursor and acknowledgements that survive a
  restart. Push needs the transmitter to reach Unfold's public URL.
- **One `Revocation`.** `signIn(hash)` ends one sign-in (sign-out);
  `person(userId)` ends each of the person's sign-ins through `signIn`, then the
  Agents-window tokens no sign-in issued, and the delegated credentials and
  uncollected editor tickets held in memory.
- **The account state lives apart from SCIM.** `account_states` records who
  turned an account off (`scim` or `ssf`); each channel undoes only its own.
  `Auth`, the agent host, MCP over HTTP and the sign-in callback ask it.
- **Linking.** `linkBy` picks the SCIM attribute that equals the OIDC `sub`
  (`externalId`, Authentik's default) or links by email (Okta, Entra ID).
- **Groups.** Memberships are recomputed from SCIM Groups only when a Group
  touching the person changes, so an identity provider that pushes no Groups
  leaves sign-in memberships alone.
- **Routes outside `/api/`.** Mounted from `src/identity/lifecycle.ts` before
  the mutation guard, which identity providers cannot satisfy.

## Open Questions

- Should SCIM provisioning be per Tenant (one token per Tenant) once the
  hosted service serves several agencies?
- Should Unfold create Shared Signals streams itself through the transmitter's
  stream management API?
