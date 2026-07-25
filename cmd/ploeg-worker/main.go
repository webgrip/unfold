// ploeg-worker is the OpenHands harness adapter (design §5): it runs as the
// main container of a KEDA-spawned Job, claims one work item from ploegd,
// drives a headless OpenHands run via the agent-runner entrypoint, and
// reports an OutcomeReport before exit. Empty-handed claim = exit 0
// (backlog #49); ploeg owns retries via lease expiry, never the Job.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/webgrip/ploeg/pkg/work"
)

var version = "0.0.0-dev"

type config struct {
	APIURL       string // ploegd base URL
	Team         string
	RepoOwner    string
	RepoName     string
	BaseBranch   string // branch to clone/branch from and open the PR against; empty = repo default branch (VIK-589)
	ForgejoURL   string // in-cluster forge base, e.g. http://forgejo-http.forgejo.svc.cluster.local:3000
	BuilderToken string // agent-builder bot token
	WorkDir      string
	Entrypoint   string // the agent-runner image's baked entrypoint
}

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))

	// `ploeg-worker install <dst>`: self-copy out of the distroless ploegd
	// image (no shell, so an initContainer cannot `cp`).
	if len(os.Args) >= 3 && os.Args[1] == "install" {
		if err := installSelf(os.Args[2]); err != nil {
			log.Error("install failed", "dst", os.Args[2], "err", err)
			os.Exit(1)
		}
		return
	}

	if err := run(log); err != nil {
		log.Error("ploeg-worker exiting", "err", err)
		os.Exit(1)
	}
}

func installSelf(dst string) error {
	src, err := os.Open("/proc/self/exe")
	if err != nil {
		return err
	}
	defer src.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, src); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func run(log *slog.Logger) error {
	cfg := config{
		APIURL:       requireEnv("PLOEG_API_URL"),
		Team:         requireEnv("PLOEG_TEAM"),
		RepoOwner:    requireEnv("REPO_OWNER"),
		RepoName:     requireEnv("REPO_NAME"),
		BaseBranch:   envOr("PLOEG_BASE_BRANCH", ""),
		ForgejoURL:   strings.TrimRight(requireEnv("FORGEJO_URL"), "/"),
		BuilderToken: requireEnv("AGENT_BUILDER_TOKEN"),
		WorkDir:      envOr("WORK_DIR", "/mnt/ci-shared"),
		Entrypoint:   envOr("PLOEG_HARNESS_ENTRYPOINT", "docker-entrypoint.sh"),
	}
	log.Info("ploeg-worker starting", "version", version, "team", cfg.Team)

	api := &apiClient{base: strings.TrimRight(cfg.APIURL, "/"), hc: &http.Client{Timeout: 30 * time.Second}}

	claimed, err := api.claim(cfg.Team)
	if err != nil {
		return fmt.Errorf("claim: %w", err)
	}
	if claimed == nil {
		log.Info("no claimable work item; exiting empty-handed")
		return nil
	}
	item := claimed.WorkItem
	branch := "agent/vik-" + item.ExternalID
	trace := "ploeg-" + claimed.RunToken[:12]
	log.Info("claimed work item", "id", item.ID, "external_id", item.ExternalID, "title", item.Title, "trace", trace)

	// Lease renewal at TTL/3; three consecutive failures (or a 404 = lease
	// stolen) cancel the run — another worker may own the item now.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ttl := time.Until(claimed.Deadline)
	if ttl <= 0 {
		ttl = time.Minute
	}
	go renewLoop(ctx, cancel, api, claimed.RunToken, ttl/3, log)

	// From here on, every terminal path must report an outcome; failing to
	// report leaves the lease to the sweeper (recorded failed/lease expired).
	outcome, summary, stuckReason, links, cp := execute(ctx, log, cfg, api, claimed, branch, trace)
	// Log before reporting: if the POST fails, the pod log is the only place
	// the run's actual result (and a stuck reason) survives.
	log.Info("run finished", "outcome", outcome, "summary", summary, "stuck_reason", stuckReason, "links", links)
	if cp != nil {
		if err := api.checkpoint(claimed.RunToken, *cp); err != nil {
			log.Warn("final checkpoint failed", "err", err)
		}
	}
	if err := api.outcome(claimed.RunToken, outcome, summary, stuckReason, links); err != nil {
		return fmt.Errorf("outcome report failed (lease left to the sweeper): %w", err)
	}
	log.Info("outcome reported", "outcome", outcome, "summary", summary, "links", links)
	return nil
}

// execute runs clone -> task.md -> OpenHands -> PR detection and returns the
// outcome to report. It never returns an error: every failure maps to an
// outcome (stuck carries the mandatory reason, R4).
func execute(ctx context.Context, log *slog.Logger, cfg config, api *apiClient, claimed *claimResponse, branch, trace string) (work.Outcome, string, string, []string, *work.Checkpoint) {
	item := claimed.WorkItem

	cloneDir := filepath.Join(cfg.WorkDir, "vik-"+item.ExternalID)
	_ = os.RemoveAll(cloneDir)
	cloneURL, err := authURL(cfg.ForgejoURL, "agent-builder", cfg.BuilderToken, cfg.RepoOwner, cfg.RepoName)
	if err != nil {
		return work.OutcomeStuck, "invalid forge URL", err.Error(), nil, nil
	}
	if out, err := runCmd(ctx, "", "git", cloneArgs(cfg, cloneURL, cloneDir)...); err != nil {
		return work.OutcomeStuck, "git clone failed", tail(out, 2000), nil, nil
	}
	for _, kv := range [][2]string{{"user.name", "agent-builder"}, {"user.email", "agent-builder@webgrip.dev"}} {
		if out, err := runCmd(ctx, cloneDir, "git", "config", kv[0], kv[1]); err != nil {
			return work.OutcomeStuck, "git config failed", tail(out, 2000), nil, nil
		}
	}

	if err := api.checkpoint(claimed.RunToken, work.Checkpoint{Phase: "branch_created", Branch: branch}); err != nil {
		log.Warn("checkpoint failed", "err", err)
	}

	taskPath := "/tmp/task.md"
	if err := os.WriteFile(taskPath, []byte(composeTask(item, cfg, branch, trace)), 0o644); err != nil {
		return work.OutcomeStuck, "task compose failed", err.Error(), nil, nil
	}

	// The agent-runner entrypoint (>=1.0.1) mints the per-run budgeted
	// LiteLLM key (key_alias = trace id), sets LLM_EXTRA_HEADERS, waits for
	// the DinD daemon, and revokes the key on exit.
	log.Info("starting headless OpenHands run", "task", taskPath, "cwd", cloneDir)
	agent := exec.CommandContext(ctx, cfg.Entrypoint, "--headless", "-f", taskPath)
	agent.Dir = cloneDir
	agent.Env = append(os.Environ(), "LLM_TRACE_ID="+trace)
	var logTail tailBuffer
	agent.Stdout = io.MultiWriter(os.Stdout, &logTail)
	agent.Stderr = io.MultiWriter(os.Stderr, &logTail)
	agentErr := agent.Run()

	// The PR is the ground truth (git/forge state stays the durable medium).
	prURL, prErr := findPR(cfg, branch)
	if prErr != nil {
		log.Warn("PR lookup failed", "err", prErr)
	}
	switch {
	case prURL != "":
		cp := &work.Checkpoint{Phase: "pr_opened", Branch: branch, PRURL: prURL}
		return work.OutcomePROpened, "OpenHands run opened a PR for " + item.Title, "", []string{prURL}, cp
	case agentErr == nil:
		return work.OutcomeNoChangeNeeded, "OpenHands run finished without opening a PR", "", nil, nil
	case ctx.Err() != nil:
		return work.OutcomeStuck, "run aborted (lease lost)", "lease renewal failed; run cancelled to avoid a double claim", nil, nil
	default:
		return work.OutcomeStuck, "OpenHands run failed", tail(logTail.Bytes(), 2000), nil, nil
	}
}

// cloneArgs builds the git clone invocation: a configured base branch is
// cloned explicitly; unset means the repo's default branch — which may be a
// stale stub, so teams should pin baseBranch (VIK-589).
func cloneArgs(cfg config, cloneURL, cloneDir string) []string {
	args := []string{"clone", "--depth", "50"}
	if cfg.BaseBranch != "" {
		args = append(args, "--branch", cfg.BaseBranch)
	}
	return append(args, cloneURL, cloneDir)
}

// composeTask renders the task prompt: the ticket plus the dark-factory
// delivery contract (mirrors erfbeeld's agent-run.yml build-mode prompt).
func composeTask(item work.WorkItem, cfg config, branch, trace string) string {
	// Historical default: before baseBranch existed the contract said "main".
	// The clone above used the repo default branch in that case, so keeping
	// "main" only preserves behavior for repos where the two coincide.
	base := cfg.BaseBranch
	if base == "" {
		base = "main"
	}
	var b strings.Builder
	fmt.Fprintf(&b, "# Ticket VIK-%s: %s\n\n", item.ExternalID, item.Title)
	if item.Description != "" {
		fmt.Fprintf(&b, "## Ticket description\n\n%s\n\n", item.Description)
	}
	fmt.Fprintf(&b, `## Delivery contract

- Work on a branch named %[1]s created from %[7]s. NEVER commit to %[7]s.
- Follow AGENTS.md and the repository skills.
- Run the repository's quality gates via docker run against the CI images before opening the PR.
- Every commit message ends with the trailers:
  VIK-%[2]s
  Agent-Trace-Id: %[3]s
- When the work is complete: push the branch and open a pull request with base
  branch %[7]s via the Forgejo API (%[4]s/api/v1/repos/%[5]s/%[6]s/pulls)
  authenticated as agent-builder. Put "VIK-%[2]s" in the PR body.
- Do NOT merge the pull request. A human merges.
- If the ticket cannot be completed, explain why on stderr and exit non-zero.
`, branch, item.ExternalID, trace, cfg.ForgejoURL, cfg.RepoOwner, cfg.RepoName, base)
	return b.String()
}

// prMatches reports whether an open PR is the one this run created: the head
// branch must match, and when a base branch is configured the PR must target
// it — an agent opening the PR against the wrong base is not "done" (VIK-589).
func prMatches(headRef, baseRef, wantHead, wantBase string) bool {
	if headRef != wantHead {
		return false
	}
	return wantBase == "" || baseRef == wantBase
}

// findPR returns the html_url of an open PR whose head branch matches (and
// whose base matches cfg.BaseBranch when configured).
func findPR(cfg config, branch string) (string, error) {
	req, err := http.NewRequest("GET",
		fmt.Sprintf("%s/api/v1/repos/%s/%s/pulls?state=open&limit=50", cfg.ForgejoURL, cfg.RepoOwner, cfg.RepoName), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "token "+cfg.BuilderToken)
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("pulls list: HTTP %d", resp.StatusCode)
	}
	var pulls []struct {
		HTMLURL string `json:"html_url"`
		Head    struct {
			Ref string `json:"ref"`
		} `json:"head"`
		Base struct {
			Ref string `json:"ref"`
		} `json:"base"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&pulls); err != nil {
		return "", err
	}
	for _, p := range pulls {
		if prMatches(p.Head.Ref, p.Base.Ref, branch, cfg.BaseBranch) {
			return p.HTMLURL, nil
		}
	}
	return "", nil
}

func renewLoop(ctx context.Context, cancel context.CancelFunc, api *apiClient, token string, every time.Duration, log *slog.Logger) {
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
			gone, err := api.renew(token)
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

// --- ploegd API client ---

type apiClient struct {
	base string
	hc   *http.Client
}

type claimResponse struct {
	RunToken string        `json:"runToken"`
	Deadline time.Time     `json:"deadline"`
	WorkItem work.WorkItem `json:"workItem"`
}

func (a *apiClient) claim(team string) (*claimResponse, error) {
	body, _ := json.Marshal(map[string]string{"team": team})
	resp, err := a.hc.Post(a.base+"/api/v1/claim", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusNoContent:
		return nil, nil
	case http.StatusOK:
		var c claimResponse
		if err := json.NewDecoder(resp.Body).Decode(&c); err != nil {
			return nil, err
		}
		return &c, nil
	default:
		return nil, fmt.Errorf("claim: HTTP %d", resp.StatusCode)
	}
}

// renew returns gone=true when the lease is not ours anymore (404).
func (a *apiClient) renew(token string) (bool, error) {
	resp, err := a.hc.Post(a.base+"/api/v1/runs/"+token+"/renew", "application/json", nil)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK:
		return false, nil
	case http.StatusNotFound:
		return true, nil
	default:
		return false, fmt.Errorf("renew: HTTP %d", resp.StatusCode)
	}
}

func (a *apiClient) checkpoint(token string, cp work.Checkpoint) error {
	return a.post("/api/v1/runs/"+token+"/checkpoint", cp)
}

func (a *apiClient) outcome(token string, outcome work.Outcome, summary, stuckReason string, links []string) error {
	return a.post("/api/v1/runs/"+token+"/outcome", map[string]any{
		"outcome": outcome, "summary": summary, "stuckReason": stuckReason, "links": links,
	})
}

func (a *apiClient) post(path string, v any) error {
	body, err := json.Marshal(v)
	if err != nil {
		return err
	}
	resp, err := a.hc.Post(a.base+path, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("%s: HTTP %d: %s", path, resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	return nil
}

// --- helpers ---

func authURL(base, user, token, owner, repo string) (string, error) {
	u, err := url.Parse(base)
	if err != nil {
		return "", err
	}
	u.User = url.UserPassword(user, token)
	u.Path = "/" + owner + "/" + repo + ".git"
	return u.String(), nil
}

func runCmd(ctx context.Context, dir, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	return cmd.CombinedOutput()
}

func tail(b []byte, n int) string {
	if len(b) > n {
		b = b[len(b)-n:]
	}
	return string(b)
}

// tailBuffer keeps the last 8KiB written, enough for a stuck reason.
type tailBuffer struct{ buf []byte }

func (t *tailBuffer) Write(p []byte) (int, error) {
	t.buf = append(t.buf, p...)
	if len(t.buf) > 8192 {
		t.buf = t.buf[len(t.buf)-8192:]
	}
	return len(p), nil
}
func (t *tailBuffer) Bytes() []byte { return t.buf }

func requireEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		fmt.Fprintf(os.Stderr, "%s is required\n", key)
		os.Exit(1)
	}
	return v
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
