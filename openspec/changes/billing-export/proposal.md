# Billing export: one line per accepted Work Item into the Agency's own tool

## Why

[System ADR-0006](../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md)
makes the accepted ticket the billing unit, and the delivery ledger (PR #684)
already says which Work Items were accepted, how and when. System ADR-0050
(PR #697) decides that Unfold never sends an e-invoice itself. Instead it
writes one line per accepted ticket into the Agency's PSA or accounting tool,
Simplicate first, and that tool invoices and sends Peppol. Today the Agency
copies the ledger by hand.

Application: `apps/unfold`. Ticket: none yet.

## What Changes

- A billing exporter registry (`src/billing-export.ts`, `src/billing-exporters.ts`)
  with two adapters. `simplicate` creates one fixed-fee project service per
  line. `file` writes CSV and UBL 2.1 JSON invoice lines for any other tool.
- A `billing` configuration block, absent by default. Its credential comes
  only from the environment variable `tokenEnv` names. Demo mode refuses it.
- A feature flag `billing.export`, off by default and evaluated per Tenant.
- Per-Client mappings an administrator keeps in Settings. Each holds the
  exporter's target (for Simplicate, the project and the catalogue service)
  and the Agency's own price per ticket or per Size.
- A billing outbox (`src/billing.ts`). It holds one line per accepted Work
  Item and one credit line per confirmed Reversal, keyed for exactly-once.
  Lines are retried with backoff, can end in a visible failed state, and can
  be sent again by hand.
- `/api/billing` routes and a Billing page under Settings.
- An operations page, "Bill accepted tickets through Simplicate".

## Non-goals

- Unfold's own Delivery Fee, Token Charge, Credits or invoices. Nothing here
  prices Unfold's work, and a Client never sees a line.
- Sending invoices or Peppol messages.
- Deciding by itself that a revert was a defect. A person confirms a Reversal.
- Moneybird, Teamleader and Exact adapters, which slot into the registry
  later.

## Capabilities

### New Capabilities

- `billing-export`: how Unfold writes accepted Work Items and Reversals as
  lines into the Agency's billing tool.

### Modified Capabilities

None.
