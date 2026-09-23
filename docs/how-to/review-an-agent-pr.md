---
type: how-to
audience: [owner]
owner: glide
last_verified: 2026-09-22
verified_by: "Read apps/ploeg pkg/worker/{task,worker}.go, pkg/shiftengine/{engine,reviewloop,publish}.go, pkg/store/store.go, pkg/httpapi/server.go and apps/vloer/public/ploeg.js at 6221579"
---

# Review an agent's pull request

Use this when an agent's pull request waits for you. Result: you merge it, or you send it back, based on evidence rather than the agent's own summary.

Terms: a **Shift** is one Team's whole attempt at a Work Item. It runs in **Rounds**; each **Run** is one **Role** (for example `builder` or `reviewer`) working once. A *writer* Role pushes code; a *reader* Role only reviews. See the [Ploeg glossary](../../apps/ploeg/docs/domain/glossary.md) and the [product glossary](../domain/glossary.md#review).

## What "ready for review" means today

A pull request is ready for you when its Work Item is in the `awaiting_review` state: the Shift closed successfully and a writer opened or updated the pull request. The ticket also receives Ploeg's comment ending in "Please review and merge". Ploeg never marks a pull request as a draft ([publish.go](../../apps/ploeg/pkg/shiftengine/publish.go)).

The Shift's close reason tells you why it stopped ([reviewloop.go](../../apps/ploeg/pkg/shiftengine/reviewloop.go)):

| Close reason | Meaning |
| --- | --- |
| `review_approved` | An agent reviewer approved. This is not a human review. |
| `plan_exhausted` | Every planned Round ran; no fix loop was configured or needed. |
| `fix_round_cap_reached` | The reviewer still requested changes when `maxFixRounds` ran out. |
| `budget_exhausted_before_fix_round` | The Shift pool could not pay for another fix round. |
| `budget exhausted: pool …, spent …, reserved …` | The Shift pool could not pay for the next planned Round. |
| `writing_run_failed_repeatedly`, `writing_run_killed_repeatedly` | The writer never finished ([failedwriter.go](../../apps/ploeg/pkg/shiftengine/failedwriter.go)). |

A Shift that closes with `review_approved` or `plan_exhausted` after a writer opened or updated the pull request settles the Work Item as `awaiting_review`. Every other close reason, and a `stuck` Run, settles it as `needs_human` ([engine.go](../../apps/ploeg/pkg/shiftengine/engine.go)). No agent merges, and Ploeg leaves the ticket open.

## Check the evidence

1. **Branch.** To confirm the pull request came from Ploeg, check that its head branch is `agent/vik-<ticket id>` for Vikunja and `agent/clickup-<ticket id>` for ClickUp ([branch.go](../../apps/ploeg/pkg/work/branch.go)). The base must be the branch routed for the project. The prompt also asks the writer to end each commit with a tracker reference (`VIK-<id>` for Vikunja, `clickup-<id>` for ClickUp) and an `Agent-Trace-Id: <alias>` trailer, and to put the reference in the pull request body ([task.go](../../apps/ploeg/pkg/worker/task.go)). Those are instructions, not enforced checks, so a missing trailer is a signal to look closer.
2. **Run outcomes.** In Vloer, open **Ploeg**, the Work Item, then **Execution & review**. Each Run shows its Role, Round, state, outcome and verdict. Ploeg sets `pr_opened` only when it finds a *new* open pull request on the branch after the Run, not because the agent said so ([worker.go](../../apps/ploeg/pkg/worker/worker.go), [resolveOutcome](../../apps/ploeg/pkg/worker/worker.go)). A `stuck` Run carries a reason under **Needs attention**.
3. **Reviewer verdicts and findings.** Ploeg posts each reader's findings on the pull request as a comment headed `### <role> — round <n>` ([publish.go](../../apps/ploeg/pkg/shiftengine/publish.go)). The verdict is `approve` or `request_changes`; a reader that is unsure leaves it empty ([task.go](../../apps/ploeg/pkg/worker/task.go)). Only a reader's `request_changes` reopens the writer ([reviewloop.go](../../apps/ploeg/pkg/shiftengine/reviewloop.go)). Readers in a Round before the pull request exists leave no comment; their findings reach the writer in its prompt and stay in the Run record.
4. **Spend.** Compare each Run's **Observed model cost** with its **Authorized spend**. Under managed auth, ploegd settles each finished Run from LiteLLM's spend logs once its key has been blocked for `PLOEG_LLM_SETTLE_AFTER` (default 15 minutes), and adds it to the Shift's **Recorded spend**. Until then the amount sits in **Reserved** and the observed cost is provisional ([managed workers](../../apps/ploeg/docs/ops/managed-workers.md#reconcile-uncertainty)). Settlement also fills the Run's **Input / output tokens** from the same spend-log entries. If the Shift stopped for lack of budget, the pull request has a `### Budget exhausted` comment, and the ticket comment has a **Budget exhausted** line. Both give the spent, reserved and pool amounts.
5. **CI.** Check the pipeline status on the forge yourself. The prompt tells the writer to run the repository's gates in Docker before opening the pull request, but nothing verifies it did. **Not implemented yet:** Ploeg does not read CI results. The forge webhook parses `check_failed` events and only records them in the audit log ([server.go](../../apps/ploeg/pkg/httpapi/server.go), [forgejo.go](../../apps/ploeg/pkg/provider/forgejo/forgejo.go)).
6. **Diff.** Read the change against the ticket's acceptance conditions. The pull request description is the agent's claim, not evidence.

## Send it back

**Not implemented yet:** a human review comment on the pull request does not start another Round. The forge webhook "acts on nothing yet" ([server.go](../../apps/ploeg/pkg/httpapi/server.go)).

To ask for another attempt today:

1. Put the requested changes in the ticket description. The writer sees only the title, description and findings from earlier Rounds of the current Shift ([task.go](../../apps/ploeg/pkg/worker/task.go)).
2. Remove the assignee and assign it again. A new assignment of a `done`, `awaiting_review`, `needs_human` or `stale` Work Item re-queues it with its attempts reset ([store.go](../../apps/ploeg/pkg/store/store.go)). The new Shift reuses the branch, and the writer is told to push to the open pull request instead of opening a second one ([task.go](../../apps/ploeg/pkg/worker/task.go)).

## If it fails

| Symptom | Cause | Fix |
| --- | --- | --- |
| No findings comment on the pull request | Readers ran before a pull request existed, the Work Item has no resolved target, or no forge provider is configured | Check the Run's **Review findings** in Vloer; check ploegd's `findings not published` log line |
| Closed `review_approved` but the diff is wrong | An agent reviewer approved | Review the diff yourself; the verdict is not a human approval |
| Re-assigning does nothing | The Work Item is still `queued` or `leased` | Wait for the Shift to close, then re-assign |
| Pull request on another branch name | Not opened by a Ploeg writer, or the agent ignored the contract | Treat the pull request as unverified |

Background: [assign work to an agent](assign-work-to-an-agent.md), [ADR-0002](../adr/adr-0002-ploeg-is-the-only-engine.md) and [Ploeg ADR-0017](../../apps/ploeg/docs/adrs/0017-the-review-loop-is-verdict-driven-and-capped.md).
