---
status: proposed
date: 2026-10-24
decision-makers: Ryan Grippeling
---

# Unfold refuses a Ploeg that does not serve the contract majors it requires, and records what it relies on for Ploeg's CI

## Context and Problem Statement

An Unfold release carries the Ploeg it was tested with ([ADR-0043](adr-0043-an-unfold-release-is-one-chart-that-carries-the-ploeg-it-was-tested-with.md)), so the default install is a tested pair. Nothing checks that pair at run time: Unfold pointed at another Ploeg, or a Ploeg upgraded on its own, shows up as scattered 404s, `ploeg_response` parse failures and half-working pages. Ploeg is becoming a public project that others consume on their own schedule, and Ploeg [ADR 0147](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0147-ploeg-serves-the-major-of-each-contract-and-keeps-its-consumers-two-newest-lines-working.md) now serves the contract majors it speaks at `GET /api/v1/operator/version` and checks each consumer's recorded expectations in its CI. [ADR-0018](adr-0018-ploeg-releases-on-its-own-schedule-behind-a-tested-contract-version.md) proposed a runtime contract check and left open whether a mismatch should stop Unfold (Q1) and which contracts count (Q5). What does Unfold require of Ploeg, what does it do when Ploeg does not offer it, and how does Ploeg learn what Unfold relies on?

This covers the Unfold application's calls to Ploeg, its probes and status report, the browser's mismatch banner and its release line's expectation set.

## Decision Drivers

* An incompatible pair fails loudly at one place, with a message that names both versions, and never half-works.
* An unreachable Ploeg is an outage, not an incompatibility, and must not be reported as one.
* The screens a person uses to find and fix the mismatch stay reachable. Unfold runs one replica with `Recreate`, so an Unfold that is not ready is an Unfold nobody can open.
* Ploeg's CI must learn of an Unfold break before a Ploeg release, from evidence Unfold keeps true.
* Unfold keeps working with the Ploeg it carries and the Ploeg minor before it.
* `ws` stays the only runtime dependency.

## Considered Options

* Check the served contract majors at start and every minute, stay ready and refuse every call to Ploeg behind a banner on a mismatch, and publish an expectation set per release line
* Check the same way, but fail readiness on a mismatch
* Compare Ploeg's release version with a supported range

## Decision Outcome

Chosen option: "**Check the served contract majors at start and every minute, stay ready and refuse every call to Ploeg behind a banner on a mismatch, and publish an expectation set per release line**", because it uses the version Ploeg derives from its schemas, sends nothing to a Ploeg that cannot answer it while keeping Unfold open to the people who fix the pair, and gives Ploeg's CI Unfold's real use.

1. **Unfold declares what it requires in one file.** [apps/unfold/src/ploeg-expectations.json](../../apps/unfold/src/ploeg-expectations.json) is Unfold's expectation set in Ploeg's format: the contract majors it requires (`operator-api`, `operator-delivery` and `tracker-execution`, each v1), and every operator request it sends with the request body it sends, the response definition it parses and the values it reads, their types and whether it needs them present. The image ships it; [src/ploeg-compatibility.ts](../../apps/unfold/src/ploeg-compatibility.ts) reads `requires` from it.
2. **Unfold checks Ploeg at start and every minute.** `PloegClient.served()` reads `GET /api/v1/operator/version`. A Ploeg that answers 404 predates the route and counts as serving major 1 of every contract, which is all this Unfold requires, so the Ploeg minor before the one Unfold carries passes. `PloegCompatibilityMonitor` keeps the answer.
3. **A mismatch pauses managed actions; Unfold stays ready.** While a required major is missing, every call Unfold would send to Ploeg is refused before it is sent with `PloegContractIncompatible`, a 503 `ploeg_contract_incompatible` whose message reads "Managed actions are paused, so Unfold sent nothing to Ploeg. Unfold `<version>` requires Ploeg contract `<contract> v<N>`, but this Ploeg (`<release>`) serves `<what it serves>`…". The refusal covers the operator client in [src/ploeg.ts](../../apps/unfold/src/ploeg.ts) and every caller that reaches Ploeg without it: execution authority, delivery, task binding and the linked session record. The version probe itself is never refused, so Unfold sees Ploeg recover. Unfold's own data stays readable. `/readyz` and `/healthz` do not depend on the check; `/healthz` and `GET /api/status` carry the state as `ploegContract`, the status report's Ploeg check reads `down`, and every page shows a banner saying Ploeg's version does not match and managed actions are paused. Unfold logs `ploeg.contract_incompatible` once per distinct mismatch and `ploeg.contract_compatible` on recovery. A Ploeg that cannot be reached keeps the last answer and logs `ploeg.version_unreadable` once. This answers ADR-0018 Q1 for this check with its banner: stay ready, block the calls. The demo without a Ploeg runs no check.
4. **Skew window.** An Unfold release supports the Ploeg it carries and the Ploeg minor before it. Ploeg holds its side by keeping the two newest Unfold lines' expectation sets passing ([Ploeg ADR 0147](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0147-ploeg-serves-the-major-of-each-contract-and-keeps-its-consumers-two-newest-lines-working.md)); a contract change Unfold reads becomes a new major, served beside the old one for a minor. The check covers every contract Unfold requires, not only the operator API, which answers ADR-0018 Q5.
5. **The expectation set stays true and reaches Ploeg.** [test/ploeg-compatibility.test.ts](../../apps/unfold/test/ploeg-compatibility.test.ts) fails when `src/ploeg.ts` requests an operator route the set does not record, when a recorded definition or read is missing from the pinned Ploeg bundle, or when the set's `line` is not `package.json`'s major and minor. The same file goes to Ploeg as `docs/contracts/consumers/unfold/<line>.json` by pull request; a new Unfold minor adds its line there and drops the oldest.

### Consequences

* Good, because a mismatched pair says why in one place, on every page, in the status report and in one log line, instead of failing page by page, and Unfold stays open to fix it.
* Good, because a browser-less client (the MCP server, the editor extension) gets the same typed refusal from the API that the banner explains.
* Good, because Ploeg's CI fails on a change that breaks a recorded Unfold read, before any release.
* Good, because the requirement comes from a file the tests keep honest, not a number someone remembers to raise.
* Bad, because a shared execution running when the mismatch appears misses its heartbeats and is interrupted once the Ploeg lease runs out, as on any loss of Ploeg authority. Accepted: Unfold cannot keep authority over Ploeg it cannot speak to.
* Bad, because a new caller that reaches Ploeg without the operator client must take the gate too; [test/ploeg-compatibility.test.ts](../../apps/unfold/test/ploeg-compatibility.test.ts) names each one.
* Bad, because enum values and request headers are not recorded; Unfold must keep treating an unknown enum value as unknown.
* Bad, because the copy in Ploeg moves by hand until Unfold's release opens that pull request.
* Neutral: the version route is new in Ploeg; until the pin carries it, the 404 path is what runs, and the test skips the route's definition while the pinned bundle lacks it.

### Confirmation

* `mise exec -- npm test` in `apps/unfold` runs `test/ploeg-compatibility.test.ts`: compatible, legacy and two-major Ploeg answers are compatible; a missing major is incompatible, names both versions and logs once; an unreachable Ploeg keeps the last answer; while incompatible `/readyz` answers 200, `/healthz` and `GET /api/status` report the mismatch, Unfold's own sessions stay readable, and a Ploeg read answers 503 `ploeg_contract_incompatible` with nothing reaching the fake Ploeg; once compatible the same read reaches Ploeg; the client, execution authority, delivery, task binding and the linked hand-off each refuse before sending; the client parses the route, reads 404 as legacy and refuses a malformed answer; and the expectation set covers every operator route `src/ploeg.ts` requests and resolves in the pinned bundle. `test/status-view.test.mjs` checks the banner's words and that the shell draws it on every page and not without a mismatch.
* Mutation, 2026-10-24: renaming a recorded route and a read pointer in `src/ploeg-expectations.json` failed the coverage and schema tests; making `/readyz` ignore the monitor failed the readiness test.
* Mutation, 2026-10-24, after the owner's decision: making the refusal a no-op, refusing a compatible Ploeg, removing the guard from the client's request, the execution authority, delivery, task binding or the linked hand-off, refusing the version probe, answering 503 from `/readyz` again, leaving `ploegContract` out of the status report, rendering no banner and leaving the banner out of the shell each failed at least one of those tests; unmutated, they pass.
* Ploeg's `TestEveryRecordedConsumerExpectationHolds` runs this file from `docs/contracts/consumers/unfold/` on every Ploeg pull request.
* `mise run verify` runs `npm test`.

## Pros and Cons of the Options

### Check the same way, but fail readiness on a mismatch

* Good, because a mismatched pair leaves the Service and Kubernetes reports it, with no banner to build.
* Bad, because the chart runs one replica with `Recreate`, so not ready takes the whole tool offline, including the screens the owner uses to fix the mismatch.
* Bad, because every client then sees only an unreachable Unfold, never the reason.

### Compare Ploeg's release version with a supported range

* Good, because it needs no new Ploeg route.
* Bad, because a release version says nothing about which contracts changed, so the range is either too narrow, refusing working pairs, or too wide.

## More Information

* Implements the runtime check of ADR-0018 section 2 and the consumer half of its section 6 with the narrower, derived contract version Ploeg ADR 0147 chose; ADR-0018's banner and blocked calls are decided here; its bundle and release-train proposals are not.
* Builds on [ADR-0039](adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md), whose pinned bundle the schema test reads, and [ADR-0043](adr-0043-an-unfold-release-is-one-chart-that-carries-the-ploeg-it-was-tested-with.md).
* Technical story: VIK-2398.
* 2026-10-24: proposed.
* 2026-10-24: owner decision on VIK-2398 Q2: Unfold stays ready on a mismatch and refuses only the calls to Ploeg behind a visible banner, because failing `/readyz` on a single `Recreate` replica takes the screens that fix the mismatch offline. Decision Outcome, Consequences, Confirmation and the options updated; the readiness option is now the one considered and not chosen.
