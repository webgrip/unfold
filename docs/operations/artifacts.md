---
type: reference
audience: [operator, contributor]
owner: unfold
last_verified: 2026-10-03
verified_by: "Image, chart and registry identities checked against on_release_published.yml, scripts/publish_release.py and scripts/release_preflight.py; GHCR, Forgejo, Open VSX and Go module contents read anonymously for the 2026-10-03 audit record; Harbor contents were not inspected; Ploeg 0.1.0 release assets and checksums read anonymously from github.com/ploeg-hq/ploeg on 2026-10-03"
---

# Source mirrors and release artifacts

[Forgejo](https://forgejo.webgrip.dev/webgrip/unfold) owns source changes and versioning. [GitHub](https://github.com/webgrip/unfold) receives the same branches and tags through a native SSH push mirror. semantic-release's Git notes stay on Forgejo, the only release authority; the native mirror omits them and nothing copies them. GitHub Actions is disabled for the mirror.

Unfold releases under `unfold-v0.x.y-rc.N` tags ([ADR-0019](../adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md)); every artifact below carries that version. Until `unfold-v0.4.0-rc.35` the same tags also published Ploeg ([ADR-0004](../adr/adr-0004-unfold-releases-one-version.md)). The imported `ploeg-v…` tags and the tags of the front end's former repository remain as history. The [release workflow](../../.forgejo/workflows/on_release_published.yml) builds each image once in Harbor, holds it to its application's CVE budget with the shared [CVE gate](../../.forgejo/actions/cve-gate/action.yml), signs it through OpenBao, and copies the resulting OCI index and signing artifacts to the other registries. A chart is packaged once; subsequent destinations receive the original OCI manifest and blobs.

## Published identities

| Artifact | Harbor | Forgejo | Public destination |
| --- | --- | --- | --- |
| Unfold application | `harbor.webgrip.dev/webgrip/unfold` | `forgejo.webgrip.dev/webgrip/unfold` | `ghcr.io/webgrip/unfold` |
| Unfold workspace image | `harbor.webgrip.dev/webgrip/unfold-agent` | `forgejo.webgrip.dev/webgrip/unfold-agent` | `ghcr.io/webgrip/unfold-agent` |
| Unfold chart | `harbor.webgrip.dev/webgrip/charts/unfold` | `forgejo.webgrip.dev/webgrip/charts/unfold` | `ghcr.io/webgrip/charts/unfold` |
| Editor extension | VSIX and SHA-256 file on the [Forgejo release](https://forgejo.webgrip.dev/webgrip/unfold/releases) | Same release assets | [Open VSX](https://open-vsx.org/extension/webgrip/unfold), copied assets on the [GitHub release](https://github.com/webgrip/unfold/releases) |

Use the bare application version as the image or chart tag. Prereleases never move `latest`. The separate unattended `agent-runner` image is maintained outside Unfold.

The Forgejo chart paths include `charts/`. The inherited publisher used one OCI path for both an image and a chart, so their tags could overwrite one another. Existing Harbor and GHCR paths stay the same. Update consumers of the old Forgejo chart path when adopting an Unfold release.

There are currently no publishable npm or Composer packages: the application npm manifests are private, and no Composer package exists. A future library needs its own manifest, public API, version policy and consumer installation check. The Visual Studio Marketplace remains excluded for `rc.N` versions under the [extension distribution decision](../../apps/unfold/docs/adrs/0021-the-extension-ships-through-open-vsx-first.md).

## Ploeg's artifacts

[github.com/ploeg-hq/ploeg](https://github.com/ploeg-hq/ploeg) versions and publishes Ploeg from `v0.1.0`, with GitHub Actions as its only publisher: Linux binaries, checksums and source provenance on its GitHub releases, the image `ghcr.io/ploeg-hq/ploegd`, the chart `oci://ghcr.io/ploeg-hq/charts/ploeg`, and the Go module `github.com/ploeg-hq/ploeg`. Unfold pins Ploeg's source as a submodule at `apps/ploeg` and publishes none of these ([ADR-0019](../adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md)). Forgejo's [ploeg-mirror](https://forgejo.webgrip.dev/webgrip/ploeg-mirror) is a one-way pull mirror of that repository.

The versions Unfold published for Ploeg stay where they are, up to `0.4.0-rc.35`: `ploegd` and `charts/ploeg` on Harbor, Forgejo and `ghcr.io/webgrip`, and the Go module `github.com/webgrip/ploeg`. Unfold's exporter pushed each module version to [webgrip/ploeg](https://github.com/webgrip/ploeg) as a commit holding exactly that release's `apps/ploeg` tree. The exporter is retired, and [the publisher](../../scripts/publish_release.py) refuses `ploeg` before any Git, network or file access.

The 2026-10-03 history rewrite changed the bytes behind 14 published versions of the old module, and 17 versions survive only in the public module proxy. Downloads through the proxy still verify; a direct download of a changed version fails its checksum. `@latest` resolves to `v0.2.0`, and the withdrawn `v1.0.0-rc.1` remains the highest version. The [audit record](../research/2026-10-03-release-floors-and-identity.md) lists each version, and the [release floors](ci.md#release-floors) keep Ploeg's record so no Unfold train reuses a version.

## Integrity and retries

The [distribution verifier](../../scripts/release_registry.py) checks both AMD64 and ARM64 labels against the selected version and Unfold commit. It verifies signatures and CycloneDX attestations against the [trusted public key](../../ops/security/cosign.pub) before and after image copying. Only the public key is committed; the signing key remains in OpenBao. Coordinate a public-key update with the estate's Transit key rotation.

[regctl](https://regclient.org/) copies each image in one step: `regctl image copy --referrers --digest-tags`. It copies the OCI index with its platform images and BuildKit attestation manifests, their referrers, and cosign's `sha256-<digest>.sig` and `.att` tags. On a registry without the Referrers API, such as Forgejo's, regctl stores each referrer list as the OCI fallback index under `sha256-<digest>`. The version is pinned in the root `mise.toml`, and the mirror jobs install it through mise. `cosign copy` did this before and failed on Forgejo once BuildKit gave attestation manifests a `subject`: it wrote the platform image to the `sha256-<digest>` tag it then needed for the referrer index (`fallback tag manifest is not an OCI image index`, glide-v0.4.0-rc.28).

An existing destination version must have the expected digest. A mismatch fails without replacing it. A failed accessory copy, missing attestation or failed anonymous GHCR download fails publication. GitHub package visibility is independent of repository visibility; a package must be public for anonymous pulls to pass. See [GitHub package permissions](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages).

The extension publisher restores the already-attached VSIX before retrying Open VSX, so a newly generated ZIP timestamp cannot change the bytes for an existing version. Release assets are compared before a retry skips an upload. A successful publication attaches `release-artifacts-unfold.json` to both Forgejo and GitHub with the verified digests, source mapping and extension checksum. Releases up to `unfold-v0.4.0-rc.35` also carry `release-artifacts-ploeg.json`.

Run the [release preview](../../.forgejo/workflows/on_release_preview.yml) before enabling a new cutover. Its preflight checks that the Forgejo and GitHub APIs answer as `webgrip/unfold` rather than through a rename redirect, that no retired repository name (`webgrip/glide`, `webgrip/ploeg` or the front end's former repository) exists again with Actions enabled, that GitHub holds the same trunk and tags as Forgejo, that credentials authenticate, and that an Unfold OIDC identity can obtain the signing policy. The mirror comparison reads both remotes with `git ls-remote`, so the CI bot needs no repository administration. Actual uploads and destination verification remain the responsibility of the first publication. Follow the [cutover playbook](first-cutover.md) to distinguish publication from a live application rollout.
