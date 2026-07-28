package openhands

import (
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/webgrip/ploeg/pkg/harness"
	"github.com/webgrip/ploeg/pkg/harness/harnesstest"
)

func TestConformance(t *testing.T) {
	harnesstest.Run(t, harnesstest.Fixture{
		NewAdapter: func(_ *testing.T, bin string) harness.CommandAdapter { return New(bin) },
	})
}

func TestPrepare_WritesTaskFileAndArgv(t *testing.T) {
	env := harness.RunEnv{
		ScratchDir: t.TempDir(),
		Prompt:     "# Ticket VIK-585: fix the thing\n",
		Log:        slog.New(slog.DiscardHandler),
	}
	ad := New("/usr/local/bin/agent-entrypoint")
	inv, err := ad.Prepare(harness.TaskSpec{}, env)
	if err != nil {
		t.Fatal(err)
	}

	taskPath := filepath.Join(env.ScratchDir, "task.md")
	want := []string{"/usr/local/bin/agent-entrypoint", "--headless", "-f", taskPath}
	if len(inv.Argv) != len(want) {
		t.Fatalf("argv = %v, want %v", inv.Argv, want)
	}
	for i := range want {
		if inv.Argv[i] != want[i] {
			t.Fatalf("argv[%d] = %q, want %q", i, inv.Argv[i], want[i])
		}
	}

	b, err := os.ReadFile(taskPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != env.Prompt {
		t.Errorf("task.md = %q, want the prompt verbatim", b)
	}
	if len(inv.ExtraEnv) != 0 {
		t.Errorf("openhands must not add env (LLM_* passthrough is in BaseEnv): %v", inv.ExtraEnv)
	}
}

func TestPrepare_DefaultEntrypoint(t *testing.T) {
	env := harness.RunEnv{ScratchDir: t.TempDir(), Prompt: "x"}
	inv, err := New("").Prepare(harness.TaskSpec{}, env)
	if err != nil {
		t.Fatal(err)
	}
	if inv.Argv[0] != DefaultEntrypoint {
		t.Errorf("argv[0] = %q, want %q", inv.Argv[0], DefaultEntrypoint)
	}
}

func TestParseOutcome_AlwaysZeroValue(t *testing.T) {
	report, err := New("").ParseOutcome(harness.TaskSpec{}, harness.ExecResult{ExitCode: 3, LogTail: []byte("x")})
	if err != nil {
		t.Fatal(err)
	}
	if report.Outcome != "" || report.Summary != "" {
		t.Errorf("openhands must never claim a structured outcome, got %+v", report)
	}
	if !strings.Contains(DefaultEntrypoint, "docker-entrypoint") {
		t.Errorf("default entrypoint drifted: %q", DefaultEntrypoint)
	}
}
