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
	ForgejoURL   string // in-cluster forge base (global today; Target carries an id, not a URL)
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

// Run claims one work item and drives it to a reported outcome. A nil
// claim (empty queue) is the empty-handed convention: exit 0 (backlog #49).
func (w *Worker) Run() error {
	claimed, err := w.API.Claim(w.Cfg.Team)
	if err != nil {
		return fmt.Errorf("claim: %w", err)
	}
	if claimed == nil {
		w.Log.Info("no claimable work item; exiting empty-handed")
		return nil
	}
	// Downward API identity for run forensics (VIK-597). Empty when not
	// running in-cluster (dev/test). Also passed via BaseEnv to the harness.
	nodeName := os.Getenv("NODE_NAME")
	podUID := os.Getenv("POD_UID")

	item := claimed.WorkItem
	branch := "agent/vik-" + item.ExternalID
	trace := litellm.Alias(claimed.RunToken)
	w.Log.Info("claimed work item", "id", item.ID, "external_id", item.ExternalID, "title", item.Title, "trace", trace, "harness", w.Adapter.Name(), "node", nodeName, "pod_uid", podUID)

	// Lease renewal at TTL/3; three consecutive failures (or a 404 = lease
	// stolen) cancel the run — another worker may own the item now.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
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

	// Resolve the repository BEFORE touching disk: a misconfigured run must
	// park itself without leaving a clone behind.
	ref, err := resolveTarget(w.Cfg, item, w.Log)
	if err != nil {
		return stuckReport("no repository for this work item", err.Error())
	}
	w.Log.Info("resolved work target", "repo", ref.Owner+"/"+ref.Name, "base", ref.BaseBranch, "route_rule", item.RouteRule)

	cloneDir := filepath.Join(w.Cfg.WorkDir, "vik-"+item.ExternalID)
	_ = os.RemoveAll(cloneDir)
	cloneURL, err := authURL(ref.ForgeURL, "agent-builder", w.Cfg.BuilderToken, ref.Owner, ref.Name)
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

	if err := w.API.Checkpoint(claimed.RunToken, work.Checkpoint{Phase: "branch_created", Branch: branch, NodeName: nodeName, PodUID: podUID}); err != nil {
		w.Log.Warn("checkpoint failed", "err", err)
	}

	spec := harness.TaskSpec{
		WorkItem: item,
		Repo:     ref,
		Branch:   branch,
		TraceID:  trace,
	}

	var logTail harness.TailBuffer
	model := w.Cfg.LLMModel
	if len(w.Cfg.LLMModels) > 0 {
		model = w.Cfg.LLMModels[0]
	}
	env := harness.RunEnv{
		RepoDir:    cloneDir,
		ScratchDir: os.TempDir(),
		Prompt:     ComposePrompt(spec),
		BaseEnv:    os.Environ(),
		LLM:        harness.LLMEnv{BaseURL: w.Cfg.LLMBaseURL, Model: model, TraceID: trace},
		Stdout:     io.MultiWriter(os.Stdout, &logTail),
		Stderr:     io.MultiWriter(os.Stderr, &logTail),
		Checkpoint: func(cp work.Checkpoint) {
			if err := w.API.Checkpoint(claimed.RunToken, cp); err != nil {
				w.Log.Warn("checkpoint failed", "err", err)
			}
		},
		Log: w.Log,
	}

	w.Log.Info("starting headless harness run", "harness", w.Adapter.Name(), "cwd", cloneDir)
	report, mintErr, runErr := runAgent(ctx, w.Log, w.Broker, w.Adapter, spec, env, llmbroker.MintRequest{
		RunToken:  claimed.RunToken,
		BudgetUSD: w.Cfg.KeyBudget,
		Models:    w.Cfg.LLMModels,
		TTL:       w.Cfg.KeyTTL,
	})
	if mintErr != nil {
		return stuckReport("failed to mint per-run LiteLLM key", mintErr.Error())
	}

	// The PR is the ground truth (git/forge state stays the durable medium).
	prURL, prErr := findPR(ref, w.Cfg.BuilderToken, branch)
	if prErr != nil {
		w.Log.Warn("PR lookup failed", "err", prErr)
	}
	return resolveOutcome(w.Adapter.Name(), report, runErr, ctx.Err(), prURL, item.Title, branch, logTail.Bytes(), w.Adapter.ExpectsLLM())
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
	return report, nil, runErr
}

// resolveOutcome is the orchestrator's outcome precedence (design §5):
// forge ground truth (PR found) always wins; then a valid structured
// harness report; then the exit-code heuristics. Usage from the harness
// report is preserved regardless of which branch decides.
//
// expectsLLM is true for LLM-driven adapters (openhands, claude-code) —
// used by the VIK-586 heuristic: zero telemetry from an LLM adapter maps
// to failed/infra_llm; zero telemetry from exec or nil usage keeps the
// default no_change_needed so exec-harness smoke runs do not burn attempts.
func resolveOutcome(adapterName string, report harness.OutcomeReport, runErr, ctxErr error,
	prURL, itemTitle, branch string, logTail []byte, expectsLLM bool) harness.OutcomeReport {

	resolved := func(r harness.OutcomeReport) harness.OutcomeReport {
		if r.Usage == nil {
			r.Usage = report.Usage
		}
		return r
	}
	switch {
	case prURL != "":
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
		// VIK-586: LLM adapter with zero spend → infra_llm failure.
		if report.Outcome == work.OutcomeFailed && expectsLLM && report.Usage != nil && report.Usage.CostUSD == 0 {
			report.FailureReason = string(work.FailureInfraLLM)
		}
		return report
	case runErr == nil:
		// nil Usage = no telemetry = UNKNOWN → keep no_change_needed (VIK-586).
		// Zero telemetry on an LLM adapter with exit 0 maps to failed/infra_llm.
		if expectsLLM && report.Usage != nil && report.Usage.CostUSD == 0 {
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
	case ctxErr != nil:
		return resolved(harness.OutcomeReport{
			Outcome:       work.OutcomeStuck,
			Summary:       "run aborted (lease lost)",
			StuckReason:   "lease renewal failed; run cancelled to avoid a double claim",
			FailureReason: string(work.FailureLeaseLost),
		})
	default:
		r := resolved(harness.OutcomeReport{
			Outcome:     work.OutcomeStuck,
			Summary:     adapterName + " run failed",
			StuckReason: tail(logTail, 2000),
		})
		r.FailureReason = string(work.FailureAgentError)
		return r
	}
}

func stuckReport(summary, reason string) harness.OutcomeReport {
	return harness.OutcomeReport{Outcome: work.OutcomeStuck, Summary: summary, StuckReason: reason}
}

func renewLoop(ctx context.Context, cancel context.CancelFunc, api *APIClient, token string, every time.Duration, log *slog.Logger) {
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
				cancel()
				return
			case err != nil:
				strikes++
				log.Warn("lease renewal failed", "strikes", strikes, "err", err)
				if strikes >= 3 {
					log.Error("renewal failed 3 times; cancelling run")
					cancel()
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
