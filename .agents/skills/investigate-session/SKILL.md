---
name: investigate-session
description: First checks for an Unfold session that stopped, was interrupted, needs reconciliation or failed unexpectedly on the homelab cluster. Runs one read-only script that lines up Unfold's events, Ploeg's execution revisions and heartbeat gaps, pod restarts and rollouts, probe failures, container logs and CPU/memory for the stop window, then matches the result against known failure classes. Use when the owner shares a screenshot or id of a stopped session, asks "what happened here", or reports "Execution authority lost", "reconciliation required" or an unexpected Interrupted state.
---

# Investigate a stopped session

Start from evidence, not from the screen's message. "Execution authority lost" only says that Unfold stopped trusting its Ploeg binding; it does not say which side failed.

## Run the first checks

```sh
python3 .agents/skills/investigate-session/scripts/investigate.py <session-id-prefix>
```

The session id is the `Session` field on the session page (8 characters is enough). Options: `--context` (default `admin@kubernetes`), `--namespace` (default `ploeg`), `--window` seconds before the stop (default 120).

The script only reads: Unfold's SQLite opens read-only through `node` inside the Unfold pod, Postgres runs SELECTs in a read-only transaction on the CNPG primary, and VictoriaLogs and VictoriaMetrics are reached through short-lived port-forwards. It never resumes, cancels or reconciles anything; those are the owner's decisions.

## Read the result against the known classes

| Class | Signals | What it means |
|---|---|---|
| Unfold stall | Ploeg heartbeats every 15 s, then one gap of 30 s or more ending in Unfold's replay; Unfold liveness or readiness probes time out; event rate of 100+ per second; low CPU, no restarts | Unfold's main thread was blocked by synchronous saves. Ploeg was fine. The work itself is usually intact. First seen 2026-10-10 (session `059675b9`, VIK-1942). |
| Ploeg unreachable | Gap in Ploeg revisions **and** a Ploeg pod restart, rollout or failing probe in the window, or Ploeg connection errors in Unfold's log | Ploeg was down or being replaced. Check the rollout that coincides. |
| Ploeg refused | A Ploeg revision with a newer generation, or `cancel_requested`/`pause_requested` before the stop | Another actor or executor took over, or the operator stopped it. Expected behaviour. |
| Unfold restart | Unfold pod started inside the window; `reconciliation_pending` on startup | Unfold lost its in-memory Runs. Ploeg holds the execution until reconciled. |
| Budget or runaway | `run.runaway`, budget events, or a `failed` session with a cost reason | A guard fired; read the blocker text. |

If nothing matches, say so and list the facts that do not fit; do not force a class.

## Report

Lead with the class and the one line of evidence that decides it, then a short timeline (local time) of the 3 to 6 events that matter, then what is safe to do next: whether the last Run had already returned its result, how much budget is spent, and what Resume would repeat. Point at the code path when the class implicates Unfold or Ploeg behaviour, and file follow-ups through the product-owner flow rather than fixing on the spot.

## Gaps the script cannot close

- Unfold discards the heartbeat error before VIK-1945, so the precise cause (timeout, HTTP status) is only inferable from timing.
- `kubectl get events` keeps about an hour; the script reads Kubernetes events from VictoriaLogs instead, which keeps them longer.
- Ploeg logs no request lines, so a silent Ploeg log is normal and proves nothing.
