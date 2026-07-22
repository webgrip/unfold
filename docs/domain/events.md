# Domain Events — Ploeg

*Generated from `model.yaml` — do not edit by hand.*

## WorkItemIngested

A tracker webhook was mirrored into a new Work Item.

**Concerns:** Work Item  
**Triggers:** Nothing until an Assignment arrives.  

## WorkItemAssigned

An Assignment named a Team; the Work Item is queued.

**Concerns:** Work Item  
**Triggers:** The Team Queue grows; the Executor's scaler may spawn a Run.  

## LeaseAcquired

A Team claimed a queued Work Item.

**Concerns:** Lease  
**Triggers:** A Run is spawned with a Task Spec.  

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
