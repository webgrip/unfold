---
status: accepted
date: 2026-10-11
decision-makers: Ryan Grippeling
review-by: 2027-01-11
---

# Unfold submits Work Items to Ploeg and never executes them

## Context and Problem Statement

[Unfold ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md) made Ploeg the only execution engine and Unfold its front end. Today a "managed" Unfold session still runs its whole Crew inside Unfold, under an Operator Execution. Ploeg only admits it, keeps its records and issues one key. To support this, Ploeg writes placeholder Work Item, Shift, Run and Lease rows, and ten scheduler queries have to skip them. How should Unfold hand work to Ploeg, show it live and steer it, so that Unfold's engine can be deleted in small, safe steps? The [design proposal](../ploeg-front-end.md) holds the details and the increment plan.

## Decision Drivers

* One engine, one budget path and one harness driver (ADR-0002).
* An intentional pause or cancel never becomes an automatic retry, and a restart never silently repeats paid work.
* The worker pod reaches only the model gateway, the forge and ploegd, so every control channel must be pulled by the worker.
* Every increment ships and can be reverted on its own.

## Considered Options

* Unfold submits ordinary Work Items, watches the audit-event stream and sends Shift commands; steering between Runs
* Keep Operator Executions, but let `ploeg-worker` execute them instead of Unfold
* Unfold submits ordinary Work Items, and people attach live to the worker's harness session

## Decision Outcome

Chosen option: "Unfold submits ordinary Work Items, watches the audit-event stream and sends Shift commands; steering between Runs", because it removes the placeholder rows and scheduler exclusions, reuses dispatch exactly as tracker work uses it, and keeps the worker's network boundary.

* **Submission.** Add a proposed route, `POST /api/v1/operator/work-items`. It is idempotent by a `requestId` that Unfold persists first, and a fingerprint check makes a changed replay return `409`. It creates a Work Item that is not `operator_owned`, uses a target from Ploeg's registry, and opens the Shift with the team plan through `EnsureShift`. It must not reuse `IngestAssigned`, which re-queues finished work on conflict.
* **Live view.** The Unfold server polls the existing `GET /operator/events?workItemId&after` and feeds its own SSE stream to the browser. Ploeg adds SSE and bounded Run activity only if that is measured to be needed.
* **Commands.** Cancel is Ploeg's existing withdraw, `POST /api/v1/operator/work-items/{id}/cancel`: the live Shift closes with reason `withdrawn_by_operator`, pending Runs are cancelled, running Runs are finished with their model keys blocked, and the Work Item ends `withdrawn` ([Ploeg operator API](../../../ploeg/docs/contracts/README.md)). Try again is Ploeg's existing requeue ([Ploeg ADR-0044](../../../ploeg/docs/adrs/0044-an-operator-restarts-stopped-work-from-a-round-they-choose.md)). The only new command is `message`, idempotent by `commandId`. There is no pause in v1.
* **Steering.** Steering reaches the next Round, not the running Run. Archiving is not cancelling. A message becomes a note that Ploeg adds to the next Round's prompt; archiving a session in the Agents window hides it for that viewer and leaves its Work Item untouched. A later increment may add between-turn delivery through the ACP adapter. Take-control, if wanted, means a hand-over of the branch.
* **Agents window.** The Agent Host Protocol host ([ADR 0012](0012-agent-host-protocol-host.md)) stays, as Ploeg's projection and command surface: each Work Item a viewer may see is a session in the VS Code Agents window, its state read from Ploeg and its commands sent to Ploeg. The host executes nothing. A Work Item that is `awaiting_review` shows as `inputNeeded` ("needs you"), not as idle and unread.
* **Candidates.** Unfold candidates keep the delivery verifier ([ADR 0019](0019-verify-canonical-candidates-outside-agent-workspaces.md)) and the trusted publisher ([ADR 0040](0040-accept-opens-a-pull-request-through-the-trusted-publisher-in-the-unfold-control-service.md)) while the application's engine still produces them. Both are transitional and retire with the engine; Ploeg's publication path then serves every Work Item.
* **Harness.** Ploeg's ACP adapter is the only OpenCode driver. Unfold's HTTP driver is deleted.
* **Deletion.** Unfold deletes `broker.ts`, `execution-authority.ts`, its non-demo runtimes and the non-demo engine paths, and keeps the deterministic demo. Ploeg retires Operator Executions, their placeholder rows and scheduler exclusions, and removes their tables in a new migration.

### Consequences

* Good, because Unfold work and tracker work share one dispatch, budget, review loop and publication path.
* Good, because the cross-application check runs `ploeg-worker` for the first time.
* Good, because about 2.1k lines of Unfold broker, authority and runtime code, the non-demo engine paths, and about 750 lines of Ploeg Operator Execution handlers and store can go, along with the scheduler exclusions.
* Bad, because a running Run does not see a person's message until the next Run, and interactive permission answers go away.
* Bad, because the trusted publisher is built for Unfold candidates and is deleted with the engine.
* Bad, because budgets come from team plans rather than a per-session number.

### Confirmation

Accepted, not implemented. It is implemented when:

* the `front-end` check in `mise run integration` passes, submitting, watching, messaging and cancelling Work Items that an in-process `ploeg-worker` executes;
* `apps/unfold/src/broker.ts` and `apps/unfold/src/execution-authority.ts` no longer exist, and no Unfold module imports a non-demo runtime;
* `apps/ploeg/pkg/store/shift.go` has no `operator_executions` or `operator_owned` predicate.

Re-evaluate if people who use S1 steering report that mid-Run messages are needed. That is the trigger for the ACP between-turn increment. Also re-evaluate if polling `/operator/events` measurably loads ploegd.

## Pros and Cons of the Options

### Keep Operator Executions, executed by `ploeg-worker`

* Good, because Unfold's command and generation protocol and its tests carry over.
* Bad, because it keeps the placeholder rows, the scheduler exclusions and a second liveness protocol for work that ordinary dispatch can already run.

### Attach live to the worker's harness session

* Good, because it gives full interactive control.
* Bad, because it needs inbound access to sandboxed pods and human answers on the ACP permission loop, which must never block. In effect it rebuilds Unfold's engine inside the worker.

## More Information

* [Design proposal and increment plan](../ploeg-front-end.md)
* [Unfold ADR-0017](0017-delegate-interactive-execution-to-ploeg.md) and [Ploeg ADR-0024](../../../ploeg/docs/adrs/0024-operator-work-uses-one-execution-authority.md) describe the Operator Execution path that this proposal would retire.
* 2026-09-23 — Proposed for the owner's decision, together with the open questions listed in the design proposal.
* 2026-10-11 — Accepted with amendments. The owner accepted this record on 2026-10-10 and 2026-10-11 and decided that a Work Item awaiting review maps to `inputNeeded` in the Agents window. The proposed commands route with `cancel`, `pause` and `resume` is replaced: cancel is Ploeg's withdraw and ends `withdrawn`, try again is requeue, `message` is the only new command, and v1 has no pause. That answers the design proposal's questions on the cancelled end state (`withdrawn`), pause (none in v1) and the Agent Host Protocol host (it stays as Ploeg's projection and command surface); its questions on budget, take-control, the demo, Crews and priority stay open. The steering rule and the transitional publisher ([ADR 0040](0040-accept-opens-a-pull-request-through-the-trusted-publisher-in-the-unfold-control-service.md)) are added ([VIK-1985](https://vikunja.webgrip.dev/tasks/1985)).
