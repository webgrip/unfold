// Package plan parses and validates Team plans: the ordered list of Rounds a
// Shift works through, each naming Roles with their writes flag and per-Run
// spending cap (run-multi-agent-shifts design.md D5).
//
// A plan is CONFIG, not state — read at boot from PLOEG_TEAM_PLANS (JSON,
// rendered by the chart from executor.teams[].plan via toJson) and never
// resolved mid-Round. Parsing fails fast, like PLOEG_TARGET_MAP: a malformed
// plan that could open a malformed Round must never boot.
//
// The chart serialises the whole plan, including per-role workload knobs
// (model, image, harness) that only the pod templates consume; this package
// deliberately ignores those keys and reads only what the orchestrator needs.
package plan

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Role is one slot in a Round, as the orchestrator sees it.
type Role struct {
	Name string `json:"name"`
	// Writes distinguishes the single writer of a Round from its readers
	// (ADR-0010).
	Writes bool `json:"writes"`
	// Cap bounds one Run's spend; the claim authorizes min(cap, pool
	// remaining) (ADR-0012). Zero = no per-Run cap beyond the pool.
	Cap money `json:"cap"`
}

// Round is a set of Runs that start together: a fan-out of readers or a
// single writer, never both. store.OpenRound enforces the same rule at the
// database; validating here as well means a bad plan fails at boot instead of
// leasing a ticket it cannot work.
type Round struct {
	Roles []Role `json:"roles"`
}

// TeamPlan is one Team's plan: the Shift pool and the ordered Rounds.
type TeamPlan struct {
	// Pool is the Shift budget (ADR-0012). Zero = unmetered, preserving the
	// env-budget behaviour of a plan-less team.
	Pool   money   `json:"pool"`
	Rounds []Round `json:"rounds"`
}

// Plans maps team name to plan. A team absent here is plan-less and follows
// the legacy single-writer dispatch path unchanged.
type Plans map[string]TeamPlan

// money accepts both JSON numbers and the chart's string-typed money values
// ("6", "0.50" — values.yaml types budgets as strings so YAML cannot mangle
// them).
type money float64

func (m *money) UnmarshalJSON(b []byte) error {
	s := strings.Trim(string(b), `"`)
	if s == "" || s == "null" {
		*m = 0
		return nil
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return fmt.Errorf("money value %q: %w", s, err)
	}
	*m = money(f)
	return nil
}

// roleName mirrors the chart's team-name pattern: these become workload name
// suffixes (ploeg-worker-<team>-<role>), so they must be DNS-label-safe.
var roleName = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`)

// Parse reads PLOEG_TEAM_PLANS. Empty input is an empty set of plans — the
// factory runs plan-less, exactly as before.
func Parse(env string) (Plans, error) {
	env = strings.TrimSpace(env)
	if env == "" {
		return Plans{}, nil
	}
	var p Plans
	if err := json.Unmarshal([]byte(env), &p); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}
	for team, tp := range p {
		if err := validate(tp); err != nil {
			return nil, fmt.Errorf("team %q: %w", team, err)
		}
	}
	return p, nil
}

func validate(tp TeamPlan) error {
	if tp.Pool < 0 {
		return fmt.Errorf("pool must not be negative, got %v", float64(tp.Pool))
	}
	if len(tp.Rounds) == 0 {
		return fmt.Errorf("a plan needs at least one round")
	}
	// A role name is one workload; its writes flag must not flip between
	// rounds, or the same pod shape would need to be both reader and writer.
	writesByRole := map[string]bool{}
	for i, round := range tp.Rounds {
		if len(round.Roles) == 0 {
			return fmt.Errorf("round %d has no roles", i+1)
		}
		writers := 0
		seen := map[string]bool{}
		for _, r := range round.Roles {
			if !roleName.MatchString(r.Name) {
				return fmt.Errorf("round %d: role name %q must be a lowercase DNS label", i+1, r.Name)
			}
			if len(r.Name) > 30 {
				return fmt.Errorf("round %d: role name %q exceeds 30 characters (it becomes a workload name suffix)", i+1, r.Name)
			}
			if seen[r.Name] {
				return fmt.Errorf("round %d: role %q appears twice", i+1, r.Name)
			}
			seen[r.Name] = true
			if r.Cap < 0 {
				return fmt.Errorf("round %d: role %q cap must not be negative", i+1, r.Name)
			}
			if prev, ok := writesByRole[r.Name]; ok && prev != r.Writes {
				return fmt.Errorf("role %q is a writer in one round and a reader in another — one role, one workload, one writes flag", r.Name)
			}
			writesByRole[r.Name] = r.Writes
			if r.Writes {
				writers++
			}
		}
		if writers > 1 {
			return fmt.Errorf("round %d has %d writers; a round admits at most one (ADR-0010)", i+1, writers)
		}
		if writers > 0 && writers != len(round.Roles) {
			return fmt.Errorf("round %d mixes a writer with readers; a round is either readers or one writer (ADR-0010)", i+1)
		}
		// Checked after the structural rules, so a malformed round reports
		// what is actually wrong with it first.
		//
		// A fan-out without caps does not fan out. The claim authorizes
		// min(cap, poolRemaining) and holds it for the whole Run (ADR-0012),
		// so an uncapped first reader reserves the ENTIRE pool and every
		// sibling is refused ErrBudgetExhausted — the fan-out silently
		// becomes a queue of one. Caps are what make readers concurrent, so
		// they are required wherever a metered Round has more than one Role.
		if tp.Pool > 0 && len(round.Roles) > 1 {
			for _, r := range round.Roles {
				if r.Cap == 0 {
					return fmt.Errorf("round %d: role %q needs a cap — in a %d-role round an uncapped Run reserves the whole pool and starves its siblings (ADR-0012)",
						i+1, r.Name, len(round.Roles))
				}
			}
		}
	}
	return nil
}

// Cap returns a role's cap as a plain float for callers converting to other
// shapes.
func (r Role) CapUSD() float64 { return float64(r.Cap) }

// RoleCap returns a role's cap for the claim path: the per-Run ceiling the
// authorization is bounded by. Zero (and an unknown role) mean "pool only".
func (p Plans) RoleCap(team, role string) float64 {
	tp, ok := p[team]
	if !ok {
		return 0
	}
	for _, round := range tp.Rounds {
		for _, r := range round.Roles {
			if r.Name == role {
				return float64(r.Cap)
			}
		}
	}
	return 0
}
