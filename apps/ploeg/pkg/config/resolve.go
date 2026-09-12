package config

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"
)

// ScopeResolver reports the provider-side ids of the containers it hosts,
// keyed by the name a human sees. Implemented by pkg/provider/vikunja.
type ScopeResolver interface {
	ProjectsByName(ctx context.Context) (map[string]string, error)
}

// TargetSpec is the wire format pkg/target already parses. Rendering to it
// keeps ONE resolver in the codebase: this package decides what the routing
// table means, pkg/target decides how a scope maps to a repository, and
// neither grows a second copy of the other's rules.
//
// Produced, never hand-written — which is the point. The operator writes
// names; this writes the string with the ids in it.
func (f *File) TargetSpec(ctx context.Context, r ScopeResolver, log *slog.Logger) (string, error) {
	// Clickup entries carry pinned List ids (Validate enforces it), so only
	// the vikunja half can need the resolver.
	projects := append(append([]Project{}, f.Trackers.Vikunja.Projects...), f.Trackers.Clickup.Projects...)
	if len(projects) == 0 {
		return "", nil
	}

	// Only ask the tracker if at least one project needs resolving.
	var byName map[string]string
	needsLookup := false
	for _, p := range projects {
		if p.ID == "" {
			needsLookup = true
		}
	}
	if needsLookup {
		if r == nil {
			return "", fmt.Errorf("routing config names projects but no tracker client is configured to resolve them; set the tracker URL and token, or pin ids")
		}
		var err error
		byName, err = r.ProjectsByName(ctx)
		if err != nil {
			return "", fmt.Errorf("resolving project names: %w", err)
		}
	}

	var entries []string
	for _, p := range projects {
		id := p.ID
		if id == "" {
			var ok bool
			id, ok = byName[p.Name]
			if !ok {
				// Fail the boot, and say what WAS available: a typo here
				// otherwise routes work somewhere plausible and wrong.
				return "", fmt.Errorf("no tracker project named %q; available: %s",
					p.Name, strings.Join(sortedKeys(byName), ", "))
			}
			log.Info("resolved tracker project", "name", p.Name, "id", id, "repo", p.Repo)
		}
		key := id
		if p.Team != "" {
			key = id + "/" + p.Team
		}
		entry := key + "=" + p.Repo
		if p.Branch != "" {
			entry += "@" + p.Branch
		}
		if p.Forge != "" {
			entry += ";forge=" + p.Forge
		}
		entries = append(entries, entry)
	}
	return strings.Join(entries, ","), nil
}

func sortedKeys(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// ScopeTeams renders the container-to-team pins: every project that names a
// `team:` and a pinned id. Name-resolved vikunja projects are deliberately
// absent — their ids are only known after TargetSpec has run, and the one
// deployment shape that needs pinning (a board where the assignee must not
// decide) is also the shape that pins ids. When a name resolver hands ids
// back here, this grows with it.
func (f *File) ScopeTeams() map[string]string {
	out := map[string]string{}
	for _, p := range append(append([]Project{}, f.Trackers.Vikunja.Projects...), f.Trackers.Clickup.Projects...) {
		if p.ID != "" && p.Team != "" {
			out[p.ID] = p.Team
		}
	}
	return out
}
