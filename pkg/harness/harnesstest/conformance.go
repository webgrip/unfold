// Package harnesstest is the adapter conformance kernel (backlog #69):
// every CommandAdapter must satisfy these properties regardless of which
// harness it wraps. Adapter packages run it from their own tests.
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

// Fixture wires the suite to one adapter implementation.
type Fixture struct {
	// NewAdapter returns the adapter under test configured to exec the given
	// binary (a test script) as its harness process.
	NewAdapter func(t *testing.T, bin string) harness.CommandAdapter
}

// Run executes the conformance suite.
func Run(t *testing.T, fx Fixture) {
	t.Run("PrepareProducesRunnableInvocation", fx.prepareProducesRunnableInvocation)
	t.Run("SuccessWithoutStructuredOutput", fx.successWithoutStructuredOutput)
	t.Run("FailureNeverFabricatesAnOutcome", fx.failureNeverFabricatesAnOutcome)
	t.Run("CancelKillsTheHarness", fx.cancelKillsTheHarness)
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

func (fx Fixture) prepareProducesRunnableInvocation(t *testing.T) {
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
	bin := script(t, "exit 0")
	ad := fx.NewAdapter(t, bin)
	report, err := harness.RunCommand(ad).Run(context.Background(), spec(), env(t))
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
	bin := script(t, "echo broke >&2; exit 9")
	ad := fx.NewAdapter(t, bin)
	report, err := harness.RunCommand(ad).Run(context.Background(), spec(), env(t))
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

func (fx Fixture) cancelKillsTheHarness(t *testing.T) {
	bin := script(t, "exec sleep 30")
	ad := fx.NewAdapter(t, bin)
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(100 * time.Millisecond); cancel() }()
	done := make(chan error, 1)
	go func() {
		_, err := harness.RunCommand(ad).Run(ctx, spec(), env(t))
		done <- err
	}()
	select {
	case err := <-done:
		if err == nil {
			t.Error("cancelled run returned no error")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("adapter did not return within 5s of cancellation")
	}
}
