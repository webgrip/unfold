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
| Why the design is shaped this way | [docs/design.md](docs/design.md) for intent; [docs/adrs/](docs/adrs/) for the decisions themselves — in-force = accepted and not superseded, per the Records index. [docs/research/](docs/research/) holds the evidence behind them |
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
version control, not an assistant's private memory. Three homes, one rule each:

- **Evidence** → `docs/research/YYYY-MM-DD-<topic>.md`. The full working: what was surveyed, what
  was measured, what could not be verified. Never summarised away.
- **Verdict** → an ADR in [docs/adrs/](docs/adrs/), which is **the** decision ledger (ADR 0001).
  MADR 4.0 with two local rules: supersession is append-only (never flip an accepted record's
  status — write a new record carrying `supersedes: NNNN`), and a decision that can change carries
  `review-by:` plus named re-evaluation triggers. Every record needs a `### Confirmation` section.
  Both rules are gated by `go test ./internal/ledger/`; the `adr-writer` skill's bundled validator
  assumes status-flip supersession and must **not** be run here.
- **Action** → a numbered item in [docs/backlog.md](docs/backlog.md), tagged `*[research]*`.

`design.md` §8/§9 are now indexes into `docs/adrs/`, not a second ledger. If you find yourself
recording a verdict anywhere else, that is the bug.

## How changes are proposed

Non-trivial changes run through OpenSpec (schema `spec-driven-with-adr`, see
[openspec/config.yaml](openspec/config.yaml)): proposal → specs → design → **adr** → tasks. The
`adr` step gates `tasks`, so a change making a durable architectural commitment cannot reach
implementation without recording it. `openspec instructions <artifact> --change <name>` prints what
a model actually receives — use it to check any edit to the schema, the config, or a template.

Tooling is pinned in [mise.toml](mise.toml) (`mise install` puts `openspec` on PATH). The generated
skills and slash commands are deliberately **not** committed: run `openspec update` locally for
whichever tools you use.

`.openhands/` and `.opencode/` in this repo are **dogfooding, not product spec**. Ploeg's harness
support is defined by `pkg/harness` and the published contracts in `docs/contracts/` — never by
whichever agent config happens to sit in this tree.
