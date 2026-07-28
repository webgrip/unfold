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
	Description string    `json:"description"`
	URL         string    `json:"url"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

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
