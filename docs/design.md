# Ploeg — design (RFC, v0)

Status: draft · 2026-07-21 · extracted from the webgrip homelab dark-factory requirements.

## 1. Problem

Autonomous coding agents need a layer between the ticket board and execution. Every existing
product couples that layer to its own board, to GitHub, or to a developer workstation. Operators
of self-hosted stacks (any-tracker + any-forge + Kubernetes) have nothing maintained to adopt.

Requirements this design serves, in priority order:

1. **Event-driven dispatch** — agents run when work is assigned, never on polling loops.
2. **Ephemeral execution** — runs are Kubernetes Jobs; no long-lived agent processes.
3. **Crash-safe claims** — leases with TTL, renewed by the running Job; expiry releases work.
4. **Teams, not single claimants** — a claim is held by a team of specialist roles.
5. **Complete audit** — every mutation, lease, run, outcome is a queryable row.
6. **BYO board and forge** — a small provider SPI; the core never assumes a vendor.
7. **Open source, self-hostable, no SaaS in the ops path.**

## 2. Non-goals

- A kanban/board UI (the tracker and its UIs remain authoritative).
- Persistent conversational/ops agents (kagent's territory).
- Model serving, routing, or cost ledgering (LiteLLM et al. own this).
- Refinement/grooming *semantics* — Ploeg can schedule a groomer run, but the prompt/DoR
  conventions belong to the operator.
- A connector matrix maintained by the core team. The SPI is the product; providers beyond the
  two references are community-owned.

## 3. Core semantics

### Work item lifecycle

```
ingested → queued → leased → (checkpointed …) → outcome ∈ {pr_opened, pr_updated, issue_updated,
                                                 follow_up_created, stuck, failed, no_change_needed}
```

- A **WorkItem** mirrors a tracker item (provider + external id + revision), never replaces it.
- **Assignment** (tracker webhook) transitions ingested→queued for a named team.
- A **Lease** is `(team, work_item, expires_at)`, unique per work item. Renewed by the running
  Job on a fixed interval. Expiry or Job failure releases the lease, records the reason, and
  re-queues or flags the item (`stale`) per policy.
- A **Checkpoint** is a small progress record (`phase`, `branch`, `pr_url`) written via the
  report API. Resume = respawn with the last checkpoint injected; everything else is re-derived
  from git/forge state, which stays the durable medium.
- An **Outcome** ends the run. `stuck` carries a mandatory reason and routes to a human queue.

### Teams

A **Team** is a declarative manifest (name, specialist roles, harness image + model per role,
run strategy sequential|parallel, resource/token budget). Claims are team-scoped; role
coordination happens inside the spawned Job(s) on a shared branch. Two teams never hold the
same work item; any number of specialists work within a team's lease.

### PR follow-up ingestion

Forge webhooks (review submitted, check failed, merge-state dirty) create follow-up work items
**routed to the team owning the source branch**. Follow-ups never gate other teams' new work.
Feedback classified as vague/security-sensitive becomes a `needs_human` item instead of a spawn.

## 4. Provider SPI

Two narrow interfaces; everything vendor-specific lives behind them.

- **TrackerProvider** — verify+parse webhook → normalized events (assigned, updated,
  unassigned); read item; write back (comment, label/status, complete). Reference: Vikunja.
- **ForgeProvider** — verify+parse webhook → normalized events (review, check, merge-state);
  read PR/branch state; write back (comment). Reference: Forgejo.

SPI stability is the compatibility promise. Providers are Go plugins in-tree initially
(compile-time registry); out-of-process providers are a later graduation if demand exists.

### Provider-neutrality rule

Core semantics may not encode any provider's workaround. (Example from the originating stack: a
pick-up queue stored as HTML in a Vikunja project description — that is a Vikunja-provider
detail; the core semantic is "an ordered claimable queue per team".)

## 5. Harness contract

An agent container is invoked with a **TaskSpec** (work item snapshot, team role, checkpoint,
repo/forge endpoints, scoped credentials) and must write an **OutcomeReport** (outcome enum,
summary, links, checkpoint) before exit. Adapters wrap concrete harnesses (Claude Code,
opencode, …) behind this contract. Candidate standard to track instead of inventing more:
Agent Client Protocol (ACP). Exit-without-report is a `failed` outcome recorded by the watcher.

*Implemented 2026-07-28:* the seam lives in `pkg/harness` (`Adapter` for session
protocols like ACP; `CommandAdapter` for spawn-and-wait harnesses), with
`openhands`/`exec`/`claude-code` adapters selected per team. Schemas published
in [contracts/](contracts/) (backlog #59).

*Standard adopted 2026-07-29:* ACP is no longer a candidate to track — the `acp`
adapter ships (backlog #64), reaching Claude, Copilot, Codex, Cursor, Gemini,
Goose, Cline, Qwen and opencode through one implementation. Wire version 1 is
pinned; v2 is draft and self-declares that the protocol will change. Switching a
team to a different agent becomes a Helm values edit rather than new Go.
Recorded in `homelab-cluster` ADR-0051, which supersedes ADR-0047's rejection of
opencode on grounds — a self-updating beta — that stopped being true at v1.0.0.

Zed's Agent **Client** Protocol, that is. Not IBM's Agent **Communication**
Protocol, which merged into A2A in 2025 and is archived
([ADR-0007](adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md)).

## 6. Execution

- **Default executor: KEDA** `ScaledJob` per team, Postgres scaler on the queued-items query.
  Chosen because it is boring, proven, and already CNCF-maintained. KEDA is an implementation
  detail, not identity: the Executor interface is `(spawn, watch, cancel)` and pluggable.
  *Implemented 2026-07-28 at the honest layer:* the executor SPI is the run API, formalized in
  [contracts/executor.md](contracts/executor.md) (+ `GET /api/v1/queue/depth`); the chart gates
  on `executor.type` (`keda` | `cronjob`, sharing one pod-template helper). A Go interface waits
  for a controller-based executor (backlog #55/#58) — an interface with no caller is how the
  first harness contract died.
- Job failure/succeed events feed the lease manager and audit log (a controller watch, not
  agent goodwill).
- **Security posture is first-class:** runtime class option for gVisor/Kata
  (kubernetes-sigs/agent-sandbox is the tracked path), default-deny egress with explicit
  allowlists, per-team scoped forge tokens, no cluster-wide RBAC.
- CRD/operator (`AgentTask`) is an explicit **v2 graduation**, justified only when teams/tasks
  need to be Flux-reconciled API objects. The DB stays the source of truth either way.

## 7. Storage & observability

Postgres (CNPG-friendly): `work_items`, `leases`, `checkpoints`, `agent_runs`, `audit_log`,
`teams` (mirror of applied manifests). All mutations to tracker/forge go through providers and
are audited with actor, before/after, success. Grafana dashboards ship as code (stale leases,
outcomes by team, stuck queue, run durations). Trace/cost correlation via optional fields
(trace id, ledger key) — Ploeg links, it does not collect.

## 8. Alternatives considered

Migrated to [docs/adrs/](adrs/) on 2026-07-29 (ADR 0001). This section was the
decision ledger; it is now an index into one. Each record carries the verdict,
its drivers, the options weighed, a Confirmation naming how compliance is
checked, and — where the verdict can change — a dated `review-by` with named
re-evaluation triggers.

| Decision | Record |
|---|---|
| Build a dedicated dispatch plane rather than adopt an existing orchestrator (misospace/dispatch, kandev, vibe-kanban, untra/operator, kagent/agent-sandbox, Argo Workflows, forge-native) | [0005](adrs/0005-build-a-dedicated-dispatch-plane.md) |
| Microsoft AHP — wrong layer; parked as a live-run surface above Ploeg | [0006](adrs/0006-ahp-is-the-wrong-layer.md) |
| A2A — adopt nothing now; watchlist a north-facing dispatch facade | [0007](adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md) |
| OmniRoute — LiteLLM stays the per-run credential and metering seam | [0008](adrs/0008-litellm-is-the-credential-and-metering-seam.md) |
| Paperclip — mine it for design, never depend on it | [0009](adrs/0009-paperclip-mine-for-design-never-integrate.md) |

Evidence trails stay in [research/](research/) and are linked from each record.

## 9. Foundation decisions

Also migrated to [docs/adrs/](adrs/) on 2026-07-29.

| Decision | Record |
|---|---|
| Go is the implementation language | [0002](adrs/0002-go-as-the-implementation-language.md) |
| Apache-2.0 | [0003](adrs/0003-apache-2-0-license.md) |
| Forgejo-leading home, GitHub push-mirror, module path from the mirror (and the name) | [0004](adrs/0004-forgejo-leading-home-github-mirror-module-path.md) |
| ADRs are the single decision ledger | [0001](adrs/0001-adrs-are-the-decision-ledger.md) |

## 10. Honest risks & review gate

- **Audience size:** self-hosted-stack platform operators — real but narrow; forge vendors own
  the mainstream.
- **Bus factor:** starts as a 0★ single-maintainer project — the exact profile the market
  survey rejected. Mitigation: built because the maintainer needs it; designed so abandonment
  costs adopters little (state in Postgres, thin glue, portable conventions).
- **Harness churn:** the harness boundary moves monthly; adapters isolate it, ACP may
  standardize it.
- **Review gate (~9 months, ≈2027-04):** external users or contributors exist → invest in
  product-ness (versioned SPI, docs, provider certification). None → Ploeg remains personal
  infrastructure, and says so in the README. Quarterly market re-scan stays on the operator's
  board either way.
