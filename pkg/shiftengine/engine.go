// Package shiftengine owns the Shift lifecycle: when a Shift opens, how a
// Round advances, when a Shift closes, and what happens when either is left
// half-done (run-multi-agent-shifts, shift-orchestration spec).
//
// Every rule lives here and is called from two places with the same
// idempotent semantics — the fast path (webhook ingest opens, an outcome
// report evaluates) and the sweeper tick (EvaluateAll repairs whatever a
// crash left behind). That is the same claim/sweeper split the lease manager
// uses: the pipeline must never depend on a request handler surviving to the
// end of its function (R2). Advancement is derived from Run state, never
// reported by an agent.
package shiftengine

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"

	"github.com/webgrip/ploeg/pkg/plan"
	"github.com/webgrip/ploeg/pkg/provider"
	"github.com/webgrip/ploeg/pkg/store"
	"github.com/webgrip/ploeg/pkg/work"
)

// Engine drives Shifts for planned teams. Teams without a plan are invisible
// to it: their dispatch path is untouched.
type Engine struct {
	Store *store.Store
	Plans plan.Plans
	Log   *slog.Logger
	// Forges publishes findings to the pull request (ADR-0011). Keyed by
	// forge id, matching the Work Target's Forge. Nil or missing = findings
	// stay in the database and the run is otherwise unaffected.
	Forges map[string]provider.ForgeProvider
	// Trackers asks a person to merge when a Shift closes. Keyed by provider
	// name, matching the Work Item's. Nil = no write-back.
	Trackers map[string]provider.TrackerProvider
}

// EnsureShift opens a Shift for a queued Work Item of a planned team, then
// evaluates it so the first Round materialises. Idempotent: an existing live
// Shift is left alone, and the shifts_one_live_per_item index settles the
// race two openers can still run into.
func (e *Engine) EnsureShift(ctx context.Context, workItemID int64, item work.WorkItem) error {
	tp, planned := e.Plans[item.Team]
	if !planned {
		return nil
	}
	live, err := e.Store.LiveShiftForItem(ctx, workItemID)
	if err != nil {
		return err
	}
	if live == nil {
		// The branch is derived here, once, and carried on the Shift: the
		// server is the producer, the claim response the carrier. Same string
		// the worker has always derived, so rollout changes nothing (#107
		// keeps the vendor token for now).
		branch := "agent/vik-" + item.ExternalID
		if _, err := e.Store.OpenShift(ctx, workItemID, item.Team, branch, float64(tp.Pool)); err != nil {
			// Unique-index violation = someone else opened it between our read
			// and our insert. That is the race behaving correctly; re-read.
			live, rerr := e.Store.LiveShiftForItem(ctx, workItemID)
			if rerr != nil || live == nil {
				return fmt.Errorf("open shift: %w", err)
			}
		}
		e.Log.Info("shift opened", "work_item", workItemID, "team", item.Team,
			"pool", float64(tp.Pool), "rounds", len(tp.Rounds))
	}
	return e.EvaluateItem(ctx, workItemID)
}

// EvaluateItem advances the live Shift on a Work Item, if any — the fast path
// the outcome handler calls. A missing live Shift is not an error: the other
// evaluator may have closed it first.
func (e *Engine) EvaluateItem(ctx context.Context, workItemID int64) error {
	si, err := e.Store.LiveShiftForItem(ctx, workItemID)
	if err != nil {
		return err
	}
	if si == nil {
		return nil
	}
	return e.evaluate(ctx, *si)
}

// evaluate is the one advancement rule. Rounds advance only when every Run in
// them has finished; the next Round comes from the plan; a stuck Run freezes
// the plan; an exhausted plan closes the Shift and asks a person to merge.
func (e *Engine) evaluate(ctx context.Context, si store.ShiftInfo) error {
	tp, planned := e.Plans[si.Team]
	if !planned {
		// The plan was removed while the Shift ran. Freezing silently would
		// strand the item; close loudly and hand it to a person.
		return e.close(ctx, si, "plan removed from configuration",
			"team "+si.Team+" no longer has a plan; shift closed")
	}

	complete, err := e.Store.RoundComplete(ctx, si.ID)
	if err != nil {
		return err
	}
	if !complete {
		return nil
	}

	// A stuck Run anywhere freezes the plan (R4, shift-orchestration spec):
	// retrying cannot fix what the agent said needs a human.
	reports, err := e.Store.RoundReports(ctx, si.ID)
	if err != nil {
		return err
	}
	// Findings reach the pull request as soon as their Round finishes, not at
	// close: a human watching the thread sees the review while the writer is
	// still working on it (ADR-0011).
	e.publishRound(ctx, si, reports, si.Round)

	for _, r := range reports {
		if r.Outcome == string(work.OutcomeStuck) {
			return e.close(ctx, si,
				fmt.Sprintf("run stuck: %s round %d", r.Role, r.Round),
				fmt.Sprintf("shift stopped: %s reported stuck in round %d — %s", r.Role, r.Round, r.Summary))
		}
	}

	// The plan's next Round, or the end of the plan. si.Round counts opened
	// Rounds, so it doubles as the index of the next one.
	if si.Round >= len(tp.Rounds) {
		return e.close(ctx, si, "plan_exhausted",
			"plan complete; a person is asked to review and merge")
	}
	next := tp.Rounds[si.Round]
	round, err := e.Store.OpenRound(ctx, si.ID, si.Round, storeRoles(next))
	if err != nil {
		// The CAS lost to the other evaluator, or the Shift closed under us.
		// Both mean somebody else did the job; log at debug fidelity and move on.
		e.Log.Debug("round open skipped", "shift", si.ID, "from_round", si.Round, "err", err)
		return nil
	}
	e.Log.Info("round opened", "shift", si.ID, "work_item", si.WorkItemID,
		"team", si.Team, "round", round, "roles", len(next.Roles))
	return nil
}

// storeRoles converts a plan Round's roles into the store's claim shape.
func storeRoles(r plan.Round) []store.Role {
	out := make([]store.Role, 0, len(r.Roles))
	for _, role := range r.Roles {
		out = append(out, store.Role{Name: role.Name, Writes: role.Writes, Cap: role.CapUSD()})
	}
	return out
}

// close ends a Shift and moves its Work Item to needs_human — the engine owns
// the item transition for Shift runs (design.md D3), and it happens exactly
// once thanks to CloseShift's idempotency.
func (e *Engine) close(ctx context.Context, si store.ShiftInfo, closeReason, humanReason string) error {
	if err := e.Store.CloseShift(ctx, si.ID, closeReason); err != nil {
		return err
	}
	if err := e.Store.MarkNeedsHuman(ctx, si.WorkItemID, humanReason); err != nil {
		return err
	}
	e.Log.Info("shift closed", "shift", si.ID, "work_item", si.WorkItemID,
		"team", si.Team, "reason", closeReason)
	// After the state is durable, never before: a tracker outage must not be
	// able to leave a Shift open or an item un-transitioned.
	e.notifyHuman(ctx, si, humanReason)
	return nil
}

// EvaluateAll is the sweeper's repair pass: open the Shifts crashes left
// unopened, advance the Rounds crashes left unadvanced, park the pools that
// ran dry. Errors are logged, never returned — one broken Shift must not
// stall the sweep of the rest (R2).
func (e *Engine) EvaluateAll(ctx context.Context) {
	// Queued items of planned teams that lack a live Shift: the crash window
	// between IngestAssigned committing and EnsureShift running.
	for team := range e.Plans {
		items, err := e.Store.QueueSnapshot(ctx, team)
		if err != nil {
			e.Log.Error("shift sweep: queue read failed", "team", team, "err", err)
			continue
		}
		for _, it := range items {
			if it.State != work.StateQueued {
				continue
			}
			id, err := strconv.ParseInt(it.ID, 10, 64)
			if err != nil {
				continue
			}
			if err := e.EnsureShift(ctx, id, it); err != nil {
				e.Log.Error("shift sweep: ensure failed", "work_item", it.ID, "err", err)
			}
		}
	}

	// Live Shifts whose evaluation was lost.
	shifts, err := e.Store.LiveShifts(ctx)
	if err != nil {
		e.Log.Error("shift sweep: live shifts read failed", "err", err)
		return
	}
	for _, si := range shifts {
		if err := e.evaluate(ctx, si); err != nil {
			e.Log.Error("shift sweep: evaluate failed", "shift", si.ID, "err", err)
		}
	}

	// Pools that can no longer fund their pending work: park, don't retry —
	// retrying cannot fix running out of money (shift-orchestration spec).
	broke, err := e.Store.ShiftsBelowFloor(ctx)
	if err != nil {
		e.Log.Error("shift sweep: floor read failed", "err", err)
		return
	}
	for _, b := range broke {
		reason := fmt.Sprintf("budget exhausted: pool %.2f, spent %.2f, reserved %.2f",
			b.Ledger.Budget, b.Ledger.Spent, b.Ledger.Reserved)
		si := store.ShiftInfo{ID: b.ShiftID, WorkItemID: b.WorkItemID, Team: b.Team}
		if err := e.close(ctx, si, reason, reason); err != nil {
			e.Log.Error("shift sweep: park failed", "shift", b.ShiftID, "err", err)
		}
	}
}
