package shiftengine

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/webgrip/ploeg/pkg/provider"
	"github.com/webgrip/ploeg/pkg/store"
	"github.com/webgrip/ploeg/pkg/work"
)

// --- fakes ------------------------------------------------------------------

type fakeForge struct {
	mu       sync.Mutex
	comments []struct {
		Repo string
		PR   int
		Body string
	}
	err error
}

func (f *fakeForge) Name() string                                              { return "webgrip" }
func (f *fakeForge) ParseWebhook(*http.Request) ([]provider.ForgeEvent, error) { return nil, nil }
func (f *fakeForge) Comment(_ context.Context, repo string, pr int, body string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return f.err
	}
	f.comments = append(f.comments, struct {
		Repo string
		PR   int
		Body string
	}{repo, pr, body})
	return nil
}

type fakeTracker struct {
	mu       sync.Mutex
	comments []string
	statuses []work.State
	err      error
}

func (f *fakeTracker) Name() string                                                { return "vikunja" }
func (f *fakeTracker) ParseWebhook(*http.Request) ([]provider.TrackerEvent, error) { return nil, nil }
func (f *fakeTracker) FetchItem(context.Context, string) (work.WorkItem, error) {
	return work.WorkItem{}, errors.New("not used")
}
func (f *fakeTracker) Comment(_ context.Context, _, body string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return f.err
	}
	f.comments = append(f.comments, body)
	return nil
}
func (f *fakeTracker) SetStatus(_ context.Context, _ string, s work.State) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.statuses = append(f.statuses, s)
	return nil
}

// --- unit: PR link parsing --------------------------------------------------

func TestPRNumber(t *testing.T) {
	for in, want := range map[string]int{
		"https://forgejo.webgrip.dev/webgrip/ploeg/pulls/7":  7,
		"https://forgejo.webgrip.dev/webgrip/ploeg/pulls/7/": 7,
		"https://github.com/o/r/pull/123":                    123,
		"https://forgejo/webgrip/ploeg/issues/7":             0,
		"https://forgejo/webgrip/ploeg":                      0,
		"":                                                   0,
		"not a url":                                          0,
	} {
		if got := prNumber(in); got != want {
			t.Errorf("prNumber(%q) = %d, want %d", in, got, want)
		}
	}
}

// The writer's links carry the PR; readers open none. The most recent one
// wins so a re-opened PR supersedes an earlier link.
func TestPullRequestFromReports(t *testing.T) {
	link, n := pullRequest([]store.RunReport{
		{Role: "analyst", Round: 1},
		{Role: "builder", Round: 2, Writes: true, Links: []string{"https://forgejo/webgrip/ploeg/pulls/7"}},
	})
	if n != 7 || !strings.HasSuffix(link, "/7") {
		t.Errorf("pullRequest = (%q, %d)", link, n)
	}
	if _, n := pullRequest([]store.RunReport{{Role: "analyst", Round: 1}}); n != 0 {
		t.Errorf("a shift with no PR reported %d", n)
	}
}

func TestFindingsCommentIsAttributed(t *testing.T) {
	c := findingsComment(store.RunReport{
		Role: "security", Round: 1, Summary: "reviewed the diff",
		Findings: "- the token is logged at debug",
	})
	for _, want := range []string{"security", "round 1", "reviewed the diff", "token is logged"} {
		if !strings.Contains(c, want) {
			t.Errorf("comment missing %q:\n%s", want, c)
		}
	}
}

// --- integration: publication through the lifecycle -------------------------

func TestPublish_FindingsReachThePullRequestWhenTheRoundCompletes(t *testing.T) {
	ctx := context.Background()
	resetTables(t)
	forge := &fakeForge{}
	tracker := &fakeTracker{}
	e := newEngine(bronzePlan(10))
	e.Forges = map[string]provider.ForgeProvider{"webgrip": forge}
	e.Trackers = map[string]provider.TrackerProvider{"vikunja": tracker}

	// An item with a resolved target, so ploegd knows the repository.
	id, _, err := testStore.IngestAssigned(ctx, work.WorkItem{
		Provider: "vikunja", ExternalID: "900", Team: "bronze", Title: "t",
		ExternalScope: "11", RouteRule: "11/bronze",
		Target: &work.Target{Forge: "webgrip", Owner: "webgrip", Repo: "ploeg", BaseBranch: "development"},
	})
	if err != nil {
		t.Fatal(err)
	}
	item, _ := testStore.WorkItem(ctx, id)
	if err := e.EnsureShift(ctx, id, item); err != nil {
		t.Fatal(err)
	}

	// Round 1 readers report findings. No PR exists yet, so nothing is
	// published — the findings still reach the writer via the briefing.
	for _, role := range []string{"analyst", "tests"} {
		r, err := testStore.ClaimRole(ctx, "bronze", role, time.Minute, 1)
		if err != nil {
			t.Fatalf("claim %s: %v", role, err)
		}
		if _, err := testStore.ReportOutcome(ctx, r.RunToken,
			store.Report(work.OutcomeNoChangeNeeded, "read it", "", nil, nil, nil).
				WithFindings("## "+role+"\n- something to fix")); err != nil {
			t.Fatal(err)
		}
	}
	if err := e.EvaluateItem(ctx, id); err != nil {
		t.Fatal(err)
	}
	if len(forge.comments) != 0 {
		t.Errorf("published before a PR existed: %+v", forge.comments)
	}

	// Round 2: the writer opens the PR.
	rw, err := testStore.ClaimRole(ctx, "bronze", "builder", time.Minute, 3)
	if err != nil {
		t.Fatalf("claim builder: %v", err)
	}
	if _, err := testStore.ReportOutcome(ctx, rw.RunToken,
		store.Report(work.OutcomePROpened, "opened", "",
			[]string{"https://forgejo.webgrip.dev/webgrip/ploeg/pulls/7"}, nil, nil)); err != nil {
		t.Fatal(err)
	}
	if err := e.EvaluateItem(ctx, id); err != nil {
		t.Fatal(err)
	}

	// The plan is exhausted, so the shift closed and the human was told.
	if len(tracker.comments) != 1 {
		t.Fatalf("tracker comments = %d, want 1", len(tracker.comments))
	}
	if !strings.Contains(tracker.comments[0], "pulls/7") {
		t.Errorf("tracker comment lacks the PR link:\n%s", tracker.comments[0])
	}
	if !strings.Contains(tracker.comments[0], "review and merge") {
		t.Errorf("tracker comment does not ask for a merge:\n%s", tracker.comments[0])
	}
	if len(tracker.statuses) != 1 || tracker.statuses[0] != work.StateNeedsHuman {
		t.Errorf("statuses = %v, want [needs_human]", tracker.statuses)
	}
	if got := itemState(t, id); got != "needs_human" {
		t.Errorf("item state = %q", got)
	}
}

// Findings survive the pod: once a PR exists, a later round's reader reaches
// the thread (blackboard spec, "a human sees the same thread").
func TestPublish_ReaderAfterThePRExists(t *testing.T) {
	ctx := context.Background()
	resetTables(t)
	forge := &fakeForge{}
	e := newEngine(reviewPlan())
	e.Forges = map[string]provider.ForgeProvider{"webgrip": forge}

	id, _, err := testStore.IngestAssigned(ctx, work.WorkItem{
		Provider: "vikunja", ExternalID: "901", Team: "bronze", Title: "t",
		Target: &work.Target{Forge: "webgrip", Owner: "webgrip", Repo: "ploeg", BaseBranch: "development"},
	})
	if err != nil {
		t.Fatal(err)
	}
	item, _ := testStore.WorkItem(ctx, id)
	if err := e.EnsureShift(ctx, id, item); err != nil {
		t.Fatal(err)
	}

	// Round 1: writer opens the PR.
	rw, _ := testStore.ClaimRole(ctx, "bronze", "builder", time.Minute, 3)
	if _, err := testStore.ReportOutcome(ctx, rw.RunToken,
		store.Report(work.OutcomePROpened, "opened", "",
			[]string{"https://forgejo.webgrip.dev/webgrip/ploeg/pulls/9"}, nil, nil)); err != nil {
		t.Fatal(err)
	}
	if err := e.EvaluateItem(ctx, id); err != nil {
		t.Fatal(err)
	}

	// Round 2: the reviewer's findings must land on that PR.
	rr, err := testStore.ClaimRole(ctx, "bronze", "reviewer", time.Minute, 1)
	if err != nil {
		t.Fatalf("claim reviewer: %v", err)
	}
	if _, err := testStore.ReportOutcome(ctx, rr.RunToken,
		store.Report(work.OutcomeNoChangeNeeded, "reviewed", "", nil, nil, nil).
			WithFindings("- the retry loop is unbounded")); err != nil {
		t.Fatal(err)
	}
	if err := e.EvaluateItem(ctx, id); err != nil {
		t.Fatal(err)
	}

	if len(forge.comments) != 1 {
		t.Fatalf("forge comments = %d, want 1: %+v", len(forge.comments), forge.comments)
	}
	c := forge.comments[0]
	if c.Repo != "webgrip/ploeg" || c.PR != 9 {
		t.Errorf("published to %s#%d, want webgrip/ploeg#9", c.Repo, c.PR)
	}
	if !strings.Contains(c.Body, "reviewer") || !strings.Contains(c.Body, "unbounded") {
		t.Errorf("comment body = %q", c.Body)
	}
}

// A forge outage must not lose the Outcome or stall the Shift: the state
// transition still happens and the item still reaches a person.
func TestPublish_ForgeFailureDoesNotBlockTheLifecycle(t *testing.T) {
	ctx := context.Background()
	resetTables(t)
	forge := &fakeForge{err: errors.New("forge is down")}
	tracker := &fakeTracker{err: errors.New("tracker is down")}
	e := newEngine(reviewPlan())
	e.Forges = map[string]provider.ForgeProvider{"webgrip": forge}
	e.Trackers = map[string]provider.TrackerProvider{"vikunja": tracker}

	id, _, err := testStore.IngestAssigned(ctx, work.WorkItem{
		Provider: "vikunja", ExternalID: "902", Team: "bronze", Title: "t",
		Target: &work.Target{Forge: "webgrip", Owner: "webgrip", Repo: "ploeg", BaseBranch: "development"},
	})
	if err != nil {
		t.Fatal(err)
	}
	item, _ := testStore.WorkItem(ctx, id)
	if err := e.EnsureShift(ctx, id, item); err != nil {
		t.Fatal(err)
	}
	rw, _ := testStore.ClaimRole(ctx, "bronze", "builder", time.Minute, 3)
	if _, err := testStore.ReportOutcome(ctx, rw.RunToken,
		store.Report(work.OutcomePROpened, "opened", "",
			[]string{"https://forgejo/webgrip/ploeg/pulls/9"}, nil, nil)); err != nil {
		t.Fatal(err)
	}
	if err := e.EvaluateItem(ctx, id); err != nil {
		t.Fatalf("a forge outage propagated into the lifecycle: %v", err)
	}
	rr, _ := testStore.ClaimRole(ctx, "bronze", "reviewer", time.Minute, 1)
	if _, err := testStore.ReportOutcome(ctx, rr.RunToken,
		store.Report(work.OutcomeNoChangeNeeded, "reviewed", "", nil, nil, nil).
			WithFindings("- something")); err != nil {
		t.Fatal(err)
	}
	if err := e.EvaluateItem(ctx, id); err != nil {
		t.Fatalf("a tracker outage propagated into the lifecycle: %v", err)
	}

	if si, _ := testStore.LiveShiftForItem(ctx, id); si != nil {
		t.Error("shift stayed open because publication failed")
	}
	if got := itemState(t, id); got != "needs_human" {
		t.Errorf("item state = %q, want needs_human despite the outages", got)
	}
}

// An unresolved Work Target means ploegd genuinely does not know the
// repository. Publishing to a guess would be worse than not publishing.
func TestPublish_SkippedWhenTargetUnresolved(t *testing.T) {
	ctx := context.Background()
	resetTables(t)
	forge := &fakeForge{}
	e := newEngine(reviewPlan())
	e.Forges = map[string]provider.ForgeProvider{"webgrip": forge}

	id, _, err := testStore.IngestAssigned(ctx, work.WorkItem{
		Provider: "vikunja", ExternalID: "903", Team: "bronze", Title: "t", // no Target
	})
	if err != nil {
		t.Fatal(err)
	}
	item, _ := testStore.WorkItem(ctx, id)
	if err := e.EnsureShift(ctx, id, item); err != nil {
		t.Fatal(err)
	}
	rw, _ := testStore.ClaimRole(ctx, "bronze", "builder", time.Minute, 3)
	if _, err := testStore.ReportOutcome(ctx, rw.RunToken,
		store.Report(work.OutcomePROpened, "opened", "",
			[]string{"https://forgejo/webgrip/ploeg/pulls/9"}, nil, nil)); err != nil {
		t.Fatal(err)
	}
	if err := e.EvaluateItem(ctx, id); err != nil {
		t.Fatal(err)
	}
	rr, _ := testStore.ClaimRole(ctx, "bronze", "reviewer", time.Minute, 1)
	if _, err := testStore.ReportOutcome(ctx, rr.RunToken,
		store.Report(work.OutcomeNoChangeNeeded, "reviewed", "", nil, nil, nil).
			WithFindings("- something")); err != nil {
		t.Fatal(err)
	}
	if err := e.EvaluateItem(ctx, id); err != nil {
		t.Fatal(err)
	}
	if len(forge.comments) != 0 {
		t.Errorf("published against an unresolved target: %+v", forge.comments)
	}
}

// The engine looks up a forge by the ID the Work Target carries, which is an
// INSTANCE identifier and not the provider's dialect name (ADR-0016). Keying
// the registry by Name() would silently match nothing and skip every
// publication — found by wiring the two ends together, not by either alone.
func TestPublish_ForgeIsKeyedByTargetIDNotDialectName(t *testing.T) {
	ctx := context.Background()
	resetTables(t)
	forge := &fakeForge{} // Name() is "webgrip" here on purpose: id != dialect
	e := newEngine(reviewPlan())
	// Registered under the TARGET'S id.
	e.Forges = map[string]provider.ForgeProvider{"webgrip-forgejo": forge}

	id, _, err := testStore.IngestAssigned(ctx, work.WorkItem{
		Provider: "vikunja", ExternalID: "910", Team: "bronze", Title: "t",
		Target: &work.Target{Forge: "webgrip-forgejo", Owner: "webgrip", Repo: "ploeg", BaseBranch: "development"},
	})
	if err != nil {
		t.Fatal(err)
	}
	item, _ := testStore.WorkItem(ctx, id)
	if err := e.EnsureShift(ctx, id, item); err != nil {
		t.Fatal(err)
	}
	rw, _ := testStore.ClaimRole(ctx, "bronze", "builder", time.Minute, 3)
	if _, err := testStore.ReportOutcome(ctx, rw.RunToken,
		store.Report(work.OutcomePROpened, "opened", "",
			[]string{"https://forgejo/webgrip/ploeg/pulls/3"}, nil, nil)); err != nil {
		t.Fatal(err)
	}
	if err := e.EvaluateItem(ctx, id); err != nil {
		t.Fatal(err)
	}
	rr, _ := testStore.ClaimRole(ctx, "bronze", "reviewer", time.Minute, 1)
	if _, err := testStore.ReportOutcome(ctx, rr.RunToken,
		store.Report(work.OutcomeNoChangeNeeded, "reviewed", "", nil, nil, nil).
			WithFindings("- something")); err != nil {
		t.Fatal(err)
	}
	if err := e.EvaluateItem(ctx, id); err != nil {
		t.Fatal(err)
	}
	if len(forge.comments) != 1 {
		t.Fatalf("findings not published: the forge registry is keyed wrongly (%d comments)", len(forge.comments))
	}
}
