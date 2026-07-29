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

	"github.com/webgrip/ploeg/pkg/httpapi"
	"github.com/webgrip/ploeg/pkg/litellm"
	"github.com/webgrip/ploeg/pkg/llmbroker"
	"github.com/webgrip/ploeg/pkg/provider"
	"github.com/webgrip/ploeg/pkg/provider/vikunja"
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

	vik := &vikunja.Provider{
		Secret:      os.Getenv("PLOEG_VIKUNJA_SECRET"),
		DefaultTeam: envOr("PLOEG_DEFAULT_TEAM", "default"),
		TeamMap:     parseTeamMap(os.Getenv("PLOEG_TEAM_MAP")),
		Log:         log,
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
	targets, err := target.NewMapResolver(os.Getenv("PLOEG_TARGET_MAP"), os.Getenv("PLOEG_TARGET_FORGE"))
	if err != nil {
		return fmt.Errorf("PLOEG_TARGET_MAP: %w", err)
	}
	log.Info("target map loaded", "rules", targets.Len())

	srv := &httpapi.Server{
		Store:    st,
		Trackers: map[string]provider.TrackerProvider{vik.Name(): vik},
		Targets:  targets,
		LeaseTTL: leaseTTL,
		Log:      log,
	}

	httpSrv := &http.Server{Addr: listen, Handler: srv.Handler(), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = httpSrv.Shutdown(shutdownCtx)
	}()

	bootOrphanSweep(ctx, log, st, sweeper)

	go sweepLoop(ctx, log, st, sweeper, sweepEvery)

	log.Info("ploegd listening", "version", version, "addr", listen, "lease_ttl", leaseTTL)
	if err := httpSrv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	log.Info("ploegd stopped")
	return nil
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
