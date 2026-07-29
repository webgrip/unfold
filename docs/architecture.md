# Dark factory — current-state architecture

> **What this is.** How the dark factory *actually* functions as deployed on
> 2026-07-27 (`development`). [design.md](design.md) records intent; this file
> records reality, and [§9](#9-where-the-code-diverges-from-designmd) lists every
> known gap between the two. When you change the system, change this file.

The dark factory turns a **Vikunja ticket assignment into a reviewed Forgejo PR**
with no human in the execution loop. Ploeg (this repo) is the dispatch plane:
it owns ingest, queueing, leasing, budgets, and outcome bookkeeping. The LLM
work happens in ephemeral Kubernetes jobs running the `agent-runner` image
(built in `webgrip/infrastructure`), deployed and sized by
`webgrip/homelab-cluster`.

## 1. System context

```mermaid
flowchart LR
    subgraph tracker["Vikunja (tracker)"]
        T[Ticket VIK-n<br/>assigned to team user]
    end
    subgraph ploegd["ploegd (deployment, 1 replica)"]
        WH[Webhook ingest<br/>HMAC-SHA256]
        API[Run API<br/>claim / renew / checkpoint / outcome]
        SW[Sweeper<br/>every 15s]
    end
    DB[("Postgres (CNPG ploeg-db)<br/>work_items · leases · agent_runs<br/>checkpoints · audit_log")]
    KEDA[KEDA ScaledJob<br/>per team, poll 30s]
    subgraph pod["Worker job pod (0→1 per team)"]
        W[ploeg-worker]
        OH[OpenHands CLI<br/>headless]
        DIND[DinD sidecar]
    end
    LLM[LiteLLM proxy<br/>mint / meter / revoke]
    FG[Forgejo<br/>clone · push · PR]

    T -- "task.assignee.created" --> WH
    WH -- "state=queued" --> DB
    KEDA -- "COUNT queued > 0 → spawn job" --> pod
    KEDA -.-> DB
    W <--> API
    API <--> DB
    SW --> DB
    W -- "mint per-run key" --> LLM
    W -- "spawns" --> OH
    OH -- "completions (budgeted key)" --> LLM
    OH -- "sandbox + quality gates" --> DIND
    W -- "clone" --> FG
    OH -- "push branch, open PR" --> FG
    FG -. "review rounds appended to ticket,<br/>re-assign → next round" .-> T
```

The loop closes outside this repo: a reviewer (human or the Agora review loop)
reads the PR, appends a review round to the ticket body, and re-assigns the
team user — which re-queues the item ([VIK-588 semantics](#4-work-item-state-machine))
and sends the agent back to the same branch for the next round.

## 2. One run, end to end

```mermaid
sequenceDiagram
    autonumber
    participant V as Vikunja
    participant P as ploegd
    participant DB as Postgres
    participant K as KEDA
    participant W as ploeg-worker
    participant L as LiteLLM
    participant O as OpenHands
    participant F as Forgejo

    V->>P: POST /webhooks/tracker/vikunja (HMAC)
    P->>DB: upsert work_item → queued (attempts reset if re-dispatch)
    K->>DB: SELECT COUNT(*) queued (30s poll)
    K->>W: spawn Job pod (worker-bin + dind init, then worker)
    W->>P: POST /api/v1/claim {team}
    P->>DB: queued→leased, attempts+1, lease(TTL 15m), agent_run row
    P-->>W: {runToken, deadline, workItem}
    loop every TTL/3 (floor 5s)
        W->>P: POST /runs/{token}/renew
    end
    W->>F: git clone --depth 50 --branch <base>
    W->>P: checkpoint branch_created
    W->>L: POST /key/generate (alias=ploeg-<token12>, budget, 4h TTL)
    W->>O: exec docker-entrypoint.sh --headless -f /tmp/task.md<br/>(LLM_API_KEY, LLM_TRACE_ID)
    O->>L: chat completions (metered per key)
    O->>F: push agent/vik-<id>, open PR via API
    W->>F: GET /pulls?state=open → find PR by head branch
    W->>P: checkpoint pr_opened + POST outcome pr_opened
    P->>DB: leased→done, audit outcome.pr_opened
    W->>L: POST /key/delete (deferred, every return path)
    Note over P,DB: Sweeper backstop: lease expires with no outcome →<br/>run failed, item re-queued (or stale at 3 attempts)
```

**Timing (measured 2026-07-27).** Pod creation → agent working was ~2m45s
before that day's fixes: dockerd was ready ~13s after the dind sidecar started
and was *never* the bottleneck — the cost was `openhands --version` in the
runner entrypoint cold-importing the CLI tree (2m20s at the then 500m CPU cap).
Since agent-runner **1.0.3** (banner baked at image build) and the worker CPU
bump to 1 full core, expect ~30–40s on a cold node, less on a warm one.

## 3. The worker job pod

One pod per run, one run per pod (`backoffLimit: 0` — Ploeg owns retries, so
every pod is one auditable attempt). Defined in
[ops/helm/ploeg/templates/scaledjob.yaml](../ops/helm/ploeg/templates/scaledjob.yaml).

| Container | Kind | Purpose |
|---|---|---|
| `worker-bin` | init | Distroless self-copy of `ploeg-worker` into a shared emptyDir (`ploeg-worker install`) — no shell exists to `cp` |
| `dind` | init, `restartPolicy: Always` (native sidecar) | Privileged Docker daemon; startup probe on :2376 gates the worker's start. Hosts the harness sandbox and the quality gates, which run in **CI's own images** so gates match CI exactly. Rendered only when the team's harness needs Docker (`harness.dind`, default true) |
| `worker` | main | `ploeg-worker` binary running inside the team's harness image (default: `agent-runner`): claim → clone → mint → harness adapter (`PLOEG_HARNESS`) → PR detect → report |

The pod template is one shared Helm helper (`ploeg.workerPodTemplate`) used
by both executors (`executor.type: keda | cronjob`); a team's `harness`
block swaps image, adapter, and dind without touching anything else.

Load-bearing pod facts:

- **Guaranteed QoS everywhere** (requests == limits on every container):
  burstable pods live in the cgroup tree the Talos OOMController sweeps under
  memory pressure — that killed runs 9 and 10 on 2026-07-25 (ADR-0049). Under
  scarcity, runs now queue as `Pending` (no lease, no attempt, no spend)
  instead of starting into a death zone.
- `ci-shared` emptyDir is mounted at the **same absolute path** in worker and
  dind so `docker run -v` bind mounts resolve on the daemon's filesystem.
- The pod has **zero Kubernetes API authority** (`automountServiceAccountToken:
  false`); the LLM-driven process can touch Docker-in-pod, Forgejo (as
  `agent-builder`), and its budgeted LiteLLM key — nothing else.
- KEDA specifics: `scalingStrategy: accurate` (KEDA #6416 over-scaling bug),
  `rollout: gradual` (spec updates never kill in-flight runs), scale query
  served index-only by the `work_items_claimable` partial index.

## 4. Work item state machine

States and transitions as implemented in `pkg/store` + `pkg/work`
(the SQL performs transitions directly; `work.CanTransition` exists but is not
enforced — see §9):

```mermaid
stateDiagram-v2
    [*] --> queued: assignment webhook (insert)
    queued --> leased: Claim (attempts+1)
    leased --> done: outcome pr_opened / no_change_needed
    leased --> needs_human: outcome stuck (reason required)
    leased --> queued: lease expired, attempts < 3<br/>(sweeper marks run failed)
    leased --> stale: lease expired or failed, attempts ≥ 3
    done --> queued: re-assignment (attempts reset) — review round n+1
    stale --> queued: re-assignment (attempts reset)
    needs_human --> queued: re-assignment (attempts reset)
```

- **Claim** is `FOR UPDATE SKIP LOCKED` on the oldest highest-priority queued
  item; a `leases` row (PK = work_item_id → max one live lease per item) and an
  `agent_runs` row are created in the same transaction.
- **Renewal** is worker-driven at TTL/3; a 404 on renew or three consecutive
  renew errors cancels the run in-flight (lease lost ⇒ someone else may claim).
- **The sweeper is the crash detector.** There is no job watcher: a worker that
  dies hard simply stops renewing, the lease row expires, and the 15s sweep
  marks the run `failed` and re-queues (or stales) the item.
- **Re-dispatch = assignment.** The only path back from `done`/`stale`/
  `needs_human` is a fresh `task.assignee.created` webhook (VIK-588); it also
  resets `attempts`. There is no operator requeue endpoint.
- Every mutation writes `audit_log` in the same transaction
  (`work_item.queued`, `lease.acquired`, `outcome.*`, `lease.expired`, …).

**Outcomes.** The worker only ever reports `pr_opened`, `no_change_needed`, or
`stuck`; `failed` is produced exclusively by the sweeper on lease expiry.
`stuck` → `needs_human` (no retry), `failed` → requeue (attempt-capped).

## 5. Money: the per-run LiteLLM key

Every run gets its own budgeted, TTL'd key whose **alias is the trace id** —
`ploeg-<first 12 hex of run token>`. That string is load-bearing: it is the
LiteLLM `key_alias`, the `LLM_TRACE_ID` env, and the `Agent-Trace-Id` commit
trailer, and Grafana joins spend ↔ run ↔ ticket on it. Do not change its shape.

```mermaid
flowchart TD
    M["worker mints key<br/>alias = ploeg-&lt;token12&gt; · max_budget · 4h TTL"] --> R1
    R1["Layer 1 — worker defer-revoke<br/>fires on every return path (VIK-585)"] --> R2
    R2["Layer 2 — ploegd sweeper revoke on lease expiry<br/>+ boot-time orphan sweep of ploeg-* aliases<br/>(VIK-594, merged 2026-07-28)"] --> R3
    R3["Layer 3 — 4h key TTL, final net"]
```

The worker owns mint + revoke; the runner entrypoint sees a caller-supplied
`LLM_API_KEY` and skips its own minting (its log line says so — that is
correct, not a bug). A SIGKILLed worker skips its defer — the gap VIK-594's
sweeper-side revoke (merged 2026-07-28, `cmd/ploegd/sweep.go`) now closes: a
hard-killed run's key survives only until its lease expires (≤15 min) and the
next 15 s sweep revokes it, instead of until the 4 h TTL. The alert
`slo-ploeg-run-key-leak` covers that remaining window.

## 6. The task contract

`worker.ComposePrompt` renders the prompt every adapter delivers in its own
native format (the `openhands` adapter writes it to `/tmp/task.md`; `exec`
also writes a `taskspec.json` per [contracts/](contracts/); `claude-code`
passes it inline): the ticket title + description verbatim,
then a delivery contract — work on branch `agent/vik-<id>` from the configured
base, never commit to base, run the quality gates via `docker run` against CI's
images before opening a PR, end every commit with `VIK-<id>` and
`Agent-Trace-Id:` trailers, open (never merge) a PR via the Forgejo API. Review
rounds appended to the ticket body ride along verbatim on re-dispatch, which is
how "continue on the same branch per review round N" reaches the agent.

The agent-runner image bakes the OpenHands CLI (pinned, never `@next`), a
docker CLI (daemon = the dind sidecar), node/moon/openspec tooling, and a core
skills loadout; per-ticket extras come from `OPENHANDS_SKILLS_PROFILE`. Two
startup taxes are patched out at image build: the CLI's forced public-skills
GitHub sync (no egress → 5 min of timeouts) and litellm's remote model-cost-map
fetch (VIK-590).

## 7. HTTP surface of ploegd

| Route | Purpose |
|---|---|
| `POST /webhooks/tracker/vikunja` | HMAC-verified ingest; only `task.assignee.created` does anything |
| `POST /api/v1/claim` | Lease next queued item for a team (204 = empty-handed, worker exits 0) |
| `POST /api/v1/runs/{token}/renew` | Extend lease (404 ⇒ worker aborts) |
| `POST /api/v1/runs/{token}/checkpoint` | Record `branch_created` / `pr_opened` |
| `POST /api/v1/runs/{token}/outcome` | Terminal report (full `OutcomeReport`: checkpoint + usage ride inline); `stuck` requires a reason |
| `GET /api/v1/queue/depth?team=` | Executor scale signal over HTTP (same predicate as the KEDA scaler query) |
| `GET /api/v1/queue/{team}` | Operator snapshot |
| `GET /healthz` · `GET /readyz` | Liveness / DB-ping readiness |

The 48-hex run token in the path is the **only** credential on the run API —
unguessable, but any holder can renew/checkpoint/report for that run.

## 8. Teams and deployment knobs

A team = a Helm values entry: name, model, per-run budget, target repo, base
branch, `maxReplicaCount` (currently 1), and optionally a `harness` block
(adapter name, agent image, entrypoint/args, dind) overriding the global
`executor.harness` defaults — the single axis of variation for swapping
harness and image per team. Assignee-username → team routing via
`PLOEG_TEAM_MAP` ("assign ticket to user `silver` = dispatch team silver");
unmapped assignees fall to `PLOEG_DEFAULT_TEAM`. Live sizing, image pins, and
team roster are set in `homelab-cluster`'s HelmRelease, which overrides this
chart's defaults — check there first when debugging what's actually running.

## 9. Where the code diverges from design.md

Known gaps between [design.md](design.md) / [domain/model.yaml](domain/model.yaml)
and the implementation (verified 2026-07-27). Aspirational ≠ implemented:

1. **PR follow-up ingestion** (design §3, R9): no forge webhook route, no
   `ForgeProvider` impl, `origin=follow_up` never produced. Review feedback
   re-enters via ticket re-assignment instead.
2. **Harness contract** (design §5): **closed 2026-07-28.** `pkg/harness`
   now carries the live seam: `TaskSpec`/`OutcomeReport` are the adapter I/O
   (published schemas in [contracts/](contracts/), backlog #59), and
   `harness.Adapter` wraps concrete harnesses — `openhands` (default),
   `exec` (generic binary), `claude-code` (#62), `acp` (#64) — selected per
   team via `PLOEG_HARNESS`. Outcome inference stays orchestrator-owned (the
   PR poll is ground truth) for the spawn-and-wait adapters; the `acp` adapter
   supplies structured stop reasons and defers to them.

   > **Naming hazard, and it catches everyone.** `acp` here is Zed's Agent
   > **Client** Protocol — editor ↔ local coding agent over stdio JSON-RPC,
   > wire version 1, co-maintained with JetBrains. It is **not** IBM's Agent
   > **Communication** Protocol, which merged into A2A in August 2025 and is
   > archived. Different layer, different transport, different problem; they
   > share three letters and nothing else. See
   > [ADR-0007](adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md).
3. **"Watcher records failed on exit-without-report"**: no watcher exists;
   the DB lease sweeper is the crash detector.
4. **Teams with roles/strategies**: **half-closed 2026-07-29.** The store
   layer for Shifts, Rounds and reader/writer Runs is built and tested
   ([§10](#10-shifts-many-personas-on-one-item)), so roles and a parallel
   strategy now exist in Postgres. Nothing drives them yet: no Shift is opened,
   no Round advances, and the chart still renders one worker + one model per
   team. There is still no `teams` table — a team remains Helm values.
5. **Checkpoint-driven resume**: checkpoints are written, never read; every
   run starts fresh.
6. **Tracker write-backs**: Vikunja `FetchItem`/`Comment`/`SetStatus` are
   stubs; the thin-payload rule always falls back to the webhook snapshot, and
   Ploeg never writes ticket status back.
7. **`ingested` state**: items are inserted directly as `queued`; `ingested`
   effectively never persists.
8. **`needs_human`/`stale` exits**: only re-assignment implements them; the
   legal-transition table in `pkg/work/state.go` is not enforced by the store.
9. **stuck vs failed semantics inverted for infra errors**: **partly closed.**
   The `acp` adapter classifies at the source — a missing binary, a failed
   `initialize` or a rejected protocol version become `failed`/`infra_node`,
   and an auth or quota failure `failed`/`infra_llm`, both retryable rather
   than parked. `pkg/worker`'s heuristics defer to an adapter-set
   `failureReason`, and `pkg/httpapi` now rejects one outside the taxonomy
   rather than storing it verbatim. Still open for the spawn-and-wait
   adapters: `openhands` and `exec` infer from exit codes and log tails, so a
   clone or mint failure under those harnesses is still parked.
10. **Unassignment** (`task.assignee.deleted`) is parsed and dropped — no run
    cancel or lease release (backlog #8).
11. **No metrics**: no OTel/Prometheus in Go; observability is structured logs
    plus the `key_alias` join in Grafana (external dashboards in homelab-cluster).

## 10. Shifts: many personas on one item

> **Build status.** This documents the architecture decided in
> [ADR-0010](adrs/0010-shift-owns-the-item-lease-owns-the-branch.md),
> [0011](adrs/0011-the-pull-request-is-the-blackboard.md),
> [0012](adrs/0012-two-level-budgets-authorized-and-settled.md) and
> [0013](adrs/0013-push-rights-are-minted-per-run.md). **The store layer is
> built and tested; nothing drives it yet** — see [§10.6](#106-build-status).
> Everything in §§1–9 above is what actually runs today.

### 10.1 The three jobs a Lease used to do

With one pod per item, mutual exclusion, liveness and accounting were
indistinguishable — one `leases` row did all three. Several pods on one item
pulls them apart, and each attaches to a different lifetime.

```mermaid
flowchart TB
    subgraph shift["Shift — one Team on one Work Item"]
        direction TB
        S["owns: branch · budget pool · round counter · roster"]
        subgraph r1["Round 1 — readers, all at once"]
            A1[security]:::reader
            A2[CFO]:::reader
            A3[philosopher]:::reader
        end
        subgraph r2["Round 2 — one writer, alone"]
            B1[builder]:::writer
        end
        L[["Lease — the RIGHT TO WRITE the branch<br/>held only by a writer"]]
    end
    B1 --- L
    classDef reader fill:#e8f4ff,stroke:#4a90d9
    classDef writer fill:#ffeaea,stroke:#d94a4a
```

| Concern | Attaches to | Why there |
| --- | --- | --- |
| "This Team is working this item" — branch, budget, roster, rounds | **Shift** | Spans every Run on the item |
| Exclusive right to **write** the branch | **Lease** | Only one writer may push at a time |
| Liveness, and the credential | **Run** | A Run is what dies, so a Run is what must expire |

The contended resource was never the ticket — it was the **branch**. Any number
of agents can read a diff at once; they cannot both push. And because most
personas only read and opine, exclusion is needed by a minority of Runs.

### 10.2 Rounds

A Round is a set of Runs that start together. Runs in one Round never observe
each other; every later Round sees everything earlier Rounds produced.

**A Round is either a fan-out of readers or exactly one writer, never both.**
That single rule is the whole of the concurrency control — readers hold no
Lease, so they have nothing to coordinate over. `OpenRound` refuses a malformed
Round rather than trusting callers with the rule everything rests on.

```mermaid
stateDiagram-v2
    [*] --> pending: OpenRound inserts one row per Role
    pending --> running: ClaimRole — budget authorized, credential minted
    running --> finished: ReportOutcome
    running --> finished: ExpireRuns — deadline lapsed
    finished --> [*]
    note right of pending
      pending rows ARE the KEDA scale signal:
      the scaler query and the claim predicate
      are one statement, so they cannot drift
    end note
```

### 10.3 The full loop

Multiple agents make a change together, a review is kicked off, and a human is
pulled in to merge.

```mermaid
sequenceDiagram
    autonumber
    participant V as Vikunja
    participant P as ploegd
    participant DB as Postgres
    participant R as reader pods (N)
    participant W as writer pod
    participant F as Forgejo

    V->>P: ticket assigned to team
    P->>DB: OpenShift — branch, budget pool

    rect rgb(232,244,255)
    note over P,R: Round 1 — readers, concurrently, no Lease
    P->>DB: OpenRound [security, CFO, architect]
    R->>DB: ClaimRole × N, each authorized min(cap, remaining)
    R->>F: read the diff
    R->>DB: ReportOutcome + findings
    P->>F: publish findings as PR comments (the blackboard)
    end

    rect rgb(255,234,234)
    note over P,W: Round 2 — one writer, holds the Lease
    P->>DB: OpenRound [builder]
    W->>DB: ClaimRole — takes Lease and push credential
    W->>F: push branch, open PR
    W->>DB: ReportOutcome pr_opened
    end

    rect rgb(232,244,255)
    note over P,R: Round 3 — review, readers again
    P->>DB: OpenRound [reviewer, security]
    R->>DB: ReportOutcome — approved or changes requested
    end

    P->>DB: no Round left → needs_human
    P->>V: comment + status — the human is pulled in
    Note over V,F: a person reads the PR and merges
```

### 10.4 Money

Two limits of different kinds. A per-Run cap stops one agent looping; the Shift
pool stops the *item* costing more than it is worth. They do not sum.

```mermaid
flowchart LR
    POOL["Shift pool<br/>budget − spent − reserved"] -->|"authorize<br/>min(roleCap, remaining)"| RUN[Run]
    RUN -->|"minted for exactly that amount"| KEY[LiteLLM per-run key]
    KEY -->|"the agent cannot exceed it"| LLM[completions]
    RUN -->|ReportOutcome| SETTLE["spent += actual"]
    SETTLE --> POOL
```

`reserved` is **summed over running Runs**, never stored as a counter. A Run
that stops running stops holding money, so a missed release is impossible
rather than unlikely, and unspent allowance returns to the pool with nobody
having to put it back. Below a floor no Run is spawned at all — a gate outcome,
not a dispatched-then-failed Run.

### 10.5 Data model

```mermaid
erDiagram
    WORK_ITEMS ||--o| SHIFTS : "one live"
    SHIFTS ||--o{ AGENT_RUNS : roster
    SHIFTS ||--o| LEASES : "at most one writer"
    WORK_ITEMS ||--o{ CHECKPOINTS : progress

    SHIFTS {
        bigint work_item_id "unique while open"
        text branch
        int round
        numeric budget
        numeric spent "reserved is DERIVED"
    }
    AGENT_RUNS {
        text role
        int round
        bool writes "writer or reader"
        text state "pending|running|finished"
        numeric authorized "the budget hold"
        timestamptz expires_at "per-Run liveness"
    }
    LEASES {
        bigint work_item_id PK
        bigint shift_id
        text forge_token_id "revoked when it lapses"
    }
```

### 10.6 Build status

| Component | State |
| --- | --- |
| Migration, Shift/Round/Run store, budgets, settlement, sweeper | **built** — 13 tests in `pkg/store/shift_test.go` |
| Harness plurality — ACP: Claude, Copilot, Codex, Cursor, opencode, Gemini… | **built** — `pkg/harness/adapters/acp` |
| ploegd orchestration: opening Shifts and Rounds, closing them | **not built** — nothing drives the diagrams above |
| Role-aware `TaskSpec` and prompt composition | **not built** |
| Forgejo `ForgeProvider` — PR comments, i.e. the blackboard | **not built** — interface defined, zero implementations |
| Vikunja write-backs — pulling the human in | **not built** — `Comment`/`SetStatus` are logging no-ops |
| Per-Run push credentials ([ADR-0013](adrs/0013-push-rights-are-minted-per-run.md)) | **not built** — every pod still shares one static token |
| Role-partitioned Helm workloads | **not built** |

## 11. Pointers

- Dispatch plane code: [cmd/ploegd](../cmd/ploegd) ·
  [cmd/ploeg-worker](../cmd/ploeg-worker) · [pkg/worker](../pkg/worker)
  (run orchestration) · [pkg/harness](../pkg/harness) (adapter seam +
  adapters) · [pkg/llmbroker](../pkg/llmbroker) (credential seam) ·
  [pkg/store](../pkg/store) · [pkg/httpapi](../pkg/httpapi) ·
  [pkg/provider](../pkg/provider) · [pkg/litellm](../pkg/litellm) ·
  [pkg/work](../pkg/work)
- Published contracts (schemas + executor SPI): [contracts/](contracts/)
- Chart: [ops/helm/ploeg](../ops/helm/ploeg) — live values in
  `webgrip/homelab-cluster` (`kubernetes/apps/ploeg/`)
- Runner image: `webgrip/infrastructure` → `ops/docker/agent-runner/`
- Design intent: [design.md](design.md) · domain language:
  [domain/](domain/) · roadmap: [backlog.md](backlog.md)
