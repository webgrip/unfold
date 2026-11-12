# Security

Unfold is pre-1.0. The latest release candidate on `development` is the only supported version.

## Report a vulnerability

Report it privately through GitHub: open [a private security advisory](https://github.com/unfold-hq/unfold/security/advisories/new) on `unfold-hq/unfold`. Only the maintainers see it. Do not put credentials, exploit details or private deployment data in a public issue, pull request or discussion. If you cannot use the advisory form, open an issue that only asks a maintainer to contact you, with no vulnerability details.

Say what you found, the version (`unfold-v…` tag, image digest or extension version), how to reproduce it, and what an attacker gains. Leave out data from real client repositories.

A vulnerability in Ploeg, which Unfold pins at [apps/ploeg](apps/ploeg/), goes to [Ploeg's security policy](https://github.com/ploeg-hq/ploeg/blob/development/SECURITY.md).

## What happens next

The maintainer aims to acknowledge a report within seven days, agree on severity with you, fix it, and credit you in the release notes and the advisory once a fixed release is out. These are targets, not guarantees: Unfold has one maintainer.

## Verify what you run

From the first release GitHub Actions publishes ([ADR-0055](docs/adr/adr-0055-github-unfold-hq-is-the-project-home.md)), the images `ghcr.io/unfold-hq/unfold` and `ghcr.io/unfold-hq/unfold-agent` and the chart `oci://ghcr.io/unfold-hq/charts/unfold` are signed keyless by this repository's release workflow:

```sh
cosign verify \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp '^https://github\.com/unfold-hq/unfold/\.github/workflows/on_release_published\.yml@refs/tags/unfold-v' \
  ghcr.io/unfold-hq/unfold:<version>
```

Earlier releases and how to verify them are listed in [Source mirrors and release artifacts](docs/operations/artifacts.md).

## Automated scanning

[`.oss-scanner/`](.oss-scanner/) holds the build and the [scanner threat model](.oss-scanner/threat_model.md) that automated vulnerability scanners read, such as [Anthropic's OSS Scanner](https://github.com/anthropics/oss-scanner): what is attacker-controlled, which components matter, what is out of scope and how Unfold rates severity.
