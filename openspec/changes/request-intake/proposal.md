# Request intake: one signed way for Requests to enter Unfold

## Why

A Client's **Request** arrives "through the Client Portal, a tracker or email"
([Who Unfold is for](../../../docs/concepts/who-unfold-is-for.md)), but nothing
receives one today. Agencies collect feedback in Marker.io, BugHerd, Userback,
Freshdesk, Zendesk, web forms and mailboxes. One adapter per tool is the
closed-list pattern system ADR-0050 (pull request #697) rules out; one signed,
generic intake with data-only mapping templates serves all of them.

Application: `apps/unfold`. No Ploeg change. No ticket is filed yet.

## What Changes

- **Signed intake endpoint** `POST /api/intake/<source-id>`. Each Intake Source
  (new term) has a Tenant, an optional Client, a secret and a mapping. A
  delivery is verified as a Standard Webhook with a replay window and
  idempotency on `webhook-id`; a vendor's own HMAC (Marker.io, Zendesk) or a
  token is accepted as a documented weaker mode.
- **Mapping templates**: JSON Pointer picks with one bounded step (each,
  split, join, value) and `when` conditions. No expressions, no eval.
  Templates for Marker.io, BugHerd, Userback, Freshdesk, Zendesk and a plain
  form or n8n payload, each citing the vendor's documentation and how far it
  was verified.
- **Inbound email** as a webhook: raw MIME (`message/rfc822`), Postmark's
  inbound JSON or a JSON wrapper. Replies thread onto their Request by
  `In-Reply-To` and `References`. No IMAP poller and no outbound mail.
- **What a Request becomes**: a stored Request in state `new`, scoped by Tenant
  and Client under `tenancy.enforce`, for Refinement to pick up. It never
  becomes a Run and is never dispatched.
- **Administration**: one route block in `src/http.ts`, a Settings page behind
  the `intake.requests` flag, off by default.

## Capabilities

### New Capabilities

- `request-intake`: receiving Requests from signed webhooks and email.

### Modified Capabilities

None.

## Non-goals

- Refinement itself: turning a Request into Work Items, asking the Client
  questions, Quotes.
- Applying a sender's later updates or deletions to a stored Request.
- Downloading or storing attachment contents; attachments stay links or names.
- `multipart/form-data` bodies (SendGrid Inbound Parse, Mailgun routes); they
  reach Unfold through a relay in one of the accepted shapes.
- Including Requests in a Tenant export, which does not exist yet.

## Impact

`apps/unfold/src/intake/` (new), one route block and one construction line in
`src/http.ts`, `src/flag-registry.json`, `public/views/intake.js` and the
Settings navigation, the API contract, a new operations page, and the Intake
Source term in `docs/domain/model.yaml`. New SQLite tables `intake_sources`,
`intake_requests`, `intake_messages` and `intake_deliveries`; secrets are kept
encrypted in the existing internal state table.
