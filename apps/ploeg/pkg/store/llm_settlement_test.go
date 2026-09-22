package store

import (
	"context"
	"testing"
	"time"

	"github.com/webgrip/ploeg/pkg/work"
)

func settlementRunFixture(t *testing.T, externalID string) *ClaimedRun {
	t.Helper()
	ctx := context.Background()
	itemID, _, err := testStore.IngestAssigned(ctx, work.WorkItem{Provider: "vikunja", ExternalID: externalID, Team: "silver", Title: "Settlement fixture"})
	if err != nil {
		t.Fatal(err)
	}
	shift, err := testStore.OpenShift(ctx, itemID, "silver", "agent/vik-"+externalID, 5)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := testStore.OpenRound(ctx, shift, 0, []Role{{Name: "reviewer", Cap: 3}}); err != nil {
		t.Fatal(err)
	}
	run, err := testStore.ClaimRole(ctx, "silver", "reviewer", time.Minute, 3)
	if err != nil {
		t.Fatal(err)
	}
	if err := testStore.ReserveLLMAccount(ctx, LLMAccount{RunToken: run.RunToken, Alias: "ploeg-" + run.RunToken[:12], Authorized: 3, Models: []string{"model"}, TTLSeconds: 60}); err != nil {
		t.Fatal(err)
	}
	return run
}

func finishManagedRun(t *testing.T, run *ClaimedRun) {
	t.Helper()
	if _, err := testStore.ReportOutcome(context.Background(), run.RunToken, Report(work.OutcomeNoChangeNeeded, "done", "", nil, nil, nil)); err != nil {
		t.Fatal(err)
	}
}

func unsettledByToken(t *testing.T, quietFor time.Duration) map[string]UnsettledLLMAccount {
	t.Helper()
	accounts, err := testStore.UnsettledLLMAccounts(context.Background(), 0, quietFor, 100)
	if err != nil {
		t.Fatal(err)
	}
	byToken := map[string]UnsettledLLMAccount{}
	for _, a := range accounts {
		byToken[a.RunToken] = a
	}
	return byToken
}

func TestUnsettledAccountsOfferOnlyFinishedAndQuietHolds(t *testing.T) {
	resetTables(t)
	ctx := context.Background()
	live := settlementRunFixture(t, "901")
	untouched := settlementRunFixture(t, "902")
	finishManagedRun(t, untouched)
	unissued := settlementRunFixture(t, "903")
	finishManagedRun(t, unissued)
	if blocked, err := testStore.BlockUnissuedLLMAccount(ctx, unissued.RunToken); err != nil || !blocked {
		t.Fatalf("unissued block: %t %v", blocked, err)
	}
	minted := settlementRunFixture(t, "904")
	if _, err := testStore.BeginLLMMint(ctx, minted.RunToken); err != nil {
		t.Fatal(err)
	}
	finishManagedRun(t, minted)
	spend := 0.4
	if err := testStore.RecordLLMBlocked(ctx, minted.RunToken, &spend); err != nil {
		t.Fatal(err)
	}
	unresolved := settlementRunFixture(t, "905")
	if _, err := testStore.BeginLLMMint(ctx, unresolved.RunToken); err != nil {
		t.Fatal(err)
	}
	if err := testStore.MarkLLMUnknown(ctx, unresolved.RunToken); err != nil {
		t.Fatal(err)
	}
	finishManagedRun(t, unresolved)

	recent := unsettledByToken(t, time.Hour)
	if len(recent) != 1 || recent[untouched.RunToken].State != "reserved" || recent[untouched.RunToken].MintBegan {
		t.Fatalf("recently blocked or live accounts offered for settlement: %+v", recent)
	}
	quiet := unsettledByToken(t, 0)
	if len(quiet) != 3 {
		t.Fatalf("settlement candidates: %+v", quiet)
	}
	if _, ok := quiet[live.RunToken]; ok {
		t.Fatal("running account offered for settlement")
	}
	if _, ok := quiet[unresolved.RunToken]; ok {
		t.Fatal("unknown external effect offered for settlement")
	}
	if a := quiet[unissued.RunToken]; a.State != "blocked" || a.MintBegan {
		t.Fatalf("unissued block lost its never-minted evidence: %+v", a)
	}
	if a := quiet[minted.RunToken]; a.State != "blocked" || !a.MintBegan {
		t.Fatalf("minted account looked untouched: %+v", a)
	}
	if err := testStore.ReconcileLLMAccount(ctx, untouched.RunToken, 0, "fixture"); err != nil {
		t.Fatal(err)
	}
	if _, ok := unsettledByToken(t, 0)[untouched.RunToken]; ok {
		t.Fatal("reconciled account offered again")
	}
	if _, err := testStore.UnsettledLLMAccounts(ctx, 0, 0, 101); err == nil {
		t.Fatal("unbounded settlement page accepted")
	}
}
