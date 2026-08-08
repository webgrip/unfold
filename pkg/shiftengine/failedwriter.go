package shiftengine

import (
	"context"
	"fmt"

	"github.com/webgrip/ploeg/pkg/store"
)

// A failed writing Run re-opens its own Round, capped (ADR-0019).
//
// The asymmetry between readers and writers is the whole of it. A Round that
// loses a READER loses an opinion, and the shift-orchestration spec is right
// that this must not stall the item. A Round that loses its WRITER loses the
// work: the branch was never written, and every later Round is then reasoning
// about something that does not exist. Left alone, the reviewer reviews
// nothing, returns `approve`, and the Shift closes `review_approved` with no
// pull request — the most reassuring close reason there is, for a Shift that
// produced nothing.
//
// `failed` is not the agent's word. It is the sweeper's verdict on a pod that
// stopped renewing (ExpireRuns), which is precisely what makes it retryable
// and precisely what distinguishes it from `stuck` (R4: a stuck Outcome says a
// human is needed, and no retry fixes that).

const (
	// reasonWriterFailed is the close reason when a writing Role has used up
	// its attempts inside one Round.
	reasonWriterFailed = "writing_run_failed_repeatedly"
)

// retryFailedWriter re-opens the current Round when its writing Run failed and
// attempts remain, or closes the Shift when they do not.
//
// Returns handled=true when it has taken the decision — the caller must not go
// on to advance the plan.
func (e *Engine) retryFailedWriter(ctx context.Context, si store.ShiftInfo, reports []store.RunReport) (bool, error) {
	failed, err := e.Store.FailedRunsInRound(ctx, si.ID, si.Round)
	if err != nil {
		return false, err
	}

	var writer *store.FailedRun
	for i := range failed {
		if failed[i].Writes {
			writer = &failed[i]
			break
		}
	}
	if writer == nil {
		// Only readers failed, or nothing did. A missing opinion does not
		// stall an item: the spec's swept-Run scenario, unchanged.
		for _, f := range failed {
			e.Log.Warn("a reading Run failed; its findings are missing from this Round",
				"shift", si.ID, "round", si.Round, "role", f.Role, "attempts", f.Attempts)
		}
		return false, nil
	}

	if writer.Attempts >= store.MaxRunAttempts {
		e.Log.Warn("writing Run failed too many times; parking the shift",
			"shift", si.ID, "round", si.Round, "role", writer.Role, "attempts", writer.Attempts)
		return true, e.close(ctx, si, reasonWriterFailed,
			fmt.Sprintf("shift stopped: %s failed %d times in round %d without writing the branch — a person should look at why the run keeps dying",
				writer.Role, writer.Attempts, si.Round),
			false, reports)
	}

	attempt, err := e.Store.ReopenRound(ctx, si.ID, si.Round,
		[]store.Role{{Name: writer.Role, Writes: true, Cap: e.capFor(si.Team, writer.Role)}})
	if err != nil {
		// Losing the race to the other evaluator is not an error: the Round
		// has been reopened, which is the outcome we wanted.
		e.Log.Info("could not reopen the round for a failed writer; another evaluator may have",
			"shift", si.ID, "round", si.Round, "role", writer.Role, "err", err)
		return true, nil
	}
	e.Log.Info("reopened the round after its writing Run failed",
		"shift", si.ID, "round", si.Round, "role", writer.Role, "attempt", attempt,
		"max", store.MaxRunAttempts)
	return true, nil
}

// capFor recovers a Role's per-Run spending cap from the Team's plan, so a
// retry is authorized on the same terms as the attempt it replaces.
func (e *Engine) capFor(team, role string) float64 {
	tp, ok, _ := e.planFor(team)
	if !ok {
		return 0
	}
	for _, rd := range tp.Rounds {
		for _, r := range rd.Roles {
			if r.Name == role {
				return float64(r.Cap)
			}
		}
	}
	return 0
}
