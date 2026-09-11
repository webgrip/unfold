# Experimental release policy verification

The corrected policy calculates **v0.3.0-rc.5** from the actual repository history after withdrawal of the mistaken semantic-version tag. This is a local calculation, not evidence that the replacement was published.

The [test suite](../../scripts/release-policy.test.cjs) ran in the exact CI image `harbor.webgrip.dev/webgrip/semantic-release:0.3.3`, digest `sha256:6a0b7c4369320b8ca5d676bb1d6f6fc675d2d56cf738824b5ca9a855334b930f`, with the repository mounted read-only, networking disabled and a temporary filesystem for shell-test outputs. Installed versions were semantic-release 25.0.9, commit-analyzer 14.0.0-beta.3, and shared configuration 1.2.3.

All 14 tests passed. They reproduced the old major result using the real historical [breaking commit](https://forgejo.webgrip.dev/webgrip/ploeg/commit/7714cd5eb3268fd8291075a13fcb3736ddc88c76), proved the corrected minor result, generated release notes retaining the managed-authentication warning, loaded the local guards through the installed plugin pipeline, and executed the actual artifact-publisher shell against accepted, rejected and injection-shaped tags. Reusable artifact jobs also passed explicit failed-prerequisite checks.

The opt-in current-history test used semantic-release's installed tag discovery, commit reader, last-release selector and next-version calculator. After fetching origin's release-channel notes, its result was:

```json
{"lastRelease":"v0.3.0-rc.4","analyzedCommits":7,"type":"minor","nextRelease":"v0.3.0-rc.5","publication":false}
```

The local checkout originally lacked release-channel notes and selected the older stable baseline. CI fetches these notes before selecting a release; the local proof fetched the same notes without restoring the withdrawn tag. No release API, remote write, tag creation or publication was performed by the test suite. The opt-in historical assertion is specific to this correction and is not enabled in future CI runs; the fixed historical regression always runs.

The installed engine checks conditions before existing-release promotion, then checks the computed version before preparation, tagging and publication. [ADR 0028](../adrs/0028-automatic-releases-stay-zero-major-candidates.md) records why both guards are required. [The artifact workflow](../../.forgejo/workflows/on_release_published.yml) independently rejects non-experimental tags, including manual dispatch. An independent review identified Forgejo's reusable-workflow caller-gate limitation; each reusable call now receives a guarded `enabled` value as well.

Repository validation passed: `mise exec -- go test ./...`, `go vet ./...`, `go build ./...`, formatting, Helm lint, all four committed Helm golden renders, brand checks, the ADR ledger and all 10 OpenSpec items. Unchanged Go packages used the normal Go test cache. These checks do not assert a deployed runtime migration or a GA release.
