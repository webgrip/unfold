package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// PullRequestFacts is what Ploeg learned about one pull request from a forge
// webhook or a forge read (ADR-0045). Empty strings and nil times are facts
// the forge did not report, and recording them never erases a known value.
type PullRequestFacts struct {
	// Forge is the forge dialect, as provider.ForgeProvider.Name returns it.
	Forge string
	// Repo is owner/name. A GitLab owner may itself contain slashes; the
	// last segment is the name.
	Repo   string
	Number int
	Branch string
	// WorkItemID names the Work Item when the caller knows it. Zero resolves
	// it from the newest Shift on Branch in Repo, and failing that from an
	// earlier record of the same pull request.
	WorkItemID int64
	// State is open, merged, closed or empty. A merged pull request stays
	// merged whatever is recorded after it.
	State          string
	HeadSHA        string
	MergeCommitSHA string
	MergedAt       *time.Time
	MergedBy       string
	ClosedAt       *time.Time
	// Review is set when the event was a submitted review.
	Review *PullRequestReview
}

// PullRequestReview is one review a forge reported on a pull request. State
// is approved, changes_requested, commented or empty when the forge did not
// classify it.
type PullRequestReview struct {
	Reviewer string
	State    string
	HeadSHA  string
}

// RecordPullRequestFacts stores f against its Work Item. It reports false,
// and stores nothing, when the pull request belongs to no Ploeg Work Item.
func (s *Store) RecordPullRequestFacts(ctx context.Context, f PullRequestFacts) (bool, error) {
	owner, name, ok := splitRepo(f.Repo)
	if !ok || f.Number <= 0 || f.Forge == "" {
		return false, nil
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	workItemID := f.WorkItemID
	var shiftID *int64
	switch {
	case workItemID != 0:
		err = tx.QueryRow(ctx, `SELECT id FROM shifts WHERE work_item_id = $1 ORDER BY id DESC LIMIT 1`, workItemID).Scan(&shiftID)
	case f.Branch != "":
		err = tx.QueryRow(ctx, `
			SELECT CASE WHEN i.source_run_id IS NULL THEN COALESCE(i.source_work_item_id, i.id) ELSE i.id END, sh.id
			FROM shifts sh JOIN work_items i ON i.id = sh.work_item_id
			WHERE sh.branch = $1 AND i.target_owner <> ''
			  AND i.target_owner || '/' || i.target_repo = $2
			ORDER BY sh.id DESC LIMIT 1`, f.Branch, f.Repo).Scan(&workItemID, &shiftID)
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}
	if workItemID == 0 {
		err := tx.QueryRow(ctx, `SELECT work_item_id FROM pull_requests
			WHERE forge = $1 AND repo_owner = $2 AND repo_name = $3 AND number = $4`,
			f.Forge, owner, name, f.Number).Scan(&workItemID)
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
	}

	var id int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO pull_requests (forge, repo_owner, repo_name, number, work_item_id, shift_id, branch,
			state, head_sha, merge_commit_sha, merged_at, merged_by, closed_at)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF(left($7, 1024), ''), NULLIF($8, ''), NULLIF(left($9, 128), ''),
			NULLIF(left($10, 128), ''), $11, NULLIF(left($12, 256), ''), $13)
		ON CONFLICT (forge, repo_owner, repo_name, number) DO UPDATE SET
			shift_id = COALESCE(EXCLUDED.shift_id, pull_requests.shift_id),
			branch = COALESCE(EXCLUDED.branch, pull_requests.branch),
			state = CASE WHEN pull_requests.state = 'merged' THEN 'merged'
				ELSE COALESCE(EXCLUDED.state, pull_requests.state) END,
			head_sha = COALESCE(EXCLUDED.head_sha, pull_requests.head_sha),
			merge_commit_sha = COALESCE(EXCLUDED.merge_commit_sha, pull_requests.merge_commit_sha),
			merged_at = COALESCE(pull_requests.merged_at, EXCLUDED.merged_at),
			merged_by = COALESCE(pull_requests.merged_by, EXCLUDED.merged_by),
			closed_at = COALESCE(EXCLUDED.closed_at, pull_requests.closed_at),
			updated_at = now()
		RETURNING id`,
		f.Forge, owner, name, f.Number, workItemID, shiftID, f.Branch,
		knownValue(f.State, "open", "merged", "closed"), f.HeadSHA, f.MergeCommitSHA,
		f.MergedAt, f.MergedBy, f.ClosedAt).Scan(&id); err != nil {
		return false, err
	}
	if f.Review != nil {
		if _, err := tx.Exec(ctx, `
			INSERT INTO pull_request_reviews (pull_request_id, reviewer, state, head_sha)
			VALUES ($1, left($2, 256), NULLIF($3, ''), NULLIF(left($4, 128), ''))`,
			id, f.Review.Reviewer, knownValue(f.Review.State, "approved", "changes_requested", "commented"),
			f.Review.HeadSHA); err != nil {
			return false, err
		}
	}
	return true, tx.Commit(ctx)
}

func splitRepo(repo string) (owner, name string, ok bool) {
	i := strings.LastIndexByte(repo, '/')
	if i <= 0 || i == len(repo)-1 {
		return "", "", false
	}
	return repo[:i], repo[i+1:], true
}

func knownValue(v string, allowed ...string) string {
	for _, a := range allowed {
		if v == a {
			return v
		}
	}
	return ""
}
