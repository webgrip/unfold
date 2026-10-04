# Glide seam map for an MCP surface

> Raw research-agent report, 2026-09-29, kept as evidence for [the MCP access dossier](../../2026-09-29-mcp-access.md). Agent output, not independently verified line by line; the dossier states which claims were checked first-hand.

All paths are relative to `<local path> unless absolute.

# Glide seam map for an MCP surface

## 0. Branch state
- Local `development` is 2 commits behind `origin/development`. The newest upstream commit is `964d61e fix(ploeg): write OpenHands agent settings so its ACP session starts`. Nothing below depends on those two commits.
- `feat/ploeg-activity-api` (5a83779) and `feat/vloer-ploeg-activity` (57b86ec) are already merged. They have 0 commits ahead of origin/development. Their code (`/summary`, `/runs`, `order=desc` events) is on development.
- Branches with commits ahead of origin/development are few and none is relevant:
  - `origin/docs/agency-offering` (34 commits, docs only; see §8)
  - `origin/docs/registries-network-profile`, `origin/fix/vloer-extension-review-lane`
  - `origin/agent/vik-*` fixes, Renovate branches
- No branch name contains "mcp". `git branch -a | grep -iE "activity|api|mcp"` matches only the two merged activity branches and `feat/ploeg-alerts`-style names.

## 1. Component inventory

**apps/ploeg (Go, module `github.com/webgrip/ploeg`)**
- `cmd/ploegd`: the controller. `main.go` wires env into config, `operator.go`, `webhooks.go` (Vikunja webhook coverage check and auto-registration), `sweep.go`, `forgecreds.go`. It serves on `PLOEG_LISTEN`, default :8080.
- `cmd/ploeg-worker`: the per-Run worker (`main.go`, `sandbox.go`). Per `apps/ploeg/CLAUDE.md`, `cmd/*` only wires env into config; the Run logic is in `pkg/worker`.
- Packages under `pkg/`:
  - `config`: loads the routing/roster config file (`PLOEG_CONFIG`): teams, maxRunning, created-work policy.
  - `followup`: pure policy for Work Items that Runs create (ADR-0031): `Policy{AutoDispatch, MaxCreatedPerRun, MaxDepth, MaxOpen, ItemBudgetUSD, PoolUSD, RefinementTeam}`. `Default()` is 5/2/20/$2/$10 with no auto-dispatch.
  - `forgebroker`: mints and revokes per-Run repo-scoped forge tokens (ADR-0013).
  - `harness`: the TaskSpec/OutcomeReport contract, the `Adapter` interface, adapters, `harnesstest` conformance and `skills` (embedded SKILL.md files).
  - `httpapi`: every ploegd HTTP surface.
  - `litellm`: LiteLLM admin API client (key mint/revoke/list).
  - `llmbroker`: per-Run budgeted LLM credential seam (`litellm.go`, `static.go`).
  - `plan`: Team plans (Rounds, Roles, writes flag, per-Run `Cap`).
  - `provider`: vendor SPI (`TrackerProvider`, `ForgeProvider`, `ExecutionReader`). Implementations are `vikunja`, `clickup` (trackers) and `forgejo`, `gitlab` (forges).
  - `sandboxlaunch`: kubernetes-sigs/agent-sandbox launcher.
  - `shiftengine`: Shift lifecycle, review loop, failed-writer rule, publish.
  - `store`: Postgres, migrations 0001–0020, audit log.
  - `target`: resolves a tracker scope to a repository target.
  - `work`: core types and state enums.
  - `worker`: claim → clone → prompt → mint → harness → outcome, plus `llmproxy.go` and `forgeproxy.go` credential proxies and `instructions.go` scan.
- `internal/ledger`: ADR corpus consistency gate (`go test ./internal/ledger/`).
- Helm chart: `apps/ploeg/ops/helm/ploeg/`. Templates: deployment, service (ClusterIP, `service.port: 8080`), scaledjob, cronjob, sandbox, `_operator.tpl`, `_worker_control.tpl`, prometheusrule, servicemonitor. **The chart has no ingress or HTTPRoute template.**
- Other directories: `apps/ploeg/ops/{docker,local,security,vex}` and `apps/ploeg/openspec/`. OpenSpec specs include `operator-api`, `operator-delivery`, `tracker-execution-binding`, `worker-authority`, `role-claim`, `shift-orchestration`, `blackboard`, `sandbox-executor`.

**apps/vloer (TypeScript, Node, no production npm deps per ADR-0002 and `scripts/check.mjs`)**
- `src/`:
  - `main.ts`, `http.ts` (all routes, 387 lines), `auth.ts` (cookie sessions, roles admin/operator/viewer), `oidc.ts`
  - `ploeg.ts` (`PloegClient`, reads Ploeg's operator API), `ploeg-demo.ts` (fixture data)
  - `execution-authority.ts` and `broker.ts` (Operator Execution path), `engine.ts` (session/crew engine, 931 lines)
  - `tasks.ts`, `task-binding.ts` (tracker lookup), `delivery*.ts`, `candidates.ts`, `attestations.ts`, `links.ts` (per-user GitLab/ClickUp OAuth links)
  - `ahp/host.ts` and `ahp/websocket.ts` (Agent Host Protocol server)
  - `runtime/{command,demo,docker,git-access}.ts`
- `public/`: `app.js`, `ploeg.js` (render helpers only; it makes no fetch calls), `ploeg-activity.js`, `delivery.js`.
- `extensions/vscode/src/`: the VS Code extension, including `ploeg-tree.ts` and `agent-host.ts`.
- Also: `skills/operate-agent-session`, `backlog/` (PV-### items).
- Helm chart: `apps/unfold/ops/helm/unfold/`. It has `templates/ingress.yaml`; the value `ingress.enabled: false` with an empty host.
- There is no top-level `deploy/` directory. Production desired state lives in `webgrip/homelab-cluster` (root `AGENTS.md`).

## 2. Ploeg HTTP API

All routes are registered in `apps/ploeg/pkg/httpapi/server.go:139-154` (`Server.Handler`). The whole mux is wrapped by `WorkerHandler` (`worker_auth.go:113`). The operator sub-mux is wrapped by `operatorAuth` (`operator.go:126`).

### 2a. Unauthenticated routes
| Method and path | Handler | Notes |
|---|---|---|
| GET `/healthz` | inline in `server.go` | |
| GET `/readyz` | `handleReady` | Pings the DB. Returns JSON with `vikunjaWebhooks` coverage when configured. |
| GET `/metrics` | `metrics.go:handleMetrics` | Prometheus text, cached. Families: `ploeg_shifts_open`, `ploeg_shift_idle_seconds_max`, `ploeg_leases_expired`, `ploeg_lease_overdue_seconds_max`, `ploeg_llm_keys_past_ttl`, `ploeg_llm_key_ttl_overrun_seconds_max`, `ploeg_settled_spend_usd_last_hour`, `ploeg_tracker_webhooks_missing/unchecked`, `ploeg_tracker_webhook_check_timestamp_seconds`. |
| POST `/webhooks/tracker/{provider}` | `handleTrackerWebhook` | Signature is verified by the provider's `ParseWebhook`. `assigned` ingests, `unassigned` or `closed` withdraws, everything else is dropped. Returns 202. |
| POST `/webhooks/forge/{provider}` | `handleForgeWebhook` | Dedups by `X-Forgejo-Delivery` / `X-Gitea-Delivery`. Signature-verified. Settles PR merged/closed and runs forge follow-ups (`forge_followup.go`). |

Webhook secrets: `PLOEG_VIKUNJA_SECRET`, `PLOEG_CLICKUP_SECRET`, `PLOEG_FORGEJO_SECRET`, `PLOEG_GITLAB_SECRET`.

### 2b. Worker run API
Auth is in `worker_auth.go` and applies to `/api/v1/claim`, `/api/v1/runs/*` and `/api/v1/queue/*`.
- **POST `/api/v1/claim`** (`handleClaim`; body `claimRequest{team, role}`; response `claimResponse` in `server.go:361`).
  - Auth is a **bootstrap bearer** from `PLOEG_WORKER_BOOTSTRAPS` (JSON `[{token,team,role}]`) plus the `X-Ploeg-Worker-ID` header. Team and role must match the bootstrap.
  - On success the response also carries `controlToken`: an HMAC-signed capability (key `PLOEG_WORKER_SIGNING_KEY`, audience `ploeg-worker-run`, 24h, bound to run, worker, team and role).
  - Returns 204 when the queue is empty, the team is over its cap, or the budget is exhausted.
- **POST `/api/v1/runs/{token}/renew`**, **`/checkpoint`** (body `work.Checkpoint`) and **`/outcome`** (body `harness.OutcomeReport`, validated by `validateOutcomeReport`). Auth is the signed `controlToken` plus the worker ID. The Run must be `running` and before its deadline; replay of a finished outcome is allowed.
- **POST `/api/v1/runs/{token}/llm/credential`**, **POST `/llm/block`**, **GET `/llm/spend`** (`llm_control.go:197 RegisterLLMControl`). Same capability.
- **GET `/api/v1/queue/{team}`** (`handleQueue`). In managed mode it is always rejected by `WorkerHandler`. It is live only in legacy mode.
- Legacy mode: `PLOEG_WORKER_AUTH_MODE=legacy` with `LLMControl == nil` makes the whole run API unauthenticated.
- Schemas: `apps/ploeg/docs/contracts/run-api.v1.schema.json` (`claimRequest`, `claimResponse`, `renewResponse`, `checkpointRequest`, `outcomeRequest`), plus `outcomereport.v1`, `checkpoint.v1` and `taskspec.v1`.
- Contracts: `docs/contracts/worker-control.md` and `executor.md`.

### 2c. Operator API (`/api/v1/operator/*`)
Auth is `operatorAuth` (`operator.go:126`).
- Exactly one `Authorization: Bearer <32–4096 bytes>` header. It is compared by SHA-256 in constant time against consumers from **`PLOEG_OPERATOR_CONSUMERS`**.
- That variable is a JSON array of `{name, tokenEnv, teams, execute, verify, maxBudgetUsd}`. Each token value is read from the env var named in `tokenEnv`; the chart generates these as `PLOEG_OPERATOR_TOKEN_*` from `operator.consumers[].tokenSecret`.
- A token without a matching consumer gets 401 with `WWW-Authenticate: Bearer realm="ploeg-operator"`.
- The principal is `OperatorPrincipal{Name, Teams, CanExecute, CanVerify, BudgetLimitUSD}` (`operator.go:21`).
  - `teams` omitted means all teams; `[]` means none.
  - `execute` defaults false. `maxBudgetUsd` defaults to 25 and ranges 0.01–10000.
  - `verify` is a separate permission for the delivery verifier.
- Timeout is 5s (30s for `/credential`).
- Mutations also need the **`X-Ploeg-Actor`** header (single value, regex `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$`). They may carry **`X-Ploeg-Acting-User`**.
- There is no "reader token" on the operator API. Read versus execute is the `execute` flag per consumer. The "reader token" in the branch name `feat/ploeg-reader-token-and-instruction-scan` means a *read-only forge token* for reading Roles (`PLOEG_FORGE_TOKEN_ACCESS`, `executor.<forge>.readTokenSecret`; `pkg/worker/worker.go:722 refuseReaderWithoutReadOnlyToken`).

Read routes:
| Method and path | Handler file | Response / types |
|---|---|---|
| GET `/api/v1/operator/teams` | `operator.go handleOperatorTeams` | `{schemaVersion, teams}`; `store.OperatorTeam`, `OperatorRole` |
| GET `/work-items?team&state&needsHuman&after&limit` | `operator.go handleOperatorItems` | `{items, nextCursor}`; `store.OperatorItem`. State filter enum at `operator.go:354`. |
| GET `/work-items/lookup?provider&externalId&scope&baseUrl` | `operator_source.go handleOperatorSourceLookup` | `{item, source}`; contract `tracker-execution.md` and v1 schema. Returns 409 on non-pristine items. |
| GET `/work-items/{id}` | `operator.go handleOperatorItem` | `store.OperatorDetail`: item, shifts, runs, checkpoints, events, `truncated`; latest 200 per collection. |
| GET `/summary?window=24h\|7d\|30d` | `operator_activity.go handleOperatorSummary` | `OperatorTeamSummary`, `OperatorSummaryTotals` (`store/operator_activity.go`) |
| GET `/runs?team&state&outcome&limit&before` | `operator_activity.go handleOperatorRuns` | `OperatorRunListItem`, `nextBefore` |
| GET `/runs/{id}` | `operator.go handleOperatorRun` | `store.OperatorRun` |
| GET `/events?team&workItemId&after\|before&order&limit` | `operator.go handleOperatorEvents` | `OperatorEvent`; `consistency:"snapshot"` (the docs say it is not a lossless changefeed) |

Write routes that need `execute` and `X-Ploeg-Actor`:
- POST `/work-items/{id}/cancel` (`withdraw.go:105 handleOperatorCancel`). Withdraws the item: the Shift closes `withdrawn_by_operator`, pending Runs are cancelled, running Runs are finished and their keys blocked, and the item becomes `withdrawn`. Returns 409 if the item is bound to an Operator Execution.
- POST `/work-items/{id}/approve` and `/work-items/{id}/reject` (`operator_proposed.go`). Body `{reason}`; reject requires a reason. Only works on `proposed` items and returns 409 `not_proposed` otherwise. Approve queues the item and calls `ensureShift`.
- Operator Executions (`operator_execution.go:37`):
  - POST `/executions`: body `store.AdmitOperatorExecution{source?, sessionId, team, title, objective(≥20 chars), repositoryId, repositoryUrl, baseBranch, crewId, budgetUsd ≤ consumer limit, demo}`.
  - GET `/executions/{execution}`.
  - POST `/executions/{execution}/commands`: body `store.OperatorExecutionCommand{commandId, action, expectedRevision, generation, state?, text?, stopConfirmed?}`. Actions: start, resume, pause, cancel, message, handback, take-control, heartbeat, report.
  - GET `/executions/{execution}/events?after` (polling, `consistency:"serialized-execution"`).
  - POST `/executions/{execution}/credential`: returns a LiteLLM key, alias and budget to the *consumer*.
  - POST `/executions/{execution}/block`.
  - GET `/executions/{execution}/spend`.
- Delivery (`operator_delivery.go:52-57`), all under `/executions/{execution}/delivery`: GET, POST `/candidates`, POST `/verification`, POST `/approval`, POST `/publication`, POST `/publication/{operation}/status`. Types are in `store/operator_delivery.go`. Contract: `operator-delivery.md` and `operator-delivery.schema.json`. The verifier routes need `verify`.

Schemas and contract docs:
- `apps/ploeg/docs/contracts/operator-api.v1.schema.json` (1326 lines). `$defs`: target, lease, role, team, shift, item, usage, run, checkpoint, eventDetail, event, truncated, teamsResponse, itemsResponse, itemResponse, runResponse, eventsResponse, cancelResponse, decisionResponse, errorResponse, summary*, teamSummary, runListUsage, runListItem, runsResponse.
- Narrative: `apps/ploeg/docs/contracts/README.md` §"Operator read consumers".
- There is **no OpenAPI document anywhere**; the contracts are JSON Schema only.

Streaming and absences:
- **Ploeg has no SSE or streaming endpoint.** A grep for `text/event-stream` or `Flusher` in `apps/ploeg/pkg` and `cmd` returns 0 hits. Events are cursor-polled only.
- Vloer ADR-0023 says Ploeg adds SSE "only if that is measured to be needed".
- Absent (0 grep hits): `/.well-known/agent-card.json`, any `a2a-go`, any `ploegctl` binary (backlog #96/#117/#121/#124 are proposals only).

## 3. Domain lifecycle

**Work Item states** (`pkg/work/types.go:9-26`):
- Values: `ingested`, `proposed`, `queued`, `leased`, `needs_human`, `awaiting_review`, `stale`, `done`, `withdrawn`.
- DB CHECK in `pkg/store/migrations/0019_created_work_items.sql`.
- `Terminal()` and `StateForOutcome()` are in `pkg/work/state.go`: stuck → needs_human, failed → queued (retry), pr_opened/pr_updated → awaiting_review, everything else → done.

**Origins and providers:**
- Go constants: `OriginAssignment "assignment"`, `OriginFollowUp "follow_up"`.
- Operator admission writes `origin 'operator'`, `provider 'manual'` (`store/operator_execution.go:128`).
- Created work uses `ProviderPloeg = "ploeg"`.
- The proposed Vloer submission would use `provider='vloer'`.
- `CreatedKind` values: `split`, `clarify`, `discovered`.

**Outcomes** (`work/types.go:58`): `pr_opened`, `pr_updated`, `issue_updated`, `follow_up_created`, `stuck` (needs a `stuckReason`), `failed`, `no_change_needed`.
- `FailureReason` values: `infra_node`, `infra_llm`, `agent_error`, `budget`, `lease_lost`, `timeout`.
- `Verdict` values: `approve`, `request_changes` (migration 0010).

**Run and Shift:**
- Run (`agent_runs`) states: `pending`, `running`, `finished` (migration 0008). Withdrawal sets `finished`.
- Shift (`shifts` table, migration 0008) has budget pool `budget`, `spent`, `round`, `closed_at` and `close_reason`. `shifts_one_live_per_item` is a unique index.
- Close reasons:
  - `shiftengine/reviewloop.go:22-26`: `plan_exhausted`, `review_approved`, `fix_round_cap_reached`, `budget_exhausted_before_fix_round`, `budget exhausted`
  - `failedwriter.go`: `writing_run_failed_repeatedly`, `writing_run_killed_repeatedly`
  - `store/withdraw.go:20`: `withdrawn_unassigned`, `withdrawn_by_operator`, `withdrawn_closed`
- Lease: the `leases` table, TTL `PLOEG_LEASE_TTL`.
- Operator Execution states (migration 0013): `admitted`, `running`, `waiting_input`, `pause_requested`, `paused`, `cancel_requested`, `cancelled`, `completed`, `failed`, `interrupted`. Supervision is `human` or `background`.

**Role, plan and concurrency:**
- Roles and caps come from `pkg/plan` (`PLOEG_TEAM_PLANS`). `RoleCap(team, role)` is the per-Run ceiling. `EnsureShift` opens a Shift with `tp.Pool` (`shiftengine/engine.go:62-81`).
- `PLOEG_SHIFTS_UNIFORM` synthesizes a one-Round plan.
- Concurrency caps: config `teams.<name>.maxRunning` or `PLOEG_TEAM_MAX_RUNNING`. `TeamCaps.MaxRunning` is checked at claim; over the cap gets 204 (`executor.md` §Concurrency caps).

**Budget and spend:**
- Budgets are two-level (ADR-0012): a Shift pool, then an authorization per Run at claim (`ClaimRoleWithin` returns `ErrBudgetExhausted`, answered as 204).
- The LiteLLM per-Run key is minted by the controller: `llmbroker` / `LLMControl`, admin `LITELLM_ADMIN_URL` / `LITELLM_MASTER_KEY`.
- Accounting is `run_llm_accounts` (migration 0012). States: `reserved`, `minting`, `issued`, `unknown`, `blocked`, `reconciled`.
- A settlement sweep reconciles from LiteLLM spend logs (`llm_control.go:~190`, `PLOEG_LLM_SETTLE_AFTER`).
- Per-worker LLM policies come from `PLOEG_WORKER_LLM_POLICIES`.

**How a Run is authorized:** the chain is:
1. Bootstrap bearer (team/role scoped) → claim.
2. The store leases and authorizes the budget in one transaction.
3. `LLMControl.Reserve` runs.
4. The signed `controlToken` is issued.
5. The worker calls `/llm/credential`.
6. For writers, a per-Run forge token is minted (`forgebroker`).

Optionally, `PLOEG_LLM_KEY_ISOLATION=proxy` and `PLOEG_FORGE_TOKEN_ISOLATION=proxy` give the harness placeholders (ADR-0034).

**Proposed work ("work can create work"):**
- `OutcomeReport.createdWorkItems` (≤50 entries of `{title, description, ready, kind, team?}`) is stored by `store/created_work.go` under `followup.Policy`.
- Created items land as `proposed` unless `AutoDispatch` is set.
- An owner approves or rejects via `/approve` or `/reject`; `DecideProposed` is at `created_work.go:105`.
- Planner roles are marked in the claim (`Planner`).
- Records: Ploeg ADR-0031 and Glide ADR-0003.

**Cancel on unassign:**
- `withdraw.go:46 trackerUnassigned` withdraws with `withdrawn_unassigned` when the removed assignee's team matches. The container pin is respected, and items bound to an operator execution are ignored.
- `trackerClosed` uses `withdrawn_closed` and skips items with a running Run.
- Withdrawal blocks LiteLLM keys and revokes forge tokens.

## 4. Tracker integration and write paths

**Interfaces** (`apps/ploeg/pkg/provider/provider.go`):
- `TrackerProvider{Name(); ParseWebhook(*http.Request) ([]TrackerEvent, error); FetchItem(ctx, externalID) (work.WorkItem, error); Comment(ctx, externalID, html); SetStatus(ctx, externalID, work.State)}`
- `TrackerEvent{Kind(assigned|updated|unassigned|closed), ExternalID, Team, Scope{Kind,ID,Name}, Item}`
- `ForgeProvider{Name(); ParseWebhook; Comment; PullRequestState}`
- Optional `ExecutionReader{TrackerAPIBaseURL(); FetchExecutionItem()}` and `ForgeRepositoryLocator` (`provider/execution.go`)

**Implementations:**
- `pkg/provider/vikunja` (reference). Event `task.assignee.created` is `AssignmentEvent` (`webhooks.go:14`); `task.assignee.deleted` and `task.updated` are also handled. Auto-registration and hourly coverage check via `PLOEG_VIKUNJA_WEBHOOK_REGISTER` / `PLOEG_VIKUNJA_WEBHOOK_URL` (`cmd/ploegd/webhooks.go`).
- `pkg/provider/clickup`: `taskAssigneeUpdated`, `taskUpdated`, `taskStatusUpdated`, `taskPriorityUpdated`. Registered only if `PLOEG_CLICKUP_SECRET` or `PLOEG_CLICKUP_TOKEN` is set.
- Forges: `forgejo` and `gitlab`. There are no GitLab or Linear *tracker* providers.

**How a new source registers:**
1. Implement `TrackerProvider` in `pkg/provider/<name>`.
2. Add it to the `trackers` map in `cmd/ploegd/main.go:112-128`, keyed by `Name()`. That name becomes the route `/webhooks/tracker/{Name()}` and `WorkItem.Provider`.
3. Implement `ExecutionReader` if it should support Vloer tracker binding.

Routing: `ScopeTeams` pins (config `team:`), `PLOEG_TEAM_MAP` / `PLOEG_DEFAULT_TEAM`, target resolution through `pkg/target` (`PLOEG_TARGET_MAP`, `PLOEG_TARGET_FORGE`, ADR-0038 repo label).

**Ingest path:** webhook → `mirror` (`FetchItem`) → `pinTeam` → `resolveTarget` → `Store.IngestAssigned` → `Engine.EnsureShift`. There is **no polling of trackers** for ingest. There is a periodic PR reconcile for forges (`PLOEG_REVIEW_RECONCILE_INTERVAL`).

**Write paths that do not need a tracker (critical for MCP):**
1. **Implemented: POST `/api/v1/operator/executions`.**
   - It creates a `manual`/`operator` Work Item directly in state `leased`, plus a Shift (branch `vloer/<sessionId>`, budget = request `budgetUsd`), an `operator` Run in `running`, and a Lease (`store/operator_execution.go:128-151`).
   - **It does not dispatch to `ploeg-worker`.** The consumer (Vloer) executes and pulls a LiteLLM key via `/credential`.
   - Its TTL is 90s and it needs heartbeat commands. It is `operator_owned`, so the scheduler skips it.
   - This is the "delegated Executor" model of Ploeg ADR-0024 and Vloer ADR-0017. Vloer ADR-0023 proposes retiring it.
   - For MCP it is a "consumer executes" path, not a "Ploeg runs agents" path.
2. **Implemented, but not a create path: POST `/work-items/{id}/approve`.** It turns a Run-created `proposed` item into `queued` and opens a Shift. This is a real dispatch trigger without a tracker, but only for items a Run already proposed.
3. **Proposed, not implemented: POST `/api/v1/operator/work-items`.**
   - Specified in `apps/unfold/docs/ploeg-front-end.md:38-60` and Vloer ADR-0023.
   - Body `{requestId, team, target(registry key, never a raw URL), title, description, budgetUsd?(≤ plan pool)}`.
   - Creates `provider='vloer'`, `origin='operator'`, state `queued`, not operator_owned, then calls `EnsureShift`. Returns `{workItemId, shiftId, created}`. Idempotent by requestId plus fingerprint; a changed payload returns 409.
   - It must not reuse `IngestAssigned`, because that re-queues done/stale/needs_human items on conflict.
   - A grep for a registered route confirms it does not exist.
4. **Proposed commands: POST `/api/v1/operator/work-items/{id}/commands`** with `{commandId, action: cancel|pause|resume|message|take-control|hand-back, expectedShiftId, text?}` (`ploeg-front-end.md:112-125`). Also proposed: POST `/work-items/{id}/decisions` (Ploeg ADR-0036 line 178). Neither is implemented.
- A2A facade design, as a counterpoint: `SendMessage` should "create+assign a tracker ticket via the TrackerProvider so the board stays authoritative — never a direct `work_items` insert" (`apps/ploeg/docs/backlog.md` #102; ADR-0007). This conflicts with Glide ADR-0003 ("from any source … Vloer") and with the Vloer ADR-0023 direct-insert proposal. Treat the tension as open.

## 5. Vloer

**How it talks to Ploeg (server side only; the browser never calls Ploeg):**
- `src/ploeg.ts` `PloegClient.request` does `fetch(${ploeg.url}/api/v1/operator/${path})` with `Bearer process.env[ploeg.tokenEnv]`.
  - Paths used: teams, work-items (page size 25), work-items/{id}, summary, runs, events.
  - Proposed items come from the `/api/ploeg/proposed` aggregation.
  - It POSTs approve, reject and cancel with `X-Ploeg-Actor` and `X-Ploeg-Acting-User` both set to the Vloer user id.
  - 5s timeout, 16 MiB cap, redirects refused, 5s cache, the token is redacted from bodies.
- `src/execution-authority.ts:31` calls `/api/v1/operator/executions${path}` with the actor set to the session owner. `src/delivery.ts:35` calls `/executions/{id}/delivery...`. `src/task-binding.ts:23` calls `/work-items/lookup`.
- Vloer uses **one shared consumer token**. Per-user scope is enforced in Vloer: config `ploeg.teams` and `ploeg.userTeams[userId]`; admin sees all (`ploeg.ts:158-159`).
- Config keys: `ploeg.{url, tokenEnv, teams, userTeams, trackerUrl, demo}`. `config.ts:218` forbids the token entering the agent environment.

**Vloer's own routes** (`src/http.ts`; contract `apps/unfold/docs/contracts/api.md`):
- Public: `/healthz`, `/readyz`, POST `/api/login`, GET `/api/auth/methods`, GET `/api/auth/oidc`, `/api/auth/oidc/callback`, POST `/api/auth/editor` (editor device-style flow), POST `/api/logout`.
- Authenticated by cookie (`vloer` or `__Host-vloer`, HttpOnly, SameSite=Strict). Mutations need `X-Vloer-Request: 1` and same-origin checks (`mutationGuard`, `http.ts:57`).
  - Config and account: `/api/bootstrap`, `/api/health`, `/api/agent-host` (GET), POST `/api/agent-host/tokens` (issues personal AHP connection tokens), `/api/attestations/public-key`, `/api/models`, `/api/links`, `/api/links/{gitlab|clickup}` (POST/PUT/DELETE).
  - Tasks: `/api/task-sources`, `/api/task-sources/{id}/tasks[/{taskId}]`, POST `/api/task-imports`.
  - Sessions: GET/POST `/api/sessions`, GET `/api/sessions/{id}[/delivery|/delivery/download|/candidate|/candidate/download|/history|/permissions]`, **GET `/api/sessions/{id}/events` (SSE, `text/event-stream`, Last-Event-ID)**, POST `/api/sessions/{id}/{start|pause|resume|cancel|retry|review|messages|supervision|approval|budget|permissions/{id}|delivery/verify|delivery/approve}`.
  - Ploeg projection: `/api/ploeg`, `/api/ploeg/{teams,summary,runs,events,proposed,work-items,work-items/{id}}`, POST `/api/ploeg/work-items/{id}/{approve|reject|cancel}`.
- Roles: `admin`, `operator`, `viewer` (`types.ts` `UserRole`). OIDC role mapping uses `auth.oidc.roleClaim` and `groupsClaim`.
- AHP 0.9.0 WebSocket host on the same port (`src/ahp/`, Vloer ADR-0012) with personal tokens. This is precedent for per-user tokens given to external clients.
- `public/ploeg.js` holds lane, state and closeReason labels, `ploegReview()`, and an instruction-file regex list that includes `.mcp.json`. The fetch calls live in `public/app.js:357-481`.

**The deterministic demo:**
- `config.mode === 'demo'`, `src/runtime/demo.ts`. It copies an intentionally broken order-service Git fixture, edits real code and runs real Node tests, with zero model calls and zero spend (`apps/unfold/README.md:19`).
- `src/ploeg-demo.ts` supplies fixture Ploeg data: items DEMO-1…5 and proposed items 106/107.
- `mise run demo` runs Vloer alone. `mise run demo-unified` runs Ploeg, Vloer and Postgres, still with no model calls (root `README.md:12-15`, `docs/workflows/local-demo.md`).
- Rule in root `AGENTS.md`: "A deterministic demo says it is one and never invents model calls or spend."

## 6. Every MCP mention (40 files; grep -i excluding node_modules, .git and .claude)

**Code:**
- `apps/ploeg/pkg/harness/adapters/claudecode/claudecode.go:77`: argv `claude -p … --settings {"disableAllHooks":true} --strict-mcp-config`, with **no `--mcp-config`**, so zero MCP servers load, including the target's `.mcp.json`.
- `apps/ploeg/pkg/harness/adapters/claudecode/claudecode_test.go:43,62-133`: tests assert `--strict-mcp-config` is present and `--mcp-config` is absent; a fake `claude` receives a target `.mcp.json` and project settings.
- `apps/ploeg/pkg/harness/harnesstest/live_test.go:286-362`: `TestLiveClaudeCodeIgnoresTargetHooksAndMCPServers`, an opt-in live conformance test with a fixture `.mcp.json` whose marker must not be touched.
- `apps/ploeg/pkg/harness/adapters/acp/acp.go:230`: ACP `session/new` sends `McpServers: []sdk.McpServer{}`, an empty list with no comment. It dates from the relocation commit 9f0103b and the history before that is not in this repo. `acp/client.go:23-31` refuses `fs/*` and `terminal/*` on purpose.
- `apps/ploeg/pkg/worker/instructions.go:21`: `instructionFileNames` includes `.mcp.json`. It is scanned, SHA-256 recorded and hidden-Unicode checked before the harness runs; it is recorded, not stripped. Tests are in `instructions_test.go:49,70,273-277`.
- `apps/ploeg/pkg/worker/task.go:244,265`: the delivery-contract prompt tells writers not to change `.mcp.json` (among other files) unless asked, and tells reviewers that a change to it is a finding. Matching test: `prompt_test.go:219,256`.
- `apps/unfold/public/ploeg.js:6`: the instruction-file regex list includes `.mcp.json`, to flag reviewer findings.

**Docs:**
- `apps/ploeg/docs/adrs/0030-target-repository-instructions-rank-below-the-delivery-contract.md` (12 hits). It names the headless `claude -p` `.mcp.json` / hooks risk and mandates `--strict-mcp-config` with no `--mcp-config`. It says the live conformance run is "Not yet confirmed". Re-evaluation trigger: Claude Code changes `--strict-mcp-config`.
- `apps/ploeg/docs/contracts/acp-profiles.md:36`: "Goose v1.52.0 enables MCP servers from `<working directory>/.agents/plugins/` the first time it sees them … a target repository can start processes inside the Run." It is an open risk before goose is qualified.
- `apps/ploeg/docs/ops/managed-workers.md:50`: harness conformance checks that claude-code does not run target hooks or `.mcp.json` servers.
- `apps/ploeg/docs/ops/board.md:13`: an old July snapshot recorded "MCP failures" (board tooling).
- `apps/ploeg/docs/adrs/0008-litellm-…md:58` and `research/2026-07-28-omniroute-fit.md:44`: OmniRoute's MCP/A2A endpoints "serve its own tooling".
- `apps/ploeg/docs/research/2026-07-28-a2a-fit.md:48`: quotes "MCP inside agents, A2A between agents".
- `apps/ploeg/docs/research/2026-07-28-paperclip-fit.md:52`: lists MCP among Paperclip features.
- `apps/ploeg/docs/contracts/checkpoint.v1.schema.json`: one incidental hit.
- `apps/CHANGELOG.md:178,242,253`: "stop target repository hooks and MCP servers under claude-code"; "verify the MCP absences against the normative schema"; "run a fake claude…".
- `docs/research/2026-09-22-agents-md.md` (11 hits): the source finding that the Claude adapter "runs the target's hooks, env block and `.mcp.json` unprompted, with `bypassPermissions`". It cites CVE-2025-59536, CVE-2026-21852 and Codex CVE-2025-61260, and recommends `--strict-mcp-config` and CODEOWNERS on `.mcp.json`.
- `docs/how-to/prepare-a-repository.md:64,68,90,103`: require human review of `.mcp.json`; claude-code runs with "only Ploeg's MCP configuration", which is effectively none.
- `docs/how-to/review-an-agent-pr.md:40`: check instruction files including `.mcp.json`.
- `apps/unfold/docs/design/00-product-system-design.md:219`: see §9.
- `apps/unfold/docs/design/ticket-integration.md:121`: see §9.
- `apps/unfold/docs/design/platform-and-governance.md:146`: "MCP results … are untrusted inputs".
- `apps/unfold/docs/adrs/0003-runtime-workspace-and-credential-seams.md:25`: "MCP may expose tools; it does not replace lifecycle ownership."
- `apps/unfold/docs/product/model-gateway-capabilities.md:65-66,89`: proposal to serve MCP tools (ClickUp, GitLab, Forgejo) *through the LiteLLM gateway, granted per key*, so the sandbox holds no tool credential. LiteLLM 1.99/1.100 features are listed. The second estate's LiteLLM already runs `supported_db_objects: ["mcp"]` and `require_key_mcp_access_defined: true`.
- `apps/unfold/docs/operations/live.md:83`: forge tools via the gateway's MCP surface would remove the sandbox forge token.
- `apps/unfold/backlog/README.md:2963-2990` (also mirrored in `backlog.json`, `clickup-import.csv`, `forgejo-de-vloer.json`): **PV-063 "Expose scoped read-only MCP tools for work inspection"**. Milestone M5, epic E07, risk high, 5 points. Depends on PV-034 (org/client/project/team authz), PV-048 (durable event revision API) and PV-061 (capability catalog). Acceptance criteria: same project authz as HTTP; negotiate tested protocol versions; "No generic execute/admin tool or implicit ability to start paid work"; bound content and preserve provenance and redaction; conformance against a pinned MCP client.
- `apps/unfold/docs/research/2026-09-11-ecosystem-alternatives.md:154`: the protocol-ledger MCP entry; notes ACP passes an empty MCP list.
- `apps/unfold/docs/research/market-landscape.md:48,56`: "An MCP connection exposes tools and context; it is not proof of durable ticket ingestion"; Kandev has "task MCP".
- `apps/unfold/docs/research/2026-09-10-sandbox-landscape.md` and `2026-09-12-documentation-audit.json`: incidental.
- `apps/unfold/docs/research/2026-09-17-agent-host-roadmap.md` and `2026-09-18-band-and-the-interaction-layer.md`: see §9.
- `docs/landscape/explorer.html`: generated copy.
- `apps/unfold/extensions/vscode/package-lock.json`: a dependency string.

**How Ploeg treats MCP for executing agents today:**
- **claude-code:** zero MCP servers. `--strict-mcp-config` without `--mcp-config` means even the target's `.mcp.json` is ignored.
- **acp (opencode, qwen-code, goose, openhands, custom):** `session/new` passes `mcpServers: []`. Nothing in the opencode profile disables project-level opencode config MCP servers (0 hits for `opencode.json` in `profiles.go`, ADR-0030 or `acp-profiles.md`). Goose loads `.agents/plugins/` MCP servers, which is documented as unmitigated. qwen merges the repo's `.qwen/settings.json`.
- Why: ADR-0030 and the agents-md research. Repository-supplied configuration is untrusted, and headless `claude -p` would connect `.mcp.json` servers without a trust dialog under `bypassPermissions`.
- **Ploeg gives agents no MCP servers of its own.** Its agent-facing capabilities are embedded skills (`pkg/harness/skills`, ADR-0035), the outcome drop box (`PLOEG_OUTCOME_FILE`, ADR-0018) and the loopback LLM and forge proxies.
- The blackboard rule (ADR-0011): "the agent never calls a forge or a Ploeg API to fetch them". Worker pods reach only the gateway, the forge and ploegd.

## 7. Harness seam

- `pkg/harness/adapter.go`:
  - `Adapter{Name(); Run(ctx, TaskSpec, RunEnv) (OutcomeReport, error); ExpectsLLM() bool}`
  - `CommandAdapter{Name(); Prepare(TaskSpec, RunEnv) (Invocation, error); ParseOutcome(TaskSpec, ExecResult) (OutcomeReport, error); ExpectsLLM()}`
  - `RunCommand(CommandAdapter) Adapter`, plus the types `RunEnv`, `LLMEnv`, `Invocation`, `ExecResult`
- `pkg/harness/contract.go`: `TaskSpec`, `Finding`, `OpenSpecBrief`, `RepoRef`, `OutcomeReport`, `CreatedWorkItem`, `Usage`, `ValidVerdict`, `ValidateCreatedWorkItems`.
- Adapter selection is in `pkg/worker/adapters.go:48-57`: `""`/`openhands` → native OpenHands, `claude-code` → claudecode, `exec` → execbin, `acp` → acp.
- Adapter directories: `adapters/openhands`, `adapters/claudecode`, `adapters/execbin`, `adapters/acp`.
- ACP profiles (`acp/profiles.go:71-89`, env `PLOEG_ACP_PROFILE`):
  - `opencode` (default, `opencode acp`, `OPENCODE_CONFIG` file)
  - `qwen_code` (`qwen --acp --auth-type=openai`)
  - `goose` (`goose acp`, `GOOSE_PROVIDER=litellm`)
  - `openhands` (`openhands acp --override-with-envs`)
  - `custom` (argv override)
- Codex is not a profile yet.
- Conformance kernel: `pkg/harness/harnesstest`.
- Summary of `apps/ploeg/docs/contracts/acp-profiles.md`:
  - ACP wire v1 over stdio via `coder/acp-go-sdk`.
  - Every profile gets the gateway base URL and key (or loopback placeholder), `PLOEG_OUTCOME_FILE` and a permission mode `allow_always|allow_read_only|deny_all`.
  - The adapter never calls `authenticate`, and stops a Run after 200 permission requests (or 60 in one minute).
  - qwen and goose are unqualified; the risks are repository config, permission storms and the proxy. OpenHands is partly checked. Codex needs the Responses API and waits on a gateway probe.

## 8. Relevant ADRs

**Glide `docs/adr/` (index `docs/adr/index.md`):**
- 0001, accepted: Glide contains independently deployable Vloer and Ploeg.
- 0002, accepted 2026-09-22: Ploeg is the only execution engine; Vloer presents and steers through Ploeg's API. Not yet implemented.
- 0003, accepted: the Work Item is the unit from any source (tracker, Vloer, follow-up); work can create work.
- 0004, accepted: one release version.

**Unmerged `origin/docs/agency-offering`** (all accepted 2026-09-29, none implemented, **0 MCP/API/OAuth decisions**; the only MCP string is "no kubectl or MCP access from this session" in `apps/ploeg/docs/research/2026-09-28-credential-isolation-cluster-plan.md`):
- 0005: Glide is offered to agencies; delivery ends at a reviewed PR plus a preview. Phase 1 is self-hosted (owner, and an employer agency on ClickUp). The client portal is part of Vloer, with a per-agency kill switch.
- 0006: the ticket is the billing unit. Credits by size S/M/L = 1/3/8, Shift caps €4/€10/€20, tokens at cost plus 25/20/15% markup, credits charged on acceptance. Mollie and Lago; "Ploeg enforces every cap before spend".
- 0007: clients approve Ready work. A refinement Role drafts a Work Item and quote, which stays `proposed` until client or agency approval (reuses ADR-0031). Intake is the portal, tracker import or email. Linear is the next tracker.
- 0008: every PR gets a preview environment.
- 0009: one tenant per agency. Namespace, default-deny egress, gVisor/Kata, a per-tenant egress gateway, a LiteLLM team per tenant, and "Ploeg records the tenant on every Team, Work Item, Shift and credential". Clients are users inside the tenant.
- 0010: PRs are small, whole and explained, with diff budgets and CI review questions.
- Also on that branch: `docs/research/2026-09-28-agency-offering-proposal.md`, `2026-09-28-pricing-units.md`, `2026-09-29-agency-pricing-strategy.md`, `2026-09-29-fair-credit-pricing.md`, evidence directories, `ops/vikunja/agency-backlog.json`, and `docs/reference/decisions.md` rows.

**Ploeg `apps/ploeg/docs/adrs/` (index README.md):**
- 0005, accepted: build a dedicated dispatch plane.
- 0006, accepted, review-by 2026-10-31: AHP parked as a live-run surface above Ploeg; watchlist #101.
- **0007, accepted, review-by 2026-10-31: A2A, adopt nothing and watchlist a north-facing facade** as a separate service that creates tracker tickets. Consequence: "Ploeg has no standard programmatic dispatch API, so an external system must speak Vikunja to enqueue work." Trigger: the 2027-04 gate "external adopters will want a standard dispatch API".
- 0008, accepted: LiteLLM is the credential and metering seam.
- 0010, accepted: a Shift owns the item and a Lease owns the branch.
- 0011, accepted: the PR is the blackboard.
- 0012, accepted: two-level budgets.
- 0013, accepted: push rights are minted per Run.
- 0024, proposed: Ploeg admits operator work and owns execution; Vloer is workbench and delegated Executor. Named consumers with team scope, read and execute separate, idempotent commands.
- 0025, proposed: management authority stays in the control plane.
- 0026, proposed: tracker selections bind the canonical Work Item.
- 0027, proposed: candidate delivery uses trusted evidence and a publication barrier.
- 0030, proposed: target-repo instructions rank below the delivery contract (the MCP stripping in §6).
- 0031, proposed: Runs create Work Items held for approval within limits.
- 0032, proposed: keep the dispatch plane and compete on authorized spend.
- 0034, proposed: harness placeholders; the worker keeps credentials.
- 0035, proposed: Ploeg-owned skills and mounted toolchains.
- 0036, proposed: stuck work goes to the owner as a cited proposal; proposes POST `/work-items/{id}/decisions`.

**Vloer `apps/unfold/docs/adrs/` (index README.md):**
- 0003, accepted: harness, workspace and credential seams stay distinct; "MCP may expose tools; it does not replace lifecycle ownership."
- 0005, proposed: one work authority.
- 0012, accepted: every session is an AHP 0.9 host with personal connection tokens.
- **0015, proposed: Ploeg exposes a read-only operator API. The read half is now implemented.** It says auth "starts with consumer bearers and grows into OIDC … validates OIDC tokens from the estate's Authentik through its JWKS and maps a group claim to team scope". On exposure: "the internal gateway keeps `/`; the external gateway keeps `/webhooks/` only."
- 0016, accepted in part: people sign in with the estate (Authentik OIDC) and link their own accounts. OIDC browser login and the GitLab link are implemented.
- 0017, proposed: delegate interactive execution to Ploeg (the Operator Execution path, implemented opt-in).
- 0018, proposed: bind tracker imports to existing Ploeg work.
- **0023, proposed 2026-09-23, not implemented: Vloer submits Work Items to Ploeg and never executes them.** New routes POST `/operator/work-items` and `/operator/work-items/{id}/commands`; the live view polls `/operator/events`; Operator Executions retire.

## 9. Existing protocol research: verdicts and MCP statements

**`apps/ploeg/docs/research/2026-07-28-a2a-fit.md`**
- Verdict: "adopt nothing now … The one honest fit is a north-facing facade … parked on the watchlist (backlog #102)". A2A fails on fit, not maturity.
- MCP: quotes A2A's self-positioning, *"MCP inside agents, A2A between agents"*.

**`apps/unfold/docs/research/2026-09-17-agent-host-roadmap.md`**
- Verdict: "The harness seam is closed and the host seam is open … De Vloer is on the correct side of it"; conformance is the urgent work.
- Layer table row: "Agent ↔ tools | **MCP** | Inside the harness, below both".
- "**MCP has vacated the seam.** The 2026-07-28 revision removed protocol-level sessions and `Mcp-Session-Id`, removed the initialize handshake, and removed SSE stream resumability and message redelivery."
- VS Code quote: "Extensions can still contribute … tools, MCP servers, and custom agents, but the agent runtime itself runs in the Agent Host process."
- It notes "No protocol-research contract block exists in AGENTS.md".

**`apps/unfold/docs/research/2026-09-18-band-and-the-interaction-layer.md`**
- Verdict: "**Reject BAND as a dependency and mine it for design.** … Authority, budget, provenance and ticket-to-merge delivery are claimed by no protocol and no standards body".
- MCP statements:
  - Layer map: "Agent to tools and context | **MCP 2026-07-28** (Linux Foundation / AAIF) | Below the harness; PV-063 proposes read-only MCP tools". Also "Authorization to call a tool or agent | MCP (OAuth 2.1, RFC 9728, CIMD) … | Bearer tokens; ADR-0016 for people".
  - A grep of the normative `schema/2026-07-28/schema.ts` (3,197 lines) finds 0 for budget, billing, quota, provenance, attest, signature, lease, exactly-once and fencing. The only `cost` hits are `ModelPreferences.costPriority`, inside Sampling, which is deprecated. "A server cannot report what a call cost and a client cannot impose a budget."
  - "MCP Tasks gives a durable handle with a TTL and cooperative cancellation, and has **zero clients on MCP's own extension support matrix**". SEP-2663: `tasks/update` and `tasks/cancel` are eventually consistent.
  - "**MCP got smaller, not bigger.**" The revision removed sessions and initialize, deprecated Sampling ("Integrate directly with LLM provider APIs") and Logging (for OTel), and demoted Tasks to an extension.
  - Thoughtworks Radar cautions "MCP by Default": the "abstraction tax"; "a well-designed CLI … often gives agents everything they need".
  - Simon Willison reversed on 31 July 2026: "MCP tools are easier to audit and control". The dossier says "Any 'MCP is dead' framing is a 2025 artifact."
  - "Slack's MCP server went GA on 17 February 2026, hosted at `mcp.slack.com/mcp` with user-token OAuth".
  - §8.3: "MCP going stateless vacates the session layer … supports ADR-0012".
  - §8.5: David Soria Parra: "MCP has a defined purpose: connecting AI applications to data sources."
  - §8.6: "MCP frames multi-agent as an identity problem" (roadmap of 22 Aug 2026: DPoP, Workload Identity Federation, ID-JAG, RFC 8693).
  - Triggers include the AI Catalog adoption vote at the MCP and A2A steering committees, and any WG chartered for cost, authority, provenance or delivery.
- Landing contract stated in its header: dossier in `apps/unfold/docs/research/`, product ledger `market-landscape.md`, protocol ledger `2026-09-11-ecosystem-alternatives.md`, watchlist as a numbered item in `apps/ploeg/docs/backlog.md`.

**`docs/research/2026-09-22-agents-md.md`**
- Verdict: keep AGENTS.md canonical with a `CLAUDE.md` symlink. The MCP-relevant finding: "The Claude Code adapter currently runs a target repository's hooks and MCP servers without a prompt. That matters more than any prose."
- Recommendation (line 277): add `--settings '{"disableAllHooks":true}'` and `--strict-mcp-config`. This is now done.
- Also: CODEOWNERS on `.mcp.json`, and the AAIF governance note ("AGENTS.md, MCP and goose would move to … AAIF").

**Design statements (normative-ish):**
- `apps/unfold/docs/design/00-product-system-design.md:219`: "MCP is a tool/data interface, not the queue, lease store or budget authority. A future Ploeg/Vloer MCP server can expose narrowly scoped read tools and explicit mutation tools for an already authenticated operator or approved role. It must enforce the same work-order policy as the HTTP API. Never hand a coding agent a generic administrative connector simply because it speaks MCP."
- `apps/unfold/docs/design/ticket-integration.md:121`: "MCP may support operator-authorized discovery and drafting. It is not the reliable subscription, retry, ownership or financial ledger … put any MCP tool invocation behind the same command authorization and idempotency boundary."

## 10. Where findings land

- **Protocol research contract block: none exists.** Three dossiers state this explicitly: `2026-09-17-agent-host-roadmap.md:154`, `2026-09-18-band…md:5`, `2026-09-10-unified-workbench-baseline.md:13`. Root `AGENTS.md` has none.
- Ledgers and alternatives:
  - Protocol ledger: `apps/unfold/docs/research/2026-09-11-ecosystem-alternatives.md` §"Appendix: adjacent components and communication protocols" (line 142; the MCP entry is at 154).
  - Product ledger: `apps/unfold/docs/research/market-landscape.md`.
  - Decision register: `docs/reference/decisions.md`, **generated** by `scripts/docs-decisions.py` / `mise run docs-decisions` from the three ADR ledgers plus `docs/reference/decisions-implementation.yaml`. Do not edit it by hand.
  - Ploeg's `docs/design.md` §8 is the historic "verdict ledger".
- Watchlist and backlog:
  - `apps/ploeg/docs/backlog.md`, "frozen on 2026-09-23"; the tracker owns status. Watchlists are #101 (AHP) and #102 (A2A); `ploegctl` is #96.
  - `apps/unfold/backlog/README.md` plus `backlog.json` (PV-063 MCP, PV-081 AHP stream of Ploeg events).
  - Open questions: `docs/landscape/questions.md`.
- Research directories and conventions:
  - Glide-wide: `docs/research/YYYY-MM-DD-<topic>.md`, with evidence in `docs/research/evidence/<date-topic>/`.
  - Per app: `apps/ploeg/docs/research/` and `apps/unfold/docs/research/`. `apps/ploeg/CLAUDE.md` sets "Evidence goes in `docs/research/YYYY-MM-DD-<topic>.md`". Root `AGENTS.md:25` says "Application contracts, ADRs and research stay inside the application."
  - Research is a "record" type (`docs/documentation.md:23,55,66`) and is linked where it supports a decision, not from the nav.
- Nav:
  - `mkdocs.yml` (TechDocs `techdocs-core`, `docs_dir: .build/docs`, staged by `scripts/docs.py`) lists no research pages. Research is reachable only by links.
  - `docs/index.md` links research only through the inventory sentence at the end.
  - There is no zensical config (`zensical.toml` does not exist).
  - Run `mise run docs-check` after edits. Ploeg ADRs are gated by `go test ./internal/ledger/`.

## 11. Deployment and auth in front

- In this repo, Ploeg is only a ClusterIP Service on 8080. **No ingress hostnames exist in the repo.** Workers use `http://ploeg:8080` (chart goldens).
- Exposure is defined in `webgrip/homelab-cluster`. `apps/ploeg/docs/ops/ci-and-infra.md:26` records that on 2026-09-27 `kubernetes/apps/ploeg/ploeg/app/networkpolicy.yaml` admitted no Forgejo traffic, so webhook wiring was pending.
- Vloer ADR-0015 describes the intended exposure: internal gateway serves `/`, the external gateway serves only `/webhooks/`, and webgrip lacked an internal HTTPRoute for Ploeg.
- Auth in front: **no oauth2-proxy anywhere (0 hits).**
  - Authentik appears only as the estate OIDC issuer (Vloer ADR-0015 and ADR-0016).
  - Vloer implements OIDC itself (`src/oidc.ts`: authorization code plus PKCE, JWKS verification, `roleClaim`/`groupsClaim` mapping).
  - **Ploeg has no OIDC or OAuth code.** Its operator API uses static named bearer consumers; OIDC for Ploeg is only proposed in Vloer ADR-0015.
  - Other OIDC mentions are CI signing via OpenBao short-lived OIDC (`rotate-credentials.md:33`, `ci-and-infra.md:30`).
- Secrets policy: ADR-0055 in homelab-cluster (OpenBao and ESO). Operator tokens use `tokenSecret` → `secretKeyRef`, controller-only (`pkg/config/operator_chart_test.go`).

## 12. Multi-tenancy

- **Code: zero.** `grep -rni tenant` over `apps/ploeg/pkg`, `apps/ploeg/cmd`, `apps/unfold/src` and both Helm charts returns 0. So do `organization`, `org_id` and `tenant_id`.
- The only scoping primitives today:
  - Ploeg **Team**: `OperatorPrincipal.Teams`, `AllowsTeam`, team-scoped reads returning 404 outside scope.
  - Per-consumer `maxBudgetUsd`.
  - Vloer's `ploeg.teams` / `ploeg.userTeams` plus roles admin/operator/viewer.
  - Per-user linked accounts.
- Tenancy exists only in the unmerged agency ADR-0009, in the `docs/domain` vocabulary on that branch (tenant, client), and in Vloer backlog PV-034 "Map organization, client, project and team authorization", which PV-063 depends on.
- Implication for an MCP server: today's authorization unit is (consumer token → team set), plus an actor header asserted by a trusted consumer. There is no per-person identity inside Ploeg.
