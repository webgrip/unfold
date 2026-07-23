package work

// legalTransitions encodes the Work Item lifecycle exactly as defined in
// docs/domain/model.yaml. Illegal transitions are errors, never silent
// coercions (backlog #11).
var legalTransitions = map[State][]State{
	StateIngested:   {StateQueued},
	StateQueued:     {StateLeased, StateStale},
	StateLeased:     {StateQueued, StateNeedsHuman, StateStale, StateDone},
	StateNeedsHuman: {StateQueued, StateDone},
	StateStale:      {StateQueued},
}

// CanTransition reports whether from -> to is a legal lifecycle transition.
func CanTransition(from, to State) bool {
	for _, s := range legalTransitions[from] {
		if s == to {
			return true
		}
	}
	return false
}

// StateForOutcome maps a terminal Outcome to the Work Item state it produces:
// stuck routes to a human queue (R4), failed releases the lease for retry
// (R5), everything else completes the item.
func StateForOutcome(o Outcome) State {
	switch o {
	case OutcomeStuck:
		return StateNeedsHuman
	case OutcomeFailed:
		return StateQueued
	default:
		return StateDone
	}
}
