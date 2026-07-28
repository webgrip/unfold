// Package llmbroker is the credential seam between Ploeg and an LLM
// gateway: mint a budgeted per-run credential before the harness starts,
// revoke it on every return path, and reconcile leaks from ploegd's sweeps.
// Callers speak run tokens; gateway-specific identity (LiteLLM's hashed
// tokens, the alias format) stays inside the implementation.
package llmbroker

import (
	"context"
	"time"
)

// Broker mints and revokes per-run LLM credentials (worker side).
type Broker interface {
	Mint(ctx context.Context, req MintRequest) (Credential, error)
	// Revoke is idempotent and best-effort: the gateway TTL is the backstop,
	// never the mechanism.
	Revoke(ctx context.Context, cred Credential) error
}

// Sweeper is ploegd's reconciliation view: crash cleanup by run token and
// the boot-time orphan sweep.
type Sweeper interface {
	// RevokeForRun revokes whatever credentials exist for a run token
	// (lease-expiry sweep).
	RevokeForRun(ctx context.Context, runToken string) error
	// SweepOrphans revokes every ploeg credential that does not belong to a
	// live run, returning how many were revoked (boot sweep).
	SweepOrphans(ctx context.Context, aliveRunTokens []string) (int, error)
}

// MintRequest describes the credential one run needs.
type MintRequest struct {
	RunToken  string
	BudgetUSD float64
	Models    []string // model scope; empty = unrestricted
	TTL       time.Duration
}

// Credential is a minted per-run credential. Alias is the audit/trace id
// (exported to the harness as LLM_TRACE_ID); an empty APIKey means the
// harness image authenticates itself.
type Credential struct {
	APIKey string
	Alias  string
}
