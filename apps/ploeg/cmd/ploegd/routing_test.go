package main

import (
	"context"
	"log/slog"
	"testing"

	"github.com/webgrip/ploeg/pkg/config"
	"github.com/webgrip/ploeg/pkg/provider"
	"github.com/webgrip/ploeg/pkg/target"
)

func TestRoutingWithoutTargetsHasNoGateAndIgnoresLabels(t *testing.T) {
	t.Setenv("PLOEG_TARGET_MAP", "10=webgrip/glide@development")
	resolver, gate, err := routing(context.Background(), slog.New(slog.DiscardHandler), &config.File{}, nil, nil, "forgejo")
	if err != nil {
		t.Fatal(err)
	}
	if gate != nil {
		t.Error("a deployment without targets must not gate anything")
	}
	route, ok, err := resolver.Route(target.Request{Scope: "10", Labels: []string{"repo/homelab-cluster"}})
	if err != nil || !ok || route.Target.Repo != "glide" || route.Hint != "" {
		t.Errorf("route = %+v ok %v err %v, want the env rule unchanged", route, ok, err)
	}
}

func TestRoutingGatesTheRegisteredTargets(t *testing.T) {
	cfg := &config.File{
		Targets:  map[string]config.Target{"glide": {Repo: "webgrip/glide", Branch: "development"}},
		Trackers: config.Trackers{Vikunja: config.TrackerConfig{Projects: []config.Project{{ID: "10", Default: "glide"}}}},
	}
	resolver, gate, err := routing(context.Background(), slog.New(slog.DiscardHandler), cfg, nil, map[string]provider.ForgeProvider{}, "forgejo")
	if err != nil {
		t.Fatal(err)
	}
	if gate == nil || resolver.Registered()["glide"].Forge != "forgejo" {
		t.Fatalf("gate %v registered %+v", gate, resolver.Registered())
	}
	if v := gate.Admit(context.Background(), "glide"); v.Ready {
		t.Error("a target on a forge that cannot report readiness must not be ready")
	}
}
