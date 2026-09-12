package worker

import (
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestHarnessEnvironmentExposesOnlyAssignedCapabilities(t *testing.T) {
	for _, writes := range []bool{false, true} {
		home := t.TempDir()
		env := harnessEnvironment([]string{"PATH=/usr/bin:/bin", "LITELLM_MASTER_KEY=canary-management", "PLOEG_WORKER_SIGNING_KEY=canary-controller", "PLOEG_WORKER_BOOTSTRAP_TOKEN=canary-bootstrap", "ARBITRARY_SECRET=canary-unrelated", "AGENT_BUILDER_TOKEN=canary-other-forge", "HOME=/controller-home", "LLM_API_KEY=canary-old-inference"}, home, filepath.Join(home, "scratch"), writes, "assigned-forge", "http://gateway/v1", "assigned-model")
		cmd := exec.Command("/usr/bin/env")
		cmd.Env = env
		out, err := cmd.Output()
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(out), "canary-") || strings.Contains(string(out), "controller-home") {
			t.Fatalf("role writes=%v inherited unauthorized capabilities", writes)
		}
		if strings.Contains(string(out), "assigned-forge") != writes {
			t.Fatalf("role writes=%v has wrong forge access", writes)
		}
		if !strings.Contains(string(out), "HOME="+home) {
			t.Fatal("harness has no isolated home")
		}
	}
}
