package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/webgrip/ploeg/pkg/sandboxlaunch"
)

func runSandboxLaunch(log *slog.Logger) error {
	deadline, err := boundEnv("PLOEG_SANDBOX_RUN_DEADLINE", 0)
	if err != nil {
		return err
	}
	margin, err := boundEnv("PLOEG_SANDBOX_SHUTDOWN_MARGIN", 10*time.Minute)
	if err != nil {
		return err
	}
	ttl, err := strconv.ParseInt(envOr("PLOEG_SANDBOX_TTL_SECONDS_AFTER_FINISHED", "60"), 10, 32)
	if err != nil || ttl < 0 {
		return fmt.Errorf("PLOEG_SANDBOX_TTL_SECONDS_AFTER_FINISHED must be a non-negative integer")
	}
	base, token, client, err := sandboxlaunch.InCluster(sandboxlaunch.ServiceAccountDir)
	if err != nil {
		return err
	}
	cfg := sandboxlaunch.Config{
		APIBase:                 base,
		Token:                   token,
		HTTPClient:              client,
		Namespace:               os.Getenv("POD_NAMESPACE"),
		ClaimName:               os.Getenv("POD_NAME"),
		JobName:                 os.Getenv("PLOEG_SANDBOX_JOB_NAME"),
		JobUID:                  os.Getenv("PLOEG_SANDBOX_JOB_UID"),
		WarmPool:                os.Getenv("PLOEG_SANDBOX_WARM_POOL"),
		RunDeadline:             deadline,
		ShutdownMargin:          margin,
		TTLSecondsAfterFinished: int32(ttl),
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, deadline+margin)
	defer cancel()
	return sandboxlaunch.Launch(ctx, cfg, log)
}
