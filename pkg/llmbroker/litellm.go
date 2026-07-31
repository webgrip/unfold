package llmbroker

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/webgrip/ploeg/pkg/litellm"
)

// LiteLLM implements Broker and Sweeper against the LiteLLM proxy admin
// API. The alias invariant ("ploeg-" + first 12 hex of the run token,
// Grafana joins on it) lives in pkg/litellm — this type only applies it.
type LiteLLM struct {
	cli *litellm.Client
}

func NewLiteLLM(cli *litellm.Client) *LiteLLM { return &LiteLLM{cli: cli} }

var _ Broker = (*LiteLLM)(nil)
var _ Sweeper = (*LiteLLM)(nil)
var _ Metered = (*LiteLLM)(nil)

// Spend asks the proxy what this key has spent. Must be called before Revoke:
// deleting the key deletes the row this reads.
func (b *LiteLLM) Spend(ctx context.Context, cred Credential) (float64, error) {
	if cred.APIKey == "" {
		return 0, fmt.Errorf("no credential to meter")
	}
	return b.cli.KeySpend(ctx, cred.APIKey)
}

func (b *LiteLLM) Mint(ctx context.Context, req MintRequest) (Credential, error) {
	alias := litellm.Alias(req.RunToken)
	if alias == "" {
		return Credential{}, fmt.Errorf("run token too short for key alias")
	}
	// Fail closed. MaxBudget is omitempty, so a zero budget does not mint a
	// zero-spend key — it mints an UNCAPPED one, silently. The only way that
	// value reaches here is a misconfiguration (an unset or unparseable
	// LITELLM_KEY_BUDGET, a team with no cap and no budget), and an
	// unattended agent with an unlimited credential is the one outcome this
	// package exists to prevent.
	if req.BudgetUSD <= 0 {
		return Credential{}, fmt.Errorf("refusing to mint an uncapped key: budget is %v", req.BudgetUSD)
	}
	key, err := b.cli.Mint(ctx, litellm.MintRequest{
		KeyAlias:  alias,
		MaxBudget: req.BudgetUSD,
		Models:    req.Models,
		Duration:  ttlString(req.TTL),
	})
	if err != nil {
		return Credential{}, err
	}
	return Credential{APIKey: key, Alias: alias}, nil
}

// ttlString renders a TTL in the duration format LiteLLM parses ("30s",
// "30m", "30h", "30d"). Seconds, so nothing is lost to rounding — a 90m TTL
// sent as "1h" would expire half an hour early. Empty for a non-positive
// TTL, which leaves the key without an expiry; that is the caller's choice
// to make explicitly, not this function's to invent.
func ttlString(d time.Duration) string {
	if d <= 0 {
		return ""
	}
	return strconv.FormatInt(int64(d.Seconds()), 10) + "s"
}

func (b *LiteLLM) Revoke(ctx context.Context, cred Credential) error {
	if cred.APIKey == "" {
		return nil
	}
	return b.cli.Revoke(ctx, cred.APIKey)
}

// RevokeForRun looks the run's key(s) up by exact alias and batch-deletes
// them — the lease-expiry path, where the plaintext key is long gone.
func (b *LiteLLM) RevokeForRun(ctx context.Context, runToken string) error {
	alias := litellm.Alias(runToken)
	if alias == "" {
		return fmt.Errorf("run token too short for key alias")
	}
	keys, err := b.cli.ListKeys(ctx, alias)
	if err != nil {
		return fmt.Errorf("list keys for %s: %w", alias, err)
	}
	tokens := make([]string, 0, len(keys))
	for _, k := range keys {
		tokens = append(tokens, k.Token)
	}
	if len(tokens) == 0 {
		return nil
	}
	return b.cli.DeleteKeys(ctx, tokens)
}

// SweepOrphans deletes every ploeg-* key whose alias does not belong to an
// unfinished run.
func (b *LiteLLM) SweepOrphans(ctx context.Context, aliveRunTokens []string) (int, error) {
	keys, err := b.cli.ListKeys(ctx, litellm.AliasPrefix)
	if err != nil {
		return 0, err
	}
	if len(keys) == 0 {
		return 0, nil
	}
	alive := make(map[string]struct{}, len(aliveRunTokens))
	for _, tok := range aliveRunTokens {
		if alias := litellm.Alias(tok); alias != "" {
			alive[alias] = struct{}{}
		}
	}
	var stale []string
	for _, k := range keys {
		if _, live := alive[k.KeyAlias]; !live {
			stale = append(stale, k.Token)
		}
	}
	if len(stale) == 0 {
		return 0, nil
	}
	if err := b.cli.DeleteKeys(ctx, stale); err != nil {
		return 0, err
	}
	return len(stale), nil
}
