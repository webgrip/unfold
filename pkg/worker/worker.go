// Package worker is the run orchestrator that executes one claimed work
// item: claim → clone → compose prompt → mint credential → harness adapter
// run → forge-poll outcome resolution → outcome report. The harness itself
// is behind harness.Adapter (design §5); the LLM gateway is behind
// llmbroker.Broker. The worker owns everything the harness must not:
// lease renewal, git identity, credential lifecycle, and outcome ground
// truth.
package worker

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/webgrip/ploeg/pkg/harness"
	"github.com/webgrip/ploeg/pkg/litellm"
	"github.com/webgrip/ploeg/pkg/llmbroker"
	"github.com/webgrip/ploeg/pkg/work"
)

// Config is the environment-derived worker configuration (parsed by
// cmd/ploeg-worker).
type Config struct {
	APIURL string // ploegd base URL
	Team   string
	// Role is this pod's slot in a Round (PLOEG_ROLE). Empty = the pre-Shift
	// claim over queued work items; the pod shape is fixed at render time, so
	// one workload serves exactly one role.
	Role string
	// RepoOwner/RepoName/BaseBranch are the FALLBACK target, used when the
	// claimed work item resolved none. The repository is a property of the
	// work (R11), so these are deprecated per-team config on the way out —
	// not a boot requirement.
	RepoOwner  string
	RepoName   string
	BaseBranch string
	// TargetSource pins this worker to the env target when set to "env";
	// anything else prefers a resolved claim target. The per-team lever for
	// rolling the decoupling forward or back one team at a time.
	TargetSource string
	ForgeURL     string // in-cluster forge base (global today; Target carries an id, not a URL)
	DefaultForge string
	BuilderToken string // agent-builder bot token
	WorkDir      string

	LLMBaseURL string   // OpenAI-compatible base URL handed to the harness
	LLMModel   string   // raw model name (proxy prefixes intact), for passthrough
	LLMModels  []string // stripped model scope for credential minting
	KeyBudget  float64  // max budget (USD) for the per-run credential
	KeyTTL     time.Duration
}

type Worker struct {
	Cfg     Config
	Log     *slog.Logger
	API     *APIClient
	Adapter harness.Adapter
	Broker  llmbroker.Broker
}

func New(cfg Config, adapter harness.Adapter, broker llmbroker.Broker, log *slog.Logger) *Worker {
	return &Worker{
		Cfg:     cfg,
		Log:     log,
		API:     &APIClient{Base: strings.TrimRight(cfg.APIURL, "/"), HC: &http.Client{Timeout: 30 * time.Second}},
		Adapter: adapter,
		Broker:  broker,
	}
}

// Why a run ended early. The distinction is the whole point: a lost lease
// means another worker may own the item, while a terminated pod means this
// one was taken away mid-run and nothing about the work is in doubt.
var (
	errLeaseLost  = errors.New("lease renewal failed")
	errTerminated = errors.New("pod terminated")
)

// Run claims one work item and drives it to a reported outcome. A nil
// claim (empty queue) is the empty-handed convention: exit 0 (backlog #49).
func (w *Worker) Run() error { return w.RunContext(context.Background()) }

// RunContext is Run with a cancellable parent. Cancelling the parent — what
// cmd/ploeg-worker does on SIGTERM — aborts the harness and still reports an
// outcome, which is the only thing that stops a killed pod from stranding its
// Lease for the full TTL and charging the Round an attempt it never spent.
func (w *Worker) RunContext(parent context.Context) error {
	claimed, err := w.API.Claim(w.Cfg.Team, w.Cfg.Role)
	if err != nil {
		return fmt.Errorf("claim: %w", err)
	}
	if claimed == nil {
		w.Log.Info("no claimable work item; exiting empty-handed", "role", w.Cfg.Role)
		return nil
	}
	// Downward API identity for run forensics (VIK-597). Empty when not
	// running in-cluster (dev/test). Also passed via BaseEnv to the harness.
	nodeName := os.Getenv("NODE_NAME")
	podUID := os.Getenv("POD_UID")

	item := claimed.WorkItem
	// The Shift's branch when ploegd produced one; otherwise derive it, as
	// the pre-Shift path always has. Both yield the same string today, so a
	// mixed-version rollout cannot split a ticket across two branches.
	branch := claimed.Branch
	if branch == "" {
		branch = "agent/vik-" + item.ExternalID
	}
	trace := litellm.Alias(claimed.RunToken)
	w.Log.Info("claimed work item", "id", item.ID, "external_id", item.ExternalID, "title", item.Title,
		"trace", trace, "harness", w.Adapter.Name(), "node", nodeName, "pod_uid", podUID,
		"role", claimed.Role, "shift", claimed.Shift, "round", claimed.Round, "writes", claimed.Writes)

	// Deliberately NOT derived from parent: the harness must die with the
	// parent, but everything after it — revoke, settle, report — has to keep
	// running on a cancelled parent or the shutdown reports nothing, which is
	// the failure this whole path exists to prevent.
	ctx, cancel := context.WithCancelCause(context.Background())
	defer cancel(nil)
	go abortOnTermination(parent, ctx, cancel, w.Log, item.ID, claimed.Role)

	// Lease renewal at TTL/3; three consecutive failures (or a 404 = lease
	// stolen) cancel the run — another worker may own the item now.
	ttl := time.Until(claimed.Deadline)
	if ttl <= 0 {
		ttl = time.Minute
	}
	go renewLoop(ctx, cancel, w.API, claimed.RunToken, ttl/3, w.Log)

	// From here on, every terminal path must report an outcome; failing to
	// report leaves the lease to the sweeper (recorded failed/lease expired).
	report := w.execute(ctx, claimed, branch, trace, nodeName, podUID)
	// Log before reporting: if the POST fails, the pod log is the only place
	// the run's actual result (and a stuck reason) survives.
	w.Log.Info("run finished", "outcome", report.Outcome, "summary", report.Summary, "stuck_reason", report.StuckReason, "links", report.Links)
	if err := w.API.Outcome(claimed.RunToken, report); err != nil {
		return fmt.Errorf("outcome report failed (lease left to the sweeper): %w", err)
	}
	w.Log.Info("outcome reported", "outcome", report.Outcome, "summary", report.Summary, "links", report.Links)
	return nil
}

// execute runs clone → prompt → credential mint → harness adapter → PR
// detection and returns the report to submit. It never returns an error:
// every failure maps to an outcome (stuck carries the mandatory reason, R4).
// nodeName and podUID come from the downward API (VIK-597); they are embedded
// in the first checkpoint and first log line for run forensics.
func (w *Worker) execute(ctx context.Context, claimed *ClaimResponse, branch, trace, nodeName, podUID string) harness.OutcomeReport {
	item := claimed.WorkItem

	// A credential minted for THIS run (ADR-0013 tier 2) beats the shared
	// env one: it dies when the run settles, so a partitioned pod whose Lease
	// lapsed cannot keep pushing. Empty = the deployment has no forge admin
	// credential and the shared token stands.
	forgeToken := w.Cfg.BuilderToken
	if claimed.ForgeToken != "" {
		forgeToken = claimed.ForgeToken
		// Say which one it actually is. The Static broker returns the SHARED
		// token in this same field, and logging "per-run" for it claims a
		// revocation guarantee the deployment does not have — read during an
		// audit, that is worse than saying nothing.
		if claimed.ForgeTokenPerRun {
			w.Log.Info("using a per-run forge credential minted for this run")
		} else {
			w.Log.Info("using the shared forge credential supplied by ploegd")
		}
	}

	// Resolve the repository BEFORE touching disk: a misconfigured run must
	// park itself without leaving a clone behind.
	ref, err := resolveTarget(w.Cfg, item, w.Log)
	if err != nil {
		return stuckReport("no repository for this work item", err.Error())
	}
	w.Log.Info("resolved work target", "repo", ref.Owner+"/"+ref.Name, "base", ref.BaseBranch, "route_rule", item.RouteRule)

	cloneDir := filepath.Join(w.Cfg.WorkDir, "vik-"+item.ExternalID)
	_ = os.RemoveAll(cloneDir)
	cloneURL, err := authURL(ref.ForgeURL, "agent-builder", forgeToken, ref.Owner, ref.Name)
	if err != nil {
		return stuckReport("invalid forge URL", err.Error())
	}
	if out, err := runCmd(ctx, "", "git", cloneArgs(ref.BaseBranch, cloneURL, cloneDir)...); err != nil {
		return stuckReport("git clone failed", tail(out, 2000))
	}
	for _, kv := range [][2]string{{"user.name", "agent-builder"}, {"user.email", "agent-builder@webgrip.dev"}} {
		if out, err := runCmd(ctx, cloneDir, "git", "config", kv[0], kv[1]); err != nil {
			return stuckReport("git config failed", tail(out, 2000))
		}
	}

	// A writer creates its own branch from the base, which the clone already
	// checked out. A READER is here to look at what the writer produced, and
	// until now it never got it: the shallow single-branch clone contains the
	// base only, so the branch under review was absent while the prompt
	// insisted the checkout was on it. Fetch it and stand on it.
	//
	// The branch may legitimately not exist yet: a plan can open with a
	// reading Round — silver's `analyst` recons the ticket BEFORE the builder
	// writes anything — and there is nothing to fetch then. That is not a
	// failure, so a missing branch leaves the reader on the base and tells the
	// prompt so, rather than parking a Round that was never going to find one.
	writes := claimed.Writes || claimed.Role == ""
	onReviewBranch := false
	if !writes && branch != "" {
		if out, err := runCmd(ctx, cloneDir, "git", fetchBranchArgs(branch)...); err != nil {
			w.Log.Info("no branch under review yet; reviewing the base branch",
				"branch", branch, "base", ref.BaseBranch, "git", tail(out, 400))
		} else if out, err := runCmd(ctx, cloneDir, "git", "checkout", branch); err != nil {
			return stuckReport("could not check out the branch under review", tail(out, 2000))
		} else {
			onReviewBranch = true
		}
		// Take the credential out of `origin`. The clone needed it to read a
		// private repository; the agent does not need it at all, and leaving
		// it embedded left a reader holding push rights it was told it did
		// not have.
		clean, err := plainURL(ref.ForgeURL, ref.Owner, ref.Name)
		if err != nil {
			return stuckReport("invalid forge URL", err.Error())
		}
		if out, err := runCmd(ctx, cloneDir, "git", "remote", "set-url", "origin", clean); err != nil {
			return stuckReport("could not de-credential the clone", tail(out, 2000))
		}
		w.Log.Info("reading run prepared", "on_review_branch", onReviewBranch,
			"branch", branch, "base", ref.BaseBranch)
	}

	if err := w.API.Checkpoint(claimed.RunToken, work.Checkpoint{Phase: "branch_created", Branch: branch, NodeName: nodeName, PodUID: podUID}); err != nil {
		w.Log.Warn("checkpoint failed", "err", err)
	}

	spec := harness.TaskSpec{
		WorkItem: item,
		Role:     claimed.Role,
		Repo:     ref,
		Branch:   branch,
		TraceID:  trace,
		Briefing: claimed.Briefing,
	}

	// A PR on this branch BEFORE the harness runs is a previous run's work:
	// the branch name is derived from the ticket, so every retry, review round
	// and persona turn reuses it. Without this snapshot a run that crashes
	// instantly would inherit the earlier PR and report pr_opened → done.
	//
	// Looked up before the prompt is composed, not after: the contract has to
	// tell a writer whether to open a PR or update the one already there.
	priorPR, priorErr := findOpenChangeRequest(ref, forgeToken, branch)
	if priorErr != nil {
		w.Log.Warn("pre-run PR lookup failed", "err", priorErr)
	}
	if priorPR != "" {
		w.Log.Info("branch already has an open PR", "pr", priorPR, "branch", branch)
	}

	var logTail harness.TailBuffer
	model := w.Cfg.LLMModel
	if len(w.Cfg.LLMModels) > 0 {
		model = w.Cfg.LLMModels[0]
	}
	env := harness.RunEnv{
		RepoDir:    cloneDir,
		ScratchDir: os.TempDir(),
		Prompt:     ComposePrompt(spec, writes, priorPR, onReviewBranch),
		// A reading run's agent gets no forge credential. os.Environ() carries
		// AGENT_BUILDER_TOKEN — mandatory on every worker pod, writer or not —
		// straight into the agent's process, so "you hold no write credential"
		// was false for every reader ever dispatched. Now it is true.
		BaseEnv: scrubSecrets(os.Environ(), writes, w.Cfg.BuilderToken, claimed.ForgeToken),
		LLM:     harness.LLMEnv{BaseURL: w.Cfg.LLMBaseURL, Model: model, TraceID: trace},
		Stdout:  io.MultiWriter(os.Stdout, &logTail),
		Stderr:  io.MultiWriter(os.Stderr, &logTail),
		Checkpoint: func(cp work.Checkpoint) {
			if err := w.API.Checkpoint(claimed.RunToken, cp); err != nil {
				w.Log.Warn("checkpoint failed", "err", err)
			}
		},
		Log: w.Log,
	}

	// The Shift's authorization is the ceiling the credential must be minted
	// at: min(roleCap, poolRemaining), computed under the Shift row lock
	// (ADR-0012). Zero = no Shift authorized this run, so the env budget
	// stands, exactly as on the pre-Shift path.
	budget := w.Cfg.KeyBudget
	if claimed.Authorized > 0 {
		budget = claimed.Authorized
	}

	w.Log.Info("starting headless harness run", "harness", w.Adapter.Name(), "cwd", cloneDir,
		"role", claimed.Role, "budget_usd", budget, "briefing", len(claimed.Briefing))
	report, mintErr, runErr := runAgent(ctx, w.Log, w.Broker, w.Adapter, spec, env, llmbroker.MintRequest{
		RunToken:  claimed.RunToken,
		BudgetUSD: budget,
		Models:    w.Cfg.LLMModels,
		TTL:       w.Cfg.KeyTTL,
	})
	if mintErr != nil {
		return stuckReport("failed to mint per-run LiteLLM key", mintErr.Error())
	}

	// The PR is the ground truth (git/forge state stays the durable medium).
	prURL, prErr := findOpenChangeRequest(ref, forgeToken, branch)
	if prErr != nil {
		w.Log.Warn("PR lookup failed", "err", prErr)
	}
	return resolveOutcome(w.Adapter.Name(), report, runErr, context.Cause(ctx), prURL, priorPR != "",
		item.Title, branch, logTail.Bytes(), w.Adapter.ExpectsLLM(), writes)
}

// runAgent mints the per-run credential, runs the harness adapter, and
// revokes the credential on every return path (deferred). Returns the
// adapter's report, a mint error (nothing ran), and the run error.
func runAgent(ctx context.Context, log *slog.Logger, broker llmbroker.Broker, adapter harness.Adapter,
	spec harness.TaskSpec, env harness.RunEnv, req llmbroker.MintRequest) (report harness.OutcomeReport, mintErr, runErr error) {

	mintCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	cred, err := broker.Mint(mintCtx, req)
	cancel()
	if err != nil {
		return harness.OutcomeReport{}, err, nil
	}
	if cred.APIKey != "" {
		log.Info("minted per-run key", "trace", cred.Alias)
	}

	// Deferred revoke on EVERY return path (agent success, agent error,
	// context cancel). The gateway TTL is the backstop, never the mechanism.
	defer func() {
		revokeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := broker.Revoke(revokeCtx, cred); err != nil {
			log.Warn("revoke per-run key failed", "err", err, "trace", cred.Alias)
		} else if cred.APIKey != "" {
			log.Info("revoked per-run key", "trace", cred.Alias)
		}
	}()

	env.LLM.APIKey = cred.APIKey
	env.BaseEnv = append(env.BaseEnv, "LLM_TRACE_ID="+spec.TraceID)
	if cred.APIKey != "" {
		env.BaseEnv = append(env.BaseEnv, "LLM_API_KEY="+cred.APIKey)
	}

	report, runErr = adapter.Run(ctx, spec, env)

	// Settle the cost from the gateway while the credential still exists —
	// the deferred Revoke above deletes the row this reads. Without this the
	// Shift pool never depletes: settlement adds COALESCE(usage->>'costUsd', 0)
	// and openhands/exec report no usage at all, so `spent` stayed 0.0000 and
	// every budget bound that reads it was inert.
	if m, ok := broker.(llmbroker.Metered); ok && cred.APIKey != "" {
		settleCtx, settleCancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer settleCancel()
		if spend, err := settleSpend(settleCtx, m, cred, log); err != nil {
			log.Warn("gateway spend unavailable; run cost not settled", "err", err, "trace", cred.Alias)
		} else {
			if report.Usage == nil {
				report.Usage = &harness.Usage{}
			}
			report.Usage.CostUSD = spend
			log.Info("settled run cost", "trace", cred.Alias, "cost_usd", spend)
		}
	}
	return report, nil, runErr
}

// settleSpend reads the credential's spend, waiting for the gateway's
// accounting to catch up.
//
// LiteLLM writes spend asynchronously, so the first read after a run ends is
// routinely stale — often zero. Polling until the value stops MOVING rather
// than until it is non-zero matters in both directions: a genuinely free run
// (the exec harness makes no calls) settles at zero on the first two reads
// and returns immediately, and a busy run is not truncated at whatever
// partial figure happened to be written first.
func settleSpend(ctx context.Context, m llmbroker.Metered, cred llmbroker.Credential, log *slog.Logger) (float64, error) {
	const (
		every  = 2 * time.Second
		budget = 20 * time.Second
	)
	deadline := time.Now().Add(budget)

	readCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), budget+10*time.Second)
	defer cancel()

	prev, err := m.Spend(readCtx, cred)
	if err != nil {
		return 0, err
	}
	for time.Now().Before(deadline) {
		select {
		case <-readCtx.Done():
			return prev, nil
		case <-time.After(every):
		}
		cur, err := m.Spend(readCtx, cred)
		if err != nil {
			// A transient read failure should not throw away a good figure.
			log.Debug("spend re-read failed, keeping previous", "err", err)
			return prev, nil
		}
		if cur == prev {
			return cur, nil
		}
		prev = cur
	}
	return prev, nil
}

// noLLMTraffic reports whether usage telemetry proves the run made no LLM
// calls at all. Zero cost ALONE is not that proof: ACP agents report token
// counts without a cost (UsageUpdate.cost is optional in the protocol), so
// keying VIK-586 on cost alone would relabel a genuine agent error as an
// infra failure. nil usage means "unknown", never "none".
func noLLMTraffic(u *harness.Usage) bool {
	return u != nil && u.CostUSD == 0 && u.InputTokens == 0 && u.OutputTokens == 0
}

// resolveOutcome is the orchestrator's outcome precedence (design §5):
// a NEW PR on the branch always wins; then a valid structured harness
// report; then the exit-code heuristics. Usage from the harness report is
// preserved regardless of which branch decides.
//
// prExisted says a PR was already open on this branch before the harness
// ran. The branch is derived from the ticket, so retries, review rounds and
// persona turns all reuse it — without this flag a run that crashed
// instantly would inherit its predecessor's PR and report pr_opened, marking
// the item done on work it never did.
//
// expectsLLM is true for LLM-driven adapters (openhands, claude-code) —
// used by the VIK-586 heuristic: an LLM adapter that produced no LLM
// traffic at all maps to failed/infra_llm; exec adapters and unknown
// telemetry keep the default no_change_needed so exec-harness smoke runs do
// not burn attempts.
func resolveOutcome(adapterName string, report harness.OutcomeReport, runErr, ctxErr error,
	prURL string, prExisted bool, itemTitle, branch string, logTail []byte, expectsLLM, writes bool) harness.OutcomeReport {

	resolved := func(r harness.OutcomeReport) harness.OutcomeReport {
		if r.Usage == nil {
			r.Usage = report.Usage
		}
		return r
	}
	switch {
	case prURL != "" && !prExisted:
		return resolved(harness.OutcomeReport{
			Outcome:    work.OutcomePROpened,
			Summary:    adapterName + " run opened a PR for " + itemTitle,
			Links:      []string{prURL},
			Checkpoint: &work.Checkpoint{Phase: "pr_opened", Branch: branch, PRURL: prURL},
		})
	case report.Outcome.Valid():
		if report.Outcome == work.OutcomeStuck && report.StuckReason == "" {
			report.StuckReason = tail(logTail, 2000) // R4: stuck always carries a reason
		}
		// A structured report says what the agent DID, not where the work
		// lives — an agent is never given the pull request URL and must not be
		// trusted to assert one. Ploeg polled the forge and knows, so it fills
		// the gap it left.
		//
		// Without this, a READING Run that correctly wrote a drop box returned
		// a report with no link, while one that returned nothing got a link
		// from the reader branch below. publishRound finds the pull request by
		// scanning reported links, so a review-only Shift published its
		// findings nowhere — the reviewer worked and no one could read it.
		if len(report.Links) == 0 && prURL != "" {
			report.Links = []string{prURL}
		}
		// VIK-586: LLM adapter that made no LLM calls → infra_llm failure.
		// An adapter that already classified the failure is trusted over the
		// heuristic — a structured taxonomy beats an inference.
		if report.Outcome == work.OutcomeFailed && expectsLLM &&
			report.FailureReason == "" && noLLMTraffic(report.Usage) {
			report.FailureReason = string(work.FailureInfraLLM)
		}
		return report
	case runErr == nil && prURL != "" && !writes:
		// A READER standing on the writer's branch finds the writer's PR. It
		// did not push it — it cannot push at all — so crediting it with
		// pr_updated would record work that never happened, and on a plan
		// whose last Round is a review that is every successful Shift.
		return resolved(harness.OutcomeReport{
			Outcome:    work.OutcomeNoChangeNeeded,
			Summary:    adapterName + " review finished for " + itemTitle,
			Links:      []string{prURL},
			Findings:   report.Findings,
			Verdict:    report.Verdict,
			Checkpoint: &work.Checkpoint{Phase: "reviewed", Branch: branch, PRURL: prURL},
		})
	case runErr == nil && prURL != "":
		// The PR predates this run and the harness exited cleanly: it pushed
		// to an existing PR (a retry, a review round, or the next persona).
		return resolved(harness.OutcomeReport{
			Outcome:    work.OutcomePRUpdated,
			Summary:    adapterName + " run updated the open PR for " + itemTitle,
			Links:      []string{prURL},
			Checkpoint: &work.Checkpoint{Phase: "pr_updated", Branch: branch, PRURL: prURL},
		})
	case runErr == nil:
		// nil Usage = no telemetry = UNKNOWN → keep no_change_needed (VIK-586).
		if expectsLLM && noLLMTraffic(report.Usage) {
			return resolved(harness.OutcomeReport{
				Outcome:       work.OutcomeFailed,
				Summary:       adapterName + " run finished with zero LLM spend and no PR — likely LLM infra failure",
				FailureReason: string(work.FailureInfraLLM),
			})
		}
		return resolved(harness.OutcomeReport{
			Outcome: work.OutcomeNoChangeNeeded,
			Summary: adapterName + " run finished without opening a PR",
		})
	case errors.Is(ctxErr, errTerminated):
		// R2: an eviction should not need a person. `failed` is the sweeper's
		// own verdict for a pod that stopped renewing, and it is retryable by
		// construction — `stuck` would demand a human for a machine's doing.
		// Reporting it at all is the point: the Round reopens now instead of
		// fifteen minutes later, and it reopens knowing why.
		return resolved(harness.OutcomeReport{
			Outcome:       work.OutcomeFailed,
			Summary:       adapterName + " run was terminated mid-run (pod shutdown)",
			FailureReason: string(work.FailureInfraNode),
		})
	case ctxErr != nil:
		return resolved(harness.OutcomeReport{
			Outcome:       work.OutcomeStuck,
			Summary:       "run aborted (lease lost)",
			StuckReason:   "lease renewal failed; run cancelled to avoid a double claim",
			FailureReason: string(work.FailureLeaseLost),
		})
	default:
		// The run failed. A pre-existing PR is carried in Links for the
		// reviewer's convenience but must NOT read as this run's success.
		var links []string
		if prURL != "" {
			links = []string{prURL}
		}
		r := resolved(harness.OutcomeReport{
			Outcome:     work.OutcomeStuck,
			Summary:     adapterName + " run failed",
			StuckReason: tail(logTail, 2000),
			Links:       links,
		})
		r.FailureReason = string(work.FailureAgentError)
		return r
	}
}

func stuckReport(summary, reason string) harness.OutcomeReport {
	return harness.OutcomeReport{Outcome: work.OutcomeStuck, Summary: summary, StuckReason: reason}
}

// abortOnTermination cancels the run with errTerminated when the parent
// context goes away — the pod is being shut down. It is renewLoop's sibling:
// both watch for a reason to stop, and both name the reason, because the name
// is what decides whether the Round retries or a person gets called.
func abortOnTermination(parent, runCtx context.Context, cancel context.CancelCauseFunc,
	log *slog.Logger, workItemID, role string) {
	select {
	case <-parent.Done():
		log.Warn("termination signalled; aborting the harness and reporting",
			"work_item", workItemID, "role", role)
		cancel(errTerminated)
	case <-runCtx.Done():
	}
}

func renewLoop(ctx context.Context, cancel context.CancelCauseFunc, api *APIClient, token string, every time.Duration, log *slog.Logger) {
	if every < 5*time.Second {
		every = 5 * time.Second
	}
	t := time.NewTicker(every)
	defer t.Stop()
	strikes := 0
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			gone, err := api.Renew(token)
			switch {
			case gone:
				log.Error("lease no longer ours; cancelling run")
				cancel(errLeaseLost)
				return
			case err != nil:
				strikes++
				log.Warn("lease renewal failed", "strikes", strikes, "err", err)
				if strikes >= 3 {
					log.Error("renewal failed 3 times; cancelling run")
					cancel(errLeaseLost)
					return
				}
			default:
				strikes = 0
			}
		}
	}
}

// ModelList returns a singleton slice containing model (with common proxy
// prefixes stripped), or nil if empty. LiteLLM rejects '/' in a key's model
// scope, so the prefix the router uses must go.
func ModelList(model string) []string {
	if model == "" {
		return nil
	}
	for _, prefix := range []string{"litellm_proxy/", "openai/"} {
		if after, ok := strings.CutPrefix(model, prefix); ok {
			model = after
			break
		}
	}
	return []string{model}
}

func tail(b []byte, n int) string {
	if len(b) > n {
		b = b[len(b)-n:]
	}
	return string(b)
}
