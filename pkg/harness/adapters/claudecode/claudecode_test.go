package claudecode

import (
	"log/slog"
	"slices"
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
	want := []string{DefaultBin, "-p", "# Ticket VIK-596\n", "--output-format", "json", "--permission-mode", DefaultPermissionMode}
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

func TestPrepare_NoKeyNoEnv(t *testing.T) {
	env := testEnv()
	env.LLM = harness.LLMEnv{}
	inv, err := New("claude-custom", "acceptEdits").Prepare(harness.TaskSpec{}, env)
	if err != nil {
		t.Fatal(err)
	}
	if len(inv.ExtraEnv) != 0 {
		t.Errorf("no LLM wiring should mean no ANTHROPIC_* env, got %v", inv.ExtraEnv)
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
