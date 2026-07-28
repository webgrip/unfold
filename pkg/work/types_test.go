package work

import "testing"

func TestFailureReason_Values(t *testing.T) {
	known := []FailureReason{
		FailureInfraNode,
		FailureInfraLLM,
		FailureAgentError,
		FailureBudget,
		FailureLeaseLost,
	}
	for _, fr := range known {
		if fr == "" {
			t.Error("known FailureReason must not be empty")
		}
	}
}

func TestFailureReason_IsString(t *testing.T) {
	if string(FailureInfraNode) != "infra_node" {
		t.Errorf("FailureInfraNode = %q, want %q", FailureInfraNode, "infra_node")
	}
	if string(FailureInfraLLM) != "infra_llm" {
		t.Errorf("FailureInfraLLM = %q, want %q", FailureInfraLLM, "infra_llm")
	}
	if string(FailureAgentError) != "agent_error" {
		t.Errorf("FailureAgentError = %q, want %q", FailureAgentError, "agent_error")
	}
	if string(FailureBudget) != "budget" {
		t.Errorf("FailureBudget = %q, want %q", FailureBudget, "budget")
	}
	if string(FailureLeaseLost) != "lease_lost" {
		t.Errorf("FailureLeaseLost = %q, want %q", FailureLeaseLost, "lease_lost")
	}
}
