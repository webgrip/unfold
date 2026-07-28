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

## 8. Alternatives considered (2026-07 market survey)

| Option | Why not |
|---|---|
| misospace/dispatch | Closest semantics (leases, lanes, audit); GitHub-only, polling model, 2★ single-maintainer |
| kandev | Best-maintained board-orchestrator; GitHub/Jira/Linear/GitLab only, no k8s runtime, no teams/leases/audit, interactive-workspace center of gravity |
| vibe-kanban | Company shut down 2026; community-maintained; workstation scale |
| untra/operator | Ticket-first concept match; alpha TUI, local tmux, 33★ |
| kagent / kars / agent-sandbox | Runtime & policy layers, not dispatch semantics; agent-sandbox is a planned runtime *under* Ploeg |
| Argo Workflows as substrate | Strong exit-handler/DAG story; a second orchestration system to operate; revisit if team DAGs outgrow "sequential specialists on one branch" |
| Forge-native (GitLab Duo, GitHub) | Serves the mainstream; structurally cannot serve self-hosted/mixed stacks — which is Ploeg's niche |
| Microsoft AHP (agent-host-protocol, surveyed 2026-07-27) | Different layer entirely: multi-client *session-sync* above the harness ("AHP is a mutex over ACP" — their docs), no dispatch/lease/outcome semantics; draft v0.6 with breaking changes every 1–2 weeks, single-vendor (VS Code team), sole server impl is VS Code's agent host. Could someday compose *above* Ploeg as a live run surface (backlog 101); ACP remains the harness seam (§5) |
| OmniRoute (diegosouzapw/OmniRoute, surveyed 2026-07-28) | Competitor for the *LiteLLM seam*, not a dispatch concern — and it loses that contest: no per-key budget/TTL/alias mint-revoke admin API (Ploeg's entire LLM coupling, `pkg/litellm`), local-first single-box Node/SQLite with no k8s story (its own comparison doc concedes "choose LiteLLM for k8s/Helm"), no multi-tenancy. Trust posture wrong for a credential-holding boundary in an autonomous factory: default JWT secret, plaintext keys unless opted in, fail-open guardrails, May-2026 Socket.dev npm block, and its core economics are ToS-gray free-tier farming via TLS-fingerprint (JA3/JA4) impersonation — arbitraged-and-deniable spend vs our metered-and-attributable `ploeg-<12hex>` audit chain. Solo author (~62% of commits), 5.5-month rewritten history, zero named production users. Orthogonal to Vikunja/KEDA/dispatch; its MCP/A2A endpoints serve its own tooling, not the harness seam. Fine as a *personal-workstation* router for interactive coding agents, kept away from factory credentials. Re-evaluate only if: 4.0 modular platform ships headless + k8s story; admin API reaches LiteLLM `/key/generate` parity (budget+TTL+alias); OpenHands merges provider support (two attempts closed unmerged, 2026-07); or governance matures past single-maintainer with a stable 3.9 LTS |

## 9. Decisions

- **Name:** Ploeg (Dutch: work crew/shift). GitHub user `ploeg` exists (blocks a future bare
  org, not `webgrip/ploeg`); npm free; no product collision in the niche.
- **License:** Apache-2.0 (adoption-maximizing; patent grant for platform teams).
- **Language:** Go (k8s contributor pool, controller-runtime path for v2, static binary).
- **Home:** Forgejo-leading (`webgrip/ploeg`) with GitHub push-mirror; module path uses the
  GitHub mirror so `go get` works for outsiders.

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
