package harness

import (
	"bytes"
	"encoding/json"
	"os"
	"path"
	"path/filepath"
	"testing"
	"time"

	"github.com/santhosh-tekuri/jsonschema/v6"

	"github.com/webgrip/ploeg/pkg/work"
)

// The schemas in docs/contracts/ are the published contract (backlog #59);
// these tests pin the Go types to them. A failure here means either the Go
// shape or the schema changed without the other — v1 allows additive
// optional fields only (docs/contracts/README.md).

// contractsLoader resolves the schemas' canonical $id URLs
// (https://webgrip.dev/ploeg/contracts/<name>) to the local files.
type contractsLoader struct{ dir string }

func (l contractsLoader) Load(url string) (any, error) {
	f, err := os.Open(filepath.Join(l.dir, path.Base(url)))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return jsonschema.UnmarshalJSON(f)
}

func compileSchema(t *testing.T, name string) *jsonschema.Schema {
	t.Helper()
	c := jsonschema.NewCompiler()
	c.UseLoader(contractsLoader{dir: filepath.Join("..", "..", "docs", "contracts")})
	sch, err := c.Compile("https://webgrip.dev/ploeg/contracts/" + name)
	if err != nil {
		t.Fatalf("compile %s: %v", name, err)
	}
	return sch
}

func validate(t *testing.T, sch *jsonschema.Schema, v any) error {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	inst, err := jsonschema.UnmarshalJSON(bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	return sch.Validate(inst)
}

func fullTaskSpec() TaskSpec {
	now := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	return TaskSpec{
		WorkItem: work.WorkItem{
			ID: "42", Provider: "vikunja", ExternalID: "596", Revision: "7",
			Team: "silver", State: work.StateLeased, Origin: work.OriginAssignment,
			Priority: 3, Title: "fix the thing", Description: "<p>details</p>",
			URL: "https://vikunja.example/tasks/596", CreatedAt: now, UpdatedAt: now,
			ExternalScope: "11",
			Target:        &work.Target{Forge: "webgrip", Owner: "webgrip", Repo: "ploeg", BaseBranch: "development"},
			RouteRule:     "11/silver",
		},
		Role:       "builder",
		Checkpoint: &work.Checkpoint{Phase: "branch_created", Branch: "agent/vik-596"},
		Repo: RepoRef{
			ForgeURL: "http://forgejo-http.forgejo.svc.cluster.local:3000",
			Owner:    "webgrip", Name: "example", BaseBranch: "development",
		},
		Branch:  "agent/vik-596",
		TraceID: "ploeg-1cd43e1dfd6c",
		Briefing: []Finding{
			{Role: "analyst", Round: 1, Findings: "## analyst\n- the retry loop is unbounded"},
			{Role: "security", Round: 1, Findings: "## security\n- the token is logged at debug"},
		},
	}
}

func TestTaskSpec_MatchesSchema(t *testing.T) {
	sch := compileSchema(t, "taskspec.v1.schema.json")
	if err := validate(t, sch, fullTaskSpec()); err != nil {
		t.Errorf("full TaskSpec does not validate: %v", err)
	}
}

func TestOutcomeReport_MatchesSchema(t *testing.T) {
	sch := compileSchema(t, "outcomereport.v1.schema.json")

	full := OutcomeReport{
		Outcome:    work.OutcomePROpened,
		Summary:    "opened a PR",
		Links:      []string{"https://forgejo.example/webgrip/example/pulls/7"},
		Checkpoint: &work.Checkpoint{Phase: "pr_opened", Branch: "agent/vik-596", PRURL: "https://forgejo.example/webgrip/example/pulls/7"},
		Usage:      &Usage{InputTokens: 100, OutputTokens: 50, CostUSD: 0.42, SessionID: "sess-1"},
	}
	if err := validate(t, sch, full); err != nil {
		t.Errorf("full OutcomeReport does not validate: %v", err)
	}

	minimal := OutcomeReport{Outcome: work.OutcomeNoChangeNeeded, Summary: "nothing to do"}
	if err := validate(t, sch, minimal); err != nil {
		t.Errorf("minimal OutcomeReport does not validate: %v", err)
	}

	// A reading Run's blackboard contribution (ADR-0011) and its verdict
	// (ADR-0017) — the one field by which an agent influences what runs next.
	for _, verdict := range []string{VerdictApprove, VerdictRequestChanges} {
		reader := OutcomeReport{
			Outcome: work.OutcomeNoChangeNeeded, Summary: "reviewed",
			Findings: "## security\n- the token is logged at debug",
			Verdict:  verdict,
		}
		if err := validate(t, sch, reader); err != nil {
			t.Errorf("OutcomeReport with verdict %q does not validate: %v", verdict, err)
		}
	}

	stuckOK := OutcomeReport{Outcome: work.OutcomeStuck, Summary: "blocked", StuckReason: "gate failed"}
	if err := validate(t, sch, stuckOK); err != nil {
		t.Errorf("stuck-with-reason does not validate: %v", err)
	}

	// failureReason is posted by the worker and stored in agent_runs; every
	// value of the taxonomy must be on the wire contract.
	for _, fr := range []work.FailureReason{
		work.FailureInfraNode, work.FailureInfraLLM,
		work.FailureAgentError, work.FailureBudget, work.FailureLeaseLost,
	} {
		r := OutcomeReport{Outcome: work.OutcomeFailed, Summary: "failed", FailureReason: string(fr)}
		if err := validate(t, sch, r); err != nil {
			t.Errorf("failureReason %q does not validate: %v", fr, err)
		}
	}
}

func TestOutcomeReport_SchemaRejectsInvalid(t *testing.T) {
	sch := compileSchema(t, "outcomereport.v1.schema.json")

	// Stuck without a reason violates R4.
	stuckNoReason := OutcomeReport{Outcome: work.OutcomeStuck, Summary: "blocked"}
	if err := validate(t, sch, stuckNoReason); err == nil {
		t.Error("stuck without stuckReason validated; R4 requires the schema to reject it")
	}

	// Unknown outcome enum.
	if err := validate(t, sch, map[string]any{"outcome": "shipped", "summary": "x"}); err == nil {
		t.Error("unknown outcome enum validated")
	}

	// Unknown failure taxonomy value.
	if err := validate(t, sch, map[string]any{
		"outcome": "failed", "summary": "x", "failureReason": "vibes",
	}); err == nil {
		t.Error("unknown failureReason enum validated")
	}

	// An invented verdict. The enum is closed precisely because this field
	// decides whether more agent Runs happen (ADR-0017).
	if err := validate(t, sch, map[string]any{
		"outcome": "no_change_needed", "summary": "x", "verdict": "ship_it",
	}); err == nil {
		t.Error("unknown verdict enum validated")
	}

	// Zero-value report ("no structured signal") is an internal sentinel,
	// never a valid wire message.
	if err := validate(t, sch, OutcomeReport{}); err == nil {
		t.Error("zero-value OutcomeReport validated; outcome enum must reject the empty string")
	}
}

func TestRunAPI_SchemaCompiles(t *testing.T) {
	sch := compileSchema(t, "run-api.v1.schema.json")
	_ = sch // compilation exercises the cross-file $refs
}
