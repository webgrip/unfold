package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

var goldenMu sync.Mutex

func init() {
	dir := os.Getenv("UNFOLD_GOLDEN_DIR")
	if dir == "" {
		return
	}
	_ = os.MkdirAll(dir, 0o755)
	goldenCardHook = func(ctx context.Context, s *Store, id int64, teams []string, opts CardOptions, inner func(CardOptions) (OperatorCard, error)) (OperatorCard, error) {
		if opts.Now.IsZero() {
			opts.Now = time.Now().UTC()
		}
		live := map[string]any{}
		if opts.Live != nil {
			orig := opts.Live
			opts.Live = func(ctx context.Context, token string) (LiveUsage, error) {
				u, err := orig(ctx, token)
				if err != nil {
					live[token] = nil
				} else {
					live[token] = u
				}
				return u, err
			}
		}
		taskURLs := map[string]string{}
		if opts.TaskURL != nil {
			orig := opts.TaskURL
			opts.TaskURL = func(provider, external string) string {
				u := orig(provider, external)
				taskURLs[provider+"\x00"+external] = u
				return u
			}
		}
		world, state := goldenWorld(ctx, s)
		card, err := inner(opts)
		_, after := goldenWorld(ctx, s)
		fixture := map[string]any{
			"kind": "card", "test": goldenTestName(), "workItemId": fmt.Sprint(id), "teams": teams,
			"options": goldenOptions(opts, card), "world": world, "state": state, "stateAfter": after,
			"liveReadings": goldenLive(ctx, s, live), "taskUrls": taskURLs,
		}
		if err != nil {
			fixture["error"] = err.Error()
		} else {
			fixture["card"] = card
		}
		goldenWrite(dir, fixture)
		return card, err
	}
	goldenListHook = func(ctx context.Context, s *Store, f CardListFilter, opts CardOptions, inner func(CardListFilter, CardOptions) (CardPage, error)) (CardPage, error) {
		if opts.Now.IsZero() {
			opts.Now = time.Now().UTC()
		}
		world, state := goldenWorld(ctx, s)
		page, err := inner(f, opts)
		filter := map[string]any{"teams": f.Teams, "team": f.Team, "members": f.Members, "since": f.Since, "limit": f.Limit}
		if f.Before != nil {
			filter["before"] = f.Before.String()
		}
		fixture := map[string]any{"kind": "list", "test": goldenTestName(), "filter": filter, "options": goldenOptions(opts, OperatorCard{}), "world": world, "state": state}
		if err != nil {
			fixture["error"] = err.Error()
		} else {
			ids := []string{}
			for _, c := range page.Cards {
				ids = append(ids, c.WorkItemID)
			}
			fixture["cards"] = ids
			if page.NextBefore != nil {
				fixture["nextBefore"] = map[string]any{"at": page.NextBefore.At, "workItemId": fmt.Sprint(page.NextBefore.WorkItemID)}
			}
		}
		goldenWrite(dir, fixture)
		return page, err
	}
}

func goldenTestName() string {
	pcs := make([]uintptr, 64)
	n := runtime.Callers(2, pcs)
	frames := runtime.CallersFrames(pcs[:n])
	name := ""
	for {
		f, more := frames.Next()
		if i := strings.LastIndex(f.Function, ".Test"); i >= 0 {
			name = f.Function[i+1:]
		}
		if !more {
			break
		}
	}
	return name
}

func goldenWrite(dir string, fixture map[string]any) {
	goldenMu.Lock()
	defer goldenMu.Unlock()
	raw, err := json.MarshalIndent(fixture, "", " ")
	if err != nil {
		panic(err)
	}
	sum := sha256.Sum256(raw)
	name := fmt.Sprintf("%s-%s.json", fixture["test"], hex.EncodeToString(sum[:])[:10])
	if err := os.WriteFile(filepath.Join(dir, name), raw, 0o644); err != nil {
		panic(err)
	}
}

func goldenOptions(opts CardOptions, card OperatorCard) map[string]any {
	out := map[string]any{"now": opts.Now.UTC(), "bots": opts.Bots, "releaseEnvironments": opts.ReleaseEnvironments,
		"hotfixLabels": opts.HotfixLabels, "rarity": opts.Rarity != nil, "live": opts.Live != nil}
	if opts.Flow != nil {
		calendars := map[string]any{}
		for team := range opts.Flow.Calendars {
			calendars[team] = "see-card"
		}
		f := map[string]any{"kinds": opts.Flow.Kinds, "calendars": calendars}
		if card.Flow != nil {
			f["cardCalendar"] = card.Flow.Calendar
		}
		out["flow"] = f
	}
	return out
}

func goldenLive(ctx context.Context, s *Store, live map[string]any) []map[string]any {
	out := []map[string]any{}
	for token, reading := range live {
		var id int64
		if err := s.pool.QueryRow(ctx, `SELECT id FROM agent_runs WHERE run_token = $1`, token).Scan(&id); err != nil {
			continue
		}
		entry := map[string]any{"runId": fmt.Sprint(id)}
		if u, ok := reading.(LiveUsage); ok {
			entry["costUsd"], entry["inputTokens"], entry["outputTokens"] = u.CostUSD, u.InputTokens, u.OutputTokens
		} else {
			entry["error"] = true
		}
		out = append(out, entry)
	}
	return out
}

func goldenJSON(ctx context.Context, s *Store, query string, args ...any) any {
	var raw []byte
	if err := s.pool.QueryRow(ctx, query, args...).Scan(&raw); err != nil {
		panic(fmt.Errorf("%w: %s", err, query))
	}
	var v any
	if raw == nil {
		return []any{}
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		panic(err)
	}
	return v
}

const goldenRef = `jsonb_build_object('id', %[1]s.id::text, 'forge', %[1]s.forge, 'owner', %[1]s.repo_owner, 'repo', %[1]s.repo_name, 'number', %[1]s.number)`

func goldenWorld(ctx context.Context, s *Store) ([]any, map[string]any) {
	rows, err := s.pool.Query(ctx, `SELECT id FROM work_items ORDER BY id`)
	if err != nil {
		panic(err)
	}
	var ids []int64
	for rows.Next() {
		var id int64
		_ = rows.Scan(&id)
		ids = append(ids, id)
	}
	rows.Close()
	world := []any{}
	for _, id := range ids {
		world = append(world, goldenFacts(ctx, s, id))
	}
	ref := func(alias string) string { return fmt.Sprintf(goldenRef, alias) }
	state := map[string]any{
		"cracks": goldenJSON(ctx, s, `SELECT COALESCE(jsonb_agg(jsonb_build_object(
			'id', c.id::text, 'team', c.team, 'state', c.state, 'cardWorkItemId', c.card_work_item_id::text, 'bugWorkItemId', c.bug_work_item_id::text,
			'bug', jsonb_build_object('provider', b.provider, 'externalId', b.external_id),
			'pullRequest', CASE WHEN p.id IS NULL THEN NULL ELSE `+ref("p")+` END,
			'severity', c.severity, 'share', c.share, 'discovery', c.discovery, 'steward', c.steward, 'note', c.note,
			'proposedBy', c.proposed_by, 'proposedAt', c.proposed_at, 'confirmedBy', c.confirmed_by, 'confirmedAt', c.confirmed_at,
			'disputeUntil', c.dispute_until, 'disputedBy', c.disputed_by, 'disputedAt', c.disputed_at, 'disputeReason', c.dispute_reason,
			'resolvedBy', c.resolved_by, 'resolvedAt', c.resolved_at, 'resolution', c.resolution, 'evolvedBy', c.evolved_by, 'evolvedAt', c.evolved_at,
			'mendPullRequest', CASE WHEN m.id IS NULL THEN NULL ELSE `+ref("m")+` END,
			'mendNumber', c.mend_number, 'mendedAt', c.mended_at, 'mendedBy', c.mended_by, 'mendBySteward', c.mend_by_steward,
			'mendConfirmedAt', c.mend_confirmed_at, 'mendReopenedAt', c.mend_reopened_at) ORDER BY c.id), '[]')
			FROM card_cracks c JOIN work_items b ON b.id = c.bug_work_item_id
			LEFT JOIN pull_requests p ON p.id = c.pull_request_id LEFT JOIN pull_requests m ON m.id = c.mend_pull_request_id`),
		"rarity": goldenJSON(ctx, s, `SELECT COALESCE(jsonb_agg(jsonb_build_object('workItemId', r.work_item_id::text,
			'formula', r.formula, 'revealedTier', r.revealed_tier, 'predictedTier', r.predicted_tier, 'score', r.score::float8,
			'predictedScore', r.predicted_score::float8, 'percentile', r.percentile::float8, 'cohortTarget', r.cohort_target,
			'cohortQuarter', r.cohort_quarter, 'cohortSize', r.cohort_size, 'inputs', r.inputs, 'revealedAt', r.revealed_at,
			'recordedAt', r.recorded_at, 'checkedAt', r.checked_at) ORDER BY r.work_item_id), '[]')
			FROM card_rarity r WHERE r.revealed_tier IS NOT NULL`),
		"shapes": goldenJSON(ctx, s, `SELECT COALESCE(jsonb_agg(jsonb_build_object('pullRequest', `+ref("p")+`, 'shape', p.shape) ORDER BY p.id), '[]')
			FROM pull_requests p WHERE p.shape IS NOT NULL`),
		"kpis": goldenJSON(ctx, s, `SELECT COALESCE(jsonb_agg(jsonb_build_object('pullRequestId', p.id::text, 'kpis', p.kpis) ORDER BY p.id), '[]')
			FROM pull_requests p WHERE p.kpis IS NOT NULL`),
		"comments": goldenJSON(ctx, s, `SELECT COALESCE(jsonb_agg(jsonb_build_object('workItemId', c.work_item_id::text, 'moment', c.moment,
			'commentId', c.comment_id, 'image', c.image, 'publishedAt', c.published_at, 'checkedAt', c.checked_at) ORDER BY c.work_item_id), '[]') FROM card_comments c`),
	}
	return world, state
}

func goldenFacts(ctx context.Context, s *Store, id int64) any {
	q := `SELECT jsonb_build_object(
	'workItem', (SELECT jsonb_build_object('id', i.id::text, 'provider', i.provider, 'externalId', i.external_id,
		'externalRef', CASE WHEN i.provider = 'manual' OR i.external_id = '' THEN '' WHEN i.provider IN ('', 'vikunja') THEN 'VIK-' || i.external_id
			ELSE regexp_replace(i.provider, '[^a-zA-Z0-9_-]', '-', 'g') || '-' || regexp_replace(i.external_id, '[^a-zA-Z0-9_-]', '-', 'g') END,
		'externalScope', i.external_scope,
		'url', left(i.url, 4096), 'title', left(i.title, 4096), 'state', i.state, 'team', i.team, 'createdAt', i.created_at, 'updatedAt', i.updated_at,
		'trackerCreatedAt', i.tracker_created_at, 'estimateSeconds', i.estimate_seconds,
		'admittedAt', (SELECT at FROM audit_log WHERE work_item_id = i.id AND action IN ('work_item.queued', 'work_item.approved') ORDER BY id LIMIT 1),
		'target', CASE WHEN i.target_owner <> '' AND i.target_repo <> '' THEN jsonb_build_object('forge', i.target_forge, 'owner', i.target_owner, 'repo', i.target_repo, 'baseBranch', i.target_base_branch) END,
		'epics', (SELECT COALESCE(jsonb_agg(jsonb_build_object('provider', e.provider, 'externalId', e.epic_external_id, 'title', e.epic_title,
			'firstSeenAt', e.first_seen_at, 'lastSeenAt', e.last_seen_at, 'removedAt', e.removed_at) ORDER BY e.first_seen_at, e.epic_external_id), '[]')
			FROM work_item_epics e WHERE e.work_item_id = i.id),
		'withdrawals', (SELECT COALESCE(jsonb_agg(jsonb_build_object('at', a.at, 'actor', left(a.actor, 256)) ORDER BY a.id), '[]')
			FROM audit_log a WHERE a.work_item_id = i.id AND a.action = 'work_item.withdrawn'))
		FROM work_items i WHERE i.id = $1),
	'activityAt', (SELECT updated_at FROM work_items WHERE id = $1),
	'shifts', (SELECT COALESCE(jsonb_agg(` + operatorShiftJSON + ` ORDER BY sh.id), '[]') FROM shifts sh WHERE sh.work_item_id = $1),
	'runs', (SELECT COALESCE(jsonb_agg(` + operatorRunJSON + ` ORDER BY r.id), '[]') FROM agent_runs r WHERE r.work_item_id = $1),
	'checkpoints', (SELECT COALESCE(jsonb_agg(jsonb_build_object('at', created_at, 'pullRequestUrl', left(pr_url, 4096)) ORDER BY created_at, id), '[]')
		FROM checkpoints WHERE work_item_id = $1 AND pr_url <> ''),
	'pullRequests', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
		'id', p.id::text, 'forge', p.forge, 'owner', p.repo_owner, 'repo', p.repo_name, 'number', p.number, 'url', '',
		'shiftId', p.shift_id::text, 'branch', COALESCE(p.branch, sh.branch), 'baseBranch', p.base_branch, 'state', p.state, 'draft', p.draft, 'author', p.author,
		'headSha', p.head_sha, 'mergeCommitSha', p.merge_commit_sha, 'openedAt', p.opened_at, 'firstSeenAt', p.first_seen_at, 'mergedAt', p.merged_at,
		'mergedBy', p.merged_by, 'closedAt', p.closed_at, 'updatedAt', p.updated_at, 'additions', p.additions, 'deletions', p.deletions,
		'changedFiles', p.changed_files, 'labels', to_jsonb(p.labels), 'commits', p.commits, 'firstCommitAt', p.first_commit_at,
		'forcePushes', p.force_pushes, 'activityCapturedAt', p.activity_captured_at, 'activityTruncated', p.activity_truncated,
		'mergeState', p.merge_state, 'mergeHeadSha', p.merge_head_sha, 'mergeCheckedAt', p.merge_checked_at, 'unmergeablePolls', p.unmergeable_polls,
		'commitStatus', CASE WHEN p.ci_state IS NOT NULL AND p.ci_captured_at IS NOT NULL THEN jsonb_build_object('state', p.ci_state,
			'checks', COALESCE(p.ci_checks, '[]'), 'headSha', COALESCE(p.ci_head_sha, ''), 'capturedAt', p.ci_captured_at) END,
		'ciRunsCapturedAt', p.ci_runs_captured_at, 'ciRunsSource', p.ci_runs_source, 'ciRunsTruncated', p.ci_runs_truncated,
		'ciRuns', (SELECT COALESCE(jsonb_agg(jsonb_build_object('key', c.run_key, 'headSha', c.head_sha, 'workflow', c.workflow, 'status', c.status,
			'createdAt', c.created_at, 'startedAt', c.started_at, 'completedAt', c.completed_at, 'jobs', c.jobs) ORDER BY c.created_at NULLS FIRST, c.id), '[]')
			FROM pull_request_ci_runs c WHERE c.pull_request_id = p.id),
		'reviews', (SELECT COALESCE(jsonb_agg(jsonb_build_object('reviewer', left(v.reviewer, 256), 'state', v.state, 'headSha', v.head_sha, 'receivedAt', v.received_at)
			ORDER BY v.received_at, v.id), '[]') FROM pull_request_reviews v WHERE v.pull_request_id = p.id),
		'events', (SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', e.kind, 'actor', e.actor, 'at', e.at, 'state', e.state, 'headSha', e.head_sha)
			ORDER BY e.at, e.id), '[]') FROM pull_request_events e WHERE e.pull_request_id = p.id),
		'filesCapturedAt', p.files_captured_at, 'filesTruncated', p.files_truncated,
		'files', (SELECT COALESCE(jsonb_agg(jsonb_build_object('path', f.path, 'additions', f.additions, 'deletions', f.deletions, 'indentation', NULL)
			ORDER BY f.path), '[]') FROM pull_request_files f WHERE f.pull_request_id = p.id),
		'changedPaths', (SELECT jsonb_build_object('headSha', c.head_sha, 'truncated', c.truncated, 'capturedAt', c.captured_at,
			'paths', (SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('path', pp.path, 'status', pp.status, 'previousPath', pp.previous_path)) ORDER BY pp.position), '[]')
				FROM pull_request_paths pp WHERE pp.pull_request_id = c.pull_request_id AND pp.head_sha = c.head_sha))
			FROM pull_request_path_captures c WHERE c.pull_request_id = p.id AND c.head_sha = p.head_sha),
		'reverts', (SELECT COALESCE(jsonb_agg(jsonb_build_object('forge', r.forge, 'owner', r.repo_owner, 'repo', r.repo_name, 'number', r.number,
			'mergeCommitSha', r.merge_commit_sha, 'mergedAt', r.merged_at, 'mergedBy', r.merged_by, 'matchedBy', r.matched_by, 'detectedAt', r.detected_at)
			ORDER BY r.detected_at), '[]') FROM pull_request_reverts r WHERE r.pull_request_id = p.id),
		'deployments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('environment', pd.environment, 'firstDeployedAt', pd.first_deployed_at, 'sha', d.sha,
			'deployedAt', d.deployed_at, 'url', d.url, 'source', d.source) ORDER BY pd.first_deployed_at, pd.environment), '[]')
			FROM pull_request_deployments pd JOIN deployments d ON d.id = pd.deployment_id WHERE pd.pull_request_id = p.id)
		) ORDER BY p.number, p.id), '[]') FROM pull_requests p LEFT JOIN shifts sh ON sh.id = p.shift_id WHERE p.work_item_id = $1),
	'statusTransitions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('status', t.status, 'gate', t.gate, 'at', t.at, 'observed', t.observed, 'receivedAt', t.at) ORDER BY t.id), '[]')
		FROM status_transitions t WHERE t.work_item_id = $1),
	'gateTransitions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('gate', g.gate, 'status', g.status, 'actor', g.actor, 'reason', g.reason, 'at', g.at, 'receivedAt', g.at) ORDER BY g.id), '[]')
		FROM gate_transitions g WHERE g.work_item_id = $1),
	'deployEnvironments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('forge', d.forge, 'owner', d.repo_owner, 'repo', d.repo_name, 'environment', d.environment, 'firstDeployedAt', d.first)), '[]')
		FROM (SELECT forge, repo_owner, repo_name, environment, min(deployed_at) AS first FROM deployments dd
			WHERE EXISTS (SELECT 1 FROM pull_requests p WHERE p.work_item_id = $1 AND p.forge = dd.forge AND lower(p.repo_owner) = dd.repo_owner AND lower(p.repo_name) = dd.repo_name)
			GROUP BY forge, repo_owner, repo_name, environment) d),
	'roster', '[]'::jsonb, 'botLogins', '[]'::jsonb,
	'truncated', jsonb_build_object('shifts', false, 'runs', false, 'pullRequests', false, 'statusTransitions', false, 'gateTransitions', false))`
	facts := goldenJSON(ctx, s, q, id).(map[string]any)
	goldenPlayLinks(facts)
	return facts
}

func goldenPlayLinks(facts map[string]any) {
	checkpoints, _ := facts["checkpoints"].([]any)
	runs, _ := facts["runs"].([]any)
	for _, raw := range facts["pullRequests"].([]any) {
		p := raw.(map[string]any)
		repo := fmt.Sprint(p["owner"]) + "/" + fmt.Sprint(p["repo"])
		number := int(p["number"].(float64))
		link := ""
		for _, c := range checkpoints {
			u := fmt.Sprint(c.(map[string]any)["pullRequestUrl"])
			if link == "" && linkNames(u, repo, number) {
				link = u
			}
		}
		for _, r := range runs {
			for _, l := range r.(map[string]any)["links"].([]any) {
				if link == "" && linkNames(fmt.Sprint(l), repo, number) {
					link = fmt.Sprint(l)
				}
			}
		}
		p["url"] = link
	}
}
