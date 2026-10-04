---
type: how-to
audience: [owner]
owner: unfold
last_verified: 2026-09-29
verified_by: "Read apps/ploeg pkg/worker/{task,worker}.go, pkg/shiftengine/{engine,reviewloop,publish,review}.go, pkg/store/{store,review}.go, pkg/httpapi/server.go, cmd/ploegd/{main,sweep}.go and apps/vloer/public/ploeg.js on 2026-09-23. On 2026-09-30 the Vloer sections were re-read against apps/vloer at 68c90cf on feat/vloer-redesign, after the screen rebuild (public/shell.js, core/route.js, core/counts.js, now.js, ploeg.js, views/now.js, views/work.js; src/ploeg.ts) Read apps/ploeg pkg/shiftengine/{usage,publish,engine}.go, pkg/store/{usage,llm_settlement}.go, pkg/provider/provider.go, cmd/ploegd/{main,sweep}.go and ops/helm/ploeg/values.yaml on 2026-09-29"
---

# Review an agent's pull request

Use this when an agent's pull request waits for you. Result: you merge it, or you send it back, based on evidence rather than the agent's own summary.

Terms: a **Shift** is one Team's whole attempt at a Work Item. It runs in **Rounds**; each **Run** is one **Role** (for example `builder` or `reviewer`) working once. A *writer* Role pushes code; a *reader* Role only reviews. See the [Ploeg glossary](../../apps/ploeg/docs/domain/glossary.md) and the [product glossary](../domain/glossary.md#review).

## What "ready for review" means today

A pull request is ready for you when its Work Item is in the `awaiting_review` state: the Shift closed successfully and a writer opened or updated the pull request. The ticket also receives Ploeg's comment ending in "Please review and merge". Ploeg never marks a pull request as a draft ([publish.go](../../apps/ploeg/pkg/shiftengine/publish.go)).

The Shift's close reason tells you why it stopped ([reviewloop.go](../../apps/ploeg/pkg/shiftengine/reviewloop.go)):

| Close reason | Meaning |
| --- | --- |
| `review_approved` | An agent reviewer returned an explicit approval. This is not a human review. |
| `plan_exhausted` | Every planned Round ran and no fix loop was configured, or the last reviewer gave no verdict. |
| `review_failed` | No agent reviewed the pull request. A reviewer Run failed, was retried under the writer's attempt budgets, and failed every time ([failedreader.go](../../apps/ploeg/pkg/shiftengine/failedreader.go), [ADR-0043](../../apps/ploeg/docs/adrs/0043-a-failed-reading-run-is-retried-and-a-missing-review-closes-review-failed.md)). Review it yourself. |
| `fix_round_cap_reached` | The reviewer still requested changes when `maxFixRounds` ran out. |
| `budget_exhausted_before_fix_round` | The Shift pool could not pay for another fix round. |
| `budget exhausted: pool …, spent …, reserved …` | The Shift pool could not pay for the next planned Round. |
| `writing_run_failed_repeatedly`, `writing_run_killed_repeatedly` | The writer never finished ([failedwriter.go](../../apps/ploeg/pkg/shiftengine/failedwriter.go)). |

A Shift that closes with `review_approved`, `plan_exhausted` or `review_failed` after a writer opened or updated the pull request settles the Work Item as `awaiting_review`. A `plan_exhausted` or `review_failed` close whose last review after that writer asked for changes settles as `needs_human` instead. Every other close reason, and a `stuck` Run, settles it as `needs_human` ([engine.go](../../apps/ploeg/pkg/shiftengine/engine.go)). No agent merges. The ticket stays open until you merge or close the pull request; see [After you merge or close](#after-you-merge-or-close).

## Find what waits for you

Vloer opens on **Now**, which lists what waits on you across your Teams. **Ready for your review** comes first: the Work Items in `awaiting_review`, each with a **Pull request** button when Vloer found the link, and the agent reviewer's verdict when a recently finished Run reported one. **Needs you** and **Proposed** follow. The count on **Now** in the sidebar and in the browser tab is the number of items in that list ([now.js](../../apps/vloer/public/now.js)). For one Team, open **Work** and choose the **Ready for review** lane; each row reads, for example, "PR #5 · Agent approved". Select a Work Item to open its page, `#work/<id>`. Under the title, **Problem and solution** gives the writing agent's own account of what was wrong and what its pull request changes. Read it first, then check it against the diff. For a Work Item in `awaiting_review`, the box **Ready for your review** follows, above the full history ([ploeg.js](../../apps/vloer/public/ploeg.js)). For the Shift that settled the Work Item it shows:

- **Open pull request #N**, a link to the pull request on the forge. Vloer takes it from the newest checkpoint, or else from the Runs' links. If Ploeg recorded neither, the box says so and you find the pull request by its branch.
- A receipt: the agent reviewer's verdict (never presented as a human review), the number of findings, the Rounds, the time the Shift took, the branch, and the spend against the Shift's budget. **Read the findings** jumps to the reviewer's Run.
- **Before you merge**, a checklist that only turns green on data Vloer has. CI always reads "not reported", because Vloer does not read CI. Spend is green only when Ploeg settled it within the budget; an amount Ploeg did not report reads **Not reported**, never `US$ 0,00`. It also names **instruction files** a reviewer's findings mention: `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/`, `.openhands/`, `.mcp.json` or `.cursorrules`. Ploeg has no structured flag for this. Vloer matches the findings text, so check those files in the diff yourself.
- **On the forge**, what merging, requesting changes and closing without merging will do. Its line for requesting changes holds only on Forgejo and when the Team sets `forgeFollowUps.reworkOnChangesRequested`; see [Send it back](#send-it-back).

Further down the page are the brief, the Round ladder with each Run's Role, outcome, verdict and findings, the Shift's spend, and the audit events.

Vloer does not merge. You merge or send the work back on the forge and in the tracker. To withdraw the Work Item instead, operators and administrators have **Cancel Work Item** at the top of the page; it leaves the pull request on the forge ([stop it](assign-work-to-an-agent.md#stop-it)).

## Check the evidence

1. **Branch.** To confirm the pull request came from Ploeg, check that its head branch is `agent/vik-<ticket id>` for Vikunja and `agent/clickup-<ticket id>` for ClickUp ([branch.go](../../apps/ploeg/pkg/work/branch.go)). The base must be the branch routed for the project. The prompt also asks the writer to end each commit with a tracker reference (`VIK-<id>` for Vikunja, `clickup-<id>` for ClickUp) and an `Agent-Trace-Id: <alias>` trailer, and to put the reference in the pull request body ([task.go](../../apps/ploeg/pkg/worker/task.go)). Those are instructions, not enforced checks, so a missing trailer is a signal to look closer.
2. **Run outcomes.** On the Work Item's page in Vloer, the Round ladder and the Runs list show each Run's Role, Round, state, outcome and verdict. Ploeg sets `pr_opened` only when it finds a *new* open pull request on the branch after the Run, not because the agent said so ([worker.go](../../apps/ploeg/pkg/worker/worker.go), [resolveOutcome](../../apps/ploeg/pkg/worker/worker.go)). A `stuck` Run carries its stuck reason.
3. **Reviewer verdicts and findings.** Ploeg posts each reader's findings on the pull request as a comment headed `### <role> — round <n>` ([publish.go](../../apps/ploeg/pkg/shiftengine/publish.go)). The verdict is `approve` or `request_changes`; a reader that is unsure leaves it empty ([task.go](../../apps/ploeg/pkg/worker/task.go)). Among agents, only a reader's `request_changes` reopens the writer; a person's review can too, see [Send it back](#send-it-back) ([reviewloop.go](../../apps/ploeg/pkg/shiftengine/reviewloop.go)). Readers in a Round before the pull request exists leave no comment; their findings reach the writer in its prompt and stay in the Run record.
4. **Spend.** Compare each Run's observed model cost with its authorized spend. Under managed auth, ploegd settles each finished Run from LiteLLM's spend logs once its key has been blocked for `PLOEG_LLM_SETTLE_AFTER` (default 15 minutes), and adds it to the Shift's recorded spend. Until then the amount counts as reserved and the observed cost is provisional ([managed workers](../../apps/ploeg/docs/ops/managed-workers.md#reconcile-uncertainty)). Settlement also fills the Run's input and output tokens from the same spend-log entries. If the Shift stopped for lack of budget, the pull request has a `### Budget exhausted` comment, and the ticket comment has a **Budget exhausted** line. Both give the spent, reserved and pool amounts.
5. **CI.** Check the pipeline status on the forge yourself. The prompt tells the writer to run the repository's gates in Docker before opening the pull request, but nothing verifies it did. If the Team sets `forgeFollowUps.repairFailedChecks`, a failed check on this branch queues a repair Follow-Up that pushes to the same pull request, up to `maxRepairs` times ([how work flows](../concepts/how-work-flows.md#forge-events-that-act)). Wait for that repair before you review. Without the switch, Ploeg only records the failure in the audit log ([forge_followup.go](../../apps/ploeg/pkg/httpapi/forge_followup.go), [forgejo.go](../../apps/ploeg/pkg/provider/forgejo/forgejo.go)).
6. **Diff.** Read the change against the ticket's acceptance conditions. The pull request description is the agent's claim, not evidence.

## Read the usage and evidence report

Every agent pull request carries one comment headed `### Ploeg usage report`, marked with a hidden `<!-- ploeg:usage-report -->` line. Ploeg creates it when a writing Run opens or updates the pull request and edits that same comment on every later Round and again when the settlement sweep reconciles a Run's account. There is only ever one, so read the comment rather than scrolling the thread ([usage.go](../../apps/ploeg/pkg/shiftengine/usage.go), [publish.go](../../apps/ploeg/pkg/shiftengine/publish.go)).

It answers three questions in one place:

- **What ran.** A table of each finished Run with its Role, Round, whether it wrote, its Outcome and its verdict, the models the gateway billed it against, and prompt/completion tokens. The Shift's totals follow: authorized, spent, reserved and remaining pool, the Rounds used and the close reason, and the writing Run's trace alias `ploeg-<12hex>`.
- **What it cost.** Each Run's settled cost in US dollars to two decimals (`US$ 0,06`). A Run whose account has not been reconciled yet is marked **(provisional)**; the header says so too. A Run whose gateway spend Ploeg could not read shows **unavailable** rather than a guess — Ploeg never prints the authorization as if it were the cost.
- **Did it check its work.** The **Evidence** section names the writing Run's verification result (`passed`, `failed (<command>)` or `incomplete (<reason>)`) and the commit it verified, and points you at the writing Run's findings comment for the full output. When Ploeg recorded no verification — a reading Role, no configured checks, or a Shift older than worker verification — it says **verification: not recorded**; it never leaves a blank that could read as a pass.

When the deployment sets `PLOEG_REPORT_GRAFANA_URL` and `PLOEG_REPORT_VLOER_URL`, a **Where to dig deeper** section links the Unfold — Loop dashboard for the Team, the Run Explorer for this Run (filtered by the trace alias), Spend & Attribution, and the Work Item's page in Vloer. Unset base URLs simply omit those links ([values.yaml](../../apps/ploeg/ops/helm/ploeg/values.yaml)).

The report is accounting Ploeg reads from what it already stored; it makes no gateway call and is not a billing statement. Turn it off with `PLOEG_USAGE_REPORT=false` if a deployment finds it noisy.

## After you merge or close

Ploeg notices what you did on the forge and moves the Work Item out of `awaiting_review` ([review.go](../../apps/ploeg/pkg/shiftengine/review.go)):

| You | Work Item | Ticket |
| --- | --- | --- |
| Merge the pull request | `done` | A comment saying the pull request was merged. The ticket stays open by default, because Ploeg's policy treats a ticket as done only once the change runs in production. With `PLOEG_TRACKER_DONE_ON_MERGE=true` Ploeg also marks it done where the tracker supports it: Vikunja when write-backs are configured, ClickUp when `PLOEG_CLICKUP_DONE_STATUS` is set. |
| Close it without merging | `needs_human` | A comment saying the pull request was closed. The ticket stays open. |

Ploeg learns this in two ways:

1. **Webhook.** A Forgejo `pull_request` event with action `closed`, or a GitLab merge request event with action `merge` or `close`, settles the Work Item at once ([forgejo.go](../../apps/ploeg/pkg/provider/forgejo/forgejo.go), [gitlab.go](../../apps/ploeg/pkg/provider/gitlab/gitlab.go)). Subscribe the forge webhook to pull request events for this. The webhook needs Ploeg's webhook secret for that forge, or ploegd rejects it ([forge webhooks](../../apps/ploeg/docs/ops/ci-and-infra.md#forge-webhooks)).
2. **Reconcile.** Every `PLOEG_REVIEW_RECONCILE_INTERVAL` (default 10 minutes, `0` turns it off), ploegd asks the forge for the state of each `awaiting_review` pull request ([sweep.go](../../apps/ploeg/cmd/ploegd/sweep.go)). A missed webhook therefore delays the move by at most one interval.

Both paths need a forge provider (`PLOEG_FORGEJO_URL` or `PLOEG_GITLAB_URL`) and a Work Item whose target repository resolved. An item that ran on the worker's fallback repository stays `awaiting_review` until its ticket is assigned again, and you update the ticket yourself.

## Send it back

If the Team sets `forgeFollowUps.reworkOnChangesRequested`, submit a review on the forge that **requests changes** and put what you want in the review body. Ploeg queues the Work Item again. The new Shift works the same branch, and its writer receives your review body as a finding. With an empty body, the writer is told to read the review's line comments on the pull request instead ([forge_followup.go](../../apps/ploeg/pkg/httpapi/forge_followup.go)). If a Shift is still running, its plan finishes first and then runs a fix Round for your review. Only Forgejo reviews are classified today. A plain comment or an approval sends nothing back.

Without that switch, or on GitLab, ask for another attempt this way:

1. Put the requested changes in the ticket description. The writer sees only the title, description and findings from earlier Rounds of the current Shift ([task.go](../../apps/ploeg/pkg/worker/task.go)).
2. Remove the assignee and assign it again. A new assignment of a `done`, `awaiting_review`, `needs_human` or `stale` Work Item re-queues it with its attempts reset ([store.go](../../apps/ploeg/pkg/store/store.go)). The new Shift reuses the branch, and the writer is told to push to the open pull request instead of opening a second one ([task.go](../../apps/ploeg/pkg/worker/task.go)).

## If it fails

| Symptom | Cause | Fix |
| --- | --- | --- |
| No findings comment on the pull request | Readers ran before a pull request existed, the Work Item has no resolved target, or no forge provider is configured | Open the reviewer's Run on the Work Item's page in Vloer and read its **Findings**; check ploegd's `findings not published` log line |
| No usage report comment, or its costs say unavailable | The report is switched off, there is no pull request yet, or a Run's gateway spend could not be read | Check `PLOEG_USAGE_REPORT` and the two base URLs; check ploegd's `usage report` log lines. A Run marked **unavailable** had no readable spend log |
| Closed `review_approved` but the diff is wrong | An agent reviewer approved | Review the diff yourself; the verdict is not a human approval |
| Re-assigning does nothing | The Work Item is still `queued` or `leased` | Wait for the Shift to close, then re-assign |
| Work Item still `awaiting_review` after a merge | The webhook did not arrive and the reconcile has not run yet, the target never resolved, or the forge read failed | Wait one `PLOEG_REVIEW_RECONCILE_INTERVAL`; check ploegd's `review reconcile` log lines |
| Pull request on another branch name | Not opened by a Ploeg writer, or the agent ignored the contract | Treat the pull request as unverified |

Background: [assign work to an agent](assign-work-to-an-agent.md), [ADR-0002](../adr/adr-0002-ploeg-is-the-only-engine.md) and [Ploeg ADR-0017](../../apps/ploeg/docs/adrs/0017-the-review-loop-is-verdict-driven-and-capped.md).
