package httpapi

import (
	"net/http"
	"strings"

	"github.com/webgrip/ploeg/pkg/store"
)

func (s *Server) handleOperatorCard(w http.ResponseWriter, r *http.Request) {
	if !operatorGET(w, r) {
		return
	}
	id, ok := operatorID(w, r)
	if !ok {
		return
	}
	principal, _ := OperatorPrincipalFromContext(r.Context())
	card, err := s.Store.OperatorCard(r.Context(), id, principal.Teams,
		store.CardOptions{Bots: s.ForgeBots, ReleaseEnvironments: s.OperatorConfig.ReleaseEnvironments})
	if err != nil {
		operatorReadError(w, err)
		return
	}
	card.Style = s.cardStyle(card.Target)
	operatorJSON(w, http.StatusOK, map[string]any{"schemaVersion": 1, "card": card})
}

func (s *Server) cardStyle(target *store.OperatorCardTarget) store.CardStyle {
	style := store.CardStyle{Skin: store.DefaultCardSkin}
	if target == nil {
		return style
	}
	configured, ok := s.OperatorConfig.CardStyles[strings.ToLower(target.Owner+"/"+target.Repo)]
	if !ok {
		return style
	}
	if configured.Skin != "" {
		style.Skin = configured.Skin
	}
	if configured.Theme != nil && *configured.Theme != "" {
		theme := *configured.Theme
		style.Theme = &theme
	}
	return style
}
