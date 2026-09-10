# Releases

Forgejo is the release authority. One `v<semver>` train carries everything this repository ships: the workbench image, the agent workspace image, the Helm chart and the VS Code extension. A release is a promotion of a tagged tree, never a rebuild from a branch, and every artifact of one version is meant to run with the others of that version.

## Trains and workflows

| Workflow | Trigger | What it does |
| --- | --- | --- |
| [on_pull_request.yml](../../.forgejo/workflows/on_pull_request.yml) | pull requests | Typecheck, tests, repository check, design and backlog checks, extension build/test/package, chart lint and render, cache-only builds of both Dockerfiles |
| [on_source_change.yml](../../.forgejo/workflows/on_source_change.yml) | push to `development` (rc prereleases) or `main` (stable) | The same checks, then semantic-release in the shared toolchain image: version, changelog, chart `version`/`appVersion`, root and extension `package.json`, the VSIX as a release asset, the `v<semver>` tag and the Forgejo release |
| [on_release_published.yml](../../.forgejo/workflows/on_release_published.yml) | the release event, or `workflow_dispatch` with a tag | Chart push to `oci://harbor.webgrip.dev/webgrip/charts/de-vloer`; both images built from the tag, gated and signed; the extension published to Open VSX and optionally the Marketplace; mirrors to the Forgejo registry and GitHub |
| [on_docs_change.yml](../../.forgejo/workflows/on_docs_change.yml) | changes under `docs/` | TechDocs build from the root `mkdocs.yml`, deployed under the `de-vloer` prefix from `development` |

Versions start from the existing `v0.2.0` tag. A `feat` commit cuts the next minor, a `fix` the next patch, and `docs`, `chore` and `ci` commits release nothing. Dependency bumps from Renovate are patches; a dependency's major is never the product's major. The commit-back is `chore(release): v<version> [skip ci]` and updates [CHANGELOG.md](../../CHANGELOG.md), the chart, both `package.json` files and their lockfiles ([.releaserc.cjs](../../.releaserc.cjs), [release-prepare.mjs](../../scripts/release-prepare.mjs)).

## Images

| Image | Source | Base |
| --- | --- | --- |
| `harbor.webgrip.dev/webgrip/de-vloer` | [Dockerfile](../../Dockerfile), target `app` | Docker Hardened Images Node runtime, Alpine: no shell, no package manager, non-root |
| `harbor.webgrip.dev/webgrip/de-vloer-agent` | [ops/agent/Dockerfile](../../ops/agent/Dockerfile) | Docker Hardened Images Node dev variant, Alpine, upgraded from the hardened feed, plus git, bash and the musl OpenCode binary fetched as an npm tarball; no npm install at run time |

Both are built for `linux/amd64` and `linux/arm64`, carry OCI labels and index annotations, and are pushed with BuildKit provenance and an SBOM. Base images are digest-pinned through `REGISTRY_DHI`-prefixed `ARG`s that Renovate updates via the annotated-ARG manager in [renovate.json](../../renovate.json). The OpenCode version is one Renovate group with the mise pin.

After the push, the [CVE budget gate](../../.forgejo/actions/cve-gate/action.yml) scans the digest with grype, subtracts reviewed OpenVEX statements from [ops/vex/statements](../../ops/vex/statements) and compares the rest with [ops/security/cve-budgets.yaml](../../ops/security/cve-budgets.yaml). Both images are in `enforce` mode at zero critical and zero high findings. The measured state at introduction was zero findings at every severity. Only then does cosign sign the digest and attest the CycloneDX SBOM, the VEX document and the budget verdict through OpenBao Transit; a signature therefore means "built by CI from the tag and within budget".

The chart defaults its workbench image and its agent image to the chart's `appVersion`, so a `HelmRelease` that pins the chart pins the images. Override `image.tag` or `workspaceImage` only for a deliberate skew.

## Extension

The VSIX is packaged twice from the same tagged tree: once during semantic-release as a gate that proves the extension still packages before the tag is cut, and once in the publish job, which attaches it to the Forgejo release and uploads it to Open VSX when `OVSX_PAT` is present and to the Visual Studio Marketplace when `VSCE_PAT` is present. The release itself carries no assets at creation time on purpose: the Gitea release plugin publishes an asset-bearing release as a draft that it then flips to published, and Forgejo reports that flip as a release `updated` event rather than `published` when the tag already exists, which is exactly what happened to `v0.3.0-rc.1`. Prereleases are published with the pre-release flag. Without either token the job records a notice and the release asset remains the distribution path; a sideloaded VSIX does not auto-update in VS Code.

Open VSX serves VSCodium, code-server, Theia, Gitpod and Cursor. Plain VS Code only installs from the Marketplace or a VSIX file, and Marketplace publishing requires a Microsoft account with an Azure DevOps token. Azure DevOps retires global personal access tokens on 2026-12-01; plan the replacement before then.

## Secrets and identities

Bridge-level Forgejo Actions secrets, provisioned from OpenBao by the estate's reconciler and never typed into a file:

| Secret | Scope | Purpose |
| --- | --- | --- |
| `WEBGRIP_CI_TOKEN`, `HARBOR_ROBOT_USER`, `HARBOR_ROBOT_TOKEN` | organization | Release commit-back and Harbor push |
| `TECHDOCS_S3_ACCESS_KEY_ID`, `TECHDOCS_S3_SECRET_ACCESS_KEY` | repository | Docs site deploy |
| `GHCR_USERNAME`, `GHCR_TOKEN` | repository | GitHub mirror, release and GHCR copy |
| `OVSX_PAT` | repository | Open VSX namespace `webgrip` |
| `VSCE_PAT` | repository, optional | Visual Studio Marketplace publisher `webgrip` |

Signing uses no secret: the job's OIDC token is exchanged at OpenBao for a short-lived Transit signing lease, which requires `webgrip/de-vloer` in the `cosign-signer` role's bound repositories in homelab-cluster.

## State of the prerequisites

Done on 2026-09-10: `webgrip/de-vloer` is in the OpenBao `cosign-signer` role ([homelab-cluster 0ae3e99a](https://forgejo.webgrip.dev/webgrip/homelab-cluster/commit/0ae3e99a)); the OpenBao config CronJob applies it within minutes. `WEBGRIP_CI_TOKEN`, `HARBOR_ROBOT_*`, `GHCR_*`, `GH_RELEASE_TOKEN` and `TECHDOCS_S3_*` are organization-wide secrets and need no repository entry. The first push of `development` with this pipeline is the qualification run; its outcome belongs in [validation](../validation.md).

Deferred, because each needs an account only a person can create: the `webgrip` namespace and `OVSX_PAT` on Open VSX, and `VSCE_PAT` for the Marketplace. Neither exists on 2026-09-10, so the publish job records a notice and the VSIX remains a Forgejo release asset. When the tokens exist, put them in OpenBao and add an External Secret plus a `put_repo_secret` line for `de-vloer` in the `forgejo-actions-secrets` CronJob.

Deferred for the same reason: the GitHub mirror. `github.com/webgrip/de-vloer` does not exist, so the mirror job force-pushed nothing and failed on the Releases API in the first full chain. Its `enabled` input is `false` until someone creates that repository; the GHCR image and chart copies are org-scoped and already publish without it. Flip the input back to `true` in the same change that creates the repository.

Still to do for the in-cluster workbench: an `OCIRepository` for `oci://harbor.webgrip.dev/webgrip/charts/de-vloer` with tag and Harbor digest, a `HelmRelease` with `mode: live`, the workspace namespace, egress and credentials, and, for the sandbox provisioner, the agent-sandbox controller and the warm pool from [ops/cluster/agent-sandbox](../../ops/cluster/agent-sandbox/README.md). That deployment is the in-cluster workbench described in [live operation](live.md).
