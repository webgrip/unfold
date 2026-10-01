package store

import (
	"math"
	"strconv"
	"time"

	"github.com/webgrip/ploeg/pkg/gate"
)

// GradeFormula is the version of the grade formula Ploeg computes (ADR-0050).
// Any change to how a grade is computed changes it.
const GradeFormula = "2026.1"

// ProvisionalDays is how long a card is live before its grade stops being
// provisional.
const ProvisionalDays = 180

// CardGrade is the card's grade under formula GradeFormula, computed from
// stored facts when the card is read (ADR-0050). Overall and every subgrade
// run from 1 to 10 in half steps. Label is nil while Provisional; after
// that it is black when all four subgrades are 10, gold when Overall is 10,
// and nil otherwise. Qualifiers holds OB when
// the recorded cost passed the authorized budget and RT when a Run failed.
type CardGrade struct {
	Formula     string          `json:"formula"`
	Overall     float64         `json:"overall"`
	Provisional bool            `json:"provisional"`
	Subgrades   CardSubgrades   `json:"subgrades"`
	Label       *string         `json:"label"`
	Qualifiers  []string        `json:"qualifiers"`
	Inputs      CardGradeInputs `json:"inputs"`
}

// CardSubgrades are the four parts of a grade.
type CardSubgrades struct {
	Reliability float64 `json:"reliability"`
	Durability  float64 `json:"durability"`
	Delivery    float64 `json:"delivery"`
	Review      float64 `json:"review"`
}

// CardGradeInputs are the facts each subgrade used. A nil input is one Ploeg
// does not know; NotCollected names, as "subgrade.input", every input Ploeg
// has no source for yet, which therefore never moves a grade.
type CardGradeInputs struct {
	Reliability  CardReliabilityInputs `json:"reliability"`
	Durability   CardDurabilityInputs  `json:"durability"`
	Delivery     CardDeliveryInputs    `json:"delivery"`
	Review       CardReviewInputs      `json:"review"`
	NotCollected []string              `json:"notCollected"`
}

// CardReliabilityInputs: CrackWeight and Reverted are not collected.
type CardReliabilityInputs struct {
	CrackWeight *float64 `json:"crackWeight"`
	Reverted    *bool    `json:"reverted"`
}

// CardDurabilityInputs: DaysLive counts whole days since LiveSince, the
// card's release, and is 0 while the card is not live. Reverts, Hotfixes and
// Survival are not collected.
type CardDurabilityInputs struct {
	DaysLive  int        `json:"daysLive"`
	LiveSince *time.Time `json:"liveSince"`
	Reverts   *int       `json:"reverts"`
	Hotfixes  *int       `json:"hotfixes"`
	Survival  *float64   `json:"survival"`
}

// CardDeliveryInputs: BudgetShare is the recorded cost over the authorized
// budget, nil when either is unknown. DefectBounces counts defect and
// unknown bounces, nil when the board maps no gates. ExtraPlays counts the
// plays beyond the first.
type CardDeliveryInputs struct {
	BudgetShare   *float64 `json:"budgetShare"`
	DefectBounces *int     `json:"defectBounces"`
	ExtraPlays    int      `json:"extraPlays"`
	FailedRuns    int      `json:"failedRuns"`
}

// CardReviewInputs: ChangeRequests counts human reviews that requested
// changes. ReviewRounds counts the distinct (play, head commit) pairs humans
// reviewed. CIFirstGreen and Findings are not collected.
type CardReviewInputs struct {
	CIFirstGreen   *bool `json:"ciFirstGreen"`
	Findings       *int  `json:"findings"`
	ChangeRequests int   `json:"changeRequests"`
	ReviewRounds   int   `json:"reviewRounds"`
}

var gradeNotCollected = []string{
	"reliability.crackWeight", "reliability.reverted",
	"durability.reverts", "durability.hotfixes", "durability.survival",
	"review.ciFirstGreen", "review.findings",
}

const (
	gradeWeightReliability = 0.40
	gradeWeightDurability  = 0.25
	gradeWeightDelivery    = 0.20
	gradeWeightReview      = 0.15

	penaltyDefectBounce  = 1.5
	penaltyExtraPlay     = 1.0
	penaltyFailedRun     = 0.5
	penaltyChangeRequest = 1.0
	penaltyExtraRound    = 0.5
	provisionalCap       = 9.0
)

type gradeFacts struct {
	liveSince      *time.Time
	now            time.Time
	costUSD        *float64
	authorizedUSD  float64
	defectBounces  *int
	plays          int
	failedRuns     int
	changeRequests int
	reviewRounds   int
}

func halfStep(x float64) float64 {
	r := math.Floor(x*2+0.5+1e-9) / 2
	return math.Max(1, math.Min(10, r))
}

func budgetPenalty(share *float64) float64 {
	switch {
	case share == nil || *share <= 1:
		return 0
	case *share <= 1.25:
		return 1
	default:
		return 2
	}
}

func computeGrade(f gradeFacts) CardGrade {
	in := CardGradeInputs{NotCollected: append([]string{}, gradeNotCollected...)}
	in.Durability.LiveSince = f.liveSince
	if f.liveSince != nil && f.now.After(*f.liveSince) {
		in.Durability.DaysLive = int(f.now.Sub(*f.liveSince) / (24 * time.Hour))
	}
	if f.costUSD != nil && f.authorizedUSD > 0 {
		share := *f.costUSD / f.authorizedUSD
		in.Delivery.BudgetShare = &share
	}
	in.Delivery.DefectBounces = f.defectBounces
	if f.plays > 1 {
		in.Delivery.ExtraPlays = f.plays - 1
	}
	in.Delivery.FailedRuns = f.failedRuns
	in.Review.ChangeRequests = f.changeRequests
	in.Review.ReviewRounds = f.reviewRounds

	defects := 0
	if f.defectBounces != nil {
		defects = *f.defectBounces
	}
	extraRounds := max(0, f.reviewRounds-1)
	sub := CardSubgrades{
		Reliability: 10,
		Durability:  halfStep(6 + 4*math.Sqrt(math.Min(1, float64(in.Durability.DaysLive)/ProvisionalDays))),
		Delivery: halfStep(10 - budgetPenalty(in.Delivery.BudgetShare) - penaltyDefectBounce*float64(defects) -
			penaltyExtraPlay*float64(in.Delivery.ExtraPlays) - penaltyFailedRun*float64(f.failedRuns)),
		Review: halfStep(10 - penaltyChangeRequest*float64(f.changeRequests) - penaltyExtraRound*float64(extraRounds)),
	}
	g := CardGrade{Formula: GradeFormula, Subgrades: sub, Inputs: in, Qualifiers: []string{},
		Provisional: in.Durability.DaysLive < ProvisionalDays}
	g.Overall = halfStep(gradeWeightReliability*sub.Reliability + gradeWeightDurability*sub.Durability +
		gradeWeightDelivery*sub.Delivery + gradeWeightReview*sub.Review)
	if g.Provisional {
		g.Overall = math.Min(g.Overall, provisionalCap)
	}
	switch {
	case g.Provisional:
	case sub.Reliability == 10 && sub.Durability == 10 && sub.Delivery == 10 && sub.Review == 10:
		label := "black"
		g.Label = &label
	case g.Overall == 10:
		label := "gold"
		g.Label = &label
	}
	if in.Delivery.BudgetShare != nil && *in.Delivery.BudgetShare > 1+1e-9 {
		g.Qualifiers = append(g.Qualifiers, "OB")
	}
	if f.failedRuns > 0 {
		g.Qualifiers = append(g.Qualifiers, "RT")
	}
	return g
}

func (c *OperatorCard) grade(journey *gate.Journey, now time.Time) *CardGrade {
	verdict, merged := false, false
	changeRequests := 0
	rounds := map[string]bool{}
	for _, p := range c.Plays {
		if p.State == "merged" {
			merged = true
		}
		for _, r := range p.Reviews {
			if !c.human(r.Reviewer) {
				continue
			}
			switch r.State {
			case "approved":
				verdict = true
			case "changes_requested":
				verdict = true
				changeRequests++
			}
			rounds[strconv.Itoa(p.Number)+"@"+r.HeadSHA] = true
		}
	}
	if !verdict && !merged {
		return nil
	}
	f := gradeFacts{now: now, costUSD: c.Totals.CostUSD, authorizedUSD: c.Totals.AuthorizedUSD, plays: len(c.Plays),
		failedRuns: c.Totals.FailedRuns, changeRequests: changeRequests, reviewRounds: len(rounds)}
	if c.Release != nil {
		at := c.Release.At
		f.liveSince = &at
	}
	if journey != nil {
		defects := 0
		for _, b := range journey.Bounces {
			if b.Counts() {
				defects++
			}
		}
		f.defectBounces = &defects
	}
	g := computeGrade(f)
	return &g
}
