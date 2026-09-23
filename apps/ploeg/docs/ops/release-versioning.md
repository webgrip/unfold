# Experimental releases

Ploeg is experimental. Automatic releases use `0.x.y-rc.N` versions from `development`. A breaking configuration change still needs an upgrade warning, but it does not authorize version 1.x or general availability.

The [release configuration](../../.releaserc.cjs) maps breaking changes to a minor version increase. The [release guard](../../scripts/release-policy.cjs) checks the branch, channel, version and tag before publication. The [source workflow](../../../../.forgejo/workflows/on_source_change.yml) runs the [policy tests](../../scripts/release-policy.test.cjs) against the installed release toolchain. [ADR 0028](../adrs/0028-automatic-releases-stay-zero-major-candidates.md) records the policy; publishing 1.x or stable releases requires an explicit policy change.

The [artifact publisher](../../../../.forgejo/workflows/on_release_published.yml) also rejects tags outside `ploeg-v0.x.y-rc.N`, including manually dispatched publication. Experimental releases do not update `latest`.

Glide keeps publication disabled until the [distribution cutover](../../../../docs/migration.md#distribution-cutover-remains-separate) is qualified. For manual publication, select the same tag as both the workflow ref and tag input. Existing releases remain in the original repository during this transition.
