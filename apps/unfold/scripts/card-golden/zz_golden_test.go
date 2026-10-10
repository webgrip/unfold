package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

var goldenMu sync.Mutex

func init() {
	dir := os.Getenv("UNFOLD_GOLDEN_DIR")
	if dir == "" {
		return
	}
	_ = os.MkdirAll(dir, 0o755)
	goldenCardHook = func(ctx context.Context, s *Store, id int64, teams []string, opts CardOptions, inner func(CardOptions) (OperatorCard, error)) (OperatorCard, error) {
		if opts.Now.IsZero() {
			opts.Now = time.Now().UTC()
		}
		live := map[string]any{}
		if opts.Live != nil {
			orig := opts.Live
			opts.Live = func(ctx context.Context, token string) (LiveUsage, error) {
				u, err := orig(ctx, token)
				if err != nil {
					live[token] = nil
				} else {
					live[token] = u
				}
				return u, err
			}
		}
		taskURLs := map[string]string{}
		if opts.TaskURL != nil {
			orig := opts.TaskURL
			opts.TaskURL = func(provider, external string) string {
				u := orig(provider, external)
				taskURLs[provider+"\x00"+external] = u
				return u
			}
		}
		world, state := goldenWorld(ctx, s, opts)
		card, err := inner(opts)
		_, after := goldenWorld(ctx, s, opts)
		fixture := map[string]any{
			"kind": "card", "test": goldenTestName(), "workItemId": fmt.Sprint(id), "teams": teams,
			"options": goldenOptions(opts, card), "world": world, "state": state, "stateAfter": after,
			"liveReadings": goldenLive(ctx, s, live), "taskUrls": taskURLs,
		}
		if err != nil {
			fixture["error"] = err.Error()
		} else {
			fixture["card"] = card
		}
		goldenWrite(dir, fixture)
		return card, err
	}
	goldenListHook = func(ctx context.Context, s *Store, f CardListFilter, opts CardOptions, inner func(CardListFilter, CardOptions) (CardPage, error)) (CardPage, error) {
		if opts.Now.IsZero() {
			opts.Now = time.Now().UTC()
		}
		world, state := goldenWorld(ctx, s, opts)
		page, err := inner(f, opts)
		filter := map[string]any{"teams": f.Teams, "team": f.Team, "members": f.Members, "since": f.Since, "limit": f.Limit}
		if f.Before != nil {
			filter["before"] = f.Before.String()
		}
		fixture := map[string]any{"kind": "list", "test": goldenTestName(), "filter": filter, "options": goldenOptions(opts, OperatorCard{}), "world": world, "state": state}
		if err != nil {
			fixture["error"] = err.Error()
		} else {
			ids := []string{}
			for _, c := range page.Cards {
				ids = append(ids, c.WorkItemID)
			}
			fixture["cards"] = ids
			if page.NextBefore != nil {
				fixture["nextBefore"] = map[string]any{"at": page.NextBefore.At, "workItemId": fmt.Sprint(page.NextBefore.WorkItemID)}
			}
		}
		goldenWrite(dir, fixture)
		return page, err
	}
}

func goldenTestName() string {
	pcs := make([]uintptr, 64)
	n := runtime.Callers(2, pcs)
	frames := runtime.CallersFrames(pcs[:n])
	name := ""
	for {
		f, more := frames.Next()
		if i := strings.LastIndex(f.Function, ".Test"); i >= 0 {
			name = f.Function[i+1:]
		}
		if !more {
			break
		}
	}
	return name
}

func goldenWrite(dir string, fixture map[string]any) {
	goldenMu.Lock()
	defer goldenMu.Unlock()
	raw, err := json.MarshalIndent(fixture, "", " ")
	if err != nil {
		panic(err)
	}
	sum := sha256.Sum256(raw)
	name := fmt.Sprintf("%s-%s.json", fixture["test"], hex.EncodeToString(sum[:])[:10])
	if err := os.WriteFile(filepath.Join(dir, name), raw, 0o644); err != nil {
		panic(err)
	}
}

func goldenOptions(opts CardOptions, card OperatorCard) map[string]any {
	out := map[string]any{"now": opts.Now.UTC(), "bots": opts.Bots, "releaseEnvironments": opts.ReleaseEnvironments,
		"hotfixLabels": opts.HotfixLabels, "rarity": opts.Rarity != nil, "live": opts.Live != nil}
	if opts.Flow != nil {
		calendars := map[string]any{}
		for team := range opts.Flow.Calendars {
			calendars[team] = "see-card"
		}
		f := map[string]any{"kinds": opts.Flow.Kinds, "calendars": calendars}
		if card.Flow != nil {
			f["cardCalendar"] = card.Flow.Calendar
		}
		out["flow"] = f
	}
	return out
}

func goldenLive(ctx context.Context, s *Store, live map[string]any) []map[string]any {
	out := []map[string]any{}
	for token, reading := range live {
		var id int64
		if err := s.pool.QueryRow(ctx, `SELECT id FROM agent_runs WHERE run_token = $1`, token).Scan(&id); err != nil {
			continue
		}
		entry := map[string]any{"runId": fmt.Sprint(id)}
		if u, ok := reading.(LiveUsage); ok {
			entry["costUsd"], entry["inputTokens"], entry["outputTokens"] = u.CostUSD, u.InputTokens, u.OutputTokens
		} else {
			entry["error"] = true
		}
		out = append(out, entry)
	}
	return out
}

func goldenJSON(ctx context.Context, s *Store, query string, args ...any) any {
	var raw []byte
	if err := s.pool.QueryRow(ctx, query, args...).Scan(&raw); err != nil {
		panic(fmt.Errorf("%w: %s", err, query))
	}
	var v any
	if raw == nil {
		return []any{}
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		panic(err)
	}
	return v
}


func goldenWorld(ctx context.Context, s *Store, opts CardOptions) ([]any, map[string]any) {
	rows, err := s.pool.Query(ctx, `SELECT id FROM work_items ORDER BY id`)
	if err != nil {
		panic(err)
	}
	var ids []int64
	for rows.Next() {
		var id int64
		_ = rows.Scan(&id)
		ids = append(ids, id)
	}
	rows.Close()
	world := []any{}
	for _, id := range ids {
		facts, err := s.WorkItemFacts(ctx, id, nil, FactsOptions{Bots: opts.Bots, TaskURL: opts.TaskURL, Now: opts.Now})
		if err != nil {
			panic(err)
		}
		world = append(world, goldenRaw(facts))
	}
	cracks, rarity, shapes := []any{}, []any{}, []any{}
	var after int64
	for {
		page, err := s.LegacyExport(ctx, nil, after, 200)
		if err != nil {
			panic(err)
		}
		for _, item := range page.Items {
			for _, c := range item.Cracks {
				cracks = append(cracks, goldenRaw(c))
			}
			if len(item.Rarity) > 0 && string(item.Rarity) != "null" {
				r := goldenRaw(item.Rarity).(map[string]any)
				r["workItemId"] = item.WorkItemID
				rarity = append(rarity, r)
			}
			for _, sh := range item.Shapes {
				shapes = append(shapes, goldenRaw(sh))
			}
		}
		if page.NextAfter == nil {
			break
		}
		next, err := strconv.ParseInt(*page.NextAfter, 10, 64)
		if err != nil {
			panic(err)
		}
		after = next
	}
	state := map[string]any{
		"cracks": cracks, "rarity": rarity, "shapes": shapes,
		"kpis": goldenJSON(ctx, s, `SELECT COALESCE(jsonb_agg(jsonb_build_object('pullRequestId', p.id::text, 'kpis', p.kpis) ORDER BY p.id), '[]')
			FROM pull_requests p WHERE p.kpis IS NOT NULL`),
	}
	return world, state
}

func goldenRaw(value any) any {
	raw, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	var out any
	if err := json.Unmarshal(raw, &out); err != nil {
		panic(err)
	}
	return out
}
