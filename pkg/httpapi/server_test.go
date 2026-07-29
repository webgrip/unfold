package httpapi

import (
	"testing"

	"github.com/webgrip/ploeg/pkg/harness"
	"github.com/webgrip/ploeg/pkg/work"
)

// The report API is the one place a non-conformant client can reach the
// database directly. pkg/harness/harnesstest already holds adapters to these
// rules, but an adapter is not the only caller — ops/local/demo.sh posts with
// curl, and so will anything implementing docs/contracts/executor.md.
//
// Found by probing the running stack: `failureReason: "vibes"` returned 204 and
// was stored verbatim.
func TestValidateOutcomeReport(t *testing.T) {
	for _, tc := range []struct {
		name    string
		req     harness.OutcomeReport
		wantErr bool
	}{
		{"known outcome", harness.OutcomeReport{Outcome: work.OutcomePROpened}, false},
		{"empty outcome", harness.OutcomeReport{}, true},
		{"invented outcome", harness.OutcomeReport{Outcome: work.Outcome("shipped_it")}, true},

		// R4: a reasonless stuck turns a diagnosable park into an opaque one.
		{"stuck without reason", harness.OutcomeReport{Outcome: work.OutcomeStuck}, true},
		{"stuck with reason", harness.OutcomeReport{Outcome: work.OutcomeStuck, StuckReason: "needs a human"}, false},

		// The failure taxonomy is closed. pkg/worker's heuristics defer to an
		// adapter-set failureReason, so an unknown value does not merely look
		// untidy — it silently overrides classification.
		{"empty failureReason", harness.OutcomeReport{Outcome: work.OutcomeFailed}, false},
		{"known failureReason", harness.OutcomeReport{Outcome: work.OutcomeFailed, FailureReason: string(work.FailureInfraLLM)}, false},
		{"invented failureReason", harness.OutcomeReport{Outcome: work.OutcomeFailed, FailureReason: "vibes"}, true},
		{"near-miss failureReason", harness.OutcomeReport{Outcome: work.OutcomeFailed, FailureReason: "infra-llm"}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := validateOutcomeReport(tc.req)
			if tc.wantErr && err == nil {
				t.Error("expected the report to be rejected, it was accepted")
			}
			if !tc.wantErr && err != nil {
				t.Errorf("expected the report to be accepted, got %v", err)
			}
		})
	}
}

// Every taxonomy value the contract publishes must survive the boundary, or a
// conformant adapter is rejected for using a documented value.
func TestValidateOutcomeReport_AcceptsEveryPublishedFailureReason(t *testing.T) {
	for _, fr := range []work.FailureReason{
		work.FailureInfraNode, work.FailureInfraLLM, work.FailureAgentError,
		work.FailureBudget, work.FailureLeaseLost,
	} {
		if err := validateOutcomeReport(harness.OutcomeReport{
			Outcome: work.OutcomeFailed, FailureReason: string(fr),
		}); err != nil {
			t.Errorf("published failureReason %q was rejected: %v", fr, err)
		}
	}
}
