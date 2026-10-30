# Tasks — ocsf-audit

## 1. Unfold application

- [x] 1.1 `src/audit/ocsf.ts`: Unfold audit facts mapped to OCSF 1.9.0 classes and activities
- [x] 1.2 `src/audit/chain.ts`: append-only table, one hash chain per Tenant, verification, retention with anchors
- [x] 1.3 `src/audit/capture.ts`: the request tap, the account observer and unfold-mcp requests
- [x] 1.4 `src/audit/export.ts`: OTLP logs exporter reusing the insight OTLP payload, NDJSON paging
- [x] 1.5 `GET /api/admin/audit` and `GET /api/admin/audit/verify`, Tenant-scoped
- [x] 1.6 `audit.export` flag, off by default; `UNFOLD_AUDIT_*` settings

## 2. Evidence

- [x] 2.1 `scripts/vendor-ocsf.mjs` and the OCSF 1.9.0 extract under `test/fixtures/ocsf/`
- [x] 2.2 Tests: mapping per event, schema validation, chain break after an edit, retention anchor, OTLP to a fake collector, NDJSON paging, Tenant scoping

## 3. Documentation

- [x] 3.1 Operations page "Send Unfold's audit to your SIEM (OCSF)", API contract rows, flag row

## 4. Decisions

- [ ] 4.1 The owner accepts system ADR-0050 (PR #697)
- [ ] 4.2 The owner decides whether the chain head is signed or copied off-box

## 5. Gates

- [x] 5.1 `mise run verify` and `mise run docs-check`, output in the pull request
