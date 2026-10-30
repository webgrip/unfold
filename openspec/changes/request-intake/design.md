# Design: Request intake

## Context

The domain model defines a Request as never dispatched; Refinement turns it
into Work Items. No Request record and no Refinement exist in the code, and a
proposed Work Item lives in Ploeg, which would make every Request a Ploeg
write. The intake therefore stores Requests in Unfold's own SQLite store.

## Goals / Non-Goals

Goals: one endpoint for every sender; verified deliveries; data-only mappings;
email without a poller; Tenant and Client scoping; no path to a Run.
Non-goals: see the proposal.

## Decisions

- **D1 A stored Request, not a proposed Work Item.** A proposed Work Item needs
  a Team, a target and a Ploeg admission; a Request has none of these until
  Refinement. Storing it in Unfold keeps the intake free of Ploeg, so a test
  can prove it never reaches a Run. Alternative: create a proposed Work Item
  through a tracker binding; rejected because it dispatches before Refinement.
- **D2 Registries.** Templates and verifiers are registered by name
  (ADR-0050 rule 1); adding a sender is a new registration.
- **D3 Standard Webhooks first, vendor HMACs second, token last.** Standard
  Webhooks is the signature ADR-0050 names for events. Marker.io and Zendesk
  sign their own way, so their HMACs are verifiers too. BugHerd, Userback,
  Freshdesk and Postmark do not sign; a token in a header, the Basic auth
  password or the query string is documented as weaker.
- **D4 Idempotency.** A `webhook-id` is remembered for 72 hours, longer than
  any sender's retry schedule we read. Senders without one deduplicate on the
  mapped external id or the `Message-ID`.
- **D5 JSON Pointer picks.** RFC 6901 is a standard, has no evaluation, and a
  pick reads at most one level of list elements, so a mapping is bounded and
  not Turing-complete. JSONPath (RFC 9535) filters were not needed.
- **D6 Email as a webhook.** Every provider and MTA can post a message; IMAP
  would need stored mailbox credentials and a resumable poll loop. Raw MIME is
  the common denominator; Postmark's JSON is accepted as the one widespread
  inbound JSON shape.
- **D7 The public route sits before sign-in.** It is exempt from the
  same-origin guard because senders are not browsers; the signature is the
  guard. The Settings routes keep the guard and the Action Records.

## Risks / Trade-offs

- [No rate limit on the public route] → a source answers 404 unless the flag
  is on for its Tenant, verification is cheap HMAC, and the body cap is 5 MiB.
- [Freshdesk and Zendesk placeholders may not be JSON-escaped] → the docs say
  to test with a ticket containing quotes; a broken body answers 400.
- [Token mode in the URL leaks to logs] → documented as the weakest mode.
- [Requests are not in a Tenant export] → none exists yet; a follow-up when it
  does (ADR-0050 rule 6).

## Migration Plan

New tables only. Rollback: turn the flag off; the tables stay unused.

## Open Questions

- Should "email reaches Unfold only as an inbound webhook, never IMAP" become
  a durable record? It is recorded here and in the operations page for now.
