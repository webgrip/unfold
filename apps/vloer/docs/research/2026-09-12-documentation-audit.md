# Documentation audit — 12 September 2026

Follow-up: the [second pass](2026-09-12-documentation-second-pass.md) incorporates the local-execution product direction and further corrections. The results below describe the first pass.

The two repositories can share system explanation, product vocabulary and cross-service workflows while retaining their own operational guides and published contracts. This audit prepares that boundary without moving either repository or choosing a shared execution engine.

## Scope and method

The baseline inventory covers 237 tracked text sources: 107 in De Vloer and 130 in Ploeg. It includes Markdown, documentation schemas and models, planning exports, instructions and legal source files. One path is an existing CLAUDE.md symlink to AGENTS.md; it is already a shared source. Binary evidence is retained. Generated landscape HTML and its template are checked separately as rendering artifacts.

The [machine-readable ledger](2026-09-12-documentation-audit.json) records each baseline path, hash, size, classification, disposition and review depth. Inventory and structural classification cover the full set; source checks concentrate on current entry points, architecture, execution contracts, domain definitions and operating guidance. Historical research, accepted ADR bodies and archived change specifications were retained, not re-certified as current truth. A file marked classified has not had every claim independently verified.

Baselines: [De Vloer 7c8657e](https://forgejo.webgrip.dev/webgrip/de-vloer/src/commit/7c8657e15b1525e30641b12e5175bf268a49b03d) and [Ploeg f2333b9](https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/f2333b96c6b44f489c562f74d6a4654fed29cc01). These links retain replaced prose and original evidence.

## Findings and corrections

| Finding | Correction and evidence |
| --- | --- |
| Ploeg's current architecture listed implemented Shift orchestration, roles, providers and write-backs as missing | Rewrote the current explanation against [Shift engine](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/shiftengine/engine.go), [providers](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/provider/) and [HTTP service](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/httpapi/server.go) |
| Old prose gave workers management-key authority and treated Run tokens as authentication | Aligned architecture and authoring context with [managed worker control](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/contracts/worker-control.md) and its tests |
| The domain models disagreed about hands-on admission, and one Run definition required Kubernetes | Reconciled shared-mode Start with [Vloer's execution authority](../../src/execution-authority.ts); allowed delegated Runs in Ploeg's model; regenerated both models' readable views |
| Mandatory Ploeg authority was described as settled product direction | Recorded the owner's reopened question in [the product model](../../../../docs/domain/model.yaml), [landscape](../../../../docs/landscape/index.md) and [discussion guide](../../../../docs/landscape/questions.md) |
| The live guide said SSO was missing and described fixed-price brief checks and one-minute settlement | Corrected against [configuration](../../src/config.ts), [session engine](../../src/engine.ts) and shared accounting contracts |
| Retry instructions applied standalone reset behavior to shared executions | Documented the explicit new-session requirement for failed Ploeg execution in [live operation](../operations/live.md#trying-a-failed-session-again) |
| An initial coordination contract still assigned files to named implementation agents | Retired its contents in place and linked the [current API and types](../contracts/implementation.md) |
| A generated design compilation repeated about 43,000 words of source chapters | Replaced it with a generated [chapter guide](../PRODUCT-DESIGN.md); source chapters and the prior compiled edition remain available |
| Current setup guidance carried old board IDs, cluster IPs and contradictory credential advice | Replaced Ploeg's board and infrastructure notes with current source pointers and linked historical snapshots |
| Ploeg's old Compose onboarding omitted managed authentication configuration | Removed it from the recommended onboarding path and identified its migration need; linked the current [shared demonstration](../../../../docs/workflows/local-demo.md) |

Selected claims in 36 current files were compared with source or contracts. Ten derived views were regenerated; 190 paths received structural classification and one is an existing instruction alias. These counts describe review depth, not 237 independently certified documents.

Exact-content matches were the per-repository Apache licences, the existing instruction symlink and three small OpenSpec metadata files. They are retained for their separate distribution or workflow roles. The large design duplication was a compilation, not an exact-file match.

## Salience and writing

Current indexes lead to the task a reader needs to perform: try, operate, integrate or understand. Proposals and evidence have a separate reading path. The design baseline is labelled at its source chapters, not only on an index a direct visitor might never read. Historical evidence keeps its detail; an old observation can remain useful without becoming a current requirement.

The writing pass removes duplicated introductions, implementation-team chatter, unsupported absolutes and incidental version labels. API identifiers, numerical limits and safety conditions remain exact where verified. The humanize scanner is advisory: “harness” is a domain term, even when a generic writing detector flags it. Changed factual assertions are reported as corrections, not cosmetic edits.

## Human and machine sources

Both audiences read the same Markdown. Domain YAML generates the readable vocabulary; existing JSON schemas describe wire contracts. Each repository has a short `llms.txt` discovery file linking current sources. No second prose specification or full-archive agent dump was added. See [maintenance guidance](../../../../docs/documentation.md) and the [human entry point](../index.md).

The audit ledger is a dated review artifact. It should not be updated as an ongoing product registry or loaded into every agent session.

## Research informing the approach

[Diátaxis](https://diataxis.fr/) separates tutorials, how-to guides, reference and explanation by reader need. This audit uses those distinctions in the reading paths without moving every file into a new directory tree.

[GitLab's documentation tests](https://docs.gitlab.com/development/documentation/testing/) combine prose and structure checks, link validation, diagram checks and generated-file consistency. These checks complement source review; they do not prove a product claim is true.

[The llms.txt proposal](https://llmstxt.org/) supplies discovery links for machine readers. This audit uses a small index, leaving source truth in Markdown and structured contracts. [MkDocs configuration](https://www.mkdocs.org/user-guide/configuration/) distinguishes navigation from inclusion in the build. Merely hiding a page from navigation is not an archive or search exclusion strategy.

## Shared execution and the monorepo

The user is considering local workloads and a common execution layer. The unresolved requirement is whether local work must function without any Ploeg service. A local runner connected to a local or remote Ploeg can preserve one authority; independent operation needs explicit rules for grants, expiry, revocation and reconciliation.

A monorepo does not require one executable. Keep product explanation and cross-service workflows shared, and service operations and producer-owned contracts scoped to each project. Compare existing execution behavior before extracting code across the Go and TypeScript boundary. A reusable runner process may fit better than a shared language library; this is a recommendation to evaluate, not an accepted architecture.

**Works** is a simple candidate repository name. Naming and migration remain open; no repository was renamed, moved, committed or pushed by this audit.

## Validation and limits

The [validation record](evidence/documentation-2026-09-12/validation.json) and [command output](evidence/documentation-2026-09-12/validation.txt) retain the checks:

- De Vloer: 211 tests passed, with no failures or skips; typecheck, source/JSON check, design generation check, brand/license checks, Helm lint and the default render passed.
- Ploeg: Go formatting, build, vet and tests passed. The Go output identifies cached results. Helm lint, all four renders, golden comparisons, brand/license checks and strict OpenSpec validation passed. The harness/schema and decision-ledger tests also passed after the schema description correction.
- Both domain views were regenerated from YAML. The structural health tool reports open ambiguities; the product model intentionally has vocabulary and rules without an entity schema. Those scores do not certify semantics.
- The link pass resolved 1,298 Markdown paths and anchors, including cross-repository development links mapped to the local checkouts. It did not check every external URL or pinned remote revision for network availability.
- The landscape builder rendered 15 diagrams across nine pages. All nine pages opened without JavaScript errors; the [review screenshot](evidence/documentation-2026-09-12/landscape-review.png) shows the open execution question.
- The advisory writing scan covered 32 pages. Findings fell from 252 to 163, including retained technical vocabulary. One focused prose pass followed the factual corrections; lower counts are not a quality guarantee.
- Git's whitespace check flags the domain generator's two-space Markdown hard breaks: two in De Vloer and 90 in Ploeg. They are intentional Markdown formatting. No other whitespace defects were found.

No live model call, cluster change, provider billing check or deployment requalification was performed. A full TechDocs site build and a human fresh-reader task study were not run. The local renderer check establishes display and navigation, not that a new colleague can complete every procedure unaided.

Website search exclusion is not configured by this change. Historical pages remain in the repository and may remain searchable in a full TechDocs build. The current reading and machine-discovery indexes do not present them as current instructions.
