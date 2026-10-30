# Tasks — billing-export

## 1. Unfold application

- [x] 1.1 Exporter registry, line model, CSV and UBL 2.1 JSON renderings (`src/billing-export.ts`)
- [x] 1.2 Simplicate adapter (`src/billing-simplicate.ts`) and file adapter (`src/billing-file.ts`)
- [x] 1.3 `billing` settings, refused in demo mode; `billing.export` flag, off by default
- [x] 1.4 Outbox, sync from the delivery ledger, retries, Reversals (`src/billing.ts`)
- [x] 1.5 `/api/billing` routes in one block of `src/http.ts`; Billing page under Settings
- [x] 1.6 Tests: a fake Simplicate, exactly-once, Reversal, retries, scoping, demo refusal

## 2. Documentation

- [x] 2.1 Operations page "Bill accepted tickets through Simplicate"; API contract rows

## 3. Decisions

- [ ] 3.1 The owner picks the Simplicate object a line becomes
- [ ] 3.2 A run against a sandbox Simplicate confirms the credit line and the date format

## 4. Gates

- [x] 4.1 `mise run verify` and `mise run docs-check`
