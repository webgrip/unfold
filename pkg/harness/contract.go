// Package harness defines the contract between Ploeg and an agent
// harness: TaskSpec in, OutcomeReport out. Adapters wrap concrete
// harnesses (OpenHands, Claude Code, opencode, …) behind the Adapter
// interface in adapter.go. The JSON shapes are published as versioned
// schemas in docs/contracts/ (backlog #59) and pinned by contract_test.go.
// See docs/design.md §5.
package harness

import "github.com/webgrip/ploeg/pkg/work"

// TaskSpec is the harness contract input: everything a run needs to know
// about the work, the repo, and its identity.
type TaskSpec struct {
	WorkItem   work.WorkItem    `json:"workItem"`
	Role       string           `json:"role,omitempty"` // specialist role within the team
	Checkpoint *work.Checkpoint `json:"checkpoint,omitempty"`
	Repo       RepoRef          `json:"repo"`
	Branch     string           `json:"branch"`  // e.g. agent/vik-<id>
	TraceID    string           `json:"traceId"` // ploeg-<12hex>; doubles as the LiteLLM key alias
	// Credentials are delivered out-of-band (env, mounted secrets), never here (R8).
}

// RepoRef names the repository a run works on.
type RepoRef struct {
	ForgeURL string `json:"forgeUrl"` // forge base URL, e.g. http://forgejo-http.forgejo.svc.cluster.local:3000
	Owner    string `json:"owner"`
	Name     string `json:"name"`
	// BaseBranch is the branch to clone/branch from and open the PR against.
	// Empty = the repo's default branch (which may be a stale stub — VIK-589).
	BaseBranch string `json:"baseBranch,omitempty"`
}

// OutcomeReport is the harness contract output. A zero-value Outcome ("")
// means "no structured signal" — the orchestrator falls back to forge
// ground truth (PR poll) and exit-code heuristics.
type OutcomeReport struct {
	Outcome       work.Outcome       `json:"outcome"`
	Summary       string             `json:"summary"`
	Links         []string           `json:"links,omitempty"`         // PRs, commits, created follow-ups
	Checkpoint    *work.Checkpoint   `json:"checkpoint,omitempty"`
	StuckReason   string             `json:"stuckReason,omitempty"`   // mandatory when Outcome == stuck (R4)
	Usage         *Usage             `json:"usage,omitempty"`         // reserved for backlog #66
	FailureReason work.FailureReason `json:"failureReason,omitempty"` // forensics taxonomy (VIK-597)
}

// Usage carries per-run cost/usage a harness can report (backlog #66) and
// the harness-native resume handle (backlog #70). All fields optional.
type Usage struct {
	InputTokens  int64   `json:"inputTokens,omitempty"`
	OutputTokens int64   `json:"outputTokens,omitempty"`
	CostUSD      float64 `json:"costUsd,omitempty"`
	SessionID    string  `json:"sessionId,omitempty"`
}
