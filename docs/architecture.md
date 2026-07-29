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

A team = a Helm values entry: name, model, per-run budget,
`maxReplicaCount` (currently 1), and optionally a `harness` block
(adapter name, agent image, entrypoint/args, dind) overriding the global
`executor.harness` defaults — the single axis of variation for swapping
harness and image per team.

**The repository is not a team property** (R11, [ADR-0001](adr/adr-0001-work-target-is-a-work-item-attribute.md)):
it belongs to the work item, resolved at ingest from the item's tracker scope
via ploegd's `PLOEG_TARGET_MAP` and delivered on the claim. A team may still
pin `repoOwner`/`repoName`/`baseBranch` as a *fallback* while the rollout
completes — no longer required by the schema — and `targetSource: env` pins one
team to that fallback regardless of what the claim says. See
[§9.12](#9-where-the-code-diverges-from-designmd) for what is still open.

Assignee-username → team routing via
`PLOEG_TEAM_MAP` ("assign ticket to user `silver` = dispatch team silver");
unmapped assignees fall to `PLOEG_DEFAULT_TEAM`. Live sizing, image pins, and
team roster are set in `homelab-cluster`'s HelmRelease, which overrides this
chart's defaults — check there first when debugging what's actually running.

## 9. Where the code diverges from design.md

Known gaps between [design.md](design.md) / [domain/model.yaml](domain/model.yaml)
and the implementation (1–11 verified 2026-07-27; 12–17 added 2026-07-29).
Aspirational ≠ implemented:

1. **PR follow-up ingestion** (design §3, R9): no forge webhook route, no
   `ForgeProvider` impl, `origin=follow_up` never produced. Review feedback
   re-enters via ticket re-assignment instead.
2. **Harness contract** (design §5): **closed 2026-07-28.** `pkg/harness`
   now carries the live seam: `TaskSpec`/`OutcomeReport` are the adapter I/O
   (published schemas in [contracts/](contracts/), backlog #59), and
   `harness.Adapter` wraps concrete harnesses — `openhands` (default),
   `exec` (generic binary), `claude-code` (#62) — selected per team via
   `PLOEG_HARNESS`. Outcome inference stays orchestrator-owned (PR poll is
   ground truth) until an ACP adapter (#64) supplies structured outcomes.
3. **"Watcher records failed on exit-without-report"**: no watcher exists;
   the DB lease sweeper is the crash detector.
4. **Teams with roles/strategies**: no roles, no `teams` table; a team is one
   worker + one model in Helm values.
5. **Checkpoint-driven resume**: checkpoints are written, never read; every
   run starts fresh.
6. **Tracker write-backs**: Vikunja `FetchItem`/`Comment`/`SetStatus` are
   stubs; the thin-payload rule always falls back to the webhook snapshot, and
   Ploeg never writes ticket status back.
7. **`ingested` state**: items are inserted directly as `queued`; `ingested`
   effectively never persists.
8. **`needs_human`/`stale` exits**: only re-assignment implements them; the
   legal-transition table in `pkg/work/state.go` is not enforced by the store.
9. **stuck vs failed semantics inverted for infra errors**: clone/config/mint
   failures are reported `stuck` → `needs_human` (parked), though docs define
   them as retryable `failed`. VIK-596 (classification + backoff + attempt
   protection) addresses this.
10. **Unassignment** (`task.assignee.deleted`) is parsed and dropped — no run
    cancel or lease release (backlog #8).
11. **No metrics**: no OTel/Prometheus in Go; observability is structured logs
    plus the `key_alias` join in Grafana (external dashboards in homelab-cluster).
12. **Team names the repository** (design §3, `domain/model.yaml:369-389`): the
    Team entity's attributes are exactly name, roles, strategy, budget — no
    repo. The chart binds one anyway: `ops/helm/ploeg/values.yaml` team entries
    carry `repoOwner`/`repoName`/`baseBranch`, and `values.schema.json:34` makes
    `repoOwner`/`repoName` **required**; `cmd/ploeg-worker/main.go:70-74`
    `requireEnv`s `REPO_OWNER`/`REPO_NAME` before the worker claims anything.
    The model's only repository is `TaskSpec.repo_url`
    (`domain/model.yaml:391-411`), which states no derivation. Cost: onboarding
    a repo needs a new team + KEDA ScaledJob + tracker bot user even when model,
    budget and harness are identical. Decision to decouple:
    [adr/adr-0001-work-target-is-a-work-item-attribute.md](adr/adr-0001-work-target-is-a-work-item-attribute.md).
    **Partly closed 2026-07-29**: a Work Item now carries its own Target
    (`pkg/work.Target`, migration 0007), the claim delivers it, the worker
    prefers it (`pkg/worker/target.go`), and the chart no longer *requires* a
    per-team repo. Still open until the rollout completes: teams may still pin
    a fallback repo, and no live team resolves a Target yet — the map
    (`PLOEG_TARGET_MAP`) is empty, so every run still uses its env repo.
    R11's "a Work Item without a resolved Work Target is not claimable" is
    therefore **not enforced** yet: during the fallback window an unresolved
    item claims fine and the worker uses its env repo. Enforcement lands when
    the last team drops its fallback.
13. **The SPI carries a core concept** (R7): `provider.TrackerEvent.Team`
    (`pkg/provider/provider.go:27`) puts a Ploeg-domain routing *result* in the
    provider SPI, and the Vikunja adapter produces it from `PLOEG_TEAM_MAP` —
    the exact shape R7 forbids ("core semantics must never encode a
    provider-specific workaround"). Decision:
    [adr/adr-0002-routing-is-core-policy-over-provider-opaque-scopes.md](adr/adr-0002-routing-is-core-policy-over-provider-opaque-scopes.md).
14. **The native routing scope is discarded at the parse boundary**:
    `pkg/provider/vikunja/vikunja.go:38-51` unmarshals only `event_name`,
    `data.task.{id,title,description,priority}` and `data.assignee.username`.
    Vikunja *does* send `project_id`; `encoding/json` silently drops it (zero
    `project_id` references repo-wide). Per [ops/board.md](ops/board.md)
    ("Dispatch topology — the trap") every team's webhook and team-user share
    live on **Ploeg Test (project 11)**, not the planning board, so all teams
    ingest one project and the repository is effectively chosen by which
    persona gets assigned. **Closed 2026-07-29**: the adapter now emits the
    project as an opaque `provider.Scope` and the core maps it to a Target; the
    one-project topology is why the map's transitional key is `<scope>/<team>`
    rather than scope alone.
15. **Forge is a global singleton**: one `FORGEJO_URL` + one
    `AGENT_BUILDER_TOKEN` (`ops/helm/ploeg/templates/_helpers.tpl:142-148`) and
    a hardcoded `agent-builder` git identity (`pkg/worker/worker.go:118,125`).
    `provider.ForgeProvider` (`pkg/provider/provider.go:47-70`) has **zero**
    implementations while `pkg/worker/forge.go:22-55` hardcodes the Forgejo REST
    dialect. Decision:
    [adr/adr-0003-forge-registry-and-per-run-repo-scoped-credentials.md](adr/adr-0003-forge-registry-and-per-run-repo-scoped-credentials.md).
16. **`agent/vik-<id>` embeds a vendor token and is not unique per target**:
    `pkg/worker/worker.go:81` builds the branch as `"agent/vik-" +
    item.ExternalID`. `vik` is a Vikunja token sitting in core semantics (R7),
    and the same name recurs across repositories — which is why R9 ("Follow-Ups
    are routed to the Team owning the source branch") has no implementable
    lookup key today.
17. **Spend attribution is only groupable by team**: `agent_runs` carries `team`
    but no target, and with the repo fixed per team (12) cost rolls up by
    capability tier only — never per product or repository. Since 2026-07-29 the
    target is on `work_items` and in the `lease.acquired` audit row, so a
    per-repo rollup is a join away; `agent_runs` still carries no target column.

## 10. Pointers

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
  [domain/](domain/) · roadmap: [backlog.md](backlog.md) · decision records:
  [adr/](adr/index.md)
