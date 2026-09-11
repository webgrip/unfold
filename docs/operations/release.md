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

The VSIX is packaged twice from the same tagged tree: once during semantic-release as a gate that proves the extension still packages before the tag is cut, and once in the publish job. The release itself carries no assets at creation time on purpose: the Gitea release plugin publishes an asset-bearing release as a draft that it then flips to published, and Forgejo reports that flip as a release `updated` event rather than `published` when the tag already exists, which is exactly what happened to `v0.3.0-rc.1`.

The publish job runs four steps in order. It packages the VSIX; it runs [extension-verify.mjs](../../scripts/extension-verify.mjs), which refuses a listing that is missing an icon, a repository, a licence or a changelog, that carries a relative README link, or that ships sources, source maps or `node_modules`; it attaches the VSIX and a `.sha256` beside it to the Forgejo release; and only then does it publish to the registries. The same verification runs on every pull request and every push, so a broken listing fails long before a tag exists.

| Registry | Gets | Credential |
| --- | --- | --- |
| [Open VSX](https://open-vsx.org/) | every release, prereleases with `--pre-release` | `OVSX_PAT` |
| [Visual Studio Marketplace](https://marketplace.visualstudio.com/) | stable `X.Y.Z` only | `VSCE_PAT`, or a federated Entra identity |
| Forgejo release asset | every release, with a SHA-256 checksum | `WEBGRIP_CI_TOKEN` |

The split is not a preference. The Marketplace version string must be one to four integers separated by periods, so `0.3.0-rc.14` is rejected outright and no flag changes that; `--pre-release` marks a plain `X.Y.Z` as a pre-release channel but does not make a `-rc` suffix acceptable. Open VSX takes the full semver. The job therefore skips the Marketplace for any version containing a hyphen and says so in a notice, warns when a stable version finds no Marketplace credential, and never rewrites a version to force one through.

Both publishers run from the lockfile: `@vscode/vsce` and `ovsx` are pinned devDependencies that Renovate keeps current, invoked through `npx --no-install`, so a release never resolves a publishing tool from the registry at publish time. A sideloaded VSIX does not auto-update in VS Code.

Open VSX is the default registry for the VS Code forks: VSCodium, Cursor, Windsurf, code-server, Gitpod, Theia, Kiro and Antigravity. Cursor puts its own malware and supply-chain scan in front of it. Only plain VS Code is Marketplace-or-VSIX, so Open VSX is the registry that reaches most of the ecosystem and it is the one to get right first.

### The Marketplace credential, and its deadline

Azure DevOps retires global personal access tokens on **2026-12-01**. `VSCE_PAT` works until then and stops working after, so the Marketplace step is written to prefer a federated identity whenever `MARKETPLACE_AZURE_CLIENT_ID` and `MARKETPLACE_AZURE_TENANT_ID` are set, and to fall back to `VSCE_PAT`. Migrating is a secrets change, not a workflow change.

The replacement is Entra ID workload identity federation, and it is more involved than it sounds:

- It needs an Azure subscription. The free tier is enough, but a user-assigned managed identity is a real Azure resource and has to live somewhere.
- It must be a **user-assigned managed identity**. An App Registration authenticates fine and then fails at publish with `InvalidAccessException`.
- The identity needs a federated credential trusting `https://forgejo.webgrip.dev` as the issuer, with the subject Forgejo Actions presents for this repository.
- The Marketplace recognises the identity by an id that only an undocumented Azure DevOps API call returns; the publisher then grants that id Contributor access.

Budget an afternoon, and do it before November so a failed migration does not land on top of a release.

## Secrets and identities

Bridge-level Forgejo Actions secrets, provisioned from OpenBao by the estate's reconciler and never typed into a file:

| Secret | Scope | Purpose |
| --- | --- | --- |
| `WEBGRIP_CI_TOKEN`, `HARBOR_ROBOT_USER`, `HARBOR_ROBOT_TOKEN` | organization | Release commit-back and Harbor push |
| `TECHDOCS_S3_ACCESS_KEY_ID`, `TECHDOCS_S3_SECRET_ACCESS_KEY` | repository | Docs site deploy |
| `GHCR_USERNAME`, `GHCR_TOKEN` | repository | GitHub mirror, release and GHCR copy |
| `OVSX_PAT` | repository | Open VSX namespace `webgrip` |
| `VSCE_PAT` | repository, optional | Visual Studio Marketplace publisher `webgrip`, until 2026-12-01 |
| `MARKETPLACE_AZURE_CLIENT_ID`, `MARKETPLACE_AZURE_TENANT_ID` | repository, optional | Federated Marketplace identity; neither is a secret value, and setting both takes precedence over `VSCE_PAT` |

Signing uses no secret: the job's OIDC token is exchanged at OpenBao for a short-lived Transit signing lease, which requires `webgrip/de-vloer` in the `cosign-signer` role's bound repositories in homelab-cluster.

## State of the prerequisites

Done on 2026-09-10: `webgrip/de-vloer` is in the OpenBao `cosign-signer` role ([homelab-cluster 0ae3e99a](https://forgejo.webgrip.dev/webgrip/homelab-cluster/commit/0ae3e99a)); the OpenBao config CronJob applies it within minutes. `WEBGRIP_CI_TOKEN`, `HARBOR_ROBOT_*`, `GHCR_*`, `GH_RELEASE_TOKEN` and `TECHDOCS_S3_*` are organization-wide secrets and need no repository entry. The first push of `development` with this pipeline is the qualification run; its outcome belongs in [validation](../validation.md).

Deferred, because each needs an account only a person can create: the `webgrip` namespace and `OVSX_PAT` on Open VSX, and `VSCE_PAT` for the Marketplace. On 2026-09-11 neither publisher existed and the name `webgrip` was still free on both, so the publish job warns and the VSIX remains a Forgejo release asset. [Claiming both](#claiming-the-publishers) is the remaining manual gate.

### Claiming the publishers

Do Open VSX first; it reaches more of the ecosystem, needs no Microsoft account and is reversible.

**Open VSX.** Sign in at [open-vsx.org](https://open-vsx.org/) with a GitHub account, sign the Eclipse Foundation publisher agreement under your Eclipse account, then create an access token from the profile page. Claim the namespace once with `npx ovsx create-namespace webgrip -p "$TOKEN"`; the token becomes `OVSX_PAT`. A namespace claimed by a personal account can be transferred to an organisation later, so this does not have to be right the first time.

**Visual Studio Marketplace.** Sign in to [dev.azure.com](https://dev.azure.com/) with a Microsoft account and create an organisation; it is free and asks for no card. Create the publisher `webgrip` at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage), matching the `publisher` field in the extension manifest. Then create a personal access token with organisation **All accessible organizations** and the single scope **Marketplace → Manage**; that token is `VSCE_PAT`. Both the publisher id and a removed extension name are permanent, so `webgrip.de-vloer` is a one-way door.

Put each token in OpenBao, add an External Secret and a `put_repo_secret` line for `de-vloer` in the `forgejo-actions-secrets` CronJob. Neither token is ever typed into a file in this repository.

**Verified publisher.** The blue check needs an extension published for six months and a domain registered for six, so it cannot be applied for at the first release. `webgrip.nl` qualifies when the time comes: it is an apex domain, serves HTTPS and answers a HEAD request with 200. Verification is a TXT record plus about five business days of review.

Known rough edges after the first three releases: the Forgejo image mirror failed once after successfully pushing its tag, and one source-change run reported success without cutting a version, its commit rolling into the next release. Both need an authenticated job log to diagnose, and both are recorded in [validation](../validation.md).

Deferred for the same reason: the GitHub mirror. `github.com/webgrip/de-vloer` does not exist, so the mirror job force-pushed nothing and failed on the Releases API in the first full chain. Its `enabled` input is `false` until someone creates that repository; the GHCR image and chart copies are org-scoped and already publish without it. Flip the input back to `true` in the same change that creates the repository.

Still to do for the in-cluster workbench: an `OCIRepository` for `oci://harbor.webgrip.dev/webgrip/charts/de-vloer` with tag and Harbor digest, a `HelmRelease` with `mode: live`, the workspace namespace, egress and credentials, and, for the sandbox provisioner, the agent-sandbox controller and the warm pool from [ops/cluster/agent-sandbox](../../ops/cluster/agent-sandbox/README.md). That deployment is the in-cluster workbench described in [live operation](live.md).
