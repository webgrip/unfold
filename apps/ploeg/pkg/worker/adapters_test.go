package worker

import (
	"strings"
	"testing"
	"time"
)

// The registry's one safety property: a misconfigured harness fails HERE, at
// worker startup, and never after the worker has leased a ticket it cannot
// work. Every error case below would otherwise surface as a lease held by a
// pod that immediately dies — indistinguishable from an agent crash, and
// retried MaxAttempts times before anyone sees it.
func TestNewAdapter_RejectsMisconfiguration(t *testing.T) {
	for _, tc := range []struct {
		name    string
		hc      HarnessConfig
		wantErr string
	}{
		{"unknown harness", HarnessConfig{Name: "gemini"}, "unknown harness"},
		{"unknown acp profile", HarnessConfig{Name: "acp", ACP: ACPConfig{Profile: "goose"}}, "unknown acp profile"},
		{"custom profile without argv", HarnessConfig{Name: "acp", ACP: ACPConfig{Profile: "custom"}}, "requires an explicit argv"},
		{"unknown permission mode", HarnessConfig{Name: "acp", ACP: ACPConfig{PermissionMode: "yolo"}}, "unknown acp permission mode"},
		{"exec without argv", HarnessConfig{Name: "exec"}, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := NewAdapter(tc.hc)
			if err == nil {
				t.Fatal("expected an error at startup, got none")
			}
			if tc.wantErr != "" && !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("error %q does not mention %q", err, tc.wantErr)
			}
		})
	}
}

func TestNewAdapter_AcceptsValidConfigurations(t *testing.T) {
	for _, tc := range []struct {
		name     string
		hc       HarnessConfig
		wantName string
	}{
		{"default is openhands", HarnessConfig{}, "openhands"},
		{"openhands explicit", HarnessConfig{Name: "openhands"}, "openhands"},
		{"claude-code", HarnessConfig{Name: "claude-code"}, "claude-code"},
		{"acp defaults to opencode", HarnessConfig{Name: "acp"}, "acp"},
		{
			"acp custom with argv and timeouts",
			HarnessConfig{Name: "acp", ACP: ACPConfig{
				Profile:        "custom",
				Argv:           []string{"copilot", "--acp", "--stdio"},
				PermissionMode: "allow_read_only",
				PromptTimeout:  30 * time.Minute,
				IdleTimeout:    5 * time.Minute,
			}},
			"acp",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			a, err := NewAdapter(tc.hc)
			if err != nil {
				t.Fatalf("NewAdapter: %v", err)
			}
			if a.Name() != tc.wantName {
				t.Errorf("Name() = %q, want %q", a.Name(), tc.wantName)
			}
		})
	}
}
