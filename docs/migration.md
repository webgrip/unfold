---
type: explanation
audience: [owner, contributor]
owner: unfold
last_verified: 2026-09-23
verified_by: "Repository claims checked: Helm pins in apps/*/mise.toml, tag formats in apps/*/.releaserc.cjs, package paths in on_source_change.yml, scripts/verify-import.py and the linked records; Forgejo runs, remote refs and homelab-cluster manifests were not re-checked"
---

# Unfold migration

Unfold brought Vloer and Ploeg into one repository on `development`. Since 2026-10-03 Ploeg lives in its own repository again, and Unfold pins it ([Ploeg moves out](#ploeg-moves-out)). The original repositories remain available. This migration changes the source layout and developer workflow; deployment coordinates and runtime behavior retain their application scope.

## What moved

| Before | Unfold |
| --- | --- |
| `de-vloer/` | [apps/vloer](../apps/vloer/) |
| `ploeg/` | [apps/ploeg](../apps/ploeg/) |
| Vloer's shared product model and generated views | [docs/domain](domain/overview.md) |
| System explanation and diagrams | [docs/landscape](landscape/index.md) |
| Cross-application demo and managed setup | [docs/workflows](workflows/local-demo.md) |
| Documentation maintenance | [One shared policy](documentation.md) |

Service API schemas, application architecture, operating details and existing ADRs stay with the producing application. Old shared-document paths contain short redirects or a symbolic link to the one structured source. The [complete path mapping](research/2026-09-12-glide-document-paths.json) records these moves.

The import preserves 396 Vloer files and 392 Ploeg files, including the audited working trees. Original commit objects are retained. Separate snapshot and directory-move commits make file history traceable with `git log --follow`. Tags become `vloer-v…` and `ploeg-v…`; non-version tags keep the same application prefix. Release-channel notes use the same namespace. The [import manifest](research/2026-09-12-glide-import.json) records source revisions, tag objects, file modes and SHA-256 digests. Run `mise exec -- python3 scripts/verify-import.py` to verify the immutable import against that manifest.

A final comparison with the original remotes found Ploeg's existing [rc.7 release commit](https://forgejo.webgrip.dev/webgrip/unfold/commit/05b93bb4b7c063cb0ca733e4bbf3d699c5044af4) beyond the audited local checkout. Its changelog and chart metadata are merged into Unfold, with the original commit retained as a parent. The immutable import manifest continues to describe the audited snapshots.

The earlier [proposal](migration-proposal.md) remains as history. The [system decision](adr/adr-0001-unfold-contains-independent-applications.md) records the owner-approved scope.

## Execution boundary

[The comparison](research/2026-09-12-execution-boundary.md) exercises standalone Vloer and Vloer delegated by real Ploeg HTTP and PostgreSQL. The existing engines remain separate. The same Vloer runtime interface already serves both Vloer modes, while Ploeg's unattended worker owns different process and lease responsibilities. A common package would add a new boundary without removing demonstrated duplication.

## Checks and release preparation

Run `mise run setup` and `mise run verify` from the root. CI checks both applications for every push to `development` and every pull request, including changes to shared documentation. This deliberately favors dependable coverage over path-filter complexity at the current repository size.

The [source workflow](../.forgejo/workflows/on_source_change.yml) uses separate semantic-release package paths and tag formats. The [release publication workflow](../.forgejo/workflows/on_release_published.yml) routes each application tag to its own jobs. Ploeg retains its zero-major release-candidate guard. Application images, charts, the extension ID and `github.com/webgrip/ploeg` are unchanged. Helm stays scoped: Vloer uses 4.2.4; Ploeg's golden renders use 4.2.3. The [CI guide](operations/ci.md) covers all event entry points, shared checks and manual recovery.

The first [actual release preview](https://forgejo.webgrip.dev/webgrip/glide/actions/runs/5) exposed a missing remote `main` baseline (`ERELEASEBRANCHES`). The shared preset needs a normal release branch alongside `development` prereleases. `main` is reserved at the initial Unfold boundary commit; source work and automatic prereleases remain on `development`. CI checks this prerequisite and the release-isolation suite exercises semantic-release's branch resolver.

The combined [documentation build](../scripts/docs.py) assembles the maintained Markdown files for TechDocs and Zensical. The [publishing guide](operations/docs-publishing.md) covers the human site, machine-readable output and legacy URLs. It checks structured-source generation and repository links, then excludes dated research and design/decision history from its local search index. These exclusions do not configure an external crawler or Backstage search ingestion.

The [local qualification record](research/evidence/glide-2026-09-12/verification.json) records 211 workbench tests, 41 extension tests, all Go gates, both execution modes, chart snapshots, three AMD64 container builds and strict documentation checks. `mise run release-check` repeats release isolation and policy checks in the pinned image without network access or publication.

## Source publication

[Unfold is published on Forgejo](https://forgejo.webgrip.dev/webgrip/glide), with `development` as the default branch. The owner created the repository with public visibility. The complete source history, 70 namespaced tags and 67 release-channel notes were pushed together over SSH; all 138 remote refs match their local objects. A fresh clone from Forgejo passes the immutable import verifier.

The [first CI run](https://forgejo.webgrip.dev/webgrip/glide/actions/runs/1) passed application verification, documentation checks, container builds and release-policy tests at commit `2e03f18268794cface5acbc044f29592973461e2`. Both release jobs were explicitly skipped. The [publication record](research/evidence/glide-2026-09-12/publication.json) records the exact commit, run, job outcomes and ref verification separately from local qualification.

The earlier repository-creation blocker is resolved by the owner's creation of the repository. No new token or permission was created by the agent. Artifact releases still require the distribution work below.

## Distribution cutover remains separate

Follow the [first cutover playbook](operations/first-cutover.md) for preparation gates, release preview, per-destination checks, a bounded live pilot and rollback. The [12 September readiness record](research/2026-09-12-cutover-readiness.json) includes a fresh cluster and GitOps check; it does not certify that cutover has completed.

Unfold artifact publication defaults off through `UNFOLD_RELEASES_ENABLED`. That gate reflects concrete dependencies found in the existing distribution setup, rather than a need for another local import:

1. Preserve Ploeg's public Go module source. Its [distribution decision](../apps/ploeg/docs/adrs/0004-forgejo-leading-home-github-mirror-module-path.md) names `github.com/webgrip/ploeg`. A monorepo push mirror alone cannot keep a module at the old repository root. Qualify an application subtree export, or deliberately migrate the module path in a later change.
2. Ensure the source URL advertised by each published artifact actually contains its built revision. Current [Ploeg artifact metadata](../apps/ploeg/docs/adrs/0020-published-artifacts-name-the-mirror-as-source.md) names the existing GitHub mirror. Publish from Unfold only after this source mapping is true and verified.
3. Add Unfold to Git-managed CI secret and Renovate repository selection. The [secret reconciler](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/forgejo/forgejo-actions-secrets/app/forgejo-actions-secrets.cronjob.yaml) now scopes the Open VSX token to `unfold`, and the [OpenBao bootstrap configuration](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/security/openbao/bootstrap/config.sh) lists `webgrip/glide` in the signing role. The [release preview](operations/first-cutover.md) preflight confirms both from an Unfold workflow; a manifest edit alone proves neither. Preserve vault ownership of secret values.
4. Dry-run both release trains, then inspect the actual publishing jobs and verify image/chart provenance. Set `UNFOLD_RELEASES_ENABLED=true` only after both publishers' source and credential requirements are satisfied.
5. Change production desired state through its GitOps repository when a qualified artifact needs deploying. The inspected [Ploeg OCI source](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/ploeg/ploeg/app/ocirepository.yaml) uses its existing chart coordinate and pinned version/digest; it does not need a new chart name merely because the code moved.

The original import qualification used local estate checkouts. The later [readiness check](research/2026-09-12-cutover-readiness.json) verifies the current remote GitOps revision and selected live cluster resources. No production desired state was changed and no paid provider run was performed. Until cutover, the original repositories remain the remote release authorities.

## Ploeg moves out

On 2026-10-03 Ploeg moved to [github.com/ploeg-hq/ploeg](https://github.com/ploeg-hq/ploeg) ([ADR-0019](adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-vloer.md)). Its fresh root commit `88cce444` holds the `apps/ploeg` tree of Unfold `9c1d53f` under the new module `github.com/ploeg-hq/ploeg`, and its releases start at `v0.1.0`. Unfold pins Ploeg as a Git submodule at `apps/ploeg`, so the paths above still resolve. Unfold's history up to that commit keeps Ploeg's earlier source, and the imported `ploeg-v…` tags and the versions Unfold published for Ploeg stay as history. Changes to Ploeg land upstream first; [ploeg-hq/ploeg#45](https://github.com/ploeg-hq/ploeg/issues/45) tracks the Unfold changes made after the extraction.
