# Ploeg

**Assign a ticket on your own board and Ploeg spins up an ephemeral team of AI agents on your Kubernetes cluster that works it, opens a pull request, reports the outcome, and disappears — every run leased, audited, and crash-safe, with no lock-in on tracker, forge, or agent harness.**

An open-source, self-hostable dispatch plane. Bring your own board, forge, and agent harness.

*Ploeg* is Dutch for a work crew or shift. Teams of specialist agents pick up a ticket, work it, report an outcome, and disappear.

> **Status: pre-alpha.** Ploeg is being extracted from a running autonomous-agent setup (a "dark factory": agents working a ticket board unattended on a homelab Kubernetes cluster). Nothing here is usable yet. The design doc is real; the code is a skeleton. Watch, don't install.

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
- **Executor** — KEDA `ScaledJob` with the Postgres scaler is the flagship default; executors are pluggable.
- **Harness contract** — an agent container receives a `TaskSpec`, must emit an `OutcomeReport`. Harness adapters (Claude Code, opencode, …) live behind one interface.

## Roadmap

1. **Extraction** — core service, Vikunja + Forgejo providers, one harness adapter, audit + dashboards. Exit criterion: the originating dark factory runs on Ploeg in production.
2. **Teams & follow-ups** — team manifests, checkpoint/resume, PR-feedback ingestion routed to the owning team, a dry-run grooming worker.
3. **On demonstrated pull** — GitHub provider, CRD/operator graduation, [agent-sandbox](https://agent-sandbox.sigs.k8s.io/) runtimes, further providers by contribution.

## License

[Apache-2.0](LICENSE)
