---
status: proposed
date: 2026-10-24
decision-makers: Ryan Grippeling
---

# Unfold refuses a Ploeg that does not serve the contract majors it requires, and records what it relies on for Ploeg's CI

## Context and Problem Statement

An Unfold release carries the Ploeg it was tested with ([ADR-0043](adr-0043-an-unfold-release-is-one-chart-that-carries-the-ploeg-it-was-tested-with.md)), so the default install is a tested pair. Nothing checks that pair at run time: Unfold pointed at another Ploeg, or a Ploeg upgraded on its own, shows up as scattered 404s, `ploeg_response` parse failures and half-working pages. Ploeg is becoming a public project that others consume on their own schedule, and Ploeg [ADR 0147](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0147-ploeg-serves-the-major-of-each-contract-and-keeps-its-consumers-two-newest-lines-working.md) now serves the contract majors it speaks at `GET /api/v1/operator/version` and checks each consumer's recorded expectations in its CI. [ADR-0018](adr-0018-ploeg-releases-on-its-own-schedule-behind-a-tested-contract-version.md) proposed a runtime contract check and left open whether a mismatch should stop Unfold (Q1) and which contracts count (Q5). What does Unfold require of Ploeg, what does it do when Ploeg does not offer it, and how does Ploeg learn what Unfold relies on?

This covers the Unfold application's Ploeg client, its readiness probe and its release line's expectation set.

## Decision Drivers

* An incompatible pair fails loudly at one place, with a message that names both versions, and never half-works.
* An unreachable Ploeg is an outage, not an incompatibility, and must not be reported as one.
* Ploeg's CI must learn of an Unfold break before a Ploeg release, from evidence Unfold keeps true.
* Unfold keeps working with the Ploeg it carries and the Ploeg minor before it.
* `ws` stays the only runtime dependency.

## Considered Options

* Check the served contract majors at start and every minute, fail readiness on a mismatch, and publish an expectation set per release line
* Show a blocking banner and stay ready (ADR-0018's proposal)
* Compare Ploeg's release version with a supported range

## Decision Outcome

Chosen option: "**Check the served contract majors at start and every minute, fail readiness on a mismatch, and publish an expectation set per release line**", because it uses the version Ploeg derives from its schemas, stops traffic to a pair that cannot work, and gives Ploeg's CI Unfold's real use.

1. **Unfold declares what it requires in one file.** [apps/unfold/src/ploeg-expectations.json](../../apps/unfold/src/ploeg-expectations.json) is Unfold's expectation set in Ploeg's format: the contract majors it requires (`operator-api`, `operator-delivery` and `tracker-execution`, each v1), and every operator request it sends with the request body it sends, the response definition it parses and the values it reads, their types and whether it needs them present. The image ships it; [src/ploeg-compatibility.ts](../../apps/unfold/src/ploeg-compatibility.ts) reads `requires` from it.
2. **Unfold checks Ploeg at start and every minute.** `PloegClient.served()` reads `GET /api/v1/operator/version`. A Ploeg that answers 404 predates the route and counts as serving major 1 of every contract, which is all this Unfold requires, so the Ploeg minor before the one Unfold carries passes. `PloegCompatibilityMonitor` keeps the answer.
3. **A mismatch makes Unfold not ready.** While a required major is missing, `/readyz` answers 503 `ploeg_incompatible` with the sentence "Unfold `<version>` requires Ploeg contract `<contract> v<N>`, but this Ploeg (`<release>`) serves `<what it serves>`…", and Unfold logs `ploeg.contract_incompatible` once per distinct mismatch and `ploeg.contract_compatible` on recovery. `/healthz` stays 200, so Kubernetes does not restart the pod for it. A Ploeg that cannot be reached keeps the last answer and logs `ploeg.version_unreadable` once. This answers ADR-0018 Q1 for this check: not ready, not a banner. The demo without a Ploeg runs no check.
4. **Skew window.** An Unfold release supports the Ploeg it carries and the Ploeg minor before it. Ploeg holds its side by keeping the two newest Unfold lines' expectation sets passing ([Ploeg ADR 0147](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0147-ploeg-serves-the-major-of-each-contract-and-keeps-its-consumers-two-newest-lines-working.md)); a contract change Unfold reads becomes a new major, served beside the old one for a minor. The check covers every contract Unfold requires, not only the operator API, which answers ADR-0018 Q5.
5. **The expectation set stays true and reaches Ploeg.** [test/ploeg-compatibility.test.ts](../../apps/unfold/test/ploeg-compatibility.test.ts) fails when `src/ploeg.ts` requests an operator route the set does not record, when a recorded definition or read is missing from the pinned Ploeg bundle, or when the set's `line` is not `package.json`'s major and minor. The same file goes to Ploeg as `docs/contracts/consumers/unfold/<line>.json` by pull request; a new Unfold minor adds its line there and drops the oldest.

### Consequences

* Good, because a mismatched pair stops taking traffic and says why, in the probe body and one log line, instead of failing page by page.
* Good, because Ploeg's CI fails on a change that breaks a recorded Unfold read, before any release.
* Good, because the requirement comes from a file the tests keep honest, not a number someone remembers to raise.
* Bad, because the chart runs one replica with `Recreate`, so not ready means Unfold is unavailable until the pair is fixed. Accepted: a pair that cannot work should not serve, and the chart deploys a tested pair by default.
* Bad, because enum values and request headers are not recorded; Unfold must keep treating an unknown enum value as unknown.
* Bad, because the copy in Ploeg moves by hand until Unfold's release opens that pull request.
* Neutral: the version route is new in Ploeg; until the pin carries it, the 404 path is what runs, and the test skips the route's definition while the pinned bundle lacks it.

### Confirmation

* `mise exec -- npm test` in `apps/unfold` runs `test/ploeg-compatibility.test.ts`: compatible, legacy and two-major Ploeg answers are ready; a missing major is not ready, names both versions and logs once; an unreachable Ploeg keeps the last answer; `/readyz` answers 503 with `ploeg_contract_incompatible` and recovers; `/healthz` stays 200; the client parses the route, reads 404 as legacy and refuses a malformed answer; and the expectation set covers every operator route `src/ploeg.ts` requests and resolves in the pinned bundle.
* Mutation, 2026-10-24: renaming a recorded route and a read pointer in `src/ploeg-expectations.json` failed the coverage and schema tests; making `/readyz` ignore the monitor failed the readiness test.
* Ploeg's `TestEveryRecordedConsumerExpectationHolds` runs this file from `docs/contracts/consumers/unfold/` on every Ploeg pull request.
* `mise run verify` runs `npm test`.

## Pros and Cons of the Options

### Show a blocking banner and stay ready (ADR-0018's proposal)

* Good, because a person who opens Unfold sees the reason.
* Bad, because Unfold keeps taking traffic and making calls a Ploeg cannot answer, and every client that is not a browser (the MCP server, the editor extension) sees no banner.

### Compare Ploeg's release version with a supported range

* Good, because it needs no new Ploeg route.
* Bad, because a release version says nothing about which contracts changed, so the range is either too narrow, refusing working pairs, or too wide.

## More Information

* Implements the runtime check of ADR-0018 section 2 and the consumer half of its section 6 with the narrower, derived contract version Ploeg ADR 0147 chose; ADR-0018's bundle, banner and release-train proposals are not decided here.
* Builds on [ADR-0039](adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md), whose pinned bundle the schema test reads, and [ADR-0043](adr-0043-an-unfold-release-is-one-chart-that-carries-the-ploeg-it-was-tested-with.md).
* Technical story: VIK-2398.
* 2026-10-24: proposed.
