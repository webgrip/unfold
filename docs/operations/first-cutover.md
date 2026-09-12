# First Glide release and live test

Use this playbook to transfer release authority to Glide, publish the first qualified application versions, and test them in a controlled environment. The source migration is complete. Release cutover is not yet qualified: keep `GLIDE_RELEASES_ENABLED` unset or `false` until the preparation gates below pass.

The [dated readiness record](../research/2026-09-12-cutover-readiness.json) separates observed results from missing evidence. Copy the [execution record](cutover-record.example.json) for your test and replace its empty fields as each stage completes. Keep credentials, cookies, model prompts containing private data and database contents out of that record. A stage passes only when its evidence is attached; a skipped job is not a pass.

This procedure does not enable general availability. Vloer and Ploeg keep independent versions. Ploeg remains on `0.x.y-rc.N`. A release is complete when its required artifacts are verified; a rollout is complete when the selected environment passes the live checks. These are separate checkpoints.

## 1. Choose the test and capture the starting state

Use one operator, one registered test repository, one concurrent session and an explicitly approved model budget. The current GitOps configuration sets a per-session ceiling of USD 0.25; confirm the effective setting and model access before using it. An in-flight request can settle after cancellation, so the configured budget is not proof of an exact final charge. Do not enable unattended dispatch for this first interactive test.

Choose either an isolated pilot with a separate database and Vloer volume, or an upgrade of the existing installation. An isolated pilot can qualify the new application pair without proving an upgrade of existing data. Record which claim the test is meant to establish. The existing Vloer contract requires a registered repository and crew; use a disposable repository or an approved fixture branch and review the resulting change without publishing it.

From Glide, record the source revision and check that the checkout is clean:

```sh
git status --short
git rev-parse HEAD
git ls-remote origin refs/heads/development
git fetch origin '+refs/notes/*:refs/notes/*'
mise run setup
mise run verify
mise run release-check
```

Record the matching successful run in [Glide Actions](https://forgejo.webgrip.dev/webgrip/glide/actions). Local verification includes deterministic standalone and managed execution; it does not exercise a paid model or qualify ARM64 publication.

From an up-to-date [homelab-cluster checkout](https://forgejo.webgrip.dev/webgrip/homelab-cluster), confirm the intended context before these read-only checks:

```sh
mise exec -- kubectl config current-context
mise exec -- kubectl -n flux-system get gitrepository flux-system \
  -o 'custom-columns=NAME:.metadata.name,REVISION:.status.artifact.revision'
mise exec -- kubectl -n ploeg get helmrelease,ocirepository
mise exec -- kubectl -n ploeg get deployment de-vloer ploeg \
  -o 'custom-columns=NAME:.metadata.name,READY:.status.availableReplicas,IMAGE:.spec.template.spec.containers[*].image'
```

Record the GitOps commit, both chart tags and digests, application image digests, Vloer workspace-image digest, extension version, configuration revision and persistent-volume identifiers. Get the workspace-image setting from the [Vloer HelmRelease](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/ploeg/de-vloer/app/helmrelease.yaml). These recorded values are the rollback baseline; do not copy a dated version from this playbook.

## 2. Close the release blockers

Complete this table before opening the gate. These are preparation tasks, not claims that the current workflows already support the desired result.

| Gate | Required change or check | Evidence that closes it |
| --- | --- | --- |
| One release authority | Freeze source changes and release-producing automation in the [old Vloer](https://forgejo.webgrip.dev/webgrip/de-vloer/actions) and [old Ploeg](https://forgejo.webgrip.dev/webgrip/ploeg/actions) repositories. Check for newer commits and tags before freezing. Preserve the repositories and their existing tags. | Recorded old tips and highest published versions; no release job still running or able to race Glide. Import any approved intervening changes and rerun qualification. |
| Release baseline | Keep the remote `main` baseline required by the shared semantic-release branch configuration. Work stays on `development`; the current workflows do not release from `main`. | The [release-policy job](../../.forgejo/workflows/checks.yml) verifies the remote branch exists, and the preview resolves both branch types. Do not promote or remove the baseline as part of the pilot. |
| Correct GitHub source | Replace or adapt the application publishers' GitHub distribution calls. Their shared distributor explicitly checks out the old repository named by `repo`, mirrors whole refs, and assumes its release conventions. Passing a namespaced chart `ref` does not change that source checkout. | A rehearsal proves the exported source is from the selected Glide tag, and the release notes come from Glide. No blanket monorepo mirror into an application package repository. |
| Ploeg module compatibility | Qualify a package export that retains `github.com/webgrip/ploeg`, a root `go.mod`, ordinary `v<version>` tags and all required files. Keep the Glide-to-export commit mapping. | Download the new module version in a fresh Go module/cache and compare its files with `apps/ploeg` at the release revision. Existing published Go versions still resolve. See [distribution scope](../../apps/ploeg/docs/adrs/0029-qualify-glide-before-changing-distribution.md). |
| Artifact source metadata | Update both applications' source labels, index annotations and matching verification expectations to a source URL that contains the built revision. A subtree export has a different commit ID from Glide. | Every platform's labels and index metadata resolve to the recorded source revision. An export, if used, has an explicit mapping rather than a false revision claim. |
| Signing authorization | Add `webgrip/glide` to the appropriate OpenBao Forgejo signing role through the [bootstrap configuration](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/security/openbao/bootstrap/config.sh), retaining the event/ref restrictions. | Reconciliation is confirmed and an OIDC check from a Glide workflow can use the intended signing role. A manifest edit alone does not prove that the role was updated. |
| CI credentials | Verify `WEBGRIP_CI_TOKEN`, Harbor push/pull credentials and GitHub distribution credentials. Extend the repo-scoped Open VSX bridge to Glide in the [secret reconciler](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/forgejo/forgejo-actions-secrets/app/forgejo-actions-secrets.cronjob.yaml). | Bridge success for Glide plus actual identity/access checks at each required destination. `ExternalSecret` readiness alone does not prove a Forgejo repo secret exists or can publish. |
| Dependency maintenance | Add Glide to the [Renovate repository list](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/renovate/renovate-operator/jobs/webgrip-forgejo.yaml), retiring old repository updates when their write freeze begins. | A Renovate run discovers Glide. The [deployment rules](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/.renovaterc.json5) still require review for application chart and image updates. |
| Signature propagation | Make Ploeg's mirror jobs wait for Harbor signing. Qualify Vloer's agent-image signature/attestation copy to GHCR; its current copy step checks the image digest only. | Each required image destination verifies signatures and attestations after copying. Shared distributors can warn about missing accessories and still succeed; inspect the destination itself. |
| Retry behavior | Rehearse recovery from an existing image/chart and a failed mirror or extension upload. | Retrying the same tag finishes missing artifacts without replacing an existing version, changing its digest or creating another application release. |
| Release preview | Run the preview in the next section after all source changes are present. | Both applications report the intended version/channel and notes, or an explained no-release result, for the recorded source revision. |

Credential values remain in OpenBao and the existing bridges. The [secrets model](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/docs/techdocs/docs/adr/adr-0055-one-secrets-model-six-levels.md) defines the provisioning path. If a new provided value is needed, a person seeds the vault through the approved login procedure; record the secret reference and verification result, never the value. Marketplace publishing is optional for this prerelease test and must be recorded as intentionally excluded.

## 3. Preview the versions while publishing is disabled

Open [Glide Actions](https://forgejo.webgrip.dev/webgrip/glide/actions), select **Preview Glide releases**, choose `development`, and dispatch it. The [preview workflow](../../.forgejo/workflows/release-preview.yml) invokes the same pinned toolchain and application configs as the release jobs with `dry-run: 'true'`. It has no artifact publisher or deployment step and does not require opening `GLIDE_RELEASES_ENABLED`.

Record each matrix job's source SHA, last recognized application tag, predicted next version, channel and release notes. Check that Vloer reads `vloer-v…` history and Ploeg reads `ploeg-v…` history. Imported histories must not be mistaken for a brand-new package. Check the proposed versions against every existing registry and extension destination; do not reuse a version already published with different contents.

The [first successful preview](https://forgejo.webgrip.dev/webgrip/glide/actions/runs/7) recognized Vloer `rc.16` and Ploeg `rc.7` at source `d39a180`, with no release-worthy changes for either application. It proves configuration, branch/history resolution and push permission for that revision; it does not predict a release for a later change.

The preview can legitimately report no release. Documentation, test and maintenance commits do not promise a version bump. Do not invent a feature or hand-edit versions merely to get a tag. If a first release is still required, land the actual reviewed release-related fix within the affected application scope, then preview again. A root workflow change alone is not selected by the current per-application commit filter.

A [semantic-release dry run](https://semantic-release.org/usage/configuration/#dryrun) omits prepare, publish and success hooks, but still checks repository push permission. It therefore does not prove the version-preparation scripts, image build, chart upload, signing, package exports or marketplaces work. Existing local checks cover parts of that path; the first publication must supply the remaining evidence. Changing the source after a preview invalidates the preview.

## 4. Establish recovery before touching existing data

For an existing-installation upgrade, finish or explicitly pause/cancel active sessions and managed Runs, then confirm that remote work has stopped and inference authorization is resolved or conservatively held. Stop new admission during the rollout. Do not change a managed session into standalone mode to bypass an unavailable Ploeg service.

Verify a recent PostgreSQL backup and restore it into an isolated database. Verify a consistent backup of Vloer's persisted state and the configuration needed to read it, using the storage system's approved backup procedure. Preserve the existing at-rest keys; generating new credentials is not a restore. Review [Ploeg migrations](../../apps/ploeg/pkg/store/migrations/) and [Vloer storage](../../apps/vloer/src/store.ts) between the baseline and candidate before deciding whether the old binaries can read the new state.

The 12 September audit saw completed Ploeg backups but an unhealthy `cnpg-disaster-recovery` cluster. That observation does not establish a tested restore, and does not mean the healthy primary database has failed. An upgrade of existing data remains blocked until a fresh restore exercise succeeds or an independently verified recovery path is recorded. An isolated pilot must use separate state and must not claim to have closed this upgrade gate.

## 5. Publish the first application releases

With preparation evidence complete and the old release authorities frozen, set the repository variable `GLIDE_RELEASES_ENABLED=true` in [Glide repository settings](https://forgejo.webgrip.dev/webgrip/glide/settings). Record who changed it and when. Coordinate a quiet `development` window so the source cannot advance unnoticed.

The [release jobs](../../.forgejo/workflows/checks.yml) run only for a **push to `development`**. Enabling the variable does not start them; manually dispatching the checks workflow also does not start them. Push the reviewed release-worthy change, or, if the exact qualified tip already contains eligible changes, use one documented `chore: start qualified Glide release cutover` empty commit to trigger a fresh push. An empty commit triggers evaluation but does not itself earn a version bump. Fetch the resulting tip, wait for its checks and retain its run link.

The Vloer version job runs before Ploeg's to avoid competing manifest commits. Each release can trigger its own publication workflow while the other application is still being evaluated. Follow both publication runs through completion; source checks, tag creation and the release page are not the completion criterion.

Inspect [Glide releases](https://forgejo.webgrip.dev/webgrip/glide/releases). Record each full tag and its resolved commit after manifest preparation. Those release commits can differ from the initially tested source tip. Ploeg must remain a zero-major release candidate and prereleases must not move `latest`.

Do not open the gate if the preparation table remains incomplete. Publishing into real registries is the first irreversible distribution step; the procedure below recovers partial publication without deleting or recycling a version.

## 6. Verify every required artifact

The [Vloer publisher](../../.forgejo/workflows/publish-vloer.yml) and [Ploeg publisher](../../.forgejo/workflows/publish-ploeg.yml) own the configured destinations. The table records the current intended set; recheck it when those workflows change.

| Artifact | Required evidence for the first release |
| --- | --- |
| Vloer workbench image | Harbor, Forgejo and GHCR: matching OCI index digests, AMD64 and ARM64 manifests, correct version/source labels, signature and attested SBOM verification. |
| Vloer agent image | Harbor and GHCR: the same checks. Forgejo agent publication is not currently configured. |
| Ploeg daemon image | Harbor, Forgejo and GHCR: the same checks. Its separate unattended `agent-runner` dependency is not built by Glide. |
| Both Helm charts | Harbor, Forgejo and GHCR: pull the selected version, check `version`/`appVersion`, dependencies and rendered image references. Record each registry's digest. Existing workflows can package separately, so do not assume identical archive digests across registries. |
| Vloer extension | VSIX and matching checksum attached to the Glide release; package verification succeeds; install that exact VSIX in the editor. Verify Open VSX listing and download if it is a required destination. Marketplace is intentionally excluded for these prerelease versions. |
| Ploeg Go module | The compatibility export at the new ordinary version tag installs through `github.com/webgrip/ploeg` in a fresh consumer. Record the export revision and file comparison. |
| npm and Composer | No publishable package is currently configured. Both application npm manifests are private; no Composer manifest was found. Record these as out of scope. Adding an SDK or PHP package requires its own package identity, version policy, publisher and install test. |
| Documentation | The strict combined site builds and the playbook is accessible in Forgejo. A remote TechDocs deployment and `docs.webgrip.dev/glide/` reachability require separate evidence; a `site_url` is not a deployment. |

For OCI images, an example read-only digest inspection is:

```sh
mise exec -- docker buildx imagetools inspect "$CUTOVER_IMAGE" \
  --format '{{ .Manifest.Digest }}'
mise exec -- docker buildx imagetools inspect "$CUTOVER_IMAGE" --raw
```

Set `CUTOVER_IMAGE` to a recorded image reference; authenticate through the existing credential procedure where needed. Use the trusted OpenBao signing public key and the estate's configured verification policy for signatures. A signature object merely existing is not cryptographic verification. Check intended public destinations from a clean client without publisher credentials as well.

Install and exercise the published binaries on the architecture selected for the pilot. AMD64 cache builds do not qualify ARM64 runtime behavior. If ARM64 is advertised but untested, record that gap and keep it out of the first deployment claim.

Record destination failures individually. Stop before rollout if a required artifact, signature, package export or install check is missing, even if the overall publisher is green.

## 7. Change the pilot through GitOps

Prepare and review the desired-state change in [homelab-cluster](https://forgejo.webgrip.dev/webgrip/homelab-cluster). Pin the qualified artifacts together:

| Application | Values that must agree |
| --- | --- |
| Ploeg | [OCIRepository](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/ploeg/ploeg/app/ocirepository.yaml) chart tag and digest; [HelmRelease](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/ploeg/ploeg/app/helmrelease.yaml) daemon image tag and digest. |
| Vloer | [OCIRepository](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/ploeg/de-vloer/app/ocirepository.yaml) chart tag and digest; [HelmRelease](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/ploeg/de-vloer/app/helmrelease.yaml) workbench image tag/digest and workspace image tag/digest. |

Keep existing registry, chart and package names. A repository move does not require changing them. Run that repository's render/validation gate and inspect the rendered deployment before committing. Let Flux reconcile; do not use an imperative Helm upgrade or overwrite the deployment with `kubectl`.

Also review application work targets. Existing Vloer repository URLs and Ploeg tracker routes still point at the old repositories. For a pilot targeting Glide, register the Glide URL and `development` branch explicitly, update the matching Ploeg target, and run verification from the correct application directory or Glide root. The old Vloer command `node --test examples/order-service/test/order.test.js` needs the `apps/vloer/` path when run from Glide. Do not silently retarget existing queued work or assume changing the image changes its work repository.

For an existing-installation upgrade, qualify the intermediate pair before sequencing one application ahead of the other. If compatibility with the old peer is not demonstrated, keep admission closed while upgrading the pair and open it only after both are ready. Unattended executors and tracker-driven dispatch stay paused for the interactive pilot.

Use read-only rollout observations:

```sh
mise exec -- kubectl -n ploeg get helmrelease,ocirepository
mise exec -- kubectl -n ploeg rollout status deployment/ploeg --timeout=180s
mise exec -- kubectl -n ploeg rollout status deployment/de-vloer --timeout=180s
mise exec -- kubectl -n ploeg get deployment de-vloer ploeg \
  -o 'custom-columns=NAME:.metadata.name,READY:.status.availableReplicas,IMAGE:.spec.template.spec.containers[*].image'
```

For an isolated pilot, substitute its namespace and deployment names. Compare observed image digests and reconciled GitOps revision with the record. A ready HelmRelease with the old image still running fails the test.

## 8. Run the first real work session

Follow [managed setup and recovery](../workflows/managed-execution.md) and the [live operation guide](../../apps/vloer/docs/operations/live.md). Keep the first task small: one intentional fixture change, one real verification command, no automatic merge or publication.

| Check | Pass condition |
| --- | --- |
| Identity and readiness | The intended user signs in through the real login flow. Registered repository, model, crew and spending limit are correct. Authenticated health passes; public `/healthz` alone does not prove provider access. |
| Standalone independence | In a separate standalone configuration with no Ploeg connection or execution binding, Vloer completes the bounded fixture with its configured live harness/provider. Never test this by removing authority from a managed session. |
| Managed authority | Starting the managed session creates exactly one corresponding Ploeg Work Item/Shift/Run. The repository, actor, team and budget match. |
| Actual execution | The workspace clones the intended Glide or fixture revision, the configured model is called, and the recorded verification command really runs. Evidence identifies the candidate and the test output. |
| Disconnect and resume | Close and reopen the browser while the session runs; the same session and durable events remain. There is no second start or duplicate paid execution. |
| Pause and cancel | Exercise pause/resume and cancellation in separately budgeted small sessions. Verify acknowledged stop intent, remote state and settlement; a button changing state is not proof that an in-flight request ended. |
| Authority loss | In the isolated pilot, test a temporary Ploeg connectivity failure through the approved environment controls. Managed execution must not silently become standalone or retry uncertain paid work. |
| Restart recovery | In the isolated pilot, perform the reviewed restart drill. The session retains evidence and requires explicit recovery where execution is uncertain. Do not restart the existing installation during paid work merely to test this. |
| Accounting and cleanup | Gateway usage and Ploeg/Vloer records reconcile after settlement. No unexpected active workspaces, usable abandoned credentials or duplicate Runs remain. Retained evidence is readable. |
| Editor and review | Install the exact released extension, connect as the intended user, and inspect the same session and candidate. Review does not imply that a change was published. |

Give each paid session its own approved limit and record the total allowance before starting. Zero-cost fixtures from `mise run verify` remain useful evidence, but are labelled deterministic and cannot satisfy the live model checks. The delegated candidate path currently has no enabled live publisher executor; do not make automatic PR creation part of its acceptance criterion.

## 9. Stop or roll back

| Failure | Response |
| --- | --- |
| Preview, source checks or prerequisite fails | Keep Glide publishing disabled. Correct the issue, rerun the affected qualification and capture a fresh preview. |
| One application publishes and the other fails | Leave the successful artifacts intact. Keep admission closed and complete the failed application or return to the baseline pair. Do not assume the pair was released atomically. |
| An image exists but a mirror, signature or extension upload fails | Use the corresponding publication workflow's manual dispatch with the existing full tag selected as both workflow ref and `tag` input. Inspect existing artifacts first; verify their contents before any skip-existing path. Rerun the same version only. |
| A published version has wrong contents | Stop deployment, close release automation and document the defective version. Fix forward with a new version; do not move the tag or overwrite immutable packages. |
| Pilot rollout or work fails | Stop new admission, explicitly stop active work and settle or retain uncertain authorizations. Revert the scoped GitOps rollout to the recorded chart/image/configuration pins and let Flux reconcile. Verify observed digests and health. |
| Old binaries cannot read migrated state | Use the tested coordinated database/volume restore procedure with admission closed, or fix forward. A Git revert is not a database rollback. Do not restore one service's state while leaving inconsistent peer state active. |

Setting `GLIDE_RELEASES_ENABLED=false` prevents future eligible jobs; it does not cancel an already running job, retract artifacts, roll back a deployment or stop a paid session. Inspect [Actions](https://forgejo.webgrip.dev/webgrip/glide/actions) and stop the relevant active publication runs if needed. Do not re-enable the old release authorities after a Glide publication without reconciling versions, source and channel history first.

## 10. Close the test

The execution record must contain the exact source/release/export revisions, workflow links, required artifact outcomes and digests, GitOps before/after commits, recovery evidence, session IDs, actual spend and the operator's result. Use `passed`, `failed`, `not_run` or `excluded` with a reason; never translate a missing observation into a pass.

Keep unattended work disabled until its separate admission, worker, accounting and delivery tests pass. Keep compatibility mirrors as distribution outputs and direct new source changes to Glide. Update the [migration record](../migration.md) only when the release authority has actually changed. Record any follow-up work in the tracker rather than leaving an undocumented exception in this playbook.
