// Package litellm wraps the LiteLLM proxy admin API for per-run key
// lifecycle (mint + revoke). Importers should create a single Client
// per run and call Mint + (defer) Revoke.
package litellm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

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
	KeyAlias    string   `json:"key_alias"`
	MaxBudget   float64  `json:"max_budget,omitempty"`
	Models      []string `json:"models,omitempty"`
	MaxHoursTTL float64  `json:"max_hours_ttl,omitempty"`
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
// Errors are logged by the caller; the 4 h TTL is the backstop.
func (c *Client) Revoke(ctx context.Context, key string) error {
	body, err := json.Marshal(map[string]string{"key": key})
	if err != nil {
		return fmt.Errorf("litellm: marshal revoke request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/key/delete", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("litellm: create revoke request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.masterKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpCli.Do(httpReq)
	if err != nil {
		return fmt.Errorf("litellm: revoke request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("litellm: revoke request got HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}
