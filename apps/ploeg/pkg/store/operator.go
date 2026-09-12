package store

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrOperatorNotFound = errors.New("operator resource not found")

type OperatorFilter struct {
	Teams      []string
	Team       string
	State      string
	NeedsHuman bool
	After      int64
	Limit      int
	WorkItemID int64
}

type OperatorTeam struct {
	ID         string         `json:"id"`
	Paused     *bool          `json:"paused"`
	QueueDepth int64          `json:"queueDepth"`
	Roles      []OperatorRole `json:"roles"`
}

type OperatorRole struct {
	ID         string `json:"id"`
	QueueDepth int64  `json:"queueDepth"`
}

type OperatorTarget struct {
	Forge      string `json:"forge"`
	Owner      string `json:"owner"`
	Repo       string `json:"repo"`
	BaseBranch string `json:"baseBranch"`
}

type OperatorLease struct {
	ExpiresAt time.Time `json:"expiresAt"`
	RenewedAt time.Time `json:"renewedAt"`
}

type OperatorItem struct {
	ID             string          `json:"id"`
	Provider       string          `json:"provider"`
	ExternalID     string          `json:"externalId"`
	Revision       string          `json:"revision"`
	Team           string          `json:"team"`
	State          string          `json:"state"`
	Title          string          `json:"title"`
	Description    string          `json:"description"`
	URL            string          `json:"url"`
	Priority       int             `json:"priority"`
	Attempts       int             `json:"attempts"`
	InfraFailures  int             `json:"infraFailures"`
	NextEligibleAt *time.Time      `json:"nextEligibleAt"`
	CreatedAt      time.Time       `json:"createdAt"`
	UpdatedAt      time.Time       `json:"updatedAt"`
	Target         *OperatorTarget `json:"target"`
	LatestShift    *OperatorShift  `json:"latestShift"`
	Lease          *OperatorLease  `json:"lease"`
}

type OperatorShift struct {
	ID          string     `json:"id"`
	WorkItemID  string     `json:"workItemId"`
	Team        string     `json:"team"`
	Branch      string     `json:"branch"`
	Round       int        `json:"round"`
	BudgetUSD   float64    `json:"budgetUsd"`
	SpentUSD    float64    `json:"spentUsd"`
	ReservedUSD float64    `json:"reservedUsd"`
	OpenedAt    time.Time  `json:"openedAt"`
	ClosedAt    *time.Time `json:"closedAt"`
	CloseReason string     `json:"closeReason"`
}

type OperatorUsage struct {
	InputTokens  *int64   `json:"inputTokens,omitempty"`
	OutputTokens *int64   `json:"outputTokens,omitempty"`
	CostUSD      *float64 `json:"costUsd,omitempty"`
}

type OperatorRun struct {
	ID            string         `json:"id"`
	WorkItemID    string         `json:"workItemId"`
	ShiftID       *string        `json:"shiftId"`
	Team          string         `json:"team"`
	Role          string         `json:"role"`
	Round         int            `json:"round"`
	Writes        bool           `json:"writes"`
	State         string         `json:"state"`
	StartedAt     *time.Time     `json:"startedAt"`
	FinishedAt    *time.Time     `json:"finishedAt"`
	ExpiresAt     *time.Time     `json:"expiresAt"`
	Outcome       *string        `json:"outcome"`
	Summary       string         `json:"summary"`
	StuckReason   string         `json:"stuckReason"`
	Links         []string       `json:"links"`
	Findings      string         `json:"findings"`
	Verdict       string         `json:"verdict"`
	FailureReason *string        `json:"failureReason"`
	AuthorizedUSD float64        `json:"authorizedUsd"`
	Usage         *OperatorUsage `json:"usage"`
	CostStatus    string         `json:"costStatus"`
	KeyAlias      *string        `json:"keyAlias"`
}

type OperatorCheckpoint struct {
	ID         string    `json:"id"`
	WorkItemID string    `json:"workItemId"`
	Phase      string    `json:"phase"`
	Branch     string    `json:"branch"`
	PRURL      string    `json:"prUrl"`
	CreatedAt  time.Time `json:"createdAt"`
	NodeName   string    `json:"nodeName"`
	PodUID     string    `json:"podUid"`
}

type OperatorEvent struct {
	ID         string         `json:"id"`
	At         time.Time      `json:"at"`
	Actor      string         `json:"actor"`
	Action     string         `json:"action"`
	WorkItemID string         `json:"workItemId"`
	Team       string         `json:"team"`
	Detail     map[string]any `json:"detail"`
}

type OperatorDetail struct {
	Item        OperatorItem         `json:"item"`
	Shifts      []OperatorShift      `json:"shifts"`
	Runs        []OperatorRun        `json:"runs"`
	Checkpoints []OperatorCheckpoint `json:"checkpoints"`
	Events      []OperatorEvent      `json:"events"`
	Truncated   OperatorTruncated    `json:"truncated"`
}

type OperatorTruncated struct {
	Shifts      bool `json:"shifts"`
	Runs        bool `json:"runs"`
	Checkpoints bool `json:"checkpoints"`
	Events      bool `json:"events"`
}

const operatorShiftJSON = `jsonb_build_object(
	'id', sh.id::text, 'workItemId', sh.work_item_id::text, 'team', sh.team,
	'branch', left(sh.branch, 1024), 'round', sh.round, 'budgetUsd', sh.budget,
	'spentUsd', sh.spent, 'reservedUsd', (SELECT COALESCE(SUM(reserved), 0) FROM run_budget_holds WHERE shift_id = sh.id),
	'openedAt', sh.opened_at, 'closedAt', sh.closed_at, 'closeReason', left(sh.close_reason, 4096))`

const operatorItemJSON = `jsonb_build_object(
	'id', i.id::text, 'provider', i.provider, 'externalId', i.external_id, 'revision', i.revision,
	'team', i.team, 'state', i.state, 'title', left(i.title, 4096), 'description', left(i.description, 16384),
	'url', left(i.url, 4096), 'priority', i.priority, 'attempts', i.attempts, 'infraFailures', i.infra_failures,
	'nextEligibleAt', i.next_eligible_at, 'createdAt', i.created_at, 'updatedAt', i.updated_at,
	'target', CASE WHEN i.target_forge <> '' AND i.target_owner <> '' AND i.target_repo <> '' THEN
		jsonb_build_object('forge', i.target_forge, 'owner', i.target_owner, 'repo', i.target_repo, 'baseBranch', i.target_base_branch) ELSE NULL END,
	'latestShift', (SELECT ` + operatorShiftJSON + ` FROM shifts sh WHERE sh.work_item_id = i.id ORDER BY sh.id DESC LIMIT 1),
	'lease', (SELECT jsonb_build_object('expiresAt', l.expires_at, 'renewedAt', l.renewed_at) FROM leases l WHERE l.work_item_id = i.id))`

const operatorRunCost = `CASE WHEN EXISTS (SELECT 1 FROM run_llm_accounts WHERE run_token = r.run_token)
	THEN (SELECT to_jsonb(COALESCE(reconciled_spend, observed_spend)) FROM run_llm_accounts WHERE run_token = r.run_token)
	ELSE CASE WHEN jsonb_typeof(r.usage->'costUsd') = 'number' THEN r.usage->'costUsd' END END`

const operatorRunJSON = `jsonb_build_object(
	'id', r.id::text, 'workItemId', r.work_item_id::text, 'shiftId', r.shift_id::text,
	'team', r.team, 'role', r.role, 'round', r.round, 'writes', r.writes, 'state', r.state,
	'startedAt', r.started_at, 'finishedAt', r.finished_at, 'expiresAt', r.expires_at,
	'outcome', r.outcome, 'summary', left(r.summary, 4096), 'stuckReason', left(r.stuck_reason, 4096),
	'links', to_jsonb(r.links[1:30]), 'findings', left(r.findings, 16384), 'verdict', r.verdict,
	'failureReason', r.failure_reason, 'authorizedUsd', r.authorized,
	'usage', CASE WHEN r.usage IS NULL AND (` + operatorRunCost + `) IS NULL THEN NULL ELSE jsonb_strip_nulls(jsonb_build_object(
		'inputTokens', CASE WHEN jsonb_typeof(r.usage->'inputTokens') = 'number' THEN r.usage->'inputTokens' END,
		'outputTokens', CASE WHEN jsonb_typeof(r.usage->'outputTokens') = 'number' THEN r.usage->'outputTokens' END,
		'costUsd', ` + operatorRunCost + `)) END,
	'costStatus', CASE WHEN (` + operatorRunCost + `) IS NOT NULL THEN 'observed' ELSE 'unknown' END,
	'keyAlias', CASE WHEN r.started_at IS NOT NULL THEN 'ploeg-' || left(r.run_token, 12) ELSE NULL END)`

const operatorCheckpointJSON = `jsonb_build_object(
	'id', c.id::text, 'workItemId', c.work_item_id::text, 'phase', c.phase, 'branch', left(c.branch, 1024),
	'prUrl', left(c.pr_url, 4096), 'createdAt', c.created_at, 'nodeName', c.node_name, 'podUid', c.pod_uid)`

const operatorEventJSON = `jsonb_build_object(
	'id', a.id::text, 'at', a.at, 'actor', left(a.actor, 256), 'action', a.action,
	'workItemId', a.work_item_id::text, 'team', i.team,
	'detail', jsonb_strip_nulls(jsonb_build_object(
		'shiftId', CASE WHEN jsonb_typeof(a.detail->'shift') = 'number' THEN a.detail->>'shift' END,
		'round', CASE WHEN jsonb_typeof(a.detail->'round') = 'number' THEN a.detail->'round' END,
		'role', CASE WHEN jsonb_typeof(a.detail->'role') = 'string' THEN left(a.detail->>'role', 256) END,
		'writes', CASE WHEN jsonb_typeof(a.detail->'writes') = 'boolean' THEN a.detail->'writes' END,
		'authorizedUsd', CASE WHEN jsonb_typeof(a.detail->'authorized') = 'number' THEN a.detail->'authorized' END,
		'phase', CASE WHEN jsonb_typeof(a.detail->'phase') = 'string' THEN left(a.detail->>'phase', 256) END,
		'reason', CASE WHEN jsonb_typeof(a.detail->'reason') = 'string' THEN left(a.detail->>'reason', 4096) END,
		'infraFailures', CASE WHEN jsonb_typeof(a.detail->'infra_failures') = 'number' THEN a.detail->'infra_failures' END)))`

func (s *Store) OperatorTeams(ctx context.Context, teams []string, registered map[string][]string) ([]OperatorTeam, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT team, '' AS role, count(*) FILTER (WHERE state = 'queued' AND NOT operator_owned AND (next_eligible_at IS NULL OR next_eligible_at <= now())), false
		FROM work_items WHERE ($1::text[] IS NULL OR team = ANY($1)) GROUP BY team
		UNION ALL
		SELECT team, role, count(*) FILTER (WHERE state = 'pending'), true
		FROM agent_runs WHERE ($1::text[] IS NULL OR team = ANY($1)) GROUP BY team, role`, teams)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byID := map[string]*OperatorTeam{}
	allowed := func(team string) bool {
		if teams == nil {
			return true
		}
		for _, v := range teams {
			if v == team {
				return true
			}
		}
		return false
	}
	ensure := func(id string) *OperatorTeam {
		if byID[id] == nil {
			byID[id] = &OperatorTeam{ID: id, Roles: []OperatorRole{}}
		}
		return byID[id]
	}
	for id, roles := range registered {
		if !allowed(id) {
			continue
		}
		team := ensure(id)
		for _, role := range roles {
			team.Roles = append(team.Roles, OperatorRole{ID: role})
		}
	}
	for rows.Next() {
		var teamID, role string
		var depth int64
		var isRole bool
		if err := rows.Scan(&teamID, &role, &depth, &isRole); err != nil {
			return nil, err
		}
		team := ensure(teamID)
		if !isRole {
			team.QueueDepth = depth
			continue
		}
		found := false
		for idx := range team.Roles {
			if team.Roles[idx].ID == role {
				team.Roles[idx].QueueDepth = depth
				found = true
				break
			}
		}
		if !found {
			team.Roles = append(team.Roles, OperatorRole{ID: role, QueueDepth: depth})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]OperatorTeam, 0, len(byID))
	for _, team := range byID {
		sort.Slice(team.Roles, func(i, j int) bool { return team.Roles[i].ID < team.Roles[j].ID })
		out = append(out, *team)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

func (s *Store) OperatorItems(ctx context.Context, f OperatorFilter) ([]OperatorItem, bool, error) {
	if err := validateOperatorFilter(f); err != nil {
		return nil, false, err
	}
	rows, err := s.pool.Query(ctx, `SELECT `+operatorItemJSON+` FROM work_items i
		WHERE ($1::text[] IS NULL OR i.team = ANY($1)) AND ($2 = '' OR i.team = $2)
		AND ($3 = '' OR i.state = $3) AND (NOT $4 OR i.state = 'needs_human') AND i.id > $5
		ORDER BY i.id LIMIT $6`, f.Teams, f.Team, f.State, f.NeedsHuman, f.After, f.Limit+1)
	if err != nil {
		return nil, false, err
	}
	items, err := operatorDecodeRows[OperatorItem](rows)
	if err != nil {
		return nil, false, err
	}
	return operatorPage(items, f.Limit)
}

func (s *Store) OperatorItem(ctx context.Context, id int64, teams []string) (OperatorDetail, error) {
	var detail OperatorDetail
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return detail, err
	}
	defer tx.Rollback(ctx)
	var raw []byte
	if err := tx.QueryRow(ctx, `SELECT `+operatorItemJSON+` FROM work_items i WHERE i.id = $1 AND ($2::text[] IS NULL OR i.team = ANY($2))`, id, teams).Scan(&raw); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return detail, ErrOperatorNotFound
		}
		return detail, err
	}
	if err := operatorDecode(raw, &detail.Item); err != nil {
		return detail, err
	}
	const limit = 200
	shifts, err := tx.Query(ctx, `SELECT `+operatorShiftJSON+` FROM shifts sh WHERE sh.work_item_id = $1 ORDER BY sh.id DESC LIMIT $2`, id, limit+1)
	if err != nil {
		return detail, err
	}
	allShifts, err := operatorDecodeRows[OperatorShift](shifts)
	if err != nil {
		return detail, err
	}
	detail.Shifts, detail.Truncated.Shifts, _ = operatorPage(allShifts, limit)
	runs, err := tx.Query(ctx, `SELECT `+operatorRunJSON+` FROM agent_runs r WHERE r.work_item_id = $1 ORDER BY r.id DESC LIMIT $2`, id, limit+1)
	if err != nil {
		return detail, err
	}
	allRuns, err := operatorDecodeRows[OperatorRun](runs)
	if err != nil {
		return detail, err
	}
	detail.Runs, detail.Truncated.Runs, _ = operatorPage(allRuns, limit)
	checkpoints, err := tx.Query(ctx, `SELECT `+operatorCheckpointJSON+` FROM checkpoints c WHERE c.work_item_id = $1 ORDER BY c.id DESC LIMIT $2`, id, limit+1)
	if err != nil {
		return detail, err
	}
	allCheckpoints, err := operatorDecodeRows[OperatorCheckpoint](checkpoints)
	if err != nil {
		return detail, err
	}
	detail.Checkpoints, detail.Truncated.Checkpoints, _ = operatorPage(allCheckpoints, limit)
	events, err := tx.Query(ctx, `SELECT `+operatorEventJSON+` FROM audit_log a JOIN work_items i ON i.id = a.work_item_id WHERE i.id = $1 ORDER BY a.id DESC LIMIT $2`, id, limit+1)
	if err != nil {
		return detail, err
	}
	allEvents, err := operatorDecodeRows[OperatorEvent](events)
	if err != nil {
		return detail, err
	}
	detail.Events, detail.Truncated.Events, _ = operatorPage(allEvents, limit)
	return detail, tx.Commit(ctx)
}

func (s *Store) OperatorRun(ctx context.Context, id int64, teams []string) (OperatorRun, error) {
	var run OperatorRun
	var raw []byte
	err := s.pool.QueryRow(ctx, `SELECT `+operatorRunJSON+` FROM agent_runs r JOIN work_items i ON i.id = r.work_item_id WHERE r.id = $1 AND ($2::text[] IS NULL OR i.team = ANY($2))`, id, teams).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return run, ErrOperatorNotFound
	}
	if err != nil {
		return run, err
	}
	if err := operatorDecode(raw, &run); err != nil {
		return run, err
	}
	return run, nil
}

func (s *Store) OperatorEvents(ctx context.Context, f OperatorFilter) ([]OperatorEvent, bool, error) {
	if err := validateOperatorFilter(f); err != nil {
		return nil, false, err
	}
	rows, err := s.pool.Query(ctx, `SELECT `+operatorEventJSON+` FROM audit_log a JOIN work_items i ON i.id = a.work_item_id
		WHERE ($1::text[] IS NULL OR i.team = ANY($1)) AND ($2 = '' OR i.team = $2)
		AND ($3::bigint = 0 OR i.id = $3) AND a.id > $4 ORDER BY a.id LIMIT $5`, f.Teams, f.Team, f.WorkItemID, f.After, f.Limit+1)
	if err != nil {
		return nil, false, err
	}
	events, err := operatorDecodeRows[OperatorEvent](rows)
	if err != nil {
		return nil, false, err
	}
	return operatorPage(events, f.Limit)
}

func validateOperatorFilter(f OperatorFilter) error {
	if f.Limit < 1 || f.Limit > 200 || f.After < 0 || f.WorkItemID < 0 {
		return errors.New("invalid operator pagination")
	}
	return nil
}

func operatorDecodeRows[T any](rows pgx.Rows) ([]T, error) {
	defer rows.Close()
	values := []T{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var value T
		if err := operatorDecode(raw, &value); err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, rows.Err()
}

func operatorPage[T any](values []T, limit int) ([]T, bool, error) {
	more := len(values) > limit
	if more {
		values = values[:limit]
	}
	return values, more, nil
}

var operatorRunToken = regexp.MustCompile(`\b[0-9a-f]{48}\b`)
var operatorKey = regexp.MustCompile(`(?i)\b(?:sk-[A-Za-z0-9_-]{8,}|Bearer [A-Za-z0-9._~+/=-]{8,})`)

func operatorDecode(raw []byte, output any) error {
	var value any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&value); err != nil {
		return err
	}
	encoded, err := json.Marshal(operatorClean(value, ""))
	if err != nil {
		return err
	}
	return json.Unmarshal(encoded, output)
}

func operatorClean(value any, key string) any {
	switch v := value.(type) {
	case map[string]any:
		for k, item := range v {
			v[k] = operatorClean(item, k)
		}
		return v
	case []any:
		for i := range v {
			v[i] = operatorClean(v[i], key)
		}
		return v
	case string:
		v = operatorKey.ReplaceAllString(operatorRunToken.ReplaceAllString(v, "[redacted]"), "[redacted]")
		if key == "url" || key == "prUrl" || key == "links" {
			u, err := url.Parse(v)
			if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil {
				return ""
			}
			u.RawQuery, u.Fragment = "", ""
			return u.String()
		}
		return v
	default:
		return value
	}
}

func OperatorCursor(id string) (int64, error) {
	if id == "" {
		return 0, nil
	}
	if len(id) > 19 || strings.Trim(id, "0123456789") != "" {
		return 0, errors.New("cursor must be a non-negative decimal identifier")
	}
	n, err := strconv.ParseInt(id, 10, 64)
	if err != nil || n < 0 {
		return 0, fmt.Errorf("cursor outside supported range")
	}
	return n, nil
}
