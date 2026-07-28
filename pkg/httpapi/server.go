// Package httpapi exposes ploegd's two surfaces: webhook ingest (tracker →
// queued work) and the run API an agent container uses (claim, renew,
// checkpoint, outcome) per the worker-claims-at-startup convention
// (backlog #48).
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/webgrip/ploeg/pkg/harness"
	"github.com/webgrip/ploeg/pkg/provider"
	"github.com/webgrip/ploeg/pkg/store"
	"github.com/webgrip/ploeg/pkg/work"
)

type Server struct {
	Store    *store.Store
	Trackers map[string]provider.TrackerProvider
	LeaseTTL time.Duration
	Log      *slog.Logger
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	mux.HandleFunc("GET /readyz", s.handleReady)
	mux.HandleFunc("POST /webhooks/tracker/{provider}", s.handleTrackerWebhook)
	mux.HandleFunc("POST /api/v1/claim", s.handleClaim)
	mux.HandleFunc("POST /api/v1/runs/{token}/renew", s.handleRenew)
	mux.HandleFunc("POST /api/v1/runs/{token}/checkpoint", s.handleCheckpoint)
	mux.HandleFunc("POST /api/v1/runs/{token}/outcome", s.handleOutcome)
	// Literal path wins over the {team} wildcard in the Go 1.22 mux.
	mux.HandleFunc("GET /api/v1/queue/depth", s.handleQueueDepth)
	mux.HandleFunc("GET /api/v1/queue/{team}", s.handleQueue)
	return mux
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.Ping(r.Context()); err != nil {
		http.Error(w, "db unreachable", http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// handleTrackerWebhook verifies + parses via the provider, then fast-acks:
// assigned events queue work, everything else is (for now) dropped after
// normalization.
func (s *Server) handleTrackerWebhook(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("provider")
	tp, ok := s.Trackers[name]
	if !ok {
		http.Error(w, "unknown tracker provider", http.StatusNotFound)
		return
	}
	events, err := tp.ParseWebhook(r)
	if err != nil {
		s.Log.Warn("webhook rejected", "provider", name, "err", err)
		http.Error(w, "webhook rejected", http.StatusBadRequest)
		return
	}
	for _, ev := range events {
		if ev.Kind != provider.TrackerAssigned {
			continue
		}
		item := s.mirror(r.Context(), tp, ev)
		id, state, err := s.Store.IngestAssigned(r.Context(), item)
		if err != nil {
			s.Log.Error("ingest failed", "provider", name, "external_id", ev.ExternalID, "err", err)
			http.Error(w, "ingest failed", http.StatusInternalServerError)
			return
		}
		// Log the actual post-upsert state: a re-assignment of a live
		// (queued/leased) item refreshes the mirror without re-queuing (VIK-588).
		if state == work.StateQueued {
			s.Log.Info("work item queued", "id", id, "team", item.Team, "title", item.Title)
		} else {
			s.Log.Info("work item refreshed, not queued", "id", id, "state", string(state), "team", item.Team, "title", item.Title)
		}
	}
	w.WriteHeader(http.StatusAccepted)
}

// mirror applies the thin-payload rule: prefer the provider's authoritative
// read, fall back to the webhook snapshot.
func (s *Server) mirror(ctx context.Context, tp provider.TrackerProvider, ev provider.TrackerEvent) work.WorkItem {
	if item, err := tp.FetchItem(ctx, ev.ExternalID); err == nil {
		item.Team = ev.Team
		return item
	}
	if ev.Item != nil {
		return *ev.Item
	}
	return work.WorkItem{Provider: tp.Name(), ExternalID: ev.ExternalID, Team: ev.Team, Origin: work.OriginAssignment}
}

type claimRequest struct {
	Team string `json:"team"`
}

type claimResponse struct {
	RunToken string        `json:"runToken"`
	Deadline time.Time     `json:"deadline"`
	WorkItem work.WorkItem `json:"workItem"`
}

// handleClaim leases the next queued item for a team. 204 = empty-handed
// worker, exit 0 (backlog #49).
func (s *Server) handleClaim(w http.ResponseWriter, r *http.Request) {
	var req claimRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Team == "" {
		http.Error(w, "body must be {\"team\": \"...\"}", http.StatusBadRequest)
		return
	}
	claimed, err := s.Store.Claim(r.Context(), req.Team, s.LeaseTTL)
	if errors.Is(err, store.ErrNoWork) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		s.Log.Error("claim failed", "team", req.Team, "err", err)
		http.Error(w, "claim failed", http.StatusInternalServerError)
		return
	}
	s.Log.Info("lease acquired", "team", req.Team, "work_item", claimed.Item.ID, "deadline", claimed.Deadline)
	writeJSON(w, http.StatusOK, claimResponse{RunToken: claimed.RunToken, Deadline: claimed.Deadline, WorkItem: claimed.Item})
}

func (s *Server) handleRenew(w http.ResponseWriter, r *http.Request) {
	deadline, err := s.Store.Renew(r.Context(), r.PathValue("token"), s.LeaseTTL)
	if err != nil {
		runError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deadline": deadline})
}

func (s *Server) handleCheckpoint(w http.ResponseWriter, r *http.Request) {
	var cp work.Checkpoint
	if err := json.NewDecoder(r.Body).Decode(&cp); err != nil || cp.Phase == "" {
		http.Error(w, "checkpoint requires a phase", http.StatusBadRequest)
		return
	}
	if err := s.Store.Checkpoint(r.Context(), r.PathValue("token"), cp); err != nil {
		runError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleOutcome accepts the full harness.OutcomeReport shape
// (docs/contracts/outcomereport.v1.schema.json). The historical 4-field
// body remains valid: checkpoint and usage are additive. A final checkpoint
// riding inline is written before the outcome ends the run.
func (s *Server) handleOutcome(w http.ResponseWriter, r *http.Request) {
	var req harness.OutcomeReport
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !req.Outcome.Valid() {
		http.Error(w, "outcome must be a known outcome enum value", http.StatusBadRequest)
		return
	}
	if req.Outcome == work.OutcomeStuck && req.StuckReason == "" {
		http.Error(w, "stuck outcome requires a stuckReason (R4)", http.StatusBadRequest)
		return
	}
	if req.Checkpoint != nil && req.Checkpoint.Phase != "" {
		if err := s.Store.Checkpoint(r.Context(), r.PathValue("token"), *req.Checkpoint); err != nil {
			runError(w, err)
			return
		}
	}
	var usage json.RawMessage
	if req.Usage != nil {
		usage, _ = json.Marshal(req.Usage)
	}
	err := s.Store.ReportOutcome(r.Context(), r.PathValue("token"),
		store.Report(req.Outcome, req.Summary, req.StuckReason, req.Links, usage, string(req.FailureReason)))
	if err != nil {
		if errors.Is(err, store.ErrUnknownRun) {
			runError(w, err)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	s.Log.Info("outcome reported", "outcome", req.Outcome, "summary", req.Summary)
	w.WriteHeader(http.StatusNoContent)
}

// handleQueueDepth serves the executor scale signal over HTTP: the same
// claimable-count the KEDA scaler reads via SQL, for executors without
// Postgres credentials (docs/contracts/executor.md).
func (s *Server) handleQueueDepth(w http.ResponseWriter, r *http.Request) {
	team := r.URL.Query().Get("team")
	if team == "" {
		http.Error(w, "team query parameter is required", http.StatusBadRequest)
		return
	}
	n, err := s.Store.QueueDepth(r.Context(), team)
	if err != nil {
		http.Error(w, "queue depth read failed", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"team": team, "depth": n})
}

func (s *Server) handleQueue(w http.ResponseWriter, r *http.Request) {
	items, err := s.Store.QueueSnapshot(r.Context(), r.PathValue("team"))
	if err != nil {
		http.Error(w, "queue read failed", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func runError(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrUnknownRun) {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
