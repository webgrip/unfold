# Experimental releases

Ploeg is experimental. Automatic releases use `0.x.y-rc.N` versions from `development`. A breaking configuration change still needs an upgrade warning, but it does not authorize version 1.x or general availability.

The [release configuration](../../.releaserc.cjs) maps breaking changes to a minor version increase. The [release guard](../../scripts/release-policy.cjs) checks the branch, channel, version and tag before publication. The [source workflow](../../.forgejo/workflows/on_source_change.yml) runs the [policy tests](../../scripts/release-policy.test.cjs) against the installed release toolchain. [ADR 0028](../adrs/0028-automatic-releases-stay-zero-major-candidates.md) records the policy; publishing 1.x or stable releases requires an explicit policy change.

The [artifact publisher](../../.forgejo/workflows/on_release_published.yml) also rejects tags outside `v0.x.y-rc.N`, including manually dispatched publication. Experimental releases do not update `latest`.

## Correction of v1.0.0-rc.1

On 2026-09-11, a breaking-change footer caused the release automation to select `v1.0.0-rc.1`. The compatibility warning was needed, but the version number was wrong.

The [Forgejo release](https://forgejo.webgrip.dev/webgrip/ploeg/releases/tag/withdrawn-v1.0.0-rc.1) is marked withdrawn. Its original notes and assets are preserved under `withdrawn-v1.0.0-rc.1`, pointing to the original [47c078d commit](https://forgejo.webgrip.dev/webgrip/ploeg/commit/47c078da2f41548ac6903482160ca29c9a87f872). Only after verifying that archive was the original source tag removed from release-version discovery. Development history was not rewritten.

The [GitHub release](https://github.com/webgrip/ploeg/releases/tag/v1.0.0-rc.1) is also marked withdrawn. Its immutable tag and assets remain for traceability. Existing 1.0.0-rc.1 container images and charts retain their original bytes; they must not be used for the test deployment.

Existing clones may still have the withdrawn tag. Fetch from Forgejo, verify the archive points to the commit above, and remove the local `v1.0.0-rc.1` tag before running release automation. Do not fetch release tags from the GitHub mirror, which retains the immutable withdrawn tag.
