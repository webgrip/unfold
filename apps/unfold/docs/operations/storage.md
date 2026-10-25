---
type: reference
audience: [owner, operator, contributor]
owner: unfold
last_verified: 2026-10-25
verified_by: "The store key section written with the implementation on branch feat/no-shared-sandbox-credentials (src/store.ts, test/store-key.test.ts). Written with the implementation on branch feat/sqlite-hygiene: src/store.ts constructor, optimize and quickCheck, src/store-upkeep.ts and the upkeep hook in src/insight.ts; test/store-upkeep.test.ts passed. Durability trade-off from the 2026-10-20 research on single-replica restarts (section 3); the owner accepted it."
---

# Storage

Unfold keeps its state in one SQLite database, `unfold.sqlite`, with one writer process ([ADR 0002](../adrs/0002-native-node-and-single-writer-storage.md)). This page says how that database is tuned and checked, and what to do when a check fails. Backups are described under [Kubernetes](live.md#kubernetes).

## Durability: `synchronous=NORMAL`

The database runs in WAL mode with `PRAGMA synchronous=NORMAL`. A commit is appended to the write-ahead log without waiting for the disk to confirm it; the disk is synced when the log is checkpointed into the database.

- **What it protects.** The database is never corrupted by a crash, a killed process or a power loss. A process that crashes or is killed loses nothing: the operating system still writes the log.
- **What it gives up.** A power loss or a node crash can lose the last commits before the most recent checkpoint. The database opens at an earlier, consistent state.
- **Why that is acceptable.** Ploeg owns work state; Unfold's own records, such as action records, events and views, can lose their newest rows without breaking an invariant. The owner accepted this trade-off on 2026-10-20.
- **What it buys.** Every mutating request writes at least one row. With `FULL`, each commit waits for one fsync, which on network-replicated storage such as Longhorn is a round trip to every replica.

A deployment that cannot accept losing recent commits on power loss needs `FULL` back, and an ADR that supersedes this choice.

## Planner statistics: `PRAGMA optimize`

Opening the database runs `PRAGMA optimize=0x10002`, which looks at every table and analyzes those whose statistics are missing or stale. While the server runs, the hourly maintenance tick runs `PRAGMA optimize` again once four hours have passed since the last run. Both are cheap when nothing changed, and they keep query plans sound as `events`, `product_event` and `action_records` grow.

## Integrity check: `PRAGMA quick_check`

Once a day the hourly maintenance tick runs `PRAGMA quick_check`. It never runs at boot: it reads the whole database, which takes a few hundred milliseconds on a database of about 90 MB and grows with it. The first check after a start is the first maintenance tick, a minute later, when the previous check is more than a day old. The time of the last check is stored in the database, so restarts do not postpone it.

A passing check logs `store.quick_check` with `ok: true` and how long it took. A failing check:

1. logs `store.quick_check` at level `error` with `ok: false` and the first problems SQLite reported,
2. sends a `fatal` error report tagged `feature: store`, `check: quick_check` through the configured error reporting ([error reports](live.md#error-reports)),
3. checks again the next day and reports again while the problem remains.

## The store key

Unfold encrypts its stored secrets (people's links, relay credentials, sign-in grants) with AES-256-GCM under one 32-byte key. Where that key lives:

- **`UNFOLD_STORE_KEY` set.** The key comes from the environment, as base64 or 64 hex characters. In the chart, `storeKey.existingSecret` and `storeKey.secretKey` name the Secret, which an External Secret fills from OpenBao; a `UNFOLD_STORE_KEY` entry in `credentialsSecret` works too. The key then never touches the data volume, so a copy of the volume or a backup alone does not open the secrets.
- **Unset.** The workbench creates `unfold.sqlite.key` next to the database on first start and reads it from there. This is the default for a local or demo workbench.

A malformed `UNFOLD_STORE_KEY` stops the start rather than falling back to a file.

### Moving the key off the volume

1. Copy the existing key into OpenBao: `base64 -w0 /data/workbench/unfold.sqlite.key` in the workbench pod gives the value. Using the same bytes means older backups still open with the key in OpenBao.
2. Point `storeKey.existingSecret` at the Secret that carries it and roll the workbench.
3. On start the workbench opens every stored secret with `UNFOLD_STORE_KEY`. A row only the key file opens is sealed again under `UNFOLD_STORE_KEY`, so a new key works too. Then the database is checkpointed, the key file is deleted and `store.key_adopted` is logged with the number of resealed rows.
4. If neither key opens a row, the start stops with `UNFOLD_STORE_KEY does not open the stored internal state` and nothing changes: the key file stays where it was.

With a new key rather than the file's bytes, a backup taken before the move needs the old key file, so keep it with those backups until they age out.

## When the check fails

1. Stop the workbench, so nothing writes to the damaged file.
2. Copy `unfold.sqlite` and `unfold.sqlite-wal` aside for analysis, with `unfold.sqlite.key` if the workbench still keeps its [key](#the-store-key) in a file.
3. Restore the last backup taken before the first failing check, with the key it was written under, and start the workbench.
4. Run the check against the restored copy before relying on it: `sqlite3 unfold.sqlite 'PRAGMA quick_check'` prints `ok` for an intact database.
