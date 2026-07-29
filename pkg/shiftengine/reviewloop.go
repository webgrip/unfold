package shiftengine

import (
	"context"

	"github.com/webgrip/ploeg/pkg/harness"
	"github.com/webgrip/ploeg/pkg/plan"
	"github.com/webgrip/ploeg/pkg/store"
)

// The review loop (ADR-0017). A plan that has run out is not necessarily
// finished: if a reading Run in the last Round asked for changes, the plan's
// OWN writing Round re-opens with the findings attached, then the review Round
// after it. Each such pair is one fix round.
//
// The verdict is the only field by which an agent influences what runs next,
// and it can do exactly one thing. It names no Role, authors no Round, raises
// no cap and extends no budget — every other lever stays with configuration.

// Close reasons, distinct so "why did this item stop" stays a query.
const (
	reasonPlanExhausted = "plan_exhausted"
	reasonApproved      = "review_approved"
	reasonFixCap        = "fix_round_cap_reached"
	reasonLoopBudget    = "budget_exhausted_before_fix_round"
)

func closeMessage(reason string) string {
	switch reason {
	case reasonApproved:
		return "the reviewer approved; a person is asked to merge"
	case reasonFixCap:
		return "the reviewer kept asking for changes and the fix-round cap was reached; a person is asked to take over"
	case reasonLoopBudget:
		return "the budget could not fund another fix round; a person is asked to take over"
	default:
		return "plan complete; a person is asked to review and merge"
	}
}

// fixRoundsRun derives how many fix rounds this Shift has already had.
//
// Derived, never counted (ADR-0017, and ADR-0012's reserved-is-a-sum
// discipline): a column can disagree with what actually happened, and this
// survives a restart mid-loop for free. Each fix round is a PAIR — the
// re-opened writer, then the review after it — so rounds beyond the plan
// divide by two.
func fixRoundsRun(currentRound int, tp plan.TeamPlan) int {
	extra := currentRound - len(tp.Rounds)
	if extra <= 0 {
		return 0
	}
	return (extra + 1) / 2
}

// nextFixRound decides what, if anything, runs after the plan is exhausted.
//
// The bounds are checked in ADR-0017's order — pool, then cap, then verdict —
// because money is the limit that cannot be argued with and the verdict is the
// only one an agent influences.
func (e *Engine) nextFixRound(ctx context.Context, si store.ShiftInfo, tp plan.TeamPlan,
	reports []store.RunReport) (next plan.Round, reason string, ok bool) {

	if tp.MaxFixRounds <= 0 {
		return plan.Round{}, reasonPlanExhausted, false
	}
	writerIdx, hasWriter := tp.WriterRound()
	if !hasWriter {
		// pkg/plan refuses this at boot; belt and braces if config was hot-swapped.
		return plan.Round{}, reasonPlanExhausted, false
	}

	// Is this Round a re-opened writer? Then the review Round follows it, and
	// no verdict is involved: the pair is one fix round.
	if si.Round > len(tp.Rounds) && (si.Round-len(tp.Rounds))%2 == 1 {
		return tp.Rounds[len(tp.Rounds)-1], "", true
	}

	// Bound 1 — money. Checked before the cap so a Shift never spawns a Run it
	// cannot pay for, and never burns an attempt discovering that.
	ledger, err := e.Store.Ledger(ctx, si.ID)
	if err != nil {
		e.Log.Error("fix round: ledger read failed", "shift", si.ID, "err", err)
		return plan.Round{}, reasonPlanExhausted, false
	}
	if ledger.Budget > 0 && ledger.Remaining() < minViableFixRound {
		e.Log.Info("fix round refused: budget", "shift", si.ID,
			"remaining", ledger.Remaining(), "spent", ledger.Spent)
		return plan.Round{}, reasonLoopBudget, false
	}

	// Bound 2 — the cap.
	if run := fixRoundsRun(si.Round, tp); run >= tp.MaxFixRounds {
		e.Log.Info("fix round refused: cap", "shift", si.ID,
			"fix_rounds", run, "max", tp.MaxFixRounds)
		return plan.Round{}, reasonFixCap, false
	}

	// Bound 3 — the verdict, from the Round that just finished, and only from
	// a READING Role. A writer approving its own work would be the loop
	// grading itself.
	if !requestsChanges(reports, si.Round) {
		return plan.Round{}, reasonApproved, false
	}

	e.Log.Info("fix round opening", "shift", si.ID, "from_round", si.Round,
		"writer_round", writerIdx+1, "fix_rounds_run", fixRoundsRun(si.Round, tp))
	return tp.Rounds[writerIdx], "", true
}

// minViableFixRound is the floor below which opening another pair is
// pointless — the same reasoning as the store's per-Run floor, applied to the
// loop rather than to a single claim.
const minViableFixRound = 0.05

// requestsChanges reports whether any READING Run of the given round asked for
// changes. Writers' verdicts are already blanked by the store; this is the
// second half of the same rule, kept explicit so the intent survives a
// refactor of either side.
func requestsChanges(reports []store.RunReport, round int) bool {
	for _, r := range reports {
		if r.Round != round || r.Writes {
			continue
		}
		if r.Verdict == harness.VerdictRequestChanges {
			return true
		}
	}
	return false
}
