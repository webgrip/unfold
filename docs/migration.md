# Glide migration

Glide brings Vloer and Ploeg into one repository on `development`. The original repositories remain available. This migration changes the source layout and developer workflow; deployment coordinates and runtime behavior retain their application scope.

## What moved

| Before | Glide |
| --- | --- |
| `de-vloer/` | [apps/vloer](../apps/vloer/) |
| `ploeg/` | [apps/ploeg](../apps/ploeg/) |
| Vloer's shared product model and generated views | [docs/domain](domain/overview.md) |
| System explanation and diagrams | [docs/landscape](landscape/index.md) |
| Cross-application demo and managed setup | [docs/workflows](workflows/local-demo.md) |
| Documentation maintenance | [One shared policy](documentation.md) |

Service API schemas, application architecture, operating details and existing ADRs stay with the producing application. Old shared-document paths contain short redirects or a symbolic link to the one structured source. The [complete path mapping](research/2026-09-12-glide-document-paths.json) records these moves.

The import preserves 396 Vloer files and 392 Ploeg files, including the audited working trees. Original commit objects are retained. Separate snapshot and directory-move commits make file history traceable with `git log --follow`. Tags become `vloer-v…` and `ploeg-v…`; non-version tags keep the same application prefix. Release-channel notes use the same namespace. The [import manifest](research/2026-09-12-glide-import.json) records source revisions, tag objects, file modes and SHA-256 digests. Run `mise exec -- python3 scripts/verify-import.py` to verify the immutable import against that manifest.

A final comparison with the original remotes found Ploeg's existing [rc.7 release commit](https://forgejo.webgrip.dev/webgrip/ploeg/commit/6f19c25fcc48f2335ad39237d06642adef1a5fcc) beyond the audited local checkout. Its changelog and chart metadata are merged into Glide, with the original commit retained as a parent. The immutable import manifest continues to describe the audited snapshots.

The earlier [proposal](migration-proposal.md) remains as history. The [system decision](adr/adr-0001-glide-contains-independent-applications.md) records the owner-approved scope.

## Execution boundary

[The comparison](research/2026-09-12-execution-boundary.md) exercises standalone Vloer and Vloer delegated by real Ploeg HTTP and PostgreSQL. The existing engines remain separate. The same Vloer runtime interface already serves both Vloer modes, while Ploeg's unattended worker owns different process and lease responsibilities. A common package would add a new boundary without removing demonstrated duplication.

## Checks and release preparation

Run `mise run setup` and `mise run verify` from the root. CI checks both applications for every push to `development` and every pull request, including changes to shared documentation. This deliberately favors dependable coverage over path-filter complexity at the current repository size.

The [CI workflow](../.forgejo/workflows/checks.yml) uses separate semantic-release package paths and tag formats. [Vloer publication](../.forgejo/workflows/publish-vloer.yml) and [Ploeg publication](../.forgejo/workflows/publish-ploeg.yml) accept only their application tags. Ploeg retains its zero-major release-candidate guard. Application images, charts, the extension ID and `github.com/webgrip/ploeg` are unchanged. Helm stays scoped: Vloer uses 4.2.4; Ploeg's golden renders use 4.2.3.

The combined [TechDocs build](../scripts/docs.py) renders the maintained Markdown files. It checks structured-source generation and repository links, then excludes dated research and design/decision history from its local search index. These exclusions do not configure an external crawler or Backstage search ingestion.

The [local qualification record](research/evidence/glide-2026-09-12/verification.json) records 211 workbench tests, 41 extension tests, all Go gates, both execution modes, chart snapshots, three AMD64 container builds and strict documentation checks. `mise run release-check` repeats release isolation and policy checks in the pinned image without network access or publication.

## Source publication

[Glide is published on Forgejo](https://forgejo.webgrip.dev/webgrip/glide), with `development` as the default branch. The owner created the repository with public visibility. The complete source history, 70 namespaced tags and 67 release-channel notes were pushed together over SSH; all 138 remote refs match their local objects. A fresh clone from Forgejo passes the immutable import verifier.

The [first CI run](https://forgejo.webgrip.dev/webgrip/glide/actions/runs/1) passed application verification, documentation checks, container builds and release-policy tests at commit `e1f40a9f0df4507196a04284f8d03935343927ce`. Both release jobs were explicitly skipped. The [publication record](research/evidence/glide-2026-09-12/publication.json) records the exact commit, run, job outcomes and ref verification separately from local qualification.

The earlier repository-creation blocker is resolved by the owner's creation of the repository. No new token or permission was created by the agent. Artifact releases still require the distribution work below.

## Distribution cutover remains separate

Follow the [first cutover playbook](operations/first-cutover.md) for preparation gates, release preview, per-destination checks, a bounded live pilot and rollback. The [12 September readiness record](research/2026-09-12-cutover-readiness.json) includes a fresh cluster and GitOps check; it does not certify that cutover has completed.

Glide artifact publication defaults off through `GLIDE_RELEASES_ENABLED`. That gate reflects concrete dependencies found in the existing distribution setup, rather than a need for another local import:

1. Preserve Ploeg's public Go module source. Its [distribution decision](../apps/ploeg/docs/adrs/0004-forgejo-leading-home-github-mirror-module-path.md) names `github.com/webgrip/ploeg`. A monorepo push mirror alone cannot keep a module at the old repository root. Qualify an application subtree export, or deliberately migrate the module path in a later change.
2. Ensure the source URL advertised by each published artifact actually contains its built revision. Current [Ploeg artifact metadata](../apps/ploeg/docs/adrs/0020-published-artifacts-name-the-mirror-as-source.md) names the existing GitHub mirror. Publish from Glide only after this source mapping is true and verified.
3. Add Glide to Git-managed CI secret and Renovate repository selection. The inspected [secret reconciler](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/forgejo/forgejo-actions-secrets/app/forgejo-actions-secrets.cronjob.yaml) scopes the Open VSX token to `de-vloer`; that scope must include the new publisher. Preserve vault ownership of secret values.
   Add Glide to the OpenBao signing role through the [bootstrap configuration](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/security/openbao/bootstrap/config.sh), and confirm reconciliation and authorization from a Glide workflow. The current role still names only the old application repositories and infrastructure.
4. Dry-run both release trains, then inspect the actual publishing jobs and verify image/chart provenance. Set `GLIDE_RELEASES_ENABLED=true` only after both publishers' source and credential requirements are satisfied.
5. Change production desired state through its GitOps repository when a qualified artifact needs deploying. The inspected [Ploeg OCI source](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/ploeg/ploeg/app/ocirepository.yaml) uses its existing chart coordinate and pinned version/digest; it does not need a new chart name merely because the code moved.

The original import qualification used local estate checkouts. The later [readiness check](research/2026-09-12-cutover-readiness.json) verifies the current remote GitOps revision and selected live cluster resources. No production desired state was changed and no paid provider run was performed. Until cutover, the original repositories remain the remote release authorities.
