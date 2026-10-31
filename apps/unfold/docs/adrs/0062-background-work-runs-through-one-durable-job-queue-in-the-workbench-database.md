---
status: proposed
date: 2026-10-30
decision-makers: Ryan Grippeling
review-by: 2027-01-31
---

# Background work runs through one durable job queue in the workbench database

## Context and Problem Statement

Unfold sends work out of the request path: outbound webhooks, notices over ntfy, Web Push, Slack and Microsoft Teams, billing lines into Simplicate, bug reports into the tracker, audit records to an OTLP collector, and the keyed Agent Trace and Client Sign-off comments on pull requests. Each of these built its own outbox, retry schedule, backoff and dedupe in parallel, and the two pull request comments were only an in-memory `setTimeout`, so a restart inside the five-minute window lost them. An operator had no single place to see what was waiting or had been given up.

How does Unfold run this work so that a restart resumes it, a failure backs off and finally stops, and an operator can see it, without adding a broker?

## Decision Drivers

* A restart, crash or hung attempt never loses queued work (ADR-0002: one SQLite database, one writer).
* Work that must never repeat blindly, such as a billing line, is not repeated after an unknown outcome.
* No new infrastructure: no Redis, NATS or other broker to run, secure and back up.
* The existing behaviour and tests of each delivery stay as they are.

## Considered Options

* **One `jobs` table in the workbench database, with leases, backoff and dead-lettering, and one worker**
* Keep each feature's own outbox and loop
* An external broker or job runner (Redis with BullMQ, NATS JetStream, Postgres with pg-boss)

## Decision Outcome

Chosen option: **one `jobs` table in the workbench database**, because it gives every delivery the same durability, retry and operator view without a second stateful service.

* `src/jobs/queue.ts` keeps jobs in `jobs`, created like every other table with `CREATE TABLE IF NOT EXISTS`. A job is unique per kind and idempotency key. `repeat: 'when_finished'` coalesces only while a job waits or runs, for debounced writes.
* A worker leases due jobs for a visibility timeout and counts one attempt per lease. A lease that runs out puts the job back; an `at_most_once` job is dead-lettered instead, with `lease_lost`. Because Unfold has one writer, the first queue opened on a database takes over every lease an earlier process held, so a restarted pod resumes at once.
* `src/jobs/worker.ts` runs one handler per kind. A handler answers `done`, `retry` (after its own wait, or exponential backoff with jitter), `dead`, or `later` (without counting the attempt). After the last attempt a job is dead until an operator sends it again.
* `GET /api/admin/jobs` shows each kind's counts and the dead and failing jobs, never a key or payload.
* Each feature keeps its own record for its own page (`outbound_deliveries`, `notify_outbox`, `billing_lines`, `reports`), and its own retry schedule where a standard or contract fixes it (Standard Webhooks for outbound events). The queue owns when the next attempt runs.

### Consequences

* Good, because the Agent Trace and Client Sign-off comments survive a restart and are retried, which they were not.
* Good, because a report whose first attempt was interrupted by a restart is now filed after it, instead of waiting forever.
* Good, because a billing send interrupted by a lost lease is dead-lettered and its line stays uncertain for a person, as before.
* Bad, because a delivery's attempt state is written twice: in the queue and in the feature's record that its page shows.
* Bad, because the queue shares SQLite's single writer; it suits one replica and the volumes Unfold has, not a fleet of workers.
* Neutral, because periodic pollers that read durable cursors (Ploeg's events, the delivery ledger sweeps, card sweeps, insight upkeep) stay timers: they hold no work of their own.

### Confirmation

`test/job-queue.test.ts` checks idempotent enqueue, the visibility timeout, the takeover at restart for both guarantees, backoff with dead-lettering and resend, and every handler outcome. `test/billing.test.ts` checks that a billing send whose lease runs out is not repeated. The existing tests of outbound events, notifications, reports, billing, audit export and both comments pass against the queue.

## Pros and Cons of the Options

### Keep each feature's own outbox and loop

* Good, because nothing changes.
* Bad, because every new delivery repeats the retry, backoff and dedupe code, and in-memory timers keep losing work at a restart.

### An external broker or job runner

* Good, because it scales to many workers.
* Bad, because it adds a stateful service to deploy, secure and back up next to a single-writer SQLite workbench, and a job and the record it changes could no longer commit in one transaction.

## More Information

Operators read [Background jobs](../operations/background-jobs.md). Ticket VIK-2528.

* 2026-10-31: MCP event deliveries moved onto the queue as `mcp_events.delivery`, replacing their own 5-second loop; deliveries pending at the upgrade each get one job. A sweep of the remaining timers and unawaited promises found none that holds work of its own; the operations page lists them.
