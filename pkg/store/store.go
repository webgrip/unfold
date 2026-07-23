// Package store is Ploeg's Postgres data layer: work items, leases,
// checkpoints, runs, and the audit log. Every mutation commits its audit row
// in the same transaction (backlog #25); the lease columns are the lock,
// never a held transaction (backlog #23).
package store

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/webgrip/ploeg/pkg/work"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// ErrNoWork is returned by Claim when no claimable item exists for the team.
var ErrNoWork = errors.New("no claimable work item")

// ErrUnknownRun is returned when a run token does not match a live lease/run.
var ErrUnknownRun = errors.New("unknown or finished run")

// MaxAttempts is the retry threshold after which a repeatedly released item
// goes stale instead of re-queuing (R5).
const MaxAttempts = 3

type Store struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, databaseURL string) (*Store, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close()                         { s.pool.Close() }
func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

// Migrate applies embedded migrations in filename order, tracked in
// schema_migrations. Safe to run on every boot.
func (s *Store) Migrate(ctx context.Context) error {
	if _, err := s.pool.Exec(ctx,
		`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)
	for _, name := range names {
		var applied bool
		if err := s.pool.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1)`, name).Scan(&applied); err != nil {
			return err
		}
		if applied {
			continue
		}
		sql, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		tx, err := s.pool.Begin(ctx)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("migration %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, name); err != nil {
			_ = tx.Rollback(ctx)
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
	}
	return nil
}

func audit(ctx context.Context, tx pgx.Tx, actor, action string, workItemID *int64, detail any) error {
	b, err := json.Marshal(detail)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO audit_log (actor, action, work_item_id, detail) VALUES ($1, $2, $3, $4)`,
		actor, action, workItemID, b)
	return err
}

// IngestAssigned mirrors a tracker item and queues it for a team: upsert on
// (provider, external id), then ingested->queued. Re-assignment of a live
// item only refreshes the mirror.
func (s *Store) IngestAssigned(ctx context.Context, item work.WorkItem) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var id int64
	err = tx.QueryRow(ctx, `
		INSERT INTO work_items (provider, external_id, revision, team, state, origin, priority, title, description, url)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (provider, external_id) DO UPDATE SET
			revision = EXCLUDED.revision,
			team     = EXCLUDED.team,
			priority = EXCLUDED.priority,
			title    = EXCLUDED.title,
			description = EXCLUDED.description,
			url      = EXCLUDED.url,
			state    = CASE WHEN work_items.state IN ('ingested', 'stale') THEN 'queued' ELSE work_items.state END,
			updated_at = now()
		RETURNING id`,
		item.Provider, item.ExternalID, item.Revision, item.Team,
		string(work.StateQueued), string(work.OriginAssignment), item.Priority, item.Title, item.Description, item.URL).Scan(&id)
	if err != nil {
		return 0, err
	}
	if err := audit(ctx, tx, "webhook:"+item.Provider, "work_item.queued", &id,
		map[string]any{"external_id": item.ExternalID, "team": item.Team, "title": item.Title}); err != nil {
		return 0, err
	}
	return id, tx.Commit(ctx)
}

// Claimed is what a worker gets back from Claim: the item plus the run token
// it must use for renew/checkpoint/outcome calls.
type Claimed struct {
	Item     work.WorkItem
	RunToken string
	Deadline time.Time
}

// Claim atomically leases the highest-priority queued item for a team using
// FOR UPDATE SKIP LOCKED, committed immediately (backlog #23). Returns
// ErrNoWork when the queue is empty — the empty-handed worker convention
// (backlog #49).
func (s *Store) Claim(ctx context.Context, team string, ttl time.Duration) (*Claimed, error) {
	token, err := newToken()
	if err != nil {
		return nil, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var it work.WorkItem
	var id int64
	err = tx.QueryRow(ctx, `
		UPDATE work_items SET state = 'leased', attempts = attempts + 1, updated_at = now()
		WHERE id = (
			SELECT id FROM work_items
			WHERE team = $1 AND state = 'queued'
			ORDER BY priority DESC, created_at
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		)
		RETURNING id, provider, external_id, revision, team, origin, priority, title, description, url`,
		team).Scan(&id, &it.Provider, &it.ExternalID, &it.Revision, &it.Team, &it.Origin, &it.Priority, &it.Title, &it.Description, &it.URL)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNoWork
	}
	if err != nil {
		return nil, err
	}
	it.ID = fmt.Sprint(id)
	it.State = work.StateLeased

	deadline := time.Now().Add(ttl)
	if _, err := tx.Exec(ctx,
		`INSERT INTO leases (work_item_id, team, run_token, expires_at) VALUES ($1, $2, $3, $4)`,
		id, team, token, deadline); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO agent_runs (work_item_id, team, run_token) VALUES ($1, $2, $3)`,
		id, team, token); err != nil {
		return nil, err
	}
	if err := audit(ctx, tx, "team:"+team, "lease.acquired", &id,
		map[string]any{"expires_at": deadline}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &Claimed{Item: it, RunToken: token, Deadline: deadline}, nil
}

// Renew extends the lease held by a run token (backlog #13).
func (s *Store) Renew(ctx context.Context, runToken string, ttl time.Duration) (time.Time, error) {
	deadline := time.Now().Add(ttl)
	tag, err := s.pool.Exec(ctx,
		`UPDATE leases SET expires_at = $1, renewed_at = now() WHERE run_token = $2`,
		deadline, runToken)
	if err != nil {
		return time.Time{}, err
	}
	if tag.RowsAffected() == 0 {
		return time.Time{}, ErrUnknownRun
	}
	return deadline, nil
}

// Checkpoint records durable progress for the item owned by the run token.
func (s *Store) Checkpoint(ctx context.Context, runToken string, cp work.Checkpoint) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var id int64
	var team string
	if err := tx.QueryRow(ctx,
		`SELECT work_item_id, team FROM leases WHERE run_token = $1`, runToken).Scan(&id, &team); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrUnknownRun
		}
		return err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO checkpoints (work_item_id, phase, branch, pr_url) VALUES ($1, $2, $3, $4)`,
		id, cp.Phase, cp.Branch, cp.PRURL); err != nil {
		return err
	}
	if err := audit(ctx, tx, "team:"+team, "checkpoint.written", &id,
		map[string]any{"phase": cp.Phase, "branch": cp.Branch, "pr_url": cp.PRURL}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ReportOutcome ends the run: records the outcome, releases the lease, and
// transitions the item per StateForOutcome. A stuck outcome requires a
// reason (R4).
func (s *Store) ReportOutcome(ctx context.Context, runToken string, rep harnessReport) error {
	if rep.Outcome == work.OutcomeStuck && rep.StuckReason == "" {
		return errors.New("stuck outcome requires a stuck_reason (R4)")
	}
	next := work.StateForOutcome(rep.Outcome)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var id int64
	var team string
	if err := tx.QueryRow(ctx,
		`DELETE FROM leases WHERE run_token = $1 RETURNING work_item_id, team`, runToken).Scan(&id, &team); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrUnknownRun
		}
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE agent_runs SET finished_at = now(), outcome = $1, summary = $2, stuck_reason = $3, links = $4
		WHERE run_token = $5`,
		string(rep.Outcome), rep.Summary, rep.StuckReason, rep.Links, runToken); err != nil {
		return err
	}
	// A failed outcome re-queues until the retry threshold, then stale (R5).
	if next == work.StateQueued {
		if _, err := tx.Exec(ctx, `
			UPDATE work_items
			SET state = CASE WHEN attempts >= $2 THEN 'stale' ELSE 'queued' END, updated_at = now()
			WHERE id = $1`, id, MaxAttempts); err != nil {
			return err
		}
	} else {
		if _, err := tx.Exec(ctx,
			`UPDATE work_items SET state = $2, updated_at = now() WHERE id = $1`, id, string(next)); err != nil {
			return err
		}
	}
	if err := audit(ctx, tx, "team:"+team, "outcome."+string(rep.Outcome), &id,
		map[string]any{"summary": rep.Summary, "stuck_reason": rep.StuckReason, "links": rep.Links}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// harnessReport mirrors harness.OutcomeReport without importing the package
// (store stays ignorant of transport shapes).
type harnessReport struct {
	Outcome     work.Outcome
	Summary     string
	StuckReason string
	Links       []string
}

// Report is the store-level outcome input.
func Report(outcome work.Outcome, summary, stuckReason string, links []string) harnessReport {
	return harnessReport{Outcome: outcome, Summary: summary, StuckReason: stuckReason, Links: links}
}

// ExpireLeases releases every overdue lease: the run is recorded as failed
// (reason lease_expired) and the item re-queues or goes stale per the retry
// threshold — the crash-safety mechanic (R2/R5). Returns released item ids.
func (s *Store) ExpireLeases(ctx context.Context) ([]int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	rows, err := tx.Query(ctx,
		`DELETE FROM leases WHERE expires_at < now() RETURNING work_item_id, team, run_token`)
	if err != nil {
		return nil, err
	}
	type expired struct {
		id    int64
		team  string
		token string
	}
	var exp []expired
	for rows.Next() {
		var e expired
		if err := rows.Scan(&e.id, &e.team, &e.token); err != nil {
			return nil, err
		}
		exp = append(exp, e)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	var ids []int64
	for _, e := range exp {
		if _, err := tx.Exec(ctx, `
			UPDATE agent_runs SET finished_at = now(), outcome = 'failed', summary = 'lease expired'
			WHERE run_token = $1 AND finished_at IS NULL`, e.token); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE work_items
			SET state = CASE WHEN attempts >= $2 THEN 'stale' ELSE 'queued' END, updated_at = now()
			WHERE id = $1 AND state = 'leased'`, e.id, MaxAttempts); err != nil {
			return nil, err
		}
		if err := audit(ctx, tx, "ploegd:sweeper", "lease.expired", &e.id,
			map[string]any{"team": e.team}); err != nil {
			return nil, err
		}
		ids = append(ids, e.id)
	}
	return ids, tx.Commit(ctx)
}

// QueueSnapshot lists a team's queue (and everything else non-done) for
// operator visibility — deliberately not a board.
func (s *Store) QueueSnapshot(ctx context.Context, team string) ([]work.WorkItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, provider, external_id, revision, team, state, origin, priority, title, description, url, created_at, updated_at
		FROM work_items
		WHERE team = $1 AND state <> 'done'
		ORDER BY priority DESC, created_at`, team)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []work.WorkItem
	for rows.Next() {
		var it work.WorkItem
		var id int64
		if err := rows.Scan(&id, &it.Provider, &it.ExternalID, &it.Revision, &it.Team, &it.State,
			&it.Origin, &it.Priority, &it.Title, &it.Description, &it.URL, &it.CreatedAt, &it.UpdatedAt); err != nil {
			return nil, err
		}
		it.ID = fmt.Sprint(id)
		items = append(items, it)
	}
	return items, rows.Err()
}

func newToken() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
