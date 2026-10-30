# Tasks — focus-cost-export

## 1. Unfold application

- [x] 1.1 FOCUS rows, CSV and JSON Lines from the delivery facts (`src/focus-export.ts`)
- [x] 1.2 `GET /api/ploeg/cost-export` in one block of `src/http.ts`, operators and administrators, scoped like the ledger
- [x] 1.3 Download FOCUS cost on Insights next to the Deliveries CSV
- [x] 1.4 Tests: FOCUS 1.4 column rules, Client and Tenant filters, unsettled spend, euros, the route, the demo
- [x] 1.5 `format=parquet` through `hyparquet-writer` (Unfold ADR 0060); tests read each file back and compare it with the CSV

## 2. Documentation

- [x] 2.1 Operations page "Export AI cost per Client (FinOps FOCUS)"; API contract and OpenAPI rows

## 3. Decisions

- [x] 3.1 The owner decided on 2026-10-30 to offer Parquet now (VIK-2524)
- [ ] 3.2 A FinOps tool loads an exported month

## 4. Gates

- [x] 4.1 `mise run verify` and `mise run docs-check`
