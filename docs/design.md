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
| A2A / Agent2Agent (a2aproject, Linux Foundation, surveyed 2026-07-28) | Not immature — spec v1.0.0 (2026-03-12), LF TSC with 8 org seats (Google/Microsoft/AWS/Cisco/Salesforce/ServiceNow/SAP/IBM; IBM's competing "ACP" merged into A2A 2025-08-29), official Go SDK GA (`a2a-go/v2`), shipped in all three hyperscaler agent platforms — but it claims the *cross-org agent↔agent peer* seam, a layer Ploeg doesn't have. Wrong shape for every implemented seam: harness (drives opaque remote services, not local sessions; OpenHands closed A2A as not_planned mid-2026 and shipped Zed-style ACP instead — direct validation of backlog #64), executor (point-to-point RPC; A2A's own top-reacted issue a2aproject/A2A#1029 begs for the queue semantics our Postgres lease queue already has), LLM broker (orthogonal, though LiteLLM ships a full A2A Agent Gateway — a latent zero-code on/off-ramp already in the deployment). Community consensus by mid-2026: A2A pays only across organizational trust boundaries; inside one stack it's chat-shaped overhead. The one honest fit — a north-facing facade exposing ploegd as a remote agent (task lifecycle maps ~1:1: queued→SUBMITTED, leased→WORKING, needs_human→INPUT_REQUIRED, done→COMPLETED; PR link as Artifact) — is watchlisted as backlog #102 with prerequisites (#31 tracker write-backs, so the board stays authoritative) and flip triggers (kagent — A2A-native — deployed in homelab-cluster; OpenHands reversal OpenHands/software-agent-sdk#1060; A2A pub/sub transport #1029; the 2027-04 review gate demanding a product-grade dispatch API). Full dossier: [research/2026-07-28-a2a-fit.md](research/2026-07-28-a2a-fit.md) |
| OmniRoute (diegosouzapw/OmniRoute, surveyed 2026-07-28) | Competitor for the *LiteLLM seam*, not a dispatch concern — and it loses that contest: no per-key budget/TTL/alias mint-revoke admin API (Ploeg's entire LLM coupling, `pkg/litellm`), local-first single-box Node/SQLite with no k8s story (its own comparison doc concedes "choose LiteLLM for k8s/Helm"), no multi-tenancy. Trust posture wrong for a credential-holding boundary in an autonomous factory: default JWT secret, plaintext keys unless opted in, fail-open guardrails, May-2026 Socket.dev npm block, and its core economics are ToS-gray free-tier farming via TLS-fingerprint (JA3/JA4) impersonation — arbitraged-and-deniable spend vs our metered-and-attributable `ploeg-<12hex>` audit chain. Solo author (~62% of commits), 5.5-month rewritten history, zero named production users. Orthogonal to Vikunja/KEDA/dispatch; its MCP/A2A endpoints serve its own tooling, not the harness seam. Fine as a *personal-workstation* router for interactive coding agents, kept away from factory credentials. Re-evaluate only if: 4.0 modular platform ships headless + k8s story; admin API reaches LiteLLM `/key/generate` parity (budget+TTL+alias); OpenHands merges provider support (two attempts closed unmerged, 2026-07); or governance matures past single-maintainer with a stable 3.9 LTS |
| Paperclip (paperclipai/paperclip, surveyed 2026-07-28) | The board-first maximalist: an MIT ~1M-LOC TS control plane that *is* the tracker — tasks, org chart, budgets, approvals, skills, secrets, routines, full UI — with agents attached via per-agent scheduled heartbeats. 74,962★ five months after first commit, weekly CalVer releases, company-backed, cloud tier emerging. Wrong shape for us on all three axes: it owns dispatch itself (heartbeat scheduler + `checkoutRunId` row-locks — the polling model requirement 1 rejects, softened by typed wakes), it has no tracker seam to plug into (BYO-ticket-system is an unshipped roadmap item; zero Vikunja/Forgejo/Gitea/KEDA/LiteLLM contact in its tree — our niche is unserved by it), and fronting a 5k-LOC Go dispatcher with a 1M-LOC Node server on a weekly breaking-release train inverts the thin-glue rationale. **The uncomfortable mirror:** Paperclip has *shipped* most of our phase-2/3 list — approval gates, agent↔human interactions, watchdogs with bounded recovery, per-scope budgets enforced pre-dispatch *and* pre-invocation, a skills system, a secrets manager with audited run-bound access, sandbox providers including a production `agents.x-k8s.io` Sandbox CR builder — while our `needs_human` state has nothing behind it, checkpoints are written-never-read, the ForgeProvider this doc promises has no implementation, and the state-machine table isn't enforced. Five months of company-scale velocity beat four years of anyone's spare time; if the mainstream verdict is "the board and the control plane should be one product", our audience shrinks to operators who refuse that bundle. **Where we hold value they structurally don't:** event-driven scale-to-zero dispatch (no heartbeat crons burning tokens to discover no work), tracker/forge neutrality for self-hosted stacks, DB-lease crash-safety independent of agent goodwill, and proxy-metered per-run credentials with active revocation — their spend ledger is parsed from adapter stdout, so a compromised or lying agent skews the books; ours is metered at a LiteLLM boundary the agent cannot bypass, joined to ticket and commit by `ploeg-<12hex>`. Its `execution-semantics.md` is the best free design review this backlog has received — routable blocking, pre-dispatch config gates, fingerprint-bounded recovery, checkout-finalization CAS rules — folded into backlog #9/#10/#15/#16/#21/#44/#58/#60/#64/#86 *[research: paperclip sweep]*. Re-evaluate if: BYO-ticket-system ships with outbound assignment events (candidate human surface *above* Ploeg, before building De Vloer equivalents); its Work Queues milestone ships claimable-queue semantics (direct layer collision); acpx reaches a stable 1.0 as a standalone ACP engine (build #64 against it); or agents.x-k8s.io graduates past alpha (accelerate #58) |

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
