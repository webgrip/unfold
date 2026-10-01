package httpapi

import (
	"context"

	"github.com/webgrip/ploeg/pkg/provider"
	"github.com/webgrip/ploeg/pkg/store"
)

func (s *Server) recordPullRequestFacts(ctx context.Context, fp provider.ForgeProvider, ev provider.ForgeEvent) {
	switch ev.Kind {
	case provider.ForgeReviewSubmitted, provider.ForgePRMerged, provider.ForgePRClosed:
	default:
		return
	}
	if ev.PR <= 0 || ev.Repo == "" {
		return
	}
	facts := ev.PullRequest
	if lacksCloseFacts(facts) {
		read, err := fp.PullRequestFacts(ctx, ev.Repo, ev.PR)
		if err != nil {
			s.Log.Warn("pull request facts read failed; keeping the webhook's", "provider", fp.Name(),
				"repo", ev.Repo, "pr", ev.PR, "err", err)
		} else {
			facts = withMissingFacts(facts, read)
		}
	}
	rec := store.PullRequestFacts{
		Forge: fp.Name(), Repo: ev.Repo, Number: ev.PR, Branch: ev.Branch,
		State: string(facts.State), HeadSHA: facts.HeadSHA, MergeCommitSHA: facts.MergeCommitSHA,
		MergedAt: facts.MergedAt, MergedBy: facts.MergedBy, ClosedAt: facts.ClosedAt,
	}
	if ev.Kind == provider.ForgeReviewSubmitted {
		rec.Review = &store.PullRequestReview{Reviewer: ev.Actor, State: string(ev.Review), HeadSHA: facts.HeadSHA}
	}
	recorded, err := s.Store.RecordPullRequestFacts(ctx, rec)
	if err != nil {
		s.Log.Error("pull request facts not recorded", "provider", fp.Name(), "kind", ev.Kind,
			"repo", ev.Repo, "pr", ev.PR, "err", err)
		return
	}
	if !recorded {
		s.Log.Debug("pull request facts skipped: not a Ploeg pull request", "provider", fp.Name(),
			"repo", ev.Repo, "pr", ev.PR, "branch", ev.Branch)
	}
}

func lacksCloseFacts(f provider.PullRequestFacts) bool {
	switch f.State {
	case provider.PullRequestMerged:
		return f.MergedAt == nil || f.MergedBy == "" || f.MergeCommitSHA == ""
	case provider.PullRequestClosed:
		return f.ClosedAt == nil
	}
	return false
}

func withMissingFacts(f, read provider.PullRequestFacts) provider.PullRequestFacts {
	if f.State == "" {
		f.State = read.State
	}
	if f.HeadSHA == "" {
		f.HeadSHA = read.HeadSHA
	}
	if f.MergeCommitSHA == "" {
		f.MergeCommitSHA = read.MergeCommitSHA
	}
	if f.MergedAt == nil {
		f.MergedAt = read.MergedAt
	}
	if f.MergedBy == "" {
		f.MergedBy = read.MergedBy
	}
	if f.ClosedAt == nil {
		f.ClosedAt = read.ClosedAt
	}
	return f
}
