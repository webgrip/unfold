package work

import "testing"

func TestFailureReason_Values(t *testing.T) {
	known := []FailureReason{
		FailureReasonInfraNode,
		FailureReasonInfraLLM,
		FailureReasonAgentError,
		FailureReasonBudget,
		FailureReasonLeaseLost,
	}
	for _, fr := range known {
		if fr == "" {
			t.Error("known FailureReason must not be empty")
		}
	}
}

func TestFailureReason_IsString(t *testing.T) {
	if string(FailureReasonInfraNode) != "infra_node" {
		t.Errorf("FailureReasonInfraNode = %q, want %q", FailureReasonInfraNode, "infra_node")
	}
	if string(FailureReasonInfraLLM) != "infra_llm" {
		t.Errorf("FailureReasonInfraLLM = %q, want %q", FailureReasonInfraLLM, "infra_llm")
	}
	if string(FailureReasonAgentError) != "agent_error" {
		t.Errorf("FailureReasonAgentError = %q, want %q", FailureReasonAgentError, "agent_error")
	}
	if string(FailureReasonBudget) != "budget" {
		t.Errorf("FailureReasonBudget = %q, want %q", FailureReasonBudget, "budget")
	}
	if string(FailureReasonLeaseLost) != "lease_lost" {
		t.Errorf("FailureReasonLeaseLost = %q, want %q", FailureReasonLeaseLost, "lease_lost")
	}
}
