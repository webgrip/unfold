# Tenant export

## ADDED Requirements

### Requirement: Every table is classified

Every table Unfold creates SHALL be either exported by exactly one entity or
listed as excluded with a reason. A test MUST fail when a table is created in
`apps/unfold/src` without either.

#### Scenario: A new table without a classification

- **WHEN** a change adds `CREATE TABLE IF NOT EXISTS invoices` and does not
  add it to the catalogue
- **THEN** `test/tenant-export.test.ts` fails and names `invoices`

### Requirement: The bundle is open formats with a manifest

The bundle SHALL be a gzip-compressed POSIX tar holding one JSON Lines file
per entity under `data/`, a JSON Schema 2020-12 per entity under `schemas/`,
a `ploeg-data.md` pointer and `manifest.json`. The manifest MUST list every
other file with its size and SHA-256, and every entity with its row count,
schema version, sources and scope rule.

#### Scenario: Checking a downloaded bundle

- **WHEN** a person extracts the bundle and checks each file in the manifest
- **THEN** every SHA-256 and row count matches and every row matches its
  entity's schema

### Requirement: Secrets are never exported

The bundle MUST NOT contain password hashes, sign-in or editor token hashes,
access or refresh tokens, encryption keys, credentials or webhook secrets,
and every configured secret value MUST be replaced by `[redacted]` wherever
it appears in a record. The manifest SHALL say so.

#### Scenario: A store full of secrets

- **WHEN** the store holds a password hash, a login, an editor credential, a
  kept OIDC grant and a session workspace, and configuration holds a task
  source token and a repository password
- **THEN** none of those values appears in any file of the bundle

### Requirement: The export is scoped to the Tenant

While `tenancy.enforce` is off, the installation SHALL be the one Tenant
`default` and the bundle SHALL hold everything Unfold stores. While it is on,
the bundle MUST hold only the people with a membership of the Tenant and
their rows, the Tenant's repositories, task sources and sessions, the Work
Item rows whose Work Item Ploeg places in the Tenant, and the product events
with the Tenant's id. Installation-wide rows SHALL go with `default` only.

#### Scenario: Two Tenants on one installation

- **WHEN** an Admin of `acme` exports `acme` while `globex` also has people,
  sessions, chats, Sign-offs and product events
- **THEN** no row of `globex` is in the bundle

### Requirement: Running an export

Only an administrator signed in through the browser, with the
`tenant.export` flag on, SHALL start, list, read, download or delete an
export, and starting one MUST repeat the Tenant id as a confirmation. The
export SHALL run in the background, one at a time, from a read-only snapshot,
streaming rows so memory stays bounded. A finished bundle SHALL expire 24
hours after it finished. Every start, download and deletion MUST be logged
and kept as an Action Record.

#### Scenario: The flag is off

- **WHEN** an administrator starts an export with the flag off
- **THEN** Unfold answers 403 `tenant_export_off` and exports nothing

#### Scenario: A large Tenant

- **WHEN** a session has 40,000 events of 2 KB each
- **THEN** the export writes them all while the heap grows by less than half
  the size of the written rows and the event loop keeps running
