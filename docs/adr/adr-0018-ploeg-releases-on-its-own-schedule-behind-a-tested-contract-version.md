---
status: proposed
date: 2026-10-03
decision-makers: Ryan Grippeling
---

# Ploeg releases on its own schedule behind a tested contract version

## Context and Problem Statement

[ADR-0004](adr-0004-unfold-releases-one-version.md) releases the Unfold application and Ploeg under one `unfold-v…` version. It chose that because nobody ran the two applications at different versions, so a compatibility matrix was "pure overhead". Two things have changed:

* An external review recommends a neutral Ploeg core that can be released on its own and might later be hosted by a foundation. A core that only ships together with one front end is not neutral.
* The owner decided on 2026-10-03 that Ploeg may release independently, and asked: "what do we do with incompatibility?"

Today Unfold handles compatibility informally. Every operator response carries a `schemaVersion` (`"1.0"`, or `1` for cards), and `envelope` in [apps/unfold/src/ploeg.ts](../../apps/unfold/src/ploeg.ts) rejects any other value. Unfold handles an older Ploeg feature by feature: a 404 or 501 becomes "This Ploeg version does not provide … yet", and a card field an older Ploeg does not send stays absent. Nothing tells Unfold which Ploeg it is talking to. Nothing states which Unfold works with which Ploeg. The only test that runs real Ploeg with real Unfold, `TestOperatorWorkbenchQualification` in [apps/ploeg/pkg/httpapi/operator_workbench_qualification_test.go](../../apps/ploeg/pkg/httpapi/operator_workbench_qualification_test.go), uses Unfold from the same commit. The release pipeline also assumes a joint release. [on_release_published.yml](../../.forgejo/workflows/on_release_published.yml) publishes both applications from one `unfold-v…` tag. Since PR #146 (VIK-1747), `ploeg-release-distribute` waits for `unfold-release-distribute` to report `distributed=true`, and [scripts/publish_release.py](../../scripts/publish_release.py) lets only the last publisher (`PUBLISHES_LAST = 'ploeg'`) take the GitHub release out of draft.

How does Ploeg release without the Unfold application, and how do operators, Unfold and other clients of the operator API (such as the MCP server of [ADR-0011](adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md)) find out that a pair does not work together?

## Decision Drivers

* A Ploeg fix ships without a release of the Unfold application, and the reverse.
* An incompatible pair fails loudly and early with a message that names both versions. It never half-works and never falls back to standalone execution.
* Compatibility is tested, not assumed. A pair is called compatible only after real Ploeg and real Unfold pass the cross-application qualification together.
* People who do not want to think about pairs can install one version that is known to work.
* Keep every published identity: image, chart, extension and Go module names, and the zero-major candidate policy of Ploeg [ADR-0028](../../apps/ploeg/docs/adrs/0028-automatic-releases-stay-zero-major-candidates.md).
* The owner has about 4 hours a day. Every extra release train has to pay for itself.

## Considered Options

* Independent versions behind a tested operator contract version
* Keep one Unfold version for both applications
* Independent versions with a client generated from the schema, and no runtime contract check

## Decision Outcome

Chosen option: "Independent versions behind a tested operator contract version", because it is the only option that lets Ploeg ship alone and also answers the owner's question. A running pair checks its own compatibility. A release checks it before it publishes. A bundle names a pair that passed the check.

Nothing below is implemented yet. The follow-up tickets list the work.

### 1. ADR-0004 is superseded

This ADR supersedes ADR-0004 when it is accepted. It reverses ADR-0004's main rule, one version for both applications, so an amendment would leave a record that contradicts its own outcome. These parts of ADR-0004 stay: the zero-major candidate policy, the `glide-v0.3.0` baseline, Forgejo-only release-channel notes, and every artifact name. ADR-0012 is unaffected because the site already has its own train. On acceptance, ADR-0004's status becomes `superseded by ADR-0018`.

### 2. Ploeg's operator API has a contract version

* The **operator contract version** is `MAJOR.MINOR`, starting at `1.0`. It is separate from Ploeg's release version. Ploeg keeps it in a single Go constant and in the `$id` and `title` of [operator-api.v1.schema.json](../../apps/ploeg/docs/contracts/operator-api.v1.schema.json). The major version is the `v1` in the file name and in the `/api/v1/operator/` path.
* Ploeg exposes it in two places:
  * `GET /api/v1/operator/version` answers `{"schemaVersion": "1.0", "ploeg": "<release version>", "contract": {"version": "1.N", "majors": [1], "deprecations": [...]}}`. A consumer token is required, as for every operator route, so an unauthenticated caller learns nothing.
  * Every operator response carries the header `Ploeg-Contract: 1.N`, so a consumer can detect a Ploeg upgrade between two calls without polling.
* The existing per-response `schemaVersion` fields stay. They are envelope versions, and Unfold keeps checking them.
* Unfold declares the range it supports in one place, `ploegContract` in [apps/unfold/package.json](../../apps/unfold/package.json), for example `">=1.4 <2"`. The extension and the MCP server declare their own range in the same way.
* When Unfold starts, and again every time the `Ploeg-Contract` header changes, Unfold compares Ploeg's version with its range:
  * **Inside the range:** Unfold works normally. A newer minor version than Unfold knows is inside the range, because minor versions only add.
  * **Outside the range:** Unfold stays up but makes no managed execution, approval or cancellation call. Every page shows a blocking banner: "Unfold `<version>` supports Ploeg contract `<range>`; this Ploeg (`<release>`) offers `<contract>`. Upgrade Unfold or Ploeg to a pair from the compatibility matrix", with a link to the matrix. `/readyz` stays ready so the banner is reachable. A metric and a `ploeg.contract_incompatible` log event report the mismatch. Under the managed-execution rule, Unfold never falls back to standalone execution.
  * **Ploeg without `/version`** (any release before this change) counts as contract `1.0`. Unfold keeps its current per-feature 404 and 501 handling for it.
  * **Owner question Q1:** should Unfold refuse to start instead, so an orchestrator rollback catches the mismatch? This ADR proposes the banner because a refused start hides the reason from the person who opens Unfold.

### 3. The contract changes by expand and contract

* **Minor (`1.N` → `1.N+1`), additive only:** a new route, a new optional query parameter, a new response field, or a new enum value in a field that Unfold already treats as open. Unfold ignores fields it does not know and treats an unknown enum value as "unknown", never as an error. This tolerance is part of the contract and gets its own tests.
* **Deprecation:** before Ploeg removes or changes the meaning of a route, field or value, it lists the element in `contract.deprecations` with a `sunset` date, and it sends `Deprecation` ([RFC 9745](https://www.rfc-editor.org/rfc/rfc9745)) and `Sunset` ([RFC 8594](https://www.rfc-editor.org/rfc/rfc8594)) headers on the affected routes. Unfold logs a warning when it uses a deprecated element.
* **Major (`1.x` → `2.0`), removal or change of meaning:** this needs a new major contract version. Ploeg serves the old major next to the new one (`/api/v1/operator/` beside `/api/v2/operator/`) until the deprecation window ends.
* **Proposed deprecation window:** at least **60 days**, and at least one published Unfold bundle whose Unfold application no longer uses the deprecated element. Whichever ends later applies. **Owner question Q2:** is 60 days right? A hosted or foundation-run Ploeg with outside consumers probably needs 90 days or more. While the owner is the only adopter, 30 days would do.
* The contract version is independent of the release version. A breaking contract change raises Ploeg's minor release version under the zero-major policy, and it must also raise the contract major. Under ADR-0028, a breaking commit footer alone does not make a stable release.

### 4. An Unfold bundle pins a qualified pair

* An **Unfold bundle** is a release tagged `unfold-v<version>` that builds nothing. It publishes `unfold-bundle.json`, which pins one Ploeg release and one Unfold application release by version and by image, chart and extension digest. It also attaches the qualification evidence that pair produced.
* Only a pair that passed the cross-application qualification (section 6) may become a bundle. The bundle is what "install Unfold" means in [the docs](../index.md). Installing Ploeg and the Unfold application separately is supported but chooses from the matrix.
* A generated **compatibility matrix** page, `docs/reference/compatibility.md`, is built from the bundle manifests and the declared ranges. It lists every Ploeg release, its contract version, and the Unfold application releases that were qualified against it. A `mise run docs-compatibility` drift check keeps it current, like the other generated reference pages. Each bundle's release notes link the matrix.
* The bundle version continues the `unfold-v0.x.y-rc.N` sequence from `unfold-v0.4.0-rc.34`. It raises the minor version when either pinned component raises its minor version, and the rc number otherwise. **Owner question Q3:** should a bundle be cut automatically after every component release that qualifies, or only on request?

### 5. Release pipeline changes

* The single train in [apps/.releaserc.cjs](../../apps/.releaserc.cjs) splits into two semantic-release packages:
  * `apps/ploeg/.releaserc.cjs`: `package-path: apps/ploeg`, `package-name: ploeg`, tags `ploeg-v<version>`.
  * `apps/unfold/.releaserc.cjs`: `package-path: apps/unfold`, `package-name: unfold`, tags `vloer-v<version>`.
  Both keep the release policy plugin, the zero-major rule and the `site` exclusion. [scripts/release-prepare.mjs](../../scripts/release-prepare.mjs) splits so that each train sets only its own charts and manifests.
* The first component release on each train must be above every published version, including the Go module tag `github.com/webgrip/ploeg@v0.4.0-rc.34` and the Open VSX extension `0.4.0-rc.34`. Both trains start at `0.5.0-rc.1`. The historical `ploeg-v0.3.0-rc.*` and `vloer-v0.3.0-rc.*` tags stay and are not reused.
* `on_source_change.yml` runs `ploeg-release` and `unfold-release` in sequence, because both push a version commit to `development`. Running them in sequence is what [the tag race](../../scripts/release-repair.mjs) already requires.
* `on_release_published.yml` routes by tag prefix. A `ploeg-v…` tag runs only the Ploeg jobs (images, chart, signing, Go module export). A `vloer-v…` tag runs only the Unfold jobs (images, chart, extension). In [scripts/publish_release.py](../../scripts/publish_release.py), `release_tag` maps each application to its own prefix, and each component release leaves draft as soon as its own publisher finishes. `PUBLISHES_LAST` becomes unnecessary for component releases.
* The joint barrier from PR #146 moves to the bundle. A `unfold-v…` bundle stays in draft until both pinned component releases are published (not draft), their `release-artifacts-*.json` evidence matches the pinned digests, and the qualification evidence is attached. Only then does the bundle publisher take it out of draft on Forgejo and GitHub. A component release never waits for the other component.
* [scripts/workflow-policy.test.cjs](../../scripts/workflow-policy.test.cjs) and [scripts/release-isolation.test.cjs](../../scripts/release-isolation.test.cjs) gain the matching rules: each train reads only its own tags, each publisher accepts only its own prefix, and the bundle publisher requires published components and evidence.

### 6. Contract tests are the release gate

* **Same-commit qualification (exists):** `mise run verify` keeps running `TestOperatorWorkbenchQualification` and `TestOperatorWorkbenchInferenceQualification` with the real Go server and Unfold from the same commit.
* **Cross-version qualification (new):** the same tests run with `PLOEG_WORKBENCH_PATH` pointing at a checkout of another Unfold release. Before a `ploeg-v…` release, they run against every Unfold in the current bundle and the previous one. Before a `vloer-v…` release, they run against the Ploeg in the current bundle and the oldest Ploeg inside Unfold's declared range. A failure blocks the release.
* **Schema conformance (new):** a Go test validates every operator response that the qualification records against `operator-api.v1.schema.json`. An Unfold test feeds the parsers in `ploeg.ts` fixtures generated from the schema, including unknown extra fields and enum values, and requires that they do not fail.
* **Contract diff (new):** a check compares the operator schema with the one at the last `ploeg-v…` tag. It fails when a route, required field or enum value disappears without a new contract major or a deprecation entry whose sunset date has passed. It also fails when the schema changes but the contract minor does not.

### Consequences

* Good, because Ploeg can ship a fix, or be adopted by a neutral home, without a release of the Unfold application.
* Good, because the owner's question has an answer at three points: the contract diff stops a release, the cross-version qualification stops a pair, and the running Unfold shows a banner instead of half-working.
* Good, because the bundle and the matrix give people a version that is known to work, and the matrix gives operators the facts that ADR-0004 did not provide.
* Good, because the MCP server and any later client get the same contract and the same deprecation signals.
* Bad, because there are now three release trains (Ploeg, the Unfold application and the bundle) plus the site. That is more jobs, previews and notes than ADR-0004 removed, and the [notes loss](../research/2026-09-23-forgejo-notes-loss.md) behind ADR-0004 has more surface to recur on.
* Bad, because cross-version qualification multiplies qualification time by the number of pairs tested and needs old checkouts and their toolchains in CI.
* Bad, because every Ploeg change to the operator API now also needs a contract version decision and, for removals, a waiting period.

### Confirmation

When this ADR is implemented:

* `mise run release-check` passes with the new isolation and workflow-routing rules: separate `ploeg-v…` and `vloer-v…` trains, prefix-routed publishers, and a bundle publisher that refuses unpublished components or missing evidence.
* `mise run verify` runs the contract diff, schema conformance and same-commit qualification. The release jobs run the cross-version qualification and attach its evidence.
* A Go test asserts that `GET /api/v1/operator/version` and the `Ploeg-Contract` header report the same version as the schema's `title`.
* An Unfold test starts Unfold against a fake Ploeg whose contract is outside `ploegContract` and asserts the banner, the blocked managed calls and the `ploeg.contract_incompatible` event.
* `mise run docs-check` fails when `docs/reference/compatibility.md` does not match the published bundle manifests.

## Pros and Cons of the Options

### Independent versions behind a tested operator contract version

* Good, because each application ships when it is ready, and an incompatible pair is caught before release and again at run time.
* Good, because it builds on what exists: the `schemaVersion` envelopes, Unfold's tolerance of an older Ploeg, the versioned schema and the real-server qualification.
* Bad, because it adds a contract version to maintain, a deprecation discipline, more release trains and longer qualification.

### Keep one Unfold version for both applications

* Good, because there is one version, one train, and no possible incompatible pair to reason about.
* Good, because the joint barrier from PR #146 already makes the joint release correct.
* Bad, because every Ploeg fix waits for, and republishes, an unchanged Unfold.
* Bad, because a Ploeg that cannot ship without one particular front end is not the neutral, independently releasable core the review recommends, and it would block foundation hosting.
* Bad, because it does not answer the owner's question once anyone runs another client (the MCP server, the extension, a third-party front end) at a different version.

### Independent versions with a client generated from the schema, and no runtime contract check

* Good, because Unfold's hand-written types in `ploeg.ts` (over 1,000 lines) would follow the schema automatically, which removes a whole class of drift.
* Good, because the generated types fail at compile time when the schema at a given Ploeg version changes.
* Bad, because a compile-time check covers only the Ploeg version the client was generated from. At run time, an older or newer Ploeg is still unknown, so the owner's question stays unanswered.
* Bad, because `ploeg.ts` validates more than shapes: it degrades older-Ploeg answers, bounds and redacts values, and keeps facts Ploeg does not know as null rather than zero. A generator would replace the types, not that logic.
* Neutral, because generation can still be added later under this decision. It is a follow-up candidate, not an alternative to a contract version.

## More Information

* Technical story: VIK-1756, "Ploeg releases on its own schedule with a tested compatibility contract".
* 2026-10-03 — The owner allowed Ploeg to release independently and asked how incompatibility is handled. This ADR was proposed in answer.
* 2026-10-03 — The [release floor audit](../research/2026-10-03-release-floors-and-identity.md) (VIK-1794) found that the highest Go module version from the joint train is `v0.4.0-rc.32`, not `v0.4.0-rc.34`, and that Ploeg's withdrawn `1.0.0-rc.1` is still published in the Go module proxy, GHCR and Forgejo. `0.5.0-rc.1` is above every recorded floor for both applications. [scripts/release-floors.json](../../scripts/release-floors.json) and the release policy now refuse a version at or below a floor or an existing tag.
* Supersedes [ADR-0004](adr-0004-unfold-releases-one-version.md) once accepted. Until then, ADR-0004 stays in force.
* Builds on [ADR-0001](adr-0001-unfold-contains-independent-applications.md) (independently deployable applications), [ADR-0002](adr-0002-ploeg-is-the-only-engine.md) (Unfold is Ploeg's front end, with no standalone fallback for managed work) and [ADR-0012](adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md) (a precedent for a second train in this repository).
* Applies to the consumer of [ADR-0011](adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md): the MCP server declares a contract range like Unfold.
* Owner questions:
  * Q1. Should Unfold outside its range show a banner and block managed calls (proposed), or refuse to start?
  * Q2. Is 60 days the right deprecation window, and should it grow when Ploeg is hosted or foundation-run?
  * Q3. Should a bundle be cut automatically after every component release that qualifies, or only on request?
  * Q4. Should the Unfold application also leave the bundle version for its own `vloer-v…` train (proposed), or should only Ploeg split off while Unfold releases as part of the bundle?
  * Q5. Should the contract version cover only the operator API, or also Ploeg's worker-facing contracts (`run-api`, `checkpoint`, `outcomereport`, `taskspec`) that executors from other releases may call?
* 2026-10-03 — [ADR-0019](adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md) moved Ploeg to its own repository instead of splitting the train here, so sections 1 and 5 no longer apply: ADR-0019 supersedes ADR-0004, and Ploeg releases from github.com/ploeg-hq/ploeg. The contract version, bundles and cross-version qualification remain proposed and now apply across the two repositories.
* Follow-up tickets, to file when the ADR is accepted:
  1. Ploeg: contract version constant, `GET /api/v1/operator/version`, the `Ploeg-Contract` header and deprecation and sunset headers, with tests.
  2. Unfold: `ploegContract` range, the startup and header-change check, the banner, blocked managed calls and the `ploeg.contract_incompatible` event, with tests. The extension and the MCP server follow.
  3. Contract diff check and schema conformance tests in `mise run verify`.
  4. Cross-version qualification: run the workbench qualification against an Unfold or Ploeg checkout from a tag, and attach its evidence to the release.
  5. Split the release train into `ploeg-v…` and `vloer-v…`, split `release-prepare.mjs`, route `on_release_published.yml` and `publish_release.py` by prefix, and update the release policy tests.
  6. Bundle release: `unfold-bundle.json`, the bundle publisher, the joint barrier moved from #146, and the GitHub mirror.
  7. Generated compatibility matrix page with its drift check, and install docs that point at the bundle.
  8. On acceptance, mark ADR-0004 `superseded by ADR-0018` and update the current pages that state the one-version rule.
