# Executor contract

An **executor** is anything that launches worker processes against ploegd's
run API. KEDA is the flagship implementation, not the identity (design §6):
the chart also ships a plain CronJob executor (`executor.type: cronjob`),
and `demo.sh` — a human with curl — is a conforming executor too. There is
deliberately **no Go interface** for this seam: with zero Kubernetes code in
ploeg, the HTTP surface below *is* the SPI. (A Go interface returns to the
table when a controller-based executor lands — backlog #55/#58.)

## The scale signal

Spawn workers for a team while its claimable count is above zero. Read it
either way:

- **SQL** (what the KEDA postgresql scaler uses; served index-only by
  `work_items_claimable`):
  `SELECT COUNT(*) FROM work_items WHERE team = $1 AND state = 'queued' AND (next_eligible_at IS NULL OR next_eligible_at <= now())`
- **HTTP** (no Postgres credentials needed):
  `GET /api/v1/queue/depth?team=<name>` → `{"team": "...", "depth": n}`

Polling on a schedule (the CronJob executor) is equally valid — an
empty-handed spawn is free by design.

## The run protocol

The spawned process (normally `ploeg-worker`, but anything speaking the run
API qualifies — schemas in [run-api.v1.schema.json](run-api.v1.schema.json)):

1. `POST /api/v1/claim {"team": ...}` — **204 means exit 0** immediately
   (the empty-handed convention, backlog #49; this neutralizes every
   scaler-overshoot failure mode).
2. Renew the lease at TTL/3 via `POST /api/v1/runs/{token}/renew`; a 404
   means the lease is gone — kill the harness and stop.
3. Report progress via `.../checkpoint` (best-effort) and exactly one
   terminal `.../outcome` before exit (stuck requires a reason).

The 48-hex run token is the run's only credential.

## Executor obligations

- **Never retry a failed run yourself** (`backoffLimit: 0` equivalent).
  Ploeg owns retries via lease expiry and outcome ingestion; a launcher
  retry would double-charge the attempt budget and split the audit trail.
- **Enforce a wall-clock backstop** (`activeDeadlineSeconds` equivalent,
  slightly above the lease TTL, backlog #52). The DB lease always expires
  first — the backstop only guarantees the process dies.
- **One spawn = one auditable run.** Don't reuse a process for a second
  claim.
- Give the worker the env contract (see `ploeg.workerPodTemplate` in the
  chart): `PLOEG_API_URL`, `PLOEG_TEAM`, repo/forge/LLM wiring, and the
  `PLOEG_HARNESS*` selection.

## Explicit non-obligations

- **Mutual exclusion** — the lease (`FOR UPDATE SKIP LOCKED` + single
  live lease per item) provides it; spawning too many workers is safe.
- **Crash reporting** — ploegd's sweeper is the crash detector; a worker
  that dies hard simply stops renewing.
- **Payload delivery** — workers claim at boot (KEDA cannot inject per-row
  payloads, kedacore/keda#5100; every executor inherits the convention).
