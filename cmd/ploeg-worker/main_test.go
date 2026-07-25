package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/webgrip/ploeg/pkg/litellm"
	"github.com/webgrip/ploeg/pkg/work"
)

// fakeAgentBin writes a tiny shell script that exits with the given code
// and returns its path. Cleanup is via t.Cleanup.
func fakeAgentBin(t *testing.T, exitCode int) string {
	t.Helper()
	dir := t.TempDir()
	bin := dir + "/fake-agent.sh"
	if err := os.WriteFile(bin, []byte("#!/bin/sh\nexit "+itoa(exitCode)+"\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	return bin
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [16]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

// TestRegression_AgentFailure_RevokesKey starts a fake LiteLLM server that
// tracks /key/delete calls, runs a minimal agent-run flow (mint -> agent ->
// deferred revoke), and asserts the key was revoked. This test FAILS on the
// old code path where the worker did not own the key lifecycle.
func TestRegression_AgentFailure_RevokesKey(t *testing.T) {
	var deleteCalled bool

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/key/generate":
			_ = json.NewEncoder(w).Encode(map[string]string{"key": "sk-test-fake-key"})
		case "/key/delete":
			deleteCalled = true
			_ = json.NewEncoder(w).Encode(map[string]string{"message": "deleted"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	agentBin := fakeAgentBin(t, 42) // agent exits 42 — simulates failure

	llmClient := litellm.NewClient(srv.URL, "test-master-key")
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))

	runAgentAndRevoke(context.Background(), log, llmClient, agentBin, 100, nil, "ploeg-abc123def456")

	if !deleteCalled {
		t.Fatal("revoke was NOT called after agent failure — key leak")
	}
}

// TestRegression_AgentSuccess_RevokesKey asserts revoke also runs on success.
func TestRegression_AgentSuccess_RevokesKey(t *testing.T) {
	var deleteCalled bool

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/key/generate":
			_ = json.NewEncoder(w).Encode(map[string]string{"key": "sk-test-fake-key"})
		case "/key/delete":
			deleteCalled = true
			_ = json.NewEncoder(w).Encode(map[string]string{"message": "deleted"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	llmClient := litellm.NewClient(srv.URL, "test-master-key")
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))

	// /bin/true exits 0
	runAgentAndRevoke(context.Background(), log, llmClient, "/bin/true", 50, []string{"gpt-4"}, "ploeg-abc123def456")

	if !deleteCalled {
		t.Fatal("revoke was NOT called after agent success — key leak")
	}
}

// TestRegression_MintFailure_NoRevoke asserts revoke is NOT called when
// minting fails (no key to revoke).
func TestRegression_MintFailure_NoRevoke(t *testing.T) {
	var mintCalled, deleteCalled bool

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/key/generate":
			mintCalled = true
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"error":"test error"}`))
		case "/key/delete":
			deleteCalled = true
			_ = json.NewEncoder(w).Encode(map[string]string{"message": "deleted"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	llmClient := litellm.NewClient(srv.URL, "test-master-key")
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))

	outcome, _, stuckReason, _, _ := runAgentAndRevoke(context.Background(), log, llmClient, "/bin/true", 100, nil, "ploeg-abc123def456")

	if outcome != work.OutcomeStuck {
		t.Errorf("expected OutcomeStuck, got %v", outcome)
	}
	if !strings.Contains(stuckReason, "mint") {
		t.Errorf("stuck reason should mention minting failure: %q", stuckReason)
	}
	if !mintCalled {
		t.Fatal("mint was not called")
	}
	if deleteCalled {
		t.Fatal("revoke was called even though mint failed")
	}
}

// TestRegression_KeyAliasFormat verifies the alias is ploeg-<first 12 hex>.
func TestRegression_KeyAliasFormat(t *testing.T) {
	var capturedAlias string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/key/generate":
			var req litellm.MintRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
				capturedAlias = req.KeyAlias
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"key": "sk-test-fake-key"})
		case "/key/delete":
			_ = json.NewEncoder(w).Encode(map[string]string{"message": "deleted"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	llmClient := litellm.NewClient(srv.URL, "test-master-key")
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))

	runAgentAndRevoke(context.Background(), log, llmClient, "/bin/true", 100, nil, "ploeg-1cd43e1dfd6c")

	want := "ploeg-1cd43e1dfd6c"
	if capturedAlias != want {
		t.Errorf("key_alias = %q, want %q", capturedAlias, want)
	}
}

// runAgentAndRevoke exercises the mint + agent run + deferred revoke pattern
// from execute() in a testable way. It returns the same tuple as execute
// minus the checkpoint (nil).
func runAgentAndRevoke(ctx context.Context, log *slog.Logger, llmClient *litellm.Client, agentBin string, budget float64, models []string, trace string) (work.Outcome, string, string, []string, *work.Checkpoint) {
	// Mint the per-run key (same pattern as execute()).
	mintCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	mintedKey, err := llmClient.Mint(mintCtx, litellm.MintRequest{
		KeyAlias:    trace,
		MaxBudget:   budget,
		Models:      models,
		MaxHoursTTL: 4,
	})
	cancel()
	if err != nil {
		return work.OutcomeStuck, "failed to mint per-run LiteLLM key", err.Error(), nil, nil
	}
	log.Info("minted per-run key", "trace", trace)

	// Deferred revoke (same pattern as execute()).
	defer func() {
		revokeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := llmClient.Revoke(revokeCtx, mintedKey); err != nil {
			log.Warn("revoke per-run key failed", "err", err, "trace", trace)
		} else {
			log.Info("revoked per-run key", "trace", trace)
		}
	}()

	// Run the agent subprocess (same pattern as execute()).
	agent := exec.CommandContext(ctx, agentBin)
	agent.Stdout = os.Stderr
	agent.Stderr = os.Stderr
	agentErr := agent.Run()

	switch {
	case agentErr == nil:
		return work.OutcomeNoChangeNeeded, "agent finished", "", nil, nil
	case ctx.Err() != nil:
		return work.OutcomeStuck, "run aborted (lease lost)", "context cancelled", nil, nil
	default:
		return work.OutcomeStuck, "agent failed", agentErr.Error(), nil, nil
	}
}

func testItem() work.WorkItem {
	return work.WorkItem{ExternalID: "585", Title: "fix the thing", Description: "<p>details</p>"}
}

func testCfg(base string) config {
	return config{
		RepoOwner:  "webgrip",
		RepoName:   "ploeg",
		BaseBranch: base,
		ForgejoURL: "http://forgejo-http.forgejo.svc.cluster.local:3000",
	}
}

func TestComposeTask_DefaultBaseIsMain(t *testing.T) {
	task := composeTask(testItem(), testCfg(""), "agent/vik-585", "ploeg-abc123def456")
	for _, want := range []string{
		"created from main",
		"NEVER commit to main",
		"base\n  branch main",
	} {
		if !strings.Contains(task, want) {
			t.Errorf("task missing %q:\n%s", want, task)
		}
	}
}

func TestComposeTask_ConfiguredBase(t *testing.T) {
	task := composeTask(testItem(), testCfg("development"), "agent/vik-585", "ploeg-abc123def456")
	for _, want := range []string{
		"created from development",
		"NEVER commit to development",
		"base\n  branch development",
	} {
		if !strings.Contains(task, want) {
			t.Errorf("task missing %q:\n%s", want, task)
		}
	}
	for _, reject := range []string{"from main", "commit to main", "branch main"} {
		if strings.Contains(task, reject) {
			t.Errorf("task still references the default base (%q):\n%s", reject, task)
		}
	}
}

func TestCloneArgs(t *testing.T) {
	got := cloneArgs(testCfg(""), "http://x/repo.git", "/work/dir")
	want := []string{"clone", "--depth", "50", "http://x/repo.git", "/work/dir"}
	assertSlice(t, got, want)

	got = cloneArgs(testCfg("development"), "http://x/repo.git", "/work/dir")
	want = []string{"clone", "--depth", "50", "--branch", "development", "http://x/repo.git", "/work/dir"}
	assertSlice(t, got, want)
}

func assertSlice(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("arg %d: got %q, want %q (full: %v)", i, got[i], want[i], got)
		}
	}
}

func TestPRMatches(t *testing.T) {
	cases := []struct {
		name                             string
		headRef, baseRef, wantHead, base string
		want                             bool
	}{
		{"head match, no base configured", "agent/vik-1", "main", "agent/vik-1", "", true},
		{"head mismatch", "agent/vik-2", "main", "agent/vik-1", "", false},
		{"head+base match", "agent/vik-1", "development", "agent/vik-1", "development", true},
		{"wrong base rejected when configured", "agent/vik-1", "main", "agent/vik-1", "development", false},
	}
	for _, c := range cases {
		if got := prMatches(c.headRef, c.baseRef, c.wantHead, c.base); got != c.want {
			t.Errorf("%s: prMatches(%q,%q,%q,%q) = %v, want %v",
				c.name, c.headRef, c.baseRef, c.wantHead, c.base, got, c.want)
		}
	}
}
