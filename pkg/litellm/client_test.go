package litellm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMintRevoke_WithFakeServer(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/key/generate":
			var req MintRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.KeyAlias != "ploeg-test" {
				http.Error(w, "unexpected alias", http.StatusBadRequest)
				return
			}
			// Reject model names containing a "/" prefix (real LiteLLM
			// requirement — the worker must strip proxy prefixes).
			for _, m := range req.Models {
				if strings.Contains(m, "/") {
					http.Error(w, "model scope contains '/' — strip proxy prefix first", http.StatusBadRequest)
					return
				}
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"key": "sk-minted"})
		case "/key/delete":
			// LiteLLM /key/delete expects {"keys": [...]}, not bare "key".
			var req struct {
				Keys []string `json:"keys"`
				Key  string   `json:"key,omitempty"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.Key != "" {
				// Bare "key" field is the old wire format — reject with 422.
				w.WriteHeader(http.StatusUnprocessableEntity)
				_, _ = w.Write([]byte(`{"error":"InvalidKeyFormat: use keys array, not key"}`))
				return
			}
			if len(req.Keys) != 1 || req.Keys[0] != "sk-minted" {
				http.Error(w, "unexpected keys", http.StatusBadRequest)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"message": "deleted"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	cli := NewClient(srv.URL, "test-master-key")

	ctx := context.Background()
	key, err := cli.Mint(ctx, MintRequest{
		KeyAlias:  "ploeg-test",
		MaxBudget: 100,
		Models:    []string{"gpt-4"},
	})
	if err != nil {
		t.Fatalf("Mint: %v", err)
	}
	if key != "sk-minted" {
		t.Fatalf("got key %q, want sk-minted", key)
	}

	if err := cli.Revoke(ctx, key); err != nil {
		t.Fatalf("Revoke: %v", err)
	}
}

func TestMintRevoke_ErrorResponses(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
	}))
	defer srv.Close()

	cli := NewClient(srv.URL, "bad-key")
	ctx := context.Background()

	_, err := cli.Mint(ctx, MintRequest{KeyAlias: "test", MaxBudget: 10})
	if err == nil {
		t.Fatal("expected error from Mint, got nil")
	}
	if !strings.Contains(err.Error(), "HTTP 401") {
		t.Errorf("error should mention HTTP status: %v", err)
	}

	err = cli.Revoke(ctx, "sk-test")
	if err == nil {
		t.Fatal("expected error from Revoke, got nil")
	}
	if !strings.Contains(err.Error(), "HTTP 401") {
		t.Errorf("error should mention HTTP status: %v", err)
	}
}

func TestMintRequest_EmptyModels(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req MintRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if req.Models == nil {
			_ = json.NewEncoder(w).Encode(map[string]string{"key": "sk-no-models"})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"key": "sk-with-models"})
	}))
	defer srv.Close()

	cli := NewClient(srv.URL, "test-key")

	key, err := cli.Mint(context.Background(), MintRequest{
		KeyAlias: "ploeg-test", MaxBudget: 50,
	})
	if err != nil {
		t.Fatalf("Mint (nil models): %v", err)
	}
	if key != "sk-no-models" {
		t.Errorf("got %q, want sk-no-models", key)
	}

	key, err = cli.Mint(context.Background(), MintRequest{
		KeyAlias: "ploeg-test", MaxBudget: 50, Models: []string{},
	})
	if err != nil {
		t.Fatalf("Mint (empty models): %v", err)
	}
	if key != "sk-no-models" {
		t.Errorf("got %q, want sk-no-models", key)
	}
}

func TestMint_EmptyKeyResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]string{"key": ""})
	}))
	defer srv.Close()

	cli := NewClient(srv.URL, "test-key")
	_, err := cli.Mint(context.Background(), MintRequest{KeyAlias: "test"})
	if err == nil {
		t.Fatal("expected error for empty key, got nil")
	}
}

func TestMint_NetworkError(t *testing.T) {
	cli := NewClient("http://127.0.0.1:1", "test-key")
	ctx := context.Background()
	_, err := cli.Mint(ctx, MintRequest{KeyAlias: "test"})
	if err == nil {
		t.Fatal("expected error for connection refused, got nil")
	}
}
