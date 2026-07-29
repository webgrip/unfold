package worker

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/webgrip/ploeg/pkg/harness"
	"github.com/webgrip/ploeg/pkg/harness/adapters/openhands"
	"github.com/webgrip/ploeg/pkg/llmbroker"
	"github.com/webgrip/ploeg/pkg/work"
)

func discardLog() *slog.Logger { return slog.New(slog.DiscardHandler) }

// --- resolveOutcome: the outcome-precedence table, pinning the historical
// exit-code mapping byte-for-byte (VIK-596 owns changing it) plus the new
// structured-report and usage-merge branches. ---

func TestResolveOutcome_Precedence(t *testing.T) {
	usage := &harness.Usage{CostUSD: 0.5, SessionID: "s"}
	tests := []struct {
		name        string
		report      harness.OutcomeReport
		runErr      error
		ctxErr      error
		prURL       string
		expectsLLM  bool
		wantOutcome work.Outcome
		wantSummary string
		wantReason  string
		wantLinks   []string
		wantPhase   string
		wantFailure string
	}{
		{
			name:        "PR found always wins",
			runErr:      errors.New("exit status 1"), // even over a failed process
			prURL:       "http://forge/pr/7",
			wantOutcome: work.OutcomePROpened,
			wantSummary: "openhands run opened a PR for fix the thing",
			wantLinks:   []string{"http://forge/pr/7"},
			wantPhase:   "pr_opened",
		},
		{
			name:        "structured report beats heuristics",
			report:      harness.OutcomeReport{Outcome: work.OutcomeNoChangeNeeded, Summary: "harness says nothing to do"},
			runErr:      nil,
			wantOutcome: work.OutcomeNoChangeNeeded,
			wantSummary: "harness says nothing to do",
		},
		{
			name:        "structured stuck without reason synthesizes one from the tail",
			report:      harness.OutcomeReport{Outcome: work.OutcomeStuck, Summary: "blocked"},
			runErr:      errors.New("exit status 2"),
			wantOutcome: work.OutcomeStuck,
			wantSummary: "blocked",
			wantReason:  "tail-of-log",
		},
		{
			name:        "exit 0 without PR = no_change_needed",
			wantOutcome: work.OutcomeNoChangeNeeded,
			wantSummary: "openhands run finished without opening a PR",
		},
		{
			name:        "ctx cancelled = stuck (lease lost)",
			runErr:      errors.New("signal: killed"),
			ctxErr:      context.Canceled,
			wantOutcome: work.OutcomeStuck,
			wantSummary: "run aborted (lease lost)",
			wantReason:  "lease renewal failed; run cancelled to avoid a double claim",
			wantFailure: "lease_lost",
		},
		{
			name:        "nonzero exit = stuck with log tail",
			runErr:      errors.New("exit status 7"),
			wantOutcome: work.OutcomeStuck,
			wantSummary: "openhands run failed",
			wantReason:  "tail-of-log",
			wantFailure: "agent_error",
		},
		// VIK-586: LLM adapter with zero spend and no PR → failed/infra_llm
		{
			name:        "LLM adapter zero spend exit 0 = infra_llm",
			report:      harness.OutcomeReport{Usage: &harness.Usage{CostUSD: 0}},
			expectsLLM:  true,
			wantOutcome: work.OutcomeFailed,
			wantSummary: "openhands run finished with zero LLM spend and no PR — likely LLM infra failure",
			wantFailure: "infra_llm",
		},
		// nill usage = no telemetry = keep no_change_needed
		{
			name:        "LLM adapter nil usage exit 0 = no_change_needed",
			report:      harness.OutcomeReport{Usage: nil},
			expectsLLM:  true,
			wantOutcome: work.OutcomeNoChangeNeeded,
			wantSummary: "openhands run finished without opening a PR",
		},
		// exec adapter zero spend exit 0 = no_change_needed (no LLM spend expected)
		{
			name:        "exec adapter zero spend exit 0 = no_change_needed",
			report:      harness.OutcomeReport{Usage: &harness.Usage{CostUSD: 0}},
			expectsLLM:  false,
			wantOutcome: work.OutcomeNoChangeNeeded,
			wantSummary: "openhands run finished without opening a PR",
		},
		// LLM adapter with structured failed + zero spend → infra_llm
		{
			name:        "LLM adapter structured failed zero spend maps failure_reason",
			report:      harness.OutcomeReport{Outcome: work.OutcomeFailed, Usage: &harness.Usage{CostUSD: 0}},
			expectsLLM:  true,
			wantOutcome: work.OutcomeFailed,
			wantFailure: "infra_llm",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := resolveOutcome("openhands", tc.report, tc.runErr, tc.ctxErr,
				tc.prURL, "fix the thing", "agent/vik-585", []byte("tail-of-log"), tc.expectsLLM)
			if got.Outcome != tc.wantOutcome {
				t.Errorf("outcome = %q, want %q", got.Outcome, tc.wantOutcome)
			}
			if got.Summary != tc.wantSummary {
				t.Errorf("summary = %q, want %q", got.Summary, tc.wantSummary)
			}
			if got.StuckReason != tc.wantReason {
				t.Errorf("stuckReason = %q, want %q", got.StuckReason, tc.wantReason)
			}
			if len(tc.wantLinks) > 0 && (len(got.Links) != 1 || got.Links[0] != tc.wantLinks[0]) {
				t.Errorf("links = %v, want %v", got.Links, tc.wantLinks)
			}
			if tc.wantPhase != "" && (got.Checkpoint == nil || got.Checkpoint.Phase != tc.wantPhase) {
				t.Errorf("checkpoint = %+v, want phase %q", got.Checkpoint, tc.wantPhase)
			}
			if got.FailureReason != tc.wantFailure {
				t.Errorf("failureReason = %q, want %q", got.FailureReason, tc.wantFailure)
			}
		})
	}
	t.Run("usage survives every branch", func(t *testing.T) {
		report := harness.OutcomeReport{Usage: usage} // no structured outcome, usage only
		got := resolveOutcome("claude-code", report, nil, nil, "http://forge/pr/8", "t", "b", nil, true)
		if got.Usage != usage {
			t.Errorf("usage lost on the PR branch: %+v", got.Usage)
		}
		got = resolveOutcome("claude-code", report, nil, nil, "", "t", "b", nil, true)
		if got.Usage != usage {
			t.Errorf("usage lost on the no-change branch: %+v", got.Usage)
		}
	})
}

// --- runAgent: the four key-lifecycle regressions (mint → run → deferred
// revoke on every return path), now at the broker seam. ---

type recordingBroker struct {
	llmbroker.Broker
	mintErr  error
	key      string
	minted   int
	revoked  int
	lastCred llmbroker.Credential
}

func (b *recordingBroker) Mint(_ context.Context, req llmbroker.MintRequest) (llmbroker.Credential, error) {
	b.minted++
	if b.mintErr != nil {
		return llmbroker.Credential{}, b.mintErr
	}
	return llmbroker.Credential{APIKey: b.key, Alias: "ploeg-abc123def456"}, nil
}

func (b *recordingBroker) Revoke(_ context.Context, cred llmbroker.Credential) error {
	b.revoked++
	b.lastCred = cred
	return nil
}

func fakeAgentAdapter(t *testing.T, exitCode int) harness.Adapter {
	t.Helper()
	bin := filepath.Join(t.TempDir(), "fake-agent.sh")
	body := "#!/bin/sh\nexit " + string(rune('0'+exitCode)) + "\n"
	if err := os.WriteFile(bin, []byte(body), 0o755); err != nil {
		t.Fatal(err)
	}
	return harness.RunCommand(openhands.New(bin))
}

func runEnv(t *testing.T) harness.RunEnv {
	return harness.RunEnv{
		RepoDir:    t.TempDir(),
		ScratchDir: t.TempDir(),
		Prompt:     "task",
		BaseEnv:    os.Environ(),
		Log:        discardLog(),
	}
}

func testTaskSpec() harness.TaskSpec {
	return harness.TaskSpec{TraceID: "ploeg-abc123def456"}
}

func TestRegression_AgentFailure_RevokesKey(t *testing.T) {
	broker := &recordingBroker{key: "sk-test-fake-key"}
	_, mintErr, runErr := runAgent(context.Background(), discardLog(), broker,
		fakeAgentAdapter(t, 4), testTaskSpec(), runEnv(t), llmbroker.MintRequest{RunToken: "abc123def456ff"})
	if mintErr != nil {
		t.Fatal(mintErr)
	}
	if runErr == nil {
		t.Fatal("expected the agent failure to surface")
	}
	if broker.revoked != 1 {
		t.Fatal("revoke was NOT called after agent failure — key leak")
	}
	if broker.lastCred.APIKey != "sk-test-fake-key" {
		t.Errorf("revoked wrong credential: %+v", broker.lastCred)
	}
}

func TestRegression_AgentSuccess_RevokesKey(t *testing.T) {
	broker := &recordingBroker{key: "sk-test-fake-key"}
	_, mintErr, runErr := runAgent(context.Background(), discardLog(), broker,
		fakeAgentAdapter(t, 0), testTaskSpec(), runEnv(t), llmbroker.MintRequest{RunToken: "abc123def456ff"})
	if mintErr != nil || runErr != nil {
		t.Fatalf("mintErr=%v runErr=%v", mintErr, runErr)
	}
	if broker.revoked != 1 {
		t.Fatal("revoke was NOT called after agent success — key leak")
	}
}

func TestRegression_MintFailure_NoRevoke_NoRun(t *testing.T) {
	broker := &recordingBroker{mintErr: errors.New("HTTP 500")}
	_, mintErr, _ := runAgent(context.Background(), discardLog(), broker,
		fakeAgentAdapter(t, 0), testTaskSpec(), runEnv(t), llmbroker.MintRequest{RunToken: "abc123def456ff"})
	if mintErr == nil {
		t.Fatal("expected mint error")
	}
	if broker.revoked != 0 {
		t.Fatal("revoke was called even though mint failed")
	}
}

func TestRunAgent_InjectsKeyAndTraceIntoEnv(t *testing.T) {
	env := runEnv(t)
	marker := filepath.Join(env.ScratchDir, "env.txt")
	bin := filepath.Join(t.TempDir(), "env-dump.sh")
	script := "#!/bin/sh\nprintf '%s|%s' \"$LLM_API_KEY\" \"$LLM_TRACE_ID\" > " + marker + "\n"
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	broker := &recordingBroker{key: "sk-minted"}
	_, mintErr, runErr := runAgent(context.Background(), discardLog(), broker,
		harness.RunCommand(openhands.New(bin)), testTaskSpec(), env, llmbroker.MintRequest{RunToken: "abc123def456ff"})
	if mintErr != nil || runErr != nil {
		t.Fatalf("mintErr=%v runErr=%v", mintErr, runErr)
	}
	b, err := os.ReadFile(marker)
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != "sk-minted|ploeg-abc123def456" {
		t.Errorf("agent env = %q, want minted key and trace", b)
	}
}

func TestRunAgent_StaticBrokerNoKeyStillRuns(t *testing.T) {
	broker := &recordingBroker{key: ""}
	_, mintErr, runErr := runAgent(context.Background(), discardLog(), broker,
		fakeAgentAdapter(t, 0), testTaskSpec(), runEnv(t), llmbroker.MintRequest{RunToken: "abc123def456ff"})
	if mintErr != nil || runErr != nil {
		t.Fatalf("mintErr=%v runErr=%v", mintErr, runErr)
	}
}

// --- ModelList (moved from cmd/ploeg-worker) ---

func TestModelList_StripsProxyPrefixes(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"", ""},
		{"claude-sonnet-5", "claude-sonnet-5"},
		{"litellm_proxy/claude-sonnet-5", "claude-sonnet-5"},
		{"openai/gpt-4", "gpt-4"},
		{"litellm_proxy/gpt-4-turbo", "gpt-4-turbo"},
		{"openai_other/gpt-4", "openai_other/gpt-4"}, // not a prefix match
	}
	for _, tc := range tests {
		got := ModelList(tc.input)
		if tc.input == "" {
			if got != nil {
				t.Errorf("ModelList(%q) = %v, want nil", tc.input, got)
			}
			continue
		}
		if len(got) != 1 || got[0] != tc.want {
			t.Errorf("ModelList(%q) = %v, want [%q]", tc.input, got, tc.want)
		}
	}
}

// --- adapter selection ---

func TestNewAdapter_Selection(t *testing.T) {
	for _, tc := range []struct {
		hc      HarnessConfig
		want    string
		wantErr bool
	}{
		{HarnessConfig{}, "openhands", false},
		{HarnessConfig{Name: "openhands"}, "openhands", false},
		{HarnessConfig{Name: "exec", Args: []string{"/bin/agent"}}, "exec", false},
		{HarnessConfig{Name: "exec"}, "", true}, // exec without args fails fast
		{HarnessConfig{Name: "claude-code"}, "claude-code", false},
		{HarnessConfig{Name: "bogus"}, "", true},
	} {
		ad, err := NewAdapter(tc.hc)
		if tc.wantErr {
			if err == nil {
				t.Errorf("NewAdapter(%+v): expected error", tc.hc)
			}
			continue
		}
		if err != nil {
			t.Errorf("NewAdapter(%+v): %v", tc.hc, err)
			continue
		}
		if ad.Name() != tc.want {
			t.Errorf("NewAdapter(%+v).Name() = %q, want %q", tc.hc, ad.Name(), tc.want)
		}
	}
}

// --- helpers shared with the ported tests ---

func testItem() work.WorkItem {
	return work.WorkItem{ExternalID: "585", Title: "fix the thing", Description: "<p>details</p>"}
}

func testCfg(base string) Config {
	return Config{
		RepoOwner:  "webgrip",
		RepoName:   "ploeg",
		BaseBranch: base,
		ForgejoURL: "http://forgejo-http.forgejo.svc.cluster.local:3000",
	}
}

func specFor(cfg Config, item work.WorkItem, branch, trace string) harness.TaskSpec {
	return harness.TaskSpec{
		WorkItem: item,
		Repo: harness.RepoRef{
			ForgeURL: cfg.ForgejoURL, Owner: cfg.RepoOwner, Name: cfg.RepoName, BaseBranch: cfg.BaseBranch,
		},
		Branch:  branch,
		TraceID: trace,
	}
}

func TestComposePrompt_DefaultBaseIsMain(t *testing.T) {
	task := ComposePrompt(specFor(testCfg(""), testItem(), "agent/vik-585", "ploeg-abc123def456"))
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

func TestComposePrompt_ConfiguredBase(t *testing.T) {
	task := ComposePrompt(specFor(testCfg("development"), testItem(), "agent/vik-585", "ploeg-abc123def456"))
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
	got := cloneArgs("", "http://x/repo.git", "/work/dir")
	want := []string{"clone", "--depth", "50", "http://x/repo.git", "/work/dir"}
	assertSlice(t, got, want)

	got = cloneArgs("development", "http://x/repo.git", "/work/dir")
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
