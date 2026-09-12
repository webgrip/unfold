// Package target resolves where a Work Item's changes land. The mapping is
// core policy, not provider knowledge: a TrackerProvider reports the opaque
// scope its vendor natively owns (Vikunja's project id), and this package
// decides the repository. Keeping the decision here is what R7 requires —
// a provider that resolved Ploeg Targets would make every future provider
// carry the same mapping semantics forever.
//
// Source of truth for the entries is the git `org.yaml` roster manifest in
// homelab-cluster (docs/research/2026-07-28-agent-roster-ssot.md); ploegd
// consumes a rendered form of it.
package target

import (
	"fmt"
	"sort"
	"strings"

	"github.com/webgrip/ploeg/pkg/work"
)

// Resolver maps a normalized tracker scope (and, transitionally, the resolved
// team) to the repository the work lands in.
type Resolver interface {
	// Resolve returns the Target and the id of the rule that produced it.
	// ok=false means no rule matched: the caller records the scope anyway and
	// leaves the Target unresolved.
	Resolve(scope, team string) (t work.Target, rule string, ok bool)
}

// MapResolver resolves from a static rule set (PLOEG_TARGET_MAP, rendered from
// org.yaml). Rules are exact-match and ordered by specificity — deliberately
// not a DSL: an expression language is a config surface we would own and
// version forever.
//
// Key precedence, most specific first:
//
//	"<scope>/<team>"  transitional: one tracker project serving several repos,
//	                  disambiguated by the assignee's team. This reproduces
//	                  today's routing exactly — the factory's webhook and team
//	                  shares are all wired on one project (Vikunja project 11,
//	                  docs/ops/board.md "Dispatch topology — the trap"), so a
//	                  scope-only map would collapse every team onto one repo.
//	"<scope>"         the target state: one tracker project per repository.
type MapResolver struct {
	rules []rule
	// DefaultForge fills an entry's empty forge id, so the common
	// single-forge deployment writes owner/repo and nothing else.
	DefaultForge string
}

type rule struct {
	id     string // the map key, echoed into work_items.route_rule for audit
	scope  string
	team   string // empty = matches any team
	target work.Target
}

// NewMapResolver parses the wire format:
//
//	<scope>[/<team>]=<owner>/<repo>[@<baseBranch>][;forge=<id>], comma separated
//
// e.g. "11/bronze=webgrip/erfbeeld@main,11/silver=webgrip/ploeg@development,14=webgrip/homelab-cluster@main"
//
// It mirrors PLOEG_TEAM_MAP's shape so operator muscle memory transfers. A
// malformed entry is an error rather than a silent drop: a typo that routes
// work to the wrong repository must never boot.
func NewMapResolver(spec, defaultForge string) (*MapResolver, error) {
	m := &MapResolver{DefaultForge: defaultForge}
	for _, entry := range strings.Split(spec, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		key, val, ok := strings.Cut(entry, "=")
		if !ok {
			return nil, fmt.Errorf("target map entry %q: want <scope>[/<team>]=<owner>/<repo>[@<branch>]", entry)
		}
		key, val = strings.TrimSpace(key), strings.TrimSpace(val)

		r := rule{id: key}
		r.scope, r.team, _ = strings.Cut(key, "/")
		if r.scope == "" {
			return nil, fmt.Errorf("target map entry %q: empty scope", entry)
		}

		// Optional ";forge=<id>" suffix, then optional "@<baseBranch>".
		if rest, forge, found := strings.Cut(val, ";forge="); found {
			r.target.Forge = strings.TrimSpace(forge)
			val = strings.TrimSpace(rest)
		}
		if rest, branch, found := strings.Cut(val, "@"); found {
			r.target.BaseBranch = strings.TrimSpace(branch)
			val = strings.TrimSpace(rest)
		}
		owner, repo, found := strings.Cut(val, "/")
		if !found || owner == "" || repo == "" {
			return nil, fmt.Errorf("target map entry %q: want <owner>/<repo> target, got %q", entry, val)
		}
		r.target.Owner, r.target.Repo = owner, repo
		if r.target.Forge == "" {
			r.target.Forge = defaultForge
		}
		m.rules = append(m.rules, r)
	}
	// Most specific first: scope+team beats scope alone. Stable within a tier
	// so the map's own order is preserved and the matched rule is predictable.
	sort.SliceStable(m.rules, func(i, j int) bool {
		return m.rules[i].team != "" && m.rules[j].team == ""
	})
	return m, nil
}

func (m *MapResolver) Resolve(scope, team string) (work.Target, string, bool) {
	if m == nil || scope == "" {
		return work.Target{}, "", false
	}
	for _, r := range m.rules {
		if r.scope != scope {
			continue
		}
		if r.team != "" && r.team != team {
			continue
		}
		return r.target, r.id, true
	}
	return work.Target{}, "", false
}

// Len reports how many rules were parsed, for the boot log.
func (m *MapResolver) Len() int {
	if m == nil {
		return 0
	}
	return len(m.rules)
}
