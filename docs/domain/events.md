# Domain Events — Ploeg

*Generated from `model.yaml` — do not edit by hand.*

## WorkItemIngested

A tracker webhook was mirrored into a new Work Item, recording the Scope it arrived in.

**Concerns:** Work Item  
**Triggers:** Nothing until an Assignment arrives.  

## WorkItemAssigned

An Assignment matched a Routing Rule; the Work Item is queued with its Team and its pinned Work Target.

**Concerns:** Work Item  
**Triggers:** The Team Queue grows; the Executor's scaler may spawn a Run.  

## ShiftOpened

A Team took up a queued Work Item; the branch, budget pool and Round counter come into existence.

**Concerns:** Shift  
**Triggers:** A Round is planned and its Runs are spawned with Task Specs.  

## RoundStarted

A set of Runs was spawned together — either a fan-out of readers or a single writer.

**Concerns:** Shift  
**Triggers:** Each Run receives the same injected state; none observes the others.  

## LeaseAcquired

A writing Run took exclusive write access to its Shift's branch; a scoped push credential was minted for it.

**Concerns:** Lease  
**Triggers:** The Run may push; no other Run in the Shift holds a push credential at all.  

## PushRightsRevoked

A Lease settled or lapsed; the Run's scoped forge token was revoked.

**Concerns:** Lease  
**Triggers:** A zombie Run can no longer push, without any cleanup code running inside it (R2).  

## BudgetAuthorized

A Run reserved min(roleCap, poolRemaining) against its Shift before spawning.

**Concerns:** Shift  
**Triggers:** A LiteLLM key is minted for exactly the authorized amount; a zero-row update means the Run is never spawned.  

## BudgetSettled

A Run reported; its authorization was released and actual spend recorded.

**Concerns:** Shift  
**Triggers:** Unspent allowance returns to the pool for later Runs.  

## LeaseExpired

A Lease TTL lapsed without renewal.

**Concerns:** Lease  
**Triggers:** Re-queue, or stale after the retry threshold (R5); reason recorded in the audit log.  

## CheckpointWritten

A Run reported durable progress via the report API.

**Concerns:** Checkpoint  
**Triggers:** Future resumes inject this Checkpoint into the Task Spec.  

## OutcomeReported

A Run ended with an Outcome Report.

**Concerns:** Run  
**Triggers:** Work Item transitions per the Outcome; write-back to tracker/forge through providers.  

## FollowUpCreated

A Forge Event was classified as actionable and became a Follow-Up.

**Concerns:** Work Item  
**Triggers:** The owning Team's Queue grows; vague or security-sensitive feedback goes to needs_human instead.  
