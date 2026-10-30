# Design — billing-export

## Context

The delivery ledger computes each Work Item's Acceptance from Ploeg's delivery
facts. Tenant scoping (`src/tenant-scope.ts`) gives each Work Item an owner
from its target repository: a Tenant, and at most one Client. Report a problem
already keeps an outbox with retries (`src/reports.ts`).

## Decisions local to this change

- **One registry, with adapter-owned fields.** An exporter definition parses
  its own settings block and its own per-Client target fields. No code outside
  an adapter names a vendor.
- **Simplicate writes one fixed-fee project service per line.** This is API v2
  `POST /projects/service` with `invoice_method: FixedFee`, `amount`, `price`,
  `project_id`, `default_service_id` and `external_id` (the line's key). The
  line lands in Simplicate's own "to be invoiced" flow. Invoices created
  through Simplicate's API have no link to services, so Unfold never creates
  invoices.
- **A credit line is a negative quantity at a positive price.** EN 16931 does
  not allow a negative item price, so the UBL line carries quantity -1 and the
  Simplicate line carries `amount: -1`. Whether Simplicate accepts this is
  unverified (open question).
- **Exactly-once by key, never a blind resend.** An acceptance line's key is
  `unfold:<tenant>:<workItemId>:acceptance`, and the credit line's key adds
  `:reversal`. Each line is inserted once (`INSERT OR IGNORE`). Unfold retries
  on its own only when the tool certainly did not take the line: a 429, a 503,
  or no connection made. A timeout, a lost connection or any other 5xx may
  have created the line. Such a line goes to failed with `uncertain` set, and
  a person checks the tool before sending it again.
- **Backoff.** Gaps of 1, 2, 4 and so on up to 60 minutes, at most 8 automatic
  attempts, and at most 30 sends per sweep, one at a time. This keeps a sweep
  under Simplicate's documented 60 requests per minute.
- **Lines start at the mapping's `since` date.** Turning billing on does not
  bill the past 30 days unless the administrator sets an earlier date.
- **Price.** The Agency's own price, in cents, either per ticket or per Size.
  Ploeg records no Size yet, so a per-Size mapping holds a line as
  `needs_price` until an administrator enters its price.
- **Reversal.** A person reverses a sent line within 14 days of its
  Acceptance and gives a reason. Unfold shows any revert it found in the
  delivery facts, but it does not decide that the revert was for a defect.

## Open Questions

- Which Simplicate object the owner wants: a project service per ticket (this
  change), hours on one service, or one service with installments (the API
  cannot create installments).
- Whether Simplicate accepts `amount: -1` on a fixed-fee service, and which
  date format it expects for `start_date` and `end_date`.
- Whether `external_id` can be read back or filtered on. If it can, Unfold
  could check automatically before a resend.
