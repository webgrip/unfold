package worker

import (
	"fmt"
	"time"

	"github.com/webgrip/ploeg/pkg/harness"
	"github.com/webgrip/ploeg/pkg/harness/adapters/acp"
	"github.com/webgrip/ploeg/pkg/harness/adapters/claudecode"
	"github.com/webgrip/ploeg/pkg/harness/adapters/execbin"
	"github.com/webgrip/ploeg/pkg/harness/adapters/openhands"
)

// HarnessConfig selects and configures the harness adapter for this worker
// (per-team via the Helm harness block → PLOEG_HARNESS* env).
type HarnessConfig struct {
	Name           string   // PLOEG_HARNESS: openhands (default) | exec | claude-code | acp
	Entrypoint     string   // PLOEG_HARNESS_ENTRYPOINT: binary override (adapter default when empty)
	Args           []string // PLOEG_HARNESS_ARGS (JSON array): exec adapter argv template
	OutcomeFile    string   // PLOEG_OUTCOME_FILE: exec adapter outcome path override
	PermissionMode string   // PLOEG_CLAUDE_PERMISSION_MODE: claude-code only
	ACP            ACPConfig
}

// ACPConfig configures the acp harness. Grouped rather than flattened into
// HarnessConfig because it carries six knobs where the other adapters carry
// one each — and because every one of them is a `PLOEG_ACP_*` env var, so the
// grouping mirrors the wire.
//
// NOTE: "ACP" here is Zed's Agent CLIENT Protocol (editor ↔ local coding
// agent, stdio JSON-RPC). It is unrelated to IBM's former Agent COMMUNICATION
// Protocol, which merged into A2A in 2025 and is archived. See ADR-0007.
type ACPConfig struct {
	Profile        string        // PLOEG_ACP_PROFILE: opencode (default) | custom
	Argv           []string      // PLOEG_ACP_ARGV (JSON array): whole command; required for profile=custom
	ConfigJSON     string        // PLOEG_ACP_CONFIG_JSON: replaces a profile's generated agent config
	PermissionMode string        // PLOEG_ACP_PERMISSION_MODE: allow_always (default) | allow_read_only | deny_all
	PromptTimeout  time.Duration // PLOEG_ACP_PROMPT_TIMEOUT: 0 = adapter default (45m)
	IdleTimeout    time.Duration // PLOEG_ACP_IDLE_TIMEOUT: 0 = adapter default (10m)
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
	case "acp":
		// Session-protocol adapter: implements harness.Adapter directly, so no
		// RunCommand lift. Profile resolution and permission-mode validation
		// both happen here, which is what keeps a misconfigured team failing at
		// startup rather than after it has leased a ticket it cannot work.
		mode, ok := acp.ParsePermissionMode(hc.ACP.PermissionMode)
		if !ok {
			return nil, fmt.Errorf("unknown acp permission mode %q (known: allow_always, allow_read_only, deny_all)", hc.ACP.PermissionMode)
		}
		return acp.New(hc.ACP.Profile, acp.ProfileOverrides{
			Entrypoint: hc.Entrypoint,
			Argv:       hc.ACP.Argv,
			ConfigJSON: hc.ACP.ConfigJSON,
		}, acp.Options{
			PermissionMode: mode,
			PromptTimeout:  hc.ACP.PromptTimeout,
			IdleTimeout:    hc.ACP.IdleTimeout,
		})
	default:
		return nil, fmt.Errorf("unknown harness %q (known: openhands, exec, claude-code, acp)", hc.Name)
	}
}
