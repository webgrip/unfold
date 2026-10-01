package httpapi

import (
	"context"
	"time"

	"github.com/webgrip/ploeg/pkg/forgefacts"
	"github.com/webgrip/ploeg/pkg/provider"
	"github.com/webgrip/ploeg/pkg/store"
)

func (s *Server) recordPullRequestFacts(ctx context.Context, fp provider.ForgeProvider, ev provider.ForgeEvent) {
	switch ev.Kind {
	case provider.ForgeReviewSubmitted, provider.ForgePRMerged, provider.ForgePRClosed,
		provider.ForgePROpened, provider.ForgePRSynchronized, provider.ForgeMergeStateDirty:
	default:
		return
	}
	if ev.PR <= 0 || ev.Repo == "" {
		return
	}
	pr := forgefacts.PullRequest{Forge: fp.Name(), Repo: ev.Repo, Number: ev.PR, Branch: ev.Branch}
	rec := forgefacts.Facts(pr, ev.PullRequest, nil, time.Time{})
	if ev.Kind == provider.ForgeReviewSubmitted {
		rec.Review = &store.PullRequestReview{Reviewer: ev.Actor, State: string(ev.Review), HeadSHA: ev.PullRequest.HeadSHA}
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
		return
	}
	s.capturePullRequestFacts(ctx, fp, pr, ev.PullRequest)
}

func (s *Server) capturePullRequestFacts(ctx context.Context, fp provider.ForgeProvider, pr forgefacts.PullRequest, facts provider.PullRequestFacts) {
	read, err := fp.PullRequestFacts(ctx, pr.Repo, pr.Number)
	readOK := err == nil
	if err != nil {
		s.Log.Warn("pull request facts read failed; keeping the webhook's", "provider", fp.Name(),
			"repo", pr.Repo, "pr", pr.Number, "err", err)
	} else {
		facts = forgefacts.WithMissing(facts, read)
	}
	ci, err := forgefacts.CI(ctx, fp, pr.Repo, facts.HeadSHA)
	if err != nil {
		s.Log.Warn("commit status read failed; CI stays as recorded", "provider", fp.Name(),
			"repo", pr.Repo, "pr", pr.Number, "head", facts.HeadSHA, "err", err)
	}
	if !readOK && ci == nil {
		return
	}
	if _, err := s.Store.RecordPullRequestFacts(ctx, forgefacts.Facts(pr, facts, ci, time.Now())); err != nil {
		s.Log.Error("pull request facts not recorded", "provider", fp.Name(),
			"repo", pr.Repo, "pr", pr.Number, "err", err)
	}
}
