---
status: proposed
date: 2026-09-23
decision-makers: Ryan Grippeling
review-by: 2026-10-23
---

# Vloer submits Work Items to Ploeg and never executes them

## Context and Problem Statement

[Glide ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md) made Ploeg the only execution engine and Vloer its front end. Today a "managed" Vloer session still runs its whole Crew inside Vloer, under an Operator Execution. Ploeg only admits it, keeps its records and issues one key. To support this, Ploeg writes placeholder Work Item, Shift, Run and Lease rows, and ten scheduler queries have to skip them. How should Vloer hand work to Ploeg, show it live and steer it, so that Vloer's engine can be deleted in small, safe steps? The [design proposal](../ploeg-front-end.md) holds the details and the increment plan.

## Decision Drivers

* One engine, one budget path and one harness driver (ADR-0002).
* An intentional pause or cancel never becomes an automatic retry, and a restart never silently repeats paid work.
* The worker pod reaches only the model gateway, the forge and ploegd, so every control channel must be pulled by the worker.
* Every increment ships and can be reverted on its own.

## Considered Options

* Vloer submits ordinary Work Items, watches the audit-event stream and sends Shift commands; steering between Runs
* Keep Operator Executions, but let `ploeg-worker` execute them instead of Vloer
* Vloer submits ordinary Work Items, and people attach live to the worker's harness session

## Decision Outcome

Chosen option: "Vloer submits ordinary Work Items, watches the audit-event stream and sends Shift commands; steering between Runs", because it removes the placeholder rows and scheduler exclusions, reuses dispatch exactly as tracker work uses it, and keeps the worker's network boundary.

* **Submission.** Add a proposed route, `POST /api/v1/operator/work-items`. It is idempotent by a `requestId` that Vloer persists first, and a fingerprint check makes a changed replay return `409`. It creates a Work Item that is not `operator_owned`, uses a target from Ploeg's registry, and opens the Shift with the team plan through `EnsureShift`. It must not reuse `IngestAssigned`, which re-queues finished work on conflict.
* **Live view.** The Vloer server polls the existing `GET /operator/events?workItemId&after` and feeds its own SSE stream to the browser. Ploeg adds SSE and bounded Run activity only if that is measured to be needed.
* **Commands.** Add a proposed route, `POST /api/v1/operator/work-items/{id}/commands`, with `cancel`, `pause`, `resume` and `message`, idempotent by `commandId`. Cancel closes the Shift, deletes the Lease and blocks keys in one transaction, so the worker's next renew returns `404`. Pause stops new Runs at the Run boundary.
* **Steering.** A message is delivered in the next Run's prompt. A later increment may add between-turn delivery through the ACP adapter. Take-control, if wanted, means a hand-over of the branch.
* **Harness.** Ploeg's ACP adapter is the only OpenCode driver. Vloer's HTTP driver is deleted.
* **Deletion.** Vloer deletes `broker.ts`, `execution-authority.ts`, its non-demo runtimes and the non-demo engine paths, and keeps the deterministic demo. Ploeg retires Operator Executions, their placeholder rows and scheduler exclusions, and removes their tables in a new migration.

### Consequences

* Good, because Vloer work and tracker work share one dispatch, budget, review loop and publication path.
* Good, because the cross-application check runs `ploeg-worker` for the first time.
* Good, because about 2.1k lines of Vloer broker, authority and runtime code, the non-demo engine paths, and about 750 lines of Ploeg Operator Execution handlers and store can go, along with the scheduler exclusions.
* Bad, because a running Run does not see a person's message until the next Run, and interactive permission answers go away.
* Bad, because Vloer candidates, the delivery verifier and the Agent Host Protocol host lose their workspace, and need their own decision.
* Bad, because budgets come from team plans rather than a per-session number.

### Confirmation

Proposed, not implemented. It is implemented when:

* the `front-end` check in `mise run integration` passes, submitting, watching, pausing and cancelling Work Items that an in-process `ploeg-worker` executes;
* `apps/vloer/src/broker.ts` and `apps/vloer/src/execution-authority.ts` no longer exist, and no Vloer module imports a non-demo runtime;
* `apps/ploeg/pkg/store/shift.go` has no `operator_executions` or `operator_owned` predicate.

Re-evaluate if people who use S1 steering report that mid-Run messages are needed. That is the trigger for the ACP between-turn increment. Also re-evaluate if polling `/operator/events` measurably loads ploegd.

## Pros and Cons of the Options

### Keep Operator Executions, executed by `ploeg-worker`

* Good, because Vloer's command and generation protocol and its tests carry over.
* Bad, because it keeps the placeholder rows, the scheduler exclusions and a second liveness protocol for work that ordinary dispatch can already run.

### Attach live to the worker's harness session

* Good, because it gives full interactive control.
* Bad, because it needs inbound access to sandboxed pods and human answers on the ACP permission loop, which must never block. In effect it rebuilds Vloer's engine inside the worker.

## More Information

* [Design proposal and increment plan](../ploeg-front-end.md)
* [Vloer ADR-0017](0017-delegate-interactive-execution-to-ploeg.md) and [Ploeg ADR-0024](../../../ploeg/docs/adrs/0024-operator-work-uses-one-execution-authority.md) describe the Operator Execution path that this proposal would retire.
* 2026-09-23 — Proposed for the owner's decision, together with the open questions listed in the design proposal.
