# Documentation audit: second pass

Reviewed on 12 September 2026 in the De Vloer and Ploeg working trees. This follows the [first audit](2026-09-12-documentation-audit.md); its recorded hashes and test output describe that earlier pass. The [second-pass ledger](2026-09-12-documentation-second-pass.json) records the follow-up scope and dispositions.

## Findings and corrections

| Finding | Correction and evidence |
| --- | --- |
| Current guides left Ploeg-free local execution unresolved | Record the user's product direction in both domain models and architecture guides. [Product R8](../domain/rules.md#r8) distinguishes standalone authorization from Ploeg-managed authority. The shared runner remains a [proposal to test](../monorepo-transition.md) |
| Extension instructions contradicted implemented SSO, tracker import and review UI | Rewrite the [extension guide](../../extensions/vscode/README.md) around installation, connection, work and evidence. Check against [extension flows](../../extensions/vscode/src/extension.ts) and [panel code](../../extensions/vscode/media/session.js) |
| Release instructions mixed current workflow with obsolete provisioning notes | Rewrite [release operation](../operations/release.md) against the [publication workflow](../../.forgejo/workflows/on_release_published.yml). Distinguish a created release, uploaded assets and conditional registry publication; retain the old guide by immutable link |
| Vloer's architecture overstated which crew roles gate completion | Document the final read role and writing-crew approval condition from the [engine](../../src/engine.ts) |
| Ploeg's model described a Job watcher, automatic checkpoint injection and automatic follow-up creation | Correct recovery terminology against the [controller sweep](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/cmd/ploegd/sweep.go), [worker](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/worker/worker.go) and [webhook handler](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/httpapi/server.go). Label the broader follow-up behavior as intended |
| Domain events equated reservation with issued credentials and outcome reporting with settled spend | Distinguish recorded authorization, external effects and settlement using the [inference-account store](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/store/llm_accounts.go). Preserve holds when effects are uncertain |
| Repository-valid links broke in the built site | Add a [TechDocs hook](../../scripts/techdocs.py) that resolves existing repository-source targets to Forgejo while retaining Markdown and source examples unchanged |
| The default site navigation and search mixed current guides with historical material | Add deliberate [navigation](../../mkdocs.yml); keep evidence pages accessible while omitting research, ADRs, design baselines and the retired implementation guide from the local search index |

## Editorial judgment

The long extension and release guides accumulated repeated feature descriptions, fixed test counts, version examples and remote account claims. The replacements organize the reader's task, retain authentication and recovery constraints, and link detailed contracts or source instead of copying field inventories. The old release history remains available. Correcting these claims is factual maintenance. The style scanner flags technical uses of “harness”, bold UI labels and numbered review steps; those remain where they help the reader. Its change-rate guard rejects the large rewrites as cosmetic edits. The requested consolidation justifies broader changes here: obsolete version examples, fixed test counts and dated provisioning claims were removed deliberately, with historical access preserved. The reported numeric additions are punctuation/tokenization changes or existing checksum instructions moved into prose; no new performance measurement was introduced.

The approach follows [Diátaxis](https://diataxis.fr/foundations/) by separating task guidance from explanation and reference. [GitLab's documentation testing](https://docs.gitlab.com/development/documentation/testing/) supports treating links, generated content and writing checks as separate checks. [MkDocs configuration](https://www.mkdocs.org/user-guide/configuration/) distinguishes navigation from build inclusion; neither alone proves the resulting search index is appropriate.

## Scope and limits

The follow-up starts from a snapshot of 268 documentation and supporting text files, including the first pass's uncommitted work. Automated checks revisit the corpus; selected current claims receive direct source review. This is not a line-by-line recertification of every historical dossier, accepted ADR, backlog item or legal source. Those records retain their provenance and authority. A page's age alone is not a reason to delete it.

Local execution without Ploeg is the user's current product direction, open to reconsideration when the comparison produces evidence. No shared engine has been extracted and no architectural proposal has been ratified. Independence from Ploeg does not promise offline model inference.

The site filter covers the generated local search index. It does not control external crawlers or Backstage-wide ingestion. External deployments, registry credentials and live paid providers have not been requalified by this audit. Both repositories remain in their existing locations, with changes uncommitted.

## Verification

The [validation record](evidence/documentation-second-pass-2026-09-12/validation.json) links retained command output.

- De Vloer: 211 application tests and 41 extension tests passed. Typecheck, repository checks, design generation, brand and license checks passed; the extension built, packaged and passed listing/content verification.
- Ploeg: Go tests, vet and build passed. Strict OpenSpec validation and the repository's ADR-ledger gate passed. Cached test results are identified in the raw output.
- A separate standalone fixture ran with neither Ploeg connection nor execution authority configured. It retained the baseline failure, repaired checks, independent review, Git diff and 18 durable events. It made no model calls and recorded demonstration spend of zero.
- TechDocs built in strict mode using `mkdocs-techdocs-core` 1.7.1, MkDocs 1.6.1 and Material 9.7.7 in an isolated local environment. Build assertions checked source links, preserved examples and history, and the filtered search index. Browser verification also exposed a failing default search initializer; the supported Material search option resolved it. The existing deployment workflow still uses its own toolchain; this was not a live site deployment.
- Both domain models and the interactive landscape were regenerated. All nine landscape pages and five representative site pages opened without JavaScript errors. Repository links and the rendered site were checked; final counts are in the validation record. The brandbook's two Markdown links were also corrected at their generator source so its standalone HTML works on the site.

The application and extension tests use fixtures and local services. Passing these checks does not establish production isolation, current registry availability or live-provider behavior. No repository was renamed, moved, committed or pushed.
