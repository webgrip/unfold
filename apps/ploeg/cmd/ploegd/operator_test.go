package main

import (
	"reflect"
	"testing"

	"github.com/webgrip/ploeg/pkg/config"
	"github.com/webgrip/ploeg/pkg/store"
)

func TestOperatorConfigCarriesEachTargetsCardStyle(t *testing.T) {
	t.Setenv("PLOEG_OPERATOR_CONSUMERS", "")
	t.Setenv("PLOEG_OPERATOR_DELIVERY_POLICIES", "")
	t.Setenv("PLOEG_DEFAULT_TEAM", "")
	t.Setenv("PLOEG_TEAM_MAP", "")
	cfg := &config.File{Targets: map[string]config.Target{
		"glide": {Repo: "webgrip/Glide", CardStyle: &config.CardStyle{Theme: "acme"}},
		"plain": {Repo: "webgrip/plain"},
	}}
	operator, err := operatorConfig(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	glide, ok := operator.CardStyles["webgrip/glide"]
	if !ok || glide.Skin != store.DefaultCardSkin || glide.Theme == nil || *glide.Theme != "acme" {
		t.Fatalf("card styles = %+v", operator.CardStyles)
	}
	if _, ok := operator.CardStyles["webgrip/plain"]; ok {
		t.Error("a target without cardStyle must use the default, not a stored copy")
	}
	if config.DefaultCardSkin != store.DefaultCardSkin {
		t.Errorf("config default skin %q != store default skin %q", config.DefaultCardSkin, store.DefaultCardSkin)
	}
}

func TestOperatorConfigListsEachTeamsTrackerAssignees(t *testing.T) {
	t.Setenv("PLOEG_OPERATOR_CONSUMERS", "")
	t.Setenv("PLOEG_OPERATOR_DELIVERY_POLICIES", "")
	t.Setenv("PLOEG_DEFAULT_TEAM", "")
	t.Setenv("PLOEG_TEAM_MAP", "bronze=bronze,copper=copper,zinc=bronze")
	cfg := &config.File{Teams: map[string]config.Team{"silver": {Assignees: []string{"Silver", "agent-silver"}}, "vloer": {}}}
	cfg.Trackers.Vikunja.Projects = []config.Project{{ID: "11", Team: "vloer"}, {ID: "10"}, {Name: "Named", Team: "silver"}}
	operator, err := operatorConfig(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string][]string{"silver": {"agent-silver", "silver"}, "bronze": {"bronze", "zinc"}, "copper": {"copper"}}
	if !reflect.DeepEqual(operator.TeamAssignees, want) {
		t.Fatalf("team assignees = %v, want %v", operator.TeamAssignees, want)
	}
	if want := map[string][]string{"vloer": {"11"}}; !reflect.DeepEqual(operator.TeamScopes, want) {
		t.Fatalf("team scopes = %v, want %v; only id-pinned projects pin a team", operator.TeamScopes, want)
	}
	for _, team := range []string{"silver", "bronze", "copper", "vloer"} {
		if _, registered := operator.Teams[team]; !registered {
			t.Errorf("team %s is not registered", team)
		}
	}
}
