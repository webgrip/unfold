// Package claudecode adapts the Claude Code CLI (backlog #62): a headless
// `claude -p` run with a JSON result envelope mapped into OutcomeReport
// usage (cost, tokens, session id). The run outcome itself still comes from
// the orchestrator's forge poll — Claude does not know whether its PR landed.
package claudecode

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/webgrip/ploeg/pkg/harness"
)

const (
	// DefaultBin is the Claude Code CLI binary; override via
	// PLOEG_HARNESS_ENTRYPOINT for images that bake it elsewhere.
	DefaultBin = "claude"
	// DefaultPermissionMode: the worker pod is a disposable, credential-
	// scoped sandbox (design §6) — prompting is impossible in headless mode,
	// so permissions are bypassed. Backlog #62 tracks a policy-driven mode.
	DefaultPermissionMode = "bypassPermissions"
)

type Adapter struct {
	Bin            string // empty = DefaultBin
	PermissionMode string // empty = DefaultPermissionMode
}

func New(bin, permissionMode string) *Adapter {
	return &Adapter{Bin: bin, PermissionMode: permissionMode}
}

func (a *Adapter) Name() string     { return "claude-code" }
func (a *Adapter) ExpectsLLM() bool { return true }

func (a *Adapter) Prepare(spec harness.TaskSpec, env harness.RunEnv) (harness.Invocation, error) {
	bin := a.Bin
	if bin == "" {
		bin = DefaultBin
	}
	mode := a.PermissionMode
	if mode == "" {
		mode = DefaultPermissionMode
	}

	extraEnv := []string{}
	if env.LLM.APIKey != "" {
		extraEnv = append(extraEnv, "ANTHROPIC_API_KEY="+env.LLM.APIKey)
	}
	if env.LLM.BaseURL != "" {
		// The Anthropic SDK appends /v1/... itself; LiteLLM's Anthropic
		// passthrough therefore wants the proxy root, not the /v1 OpenAI base.
		extraEnv = append(extraEnv, "ANTHROPIC_BASE_URL="+strings.TrimSuffix(env.LLM.BaseURL, "/v1"))
	}
	if env.LLM.Model != "" {
		extraEnv = append(extraEnv, "ANTHROPIC_MODEL="+env.LLM.Model)
	}

	// The drop box (ADR-0018). Claude Code's result envelope carries usage and
	// prose, nothing structured about the review — so a reading Run returns its
	// findings and verdict the same way it does on every other harness, through
	// the file PLOEG_OUTCOME_FILE names.
	outcomePath := harness.DropBoxPath(env.ScratchDir, spec.TraceID)
	_ = os.Remove(outcomePath) // never inherit a previous run's report

	return harness.Invocation{
		Argv: []string{bin, "-p", env.Prompt,
			"--output-format", "json",
			"--permission-mode", mode,
		},
		ExtraEnv:      append(extraEnv, harness.DropBoxEnv+"="+outcomePath),
		OutcomeFile:   outcomePath,
		CaptureStdout: true, // the JSON result envelope arrives on stdout
	}, nil
}

// resultEnvelope is the subset of Claude Code's --output-format json
// envelope we consume.
type resultEnvelope struct {
	Type         string  `json:"type"`
	Subtype      string  `json:"subtype"`
	IsError      bool    `json:"is_error"`
	Result       string  `json:"result"`
	SessionID    string  `json:"session_id"`
	TotalCostUSD float64 `json:"total_cost_usd"`
	Usage        struct {
		InputTokens  int64 `json:"input_tokens"`
		OutputTokens int64 `json:"output_tokens"`
	} `json:"usage"`
}

// ParseOutcome combines the two channels Claude Code gives us.
//
// The stdout envelope owns usage (cost, tokens, session id) and asserts no
// outcome — the forge poll and the orchestrator's exit-code heuristics stay
// authoritative for whether a PR landed, because Claude does not know. The
// drop box owns whatever the agent chose to report about itself, which for a
// reading Run is the review and the verdict.
//
// A malformed envelope must not cost us the review, so the drop box is read
// first and returned even when the envelope fails to decode.
func (a *Adapter) ParseOutcome(_ harness.TaskSpec, res harness.ExecResult) (harness.OutcomeReport, error) {
	box, err := harness.ReadDropBox(res.OutcomeFile)
	if err != nil {
		return harness.OutcomeReport{}, err
	}
	if len(res.Stdout) == 0 {
		return box, nil
	}
	var env resultEnvelope
	if err := json.Unmarshal(res.Stdout, &env); err != nil {
		return box, fmt.Errorf("decode claude result envelope: %w", err)
	}
	if env.Type != "result" {
		return box, nil
	}
	return harness.MergeDropBox(harness.OutcomeReport{
		Usage: &harness.Usage{
			InputTokens:  env.Usage.InputTokens,
			OutputTokens: env.Usage.OutputTokens,
			CostUSD:      env.TotalCostUSD,
			SessionID:    env.SessionID,
		},
	}, box), nil
}
