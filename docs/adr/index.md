---
type: reference
audience: [owner, contributor, agent]
owner: unfold
last_verified: 2026-10-03
verified_by: "validate_adr_consistency.py registry parity for docs/adr, run by mise run docs-check"
---

# System decisions

Use MADR 4.0 for new system decisions. Application decisions remain in their existing ledgers. Copy the [template](adr-0000-template.md), add a Confirmation check and run `python3 scripts/validate_adr_consistency.py .`.

## Records

| ADR | Decision | Status | Last updated |
| --- | --- | --- | --- |
| [ADR-0001](adr-0001-unfold-contains-independent-applications.md) | Unfold contains independently deployable applications | accepted | 2026-09-12 |
| [ADR-0002](adr-0002-ploeg-is-the-only-engine.md) | Ploeg is the only execution engine and Unfold is its front end | accepted | 2026-09-22 |
| [ADR-0003](adr-0003-the-unit-of-work-is-the-work-item.md) | The unit of work is the Work Item, and work can create work | accepted | 2026-09-22 |
| [ADR-0004](adr-0004-unfold-releases-one-version.md) | Unfold releases its application and Ploeg under one version | superseded by ADR-0019 | 2026-10-03 |
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
| [ADR-0015](adr-0015-the-hosted-demo-is-a-recorded-replay-of-the-deterministic-demo.md) | The hosted demo is a recorded replay of the deterministic demo | proposed | 2026-10-01 |
| [ADR-0016](adr-0016-site-sign-ups-are-stored-in-cloudflare-d1-in-the-eu.md) | Site sign-ups are stored by a small Worker in Cloudflare D1, in the EU jurisdiction | accepted | 2026-10-02 |
| [ADR-0017](adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md) | A Tenant sits above Teams and bounds what users, sources and budgets can reach | accepted | 2026-10-04 |
| [ADR-0018](adr-0018-ploeg-releases-on-its-own-schedule-behind-a-tested-contract-version.md) | Ploeg releases on its own schedule behind a tested contract version | proposed | 2026-10-03 |
| [ADR-0019](adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md) | Unfold pins Ploeg from its own repository and releases only its application | accepted | 2026-10-03 |
| [ADR-0020](adr-0020-unfold-is-the-application-and-the-name-vloer-is-retired.md) | Unfold is the application, and the name Vloer is retired | accepted | 2026-10-04 |
| [ADR-0021](adr-0021-agents-are-briefed-from-a-per-tenant-knowledge-base-exchanged-as-okf.md) | Agents are briefed from a per-Tenant knowledge base exchanged as OKF | proposed | 2026-10-04 |
| [ADR-0022](adr-0022-people-give-a-work-item-context-files-at-the-start-and-while-steering.md) | People give a Work Item context files, at the start and while steering | accepted | 2026-10-04 |
| [ADR-0023](adr-0023-unfold-measures-happiness-and-confusion-with-first-party-events-surveys-and-bug-reports.md) | Unfold measures happiness and confusion with first-party events, surveys and bug reports | accepted | 2026-10-05 |
| [ADR-0024](adr-0024-bug-reports-are-filed-by-unfold-into-the-tenants-own-tracker.md) | Bug reports are filed by Unfold into the tenant's own tracker | accepted | 2026-10-05 |
| [ADR-0025](adr-0025-unfold-asks-one-ease-question-on-anomalies-and-a-random-baseline.md) | Unfold asks one ease question on anomalies and a random baseline | accepted | 2026-10-05 |
| [ADR-0026](adr-0026-unfold-is-an-installable-web-app-that-notifies-from-the-server.md) | Unfold is an installable web app that notifies from the server | proposed | 2026-10-05 |
| [ADR-0027](adr-0027-unfold-checks-its-ploeg-client-against-ploegs-published-schemas.md) | Unfold checks its Ploeg client against Ploeg's published schemas | proposed | 2026-10-05 |
| [ADR-0028](adr-0028-unfold-owns-the-run-card-and-collects-its-inputs-itself.md) | Unfold owns the Run card and collects its inputs itself | superseded by ADR-0030 | 2026-10-10 |
| [ADR-0029](adr-0029-unfold-collects-run-card-data-in-a-separate-go-service.md) | Unfold collects Run card data in a separate Go service | superseded by ADR-0030 | 2026-10-10 |
| [ADR-0030](adr-0030-run-cards-are-an-unfold-domain-on-top-of-ploegs-delivery-facts.md) | Run cards are an Unfold domain on top of Ploeg's delivery facts | accepted | 2026-10-10 |
