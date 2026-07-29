package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/webgrip/ploeg/pkg/work"
)

// Shifts (ADR-0010): one Team's engagement with one Work Item, working it over
// a sequence of Rounds. A Round is either a fan-out of readers or a single
// writer, never both — and because a Round materialises its Runs as rows, the
// claim predicate and the KEDA scaler query are literally the same statement.
// See migrations/0007_shifts.sql for why that matters.

// ErrBudgetExhausted means the Shift pool cannot fund another Run. This is a
// gate outcome, not a failed Run: nothing is spawned, no key is minted and no
// attempt is burned (backlog #44, #60).
var ErrBudgetExhausted = errors.New("shift budget exhausted")

// minViableAuthorization is the floor below which spawning is pointless — a
// Run against a few cents dies having achieved nothing while still costing an
// attempt and a pod. ADR-0012 calls this the floor, not just a ceiling.
const minViableAuthorization = 0.05

// Role is one slot in a Round.
type Role struct {
	Name string
	// Writes distinguishes a builder from a reviewer. A writing Role takes the
	// Shift's Lease and runs alone; readers take none and run beside each other.
	Writes bool
	// Cap bounds what one Run of this Role may spend. The minted credential is
	// min(Cap, poolRemaining), so a Run can never overrun the Shift ceiling.
	Cap float64
}

// OpenShift begins a Shift on a queued Work Item. The unique partial index
// shifts_one_live_per_item makes a second live Shift on the same item a
// database error rather than a race two Teams can both win.
func (s *Store) OpenShift(ctx context.Context, workItemID int64, team, branch string, budget float64) (int64, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO shifts (work_item_id, team, branch, budget)
		VALUES ($1, $2, $3, $4) RETURNING id`,
		workItemID, team, branch, budget).Scan(&id)
	return id, err
}

// OpenRound materialises the next Round: one pending Run per Role.
//
// Refuses to mix writers and readers. That rule is the whole of the
// concurrency control, so it is enforced here rather than trusted to callers —
// a mixed Round would put a reader beside a writer mutating the same branch.
func (s *Store) OpenRound(ctx context.Context, shiftID int64, roles []Role) (int, error) {
	if len(roles) == 0 {
		return 0, errors.New("a round needs at least one role")
	}
	writers := 0
	for _, r := range roles {
		if r.Writes {
			writers++
		}
	}
	if writers > 0 && writers != len(roles) {
		return 0, errors.New("a round is either readers or one writer, never both (ADR-0010)")
	}
	if writers > 1 {
		return 0, errors.New("a round admits at most one writer (ADR-0010)")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var round int
	var workItemID int64
	var team string
	if err := tx.QueryRow(ctx,
		`UPDATE shifts SET round = round + 1 WHERE id = $1 AND closed_at IS NULL
		 RETURNING round, work_item_id, team`, shiftID).
		Scan(&round, &workItemID, &team); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, fmt.Errorf("shift %d is not open", shiftID)
		}
		return 0, err
	}

	for _, r := range roles {
		token, err := newToken()
		if err != nil {
			return 0, err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO agent_runs (work_item_id, shift_id, team, role, round, writes, state, run_token, started_at)
			VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NULL)`,
			workItemID, shiftID, team, r.Name, round, r.Writes, token); err != nil {
			return 0, err
		}
	}
	if err := audit(ctx, tx, "team:"+team, "round.opened", &workItemID,
		map[string]any{"shift": shiftID, "round": round, "roles": roleNames(roles)}); err != nil {
		return 0, err
	}
	return round, tx.Commit(ctx)
}

func roleNames(roles []Role) []string {
	out := make([]string, 0, len(roles))
	for _, r := range roles {
		out = append(out, r.Name)
	}
	return out
}

// ClaimedRun is what a worker pod receives when it picks up its slot.
type ClaimedRun struct {
	Item       work.WorkItem
	RunToken   string
	Deadline   time.Time
	ShiftID    int64
	Role       string
	Round      int
	Writes     bool
	Branch     string
	Authorized float64 // what the minted LLM credential must be capped at
}

// ClaimRole takes the oldest pending Run for a team and role.
//
// The predicate is deliberately trivial — pending runs for (team, role),
// oldest first — because PendingRuns below must mirror it exactly and that
// mirror is what KEDA scales on. A divergence there stalls work invisibly and
// forever, which is why neither query is allowed to grow a clause the other
// lacks.
//
// Budget is authorized in the same transaction (ADR-0012). Locking the Shift
// row serialises concurrent claims, so five readers starting at once cannot
// each see the full pool.
func (s *Store) ClaimRole(ctx context.Context, team, role string, ttl time.Duration, cap float64) (*ClaimedRun, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var runID, shiftID, workItemID int64
	var token string
	var round int
	var writes bool
	err = tx.QueryRow(ctx, `
		SELECT id, shift_id, work_item_id, run_token, round, writes FROM agent_runs
		WHERE team = $1 AND role = $2 AND state = 'pending'
		ORDER BY id
		FOR UPDATE SKIP LOCKED
		LIMIT 1`, team, role).Scan(&runID, &shiftID, &workItemID, &token, &round, &writes)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNoWork
	}
	if err != nil {
		return nil, err
	}

	// Lock the Shift so the pool arithmetic below cannot race a sibling claim.
	var budget, spent, branch = 0.0, 0.0, ""
	if err := tx.QueryRow(ctx,
		`SELECT budget, spent, branch FROM shifts WHERE id = $1 AND closed_at IS NULL FOR UPDATE`,
		shiftID).Scan(&budget, &spent, &branch); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("shift %d closed while claiming", shiftID)
		}
		return nil, err
	}
	var reserved float64
	if err := tx.QueryRow(ctx,
		`SELECT COALESCE(SUM(authorized), 0) FROM agent_runs WHERE shift_id = $1 AND state = 'running'`,
		shiftID).Scan(&reserved); err != nil {
		return nil, err
	}

	authorized := budget - spent - reserved
	if cap > 0 && cap < authorized {
		authorized = cap
	}
	if budget > 0 && authorized < minViableAuthorization {
		return nil, ErrBudgetExhausted
	}

	deadline := time.Now().Add(ttl)
	// expires_at is the Run's own liveness deadline. It is not the Lease's:
	// readers hold no Lease, so lease expiry could never detect a dead reader.
	if _, err := tx.Exec(ctx, `
		UPDATE agent_runs SET state = 'running', started_at = now(), authorized = $2, expires_at = $3
		WHERE id = $1`, runID, authorized, deadline); err != nil {
		return nil, err
	}

	// Only a writer takes the Lease — that is what lets readers run beside one
	// another. The unique key on leases makes a second writer impossible even
	// if a caller opened a malformed Round.
	if writes {
		if _, err := tx.Exec(ctx,
			`INSERT INTO leases (work_item_id, shift_id, team, run_token, expires_at) VALUES ($1, $2, $3, $4, $5)`,
			workItemID, shiftID, team, token, deadline); err != nil {
			return nil, err
		}
	}

	var it work.WorkItem
	if err := tx.QueryRow(ctx, `
		UPDATE work_items SET state = 'leased', attempts = attempts + 1, updated_at = now()
		WHERE id = $1
		RETURNING provider, external_id, revision, team, origin, priority, title, description, url`,
		workItemID).Scan(&it.Provider, &it.ExternalID, &it.Revision, &it.Team, &it.Origin,
		&it.Priority, &it.Title, &it.Description, &it.URL); err != nil {
		return nil, err
	}
	it.ID = fmt.Sprint(workItemID)
	it.State = work.StateLeased

	if err := audit(ctx, tx, "team:"+team, "run.claimed", &workItemID, map[string]any{
		"shift": shiftID, "role": role, "round": round,
		"writes": writes, "authorized": authorized,
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &ClaimedRun{
		Item: it, RunToken: token, Deadline: deadline, ShiftID: shiftID,
		Role: role, Round: round, Writes: writes, Branch: branch, Authorized: authorized,
	}, nil
}

// PendingRuns is the KEDA scaler query.
//
// It MUST stay identical in predicate to ClaimRole above. Overshoot is
// harmless — a pod that finds nothing exits 0 — but undershoot stalls items
// with no error anywhere, which is the worst failure this system can have.
// TestClaimRoleAgreesWithPendingRuns exists to keep these two honest.
func (s *Store) PendingRuns(ctx context.Context, team, role string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM agent_runs WHERE team = $1 AND role = $2 AND state = 'pending'`,
		team, role).Scan(&n)
	return n, err
}

// ExpiredRun is a Run the sweeper reclaimed.
type ExpiredRun struct {
	WorkItemID int64
	ShiftID    int64
	Team, Role string
	RunToken   string
	Writes     bool
}

// ExpireRuns reclaims live Runs past their own deadline.
//
// ExpireLeases cannot do this job any more. A reader holds no Lease
// (ADR-0010), so a reader whose pod is OOM-killed would otherwise sit
// 'running' forever — holding a budget authorization nothing ever releases,
// and leaving its Round unable to complete. Liveness is per-Run because a Run
// is what dies.
//
// Nothing here depends on the dying pod doing anything (R2). Releasing the
// budget hold needs no statement at all: `reserved` is summed over running
// Runs, and these are no longer running.
func (s *Store) ExpireRuns(ctx context.Context) ([]ExpiredRun, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	rows, err := tx.Query(ctx, `
		UPDATE agent_runs
		SET state = 'finished', finished_at = now(), outcome = 'failed',
		    summary = 'run deadline expired', failure_reason = 'lease_lost'
		WHERE state = 'running' AND expires_at IS NOT NULL AND expires_at < now()
		RETURNING work_item_id, COALESCE(shift_id, 0), team, role, run_token, writes`)
	if err != nil {
		return nil, err
	}
	var out []ExpiredRun
	for rows.Next() {
		var e ExpiredRun
		if err := rows.Scan(&e.WorkItemID, &e.ShiftID, &e.Team, &e.Role, &e.RunToken, &e.Writes); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	for _, e := range out {
		// A writer also drops its Lease, which revokes the push credential
		// minted with it (ADR-0013) — a zombie writer must not keep pushing.
		if _, err := tx.Exec(ctx, `DELETE FROM leases WHERE run_token = $1`, e.RunToken); err != nil {
			return nil, err
		}
		if err := audit(ctx, tx, "ploegd:sweeper", "run.expired", &e.WorkItemID, map[string]any{
			"team": e.Team, "role": e.Role, "shift": e.ShiftID, "writes": e.Writes,
		}); err != nil {
			return nil, err
		}
	}
	return out, tx.Commit(ctx)
}

// RoundComplete reports whether every Run in a Shift's current Round has
// finished — the signal to open the next Round or close the Shift. Derived,
// so it cannot disagree with the runs themselves.
func (s *Store) RoundComplete(ctx context.Context, shiftID int64) (bool, error) {
	var live int
	err := s.pool.QueryRow(ctx, `
		SELECT count(*) FROM agent_runs
		WHERE shift_id = $1 AND round = (SELECT round FROM shifts WHERE id = $1)
		  AND state <> 'finished'`, shiftID).Scan(&live)
	return live == 0, err
}

// ShiftLedger is the money view of a Shift.
type ShiftLedger struct {
	Budget, Spent, Reserved float64
}

// Remaining is what a further Run could be authorized.
func (l ShiftLedger) Remaining() float64 { return l.Budget - l.Spent - l.Reserved }

// Ledger reads a Shift's pool. Reserved is summed from running Runs rather
// than kept as a counter, so it cannot drift from what is actually in flight.
func (s *Store) Ledger(ctx context.Context, shiftID int64) (ShiftLedger, error) {
	var l ShiftLedger
	err := s.pool.QueryRow(ctx, `
		SELECT sh.budget, sh.spent,
		       COALESCE((SELECT SUM(authorized) FROM agent_runs
		                 WHERE shift_id = sh.id AND state = 'running'), 0)
		FROM shifts sh WHERE sh.id = $1`, shiftID).Scan(&l.Budget, &l.Spent, &l.Reserved)
	return l, err
}
