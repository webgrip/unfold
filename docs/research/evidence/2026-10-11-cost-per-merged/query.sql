BEGIN READ ONLY;
\pset format unaligned
\pset fieldsep '|'
\pset footer off
\echo == PER TEAM, distinct Work Items
WITH shift_settle AS (
SELECT s.id AS shift_id, s.work_item_id, s.team, s.branch, s.budget, s.opened_at, s.closed_at, s.close_reason,
       st.at AS settled_at, substr(st.action, 11) AS settled_state
FROM shifts s
JOIN work_items w ON w.id = s.work_item_id AND NOT w.operator_owned
CROSS JOIN LATERAL (
  SELECT l.at, l.action FROM audit_log l
  WHERE l.work_item_id = s.work_item_id AND l.actor = 'ploegd:shift-engine'
    AND l.action LIKE 'work_item.%' AND l.at >= s.closed_at
  ORDER BY l.at, l.id LIMIT 1
) st
WHERE s.closed_at IS NOT NULL
),
run_cost AS (
SELECT r.id, r.shift_id, r.team, r.role, r.writes, r.outcome, r.finished_at,
       a.state AS account_state, a.models AS configured_models,
       COALESCE(a.reconciled_spend, a.observed_spend,
                CASE WHEN jsonb_typeof(r.usage->'costUsd') = 'number' THEN (r.usage->>'costUsd')::numeric END) AS cost_usd,
       r.usage->'byModel' AS by_model
FROM agent_runs r
JOIN work_items w ON w.id = r.work_item_id AND NOT w.operator_owned
LEFT JOIN run_llm_accounts a ON a.run_token = r.run_token
WHERE r.state = 'finished' AND r.shift_id IS NOT NULL AND r.role <> 'ask'
),
shift_result AS (
SELECT ss.*,
       (SELECT sum(rc.cost_usd) FROM run_cost rc WHERE rc.shift_id = ss.shift_id) AS spend,
       (SELECT count(*) FROM run_cost rc WHERE rc.shift_id = ss.shift_id) AS runs,
       (SELECT count(*) FROM run_cost rc WHERE rc.shift_id = ss.shift_id AND (rc.cost_usd IS NULL OR rc.account_state IN ('reserved','minting','issued','blocked','unknown'))) AS runs_unsettled,
       (SELECT string_agg(DISTINCT rc.role || '=' || coalesce((SELECT string_agg(x, '+') FROM jsonb_array_elements_text(rc.configured_models) x), '?'), ' ' ORDER BY rc.role || '=' || coalesce((SELECT string_agg(x, '+') FROM jsonb_array_elements_text(rc.configured_models) x), '?')) FROM run_cost rc WHERE rc.shift_id = ss.shift_id) AS role_models,
       EXISTS (SELECT 1 FROM audit_log l WHERE l.work_item_id = ss.work_item_id AND l.actor = 'ploegd:review'
               AND l.at > ss.settled_at AND l.detail->>'reason' = 'pull request merged') AS merged,
       ss.close_reason IN ('pool_exhausted', 'budget_exhausted_before_fix_round') AS cap_hit
FROM shift_settle ss
)
, wi AS (
  SELECT team, work_item_id, sum(spend) spend, count(*) shifts, bool_or(merged) merged, bool_or(settled_state='awaiting_review') reached_review,
         bool_and(role_models LIKE '%fireworks-deepseek-v4p1-flash%' AND role_models NOT LIKE '%deepseek-chat%' AND role_models NOT LIKE '%claude%') current_config
  FROM shift_result WHERE opened_at >= '2026-09-29' GROUP BY team, work_item_id)
SELECT team, count(*) work_items, sum(shifts) shifts, round(sum(spend),4) spend, count(*) FILTER (WHERE reached_review) reached_review, count(*) FILTER (WHERE merged) merged,
       round(sum(spend)/NULLIF(count(*) FILTER (WHERE merged),0),4) usd_per_merged_wi,
       round(avg(spend),4) avg_spend_per_wi
FROM wi GROUP BY team
UNION ALL
SELECT 'bronze current config', count(*), sum(shifts), round(sum(spend),4), count(*) FILTER (WHERE reached_review), count(*) FILTER (WHERE merged), round(sum(spend)/NULLIF(count(*) FILTER (WHERE merged),0),4), round(avg(spend),4)
FROM wi WHERE team='bronze' AND current_config;
\echo == PER WORK ITEM
WITH shift_settle AS (
SELECT s.id AS shift_id, s.work_item_id, s.team, s.branch, s.budget, s.opened_at, s.closed_at, s.close_reason,
       st.at AS settled_at, substr(st.action, 11) AS settled_state
FROM shifts s
JOIN work_items w ON w.id = s.work_item_id AND NOT w.operator_owned
CROSS JOIN LATERAL (
  SELECT l.at, l.action FROM audit_log l
  WHERE l.work_item_id = s.work_item_id AND l.actor = 'ploegd:shift-engine'
    AND l.action LIKE 'work_item.%' AND l.at >= s.closed_at
  ORDER BY l.at, l.id LIMIT 1
) st
WHERE s.closed_at IS NOT NULL
),
run_cost AS (
SELECT r.id, r.shift_id, r.team, r.role, r.writes, r.outcome, r.finished_at,
       a.state AS account_state, a.models AS configured_models,
       COALESCE(a.reconciled_spend, a.observed_spend,
                CASE WHEN jsonb_typeof(r.usage->'costUsd') = 'number' THEN (r.usage->>'costUsd')::numeric END) AS cost_usd,
       r.usage->'byModel' AS by_model
FROM agent_runs r
JOIN work_items w ON w.id = r.work_item_id AND NOT w.operator_owned
LEFT JOIN run_llm_accounts a ON a.run_token = r.run_token
WHERE r.state = 'finished' AND r.shift_id IS NOT NULL AND r.role <> 'ask'
),
shift_result AS (
SELECT ss.*,
       (SELECT sum(rc.cost_usd) FROM run_cost rc WHERE rc.shift_id = ss.shift_id) AS spend,
       (SELECT count(*) FROM run_cost rc WHERE rc.shift_id = ss.shift_id) AS runs,
       (SELECT count(*) FROM run_cost rc WHERE rc.shift_id = ss.shift_id AND (rc.cost_usd IS NULL OR rc.account_state IN ('reserved','minting','issued','blocked','unknown'))) AS runs_unsettled,
       (SELECT string_agg(DISTINCT rc.role || '=' || coalesce((SELECT string_agg(x, '+') FROM jsonb_array_elements_text(rc.configured_models) x), '?'), ' ' ORDER BY rc.role || '=' || coalesce((SELECT string_agg(x, '+') FROM jsonb_array_elements_text(rc.configured_models) x), '?')) FROM run_cost rc WHERE rc.shift_id = ss.shift_id) AS role_models,
       EXISTS (SELECT 1 FROM audit_log l WHERE l.work_item_id = ss.work_item_id AND l.actor = 'ploegd:review'
               AND l.at > ss.settled_at AND l.detail->>'reason' = 'pull request merged') AS merged,
       ss.close_reason IN ('pool_exhausted', 'budget_exhausted_before_fix_round') AS cap_hit
FROM shift_settle ss
)
SELECT team, work_item_id, count(*) shifts, round(sum(spend),4) spend, bool_or(merged) merged, string_agg(DISTINCT role_models, ' / ') configs
FROM shift_result WHERE opened_at >= '2026-09-29' GROUP BY team, work_item_id ORDER BY team, work_item_id;
ROLLBACK;
