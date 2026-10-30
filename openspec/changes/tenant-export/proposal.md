# Tenant export v1: everything Unfold holds for a Tenant, in open formats

## Why

System ADR-0050 (accepted 2026-10-30, [pull request #697](https://forgejo.webgrip.dev/webgrip/unfold/pulls/697))
rule 6 says a Tenant can leave with all its data, through the API, in
documented formats, with no support ticket. That is how the hosted service
meets the EU Data Act's switching duty (Regulation (EU) 2023/2854,
Chapter VI). ADR-0050 lists "There is no Tenant export" as a known violation,
and the go-to-market page's "Can we leave?" answer admits the export contract
is missing. Today Unfold has only per-feature exports: the delivery ledger
CSV, one Agent Trace as JSON Lines, the flagd document and a candidate's
patch.

Application: `apps/unfold`. Ticket: none yet.

## What Changes

- `src/tenant-export.ts`: one catalogue that classifies every table Unfold
  creates as exported (with the rule that decides which rows belong to the
  Tenant) or excluded (with a reason), and a builder that streams each entity
  to a JSON Lines file, writes a JSON Schema per entity, a `ploeg-data.md`
  pointer and `manifest.json` (files, row counts, schema versions, SHA-256,
  exclusions and the no-secrets statement), into a gzip-compressed POSIX tar.
- `src/tar-writer.ts`: a streaming ustar and gzip writer on Node's standard
  library.
- `src/tenant-export-jobs.ts`: background export jobs, one at a time, from a
  read-only snapshot of the database; a download that expires after 24 hours;
  administrators with a browser sign-in only; log lines and Action Records.
- `/api/admin/tenant-exports` routes, one route block in `src/http.ts`.
- `PloegClient.reachableWorkItems`, so Work Item rows are scoped by the
  Tenant checks Ploeg's targets imply.
- The `tenant.export` permission flag, off by default.
- The operations page "Leaving Unfold: export a Tenant", the API contract,
  the flag table and the go-to-market answer.

## Non-goals

- Exporting what Ploeg holds: Runs, Shifts, transcripts, spend, its audit.
  The bundle points at Ploeg instead, and the generic Ploeg bulk export
  contract is written in `design.md` for ploeg-hq.
- Parquet output. JSON Lines only in version 1 (see `design.md` D4).
- An import endpoint.
- A step-up sign-in. Unfold has none; the browser-only rule and the typed
  confirmation stand in.
- OKF for knowledge and git for code (ADR-0050 rule 6): Unfold stores
  neither; the Tenant's knowledge base and repositories live in their own
  systems.

## Capabilities

### New Capabilities

- `tenant-export`: how an administrator exports everything Unfold holds for
  one Tenant, and what the bundle contains.

### Modified Capabilities

None.
