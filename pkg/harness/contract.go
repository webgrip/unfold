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
	// Briefing carries earlier Rounds' findings into this one (ADR-0011).
	// Ploeg reads them from the Shift and injects them; the agent never calls
	// a forge or a Ploeg API to fetch them (R6).
	Briefing []Finding `json:"briefing,omitempty"`
	// Credentials are delivered out-of-band (env, mounted secrets), never here (R8).
}

// Finding is one earlier Run's contribution to the blackboard, attributed to
// the Role that made it. Prose, not structure: the same text goes to the pull
// request and into the next Round's prompt (ADR-0011).
type Finding struct {
	Role     string `json:"role"`
	Round    int    `json:"round"`
	Findings string `json:"findings"`
}

// RepoRef names the repository a run works on.
type RepoRef struct {
	// Forge is the API DIALECT the forge at ForgeURL speaks: "forgejo" (also
	// Gitea) or "gitlab". Empty means forgejo, so every existing taskspec and
	// every deployment that never set it keeps its current meaning.
	//
	// It is a dialect and not a vendor name because that is all the worker does
	// with it: pick which endpoint shape to poll for an open change request,
	// and which one to tell the agent to open. Clone and push need no dialect —
	// git is git — which is why this arrived late and only in two places.
	Forge    string `json:"forge,omitempty"`
	ForgeURL string `json:"forgeUrl"` // forge base URL, e.g. http://forgejo-http.forgejo.svc.cluster.local:3000
	Owner    string `json:"owner"`
	Name     string `json:"name"`
	// BaseBranch is the branch to clone/branch from and open the PR against.
	// Empty = the repo's default branch (which may be a stale stub — VIK-589).
	BaseBranch string `json:"baseBranch,omitempty"`
}

// The forge dialects the worker knows how to talk to.
const (
	ForgeForgejo = "forgejo"
	ForgeGitLab  = "gitlab"
)

// Dialect resolves the empty default. Callers must use this rather than
// comparing Forge directly: rows written before the field existed carry "",
// and treating that as "unknown forge" would strand every one of them.
func (r RepoRef) Dialect() string {
	if r.Forge == "" {
		return ForgeForgejo
	}
	return r.Forge
}

// ProjectPath is the repository's full path on the forge — what GitLab calls a
// project path and Forgejo splits into owner and name.
//
// GitLab subgroups are why this exists. A nested project is owner "acme"
// with name "internal/widgets", so the path has THREE segments and the name
// carries a slash. Joining them is correct for both forges; splitting on the
// first slash to recover owner and name is not, and nothing here tries.
func (r RepoRef) ProjectPath() string { return r.Owner + "/" + r.Name }

// OutcomeReport is the harness contract output. A zero-value Outcome ("")
// means "no structured signal" — the orchestrator falls back to forge
// ground truth (PR poll) and exit-code heuristics.
type OutcomeReport struct {
	Outcome       work.Outcome     `json:"outcome"`
	Summary       string           `json:"summary"`
	Links         []string         `json:"links,omitempty"` // PRs, commits, created follow-ups
	Checkpoint    *work.Checkpoint `json:"checkpoint,omitempty"`
	StuckReason   string           `json:"stuckReason,omitempty"`   // mandatory when Outcome == stuck (R4)
	Usage         *Usage           `json:"usage,omitempty"`         // reserved for backlog #66
	FailureReason string           `json:"failureReason,omitempty"` // ploeg-internal failure taxonomy (VIK-597); set by the orchestrator, never by the harness
	// Findings is a reading Run's contribution to the blackboard (ADR-0011):
	// markdown prose Ploeg publishes to the pull request and injects into the
	// next Round's Briefing. A writer normally leaves it empty.
	Findings string `json:"findings,omitempty"`
	// Verdict is a reading Run's answer to "is this done?" — approve or
	// request_changes (ADR-0017). It is the only field by which an agent
	// influences what runs next, and it can do exactly one thing: re-open the
	// plan's own writing Round. Ignored from a writing Role.
	Verdict string `json:"verdict,omitempty"`
}

// The closed set of verdicts. A reading Run may return one; anything else is
// rejected at the API boundary.
const (
	VerdictApprove        = "approve"
	VerdictRequestChanges = "request_changes"
)

// ValidVerdict reports whether v is empty (no opinion) or a known verdict.
func ValidVerdict(v string) bool {
	return v == "" || v == VerdictApprove || v == VerdictRequestChanges
}

// Usage carries per-run cost/usage a harness can report (backlog #66) and
// the harness-native resume handle (backlog #70). All fields optional.
type Usage struct {
	InputTokens  int64   `json:"inputTokens,omitempty"`
	OutputTokens int64   `json:"outputTokens,omitempty"`
	CostUSD      float64 `json:"costUsd,omitempty"`
	SessionID    string  `json:"sessionId,omitempty"`
}
