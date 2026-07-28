package worker

import (
	"fmt"

	"github.com/webgrip/ploeg/pkg/harness"
	"github.com/webgrip/ploeg/pkg/harness/adapters/claudecode"
	"github.com/webgrip/ploeg/pkg/harness/adapters/execbin"
	"github.com/webgrip/ploeg/pkg/harness/adapters/openhands"
)

// HarnessConfig selects and configures the harness adapter for this worker
// (per-team via the Helm harness block → PLOEG_HARNESS* env).
type HarnessConfig struct {
	Name           string   // PLOEG_HARNESS: openhands (default) | exec | claude-code
	Entrypoint     string   // PLOEG_HARNESS_ENTRYPOINT: binary override (adapter default when empty)
	Args           []string // PLOEG_HARNESS_ARGS (JSON array): exec adapter argv template
	OutcomeFile    string   // PLOEG_OUTCOME_FILE: exec adapter outcome path override
	PermissionMode string   // PLOEG_CLAUDE_PERMISSION_MODE: claude-code only
}

// NewAdapter is the explicit adapter registry — a switch, not init-magic,
// matching the provider SPI's compile-time philosophy. An unknown name
// fails at worker startup, before anything is claimed.
func NewAdapter(hc HarnessConfig) (harness.Adapter, error) {
	switch hc.Name {
	case "", "openhands":
		return harness.RunCommand(openhands.New(hc.Entrypoint)), nil
	case "exec":
		a, err := execbin.New(hc.Args, hc.OutcomeFile)
		if err != nil {
			return nil, err
		}
		return harness.RunCommand(a), nil
	case "claude-code":
		return harness.RunCommand(claudecode.New(hc.Entrypoint, hc.PermissionMode)), nil
	default:
		return nil, fmt.Errorf("unknown harness %q (known: openhands, exec, claude-code)", hc.Name)
	}
}
