package gitlab

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/webgrip/ploeg/pkg/provider"
)

// The provider is the only place GitLab's REST dialect is allowed to exist,
// so these tests are what keep the rest of the codebase honest about it.
// External services are faked with httptest and never need network.

func post(t *testing.T, p *Provider, token string, body any) ([]provider.ForgeEvent, error) {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodPost, "/webhooks/forge/gitlab", strings.NewReader(string(b)))
	if token != "" {
		r.Header.Set("X-Gitlab-Token", token)
	}
	return p.ParseWebhook(r)
}

// A note must land on the merge request through the NOTES endpoint, and the
// project path must arrive URL-encoded as a single segment — GitLab 404s a
// raw slash.
func TestCommentPostsNoteToEncodedProjectPath(t *testing.T) {
	var gotPath, gotToken, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.EscapedPath()
		gotToken = r.Header.Get("PRIVATE-TOKEN")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	p := &Provider{BaseURL: srv.URL, Token: "tok", HC: srv.Client()}
	if err := p.Comment(context.Background(), "group/sub/proj", 7, "findings"); err != nil {
		t.Fatalf("Comment: %v", err)
	}
	if want := "/api/v4/projects/group%2Fsub%2Fproj/merge_requests/7/notes"; gotPath != want {
		t.Errorf("path = %q, want %q", gotPath, want)
	}
	if gotToken != "tok" {
		t.Errorf("PRIVATE-TOKEN = %q, want tok", gotToken)
	}
	if !strings.Contains(gotBody, `"body":"findings"`) {
		t.Errorf("body = %q, want it to carry the note", gotBody)
	}
}

func TestCommentRejectsBadInput(t *testing.T) {
	p := &Provider{BaseURL: "http://example.invalid"}
	for _, tc := range []struct {
		name string
		repo string
		mr   int
	}{
		{"no namespace", "proj", 1},
		{"empty segment", "group//proj", 1},
		{"empty repo", "", 1},
		{"zero iid", "group/proj", 0},
		{"negative iid", "group/proj", -3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := p.Comment(context.Background(), tc.repo, tc.mr, "x"); err == nil {
				t.Fatal("want an error before a request is spent")
			}
		})
	}
}

func TestCommentSurfacesAPIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"message":"403 Forbidden"}`))
	}))
	defer srv.Close()
	p := &Provider{BaseURL: srv.URL, Token: "tok", HC: srv.Client()}
	err := p.Comment(context.Background(), "g/p", 1, "x")
	if err == nil {
		t.Fatal("want an error")
	}
	if !strings.Contains(err.Error(), "403") {
		t.Errorf("error %q should carry the status", err)
	}
}

// GitLab echoes a shared secret rather than signing the body, so the token is
// the whole authentication story — a wrong one must be refused.
func TestParseWebhookRejectsWrongToken(t *testing.T) {
	p := &Provider{Secret: "s3cret"}
	_, err := post(t, p, "nope", map[string]any{"object_kind": "note"})
	if err == nil {
		t.Fatal("want an error for a mismatched X-Gitlab-Token")
	}
}

func TestParseWebhookAcceptsRightToken(t *testing.T) {
	p := &Provider{Secret: "s3cret"}
	if _, err := post(t, p, "s3cret", map[string]any{"object_kind": "push"}); err != nil {
		t.Fatalf("want the delivery accepted, got %v", err)
	}
}

// A note on a merge request is review feedback; a note on an issue is not,
// and both arrive on the same hook.
func TestParseWebhookNoteOnMergeRequest(t *testing.T) {
	p := &Provider{}
	evs, err := post(t, p, "", map[string]any{
		"object_kind":       "note",
		"project":           map[string]any{"path_with_namespace": "g/p"},
		"object_attributes": map[string]any{"note": "please fix the nil deref"},
		"merge_request":     map[string]any{"iid": 12, "source_branch": "feat/x"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 {
		t.Fatalf("want 1 event, got %d", len(evs))
	}
	got := evs[0]
	if got.Kind != provider.ForgeReviewSubmitted || got.Repo != "g/p" || got.PR != 12 ||
		got.Branch != "feat/x" || got.Body != "please fix the nil deref" {
		t.Errorf("unexpected event %+v", got)
	}
}

func TestParseWebhookNoteOnIssueIsDropped(t *testing.T) {
	p := &Provider{}
	evs, err := post(t, p, "", map[string]any{
		"object_kind":       "note",
		"project":           map[string]any{"path_with_namespace": "g/p"},
		"object_attributes": map[string]any{"note": "unrelated"},
	})
	if err != nil {
		t.Fatalf("an unrelated note must be dropped, not an error: %v", err)
	}
	if len(evs) != 0 {
		t.Errorf("want no events, got %+v", evs)
	}
}

// GitLab has no review object: approval arrives as a merge_request action.
func TestParseWebhookApprovalIsReviewSubmitted(t *testing.T) {
	p := &Provider{}
	evs, err := post(t, p, "", map[string]any{
		"object_kind": "merge_request",
		"project":     map[string]any{"path_with_namespace": "g/p"},
		"object_attributes": map[string]any{
			"iid": 4, "action": "approved", "source_branch": "feat/y",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 || evs[0].Kind != provider.ForgeReviewSubmitted || evs[0].PR != 4 {
		t.Fatalf("unexpected %+v", evs)
	}
}

func TestParseWebhookMergeConflict(t *testing.T) {
	p := &Provider{}
	evs, err := post(t, p, "", map[string]any{
		"object_kind": "merge_request",
		"project":     map[string]any{"path_with_namespace": "g/p"},
		"object_attributes": map[string]any{
			"iid": 9, "action": "update", "merge_status": "cannot_be_merged", "source_branch": "feat/z",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 || evs[0].Kind != provider.ForgeMergeStateDirty || evs[0].PR != 9 {
		t.Fatalf("unexpected %+v", evs)
	}
}

// A mergeable MR update is noise: subscribing wider than the core consumes
// must not produce events.
func TestParseWebhookMergeableUpdateIsDropped(t *testing.T) {
	p := &Provider{}
	evs, err := post(t, p, "", map[string]any{
		"object_kind": "merge_request",
		"project":     map[string]any{"path_with_namespace": "g/p"},
		"object_attributes": map[string]any{
			"iid": 9, "action": "update", "merge_status": "can_be_merged",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 0 {
		t.Errorf("want no events, got %+v", evs)
	}
}

func TestParseWebhookFailedPipeline(t *testing.T) {
	p := &Provider{}
	evs, err := post(t, p, "", map[string]any{
		"object_kind":       "pipeline",
		"project":           map[string]any{"path_with_namespace": "g/p"},
		"object_attributes": map[string]any{"status": "failed", "ref": "feat/w"},
		"merge_request":     map[string]any{"iid": 21, "source_branch": "feat/w"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 || evs[0].Kind != provider.ForgeCheckFailed || evs[0].PR != 21 || evs[0].Branch != "feat/w" {
		t.Fatalf("unexpected %+v", evs)
	}
}

// A branch pipeline has no merge request. PR 0 is the honest answer — the core
// reads it as "nothing to route this to", not as merge request zero.
func TestParseWebhookBranchPipelineHasNoMergeRequest(t *testing.T) {
	p := &Provider{}
	evs, err := post(t, p, "", map[string]any{
		"object_kind":       "pipeline",
		"project":           map[string]any{"path_with_namespace": "g/p"},
		"object_attributes": map[string]any{"status": "failed", "ref": "main"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 || evs[0].PR != 0 || evs[0].Branch != "main" {
		t.Fatalf("unexpected %+v", evs)
	}
}

func TestParseWebhookSuccessfulPipelineIsDropped(t *testing.T) {
	p := &Provider{}
	evs, err := post(t, p, "", map[string]any{
		"object_kind":       "pipeline",
		"project":           map[string]any{"path_with_namespace": "g/p"},
		"object_attributes": map[string]any{"status": "success"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 0 {
		t.Errorf("want no events, got %+v", evs)
	}
}

func TestParseWebhookWithoutProjectIsDropped(t *testing.T) {
	p := &Provider{}
	evs, err := post(t, p, "", map[string]any{"object_kind": "note"})
	if err != nil {
		t.Fatalf("want it dropped, got %v", err)
	}
	if len(evs) != 0 {
		t.Errorf("want no events, got %+v", evs)
	}
}

func TestName(t *testing.T) {
	if (&Provider{}).Name() != "gitlab" {
		t.Fatal("Name must stay stable: it is the webhook route and the map key")
	}
}
