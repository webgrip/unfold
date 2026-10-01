---
type: reference
audience: [owner, contributor, agent]
owner: unfold
last_verified: 2026-10-02
verified_by: "validate_adr_consistency.py registry parity for docs/adr, run by mise run docs-check"
---

# System decisions

Use MADR 4.0 for new system decisions. Application decisions remain in their existing ledgers. Copy the [template](adr-0000-template.md), add a Confirmation check and run `python3 scripts/validate_adr_consistency.py .`.

## Records

| ADR | Decision | Status | Last updated |
| --- | --- | --- | --- |
| [ADR-0001](adr-0001-unfold-contains-independent-applications.md) | Unfold contains independently deployable Vloer and Ploeg | accepted | 2026-09-12 |
| [ADR-0002](adr-0002-ploeg-is-the-only-engine.md) | Ploeg is the only execution engine and Vloer is its front end | accepted | 2026-09-22 |
| [ADR-0003](adr-0003-the-unit-of-work-is-the-work-item.md) | The unit of work is the Work Item, and work can create work | accepted | 2026-09-22 |
| [ADR-0004](adr-0004-unfold-releases-one-version.md) | Unfold releases Vloer and Ploeg under one version | accepted | 2026-10-01 |
| [ADR-0005](adr-0005-unfold-is-offered-to-agencies.md) | Unfold is offered to agencies, and delivery ends at a reviewed pull request with a preview | accepted | 2026-09-29 |
| [ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md) | The ticket is the billing unit: a quoted, capped Shift budget charged on delivery | accepted | 2026-09-29 |
| [ADR-0007](adr-0007-clients-approve-ready-work.md) | Clients approve Ready work, and each client sets its own definitions of Ready and Done | accepted | 2026-09-29 |
| [ADR-0008](adr-0008-every-pull-request-gets-a-preview-environment.md) | Every pull request gets a preview environment; production stays with the agency | accepted | 2026-09-29 |
| [ADR-0009](adr-0009-one-tenant-per-agency.md) | One tenant per agency, isolated by namespace, network, runtime and credentials | accepted | 2026-09-29 |
| [ADR-0010](adr-0010-pull-requests-are-small-whole-and-explained.md) | Unfold pull requests are small, whole and explained, and CI asks the reviewer questions | accepted | 2026-09-29 |
| [ADR-0011](adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md) | Unfold is reachable over MCP through a separate, read-first server on Ploeg's operator API | accepted | 2026-09-30 |
| [ADR-0012](adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md) | The marketing site releases and deploys on its own, outside the Unfold version | accepted | 2026-10-01 |
| [ADR-0013](adr-0013-the-product-is-named-unfold.md) | The product is named Unfold, and Ploeg and Vloer are its parts | accepted | 2026-10-01 |
| [ADR-0014](adr-0014-the-unfold-name-and-mark-are-trademarks-not-cc-licensed-artwork.md) | The Unfold name and mark are trademarks under a usage policy, not CC-licensed artwork | proposed | 2026-10-01 |
| [ADR-0015](adr-0015-the-hosted-demo-is-a-recorded-replay-of-the-deterministic-demo.md) | The hosted demo is a recorded replay of the deterministic demo | proposed | 2026-10-02 |
