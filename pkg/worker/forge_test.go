package worker

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/webgrip/ploeg/pkg/harness"
)

// forgeStub serves one canned JSON body and records the raw request line, so a
// test can assert on the URL as it went over the wire — r.URL.Path decodes
// %2F, which is exactly the encoding these tests exist to protect.
func forgeStub(t *testing.T, body string) (*httptest.Server, *string, *http.Header) {
	t.Helper()
	var gotURI string
	var gotHeader http.Header
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotURI = r.RequestURI
		gotHeader = r.Header.Clone()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv, &gotURI, &gotHeader
}

func TestFindPRForgejo(t *testing.T) {
	body := `[{"html_url":"https://forge/x/y/pulls/7",
	           "head":{"ref":"ploeg/VIK-1"},"base":{"ref":"main"}}]`
	srv, uri, hdr := forgeStub(t, body)

	ref := harness.RepoRef{ForgeURL: srv.URL, Owner: "x", Name: "y", BaseBranch: "main"}
	got, err := findPR(ref, "tok", "ploeg/VIK-1")
	if err != nil {
		t.Fatalf("findPR: %v", err)
	}
	if want := "https://forge/x/y/pulls/7"; got != want {
		t.Errorf("url = %q, want %q", got, want)
	}
	if !strings.HasPrefix(*uri, "/api/v1/repos/x/y/pulls") {
		t.Errorf("path = %q, want the Forgejo pulls endpoint", *uri)
	}
	if h := hdr.Get("Authorization"); h != "token tok" {
		t.Errorf("Authorization = %q, want %q", h, "token tok")
	}
}

// An empty Forge must keep meaning Forgejo: every taskspec and every stored
// target written before the field existed carries "".
func TestFindPREmptyForgeIsForgejo(t *testing.T) {
	srv, uri, _ := forgeStub(t, `[]`)
	ref := harness.RepoRef{ForgeURL: srv.URL, Owner: "x", Name: "y"}
	if _, err := findPR(ref, "tok", "b"); err != nil {
		t.Fatalf("findPR: %v", err)
	}
	if !strings.Contains(*uri, "/api/v1/repos/") {
		t.Errorf("path = %q, want the Forgejo endpoint for an unset dialect", *uri)
	}
}

func TestFindPRGitLab(t *testing.T) {
	body := `[{"web_url":"https://gl/g/p/-/merge_requests/3",
	           "source_branch":"ploeg/VIK-1","target_branch":"main"}]`
	srv, uri, hdr := forgeStub(t, body)

	ref := harness.RepoRef{
		Forge: harness.ForgeGitLab, ForgeURL: srv.URL,
		Owner: "g", Name: "p", BaseBranch: "main",
	}
	got, err := findPR(ref, "tok", "ploeg/VIK-1")
	if err != nil {
		t.Fatalf("findPR: %v", err)
	}
	if want := "https://gl/g/p/-/merge_requests/3"; got != want {
		t.Errorf("url = %q, want %q", got, want)
	}
	if !strings.Contains(*uri, "source_branch=ploeg%2FVIK-1") {
		t.Errorf("uri = %q, want the branch filtered server-side and escaped", *uri)
	}
	if h := hdr.Get("PRIVATE-TOKEN"); h != "tok" {
		t.Errorf("PRIVATE-TOKEN = %q, want %q", h, "tok")
	}
	if hdr.Get("Authorization") != "" {
		t.Error("GitLab must not receive the Forgejo Authorization header")
	}
}

// The subgroup case, which is the whole reason ProjectPath exists: owner and
// name are NOT two path segments on GitLab. acme/internal/widgets is three,
// and the slashes have to survive as %2F or GitLab 404s.
func TestFindPRGitLabSubgroupPathIsEncoded(t *testing.T) {
	srv, uri, _ := forgeStub(t, `[]`)
	ref := harness.RepoRef{
		Forge: harness.ForgeGitLab, ForgeURL: srv.URL,
		Owner: "acme", Name: "internal/widgets",
	}
	if _, err := findPR(ref, "tok", "b"); err != nil {
		t.Fatalf("findPR: %v", err)
	}
	want := "/api/v4/projects/acme%2Finternal%2Fwidgets/merge_requests"
	if !strings.HasPrefix(*uri, want) {
		t.Errorf("uri = %q, want prefix %q", *uri, want)
	}
}

// A base-branch mismatch is not this run's change request, on either forge —
// an agent that opened it against the wrong base is not done (VIK-589).
func TestFindPRRejectsWrongBase(t *testing.T) {
	for _, c := range []struct{ name, body, forge string }{
		{"forgejo", `[{"html_url":"u","head":{"ref":"b"},"base":{"ref":"other"}}]`, harness.ForgeForgejo},
		{"gitlab", `[{"web_url":"u","source_branch":"b","target_branch":"other"}]`, harness.ForgeGitLab},
	} {
		t.Run(c.name, func(t *testing.T) {
			srv, _, _ := forgeStub(t, c.body)
			ref := harness.RepoRef{Forge: c.forge, ForgeURL: srv.URL, Owner: "o", Name: "r", BaseBranch: "main"}
			got, err := findPR(ref, "tok", "b")
			if err != nil {
				t.Fatalf("findPR: %v", err)
			}
			if got != "" {
				t.Errorf("url = %q, want empty for a mismatched base", got)
			}
		})
	}
}

// An unknown dialect must fail loudly. Falling back to Forgejo would poll a
// real endpoint shape against the wrong host and report "no change request"
// forever, which looks exactly like an agent that never opened one.
func TestFindPRUnknownForge(t *testing.T) {
	ref := harness.RepoRef{Forge: "bitbucket", ForgeURL: "http://unused", Owner: "o", Name: "r"}
	_, err := findPR(ref, "tok", "b")
	if err == nil || !strings.Contains(err.Error(), "bitbucket") {
		t.Fatalf("err = %v, want one naming the unknown dialect", err)
	}
}

func TestFindPRHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	t.Cleanup(srv.Close)
	ref := harness.RepoRef{Forge: harness.ForgeGitLab, ForgeURL: srv.URL, Owner: "o", Name: "r"}
	if _, err := findPR(ref, "tok", "b"); err == nil {
		t.Fatal("want an error for HTTP 401, got nil")
	}
}
