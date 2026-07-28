package worker

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/webgrip/ploeg/pkg/harness"
	"github.com/webgrip/ploeg/pkg/work"
)

// APIClient speaks ploegd's run API (docs/contracts/executor.md): claim,
// renew, checkpoint, outcome. The run token is the only credential.
type APIClient struct {
	Base string
	HC   *http.Client
}

type ClaimResponse struct {
	RunToken string        `json:"runToken"`
	Deadline time.Time     `json:"deadline"`
	WorkItem work.WorkItem `json:"workItem"`
}

// Claim returns nil when the queue is empty (HTTP 204) — the empty-handed
// worker convention (backlog #49).
func (a *APIClient) Claim(team string) (*ClaimResponse, error) {
	body, _ := json.Marshal(map[string]string{"team": team})
	resp, err := a.HC.Post(a.Base+"/api/v1/claim", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusNoContent:
		return nil, nil
	case http.StatusOK:
		var c ClaimResponse
		if err := json.NewDecoder(resp.Body).Decode(&c); err != nil {
			return nil, err
		}
		return &c, nil
	default:
		return nil, fmt.Errorf("claim: HTTP %d", resp.StatusCode)
	}
}

// Renew returns gone=true when the lease is not ours anymore (404).
func (a *APIClient) Renew(token string) (bool, error) {
	resp, err := a.HC.Post(a.Base+"/api/v1/runs/"+token+"/renew", "application/json", nil)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK:
		return false, nil
	case http.StatusNotFound:
		return true, nil
	default:
		return false, fmt.Errorf("renew: HTTP %d", resp.StatusCode)
	}
}

func (a *APIClient) Checkpoint(token string, cp work.Checkpoint) error {
	return a.post("/api/v1/runs/"+token+"/checkpoint", cp)
}

// Outcome posts the full OutcomeReport (schema
// docs/contracts/outcomereport.v1.schema.json); a final checkpoint rides
// inline instead of a separate call.
func (a *APIClient) Outcome(token string, rep harness.OutcomeReport) error {
	return a.post("/api/v1/runs/"+token+"/outcome", rep)
}

func (a *APIClient) post(path string, v any) error {
	body, err := json.Marshal(v)
	if err != nil {
		return err
	}
	resp, err := a.HC.Post(a.Base+path, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("%s: HTTP %d: %s", path, resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	return nil
}
