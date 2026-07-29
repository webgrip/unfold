// Package vikunja is the reference TrackerProvider (design §4): webhook
// verification and parsing, plus the API write-backs that let a run reach a
// person (backlog #31).
//
// Write-backs are opt-in by configuration. Without BaseURL and Token the
// provider keeps the prototype's logging no-op, because a deployment that has
// not been given a tracker credential must degrade to "the board is not
// updated" rather than to "the run fails".
package vikunja

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

type Provider struct {
	// Secret verifies X-Vikunja-Signature (raw-body HMAC-SHA256, hex).
	// Empty disables verification — local development only.
	Secret string
	// DefaultTeam receives assigned items when no assignee mapping matches.
	DefaultTeam string
	// TeamMap resolves tracker assignee usernames to Ploeg team names.
	TeamMap map[string]string
	// BaseURL is the Vikunja API root, e.g. https://vikunja.example/api/v1.
	// Empty disables reads and write-backs (they log and no-op).
	BaseURL string
	// Token is a Vikunja API token. Empty disables reads and write-backs.
	Token string
	// HC is optional; nil gets a 30s client.
	HC  *http.Client
	Log *slog.Logger
}

func (p *Provider) Name() string { return "vikunja" }

// payload is the (tolerantly parsed) Vikunja webhook body.
type payload struct {
	EventName string `json:"event_name"`
	Data      struct {
		Task struct {
			ID          int64  `json:"id"`
			Title       string `json:"title"`
			Description string `json:"description"`
			Priority    int    `json:"priority"`
			// ProjectID is the Vikunja project the task lives in — the scope
			// the core resolves a Work Target from. Vikunja always sends it on
			// task events; a payload without it yields an empty Scope, which
			// resolves to no Target and falls back to the worker's env repo.
			ProjectID int64 `json:"project_id"`
		} `json:"task"`
		Assignee struct {
			Username string `json:"username"`
		} `json:"assignee"`
	} `json:"data"`
}

// ParseWebhook verifies the signature against the RAW body before JSON
// parsing (backlog #2) and returns normalized events.
func (p *Provider) ParseWebhook(r *http.Request) ([]provider.TrackerEvent, error) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if p.Secret != "" {
		sig := r.Header.Get("X-Vikunja-Signature")
		if !verify(p.Secret, body, sig) {
			return nil, errors.New("invalid webhook signature")
		}
	}

	var pl payload
	if err := json.Unmarshal(body, &pl); err != nil {
		return nil, fmt.Errorf("parse payload: %w", err)
	}
	if pl.Data.Task.ID == 0 {
		return nil, errors.New("payload has no task")
	}

	externalID := fmt.Sprint(pl.Data.Task.ID)
	team := p.DefaultTeam
	if t, ok := p.TeamMap[strings.ToLower(pl.Data.Assignee.Username)]; ok {
		team = t
	}
	// The project is Vikunja's own container for the task. The core treats it
	// as an opaque scope and maps it to a Work Target; this adapter must not
	// know what a repository is (R7).
	var scope provider.Scope
	if pl.Data.Task.ProjectID != 0 {
		scope = provider.Scope{Kind: "project", ID: fmt.Sprint(pl.Data.Task.ProjectID)}
	}
	item := &work.WorkItem{
		Provider:      p.Name(),
		ExternalID:    externalID,
		Team:          team,
		Origin:        work.OriginAssignment,
		Priority:      pl.Data.Task.Priority,
		Title:         pl.Data.Task.Title,
		Description:   pl.Data.Task.Description,
		ExternalScope: scope.ID,
	}

	switch pl.EventName {
	case "task.assignee.created":
		return []provider.TrackerEvent{{Kind: provider.TrackerAssigned, ExternalID: externalID, Team: team, Scope: scope, Item: item}}, nil
	case "task.assignee.deleted":
		return []provider.TrackerEvent{{Kind: provider.TrackerUnassigned, ExternalID: externalID, Team: team, Scope: scope, Item: item}}, nil
	case "task.updated":
		return []provider.TrackerEvent{{Kind: provider.TrackerUpdated, ExternalID: externalID, Team: team, Scope: scope, Item: item}}, nil
	default:
		// Unhandled events are dropped, not errors: providers subscribe wider
		// than the core consumes.
		return nil, nil
	}
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
func (p *Provider) configured() bool { return p.BaseURL != "" && p.Token != "" }

func (p *Provider) client() *http.Client {
	if p.HC != nil {
		return p.HC
	}
	return &http.Client{Timeout: 30 * time.Second}
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
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(p.BaseURL, "/")+path, rdr)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+p.Token)
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
		return fmt.Errorf("vikunja: %s %s: HTTP %d: %s", method, path, resp.StatusCode, bytes.TrimSpace(snippet))
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(out)
}

// FetchItem reads authoritative task state — the thin-payload rule's "truth"
// half (backlog #7). Unconfigured, it errors so the caller falls back to the
// webhook snapshot, which is exactly the prototype's behaviour.
func (p *Provider) FetchItem(ctx context.Context, externalID string) (work.WorkItem, error) {
	if !p.configured() {
		return work.WorkItem{}, errors.New("vikunja: no API credentials configured (falling back to the webhook snapshot)")
	}
	var task struct {
		ID          int64  `json:"id"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Priority    int    `json:"priority"`
		ProjectID   int64  `json:"project_id"`
		Updated     string `json:"updated"`
	}
	if err := p.do(ctx, http.MethodGet, "/tasks/"+externalID, nil, &task); err != nil {
		return work.WorkItem{}, err
	}
	if task.ID == 0 {
		return work.WorkItem{}, fmt.Errorf("vikunja: task %s not found", externalID)
	}
	return work.WorkItem{
		Provider:    p.Name(),
		ExternalID:  fmt.Sprint(task.ID),
		Revision:    task.Updated,
		Origin:      work.OriginAssignment,
		Priority:    task.Priority,
		Title:       task.Title,
		Description: task.Description,
		// Team and ExternalScope are the caller's routing decision, not the
		// tracker's view of the task; httpapi.mirror overwrites them.
	}, nil
}

// Comment writes back to the task's conversation — how a finished Shift
// reaches a person with the pull request link.
//
// Creation is PUT, not POST (docs/ops/board.md): Vikunja uses PUT for
// creating assignees, labels and comments, and a POST here silently does
// something else.
func (p *Provider) Comment(ctx context.Context, externalID, htmlBody string) error {
	if !p.configured() {
		p.log().Info("vikunja write-back skipped (no API credentials)", "action", "comment", "external_id", externalID)
		return nil
	}
	return p.do(ctx, http.MethodPut, "/tasks/"+externalID+"/comments",
		map[string]string{"comment": htmlBody}, nil)
}

// SetStatus applies Ploeg's state to the tracker.
//
// Only a terminal state is expressed, and only as "done or not": Vikunja has
// no column for needs_human, and inventing a label mapping here would put a
// Ploeg concept inside the provider (R7). The state that actually matters to
// a human — why it stopped, and the PR to look at — travels in the comment.
func (p *Provider) SetStatus(ctx context.Context, externalID string, state work.State) error {
	if !p.configured() {
		p.log().Info("vikunja write-back skipped (no API credentials)", "action", "set_status", "external_id", externalID, "state", state)
		return nil
	}
	// needs_human and stale are NOT done: a person still owes the item work,
	// and marking it done would hide it from the board that raised it.
	if state != work.StateDone {
		return nil
	}
	return p.do(ctx, http.MethodPost, "/tasks/"+externalID,
		map[string]any{"id": externalID, "done": true}, nil)
}

func (p *Provider) log() *slog.Logger {
	if p.Log != nil {
		return p.Log
	}
	return slog.Default()
}

// ProjectsByName lists the tracker's projects as name → id, so configuration
// can name a board the way a human does and ploegd resolves the number.
//
// This is what lets cluster config say `name: "Ploeg Test"` instead of `11`.
// A bare id in a values file tells a reader nothing, cannot be reviewed, and
// silently routes work to the wrong repository the day a project is rebuilt
// with a new one.
func (p *Provider) ProjectsByName(ctx context.Context) (map[string]string, error) {
	if !p.configured() {
		return nil, errors.New("vikunja: no API credentials configured; cannot resolve project names")
	}
	var projects []struct {
		ID    int64  `json:"id"`
		Title string `json:"title"`
	}
	// The instance page cap exceeds Vikunja's default 50 (docs/ops/board.md).
	if err := p.do(ctx, http.MethodGet, "/projects?per_page=200", nil, &projects); err != nil {
		return nil, err
	}
	out := make(map[string]string, len(projects))
	for _, pr := range projects {
		out[pr.Title] = fmt.Sprint(pr.ID)
	}
	return out, nil
}
