// Package openhands adapts the OpenHands agent-runner image: the prompt is
// written to a task file and the image's baked entrypoint runs it headless.
// This is a verbatim extraction of the original ploeg-worker behavior.
package openhands

import (
	"os"
	"path/filepath"

	"github.com/webgrip/ploeg/pkg/harness"
)

// DefaultEntrypoint is the agent-runner image's baked entrypoint. The
// entrypoint (>=1.0.1) skips its own key mint when LLM_API_KEY is set.
const DefaultEntrypoint = "docker-entrypoint.sh"

type Adapter struct {
	// Entrypoint overrides the binary to exec (PLOEG_HARNESS_ENTRYPOINT);
	// empty = DefaultEntrypoint.
	Entrypoint string
}

func New(entrypoint string) *Adapter { return &Adapter{Entrypoint: entrypoint} }

func (a *Adapter) Name() string { return "openhands" }

func (a *Adapter) Prepare(_ harness.TaskSpec, env harness.RunEnv) (harness.Invocation, error) {
	taskPath := filepath.Join(env.ScratchDir, "task.md")
	if err := os.WriteFile(taskPath, []byte(env.Prompt), 0o644); err != nil {
		return harness.Invocation{}, err
	}
	entrypoint := a.Entrypoint
	if entrypoint == "" {
		entrypoint = DefaultEntrypoint
	}
	// LLM_* env (trace, key, base URL, model) is already in BaseEnv; the
	// OpenHands entrypoint reads it directly — nothing to translate.
	return harness.Invocation{Argv: []string{entrypoint, "--headless", "-f", taskPath}}, nil
}

// ParseOutcome always reports "no structured signal": OpenHands emits no
// machine-readable outcome, so the orchestrator's forge-poll and exit-code
// heuristics decide.
func (a *Adapter) ParseOutcome(harness.TaskSpec, harness.ExecResult) (harness.OutcomeReport, error) {
	return harness.OutcomeReport{}, nil
}
