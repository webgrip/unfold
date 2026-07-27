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

	// LiteLLM client for per-run key lifecycle (sweeper revocations).
	var llClient *litellm.Client
	if url := os.Getenv("LITELLM_ADMIN_URL"); url != "" {
		key := os.Getenv("LITELLM_MASTER_KEY")
		if key != "" {
			llClient = litellm.NewClient(url, key)
			log.Info("litellm client configured", "url", url)
		} else {
			log.Warn("LITELLM_ADMIN_URL set but LITELLM_MASTER_KEY is empty — key revocation disabled")
		}
	} else {
		log.Info("LITELLM_ADMIN_URL not set — key revocation disabled")
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

	// Boot-time orphan sweep: revoke ploeg-* keys that no longer correspond to
	// a live (unfinished) run. This clears pre-existing stragglers (e.g. run 9's
	// leaked key) on first deploy after upgrade.
	if llClient != nil {
		liteKeys, err := llClient.ListKeys(ctx, litellm.AliasPrefix)
		if err != nil {
			log.Error("orphan sweep list failed", "err", err)
		} else if len(liteKeys) > 0 {
			// Build a set of active aliases from unfinished runs.
			activeTokens, err := st.UnfinishedRunTokens(ctx)
			if err != nil {
				log.Error("orphan sweep: failed to query active runs", "err", err)
			} else {
				activeAliases := make(map[string]struct{}, len(activeTokens))
				for _, tok := range activeTokens {
					if alias := litellm.Alias(tok); alias != "" {
						activeAliases[alias] = struct{}{}
					}
				}
				var revokeTokens []string
				for _, k := range liteKeys {
					if _, live := activeAliases[k.KeyAlias]; !live {
						revokeTokens = append(revokeTokens, k.Token)
					}
				}
				if len(revokeTokens) > 0 {
					log.Info("orphan sweep: revoking stale keys", "count", len(revokeTokens))
					if err := llClient.DeleteKeys(ctx, revokeTokens); err != nil {
						log.Error("orphan sweep delete failed", "err", err)
					}
				} else {
					log.Info("orphan sweep: no stale keys found")
				}
			}
		} else {
			log.Info("orphan sweep: no keys to check")
		}
	}

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
				expired, err := st.ExpireLeases(ctx)
				if err != nil {
					log.Error("lease sweep failed", "err", err)
					continue
				}
				for _, e := range expired {
					log.Warn("lease expired, item released", "work_item", e.WorkItemID)
					if llClient == nil {
						continue
					}
					alias := litellm.Alias(e.RunToken)
					if alias == "" {
						log.Warn("skipping key revoke for short run token", "run_token", e.RunToken)
						continue
					}
					// List keys by exact alias match (client-side filter).
					keys, err := llClient.ListKeys(ctx, alias)
					if err != nil {
						log.Error("failed to list keys for revocation", "alias", alias, "err", err)
						continue
					}
					var tokens []string
					for _, k := range keys {
						tokens = append(tokens, k.Token)
					}
					if len(tokens) == 0 {
						continue
					}
					log.Info("revoking expired lease key", "alias", alias, "tokens", len(tokens))
					if err := llClient.DeleteKeys(ctx, tokens); err != nil {
						log.Error("key revoke failed", "alias", alias, "err", err)
					}
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
