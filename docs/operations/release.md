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

The VSIX is packaged twice from the same tagged tree: once during semantic-release, attached to the Forgejo release, and once in the publish job, which uploads it to Open VSX when `OVSX_PAT` is present and to the Visual Studio Marketplace when `VSCE_PAT` is present. Prereleases are published with the pre-release flag. Without either token the job records a notice and the release asset remains the distribution path; a sideloaded VSIX does not auto-update in VS Code.

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

## Before the first release

1. Add `webgrip/de-vloer` to the OpenBao `cosign-signer` role and provision the repository secrets above through the `forgejo-actions-secrets` reconciler in homelab-cluster.
2. Create the `webgrip` namespace on Open VSX and verify the token with `npx ovsx verify-pat webgrip`; do the same on the Marketplace with `npx @vscode/vsce verify-pat webgrip` if it is used.
3. Push `development`; the first `feat` cuts `v0.3.0-rc.1`, and the release workflow proves the chain end to end before any consumer pins it.
4. In homelab-cluster, add an `OCIRepository` for `oci://harbor.webgrip.dev/webgrip/charts/de-vloer` with tag and Harbor digest, and a `HelmRelease` that sets `mode: live`, the workspace namespace, egress and credentials. That deployment is the in-cluster workbench described in [live operation](live.md).
