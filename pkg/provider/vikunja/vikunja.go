// Package vikunja is the reference TrackerProvider (design §4). The
// prototype implements webhook verification and parsing; API write-backs
// (Comment, SetStatus) and authoritative reads (FetchItem) log and no-op
// until the Vikunja client lands (backlog #31).
package vikunja

import (
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
	Log     *slog.Logger
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
	item := &work.WorkItem{
		Provider:    p.Name(),
		ExternalID:  externalID,
		Team:        team,
		Origin:      work.OriginAssignment,
		Priority:    pl.Data.Task.Priority,
		Title:       pl.Data.Task.Title,
		Description: pl.Data.Task.Description,
	}

	switch pl.EventName {
	case "task.assignee.created":
		return []provider.TrackerEvent{{Kind: provider.TrackerAssigned, ExternalID: externalID, Team: team, Item: item}}, nil
	case "task.assignee.deleted":
		return []provider.TrackerEvent{{Kind: provider.TrackerUnassigned, ExternalID: externalID, Team: team, Item: item}}, nil
	case "task.updated":
		return []provider.TrackerEvent{{Kind: provider.TrackerUpdated, ExternalID: externalID, Team: team, Item: item}}, nil
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

func (p *Provider) FetchItem(ctx context.Context, externalID string) (work.WorkItem, error) {
	return work.WorkItem{}, errors.New("vikunja: FetchItem not implemented (prototype uses the webhook snapshot)")
}

func (p *Provider) Comment(ctx context.Context, externalID, htmlBody string) error {
	p.log().Info("vikunja write-back (no-op in prototype)", "action", "comment", "external_id", externalID)
	return nil
}

func (p *Provider) SetStatus(ctx context.Context, externalID string, state work.State) error {
	p.log().Info("vikunja write-back (no-op in prototype)", "action", "set_status", "external_id", externalID, "state", state)
	return nil
}

func (p *Provider) log() *slog.Logger {
	if p.Log != nil {
		return p.Log
	}
	return slog.Default()
}
