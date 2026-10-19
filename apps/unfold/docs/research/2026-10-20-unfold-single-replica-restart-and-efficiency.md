# Unfold as one replica: restart fast, stay available, run lean

Date: 20 October 2026. Read against `origin/development` at `40d0ecea` and homelab `origin/main` 2d8e57c4. All paths below are relative to this application unless they start with `homelab:`. Nothing was changed in either repository and the production cluster was not touched.

Measurements were taken on the owner's Mac (Apple Silicon, Node 24.21.0 from `mise`) in demo mode. Two caveats apply to every number. The Mac is faster than a homelab node, so I also ran each boot on the efficiency cores (`taskpolicy -b`) as a slow-CPU stand-in; that run was roughly 4x slower. macOS fsync and RSS reporting are not Linux's, so storage and memory figures are lower bounds.

## TL;DR

- **The Node process is not the slow part of a restart.** Cold boot to `/readyz` green takes about 0.3 s on the Mac and about 1.3 s on the slow cores. Graceful stop takes 9-16 ms. In production the gap is dominated by Kubernetes: the Longhorn RWO detach/attach, the 10 s readiness period after a 2 s startup probe, and on a node failure the default 300 s `unreachable` toleration. None of these were measured live. They are the first things to fix.
- **What users see after a restart is worse than the gap itself.** The browser's live jobs back off exponentially on every failed refresh, up to 5 minutes (`public/core/live.js:7,26`), so a 30-60 s restart leaves the Now view stale for 2-4 minutes after Unfold is back. The session view's `EventSource` stops for good once Envoy has returned a 503 (`public/views/session.js:907-910`).
- **The boot gains are real but small in absolute terms.** A compile cache baked into the image halves boot (300 to 165 ms; 1.3 s to 0.65 s on slow cores) and needs no source change or ADR amendment. Precompiling or bundling adds about 10-25 % more on top of that.
- **Durability is better than it looks.** `ploeg/unfold-data` is already enrolled in Longhorn's daily off-cluster backup to Garage (02:00, keep 7). That gives an RPO of up to 24 h, with the key file inside the same backup. Litestream to the same Garage would bring the RPO down to seconds.
- **Polling is cheap.** 100 idle SSE streams used 0.65 % of one core, and the idle process used 0.1 %. Event-driven fan-out would improve latency (0-500 ms down to about 0), not efficiency. Heap at idle is about 25 MB, against a 1 GiB limit.

## 1. Boot path

**What happens before `/readyz` goes green** (`src/main.ts`):

1. ESM import of 190 user modules, about 33k lines of TS. The first `.ts` import also initialises the type stripper.
2. `adoptRenamedDatabase` and `new Store(...)` (`src/store.ts:42-104`) read or create the key file and run 46 `CREATE TABLE/INDEX IF NOT EXISTS` statements plus WAL pragmas in a single `exec`.
3. `WorkerRelay` and the runtimes, then `new Engine(...)`, which starts the 15 s maintenance interval when there is a broker or authority (`src/engine.ts:119-122`).
4. `engine.recover()` (`src/engine.ts:808-825`) is synchronous and runs `listSessions()` over every session (JSON.parse each one): reconnect, interrupt and halt-runs.
5. `buildServer` (`src/http.ts:178-288`). `delivery.reconcileAll()` is already fire-and-forget (`src/http.ts:184`), so it does not block. It also builds the CardService, flags (`flags.watch()` polls a file every 5 s, `src/flags.ts:129`), insight and reports timers, tripwire and more.
6. `startCardSweeps` (first sweep at +30 s) and `tripwire.start()`, then `listen` (`src/main.ts:75-81`). `/healthz` and `/readyz` both answer as soon as the port is listening. `/readyz` adds only `store.ping()` (`src/http.ts:300-303`).

**Measured** (median of 7 runs, boot to `/readyz` 200):

| Variant | Mac | Slow cores | Import only | RSS after import |
| --- | --- | --- | --- | --- |
| Today: `node src/main.ts` (type stripping) | 293-302 ms | 1301 ms | 250-265 ms | ~140 MB |
| + `NODE_COMPILE_CACHE` (warm) | 165 ms | 652 ms | 108-120 ms | ~104 MB |
| tsc 7 emit to JS (`rewriteRelativeImportExtensions`) | 178 ms | - | 121-154 ms | ~97 MB |
| JS + compile cache | 154 ms | - | 97-104 ms | ~98 MB |
| esbuild single-file bundle (2.1 MB) | 148 ms | - | 96-148 ms | ~94 MB |
| bundle + compile cache | 127 ms | 515 ms | - | - |
| Bare `node -e 0` | 13-16 ms | - | - | - |

Breakdown: the type stripper costs about 20-30 ms to initialise (a one-line `.ts` import takes 21-34 ms against 0.5 ms for `.js`). Stripping and compiling the graph is about 150 ms. Everything after import (store, recover, buildServer, listen) is about 25-40 ms. A synthetic 88 MB database with 3,000 sessions and 180k events added about 50 ms, all of it in `recover()`'s linear `listSessions()`.

**Options**

| Option | What | Effort | Gain | Risk |
| --- | --- | --- | --- | --- |
| 1a. **Bake a compile cache into the image** | In the `stage` Dockerfile stage: `RUN NODE_COMPILE_CACHE=/app/.node-cache node --input-type=module -e "await import('/app/src/main.ts')"`. The import is safe because `main()` only runs when argv[1] is main.ts (`src/main.ts:91`). Set `ENV NODE_COMPILE_CACHE=/app/.node-cache` in the runtime stage. | S | **Measured −45 % boot** (300 to 165 ms; 1.3 to 0.65 s on slow cores), −35 MB RSS | Low. Verified: a read-only cache directory still hits (fits `readOnlyRootFilesystem`), an empty read-only directory degrades silently to no cache, and `--max-old-space-size` does not invalidate it. The stage image (`-dev`) and the runtime image must carry the same Node build; on a mismatch it is a silent miss. Source stays `.ts`, so app ADR 0002 ("startup performs no compilation") is untouched. |
| 1b. Emit JS with tsc 7 at image build | `tsc -p` with `rewriteRelativeImportExtensions`, `noCheck`; copy `flag-registry.json`. `src/` imports `../public/...` through `import.meta.url` (`src/mcp.ts:57-59`, `src/ploeg.ts:101`), so `dist/` must sit beside `src/`. | M | Measured −40 % alone, −49 % with the cache | Amends ADR 0002 (a build step), stack traces point at JS, and a second artefact needs testing. Little extra over 1a. |
| 1c. esbuild bundle | `--bundle --format=esm --packages=external`. Works as is: top-level await is fine in ESM, and the `import.meta.url` paths resolve when the bundle sits one level below the app root. | M | Measured −58 % with the cache (127 ms) | Adds a dev dependency and a build step, which ADR 0002 rules out. Not worth it for about 40 ms over 1a. |
| 1d. Startup snapshot / SEA | `--build-snapshot` needs a single CJS script and cannot snapshot `node:sqlite` handles or sockets. SEA does not support ESM entrypoints with TLA cleanly. | L | Estimated another 50-80 ms at most | High; incompatible with the ESM plus TLA layout. **Not recommended.** |
| 1e. Lazy imports | Defer modules not needed for the first request (MCP, cards, delivery verifier, tripwire, chat) with `await import()` on first use. | M | Estimated 20-40 % of import time, overlapping with 1a | Changes error timing; a broken module fails on first use, not at boot. Low value once 1a is in. |
| 1f. Move `recover()` after `listen` | Answer `/healthz` immediately, and have `/readyz` stay 503 until recovery is done. | S | Estimated 0 today (25-50 ms); grows with the session count | Requests during recovery could see sessions before they are marked interrupted. Only matters at more than about 10⁴ sessions. Becomes moot with ADR 0023. |
| 1g. **Probe tuning** | Today: `startupProbe /healthz` every 2 s, then `readinessProbe /readyz` every **10 s** with no `initialDelaySeconds` (`ops/helm/unfold/templates/workbench.yaml:167-182`). After the startup probe passes, readiness only flips on the readiness worker's next tick. Change both to `periodSeconds: 1`, with startup `failureThreshold: 60` and readiness `failureThreshold: 3`. | S | Estimated **1-10 s** off every restart, an order of magnitude more than 1a | Close to none. A 1 s readiness probe that touches SQLite costs about 1 µs of work. Whether this kubelet version triggers readiness right after startup success was not verified; the change helps either way. |

## 2. Restart and rollout availability with one replica

What a restart costs today, estimated (none of it measured live):

| Phase | Today | Evidence |
| --- | --- | --- |
| SIGTERM to process exit | 9-16 ms measured with no active work. Bounded by `terminationGracePeriodSeconds: 90` if `engine.shutdown()` waits on active tasks. | `src/main.ts:50-62,82`, `src/engine.ts:915-935`, `workbench.yaml:59` |
| Recreate: the new pod is created only after the old one is fully gone | 1-3 s | `workbench.yaml:27-29` |
| Longhorn RWO detach, then attach | Estimated 5-30 s. `longhorn` class, 2 replicas enforced by Kyverno, network-attached. | homelab `helmrelease.yaml:549-550`; Longhorn `helmrelease.yaml` comments |
| Image and image-volume pull | 0 on the same node; digest-pinned `IfNotPresent`, including the `delivery-inputs` image volume | values.yaml `pullPolicy`, homelab helmrelease |
| Node boot | 0.3-1.3 s (measured range) | section 1 |
| Probes | 0-2 s (startup) + 0-10 s (readiness) | `workbench.yaml:167-182` |
| Envoy EDS update | About 1 s | - |
| **Node failure** | **≥300 s.** The default `node.kubernetes.io/unreachable:NoExecute` toleration is 300 s; only then is the pod evicted and Longhorn's `delete-both-statefulset-and-deployment-pod` lets it reschedule. | default tolerations; Longhorn `nodeDownPodDeletionPolicy` |

**Options**

| # | What | Effort | Gain | Risk |
| --- | --- | --- | --- | --- |
| 2a. **Browser recovers immediately after a restart** | `createLive` backs off `interval * 2^failures` up to 5 min (`public/core/live.js:7,26`). The Now view polls every 30 s (`public/views/now.js:462`), so two failures push it to 120 s and three to 240 s. Fix: reset every job's `failures` once any request succeeds again (or on `online` / `visibilitychange`), and cap backoff for 502/503/504 and network errors at about 15 s. | S | **Estimated 1-4 min less staleness** per restart, the largest user-visible win here | Low. On a real outage, polling is a little more frequent. |
| 2b. **`EventSource` reconnect** | `follow()` only flips a flag in `onerror` (`public/views/session.js:907-910`). The browser stops reconnecting for good once a reconnect gets a non-200 (Envoy's 503 during the gap). Fix: on `readyState === CLOSED`, call `follow(id, lastSeenId)` with jittered backoff. Also let the server prefer `Last-Event-ID` over a lower `?after=` (`src/http.ts:926`); today an automatic reconnect replays from the original cursor and the client dedupes it in O(n). | S | The session view resumes by itself instead of staying "offline" | Low |
| 2c. **Lower `terminationGracePeriodSeconds` and add a shutdown deadline** | With Recreate, a slow `close()` is pure downtime. Add a hard deadline in `close()` (about 10 s, then `process.exit`) and set the grace period to about 15-20 s. A `preStop` sleep is **pointless** here, because no other pod takes the traffic. | S | Bounds the worst case from 90 s to about 15 s | Active managed sessions are interrupted harder. `engine.shutdown()` already marks them `interrupted`, and reattachable workspaces reconnect on `recover()` (`src/engine.ts:815,918-922`). |
| 2d. **Node-failure tolerations** | Add `tolerations` for `node.kubernetes.io/unreachable` and `not-ready` with `tolerationSeconds: 30-60` on the Unfold pod (the chart already passes `.Values.tolerations`). | S | Estimated **4-4.5 min off a node-loss outage** | Flapping nodes cause extra reschedules. The flapping `fringe-workstation` is outside the `worker` pool that Unfold is pinned to, so the risk is lower. Owner's call (homelab values). |
| 2e. **Maintenance page at the gateway** | Envoy Gateway v1.9.1 supports `BackendTrafficPolicy.responseOverride`: on a 503 from the `unfold` route, serve a small HTML page from a ConfigMap ("Unfold is restarting, this page retries itself") with `Retry-After`. Scope it to `text/html` navigations only, so that API callers still see a 503. | M | Users get a friendly page that retries itself instead of Envoy's "no healthy upstream" | It must not swallow JSON 503s such as `ploeg_unavailable`. Match only upstream-unavailable 503s with a `text/html` Accept, and test it. Homelab change. |
| 2f. Envoy retry | A `BackendTrafficPolicy.retry` for idempotent GETs on `connect-failure`/`reset` with 2-3 retries (250 ms base). It cannot cover a gap of 10 s or more; it only covers resets. | S | Removes stray 503s around the moment of a restart and from keep-alive races (see 6f) | Retried non-idempotent requests. Restrict it to GET/HEAD. |
| 2g. PodDisruptionBudget | With one replica, `minAvailable: 1` blocks every voluntary eviction, so a node drain hangs until someone intervenes. `maxUnavailable: 1` protects nothing. **Recommendation: no PDB.** Drain instead through a documented step (scale to 0 or delete the pod) at a quiet moment. | - | - | A PDB here would only stall Longhorn and node maintenance. |
| 2h. priorityClass | `priorityClassName` is supported (`values.yaml:21`) and unset. After the 2026-08-01 incident, worker-1 sat at 3947m of 3950m CPU requested. On a node loss Unfold could stay Pending. homelab's `platform-critical` is explicitly "not for applications". An `app-important` class (say 100000000) would let Unfold preempt batch workloads (workers, CronJobs). | S (homelab) | Unfold reschedules under capacity pressure instead of waiting | Preempts other apps' pods; a cluster-wide policy decision. |
| 2i. Keep the volume attached | Same-node restarts could skip detach/attach: `dataLocality: best-effort` plus a preferred node affinity to the replica's node. | M | Estimated 5-20 s per same-node restart | Ties Unfold to a node and interacts with the Kyverno replica ceiling. Measure attach time first (see 7c). |

What is already right: `Recreate` (never two writers, as ADR 0002 requires), `checksum/config` restarts only on config changes, the Reloader annotation is scoped to `unfold-reports-token`, AHP clients get `1001` on shutdown and have a `reconnect` handshake (`src/ahp/host.ts:534,1440-1450`), and SSE sends `retry: 1500` (`src/http.ts:929`).

## 3. Data durability and fast recovery

**Today** (`src/store.ts:42-57`): `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`. Defaults, measured: `synchronous=FULL` (2), `page_size=4096`, `wal_autocheckpoint=1000`, `cache_size=-2000` (2 MiB), no `mmap`. SQLite is 3.53.4. There is no `PRAGMA optimize`, `ANALYZE`, `VACUUM` or integrity check anywhere. `store.close()` (`:106`) closes the last connection, which checkpoints and removes the WAL, so the next open is clean. The key is `unfold.sqlite.key`, 32 random bytes written with `wx`, mode 0600, on the same volume (`:45-48`). It AES-encrypts `internal_state` (workspace credentials, publication records, linked tokens).

**Backup today, which nobody in the app docs mentions:** homelab's Kyverno policy `longhorn-backup-enrollment` lists `ploeg/unfold-data` under `enrol-irreplaceable`. The volume therefore gets the `gitops-backup` RecurringJob: a daily Longhorn backup at 02:00, keeping 7, to `s3://cnpg-backups-bucket@garage/longhorn-backups` (homelab `kubernetes/apps/kyverno/policies/app/longhorn-backup-enrollment.yaml`, `longhorn-system/longhorn/app/recurringjob.yaml:42`, `backuptarget.yaml`). A block snapshot of a WAL database is crash-consistent, because database, WAL and key are on one volume. **RPO ≤ 24 h. The backup holds the key next to the ciphertext.**

| # | What | Effort | Gain | Risk |
| --- | --- | --- | --- | --- |
| 3a. `PRAGMA synchronous=NORMAL` | In WAL mode NORMAL is corruption-safe. It drops the fsync on each commit and keeps it at checkpoint. Every mutating request writes an `action_records` row (`src/http.ts:1015`). | S | Measured 48 to 13 µs per commit on APFS. On Longhorn every fsync is a network round trip to 2 replicas, estimated 1-5 ms per write request. | A power loss or node crash can lose the last commits before a checkpoint (not corrupt them). Acceptable for this data (Ploeg owns work state) but **a decision**. |
| 3b. `PRAGMA optimize` | Run it once after the schema `exec` and every few hours (`PRAGMA optimize=0x10002` at open). | S | Measured 2 ms. Keeps the query planner stats current as `events`/`product_event` grow. | None |
| 3c. Integrity check off the hot path | `PRAGMA quick_check` once a day from the insight maintenance timer, logging and alerting on failure. **Not at boot**: measured 100-340 ms on 88 MB, growing linearly. | S | Corruption shows up before a backup rotates it out | None |
| 3d. **Litestream sidecar to Garage** | A native sidecar (`initContainers` with `restartPolicy: Always`) runs `litestream replicate` to a Garage bucket. An init container runs `litestream restore -if-db-not-exists -if-replica-exists`. Garage S3 already exists and has a PushSecret/ExternalSecret pattern (homelab `kubernetes/apps/garage/garage/bootstrap/*.pushsecret.yaml`). Litestream takes over checkpointing, so leave `wal_autocheckpoint` as is, keep `busy_timeout`, and never `VACUUM` while it runs. | M | **RPO from 24 h to about 1 s**, and restore onto a fresh volume becomes automatic (estimated seconds for a DB of tens of MB). This is also the only path to "lose the volume, not the data" with one Longhorn replica set. | One more container and image (check DHI or Chainguard for a zero-CVE Litestream, per app ADR 0010). Bucket credentials go through the vault (ADR-0055). A restore must still bring the key (3e). |
| 3e. **Key from OpenBao instead of the volume** | Have `Store` accept a base64 key from env (`UNFOLD_STATE_KEY`) or a mounted Secret file, falling back to `${path}.key` (`src/store.ts:45-48`). An `ExternalSecret` from `ploeg/unfold-state-key`; a person runs `bao kv put` with the **existing** key's bytes, and the agent never handles the value. | S (code) + S (homelab) | Volume and Litestream backups no longer carry their own decryption key. Restoring onto a fresh volume no longer depends on the key file surviving. | **Losing the vault entry loses `internal_state`.** It must never be rotated by Reloader: homelab already notes that "Unfold holds at-rest keys that must never trigger a restart", so no `reloader` auto annotation. Fail closed when the env key and the file disagree. |
| 3f. Hourly Longhorn backup instead of Litestream | A separate RecurringJob group for `unfold-data` at `0 * * * *`. | S (homelab) | RPO 24 h to 1 h, with no app change | More load on `garage-fsn1`, which the comments say is nearly full; incremental block backups of a 4 GiB volume are small. |
| 3g. Restore drill | Document and test: restore the Longhorn backup or Litestream into a scratch PVC, start Unfold in a scratch namespace with the key, run `quick_check`. | S | A restore time you know instead of guess; also satisfies app ADR 0002's "back up and restore as a coherent SQLite snapshot" | None |
| 3h. VACUUM / auto_vacuum / mmap / page size | Not worth it now. No measured problem: 4 KiB pages are fine, and `mmap` has little benefit on a network block device. `VACUUM` conflicts with Litestream. Revisit if `freelist_count` grows large. | - | - | - |

Not verified: the production DB size, WAL size, and whether the daily Longhorn backups of `unfold-data` actually succeed (check the Longhorn UI or `backups.longhorn.io`).

## 4. Moving timers out of the process

Inventory (all in-process, all `unref`'d):

| Timer | Interval | Where | Idempotent? |
| --- | --- | --- | --- |
| Card sweeps (backfill, refresh, rarities, mends, PR comments) | +30 s, then every 5 min | `src/main.ts:45-49`, `src/cards/service.ts:246-256` | Mostly. Rarity is skipped when already stored. `refreshedUntil` lives in memory, so every restart re-reads the last 24 h (up to 8 pages). PR comment publishing is keyed. |
| Report retry | 60 s | `src/reports.ts:16,369` | At-least-once. Each step is checkpointed (`src/reports.ts:539-570`), but a crash between `createIssue` and `updateReport` files a duplicate issue. |
| Report follow-up | 10 min | `src/reports.ts:21,371` | Yes (read and record) |
| Insight rollup and retention | +60 s, then hourly | `src/insight.ts:46-48,248` | Yes (daily upsert) |
| Engine maintenance (`observeSpend`, `reconcilePending`) | 15 s | `src/engine.ts:119-122` | Yes, but tied to the in-process engine (ADR 0023) |
| Tripwire reader | 15 s | `src/tripwire/reader.ts:30,94` | Cursor per Run in SQLite (`tripwire_runs`) |
| Flag file watch | 5 s | `src/flags.ts:129` | n/a |
| AHP poll / Ploeg work-items follower / SSE tick | 300 ms / 3 s (+60 s reconcile) / 500 ms, only while someone is connected | `src/ahp/host.ts:41,493-495`, `src/ahp/work-items.ts:320-322`, `src/http.ts:947` | n/a (views) |

**Recommendation: keep them in-process.** With one replica there is nothing to coordinate. A CronJob that calls an internal endpoint adds a pod start (seconds of CPU on a tight node), an authenticated internal route, a NetworkPolicy, and a failure mode where Unfold is down. The only benefit is scale to zero, which the owner declined. Two cheap fixes instead:

- 4a. Persist the card sweep's `refreshedUntil` (one `internal_state` row). That saves up to 8 Ploeg page reads after every restart. S, low risk.
- 4b. Make report filing exactly-once in practice: before `createIssue`, search for an issue carrying the report id marker in its body (or set a client token if Forgejo supports one), then record it. S-M, low risk. It matters more if restarts become frequent.

Revisit CronJobs only if Unfold ever runs more than one replica (then lease the timers instead, see the HA research) or scales to zero.

## 5. App ADR 0023: deleting the engine

Status: ADR 0023 is accepted and not implemented. Proposed ADR 0044 and `openspec/changes/sessions-run-in-ploeg` widen it (attended Runs, a Harness per session). **1 of 39 tasks is done** (`openspec/changes/sessions-run-in-ploeg/tasks.md`).

What goes, counted from the tree: `src/broker.ts` (188), `src/execution-authority.ts` (214), `src/runtime/{opencode,command,docker,kubernetes,sandbox,workspace,relay,git-access}.ts` (2,007), the non-demo paths of `src/engine.ts` (1,412 in total), and later the transitional delivery verifier and publisher (`src/delivery*.ts`, `src/trusted-candidate.ts`; about 930). **About 2.4k lines certainly and up to about 4.5k**, out of 33.3k: roughly 7-14 % of the server. It also removes the `unfold-agent` image, the workspace RBAC (`templates/workspace-rbac.yaml`), `automountServiceAccountToken` in live mode (`workbench.yaml:58`), the kube-apiserver egress (homelab `CiliumNetworkPolicy unfold-api`), and the relay endpoint.

Effect on restart safety:

- Today a restart **interrupts in-flight execution**. `engine.shutdown()` marks non-reattachable sessions `interrupted` with "Resume explicitly after restart", and `recover()` does the same at boot (`src/engine.ts:808-835,915-935`). Reattachable workspaces survive through `reconnect()`. That is why a restart is not free today, and why the 90 s grace period exists.
- After deletion a restart **drops only views**. Ploeg owns every Run, Unfold holds no Run state, and `recover()` shrinks to the demo. The shutdown deadline (2c) can then be about 5 s, the 15 s maintenance loop goes, and `PLOEG_LEASE_TTL: 15m` on Ploeg already covers worker continuity.
- Boot: with fewer modules to import (estimated 5-10 % of import time) and no `listSessions()` scan, about 0.5-1 % of a restart. The gain is **safety, not speed.**
- Risk: the deletion itself is L, and in-flight Operator Executions have to drain first (the openspec covers this). Until it lands, every restart has a cost for anyone with a live session, which argues for doing 2c and 2a first.

Effort: L, already planned. For restarts it is the single largest **qualitative** improvement, since restarts become safe to do at any time.

## 6. Runtime efficiency

**Measured** (demo, Mac, in-process `process.memoryUsage()` every 1 s; RSS from `ps` is meaningless on macOS because of memory compression):

- Idle after boot: heapUsed 26 MB, heapTotal 38 MB, external 15 MB, RSS about 135-141 MB (code, V8 and the stripper; about 100 MB with the compile cache).
- Under load (5 demo sessions, 16k HTTP requests at concurrency 20, 100 SSE streams): heapUsed peaked at 36 MB and heapTotal at 58 MB, then returned to 24 MB heapUsed.
- Idle CPU: 0.1 % of one core. **100 idle SSE streams: 0.65 %** (195 ms CPU in 30 s, i.e. 6,000 ticks at about 30 µs each).
- Latency at concurrency 20 (p50/p99, ms): `/readyz` 1.0/4.8 (15.6k rps), `/api/bootstrap` 1.3/5.6, `/api/sessions` 5.2/16.4 (16 kB, 3.3k rps), one session 4.4/9.7, `/app.js` gzip 1.5/4.3, `/` 1.4/5.2.
- `prepare()` on every call (117 call sites in `store.ts`) against a cached statement: 2.8 µs against 0.95 µs per query.

| # | What | Effort | Gain | Risk |
| --- | --- | --- | --- | --- |
| 6a. Memory limits | Limit 1 GiB, request 256 Mi (`values.yaml:12-18`); measured heap ≤ 60 MB. Set `NODE_OPTIONS=--max-old-space-size=384` (or `--max-old-space-size-percentage` if available) so GC pressure arrives before the cgroup OOM, and lower the limit to 512 Mi. | S | About 512 Mi less reserved on a RAM-tight cluster; an OOM turns into a JS heap error with a stack | Unknown prod peaks: a large `/api/sessions` (unpaginated `listSessions`) or the card art and bundle downloads that buffer whole files (`src/http.ts:904,913`). Watch `container_memory_working_set_bytes` for a week first. |
| 6b. Event-driven fan-out from the single writer | `Store.appendEvent` emits on an in-process `EventEmitter`. SSE ticks (`src/http.ts:931-947`) and the AHP poll (`src/ahp/host.ts:1181`) wake on it, and keep a slow fallback timer (5 s) for safety. | M | Latency 0-500 ms (SSE) and 0-300 ms (AHP) down to about 0. CPU: measured ≤ 0.65 % saved, i.e. noise. | Subtle ordering and replay bugs; events written outside `appendEvent` would be missed, hence the fallback timer. **UX gain, not efficiency.** |
| 6c. Ploeg follower (3 s) | Cross-process, so it cannot be an in-process event. Only Ploeg SSE (ADR 0023 says "only if measured to be needed") would remove it. | - | - | Leave it. |
| 6d. Prepared-statement cache | `db.createTagStore()` (present in Node 24.21) or a small `Map<string, StatementSync>`. | S | Measured about 1.8 µs per query: noise at today's rates | Low. Do it only while touching store.ts. |
| 6e. Static assets | Today: `Cache-Control: no-cache` plus a strong ETag, with gzip level 9 computed lazily on first request and cached in memory (`src/static.ts:45-47`). The index graph reaches up to about 196 files / 4.8 MB, so a cold page load sends about 100-200 conditional requests that each return 304. Envoy is already set up for Brotli/Gzip (homelab `envoy.yaml:149-166`), but upstream gzip bypasses it, so browsers never get Brotli. Options: **(i)** precompress `.br`/`.gz` at image build and serve `br` when accepted (S); **(ii)** a version prefix (`/v/<version>/...`) or `?v=` with `immutable, max-age=31536000` for everything but `index.html`, rewriting import specifiers at build (M, and it touches ADR 0002's "no frontend build"); **(iii)** warm the gzip cache after `listen` so the first visitor after a restart does not pay for level-9 compression of large vendor files (S). | S-M | (i) about 15-20 % fewer bytes than gzip; (ii) removes about 100-200 revalidations per navigation, so page load after a restart is noticeably faster on mobile or VPN; (iii) tens of ms once per restart | (ii) is the only real change: cache busting must be exact or stale modules mix. |
| 6f. **HTTP keep-alive** | `server.keepAliveTimeout` is not set (`src/http.ts:1002-1023`), so Node's default of 5 s applies. Envoy's upstream idle timeout defaults to 1 h. When Node closes an idle connection just as Envoy reuses it, Envoy returns a 503 "upstream connect error ... connection termination". Set `server.keepAliveTimeout = 75_000` (and `headersTimeout` above it), or set the BackendTrafficPolicy `connection.connectionIdleTimeout` below 5 s. | S | Removes a known class of sporadic 503s (estimated; not seen in logs, since VictoriaLogs was not queried) | None |
| 6g. Image | The image copies `scripts/` (616 kB of dev scripts) and `examples/`. `public/` is 6.1 MB (vendor three.js and html-to-image 2.2 MB), `src/` 2.6 MB, prod `node_modules` is `ws` only. The base is DHI `node:24-alpine`, plus git copied in for delivery. Image size was not measured (no registry access). The app layers are about 10 MB, which matters only on a pull to a new node, and the pin is by digest. | S | Estimated < 1 s on a cold node | Check which `scripts/` the runtime needs (`user:add`, `mcp`) before dropping any. |
| 6h. `/api/sessions` unpaginated | `listSessions()` parses every session body (`src/store.ts:127-129`); measured 5.2 ms p50 with 5 sessions and 16 kB. It grows linearly and is called by the 30 s browser poll. Paginate, or select a summary column. | M | Matters only after about 10³ sessions; ADR 0023 removes most of them. | Low |

## 7. Observability for availability

Today: blackbox `Probe blackbox-unfold` through `envoy-internal` `/healthz`, every **60 s** (homelab `observability/blackbox-exporter/app/probe-unfold.yaml`). `SyntheticRouteDown` fires after **10 min** (`prometheusrule-blackbox.yaml:265-268`). `/readyz` checks only `SELECT 1`. Unfold exposes no Prometheus metrics; errors go to Alloy as OTLP logs (app ADR 0042).

| # | What | Effort | Gain | Risk |
| --- | --- | --- | --- | --- |
| 7a. SLO | A suggestion: availability of `GET /readyz` through the gateway, 99.5 % over 30 days (about 3.6 h of budget). That fits a single replica that restarts for every release; with the fixes above, each restart costs well under a minute. Track restart time (7c) separately. | S | A number to steer by. ADR 0002 names an availability objective as the trigger for revisiting HA. | Choosing the target is the owner's decision. |
| 7b. Probe granularity | Probe every 15 s and alert on `avg_over_time(probe_success[5m]) < 0.8` for 5 min. A 60 s probe never sees a 20-40 s restart. | S (homelab) | Restart gaps become visible and countable | More probe traffic (negligible) |
| 7c. **Measure restart duration** | Without code: `kube_pod_container_status_ready_time - kube_pod_created` from kube-state-metrics (if enabled), plus Kubernetes events (`SuccessfulAttachVolume` against `Scheduled`). With code: log `{event:'server.ready', bootMs: performance.now()}` (already logs `server.ready`, `src/main.ts:80`; add `bootMs`, `recoveredSessions`, `importMs`). Alert when the pod has been not-Ready for more than 120 s. | S | Turns every estimate in section 2 into a number, Longhorn attach time first | None |
| 7d. Readiness depth | Keep `/readyz` as SQLite only. Do **not** add Ploeg: Unfold stays useful with Ploeg down (`ploeg_unavailable`, stale lists), and a dependency in readiness would turn a Ploeg outage into an Unfold outage. Maybe add a write check (`BEGIN IMMEDIATE; ROLLBACK`) to catch a read-only or full volume. | S | Catches a full 4 GiB volume or a read-only remount | A write lock taken once a second is fine with one writer. |
| 7e. `/metrics` | Minimal Prometheus text for process heap, event-loop lag (`perf_hooks.monitorEventLoopDelay`), open SSE/WS clients, SQLite DB and WAL size, and boot duration. A ServiceMonitor needs `release: kube-prometheus-stack`. | M | Alerts on heap growth, a growing WAL (a stuck checkpoint, especially with Litestream), and event-loop stalls | Must not be reachable from the internet; it needs its own port or a NetworkPolicy. |
| 7f. Backup freshness alert | Alert when the latest Longhorn backup of `unfold-data` (or the Litestream replica lag) is older than 26 h (or 5 min). | S | A backup that fails silently gets noticed | None |

## Recommended order

1. **Browser recovery after restarts** (2a, 2b). S, app only. This is the largest gain users can see.
2. **Probe periods to 1 s; shutdown deadline with grace period about 20 s; `keepAliveTimeout` 75 s** (1g, 2c, 6f). S, chart and app. Seconds off every restart, and no more stray 503s.
3. **Measure restart time** (7c plus `bootMs`) and **probe every 15 s** (7b). S. Do this before anything homelab-wide, so 2d, 2i and 3f rest on numbers.
4. **Bake the compile cache into the image** (1a). S, Dockerfile only. Halves boot, needs no ADR change.
5. **SQLite hygiene**: `optimize`, a daily `quick_check`, and a decision on `synchronous=NORMAL` (3a-3c). S.
6. **Node-failure tolerations at 30-60 s** (2d) and a decision on a priorityClass (2h). S, homelab, owner's call.
7. **Key into OpenBao** (3e), then **Litestream to Garage** (3d), with a **restore drill** (3g) and a backup-freshness alert (7f). M. If Litestream waits, raise the Longhorn backup to hourly (3f) in the meantime.
8. **Maintenance page** at Envoy (2e) and a GET-only retry (2f). M, homelab.
9. Memory: set `--max-old-space-size` and lower the limit after a week of data (6a). Precompressed static files and warm-up (6e i/iii). S.
10. **ADR 0023 engine deletion** (5). L, already planned. Makes every restart safe; schedule it on its own merits.
11. Optional and low value now: event-driven fan-out (6b), immutable hashed assets (6e ii), lazy imports, a bundle or emitted JS (1b/1c/1e), persisting `refreshedUntil` and exactly-once report filing (4a/4b), a statement cache (6d), paginating `/api/sessions` (6h). Skip snapshots or SEA (1d) and a PDB (2g).

## Not verified

Live restart time, Longhorn attach/detach time, production DB, WAL and volume usage, whether the daily `unfold-data` Longhorn backups succeed, production memory and CPU use, image size, whether this cluster's kubelet runs readiness right after a startup success, and whether Envoy has logged keep-alive 503s for Unfold. Every production number above is an estimate from code and manifests. Local numbers come from a faster machine and macOS storage.
