# AGENTS.md — webgrip/ploeg

Ploeg is the dark factory's dispatch plane: a Vikunja assignment webhook becomes a leased,
audited, budgeted agent run that ends in a Forgejo PR. Go plus a Helm chart.

**Trunk is `development`**; `main` is a release-promotion stub. When automation opens your PR
against `main`, a human retargets it at review. Commits use conventional types (`fix:`/`feat:`
cut an rc release, `docs:`/`chore:`/`test:` don't) and carry a `VIK-<taskID>` trailer for board
tickets.

## Where to look

| Working on | Read first |
| --- | --- |
| Anything non-trivial | [docs/architecture.md](docs/architecture.md) — current-state reality; §9 lists where the code diverges from design intent |
| Per-run LLM keys, budgets, spend | architecture.md §5 — the alias format and revocation rules are joined by Grafana in `webgrip/homelab-cluster` |
| Claims, leases, retries, the sweeper | architecture.md §4 + `pkg/store` |
| Scaling, worker pods, KEDA | architecture.md §3 + `ops/helm/ploeg` |
| Harness / executor / run-API seams | [docs/contracts/](docs/contracts/) — schemas and Go types change together |
| Why the design is shaped this way | [docs/design.md](docs/design.md); §8 records evaluated-and-rejected alternatives, [docs/research/](docs/research/) holds the evidence behind them |
| What to build next | [docs/backlog.md](docs/backlog.md) |
| CI runners, signing, Forgejo/OpenBao traps | [docs/ops/ci-and-infra.md](docs/ops/ci-and-infra.md) |
| Tracker IDs, board gotchas, dispatch topology | [docs/ops/board.md](docs/ops/board.md) |
| Delivery discipline for a factory run | the `team-silver` skill in `.openhands/skills/` |

Orientation the file tree won't give you: `cmd/*` is thin env→config wiring (run logic is in
`pkg/worker`), and `pkg/store/migrations/` is append-only — change schema by adding the next
migration.

## Before opening a PR

Run the gates from [.forgejo/workflows/on_pull_request.yml](.forgejo/workflows/on_pull_request.yml)
— Go build/vet/test plus `helm lint` and all three chart renderings — and put their output in the
PR body. Without a local toolchain, run them through the DinD daemon with the `golang` and
`alpine/helm` images. Tests fake external services with `net/http/httptest` and never need
network; a bug fix lands with the regression test that fails against the old code.

## Durable knowledge lives in this repo

Findings that outlive a session — evaluations, verdicts, root causes, measured timings — go into
version control, not an assistant's private memory: evidence trail in
`docs/research/YYYY-MM-DD-<topic>.md`, condensed verdict and re-evaluation triggers in design.md
§8, anything actionable as a backlog item tagged `*[research]*`.
