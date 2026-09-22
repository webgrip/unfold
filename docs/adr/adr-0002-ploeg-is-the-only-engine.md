---
status: accepted
date: 2026-09-22
decision-makers: Ryan Grippeling
---

# Ploeg is the only execution engine and Vloer is its front end

## Context and Problem Statement

Glide exists to close one loop: a person creates a work item and assigns it to agents, and the agents do all of the code work until a pull request is ready for human review and merge. The 2026-09-22 [inventory](../research/2026-09-22-glide-inventory.md) found two engines that each run agents: Vloer's `apps/vloer/src/engine.ts` and Ploeg's worker. Both implement harness driving, LiteLLM key brokering, spend holds, crew and review orchestration, workspace credentials and liveness. In shared mode Vloer still executes the whole crew, and Ploeg only admits it and records it. Which application executes agent work, and who authorizes it?

## Decision Drivers

* One loop to finish: work item → agent runs → pull request ready for review.
* Every paid run needs one authority, one budget and one revocable credential.
* A fix should land in one engine, not two.
* Cluster capacity, not a person's workstation, should limit throughput.

## Considered Options

* Ploeg authorizes and executes all agent work; Vloer is the front end
* Ploeg authorizes all work, and Vloer can also start a local Ploeg worker for offline use
* Keep both engines and the standalone Vloer mode

## Decision Outcome

Chosen option: "Ploeg authorizes and executes all agent work; Vloer is the front end", because it leaves one engine, one authority and one budget path, and matches the goal of cluster-scaled unattended work.

* Ploeg admits, leases, budgets and executes every agent run through `ploeg-worker`.
* Vloer presents, steers and reviews work through Ploeg's API. Without Ploeg, Vloer runs only its deterministic demo fixture, which makes no model calls.
* Vloer adopts Ploeg's execution vocabulary. A **Run** is one Role executing against a Work Item, a **Shift** is the whole attempt on a Work Item, and a **Lease** is the exclusive right to write the Shift's branch. A Vloer-internal part of one Run is a **Step**.

This record supersedes the parts of [ADR-0001](adr-0001-glide-contains-independent-applications.md) that keep standalone Vloer authority and both engines. Glide still contains two independently deployable applications.

It also resolves [Vloer ADR-0005](../../apps/vloer/docs/adrs/0005-one-work-authority.md), [Vloer ADR-0017](../../apps/vloer/docs/adrs/0017-delegate-interactive-execution-to-ploeg.md) and [Ploeg ADR-0024](../../apps/ploeg/docs/adrs/0024-operator-work-uses-one-execution-authority.md) towards Ploeg authority. Those three records keep their own status until the owner updates each ledger.

### Consequences

* Good, because agent execution, budgets and credentials have one implementation to fix and test.
* Good, because new models and harnesses are adopted in one worker.
* Bad, because Vloer's standalone and shared execution paths become migration work. Until Vloer delegates execution to `ploeg-worker`, its current engine remains and its no-fallback guards stay in force.
* Bad, because offline laptop use requires a running Ploeg.

### Confirmation

This record is accepted but not yet implemented. Implementation is complete when:

* `apps/vloer/src/engine.ts` no longer launches harnesses outside the demo runtime;
* `mise run integration` passes with all non-demo sessions executed by `ploeg-worker`;
* `AGENTS.md` and the [product model](../domain/model.yaml) state Ploeg authority without a standalone exception.

## Pros and Cons of the Options

### Ploeg authorizes all work, and Vloer can start a local worker

* Good, because offline laptop work keeps the same engine.
* Bad, because it needs a laptop-mode worker and local key handling that no current goal requires.

### Keep both engines

* Good, because no migration work is needed.
* Bad, because every execution fix, credential rule and budget rule must be made twice, and the [execution comparison](../research/2026-09-12-execution-boundary.md) never exercised the Go worker.

## More Information

* 2026-09-22 — The owner chose Ploeg as the only engine, Vloer as its front end, and Ploeg authority for every run. The same day the owner stated Glide's goal as an internal tool: work items to review-ready pull requests.
