package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/webgrip/ploeg/pkg/httpapi"
	"github.com/webgrip/ploeg/pkg/store"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "Local Ploeg demonstration failed:", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	databaseURL := os.Getenv("VLOER_DEMO_DATABASE_URL")
	if databaseURL == "" {
		return fmt.Errorf("start through scripts/unified-demo.ts")
	}
	consumers, err := httpapi.ParseOperatorConsumers(`[{"name":"local-workbench","tokenEnv":"VLOER_UNIFIED_DEMO_TOKEN","teams":["delivery"],"execute":true,"maxBudgetUsd":1}]`, os.LookupEnv)
	if err != nil {
		return err
	}
	database, err := store.New(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer database.Close()
	ready, cancelReady := context.WithTimeout(ctx, 10*time.Second)
	defer cancelReady()
	for database.Ping(ready) != nil {
		select {
		case <-ready.Done():
			return fmt.Errorf("temporary PostgreSQL did not become ready")
		case <-time.After(30 * time.Millisecond):
		}
	}
	if err := database.Migrate(ctx); err != nil {
		return err
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	api := &httpapi.Server{Store: database, Log: slog.New(slog.DiscardHandler), OperatorConfig: httpapi.OperatorConfig{Consumers: consumers, Teams: map[string][]string{"delivery": {"operator"}}}}
	server := &http.Server{Handler: api.Handler(), ReadHeaderTimeout: 5 * time.Second}
	served := make(chan error, 1)
	go func() { served <- server.Serve(listener) }()
	if err := json.NewEncoder(os.Stdout).Encode(map[string]string{"event": "ploeg.ready", "url": "http://" + listener.Addr().String()}); err != nil {
		_ = server.Close()
		return err
	}
	select {
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdown)
	case err := <-served:
		return err
	}
}
