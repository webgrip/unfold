package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"testing"
	"time"

	"github.com/webgrip/ploeg/pkg/forgebroker"
	"github.com/webgrip/ploeg/pkg/store"
	"github.com/webgrip/ploeg/pkg/work"
)

type mintingBroker struct{ forgebroker.Static }

func (mintingBroker) Mint(context.Context, forgebroker.MintRequest) (forgebroker.Credential, error) {
	return forgebroker.Credential{ID: "42", Token: "minted-for-this-run"}, nil
}

func targetedWriterShift(t *testing.T, externalID string) {
	t.Helper()
	ctx := context.Background()
	id, _, err := testStore.IngestAssigned(ctx, work.WorkItem{
		Provider: "vikunja", ExternalID: externalID, Team: "bronze", Title: "t",
		Target: &work.Target{Owner: "webgrip", Repo: "fixture"},
	})
	if err != nil {
		t.Fatalf("IngestAssigned: %v", err)
	}
	shiftID, err := testStore.OpenShift(ctx, id, "bronze", "agent/vik-"+externalID, 10)
	if err != nil {
		t.Fatalf("OpenShift: %v", err)
	}
	if _, err := testStore.OpenRound(ctx, shiftID, 0, []store.Role{{Name: "builder", Writes: true, Cap: 1}}); err != nil {
		t.Fatalf("OpenRound: %v", err)
	}
}

func forgeClaimServer(creds forgebroker.Broker) http.Handler {
	return (&Server{
		Store:          testStore,
		LeaseTTL:       time.Minute,
		Log:            slog.New(slog.DiscardHandler),
		ForgeCreds:     creds,
		WorkerSecurity: &WorkerSecurity{AllowLegacy: true},
	}).Handler()
}

func TestClaim_NeverReturnsTheSharedForgeToken(t *testing.T) {
	reset(t)
	targetedWriterShift(t, "990")
	h := forgeClaimServer(forgebroker.Static{Token: "the-shared-org-wide-pat"})

	code, resp := postClaim(t, h, `{"team":"bronze","role":"builder"}`)
	if code != http.StatusOK {
		t.Fatalf("claim returned %d, want 200", code)
	}
	if resp.ForgeToken != "" || resp.ForgeTokenPerRun {
		t.Errorf("claim carried forge token %q (per-run %v); the shared token must stay in the worker's environment", resp.ForgeToken, resp.ForgeTokenPerRun)
	}
}

func TestClaim_ReturnsAMintedForgeToken(t *testing.T) {
	reset(t)
	targetedWriterShift(t, "991")
	h := forgeClaimServer(mintingBroker{})

	code, resp := postClaim(t, h, `{"team":"bronze","role":"builder"}`)
	if code != http.StatusOK {
		t.Fatalf("claim returned %d, want 200", code)
	}
	if resp.ForgeToken != "minted-for-this-run" || !resp.ForgeTokenPerRun {
		t.Errorf("claim carried forge token %q (per-run %v), want the minted per-run token", resp.ForgeToken, resp.ForgeTokenPerRun)
	}
}
