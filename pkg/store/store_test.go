package store

import (
	"context"
	"fmt"
	"os"
	"testing"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"

	"github.com/webgrip/ploeg/pkg/work"
)

// The store's semantics are SQL — they can only be proven against a real
// Postgres. embedded-postgres runs one inside `go test` (no docker), so the
// CI gate executes these instead of skipping them. A failure to start it is
// a hard test failure, never a skip: a silently-skipped gate proves nothing.

const testPort = 55439

var testStore *Store

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "ploeg-epg-*")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	epg := embeddedpostgres.NewDatabase(embeddedpostgres.DefaultConfig().
		Port(testPort).
		RuntimePath(dir))
	if err := epg.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "embedded postgres failed to start: %v\n", err)
		os.Exit(1)
	}
	code := func() int {
		defer func() { _ = epg.Stop(); _ = os.RemoveAll(dir) }()
		ctx := context.Background()
		dsn := fmt.Sprintf("postgresql://postgres:postgres@localhost:%d/postgres?sslmode=disable", testPort)
		s, err := New(ctx, dsn)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		defer s.Close()
		if err := s.Migrate(ctx); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		testStore = s
		return m.Run()
	}()
	os.Exit(code)
}

func resetTables(t *testing.T) {
	t.Helper()
	for _, table := range []string{"audit_log", "leases", "agent_runs", "checkpoints", "work_items"} {
		if _, err := testStore.pool.Exec(context.Background(), "DELETE FROM "+table); err != nil {
			t.Fatalf("reset %s: %v", table, err)
		}
	}
}

func ingestItem(t *testing.T) (int64, work.State) {
	t.Helper()
	id, state, err := testStore.IngestAssigned(context.Background(), work.WorkItem{
		Provider: "vikunja", ExternalID: "585", Team: "silver", Title: "t",
	})
	if err != nil {
		t.Fatalf("IngestAssigned: %v", err)
	}
	return id, state
}

func forceItemState(t *testing.T, id int64, state string, attempts int) {
	t.Helper()
	if _, err := testStore.pool.Exec(context.Background(),
		"UPDATE work_items SET state = $1, attempts = $2 WHERE id = $3", state, attempts, id); err != nil {
		t.Fatalf("force state: %v", err)
	}
}

func itemStateAttempts(t *testing.T, id int64) (string, int) {
	t.Helper()
	var state string
	var attempts int
	if err := testStore.pool.QueryRow(context.Background(),
		"SELECT state, attempts FROM work_items WHERE id = $1", id).Scan(&state, &attempts); err != nil {
		t.Fatalf("read item: %v", err)
	}
	return state, attempts
}

func lastAuditAction(t *testing.T, id int64) string {
	t.Helper()
	var action string
	if err := testStore.pool.QueryRow(context.Background(),
		"SELECT action FROM audit_log WHERE work_item_id = $1 ORDER BY id DESC LIMIT 1", id).Scan(&action); err != nil {
		t.Fatalf("read audit: %v", err)
	}
	return action
}

func TestIngestAssigned_NewItemIsQueued(t *testing.T) {
	resetTables(t)
	id, state := ingestItem(t)
	if state != work.StateQueued {
		t.Fatalf("returned state = %q, want queued", state)
	}
	if got, attempts := itemStateAttempts(t, id); got != "queued" || attempts != 0 {
		t.Fatalf("row = (%s, %d), want (queued, 0)", got, attempts)
	}
	if action := lastAuditAction(t, id); action != "work_item.queued" {
		t.Fatalf("audit action = %q, want work_item.queued", action)
	}
}

// A finished item re-assigned by a human is a fresh mandate: it re-queues
// with a fresh attempt budget (VIK-588 — the bug was that `done` items were
// never revived, so unassign/re-assign in the tracker did nothing).
func TestIngestAssigned_RevivesFinishedStates(t *testing.T) {
	for _, prior := range []string{"done", "stale", "needs_human"} {
		t.Run(prior, func(t *testing.T) {
			resetTables(t)
			id, _ := ingestItem(t)
			forceItemState(t, id, prior, 3)

			_, state := ingestItem(t)
			if state != work.StateQueued {
				t.Fatalf("returned state = %q, want queued", state)
			}
			if got, attempts := itemStateAttempts(t, id); got != "queued" || attempts != 0 {
				t.Fatalf("row = (%s, %d), want (queued, 0)", got, attempts)
			}
			if action := lastAuditAction(t, id); action != "work_item.queued" {
				t.Fatalf("audit action = %q, want work_item.queued", action)
			}
		})
	}
}

// A live item must NOT be disturbed by a concurrent webhook: no double
// dispatch, no attempt-budget reset — only the mirror refreshes.
func TestIngestAssigned_LeavesLiveStatesAlone(t *testing.T) {
	for _, prior := range []string{"queued", "leased"} {
		t.Run(prior, func(t *testing.T) {
			resetTables(t)
			id, _ := ingestItem(t)
			forceItemState(t, id, prior, 2)

			_, state := ingestItem(t)
			if string(state) != prior {
				t.Fatalf("returned state = %q, want %q", state, prior)
			}
			if got, attempts := itemStateAttempts(t, id); got != prior || attempts != 2 {
				t.Fatalf("row = (%s, %d), want (%s, 2)", got, attempts, prior)
			}
			wantAction := "work_item.queued" // still queued = still truthful
			if prior == "leased" {
				wantAction = "work_item.refreshed"
			}
			if action := lastAuditAction(t, id); action != wantAction {
				t.Fatalf("audit action = %q, want %q", action, wantAction)
			}
		})
	}
}
