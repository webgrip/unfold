package claudecode

import (
	"bytes"
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/webgrip/ploeg/pkg/harness"
	"github.com/webgrip/ploeg/pkg/harness/harnesstest"
)

func TestConformance(t *testing.T) {
	harnesstest.Run(t, harnesstest.Fixture{
		NewAdapter: func(_ *testing.T, bin string) harness.CommandAdapter { return New(bin, "") },
	})
}

func testEnv() harness.RunEnv {
	return harness.RunEnv{
		ScratchDir: "/tmp",
		Prompt:     "# Ticket VIK-596\n",
		LLM: harness.LLMEnv{
			APIKey:  "sk-minted",
			BaseURL: "http://litellm.ai.svc.cluster.local:4000/v1",
			Model:   "claude-sonnet-5",
			TraceID: "ploeg-1cd43e1dfd6c",
		},
		Log: slog.New(slog.DiscardHandler),
	}
}

func TestPrepare_ArgvAndEnvMapping(t *testing.T) {
	inv, err := New("", "").Prepare(harness.TaskSpec{}, testEnv())
	if err != nil {
		t.Fatal(err)
	}
	want := []string{DefaultBin, "-p", "# Ticket VIK-596\n", "--output-format", "json", "--permission-mode", DefaultPermissionMode,
		"--settings", `{"disableAllHooks":true}`, "--strict-mcp-config"}
	if !slices.Equal(inv.Argv, want) {
		t.Errorf("argv = %v, want %v", inv.Argv, want)
	}
	if !inv.CaptureStdout {
		t.Error("claude-code must capture stdout for the JSON envelope")
	}
	for _, kv := range []string{
		"ANTHROPIC_API_KEY=sk-minted",
		// /v1 stripped: the Anthropic SDK appends /v1/... itself.
		"ANTHROPIC_BASE_URL=http://litellm.ai.svc.cluster.local:4000",
		"ANTHROPIC_MODEL=claude-sonnet-5",
	} {
		if !slices.Contains(inv.ExtraEnv, kv) {
			t.Errorf("missing env %q in %v", kv, inv.ExtraEnv)
		}
	}
}

func TestPrepare_TargetRepositoryHooksAndMCPServersNeverRun(t *testing.T) {
	for _, a := range []*Adapter{New("", ""), New("claude-custom", "acceptEdits")} {
		inv, err := a.Prepare(harness.TaskSpec{}, testEnv())
		if err != nil {
			t.Fatal(err)
		}
		i := slices.Index(inv.Argv, "--settings")
		if i < 0 || i+1 >= len(inv.Argv) || inv.Argv[i+1] != `{"disableAllHooks":true}` {
			t.Errorf("argv does not disable hooks with one --settings JSON element: %q", inv.Argv)
		}
		if !slices.Contains(inv.Argv, "--strict-mcp-config") {
			t.Errorf("argv lets the target's .mcp.json servers start: %q", inv.Argv)
		}
		if slices.Contains(inv.Argv, "--mcp-config") {
			t.Errorf("argv names an MCP config, so --strict-mcp-config would load servers: %q", inv.Argv)
		}
	}
}

func TestRun_FakeClaudeOnPathIsToldToSkipTargetHooksAndMCPServers(t *testing.T) {
	fakeDir := t.TempDir()
	record := filepath.Join(t.TempDir(), "argv")
	fake := "#!/bin/sh\n" +
		"pwd >'" + record + ".cwd'\n" +
		`printf '%s\0' "$@" >'` + record + "'\n" +
		`printf '%s\n' '{"type":"result","subtype":"success","result":"ok","session_id":"fake-claude"}'` + "\n"
	if err := os.WriteFile(filepath.Join(fakeDir, DefaultBin), []byte(fake), 0o755); err != nil {
		t.Fatal(err)
	}
	path := fakeDir + string(os.PathListSeparator) + os.Getenv("PATH")
	t.Setenv("PATH", path)

	repo := t.TempDir()
	marker := filepath.Join(t.TempDir(), "target-code-ran")
	for name, body := range map[string]string{
		filepath.Join(".claude", "settings.json"): `{"enableAllProjectMcpServers":true,"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"touch ` + marker + `"}]}]}}`,
		".mcp.json": `{"mcpServers":{"target":{"command":"sh","args":["-c","touch ` + marker + `"]}}}`,
	} {
		if err := os.MkdirAll(filepath.Join(repo, filepath.Dir(name)), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(repo, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	env := testEnv()
	env.RepoDir = repo
	env.ScratchDir = t.TempDir()
	env.BaseEnv = []string{"PATH=" + path, "HOME=" + t.TempDir()}
	report, err := harness.RunCommand(New("", "")).Run(context.Background(), harness.TaskSpec{TraceID: "ploeg-1cd43e1dfd6c"}, env)
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if report.Usage == nil || report.Usage.SessionID != "fake-claude" {
		t.Fatalf("the fake claude on PATH did not produce this report: %+v", report)
	}

	raw, err := os.ReadFile(record)
	if err != nil {
		t.Fatalf("the fake claude did not record its argv: %v", err)
	}
	argv := strings.Split(strings.TrimSuffix(string(raw), "\x00"), "\x00")
	i := slices.Index(argv, "--settings")
	if i < 0 || i+1 >= len(argv) || argv[i+1] != `{"disableAllHooks":true}` {
		t.Errorf(`claude did not receive --settings '{"disableAllHooks":true}' as one argument: %q`, argv)
	}
	if !slices.Contains(argv, "--strict-mcp-config") {
		t.Errorf("claude did not receive --strict-mcp-config, so the target's .mcp.json servers would start: %q", argv)
	}
	if slices.Contains(argv, "--mcp-config") {
		t.Errorf("claude received an --mcp-config, so --strict-mcp-config would still load servers: %q", argv)
	}
	cwd, err := os.ReadFile(record + ".cwd")
	if err != nil {
		t.Fatal(err)
	}
	wantCwd, err := filepath.EvalSymlinks(repo)
	if err != nil {
		t.Fatal(err)
	}
	if got := string(bytes.TrimSpace(cwd)); got != wantCwd {
		t.Errorf("claude ran in %q, want the target clone %q", got, wantCwd)
	}
	if _, err := os.Stat(marker); err == nil {
		t.Error("target repository code ran during the run")
	}
}

func TestPrepare_NoKeyNoEnv(t *testing.T) {
	env := testEnv()
	env.LLM = harness.LLMEnv{}
	inv, err := New("claude-custom", "acceptEdits").Prepare(harness.TaskSpec{}, env)
	if err != nil {
		t.Fatal(err)
	}
	// Narrowed to what the rule actually is: absent LLM wiring means no
	// ANTHROPIC_* is invented. The drop box (ADR-0018) is unconditional — a
	// reading Run returns its findings whether or not a key was minted.
	for _, kv := range inv.ExtraEnv {
		if strings.HasPrefix(kv, "ANTHROPIC_") {
			t.Errorf("no LLM wiring should mean no ANTHROPIC_* env, got %q", kv)
		}
	}
	if !slices.ContainsFunc(inv.ExtraEnv, func(kv string) bool {
		return strings.HasPrefix(kv, harness.DropBoxEnv+"=")
	}) {
		t.Errorf("every run must be told where its drop box is, got %v", inv.ExtraEnv)
	}
	if inv.Argv[0] != "claude-custom" {
		t.Errorf("bin override ignored: %v", inv.Argv)
	}
	if !slices.Contains(inv.Argv, "acceptEdits") {
		t.Errorf("permission mode override ignored: %v", inv.Argv)
	}
}

func TestParseOutcome_MapsEnvelopeToUsage(t *testing.T) {
	envelope := `{"type":"result","subtype":"success","is_error":false,"result":"done",` +
		`"session_id":"sess-42","total_cost_usd":1.23,"usage":{"input_tokens":1000,"output_tokens":250}}`
	report, err := New("", "").ParseOutcome(harness.TaskSpec{}, harness.ExecResult{Stdout: []byte(envelope)})
	if err != nil {
		t.Fatal(err)
	}
	if report.Outcome != "" {
		t.Errorf("claude-code must not claim an outcome (forge poll is authoritative), got %q", report.Outcome)
	}
	u := report.Usage
	if u == nil || u.CostUSD != 1.23 || u.SessionID != "sess-42" || u.InputTokens != 1000 || u.OutputTokens != 250 {
		t.Errorf("usage = %+v", u)
	}
}

func TestParseOutcome_GarbageIsAnError(t *testing.T) {
	if _, err := New("", "").ParseOutcome(harness.TaskSpec{}, harness.ExecResult{Stdout: []byte("panic: boom")}); err == nil {
		t.Fatal("non-JSON stdout must be a parse error (downgraded to no-signal by RunCommand)")
	}
}

func TestParseOutcome_EmptyStdoutNoSignal(t *testing.T) {
	report, err := New("", "").ParseOutcome(harness.TaskSpec{}, harness.ExecResult{})
	if err != nil {
		t.Fatal(err)
	}
	if report.Outcome != "" || report.Usage != nil {
		t.Errorf("expected zero-value report, got %+v", report)
	}
}
