# Outbound events

## ADDED Requirements

### Requirement: Events are CloudEvents derived from recorded facts

Unfold SHALL publish each event as a CloudEvents 1.0 event in structured JSON
mode, with `specversion`, `id`, `source`, `type`, `time`, `subject`,
`datacontenttype` and `dataschema`, and the extension attributes `tenant` and
`client`, as `apps/unfold/docs/contracts/cloudevent.v1.schema.json` defines.
Every event MUST map to a fact Unfold or Ploeg recorded. The deterministic demo
MUST NOT emit any event except an administrator's test event.

#### Scenario: Ploeg asks a person

- **WHEN** Ploeg records `work_item.needs_human` for Work Item 42, whose
  repository belongs to Tenant `agency` and Client `shop`
- **THEN** Unfold emits `dev.unfold.work_item.needs_you` with source
  `/tenants/agency/clients/shop`, subject `work-items/42`, `tenant` `agency`
  and `client` `shop`

#### Scenario: An owner cannot be decided

- **WHEN** a Work Item's target matches repositories of two different owners
- **THEN** Unfold emits nothing for it

### Requirement: Deliveries are signed as Standard Webhooks

Each delivery SHALL be an HTTP POST of the event with the headers
`webhook-id` (the event id, the same on every retry), `webhook-timestamp`
(Unix seconds of this attempt) and `webhook-signature`: `v1,` and the base64
HMAC-SHA256 of `id.timestamp.body` under the subscription's secret. During the
24 hours after a rotation, the header SHALL carry a signature under each
secret.

#### Scenario: A receiver verifies

- **WHEN** a receiver computes the HMAC with its `whsec_` secret over the id,
  timestamp and raw body it received
- **THEN** it matches one signature in the header

### Requirement: The outbox loses nothing on restart

Unfold SHALL write an event, its deliveries and the source cursor that
produced it in one transaction, and SHALL send only what that transaction
committed. A restart MUST resume every delivery not yet answered with 2xx,
with the same `webhook-id`. A Client Sign-off change MUST be recorded in the
same transaction as the Sign-off itself.

#### Scenario: A crash between sending and recording

- **WHEN** Unfold stops after a receiver answered but before Unfold recorded it
- **THEN** after the restart Unfold sends the event again with the same
  `webhook-id`, and the receiver can ignore the repeat

### Requirement: Failed deliveries retry, then dead-letter

A delivery answered with anything but 2xx, a redirect included, or not
answered within 15 seconds, SHALL be retried after 5 s, 5 min, 30 min, 2 h,
5 h, 10 h, 14 h, 20 h and 24 h, each with up to 10 % jitter, or after a longer
`Retry-After`. After the tenth attempt it SHALL be dead. An administrator MAY
send a dead delivery again. A 410 answer SHALL disable the subscription.

#### Scenario: A receiver is down for an hour

- **WHEN** a receiver refuses connections for an hour, then recovers
- **THEN** the delivery succeeds on its fifth attempt and nothing is lost

### Requirement: Targets must be public unless allowed

Unfold SHALL refuse a subscription URL that is not `https`, or that names or
resolves to a loopback, private, link-local, unique-local, carrier-grade NAT,
multicast, unspecified or reserved address, unless the host or one of its
addresses matches `outboundEvents.allowedPrivateTargets`, which also permits
`http`. Unfold MUST check every address it connects to, at each attempt, not
only when the subscription was saved.

#### Scenario: A target resolves inward

- **WHEN** `hooks.example.com` resolves to `169.254.169.254`
- **THEN** the subscription is refused with `webhook_target_private`, and a
  delivery whose target starts resolving there fails without connecting

### Requirement: Administrators manage subscriptions in their Tenant

Only an administrator SHALL list, create, change, rotate or delete
subscriptions. While `tenancy.enforce` is on, the administrator MUST hold an
Admin Access Role in the subscription's Tenant. The `events.webhooks` flag
SHALL be evaluated per Tenant and is off by default; while it is off, Unfold
queues nothing for that Tenant.

#### Scenario: An administrator of another Tenant

- **WHEN** tenancy is enforced and an administrator holds Admin only in
  Tenant `other`
- **THEN** a subscription of Tenant `agency` answers 404 to them

### Requirement: A subscription receives only its scope and its types

A Tenant subscription SHALL receive every event of its Tenant; a Client
subscription only its Client's. A subscription MUST NOT receive an event that
happened before it was created, and only events whose type its filter names.

#### Scenario: A Client subscription

- **WHEN** a subscription is scoped to Client `shop` of Tenant `agency`
- **THEN** it receives events with `client` `shop` and none with another or
  no Client

#### Scenario: A type filter

- **WHEN** a subscription filters on `dev.unfold.work_item.*`
- **THEN** it receives `dev.unfold.work_item.approved` and not
  `dev.unfold.run.finished`
