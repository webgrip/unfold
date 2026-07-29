// Package forgebroker is the credential seam between Ploeg and a git forge:
// mint a repo-scoped, write-scoped token for one writing Run, hand it over,
// and revoke it when the Run settles or its Lease lapses.
//
// ADR-0013 tier 2. Tier 1 gave readers a weaker static token, which closes
// the hole that matters — a reviewer cannot push to the branch it reviews.
// This closes the other one: the ZOMBIE WRITER. A pod partitioned from
// ploegd keeps running after its Lease expires, and with a shared static
// credential it can still push to a branch another Run has since taken over.
// Holding the Lease and being able to push become one fact rather than two
// that can disagree.
//
// Deliberately the same shape as pkg/llmbroker — mint, hand over, let it die,
// reconcile from the sweeper — because that pattern is proven here and a
// second novel one would be a second thing to get wrong. Callers speak run
// tokens; forge-specific identity stays inside the implementation.
package forgebroker

import (
	"context"
	"time"
)

// Broker mints and revokes per-run forge credentials.
type Broker interface {
	// Mint issues a credential scoped to one repository. The returned
	// Credential's ID is what Revoke needs and what the lease row stores.
	Mint(ctx context.Context, req MintRequest) (Credential, error)
	// Revoke is idempotent and best-effort: the token's own expiry is the
	// backstop, never the mechanism.
	Revoke(ctx context.Context, cred Credential) error
}

// Sweeper is ploegd's reconciliation view — the same two questions the LLM
// sweeper answers, for push rights.
type Sweeper interface {
	// RevokeByID revokes one previously minted credential (lease expiry).
	RevokeByID(ctx context.Context, id string) error
	// SweepOrphans revokes every ploeg-minted forge token that does not
	// belong to a live run, returning how many were revoked (boot sweep).
	SweepOrphans(ctx context.Context, aliveIDs []string) (int, error)
}

// MintRequest describes the push rights one writing Run needs.
type MintRequest struct {
	// RunToken identifies the Run; its first 12 hex become the token name, so
	// a token in the forge's UI can be traced to a Run, a Shift and a ticket
	// the same way the LiteLLM alias is.
	RunToken string
	// Owner and Repo scope the token to exactly one repository. A credential
	// that can reach a second repo is the blast radius this package exists to
	// remove.
	Owner, Repo string
	// TTL bounds the credential even if every revocation path fails.
	TTL time.Duration
}

// Credential is a minted per-run forge token.
type Credential struct {
	// ID is the forge's handle for the token — what Revoke and the sweeper
	// use. Stored on the lease row (leases.forge_token_id).
	ID string
	// Token is the secret. Handed to the worker over the run API and never
	// written to a log, an audit row or a Task Spec (R8).
	Token string
	// Name is the human-readable token name in the forge's UI.
	Name string
}

// Static is the pre-tier-2 behaviour: one shared credential, no minting, no
// revocation. It is what a deployment gets when no forge admin credential is
// configured, and it keeps the worker path identical either way.
type Static struct{ Token string }

func (s Static) Mint(context.Context, MintRequest) (Credential, error) {
	return Credential{Token: s.Token}, nil
}

// Revoke does nothing: a shared credential outlives every run by definition,
// which is precisely the property tier 2 removes.
func (s Static) Revoke(context.Context, Credential) error { return nil }
