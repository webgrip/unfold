// Package provider defines Ploeg's SPI. Everything vendor-specific lives
// behind these two interfaces; the core never assumes a vendor.
// Stability of this package is the project's compatibility promise.
// See docs/design.md §4.
package provider

import (
	"context"
	"net/http"

	"github.com/webgrip/ploeg/pkg/work"
)

// TrackerEventKind is a normalized tracker event.
type TrackerEventKind string

const (
	TrackerAssigned   TrackerEventKind = "assigned"
	TrackerUpdated    TrackerEventKind = "updated"
	TrackerUnassigned TrackerEventKind = "unassigned"
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
)

// ForgeEvent is the normalized result of parsing a forge webhook.
type ForgeEvent struct {
	Kind   ForgeEventKind
	Repo   string
	PR     int
	Branch string
	Body   string // feedback payload for classification
}

// ForgeProvider adapts one git forge (reference: Forgejo).
type ForgeProvider interface {
	Name() string
	ParseWebhook(r *http.Request) ([]ForgeEvent, error)
	Comment(ctx context.Context, repo string, pr int, body string) error
}
