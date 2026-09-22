---
type: how-to
audience: [owner, operator]
owner: glide
last_verified: 2026-09-22
verified_by: "Read apps/ploeg pkg/config, pkg/httpapi/server.go, pkg/provider/{vikunja,clickup}, pkg/shiftengine, cmd/ploegd/main.go, ops/helm/ploeg/values.yaml and apps/vloer/src/ploeg.ts at 6221579"
---

# Assign work to an agent

Use this to hand a tracker ticket to agents. Result: Ploeg dispatches a [Run](../../apps/ploeg/docs/domain/glossary.md#run), the agent opens a pull request on branch `agent/vik-<ticket id>`, and the ticket gets a comment with the link.

Terms: a **Work Item** is Ploeg's copy of your ticket. A **Team** is a named roster of agent **Roles**. A **Shift** is one Team's whole attempt at a Work Item, split into **Rounds**. A **Run** is one Role working once, and a **Lease** is the writer's exclusive right to push to the branch. See the [Ploeg glossary](../../apps/ploeg/docs/domain/glossary.md) and the [product glossary](../domain/glossary.md).

**Before you start:** Ploeg runs with managed worker authentication ([managed workers](../../apps/ploeg/docs/ops/managed-workers.md)), the chart's `executor.enabled` is `true` (it defaults to `false` in [values.yaml](../../apps/ploeg/ops/helm/ploeg/values.yaml)), and the repository is [prepared](prepare-a-repository.md).

## Configure the board and team

1. To route a tracker project to a repository, add it to the file that `PLOEG_CONFIG` points at (the chart's `config:` value). The keys come from [config.go](../../apps/ploeg/pkg/config/config.go#L38-L83). Example:

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

   ploegd refuses to start if a name matches no project ([resolve.go](../../apps/ploeg/pkg/config/resolve.go#L58-L61)). ClickUp entries need `id:` (the List id), because ClickUp name lookup is not implemented ([config.go](../../apps/ploeg/pkg/config/config.go#L128-L131)). A project's `team:` pin only applies to entries with an `id:` ([resolve.go](../../apps/ploeg/pkg/config/resolve.go#L96-L104)).
2. To choose the Team, list the tracker username under `teams.<name>.assignees`. One username belongs to one Team. An unlisted assignee goes to `PLOEG_DEFAULT_TEAM`, which defaults to `default` ([main.go](../../apps/ploeg/cmd/ploegd/main.go#L94)).
3. To give the Team workers, add an `executor.teams` entry with the same name, a `model` and a `budget`. The chart renders one worker workload per Team and Role.

## Register the trigger

Assignment is the trigger. **Labels trigger nothing:** ploegd keeps only assignment events and drops the rest ([server.go](../../apps/ploeg/pkg/httpapi/server.go#L117-L120)).

| Tracker | Webhook URL | Event | Signature |
| --- | --- | --- | --- |
| Vikunja | `<ploegd>/webhooks/tracker/vikunja` | `task.assignee.created` | `X-Vikunja-Signature`, secret `PLOEG_VIKUNJA_SECRET` ([vikunja.go](../../apps/ploeg/pkg/provider/vikunja/vikunja.go#L77-L82)) |
| ClickUp | `<ploegd>/webhooks/tracker/clickup` | `taskAssigneeUpdated` | `X-Signature`; ClickUp generates the secret, store it as `PLOEG_CLICKUP_SECRET` ([clickup.go](../../apps/ploeg/pkg/provider/clickup/clickup.go#L101)) |

ClickUp is only registered when `PLOEG_CLICKUP_SECRET` or `PLOEG_CLICKUP_TOKEN` is set ([main.go](../../apps/ploeg/cmd/ploegd/main.go#L116)). To let Ploeg comment on the ticket, set `PLOEG_VIKUNJA_URL` and `PLOEG_VIKUNJA_TOKEN` (chart `tracker.url`, `tracker.tokenSecret`).

## Assign the ticket

1. Write the ticket title and description as the full brief. They are the only ticket text the agent receives ([task.go](../../apps/ploeg/pkg/worker/task.go#L42-L45)).
2. Assign it to a username from step 2. Ploeg stores the Work Item, opens a Shift and creates one pending Run per Role in the first Round ([engine.go](../../apps/ploeg/pkg/shiftengine/engine.go#L60-L85)). KEDA sees the pending Run and starts a worker pod.

## Watch progress and spend

- **ploegd log:** `work item queued`, `target resolved`, `shift opened`, `round opened`, `shift closed`.
- **Vloer:** open **Ploeg** in the sidebar and pick the Team. The lanes are **Needs human**, **Running**, **Queue** and **All work**. A Work Item's detail shows **Shifts & spending**, **Execution & review** (each Run's Role, Round, outcome and verdict), **Checkpoints** and an **Audit snapshot**. It is read-only ([ploeg.js](../../apps/vloer/public/ploeg.js)). Vloer needs a `ploeg` block with `url`, `tokenEnv` and team access in `userTeams` ([ploeg.ts](../../apps/vloer/src/ploeg.ts#L79-L104)).
- **Spend:** each Run shows **Authorized spend** and **Observed model cost**. Under managed auth, the LLM key's budget comes from the Team and Role policy, not from the Shift. The Shift's **Recorded spend** stays at zero and **Reserved** holds the amount instead, because managed Runs skip settlement ([store.go](../../apps/ploeg/pkg/store/store.go#L445-L451)). Treat the per-Run observed cost as the real figure; it stays provisional until reconciled.
- **Tracker:** when the Shift closes, the ticket gets a comment with the outcome and pull request link ([publish.go](../../apps/ploeg/pkg/shiftengine/publish.go#L194-L227)). Ploeg never marks the ticket done.

## Stop it

**Not implemented yet.** Tracker-dispatched work has no stop control. Unassigning the ticket is ignored ([server.go](../../apps/ploeg/pkg/httpapi/server.go#L118)). The `cancel` command exists only for executions that Vloer admits ([operator_execution.go](../../apps/ploeg/pkg/store/operator_execution.go#L228)). Killing a worker pod does not stop the Shift either: a killed writer's Round reopens and another pod claims it ([failedwriter.go](../../apps/ploeg/pkg/shiftengine/failedwriter.go)).

These limits bound the exposure today: the per-Run key budget, the key lifetime (`executor.litellm.keyDuration`, default `4h`), the pod deadline (`activeDeadlineSeconds`, default `7200`), the Shift `pool` and `maxFixRounds`. For an incident, follow [Reconcile uncertainty](../../apps/ploeg/docs/ops/managed-workers.md#reconcile-uncertainty).

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
