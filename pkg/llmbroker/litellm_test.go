package llmbroker

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/webgrip/ploeg/pkg/litellm"
)

// fakeAdmin is a schema-strict fake of the LiteLLM admin API, mirroring the
// behaviors the client tests pin (batch delete body, alias capture).
type fakeAdmin struct {
	keys     map[string]string // hashed token -> alias
	minted   []litellm.MintRequest
	deleted  []string
	mintFail bool
}

func newFakeAdmin() *fakeAdmin { return &fakeAdmin{keys: map[string]string{}} }

func (f *fakeAdmin) server(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/key/generate":
			if f.mintFail {
				http.Error(w, `{"error":"test error"}`, http.StatusInternalServerError)
				return
			}
			var req litellm.MintRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			for _, m := range req.Models {
				if strings.Contains(m, "/") {
					http.Error(w, "model scope contains '/'", http.StatusBadRequest)
					return
				}
			}
			if req.KeyAlias == "" {
				http.Error(w, "key_alias required", http.StatusBadRequest)
				return
			}
			f.minted = append(f.minted, req)
			key := "sk-" + req.KeyAlias
			f.keys["hashed-"+key] = req.KeyAlias
			_ = json.NewEncoder(w).Encode(map[string]string{"key": key})
		case "/key/delete":
			var req struct {
				Keys []string `json:"keys"`
				Key  string   `json:"key,omitempty"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.Key != "" {
				w.WriteHeader(http.StatusUnprocessableEntity)
				return
			}
			for _, k := range req.Keys {
				f.deleted = append(f.deleted, k)
				delete(f.keys, k)
				delete(f.keys, "hashed-"+k) // plaintext revoke path
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"message": "deleted"})
		case "/key/list":
			keys := make([]litellm.KeyInfo, 0, len(f.keys))
			for tok, alias := range f.keys {
				keys = append(keys, litellm.KeyInfo{Token: tok, KeyAlias: alias})
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"keys": keys, "total_count": len(keys), "total_pages": 1, "current_page": 1,
			})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func (f *fakeAdmin) broker(t *testing.T) *LiteLLM {
	return NewLiteLLM(litellm.NewClient(f.server(t).URL, "test-master-key"))
}

const runToken = "1cd43e1dfd6c000000000000000000000000000000000000"

func TestMint_AliasFormatIsLoadBearing(t *testing.T) {
	f := newFakeAdmin()
	cred, err := f.broker(t).Mint(context.Background(), MintRequest{
		RunToken: runToken, BudgetUSD: 2, Models: []string{"deepseek-chat"}, TTL: 4 * time.Hour,
	})
	if err != nil {
		t.Fatal(err)
	}
	if cred.Alias != "ploeg-1cd43e1dfd6c" {
		t.Errorf("alias = %q, want ploeg-1cd43e1dfd6c (Grafana joins on this)", cred.Alias)
	}
	if len(f.minted) != 1 || f.minted[0].KeyAlias != "ploeg-1cd43e1dfd6c" {
		t.Errorf("minted with alias %+v", f.minted)
	}
	if f.minted[0].MaxHoursTTL != 4 {
		t.Errorf("TTL hours = %v, want 4 (LITELLM_KEY_DURATION now flows through)", f.minted[0].MaxHoursTTL)
	}
	if cred.APIKey == "" {
		t.Error("mint returned no key")
	}
}

func TestMint_ShortTokenRejected(t *testing.T) {
	f := newFakeAdmin()
	if _, err := f.broker(t).Mint(context.Background(), MintRequest{RunToken: "short"}); err == nil {
		t.Fatal("expected error for a short run token")
	}
}

func TestRevoke_DeletesTheKey(t *testing.T) {
	f := newFakeAdmin()
	b := f.broker(t)
	cred, err := b.Mint(context.Background(), MintRequest{RunToken: runToken, TTL: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	if err := b.Revoke(context.Background(), cred); err != nil {
		t.Fatal(err)
	}
	if len(f.deleted) != 1 || f.deleted[0] != cred.APIKey {
		t.Errorf("deleted %v, want [%s]", f.deleted, cred.APIKey)
	}
}

func TestRevoke_EmptyCredentialIsNoop(t *testing.T) {
	f := newFakeAdmin()
	if err := f.broker(t).Revoke(context.Background(), Credential{}); err != nil {
		t.Fatal(err)
	}
	if len(f.deleted) != 0 {
		t.Errorf("noop revoke deleted %v", f.deleted)
	}
}

func TestRevokeForRun_ResolvesAliasToHashedTokens(t *testing.T) {
	f := newFakeAdmin()
	b := f.broker(t)
	if _, err := b.Mint(context.Background(), MintRequest{RunToken: runToken, TTL: time.Hour}); err != nil {
		t.Fatal(err)
	}
	if err := b.RevokeForRun(context.Background(), runToken); err != nil {
		t.Fatal(err)
	}
	if len(f.keys) != 0 {
		t.Errorf("keys left after RevokeForRun: %v", f.keys)
	}
}

func TestSweepOrphans_RevokesOnlyDeadRuns(t *testing.T) {
	f := newFakeAdmin()
	b := f.broker(t)
	aliveToken := "aaaaaaaaaaaa0000000000000000000000000000000000ial"
	for _, tok := range []string{runToken, aliveToken} {
		if _, err := b.Mint(context.Background(), MintRequest{RunToken: tok, TTL: time.Hour}); err != nil {
			t.Fatal(err)
		}
	}
	n, err := b.SweepOrphans(context.Background(), []string{aliveToken})
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("swept %d keys, want 1", n)
	}
	for _, alias := range f.keys {
		if alias != "ploeg-aaaaaaaaaaaa" {
			t.Errorf("live key %q was swept", alias)
		}
	}
	if len(f.keys) != 1 {
		t.Errorf("remaining keys = %v, want exactly the live one", f.keys)
	}
}

func TestSweepOrphans_NothingToDo(t *testing.T) {
	f := newFakeAdmin()
	n, err := f.broker(t).SweepOrphans(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("swept %d, want 0", n)
	}
}

func TestStatic_MintEchoesKeyAndKeepsTraceFormat(t *testing.T) {
	cred, err := Static{Key: "sk-byo"}.Mint(context.Background(), MintRequest{RunToken: runToken})
	if err != nil {
		t.Fatal(err)
	}
	if cred.APIKey != "sk-byo" || cred.Alias != "ploeg-1cd43e1dfd6c" {
		t.Errorf("cred = %+v", cred)
	}
	if err := (Static{}).Revoke(context.Background(), cred); err != nil {
		t.Fatal(err)
	}
}
