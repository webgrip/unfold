// Package clickup is a TrackerProvider for ClickUp, the sibling of
// pkg/provider/vikunja: webhook verification and parsing, plus the API
// write-backs that let a run reach a person (backlog #31).
//
// Write-backs are opt-in by configuration. Without BaseURL and Token the
// provider keeps the logging no-op, because a deployment that has not been
// given a tracker credential must degrade to "the board is not updated"
// rather than to "the run fails".
//
// Three ClickUp shapes differ from Vikunja in ways a copy-paste would get
// wrong:
//
//   - Auth is the raw token in Authorization, with no "Bearer " prefix.
//     ClickUp returns 401 for the prefixed form.
//   - There is no global notion of "done". Status is a per-List string chosen
//     by whoever built the list, so SetStatus needs to be TOLD the name; see
//     DoneStatus.
//   - Priority is inverted. ClickUp's id 1 is urgent and 4 is low, while Ploeg
//     (following Vikunja) treats a higher number as more urgent, so the scale
//     is flipped on the way in rather than leaking backwards ordering.
package clickup

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/webgrip/ploeg/pkg/provider"
	"github.com/webgrip/ploeg/pkg/work"
)

// DefaultBaseURL is ClickUp's public API root.
const DefaultBaseURL = "https://api.clickup.com/api/v2"

type Provider struct {
	// Secret verifies X-Signature (raw-body HMAC-SHA256, hex). Empty disables
	// verification — local development only.
	Secret string
	// DefaultTeam receives assigned items when no assignee mapping matches.
	DefaultTeam string
	// TeamMap resolves tracker assignee usernames (and email addresses,
	// lowercased) to Ploeg team names.
	TeamMap map[string]string
	// BaseURL is the ClickUp API root; empty uses DefaultBaseURL. Reads and
	// write-backs additionally need Token.
	BaseURL string
	// Token is a ClickUp personal token (pk_…) or OAuth access token. Empty
	// disables reads and write-backs (they log and no-op).
	Token string
	// DoneStatus is the List status name SetStatus applies for a finished
	// item, e.g. "complete" or "done". Empty leaves the board untouched and
	// says so: ClickUp statuses are per-List custom strings, so guessing one
	// would either 400 or move the task to a status nobody chose.
	DoneStatus string
	// HC is optional; nil gets a 30s client.
	HC  *http.Client
	Log *slog.Logger
}

func (p *Provider) Name() string { return "clickup" }

// hookPayload is the (tolerantly parsed) ClickUp webhook body. ClickUp sends a
// THIN payload by design — an event name, the task id, and a diff — so almost
// everything here is a trigger rather than state. FetchItem is the truth.
type hookPayload struct {
	Event  string `json:"event"`
	TaskID string `json:"task_id"`
	// HistoryItems describes what changed. Assignee events are the only ones
	// whose detail the parser needs, to route to a team.
	HistoryItems []struct {
		Field string `json:"field"`
		After struct {
			Username string `json:"username"`
			Email    string `json:"email"`
		} `json:"after"`
		Before struct {
			Username string `json:"username"`
			Email    string `json:"email"`
		} `json:"before"`
	} `json:"history_items"`
}

// ParseWebhook verifies the signature against the RAW body before JSON
// parsing (backlog #2) and returns normalized events.
func (p *Provider) ParseWebhook(r *http.Request) ([]provider.TrackerEvent, error) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if p.Secret != "" {
		if !verify(p.Secret, body, r.Header.Get("X-Signature")) {
			return nil, errors.New("invalid webhook signature")
		}
	}

	var pl hookPayload
	if err := json.Unmarshal(body, &pl); err != nil {
		return nil, fmt.Errorf("parse payload: %w", err)
	}
	if pl.TaskID == "" {
		return nil, errors.New("payload has no task")
	}

	// Route on whoever was ADDED as an assignee; on removal the relevant
	// identity is the one that left.
	var actor string
	for _, h := range pl.HistoryItems {
		if h.Field != "assignee" && h.Field != "assignee_add" && h.Field != "assignee_rem" {
			continue
		}
		if a := firstNonEmpty(h.After.Username, h.After.Email); a != "" {
			actor = a
			break
		}
		if b := firstNonEmpty(h.Before.Username, h.Before.Email); b != "" {
			actor = b
			break
		}
	}
	team := p.DefaultTeam
	if t, ok := p.TeamMap[strings.ToLower(actor)]; ok {
		team = t
	}

	// The webhook carries no List, so the Scope — the container the core
	// resolves a Work Target from — is unknown until FetchItem runs. Leaving
	// it empty is honest; inventing one from the task id would be the vendor
	// leak R7 forbids.
	item := &work.WorkItem{
		Provider:   p.Name(),
		ExternalID: pl.TaskID,
		Team:       team,
		Origin:     work.OriginAssignment,
	}

	switch pl.Event {
	case "taskAssigneeUpdated":
		// One ClickUp event covers both directions; the history item's field
		// is what separates them.
		kind := provider.TrackerAssigned
		for _, h := range pl.HistoryItems {
			if h.Field == "assignee_rem" {
				kind = provider.TrackerUnassigned
			}
		}
		return []provider.TrackerEvent{{Kind: kind, ExternalID: pl.TaskID, Team: team, Item: item}}, nil
	case "taskUpdated", "taskStatusUpdated", "taskPriorityUpdated":
		return []provider.TrackerEvent{{Kind: provider.TrackerUpdated, ExternalID: pl.TaskID, Team: team, Item: item}}, nil
	default:
		// Unhandled events are dropped, not errors: providers subscribe wider
		// than the core consumes.
		return nil, nil
	}
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func verify(secret string, body []byte, sigHex string) bool {
	sig, err := hex.DecodeString(strings.TrimSpace(sigHex))
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hmac.Equal(sig, mac.Sum(nil))
}

// configured reports whether API calls are possible at all.
func (p *Provider) configured() bool { return p.Token != "" }

func (p *Provider) baseURL() string {
	if p.BaseURL != "" {
		return strings.TrimRight(p.BaseURL, "/")
	}
	return DefaultBaseURL
}

func (p *Provider) client() *http.Client {
	if p.HC != nil {
		return p.HC
	}
	return &http.Client{Timeout: 30 * time.Second}
}

func (p *Provider) log() *slog.Logger {
	if p.Log != nil {
		return p.Log
	}
	return slog.Default()
}

// do issues one authenticated API call and decodes an optional result.
func (p *Provider) do(ctx context.Context, method, path string, body, out any) error {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, p.baseURL()+path, rdr)
	if err != nil {
		return err
	}
	// Raw token, no "Bearer " — ClickUp 401s the prefixed form.
	req.Header.Set("Authorization", p.Token)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := p.client().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("clickup: %s %s: HTTP %d: %s", method, path, resp.StatusCode, bytes.TrimSpace(snippet))
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(out)
}

// task is the subset of ClickUp's task representation Ploeg mirrors.
type task struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	TextContent string `json:"text_content"`
	DateUpdated string `json:"date_updated"`
	Status      struct {
		Status string `json:"status"`
		Type   string `json:"type"`
	} `json:"status"`
	// Priority is null on an unprioritised task, hence the pointer: a value
	// type would silently read as urgent.
	Priority *struct {
		ID       string `json:"id"`
		Priority string `json:"priority"`
	} `json:"priority"`
	List struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"list"`
}

// FetchItem reads authoritative task state — the thin-payload rule's "truth"
// half (backlog #7), and the only place the List (the Scope) becomes known,
// since ClickUp's webhook does not carry it.
//
// Unconfigured, it errors so the caller falls back to the webhook snapshot.
func (p *Provider) FetchItem(ctx context.Context, externalID string) (work.WorkItem, error) {
	if !p.configured() {
		return work.WorkItem{}, errors.New("clickup: no API credentials configured (falling back to the webhook snapshot)")
	}
	var t task
	if err := p.do(ctx, http.MethodGet, "/task/"+externalID, nil, &t); err != nil {
		return work.WorkItem{}, err
	}
	if t.ID == "" {
		return work.WorkItem{}, fmt.Errorf("clickup: task %s not found", externalID)
	}
	// description is markdown and may be empty where text_content is not.
	desc := t.Description
	if desc == "" {
		desc = t.TextContent
	}
	return work.WorkItem{
		Provider:    p.Name(),
		ExternalID:  t.ID,
		Revision:    t.DateUpdated,
		Origin:      work.OriginAssignment,
		Priority:    priority(t),
		Title:       t.Name,
		Description: desc,
		// The List is ClickUp's own container for the task — the scope the
		// core resolves a Work Target from. Team is the caller's routing
		// decision, not the tracker's view; httpapi.mirror overwrites it.
		ExternalScope: t.List.ID,
	}, nil
}

// priority flips ClickUp's scale. ClickUp: 1 urgent, 2 high, 3 normal, 4 low,
// absent = unset. Ploeg: higher is more urgent, 0 unset.
func priority(t task) int {
	if t.Priority == nil {
		return 0
	}
	switch t.Priority.ID {
	case "1":
		return 4
	case "2":
		return 3
	case "3":
		return 2
	case "4":
		return 1
	}
	// Fall back to the label when the id is missing or unrecognised — the
	// field is user-facing and has been renumbered before.
	switch strings.ToLower(t.Priority.Priority) {
	case "urgent":
		return 4
	case "high":
		return 3
	case "normal":
		return 2
	case "low":
		return 1
	}
	return 0
}

// Scope reports the List a task belongs to, for callers that need the Work
// Target without a full mirror. Empty Scope when unconfigured or unknown.
func (p *Provider) Scope(ctx context.Context, externalID string) (provider.Scope, error) {
	if !p.configured() {
		return provider.Scope{}, errors.New("clickup: no API credentials configured")
	}
	var t task
	if err := p.do(ctx, http.MethodGet, "/task/"+externalID, nil, &t); err != nil {
		return provider.Scope{}, err
	}
	if t.List.ID == "" {
		return provider.Scope{}, nil
	}
	return provider.Scope{Kind: "list", ID: t.List.ID, Name: t.List.Name}, nil
}

// Comment writes back to the task's conversation — how a finished Shift
// reaches a person with the merge request link.
func (p *Provider) Comment(ctx context.Context, externalID, htmlBody string) error {
	if !p.configured() {
		p.log().Info("clickup write-back skipped (no API credentials)", "action", "comment", "external_id", externalID)
		return nil
	}
	// notify_all false: a bot narrating its own runs should not mail everyone
	// watching the task on every round.
	return p.do(ctx, http.MethodPost, "/task/"+externalID+"/comment",
		map[string]any{"comment_text": htmlBody, "notify_all": false}, nil)
}

// SetStatus applies Ploeg's state to the tracker.
//
// Only a terminal state is expressed: needs_human and stale are NOT done — a
// person still owes the item work, and marking it done would hide it from the
// board that raised it. Which status name means done is a per-List decision in
// ClickUp, so it is configuration rather than a guess here (R7).
func (p *Provider) SetStatus(ctx context.Context, externalID string, state work.State) error {
	if !p.configured() {
		p.log().Info("clickup write-back skipped (no API credentials)", "action", "set_status", "external_id", externalID, "state", state)
		return nil
	}
	if state != work.StateDone {
		return nil
	}
	if p.DoneStatus == "" {
		p.log().Info("clickup status write-back skipped (no DoneStatus configured)", "external_id", externalID)
		return nil
	}
	return p.do(ctx, http.MethodPut, "/task/"+externalID,
		map[string]any{"status": p.DoneStatus}, nil)
}

// ListsByName lists a Space's lists as name → id, so configuration can name a
// board the way a human does and ploegd resolves the id — the ClickUp analogue
// of the Vikunja provider's ProjectsByName, and for the same reason: a bare id
// in a values file tells a reader nothing and cannot be reviewed.
func (p *Provider) ListsByName(ctx context.Context, spaceID string) (map[string]string, error) {
	if !p.configured() {
		return nil, errors.New("clickup: no API credentials configured; cannot resolve list names")
	}
	if spaceID == "" {
		return nil, errors.New("clickup: space id is required to list lists")
	}
	var folderless struct {
		Lists []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"lists"`
	}
	// Folderless lists only. Lists inside a Folder are a second call the
	// caller can make per folder; conflating them here would hide which
	// container a name came from when two folders reuse a list name.
	if err := p.do(ctx, http.MethodGet, "/space/"+spaceID+"/list?archived=false", nil, &folderless); err != nil {
		return nil, err
	}
	out := make(map[string]string, len(folderless.Lists))
	for _, l := range folderless.Lists {
		out[l.Name] = l.ID
	}
	return out, nil
}
