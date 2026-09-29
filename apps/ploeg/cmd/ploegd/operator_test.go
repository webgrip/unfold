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
	operator, err := operatorConfig(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string][]string{"silver": {"agent-silver", "silver"}, "bronze": {"bronze", "zinc"}, "copper": {"copper"}}
	if !reflect.DeepEqual(operator.TeamAssignees, want) {
		t.Fatalf("team assignees = %v, want %v", operator.TeamAssignees, want)
	}
	for _, team := range []string{"silver", "bronze", "copper", "vloer"} {
		if _, registered := operator.Teams[team]; !registered {
			t.Errorf("team %s is not registered", team)
		}
	}
}
