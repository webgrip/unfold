// ploegd is Ploeg's single daemon: webhook ingest, provider SPI host,
// lease manager, outcome ingestion. Prototype: Vikunja ingest + run API +
// expiry sweeper over Postgres.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/webgrip/ploeg/pkg/config"
	"github.com/webgrip/ploeg/pkg/forgebroker"
	"github.com/webgrip/ploeg/pkg/httpapi"
	"github.com/webgrip/ploeg/pkg/litellm"
	"github.com/webgrip/ploeg/pkg/llmbroker"
	"github.com/webgrip/ploeg/pkg/plan"
	"github.com/webgrip/ploeg/pkg/provider"
	"github.com/webgrip/ploeg/pkg/provider/forgejo"
	"github.com/webgrip/ploeg/pkg/provider/vikunja"
	"github.com/webgrip/ploeg/pkg/shiftengine"
	"github.com/webgrip/ploeg/pkg/store"
	"github.com/webgrip/ploeg/pkg/target"
)

var version = "0.0.0-dev"

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if err := run(log); err != nil {
		log.Error("ploegd exiting", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	dbURL := os.Getenv("PLOEG_DATABASE_URL")
	if dbURL == "" {
		return errors.New("PLOEG_DATABASE_URL is required")
	}
	listen := envOr("PLOEG_LISTEN", ":8080")
	leaseTTL := durationOr("PLOEG_LEASE_TTL", 60*time.Second)
	sweepEvery := durationOr("PLOEG_SWEEP_INTERVAL", 15*time.Second)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	st, err := store.New(ctx, dbURL)
	if err != nil {
		return err
	}
	defer st.Close()
	// The database may still be bootstrapping when ploegd starts (fresh CNPG
	// cluster, compose cold start); retry instead of crash-looping.
	for deadline := time.Now().Add(2 * time.Minute); ; {
		if err = st.Ping(ctx); err == nil {
			break
		}
		if time.Now().After(deadline) || ctx.Err() != nil {
			return fmt.Errorf("database unreachable after retries: %w", err)
		}
		log.Warn("database not ready; retrying", "err", err)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(3 * time.Second):
		}
	}
	if err := st.Migrate(ctx); err != nil {
		return err
	}

	// File-backed configuration (PLOEG_CONFIG). Replaces three env-var DSLs
	// with one reviewable YAML file; absent = the env vars still apply, so
	// this rolls out without a flag day.
	cfg, err := config.Load(os.Getenv("PLOEG_CONFIG"))
	if err != nil {
		return fmt.Errorf("PLOEG_CONFIG: %w", err)
	}

	// Tracker write-backs are opt-in by credential: without a URL and token
	// the provider keeps its logging no-op, so a deployment that has not been
	// given one still finishes runs — it just does not update the board.
	vik := &vikunja.Provider{
		Secret:      os.Getenv("PLOEG_VIKUNJA_SECRET"),
		DefaultTeam: envOr("PLOEG_DEFAULT_TEAM", "default"),
		TeamMap:     mergeTeamMap(cfg.AssigneeTeams(), parseTeamMap(os.Getenv("PLOEG_TEAM_MAP"))),
		BaseURL:     trimSlash(os.Getenv("PLOEG_VIKUNJA_URL")),
		Token:       os.Getenv("PLOEG_VIKUNJA_TOKEN"),
		Log:         log,
	}
	if vik.BaseURL != "" && vik.Token != "" {
		log.Info("vikunja write-backs enabled", "url", vik.BaseURL)
	} else {
		log.Info("vikunja write-backs disabled (PLOEG_VIKUNJA_URL/PLOEG_VIKUNJA_TOKEN unset)")
	}

	// The forge seam. Ploeg comments as the same bot that opens the pull
	// requests; commenting is not pushing, so it needs no second credential.
	//
	// Registered under the forge ID a Work Target carries, not under the
	// provider's dialect name. Those are different things (ADR-0016): the id
	// identifies an INSTANCE, the name identifies the API dialect, and one
	// deployment could have two Forgejo instances with different ids. The
	// engine looks up `Forges[target.Forge]`, so keying this by Name() would
	// silently match nothing and skip every publication. The route is
	// registered under both, since a webhook path names the dialect.
	forgeID := envOr("PLOEG_TARGET_FORGE", "forgejo")
	forges := map[string]provider.ForgeProvider{}
	if forgeURL := trimSlash(os.Getenv("PLOEG_FORGEJO_URL")); forgeURL != "" {
		fj := &forgejo.Provider{
			BaseURL: forgeURL,
			Token:   os.Getenv("PLOEG_FORGEJO_TOKEN"),
			Secret:  os.Getenv("PLOEG_FORGEJO_SECRET"),
			Log:     log,
		}
		forges[forgeID] = fj
		forges[fj.Name()] = fj
		log.Info("forge provider configured", "forge_id", forgeID, "dialect", fj.Name(), "url", forgeURL)
	} else {
		log.Info("no forge provider configured (PLOEG_FORGEJO_URL unset); findings will not reach a pull request")
	}

	// Push rights per writing Run (ADR-0013 tier 2). The admin credential
	// lives only here, never in a worker pod (R6) — the same escalation
	// ADR-0008 accepts for LITELLM_MASTER_KEY. Unset = the shared
	// agent-builder token stands and nothing is minted or revoked.
	var forgeCreds forgebroker.Broker = forgebroker.Static{Token: os.Getenv("PLOEG_FORGEJO_TOKEN")}
	var forgeSweeper forgebroker.Sweeper
	if admin := os.Getenv("PLOEG_FORGEJO_ADMIN_TOKEN"); admin != "" {
		fb := &forgebroker.Forgejo{
			BaseURL:    trimSlash(os.Getenv("PLOEG_FORGEJO_URL")),
			AdminUser:  envOr("PLOEG_FORGEJO_BOT", "agent-builder"),
			AdminToken: admin,
		}
		forgeCreds, forgeSweeper = fb, fb
		log.Info("per-run forge credentials enabled", "bot", fb.AdminUser)
	} else {
		log.Info("per-run forge credentials disabled (PLOEG_FORGEJO_ADMIN_TOKEN unset); workers use the shared token")
	}

	// Gateway credential sweeper (llmbroker.Sweeper) for per-run key
	// lifecycle: nil = no gateway configured, revocation disabled.
	var sweeper llmbroker.Sweeper
	if url := os.Getenv("LITELLM_ADMIN_URL"); url != "" {
		key := os.Getenv("LITELLM_MASTER_KEY")
		if key != "" {
			sweeper = llmbroker.NewLiteLLM(litellm.NewClient(url, key))
			log.Info("litellm sweeper configured", "url", url)
		} else {
			log.Warn("LITELLM_ADMIN_URL set but LITELLM_MASTER_KEY is empty — key revocation disabled")
		}
	} else {
		log.Info("LITELLM_ADMIN_URL not set — key revocation disabled")
	}

	// Work Target resolution: the repository belongs to the work item, not to
	// the team (R11). Entries are rendered from the git org.yaml roster
	// manifest. Empty = nothing resolves and workers keep using their
	// env-configured repo, which is exactly the pre-decoupling behavior.
	// Routing rules come from the config file when it names projects — which
	// is where the project IDs get resolved from names, so nothing in cluster
	// config is a bare number. The env var remains as the fallback.
	targetSpec := os.Getenv("PLOEG_TARGET_MAP")
	if spec, err := cfg.TargetSpec(ctx, vik, log); err != nil {
		return fmt.Errorf("routing config: %w", err)
	} else if spec != "" {
		targetSpec = spec
	}
	targets, err := target.NewMapResolver(targetSpec, os.Getenv("PLOEG_TARGET_FORGE"))
	if err != nil {
		return fmt.Errorf("routing rules: %w", err)
	}
	log.Info("target map loaded", "rules", targets.Len())

	// Team plans (run-multi-agent-shifts): config for the shift engine, parsed
	// and validated at boot so a plan that could open a malformed Round never
	// starts. Empty = every team is plan-less and dispatch is unchanged. The
	// engine that consumes these lands in a follow-up change; parsing first
	// means a bad values edit fails loudly at rollout, not at first dispatch.
	plans := cfg.Plans()
	if len(plans) == 0 {
		if plans, err = plan.Parse(os.Getenv("PLOEG_TEAM_PLANS")); err != nil {
			return fmt.Errorf("PLOEG_TEAM_PLANS: %w", err)
		}
	}
	log.Info("team plans loaded", "teams", len(plans))

	// Uniform dispatch: a team with no plan still gets a Shift — one Round,
	// one writer — so every item has exactly one answer to "what is happening
	// with this". Default on; PLOEG_SHIFTS_UNIFORM=false is the kill switch
	// back to the pre-Shift path, and needs only a ploegd restart.
	uniform := envOr("PLOEG_SHIFTS_UNIFORM", "true") != "false"

	// The engine is nil only when it would have nothing to do: no plans AND
	// no uniform dispatch. Then dispatch is exactly the pre-Shift path.
	var engine *shiftengine.Engine
	if len(plans) > 0 || uniform {
		engine = &shiftengine.Engine{
			Store: st, Plans: plans, Log: log,
			Forges:   forges,
			Trackers: map[string]provider.TrackerProvider{vik.Name(): vik},
			Uniform:  uniform,
		}
		log.Info("shift engine enabled", "planned_teams", len(plans), "uniform", uniform)
	} else {
		log.Info("shift engine disabled (no plans, PLOEG_SHIFTS_UNIFORM=false)")
	}

	srv := &httpapi.Server{
		Store:      st,
		Trackers:   map[string]provider.TrackerProvider{vik.Name(): vik},
		Targets:    targets,
		LeaseTTL:   leaseTTL,
		Log:        log,
		RoleCaps:   plans,
		Forges:     forges,
		ForgeCreds: forgeCreds,
	}
	if engine != nil {
		srv.Engine = engine
	}

	httpSrv := &http.Server{Addr: listen, Handler: srv.Handler(), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = httpSrv.Shutdown(shutdownCtx)
	}()

	bootOrphanSweep(ctx, log, st, sweeper)
	bootForgeSweep(ctx, log, st, forgeSweeper)

	go sweepLoop(ctx, log, st, sweeper, forgeSweeper, engine, sweepEvery)

	log.Info("ploegd listening", "version", version, "addr", listen, "lease_ttl", leaseTTL)
	if err := httpSrv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	log.Info("ploegd stopped")
	return nil
}

func trimSlash(s string) string { return strings.TrimRight(s, "/") }

// mergeTeamMap prefers the config file's roster and keeps env entries it does
// not define, so a deployment can move one team at a time.
func mergeTeamMap(fromFile, fromEnv map[string]string) map[string]string {
	out := map[string]string{}
	for k, v := range fromEnv {
		out[k] = v
	}
	for k, v := range fromFile {
		out[k] = v
	}
	return out
}

// parseTeamMap parses "user1=teamA,user2=teamB" (usernames lowercased).
func parseTeamMap(s string) map[string]string {
	m := map[string]string{}
	for _, pair := range strings.Split(s, ",") {
		k, v, ok := strings.Cut(strings.TrimSpace(pair), "=")
		if ok && k != "" && v != "" {
			m[strings.ToLower(k)] = v
		}
	}
	return m
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func durationOr(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}
