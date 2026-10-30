# Design — ocsf-audit

## Context

System ADR-0050 (PR #697) names OCSF for audit and requires that what leaves
Unfold is reachable through the API. System ADR-0037 already records every
state-changing call as an Action Record with its person, channel and
confirmation. ADR-0017 makes the Tenant the boundary of what a person sees.

## Decisions local to this change

- **One tap, not a call per route.** The server's request listener hands each
  request to the audit module, which classifies it by method, route and
  response status when the response finishes. Route handlers stay unchanged,
  so parallel work on `http.ts` conflicts with one line, not twenty.
- **Accounts are observed in the store.** Role and membership changes come
  from single sign-on at sign-in today and from SCIM later. The store tells
  its observers about each account write with the account before and after,
  so any writer is audited without knowing about audit.
- **One chain per Tenant.** A Tenant administrator can verify and export
  their own chain without seeing another Tenant's records. An event about a
  person (sign-in, credentials, account) is appended to each Tenant they
  belong to; a membership event to that membership's Tenant; anything else to
  the Tenant of its target when Unfold can tell, else the actor's only
  Tenant, else the install's default Tenant.
- **The chain is OCSF's own Record Integrity profile.** OCSF 1.9.0 has an
  `attestation_list` for tamper-evident chains. Each record's attestation
  names the chain (`unfold-audit:<tenant>`), the previous record's `uid`,
  `type_uid` and SHA-256 fingerprint, and its own fingerprint: the SHA-256 of
  the record's JCS serialization without that fingerprint. Exported records
  need nothing outside the schema, so a SIEM can re-verify without Unfold.
- **Pruning anchors the chain.** Before records older than the retention are
  deleted, an anchor stores the last pruned sequence and hash. A delete
  trigger refuses to remove a record no anchor covers, and update triggers
  refuse every change, so normal code cannot rewrite history.
- **The OCSF check uses a vendored extract.** The schema server's JSON Schema
  endpoint did not answer when this was built, and Node has no JSON Schema
  validator without a new dependency. `scripts/vendor-ocsf.mjs` extracts the
  1.9.0 class, object and profile dictionaries Unfold uses (Apache-2.0, as the
  OCSF schema is), and the test validates types, enums, requirements,
  constraints and declared profiles against it. `ai_agent` and `delegation`
  exist in 1.9.0 only through the AI Operation profile, and Web Resources
  Activity has `actor` only through the Host profile, so records that use them
  declare those profiles.
- **Export is a flag per Tenant.** `audit.export` is evaluated with the
  Tenant in the context, so one Tenant can stream to its SIEM before another.

## Open Questions

- Whether a stricter guarantee is wanted: periodic signing of the chain head
  with the attestation key, or a write-once copy outside the database.
- Which retention a hosted Tenant gets by contract; 400 days is the default.
- Whether NEN 7513 applies to any intended customer; the notes say what Unfold
  logs and what it does not.
