# Security audit as OCSF, kept tamper-evident and exportable

## Why

The security audit found that Unfold keeps no persistent audit of sign-ins and
administrator actions. What exists is scattered: JSON lines on stdout
(`login.failed`, `editor.approved`, `mcp.request`, `link.*`), Action Records
(every state-changing call, kept forever, shown on a screen), the `flag_audit`
table, and session events. None of it reaches a SIEM in a standard shape. The
competitor survey found audit locked in a UI or a CSV download. System
ADR-0050 rule 3 (proposed in PR #697) says audit records leave Unfold as
[OCSF](https://ocsf.io/), and that data only on a screen or in a CSV does not
count as exported.

Application: `apps/unfold`. Ticket: none yet.

## What Changes

- One audit module, `apps/unfold/src/audit/`, maps every security-relevant
  Unfold event to an OCSF 1.9.0 class and activity: sign-in success and
  failure, sign-out, editor credential approval, denial and revocation,
  Agents-window token issue and revocation, linked accounts, unfold-mcp
  requests and the delegated calls they make, account, role and Tenant or
  Client membership changes, feature flag changes, Client Sign-off record,
  withdraw and exclusions, data downloads, and every other Action as API
  Activity.
- An append-only `audit_records` table in Unfold's SQLite store, one hash
  chain per Tenant, with retention from configuration (default 400 days).
  Pruning leaves an anchor, so the remaining chain still verifies.
- Export behind the `audit.export` flag, off by default: OTLP logs to a
  configured endpoint, and NDJSON through `GET /api/admin/audit`, paged and
  scoped to the Tenants the caller administers. `GET /api/admin/audit/verify`
  checks a Tenant's chain.
- A vendored extract of the OCSF 1.9.0 schema for the classes and objects
  used, and a test that validates every emitted record against it.
- An operations page, "Send Unfold's audit to your SIEM (OCSF)", with Splunk,
  Elastic and Amazon Security Lake notes and NEN 7513-style access logging
  notes.

## Non-goals

- Preventing tampering. Someone with write access to the database file can
  rewrite the table and recompute the chain; the chain makes that detectable
  against an exported copy, not impossible.
- Replacing Action Records, `flag_audit`, the stdout lines or session events.
  They keep their readers; the audit trail is added beside them.
- Tenant export, webhooks, intake sources and billing lines. None exists on
  `development`; the module leaves a seam (`AuditTrail.record`) and the
  operations page lists the mapping each will use.
- Auditing every read. Reads of record data are logged only where data leaves
  Unfold (downloads, exports, the audit API itself).

## Capabilities

### New Capabilities

- `ocsf-audit`: how Unfold records, keeps, verifies and exports its security
  audit as OCSF.

### Modified Capabilities

None.
