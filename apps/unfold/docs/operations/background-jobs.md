---
type: reference
audience: [owner, operator, contributor]
owner: unfold
last_verified: 2026-10-30
verified_by: "Written with the implementation on branch feat/durable-job-queue: src/jobs/queue.ts, src/jobs/worker.ts, src/jobs/route.ts and the handlers in src/outbound/service.ts, src/notify/service.ts, src/billing.ts, src/reports.ts, src/audit/service.ts, src/agent-trace-comments.ts and src/client-sign-off.ts. test/job-queue.test.ts, test/billing.test.ts and test/outbound-events.test.ts (including GET /api/admin/jobs) passed."
---

# Background jobs

Unfold does its outgoing work in the background: webhooks, notices, billing lines, bug reports, audit export and two pull request comments. All of it waits in one job queue, a table called `jobs` in Unfold's database ([ADR 0062](../adrs/0062-background-work-runs-through-one-durable-job-queue-in-the-workbench-database.md)). There is no separate broker to run. This page says what is in the queue, how it behaves when something fails, and how to look at it.

## What runs in the queue

| Kind | What one job does | Attempts | When it fails |
| --- | --- | --- | --- |
| `outbound.delivery` | Sends one event to one webhook subscription ([Outbound webhooks](outbound-events.md)) | 10, on the Standard Webhooks schedule | Dead after the last attempt; a 410 answer disables the subscription |
| `notify.notice` | Sends one notice to one person's channel target ([Notifications](notifications.md)) | 7, on the notification schedule | Dead after the last attempt or after 24 hours; waits through quiet hours without using an attempt |
| `billing.line` | Writes one billing line into the billing tool ([Simplicate](billing-simplicate.md)) | 8 automatic, only when the tool certainly took nothing | Any uncertain outcome goes to a person. **At most once**: never sent again after an unknown outcome |
| `report.file` | Files one bug report into the tracker, continuing the same issue | Growing gaps for 24 hours | Dead after 24 hours; the report stays saved |
| `audit.export` | Sends the audit records the collector has not taken ([SIEM](audit-siem.md)) | 24, from 30 seconds doubling to an hour | The records stay; the next audit record queues a new export |
| `agent_trace.comment` | Writes the Agent Trace comment on a Work Item's pull request, five minutes after the last record | 5 | Retried from one minute, doubling to 30 minutes |
| `client_sign_off.comment` | Writes the Client Sign-off comment and commit status, 30 seconds after the last change | 3 | Retried from one minute, doubling to 30 minutes |

Each job has an idempotency key, so the same work is queued once. A delivery, notice, billing line or report is keyed by its own record; a comment is keyed by its Work Item, so a burst of changes makes one write.

## How a job runs

1. The worker checks the queue every 5 seconds, and billing lines every minute, and **leases** the jobs that are due. A lease hides the job from other attempts for a visibility timeout: a minute for a webhook, two minutes for a notice or comment, five or ten minutes for billing and reports.
2. The job runs. It finishes, waits for a retry, gives up (dead), or puts itself off without using an attempt, for example while a webhook subscription is paused.
3. A retry waits for the time the feature's own schedule sets, or else for an exponential backoff with jitter: each wait is about twice the one before, spread by up to 20% either way so retries do not arrive together.
4. After its last attempt a job is **dead** (dead-lettered). It stays in the queue until it is pruned, so you can see it.

Finished jobs are pruned with their feature's records: webhook deliveries after 30 days, notices after 14, comments after a day, billing lines after 90.

## What a restart does

Unfold has one database and one writer process. When it starts, it takes over every lease the previous process held:

* Work that is safe to repeat (webhooks, notices, reports, audit export, comments) runs again straight away. A receiver can see a repeat; webhooks carry the same `webhook-id` so it can drop it.
* A billing line is never repeated after an unknown outcome. Its job is dead with `lease_lost`, and the line shows as **Failed, uncertain** on the Billing page until a person checks the tool.

A lease that runs out while Unfold keeps running, because an attempt hung, is handled the same way.

## Look at the queue

An administrator reads the queue at `GET /api/admin/jobs` ([API](../contracts/api.md#background-jobs)):

```sh
curl -s -H "cookie: $UNFOLD_COOKIE" -H 'x-unfold-request: 1' https://unfold.example.com/api/admin/jobs | jq
```

`kinds` gives each kind's counts by state and when its oldest waiting job became due. A large `pending` count with an old `oldestDueAt` means work is stuck behind a receiver that does not answer. `troubled` lists dead jobs and waiting jobs that failed at least once, with their last error. Add `?kind=outbound.delivery` to see one kind. The answer never shows a job's key or payload, which can carry personal data.

The route is read-only. To send dead work again, use the feature's own action: **Resend** on a webhook delivery, **Send again** on a billing line. Unfold logs `job.dead` with the kind, job id, attempts and error each time a job is given up.

## What is not in the queue

* **Pollers** that read a durable cursor, such as following Ploeg's events, the Client Sign-off changes, the Acceptance and billing syncs, card sweeps and insight upkeep, stay timers. They hold no work of their own: a missed tick reads the same cursor next time.
* **MCP event deliveries** to MCP clients share the webhook delivery log but keep their own loop, every 5 seconds.
* **Request intake** replay protection remembers each inbound delivery id; it is incoming, not background work.
* **Tenant exports** build a bundle on the data volume for a person waiting to download it, and a restart deletes those bundles ([Leaving Unfold](leaving-unfold.md)).
