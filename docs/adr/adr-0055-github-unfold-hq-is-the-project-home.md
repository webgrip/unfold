---
status: accepted
date: 2026-11-11
decision-makers: Ryan Grippeling
---

# GitHub unfold-hq/unfold is the project home, and GitHub Actions builds, releases and publishes Unfold

## Context and Problem Statement

Unfold's source of truth is Forgejo. Forgejo Actions on the owner's homelab runs CI, cuts every release and publishes it: images built in Harbor and signed with an OpenBao Transit key, copied to Forgejo's registry and to `ghcr.io/webgrip`, a chart signed the same way, and a VS Code extension published to Open VSX as `webgrip.unfold` with a namespace token. GitHub's `webgrip/unfold` is a push mirror with Actions turned off ([Source mirrors and release artifacts](../operations/artifacts.md)).

That ties an open-source product to one person's homelab: a contributor cannot see CI, a consumer verifies a signature against a key held in a private vault, every workflow names Webgrip hosts and secrets, and the release path breaks when the homelab does. Ploeg made the same move to `github.com/ploeg-hq/ploeg` ([Ploeg ADR-0062](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0062-github-is-the-independent-project-home.md)), and its release now opens Unfold's pin pull request from GitHub ([ADR-0041](adr-0041-a-ploeg-release-opens-unfolds-pin-pull-request-by-running-unfolds-recipe.md)).

Where does Unfold's source live, which system builds and publishes it, under which identities do its artifacts appear, and how does the move keep the release train running?

## Decision Drivers

* A contributor sees and reruns CI where the code is, without an account on someone's homelab.
* A consumer verifies an image, chart or extension against a public identity, not a key in a private vault.
* Unfold's repository holds no host, secret or credential of the organisation that hosts it today, and that organisation pulls what it needs.
* No version, tag, release note or Agent Trace note is lost, and the release train never reuses a version ([release floors](../operations/ci.md#release-floors)).
* The current Forgejo setup keeps releasing until the day the source of truth moves.

## Considered Options

* GitHub `unfold-hq/unfold` is the home: GitHub Actions on GitHub-hosted runners does CI, releases and publication, and Forgejo keeps a pull mirror
* Forgejo stays the home, and GitHub Actions on the mirror only publishes the extension with Trusted Publishing
* GitHub is the home, with self-hosted runners on the owner's cluster and Harbor kept as the build registry

## Decision Outcome

Chosen option: "GitHub `unfold-hq/unfold` is the home", because it is the only option that meets the first three drivers, and Ploeg already runs the same way.

1. **Home and history.** `github.com/unfold-hq/unfold` becomes the source of truth. The existing GitHub repository `webgrip/unfold` is transferred to the `unfold-hq` organisation, so tags, releases and issues come along and GitHub redirects the old name. Every `refs/notes/*` ref, the semantic-release channel notes and the Agent Trace notes, is pushed to GitHub on the cutover day. Forgejo then holds a one-way pull mirror, `webgrip/unfold-mirror`, and the old Forgejo repository is archived.
2. **Artifacts.** New versions are published as the images `ghcr.io/unfold-hq/unfold` and `ghcr.io/unfold-hq/unfold-agent`, the chart `oci://ghcr.io/unfold-hq/charts/unfold` and the VS Code extension `unfold-hq.unfold` on Open VSX. Earlier versions stay where they were published. Unfold no longer publishes to Harbor; the homelab pulls from GHCR itself. No GitHub workflow names a Webgrip host, secret or shared action, and every image a workflow runs is a public image pinned by digest.
3. **Signing.** Images and the chart are signed keyless with cosign through GitHub Actions OIDC and the public transparency log, with a CycloneDX SBOM and the CVE-budget verdict attested to each image, and BuildKit's SLSA provenance and SBOM attached. The signing job lives in `.github/workflows/on_release_published.yml` and runs on the release tag, so the signing identity is `https://github.com/unfold-hq/unfold/.github/workflows/on_release_published.yml@refs/tags/unfold-v0.x.y-rc.N` with issuer `https://token.actions.githubusercontent.com`. That is the identity a consumer's admission policy checks. The VSIX gets a keyless sigstore bundle and a GitHub build-provenance attestation.
4. **Open VSX.** The extension's publisher becomes `unfold-hq`, and GitHub Actions publishes it with Trusted Publishing (`ovsx publish --trusted-publishing`, ovsx 1.4.0 or newer), so no Open VSX token is stored. This is a new extension id: an editor with `webgrip.unfold` keeps it until the person installs `unfold-hq.unfold` ([application ADR 0021](../../apps/unfold/docs/adrs/0021-the-extension-ships-through-open-vsx-first.md) called the id a one-way door; this decision walks through it once). The links the workbench writes for the extension (`vscode://unfold-hq.unfold/…`) change with it.
5. **The site.** The release workflow deploys the marketing site with `wrangler deploy` in a job of its own, with the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and runs the live checks from [the site's deploy guide](../../apps/site/docs/deploy.md). The DNS preview reads the zone with `CLOUDFLARE_DNS_READ_TOKEN`, a read-only token.
6. **Runners.** Every job runs on a GitHub-hosted `ubuntu-24.04` runner, and every job's condition starts with `github.repository == 'unfold-hq/unfold'`, so the workflows do nothing on the mirror before the transfer or in a fork.
7. **Releases.** semantic-release runs directly with `apps/.releaserc.cjs` and `apps/site/.releaserc.cjs` and the repository's own release configuration in `scripts/release-config`, authenticated with `GITHUB_TOKEN`. A tag or release `GITHUB_TOKEN` creates starts no other workflow, so the job that cut the release dispatches `on_release_published.yml` at the new tag; a `workflow_dispatch` is the one event `GITHUB_TOKEN` may start, and dispatching at the tag is what gives the signing job its tag identity. Unfold's release is filed as a draft, so publication attaches the VSIX and the evidence file before it publishes the release. The repository variable `UNFOLD_RELEASES_ENABLED` keeps gating every release.
8. **The Ploeg pin.** Ploeg's release opens the pin pull request on GitHub with the `unfold-hq-bot` GitHub App and leaves the merge to Unfold. On Forgejo the hourly release train merged the newest green pin itself; on GitHub a workflow turns on auto-merge for the newest pin pull request when it opens and closes the older ones, and branch protection holds the merge until the `gate` check passes.
9. **Trackers.** No tracker URL, ticket id or member address appears in the repository, a commit or a pull request; GitHub Issues is the public intake, with issue forms and private vulnerability reporting.
10. **Branches.** `development` stays the trunk, and `main` keeps promoting stable site releases.

The repository rule "Keep each application's package, module, image and chart identities" gains its second exception: the published identities above. Package names, the Go module and the chart name do not change here.

### Consequences

* Good, because CI and releases are public and run without the homelab, and anyone can verify an artifact against a public identity.
* Good, because the repository no longer needs a Webgrip secret to release, and the homelab becomes an ordinary consumer.
* Good, because GitHub's own token starts publication, so no long-lived release token exists.
* Bad, because until the cutover every CI or release change lands twice, in `.forgejo/` and `.github/`.
* Bad, because the first release under each new identity starts with no history there: GHCR packages are private until made public, and `unfold-hq.unfold` is a new listing on Open VSX that existing installs do not follow on their own.
* Bad, because a merge or release made with `GITHUB_TOKEN` starts no push workflow, so a pin pull request that auto-merges is checked on `development` by the next release train, not by a push run.
* Bad, because the images build from Docker Hardened Images, which need a Docker Hub sign-in: a pull request from a fork skips the image build, and `development` builds it after the merge.
* Bad, because Unfold now owns a copy of the release configuration it used to share, and keeps it current itself.

### Confirmation

* `mise run release-check-github` runs [`scripts/github-workflow-policy.test.cjs`](../../scripts/github-workflow-policy.test.cjs), which fails when a job lacks the repository guard, a workflow names a Webgrip host or secret, an action or image is not pinned, a workflow other than `on_release_published.yml` signs, or the identity it signs with differs from the one [`scripts/release_registry.py`](../../scripts/release_registry.py) verifies. It also runs the release policy and isolation tests against `scripts/release-config`, and actionlint.
* `mise run verify` runs the publisher, preflight, pin and CVE-budget tests in `scripts/test_release_*.py`.
* After the cutover, the first release from GitHub passes `cosign verify --certificate-identity-regexp '^https://github\.com/unfold-hq/unfold/\.github/workflows/on_release_published\.yml@refs/tags/unfold-v' --certificate-oidc-issuer https://token.actions.githubusercontent.com` for both images and the chart, Open VSX serves `unfold-hq.unfold` at that version, and the GitHub release carries `release-artifacts-unfold.json`.

## Pros and Cons of the Options

### Forgejo stays the home, and GitHub Actions on the mirror only publishes the extension

* Good, because nothing moves.
* Bad, because a second publisher has to carry the VSIX and its signature across, and CI, signing keys and secrets stay on the homelab.

### GitHub is the home, with self-hosted runners and Harbor

* Good, because builds keep the homelab's caches and Harbor's proxies.
* Bad, because a pull request from a fork would run on the owner's cluster, and the workflows would keep Webgrip hosts and secrets.

## More Information

* 2026-11-11 — Decided by the owner. The [CI and release guide](../operations/ci.md), [Source mirrors and release artifacts](../operations/artifacts.md) and [the cutover playbook](../operations/first-cutover.md#move-the-home-to-github-proposed) describe the GitHub setup as proposed until the cutover day; `.forgejo/` is removed in the first pull request after it.
