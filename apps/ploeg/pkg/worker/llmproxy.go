package worker

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

// KeyIsolationProxy is the PLOEG_LLM_KEY_ISOLATION value that keeps the
// per-Run model key inside the worker: the harness receives a placeholder and
// a loopback base URL, and the worker's proxy swaps in the real key.
const KeyIsolationProxy = "proxy"

type llmKeyProxy struct {
	server      *http.Server
	baseURL     string
	placeholder string
}

func startLLMKeyProxy(upstream, key string) (*llmKeyProxy, error) {
	target, err := url.Parse(upstream)
	if err != nil || target.Scheme == "" || target.Host == "" {
		return nil, fmt.Errorf("model gateway URL %q is not absolute", upstream)
	}
	if key == "" {
		return nil, errors.New("no model key to isolate")
	}
	placeholder, err := randomPlaceholder()
	if err != nil {
		return nil, err
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("listen for the model key proxy: %w", err)
	}
	proxy := &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.Out.URL.Scheme = target.Scheme
			r.Out.URL.Host = target.Host
			r.Out.Host = target.Host
			swapModelKey(r.Out.Header, key)
		},
		FlushInterval: -1,
	}
	p := &llmKeyProxy{
		server: &http.Server{
			Handler:           proxy,
			ReadHeaderTimeout: 30 * time.Second,
		},
		baseURL:     "http://" + ln.Addr().String() + strings.TrimRight(target.Path, "/"),
		placeholder: placeholder,
	}
	go func() { _ = p.server.Serve(ln) }()
	return p, nil
}

func (p *llmKeyProxy) close() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = p.server.Shutdown(ctx)
}

func swapModelKey(h http.Header, key string) {
	anthropic := h.Get("X-Api-Key") != ""
	h.Del("Authorization")
	h.Del("X-Api-Key")
	h.Del("Api-Key")
	if anthropic {
		h.Set("X-Api-Key", key)
		return
	}
	h.Set("Authorization", "Bearer "+key)
}

func randomPlaceholder() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate model key placeholder: %w", err)
	}
	return "ploeg-isolated-" + hex.EncodeToString(b), nil
}

func withEnv(env []string, key, value string) []string {
	out := make([]string, 0, len(env)+1)
	for _, kv := range env {
		if !strings.HasPrefix(kv, key+"=") {
			out = append(out, kv)
		}
	}
	return append(out, key+"="+value)
}
