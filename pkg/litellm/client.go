// Package litellm wraps the LiteLLM proxy admin API for per-run key
// lifecycle (mint + revoke, list + batch delete). Importers should create
// a single Client per process and reuse it for sweeper operations.
package litellm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// AliasPrefix is the fixed prefix for every per-run LiteLLM key alias.
// Grafana joins spend↔run↔ticket on key_alias matching "ploeg-<12hex>".
const AliasPrefix = "ploeg-"

// Alias returns the LiteLLM key alias for a run token: "ploeg-" + first 12
// hex characters of the token. Returns "" when the token is too short; the
// caller should skip the operation (best-effort cleanup must never crash).
func Alias(runToken string) string {
	if len(runToken) < 12 {
		return ""
	}
	return AliasPrefix + runToken[:12]
}

// Client talks to a LiteLLM proxy admin API.
type Client struct {
	baseURL   string
	masterKey string
	httpCli   *http.Client
}

// NewClient returns a Client pointing at the given LiteLLM proxy base URL
// (e.g. "http://litellm:4000") and authenticating with the admin master key.
func NewClient(baseURL, masterKey string) *Client {
	return &Client{
		baseURL:   baseURL,
		masterKey: masterKey,
		httpCli: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// MintRequest is the JSON body for POST /key/generate.
type MintRequest struct {
	KeyAlias  string   `json:"key_alias"`
	MaxBudget float64  `json:"max_budget,omitempty"`
	Models    []string `json:"models,omitempty"`
	// Duration is LiteLLM's key TTL, a duration string it parses itself
	// ("30s", "30m", "30h", "30d"). This field used to be `max_hours_ttl`,
	// which is not a LiteLLM field at all: GenerateKeyRequest ignores unknown
	// keys, so every key ever minted by Ploeg had NO expiry while three
	// separate comments called the TTL "the backstop". A revoke that failed
	// left an immortal budgeted credential — observed on 2026-07-24..27, when
	// eight keys for finished runs accumulated and stayed live.
	Duration string `json:"duration,omitempty"`
}

// MintResponse is the subset of the /key/generate response we need.
type MintResponse struct {
	Key string `json:"key"`
}

// Mint creates a new per-run key and returns its string value.
func (c *Client) Mint(ctx context.Context, req MintRequest) (string, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("litellm: marshal mint request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/key/generate", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("litellm: create mint request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.masterKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpCli.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("litellm: mint request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("litellm: mint request got HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var mr MintResponse
	if err := json.NewDecoder(resp.Body).Decode(&mr); err != nil {
		return "", fmt.Errorf("litellm: decode mint response: %w", err)
	}
	if mr.Key == "" {
		return "", fmt.Errorf("litellm: mint response returned empty key")
	}
	return mr.Key, nil
}

// Revoke deletes a previously-minted key via POST /key/delete.
// Errors are logged by the caller; MintRequest.Duration is the backstop, and
// the periodic orphan sweep is the one after that.
func (c *Client) Revoke(ctx context.Context, key string) error {
	return c.DeleteKeys(ctx, []string{key})
}

// keyInfoResponse is the subset of GET /key/info we need. `info.spend` is the
// proxy's own running total for that key, which is what makes it usable as an
// enforcement figure: it is the gateway's accounting, not a number the agent
// reported about itself.
type keyInfoResponse struct {
	Info struct {
		Spend     float64 `json:"spend"`
		MaxBudget float64 `json:"max_budget"`
	} `json:"info"`
}

// KeySpend returns what a key has spent so far. Only meaningful while the key
// exists — call it before Revoke.
func (c *Client) KeySpend(ctx context.Context, key string) (float64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/key/info?key="+url.QueryEscape(key), nil)
	if err != nil {
		return 0, fmt.Errorf("litellm: create key info request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.masterKey)

	resp, err := c.httpCli.Do(req)
	if err != nil {
		return 0, fmt.Errorf("litellm: key info request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("litellm: key info got HTTP %d: %s", resp.StatusCode, string(body))
	}
	var ki keyInfoResponse
	if err := json.NewDecoder(resp.Body).Decode(&ki); err != nil {
		return 0, fmt.Errorf("litellm: decode key info: %w", err)
	}
	return ki.Info.Spend, nil
}

// KeyInfo is a single entry from the /key/list response (with
// return_full_object=true).
type KeyInfo struct {
	Token    string `json:"token"`
	KeyAlias string `json:"key_alias"`
}

// listKeysResponse is the full /key/list response shape.
type listKeysResponse struct {
	Keys        []KeyInfo `json:"keys"`
	TotalCount  int       `json:"total_count"`
	TotalPages  int       `json:"total_pages"`
	CurrentPage int       `json:"current_page"`
}

// ListKeys lists all keys from the LiteLLM proxy. When prefix is non-empty,
// results are filtered client-side to keys whose key_alias starts with the
// given prefix. The method paginates through all pages.
func (c *Client) ListKeys(ctx context.Context, prefix string) ([]KeyInfo, error) {
	var all []KeyInfo
	page := 1
	for {
		url := fmt.Sprintf("%s/key/list?return_full_object=true&size=100&page=%d", c.baseURL, page)
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, fmt.Errorf("litellm: create list request: %w", err)
		}
		httpReq.Header.Set("Authorization", "Bearer "+c.masterKey)

		resp, err := c.httpCli.Do(httpReq)
		if err != nil {
			return nil, fmt.Errorf("litellm: list request: %w", err)
		}

		var lr listKeysResponse
		if err := json.NewDecoder(resp.Body).Decode(&lr); err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("litellm: decode list response: %w", err)
		}
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("litellm: list request got HTTP %d", resp.StatusCode)
		}

		for _, k := range lr.Keys {
			if prefix == "" || strings.HasPrefix(k.KeyAlias, prefix) {
				all = append(all, k)
			}
		}

		if page >= lr.TotalPages {
			break
		}
		page++
	}
	return all, nil
}

// DeleteKeys deletes one or more LiteLLM keys by their hashed token values
// (the "token" field from /key/list). Sending tokens for already-deleted keys
// is idempotent: the proxy returns HTTP 200 (deletes what exists, echoes the
// rest) or HTTP 404 when none exist — both are treated as success here.
func (c *Client) DeleteKeys(ctx context.Context, tokens []string) error {
	if len(tokens) == 0 {
		return nil
	}
	body, err := json.Marshal(map[string]any{"keys": tokens})
	if err != nil {
		return fmt.Errorf("litellm: marshal delete request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/key/delete", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("litellm: create delete request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.masterKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpCli.Do(httpReq)
	if err != nil {
		return fmt.Errorf("litellm: delete request: %w", err)
	}
	defer resp.Body.Close()

	// 200 = at least some deleted; 404 = none found (idempotent).
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("litellm: delete request got HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}
