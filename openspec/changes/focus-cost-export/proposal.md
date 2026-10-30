# FOCUS cost export: AI spend per Client in FinOps FOCUS 1.4

## Why

[System ADR-0050](../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md)
rule 3 decides that cost and usage leave Unfold as FinOps FOCUS, reachable
through the API. Today an Agency sees settled Run cost only on Insights and in
the Deliveries CSV, in Unfold's own columns. It cannot load its AI spend into
a FinOps tool next to its cloud bill, or charge it back per Client.

Application: `apps/unfold`. Ticket: none yet.

## What Changes

- `src/focus-export.ts` turns Ploeg's delivery facts into FOCUS 1.4 Cost and
  Usage rows: one per settled Run, or one per Work Item and UTC day, with the
  Tenant as billing account and the Client as sub account.
- `GET /api/ploeg/cost-export` answers CSV or JSON Lines for any UTC period up
  to 366 days, filtered by Tenant and Client, for operators and administrators,
  scoped like the Delivery ledger. The demo answers a file without rows.
- Costs stay in US$. An optional EUR export multiplies by a rate the request
  gives and states it per row.
- A **Download FOCUS cost** button on Insights next to the Deliveries CSV.
- A test checks every file against the FOCUS 1.4 column table and rules.
- An operations page, "Export AI cost per Client (FinOps FOCUS)".

## Non-goals

- Parquet output, at first; the owner decided on 2026-10-30 to add it (design.md).
- Pushing the file to a FinOps tool, a schedule, or FOCUS Metadata.
- Pricing Unfold's own work, Credits, Markup or invoices.
- Knowing the model or provider per Run: Ploeg's facts carry neither.

## Capabilities

### New Capabilities

- `focus-cost-export`: how Unfold writes model cost as FOCUS rows.

### Modified Capabilities

None.
