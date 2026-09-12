package main

import (
	"os"
	"sort"

	"github.com/webgrip/ploeg/pkg/config"
	"github.com/webgrip/ploeg/pkg/httpapi"
	"github.com/webgrip/ploeg/pkg/plan"
)

func operatorConfig(cfg *config.File, plans plan.Plans) (httpapi.OperatorConfig, error) {
	consumers, err := httpapi.ParseOperatorConsumers(os.Getenv("PLOEG_OPERATOR_CONSUMERS"), os.LookupEnv)
	if err != nil {
		return httpapi.OperatorConfig{}, err
	}
	deliveryPolicies, err := httpapi.ParseDeliveryPolicies(os.Getenv("PLOEG_OPERATOR_DELIVERY_POLICIES"))
	if err != nil {
		return httpapi.OperatorConfig{}, err
	}
	teams := map[string][]string{}
	for name := range cfg.Teams {
		teams[name] = []string{}
	}
	for _, name := range mergeTeamMap(cfg.AssigneeTeams(), parseTeamMap(os.Getenv("PLOEG_TEAM_MAP"))) {
		if _, exists := teams[name]; !exists {
			teams[name] = []string{}
		}
	}
	for _, name := range cfg.ScopeTeams() {
		if _, exists := teams[name]; !exists {
			teams[name] = []string{}
		}
	}
	for name, p := range plans {
		roles := map[string]bool{}
		for _, round := range p.Rounds {
			for _, role := range round.Roles {
				roles[role.Name] = true
			}
		}
		teams[name] = []string{}
		for role := range roles {
			teams[name] = append(teams[name], role)
		}
		sort.Strings(teams[name])
	}
	if name := os.Getenv("PLOEG_DEFAULT_TEAM"); name != "" {
		if _, exists := teams[name]; !exists {
			teams[name] = []string{}
		}
	}
	return httpapi.OperatorConfig{Consumers: consumers, Teams: teams, DeliveryPolicies: deliveryPolicies}, nil
}
