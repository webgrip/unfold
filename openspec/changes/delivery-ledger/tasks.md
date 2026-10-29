# Tasks — delivery-ledger

## 1. Unfold application

- [x] 1.1 `src/delivery-ledger.ts`: Acceptance kind and date, silence over working days, Token Charge base, CSV
- [x] 1.2 Share `runSpend`, `handedOverAt` and `readWindowFacts` from `src/delivery-economics.ts`
- [x] 1.3 `acceptanceCalendar.nonWorkingDates` setting, default empty
- [x] 1.4 `GET /api/ploeg/deliveries?window=&format=`, Team-scoped, demo answers no amounts
- [x] 1.5 Deliveries table and CSV download on Insights

## 2. Documentation

- [x] 2.1 API contract row, browser UI and operations guide (calendar proposed, phase 2 not built)

## 3. Decisions

- [ ] 3.1 The owner decides the holiday calendar
- [ ] 3.2 The owner sets phase 2 pricing: Credits, Delivery Fee, invoices

## 4. Gates

- [x] 4.1 `mise run verify` and `mise run docs-check`, output in the pull request
