package forgejo

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/webgrip/ploeg/pkg/provider"
)

// The provider is the only place Forgejo's REST dialect is allowed to exist,
// so these tests are what keep the rest of the codebase honest about it.
// External services are faked with httptest and never need network.

func sign(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func post(t *testing.T, p *Provider, event string, body any) ([]provider.ForgeEvent, error) {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodPost, "/webhooks/forge/forgejo", strings.NewReader(string(b)))
	if event != "" {
		r.Header.Set("X-Forgejo-Event", event)
	}
	if p.Secret != "" {
		r.Header.Set("X-Forgejo-Signature", sign(p.Secret, b))
	}
	return p.ParseWebhook(r)
}

// A comment must land on the PR, through the issues endpoint — /pulls/{n}/
// comments would be a review comment on a diff hunk, which findings are not.
func TestComment_PostsToTheIssuesEndpoint(t *testing.T) {
	var gotPath, gotAuth, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":1}`))
	}))
	defer srv.Close()

	p := &Provider{BaseURL: srv.URL, Token: "s3cret"}
	if err := p.Comment(context.Background(), "webgrip/ploeg", 7, "## security\n- token logged"); err != nil {
		t.Fatalf("Comment: %v", err)
	}
	if want := "/api/v1/repos/webgrip/ploeg/issues/7/comments"; gotPath != want {
		t.Errorf("path = %q, want %q", gotPath, want)
	}
	if gotAuth != "token s3cret" {
		t.Errorf("auth header = %q", gotAuth)
	}
	var sent map[string]string
	if err := json.Unmarshal([]byte(gotBody), &sent); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sent["body"], "token logged") {
		t.Errorf("body = %q, want the findings verbatim", sent["body"])
	}
}

// A failed publish must say why, and must never leak the token into the error.
func TestComment_SurfacesTheFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"message":"token does not have permission"}`))
	}))
	defer srv.Close()

	err := (&Provider{BaseURL: srv.URL, Token: "s3cret"}).Comment(context.Background(), "webgrip/ploeg", 7, "x")
	if err == nil {
		t.Fatal("a 403 was reported as success")
	}
	if !strings.Contains(err.Error(), "403") || !strings.Contains(err.Error(), "permission") {
		t.Errorf("error does not explain the failure: %v", err)
	}
	if strings.Contains(err.Error(), "s3cret") {
		t.Errorf("error leaked the token: %v", err)
	}
}

func TestComment_RejectsMalformedTargets(t *testing.T) {
	p := &Provider{BaseURL: "http://example.invalid"}
	for _, tc := range []struct {
		repo string
		pr   int
	}{
		{"noslash", 1}, {"", 1}, {"webgrip/ploeg", 0}, {"webgrip/", 1},
	} {
		if err := p.Comment(context.Background(), tc.repo, tc.pr, "x"); err == nil {
			t.Errorf("Comment(%q, %d) was accepted", tc.repo, tc.pr)
		}
	}
}

// An unverified webhook is rejected BEFORE anything is parsed or touched
// (forge-provider-forgejo spec).
func TestParseWebhook_RejectsBadSignature(t *testing.T) {
	p := &Provider{Secret: "shh"}
	body := []byte(`{"action":"submitted","repository":{"full_name":"webgrip/ploeg"}}`)
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(string(body)))
	r.Header.Set("X-Forgejo-Signature", sign("wrong-secret", body))
	if _, err := p.ParseWebhook(r); err == nil {
		t.Fatal("a wrongly-signed webhook was accepted")
	}
	r2 := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(string(body)))
	if _, err := p.ParseWebhook(r2); err == nil {
		t.Fatal("an unsigned webhook was accepted")
	}
}

func TestParseWebhook_ReviewSubmitted(t *testing.T) {
	p := &Provider{Secret: "shh"}
	events, err := post(t, p, "pull_request_review", map[string]any{
		"action":     "reviewed",
		"repository": map[string]any{"full_name": "webgrip/ploeg"},
		"pull_request": map[string]any{
			"number": 12,
			"head":   map[string]any{"ref": "agent/vik-585"},
		},
		"review": map[string]any{
			"type":    "pull_request_review_rejected",
			"content": "the retry loop is still unbounded",
		},
	})
	if err != nil {
		t.Fatalf("ParseWebhook: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("got %d events, want 1", len(events))
	}
	e := events[0]
	if e.Kind != provider.ForgeReviewSubmitted || e.Repo != "webgrip/ploeg" || e.PR != 12 ||
		e.Branch != "agent/vik-585" || !strings.Contains(e.Body, "unbounded") {
		t.Errorf("event = %+v", e)
	}
}

func TestParseWebhook_CheckFailed(t *testing.T) {
	p := &Provider{}
	events, err := post(t, p, "status", map[string]any{
		"repository": map[string]any{"full_name": "webgrip/ploeg"},
		"state":      "failure",
		"branches":   []string{"agent/vik-585"},
		"commit":     map[string]any{"message": "go vet failed"},
	})
	if err != nil {
		t.Fatalf("ParseWebhook: %v", err)
	}
	if len(events) != 1 || events[0].Kind != provider.ForgeCheckFailed ||
		events[0].Branch != "agent/vik-585" {
		t.Fatalf("event = %+v", events)
	}
}

func TestParseWebhook_MergeStateDirty(t *testing.T) {
	p := &Provider{}
	events, err := post(t, p, "pull_request", map[string]any{
		"repository": map[string]any{"full_name": "webgrip/ploeg"},
		"pull_request": map[string]any{
			"number":          12,
			"head":            map[string]any{"ref": "agent/vik-585"},
			"mergeable_state": "dirty",
		},
	})
	if err != nil {
		t.Fatalf("ParseWebhook: %v", err)
	}
	if len(events) != 1 || events[0].Kind != provider.ForgeMergeStateDirty {
		t.Fatalf("event = %+v", events)
	}
}

// A forge subscribes wider than the core consumes. An irrelevant event is
// dropped quietly — erroring would turn every unrelated push into a failed
// delivery and eventually a disabled webhook (spec scenario).
func TestParseWebhook_DropsIrrelevantEventsQuietly(t *testing.T) {
	p := &Provider{}
	for _, body := range []map[string]any{
		{"action": "push", "repository": map[string]any{"full_name": "webgrip/ploeg"}},
		{"repository": map[string]any{"full_name": "webgrip/ploeg"}, "state": "success"},
		{"action": "opened", "repository": map[string]any{"full_name": "webgrip/ploeg"},
			"pull_request": map[string]any{"number": 1, "mergeable_state": "clean"}},
	} {
		events, err := post(t, p, "push", body)
		if err != nil {
			t.Errorf("irrelevant event errored: %v", err)
		}
		if len(events) != 0 {
			t.Errorf("irrelevant event produced %+v", events)
		}
	}
}

// Core code must never see a Forgejo field name. This is the R7 guard the
// spec asks for, enforced where it can actually be checked: the normalized
// event carries only SPI types.
func TestParseWebhook_EmitsOnlySPITypes(t *testing.T) {
	p := &Provider{}
	events, _ := post(t, p, "pull_request_review", map[string]any{
		"repository":   map[string]any{"full_name": "webgrip/ploeg"},
		"pull_request": map[string]any{"number": 3, "head": map[string]any{"ref": "b"}},
		"review":       map[string]any{"type": "pull_request_review_comment", "content": "x"},
	})
	if len(events) != 1 {
		t.Fatal("expected one event")
	}
	var _ provider.ForgeEvent = events[0]
	if events[0].Repo != "webgrip/ploeg" {
		t.Errorf("repo not normalized: %+v", events[0])
	}
}
