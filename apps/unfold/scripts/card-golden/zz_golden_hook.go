package store

import "context"

var goldenCardHook func(ctx context.Context, s *Store, id int64, teams []string, opts CardOptions, inner func(CardOptions) (OperatorCard, error)) (OperatorCard, error)
var goldenListHook func(ctx context.Context, s *Store, f CardListFilter, opts CardOptions, inner func(CardListFilter, CardOptions) (CardPage, error)) (CardPage, error)
var goldenDepth int

func (s *Store) OperatorCard(ctx context.Context, id int64, teams []string, opts CardOptions) (OperatorCard, error) {
	if goldenCardHook == nil || goldenDepth > 0 {
		return s.operatorCardInner(ctx, id, teams, opts)
	}
	goldenDepth++
	defer func() { goldenDepth-- }()
	return goldenCardHook(ctx, s, id, teams, opts, func(o CardOptions) (OperatorCard, error) { return s.operatorCardInner(ctx, id, teams, o) })
}

func (s *Store) OperatorCards(ctx context.Context, f CardListFilter, opts CardOptions) (CardPage, error) {
	if goldenListHook == nil || goldenDepth > 0 {
		return s.operatorCardsInner(ctx, f, opts)
	}
	goldenDepth++
	defer func() { goldenDepth-- }()
	return goldenListHook(ctx, s, f, opts, func(f CardListFilter, o CardOptions) (CardPage, error) { return s.operatorCardsInner(ctx, f, o) })
}
