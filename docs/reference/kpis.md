---
type: reference
audience: [owner, operator, contributor]
owner: glide
last_verified: 2026-09-23
verified_by: "source read of apps/ploeg/pkg/store/migrations 0001-0016, pkg/store, pkg/shiftengine and pkg/provider/forgejo on development; commits 8148c1d and cfd6ec4 read where marked"
---

# Glide KPIs

**Status: proposal.** Nothing on this page is measured yet. The KPIs, thresholds and dashboard below are a proposal for backlog items #91 and #92. Targets stay provisional until a baseline exists.

Glide's goal is one loop: Work Items go to agents, the agents do all the code work until a pull request is ready for your review, and the throughput limit becomes cluster size rather than your time ([Architecture](../concepts/architecture.md#goals)). These six KPIs tell you whether that loop is working and what to change when it is not. Each one names the decision it changes. A KPI that stops changing a decision comes off the list at the next review.

## The set

| # | KPI | Kind | Paired with | Data today |
| --- | --- | --- | --- | --- |
| K1 | Ready-for-review rate | outcome | K5 | Ploeg `shifts`, `audit_log` |
| K2 | Cost per ready pull request | cost | K1, K5 | Ploeg `agent_runs`, `run_llm_accounts`; LiteLLM spend logs as a cross-check |
| K3 | Lead time to ready | speed | K4 | Ploeg `shifts`, `agent_runs`, `audit_log` |
| K4 | Rework: fix-Round share and re-assignment rate | quality | K3 | Ploeg `agent_runs.verdict`, `audit_log` |
| K5 | Clean-merge rate | quality | K1, K2 | Needs the merge settlement in `cfd6ec4`; review type is a data gap |
| K6 | Owner review minutes per pull request | your time | K5 | No source yet; a proxy and a proposed source below |

**Goodhart pairs.** Each speed or volume number has a quality number next to it. Ask of each: how could this number improve while the work gets worse?

* K1 rises if agents open weak pull requests just to reach `awaiting_review`. K5 catches that: weak pull requests do not merge cleanly.
* K2 falls if you cut reviewer Rounds or pick a cheaper model. K1 and K5 fall with it if the cut was too deep.
* K3 falls if the fix loop is capped low and work is handed over half-done. K4's re-assignment rate and K5 catch that.
* K6 falls if you stop reading pull requests. K5 then stops meaning anything, which is why K6 is reported next to K5, never alone.

**Level.** These are system and team (agent Team) metrics. K6 measures you, the only person in the loop. It is self-insight only: you are the only viewer, and it is never compared with anyone.

## Definitions

Every KPI uses the same window: the Grafana time range, default the last 28 days. Durations are percentiles, because a few stuck items skew an average. All KPIs exclude Work Items owned by a Vloer operator execution (`work_items.operator_owned`), because those are interactive sessions, not the unattended loop. They also exclude pre-Shift Runs (`agent_runs.shift_id IS NULL`); with `PLOEG_SHIFTS_UNIFORM=true`, every new Work Item gets a Shift.

Owner: Ryan Grippeling, for every KPI. Review by: 2026-12-23, then quarterly.

### K1 Ready-for-review rate

* **Formula:** Shifts that settled their Work Item at `awaiting_review` ÷ all Shifts that settled in the window. Settles are `work_item.<state>` audit rows written by `ploegd:shift-engine` just after a Shift closes. The denominator includes `needs_human`, `stale`, `done` and a retrying `queued`.
* **Source:** `shifts.closed_at`, `shifts.close_reason`, `audit_log.actor`, `audit_log.action`, `audit_log.at`.
* **Direction:** higher is better. **Frequency:** weekly.
* **Baseline:** the rate over the first four full weeks with at least 20 settled Shifts.
* **Provisional target:** 70 %. **Signal:** below 50 % for two weeks.
* **Decision:** below 50 %, stop adding Teams or repositories and fix readiness: tighten what counts as Ready, [prepare the repository](../how-to/prepare-a-repository.md), or give unclear work to agents that make it Ready first. Above 85 % for a month, give the agents harder work.

### K2 Cost per ready pull request

* **Formula:** the settled model spend of every Shift Run that finished in the window, including failed and stuck Shifts, ÷ the number of `awaiting_review` settles in the window. Loading failure spend onto ready pull requests is deliberate: it is what a ready pull request really costs.
* **Run cost:** `COALESCE(run_llm_accounts.reconciled_spend, run_llm_accounts.observed_spend, agent_runs.usage->>'costUsd')`, the same order Ploeg's operator API uses. The amount is in USD, because LiteLLM reports spend in USD. Show it with 2 decimals and the nl-NL format, for example US$ 1.234,56.
* **Source:** `agent_runs.finished_at`, `agent_runs.usage`, `run_llm_accounts.reconciled_spend`, `run_llm_accounts.observed_spend`, `run_llm_accounts.state`. On development, `agent_runs.usage.costUsd` is what the harness reported. After commit `8148c1d` lands, settlement also merges `inputTokens`, `outputTokens`, `models` and `costUsd` from LiteLLM into `agent_runs.usage`, which the per-model table uses.
* **Cross-check:** LiteLLM's `LiteLLM_SpendLogs`, summed over keys whose alias starts with `ploeg-`. The two totals should agree within a cent once settlement has caught up.
* **Direction:** lower is better, provided K1 and K5 hold. **Frequency:** weekly.
* **Baseline:** the median weekly value over the same four weeks as K1.
* **Provisional target:** no rise quarter on quarter while K1 and K5 hold. **Signal:** above twice the baseline for a week.
* **Decision:** above the signal, look at the per-Team and per-model tables. Change model routing, drop a reviewer Round from the costliest plan, or lower its budget pool. Compare with what the same pull request would cost in your own hours.

### K3 Lead time to ready

* **Formula:** p50 and p85 of `awaiting_review` settle time minus `shifts.opened_at`. A Shift opens when an assigned Work Item is queued, so this runs from assignment to "ready for you". A second column, **queue wait**, is the time from `shifts.opened_at` to the first Run's `agent_runs.started_at`. Queue wait is time spent waiting for a worker pod.
* **Source:** `shifts.opened_at`, `agent_runs.started_at`, the settle row in `audit_log`.
* **Direction:** lower is better. **Frequency:** weekly.
* **Baseline:** p50 and p85 over the first 20 ready pull requests.
* **Provisional target:** p85 under 4 hours. **Signal:** queue wait above half of the lead time.
* **Decision:** when queue wait dominates, cluster size is the limit, which is the goal. Add worker capacity or raise KEDA's maximum replicas. When queue wait is small but lead time is long, the agents are slow. Look at Round count and harness timeouts before adding nodes.

### K4 Rework

Two numbers, both about work that had to be done twice.

* **Fix-Round share:** ready Shifts with at least one fix Round ÷ all ready Shifts. A fix Round is a reviewer Round with `agent_runs.verdict = 'request_changes'` that was followed by a writing Run in a later Round of the same Shift ([Ploeg ADR-0017](../../apps/ploeg/docs/adrs/0017-the-review-loop-is-verdict-driven-and-capped.md)). The mean number of fix Rounds is shown next to it.
* **Re-assignment rate:** `awaiting_review` settles followed within 14 days by a new assignment of the same Work Item (`work_item.queued` from a `webhook:*` actor) ÷ all `awaiting_review` settles. The last 14 days of any window are incomplete.
* **Source:** `agent_runs.shift_id`, `agent_runs.round`, `agent_runs.writes`, `agent_runs.verdict`, `audit_log`.
* **Direction:** lower is better. **Frequency:** weekly.
* **Baseline:** the first four full weeks.
* **Provisional target:** fix-Round share under 40 %, re-assignment rate under 10 %. **Signal:** re-assignment rate above 15 %.
* **Decision:** a high fix-Round share means the writer and reviewer disagree. Improve the writer's instructions or the repository's `AGENTS.md` using the reviewer findings. A high re-assignment rate means the pull request reached you but was wrong. The Work Item was not Ready, so tighten the Ready threshold rather than the agents.

### K5 Clean-merge rate

* **Formula:** Work Items whose `awaiting_review` pull request merged with no submitted review on its branch in between ÷ all `awaiting_review` pull requests that merged or closed in the window.
* **Source:** the merge settlement rows from commit `cfd6ec4`, which is not on development yet: `audit_log` rows from `ploegd:review` with action `work_item.done` and `detail->>'reason' = 'pull request merged'`, or `work_item.needs_human` with reason `pull request closed without merging`. Reviews come from `forge.review_submitted` rows, matched on `detail->>'branch' = shifts.branch`.
* **Data gap:** Ploeg records that a review was submitted, not whether it approved or asked for changes. Commits you push to the branch yourself are not recorded either. Until data ticket D1 below lands, an approval submitted as a review counts as a change. To keep the proxy honest, merge without a formal approval.
* **Direction:** higher is better. **Frequency:** monthly, because the counts are small.
* **Baseline:** the first 20 merged or closed pull requests.
* **Provisional target:** 60 %. **Signal:** below 40 %.
* **Decision:** below the signal, the reviewer agents miss what you catch. Add what you keep correcting to the reviewer Role's instructions. Above 80 % for a quarter, spend less review time on low-risk classes of work. Ploeg still never merges.

### K6 Owner review minutes per pull request

* **Formula:** p50 and p85 of the minutes you actively spend on one agent pull request, from opening it to merging or closing it.
* **Source:** none today. Proposed, not implemented: Vloer's Awaiting review screen records how long a Work Item's review screen is open and focused, and reports the total to Ploeg's operator API as an `audit_log` row (`review.viewed`, detail `{"active_seconds": n}`). That is data ticket D2. Review done only on the forge stays invisible to it.
* **Proxy today:** **review wait**, the time from the `awaiting_review` settle to the `ploegd:review` settle (needs `cfd6ec4`). It measures how long a pull request waits for you, not how long you spend on it. Report it as review wait, never as review effort.
* **Perceptual check:** once a month, rate from 1 to 5: "Reviewing agent pull requests was a good use of my time." Record it next to the dashboard. This is the one survey measure in the set.
* **Direction:** lower is better, provided K5 holds. **Frequency:** monthly.
* **Baseline:** the first 20 pull requests after D2 lands.
* **Provisional target:** p50 under 15 minutes. **Signal:** p50 above the time the change would take you to write.
* **Decision:** above the signal for a class of work, stop assigning that class to agents, or split it into smaller Work Items. Review wait above a day means you are the throughput limit, not the cluster. That argues for review time in your week, not more nodes.

## Data tickets

| Id | Gap | Proposed change | Unblocks |
| --- | --- | --- | --- |
| D1 | Review type and your own commits are not recorded | Store the Forgejo review type (`approved`, `rejected`, `comment`) and reviewer in the `forge.review_submitted` audit detail. Record the pull request head SHA at `awaiting_review` and at merge | K5 without the proxy |
| D2 | Review effort is not recorded | Vloer's review screen reports active seconds per Work Item to Ploeg | K6 |
| D3 | `audit_log` has no index for these queries | An index on `(work_item_id, at)`, added when the dashboard becomes slow | Dashboard speed |
| D4 | The merge settlement is on another branch | Merge `cfd6ec4` to development | K5, the K6 proxy |

## SQL

The queries run on Grafana's PostgreSQL data source against Ploeg's database, with a read-only role. `$__timeFilter(...)` is Grafana's time-range macro. `$team` is a multi-value dashboard variable with "Include All". Every column below is defined in [`apps/ploeg/pkg/store/migrations`](../../apps/ploeg/pkg/store/migrations/); the `audit_log` action names come from `pkg/store`.

### Shared CTE: how each Shift settled

Each Shift closes (`shifts.closed_at`), then the Shift engine writes one settle row for its Work Item. The first settle row at or after the close is that Shift's result. Every query below starts with this CTE.

```sql
WITH shift_settle AS (
  SELECT s.id AS shift_id, s.work_item_id, s.team, s.branch,
         s.opened_at, s.closed_at, s.close_reason,
         st.at AS settled_at,
         substr(st.action, 11) AS settled_state   -- strips 'work_item.'
  FROM shifts s
  JOIN work_items w ON w.id = s.work_item_id AND NOT w.operator_owned
  CROSS JOIN LATERAL (
    SELECT l.at, l.action
    FROM audit_log l
    WHERE l.work_item_id = s.work_item_id
      AND l.actor = 'ploegd:shift-engine'
      AND l.action LIKE 'work_item.%'
      AND l.at >= s.closed_at
    ORDER BY l.at, l.id
    LIMIT 1
  ) st
  WHERE s.closed_at IS NOT NULL
    AND s.team IN ($team)
)
```

### K1

```sql
-- shift_settle CTE here
SELECT count(*) FILTER (WHERE settled_state = 'awaiting_review')::numeric
       / NULLIF(count(*), 0) AS ready_rate
FROM shift_settle
WHERE $__timeFilter(settled_at);
```

Breakdown table, why Shifts did not reach review:

```sql
-- shift_settle CTE here
SELECT settled_state, close_reason, count(*) AS shifts
FROM shift_settle
WHERE $__timeFilter(settled_at)
GROUP BY settled_state, close_reason
ORDER BY shifts DESC;
```

### K2

```sql
-- shift_settle CTE here
, run_cost AS (
  SELECT r.team, a.state AS account_state,
         COALESCE(a.reconciled_spend, a.observed_spend,
                  CASE WHEN jsonb_typeof(r.usage->'costUsd') = 'number'
                       THEN (r.usage->>'costUsd')::numeric END) AS cost_usd
  FROM agent_runs r
  JOIN work_items w ON w.id = r.work_item_id AND NOT w.operator_owned
  LEFT JOIN run_llm_accounts a ON a.run_token = r.run_token
  WHERE r.state = 'finished'
    AND r.shift_id IS NOT NULL
    AND r.team IN ($team)
    AND $__timeFilter(r.finished_at)
)
SELECT (SELECT sum(cost_usd) FROM run_cost)
       / NULLIF((SELECT count(*) FROM shift_settle
                 WHERE settled_state = 'awaiting_review'
                   AND $__timeFilter(settled_at)), 0) AS cost_per_ready_pr_usd,
       (SELECT count(*) FROM run_cost
        WHERE cost_usd IS NULL
           OR account_state IN ('reserved', 'minting', 'issued', 'blocked', 'unknown')) AS runs_not_settled;
```

`runs_not_settled` counts Runs whose cost is still missing or provisional. When it is not zero, K2 is too low.

Per model, after `8148c1d` lands (`usage.models` is a JSON array; a Run that used two models counts toward both):

```sql
SELECT m.model, count(*) AS runs,
       sum((r.usage->>'inputTokens')::bigint)  AS input_tokens,
       sum((r.usage->>'outputTokens')::bigint) AS output_tokens,
       sum((r.usage->>'costUsd')::numeric)     AS cost_usd
FROM agent_runs r
JOIN work_items w ON w.id = r.work_item_id AND NOT w.operator_owned
CROSS JOIN LATERAL jsonb_array_elements_text(r.usage->'models') AS m(model)
WHERE r.state = 'finished'
  AND jsonb_typeof(r.usage->'models') = 'array'
  AND r.team IN ($team)
  AND $__timeFilter(r.finished_at)
GROUP BY m.model
ORDER BY cost_usd DESC NULLS LAST;
```

Cross-check on the LiteLLM database. Verify the column names against your LiteLLM version:

```sql
SELECT sum(spend) AS litellm_spend_usd
FROM "LiteLLM_SpendLogs"
WHERE metadata->>'user_api_key_alias' LIKE 'ploeg-%'
  AND $__timeFilter("startTime");
```

### K3

```sql
-- shift_settle CTE here
, ready AS (
  SELECT ss.*,
         (SELECT min(r.started_at) FROM agent_runs r
          WHERE r.shift_id = ss.shift_id) AS first_started_at
  FROM shift_settle ss
  WHERE ss.settled_state = 'awaiting_review'
    AND $__timeFilter(ss.settled_at)
)
SELECT percentile_cont(0.5)  WITHIN GROUP (ORDER BY extract(epoch FROM settled_at - opened_at)) AS lead_p50_s,
       percentile_cont(0.85) WITHIN GROUP (ORDER BY extract(epoch FROM settled_at - opened_at)) AS lead_p85_s,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY extract(epoch FROM first_started_at - opened_at)) AS queue_wait_p50_s,
       percentile_cont(0.85) WITHIN GROUP (ORDER BY extract(epoch FROM first_started_at - opened_at)) AS queue_wait_p85_s,
       count(*) AS ready_prs
FROM ready;
```

### K4

```sql
-- shift_settle CTE here
, ready AS (
  SELECT ss.*,
         (SELECT count(DISTINCT v.round) FROM agent_runs v
          WHERE v.shift_id = ss.shift_id
            AND v.verdict = 'request_changes'
            AND EXISTS (SELECT 1 FROM agent_runs f
                        WHERE f.shift_id = v.shift_id
                          AND f.writes
                          AND f.round > v.round)) AS fix_rounds,
         EXISTS (SELECT 1 FROM audit_log q
                 WHERE q.work_item_id = ss.work_item_id
                   AND q.actor LIKE 'webhook:%'
                   AND q.action = 'work_item.queued'
                   AND q.at > ss.settled_at
                   AND q.at <= ss.settled_at + interval '14 days') AS reassigned
  FROM shift_settle ss
  WHERE ss.settled_state = 'awaiting_review'
    AND $__timeFilter(ss.settled_at)
)
SELECT count(*) FILTER (WHERE fix_rounds > 0)::numeric / NULLIF(count(*), 0) AS fix_round_share,
       avg(fix_rounds)                                                     AS mean_fix_rounds,
       count(*) FILTER (WHERE reassigned)::numeric / NULLIF(count(*), 0)    AS reassignment_rate
FROM ready;
```

### K5

Needs `cfd6ec4`. Before it lands, the query returns no rows.

```sql
-- shift_settle CTE here
, reviewed AS (
  SELECT ss.shift_id, ss.work_item_id, ss.branch, ss.settled_at, rv.at AS reviewed_at,
         rv.action, rv.detail->>'reason' AS reason
  FROM shift_settle ss
  CROSS JOIN LATERAL (
    SELECT l.at, l.action, l.detail
    FROM audit_log l
    WHERE l.work_item_id = ss.work_item_id
      AND l.actor = 'ploegd:review'
      AND l.at > ss.settled_at
    ORDER BY l.at, l.id
    LIMIT 1
  ) rv
  WHERE ss.settled_state = 'awaiting_review'
)
SELECT count(*) FILTER (
         WHERE reason = 'pull request merged'
           AND NOT EXISTS (SELECT 1 FROM audit_log f
                           WHERE f.action = 'forge.review_submitted'
                             AND f.detail->>'branch' = reviewed.branch
                             AND f.at BETWEEN reviewed.settled_at AND reviewed.reviewed_at)
       )::numeric / NULLIF(count(*), 0)                              AS clean_merge_rate,
       count(*) FILTER (WHERE reason = 'pull request merged')              AS merged,
       count(*) FILTER (WHERE reason = 'pull request closed without merging') AS closed_unmerged
FROM reviewed
WHERE $__timeFilter(reviewed_at);
```

### K6 proxy: review wait

Needs `cfd6ec4`. It uses the `reviewed` CTE from K5.

```sql
-- shift_settle and reviewed CTEs here
SELECT percentile_cont(0.5)  WITHIN GROUP (ORDER BY extract(epoch FROM reviewed_at - settled_at)) AS review_wait_p50_s,
       percentile_cont(0.85) WITHIN GROUP (ORDER BY extract(epoch FROM reviewed_at - settled_at)) AS review_wait_p85_s
FROM reviewed
WHERE $__timeFilter(reviewed_at);
```

Waiting now, which matters more than the history when it grows:

```sql
SELECT count(*) AS awaiting_review_now,
       extract(epoch FROM now() - min(updated_at)) AS oldest_wait_s
FROM work_items
WHERE state = 'awaiting_review' AND NOT operator_owned AND team IN ($team);
```

`work_items.updated_at` also changes when the tracker refreshes the item, so `oldest_wait_s` is a lower bound.

## Grafana dashboard spec

This is a spec only. The dashboard is provisioned in `homelab-cluster`, not in this repository.

**Dashboard:** "Glide KPIs". Default range: last 28 days. No auto-refresh; 5 minutes if one is wanted.

**Data sources:** `ploeg-postgres`, a PostgreSQL data source with a read-only role on Ploeg's database. `litellm-postgres`, for the K2 cross-check only.

**Variable:** `team`, query `SELECT DISTINCT team FROM work_items ORDER BY 1` on `ploeg-postgres`, multi-value, with Include All.

**Formatting:** ratios use unit `percentunit` with 0 decimals. Durations use unit `s`, which Grafana renders as hours and minutes. Money uses unit `currencyUSD` with 2 decimals. Set the Grafana organization's regional format to nl-NL, so money reads US$ 1.234,56. Each panel's description links to its definition on this page, and a change to a definition changes the panel in the same merge request.

**Row 1, the loop (stat panels):**

| Panel | Query | Thresholds |
| --- | --- | --- |
| Ready-for-review rate | K1 | red < 0.5, amber < 0.7, green |
| Cost per ready PR | K2 `cost_per_ready_pr_usd` | none until baseline; then red above 2× baseline |
| Runs not settled | K2 `runs_not_settled` | amber > 0 |
| Lead time p50 · p85 | K3 `lead_p50_s`, `lead_p85_s` | red p85 > 4 h |
| Queue wait p85 | K3 `queue_wait_p85_s` | amber when above half of lead p85 |

**Row 2, quality and your time (stat panels):**

| Panel | Query | Thresholds |
| --- | --- | --- |
| Fix-Round share | K4 `fix_round_share` | amber > 0.4 |
| Re-assignment rate | K4 `reassignment_rate` | red > 0.15, amber > 0.1 |
| Clean-merge rate | K5 `clean_merge_rate` | red < 0.4, amber < 0.6 |
| Review wait p50 (not effort) | K6 proxy | amber > 1 day |
| Awaiting review now | `awaiting_review_now`, `oldest_wait_s` | amber oldest > 1 day |

**Row 3, where to act (table panels):**

| Panel | Query | Columns |
| --- | --- | --- |
| Per Team | K1 to K4 with `GROUP BY team` added to each final `SELECT` | team, ready rate, cost per ready PR, lead p85, fix-Round share, re-assignment rate |
| Why Shifts did not reach review | K1 breakdown | settled state, close reason, Shifts |
| Spend per model | K2 per model | model, Runs, input tokens, output tokens, cost |
| Ready pull requests | `ready` CTE of K4 joined to `work_items` | Work Item id, title (links to `work_items.url`), team, lead time, fix Rounds, cost, current state |

**Row 4, cross-check (collapsed):** one stat panel with the LiteLLM spend total and one with the Ploeg total for the same range.

No time-series panels. Each value is a single number or a comparison, and a trend belongs in the quarterly review, not on the dashboard.

## Review

At each quarterly review, every KPI must name a decision it changed since the last review, or it is retired. Record the baseline and the date it was measured on this page when it exists, then replace the provisional targets.

Related: [Architecture](../concepts/architecture.md), [How work flows](../concepts/how-work-flows.md), [Review an agent pull request](../how-to/review-an-agent-pr.md).
