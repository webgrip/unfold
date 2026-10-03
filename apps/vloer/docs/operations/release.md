# Release De Vloer

Forgejo coordinates one version for the workbench image, workspace image, Helm chart and editor extension. Source checks run before a release tag is created; publication jobs consume that tag. A tag or green source job alone does not prove that every artifact was published.

Vloer's version is the Unfold version, with a `unfold-v<version>` tag ([Unfold ADR-0019](../../../../docs/adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-vloer.md)). Ploeg releases on its own from [github.com/ploeg-hq/ploeg](https://github.com/ploeg-hq/ploeg); until `unfold-v0.4.0-rc.35` it released together with Vloer ([Unfold ADR-0004](../../../../docs/adr/adr-0004-unfold-releases-one-version.md)). Publication remains disabled until the [distribution cutover](../../../../docs/migration.md#distribution-cutover-remains-separate) is qualified.

## Follow the release

| Stage | Source | Expected result |
| --- | --- | --- |
| Validate | [Source workflow](../../../../.forgejo/workflows/on_source_change.yml), [pull-request workflow](../../../../.forgejo/workflows/on_pull_request.yml) | Application, extension, generated-document and chart checks; cache-only image builds |
| Version | [Release configuration](../../../.releaserc.cjs), [Unfold prepare script](../../../../scripts/release-prepare.mjs), [Vloer prepare script](../../scripts/release-prepare.mjs) | Updated manifests and changelog, version tag and Forgejo release |
| Publish | [Publication workflow](../../../../.forgejo/workflows/on_release_published.yml) | Chart, both images, signatures and attestations, VSIX and checksum; configured registry copies |
| Build documentation | [Documentation workflow](../../../../.forgejo/workflows/on_docs_change.yml) and [source checks](../../../../.forgejo/workflows/on_source_change.yml) | Combined site built from [Unfold MkDocs](../../../../mkdocs.yml); remote documentation deployment is a cutover step |

Unfold checks pushes to `development` and pull requests. The shared semantic-release configuration determines release eligibility from conventional commits. The prepare script synchronizes chart and package versions; do not hand-bump them to repair a failed publication.

Inspect the matching run in [Forgejo Actions](https://forgejo.webgrip.dev/webgrip/de-vloer/actions) and its [release assets](https://forgejo.webgrip.dev/webgrip/de-vloer/releases). Record missing artifacts and the failing job. The publication workflow supports a manual dispatch with the existing tag selected as both the workflow ref and tag input; examine which stages completed before rerunning it. Several stages skip an existing artifact, so a retry is not a blanket rebuild or replacement.

## Images and chart

The publication workflow builds the [workbench image](../../Dockerfile) and [workspace image](../../ops/agent/Dockerfile) for AMD64 and ARM64. The [CVE gate](../../../../.forgejo/actions/cve-gate/action.yml) evaluates the published digest against [configured budgets](../../ops/security/cve-budgets.yaml) and [reviewed VEX statements](../../ops/vex/statements/). Signing and attestation follow that gate. Verify the digest, signer and attached evidence when qualifying a release; an old vulnerability scan is not a permanent assertion about an image.

When a vulnerability sits in a dependency that npm bundles and npm has not yet shipped a fix, the workspace image pins the fixed release as an annotated `NPM_<NAME>_VERSION` build argument, and [the patch script](../../ops/agent/patch-bundled-npm.mjs) swaps it in during the build. The script replaces only a copy that is older and in the same major version, fails the build if npm then cannot expand a brace pattern, and logs when npm itself has caught up, which is the signal to remove the pin. The first pins, `brace-expansion` 5.0.12 and `undici` 6.28.1, followed the advisories of 2026-09-29 that failed the budget in [release run 358](https://forgejo.webgrip.dev/webgrip/glide/actions/runs/358).

The [chart](../../ops/helm/de-vloer/) defaults image versions from its `appVersion`. Explicit image overrides can create version skew and need their own qualification. Registry destinations and mirror enablement belong to the publication workflow; consult it rather than a copied deployment inventory. Its prepared GitHub distribution jobs and workspace-image copy remain behind the Unfold publication gate. Successful publication and public pull access must be checked from the actual run and destination.

Deploy through the target environment's desired-state repository. [Live operation](live.md) covers workspace and runtime configuration. Publishing an image or chart does not deploy the workbench.

## Extension distribution

The release publish job packages the tagged extension, runs the [listing and package verifier](../../scripts/extension-verify.mjs), then attaches its VSIX and SHA-256 checksum to Forgejo. Registry publication happens afterward. The release is initially created without those assets; a release page can therefore exist while packaging is still running or has failed.

| Destination | Workflow condition |
| --- | --- |
| Forgejo release | Upload VSIX and checksum before attempting registry publication |
| Open VSX | Publish when `OVSX_PAT` is configured; mark a version containing a hyphen as a prerelease |
| Visual Studio Marketplace | Skip versions containing a hyphen; stable versions require the configured Marketplace credential |

[ADR 0021](../adrs/0021-the-extension-ships-through-open-vsx-first.md) records the Open VSX-first decision. The workflow warns or reports a notice when a registry credential is absent; a successful job with such a notice is not evidence of a registry listing. Account ownership, credentials and external registry availability require a fresh check when publishing there.

For installation, download the matching VSIX and checksum from a completed [Forgejo release](https://forgejo.webgrip.dev/webgrip/de-vloer/releases), verify the checksum, then use the editor's **Install from VSIX** command. The [extension guide](../../extensions/vscode/README.md#install) gives the user-facing steps.

## Credentials and qualification

Use the secret input names declared in the workflows. Provision bridge credentials through the estate's OpenBao-backed configuration; do not put values in this repository. Signing uses the workflow's OIDC identity and the configured OpenBao Transit role. A workflow declaration proves which input is expected, not that a secret exists or the remote identity is authorized. The estate's [Actions secret configuration](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/forgejo/forgejo-actions-secrets/app) owns provisioning.

[Validation](../validation.md) records dated release and deployment checks. The [previous release guide](https://forgejo.webgrip.dev/webgrip/de-vloer/src/commit/c5718cde7e1c7520927c64613c38beee11e087f7/docs/operations/release.md) preserves the initial publisher setup and failures. Those observations are history; use current job output to decide what still needs attention.
