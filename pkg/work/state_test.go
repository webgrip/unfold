package work

import "testing"

func TestCanTransition(t *testing.T) {
	legal := []struct{ from, to State }{
		{StateIngested, StateQueued},
		{StateQueued, StateLeased},
		{StateQueued, StateStale},
		{StateLeased, StateQueued},
		{StateLeased, StateNeedsHuman},
		{StateLeased, StateStale},
		{StateLeased, StateDone},
		{StateNeedsHuman, StateQueued},
		{StateNeedsHuman, StateDone},
		{StateStale, StateQueued},
	}
	for _, tt := range legal {
		if !CanTransition(tt.from, tt.to) {
			t.Errorf("expected legal: %s -> %s", tt.from, tt.to)
		}
	}

	illegal := []struct{ from, to State }{
		{StateIngested, StateLeased},
		{StateIngested, StateDone},
		{StateQueued, StateDone},
		{StateQueued, StateNeedsHuman},
		{StateDone, StateQueued},
		{StateDone, StateLeased},
		{StateStale, StateLeased},
		{StateStale, StateDone},
		{StateNeedsHuman, StateLeased},
		{StateLeased, StateIngested},
	}
	for _, tt := range illegal {
		if CanTransition(tt.from, tt.to) {
			t.Errorf("expected illegal: %s -> %s", tt.from, tt.to)
		}
	}
}

func TestStateForOutcome(t *testing.T) {
	cases := map[Outcome]State{
		OutcomeStuck:           StateNeedsHuman,
		OutcomeFailed:          StateQueued,
		OutcomePROpened:        StateDone,
		OutcomePRUpdated:       StateDone,
		OutcomeIssueUpdated:    StateDone,
		OutcomeFollowUpCreated: StateDone,
		OutcomeNoChangeNeeded:  StateDone,
	}
	for o, want := range cases {
		if got := StateForOutcome(o); got != want {
			t.Errorf("StateForOutcome(%s) = %s, want %s", o, got, want)
		}
	}
}
