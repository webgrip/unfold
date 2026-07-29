// Package config loads ploegd's routing and roster configuration from a FILE
// rather than from environment variables.
//
// The env-var forms it replaces — PLOEG_TARGET_MAP's
// "11/bronze=webgrip/ploeg@development,…", PLOEG_TEAM_MAP's "jake=bronze,…"
// and PLOEG_TEAM_PLANS' inlined JSON — were three hand-rolled DSLs with no
// schema, no comments and no diff worth reading. They also forced the
// operator to write a Vikunja project ID into cluster config, where a bare
// `11` says nothing about which board it is and silently routes work to the
// wrong repository the day somebody rebuilds the project.
//
// So a project is named here, not numbered:
//
//	trackers:
//	  vikunja:
//	    projects:
//	      - name: "Ploeg Test"          # resolved to an id at boot
//	        repo: webgrip/ploeg
//	        branch: development
//
// ploegd asks the tracker which id that name has when it starts, logs the
// mapping it resolved, and refuses to start if a name matches nothing. A
// typo becomes a boot failure with the available names in the message,
// instead of work quietly routed somewhere plausible.
package config

import (
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/webgrip/ploeg/pkg/plan"
)

// File is the whole of ploegd's file-backed configuration.
type File struct {
	Trackers Trackers `yaml:"trackers"`
	// Teams is the roster: what each team is made of and what it may spend.
	Teams map[string]Team `yaml:"teams"`
}

type Trackers struct {
	Vikunja TrackerConfig `yaml:"vikunja"`
}

type TrackerConfig struct {
	Projects []Project `yaml:"projects"`
}

// Project routes one tracker container to one repository.
type Project struct {
	// Name is the project's name on the board, exactly as a human sees it.
	// Resolved to the provider's id at boot.
	Name string `yaml:"name"`
	// ID pins the provider's id directly, skipping resolution. An escape
	// hatch for a board whose names are not unique or not readable by the
	// configured token — not the normal path.
	ID string `yaml:"id"`
	// Repo is "owner/name".
	Repo string `yaml:"repo"`
	// Branch is the base branch; empty means the repository's default, which
	// may be a stale stub (VIK-589), so pinning it is advised.
	Branch string `yaml:"branch"`
	// Forge names which forge instance holds the repo. Empty = the
	// deployment's single forge.
	Forge string `yaml:"forge"`
	// Team routes this project's work to one team. Empty means the assignee
	// decides, via the team's `assignees` list below.
	Team string `yaml:"team"`
}

// Team is a roster entry: who works, at what cost, in what order.
type Team struct {
	// Assignees are the tracker usernames that dispatch to this team, so a
	// human assigns a colleague rather than an infrastructure tier.
	Assignees []string `yaml:"assignees"`
	// Plan is the ordered Rounds of a Shift; empty = a single writer.
	Plan *plan.TeamPlan `yaml:"plan"`
}

// Load reads and validates the file. A missing path is not an error — it
// means "no file-backed config", and the caller keeps whatever defaults it
// has. A malformed one IS an error: config that does not parse must never
// boot into a half-applied state.
func Load(path string) (*File, error) {
	if path == "" {
		return &File{}, nil
	}
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return &File{}, nil
	}
	if err != nil {
		return nil, err
	}
	var f File
	dec := yaml.NewDecoder(strings.NewReader(string(b)))
	dec.KnownFields(true) // a typo'd key is a boot failure, never a silent default
	if err := dec.Decode(&f); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if err := f.Validate(); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return &f, nil
}

// Validate catches what can be caught without talking to a tracker.
func (f *File) Validate() error {
	seen := map[string]string{}
	for i, p := range f.Trackers.Vikunja.Projects {
		where := fmt.Sprintf("trackers.vikunja.projects[%d]", i)
		if p.Name == "" && p.ID == "" {
			return fmt.Errorf("%s: needs a name (preferred) or an id", where)
		}
		if p.Repo == "" {
			return fmt.Errorf("%s (%s): needs a repo", where, p.label())
		}
		owner, name, ok := strings.Cut(p.Repo, "/")
		if !ok || owner == "" || name == "" {
			return fmt.Errorf("%s (%s): repo %q must be owner/name", where, p.label(), p.Repo)
		}
		if prev, dup := seen[p.label()]; dup {
			return fmt.Errorf("%s: project %q is routed twice (already to %s)", where, p.label(), prev)
		}
		seen[p.label()] = p.Repo
		if p.Team != "" {
			if _, ok := f.Teams[p.Team]; !ok {
				return fmt.Errorf("%s (%s): routes to team %q, which is not in teams", where, p.label(), p.Team)
			}
		}
	}
	for name, t := range f.Teams {
		if t.Plan == nil {
			continue
		}
		if err := plan.Validate(*t.Plan); err != nil {
			return fmt.Errorf("teams.%s.plan: %w", name, err)
		}
	}
	return nil
}

func (p Project) label() string {
	if p.Name != "" {
		return p.Name
	}
	return "id " + p.ID
}

// Plans projects the roster into the shape the shift engine consumes.
func (f *File) Plans() plan.Plans {
	out := plan.Plans{}
	for name, t := range f.Teams {
		if t.Plan != nil {
			out[name] = *t.Plan
		}
	}
	return out
}

// AssigneeTeams projects the roster into assignee → team, lowercased.
func (f *File) AssigneeTeams() map[string]string {
	out := map[string]string{}
	for team, t := range f.Teams {
		for _, a := range t.Assignees {
			out[strings.ToLower(a)] = team
		}
	}
	return out
}
