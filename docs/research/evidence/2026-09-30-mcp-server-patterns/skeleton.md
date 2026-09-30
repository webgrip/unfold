# Verified go-sdk skeleton

> Written by the go-sdk research agent on 2026-09-30 and checked first-hand the same day: `go vet ./...` and `go test ./...` pass with Go 1.25.0 against `github.com/modelcontextprotocol/go-sdk` v1.8.0 (via a local `replace`). It is a sketch of the patterns in [the guide](../../2026-09-30-mcp-server-patterns.md), not production code: the HMAC over the Shift id stands in for the sealed, principal-bound `requestState` the guide requires.

## `main.go`

```go
package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"runtime/debug"
	"slices"
	"strings"
	"sync"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/jsonrpc"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/modelcontextprotocol/go-sdk/oauthex"
)

type GetWorkItemIn struct {
	ID string `json:"id" jsonschema:"Work Item ID"`
}
type WorkItem struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}
type CancelShiftIn struct {
	ShiftID string `json:"shiftId" jsonschema:"Shift to cancel"`
}
type CancelShiftOut struct {
	ShiftID  string `json:"shiftId"`
	Canceled bool   `json:"canceled"`
}

var (
	schemas  = mcp.NewSchemaCache()
	stateKey = []byte(os.Getenv("PLOEG_MCP_STATE_KEY"))
	log      = slog.New(slog.NewJSONHandler(os.Stderr, nil)) // stdout is the stdio wire
	servers  sync.Map                                        // grant key -> *mcp.Server
	yes      = true
)

func sign(v string) string { // production: bind principal+tool+args+expiry, or use AEAD
	m := hmac.New(sha256.New, stateKey)
	m.Write([]byte(v))
	return v + "." + base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}
func getWorkItem(ctx context.Context, _ *mcp.CallToolRequest, in GetWorkItemIn) (*mcp.CallToolResult, WorkItem, error) {
	return nil, WorkItem{ID: in.ID, Title: "stub"}, nil // a returned error becomes an isError result
}
func cancelShift(ctx context.Context, req *mcp.CallToolRequest, in CancelShiftIn) (*mcp.CallToolResult, CancelShiftOut, error) {
	if st := req.Params.RequestState; st != "" {
		if !hmac.Equal([]byte(st), []byte(sign(in.ShiftID))) {
			return nil, CancelShiftOut{}, &jsonrpc.Error{Code: jsonrpc.CodeInvalidParams, Message: "invalid requestState"}
		}
		r, ok := req.Params.InputResponses["confirm"].(*mcp.ElicitResult)
		if !ok || r.Action != "accept" || r.Content["confirm"] != true {
			return nil, CancelShiftOut{}, errors.New("not confirmed; nothing changed")
		}
		return nil, CancelShiftOut{ShiftID: in.ShiftID, Canceled: true}, nil // call Ploeg REST here
	}
	if c := req.ClientCapabilities(); c == nil || c.Elicitation == nil {
		return nil, CancelShiftOut{}, errors.New("this tool needs a client that supports elicitation")
	}
	schema := &jsonschema.Schema{Type: "object", Required: []string{"confirm"},
		Properties: map[string]*jsonschema.Schema{"confirm": {Type: "boolean"}}}
	return &mcp.CallToolResult{
		InputRequests: mcp.InputRequestMap{"confirm": &mcp.ElicitParams{Message: fmt.Sprintf("Cancel Shift %s?", in.ShiftID), RequestedSchema: schema}},
		RequestState:  sign(in.ShiftID),
	}, CancelShiftOut{}, nil
}
func middleware(next mcp.MethodHandler) mcp.MethodHandler {
	return func(ctx context.Context, method string, req mcp.Request) (res mcp.Result, err error) {
		defer func() {
			if p := recover(); p != nil { // the SDK recovers nothing; a handler panic kills the process
				log.Error("panic", "method", method, "panic", p, "stack", string(debug.Stack()))
				res, err = nil, &jsonrpc.Error{Code: jsonrpc.CodeInternalError, Message: "internal error"}
			}
		}()
		principal := "stdio"
		if ex := req.GetExtra(); ex != nil && ex.TokenInfo != nil {
			principal = ex.TokenInfo.UserID // rate-limit key; Session.ID() is "" when stateless
		}
		res, err = next(ctx, method, req)
		log.Info("mcp", "method", method, "principal", principal, "err", err)
		return res, err
	}
}
func serverFor(grants ...string) *mcp.Server {
	key := strings.Join(slices.Sorted(slices.Values(grants)), ",")
	if s, ok := servers.Load(key); ok {
		return s.(*mcp.Server)
	}
	s := mcp.NewServer(&mcp.Implementation{Name: "ploeg-mcp", Version: "0.1.0"}, &mcp.ServerOptions{
		Instructions: "Read and steer Ploeg Work Items and Shifts.",
		Capabilities: &mcp.ServerCapabilities{Tools: &mcp.ToolCapabilities{}}, // no logging, no listChanged
		SchemaCache:  schemas,
		SetCacheable: func(_ context.Context, _ mcp.Request, c *mcp.Cacheable) { c.CacheScope = "private" },
	})
	s.AddReceivingMiddleware(middleware)
	if slices.Contains(grants, "read") {
		mcp.AddTool(s, &mcp.Tool{Name: "get_work_item", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true}}, getWorkItem)
	}
	if slices.Contains(grants, "write") {
		mcp.AddTool(s, &mcp.Tool{Name: "cancel_shift", Annotations: &mcp.ToolAnnotations{DestructiveHint: &yes}}, cancelShift)
	}
	actual, _ := servers.LoadOrStore(key, s)
	return actual.(*mcp.Server)
}
func main() {
	if len(os.Args) < 2 { // stdio: principal comes from local config, not a bearer token
		if err := serverFor("read", "write").Run(context.Background(), &mcp.StdioTransport{}); err != nil {
			log.Error("stdio", "err", err)
			os.Exit(1)
		}
		return
	}
	const resource, prm = "https://ploeg.example/mcp", "https://ploeg.example/.well-known/oauth-protected-resource/mcp"
	verify := func(ctx context.Context, token string, _ *http.Request) (*auth.TokenInfo, error) {
		// ours: JWKS signature, iss, exp, oauthex.MatchesResource(aud, resource), scopes, sub -> UserID
		return nil, fmt.Errorf("%w: not implemented", auth.ErrInvalidToken)
	}
	h := mcp.NewStreamableHTTPHandler(func(r *http.Request) *mcp.Server {
		if ti := auth.TokenInfoFromContext(r.Context()); ti != nil {
			return serverFor(ti.Scopes...) // called twice per request: must be cheap
		}
		return nil // 400
	}, &mcp.StreamableHTTPOptions{Stateless: true, PropagateRequestCancellation: true, Logger: log})
	mux := http.NewServeMux()
	mux.Handle("/.well-known/oauth-protected-resource/mcp", auth.ProtectedResourceMetadataHandler(&oauthex.ProtectedResourceMetadata{
		Resource: resource, AuthorizationServers: []string{"https://auth.example/application/o/ploeg/"}, ScopesSupported: []string{"read", "write"}}))
	mux.Handle("/mcp", auth.RequireBearerToken(verify, &auth.RequireBearerTokenOptions{ResourceMetadataURL: prm})(h))
	log.Error("http", "err", http.ListenAndServe(os.Args[1], mux))
}
```

## `main_test.go`

```go
package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func confirmClient() *mcp.Client {
	return mcp.NewClient(&mcp.Implementation{Name: "t", Version: "0"}, &mcp.ClientOptions{
		ElicitationHandler: func(context.Context, *mcp.ElicitRequest) (*mcp.ElicitResult, error) {
			return &mcp.ElicitResult{Action: "accept", Content: map[string]any{"confirm": true}}, nil
		},
	})
}

func TestInMemory(t *testing.T) {
	ctx := context.Background()
	for _, pv := range []string{"", "2025-11-25"} {
		ct, st := mcp.NewInMemoryTransports()
		s := serverFor("write", "read")
		if _, err := s.Connect(ctx, st, nil); err != nil {
			t.Fatal(err)
		}
		cs, err := confirmClient().Connect(ctx, ct, &mcp.ClientSessionOptions{ProtocolVersion: pv})
		if err != nil {
			t.Fatal(err)
		}
		lt, _ := cs.ListTools(ctx, nil)
		b, _ := json.Marshal(lt)
		t.Logf("pv=%q list=%s", pv, b)
		res, err := cs.CallTool(ctx, &mcp.CallToolParams{Name: "cancel_shift", Arguments: map[string]any{"shiftId": "s1"}})
		b, _ = json.Marshal(res)
		t.Logf("pv=%q call err=%v res=%s", pv, err, b)
		res, err = cs.CallTool(ctx, &mcp.CallToolParams{Name: "get_work_item", Arguments: map[string]any{"id": 3}})
		b, _ = json.Marshal(res)
		t.Logf("pv=%q badinput err=%v res=%s", pv, err, b)
		cs.Close()
	}
}

func TestStatelessHTTP(t *testing.T) {
	ctx := context.Background()
	verifier := func(context.Context, string, *http.Request) (*auth.TokenInfo, error) {
		return &auth.TokenInfo{UserID: "u1", Scopes: []string{"read", "write"}, Expiration: timeFar}, nil
	}
	h := mcp.NewStreamableHTTPHandler(func(r *http.Request) *mcp.Server {
		ti := auth.TokenInfoFromContext(r.Context())
		return serverFor(ti.Scopes...)
	}, &mcp.StreamableHTTPOptions{Stateless: true})
	srv := httptest.NewServer(auth.RequireBearerToken(verifier, nil)(h))
	defer srv.Close()
	hc := &http.Client{Transport: bearerRT{}}
	for _, pv := range []string{"", "2025-11-25"} {
		cs, err := confirmClient().Connect(ctx, &mcp.StreamableClientTransport{Endpoint: srv.URL, HTTPClient: hc}, &mcp.ClientSessionOptions{ProtocolVersion: pv})
		if err != nil {
			t.Fatal(pv, err)
		}
		t.Logf("pv=%q negotiated=%s", pv, cs.InitializeResult().ProtocolVersion)
		res, err := cs.CallTool(ctx, &mcp.CallToolParams{Name: "cancel_shift", Arguments: map[string]any{"shiftId": "s1"}})
		b, _ := json.Marshal(res)
		t.Logf("pv=%q http call err=%v res=%s", pv, err, b)
		cs.Close()
	}
	// raw POST without version header, to see stateless handling of a plain error from middleware
	req, _ := http.NewRequest("POST", srv.URL, strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	resp, err := hc.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	var sb strings.Builder
	buf := make([]byte, 4096)
	n, _ := resp.Body.Read(buf)
	sb.Write(buf[:n])
	t.Logf("raw legacy tools/list status=%d body=%s", resp.StatusCode, sb.String())
	_ = errors.New
}

type bearerRT struct{}

func (bearerRT) RoundTrip(r *http.Request) (*http.Response, error) {
	r.Header.Set("Authorization", "Bearer x")
	return http.DefaultTransport.RoundTrip(r)
}

var timeFar = mustTime()

func mustTime() (t0 time.Time) { return time.Now().Add(time.Hour) }
```

## `shim_test.go`

```go
package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestShimStateless(t *testing.T) {
	ctx := context.Background()
	s := mcp.NewServer(&mcp.Implementation{Name: "x", Version: "0"}, nil)
	s.AddReceivingMiddleware(func(next mcp.MethodHandler) mcp.MethodHandler {
		return func(ctx context.Context, m string, r mcp.Request) (mcp.Result, error) {
			if m == "prompts/list" {
				return nil, errors.New("plain error from middleware")
			}
			return next(ctx, m, r)
		}
	})
	mcp.AddTool(s, &mcp.Tool{Name: "ask"}, func(ctx context.Context, req *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, any, error) {
		if len(req.Params.InputResponses) > 0 {
			return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "ok"}}}, nil, nil
		}
		return &mcp.CallToolResult{InputRequests: mcp.InputRequestMap{"c": &mcp.ElicitParams{Message: "sure?"}}}, nil, nil
	})
	mcp.AddTool(s, &mcp.Tool{Name: "boom"}, func(ctx context.Context, req *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, any, error) {
		return nil, nil, errors.New("backend 503")
	})
	s.AddPrompt(&mcp.Prompt{Name: "p"}, func(context.Context, *mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return &mcp.GetPromptResult{}, nil
	})
	srv := httptest.NewServer(mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return s }, &mcp.StreamableHTTPOptions{Stateless: true}))
	defer srv.Close()
	for _, pv := range []string{"", "2025-11-25"} {
		cs, err := confirmClient().Connect(ctx, &mcp.StreamableClientTransport{Endpoint: srv.URL}, &mcp.ClientSessionOptions{ProtocolVersion: pv})
		if err != nil {
			t.Fatal(err)
		}
		for _, name := range []string{"ask", "boom", "nope"} {
			res, err := cs.CallTool(ctx, &mcp.CallToolParams{Name: name})
			b, _ := json.Marshal(res)
			t.Logf("pv=%q %s err=%v res=%s", pv, name, err, b)
		}
		_, err = cs.ListPrompts(ctx, nil)
		t.Logf("pv=%q prompts/list plain-error => %v", pv, err)
		cs.Close()
	}
}
```

