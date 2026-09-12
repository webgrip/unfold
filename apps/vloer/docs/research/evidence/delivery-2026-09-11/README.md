# Delivery milestone evidence

## Independent verification and Ploeg authority

[Docker verification](docker-verification.json) records six actual fresh verifier containers: two fixed checks fail on the original Git fixture, both pass after the repair, and both reject a process that prints success but exits with an error. These are controller-defined black-box assertions, not a claim about discovering arbitrary repository tests. The approved base, canonical commit and policy digests are retained in the output.

[Authority qualification](authority-qualification.json) records actual PostgreSQL, Ploeg HTTP, De Vloer HTTP, Git reconstruction, fresh Docker checks and candidate-bound approval. Restarting De Vloer reuses the same receipt, with exactly one verification start in durable history. The candidate is a deterministic qualification fixture; no agent was asked to produce it. No model inference or external publication occurred.

- [Actual verified and approved workbench, desktop](candidate-approved-desktop.png)
- [Actual verified and approved workbench, mobile](candidate-approved-mobile.png)
- [Reproduction instructions](../../../operations/unified-baseline.md#enable-independent-candidate-checks)

## Real tracker admission authority

The separate [tracker authority result](tracker-authority-qualification.json) uses real PostgreSQL and both services, with a Vikunja HTTP fixture and controlled runtime. It imports the existing item, rejects a stale preview and deliberately loses the first successful admission response. Two HTTP admission attempts produce one execution and one operator Run on the original Work Item. It does not claim repository edits, model calls or forge publication.

## Tracker binding browser fixtures

The tracker screenshots below exercise the actual De Vloer HTTP server and browser with local HTTP fixtures standing in for Vikunja and Ploeg. Their task title and description identify the fixture. The work item ID is illustrative. No agents, model calls, live tracker mutations or spend occur. The checks prove the client submits the reviewed binding, creates exactly one queued session, and rejects a changed source before admission.

- [Desktop source preview and existing Work Item link](tracker-binding-preview.png)
- [Mobile source preview and binding](tracker-binding-preview-mobile.png)
- [Imported queued session on mobile](tracker-binding-queued-mobile.png)
- [Stale Start rejected before admission](tracker-binding-stale-start.png)

Reproduce with `mise exec -- env VLOER_SCREENSHOTS=/tmp/de-vloer-tracker-binding-evidence node scripts/browser-task-binding-check.mjs` from the repository root. The desktop and mobile previews were visually inspected; the script also asserts no horizontal overflow and no browser errors. Actual Ploeg/PostgreSQL qualification and independent verification have their own result files in this directory and must not be inferred from these fixture screenshots.
