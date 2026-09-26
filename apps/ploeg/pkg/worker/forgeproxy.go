package worker

import (
	"context"
	"encoding/base64"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/webgrip/ploeg/pkg/harness"
)

// ForgeTokenIsolationProxy is the PLOEG_FORGE_TOKEN_ISOLATION value that keeps
// a writer's forge token inside the worker: the harness pushes and calls the
// forge API through a loopback proxy that only reaches the Run's repository.
const ForgeTokenIsolationProxy = "proxy"

type forgeTokenProxy struct {
	server      *http.Server
	baseURL     string
	upstream    string
	placeholder string
}

func startForgeTokenProxy(repo harness.RepoRef, token string) (*forgeTokenProxy, error) {
	target, err := url.Parse(repo.ForgeURL)
	if err != nil || target.Host == "" || (target.Scheme != "http" && target.Scheme != "https") {
		return nil, fmt.Errorf("forge URL %q is not absolute", repo.ForgeURL)
	}
	if token == "" {
		return nil, fmt.Errorf("no forge token to isolate")
	}
	placeholder, err := randomPlaceholder()
	if err != nil {
		return nil, err
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("listen for the forge token proxy: %w", err)
	}
	scope := newForgeScope(repo)
	proxy := &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.Out.URL.Scheme = target.Scheme
			r.Out.URL.Host = target.Host
			r.Out.Host = target.Host
			attachForgeToken(r.Out.Header, scope.kind(r.Out.URL), repo.Dialect(), token)
		},
		FlushInterval: -1,
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if scope.kind(r.URL) == forgeOutOfScope {
			http.Error(w, "this Run's forge access is limited to "+repo.ProjectPath(), http.StatusForbidden)
			return
		}
		proxy.ServeHTTP(w, r)
	})
	p := &forgeTokenProxy{
		server:      &http.Server{Handler: handler, ReadHeaderTimeout: 30 * time.Second},
		baseURL:     "http://" + ln.Addr().String(),
		upstream:    target.Scheme + "://" + target.Host,
		placeholder: placeholder,
	}
	go func() { _ = p.server.Serve(ln) }()
	return p, nil
}

func (p *forgeTokenProxy) close() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = p.server.Shutdown(ctx)
}

func (p *forgeTokenProxy) gitEnvironment() []string {
	return []string{
		"GIT_TERMINAL_PROMPT=0", "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null",
		"GIT_CONFIG_COUNT=1",
		"GIT_CONFIG_KEY_0=url." + p.baseURL + "/.insteadOf",
		"GIT_CONFIG_VALUE_0=" + p.upstream + "/",
	}
}

type forgeRequestKind int

const (
	forgeOutOfScope forgeRequestKind = iota
	forgeGit
	forgeAPI
)

type forgeScope struct {
	git []string
	api []string
}

func newForgeScope(repo harness.RepoRef) forgeScope {
	project := "/" + repo.Owner + "/" + repo.Name
	api := "/api/v1/repos" + project
	if repo.Dialect() == harness.ForgeGitLab {
		api = "/api/v4/projects/" + url.PathEscape(repo.ProjectPath())
	}
	return forgeScope{
		git: []string{strings.ToLower(project + ".git")},
		api: []string{strings.ToLower(api)},
	}
}

func (s forgeScope) kind(u *url.URL) forgeRequestKind {
	path := strings.ToLower(u.EscapedPath())
	if strings.Contains(path, "/../") || strings.HasSuffix(path, "/..") || strings.Contains(path, "%2e%2e") {
		return forgeOutOfScope
	}
	for _, prefix := range s.git {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return forgeGit
		}
	}
	for _, prefix := range s.api {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return forgeAPI
		}
	}
	return forgeOutOfScope
}

func attachForgeToken(h http.Header, kind forgeRequestKind, dialect, token string) {
	h.Del("Authorization")
	h.Del("Private-Token")
	switch {
	case kind == forgeGit:
		h.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte("agent-builder:"+token)))
	case kind == forgeAPI && dialect == harness.ForgeGitLab:
		h.Set("Private-Token", token)
	case kind == forgeAPI:
		h.Set("Authorization", "token "+token)
	}
}
