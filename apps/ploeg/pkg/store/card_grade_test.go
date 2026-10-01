package store

import (
	"reflect"
	"testing"
	"time"
)

func f64(v float64) *float64 { return &v }

func TestHalfStepRoundsToTheNearestHalfWithTiesUp(t *testing.T) {
	for _, tc := range []struct{ in, want float64 }{
		{8.24, 8}, {8.25, 8.5}, {8.74, 8.5}, {8.75, 9}, {9.0, 9}, {0.2, 1}, {12, 10}, {-3, 1},
		{0.40*10 + 0.25*6 + 0.20*10 + 0.15*10, 9},
		{0.40*10 + 0.25*8.5 + 0.20*7.5 + 0.15*9, 9},
	} {
		if got := halfStep(tc.in); got != tc.want {
			t.Errorf("halfStep(%v) = %v; want %v", tc.in, got, tc.want)
		}
	}
}

func TestComputeGradeFormula(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	ago := func(days int) *time.Time { at := now.Add(-time.Duration(days)*24*time.Hour - time.Hour); return &at }
	zero, one, two := 0, 1, 2
	for _, tc := range []struct {
		name        string
		facts       gradeFacts
		sub         CardSubgrades
		overall     float64
		provisional bool
		label       string
		qualifiers  []string
	}{
		{"not live yet: durability starts at 6", gradeFacts{now: now, plays: 1, reviewRounds: 1},
			CardSubgrades{10, 6, 10, 10}, 9, true, "", []string{}},
		{"45 days live: durability 8", gradeFacts{now: now, liveSince: ago(45), plays: 1, reviewRounds: 1},
			CardSubgrades{10, 8, 10, 10}, 9, true, "", []string{}},
		{"179 days live is still provisional: capped at 9 and no label", gradeFacts{now: now, liveSince: ago(179), plays: 1, reviewRounds: 1},
			CardSubgrades{10, 10, 10, 10}, 9, true, "", []string{}},
		{"180 days live, all tens: black", gradeFacts{now: now, liveSince: ago(180), plays: 1, reviewRounds: 1, defectBounces: &zero},
			CardSubgrades{10, 10, 10, 10}, 10, false, "black", []string{}},
		{"180 days live, overall 10 without four tens: gold", gradeFacts{now: now, liveSince: ago(180), plays: 1, reviewRounds: 2},
			CardSubgrades{10, 10, 10, 9.5}, 10, false, "gold", []string{}},
		{"over budget by a quarter or less costs 1 and marks OB",
			gradeFacts{now: now, liveSince: ago(400), plays: 1, reviewRounds: 1, costUSD: f64(2.5), authorizedUSD: 2},
			CardSubgrades{10, 10, 9, 10}, 10, false, "gold", []string{"OB"}},
		{"over budget by more than a quarter costs 2",
			gradeFacts{now: now, liveSince: ago(400), plays: 1, reviewRounds: 1, costUSD: f64(2.51), authorizedUSD: 2},
			CardSubgrades{10, 10, 8, 10}, 9.5, false, "", []string{"OB"}},
		{"within budget costs nothing", gradeFacts{now: now, plays: 1, reviewRounds: 1, costUSD: f64(2), authorizedUSD: 2},
			CardSubgrades{10, 6, 10, 10}, 9, true, "", []string{}},
		{"failed runs, extra plays and defect bounces lower delivery; RT",
			gradeFacts{now: now, liveSince: ago(45), plays: 2, failedRuns: 1, defectBounces: &two, reviewRounds: 1},
			CardSubgrades{10, 8, 5.5, 10}, 8.5, true, "", []string{"RT"}},
		{"change requests and extra rounds lower review",
			gradeFacts{now: now, liveSince: ago(45), plays: 1, changeRequests: 2, reviewRounds: 3, defectBounces: &one},
			CardSubgrades{10, 8, 8.5, 7}, 9, true, "", []string{}},
		{"subgrades never fall below 1",
			gradeFacts{now: now, plays: 12, failedRuns: 9, changeRequests: 15, reviewRounds: 4},
			CardSubgrades{10, 6, 1, 1}, 6, true, "", []string{"RT"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g := computeGrade(tc.facts)
			if g.Formula != "2026.2" || g.Subgrades != tc.sub || g.Overall != tc.overall || g.Provisional != tc.provisional {
				t.Fatalf("grade = %s %v %+v provisional %v; want %v %+v provisional %v", g.Formula, g.Overall, g.Subgrades, g.Provisional,
					tc.overall, tc.sub, tc.provisional)
			}
			label := ""
			if g.Label != nil {
				label = *g.Label
			}
			if label != tc.label || !reflect.DeepEqual(g.Qualifiers, tc.qualifiers) {
				t.Fatalf("label %q qualifiers %v; want %q %v", label, g.Qualifiers, tc.label, tc.qualifiers)
			}
		})
	}
}

func TestComputeGradeInputsKeepUnknownsUnknown(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	g := computeGrade(gradeFacts{now: now, plays: 1, authorizedUSD: 2, reviewRounds: 1})
	in := g.Inputs
	if in.Delivery.BudgetShare != nil || in.Delivery.DefectBounces != nil || in.Durability.LiveSince != nil || in.Durability.DaysLive != 0 {
		t.Fatalf("inputs = %+v; an unknown cost or unmapped board must stay null", in)
	}
	if in.Durability.Survival != nil || in.Review.CIFirstGreen != nil || in.Review.Findings != nil {
		t.Fatalf("inputs = %+v; inputs without a source are null", in)
	}
	if in.Reliability.CrackWeight == nil || *in.Reliability.CrackWeight != 0 || in.Reliability.Reverted == nil || *in.Reliability.Reverted ||
		in.Durability.Reverts == nil || *in.Durability.Reverts != 0 || in.Durability.Hotfixes == nil || *in.Durability.Hotfixes != 0 {
		t.Fatalf("inputs = %+v; cracks, reverts and hotfixes are collected and zero when none happened", in)
	}
	want := []string{"durability.survival", "review.ciFirstGreen", "review.findings"}
	if !reflect.DeepEqual(in.NotCollected, want) {
		t.Fatalf("notCollected = %v", in.NotCollected)
	}
	share := computeGrade(gradeFacts{now: now, plays: 1, costUSD: f64(0.5), authorizedUSD: 2}).Inputs.Delivery.BudgetShare
	if share == nil || *share != 0.25 {
		t.Fatalf("budgetShare = %v", share)
	}
}

func TestComputeGradeCracksRevertsAndHotfixes(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	ago := func(days int) *time.Time { at := now.Add(-time.Duration(days)*24*time.Hour - time.Hour); return &at }
	zero := 0
	for _, tc := range []struct {
		name       string
		facts      gradeFacts
		sub        CardSubgrades
		overall    float64
		label      string
		qualifiers []string
	}{
		{"a discovered unmended S2 takes 2 off reliability",
			gradeFacts{now: now, liveSince: ago(400), plays: 1, reviewRounds: 1, crackWeight: 2, cracked: true},
			CardSubgrades{8, 10, 10, 10}, 9, "", []string{}},
		{"a mended crack still ends below a never-cracked card",
			gradeFacts{now: now, liveSince: ago(400), plays: 1, reviewRounds: 1, crackWeight: 0.0625, cracked: true},
			CardSubgrades{9.5, 10, 10, 10}, 10, "gold", []string{}},
		{"a history-only crack weighs nothing and caps nothing",
			gradeFacts{now: now, liveSince: ago(400), plays: 1, reviewRounds: 1, defectBounces: &zero},
			CardSubgrades{10, 10, 10, 10}, 10, "black", []string{}},
		{"a revert counts as at least an S2 and lowers durability by 2; RV",
			gradeFacts{now: now, liveSince: ago(400), plays: 1, reviewRounds: 1, reverts: 1},
			CardSubgrades{8, 8, 10, 10}, 8.5, "", []string{"RV"}},
		{"a revert does not add to a heavier crack",
			gradeFacts{now: now, liveSince: ago(400), plays: 1, reviewRounds: 1, reverts: 1, crackWeight: 4, cracked: true},
			CardSubgrades{6, 8, 10, 10}, 8, "", []string{"RV"}},
		{"a hotfix lowers durability by 1; HF before OB and RT",
			gradeFacts{now: now, liveSince: ago(400), plays: 1, reviewRounds: 1, hotfixes: 1, crackWeight: 1, cracked: true,
				costUSD: f64(3), authorizedUSD: 2, failedRuns: 1},
			CardSubgrades{9, 9, 7.5, 10}, 9, "", []string{"HF", "OB", "RT"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g := computeGrade(tc.facts)
			label := ""
			if g.Label != nil {
				label = *g.Label
			}
			if g.Subgrades != tc.sub || g.Overall != tc.overall || label != tc.label || !reflect.DeepEqual(g.Qualifiers, tc.qualifiers) {
				t.Fatalf("grade = %v %+v %q %v; want %v %+v %q %v", g.Overall, g.Subgrades, label, g.Qualifiers,
					tc.overall, tc.sub, tc.label, tc.qualifiers)
			}
			if *g.Inputs.Reliability.CrackWeight != tc.facts.crackWeight || *g.Inputs.Durability.Reverts != tc.facts.reverts ||
				*g.Inputs.Reliability.Reverted != (tc.facts.reverts > 0) || *g.Inputs.Durability.Hotfixes != tc.facts.hotfixes {
				t.Fatalf("inputs = %+v %+v", g.Inputs.Reliability, g.Inputs.Durability)
			}
		})
	}
}

func TestCrackWeightAppliesSeverityShareDiscoveryWarrantyAndMend(t *testing.T) {
	confirmed := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	steward := &CardCrackMend{BySteward: true, ConfirmedAt: &confirmed}
	other := &CardCrackMend{ConfirmedAt: &confirmed}
	pending := &CardCrackMend{BySteward: true}
	for _, tc := range []struct {
		name                       string
		severity, share, discovery string
		primaries                  int
		warranty                   float64
		mend                       *CardCrackMend
		want                       float64
	}{
		{"S1 primary discovered, full warranty, unmended", "S1", "primary", "discovered", 1, 1, nil, 4},
		{"S2 self-reported", "S2", "primary", "self", 1, 1, nil, 1},
		{"S3 concealed", "S3", "primary", "concealed", 1, 1, nil, 1.5},
		{"S4 cosmetic", "S4", "primary", "discovered", 1, 1, nil, 0.25},
		{"two necessary primary causes split the blame", "S2", "primary", "discovered", 2, 1, nil, 1},
		{"a contributing cause carries a quarter", "S1", "contributing", "discovered", 3, 1, nil, 1},
		{"half warranty halves it", "S1", "primary", "discovered", 1, 0.5, nil, 2},
		{"history weighs nothing", "S1", "primary", "discovered", 1, 0, nil, 0},
		{"a confirmed mend by the steward halves it", "S2", "primary", "discovered", 1, 1, steward, 1},
		{"a confirmed mend by someone else restores a quarter", "S2", "primary", "discovered", 1, 1, other, 1.5},
		{"an unconfirmed mend restores nothing yet", "S2", "primary", "discovered", 1, 1, pending, 2},
		{"self-reported S3 mended by the steward", "S3", "primary", "self", 1, 1, steward, 0.25},
	} {
		if got := crackWeight(tc.severity, tc.share, tc.discovery, tc.primaries, tc.warranty, tc.mend); got != tc.want {
			t.Errorf("%s: weight = %v; want %v", tc.name, got, tc.want)
		}
	}
}

func TestWarrantyByCardAgeWhenTheBugWasRaised(t *testing.T) {
	live := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	day := func(n int) time.Time { return live.Add(time.Duration(n) * 24 * time.Hour) }
	for _, tc := range []struct {
		liveSince *time.Time
		bug       time.Time
		label     string
		factor    float64
	}{
		{nil, day(500), "full", 1},
		{&live, day(-3), "full", 1},
		{&live, day(180), "full", 1},
		{&live, day(181), "half", 0.5},
		{&live, day(365), "half", 0.5},
		{&live, day(366), "history", 0},
	} {
		label, factor := warranty(tc.liveSince, tc.bug)
		if label != tc.label || factor != tc.factor {
			t.Errorf("warranty(%v, %v) = %s %v; want %s %v", tc.liveSince, tc.bug, label, factor, tc.label, tc.factor)
		}
	}
}

func TestAddWorkdaysSkipsWeekends(t *testing.T) {
	friday := time.Date(2026, 10, 2, 15, 0, 0, 0, time.UTC)
	if got := AddWorkdays(friday, 5); !got.Equal(time.Date(2026, 10, 9, 15, 0, 0, 0, time.UTC)) {
		t.Fatalf("five working days after Friday = %v; want the next Friday", got)
	}
	saturday := time.Date(2026, 10, 3, 9, 0, 0, 0, time.UTC)
	if got := AddWorkdays(saturday, 1); !got.Equal(time.Date(2026, 10, 5, 9, 0, 0, 0, time.UTC)) {
		t.Fatalf("one working day after Saturday = %v; want Monday", got)
	}
}
