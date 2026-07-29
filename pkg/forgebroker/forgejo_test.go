package forgebroker

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Per-run push rights are the credential half of ADR-0010: holding the Lease
// and being able to push must be one fact. These pin the properties that make
// that true — scope, traceability, and that revocation actually happens.

func TestMint_ScopedAndTraceable(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		_ = json.NewEncoder(w).Encode(map[string]any{"id": 42, "name": gotBody["name"], "sha1": "s3cret-token"})
	}))
	defer srv.Close()

	b := &Forgejo{BaseURL: srv.URL, AdminUser: "agent-builder", AdminToken: "admin"}
	cred, err := b.Mint(context.Background(), MintRequest{
		RunToken: "1cd43e1dfd6c9a8b7f6e5d4c", Owner: "webgrip", Repo: "ploeg",
	})
	if err != nil {
		t.Fatalf("Mint: %v", err)
	}
	if cred.Token != "s3cret-token" || cred.ID != "42" {
		t.Errorf("credential = %+v", cred)
	}
	if !strings.Contains(gotPath, "/admin/users/agent-builder/tokens") {
		t.Errorf("path = %q", gotPath)
	}
	// The scope must be write:repository and nothing wider — no admin, no
	// user, no org.
	scopes, _ := json.Marshal(gotBody["scopes"])
	if string(scopes) != `["write:repository"]` {
		t.Errorf("scopes = %s, want exactly write:repository", scopes)
	}
	// The name traces the token to a run and a repo: the same 12 hex that
	// joins spend to ticket in Grafana.
	if !strings.HasPrefix(cred.Name, namePrefix+"1cd43e1dfd6c") ||
		!strings.Contains(cred.Name, "webgrip-ploeg") {
		t.Errorf("name = %q, not traceable to the run and repo", cred.Name)
	}
}

// A token with no repository is the blast radius this package exists to
// remove, so it is refused before the forge is even called.
func TestMint_RefusesAnUnscopedRequest(t *testing.T) {
	b := &Forgejo{BaseURL: "http://example.invalid", AdminUser: "agent-builder"}
	if _, err := b.Mint(context.Background(), MintRequest{RunToken: "x"}); err == nil {
		t.Error("minted a token with no repository")
	}
}

// The worker's defer and the sweeper both revoke, and they race by design: an
// already-deleted token is the desired end state, not an error.
func TestRevoke_AlreadyGoneIsSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"message":"token does not exist"}`))
	}))
	defer srv.Close()

	b := &Forgejo{BaseURL: srv.URL, AdminUser: "agent-builder", AdminToken: "admin"}
	if err := b.Revoke(context.Background(), Credential{ID: "42", Name: "ploeg-run-abc"}); err != nil {
		t.Errorf("revoking an already-deleted token errored: %v", err)
	}
	// Nothing minted (Static, or a failed mint) is a no-op, not a call.
	if err := b.Revoke(context.Background(), Credential{}); err != nil {
		t.Errorf("revoking an empty credential errored: %v", err)
	}
}

// The boot sweep must revoke OUR orphans and nothing else — a human's
// personal token on the same bot has to survive.
func TestSweepOrphans_LeavesForeignTokensAlone(t *testing.T) {
	var deleted []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			parts := strings.Split(r.URL.Path, "/")
			deleted = append(deleted, parts[len(parts)-1])
			w.WriteHeader(http.StatusNoContent)
			return
		}
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"id": 1, "name": namePrefix + "aaa-webgrip-ploeg"}, // orphan: revoke
			{"id": 2, "name": namePrefix + "bbb-webgrip-ploeg"}, // alive: keep
			{"id": 3, "name": "ryan's laptop"},                  // human: never touch
		})
	}))
	defer srv.Close()

	b := &Forgejo{BaseURL: srv.URL, AdminUser: "agent-builder", AdminToken: "admin"}
	n, err := b.SweepOrphans(context.Background(), []string{"2"})
	if err != nil {
		t.Fatalf("SweepOrphans: %v", err)
	}
	if n != 1 {
		t.Errorf("revoked %d, want 1", n)
	}
	for _, d := range deleted {
		if strings.Contains(d, "laptop") {
			t.Fatalf("the sweep deleted a token it did not mint: %v", deleted)
		}
	}
	if len(deleted) != 1 || !strings.Contains(deleted[0], "aaa") {
		t.Errorf("deleted = %v, want only the orphan", deleted)
	}
}

// Without a forge admin credential the deployment keeps the shared token, and
// the worker path is identical either way.
func TestStatic_IsTheUnmintedFallback(t *testing.T) {
	s := Static{Token: "shared"}
	cred, err := s.Mint(context.Background(), MintRequest{Owner: "o", Repo: "r"})
	if err != nil || cred.Token != "shared" {
		t.Fatalf("Static.Mint = %+v, %v", cred, err)
	}
	if cred.ID != "" {
		t.Error("a static credential must have no id: there is nothing to revoke")
	}
	if err := s.Revoke(context.Background(), cred); err != nil {
		t.Errorf("Static.Revoke = %v", err)
	}
}
