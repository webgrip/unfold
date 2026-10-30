# Outbound events: CloudEvents over Standard Webhooks

## Why

An Agency wants its own tools to react when work moves: a Slack or Teams
channel when a Work Item needs a person, an n8n or Make flow when a pull
request opens, a PSA ticket when a Delivery is accepted. Today Unfold shows
these moments only on its own pages, so every integration means polling
Unfold's private API. Unfold should push them out in open formats a receiver
already knows, so nothing built on them ties the Agency to Unfold.

Application: `apps/unfold`. Ticket: none yet.

## What Changes

- Product events as CloudEvents 1.0 in structured JSON mode, typed
  `dev.unfold.<noun>.<verb>`, with the `tenant` and `client` extension
  attributes from system ADR-0017's ownership. Unfold derives them from what it
  already reads: Ploeg's audit events (consumer scope), Unfold's own Client
  Sign-offs, and the Delivery read model.
- Delivery over HTTP as Standard Webhooks: one secret per subscription, the
  `webhook-id`, `webhook-timestamp` and `webhook-signature` headers, retries
  with exponential backoff and jitter, and a dead-letter state. Every delivery
  starts in a durable outbox in the store, so a restart loses nothing.
- Subscriptions that administrators manage: a URL, an event type filter, a
  Tenant or Client scope, and a secret shown once. One route block,
  `/api/admin/webhooks`, and a **Webhooks** Settings page.
- An SSRF guard: a target that resolves to a private, loopback, link-local or
  otherwise non-public address is refused, when it is saved and at every
  connection, unless `outboundEvents.allowedPrivateTargets` names it.
- The `events.webhooks` flag, evaluated per Tenant, off by default.
- Contracts: `events.asyncapi.yaml` (AsyncAPI 3.1), `cloudevent.v1.schema.json`
  superseding the proposed `event-envelope.v1.schema.json`, and an operations
  guide with signature verification and n8n and Slack examples.

## Non-goals

- Inbound webhooks, or any event that changes Unfold or Ploeg state.
- Ploeg's own operator events as CloudEvents. That is a Ploeg contract, made
  upstream first; the pull request describes what it would need.
- Price, spend or Token Charge figures in an event.
- Asymmetric (`v1a`) signatures, binary-mode CloudEvents and batching.
- Delivery from more than one Unfold server: Unfold runs one server per store.

## Capabilities

### New Capabilities

- `outbound-events`: which product events Unfold publishes, how it signs and
  delivers them, and who may subscribe to which.

### Modified Capabilities

None.
