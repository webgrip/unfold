# Ploeg

**Assign a ticket on your own board and Ploeg spins up an ephemeral team of AI agents on your Kubernetes cluster that works it, opens a pull request, reports the outcome, and disappears — every run leased, audited, and crash-safe, with no lock-in on tracker, forge, or agent harness.**

An open-source, self-hostable dispatch plane. Bring your own board, forge, and agent harness.

*Ploeg* is Dutch for a work crew or shift. Teams of specialist agents pick up a ticket, work it, report an outcome, and disappear.

> **Status: pre-alpha.** Ploeg is being extracted from a running autonomous-agent setup (a "dark factory": agents working a ticket board unattended on a homelab Kubernetes cluster). The dispatch core and both executors (KEDA `ScaledJob` and a KEDA-free CronJob) ship in the chart — opt-in via `executor.enabled` — and dispatch the originating factory today; a local prototype runs the same core over Docker Compose (see below). Provider write-backs, a Forgejo forge provider, and team manifests are still to come. Watch, don't install.

## What Ploeg is

- **A dispatch plane, not a board.** Your tracker (Vikunja, Jira, GitHub Issues, …) stays the source of truth for *what* to do. Ploeg owns *how work gets executed*: assignment events in, ephemeral agent runs out.
- **Event-driven, never polling.** Assigning a ticket fires a webhook; Ploeg spawns a Kubernetes Job for it. No heartbeat crons burning tokens to discover there is no work.
- **Ephemeral by design.** Every run is a Job that starts, produces a structured outcome, and dies. Durable state lives in Postgres (work items, leases, checkpoints, outcomes, audit) and in git (branches, PRs) — never in a long-lived agent process.
- **Leased, not labeled.** Claims are rows with a TTL renewed by the running Job. A crashed pod releases its ticket mechanically; nothing depends on an agent behaving well at death.
- **Teams of specialists.** A work item is claimed by a *team* — a declarative manifest of specialist roles (implementer, reviewer on a different model family, tester) — not by a single agent identity.
- **Audited end to end.** Every mutation, lease, run, and outcome is a Postgres row. Grafana dashboards ship as code.

## What Ploeg is not

- Not another kanban UI. The market has plenty; Ploeg has none.
- Not a persistent-agent platform (see [kagent](https://kagent.dev/)) or model serving.
- Not a promise of every integration. Ploeg ships a small, stable **provider SPI** and two reference providers (Vikunja tracker, Forgejo forge). Further providers are community-owned.

## Architecture (v0 sketch)

```
tracker webhook ─┐                        ┌─> KEDA ScaledJob (per team) ─> agent Job (ephemeral)
forge webhook  ──┼─> ploegd ─> Postgres ──┤        │ lease renewal · checkpoints
                 │   (ingest,  (work items,        └─> outcome report ─> ploegd ─> tracker/forge writeback
                 │    SPI)      leases, runs,
                 └─────────────  audit)  ──────> Grafana (dashboards as code)
```

- **`ploegd`** — single Go binary: webhook ingest, provider SPI, lease manager, outcome ingestion.
- **Executor** — KEDA `ScaledJob` with the Postgres scaler is the flagship default; executors are pluggable behind the run-API contract ([docs/contracts/executor.md](docs/contracts/executor.md)) — a KEDA-free CronJob executor ships in the same chart (`executor.type`).
- **Harness contract** — an agent container receives a `TaskSpec`, must emit an `OutcomeReport` ([schemas](docs/contracts/)). Harness adapters live behind `pkg/harness.Adapter`: `openhands` (default), `exec` (any binary), `claude-code` — selected per team, along with the agent image, via the team's `harness` block.

## Try the prototype

```sh
docker compose -f ops/local/docker-compose.yml up -d --build
ops/local/demo.sh
```

The demo plays both tracker and agent: a signed Vikunja webhook queues a work item, a claim
leases it (`FOR UPDATE SKIP LOCKED` + TTL lease), checkpoint and outcome complete it, and the
audit trail records every step as a Postgres row. Crash-safety is real: claim an item, report
nothing, and the sweeper releases the lease and re-queues the item when the TTL expires.

## Roadmap

1. **Extraction** — core service, Vikunja + Forgejo providers, one harness adapter, audit + dashboards. Exit criterion: the originating dark factory runs on Ploeg in production.
2. **Teams & follow-ups** — team manifests, checkpoint/resume, PR-feedback ingestion routed to the owning team, a dry-run grooming worker.
3. **On demonstrated pull** — GitHub provider, CRD/operator graduation, [agent-sandbox](https://agent-sandbox.sigs.k8s.io/) runtimes, further providers by contribution.

## License

Code: [Apache-2.0](LICENSE).

The name *Ploeg* and the Ploeg mark are trademarks — §6 of that licence grants
no rights in them, deliberately. [docs/brand/TRADEMARK.md](docs/brand/TRADEMARK.md)
says what you may do with them without asking (reproduce them, link, say your
software works with Ploeg) and the two things that need permission (shipping a
fork under the name, implying endorsement). Settled in
[ADR-0022](docs/adrs/0022-the-name-and-mark-are-trademarks-not-cc-licensed-artwork.md).
