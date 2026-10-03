package worker

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/webgrip/ploeg/pkg/harness"
	"github.com/webgrip/ploeg/pkg/harness/adapters/acp"
	"github.com/webgrip/ploeg/pkg/llmbroker"
	"github.com/webgrip/ploeg/pkg/work"
)

func acpAgentDuringPrompt(t *testing.T, duringPrompt string) harness.Adapter {
	t.Helper()
	script := fmt.Sprintf(`#!/bin/sh
emit() { printf '%%s\n' "$1"; }
while IFS= read -r line; do
  id=$(printf '%%s' "$line" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
  case "$line" in
    *'"method":"initialize"'*)
      emit '{"jsonrpc":"2.0","id":'"$id"',"result":{"protocolVersion":1,"agentCapabilities":{},"authMethods":[]}}' ;;
    *'"method":"session/new"'*)
      emit '{"jsonrpc":"2.0","id":'"$id"',"result":{"sessionId":"s1"}}' ;;
    *'"method":"session/prompt"'*)
      %s
      emit '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"usage_update","used":1200,"size":200000,"cost":0.03}}}'
      emit '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"Nothing to change."}}}}'
      emit '{"jsonrpc":"2.0","id":'"$id"',"result":{"stopReason":"end_turn"}}' ;;
  esac
done
`, duringPrompt)
	bin := filepath.Join(t.TempDir(), "agent.sh")
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	adapter, err := acp.New("custom", acp.ProfileOverrides{Argv: []string{bin}}, acp.Options{
		PromptTimeout: 30 * time.Second, IdleTimeout: 30 * time.Second, CancelGrace: time.Second, TermGrace: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	return adapter
}

func runWriter(t *testing.T, adapter harness.Adapter) harness.OutcomeReport {
	t.Helper()
	forgeURL := gitForge(t, map[string]string{"main.go": "package main\n", ".gitignore": "bin/\n"})
	var rec checkpointRecorder
	w := New(Config{APIURL: rec.server(t), ForgeURL: forgeURL, DefaultForge: harness.ForgeForgejo, BuilderToken: "tok",
		RepoOwner: "webgrip", RepoName: "example", BaseBranch: "development", WorkDir: t.TempDir()},
		adapter, llmbroker.Static{}, discardLog())
	claimed := &ClaimResponse{RunToken: "rt", Role: "builder", Writes: true, WorkItem: work.WorkItem{ID: "1", ExternalID: "7", Title: "t"}}
	return w.execute(context.Background(), claimed, "agent/vik-7", "trace", "", "")
}

func TestWriterWhoseShellEditNeverReachedAPullRequestIsStuck(t *testing.T) {
	adapter := acpAgentDuringPrompt(t, `
      emit '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","kind":"execute","status":"completed","title":"sed -i main.go"}}}'
      printf 'func main() {}\n' >> main.go`)
	report := runWriter(t, adapter)
	if report.Outcome != work.OutcomeStuck {
		t.Fatalf("report = %+v, want stuck: the shell edit was never published", report)
	}
	if !strings.Contains(report.StuckReason, "uncommitted path(s): main.go") {
		t.Errorf("stuck reason %q does not name main.go", report.StuckReason)
	}
}

func TestWriterWhoseLocalCommitNeverReachedAPullRequestIsStuck(t *testing.T) {
	adapter := acpAgentDuringPrompt(t, `
      emit '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","kind":"edit","status":"completed","title":"edit main.go","locations":[{"path":"main.go"}]}}}'
      printf 'func main() {}\n' >> main.go
      git checkout -q -b agent/vik-7 >&2 && git commit -qam 'add main' >&2`)
	report := runWriter(t, adapter)
	if report.Outcome != work.OutcomeStuck {
		t.Fatalf("report = %+v, want stuck: the commit was never pushed", report)
	}
	if !strings.Contains(report.StuckReason, "1 commit(s) not on the forge") || !strings.Contains(report.StuckReason, "add main") {
		t.Errorf("stuck reason %q does not name the unpushed commit", report.StuckReason)
	}
}

func TestWriterThatChangedNothingStillCompletes(t *testing.T) {
	adapter := acpAgentDuringPrompt(t, `
      emit '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","kind":"execute","status":"completed","title":"go build -o bin/app"}}}'
      mkdir -p bin && printf 'binary' > bin/app`)
	report := runWriter(t, adapter)
	if report.Outcome != work.OutcomeNoChangeNeeded {
		t.Fatalf("report = %+v, want no_change_needed: ignored build output is not a change", report)
	}
}
