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

// FailureReason classifies the root cause of a failed or stuck run for
// forensics — persisted in agent_runs.failure_reason (VIK-597).
type FailureReason string

const (
	FailureReasonInfraNode  FailureReason = "infra_node"
	FailureReasonInfraLLM   FailureReason = "infra_llm"
	FailureReasonAgentError FailureReason = "agent_error"
	FailureReasonBudget     FailureReason = "budget"
	FailureReasonLeaseLost  FailureReason = "lease_lost"
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
// Everything else is re-derived from git/forge state.
// NodeName and PodUID carry the downward-API identity (VIK-597) so that
// even after job/pod cleanup the compute identity survives in Postgres.
type Checkpoint struct {
	WorkItemID string    `json:"workItemId,omitempty"`
	Phase      string    `json:"phase"` // e.g. "branch_created", "changes_made", "pr_opened"
	Branch     string    `json:"branch,omitempty"`
	PRURL      string    `json:"prUrl,omitempty"`
	NodeName   string    `json:"nodeName,omitempty"`  // downward API: spec.nodeName
	PodUID     string    `json:"podUid,omitempty"`    // downward API: metadata.uid
	At         time.Time `json:"at,omitempty"`
}
