---
type: reference
audience: [operator, contributor]
owner: unfold
last_verified: 2026-09-27
verified_by: "Image, chart and registry identities checked against on_release_published.yml, scripts/publish_release.py and scripts/release_preflight.py; remote registry contents were not inspected"
---

# Source mirrors and release artifacts

[Forgejo](https://forgejo.webgrip.dev/webgrip/glide) owns source changes and versioning. [GitHub](https://github.com/webgrip/glide) receives the same branches and tags through a native SSH push mirror. semantic-release's Git notes stay on Forgejo, the only release authority; the native mirror omits them and nothing copies them. GitHub Actions is disabled for the mirror.

Vloer and Ploeg release together under one `unfold-v0.x.y-rc.N` tag ([ADR-0004](../adr/adr-0004-unfold-releases-one-version.md)); every artifact below carries that version. The imported `vloer-v…` and `ploeg-v…` tags remain as history. The [release workflow](../../.forgejo/workflows/on_release_published.yml) builds each image once in Harbor, holds it to its application's CVE budget with the shared [CVE gate](../../.forgejo/actions/cve-gate/action.yml), signs it through OpenBao, and copies the resulting OCI index and signing artifacts to the other registries. A chart is packaged once; subsequent destinations receive the original OCI manifest and blobs.

## Published identities

| Artifact | Harbor | Forgejo | Public destination |
| --- | --- | --- | --- |
| Vloer application | `harbor.webgrip.dev/webgrip/de-vloer` | `forgejo.webgrip.dev/webgrip/de-vloer` | `ghcr.io/webgrip/de-vloer` |
| Vloer workspace image | `harbor.webgrip.dev/webgrip/de-vloer-agent` | `forgejo.webgrip.dev/webgrip/de-vloer-agent` | `ghcr.io/webgrip/de-vloer-agent` |
| Ploeg daemon | `harbor.webgrip.dev/webgrip/ploegd` | `forgejo.webgrip.dev/webgrip/ploegd` | `ghcr.io/webgrip/ploegd` |
| Vloer chart | `harbor.webgrip.dev/webgrip/charts/de-vloer` | `forgejo.webgrip.dev/webgrip/charts/de-vloer` | `ghcr.io/webgrip/charts/de-vloer` |
| Ploeg chart | `harbor.webgrip.dev/webgrip/charts/ploeg` | `forgejo.webgrip.dev/webgrip/charts/ploeg` | `ghcr.io/webgrip/charts/ploeg` |
| Editor extension | VSIX and SHA-256 file on the [Forgejo release](https://forgejo.webgrip.dev/webgrip/glide/releases) | Same release assets | [Open VSX](https://open-vsx.org/extension/webgrip/de-vloer), copied assets on the [GitHub release](https://github.com/webgrip/glide/releases) |
| Ploeg Go module | Source under `apps/ploeg` | Source under `apps/ploeg` | `github.com/webgrip/ploeg@v0.x.y-rc.N` |

Use the bare application version as the image or chart tag. Prereleases never move `latest`. The separate unattended `agent-runner` image is maintained outside Unfold.

The Forgejo chart paths include `charts/`. The inherited publisher used the same `webgrip/de-vloer` OCI path for both an image and a chart, so their tags could overwrite one another. Existing Harbor and GHCR paths stay the same. Update consumers of the old Forgejo chart path when adopting an Unfold release.

There are currently no publishable npm or Composer packages: the application npm manifests are private, and no Composer package exists. A future library needs its own manifest, public API, version policy and consumer installation check. The Visual Studio Marketplace remains excluded for `rc.N` versions under the [extension distribution decision](../../apps/vloer/docs/adrs/0021-the-extension-ships-through-open-vsx-first.md).

## Go module compatibility

[Go resolves versions relative to the module root](https://go.dev/ref/mod#vcs-version). Ploeg's existing import path therefore needs a root `go.mod` in its GitHub repository and ordinary version tags.

The [exporter](../../scripts/publish_release.py) creates a deterministic commit containing exactly the `apps/ploeg` tree from the selected Unfold tag. Its parent is the retained final legacy release commit. It pushes only the new `v…` tag to [webgrip/ploeg](https://github.com/webgrip/ploeg), leaving historical branches and tags intact. This repository is a compatibility export; development belongs in Unfold.

Each release records both the Unfold revision and export revision. Publication downloads the Go module into an empty cache and compares its Go and migration sources against the tagged Unfold tree. The GitHub mirror uses the original Unfold commits; the Go export deliberately has a different root and commit ID.

## Integrity and retries

The [distribution verifier](../../scripts/release_registry.py) checks both AMD64 and ARM64 labels against the selected version and Unfold commit. It verifies signatures and CycloneDX attestations against the [trusted public key](../../ops/security/cosign.pub) before and after image copying. Only the public key is committed; the signing key remains in OpenBao. Coordinate a public-key update with the estate's Transit key rotation.

[regctl](https://regclient.org/) copies each image in one step: `regctl image copy --referrers --digest-tags`. It copies the OCI index with its platform images and BuildKit attestation manifests, their referrers, and cosign's `sha256-<digest>.sig` and `.att` tags. On a registry without the Referrers API, such as Forgejo's, regctl stores each referrer list as the OCI fallback index under `sha256-<digest>`. The version is pinned in the root `mise.toml`, and the mirror jobs install it through mise. `cosign copy` did this before and failed on Forgejo once BuildKit gave attestation manifests a `subject`: it wrote the platform image to the `sha256-<digest>` tag it then needed for the referrer index (`fallback tag manifest is not an OCI image index`, glide-v0.4.0-rc.28).

An existing destination version must have the expected digest. A mismatch fails without replacing it. A failed accessory copy, missing attestation or failed anonymous GHCR download fails publication. GitHub package visibility is independent of repository visibility; a package must be public for anonymous pulls to pass. See [GitHub package permissions](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages).

The extension publisher restores the already-attached VSIX before retrying Open VSX, so a newly generated ZIP timestamp cannot change the bytes for an existing version. Release assets are compared before a retry skips an upload. A successful publication attaches `release-artifacts-vloer.json` and `release-artifacts-ploeg.json` to both Forgejo and GitHub with the verified digests, source mapping, extension checksum and Go module export.

Run the [release preview](../../.forgejo/workflows/on_release_preview.yml) before enabling a new cutover. Its preflight checks the old publishers are disabled, GitHub holds the same trunk and tags as Forgejo, credentials authenticate, and an Unfold OIDC identity can obtain the signing policy. The mirror comparison reads both remotes with `git ls-remote`, so the CI bot needs no repository administration. Actual uploads and destination verification remain the responsibility of the first publication. Follow the [cutover playbook](first-cutover.md) to distinguish publication from a live application rollout.
