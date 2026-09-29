---
type: reference
audience: [owner, contributor, agent]
owner: glide
last_verified: 2026-09-27
verified_by: "validate_adr_consistency.py registry parity for docs/adr, run by mise run docs-check"
---

# System decisions

Use MADR 4.0 for new system decisions. Application decisions remain in their existing ledgers. Copy the [template](adr-0000-template.md), add a Confirmation check and run `python3 scripts/validate_adr_consistency.py .`.

## Records

| ADR | Decision | Status | Last updated |
| --- | --- | --- | --- |
| [ADR-0001](adr-0001-glide-contains-independent-applications.md) | Glide contains independently deployable Vloer and Ploeg | accepted | 2026-09-12 |
| [ADR-0002](adr-0002-ploeg-is-the-only-engine.md) | Ploeg is the only execution engine and Vloer is its front end | accepted | 2026-09-22 |
| [ADR-0003](adr-0003-the-unit-of-work-is-the-work-item.md) | The unit of work is the Work Item, and work can create work | accepted | 2026-09-22 |
| [ADR-0004](adr-0004-glide-releases-one-version.md) | Glide releases Vloer and Ploeg under one version | accepted | 2026-09-27 |
| [ADR-0005](adr-0005-glide-is-offered-to-agencies.md) | Glide is offered to agencies, and delivery ends at a reviewed pull request with a preview | proposed | 2026-09-28 |
| [ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md) | The ticket is the billing unit: a quoted, capped Shift budget charged on delivery | proposed | 2026-09-29 |
| [ADR-0007](adr-0007-clients-approve-ready-work.md) | Clients approve Ready work, and each client sets its own definitions of Ready and Done | proposed | 2026-09-28 |
| [ADR-0008](adr-0008-every-pull-request-gets-a-preview-environment.md) | Every pull request gets a preview environment; production stays with the agency | proposed | 2026-09-28 |
| [ADR-0009](adr-0009-one-tenant-per-agency.md) | One tenant per agency, isolated by namespace, network, runtime and credentials | proposed | 2026-09-28 |
