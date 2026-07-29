package acp

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/webgrip/ploeg/pkg/harness"
)

// A profile is how one adapter launches many agents.
//
// Three shapes were considered. Helm values alone are insufficient: the hard
// part is not argv, it is pointing each agent at the LiteLLM proxy, and goose
// wants a config.yaml where opencode wants a provider block — a FILE cannot be
// expressed as an argv template. The ACP registry JSON solves the easy half
// (launch commands) and none of the hard half, while adding a build-time
// network fetch and a staleness problem. So: a small explicit registry in Go
// with `custom` as the escape hatch, mirroring what this codebase already chose
// twice — worker.NewAdapter is "an explicit registry — a switch, not
// init-magic", and execbin is the generic escape hatch.
type Profile struct {
	Name string
	// Argv is the launch command. argv[0] may be overridden per team.
	Argv []string
	// Env translates Ploeg's neutral LLMEnv into the agent's native names.
	Env func(harness.LLMEnv) []string
	// Configure optionally writes an agent config file and returns the env
	// that points at it. ScratchDir is os.TempDir() and shared per process, so
	// every file it writes MUST be trace-id-suffixed.
	Configure func(spec harness.TaskSpec, env harness.RunEnv) ([]string, error)
}

// ProfileOverrides carries per-team Helm settings.
type ProfileOverrides struct {
	// Entrypoint replaces argv[0] (PLOEG_HARNESS_ENTRYPOINT), consistent with
	// the other three adapters.
	Entrypoint string
	// Argv replaces the whole command. Required for `custom`.
	Argv []string
	// ConfigJSON replaces a profile's generated config wholesale, so a
	// provider-block change does not need an image rebuild.
	ConfigJSON string
}

// Prepare resolves the launch command and environment for one run.
func (p Profile) Prepare(spec harness.TaskSpec, env harness.RunEnv) (argv []string, extraEnv []string, err error) {
	argv = append([]string{}, p.Argv...)
	if len(argv) == 0 {
		return nil, nil, fmt.Errorf("profile %q has no argv", p.Name)
	}
	if p.Env != nil {
		extraEnv = append(extraEnv, p.Env(env.LLM)...)
	}
	if p.Configure != nil {
		cfgEnv, cfgErr := p.Configure(spec, env)
		if cfgErr != nil {
			return nil, nil, cfgErr
		}
		extraEnv = append(extraEnv, cfgEnv...)
	}
	return argv, extraEnv, nil
}

// Lookup resolves a profile by name, applying per-team overrides. An unknown
// name is an error, never a silent fallback: worker.NewAdapter calls this
// before Claim, so a misconfigured team fails at startup instead of leasing a
// ticket it cannot work.
func Lookup(name string, o ProfileOverrides) (Profile, error) {
	var p Profile
	switch normalise(name) {
	case "opencode", "":
		p = opencodeProfile(o.ConfigJSON)
	case "custom":
		if len(o.Argv) == 0 {
			return Profile{}, fmt.Errorf("acp profile \"custom\" requires an explicit argv")
		}
		p = Profile{Name: "custom", Argv: o.Argv, Env: openAICompatEnv}
	default:
		return Profile{}, fmt.Errorf("unknown acp profile %q (known: opencode, custom)", name)
	}
	if len(o.Argv) > 0 {
		p.Argv = o.Argv
	}
	if o.Entrypoint != "" && len(p.Argv) > 0 {
		p.Argv[0] = o.Entrypoint
	}
	return p, nil
}

// opencodeProfile is the flagship. opencode has been stable since v1.0.0
// (2025-10-31), is MIT, and speaks ACP natively — the facts that made
// homelab-cluster ADR-0051 possible.
//
// The exact provider-config key names are the one thing here that must be
// verified against a real binary; that is what the //go:build manual probe is
// for. Until then PLOEG_ACP_CONFIG_JSON overrides the whole document without an
// image rebuild, so a key-name surprise is a values edit rather than a release.
func opencodeProfile(configJSON string) Profile {
	return Profile{
		Name: "opencode",
		Argv: []string{"opencode", "acp"},
		Env:  openAICompatEnv,
		Configure: func(spec harness.TaskSpec, env harness.RunEnv) ([]string, error) {
			doc := configJSON
			if doc == "" {
				var err error
				if doc, err = opencodeConfigDoc(env.LLM); err != nil {
					return nil, err
				}
			}
			path := filepath.Join(env.ScratchDir, "opencode-"+safeSuffix(spec.TraceID)+".json")
			if err := os.WriteFile(path, []byte(doc), 0o600); err != nil {
				return nil, fmt.Errorf("write opencode config: %w", err)
			}
			return []string{"OPENCODE_CONFIG=" + path}, nil
		},
	}
}

func opencodeConfigDoc(l harness.LLMEnv) (string, error) {
	model := l.Model
	if model == "" {
		model = "default"
	}
	cfg := map[string]any{
		"$schema": "https://opencode.ai/config.json",
		"provider": map[string]any{
			"litellm": map[string]any{
				"npm": "@ai-sdk/openai-compatible",
				"options": map[string]any{
					"baseURL": l.BaseURL,
					"apiKey":  l.APIKey,
				},
				"models": map[string]any{model: map[string]any{}},
			},
		},
		"model": "litellm/" + model,
	}
	b, err := json.MarshalIndent(cfg, "", "  ")
	return string(b), err
}

// openAICompatEnv is the lowest common denominator. Most agents read at least
// one of these, and the LLM_* names are already in BaseEnv for harnesses that
// read them directly.
func openAICompatEnv(l harness.LLMEnv) []string {
	var out []string
	if l.APIKey != "" {
		out = append(out, "OPENAI_API_KEY="+l.APIKey, "LLM_API_KEY="+l.APIKey)
	}
	if l.BaseURL != "" {
		out = append(out, "OPENAI_BASE_URL="+l.BaseURL, "LLM_BASE_URL="+l.BaseURL)
	}
	if l.Model != "" {
		out = append(out, "LLM_MODEL="+l.Model)
	}
	if l.TraceID != "" {
		out = append(out, "LLM_TRACE_ID="+l.TraceID)
	}
	return out
}

// safeSuffix keeps a trace id usable as a filename. ScratchDir is shared, so
// two concurrent runs must not collide on one config path.
func safeSuffix(s string) string {
	if s == "" {
		return "run"
	}
	return strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			return r
		default:
			return '-'
		}
	}, s)
}
