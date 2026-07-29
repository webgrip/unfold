// Package harnesstest is the adapter conformance kernel (backlog #69):
// every adapter must satisfy these properties regardless of which harness it
// wraps. Adapter packages run it from their own tests.
//
// Two adapter shapes exist and both are covered. Spawn-and-wait adapters
// implement harness.CommandAdapter and are lifted by harness.RunCommand;
// session-protocol adapters (ACP, backlog #64) implement harness.Adapter
// directly. A Fixture supplies exactly one of them.
package harnesstest

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/webgrip/ploeg/pkg/harness"
	"github.com/webgrip/ploeg/pkg/work"
)

// Fixture wires the suite to one adapter implementation. Set exactly one of
// the two constructors.
type Fixture struct {
	// NewAdapter returns a spawn-and-wait adapter configured to exec the given
	// binary (a test script) as its harness process.
	NewAdapter func(t *testing.T, bin string) harness.CommandAdapter

	// NewSessionAdapter returns a session-protocol adapter configured to speak
	// its protocol to the given binary. Adapters that own their own process
	// lifecycle implement harness.Adapter and set this instead.
	NewSessionAdapter func(t *testing.T, bin string) harness.Adapter
}

// Run executes the conformance suite.
func Run(t *testing.T, fx Fixture) {
	if fx.NewAdapter == nil && fx.NewSessionAdapter == nil {
		t.Fatal("harnesstest.Fixture: set NewAdapter or NewSessionAdapter")
	}
	if fx.NewAdapter != nil && fx.NewSessionAdapter != nil {
		t.Fatal("harnesstest.Fixture: set exactly one constructor, not both")
	}
	t.Run("PrepareProducesRunnableInvocation", fx.prepareProducesRunnableInvocation)
	t.Run("SuccessWithoutStructuredOutput", fx.successWithoutStructuredOutput)
	t.Run("FailureNeverFabricatesAnOutcome", fx.failureNeverFabricatesAnOutcome)
	t.Run("StuckAlwaysCarriesAReason", fx.stuckAlwaysCarriesAReason)
	t.Run("FailureReasonIsValidOrEmpty", fx.failureReasonIsValidOrEmpty)
	t.Run("SurvivesGarbageOnStdout", fx.survivesGarbageOnStdout)
	t.Run("CancelKillsTheHarness", fx.cancelKillsTheHarness)
}

// adapter lifts whichever constructor the fixture supplied to harness.Adapter,
// so every property below is written once against one shape.
func (fx Fixture) adapter(t *testing.T, bin string) harness.Adapter {
	t.Helper()
	if fx.NewSessionAdapter != nil {
		return fx.NewSessionAdapter(t, bin)
	}
	return harness.RunCommand(fx.NewAdapter(t, bin))
}

func script(t *testing.T, body string) string {
	t.Helper()
	bin := filepath.Join(t.TempDir(), "harness.sh")
	if err := os.WriteFile(bin, []byte("#!/bin/sh\n"+body+"\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	return bin
}

func env(t *testing.T) harness.RunEnv {
	t.Helper()
	return harness.RunEnv{
		RepoDir:    t.TempDir(),
		ScratchDir: t.TempDir(),
		Prompt:     "# Ticket VIK-1: conformance\n\ndo the thing\n",
		BaseEnv:    os.Environ(),
		LLM:        harness.LLMEnv{APIKey: "sk-test", BaseURL: "http://litellm:4000/v1", Model: "test-model", TraceID: "ploeg-abc123def456"},
		Log:        slog.New(slog.DiscardHandler),
	}
}

func spec() harness.TaskSpec {
	return harness.TaskSpec{
		WorkItem: work.WorkItem{ID: "1", Provider: "vikunja", ExternalID: "1", Title: "conformance"},
		Repo:     harness.RepoRef{ForgeURL: "http://forge", Owner: "o", Name: "r"},
		Branch:   "agent/vik-1",
		TraceID:  "ploeg-abc123def456",
	}
}

// prepareProducesRunnableInvocation is CommandAdapter-only: a session adapter
// owns its own process lifecycle and exposes no Invocation to inspect.
func (fx Fixture) prepareProducesRunnableInvocation(t *testing.T) {
	if fx.NewAdapter == nil {
		t.Skip("session adapter: no Invocation to inspect")
	}
	bin := script(t, "exit 0")
	ad := fx.NewAdapter(t, bin)
	inv, err := ad.Prepare(spec(), env(t))
	if err != nil {
		t.Fatalf("Prepare: %v", err)
	}
	if len(inv.Argv) == 0 {
		t.Fatal("Prepare returned an empty argv")
	}
	for _, kv := range inv.ExtraEnv {
		if !strings.Contains(kv, "=") {
			t.Errorf("ExtraEnv entry %q is not KEY=VALUE shaped", kv)
		}
	}
}

func (fx Fixture) successWithoutStructuredOutput(t *testing.T) {
	report, err := fx.adapter(t, script(t, "exit 0")).Run(context.Background(), spec(), env(t))
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	// Zero-value ("no structured signal") or a valid outcome are both
	// conformant; an invalid non-zero outcome is not.
	if report.Outcome != "" && !report.Outcome.Valid() {
		t.Errorf("adapter reported an invalid outcome %q", report.Outcome)
	}
}

func (fx Fixture) failureNeverFabricatesAnOutcome(t *testing.T) {
	report, err := fx.adapter(t, script(t, "echo broke >&2; exit 9")).Run(context.Background(), spec(), env(t))
	if err == nil {
		t.Fatal("expected the exec error to surface")
	}
	// A failed process without structured output must not fabricate a
	// success outcome — the orchestrator's heuristics own that mapping.
	switch report.Outcome {
	case "", work.OutcomeStuck, work.OutcomeFailed:
	default:
		t.Errorf("failed run produced outcome %q", report.Outcome)
	}
}

// stuckAlwaysCarriesAReason enforces R4 at the source rather than only at the
// report API, where pkg/httpapi already 400s a reasonless stuck. An adapter
// that emits one turns a diagnosable park into an opaque one.
func (fx Fixture) stuckAlwaysCarriesAReason(t *testing.T) {
	for _, tc := range []struct{ name, body string }{
		{"clean exit", "exit 0"},
		{"failure", "echo broke >&2; exit 9"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			report, _ := fx.adapter(t, script(t, tc.body)).Run(context.Background(), spec(), env(t))
			if report.Outcome == work.OutcomeStuck && strings.TrimSpace(report.StuckReason) == "" {
				t.Error("adapter reported stuck with no stuckReason (R4)")
			}
		})
	}
}

// failureReasonIsValidOrEmpty keeps the taxonomy closed. An adapter may
// classify its own failure when it has structured evidence (an ACP stop
// reason), and pkg/worker's heuristics defer to it — so a typo here would
// silently defeat the orchestrator's classification instead of being caught.
func (fx Fixture) failureReasonIsValidOrEmpty(t *testing.T) {
	for _, tc := range []struct{ name, body string }{
		{"clean exit", "exit 0"},
		{"failure", "echo broke >&2; exit 9"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			report, _ := fx.adapter(t, script(t, tc.body)).Run(context.Background(), spec(), env(t))
			if fr := report.FailureReason; fr != "" && !work.FailureReason(fr).Valid() {
				t.Errorf("adapter set failureReason %q, which is not in the taxonomy", fr)
			}
		})
	}
}

// survivesGarbageOnStdout: a harness that prints a banner, a progress bar or a
// stray console.log must not crash the adapter or trick it into inventing an
// outcome. For a session adapter this is the protocol channel, so it is the
// difference between a wrong-subcommand misconfiguration surfacing as a clear
// infra failure and it surfacing as a panic.
func (fx Fixture) survivesGarbageOnStdout(t *testing.T) {
	body := `echo "not json {{{"; printf '\x00\xff binary\n'; echo '{"partial":'; exit 0`
	report, err := fx.adapter(t, script(t, body)).Run(context.Background(), spec(), env(t))
	if err != nil {
		t.Logf("run returned %v (acceptable: garbage may be a protocol error)", err)
	}
	if report.Outcome != "" && !report.Outcome.Valid() {
		t.Errorf("garbage on stdout produced an invalid outcome %q", report.Outcome)
	}
	if report.Outcome == work.OutcomePROpened || report.Outcome == work.OutcomePRUpdated {
		t.Errorf("garbage on stdout was read as %q — adapters never assert forge state", report.Outcome)
	}
}

func (fx Fixture) cancelKillsTheHarness(t *testing.T) {
	ad := fx.adapter(t, script(t, "exec sleep 30"))
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(100 * time.Millisecond); cancel() }()
	done := make(chan error, 1)
	started := time.Now()
	go func() {
		_, err := ad.Run(ctx, spec(), env(t))
		done <- err
	}()
	select {
	case err := <-done:
		if err == nil {
			t.Error("cancelled run returned no error")
		}
		// The 5s ceiling below is the bound; log the real number so a session
		// adapter's cancel handshake cannot quietly creep toward it.
		t.Logf("returned %v after cancellation", time.Since(started).Round(time.Millisecond))
	case <-time.After(5 * time.Second):
		t.Fatal("adapter did not return within 5s of cancellation")
	}
}
