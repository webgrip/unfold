package main

import "testing"

// The forge id feeds the registry key, the resolver's default and the
// Engine's DefaultForge. When those were three reads, one of them defaulted
// to "" and every review ever written was silently discarded — the registry
// was keyed "forgejo", every Work Target carried "", and publishRound looked
// up the empty string as a literal key.
//
// cmd/ had no tests at all, which is why nothing noticed: the value's
// producer and its consumer were never in the same test process.
func TestForgeIDFromEnv_NeverEmpty(t *testing.T) {
	t.Setenv("PLOEG_TARGET_FORGE", "")
	if got := forgeIDFromEnv(); got == "" {
		t.Fatal("forge id defaulted to the empty string; publishRound cannot look that up")
	} else if got != "forgejo" {
		t.Errorf("forge id = %q, want forgejo", got)
	}
}

func TestForgeIDFromEnv_HonoursAnExplicitID(t *testing.T) {
	t.Setenv("PLOEG_TARGET_FORGE", "webgrip-forgejo")
	if got := forgeIDFromEnv(); got != "webgrip-forgejo" {
		t.Errorf("forge id = %q, want webgrip-forgejo", got)
	}
}
