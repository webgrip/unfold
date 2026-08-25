// Package gitlab is a ForgeProvider for GitLab (self-managed or gitlab.com),
// the sibling of pkg/provider/forgejo. It does the same two things and
// deliberately no more: publish a note on a merge request, and normalize an
// inbound forge webhook. Everything GitLab-shaped stays here — no REST path,
// header name or payload field belongs outside this package (R7).
//
// Two things differ from Forgejo in ways that matter, and both are places a
// copy-paste of the Forgejo provider would be silently wrong:
//
//   - GitLab does NOT sign webhooks. It echoes a shared secret verbatim in
//     X-Gitlab-Token; there is no HMAC over the body. That is a weaker
//     guarantee — it authenticates the sender, not the payload — so the
//     comparison is constant-time and the secret should be per-hook.
//   - A merge request has two numbers. `id` is instance-global and useless in
//     a URL; `iid` is the per-project number a human sees and the only one the
//     API accepts. This package uses iid throughout.
package gitlab

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/webgrip/ploeg/pkg/provider"
)

// Provider talks to one GitLab instance as one identity.
type Provider struct {
	// BaseURL is the instance root, e.g. https://gitlab.example.com
	// (no trailing slash, no /api/v4 — this package appends it).
	BaseURL string
	// Token authenticates write-backs, sent as PRIVATE-TOKEN. A project
	// access token or bot PAT with `api` scope; commenting is not pushing, so
	// this needs no push right.
	Token string
	// Secret is compared against X-Gitlab-Token. Empty disables verification —
	// local development only.
	Secret string
	// HC is optional; nil gets a 30s client.
	HC  *http.Client
	Log *slog.Logger
}

func (p *Provider) Name() string { return "gitlab" }

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

// Comment posts a note on a merge request's conversation.
//
// repo is "owner/name" — or any depth of GitLab subgroup, e.g.
// "group/subgroup/project", which is why this validates a separator rather
// than splitting into exactly two parts the way the Forgejo provider can.
// GitLab addresses a project by URL-encoded full path, so the slashes become
// %2F and the whole path is one path segment.
//
// mr is the merge request IID, not its global id.
func (p *Provider) Comment(ctx context.Context, repo string, mr int, body string) error {
	if err := validRepo(repo); err != nil {
		return err
	}
	if mr <= 0 {
		return fmt.Errorf("gitlab: merge request iid must be positive, got %d", mr)
	}
	payload, err := json.Marshal(map[string]string{"body": body})
	if err != nil {
		return err
	}
	endpoint := fmt.Sprintf("%s/api/v4/projects/%s/merge_requests/%d/notes",
		strings.TrimRight(p.BaseURL, "/"), url.PathEscape(repo), mr)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if p.Token != "" {
		req.Header.Set("PRIVATE-TOKEN", p.Token)
	}
	resp, err := p.client().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// The body carries the reason (archived project, no permission, wrong
		// iid); the token never appears in it, and it is bounded before use.
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("gitlab: note on %s!%d: HTTP %d: %s", repo, mr, resp.StatusCode, bytes.TrimSpace(snippet))
	}
	return nil
}

// validRepo rejects paths GitLab cannot address, before a request is spent.
func validRepo(repo string) error {
	if repo == "" || !strings.Contains(repo, "/") {
		return fmt.Errorf("gitlab: repo %q must be a project path like owner/name", repo)
	}
	for _, seg := range strings.Split(repo, "/") {
		if seg == "" {
			return fmt.Errorf("gitlab: repo %q has an empty path segment", repo)
		}
	}
	return nil
}

// hook is the tolerantly-parsed subset of a GitLab webhook body. Fields absent
// from a given event stay zero; the switch below decides what that means
// rather than the decoder.
type hook struct {
	ObjectKind string `json:"object_kind"`
	Project    struct {
		PathWithNamespace string `json:"path_with_namespace"`
	} `json:"project"`
	ObjectAttributes struct {
		IID          int    `json:"iid"`
		Action       string `json:"action"`
		SourceBranch string `json:"source_branch"`
		// MergeStatus is "can_be_merged", "cannot_be_merged" or "unchecked".
		MergeStatus string `json:"merge_status"`
		// Note events carry the comment body here; pipeline events carry a
		// status and a ref instead.
		Note   string `json:"note"`
		Status string `json:"status"`
		Ref    string `json:"ref"`
	} `json:"object_attributes"`
	// Note and pipeline events nest the merge request they belong to.
	MergeRequest struct {
		IID          int    `json:"iid"`
		SourceBranch string `json:"source_branch"`
		MergeStatus  string `json:"merge_status"`
	} `json:"merge_request"`
}

// ParseWebhook authenticates the sender, then normalizes.
//
// Events Ploeg does not act on are dropped without error: a forge subscribes
// wider than the core consumes, and erroring would turn every unrelated push
// into a failed delivery that GitLab then disables the hook over.
func (p *Provider) ParseWebhook(r *http.Request) ([]provider.ForgeEvent, error) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if p.Secret != "" {
		// Constant time: this is a bare secret comparison, not a MAC, so a
		// naive == would leak it a byte at a time to a patient caller.
		got := r.Header.Get("X-Gitlab-Token")
		if subtle.ConstantTimeCompare([]byte(got), []byte(p.Secret)) != 1 {
			return nil, errors.New("invalid webhook token")
		}
	}

	var h hook
	if err := json.Unmarshal(body, &h); err != nil {
		return nil, fmt.Errorf("parse payload: %w", err)
	}

	repo := h.Project.PathWithNamespace
	if repo == "" {
		return nil, nil
	}

	switch h.ObjectKind {
	// A comment. Only notes ON a merge request are feedback on a branch;
	// notes on issues, snippets and commits are not, and they arrive on the
	// same hook.
	case "note":
		if h.MergeRequest.IID == 0 {
			return nil, nil
		}
		return []provider.ForgeEvent{{
			Kind: provider.ForgeReviewSubmitted, Repo: repo, PR: h.MergeRequest.IID,
			Branch: h.MergeRequest.SourceBranch, Body: h.ObjectAttributes.Note,
		}}, nil

	case "merge_request":
		iid := h.ObjectAttributes.IID
		if iid == 0 {
			return nil, nil
		}
		branch := h.ObjectAttributes.SourceBranch
		switch {
		// GitLab expresses review outcomes as MR actions rather than a review
		// object. Classifying approve-vs-reject is the follow-up's job, not
		// the parser's — the same split the Forgejo provider makes.
		case h.ObjectAttributes.Action == "approved" || h.ObjectAttributes.Action == "unapproved":
			return []provider.ForgeEvent{{
				Kind: provider.ForgeReviewSubmitted, Repo: repo, PR: iid, Branch: branch,
				Body: h.ObjectAttributes.Action,
			}}, nil
		// The branch stopped being mergeable — conflicts, usually.
		case h.ObjectAttributes.MergeStatus == "cannot_be_merged":
			return []provider.ForgeEvent{{
				Kind: provider.ForgeMergeStateDirty, Repo: repo, PR: iid, Branch: branch,
			}}, nil
		}
		return nil, nil

	// A failed pipeline. `merge_request` is present only for MR pipelines; a
	// branch pipeline reports PR 0, which the core reads as "no pull request
	// to route this to" rather than as merge request zero.
	case "pipeline":
		if h.ObjectAttributes.Status != "failed" {
			return nil, nil
		}
		branch := h.MergeRequest.SourceBranch
		if branch == "" {
			branch = h.ObjectAttributes.Ref
		}
		return []provider.ForgeEvent{{
			Kind: provider.ForgeCheckFailed, Repo: repo, PR: h.MergeRequest.IID,
			Branch: branch, Body: h.ObjectAttributes.Status,
		}}, nil
	}
	return nil, nil
}
