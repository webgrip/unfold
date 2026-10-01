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
			if g.Formula != "2026.1" || g.Subgrades != tc.sub || g.Overall != tc.overall || g.Provisional != tc.provisional {
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
	if in.Reliability.CrackWeight != nil || in.Reliability.Reverted != nil || in.Durability.Reverts != nil ||
		in.Durability.Hotfixes != nil || in.Durability.Survival != nil || in.Review.CIFirstGreen != nil || in.Review.Findings != nil {
		t.Fatalf("inputs = %+v; inputs without a source are null", in)
	}
	want := []string{"reliability.crackWeight", "reliability.reverted", "durability.reverts", "durability.hotfixes",
		"durability.survival", "review.ciFirstGreen", "review.findings"}
	if !reflect.DeepEqual(in.NotCollected, want) {
		t.Fatalf("notCollected = %v", in.NotCollected)
	}
	share := computeGrade(gradeFacts{now: now, plays: 1, costUSD: f64(0.5), authorizedUSD: 2}).Inputs.Delivery.BudgetShare
	if share == nil || *share != 0.25 {
		t.Fatalf("budgetShare = %v", share)
	}
}
