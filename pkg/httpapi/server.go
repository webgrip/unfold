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

	"github.com/webgrip/ploeg/pkg/forgebroker"
	"github.com/webgrip/ploeg/pkg/harness"
	"github.com/webgrip/ploeg/pkg/provider"
	"github.com/webgrip/ploeg/pkg/store"
	"github.com/webgrip/ploeg/pkg/target"
	"github.com/webgrip/ploeg/pkg/work"
)

type Server struct {
	Store    *store.Store
	Trackers map[string]provider.TrackerProvider
	// Targets resolves a tracker scope to the repository the work lands in.
	// Nil = no mapping configured; every item stays unresolved and workers use
	// their env-configured repo (the pre-decoupling behavior).
	Targets target.Resolver
	// ScopeTeams pins a tracker container to one team (config: a project's
	// `team:`). The pin BEATS the assignee mapping — the config has always
	// said "Team routes this project's work to one team. Empty means the
	// assignee decides", and until this field the second sentence was the
	// whole implementation. Nil or missing scope = the assignee decides,
	// unchanged.
	ScopeTeams map[string]string
	LeaseTTL   time.Duration
	Log        *slog.Logger
	// Engine is the Shift lifecycle fast path (run-multi-agent-shifts): ingest
	// opens, an outcome report evaluates. Nil = no shift engine configured,
	// dispatch unchanged. Engine errors are logged, never returned to the
	// caller — the sweeper's EvaluateAll repairs whatever a lost fast path
	// leaves behind (R2), so a webhook or worker must never see a 5xx for it.
	Engine ShiftEngine
	// Forges hosts the forge webhook route. Nil or missing = the endpoint
	// answers 404 for that provider; nothing else in ploegd depends on it.
	Forges map[string]provider.ForgeProvider
	// ForgeCreds mints the per-run push credential a writing Run gets
	// (ADR-0013 tier 2). Nil = the worker keeps its env credential, which is
	// the pre-tier-2 behaviour.
	ForgeCreds forgebroker.Broker
	// RoleCaps supplies the per-Run spending ceiling for a (team, role),
	// implemented by plan.Plans. Nil = no caps, and the authorization is
	// bounded by the Shift pool alone.
	RoleCaps RoleCaps
}

// RoleCaps is the slice of the team-plan config the claim path needs.
type RoleCaps interface {
	RoleCap(team, role string) float64
}

// ShiftEngine is implemented by pkg/shiftengine. An interface here rather
// than the concrete type, so httpapi tests that never touch Shifts do not
// need an engine, and the engine package stays free to import httpapi types
// if it ever must.
type ShiftEngine interface {
	EnsureShift(ctx context.Context, workItemID int64, item work.WorkItem) error
	EvaluateItem(ctx context.Context, workItemID int64) error
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	mux.HandleFunc("GET /readyz", s.handleReady)
	mux.HandleFunc("POST /webhooks/tracker/{provider}", s.handleTrackerWebhook)
	mux.HandleFunc("POST /webhooks/forge/{provider}", s.handleForgeWebhook)
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
		s.pinTeam(&item)
		s.resolveTarget(&item, ev)
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
			// The Shift fast path. Crash between the commit above and this call
			// leaves a queued item with no Shift — the sweeper's repair case.
			if s.Engine != nil {
				if err := s.Engine.EnsureShift(r.Context(), id, item); err != nil {
					s.Log.Error("shift open failed; sweeper will repair", "id", id, "err", err)
				}
			}
		} else {
			s.Log.Info("work item refreshed, not queued", "id", id, "state", string(state), "team", item.Team, "title", item.Title)
		}
	}
	w.WriteHeader(http.StatusAccepted)
}

// handleForgeWebhook is the forge's way in: verify, dedup, audit, acknowledge.
//
// It acts on nothing yet, and that is the whole scope of this change. Routing
// a submitted review into a re-mandate needs the branch-to-Work-Item lookup
// backlog #107 owes it, and the two "keep going" paths — an agent's verdict
// and a human's review — should be reconciled deliberately rather than by
// whichever landed first (ADR-0017 names that as a re-evaluation trigger).
// What lands here is the endpoint, verified and deduplicated, so the events
// are recorded from the day the network path opens rather than from the day
// somebody notices it was never wired.
//
// Everything expensive stays out of the handler: Forgejo's DELIVER_TIMEOUT is
// 5 seconds and a slow endpoint becomes a disabled webhook (backlog #3).
func (s *Server) handleForgeWebhook(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("provider")
	fp, ok := s.Forges[name]
	if !ok {
		// Not an error worth alarming on: a forge may be configured to notify
		// an instance that does not host that provider.
		s.Log.Warn("forge webhook for an unknown provider", "provider", name)
		http.Error(w, "unknown forge provider", http.StatusNotFound)
		return
	}

	// Dedup BEFORE parsing: a redelivery must cost nothing, and the delivery
	// id is readable without touching the body.
	delivery := r.Header.Get("X-Forgejo-Delivery")
	if delivery == "" {
		delivery = r.Header.Get("X-Gitea-Delivery")
	}
	seen, err := s.Store.SeenDelivery(r.Context(), name, delivery)
	if err != nil {
		s.Log.Error("forge webhook dedup failed", "provider", name, "err", err)
		http.Error(w, "dedup failed", http.StatusInternalServerError)
		return
	}
	if seen {
		s.Log.Info("forge webhook redelivered; ignoring", "provider", name, "delivery", delivery)
		w.WriteHeader(http.StatusAccepted)
		return
	}

	// ParseWebhook verifies the signature against the raw body before it
	// parses anything (backlog #2).
	events, err := fp.ParseWebhook(r)
	if err != nil {
		s.Log.Warn("forge webhook rejected", "provider", name, "err", err)
		http.Error(w, "webhook rejected", http.StatusBadRequest)
		return
	}
	for _, ev := range events {
		// Recorded, not acted on. The body is text written outside the
		// factory, so it is audited as evidence and never fed anywhere that
		// would treat it as an instruction (backlog #9).
		if err := s.Store.AuditForgeEvent(r.Context(), name, string(ev.Kind), ev.Repo, ev.Branch, ev.PR); err != nil {
			s.Log.Error("forge event audit failed", "provider", name, "kind", ev.Kind, "err", err)
			continue
		}
		s.Log.Info("forge event recorded", "provider", name, "kind", ev.Kind,
			"repo", ev.Repo, "pr", ev.PR, "branch", ev.Branch)
	}
	w.WriteHeader(http.StatusAccepted)
}

// mirror applies the thin-payload rule: prefer the provider's authoritative
// read, fall back to the webhook snapshot.
func (s *Server) mirror(ctx context.Context, tp provider.TrackerProvider, ev provider.TrackerEvent) work.WorkItem {
	if item, err := tp.FetchItem(ctx, ev.ExternalID); err == nil {
		// The event's routing facts win over the read: FetchItem returns the
		// tracker's view of the item, not Ploeg's dispatch decision.
		item.Team = ev.Team
		item.ExternalScope = ev.Scope.ID
		return item
	}
	if ev.Item != nil {
		return *ev.Item
	}
	return work.WorkItem{Provider: tp.Name(), ExternalID: ev.ExternalID, Team: ev.Team,
		ExternalScope: ev.Scope.ID, Origin: work.OriginAssignment}
}

// resolveTarget decides where this item's changes land. It runs AFTER mirror
// so it applies to both the authoritative read and the webhook-snapshot
// fallback — putting it inside mirror's happy path would silently drop targets
// the day FetchItem stops being a stub (backlog #31).
//
// An unresolved target is not an error: the item still queues, and the worker
// falls back to its env-configured repo. The WARN is the onboarding worklist,
// generated from live traffic rather than guessed.
// pinTeam applies a container's pinned team once the scope is known — which
// for a thin webhook (clickup) is only after mirror has fetched the item, so
// this cannot live in the provider. It runs before resolveTarget so the
// team-qualified routing rules see the team the work will actually run as.
func (s *Server) pinTeam(item *work.WorkItem) {
	if item.ExternalScope == "" {
		return
	}
	pinned, ok := s.ScopeTeams[item.ExternalScope]
	if !ok || pinned == "" || pinned == item.Team {
		return
	}
	s.Log.Info("team pinned by tracker container", "external_id", item.ExternalID,
		"scope", item.ExternalScope, "assignee_team", item.Team, "team", pinned)
	item.Team = pinned
}

func (s *Server) resolveTarget(item *work.WorkItem, ev provider.TrackerEvent) {
	if s.Targets == nil {
		return
	}
	if item.ExternalScope == "" {
		s.Log.Warn("tracker event carries no scope; target unresolved",
			"provider", item.Provider, "external_id", ev.ExternalID, "team", item.Team)
		return
	}
	t, rule, ok := s.Targets.Resolve(item.ExternalScope, item.Team)
	if !ok {
		s.Log.Warn("no target mapping for tracker scope; worker will use its env repo",
			"scope", item.ExternalScope, "team", item.Team, "external_id", ev.ExternalID)
		return
	}
	item.Target = &t
	item.RouteRule = rule
	// The routing decision, at the moment it is made. Only the failures were
	// logged, so a CORRECT decision was invisible in ploegd's own log and
	// only surfaced a hop later in the worker — after a pod had been
	// scheduled and an agent had started. Nothing here is a credential.
	s.Log.Info("target resolved", "external_id", ev.ExternalID, "scope", item.ExternalScope,
		"team", item.Team, "repo", t.Owner+"/"+t.Repo, "branch", t.BaseBranch,
		"forge", t.Forge, "rule", rule)
}

type claimRequest struct {
	Team string `json:"team"`
	// Role selects which slot of a Round this worker claims. Empty = the
	// pre-Shift claim over queued Work Items.
	Role string `json:"role,omitempty"`
}

type claimResponse struct {
	RunToken string        `json:"runToken"`
	Deadline time.Time     `json:"deadline"`
	WorkItem work.WorkItem `json:"workItem"`
	// Shift fields; all absent on a pre-Shift claim, so an old worker sees
	// exactly today's body.
	Shift      int64             `json:"shift,omitempty"`
	Role       string            `json:"role,omitempty"`
	Round      int               `json:"round,omitempty"`
	Writes     bool              `json:"writes,omitempty"`
	Branch     string            `json:"branch,omitempty"`
	Authorized float64           `json:"authorized,omitempty"`
	Briefing   []harness.Finding `json:"briefing,omitempty"`
	// ForgeToken is a push credential minted for THIS run and revoked when it
	// settles (ADR-0013 tier 2). Empty = use the env credential. Never logged,
	// never audited, never in a Task Spec (R8).
	ForgeToken string `json:"forgeToken,omitempty"`
	// ForgeTokenPerRun says whether ForgeToken was actually minted for this
	// run, or is the shared token the Static broker hands back unchanged.
	// Both arrive in the same field, and the worker cannot tell them apart —
	// which made it log a per-run credential on deployments that have none.
	ForgeTokenPerRun bool `json:"forgeTokenPerRun,omitempty"`
}

// handleClaim leases the next unit of work for a team. 204 = empty-handed
// worker, exit 0 (backlog #49).
//
// With a role, the claim is Shift-scoped: the oldest pending Run for that
// (team, role), with its budget authorized in the same transaction. Without
// one, it is the pre-Shift claim over queued Work Items, unchanged.
func (s *Server) handleClaim(w http.ResponseWriter, r *http.Request) {
	var req claimRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Team == "" {
		http.Error(w, "body must be {\"team\": \"...\", \"role\": \"...\"}", http.StatusBadRequest)
		return
	}
	if req.Role != "" {
		s.claimRole(w, r, req)
		return
	}
	// A role-less worker still belongs to a Shift when uniform dispatch
	// synthesized one — its Run carries the empty role. Try that first and
	// fall through to the pre-Shift claim when there is none, so the same
	// pod serves both worlds and the kill switch needs no chart change.
	if run, err := s.Store.ClaimRole(r.Context(), req.Team, "", s.LeaseTTL, 0); err == nil {
		s.respondClaimedRun(w, r, req, run)
		return
	} else if !errors.Is(err, store.ErrNoWork) && !errors.Is(err, store.ErrBudgetExhausted) {
		s.Log.Error("role-less shift claim failed", "team", req.Team, "err", err)
		http.Error(w, "claim failed", http.StatusInternalServerError)
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

// claimRole serves a Shift-scoped claim, carrying everything the Run needs
// that it cannot derive: its place in the Shift, the branch ploegd derived,
// the budget ceiling its credential must be minted at, and the briefing of
// earlier Rounds' findings (ADR-0011 — the agent fetches nothing itself).
func (s *Server) claimRole(w http.ResponseWriter, r *http.Request, req claimRequest) {
	cap := 0.0
	if s.RoleCaps != nil {
		cap = s.RoleCaps.RoleCap(req.Team, req.Role)
	}
	run, err := s.Store.ClaimRole(r.Context(), req.Team, req.Role, s.LeaseTTL, cap)
	switch {
	case errors.Is(err, store.ErrNoWork):
		w.WriteHeader(http.StatusNoContent)
		return
	case errors.Is(err, store.ErrBudgetExhausted):
		// Not an error the worker can act on: nothing is spawned, no key is
		// minted, no attempt is burned. The sweeper parks the item with a
		// reason naming the spend.
		s.Log.Warn("claim refused: shift budget exhausted", "team", req.Team, "role", req.Role)
		w.WriteHeader(http.StatusNoContent)
		return
	case err != nil:
		s.Log.Error("role claim failed", "team", req.Team, "role", req.Role, "err", err)
		http.Error(w, "claim failed", http.StatusInternalServerError)
		return
	}

	s.respondClaimedRun(w, r, req, run)
}

// respondClaimedRun builds the Shift-shaped claim response, briefing and all.
func (s *Server) respondClaimedRun(w http.ResponseWriter, r *http.Request, req claimRequest, run *store.ClaimedRun) {
	resp := claimResponse{
		RunToken: run.RunToken, Deadline: run.Deadline, WorkItem: run.Item,
		Shift: run.ShiftID, Role: run.Role, Round: run.Round,
		Writes: run.Writes, Branch: run.Branch, Authorized: run.Authorized,
	}
	// Prior Rounds only: this Round's siblings are still running, and Runs in
	// one Round never observe each other (ADR-0010).
	reports, err := s.Store.RoundReports(r.Context(), run.ShiftID)
	if err != nil {
		s.Log.Error("briefing read failed; run proceeds without it", "shift", run.ShiftID, "err", err)
	}
	for _, rep := range reports {
		if rep.Round < run.Round && rep.Findings != "" {
			resp.Briefing = append(resp.Briefing, harness.Finding{
				Role: rep.Role, Round: rep.Round, Findings: rep.Findings,
			})
		}
	}
	// Push rights are minted per writing Run, so holding the Lease and being
	// able to push are one fact rather than two that can disagree. A reader
	// gets nothing here — it has no Lease and no business pushing.
	if run.Writes && s.ForgeCreds != nil && run.Item.Target != nil {
		cred, err := s.ForgeCreds.Mint(r.Context(), forgebroker.MintRequest{
			RunToken: run.RunToken, Owner: run.Item.Target.Owner, Repo: run.Item.Target.Repo,
		})
		if err != nil {
			// Nothing can safely push, so nothing should run. Finish the Run
			// as a retryable infra failure and answer empty-handed: the pod
			// exits 0 and the item comes back round rather than running with
			// a credential we did not intend to hand out.
			s.Log.Error("forge credential mint failed; releasing the run",
				"team", req.Team, "role", run.Role, "err", err)
			fr := string(work.FailureInfraNode)
			if _, rerr := s.Store.ReportOutcome(r.Context(), run.RunToken,
				store.Report(work.OutcomeFailed, "could not mint a push credential", "", nil, nil, &fr)); rerr != nil {
				s.Log.Error("releasing the run failed", "err", rerr)
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if cred.ID != "" {
			if err := s.Store.RecordForgeToken(r.Context(), run.RunToken, cred.ID); err != nil {
				// The credential exists but is unrecorded: the boot sweep is
				// the backstop that reaps it.
				s.Log.Error("could not record the forge credential; the boot sweep will reap it",
					"run", run.RunToken[:12], "err", err)
			}
		}
		resp.ForgeToken = cred.Token
		// cred.ID is the truth predicate for "minted, and therefore
		// revocable" — the Static broker returns the SHARED token with no id.
		// Without telling the worker, it announces a security property it
		// does not have (ADR-0013 tier 2 vs the pre-tier-2 shared token).
		resp.ForgeTokenPerRun = cred.ID != ""
	}

	s.Log.Info("run claimed", "team", req.Team, "role", run.Role, "shift", run.ShiftID,
		"round", run.Round, "writes", run.Writes, "authorized", run.Authorized,
		"briefing", len(resp.Briefing), "deadline", run.Deadline)
	writeJSON(w, http.StatusOK, resp)
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

// validateOutcomeReport enforces the closed enums and R4 at the boundary,
// before anything reaches the store.
//
// docs/contracts/outcomereport.v1.schema.json declares these constraints and
// pkg/harness/contract_test.go pins the schema to the Go types — but neither
// runs at request time. A schema nothing checks on the wire is documentation,
// not a gate: an adapter that typos `infra_llm` had its value stored verbatim
// and silently defeated pkg/worker's classification, which defers to an
// adapter-set failureReason.
//
// Pure by design, so the rules are testable without a database.
func validateOutcomeReport(req harness.OutcomeReport) error {
	if !req.Outcome.Valid() {
		return errors.New("outcome must be a known outcome enum value")
	}
	if req.Outcome == work.OutcomeStuck && req.StuckReason == "" {
		return errors.New("stuck outcome requires a stuckReason (R4)")
	}
	if req.FailureReason != "" && !work.FailureReason(req.FailureReason).Valid() {
		return errors.New("failureReason must be a known failure-reason enum value")
	}
	// The verdict is the one field by which an agent influences what runs
	// next (ADR-0017), so the enum is closed at the boundary for the same
	// reason failureReason is: a value nothing checks is documentation.
	if !harness.ValidVerdict(req.Verdict) {
		return errors.New("verdict must be approve or request_changes")
	}
	return nil
}

// handleOutcome accepts the full harness.OutcomeReport shape
// (docs/contracts/outcomereport.v1.schema.json). The historical 4-field
// body remains valid: checkpoint and usage are additive. A final checkpoint
// riding inline is written before the outcome ends the run.
func (s *Server) handleOutcome(w http.ResponseWriter, r *http.Request) {
	var req harness.OutcomeReport
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "outcome must be a known outcome enum value", http.StatusBadRequest)
		return
	}
	if err := validateOutcomeReport(req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
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
	var failureReason *string
	if req.FailureReason != "" {
		fr := req.FailureReason
		failureReason = &fr
	}
	res, err := s.Store.ReportOutcome(r.Context(), r.PathValue("token"),
		store.Report(req.Outcome, req.Summary, req.StuckReason, req.Links, usage, failureReason).
			WithFindings(req.Findings).WithVerdict(req.Verdict))
	if err != nil {
		if errors.Is(err, store.ErrUnknownRun) {
			runError(w, err)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	// Push rights die with the Run (ADR-0013 tier 2). Best-effort: the
	// sweeper's lease-expiry path and the boot sweep are the backstops, and
	// the token's own TTL is the last net.
	if s.ForgeCreds != nil && res.ForgeTokenID != "" {
		if err := s.ForgeCreds.Revoke(r.Context(), forgebroker.Credential{ID: res.ForgeTokenID}); err != nil {
			s.Log.Error("forge credential revoke failed; the sweeper will retry", "err", err)
		}
	}
	s.Log.Info("outcome reported", "outcome", req.Outcome, "summary", req.Summary)
	// The Shift fast path: this report may have completed a Round. Errors are
	// logged, never surfaced — the worker's report succeeded, and the sweeper
	// repairs a lost evaluation (R2).
	if s.Engine != nil && res.ShiftID != nil {
		if err := s.Engine.EvaluateItem(r.Context(), res.WorkItemID); err != nil {
			s.Log.Error("shift evaluate failed; sweeper will repair", "shift", *res.ShiftID, "err", err)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleQueueDepth serves the executor scale signal over HTTP: the same
// claimable-count the KEDA scaler reads via SQL, for executors without
// Postgres credentials (docs/contracts/executor.md).
//
// With a role it answers from PendingRuns, which selects over the identical
// predicate as ClaimRole — the two are tested against each other, because
// overshoot merely wastes a pod while undershoot stalls Work Items silently
// and forever.
func (s *Server) handleQueueDepth(w http.ResponseWriter, r *http.Request) {
	team := r.URL.Query().Get("team")
	if team == "" {
		http.Error(w, "team query parameter is required", http.StatusBadRequest)
		return
	}
	role := r.URL.Query().Get("role")
	var n int
	var err error
	if role != "" {
		n, err = s.Store.PendingRuns(r.Context(), team, role)
	} else {
		n, err = s.Store.QueueDepth(r.Context(), team)
	}
	if err != nil {
		http.Error(w, "queue depth read failed", http.StatusInternalServerError)
		return
	}
	body := map[string]any{"team": team, "depth": n}
	if role != "" {
		body["role"] = role
	}
	writeJSON(w, http.StatusOK, body)
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
