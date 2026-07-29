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
//
// fromRound is a compare-and-swap guard: the caller names the round it
// observed, and the advance happens only if the Shift is still there. Two
// evaluators — the outcome fast-path and the sweeper — may both conclude a
// Round is complete; without the guard the second would double-advance and
// materialise a duplicate roster.
func (s *Store) OpenRound(ctx context.Context, shiftID int64, fromRound int, roles []Role) (int, error) {
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
		`UPDATE shifts SET round = round + 1 WHERE id = $1 AND round = $2 AND closed_at IS NULL
		 RETURNING round, work_item_id, team`, shiftID, fromRound).
		Scan(&round, &workItemID, &team); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, fmt.Errorf("shift %d is not open at round %d", shiftID, fromRound)
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

	// The target columns ride along exactly as in the legacy Claim: losing
	// them here would silently fall the worker back to its env repo, undoing
	// the Work Item's resolved Target (ADR-0014).
	var it work.WorkItem
	var tg work.Target
	if err := tx.QueryRow(ctx, `
		UPDATE work_items SET state = 'leased', attempts = attempts + 1, updated_at = now()
		WHERE id = $1
		RETURNING provider, external_id, revision, team, origin, priority, title, description, url,
			external_scope, target_forge, target_owner, target_repo, target_base_branch, route_rule`,
		workItemID).Scan(&it.Provider, &it.ExternalID, &it.Revision, &it.Team, &it.Origin,
		&it.Priority, &it.Title, &it.Description, &it.URL,
		&it.ExternalScope, &tg.Forge, &tg.Owner, &tg.Repo, &tg.BaseBranch, &it.RouteRule); err != nil {
		return nil, err
	}
	it.ID = fmt.Sprint(workItemID)
	it.State = work.StateLeased
	if tg.Resolved() {
		it.Target = &tg
	}

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

// ShiftInfo identifies a live Shift for the orchestration engine.
type ShiftInfo struct {
	ID         int64
	WorkItemID int64
	Team       string
	Round      int
	Branch     string
}

// LiveShifts enumerates every open Shift — the sweeper's worklist. Without
// this, RoundComplete wants a shiftID nobody has, and a crash between an
// outcome report and its evaluation would strand the Shift forever (R2).
func (s *Store) LiveShifts(ctx context.Context) ([]ShiftInfo, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, work_item_id, team, round, branch FROM shifts
		WHERE closed_at IS NULL ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ShiftInfo
	for rows.Next() {
		var si ShiftInfo
		if err := rows.Scan(&si.ID, &si.WorkItemID, &si.Team, &si.Round, &si.Branch); err != nil {
			return nil, err
		}
		out = append(out, si)
	}
	return out, rows.Err()
}

// LiveShiftForItem returns the live Shift on a Work Item, or nil. This is
// what makes EnsureShift idempotent: the read answers "already open", and the
// unique partial index settles the race two openers can still run into.
func (s *Store) LiveShiftForItem(ctx context.Context, workItemID int64) (*ShiftInfo, error) {
	var si ShiftInfo
	err := s.pool.QueryRow(ctx, `
		SELECT id, work_item_id, team, round, branch FROM shifts
		WHERE work_item_id = $1 AND closed_at IS NULL`, workItemID).
		Scan(&si.ID, &si.WorkItemID, &si.Team, &si.Round, &si.Branch)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &si, nil
}

// CloseShift ends a Shift: why is recorded, so "why did this item stop" is a
// query rather than a reconstruction, and the live-Shift slot is released for
// a later re-mandate (shift-orchestration spec).
//
// Leftover pending Runs are cancelled — finished with no outcome, because they
// never ran — so the claim predicate (and with it the KEDA scale signal) drops
// to zero instead of spawning pods for a Shift that no longer wants them.
// Running Runs are left to finish or expire on their own; settlement against a
// closed Shift stays valid.
//
// Idempotent: closing an already-closed Shift is a no-op, because the outcome
// fast-path and the sweeper may both conclude a Shift is done (R2).
func (s *Store) CloseShift(ctx context.Context, shiftID int64, reason string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var workItemID int64
	var team string
	err = tx.QueryRow(ctx, `
		UPDATE shifts SET closed_at = now(), close_reason = $2
		WHERE id = $1 AND closed_at IS NULL
		RETURNING work_item_id, team`, shiftID, reason).Scan(&workItemID, &team)
	if errors.Is(err, pgx.ErrNoRows) {
		// Already closed (idempotent), or never existed (caller bug).
		var exists bool
		if err := tx.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM shifts WHERE id = $1)`, shiftID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return fmt.Errorf("shift %d does not exist", shiftID)
		}
		return nil
	}
	if err != nil {
		return err
	}

	tag, err := tx.Exec(ctx, `
		UPDATE agent_runs SET state = 'finished', finished_at = now(),
			summary = 'cancelled: shift closed (' || $2 || ')'
		WHERE shift_id = $1 AND state = 'pending'`, shiftID, reason)
	if err != nil {
		return err
	}
	if err := audit(ctx, tx, "team:"+team, "shift.closed", &workItemID, map[string]any{
		"shift": shiftID, "reason": reason, "cancelled_pending": tag.RowsAffected(),
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// RunReport is one finished Run's contribution to the blackboard: who said
// what, in which Round. Serves both consumers ADR-0011 names — the PR comment
// and the next Round's prompt.
type RunReport struct {
	Role     string
	Round    int
	Writes   bool
	Outcome  string // empty for a cancelled Run that never ran
	Summary  string
	Findings string
	Links    []string
}

// RoundReports returns every finished Run's report for a Shift, in Round then
// claim order. Callers filter by Round: prompt injection wants rounds before
// the one being claimed, publication wants the round that just completed.
func (s *Store) RoundReports(ctx context.Context, shiftID int64) ([]RunReport, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT role, round, writes, COALESCE(outcome, ''), summary, findings, links
		FROM agent_runs
		WHERE shift_id = $1 AND state = 'finished'
		ORDER BY round, id`, shiftID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RunReport
	for rows.Next() {
		var r RunReport
		if err := rows.Scan(&r.Role, &r.Round, &r.Writes, &r.Outcome, &r.Summary, &r.Findings, &r.Links); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ShiftsBelowFloor finds live Shifts whose pool can no longer fund the work
// still pending for them. Retrying cannot fix running out of money, so the
// sweeper parks these — needs_human with a reason naming the spend, no Run
// spawned, no key minted, no attempt burned (shift-orchestration spec).
func (s *Store) ShiftsBelowFloor(ctx context.Context) ([]ShiftLedgerEntry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT sh.id, sh.work_item_id, sh.team, sh.budget, sh.spent,
		       COALESCE((SELECT SUM(authorized) FROM agent_runs
		                 WHERE shift_id = sh.id AND state = 'running'), 0)
		FROM shifts sh
		WHERE sh.closed_at IS NULL AND sh.budget > 0
		  AND EXISTS (SELECT 1 FROM agent_runs
		              WHERE shift_id = sh.id AND state = 'pending')`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ShiftLedgerEntry
	for rows.Next() {
		var e ShiftLedgerEntry
		if err := rows.Scan(&e.ShiftID, &e.WorkItemID, &e.Team,
			&e.Ledger.Budget, &e.Ledger.Spent, &e.Ledger.Reserved); err != nil {
			return nil, err
		}
		if e.Ledger.Remaining() < minViableAuthorization {
			out = append(out, e)
		}
	}
	return out, rows.Err()
}

// ShiftLedgerEntry is a Shift plus its money view, for sweeper decisions.
type ShiftLedgerEntry struct {
	ShiftID    int64
	WorkItemID int64
	Team       string
	Ledger     ShiftLedger
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
