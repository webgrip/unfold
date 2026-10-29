# Delivery ledger: Acceptance and Token Charge base per Work Item

## Why

[System ADR-0006](../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md)
makes the Work Item the billing unit: a Token Charge for every attempt and a
Delivery Fee only on Acceptance. Nothing in Unfold says yet which Work Items
were accepted, how, and on what day, or what their attempts cost. Insights
already measures cost per merged Work Item (K2, PR #676), but billing needs
the same figures per Work Item, including approvals and silent Acceptance.

Application: `apps/unfold`. Ticket: none yet; this is roadmap item P3.2,
phase 1.

## What Changes

- A pure Delivery read model, `apps/unfold/src/delivery-ledger.ts`. For each
  Work Item Ploeg attempted in an Insights window, it gives the Acceptance kind
  (merged, approved, silent, closed without acceptance, open), the date of that
  Acceptance, and the Token Charge base in US$, which is the settled cost of
  every attempt with failures included. Unsettled spend is listed apart.
- `GET /api/ploeg/deliveries?window=&format=json|csv`, scoped to the caller's
  Teams like `GET /api/ploeg/economics` (API contract).
- A **Deliveries** table on Insights with a CSV download.
- A configuration setting, `acceptanceCalendar.nonWorkingDates`, marked
  proposed (default empty).
- `delivery-economics.ts` exports the Run spend rule, the hand-over stand-in
  and the window facts reader it already had, so both read models share them.

## Non-goals

- Charging anything. There are no Credits, Delivery Fee, invoices, Reversals
  or Disputes. Those are phase 2 and need the owner's pricing decisions.
- Detecting a change that landed on the base branch by another route.
- Leaving out the tokens of attempts that failed through Unfold's own fault.
- Recording a ready-for-review moment in Ploeg. That would be a Ploeg contract
  change, made upstream first.
- A holiday calendar per country or Tenant.

## Capabilities

### New Capabilities

- `delivery-ledger`: how Unfold reads each Work Item's Acceptance and Token
  Charge base from Ploeg's delivery facts.

### Modified Capabilities

None.
