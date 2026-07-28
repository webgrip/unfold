# AGENTS.md — webgrip/ploeg

Ploeg is the dark factory's dispatch plane: Vikunja assignment webhooks become leased, audited
agent runs (ADR-0048 successor). Go 1.25 + a Helm chart. Agents working this repo follow the
rules below; the `team-silver` repo skill adds the delivery discipline.

## Branches — this repo's trunk is `development`, NOT main

- **All work branches from `development`** (`agent/vik-<id>` for factory runs). `main` is the
  release-promotion stub — never commit to it, never branch from it, never base work on it.
- Automation may open your PR against `main`; a human retargets it to `development` at review.
  Do not fight or "fix" that yourself.
- semantic-release runs on every `development` push: `fix:`/`feat:` commits cut a new
  `vX.Y.Z-rc.N` (chart + ploegd image in lockstep). Use `fix:` for bug fixes so the release
  train ships them; `docs:`/`chore:`/`test:` do not release.
- Conventional commits; every commit for a board ticket carries a `VIK-<taskID>` trailer.

## Quality gates (all must pass before opening or updating a PR)

```sh
test -z "$(gofmt -l .)"      # formatting — gofmt -l must print nothing
go vet ./...
go build ./...
go test ./...
helm lint ops/helm/ploeg
helm template ploeg ops/helm/ploeg > /dev/null
helm template ploeg ops/helm/ploeg -f ops/helm/ploeg/ci/executor-values.yaml > /dev/null
```

No local toolchain? Run them via the DinD daemon: `docker run --rm -v "$PWD":/src -w /src
golang:1.25 sh -c '...'` and `docker run --rm -v "$PWD":/src -w /src alpine/helm:latest ...`.
Paste gate output in the PR body.

## Repo map

- `cmd/ploegd/` — dispatch daemon (webhook ingest, outcome API, sweeper)
- `cmd/ploeg-worker/` — the KEDA-spawned run harness (clone → agent run → PR → outcome report)
- `pkg/store/` — Postgres store: `work_items` / `leases` / `agent_runs` / `checkpoints` (+ audit)
- `pkg/provider/vikunja/` — tracker provider (HMAC webhook, assignee→team routing)
- `pkg/httpapi/` — HTTP surface
- `ops/helm/ploeg/` — the chart (per-team ScaledJobs under `executor.teams`)
- `pkg/store/migrations/` — SQL migrations (append-only; never rewrite an applied migration)

## Load-bearing invariants (dashboards/alerts in webgrip/homelab-cluster depend on these)

- The per-run LiteLLM key alias format is **`ploeg-` + first 12 hex of the run trace/token** —
  Grafana joins spend↔run↔ticket on `key_alias`. Never change the format.
- Any code touching per-run LiteLLM keys must guarantee **revocation on every return path**
  (a leaked key is RFC HAZ-02; there is a firing alert for it). The 4h key TTL is a backstop,
  not the mechanism.
- The KEDA scaler polls `SELECT COUNT(*) FROM work_items WHERE team=$1 AND state='queued'`
  served by the `work_items_claimable` partial index — keep that query shape cheap.
- One live lease per work item (`leases.work_item_id` is the PK); claims use
  `FOR UPDATE SKIP LOCKED`. Don't weaken either.

## Tests

Table-driven Go tests next to the code; fake external services with `net/http/httptest`
(LiteLLM admin API, Forgejo API) — no network in tests. A bug fix lands with a regression
test that fails on the old code.
