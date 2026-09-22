package store

import (
	"context"
	"errors"
	"math"
	"slices"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/webgrip/ploeg/pkg/work"
)

func managedRunFixture(t *testing.T) (int64, *ClaimedRun) {
	t.Helper()
	ctx := context.Background()
	_, shift := openShift(t, 5)
	if _, err := testStore.OpenRound(ctx, shift, 0, []Role{{Name: "reviewer", Cap: 3}}); err != nil {
		t.Fatal(err)
	}
	run, err := testStore.ClaimRole(ctx, "silver", "reviewer", time.Minute, 3)
	if err != nil {
		t.Fatal(err)
	}
	if err := testStore.ReserveLLMAccount(ctx, LLMAccount{RunToken: run.RunToken, Alias: "fixture", Authorized: 3, Models: []string{"model"}, TTLSeconds: 60}); err != nil {
		t.Fatal(err)
	}
	return shift, run
}

func TestManagedBudgetHoldSurvivesWorkerDeathAtEveryMintBoundary(t *testing.T) {
	for _, state := range []string{"reserved", "minting", "issued", "unknown", "blocked"} {
		t.Run(state, func(t *testing.T) {
			shift, run := managedRunFixture(t)
			ctx := context.Background()
			if _, err := testStore.pool.Exec(ctx, `UPDATE run_llm_accounts SET state=$2 WHERE run_token=$1`, run.RunToken, state); err != nil {
				t.Fatal(err)
			}
			if _, err := testStore.pool.Exec(ctx, `UPDATE agent_runs SET expires_at=now()-interval '1 minute' WHERE run_token=$1`, run.RunToken); err != nil {
				t.Fatal(err)
			}
			if _, err := testStore.ExpireRuns(ctx); err != nil {
				t.Fatal(err)
			}
			ledger, err := testStore.Ledger(ctx, shift)
			if err != nil {
				t.Fatal(err)
			}
			if ledger.Reserved != 3 || ledger.Spent != 0 || ledger.Remaining() != 2 {
				t.Fatalf("worker death changed commitment: %+v", ledger)
			}
		})
	}
}

func TestManagedSettlementRequiresTrustedEvidenceAndNeverWorkerCost(t *testing.T) {
	shift, run := managedRunFixture(t)
	ctx := context.Background()
	report := Report(work.OutcomeNoChangeNeeded, "done", "", nil, []byte(`{"costUsd":0}`), nil)
	if _, err := testStore.ReportOutcome(ctx, run.RunToken, report); err != nil {
		t.Fatal(err)
	}
	if _, err := testStore.ReportOutcome(ctx, run.RunToken, report); err != nil {
		t.Fatalf("terminal replay: %v", err)
	}
	l, _ := testStore.Ledger(ctx, shift)
	if l.Reserved != 3 || l.Spent != 0 {
		t.Fatalf("worker report released commitment: %+v", l)
	}
	if _, err := testStore.pool.Exec(ctx, `UPDATE run_llm_accounts SET state='unknown' WHERE run_token=$1`, run.RunToken); err != nil {
		t.Fatal(err)
	}
	if err := testStore.ReconcileLLMAccount(ctx, run.RunToken, 0, "gateway response missing"); !errors.Is(err, ErrLLMAccountState) {
		t.Fatal("unknown external effect was settled as zero")
	}
	observed := 0.7
	if err := testStore.RecordLLMBlocked(ctx, run.RunToken, &observed); err != nil {
		t.Fatal(err)
	}
	if err := testStore.ReconcileLLMAccount(ctx, run.RunToken, 0.7, ""); !errors.Is(err, ErrLLMAccountState) {
		t.Fatal("missing evidence accepted")
	}
	for i := 0; i < 2; i++ {
		if err := testStore.ReconcileLLMAccount(ctx, run.RunToken, 0.7, "provider-final-receipt"); err != nil {
			t.Fatal(err)
		}
	}
	l, _ = testStore.Ledger(ctx, shift)
	if l.Reserved != 0 || l.Spent != 0.7 {
		t.Fatalf("settlement duplicated or retained incorrect hold: %+v", l)
	}
	if err := testStore.RecordLLMObserved(ctx, run.RunToken, 0.9); err != nil {
		t.Fatal(err)
	}
	l, _ = testStore.Ledger(ctx, shift)
	if math.Abs(l.Reserved-0.2) > 0.00001 || l.Spent != 0.7 {
		t.Fatalf("late observed spend disappeared before reconciliation: %+v", l)
	}
	if err := testStore.ReconcileLLMAccount(ctx, run.RunToken, 0.9, "late-provider-adjustment"); err != nil {
		t.Fatal(err)
	}
	l, _ = testStore.Ledger(ctx, shift)
	if l.Spent != 0.9 {
		t.Fatalf("late provider charge lost: %+v", l)
	}
}

func TestConcurrentCredentialIssuanceHasOneDurableWinner(t *testing.T) {
	_, run := managedRunFixture(t)
	var won atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := testStore.BeginLLMMint(context.Background(), run.RunToken); err == nil {
				won.Add(1)
			}
		}()
	}
	wg.Wait()
	if won.Load() != 1 {
		t.Fatalf("mint intent winners=%d", won.Load())
	}
}

func TestManagedReservationIsIdempotentAndBoundedByRunAuthority(t *testing.T) {
	_, run := managedRunFixture(t)
	ctx := context.Background()
	a := LLMAccount{RunToken: run.RunToken, Alias: "fixture", Authorized: 5, Models: []string{"model"}, TTLSeconds: 60}
	for i := 0; i < 2; i++ {
		if err := testStore.ReserveLLMAccount(ctx, a); err != nil {
			t.Fatal(err)
		}
	}
	account, err := testStore.LLMAccount(ctx, run.RunToken)
	if err != nil || account.Authorized != 3 {
		t.Fatalf("authority was expanded: %+v %v", account, err)
	}
	a.Models = []string{"changed-model"}
	if err := testStore.ReserveLLMAccount(ctx, a); !errors.Is(err, ErrLLMAccountState) {
		t.Fatalf("immutable account policy was replaced: %v", err)
	}
	if _, err := testStore.BeginLLMMint(ctx, run.RunToken); err != nil {
		t.Fatal(err)
	}
	if err := testStore.RecordLLMIssued(ctx, run.RunToken, "fixture-key-digest"); err != nil {
		t.Fatal(err)
	}
	if err := testStore.MarkLLMUnknown(ctx, run.RunToken); err != nil {
		t.Fatal(err)
	}
	spend := 0.1
	if err := testStore.RecordLLMBlocked(ctx, run.RunToken, &spend); err != nil {
		t.Fatal(err)
	}
	var actions []string
	if err := testStore.pool.QueryRow(ctx, `SELECT array_agg(action ORDER BY id) FROM audit_log
		WHERE work_item_id=(SELECT work_item_id FROM agent_runs WHERE run_token=$1) AND action LIKE 'llm.%'`, run.RunToken).Scan(&actions); err != nil {
		t.Fatal(err)
	}
	want := []string{"llm.reserved", "llm.minting", "llm.issued", "llm.unknown", "llm.blocked"}
	if !slices.Equal(actions, want) {
		t.Fatalf("account mutation audit=%v", actions)
	}
}

func TestManagedRunOnUnpooledShiftUsesPolicyBudget(t *testing.T) {
	ctx := context.Background()
	_, shift := openShift(t, 0)
	if _, err := testStore.OpenRound(ctx, shift, 0, []Role{{Writes: true}}); err != nil {
		t.Fatal(err)
	}
	run, err := testStore.ClaimRole(ctx, "silver", "", time.Minute, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := testStore.ReserveLLMAccount(ctx, LLMAccount{RunToken: run.RunToken, Alias: "fixture", Authorized: 2.5, Models: []string{"model"}, TTLSeconds: 60}); err != nil {
		t.Fatalf("reserve on an unpooled Shift: %v", err)
	}
	account, err := testStore.LLMAccount(ctx, run.RunToken)
	if err != nil {
		t.Fatal(err)
	}
	if account.Authorized != 2.5 {
		t.Fatalf("authorized = %v, want the policy budget 2.5", account.Authorized)
	}
}

func TestManagedRunOnUnpooledShiftKeepsRoleCap(t *testing.T) {
	ctx := context.Background()
	_, shift := openShift(t, 0)
	if _, err := testStore.OpenRound(ctx, shift, 0, []Role{{Name: "reviewer", Cap: 1}}); err != nil {
		t.Fatal(err)
	}
	run, err := testStore.ClaimRole(ctx, "silver", "reviewer", time.Minute, 1)
	if err != nil {
		t.Fatal(err)
	}
	if err := testStore.ReserveLLMAccount(ctx, LLMAccount{RunToken: run.RunToken, Alias: "fixture", Authorized: 2.5, Models: []string{"model"}, TTLSeconds: 60}); err != nil {
		t.Fatal(err)
	}
	account, err := testStore.LLMAccount(ctx, run.RunToken)
	if err != nil {
		t.Fatal(err)
	}
	if account.Authorized != 1 {
		t.Fatalf("authorized = %v, want the role cap 1", account.Authorized)
	}
}
