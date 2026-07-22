# Business Rules — Ploeg

*Generated from `model.yaml` — do not edit by hand. Cite rules by id in specs.*

## Follow-Up

### R9
*Context: Dispatch*

Follow-Ups are routed to the Team owning the source branch and never gate other Teams' new work.

**Why:** Feedback loops must stay local — one team's red CI must not stall the whole factory.

**Also applies to:** Team

## Lease

### R2
*Context: Dispatch*

A Lease must be renewed on a fixed interval by the running Run; expiry releases the Work Item mechanically.

**Why:** Crash-safety must never depend on an agent behaving well at death — a crashed pod releases its item with no cleanup code running.

**Also applies to:** Run

## Outcome

### R4
*Context: Dispatch*

A stuck Outcome carries a mandatory reason and transitions the Work Item to needs_human.

**Why:** Silent stalls are the most expensive failure mode of unattended agents; stuck must always surface to a human with context.

**Also applies to:** Work Item

## Run

### R3
*Context: Execution*

Every Run ends with an Outcome Report; a container that exits without one is recorded as a failed Outcome by the Executor's watch.

**Why:** Audit completeness — no Run may vanish without a queryable terminal row.

**Also applies to:** Outcome Report, Executor

### R6
*Context: Dispatch*

Durable state lives only in Postgres and in git/forge state — never inside an agent process.

**Why:** Ephemerality is the design axiom; any state trapped in a long-lived process breaks crash-safety and resume.

**Also applies to:** Checkpoint

## Task Spec

### R8
*Context: Harness*

Credentials are delivered to an Agent Container out-of-band as mounted secrets, never inside a Task Spec.

**Why:** Task Specs are logged, audited, and checkpointed; secrets in them would leak into every one of those stores.

**Also applies to:** Agent Container

## Team Queue

### R10
*Context: Dispatch*

Team Queue order mirrors the tracker's priority, falling back to oldest-first; Ploeg never owns prioritization.

**Why:** The board is the source of truth for what matters and when; duplicating rank in Ploeg would create a second, silently diverging opinion.

**Also applies to:** Tracker Item

## Tracker Provider

### R7
*Context: Integration*

Core semantics must never encode a provider-specific workaround; everything vendor-specific lives behind the SPI.

**Why:** SPI stability is the project's compatibility promise; one leaked vendor detail makes every other provider carry it forever.

**Also applies to:** Forge Provider

## Work Item

### R1
*Context: Dispatch*

A Work Item is held by at most one Team at a time; a Lease is unique per Work Item.

**Why:** Two Teams on one item means two writers on one branch and split accountability in the audit log.

**Also applies to:** Lease, Team

### R5
*Context: Dispatch*

Lease expiry or a failed Outcome re-queues the Work Item; after the retry threshold is reached without an Outcome, the item goes stale, and only a human or explicit policy leaves stale.

**Why:** Retrying is cheap once and ruinous forever — stale is the circuit breaker that stops burning tokens on repeatedly abandoned work.

**Also applies to:** Lease
