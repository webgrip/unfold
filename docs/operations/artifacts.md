# Source mirrors and release artifacts

[Forgejo](https://forgejo.webgrip.dev/webgrip/glide) owns source changes and versioning. [GitHub](https://github.com/webgrip/glide) receives the same branches and tags through a native SSH push mirror. The source workflow also copies semantic-release's Git notes, which Forgejo's native mirror omits. GitHub Actions is disabled for the mirror.

Vloer and Ploeg retain independent `vloer-v0.x.y-rc.N` and `ploeg-v0.x.y-rc.N` tags. The [release workflow](../../.forgejo/workflows/on_release_published.yml) builds each image once in Harbor, signs it through OpenBao, and copies the resulting OCI index and signing artifacts to the other registries. A chart is packaged once; subsequent destinations receive the original OCI manifest and blobs.

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

Use the bare application version as the image or chart tag. Prereleases never move `latest`. The separate unattended `agent-runner` image is maintained outside Glide.

The Forgejo chart paths include `charts/`. The inherited publisher used the same `webgrip/de-vloer` OCI path for both an image and a chart, so their tags could overwrite one another. Existing Harbor and GHCR paths stay the same. Update consumers of the old Forgejo chart path when adopting a Glide release.

There are currently no publishable npm or Composer packages: the application npm manifests are private, and no Composer package exists. A future library needs its own manifest, public API, version policy and consumer installation check. The Visual Studio Marketplace remains excluded for `rc.N` versions under the [extension distribution decision](../../apps/vloer/docs/adrs/0021-the-extension-ships-through-open-vsx-first.md).

## Go module compatibility

[Go resolves versions relative to the module root](https://go.dev/ref/mod#vcs-version). Ploeg's existing import path therefore needs a root `go.mod` in its GitHub repository and ordinary version tags.

The [exporter](../../scripts/publish_release.py) creates a deterministic commit containing exactly the `apps/ploeg` tree from the selected Glide tag. Its parent is the retained final legacy release commit. It pushes only the new `v…` tag to [webgrip/ploeg](https://github.com/webgrip/ploeg), leaving historical branches and tags intact. This repository is a compatibility export; development belongs in Glide.

Each release records both the Glide revision and export revision. Publication downloads the Go module into an empty cache and compares its Go and migration sources against the tagged Glide tree. The GitHub mirror uses the original Glide commits; the Go export deliberately has a different root and commit ID.

## Integrity and retries

The [distribution verifier](../../scripts/release_registry.py) checks both AMD64 and ARM64 labels against the selected version and Glide commit. It verifies signatures and CycloneDX attestations against the [trusted public key](../../ops/security/cosign.pub) before and after image copying. Only the public key is committed; the signing key remains in OpenBao. Coordinate a public-key update with the estate's Transit key rotation.

An existing destination version must have the expected digest. A mismatch fails without replacing it. A failed accessory copy, missing attestation or failed anonymous GHCR download fails publication. GitHub package visibility is independent of repository visibility; a package must be public for anonymous pulls to pass. See [GitHub package permissions](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages).

The extension publisher restores the already-attached VSIX before retrying Open VSX, so a newly generated ZIP timestamp cannot change the bytes for an existing version. Release assets are compared before a retry skips an upload. A successful publication attaches `release-artifacts.json` to both Forgejo and GitHub with the verified digests, source mapping and extension checksum.

Run the [release preview](../../.forgejo/workflows/on_release_preview.yml) before enabling a new cutover. Its preflight checks the old publishers are disabled, the GitHub mirror is healthy, credentials authenticate, and a Glide OIDC identity can obtain the signing policy. Actual uploads and destination verification remain the responsibility of the first publication. Follow the [cutover playbook](first-cutover.md) to distinguish publication from a live application rollout.
