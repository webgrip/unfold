# Security

Unfold is pre-1.0. The latest release candidate on `development` is the only supported version.

## Report a vulnerability

Email [ryan@webgrip.nl](mailto:ryan@webgrip.nl) with "Unfold security" in the subject. Do not put credentials, exploit details or private deployment data in a public issue or pull request. If you cannot email, open an issue on [the forge](https://forgejo.webgrip.dev/webgrip/unfold/issues) that only asks a maintainer to contact you, with no vulnerability details.

A vulnerability in Ploeg, which Unfold pins at [apps/ploeg](apps/ploeg/), goes to [Ploeg's security policy](https://github.com/ploeg-hq/ploeg/blob/development/SECURITY.md).

## What happens next

The maintainer aims to acknowledge a report within seven days, agree on severity with you, fix it, and credit you in the release notes once a fixed release is out. These are targets, not guarantees: Unfold has one maintainer.

## Automated scanning

[`.oss-scanner/`](.oss-scanner/) holds the build and the [scanner threat model](.oss-scanner/threat_model.md) that automated vulnerability scanners read, such as [Anthropic's OSS Scanner](https://github.com/anthropics/oss-scanner): what is attacker-controlled, which components matter, what is out of scope and how Unfold rates severity.
