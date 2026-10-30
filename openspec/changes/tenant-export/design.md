# Design — tenant-export

## Context

- System ADR-0050 rule 6 (pull request #697): JSONL for records, Parquet for
  large tables, OKF for knowledge, git for code; complete; through the API;
  no support ticket. Rule 8: what Unfold needs from Ploeg is a generic Ploeg
  contract in Ploeg's words.
- [ADR-0009](../../../docs/adr/adr-0009-one-tenant-per-agency.md) and
  [ADR-0017](../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md):
  the Tenant is the unit of export. Today only configuration entries
  (repositories, task sources) and user memberships name a Tenant; stored
  rows mostly do not. `TenantScope.workItemOwner` places a Work Item by its
  Ploeg target.
- Unfold keeps all its state in one SQLite database. Tables are created by
  `src/store.ts` and by stores in `src/linked-*.ts`, `src/client-sign-off.ts`,
  `src/chat/store.ts` and `src/cards/card-store.ts`.
- The delivery ledger (`src/delivery-ledger.ts`) is not stored: it is read
  from Ploeg's delivery facts for a window of at most 30 days.
- Unfold has no outbound webhooks.

## Decisions

### D1. One catalogue classifies every table

`tableEntities` maps a table to an entity name and a scope rule; curated
entities (users, sessions, configuration, the ledger) are written by hand;
`excludedTables` gives each left-out table a reason. A test scans `src/` for
`CREATE TABLE` and fails on any table in neither list, so a new table cannot
ship without a decision.

### D2. Scope rules, not a tenant column

Rows are placed by what they hang off: a person's membership, a repository's
owner, a parent row already exported, a Work Item Ploeg places in the Tenant,
or a stored Tenant id. Installation-wide rows (flags, card themes, Status
notes) go with `default`. While `tenancy.enforce` is off everything is
`default`. Work Item rows are resolved through Ploeg in batches of 100; with
no Ploeg connected, an enforced Tenant gets none, so nothing leaks.

### D3. Streaming tar of JSON Lines

Each entity streams from `StatementSync.iterate()` into a file under the data
volume, hashing and counting as it writes, honouring backpressure and
yielding to the event loop. The tar writer then streams those files into a
gzip-compressed ustar. A read-only second connection in a transaction gives a
consistent snapshot without blocking the writer. ZIP was the alternative; tar
needs no CRC table and is read by every platform's `tar`.

### D4. JSON Lines only, no Parquet in version 1

Node.js has no Parquet writer, and Unfold has one runtime dependency (`ws`).
A Parquet library adds a dependency for the licence gate and supply chain to
review for one export path, while DuckDB converts the JSON Lines to Parquet in
one command, which the operations page shows.

### D5. Jobs in memory, admin with a browser sign-in

An export is a background job held in memory, one at a time. The bundle sits
under `<dataDir>/exports/` until it expires (24 hours) or is deleted, and a
restart deletes every bundle. Unfold has no step-up sign-in, so the routes
refuse editor and MCP credentials and starting an export repeats the Tenant
id. Starting and deleting are recorded like every mutation; the download is
recorded explicitly as an Action Record. All of it sits behind
`tenant.export`, off by default.

### D6. What Ploeg holds stays Ploeg's

Runs, Shifts, transcripts, checkpoints, spend and Ploeg's audit are pointed at
from `ploeg-data.md`. The contract Ploeg needs, in its own words:

> **Bulk export of an operator's records (proposed).**
> An authenticated operator principal with the `export` permission calls
> `POST /api/v1/operator/exports` with `{ teams, since?, until?, kinds }`,
> where `teams` is a list of Team ids the principal may read and `kinds`
> chooses among `work_items`, `shifts`, `runs`, `run_transcripts`,
> `checkpoints`, `spend`, `allowances` and `audit`, and an idempotency key.
> Ploeg answers `202` with an export id and builds the export in the
> background: one JSON Lines file per kind, a JSON Schema per kind, and a
> manifest with each file's row count, schema version and SHA-256. It
> contains no credentials, keys, tokens or secrets, and says so.
> `GET /api/v1/operator/exports/{id}` reports `running`, `ready` or `failed`;
> `GET /api/v1/operator/exports/{id}/download` streams the archive until it
> expires, at least 24 hours after it finished. Ploeg audits
> `export.requested`, `export.downloaded` and `export.deleted` with the
> principal and the Teams. Rows are streamed so memory stays bounded.
> Confirmation: a contract test that an export of one Team contains no row
> of another Team and no secret, and that every checksum matches.

## Risks

- A Work Item whose target matches repositories of two Tenants belongs to
  neither (`workItemOwner` answers undefined), so its rows are left out of
  both exports.
- The ledger covers 30 days; older Acceptance comes from Ploeg's own export.
- Jobs do not survive a restart; the person starts the export again.
