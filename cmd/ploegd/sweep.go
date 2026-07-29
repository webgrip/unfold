package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/webgrip/ploeg/pkg/llmbroker"
	"github.com/webgrip/ploeg/pkg/shiftengine"
	"github.com/webgrip/ploeg/pkg/store"
)

// bootOrphanSweep revokes gateway credentials that no longer correspond to
// a live (unfinished) run. Clears pre-existing stragglers (e.g. run 9's
// leaked key) on first boot after an upgrade. Nil sweeper = no gateway
// configured, nothing to reconcile.
func bootOrphanSweep(ctx context.Context, log *slog.Logger, st *store.Store, sweeper llmbroker.Sweeper) {
	if sweeper == nil {
		return
	}
	alive, err := st.UnfinishedRunTokens(ctx)
	if err != nil {
		log.Error("orphan sweep: failed to query active runs", "err", err)
		return
	}
	n, err := sweeper.SweepOrphans(ctx, alive)
	if err != nil {
		log.Error("orphan sweep failed", "err", err)
		return
	}
	if n > 0 {
		log.Info("orphan sweep: revoked stale keys", "count", n)
	} else {
		log.Info("orphan sweep: no stale keys found")
	}
}

// sweepLoop is the crash-safety mechanic: nothing depends on an agent
// behaving well at death (design §3). Every expired lease releases the item
// and revokes the run's gateway credentials (when a sweeper is configured).
//
// Shift runs live and die by their own expires_at, not a lease: ExpireRuns
// reclaims dead readers AND writers (a reader holds no lease, so ExpireLeases
// could never see it die), then the engine advances or repairs every live
// Shift — the async half of the fast-path/sweeper split (R2).
func sweepLoop(ctx context.Context, log *slog.Logger, st *store.Store, sweeper llmbroker.Sweeper, engine *shiftengine.Engine, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			expired, err := st.ExpireLeases(ctx)
			if err != nil {
				log.Error("lease sweep failed", "err", err)
				continue
			}
			for _, e := range expired {
				log.Warn("lease expired, item released", "work_item", e.WorkItemID)
				revokeKey(ctx, log, sweeper, e.RunToken)
			}

			runs, err := st.ExpireRuns(ctx)
			if err != nil {
				log.Error("run sweep failed", "err", err)
				continue
			}
			for _, e := range runs {
				log.Warn("run deadline expired, run reclaimed",
					"work_item", e.WorkItemID, "shift", e.ShiftID, "role", e.Role, "writes", e.Writes)
				revokeKey(ctx, log, sweeper, e.RunToken)
			}

			if engine != nil {
				engine.EvaluateAll(ctx)
			}
		}
	}
}

func revokeKey(ctx context.Context, log *slog.Logger, sweeper llmbroker.Sweeper, runToken string) {
	if sweeper == nil {
		return
	}
	if err := sweeper.RevokeForRun(ctx, runToken); err != nil {
		log.Error("key revoke failed", "run_token_prefix", prefix12(runToken), "err", err)
	}
}

func prefix12(s string) string {
	if len(s) > 12 {
		return s[:12]
	}
	return s
}
