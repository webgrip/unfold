# System decisions

Use MADR 4.0 for new system decisions. Application decisions remain in their existing ledgers. Copy the [template](adr-0000-template.md), add a Confirmation check and run `python3 scripts/validate_adr_consistency.py .`.

## Records

| ADR | Decision | Status | Last updated |
| --- | --- | --- | --- |
| [ADR-0001](adr-0001-glide-contains-independent-applications.md) | Glide contains independently deployable Vloer and Ploeg | accepted | 2026-09-12 |
| [ADR-0002](adr-0002-ploeg-is-the-only-engine.md) | Ploeg is the only execution engine and Vloer is its front end | accepted | 2026-09-22 |
| [ADR-0003](adr-0003-the-unit-of-work-is-the-work-item.md) | The unit of work is the Work Item, and work can create work | accepted | 2026-09-22 |
