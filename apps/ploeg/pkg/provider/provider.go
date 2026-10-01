// Package provider defines Ploeg's SPI. Everything vendor-specific lives
// behind these two interfaces; the core never assumes a vendor.
// Stability of this package is the project's compatibility promise.
// See docs/design.md §4.
package provider

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/webgrip/ploeg/pkg/work"
)

// TrackerEventKind is a normalized tracker event.
type TrackerEventKind string

const (
	TrackerAssigned   TrackerEventKind = "assigned"
	TrackerUpdated    TrackerEventKind = "updated"
	TrackerUnassigned TrackerEventKind = "unassigned"
	// TrackerClosed is an item marked done or closed in the tracker.
	TrackerClosed TrackerEventKind = "closed"
)

// TrackerEvent is the normalized result of parsing a tracker webhook.
type TrackerEvent struct {
	Kind       TrackerEventKind
	ExternalID string
	Team       string // resolved assignee → team name, when applicable
	// Scope is the vendor's own container for this item — a Vikunja project
	// id, a Jira project key, a GitHub repository. It is OPAQUE to the core,
	// which only ever compares it for equality; interpreting it here would be
	// the vendor leak R7 forbids. Empty when the provider has no such concept.
	Scope Scope
	// Item is the payload's snapshot of the tracker item — the fallback when
	// FetchItem cannot supply authoritative state (thin-payload rule: the
	// webhook is a trigger, the provider read is the truth).
	Item *work.WorkItem
}

// Scope is a provider-scoped container id: the vendor's own answer to "which
// body of work does this belong to". Ploeg compares Scopes; it never parses
// them.
type Scope struct {
	Kind string // provider-defined: "project", "board", "repo", "list"
	ID   string // provider-scoped, opaque
	Name string // human label for audit and logs — NEVER a routing key
}

// TrackerProvider adapts one task-management system (reference: Vikunja).
type TrackerProvider interface {
	Name() string
	// ParseWebhook verifies the request signature and returns normalized events.
	ParseWebhook(r *http.Request) ([]TrackerEvent, error)
	// FetchItem reads the authoritative item for mirroring into a WorkItem.
	FetchItem(ctx context.Context, externalID string) (work.WorkItem, error)
	// Comment writes an audited comment back to the tracker item.
	Comment(ctx context.Context, externalID, htmlBody string) error
	// SetStatus applies the provider's mapping of Ploeg states (label, column…).
	SetStatus(ctx context.Context, externalID string, state work.State) error
}

// ForgeEventKind is a normalized forge event relevant to follow-up routing.
type ForgeEventKind string

const (
	ForgeReviewSubmitted ForgeEventKind = "review_submitted"
	ForgeCheckFailed     ForgeEventKind = "check_failed"
	ForgeMergeStateDirty ForgeEventKind = "merge_state_dirty"
	// ForgePRMerged reports that a pull request was merged.
	ForgePRMerged ForgeEventKind = "pr_merged"
	// ForgePRClosed reports that a pull request was closed without merging.
	ForgePRClosed ForgeEventKind = "pr_closed"
)

// PullRequestState is a forge's answer to "what happened to this pull request".
type PullRequestState string

const (
	PullRequestOpen   PullRequestState = "open"
	PullRequestMerged PullRequestState = "merged"
	PullRequestClosed PullRequestState = "closed"
)

// ForgeReviewState is a submitted review's verdict, normalized from the
// forge's own vocabulary.
type ForgeReviewState string

const (
	ForgeReviewApproved         ForgeReviewState = "approved"
	ForgeReviewChangesRequested ForgeReviewState = "changes_requested"
	ForgeReviewCommented        ForgeReviewState = "commented"
)

// ForgeEvent is the normalized result of parsing a forge webhook.
type ForgeEvent struct {
	Kind   ForgeEventKind
	Repo   string
	PR     int
	Branch string
	Body   string // feedback payload for classification
	// Actor is the forge login that caused the event. Empty when the forge
	// did not say.
	Actor string
	// Review is the verdict of a ForgeReviewSubmitted event. Empty when the
	// provider cannot classify it.
	Review ForgeReviewState
	// PullRequest is what the payload said about the pull request itself:
	// its head for every event, and the merge or close facts for
	// ForgePRMerged and ForgePRClosed (ADR-0045).
	PullRequest PullRequestFacts
}

// PullRequestFacts is what a forge reports about one pull request. A zero
// field is a fact the forge did not report.
type PullRequestFacts struct {
	State          PullRequestState
	HeadSHA        string
	MergeCommitSHA string
	MergedAt       *time.Time
	MergedBy       string
	ClosedAt       *time.Time
}

// ParseForgeTime reads a forge timestamp in RFC 3339 or GitLab's older
// "2006-01-02 15:04:05 UTC" form. It returns nil for an empty or unreadable
// value, so a timestamp the forge did not give stays unknown.
func ParseForgeTime(s string) *time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05 MST", "2006-01-02 15:04:05 -0700"} {
		if t, err := time.Parse(layout, s); err == nil {
			utc := t.UTC()
			return &utc
		}
	}
	return nil
}

// Comment is one conversation comment on a pull request, as the forge reports
// it. ID is the forge's own comment identifier, used to edit it in place.
type Comment struct {
	ID   int64
	Body string
}

// ForgeProvider adapts one git forge (reference: Forgejo).
type ForgeProvider interface {
	Name() string
	ParseWebhook(r *http.Request) ([]ForgeEvent, error)
	Comment(ctx context.Context, repo string, pr int, body string) error
	// Comments lists a pull request's conversation comments, oldest-first.
	// Implementations return the WHOLE thread, following pagination to
	// exhaustion: a caller that looks for a marker on any page must not miss
	// one the forge put on a later page.
	Comments(ctx context.Context, repo string, pr int) ([]Comment, error)
	// EditComment replaces the body of one existing comment.
	EditComment(ctx context.Context, repo string, pr int, id int64, body string) error
	// PullRequestState reads whether a pull request is open, merged, or closed
	// without merging. repo is the forge's project path; pr is the number a
	// human sees in the forge's UI.
	PullRequestState(ctx context.Context, repo string, pr int) (PullRequestState, error)
	// PullRequestFacts reads the same pull request with its head and, once
	// it left the open state, its merge or close facts (ADR-0045).
	PullRequestFacts(ctx context.Context, repo string, pr int) (PullRequestFacts, error)
}
