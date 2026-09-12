package forgebroker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// namePrefix marks every token this package mints, so the boot sweep can tell
// ours from a human's without a registry. Same trick as the LiteLLM alias.
const namePrefix = "ploeg-run-"

// Forgejo mints Forgejo access tokens through the admin API.
//
// Scoping: Forgejo grants scopes per token (`write:repository`), and the
// tokens are owned by the user they are minted for — the agent-builder bot.
// That bot is already limited to the repositories the factory may touch, so
// a minted token is bounded by BOTH the scope list and the bot's own access.
// Per-repository token scoping is not expressible in Forgejo's token API, so
// the repository field of MintRequest is recorded in the token NAME for
// audit rather than enforced by the forge — an honest limitation, and the
// reason the bot's own repo access still matters.
type Forgejo struct {
	// BaseURL is the instance root.
	BaseURL string
	// AdminUser is the bot whose tokens are minted (agent-builder).
	AdminUser string
	// AdminToken must carry `write:admin`-equivalent rights to create tokens
	// for AdminUser. It lives ONLY in ploegd, never in a worker pod (R6) —
	// the same escalation ADR-0013 accepts explicitly, mirroring how
	// LITELLM_MASTER_KEY is held.
	AdminToken string
	HC         *http.Client
}

func (f *Forgejo) client() *http.Client {
	if f.HC != nil {
		return f.HC
	}
	return &http.Client{Timeout: 30 * time.Second}
}

func (f *Forgejo) do(ctx context.Context, method, path string, body, out any) error {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(f.BaseURL, "/")+path, rdr)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "token "+f.AdminToken)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := f.client().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("forgejo token API: %s %s: HTTP %d: %s",
			method, path, resp.StatusCode, bytes.TrimSpace(snippet))
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(out)
}

// tokenName encodes the run and the repository it was minted for. Readable in
// the forge UI and parseable by the sweep; the run prefix is the same 12 hex
// that joins spend to ticket in Grafana.
func tokenName(runToken, owner, repo string) string {
	id := runToken
	if len(id) > 12 {
		id = id[:12]
	}
	return fmt.Sprintf("%s%s-%s-%s", namePrefix, id, owner, repo)
}

func (f *Forgejo) Mint(ctx context.Context, req MintRequest) (Credential, error) {
	if req.Owner == "" || req.Repo == "" {
		return Credential{}, fmt.Errorf("forgebroker: a per-run token needs a repository")
	}
	name := tokenName(req.RunToken, req.Owner, req.Repo)
	var out struct {
		ID     int64    `json:"id"`
		Name   string   `json:"name"`
		Sha1   string   `json:"sha1"`
		Scopes []string `json:"scopes"`
	}
	// write:repository covers clone, push and the pull-request API — what a
	// writing Run does and nothing else. No admin, no user, no org scope.
	body := map[string]any{
		"name":   name,
		"scopes": []string{"write:repository"},
	}
	if err := f.do(ctx, http.MethodPost,
		"/api/v1/admin/users/"+f.AdminUser+"/tokens", body, &out); err != nil {
		return Credential{}, err
	}
	if out.Sha1 == "" {
		return Credential{}, fmt.Errorf("forgebroker: forge returned no token for %q", name)
	}
	return Credential{ID: fmt.Sprint(out.ID), Token: out.Sha1, Name: name}, nil
}

func (f *Forgejo) Revoke(ctx context.Context, cred Credential) error {
	target := cred.Name
	if target == "" {
		target = cred.ID
	}
	if target == "" {
		return nil // nothing was minted (Static, or a mint that failed)
	}
	err := f.do(ctx, http.MethodDelete,
		"/api/v1/admin/users/"+f.AdminUser+"/tokens/"+target, nil, nil)
	// An already-deleted token is the desired end state, not a failure: the
	// sweeper and the worker's defer both revoke, and they race by design.
	if err != nil && strings.Contains(err.Error(), "HTTP 404") {
		return nil
	}
	return err
}

// RevokeByID satisfies Sweeper. Forgejo deletes by name or id; the lease row
// stores whichever the mint returned.
func (f *Forgejo) RevokeByID(ctx context.Context, id string) error {
	return f.Revoke(ctx, Credential{ID: id})
}

// SweepOrphans revokes every ploeg-minted token whose id is not in aliveIDs.
// The boot-time backstop for a ploegd that died between minting and recording
// — the same reconciliation the LiteLLM sweeper does for spend.
func (f *Forgejo) SweepOrphans(ctx context.Context, aliveIDs []string) (int, error) {
	var tokens []struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
	}
	if err := f.do(ctx, http.MethodGet,
		"/api/v1/admin/users/"+f.AdminUser+"/tokens", nil, &tokens); err != nil {
		return 0, err
	}
	alive := make(map[string]bool, len(aliveIDs))
	for _, id := range aliveIDs {
		alive[id] = true
	}
	revoked := 0
	for _, t := range tokens {
		// Only ever touch tokens this package minted. A human's personal
		// token on the same bot must survive a sweep.
		if !strings.HasPrefix(t.Name, namePrefix) {
			continue
		}
		if alive[fmt.Sprint(t.ID)] {
			continue
		}
		if err := f.Revoke(ctx, Credential{ID: fmt.Sprint(t.ID), Name: t.Name}); err != nil {
			return revoked, err
		}
		revoked++
	}
	return revoked, nil
}
