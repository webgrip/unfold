package httpapi

import (
	"context"
	"errors"
	"time"

	"github.com/webgrip/ploeg/pkg/gate"
	"github.com/webgrip/ploeg/pkg/provider"
	"github.com/webgrip/ploeg/pkg/store"
)

const gateObserveTimeout = 10 * time.Second

func (s *Server) observeGate(ctx context.Context, name string, tp provider.TrackerProvider, ev provider.TrackerEvent) {
	if !s.Gates.Has(name) {
		return
	}
	reader, ok := tp.(provider.BoardReader)
	if !ok {
		return
	}
	if ev.Scope.ID != "" {
		if _, mapped := s.Gates.Lookup(name, ev.Scope.ID); !mapped {
			return
		}
	}
	ctx, cancel := context.WithTimeout(ctx, gateObserveTimeout)
	defer cancel()
	pos, err := s.Store.GatePosition(ctx, name, ev.ExternalID)
	if errors.Is(err, store.ErrWorkItemNotFound) {
		return
	}
	if err != nil {
		s.Log.Error("gate position read failed", "provider", name, "external_id", ev.ExternalID, "err", err)
		return
	}
	status, err := reader.BoardStatus(ctx, ev.ExternalID)
	if err != nil {
		s.Log.Warn("board status read failed; gate move not recorded", "provider", name, "external_id", ev.ExternalID, "err", err)
		return
	}
	board, mapped := s.Gates.Lookup(name, status.Scope)
	if !mapped {
		return
	}
	to, matched, ok := board.Resolve(status.Statuses)
	if !ok {
		s.Log.Info("tracker status maps to no single gate", "provider", name, "external_id", ev.ExternalID, "statuses", status.Statuses)
		return
	}
	if to == pos.Gate {
		return
	}
	move := store.GateMove{Provider: name, ExternalID: ev.ExternalID, Gate: to, Status: matched, Actor: ev.Actor, At: ev.At}
	if move.At.Before(pos.Entered) {
		move.At = time.Time{}
	}
	if gate.IsBounce(pos.Gate, to) {
		move.Reason = s.bounceReason(ctx, name, reader, ev.ExternalID, status.Labels, pos.Entered)
	}
	recorded, err := s.Store.RecordGateMove(ctx, move)
	if err != nil {
		s.Log.Error("gate move not recorded", "provider", name, "external_id", ev.ExternalID, "gate", to, "err", err)
		return
	}
	if recorded {
		s.Log.Info("gate move recorded", "provider", name, "external_id", ev.ExternalID, "from", pos.Gate, "to", to,
			"status", matched, "bounce", gate.IsBounce(pos.Gate, to), "reason", move.Reason)
	}
}

func (s *Server) bounceReason(ctx context.Context, name string, reader provider.BoardReader, externalID string, labels []string, since time.Time) gate.Reason {
	comments, err := reader.BoardComments(ctx, externalID)
	if err != nil {
		s.Log.Warn("comment read failed; bounce reason taken from labels only", "provider", name, "external_id", externalID, "err", err)
	}
	var newest time.Time
	var fromComment gate.Reason
	for _, c := range comments {
		if !c.At.IsZero() && c.At.Before(since) {
			continue
		}
		reason, ok := gate.ParseReason(c.Text)
		if ok && (fromComment == "" || !c.At.Before(newest)) {
			fromComment, newest = reason, c.At
		}
	}
	if fromComment != "" {
		return fromComment
	}
	var fromLabel gate.Reason
	for _, l := range labels {
		reason, ok := gate.ParseReason(l)
		if !ok {
			continue
		}
		if fromLabel != "" && fromLabel != reason {
			return gate.ReasonUnknown
		}
		fromLabel = reason
	}
	if fromLabel != "" {
		return fromLabel
	}
	return gate.ReasonUnknown
}
