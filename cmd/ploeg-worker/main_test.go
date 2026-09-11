package main

import (
	"strings"
	"testing"
)

func TestAdministrativeWorkerEnvironmentFailsClosedWithoutSecretDisclosure(t *testing.T) {
	t.Setenv("LITELLM_MASTER_KEY", "canary-management")
	err := rejectAdministrativeEnvironment()
	if err == nil || strings.Contains(err.Error(), "canary-management") {
		t.Fatal("worker must reject management authority without disclosing it")
	}
}
