package shiftengine

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/webgrip/ploeg/pkg/provider"
	"github.com/webgrip/ploeg/pkg/store"
	"github.com/webgrip/ploeg/pkg/work"
)

func awaitingReview(t *testing.T, externalID string, pr string) int64 {
	t.Helper()
	ctx := context.Background()
	e := uniformEngine(t)
	id, _, err := testStore.IngestAssigned(ctx, work.WorkItem{
		Provider: "vikunja", ExternalID: externalID, Team: "silver", Title: "t",
		Target: &work.Target{Forge: "webgrip", Owner: "webgrip", Repo: "ploeg", BaseBranch: "development"},
	})
	if err != nil {
		t.Fatal(err)
	}
	item, _ := testStore.WorkItem(ctx, id)
	if err := e.EnsureShift(ctx, id, item); err != nil {
		t.Fatal(err)
	}
	run, err := testStore.ClaimRole(ctx, "silver", "", time.Minute, 0)
	if err != nil || run == nil {
		t.Fatalf("claim: %v", err)
	}
	if _, err := testStore.ReportOutcome(ctx, run.RunToken, store.Report(
		work.OutcomePROpened, "opened a PR", "",
		[]string{"https://forgejo.webgrip.dev/webgrip/ploeg/pulls/" + pr}, nil, nil)); err != nil {
		t.Fatal(err)
	}
	if err := e.EvaluateItem(ctx, id); err != nil {
		t.Fatal(err)
	}
	if got := itemState(t, id); got != "awaiting_review" {
		t.Fatalf("setup: item state = %q, want awaiting_review", got)
	}
	return id
}

func newReviewWatch(forge *fakeForge, tracker *fakeTracker) *ReviewWatch {
	return &ReviewWatch{
		Store:           testStore,
		Forges:          map[string]provider.ForgeProvider{"webgrip": forge, "forgejo": forge},
		DefaultForge:    "webgrip",
		Trackers:        map[string]provider.TrackerProvider{"vikunja": tracker},
		MarkTrackerDone: true,
		Log:             slog.New(slog.DiscardHandler),
	}
}

func TestReviewWatch_MergedEventMovesItemToDone(t *testing.T) {
	ctx := context.Background()
	resetTables(t)
	id := awaitingReview(t, "610", "41")
	tracker := &fakeTracker{}
	w := newReviewWatch(&fakeForge{}, tracker)

	ev := provider.ForgeEvent{Kind: provider.ForgePRMerged, Repo: "WebGrip/Ploeg", PR: 41, Branch: "agent/vik-610"}
	if err := w.HandleForgeEvent(ctx, "forgejo", ev); err != nil {
		t.Fatalf("HandleForgeEvent: %v", err)
	}
	if got := itemState(t, id); got != "done" {
		t.Fatalf("item state = %q, want done", got)
	}
	if len(tracker.comments) != 1 || !strings.Contains(tracker.comments[0], "merged") ||
		!strings.Contains(tracker.comments[0], "/pulls/41") {
		t.Errorf("tracker comments = %q", tracker.comments)
	}
	if len(tracker.statuses) != 1 || tracker.statuses[0] != work.StateDone {
		t.Errorf("tracker statuses = %v, want [done]", tracker.statuses)
	}

	if err := w.HandleForgeEvent(ctx, "forgejo", ev); err != nil {
		t.Fatalf("redelivery: %v", err)
	}
	if len(tracker.comments) != 1 {
		t.Errorf("a repeated event notified again: %d comments", len(tracker.comments))
	}
}

func TestReviewWatch_ClosedEventMovesItemToNeedsHuman(t *testing.T) {
	ctx := context.Background()
	resetTables(t)
	id := awaitingReview(t, "611", "42")
	tracker := &fakeTracker{}
	w := newReviewWatch(&fakeForge{}, tracker)

	if err := w.HandleForgeEvent(ctx, "forgejo", provider.ForgeEvent{
		Kind: provider.ForgePRClosed, Repo: "webgrip/ploeg", PR: 42,
	}); err != nil {
		t.Fatalf("HandleForgeEvent: %v", err)
	}
	if got := itemState(t, id); got != "needs_human" {
		t.Fatalf("item state = %q, want needs_human", got)
	}
	if len(tracker.comments) != 1 || !strings.Contains(tracker.comments[0], "closed without merging") {
		t.Errorf("tracker comments = %q", tracker.comments)
	}
	for _, s := range tracker.statuses {
		if s == work.StateDone {
			t.Error("a closed, unmerged pull request marked the tracker task done")
		}
	}
}

func TestReviewWatch_EventForAnotherPullRequestChangesNothing(t *testing.T) {
	ctx := context.Background()
	resetTables(t)
	id := awaitingReview(t, "612", "43")
	tracker := &fakeTracker{}
	w := newReviewWatch(&fakeForge{}, tracker)

	for _, ev := range []provider.ForgeEvent{
		{Kind: provider.ForgePRMerged, Repo: "webgrip/ploeg", PR: 99},
		{Kind: provider.ForgePRMerged, Repo: "webgrip/other", PR: 43},
		{Kind: provider.ForgeReviewSubmitted, Repo: "webgrip/ploeg", PR: 43},
	} {
		if err := w.HandleForgeEvent(ctx, "forgejo", ev); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.HandleForgeEvent(ctx, "gitlab", provider.ForgeEvent{
		Kind: provider.ForgePRMerged, Repo: "webgrip/ploeg", PR: 43,
	}); err != nil {
		t.Fatal(err)
	}
	if got := itemState(t, id); got != "awaiting_review" {
		t.Fatalf("item state = %q, want awaiting_review", got)
	}
	if len(tracker.comments) != 0 {
		t.Errorf("tracker told about an unrelated event: %q", tracker.comments)
	}
}

func TestReviewWatch_DoneStatusCanBeLeftToAHuman(t *testing.T) {
	ctx := context.Background()
	resetTables(t)
	id := awaitingReview(t, "613", "44")
	tracker := &fakeTracker{}
	w := newReviewWatch(&fakeForge{}, tracker)
	w.MarkTrackerDone = false

	if err := w.HandleForgeEvent(ctx, "forgejo", provider.ForgeEvent{
		Kind: provider.ForgePRMerged, Repo: "webgrip/ploeg", PR: 44,
	}); err != nil {
		t.Fatal(err)
	}
	if got := itemState(t, id); got != "done" {
		t.Fatalf("item state = %q, want done", got)
	}
	if len(tracker.comments) != 1 {
		t.Errorf("tracker comments = %q, want one", tracker.comments)
	}
	if len(tracker.statuses) != 0 {
		t.Errorf("tracker statuses = %v, want none", tracker.statuses)
	}
}

func TestReviewWatch_ReconcileSettlesFromForgeState(t *testing.T) {
	ctx := context.Background()
	resetTables(t)
	merged := awaitingReview(t, "620", "50")
	closed := awaitingReview(t, "621", "51")
	open := awaitingReview(t, "622", "52")
	forge := &fakeForge{prStates: map[int]provider.PullRequestState{
		50: provider.PullRequestMerged,
		51: provider.PullRequestClosed,
	}}
	tracker := &fakeTracker{}
	w := newReviewWatch(forge, tracker)

	w.Reconcile(ctx)

	for id, want := range map[int64]string{merged: "done", closed: "needs_human", open: "awaiting_review"} {
		if got := itemState(t, id); got != want {
			t.Errorf("item %d state = %q, want %q", id, got, want)
		}
	}
	if len(forge.reads) != 3 {
		t.Errorf("forge reads = %v, want one per awaiting_review item", forge.reads)
	}
	if len(tracker.comments) != 2 {
		t.Errorf("tracker comments = %d, want 2", len(tracker.comments))
	}

	forge.reads = nil
	w.Reconcile(ctx)
	if len(forge.reads) != 1 || forge.reads[0] != 52 {
		t.Errorf("second reconcile read %v, want only the open pull request", forge.reads)
	}
	if len(tracker.comments) != 2 {
		t.Errorf("second reconcile notified again: %d comments", len(tracker.comments))
	}
}

func TestReviewWatch_ReconcileSurvivesAForgeOutage(t *testing.T) {
	ctx := context.Background()
	resetTables(t)
	id := awaitingReview(t, "630", "60")
	forge := &fakeForge{err: errors.New("forge down")}
	tracker := &fakeTracker{}

	newReviewWatch(forge, tracker).Reconcile(ctx)

	if got := itemState(t, id); got != "awaiting_review" {
		t.Fatalf("item state = %q, want awaiting_review", got)
	}
	if len(tracker.comments) != 0 {
		t.Errorf("tracker told about an unknown state: %q", tracker.comments)
	}
}
