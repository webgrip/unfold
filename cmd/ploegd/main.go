// ploegd is Ploeg's single daemon: webhook ingest, provider SPI host,
// lease manager, outcome ingestion. Prototype: Vikunja ingest + run API +
// expiry sweeper over Postgres.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/webgrip/ploeg/pkg/httpapi"
	"github.com/webgrip/ploeg/pkg/provider"
	"github.com/webgrip/ploeg/pkg/provider/vikunja"
	"github.com/webgrip/ploeg/pkg/store"
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
	if err := st.Migrate(ctx); err != nil {
		return err
	}

	vik := &vikunja.Provider{
		Secret:      os.Getenv("PLOEG_VIKUNJA_SECRET"),
		DefaultTeam: envOr("PLOEG_DEFAULT_TEAM", "default"),
		TeamMap:     parseTeamMap(os.Getenv("PLOEG_TEAM_MAP")),
		Log:         log,
	}

	srv := &httpapi.Server{
		Store:    st,
		Trackers: map[string]provider.TrackerProvider{vik.Name(): vik},
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

	// The expiry sweep is the crash-safety mechanic: nothing depends on an
	// agent behaving well at death (design §3).
	go func() {
		t := time.NewTicker(sweepEvery)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				ids, err := st.ExpireLeases(ctx)
				if err != nil {
					log.Error("lease sweep failed", "err", err)
					continue
				}
				for _, id := range ids {
					log.Warn("lease expired, item released", "work_item", id)
				}
			}
		}
	}()

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
