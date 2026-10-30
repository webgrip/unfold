# Design — outbound-events

## Context

Unfold has no event bus. It reads Ploeg's audit events through the operator API
(`followEvents`, consumer scope, cursor-based) for the agent host's fleet
poller, reads delivery facts per Work Item, and stores Client Sign-offs in its
own SQLite store. A Report is already filed through a durable retry queue in
the same store; this change follows that pattern.

## Decisions local to this change

- **Derive, never invent.** Every event maps to a fact Unfold already holds: a
  Ploeg audit action, a Client Sign-off state change, or a Delivery row. The
  deterministic demo emits nothing except an administrator's test event, which
  says it is one.
- **CloudEvents structured mode as the body, Standard Webhooks as the
  envelope.** The JSON body is the CloudEvent; the three `webhook-*` headers
  carry the signature. CloudEvents' `time` plays the part of Standard Webhooks'
  `timestamp`, and `data` stays `data`, so a receiver that knows either
  specification can read it. `Content-Type: application/cloudevents+json`.
- **Ids are deterministic.** `ploeg-<audit id>`, `sign-off-<id>-<state>`,
  `delivery-accepted-<Work Item>`. Re-reading a source after a crash writes
  the same rows, and `INSERT OR IGNORE` on `(subscription, event)` keeps the
  outbox idempotent. `webhook-id` is the event id, the same on every retry.
- **Transactional outbox.** A source page's events, their deliveries and the
  source cursor commit in one transaction. Client Sign-off changes reach the
  outbox through SQLite triggers on `client_sign_offs`, so a Sign-off write
  and its change record commit together, with no change to the Sign-off
  module.
- **An owner per event.** The Work Item's owner comes from `TenantScope` over
  the target in its delivery facts, as every other Tenant check does. A Work
  Item whose target matches repositories of different owners reaches nobody,
  so it emits nothing.
- **A subscription sees only the future.** An event that happened before the
  subscription was created is never delivered to it, so a cursor that resumes
  after a pause cannot send history to a new receiver.
- **Retry schedule.** Standard Webhooks' example schedule: at once, then after
  5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 14 h, 20 h and 24 h, each with ±10 %
  jitter. After the last attempt the delivery is dead. A longer `Retry-After`
  wins. 410 Gone disables the subscription. A redirect counts as a failure.
- **SSRF at connect time.** Delivery uses `node:http(s)` with a `lookup` hook
  that checks every resolved address, so DNS rebinding cannot pass the check at
  creation and then connect inward.
- **Secrets.** `whsec_` plus 32 random bytes, sealed in the store's encrypted
  internal state, returned once on creation and on rotation. A rotated-out
  secret keeps signing next to the new one for 24 hours.

## Open Questions

- Whether the owner wants the format recorded as an Unfold ADR, since it is
  durable once Agencies build on it.
- A delivery log per Client for Client users, once Client sign-in exists.
- Ploeg's operator events as CloudEvents, upstream (see the pull request).
