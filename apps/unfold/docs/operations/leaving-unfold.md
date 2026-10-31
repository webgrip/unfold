---
type: how-to
audience: [owner, operator]
owner: unfold
last_verified: 2026-10-30
verified_by: "Written with the implementation on branch feat/tenant-export: src/tenant-export.ts, src/tenant-export-jobs.ts, src/tar-writer.ts and the route block in src/http.ts; test/tenant-export.test.ts passed (table classification, no secrets, Tenant isolation, checksums, a 40,000-row streamed export and the API round trip)."
---

# Leaving Unfold: export a Tenant

A Tenant can leave Unfold with everything Unfold holds for it, through the API and in documented open formats, without a support ticket. This is rule 6 of system ADR-0050 ([pull request #697](https://forgejo.webgrip.dev/webgrip/unfold/pulls/697)), and it is how the hosted service meets the switching duty of the EU Data Act ([Regulation (EU) 2023/2854](https://eur-lex.europa.eu/eli/reg/2023/2854/oj), Chapter VI).

One export is one bundle: a gzip-compressed POSIX tar archive of JSON Lines files, one per entity, with a JSON Schema for each and a `manifest.json` that lists every file with its row count and SHA-256. The code is [`src/tenant-export.ts`](../../src/tenant-export.ts) and [`src/tenant-export-jobs.ts`](../../src/tenant-export-jobs.ts).

## Who can export

* An administrator, signed in to the workbench in a browser. An editor credential or an MCP token cannot export: a stolen editor token never carries a whole Tenant away. Unfold has no separate step-up sign-in yet, so the browser sign-in and the typed confirmation below are the barrier.
* Only while the `tenant.export` flag is on. It is off by default; turn it on for everyone with an override on the Labs page or `PUT /api/admin/flags/tenant.export/override` (see [Feature flags](feature-flags.md)).
* While `tenancy.enforce` is off, the installation is one Tenant, `default`, and the export holds everything Unfold stores. While it is on, an administrator exports a Tenant they hold an Admin membership of, and the bundle holds only that Tenant's rows (see [What belongs to a Tenant](#what-belongs-to-a-tenant)).

## Run an export

In the browser, open **Settings › Administration**, type the Tenant id under **Export all data** and once more to confirm, and choose **Start the export**. The page shows it as **Building**, then **Ready** with **Download**; **Delete** removes the bundle before it expires. The steps below do the same from a script.

1. Start it. The request names the Tenant and repeats it in `confirm`:

    ```sh
    curl -sS -X POST "$UNFOLD/api/admin/tenant-exports" \
      -H 'Content-Type: application/json' -H 'X-Unfold-Request: 1' \
      -H "Cookie: __Host-unfold=$SESSION" \
      -d '{"tenant":"default","confirm":"default"}'
    ```

    Unfold answers `202` with the export: `{id, tenant, state: "running", …}`. Only one export runs at a time; a second answers `409 tenant_export_running`.

2. Wait until `GET /api/admin/tenant-exports/<id>` answers `state: "ready"`, with `bytes`, `sha256`, `rows`, `expiresAt` and `downloadUrl`. A failed export answers `state: "failed"`; the server log says why.

3. Download it within 24 hours:

    ```sh
    curl -sS -o tenant.tar.gz -H "Cookie: __Host-unfold=$SESSION" "$UNFOLD/api/admin/tenant-exports/<id>/download"
    sha256sum tenant.tar.gz
    ```

    The response carries `Repr-Digest: sha-256=:<base64>:`; the hex form is the export's `sha256`.

4. Delete it early with `DELETE /api/admin/tenant-exports/<id>`, or let it expire: 24 hours after it finished, Unfold deletes the bundle and forgets the export. Exports live in memory, so a restart deletes every bundle on the data volume.

The rows are streamed from a read-only snapshot of the database to files under `<dataDir>/exports/` and from there into the archive, so memory stays bounded whatever the size and the workbench keeps serving while the export runs. Every route and field is in the [HTTP contract](../contracts/api.md#tenant-export).

## What is audited

* Log lines `tenant_export.started`, `tenant_export.ready` (rows, bytes, SHA-256), `tenant_export.failed`, `tenant_export.downloaded`, `tenant_export.deleted` and `tenant_export.expired`, each with the person and the Tenant.
* Action Records: starting and deleting an export are recorded like every other change, and each download is recorded as `GET /api/admin/tenant-exports/:id/download`. They show on the Actions page.

## The bundle

```text
manifest.json               written last; lists every other file
ploeg-data.md               what Ploeg holds and how to get it
flags.flagd.json            the flagd rules authored rollouts compile to (default Tenant only)
data/<entity>.jsonl         one JSON object per line, UTF-8
schemas/<entity>.schema.json  JSON Schema 2020-12 for each line of data/<entity>.jsonl
```

`manifest.json` holds:

* `format: "unfold-tenant-export"` and `formatVersion: 1`, the Tenant, whether Tenant checks were enforced, when and by whom it was made, and the Unfold version.
* `entities`: for each entity its file, schema, `schemaVersion`, row count, the tables or configuration it came from, and the rule that decided which rows belong to the Tenant. `derived: true` marks the delivery ledger, which Unfold computes from Ploeg's facts; `unavailable` says why an entity is empty when its source could not be read.
* `files`: every other member with its media type, size and SHA-256.
* `excluded`: every table left out, with the reason.
* `secrets`: the statement that the bundle holds no secrets, and what was left out.
* `elsewhere`: what Ploeg holds, pointing at `ploeg-data.md`.

Fields are the stored columns in camelCase. A column that holds JSON is parsed into its field, so `body` is the record as Unfold keeps it. A binary column, such as an uploaded image or a report attachment, is base64. Times are ISO 8601 in UTC; amounts are US dollars.

### The entities

| Entity | What it holds |
| --- | --- |
| `users` | People and their Tenant and Client memberships. No password hash. |
| `repositories`, `task-sources` | Registered repositories and task sources from configuration. No access credentials, tokens or credentials in URLs. |
| `sessions`, `session-events`, `session-permissions` | Workbench sessions, their full event logs (the transcript) and the permission requests they raised. |
| `linked-sessions`, `linked-session-work-items`, `agent-traces`, `linked-session-messages`, `linked-session-permissions`, `linked-session-remote-approval` | Linked Sessions from people's own editors, the Work Items they touched, their Agent Trace records, messages and permission prompts. |
| `client-sign-offs`, `client-sign-off-exclusions` | Client Sign-offs and the paths each Client's sign-off leaves out. |
| `delivery-ledger` | Each Work Item's Acceptance and Token Charge base for the last 30 days, read from Ploeg. |
| `asks`, `chats`, `chat-turns` | Questions asked about Work Items, and chats with Unfold. |
| `reports`, `report-files`, `report-follow` | Reported problems, their attachments and filing state. |
| `action-records` | Every state-changing call a person made, with secrets already redacted. |
| `product-events`, `product-event-daily` | Product events as stored: the actor is a pseudonym, and the key that made it is not exported, so it stays a pseudonym. |
| `flag-overrides`, `flag-rollouts`, `flag-segments`, `flag-audit`, `flag-choices` | Feature flag overrides, rollouts, segments and their audit trail, and each person's Labs choices. |
| `card-themes`, `card-theme-versions`, `card-assets` and the other `card-*` entities | Run card themes, their uploaded images, and each person's card collection and the records behind it. |
| `run-judgements`, `tripwire-hits`, `tripwire-runs`, `decider-kinds` | What Unfold's judges and decider said about Runs. |
| `now-snoozes`, `agent-host-views`, `status-notes` | Per-person Now snoozes and editor views, and the Status page notes. |
| `audit-records`, `audit-anchors`, `audit-checkpoints` | The Tenant's security audit trail as OCSF events in their hash chain, the retention anchors the chain verifies from after older records were removed, and the daily signed checkpoints of its head. |
| `billing-mappings`, `billing-lines` | The price and billing tool target per Client, and one billing line per accepted Work Item and per reversal. |
| `account-states`, `scim-users`, `scim-groups`, `scim-group-members` | Disabled accounts, and the people and groups the identity provider provisioned through SCIM. |
| `intake-sources`, `intake-requests`, `intake-messages` | Request intake sources without their signing secrets, the Requests received, and which mail message belongs to which Request. |
| `notify-preferences`, `notify-targets` | The channels and triggers each person chose to be notified on, and which ntfy topics and Web Push subscriptions they have, without the topic, the push endpoint or its keys. |
| `outbound-subscriptions`, `outbound-events`, `outbound-deliveries` | Outbound webhook subscriptions without their signing secrets and with only the origin of the receiver URL, the events still in the outbox, and the delivery log of each subscription. Events are signed when sent, so the outbox holds no secret. |

The signing secrets of outbound webhook subscriptions and intake sources are not exported; issue new ones at the destination. The manifest says so under `notExported`.

Many webhook receivers treat their URL as the credential: a Slack incoming webhook carries its token in the path, and a Teams or Power Automate workflow URL carries a signature (`sig`) in the query. A subscription's `url` is therefore exported as its origin only (scheme, host and port, such as `https://hooks.slack.com`), with `urlRedacted: true` and `urlFingerprint`, the SHA-256 in hex of the full URL as Unfold stored it. To match a subscription at the destination, hash the URL you configure there, for example with `printf %s "$URL" | sha256sum`, and compare.

### What is never exported

No secret is exported: password hashes, sign-in and editor token hashes, the OIDC access and refresh tokens Unfold keeps to prove a person to Ploeg, the store encryption key, the product event actor key, task source tokens, repository passwords, model gateway keys, webhook and intake signing secrets, and Web Push subscription endpoints and keys and ntfy topics, and the path and query of webhook receiver URLs. Every configured secret value is also replaced by `[redacted]` wherever it appears inside a record. These tables are left out entirely:

| Table | Why |
| --- | --- |
| `logins` | Hashes of browser sign-in tokens. People sign in again at the destination. |
| `editor_credentials` | Hashes of editor credentials. Editors sign in again. |
| `internal_state` | Encrypted workspace credentials and kept sign-in tokens. |
| `linked_session_notice_snapshots` | A cache, rebuilt on the next check. |
| `card_import` | Progress of the one-time card import from Ploeg. |
| `sqlite_sequence` | SQLite's own counter table. |
| `audit_exports` | How far each Tenant's audit trail was sent to its log collector. |
| `ssf_seen`, `intake_deliveries` | Deduplication of Shared Signals events and intake deliveries, forgotten after a while. |
| `notify_outbox` | The queue of notices to send over ntfy and Web Push. What they report is exported itself. |
| `jobs` | The [background job queue](background-jobs.md): when each waiting delivery, notice, billing line, report or comment runs next. The records it works on are exported or left out under their own tables. |
| `notify_cursors`, `outbound_cursors`, `outbound_sign_off_changes` | How far notifications and webhooks have read their sources. |
| `mcp_event_subscriptions`, `mcp_event_verifications` | The MCP key, lifetime and delivery status of MCP Events subscriptions, and which callback URLs a person proved. The MCP client owns its subscriptions and subscribes again at the destination; the subscription rows themselves leave as `outbound-subscriptions`. |

`test/tenant-export.test.ts` fails when a table is added anywhere in `src/` without being exported or listed here with a reason.

### What belongs to a Tenant

While Tenant checks are enforced, each entity's manifest entry names its rule:

* People with a Tenant or Client membership of the Tenant, and the rows those people own (chats, asks, reports, Action Records, Linked Sessions, card collections, snoozes, Labs choices, notification preferences and subscriptions, account states, SCIM records).
* Repositories and task sources the Tenant owns, workbench sessions on those repositories, and their events and permissions.
* Rows about a Work Item (Client Sign-offs, judgements, tripwire hits, card records, the delivery ledger), when Ploeg says the Work Item's target is a repository of the Tenant. Without a connected Ploeg, no Work Item rows are exported for an enforced Tenant.
* Rows that store their Tenant: product events, the audit trail, billing mappings and lines, intake sources and Requests, webhook subscriptions and their outbox events, with each subscription's deliveries.
* Installation-wide rows (flag overrides, rollouts, segments and their audit, card themes and assets, Status page notes, SCIM groups) go with the `default` Tenant only.

### Why JSON Lines and not Parquet

ADR-0050 names Parquet for large tables. The Tenant export is many tables of differently shaped records, each with a JSON Schema; JSON Lines keeps them as they are and converts to Parquet in one command (below). Unfold writes Parquet only for the [FOCUS cost export](focus-cost-export.md), one flat table with fixed column types ([ADR 0060](../adrs/0060-the-focus-cost-export-writes-parquet-through-hyparquet-writer.md)). Parquet for this export is a later addition, not part of version 1.

## Data Ploeg holds

Work Items as Ploeg records them, Shifts, Runs, Run transcripts, checkpoints, spend, holds and allowances, and Ploeg's audit log are Ploeg's to export, not Unfold's. `ploeg-data.md` in the bundle says so: Ploeg's Operator API serves team-scoped read projections of each of them (its `operator-api.v1` contract), and the operator of the Ploeg installation reads them with an operator credential for each Team. Ploeg has no bulk export yet.

## Use the data elsewhere

Check the bundle first:

```sh
mkdir tenant && tar -xzf tenant.tar.gz -C tenant && cd tenant
jq -r '.files[] | "\(.sha256)  \(.path)"' manifest.json | sha256sum -c -
```

Each schema is JSON Schema 2020-12, so any validator for that draft checks a line of its file.

Load the records into another system:

* **DuckDB** reads JSON Lines directly and writes Parquet: `duckdb -c "COPY (SELECT * FROM read_json_auto('data/session-events.jsonl')) TO 'session-events.parquet' (FORMAT parquet)"`.
* **PostgreSQL** or another database: DuckDB's `postgres` extension attaches the database and `CREATE TABLE pg.session_events AS SELECT * FROM read_json_auto('data/session-events.jsonl')` copies the rows in.
* **Python or any language**: read a line, parse it as JSON. The schemas give the fields and types.
* **Another Unfold installation**: there is no import endpoint yet. Users come back through the identity provider; repositories and task sources are configuration, which `repositories.jsonl` and `task-sources.jsonl` hold in the shape `config` expects, less their credentials.
* **Flags**: `flags.flagd.json` is a flagd flag definition document, which any flagd or OpenFeature flagd provider loads as it is.
