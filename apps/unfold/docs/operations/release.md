# Release Unfold

Forgejo coordinates one version for the workbench image, workspace image, Helm chart and editor extension. Source checks run before a release tag is created; publication jobs consume that tag. A tag or green source job alone does not prove that every artifact was published.

The application's version is the Unfold version, with an `unfold-v<version>` tag ([system ADR-0019](../../../../docs/adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md)). Ploeg releases on its own from [github.com/ploeg-hq/ploeg](https://github.com/ploeg-hq/ploeg); until `unfold-v0.4.0-rc.35` it released together with the application ([system ADR-0004](../../../../docs/adr/adr-0004-unfold-releases-one-version.md)). Publication remains disabled until the [distribution cutover](../../../../docs/migration.md#distribution-cutover-remains-separate) is qualified.

## Follow the release

| Stage | Source | Expected result |
| --- | --- | --- |
| Validate | [Source workflow](../../../../.forgejo/workflows/on_source_change.yml), [pull-request workflow](../../../../.forgejo/workflows/on_pull_request.yml) | Application, extension, generated-document and chart checks; cache-only image builds |
| Version | [Release train](../../../../.forgejo/workflows/on_release_train.yml), [release configuration](../../../.releaserc.cjs) | A version tag on the checked commit and a Forgejo release with the notes; no commit |
| Publish | [Publication workflow](../../../../.forgejo/workflows/on_release_published.yml) | Chart, both images, signatures and attestations, VSIX and checksum; configured registry copies |
| Build documentation | [Documentation workflow](../../../../.forgejo/workflows/on_docs_change.yml) and [source checks](../../../../.forgejo/workflows/on_source_change.yml) | Combined site built from [Unfold MkDocs](../../../../mkdocs.yml); remote documentation deployment is a cutover step |

Unfold checks pushes to `development` and pull requests, and the hourly release train versions the development head it checked. The shared semantic-release configuration determines release eligibility from conventional commits and fails a release whose range holds a commit that is neither conventional nor a merge. A release is the tag alone: it commits no version, changelog or image reference. Every publish job runs the [stamp script](../../scripts/stamp-version.mjs) on its checkout of the tag, so a publication carries the tag's version while the committed chart and manifests keep an older one; do not hand-bump them to repair a failed publication. Renovate moves the `unfold-agent` image the warm pool and the live local example name.

Inspect the matching run in [Forgejo Actions](https://forgejo.webgrip.dev/webgrip/unfold/actions) and its [release assets](https://forgejo.webgrip.dev/webgrip/unfold/releases). Record missing artifacts and the failing job. The publication workflow supports a manual dispatch with the existing tag selected as both the workflow ref and tag input; examine which stages completed before rerunning it. Several stages skip an existing artifact, so a retry is not a blanket rebuild or replacement.

## Images and chart

The publication workflow builds the [workbench image](../../Dockerfile) and [workspace image](../../ops/agent/Dockerfile) for AMD64 and ARM64. The [CVE gate](../../../../.forgejo/actions/cve-gate/action.yml) evaluates the published digest against [configured budgets](../../ops/security/cve-budgets.yaml) and [reviewed VEX statements](../../ops/vex/statements/). Signing and attestation follow that gate. Verify the digest, signer and attached evidence when qualifying a release; an old vulnerability scan is not a permanent assertion about an image.

The workbench image carries a Node compile cache in `/app/.node-cache`, which roughly halves the time from process start to a listening server. The last build step imports `src/main.ts` with `NODE_COMPILE_CACHE` set, which loads every module without starting the server, because `main()` runs only when `src/main.ts` is the entry script. The build fails when that step writes almost nothing, so a cache that silently stopped working cannot ship. The source stays TypeScript and startup still compiles nothing ([ADR 0002](../adrs/0002-native-node-and-single-writer-storage.md)); the cache only spares V8 from parsing it again. Node uses an entry only when the running process matches the one that wrote it, on three points that otherwise fail without a message:

- **The same Node build.** The step runs in the runtime stage, `NODE_RUNTIME_IMAGE`, so the binary that writes the cache is the one that reads it; moving the step to the `-dev` stage would tie it to a second digest that Renovate bumps on its own.
- **The same user.** The cache directory is named after the uid. The image and the chart's `securityContext` both run as uid 1000; a deployment that overrides `runAsUser` starts without the cache.
- **The same file paths.** Entries are keyed by absolute path, so the application stays at `/app`.

A read-only root filesystem is fine: Node reads the cache and skips writing new entries.

When a vulnerability sits in a dependency that npm bundles and npm has not yet shipped a fix, the workspace image pins the fixed release as an annotated `NPM_<NAME>_VERSION` build argument, and [the patch script](../../ops/agent/patch-bundled-npm.mjs) swaps it in during the build. The script replaces only a copy that is older and in the same major version, fails the build if npm then cannot expand a brace pattern, and logs when npm itself has caught up, which is the signal to remove the pin. The first pins, `brace-expansion` 5.0.12 and `undici` 6.28.1, followed the advisories of 2026-09-29 that failed the budget in [release run 358](https://forgejo.webgrip.dev/webgrip/glide/actions/runs/358).

The [chart](../../ops/helm/unfold/) defaults image versions from its `appVersion`. Explicit image overrides can create version skew and need their own qualification. Registry destinations and mirror enablement belong to the publication workflow; consult it rather than a copied deployment inventory. Its prepared GitHub distribution jobs and workspace-image copy remain behind the Unfold publication gate. Successful publication and public pull access must be checked from the actual run and destination.

Deploy through the target environment's desired-state repository. [Live operation](live.md) covers workspace and runtime configuration. Publishing an image or chart does not deploy the workbench.

## Extension distribution

The release publish job packages the tagged extension, runs the [listing and package verifier](../../scripts/extension-verify.mjs), then attaches its VSIX and SHA-256 checksum to Forgejo. It then signs those attached bytes and attests their provenance, verifies all of them, and only then publishes to a registry. The release is initially created without those assets; a release page can therefore exist while packaging is still running or has failed.

| Destination | Workflow condition |
| --- | --- |
| Forgejo release | Upload the VSIX and its checksum, then its cosign signature and SLSA provenance, before any registry publication |
| Open VSX | Publish with `OVSX_PAT`; fail when it is missing; mark a version containing a hyphen as a prerelease |
| Visual Studio Marketplace | Skip versions containing a hyphen; for a stable version use the Entra credential, else `VSCE_PAT` until 2026-12-01; skip with a warning when neither is set |

[ADR 0021](../adrs/0021-the-extension-ships-through-open-vsx-first.md) records the Open VSX-first decision. Each registry step writes what it did, or why it skipped, to the job summary. A green job with a skip line is not evidence of a registry listing. Account ownership, credentials and external registry availability require a fresh check when publishing there.

### Signature and provenance

[scripts/sign_extension_asset.py](../../../../scripts/sign_extension_asset.py) signs the VSIX that is already attached to the release, after the checksum check of [restore_extension_asset.py](../../../../scripts/restore_extension_asset.py), so a retry never signs a repackaged file with a new ZIP timestamp. It uses the same OpenBao Transit key and `cosign-signer` role as the images and the chart, reached through the job's Forgejo OIDC token, and uploads nothing to a public transparency log. It attaches two files:

| Asset | Content |
| --- | --- |
| `unfold-<version>.vsix.sig` | cosign signature over the VSIX (`cosign sign-blob`) |
| `unfold-<version>.vsix.intoto.json` | DSSE envelope holding an in-toto statement with an SLSA v1 provenance predicate (`cosign attest-blob --type slsaprovenance1`): the tag, its commit, the workflow and the run |

The provenance is written by the release job and signed with a key that only a release run can use. That is SLSA Build Level 2 at most: the job describes its own build, and no separate hosted builder vouches for it. A rerun signs only a file that is missing and leaves an existing one in place.

The next step downloads all four assets from the release again and runs `cosign verify-blob` and `cosign verify-blob-attestation` against the [committed public key](../../../../ops/security/cosign.pub). It also checks that the attestation names this VSIX's SHA-256 and the tag's commit. Any failure stops the job before Open VSX or the Marketplace receives the VSIX. To check a downloaded release by hand:

```sh
sha256sum -c unfold-<version>.vsix.sha256
cosign verify-blob --key cosign.pub --insecure-ignore-tlog \
  --signature unfold-<version>.vsix.sig unfold-<version>.vsix
cosign verify-blob-attestation --key cosign.pub --insecure-ignore-tlog \
  --type slsaprovenance1 --signature unfold-<version>.vsix.intoto.json unfold-<version>.vsix
```

`--insecure-ignore-tlog` is expected: the signature was never uploaded to Rekor, so there is no log entry to check. The key is the trust anchor.

Neither registry takes this signature. Open VSX signs every published version with its own registry key and serves a `.sigzip` and that key's URL next to the VSIX; `ovsx verify <file.vsix>` checks a download against it. The Marketplace also signs every extension when it is published, and VS Code checks that signature on install. `vsce publish` does accept publisher signature files (`--manifestPath`, `--signaturePath`, `--sigzipPath`), but they are PKCS#7 signatures from Microsoft's signing tool, which a cosign key cannot produce. The cosign signature and provenance are for people who install from the Forgejo or GitHub release, and for anyone who wants to tie a registry download back to the release: the registries store the same bytes, which `scripts/publish_release.py` compares for Open VSX.

### Registry credentials

Both registries offer Trusted Publishing, where the CI job trades its OIDC identity for a short-lived publish token and no long-lived secret exists. Neither accepts a Forgejo Actions identity:

- **Open VSX** accepts `ovsx publish --trusted-publishing` from GitHub Actions only. The server code also has a GitLab provider, which any GitLab instance can be configured for, but open-vsx.org has enabled only GitHub. It has no generic OIDC issuer setting, so Forgejo has no route. The first publication of an extension always needs a token.
- **Visual Studio Marketplace** accepts `vsce publish --oidc` from GitHub Actions and Azure Pipelines only, and says other OIDC providers are not supported.

That leaves three options for Open VSX:

| Option | Cost | Verdict |
| --- | --- | --- |
| Keep a token, scoped to the namespace and rotated | One secret to rotate every 90 days | **Chosen** |
| Mirror-publish from a GitHub Actions workflow on `github.com/webgrip/unfold` | A second publisher, with GitHub Actions turned back on for the mirror, and the VSIX and its signature carried across | Rejected: Forgejo stays the only publisher |
| Wait for GitLab or generic OIDC support on open-vsx.org | Nothing now | Revisit when open-vsx.org enables a provider Forgejo can act as |

`OVSX_PAT` belongs to the Open VSX account that owns the `webgrip` namespace and is used only for that namespace. Rotate it every 90 days, and right away if it may have leaked:

1. Sign in at [open-vsx.org](https://open-vsx.org/user-settings/tokens) as the owner of the `webgrip` namespace and create a token whose description names the date, for example `unfold-release-2026-10-30`.
2. Check it before storing it: `npx ovsx verify-pat webgrip -p <token>`.
3. Replace the value in OpenBao at the path the estate's [Actions secret configuration](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/forgejo/forgejo-actions-secrets/app) bridges to the `OVSX_PAT` repository secret, and wait for the bridge to publish it.
4. Run the [release preview](../../../../.forgejo/workflows/on_release_preview.yml). Its preflight fails without `OVSX_PAT`; the next release's Open VSX step proves that the token publishes.
5. Delete the old token in the same Open VSX settings page.

The Marketplace step prefers the Entra credential (`MARKETPLACE_AZURE_CLIENT_ID` and `MARKETPLACE_AZURE_TENANT_ID`, a managed identity added to the `WebGrip` publisher) and fails when only one of the two is set. Entra workload identity federation can trust any OIDC issuer, so it is the keyless route open to Forgejo, but `vsce --azure-credential` finds the identity through an Azure CLI login or the Azure environment variables, and the job sets up neither yet. With only `VSCE_PAT` set, the step publishes with a deprecation warning. Azure DevOps retires global personal access tokens on 2026-12-01, and a Marketplace token is one, so from that date the step fails and its error names the fix. No release is published to the Marketplace today: every Unfold release is a `-rc.N` candidate, which the step skips.

For installation, download the matching VSIX and checksum from a completed [Forgejo release](https://forgejo.webgrip.dev/webgrip/unfold/releases), verify the checksum, then use the editor's **Install from VSIX** command. The [extension guide](../../extensions/vscode/README.md#install) gives the user-facing steps.

## Credentials and qualification

Use the secret input names declared in the workflows. Provision bridge credentials through the estate's OpenBao-backed configuration; do not put values in this repository. Signing uses the workflow's OIDC identity and the configured OpenBao Transit role. A workflow declaration proves which input is expected, not that a secret exists or the remote identity is authorized. The estate's [Actions secret configuration](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/forgejo/forgejo-actions-secrets/app) owns provisioning.

[Validation](../validation.md) records dated release and deployment checks. The [previous release guide](https://forgejo.webgrip.dev/webgrip/unfold/src/commit/c5718cde7e1c7520927c64613c38beee11e087f7/docs/operations/release.md) preserves the initial publisher setup and failures. Those observations are history; use current job output to decide what still needs attention.
