# Can Ploeg and Unfold run highly available, scale out, or scale to zero?

Date: 20 October 2026. Read against Unfold `origin/development` at `40d0ecea`, Ploeg `origin/development` at [`46528f4`](https://github.com/ploeg-hq/ploeg/tree/46528f434ca42d23667352f823e463c888e0e7f9) (production runs `v0.2.0-rc.43`; the `apps/ploeg` pin is 155 commits older and was not used), and homelab `origin/main` at `8ba0aa37`. This is a record. It answers three questions: can each application run more than one replica, where do they stop scaling and at what order of magnitude, and can either scale to zero. Nothing below is decided or built.

> **Method.** Code and manifest reading only. No load test exists in either repository, and live reads of the cluster and the Ploeg database were not done, so every limit below is an estimate from code paths, intervals and configured sizes, not a measurement. Ploeg paths are relative to the Ploeg repository; links point at commit `46528f4`.

[ploeg]: https://github.com/ploeg-hq/ploeg/tree/46528f434ca42d23667352f823e463c888e0e7f9

## Verdict

1. **Ploeg can run several ploegd replicas after a handful of targeted fixes.** All state is in Postgres. Work, Shift and Run claims use `FOR UPDATE SKIP LOCKED`, budgets are charged under row and advisory locks, settlement adds only the unsettled delta, migrations take an advisory lock, and the Shift engine already expects two evaluators. What is missing is listed under [Ploeg blockers](#ploeg-blockers-to-more-than-one-replica).
2. **Unfold cannot run more than one replica, by decision.** [App ADR 0002](../../apps/unfold/docs/adrs/0002-native-node-and-single-writer-storage.md) chose one SQLite writer and one replica and names an availability objective as the trigger to revisit. The owner agreed on 20 October to keep it that way for now.
3. **Together:** Unfold reads Ploeg by cursor polling and already tolerates events committed out of order, so more ploegd replicas need no Unfold change. The realistic target is ploegd at two or more replicas and Unfold at one, restarted quickly. An Unfold outage stops the screens, not the Runs.
4. **Scale to zero stays where it already is: the workers.** KEDA starts each Run's pod from a Postgres query and runs zero pods when nothing is pending. ploegd and Unfold both run timers and receive webhooks or long-lived connections, and they save little when idle. The owner agreed on 20 October not to pursue it.
5. **The first ceiling is not ploegd's replica count.** In order of arrival: the LiteLLM key listing, the 2 GiB database volume, and cluster capacity for workers. See [Bottlenecks](#bottlenecks-and-their-order-of-magnitude).

## Ploeg

### What already works with several replicas

- One Work Item, Shift or Run is claimed by one replica: `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1)` ([`pkg/store/store.go`][ploeg]), and the Shift pool is charged under `SELECT budget, spent … FOR UPDATE` (`pkg/store/shift.go`).
- The team cap is a `pg_advisory_xact_lock` per team inside the claim transaction (`pkg/store/team_capacity.go`).
- `ExpireLeases` and `ExpireRuns` are `DELETE`/`UPDATE … RETURNING`, so each expired row goes to one replica.
- `OpenRound` is a compare-and-set and `CloseShiftAndSettle` is idempotent (`pkg/shiftengine/engine.go`).
- Settlement locks the account and Run rows and adds only the delta over `reconciled_spend` (`pkg/store/llm_accounts.go`).
- Deploy checks, the notes outbox and stopped-item rechecks claim rows with `claimed_until` and `SKIP LOCKED`.
- Migrations run under a session advisory lock and are safe from several processes at once (`pkg/store/store.go`).
- ploegd mounts no volume; its root filesystem is read-only.

### Ploeg blockers to more than one replica

| # | Blocker | Effect with N > 1 | Fix |
| --- | --- | --- | --- |
| P1 | GitHub App installation tokens are kept only in memory ([`pkg/forgebroker/github.go:25-35`][ploeg]) | A replica cannot revoke a token another replica minted; the token lives to GitHub's one-hour expiry. [Ploeg ADR-0086](https://github.com/ploeg-hq/ploeg/blob/46528f434ca42d23667352f823e463c888e0e7f9/docs/adrs/0086-github-is-a-forge-and-a-run-pushes-with-its-own-github-app-installation-token.md) names "ploegd runs more than one replica" as its re-evaluation trigger. Forgejo is not affected. | Store the token sealed in Postgres keyed by Run, or accept the one-hour bound and supersede ADR-0086. |
| P2 | The chart hard-codes `replicas: 1` (`ops/helm/ploeg/templates/deployment.yaml:8`); no PodDisruptionBudget, no startup probe | Cannot be configured. | A `replicaCount` value, a PDB, topology spread and a startup probe. |
| P3 | Webhook dedup checks, processes, then records (`pkg/store/deliveries.go`); `work_item_reviews` has no unique key | Two replicas can process one delivery; one review can become two fix Rounds. | Insert the delivery id first with `ON CONFLICT DO NOTHING RETURNING`, add the unique key, or build the inbox [Ploeg ADR-0060](https://github.com/ploeg-hq/ploeg/blob/46528f434ca42d23667352f823e463c888e0e7f9/docs/adrs/0060-authenticated-webhooks-go-through-a-durable-inbox-and-required-publications-through-an-outbox.md) proposes. |
| P4 | The review reconcile reads every `awaiting_review` pull request with no claim (`pkg/shiftengine/review.go:77-115`) | Forge calls and the unmergeable-poll counter grow N times. | Claim each pull request with `claimed_until … SKIP LOCKED`, as deploy checks do. |
| P5 | LLM settlement and correction sweeps, orphan sweeps and premise checks are not claimed | N times the LiteLLM and forge calls. Results stay correct. | Claim the rows, or run these loops on one leader holding a lease row. |
| P6 | The usage report and findings comment are published at least once, find-then-create (`pkg/shiftengine/publish.go`) | Duplicate comments become likelier. | Publish under the existing pull request comment lock; key findings on Shift, Round and Role. |
| P7 | Smaller: the worker-rejection rate limit is per process; Vikunja webhook auto-registration can race; retry backoff maps are per process | Weaker limit, duplicate webhooks, more retries. | Move the limit to the database; take an advisory lock around registration. |

The case for running two: with the chart default lease TTL of 60 s, a worker cancels its Run after three failed renewals, about one minute without ploegd (`pkg/worker/worker.go:1093-1114`). Production sets `PLOEG_LEASE_TTL: 15m` ([homelab helmrelease](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/ploeg/ploeg/app/helmrelease.yaml)), so in production Runs survive about fifteen minutes of ploegd downtime. What production does lose during a restart is webhooks: there is no inbox and no assignment poll, and Vikunja never retries, so an assignment made in that window can be lost (`docs/how-to/drain-workers.md`). A second replica removes that window.

## Unfold

The Unfold application is one Node process that holds everything:

- One SQLite file and its AES key file on a ReadWriteOnce volume ([`src/main.ts`](../../apps/unfold/src/main.ts), [`src/store.ts`](../../apps/unfold/src/store.ts)). The chart pins `replicas: 1` and `Recreate` ([`templates/workbench.yaml`](../../apps/unfold/ops/helm/unfold/templates/workbench.yaml)).
- `engine.recover()` marks every running session `interrupted` at boot ([`src/engine.ts`](../../apps/unfold/src/engine.ts)). A second replica, or a rolling update, would interrupt the first replica's sessions.
- Timers with no coordination: card sweeps every 5 minutes, bug-report filing every minute and follow-up every 10 minutes, product-insight rollups hourly, engine maintenance every 15 s, delivery reconciliation at boot. Two replicas would file each bug report twice.
- Sign-in state in memory: OIDC PKCE state, editor device tickets, account-link OAuth state and the login rate limiter.
- The agent-host WebSocket keeps its clients, prompts and fan-out in memory, and its sequence number is reserved in blocks and overwritten without an atomic update.

What would already work with a shared database: login cookies and editor credentials, the session event stream (a database cursor), Ask metering (the ledger is in Ploeg, [ADR-0031](../adr/adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance.md)), `commandId` idempotency for Work Item commands, and keyed pull request comments. MCP runs on the user's machine and adds no server state.

If an availability objective arrives, the order is: finish the engine deletion of [app ADR 0023](../../apps/unfold/docs/adrs/0023-unfold-submits-work-to-ploeg-and-never-executes-it.md) so Ploeg owns all execution, which removes the boot-recovery problem; move the store to Postgres with a migration runner and the key file to a Secret; claim or lease the timers; persist sign-in state; then make the chart configurable.

What a single replica can still gain in restart time, availability and efficiency is measured in the [single-replica record](../../apps/unfold/docs/research/2026-10-20-unfold-single-replica-restart-and-efficiency.md).

## Together

- Unfold calls `/api/v1/operator/*` with plain `fetch`, 5 s timeouts, a 5 s cache and no retries ([`src/ploeg.ts`](../../apps/unfold/src/ploeg.ts)). It follows Ploeg's audit events with an ascending cursor every 3 s while someone watches, and reconciles every 60 s to catch events committed behind the cursor ([`src/ahp/work-items.ts`](../../apps/unfold/src/ahp/work-items.ts)). Several ploegd replicas behind one Service are therefore transparent to Unfold.
- When Ploeg is unreachable, Unfold answers `503 ploeg_unavailable`, the Status board shows Ploeg as down, and Work Item lists stay visible but stale. Unfold's `/readyz` checks only SQLite, so Unfold stays Ready.
- The events query is a primary-key range scan from the cursor, so its cost does not grow with the size of `audit_log`.

## Bottlenecks and their order of magnitude

Limits are estimates from code, not measurements. "Runs" means concurrent Runs unless stated.

| Component | Bottleneck | Grows with | Estimated limit | First fix |
| --- | --- | --- | --- | --- |
| LiteLLM admin | `ListKeys` pages through every key at 100 per page and filters on the client ([`pkg/litellm/client.go:475-512`][ploeg]); keys are blocked, never deleted; each Run triggers about 110 lookups (11 spend reads at finish, settlement, 96 corrections over 24 h) | Runs × all keys ever minted × replicas | Around 10³ Runs a day once about 10⁴ keys exist: roughly 10² requests per second against LiteLLM | Look a key up by alias or by its recorded id; delete keys after settlement; claim the sweeps |
| Database volume | CNPG data volume is 2 GiB; transcripts (up to 2 MiB per Run, JSONB) and context bundles (up to 50 MiB per Work Item, bytea) have no retention | Runs over time | Around 10³ Runs with full transcripts | Retention for transcripts, checkpoints and `audit_log`; move bytes to object storage; resize the volume |
| Workers | Production asks 100m CPU / 768 Mi per worker with a 1 CPU limit, under Kata; every Team has `maxReplicaCount: 1` | Concurrent Runs | Today about one Run per Team per Role; the worker pool's memory caps it at roughly 10¹ | Raise `maxRunning` and `maxReplicaCount` per Team; more worker nodes |
| Postgres connections | `pgxpool.New` with defaults: `max(4, node CPUs)` per replica ([`pkg/store/store.go:58-64`][ploeg]); `max_connections` defaults to 100; about 20 go to KEDA, the exporter, Grafana and replication | Replicas × node CPUs | About 5 replicas on 16-core nodes | `pool_max_conns` in the URL; a pooler only after the session locks are gone |
| Pull request comment lock | A session advisory lock holds a pool connection across up to four forge calls, then needs a second connection (`pkg/store/pull_request_comments.go`) | Concurrent comment writes | Four at once can stall the pool for 30 s | A transaction lock or a lease row, released before forge I/O |
| Sweep loop | One serial goroutine every 15 s; premise checks (up to 3 × 2 min), tracker rechecks (20 × 10 s) and LiteLLM calls sit in the same loop as lease and Run expiry | Live Shifts and external latency | Expiry can lag by minutes | Give expiry its own loop; move external calls out |
| Transcript ingest | Each flush (every 2 s per Run) counts all of that Run's entries, then inserts up to 100 rows one by one ([`pkg/store/transcript.go:45-80`][ploeg]) | Concurrent Runs | About 10² Runs per 100m ploegd replica | Batch insert; keep running totals; more CPU |
| GitHub | Review reconcile makes about 3 calls per awaiting pull request every 10 minutes, per replica | Awaiting PRs × replicas | About 280 awaiting PRs at one replica against 5000 requests an hour per installation | Webhook first; conditional requests; claim per pull request |
| Trackers | Up to 80 rechecks a minute; no 429 or `Retry-After` handling for ClickUp, Vikunja or Forgejo | Stopped Work Items | Near ClickUp's per-token limit at about 10³ stopped items | A rate-limited client that honours `Retry-After` |
| `operator_executions` | Anti-joins on `run_id` and `shift_id` without an index, in expiry, Shift and capacity queries | Executions × live Shifts | Fine below 10⁴ executions | Index both columns |
| ploegd memory | 256 Mi; context files up to 20 MiB are read whole; `ListKeys` holds every key | Concurrent fetches | About 10 concurrent context fetches | Stream the bytes; cap concurrency |
| Metrics | Full `agent_runs` aggregates per replica per scrape, cached 15 s | Rows × replicas | Fine to about 10⁶ Runs | Incremental counters |
| Unfold | One process, one SQLite writer | People watching, not Runs | Comfortably 10¹–10² concurrent viewers; never more than one replica | See [Unfold](#unfold) |

Read in order of arrival: at today's volume none of these bind except the workers' `maxReplicaCount: 1`. Growing towards hundreds of Runs a day, the LiteLLM key listing and the 2 GiB volume bind first; ploegd's replica count binds only after those, and then on Postgres connections and the serial sweep.

## Scale to zero

**Ploeg.** Workers already scale to zero: a KEDA ScaledJob per Team, Role and harness polls `COUNT(*)` of pending Runs every 5 s in production. ploegd cannot follow:

- Running workers renew their lease against it.
- Tracker webhooks are processed synchronously with no inbox.
- Expiry, settlement, merge detection, deploy checks and the notes outbox are timers.
- Boot checks the database, migrations, tracker projects and forge readiness, and runs orphan sweeps before it listens, which can exceed a webhook's timeout.

Making it scale to zero would need an always-on webhook inbox, an external sweep trigger, and workers that tolerate ploegd outages. It would save about 100m CPU and 256 Mi.

**Unfold.** The card, report and insight timers could become CronJobs, but engine maintenance cannot until app ADR 0023's deletion lands. WebSocket and SSE connections keep the pod busy, and the KEDA HTTP add-on handles WebSockets poorly. Each cold start re-attaches the ReadWriteOnce volume and breaks sign-ins in flight. The idle pollers already stop when nobody watches, so an idle Unfold costs little as it is.

## Follow-up

Each item becomes a ticket. Ploeg items land in `ploeg-hq/ploeg` first and are pinned afterwards ([ADR-0019](../adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md)).

1. Ploeg: run ploegd with more than one replica (P1–P7 above, the chart last).
2. Ploeg: look up a LiteLLM key by alias or id instead of listing every key, and delete keys after settlement.
3. Ploeg: retention for transcripts, checkpoints and `audit_log`, and a decision on object storage for context bytes.
4. Ploeg: give lease and Run expiry their own loop, apart from external calls.
5. Ploeg: batch transcript inserts.
6. Ploeg: index `operator_executions(run_id)` and `(shift_id)`.
7. Homelab: size the Ploeg database volume and the pgx pool for the replica count chosen in item 1.

Not verified: live database size, key count in LiteLLM, current Run volume and worker-pool headroom. A load test would replace the estimates above with numbers.
