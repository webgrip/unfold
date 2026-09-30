package main

import (
	"reflect"
	"testing"

	"github.com/webgrip/ploeg/pkg/config"
)

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
