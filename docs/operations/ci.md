# CI and release workflows

Glide uses Webgrip's event-named entry points. The executable definitions live in the root [workflow directory](../../.forgejo/workflows/). Application-local workflow links point there, so existing application guides still lead to the active configuration.

| Entry point | Trigger | Responsibility |
| --- | --- | --- |
| [on_source_change.yml](../../.forgejo/workflows/on_source_change.yml) | Push to `development`; manual validation | Validate both applications, container build contexts and release policy. An enabled push can then release Vloer followed by Ploeg. |
| [on_pull_request.yml](../../.forgejo/workflows/on_pull_request.yml) | Pull request; manual validation | Run the same application and release-policy gates without release credentials or versioning jobs. |
| [on_docs_change.yml](../../.forgejo/workflows/on_docs_change.yml) | Documentation or docs-tooling changes on `development`; manual validation | Validate the combined documentation, then publish Zensical and Markdown when the docs gate is enabled. |
| [on_release_preview.yml](../../.forgejo/workflows/on_release_preview.yml) | Manual, on `development` | Check the mirror, credential access and Glide signing identity; preview each application's version with `dry-run: 'true'`. |
| [on_release_published.yml](../../.forgejo/workflows/on_release_published.yml) | Published release; manual retry for an exact tag | Route `vloer-v…` and `ploeg-v…` to their own artifact jobs. |

## Shared checks and separate versions

Source changes and pull requests use the same local [verification action](../../.forgejo/actions/verify/action.yml) and [release-policy action](../../.forgejo/actions/release-policy/action.yml). Each caller checks out the repository before invoking a local action. The existing application gates remain in [mise verification](../../scripts/verify.mjs), including generated docs, Helm goldens and deterministic integration. The dedicated docs workflow gives documentation changes their own result; the source gate still validates the complete tree.

Verification runs independent gate groups in parallel: Vloer, the Vloer extension, Ploeg, Helm, release tests, integration and docs. Gates inside a group stay sequential. Each gate's output is buffered and printed in group order with its result and duration, followed by a summary. The first failure cancels the running gates, skips the pending ones and names the failed gate. The Ploeg database tests and the integration run use distinct embedded PostgreSQL ports derived from `PLOEG_TEST_PG_PORT_OFFSET`. A run uses ports 55439 to 55444 plus the offset, so checkouts that verify at the same time need offsets at least 6 apart. The verification action restores the Go module and build caches and the npm download cache, and sets `GOFLAGS=-count=1` so CI never reports a cached test result.

Releases use the pinned Webgrip semantic-release monorepo composite, with [Vloer's configuration](../../apps/vloer/.releaserc.cjs) and [Ploeg's configuration](../../apps/ploeg/.releaserc.cjs). There is no umbrella Glide version. Both source checks and release-policy checks must pass before versioning. The versioning jobs run sequentially because they push preparation commits to the same branch.

`GLIDE_RELEASES_ENABLED` must equal `true` to version, publish or mirror release-channel notes to GitHub. A manual source-validation run never releases or mirrors notes, even with the gate enabled. CI runs the import verifier with `GLIDE_REQUIRE_IMPORT_NOTES=true`, so missing notes fail the source gate instead of being skipped as they are locally. Keep the `main` release baseline required by the shared preset; `development` remains trunk and the only automatic release branch. Use the [first cutover playbook](first-cutover.md) before enabling publication.

## Publication and recovery

The release entry point keeps each application's job dependencies separate. Ploeg accepts only zero-major release candidates. A manual publication retry requires the selected workflow ref to be the same tag as its `tag` input. Publication runs for the same tag are serialized; a newer invocation does not cancel a partially completed publication.

Application publication uses normal, explicitly gated jobs and the existing pinned build/sign composites. This avoids the [Forgejo reusable-workflow flattening trap](https://forgejo.webgrip.dev/webgrip/workflows/src/branch/main/AGENTS.md). Ploeg distribution also requires the signing job's completion output. The [artifact guide](artifacts.md) defines source mirroring, package paths, cryptographic verification and retry behavior.

The naming and separation follow the original [Vloer entry points](https://forgejo.webgrip.dev/webgrip/de-vloer/src/branch/development/.forgejo/workflows/) and the [infrastructure monorepo](https://forgejo.webgrip.dev/webgrip/infrastructure/src/branch/main/.forgejo/workflows/). Forgejo's [workflow reference](https://forgejo.org/docs/latest/user/actions/reference/) describes the event, dependency and composite-action syntax. Shared actions and reusable workflows retain their existing pinned versions; Renovate owns updates.

## Validation and remaining qualification

Run `mise run verify` and `mise run release-check`. The latter executes [release-isolation tests](../../scripts/release-isolation.test.cjs), [workflow routing tests](../../scripts/workflow-policy.test.cjs) and [Ploeg's release-policy tests](../../apps/ploeg/scripts/release-policy.test.cjs) in the pinned release container. They cover cross-application tag rejection, manual ref matching, disabled publication, signing prerequisites and dependency integrity.

The [documentation publisher](docs-publishing.md) has its own `GLIDE_DOCS_PUBLISH_ENABLED` gate and dedicated Garage bucket. It uses the shared TechDocs generation and Zensical deployment workflows at `v2.7.1`. Its scoped credentials cannot publish application packages. Source exports, application destination permissions and complete artifact delivery still require the evidence listed in the [cutover preparation gates](first-cutover.md#2-close-the-release-blockers). Passing workflow tests or a release preview does not close those gates.
