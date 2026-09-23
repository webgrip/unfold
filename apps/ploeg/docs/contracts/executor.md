# Executor contract

This contract covers unattended worker launch against ploegd's run API. The
[chart](../../ops/helm/ploeg/) supports KEDA ScaledJobs and a CronJob executor
(`executor.type: cronjob`). The HTTP surface is the integration boundary.
Managed requests also require [worker control authentication](worker-control.md).
The old [curl demo](../../ops/local/demo.sh) predates those requirements.
Delegated workbench execution uses the separate [operator contract](README.md).

## The scale signal

Spawn workers for a team while its claimable count is above zero. Read it
by SQL: use the predicates in [the ScaledJob template](../../ops/helm/ploeg/templates/scaledjob.yaml),
including role eligibility and exclusion of operator-owned work. Do not
reconstruct them from the old queued-item example.

The HTTP scale signal, `GET /api/v1/queue/depth`, was removed on 2026-09-23.
Nothing consumed it: KEDA reads Postgres directly and the CronJob executor
polls by spawning. An executor without database credentials can poll by
spawning in the same way.

## Concurrency caps

A team can have a concurrency cap: the most Runs it may have running at
once. ploegd enforces it at claim time. A claim over the cap gets **204**,
the same as an empty queue, so the worker exits 0 and the pending Run
stays queued for a later claim. A Run stops counting when it finishes,
whether by outcome, expiry or sweep. The scale signal does not subtract
the cap, so an executor can spawn workers that find nothing. Keep the
executor's own ceiling at or below the cap; the chart clamps
`maxReplicaCount` to it.

Polling on a schedule is supported. An empty-handed spawn performs no model
inference, though it still consumes infrastructure resources.

## The run protocol

The spawned process (normally `ploeg-worker`, but anything speaking the run
API qualifies — schemas in [run-api.v1.schema.json](run-api.v1.schema.json)):

1. Send an authenticated claim with the worker's configured team and role.
   **204 means exit 0** immediately; no eligible work was claimed.
2. Renew the lease at TTL/3 via `POST /api/v1/runs/{token}/renew`; a 404
   means the lease is gone — kill the harness and stop.
3. Report progress via `.../checkpoint` (best-effort) and exactly one
   terminal `.../outcome` before exit (stuck requires a reason).

The Run token identifies the Run. Managed renewal, checkpoint and outcome
requests also require the returned signed control capability and worker identity.
Explicit legacy mode retains the old authentication behavior.

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
