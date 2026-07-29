// Package work defines Ploeg's core semantics: work items, leases,
// checkpoints, and outcomes. See docs/design.md §3.
package work

import "time"

// State is the lifecycle position of a WorkItem inside Ploeg.
// The tracker item it mirrors remains the source of truth for content.
type State string

const (
	StateIngested   State = "ingested"
	StateQueued     State = "queued"
	StateLeased     State = "leased"
	StateNeedsHuman State = "needs_human"
	StateStale      State = "stale"
	StateDone       State = "done"
)

// Origin records whether a WorkItem came from the tracker (assignment) or
// from a forge event routed back as a follow-up (R9).
type Origin string

const (
	OriginAssignment Origin = "assignment"
	OriginFollowUp   Origin = "follow_up"
)

// Outcome is the terminal report of a run. Stuck carries a mandatory
// reason and routes to a human queue.
type Outcome string

const (
	OutcomePROpened        Outcome = "pr_opened"
	OutcomePRUpdated       Outcome = "pr_updated"
	OutcomeIssueUpdated    Outcome = "issue_updated"
	OutcomeFollowUpCreated Outcome = "follow_up_created"
	OutcomeStuck           Outcome = "stuck"
	OutcomeFailed          Outcome = "failed"
	OutcomeNoChangeNeeded  Outcome = "no_change_needed"
)

// Valid reports whether o is a known outcome enum value.
func (o Outcome) Valid() bool {
	switch o {
	case OutcomePROpened, OutcomePRUpdated, OutcomeIssueUpdated,
		OutcomeFollowUpCreated, OutcomeStuck, OutcomeFailed, OutcomeNoChangeNeeded:
		return true
	}
	return false
}

// FailureReason classifies why a run failed (agent_runs.failure_reason).
// Set by the worker or sweeper; queried by dashboards and the run-forensics
// view (VIK-597). The empty string means "not a failure" or "unclassified".
type FailureReason string

const (
	FailureInfraNode  FailureReason = "infra_node"
	FailureInfraLLM   FailureReason = "infra_llm"
	FailureAgentError FailureReason = "agent_error"
	FailureBudget     FailureReason = "budget"
	FailureLeaseLost  FailureReason = "lease_lost"
)

// Valid reports whether f is a known failure reason enum value.
func (f FailureReason) Valid() bool {
	switch f {
	case FailureInfraNode, FailureInfraLLM, FailureAgentError, FailureBudget, FailureLeaseLost:
		return true
	}
	return false
}

// WorkItem mirrors one tracker item (provider + external id + revision).
type WorkItem struct {
	ID         string `json:"id"`
	Provider   string `json:"provider"`   // tracker provider name, e.g. "vikunja"
	ExternalID string `json:"externalId"` // provider-scoped id of the tracker item
	Revision   string `json:"revision"`   // provider revision/etag for staleness detection
	Team       string `json:"team"`       // team the item is queued for; empty until assigned
	State      State  `json:"state"`
	Origin     Origin `json:"origin"`
	Priority   int    `json:"priority"` // rank mirrored from the tracker; drives queue order (R10)
	Title      string `json:"title"`
	// Description is the tracker item body (Vikunja sends HTML); the harness
	// adapter composes it into the task prompt.
	Description string `json:"description"`
	URL         string `json:"url"`
	// ExternalScope is the tracker's own container for this item (Vikunja
	// project id) — the input to Target resolution. Recorded even when no
	// mapping matched, so onboarding a repo is one query away.
	ExternalScope string `json:"externalScope,omitempty"`
	// Target is where this item's changes land. Nil = unresolved; the worker
	// then falls back to its env-configured repo. Pointer because encoding/json
	// cannot elide an empty struct.
	Target *Target `json:"target,omitempty"`
	// RouteRule is the id of the routing rule that decided Team and Target,
	// recorded so an audit can answer why this item went where it went.
	RouteRule string    `json:"routeRule,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// Target is where a Work Item's changes land: the forge coordinates a Run
// reads, writes, and opens a PR in. It belongs to the Work Item, never to the
// Team — a Team is a capability manifest (roles, harness, model, budget) and
// names no repository (R11).
//
// A Target is a coordinate, not a connection: it carries a forge *id* to be
// resolved against a forge registry, never a URL and never a credential (R8).
type Target struct {
	Forge      string `json:"forge,omitempty"` // forge registry id; empty = the default forge
	Owner      string `json:"owner"`
	Repo       string `json:"repo"`
	BaseBranch string `json:"baseBranch,omitempty"` // empty = the repo's default branch (VIK-589)
}

// Resolved reports whether the Target names a repository. Owner and Repo are
// atomic: a half-resolved Target is never blended with a fallback, because
// cloning one repo and pushing to another is the worst failure this seam has.
func (t Target) Resolved() bool { return t.Owner != "" && t.Repo != "" }

// Key is the repo-scoped identity used for per-repo serialization (backlog
// #42) and for the (target, branch) reverse lookup that follow-up routing
// needs (R9).
func (t Target) Key() string { return t.Forge + "/" + t.Owner + "/" + t.Repo }

// Lease is a team's crash-safe claim on a work item. Renewed by the
// running Job; expiry releases the item mechanically.
type Lease struct {
	WorkItemID string
	Team       string
	ExpiresAt  time.Time
	RenewedAt  time.Time
}

// Checkpoint is the small durable progress record enabling resume.
// Everything else is re-derived from git/forge state. NodeName and PodUID
// are set from the downward API on the first checkpoint so forensics survive
// pod/job cleanup (VIK-597).
type Checkpoint struct {
	WorkItemID string    `json:"workItemId,omitempty"`
	Phase      string    `json:"phase"` // e.g. "branch_created", "changes_made", "pr_opened"
	Branch     string    `json:"branch,omitempty"`
	PRURL      string    `json:"prUrl,omitempty"`
	NodeName   string    `json:"nodeName,omitempty"`
	PodUID     string    `json:"podUid,omitempty"`
	At         time.Time `json:"at,omitempty"`
}
