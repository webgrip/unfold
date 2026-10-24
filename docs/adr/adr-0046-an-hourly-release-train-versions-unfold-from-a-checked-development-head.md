---
status: proposed
date: 2026-10-24
decision-makers: Ryan Grippeling
---

# An hourly release train versions Unfold from a checked development head, and a push only checks

## Context and Problem Statement

Until this decision every push to `development` ran `on_source_change.yml`: about 45 minutes of `checks`, then `ploeg-pin`, then `release` and `site-release`. The workflow's concurrency group set `cancel-in-progress: false`, which Forgejo 15 turns into a queue (`QueueBehind` in `services/actions/workflows.go`): one run at a time, every newer push waiting behind it. Pull requests merge minutes apart on purpose, so each merge added a 45-minute run to a queue that grew faster than it drained, and each queued run held runner capacity that pull requests needed. Those queues were stopped by hand from the Actions list, and the release went with them, because the release lived inside each push run.

On 2026-10-24 no Unfold release was cut after `unfold-v0.4.0-rc.111` (07:29 UTC) although 17 application commits merged, among them the Ploeg pins to 0.2.0-rc.55, rc.57 and rc.58. Forgejo's request log shows every cancelled source run of that day as a `POST /webgrip/unfold/actions/runs/<n>/cancel` from a signed-in browser, sent in bursts of up to 20 runs (12:22:49: runs 2299 to 2308); Forgejo itself cancelled none. Two runs that were not stopped failed their checks (2291: `Stale landscape` after the rc.57 pin; 2277: `apps/unfold` tests). At the time the worker nodes were full on requests, so queued runs waited longer for a runner pod.

How does Unfold keep releasing while merges continue, without releasing a commit that did not pass the release checks?

## Decision Drivers

* Pull requests keep merging minutes apart; neither merge pace nor merge gates change.
* A release passes what it passes today: the full `checks`, `ploeg-pin` and the release policy.
* A release tags the commit those checks passed, not a newer head nobody checked.
* Stopping push runs to free runners must not stop releases.
* Runner capacity is short; a merge must not add a 45-minute job to a queue.

## Considered Options

* An hourly release train in its own queue that releases the development head it checked; a push only checks
* Keep releasing from each push, with `cancel-in-progress: true`
* Keep releasing from each push and its queue, and stop no source run by hand

## Decision Outcome

Chosen option: "**An hourly release train in its own queue that releases the development head it checked; a push only checks**", because it is the only option in which a stopped or superseded push cannot take a release with it, and in which the release still tags exactly the commit its checks passed.

1. **[on_release_train.yml](../../.forgejo/workflows/on_release_train.yml)** runs every hour at minute 7 and on command, only on `development` and only while `UNFOLD_RELEASES_ENABLED` is `true`. Its concurrency group `release-train` belongs to no other workflow, so a push neither cancels nor queues it.
2. **`pending`** checks out the branch head when the run starts, not the commit the run was queued for, and runs [scripts/release-train.sh](../../scripts/release-train.sh) `pending`. It outputs that head and whether it holds commits since the last `unfold-v` tag under `apps/` outside `apps/site`, or since the last `unfold-site-v` tag under `apps/site`, release commits excluded. With nothing unreleased the train ends there and takes no runner for checks.
3. **`checks`** and **`ploeg-pin`** run the push's jobs on that head: the same verification action, with no reuse of earlier gate results, and the same published-pin check.
4. **`release`** checks out the branch again, runs the release policy, then `release-train.sh current <checked head>`. Semantic release runs only when the branch head is still the checked commit, or that commit followed by release commits alone. When `development` moved during the checks, the job passes without versioning and the next train checks the newer head. **`site-release`** follows in the same train with the same head check, so a site candidate still comes after the Unfold release.
5. **[on_source_change.yml](../../.forgejo/workflows/on_source_change.yml)** keeps `checks`, `warnings` and `ploeg-pin` on every push and no longer versions Unfold. A newer `development` push cancels the older run (`cancel-in-progress` is true for every ref but `main`), so the queue no longer grows. A push to `main` still queues and still releases a stable site version, as [ADR-0012](adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md) decided.

### Consequences

* Good, because stopping or superseding a push run no longer drops a release; the next train picks the work up within the hour.
* Good, because a release tags only a commit that passed `checks` and `ploeg-pin`, which the push model did not ensure: when `development` moved, the semantic-release composite reset onto the newer head and released it.
* Good, because a merge adds at most one running push check per branch instead of a growing queue, and the train takes a runner only when an application has unreleased commits.
* Bad, because during a stretch where merges land less than about 50 minutes apart, the train's checks keep finding a newer head and no release is cut until a quiet window or a manual dispatch after the last merge. Accepted: releasing an unchecked head is the alternative.
* Bad, because a merge that lands in the minute or two semantic-release itself runs still meets the composite's reset-and-retry, which versions the newer head. The window is the release job's own duration, not the 45-minute check.
* Bad, because an Unfold candidate now waits up to an hour plus the checks after its merge, instead of the checks alone.
* Neutral: the pending check counts commits by path and release-commit subject; a commit that semantic-release would not version (a `docs` type under `apps/`) still starts one train, which then releases nothing.

### Confirmation

* [scripts/workflow-policy.test.cjs](../../scripts/workflow-policy.test.cjs), run by the release-policy action in every pull request and train and by `mise run release-check`, asserts the train's triggers, its own queue, the `pending` gate, that its `checks` and `ploeg-pin` equal the push's, the order release policy, head check, semantic release, and that no other workflow versions Unfold. It runs `release-train.sh` against a scratch repository: docs-only and release commits are not pending, a site or application commit is, a commit merged after the checked head or not behind the head is never current, and the Unfold release commit of the same train is.
* Mutation, 2026-10-24: dropping the release-commit filter from the script, the head check's `if` from semantic release, the push's `cancel-in-progress` expression, the train's own group, or the checked head from `checks` each failed the suite; unmutated, it passes.
* In operation: an `On Release Train` run each hour on the Actions list, and a new `unfold-v` tag within a quiet hour of an application merge.

## Amendment 2026-10-24: the train merges the waiting Ploeg pin first

Ploeg released 0.2.0-rc.61 at 13:16, rc.62 at 13:30 and rc.63 at 14:39 on 2026-10-24. Each pin pull request merged itself when its checks passed ([ADR-0041](adr-0041-a-ploeg-release-opens-unfolds-pin-pull-request-by-running-unfolds-recipe.md)), so `development` moved during the train's 45-minute check every time and no release was cut after `unfold-v0.4.0-rc.111`. The owner decided on 2026-10-24 (homelab RFC `rfc-unfold-release-train`, decision D14) that Ploeg's pin pull requests stop merging themselves and that the train merges a waiting pin before it reads the head.

1. **`merge-pin`** is the train's first job, with the same branch and `UNFOLD_RELEASES_ENABLED` gate as `pending`. It runs [scripts/release_train_pin.py](../../scripts/release_train_pin.py) with `WEBGRIP_CI_TOKEN`. The script lists the open pull requests into `development` from `ploeg/<version>` branches of this repository authored by `ploeg-release`, newest version first. It asks Forgejo to merge each in turn with a merge commit at the head it read (`head_commit_id`) and stops at the first merge. Forgejo refuses a merge with HTTP 405 while a required check of `development` has not passed or the branch conflicts, and with 409 when the head moved; the script reads those as "not green" and tries the next older pin. A 405 that refuses the CI bot itself (not allowed to merge, an unsigned merge, a disallowed merge style) and any other answer fail the job instead, so a broken token or protection does not pass as "no green pin". A pin the forge reports as conflicting is not asked. After a merge it comments on and closes every older pin pull request; a newer pin that is not green stays open.
2. **`pending`** needs `merge-pin` and runs when that job succeeded, failed or was skipped, but not when the run was cancelled. A pin that is not green, or a failed `merge-pin`, therefore leaves the train as it was before this amendment; the failure shows as a red job. `pending` checks out the branch head after the merge, so `checks`, `ploeg-pin` and `release` see the pin.
3. Ploeg's release stops asking Forgejo to merge the pin when the `RELEASE_CONSUMERS` entry carries `"merge": "by-consumer"` ([Ploeg ADR 0127](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0127-a-release-opens-each-consumers-update-by-running-the-consumers-own-recipe.md), amended the same day). Until that entry changes, a pin can still merge itself mid-check.

### Consequences of the amendment

* Good, because a Ploeg release no longer moves `development` during the train's checks; only people's merges do.
* Good, because the train picks the newest pin that passed, so a burst of Ploeg candidates becomes one pin merge per hour.
* Bad, because a pin now reaches `development` up to an hour later than a merge-when-green pin did.
* Bad, because `ploeg-release` and the CI bot both act on pin pull requests: Ploeg closes superseded ones when it opens a new one, the train closes the ones older than the pin it merged.
* Neutral: `merge-pin` relies on `development`'s protection to define "green". If the required checks were removed from it, the train could merge a pin whose checks failed; `checks` and `ploeg-pin` would still stop the release of that head.

### Confirmation of the amendment

* [scripts/test_release_train_pin.py](../../scripts/test_release_train_pin.py), run by `mise run verify`, fails when pins are not ordered by version precedence, when another author's, another base's, a fork's or a non-version branch counts as a pin, when a conflicting pin is asked to merge, when the merge is not a merge commit at the read head, when a refused newest pin stops an older green one from merging, when a newer pin is closed, when an older one stays open, or when an authentication or server error, or a 405 refusing the CI bot itself, reads as "not green".
* [scripts/workflow-policy.test.cjs](../../scripts/workflow-policy.test.cjs) fails when `merge-pin` loses the release gate, stops being the first job, passes the wrong author or token, hides its failure, or when another job merges pins; and when `pending` stops waiting for it, stops after its failure or continues after a cancel.
* Mutation, 2026-10-24: nine mutants of the script and seven of the workflow each failed the suites; unmutated, both pass.
* In operation: the first train after a Ploeg candidate shows a green `merge-pin` that names the pull request it merged, and the `fix(ploeg)` merge commit is authored by the CI bot.

## Pros and Cons of the Options

### Keep releasing from each push, with `cancel-in-progress: true`

* Good, because it is a one-line change.
* Bad, because a merge during the 45-minute checks cancels the run that would release, so with merges minutes apart no push run reaches `release`.
* Bad, because a newer push could cancel a release job midway between the tag and the release page.

### Keep releasing from each push and its queue, and stop no source run by hand

* Good, because it changes no workflow.
* Bad, because the queue grows by one 45-minute run per merge and holds runners that pull requests need while the cluster is short of them.
* Bad, because each queued release finds `development` moved and releases the newer, unchecked head.

## More Information

* Forgejo 15.0.10 source: `ConfigureActionRunConcurrency` in `services/actions/workflows.go` maps an explicit `cancel-in-progress: false` with a group to `QueueBehind`, which cancels nothing; only `CancelInProgress` calls `CancelPreviousWithConcurrencyGroup`. The runner's job parser (v12.10.2) evaluates an expression in `cancel-in-progress`.
* [CI and release workflows](../operations/ci.md) and [Troubleshoot CI and releases](../operations/ci-troubleshooting.md) describe the train in operation.
* 2026-10-24: proposed.
* 2026-10-24: amended. The train merges the newest green Ploeg pin pull request first, after the owner's decision D14 that Ploeg's pins stop merging themselves.
