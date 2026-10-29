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
| [ADR-0009](adr-0009-one-tenant-per-agency.md) | One tenant per agency, isolated by namespace, network, runtime and credentials | accepted | 2026-10-18 |
| [ADR-0010](adr-0010-pull-requests-are-small-whole-and-explained.md) | Unfold pull requests are small, whole and explained, and CI asks the reviewer questions | accepted | 2026-09-29 |
| [ADR-0011](adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md) | Unfold is reachable over MCP through a separate, read-first server on Ploeg's operator API | accepted | 2026-09-30 |
| [ADR-0012](adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md) | The marketing site releases and deploys on its own, outside the Unfold version | accepted | 2026-10-01 |
| [ADR-0013](adr-0013-the-product-is-named-unfold.md) | The product is named Unfold, and Ploeg and Vloer are its parts | accepted | 2026-10-01 |
| [ADR-0014](adr-0014-the-unfold-name-and-mark-are-trademarks-not-cc-licensed-artwork.md) | The Unfold name and mark are trademarks under a usage policy, not CC-licensed artwork | proposed | 2026-10-01 |
| [ADR-0015](adr-0015-the-hosted-demo-is-a-recorded-replay-of-the-deterministic-demo.md) | The hosted demo is a recorded replay of the deterministic demo | proposed | 2026-10-01 |
| [ADR-0016](adr-0016-site-sign-ups-are-stored-in-cloudflare-d1-in-the-eu.md) | Site sign-ups are stored by a small Worker in Cloudflare D1, in the EU jurisdiction | accepted | 2026-10-02 |
| [ADR-0017](adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md) | A Tenant sits above Teams and bounds what users, sources and budgets can reach | accepted | 2026-10-04 |
| [ADR-0018](adr-0018-ploeg-releases-on-its-own-schedule-behind-a-tested-contract-version.md) | Ploeg releases on its own schedule behind a tested contract version | proposed | 2026-10-03 |
| [ADR-0019](adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md) | Unfold pins Ploeg from its own repository and releases only its application | superseded by ADR-0039 | 2026-10-18 |
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
| [ADR-0031](adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance.md) | People ask about a Work Item through a metered, read-only Ask paid from a monthly allowance | accepted | 2026-10-13 |
| [ADR-0032](adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md) | Unfold also serves its own read-only MCP tools, next to ploeg-mcp | accepted | 2026-10-10 |
| [ADR-0033](adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md) | Unfold plans non-trivial changes as OpenSpec changes | accepted | 2026-10-11 |
| [ADR-0034](adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant.md) | Agent knowledge is scoped to Tenant, Client, repository and Work Item, in two graphs per Tenant | proposed | 2026-10-11 |
| [ADR-0035](adr-0035-interactive-sessions-reach-tenant-knowledge-only-through-unfold-mcp.md) | Interactive sessions reach Tenant knowledge only through unfold-mcp | proposed | 2026-10-11 |
| [ADR-0036](adr-0036-ploeg-and-unfold-use-one-vocabulary-with-named-screen-words.md) | Ploeg and Unfold use one vocabulary, with named screen words | accepted | 2026-10-13 |
| [ADR-0037](adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md) | People act on work through either MCP server, and every action names its person, channel and confirmation | accepted | 2026-10-17 |
| [ADR-0038](adr-0038-report-a-problem-becomes-its-own-component-that-any-application-embeds.md) | Report a problem becomes its own component that any application embeds | accepted | 2026-10-18 |
| [ADR-0039](adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md) | Unfold depends on a released Ploeg through its contract bundle and Go module | accepted | 2026-10-18 |
| [ADR-0040](adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging.md) | Unfold's production runs on a rented EU Talos cluster, and the homelab is staging | accepted | 2026-10-18 |
| [ADR-0041](adr-0041-a-ploeg-release-opens-unfolds-pin-pull-request-by-running-unfolds-recipe.md) | A Ploeg release opens Unfold's pin pull request by running Unfold's recipe | accepted | 2026-10-18 |
| [ADR-0042](adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md) | A self-hosted decider reads what agents do and starts as a shadow tripwire | proposed | 2026-10-18 |
| [ADR-0043](adr-0043-an-unfold-release-is-one-chart-that-carries-the-ploeg-it-was-tested-with.md) | An Unfold release is one chart that carries the Ploeg it was tested with | accepted | 2026-10-19 |
| [ADR-0044](adr-0044-unfold-refuses-a-ploeg-that-does-not-serve-the-contract-majors-it-requires.md) | Unfold refuses a Ploeg that does not serve the contract majors it requires, and records what it relies on for Ploeg's CI | proposed | 2026-10-24 |
| [ADR-0045](adr-0045-agent-code-runs-under-kata-or-gvisor-chosen-by-what-the-node-and-the-work-need.md) | Agent code runs under Kata or gVisor, chosen by what the node and the work need | accepted | 2026-10-24 |
| [ADR-0046](adr-0046-an-hourly-release-train-versions-unfold-from-a-checked-development-head.md) | An hourly release train versions Unfold from a checked development head, and a push only checks | proposed | 2026-10-24 |
| [ADR-0047](adr-0047-unfold-describes-a-repository-with-the-ai-codebase-maturity-model-and-delivers-at-level-5.md) | Unfold describes a repository with the AI Codebase Maturity Model, and delivers at Level 5 | proposed | 2026-10-27 |
| [ADR-0049](adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver.md) | A Client Sign-off is input to Acceptance, bound to the head commit and the whole change minus the Agency's exclusions, and each Client has an Approver | proposed | 2026-10-29 |
