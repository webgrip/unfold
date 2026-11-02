---
status: proposed
date: 2026-11-02
decision-makers: Ryan Grippeling
---

# Unfold shows why CI stopped a Work Item on every surface, and offers Ploeg's CI actions

## Context and Problem Statement

A Work Item's pull request is ready for review only when the forge's CI passed on its head ([Ploeg ADR-0119](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0119-a-pull-request-is-ready-for-review-only-when-the-forges-ci-passed-on-its-head.md)). Unfold shows one close reason, `ci_not_passed` or `ci_not_finished`, and nothing about which job failed or why. On 1 November 2026 a cancelled run on `webgrip/unfold` #794 parked Work Item 314, and the person could not tell from Unfold that a re-run in the forge was all it needed.

Ploeg will read CI through a CI port: jobs, the branch's required checks, the cause of each failure, a log excerpt, and actions to re-run CI, ignore a check for its gate and mark a check flaky (ploeg-hq ADR-0190, proposed; [pull request #411](https://github.com/ploeg-hq/ploeg/pull/411)). Where does Unfold show that, and how does a person act on it?

## Decision Drivers

* A person should see the cause and the next step where they already are, not only on Unfold's Work Item page.
* Ploeg is the Authority and owns CI's meaning ([ADR-0002](adr-0002-ploeg-is-the-only-engine.md)); Unfold renders Ploeg's facts and calls Ploeg's actions, and never reads CI from the forge itself.
* No lock-in ([ADR-0050](adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md)): any CI that reports commit statuses works; Forgejo Actions, GitHub Actions and GitLab CI get full adapters.
* Every action names its person, channel and confirmation ([ADR-0037](adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md)).

## Considered Options

For the surfaces, the owner chose from: the Work Item page, the tracker card, a pull request comment, and notifications with the MCP tools and the Agents window. For the CI systems with a full adapter: Forgejo Actions, GitHub Actions, GitLab CI and Bitbucket Pipelines.

## Decision Outcome

Chosen option: "**All four surfaces, with Unfold rendering Ploeg's CI facts and actions; full adapters for Forgejo Actions, GitHub Actions and GitLab CI**", because the cause belongs wherever the person looks, and one source of truth (Ploeg's CI facts) keeps the surfaces from disagreeing. The owner answered on 1 and 2 November 2026.

1. **Work Item page: the CI panel.** Unfold reads Ploeg's CI facts (`GET /api/v1/operator/work-items/{id}/ci`) and shows each job with its required flag, state, cause class (`change_failure`, `flaky`, `base_red`, `infrastructure`, `cancelled`, `queued`, `advisory`, `policy`) and a log excerpt link. Advisory jobs sit apart and never read as the reason. The actions **Re-run CI**, **Ignore for Ploeg** (with a reason) and **Mark as flaky** (with a reason) call Ploeg's routes after a confirmation. Where the CI cannot re-run, Re-run CI links to the forge's run instead.
2. **Tracker card.** Ploeg writes the card's status and one comment naming the cause (its tracker write-back). Unfold adds nothing on the card.
3. **Pull request.** Ploeg keeps one keyed comment, `ploeg-ci`, up to date. Unfold adds nothing on the pull request.
4. **Notifications, MCP and the Agents window.** A Work Item that CI stops notifies its people with the cause and the next step. The MCP tools `unfold_get_ci`, `unfold_rerun_ci`, `unfold_ignore_check` and `unfold_mark_check_flaky` and the Agents window offer the same reads and actions with the same confirmations.
5. **Reasons.** Unfold words each of Ploeg's new close reasons (`ci_change_failed`, `ci_base_red`, `ci_infrastructure`, `ci_cancelled`, `ci_policy`, and `ci_not_finished` counted from a job's start) with its cause and its fix. `ci_not_passed` keeps its wording for older Shifts.
6. **Ignore is not a merge.** Ignore for Ploeg only lets Ploeg move the Work Item on to review; the forge still requires its required checks to merge, including through Accept and merge ([ADR-0053](adr-0053-a-person-accepts-a-pull-request-in-unfold-and-ploeg-asks-the-forge-to-merge-it-at-that-head.md)).

How Ploeg handles each failure is Ploeg's decision (ADR-0190): only required checks gate, one automatic re-run before a fix round, a cancelled run pauses until it is re-run, a red base branch waits until it is green, infrastructure failures retry with backoff, and the fix round's agent gets the failing job's log excerpt.

### Consequences

* Good, because the cause and the fix appear on the board, the pull request, the phone and Unfold at once.
* Good, because Unfold holds no CI credentials and no CI vendor logic.
* Bad, because four surfaces must word the same cause; Ploeg words the tracker card and the pull request comment, and Unfold's reason copy covers its own three.
* Bad, because on Forgejo 15 neither re-run nor log reading exists in the API; the panel links to the forge for both until Forgejo offers them.

### Confirmation

Confirmed when Unfold's tests show that the CI panel renders every cause class from a Ploeg CI facts fixture, that advisory jobs never become the waiting reason, that each action calls its Ploeg route only after confirmation and with a reason where Ploeg needs one, that Re-run CI on a CI without re-run links to the forge and calls no Ploeg, that each new close reason has a sentence and a fix in `apps/unfold/public/core/reasons.js`, and that the MCP tools refuse without the person's confirmation.

## Pros and Cons of the Options

### The Work Item page only

* Good, because it is one place to build.
* Bad, because a person working from the board or the forge never sees the cause, as on 1 November.

### Bitbucket Pipelines now

* Bad, because Ploeg has no Bitbucket forge adapter yet; its statuses already work through the fallback.

## More Information

* Design and requirements: the [ci-integration change](../../openspec/changes/ci-integration/design.md) and its [spec](../../openspec/changes/ci-integration/specs/ci-integration/spec.md).
* Ploeg's half: ploeg-hq ADR-0189 ([pull request #408](https://github.com/ploeg-hq/ploeg/pull/408)) and ADR-0190 ([pull request #411](https://github.com/ploeg-hq/ploeg/pull/411)), both proposed.
* 2026-11-02: proposed.
