package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/webgrip/ploeg/pkg/work"
)

func TestOperatorReadsAreScopedAndCredentialFree(t *testing.T) {
	resetTables(t)
	ctx := context.Background()
	var itemIDs []int64
	for _, team := range []string{"silver", "gold"} {
		id, _, err := testStore.IngestAssigned(ctx, work.WorkItem{Provider: "vikunja", ExternalID: team, Team: team, Title: team, URL: "https://tracker.example/tasks/1?token=private", Target: &work.Target{Forge: "forgejo", Owner: "webgrip", Repo: "ploeg", BaseBranch: "development"}})
		if err != nil {
			t.Fatal(err)
		}
		itemIDs = append(itemIDs, id)
	}
	shift, err := testStore.OpenShift(ctx, itemIDs[0], "silver", "agent/example", 5)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := testStore.OpenRound(ctx, shift, 0, []Role{{Name: "reviewer", Cap: 2}}); err != nil {
		t.Fatal(err)
	}
	claimed, err := testStore.ClaimRole(ctx, "silver", "reviewer", time.Minute, 2)
	if err != nil {
		t.Fatal(err)
	}
	report := Report(work.OutcomeNoChangeNeeded, "summary "+claimed.RunToken, "", []string{"https://forge.example/webgrip/ploeg/pulls/1?token=private"}, json.RawMessage(`{"costUsd":0.125,"inputTokens":10,"outputTokens":5,"sessionId":"opaque","apiKey":"private"}`), nil)
	report.Findings, report.Verdict = "review findings", "approve"
	if _, err := testStore.ReportOutcome(ctx, claimed.RunToken, report); err != nil {
		t.Fatal(err)
	}
	if _, err := testStore.pool.Exec(ctx, `INSERT INTO audit_log(actor,action,work_item_id,detail) VALUES ('operator','test.safe',$1,$2),('forge','unbound',NULL,'{}')`, itemIDs[0], fmt.Sprintf(`{"runToken":%q,"token":"private","secret":{"apiKey":"private"},"round":1,"role":"reviewer"}`, claimed.RunToken)); err != nil {
		t.Fatal(err)
	}
	items, more, err := testStore.OperatorItems(ctx, OperatorFilter{Teams: []string{"silver"}, Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if more || len(items) != 1 || items[0].ID != fmt.Sprint(itemIDs[0]) || items[0].LatestShift == nil || items[0].URL != "https://tracker.example/tasks/1" {
		t.Fatalf("unexpected items: %+v, more=%v", items, more)
	}
	detail, err := testStore.OperatorItem(ctx, itemIDs[0], []string{"silver"})
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Runs) != 1 || detail.Runs[0].Verdict != "approve" || detail.Runs[0].CostStatus != "observed" || detail.Runs[0].Usage.CostUSD == nil || *detail.Runs[0].Usage.CostUSD != .125 {
		t.Fatalf("lost run evidence: %+v", detail.Runs)
	}
	runID, _ := OperatorCursor(detail.Runs[0].ID)
	run, err := testStore.OperatorRun(ctx, runID, []string{"silver"})
	if err != nil || run.ID != detail.Runs[0].ID {
		t.Fatalf("run detail: %+v %v", run, err)
	}
	if _, err := testStore.OperatorRun(ctx, runID, []string{"gold"}); !errors.Is(err, ErrOperatorNotFound) {
		t.Fatalf("cross-team run: %v", err)
	}
	if _, err := testStore.OperatorItem(ctx, itemIDs[0], []string{}); !errors.Is(err, ErrOperatorNotFound) {
		t.Fatalf("empty scope item: %v", err)
	}
	events, _, err := testStore.OperatorEvents(ctx, OperatorFilter{Teams: []string{"silver"}, Limit: 200})
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range events {
		if event.WorkItemID != fmt.Sprint(itemIDs[0]) || event.Action == "unbound" {
			t.Fatalf("event scope leak: %+v", event)
		}
	}
	allEvents, _, err := testStore.OperatorEvents(ctx, OperatorFilter{Limit: 200})
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range allEvents {
		if event.Action == "unbound" {
			t.Fatal("unbound event exposed")
		}
	}
	encoded, _ := json.Marshal(map[string]any{"detail": detail, "run": run, "events": events})
	for _, secret := range []string{claimed.RunToken, "private", "opaque", "runToken", "apiKey", "forgeToken", "sessionId"} {
		if strings.Contains(string(encoded), secret) {
			t.Fatalf("operator projection contains forbidden value or field %q", secret)
		}
	}
	teams, err := testStore.OperatorTeams(ctx, []string{"silver"}, map[string][]string{"silver": {"reviewer", "builder"}, "gold": {"writer"}})
	if err != nil || len(teams) != 1 || teams[0].ID != "silver" || teams[0].Paused != nil || len(teams[0].Roles) != 2 {
		t.Fatalf("teams: %+v %v", teams, err)
	}
}

func TestOperatorPaginationAndUnknownCost(t *testing.T) {
	resetTables(t)
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		if _, _, err := testStore.IngestAssigned(ctx, work.WorkItem{Provider: "vikunja", ExternalID: fmt.Sprint(i), Team: "silver", Title: "item"}); err != nil {
			t.Fatal(err)
		}
	}
	first, more, err := testStore.OperatorItems(ctx, OperatorFilter{Limit: 2})
	if err != nil || !more || len(first) != 2 {
		t.Fatalf("first page %+v %v %v", first, more, err)
	}
	after, _ := OperatorCursor(first[1].ID)
	second, more, err := testStore.OperatorItems(ctx, OperatorFilter{After: after, Limit: 2})
	if err != nil || more || len(second) != 1 {
		t.Fatalf("second page %+v %v %v", second, more, err)
	}
	if items, _, err := testStore.OperatorItems(ctx, OperatorFilter{Teams: []string{}, Limit: 2}); err != nil || len(items) != 0 {
		t.Fatalf("empty scope: %+v %v", items, err)
	}
	claimed, err := testStore.Claim(ctx, "silver", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := OperatorCursor(claimed.Item.ID)
	detail, err := testStore.OperatorItem(ctx, id, nil)
	if err != nil || len(detail.Runs) != 1 || detail.Runs[0].Usage != nil || detail.Runs[0].CostStatus != "unknown" || detail.Item.Lease == nil {
		t.Fatalf("unmetered run: %+v %v", detail, err)
	}
	if _, _, err := testStore.OperatorItems(ctx, OperatorFilter{Limit: 201}); err == nil {
		t.Fatal("unbounded item limit accepted")
	}
	if _, _, err := testStore.OperatorEvents(ctx, OperatorFilter{Limit: 0}); err == nil {
		t.Fatal("invalid event limit accepted")
	}
	events, more, err := testStore.OperatorEvents(ctx, OperatorFilter{Limit: 1})
	if err != nil || !more || len(events) != 1 {
		t.Fatalf("event page: %+v %v %v", events, more, err)
	}
	after, _ = OperatorCursor(events[0].ID)
	next, _, err := testStore.OperatorEvents(ctx, OperatorFilter{After: after, Limit: 1})
	if err != nil || len(next) != 1 || next[0].ID == events[0].ID {
		t.Fatalf("event next page: %+v %v", next, err)
	}
}

func TestOperatorDetailReportsBoundedHistory(t *testing.T) {
	resetTables(t)
	ctx := context.Background()
	id, _ := ingestItem(t)
	if _, err := testStore.pool.Exec(ctx, `INSERT INTO checkpoints(work_item_id,phase) SELECT $1, 'checkpoint' FROM generate_series(1,201)`, id); err != nil {
		t.Fatal(err)
	}
	detail, err := testStore.OperatorItem(ctx, id, nil)
	if err != nil || len(detail.Checkpoints) != 200 || !detail.Truncated.Checkpoints {
		t.Fatalf("bounded history: %d %+v %v", len(detail.Checkpoints), detail.Truncated, err)
	}
}

func TestOperatorCursorRejectsAmbiguousOrOverflowingValues(t *testing.T) {
	for _, value := range []string{"-1", "+1", " 1", "1.2", "1e2", "9223372036854775808", strings.Repeat("1", 100)} {
		if _, err := OperatorCursor(value); err == nil {
			t.Errorf("accepted %q", value)
		}
	}
	if n, err := OperatorCursor("9223372036854775807"); err != nil || n != 9223372036854775807 {
		t.Fatalf("bigint cursor: %d %v", n, err)
	}
}

func TestOperatorProjectionKeepsUnresolvedManagedSpendReserved(t *testing.T) {
	resetTables(t)
	ctx := context.Background()
	id, shift := openShift(t, 5)
	if _, err := testStore.OpenRound(ctx, shift, 0, []Role{{Name: "reviewer", Cap: 2}}); err != nil {
		t.Fatal(err)
	}
	run, err := testStore.ClaimRole(ctx, "silver", "reviewer", time.Minute, 2)
	if err != nil {
		t.Fatal(err)
	}
	if err := testStore.ReserveLLMAccount(ctx, LLMAccount{RunToken: run.RunToken, Alias: "ploeg-" + run.RunToken[:12], Authorized: 2, Models: []string{"fixture"}, TTLSeconds: 60}); err != nil {
		t.Fatal(err)
	}
	if _, err := testStore.pool.Exec(ctx, `UPDATE run_llm_accounts SET state='blocked',observed_spend=0.25 WHERE run_token=$1`, run.RunToken); err != nil {
		t.Fatal(err)
	}
	if _, err := testStore.ReportOutcome(ctx, run.RunToken, Report(work.OutcomeNoChangeNeeded, "done", "", nil, json.RawMessage(`{"costUsd":0}`), nil)); err != nil {
		t.Fatal(err)
	}
	detail, err := testStore.OperatorItem(ctx, id, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Shifts) != 1 || detail.Shifts[0].ReservedUSD != 2 || detail.Shifts[0].SpentUSD != 0 {
		t.Fatalf("lost unresolved account reservation: %+v", detail.Shifts)
	}
	if len(detail.Runs) != 1 || detail.Runs[0].Usage == nil || detail.Runs[0].Usage.CostUSD == nil || *detail.Runs[0].Usage.CostUSD != .25 {
		t.Fatalf("untrusted worker cost hid managed observation: %+v", detail.Runs)
	}
}
