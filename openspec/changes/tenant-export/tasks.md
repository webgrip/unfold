# Tasks — tenant-export

## 1. Unfold application

- [x] 1.1 `src/tenant-export.ts`: the table catalogue, scope rules, curated entities, schemas, manifest and Ploeg pointer
- [x] 1.2 `src/tar-writer.ts`: streaming ustar and gzip
- [x] 1.3 `src/tenant-export-jobs.ts`: background jobs from a read-only snapshot, 24-hour expiry, browser-only administrators, log lines and Action Records
- [x] 1.4 `/api/admin/tenant-exports` routes in one block of `src/http.ts`, and `PloegClient.reachableWorkItems`
- [x] 1.5 The `tenant.export` flag, off by default

## 2. Documentation

- [x] 2.1 Operations page "Leaving Unfold: export a Tenant", API contract, flag table, go-to-market answer

## 3. Tests

- [x] 3.1 Every table created in `src/` is exported or excluded with a reason
- [x] 3.2 No secret in the bundle
- [x] 3.3 Tenant isolation with checks enforced, and the whole installation with them off
- [x] 3.4 Checksums, row counts and schemas
- [x] 3.5 A 40,000-row export stays streamed
- [x] 3.6 The API round trip, flag, roles and audit

## 4. Follow-ups

- [ ] 4.1 ploeg-hq: the bulk export contract in `design.md` D6
- [ ] 4.2 Parquet output once a writer passes the licence gate
- [ ] 4.3 A step-up sign-in for the export when Unfold has one
- [ ] 4.4 An export button on the administrator pages

## 5. Gates

- [x] 5.1 `mise run verify` and `mise run docs-check`, output in the pull request
