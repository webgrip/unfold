package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestOperatorWorkbenchQualification(t *testing.T) {
	workbench := os.Getenv("PLOEG_WORKBENCH_PATH")
	if workbench == "" {
		t.Skip("PLOEG_WORKBENCH_PATH opts into real De Vloer demo qualification")
	}
	if !filepath.IsAbs(workbench) {
		t.Fatal("PLOEG_WORKBENCH_PATH must be an absolute repository path")
	}
	script := filepath.Join(workbench, "scripts", "qualify-ploeg.ts")
	if _, err := os.Stat(script); err != nil {
		t.Fatalf("workbench qualification script: %v", err)
	}
	reset(t)
	consumers, token := operatorTestConsumers(t, []string{"delivery"}, true)
	server := &Server{Store: testStore, OperatorConfig: OperatorConfig{Consumers: consumers, Teams: map[string][]string{"delivery": {"operator"}}}}
	httpServer := httptest.NewServer(server.Handler())
	defer httpServer.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	command := exec.CommandContext(ctx, "mise", "exec", "--", "node", script)
	command.Dir = workbench
	command.Env = append(os.Environ(), "PLOEG_QUALIFICATION_URL="+httpServer.URL, "PLOEG_QUALIFICATION_TOKEN="+token)
	var stdout, stderr bytes.Buffer
	command.Stdout, command.Stderr = &stdout, &stderr
	if err := command.Run(); err != nil {
		t.Fatalf("De Vloer qualification failed: %v\nstdout: %s\nstderr: %s", err, strings.ReplaceAll(stdout.String(), token, "[redacted]"), strings.ReplaceAll(stderr.String(), token, "[redacted]"))
	}
	var result map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("qualification result must be one JSON object: %v\n%s", err, strings.ReplaceAll(stdout.String(), token, "[redacted]"))
	}
	if result["ok"] != true {
		t.Fatalf("qualification did not confirm success: %s", strings.ReplaceAll(stdout.String(), token, "[redacted]"))
	}
	t.Logf("De Vloer qualification: %s", strings.ReplaceAll(stdout.String(), token, "[redacted]"))
}
