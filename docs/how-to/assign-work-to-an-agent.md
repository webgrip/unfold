---
type: how-to
audience: [owner, operator]
owner: glide
last_verified: 2026-09-23
verified_by: "Read apps/ploeg pkg/config, pkg/httpapi/{server,withdraw,operator_activity}.go, pkg/store/withdraw.go, pkg/provider/{vikunja,clickup}, pkg/shiftengine, pkg/worker/worker.go, cmd/ploegd/main.go, ops/helm/ploeg/values.yaml and apps/vloer/src/ploeg.ts; go test ./pkg/httpapi -run Withdraw; apps/vloer npm test and npm run test:browser on feat/vloer-ploeg-activity. On 2026-09-30 the Vloer sections were re-read against apps/vloer at 68c90cf on feat/vloer-redesign, after the screen rebuild (public/shell.js, core/route.js, core/live.js, core/reasons.js, views/, now.js, ploeg.js, ploeg-activity.js; src/http.ts, src/ploeg.ts)"
---

# Assign work to an agent

Use this to hand a tracker ticket to agents. Result: Ploeg dispatches a [Run](../../apps/ploeg/docs/domain/glossary.md#run), the agent opens a pull request on branch `agent/vik-<ticket id>` for Vikunja and `agent/clickup-<ticket id>` for ClickUp, and the ticket gets a comment with the link.

Terms: a **Work Item** is Ploeg's copy of your ticket. A **Team** is a named roster of agent **Roles**. A **Shift** is one Team's whole attempt at a Work Item, split into **Rounds**. A **Run** is one Role working once, and a **Lease** is the writer's exclusive right to push to the branch. See the [glossary](../reference/glossary.md).

**Before you start:** Ploeg runs with managed worker authentication ([managed workers](../../apps/ploeg/docs/ops/managed-workers.md)), the chart's `executor.enabled` is `true` (it defaults to `false` in [values.yaml](../../apps/ploeg/ops/helm/ploeg/values.yaml)), and the repository is [prepared](prepare-a-repository.md).

## Configure the board and team

1. To route a tracker project to a repository, add it to the file that `PLOEG_CONFIG` points at (the chart's `config:` value). The keys come from [config.go](../../apps/ploeg/pkg/config/config.go). Example:

   ```yaml
   trackers:
     vikunja:
       projects:
         - name: "Ploeg Test"   # resolved to an id when ploegd starts
           repo: webgrip/ploeg
           branch: development  # pin it; unset means the repo default
   teams:
     bronze:
       assignees: [jake]
       plan:                    # omit for one writer
         pool: "6"
         maxFixRounds: 2
         rounds:
           - roles: [{name: builder, writes: true, cap: "3.00"}]
           - roles: [{name: reviewer, writes: false, cap: "0.75"}]
   ```

   To let one board send tickets to several repositories, register the repositories under `targets:` and give the board a `default:` and an `allow:` list; a ticket then picks one with a `repo/<target>` label ([route a board that serves several repositories](../../apps/ploeg/docs/how-to/route-a-multi-repo-board.md)).

   ploegd refuses to start if a name matches no project ([resolve.go](../../apps/ploeg/pkg/config/resolve.go)). ClickUp entries need `id:` (the List id), because ClickUp name lookup is not implemented ([config.go](../../apps/ploeg/pkg/config/config.go)). A project's `team:` pin only applies to entries with an `id:` ([resolve.go](../../apps/ploeg/pkg/config/resolve.go)).
2. To choose the Team, list the tracker username under `teams.<name>.assignees`. One username belongs to one Team. An unlisted assignee goes to `PLOEG_DEFAULT_TEAM`, which defaults to `default` ([main.go](../../apps/ploeg/cmd/ploegd/main.go)).
3. To give the Team workers, add an `executor.teams` entry with the same name, a `model` and a `budget`. The chart renders one worker workload per Team and Role.

## Register the trigger

Assignment is the trigger and unassignment is the stop. **Labels trigger nothing:** ploegd keeps only assignment, unassignment and close events and drops the rest ([server.go](../../apps/ploeg/pkg/httpapi/server.go)).

| Tracker | Webhook URL | Event | Signature |
| --- | --- | --- | --- |
| Vikunja | `<ploegd>/webhooks/tracker/vikunja` | `task.assignee.created`, and `task.assignee.deleted` to stop | `X-Vikunja-Signature`, secret `PLOEG_VIKUNJA_SECRET` ([vikunja.go](../../apps/ploeg/pkg/provider/vikunja/vikunja.go)) |
| ClickUp | `<ploegd>/webhooks/tracker/clickup` | `taskAssigneeUpdated` (covers both directions) | `X-Signature`; ClickUp generates the secret, store it as `PLOEG_CLICKUP_SECRET` ([clickup.go](../../apps/ploeg/pkg/provider/clickup/clickup.go)) |

ClickUp is only registered when `PLOEG_CLICKUP_SECRET` or `PLOEG_CLICKUP_TOKEN` is set ([main.go](../../apps/ploeg/cmd/ploegd/main.go)). To let Ploeg comment on the ticket, set `PLOEG_VIKUNJA_URL` and `PLOEG_VIKUNJA_TOKEN` (chart `tracker.url`, `tracker.tokenSecret`).

## Assign the ticket

1. Write the ticket title and description as the full brief. They are the only ticket text the agent receives ([task.go](../../apps/ploeg/pkg/worker/task.go)).
2. Assign it to a username from step 2. Ploeg stores the Work Item, opens a Shift and creates one pending Run per Role in the first Round ([engine.go](../../apps/ploeg/pkg/shiftengine/engine.go)). KEDA sees the pending Run and starts a worker pod.

## Watch progress and spend

- **ploegd log:** `work item queued`, `target resolved`, `shift opened`, `round opened`, `shift closed`, `work item withdrawn`.
- **Vloer:** Vloer opens on **Now**, which lists what waits on you across your Teams (ready for your review, then needs you, then proposed), the Runs running now and the ones that finished recently. **Work** lists Work Items by lane: **Ready for review**, **Needs you**, **Running**, **Queued** and **All**, for one Team or all of them. The Team and lane are part of the address, for example `#work?lane=needs_human&team=bronze`, so you can share the link ([review an agent's pull request](review-an-agent-pr.md)). A Work Item's page, `#work/<id>`, leads with its state and, when it needs you, the reason, such as **Budget ran out** or **Reviewer still wants changes**. A box under the title explains why and lists what you can do. The page then shows the task brief, rendered from Markdown (a Vikunja brief's HTML is converted on the server), the Round ladder with each Run's Role, outcome or verdict and cost, the Shift's budget, each Run's stuck or failure reason and findings, and the audit events. [See what Ploeg has been doing](#see-what-ploeg-has-been-doing) covers the other pages, and the [browser UI reference](../../apps/vloer/docs/browser-ui.md#screens) describes each screen. Vloer needs a `ploeg` block with `url`, `tokenEnv` and team access in `userTeams` ([ploeg.ts](../../apps/vloer/src/ploeg.ts)).
- **Spend:** each Run shows its authorized spend and its observed model cost. Under managed auth, a Run's key budget is the smallest of the team's key policy, the Role cap and what is left of the Shift pool. ploegd settles each finished Run from LiteLLM's spend logs after `PLOEG_LLM_SETTLE_AFTER` (default 15 minutes); until then the amount counts as reserved. Settlement also fills the Run's input and output tokens from the same spend-log entries, and records the models they name in the Run's stored usage ([llm_control.go](../../apps/ploeg/pkg/httpapi/llm_control.go)).
- **Tracker:** when the Shift closes, the ticket gets a comment with the outcome and pull request link ([publish.go](../../apps/ploeg/pkg/shiftengine/publish.go)). A successful Shift moves the Work Item to `awaiting_review`, and merging the pull request moves it to `done`. Ploeg marks the tracker ticket done on merge only when `PLOEG_TRACKER_DONE_ON_MERGE=true` ([review an agent's pull request](review-an-agent-pr.md#after-you-merge-or-close)).
- **Budget exhausted:** when the Shift pool cannot fund another Round, the Shift closes, the Work Item moves to `needs_human`, and the ticket comment says **Budget exhausted** with the spent, reserved and pool amounts in dollars to two decimals. If the Shift has a pull request, the same notice is posted there.

## See what Ploeg has been doing

The **Ploeg** group in Vloer's sidebar reads Ploeg's operator activity API for the Teams your account may see ([ploeg-activity.js](../../apps/vloer/public/ploeg-activity.js), [ploeg.ts](../../apps/vloer/src/ploeg.ts)):

- **Insights:** choose **24 hours**, **7 days** or **30 days** for the **Runs and spend** section: stat tiles for the Runs that finished (failed and stuck ones counted too), the failed and stuck Runs, and the spend settled in the window, then a table with a row per Team that adds the spend reserved now and the last activity. The **Work Items** section counts what is in each state right now, whatever the window. The tiles link to the matching Runs filter or Work lane. There are no charts. Hover a time to see the exact moment. Money shows as US dollars to two decimals in Dutch notation, for example `US$ 0,98`, and an amount Ploeg did not report shows as **Not reported**, never as zero.
- **Activity:** Ploeg's audit events, newest first and grouped by day, with the Team, what happened in plain words, who did it and a link to the Work Item. Filter by Team or kind, and **Load older** pages back. The feed checks for new events every 15 seconds while the tab is visible; they wait behind an **N new events** button, so the list never moves while you read. **Live** in the status strip pauses every automatic refresh.
- **Runs:** recent Runs, running and waiting ones first, with their state, outcome, agent verdict and, for a failure, its cause and next step; the Work Item with the Run's Role and Round; when it started and how long it took; its spend as settled (or observed so far) against the authorized amount, or **Not reported**; and its models and tokens. Filter by Team, state and outcome; Ploeg only accepts an outcome filter for finished Runs.
- **Proposed:** Work Items an agent created, across your Teams, held in state `proposed` until a person decides ([how work flows](../concepts/how-work-flows.md)). Each shows its kind, its Ready flag, the Work Item it came from, the repository it would run in and whose budget it spends, when Ploeg reports them. Operators and administrators see **Approve**, which asks for confirmation and then queues it, and **Reject**, which asks for a reason; Ploeg then marks the proposal done without running it and keeps the reason. Viewers only read. Vloer sends the decision to Ploeg as you, through its own authenticated proxy.

A Ploeg without these routes shows "This Ploeg version has no activity data yet"; Work and the list of what waits on you on Now keep working. The demo (`mise run demo`) shows illustrative records, says so on every page, and makes no model calls, so it shows no spend.

## Stop it

To stop tracker work, do one of these:

- **Unassign the ticket.** Remove the assignee that routed it to the Team. The webhook needs `task.assignee.deleted` for Vikunja; ClickUp's `taskAssigneeUpdated` already covers it. Removing an assignee that maps to another Team changes nothing.
- **Close the ticket before work starts.** Marking a Vikunja task done withdraws its Work Item while no Run has started (the webhook needs `task.updated`). Once a Run has started, closing the ticket stops nothing: unassign or cancel instead.
- **Cancel it in Vloer.** On the Work Item's page, operators and administrators have **Cancel Work Item**. It opens a confirmation that lists what Ploeg will stop and the spend so far; confirm with **Cancel Work Item**, or keep it. Vloer sends Ploeg's operator cancel as you, through `POST /api/ploeg/work-items/{id}/cancel` ([HTTP contract](../../apps/vloer/docs/contracts/api.md#cancel)), and then shows what Ploeg reports: the Runs it stopped, the Runs it cancelled before they started, and whether the model keys are blocked yet. The button is there while the Work Item is received, queued, running, ready for review, needs you or stopped retrying. The demo shows the confirmation with its confirm button disabled, because nothing runs there.
- **Cancel it through the operator API.** Send `POST /api/v1/operator/work-items/{id}/cancel` with an operator bearer that has `execute` permission and an `X-Ploeg-Actor` header. The request has no body. The ticket gets a comment naming who cancelled it. The [operator contract](../../apps/ploeg/docs/contracts/README.md#operator-read-consumers) describes the request and response.

   ```sh
   curl -X POST -H "Authorization: Bearer $PLOEG_OPERATOR_TOKEN" -H "X-Ploeg-Actor: ryan" \
     https://<ploegd>/api/v1/operator/work-items/<id>/cancel
   ```

Each way, Ploeg withdraws the Work Item in one transaction ([withdraw.go](../../apps/ploeg/pkg/store/withdraw.go)):

1. The live Shift closes with reason `withdrawn_unassigned`, `withdrawn_closed` or `withdrawn_by_operator`.
2. Pending Runs are cancelled, so KEDA starts no new pods for them.
3. Running Runs are marked finished and their Lease is released. Ploeg blocks each Run's model key at once. If the block is not confirmed, the controller's block sweep retries it. A per-Run push credential is revoked.
4. The worker stops at its next renew, which Ploeg refuses. Under managed worker authentication the refusal counts as a failed renew, and the worker cancels after three of them, so it stops within about one `PLOEG_LEASE_TTL`.
5. The Work Item moves to `withdrawn`. No sweep retries it.

Check the result on the Work Item's page in Vloer, which then reads **Withdrawn** and says why, or with `GET /api/v1/operator/work-items/{id}`: the state is `withdrawn` and the latest Shift shows the close reason. To start again, assign the ticket again. The Work Item re-queues with its attempts reset and a new Shift opens.

A Work Item bound to a Vloer execution ignores unassignment, and the cancel route answers 409. Use that execution's own `cancel` command ([operator_execution.go](../../apps/ploeg/pkg/store/operator_execution.go)). Killing a worker pod does not stop the Shift: a killed writer's Round reopens and another pod claims it ([failedwriter.go](../../apps/ploeg/pkg/shiftengine/failedwriter.go)).

These limits also bound the exposure: the per-Run key budget, the harness timeouts (`PLOEG_HARNESS_TIMEOUT`, default 100 minutes, and `PLOEG_HARNESS_IDLE_TIMEOUT`, default 15 minutes, which end a hung agent with failure reason `timeout`), the key lifetime (`executor.litellm.keyDuration`, default `4h`), the pod deadline (`activeDeadlineSeconds`, default `7200`), the Shift `pool` and `maxFixRounds`. For an incident, follow [Reconcile uncertainty](../../apps/ploeg/docs/ops/managed-workers.md#reconcile-uncertainty).

## If it fails

| Symptom | Cause | Fix |
| --- | --- | --- |
| ploegd logs nothing after you assign | Webhook missing, wrong URL or wrong event | Register the webhook from the table above |
| Webhook returns 400 `webhook rejected` | Signature does not match | Set the same secret in the tracker and ploegd |
| Webhook returns 404 `unknown tracker provider` | ClickUp not registered, or wrong path | Set the ClickUp secret; check the provider name |
| ploegd exits with `no tracker project named` | Project name typo | Copy a name from the `available:` list in the error |
| Work Item lands on team `default` | Assignee is in no `assignees` list | Add the username to one Team |
| Queued, but no Run starts | No worker workload for the Team or Role | Add `executor.teams` entry; check KEDA |
| Run is `stuck`: `no repository for this work item` | No route and no fallback repository | Add the project route |
| No comment on the ticket | Tracker URL or token unset | Set `PLOEG_VIKUNJA_URL` and `PLOEG_VIKUNJA_TOKEN` |
| Vloer: `Your account has no Ploeg team access` | `userTeams` lacks your user | Add the team to your user in Vloer's config |

Next: [review the agent's pull request](review-an-agent-pr.md). Background: [ADR-0002](../adr/adr-0002-ploeg-is-the-only-engine.md) and the [tracker execution contract](../../apps/ploeg/docs/contracts/tracker-execution.md).
