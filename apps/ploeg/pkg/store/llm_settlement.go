package store

import (
	"context"
	"errors"
	"time"
)

// UnsettledLLMAccount is a finished Run's inference account that still holds
// Shift budget and may now be settled by the controller.
type UnsettledLLMAccount struct {
	RunID      int64
	RunToken   string
	Alias      string
	State      string
	MintBegan  bool
	QuietSince time.Time
}

// UnsettledLLMAccounts pages finished Runs whose account is reserved, or
// blocked and unchanged for at least quietFor. MintBegan is true when any
// durable record shows that an external mint may have started.
func (s *Store) UnsettledLLMAccounts(ctx context.Context, after int64, quietFor time.Duration, limit int) ([]UnsettledLLMAccount, error) {
	if after < 0 || quietFor < 0 || limit < 1 || limit > 100 {
		return nil, errors.New("invalid managed settlement page")
	}
	rows, err := s.pool.Query(ctx, `SELECT r.id,a.run_token,a.alias,a.state,a.updated_at,
		a.gateway_key_id<>'' OR COALESCE(a.observed_spend,0)>0 OR EXISTS(SELECT 1 FROM audit_log l
			WHERE l.work_item_id=r.work_item_id AND l.action IN ('llm.minting','llm.issued','llm.unknown') AND l.detail->>'alias'=a.alias)
		FROM run_llm_accounts a JOIN agent_runs r USING(run_token)
		WHERE r.state='finished' AND r.id>$1
		AND (a.state='reserved' OR (a.state='blocked' AND a.updated_at<=now()-make_interval(secs=>$2)))
		ORDER BY r.id LIMIT $3`, after, quietFor.Seconds(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []UnsettledLLMAccount{}
	for rows.Next() {
		var v UnsettledLLMAccount
		if err := rows.Scan(&v.RunID, &v.RunToken, &v.Alias, &v.State, &v.QuietSince, &v.MintBegan); err != nil {
			return nil, err
		}
		values = append(values, v)
	}
	return values, rows.Err()
}
