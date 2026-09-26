package worker

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"sync"
	"testing"

	"github.com/webgrip/ploeg/pkg/harness"
)

type forgeSeen struct {
	mu       sync.Mutex
	requests []*http.Request
}

func (f *forgeSeen) last() *http.Request {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.requests) == 0 {
		return nil
	}
	return f.requests[len(f.requests)-1]
}

func fakeForge(t *testing.T) (*httptest.Server, *forgeSeen) {
	t.Helper()
	seen := &forgeSeen{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen.mu.Lock()
		seen.requests = append(seen.requests, r.Clone(r.Context()))
		seen.mu.Unlock()
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(srv.Close)
	return srv, seen
}

func startTestForgeProxy(t *testing.T, repo harness.RepoRef) *forgeTokenProxy {
	t.Helper()
	p, err := startForgeTokenProxy(repo, "real-forge-token")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(p.close)
	return p
}

func send(t *testing.T, p *forgeTokenProxy, method, path string, header http.Header) int {
	t.Helper()
	req, err := http.NewRequest(method, p.baseURL+path, nil)
	if err != nil {
		t.Fatal(err)
	}
	for k, v := range header {
		req.Header[k] = v
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	return resp.StatusCode
}

func TestForgeProxyAuthenticatesGitForTheRunsRepository(t *testing.T) {
	forge, seen := fakeForge(t)
	p := startTestForgeProxy(t, harness.RepoRef{ForgeURL: forge.URL, Owner: "webgrip", Name: "example"})
	send(t, p, http.MethodGet, "/webgrip/example.git/info/refs?service=git-receive-pack",
		http.Header{"Authorization": {"Basic " + base64.StdEncoding.EncodeToString([]byte("agent-builder:"+p.placeholder))}})
	want := "Basic " + base64.StdEncoding.EncodeToString([]byte("agent-builder:real-forge-token"))
	if got := seen.last(); got == nil || got.Header.Get("Authorization") != want {
		t.Fatalf("forge saw %v, want the real token as git basic auth", got)
	}
}

func TestForgeProxyAuthenticatesTheForgejoAPI(t *testing.T) {
	forge, seen := fakeForge(t)
	p := startTestForgeProxy(t, harness.RepoRef{ForgeURL: forge.URL, Owner: "webgrip", Name: "example"})
	send(t, p, http.MethodPost, "/api/v1/repos/webgrip/example/pulls", http.Header{"Authorization": {"token " + p.placeholder}})
	if got := seen.last(); got == nil || got.Header.Get("Authorization") != "token real-forge-token" {
		t.Fatalf("forge saw %v, want the real Forgejo token", got)
	}
}

func TestForgeProxyAuthenticatesTheGitLabAPI(t *testing.T) {
	forge, seen := fakeForge(t)
	p := startTestForgeProxy(t, harness.RepoRef{Forge: harness.ForgeGitLab, ForgeURL: forge.URL, Owner: "group/sub", Name: "example"})
	send(t, p, http.MethodPost, "/api/v4/projects/group%2Fsub%2Fexample/merge_requests", http.Header{"Private-Token": {p.placeholder}})
	got := seen.last()
	if got == nil || got.Header.Get("Private-Token") != "real-forge-token" || got.Header.Get("Authorization") != "" {
		t.Fatalf("forge saw %v, want only the real PRIVATE-TOKEN", got)
	}
	if got.URL.EscapedPath() != "/api/v4/projects/group%2Fsub%2Fexample/merge_requests" {
		t.Fatalf("forge saw path %q; the project path must stay encoded", got.URL.EscapedPath())
	}
}

func TestForgeProxyRefusesEverythingOutsideTheRunsRepository(t *testing.T) {
	forge, seen := fakeForge(t)
	p := startTestForgeProxy(t, harness.RepoRef{ForgeURL: forge.URL, Owner: "webgrip", Name: "example"})
	for _, path := range []string{
		"/webgrip/other.git/info/refs",
		"/webgrip/example-evil.git/info/refs",
		"/api/v1/repos/webgrip/example-evil/pulls",
		"/api/v1/repos/webgrip/other/pulls",
		"/api/v1/user",
		"/api/v1/admin/users",
		"/webgrip/example.git/../other.git/info/refs",
		"/api/v1/repos/webgrip/example/%2e%2e/other/pulls",
	} {
		if status := send(t, p, http.MethodGet, path, nil); status != http.StatusForbidden {
			t.Errorf("%s: status %d, want 403", path, status)
		}
	}
	if len(seen.requests) != 0 {
		t.Fatalf("an out-of-scope request reached the forge: %s", seen.requests[0].URL)
	}
}

func TestGitPushesThroughTheForgeProxy(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	forge, seen := fakeForge(t)
	repo := harness.RepoRef{ForgeURL: forge.URL, Owner: "webgrip", Name: "example"}
	p := startTestForgeProxy(t, repo)
	remote, err := plainURL(repo.ForgeURL, repo.Owner, repo.Name)
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "ls-remote", remote)
	cmd.Env = append([]string{"PATH=" + os.Getenv("PATH"), "HOME=" + t.TempDir()}, p.gitEnvironment()...)
	out, _ := cmd.CombinedOutput()
	got := seen.last()
	if got == nil {
		t.Fatalf("git never reached the forge through the proxy: %s", out)
	}
	if !strings.HasPrefix(got.URL.Path, "/webgrip/example.git/") {
		t.Fatalf("forge saw %s", got.URL.Path)
	}
	want := "Basic " + base64.StdEncoding.EncodeToString([]byte("agent-builder:real-forge-token"))
	if got.Header.Get("Authorization") != want {
		t.Fatalf("git reached the forge with %q, want the real token added by the proxy", got.Header.Get("Authorization"))
	}
	for _, kv := range p.gitEnvironment() {
		if strings.Contains(kv, "real-forge-token") {
			t.Fatalf("the harness git environment carries the token: %s", kv)
		}
	}
}
