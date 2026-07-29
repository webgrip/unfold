// ploeg-worker runs as the main container of an executor-spawned Job
// (docs/contracts/executor.md): it claims one work item from ploegd, drives
// a headless harness run via the adapter selected by PLOEG_HARNESS
// (design §5), and reports an OutcomeReport before exit. Empty-handed claim
// = exit 0 (backlog #49); ploeg owns retries via lease expiry, never the Job.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/webgrip/ploeg/pkg/litellm"
	"github.com/webgrip/ploeg/pkg/llmbroker"
	"github.com/webgrip/ploeg/pkg/worker"
)

var version = "0.0.0-dev"

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
	budget, _ := strconv.ParseFloat(os.Getenv("LITELLM_KEY_BUDGET"), 64)
	model := os.Getenv("LLM_MODEL")
	cfg := worker.Config{
		APIURL: requireEnv("PLOEG_API_URL"),
		Team:   requireEnv("PLOEG_TEAM"),
		// The repository is a property of the work item, resolved at ingest and
		// delivered on the claim (R11). These are only the fallback, so they
		// are NOT boot-required: requiring them would crash-loop a pod that was
		// about to be handed a perfectly good target. A run that ends up with
		// no target at all reports stuck after claiming (worker.resolveTarget)
		// rather than exiting and stranding the lease for the sweeper.
		RepoOwner:    os.Getenv("REPO_OWNER"),
		RepoName:     os.Getenv("REPO_NAME"),
		BaseBranch:   envOr("PLOEG_BASE_BRANCH", ""),
		TargetSource: envOr("PLOEG_TARGET_SOURCE", ""),
		ForgejoURL:   trimSlash(requireEnv("FORGEJO_URL")),
		// The credential is true for EVERY possible target, so it stays
		// boot-required: failing here costs no attempt and strands no lease.
		BuilderToken: requireEnv("AGENT_BUILDER_TOKEN"),
		WorkDir:      envOr("WORK_DIR", "/mnt/ci-shared"),

		LLMBaseURL: os.Getenv("LLM_BASE_URL"),
		LLMModel:   model,
		LLMModels:  worker.ModelList(model),
		KeyBudget:  budget,
		KeyTTL:     durationOr("LITELLM_KEY_DURATION", 4*time.Hour),
	}

	// The harness seam: fail fast on a misconfigured adapter BEFORE claiming.
	hc := worker.HarnessConfig{
		Name:           envOr("PLOEG_HARNESS", "openhands"),
		Entrypoint:     os.Getenv("PLOEG_HARNESS_ENTRYPOINT"),
		OutcomeFile:    os.Getenv("PLOEG_OUTCOME_FILE"),
		PermissionMode: os.Getenv("PLOEG_CLAUDE_PERMISSION_MODE"),
		ACP: worker.ACPConfig{
			Profile:        os.Getenv("PLOEG_ACP_PROFILE"),
			ConfigJSON:     os.Getenv("PLOEG_ACP_CONFIG_JSON"),
			PermissionMode: os.Getenv("PLOEG_ACP_PERMISSION_MODE"),
		},
	}
	if raw := os.Getenv("PLOEG_HARNESS_ARGS"); raw != "" {
		if err := json.Unmarshal([]byte(raw), &hc.Args); err != nil {
			return fmt.Errorf("PLOEG_HARNESS_ARGS must be a JSON string array: %w", err)
		}
	}
	if raw := os.Getenv("PLOEG_ACP_ARGV"); raw != "" {
		if err := json.Unmarshal([]byte(raw), &hc.ACP.Argv); err != nil {
			return fmt.Errorf("PLOEG_ACP_ARGV must be a JSON string array: %w", err)
		}
	}
	var err error
	if hc.ACP.PromptTimeout, err = durationEnv("PLOEG_ACP_PROMPT_TIMEOUT"); err != nil {
		return err
	}
	if hc.ACP.IdleTimeout, err = durationEnv("PLOEG_ACP_IDLE_TIMEOUT"); err != nil {
		return err
	}
	adapter, err := worker.NewAdapter(hc)
	if err != nil {
		return err
	}

	// The credential seam: LiteLLM per-run keys when the admin API is
	// configured, otherwise a static/BYO credential (empty = the harness
	// image authenticates itself).
	var broker llmbroker.Broker = llmbroker.Static{Key: os.Getenv("LLM_API_KEY")}
	if adminURL, masterKey := os.Getenv("LITELLM_ADMIN_URL"), os.Getenv("LITELLM_MASTER_KEY"); adminURL != "" && masterKey != "" {
		broker = llmbroker.NewLiteLLM(litellm.NewClient(adminURL, masterKey))
	}

	nodeName := os.Getenv("NODE_NAME")
	podUID := os.Getenv("POD_UID")
	log.Info("ploeg-worker starting", "version", version, "team", cfg.Team, "harness", hc.Name, "node", nodeName, "pod_uid", podUID)
	return worker.New(cfg, adapter, broker, log).Run()
}

func trimSlash(s string) string {
	for len(s) > 0 && s[len(s)-1] == '/' {
		s = s[:len(s)-1]
	}
	return s
}

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

func durationOr(key string, def time.Duration) time.Duration {
	if d, err := durationEnv(key); err == nil && d != 0 {
		return d
	}
	return def
}

// durationEnv parses an optional duration and reports a typo instead of
// swallowing it. Unlike durationOr, a bad value here is fatal: these are
// watchdog timeouts, and one that silently reverts to its default fires at the
// wrong moment and reads as an agent bug rather than a config error. Zero means
// unset — the adapter's own default applies.
func durationEnv(key string) (time.Duration, error) {
	v := os.Getenv(key)
	if v == "" {
		return 0, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return 0, fmt.Errorf("%s must be a Go duration such as 45m or 90s: %w", key, err)
	}
	return d, nil
}
