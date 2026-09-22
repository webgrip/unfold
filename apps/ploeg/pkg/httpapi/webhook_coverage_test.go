package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http/httptest"
	"slices"
	"testing"
	"time"
)

func TestReadinessReportsMissingTrackerWebhooksWithoutFailing(t *testing.T) {
	coverage := &WebhookCoverage{}
	s := &Server{Store: testStore, Log: slog.New(slog.DiscardHandler), TrackerWebhooks: coverage}
	read := func() map[string]any {
		t.Helper()
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, httptest.NewRequest("GET", "/readyz", nil))
		if w.Code != 200 {
			t.Fatalf("readiness=%d", w.Code)
		}
		var body struct {
			Webhooks map[string]any `json:"vikunjaWebhooks"`
		}
		if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		return body.Webhooks
	}
	if got := read(); got["status"] != "pending" {
		t.Fatalf("before first check: %+v", got)
	}
	coverage.Record(3, []string{"5", "7"}, nil, time.Now())
	got := read()
	missing, _ := got["missingProjects"].([]any)
	if got["status"] != "degraded" || len(missing) != 2 || !slices.Contains(missing, any("7")) {
		t.Fatalf("coverage=%+v", got)
	}
}
