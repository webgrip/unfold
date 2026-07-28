# Ploeg — improvement backlog (103 items)

Compiled 2026-07-22 from the design doc, the domain model, the code skeleton, and a
research sweep of adjacent solutions (misospace/dispatch, kandev, vibe-kanban,
untra/operator, Argo Workflows, Tekton, KEDA, kubernetes-sigs/agent-sandbox, kagent,
ACP, Claude Code/opencode headless, Postgres-as-queue prior art, forge token scoping,
Vikunja/Forgejo webhook mechanics, sandboxing practice). Items marked *[research]*
are directly sourced from that sweep.

Everything here stays inside the accepted problem space (design.md §2). Explicitly
**not** on this list: any kanban/board UI, persistent agents, model serving or cost
ledgering, grooming semantics, and a core-maintained connector matrix.

Ordering within a section is roughly build-order; sections are roughly
roadmap-phase order.

---

## A. Webhook ingest (ploegd) — 1–10

1. **HTTP ingest endpoints** — `/webhooks/tracker/{provider}` and `/webhooks/forge/{provider}`, routed through the compile-time provider registry.
2. **Signature verification enforced** — reject unsigned/invalid; both Vikunja (`X-Vikunja-Signature`) and Forgejo (`X-Forgejo-Signature`) are raw-body HMAC-SHA256, so verify against raw bytes before JSON parsing. *[research]*
3. **Fast-ack pipeline** — verify → dedup → durably enqueue → return 202; Forgejo's `DELIVER_TIMEOUT` defaults to 5 s, so no synchronous processing in the handler. *[research]*
4. **Delivery-id idempotency** — dedup on `X-Forgejo-Delivery` UUID; Vikunja sends no delivery id or timestamp, so synthesize one (hash of event_name+time+task id+updated) and keep a TTL'd dedup store. *[research]*
5. **Normalized internal event envelope** — adopt the Standard Webhooks shape (id, timestamp, signature over `id.ts.payload`) at the edge, whatever the vendor sent. *[research]*
6. **Reconciliation sweep** — Vikunja **never retries** failed deliveries; a periodic "items updated since last sync" poll per provider is the mandatory backstop, run as a Postgres-lock-guarded singleton with per-run audit rows. *[research]*
7. **Thin-payload rule** — treat every webhook as a trigger to fetch authoritative state via the provider; gate on monotonic fields (WorkItem.Revision, PR head SHA) and drop stale events, since no sender guarantees ordering. *[research]*
8. **Assignment handling** — normalized `assigned` event → ingested→queued transition for the resolved Team; unassigned → cancel running Run and release the Lease.
9. **Follow-up classification on ingest** — actionable forge feedback → queued Follow-Up; vague or security-sensitive → needs_human, per R4/R9; classifier pluggable. Paperclip's low-trust lesson applies here: external review text is a prompt-injection carrier into higher-trust context — they disable child→parent report comments for review-contained presets (depth-1 deduped system relay instead) and had to re-scope PR-gardening to *instance-authored PRs only* after shipping it broader. Treat forge feedback as untrusted input to the next run, not as trusted instructions. *[research: paperclip sweep 2026-07-28]*
10. **Follow-up dedup by natural key** — upsert on (repo, PR); append new feedback strings bounded and unique instead of spawning duplicate items when the same check fails repeatedly. *[research: misospace/dispatch]* Paperclip's stop-fingerprint is the proven generalization: hash the durable state that triggered the item, suppress re-fire while the fingerprint is unchanged, and treat "I fixed it" claims as arming bounded verification rather than permanent suppression. *[research: paperclip sweep 2026-07-28]*

## B. Core semantics & state (ploegd) — 11–20

11. **State machine in one place** — legal Work Item transitions only, exactly as in `docs/domain/model.yaml`; illegal transitions are errors, not silent coercions.
12. **Code/model alignment** — add `needs_human` state and `origin`/`priority` fields to `pkg/work/types.go`; CI check that Go enums match the domain model.
13. **Lease manager** — acquire (unique per Work Item), renew, expiry sweep with jitter; expiry reason recorded in audit.
14. **Lease conflict = 409 + operator force-claim** — competing acquisition gets a conflict; `force` (operator-only) steals atomically with before/after in the audit row. *[research: misospace/dispatch]*
15. **Retry budget & stale threshold** — per-team N expiries/failed outcomes before stale (R5); poison-item detection (identical failure loop) distinct from stale. Paperclip's bounding rule for the poison case: one automatic continuation per *recovery fingerprint* (hash of the evidence that triggered recovery), then escalate visibly — "unchanged evidence must not create an infinite wake/recovery loop"; new durable activity mints a new fingerprint and re-earns a retry. Sharper than a bare attempt counter because progress resets the budget while spinning doesn't. *[research: paperclip sweep 2026-07-28]*
16. **Deterministic checkpoint→next-action contract** — the report API returns the bounded next step computed from the stored Checkpoint, so any successor Run (even a different harness) resumes identically after a crash. *[research: misospace/dispatch]* The moment successor runs exist, adopt paperclip's checkout-finalization CAS rules: finalization compare-and-clears ownership only when it still points at the finalized run, never clears a lock a successor already reacquired, and a retry handoff must not leave ownership pinned to the dead run — their race checklist for exactly the resume era this item creates. *[research: paperclip sweep 2026-07-28]*
17. **Report API** — POST outcome / POST checkpoint, authenticated with a per-Run bearer token minted at spawn.
18. **Follow-ups outrank new work** — within a Team Queue, items that unblock an existing PR sort ahead of fresh Work Items. *[research: misospace/dispatch]*
19. **Priority-then-FIFO queue discipline** — tracker-mirrored priority first, creation time second (R10), same ordering for lease-wait queues. *[research: Argo]*
20. **Config, dry-run, ops endpoints** — env+file config with boot validation; `--dry-run` (log what would spawn); `/healthz`, `/readyz` (DB ping); graceful shutdown; structured `slog` with work_item/team/run correlation fields.

## C. Postgres data layer — 21–30

21. **Migrations** — golang-migrate or sqlc-style versioned migrations for `work_items`, `leases`, `checkpoints`, `agent_runs`, `audit_log`, `teams`, `webhook_events`. Adopt paperclip's authoring checklist as a CI gate once tables grow: index the batch predicate *before* any backfill loop, keyset pagination never OFFSET, `CREATE INDEX CONCURRENTLY` on large tables, and schema/index/backfill as separate phases — codified after their unindexed-predicate backfill went O(n²) in production. *[research: paperclip sweep 2026-07-28]*
22. **One live lease per item** — partial unique index enforcing R1 at the schema level, not just in code.
23. **SKIP LOCKED claim** — `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, committed immediately; the lease columns are the lock, never a held transaction. *[research]*
24. **One poll-query shape** — exactly one claimable-items query, with a narrow partial index that covers it precisely (Solid Queue discipline). *[research]*
25. **Transactional enqueue** — work-item insert/state change + audit row commit in a single transaction so items are never phantom (River's core argument for queue-in-DB). *[research]*
26. **Bloat management** — fillfactor 70–80 on hot tables for HOT updates, aggressive per-table autovacuum, and an archive table for done items instead of vacuum churn (pgmq `archive()` model). *[research]*
27. **Advisory-lock hygiene** — session-scoped advisory lock on a direct `-rw` connection for singleton roles; only xact-scoped locks through any pooler (PgBouncer transaction mode breaks session locks). *[research]*
28. **No LISTEN/NOTIFY dependency** — jittered polling is the source of truth (NOTIFY serializes commits under load and drops messages on disconnect); at most an optional empty-payload fast-path. *[research]*
29. **CNPG deployment guide** — `-rw` service for writers, synchronous replication so committed enqueues survive failover, plugin-barman-cloud for WAL/PITR, and a documented note that PITR-restored in-flight leases self-heal via the expiry sweep. *[research]*
30. **Retention** — TTL/partition policy for `audit_log` and `webhook_events`; failed-run records kept longer than successes.

## D. Provider SPI & reference providers — 31–38

31. **Vikunja TrackerProvider** — webhook parse+verify, FetchItem, Comment, SetStatus; per-project webhook registration documented (there is no instance-wide hook). *[research]*
32. **Forgejo ForgeProvider** — webhook parse+verify (subscribe: pull_request, pull_request_sync, review events, issue/PR comments, status), Comment; add the PR/branch-state read the design promises but the interface lacks.
33. **Provider conformance kit** — golden webhook fixtures per provider version, replay tests, and a certification checklist for community providers.
34. **SPI versioning policy** — written compatibility promise: what constitutes a breaking change, deprecation windows, when out-of-process providers graduate.
35. **Provider error taxonomy** — retryable vs permanent errors in the SPI so the core can back off correctly (Svix-style schedule for outbound write-backs). *[research]*
36. **Assignee→Team mapping** — configurable resolution from tracker assignee to Team manifest name, per provider.
37. **Write-back templates** — comment formats and the SetStatus mapping of Ploeg states to provider labels/columns, configurable per provider.
38. **Delivery-id passthrough** — normalized events carry the provider delivery id end-to-end for audit correlation.

## E. Teams & manifests — 39–45

39. **Team manifest schema** — YAML: name, Roles (harness image, model, resources), strategy, budget; validated on apply, mirrored to the `teams` table.
40. **`ploegctl apply`** — apply/diff team manifests; manifests live in git, the DB mirrors them.
41. **Per-team concurrency cap** — max concurrent Leases per team as a semaphore table with holder/waiter rows, priority-then-FIFO grant order. *[research: Argo synchronization]*
42. **Per-repo mutex** — optional serialization of Runs touching the same repository, preventing two teams' branches from racing on one codebase. *[research: Argo]*
43. **Sequential strategy v1** — role chaining on a shared branch within one Lease; parallel strategy deferred until demanded.
44. **Budget plumbing** — Team token/resource budget flows into TaskSpec and maps to native harness levers (`--max-budget-usd`, `--max-turns`); budget exhaustion becomes a distinct outcome, not generic failure. *[research]* Gate placement matters as much as the limit: paperclip checks the budget block *before dispatch* (no run spawned, no attempt burned) and *re-checks at invocation* (cancel-with-reason if spend crossed the line in between), with `budget_blocked` as a distinct error code — for us that means the budget check belongs before Claim, not inside the run. *[research: paperclip sweep 2026-07-28]*
45. **Autonomy tier per work-item class** — a work item classification that drives lease policy (concurrency, human-gate before dispatch) from one field, instead of separate knobs. *[research: untra/operator]*

## F. Execution (KEDA / Jobs) — 46–58

46. **Executor interface + KEDA implementation** — `(spawn, watch, cancel)` with KEDA ScaledJob per team as flagship. **Done 2026-07-28 at the API/Helm layer**: the executor SPI is the run API, formalized in [contracts/executor.md](contracts/executor.md) (+ `GET /api/v1/queue/depth`); `executor.type: keda | cronjob` over one shared pod-template helper, CronJob as the working second executor. A Go interface is deferred until a controller-based executor (#55/#58) gives it a caller.
47. **Correct scaler config** — query counts only claimable rows, `targetQueryValue: 1`, `accurate` scaling strategy; never `eager` (open over-scaling bug kedacore/keda#6416); read-only scaler DB role; partial index so the 30 s poll stays index-only. *[research]*
48. **Worker-claims-at-startup** — KEDA cannot inject per-row payloads into Jobs (kedacore/keda#5100), so the agent container's entrypoint claims its Work Item and fetches its TaskSpec from ploegd at boot. *[research]*
49. **Empty-handed worker = successful no-op** — entrypoint exits 0 when no claimable item exists; this single convention neutralizes every scaler-overshoot failure mode. *[research]*
50. **`rollout.strategy: gradual`** — ScaledJob spec updates must never kill in-flight agent Runs. *[research]*
51. **Ploeg owns retries** — `restartPolicy: Never`, `backoffLimit: 0`; every pod failure is one auditable Run, re-queue decisions live in the dispatcher (a restarted pod would claim a different item anyway). *[research]*
52. **`activeDeadlineSeconds` slightly above lease TTL** — the DB lease always expires first (Ploeg decides); the K8s deadline is only the backstop that guarantees the pod dies.
53. **Disruption ≠ failure** — `podFailurePolicy` with `DisruptionTarget: Ignore` so node drains/evictions re-dispatch silently from checkpoint instead of counting as failed outcomes. *[research: K8s Jobs]*
54. **Reserved exit codes in the harness contract** — e.g. 0 = outcome posted, 42 = stuck, 43 = transient; mirrored in `podFailurePolicy.onExitCodes` and outcome ingestion, so an agent dying before POSTing still yields a classified result. *[research]*
55. **Always-runs finalizer path** — outcome writing, lease release, and tracker write-back must execute on *every* terminal path (success, failure, cancel, timeout, retry-exhausted, lease-stolen) via the controller watch, never only inside the agent process; test each path explicitly (Tekton needed three releases to get `finally` right). *[research: Argo onExit, Tekton]*
56. **Differential retention** — patch Job TTL by outcome: short for success, long (or manual GC) for failed/stuck, and ship logs continuously since a timed-out pod's logs are deleted with it. *[research: Tekton]*
57. **Cancellation as one operation** — kill + workspace cleanup + `cancelled` terminal event; cancellations are never auto-retried; team pause via the ScaledJob paused annotation / Job `suspend`. *[research: kandev, Tekton]*
58. **agent-sandbox executor (v2 track)** — second Executor targeting `Sandbox`/`SandboxClaim` CRDs (pin v1beta1/v0.5.x), giving warm pools and `operatingMode: Suspended` parking; keep it behind the same interface. *[research]* A production reference implementation now exists: paperclip's Kubernetes sandbox provider builds `agents.x-k8s.io/v1alpha1 Sandbox` CRs (note: alpha pin, older than ours — verify which API version is current before building), alongside Cilium/NetworkPolicy egress scoping, an image allowlist, tar-over-exec file sync, and lease semantics matching ours ("a lease whose pod died can never be resumed; mark expired, fall back to fresh acquire"). Read `packages/plugins/sandbox-providers/kubernetes/` before designing this; also copy their startup-latency discipline (per-step round-trip attribution per provider). *[research: paperclip sweep 2026-07-28]*

## G. Harness contract & adapters — 59–70

59. **Published JSON Schemas** — versioned schemas for TaskSpec and OutcomeReport; validation at the report API (mandatory `stuck_reason` when stuck). **Done 2026-07-28**: [contracts/](contracts/) v1 schemas pinned to the Go types by `pkg/harness/contract_test.go`; the outcome API accepts the full OutcomeReport (checkpoint + usage inline) and 400s stuck-without-reason.
60. **Outcome enum refinement** — split `failed` by `failure_kind` (infra vs agent vs limits) and add `timed_out`/`budget_exceeded` as first-class terminals; the whole industry separates these (Copilot, SWE-agent, OpenHands). *[research]* Paperclip adds the class *before* all of these: known pre-dispatch conditions (missing secret/env binding, unresolvable config) are a **gate outcome**, never a dispatched run — "a dispatched-then-failed run is the wrong shape for missing configuration." Same insight as our stuck/failed inversion fix (VIK-596): the worker already builds its adapter before claiming; extend that to full config validation pre-Claim so a guaranteed-to-fail run never burns an attempt, mints a key, or parks an item in needs_human. *[research: paperclip sweep 2026-07-28]*
61. **Partial artifacts on every exit** — checkpoint and links populated on stuck/failed too, not just success (SWE-agent autosubmits on `exit_cost`; OpenHands pushes a progress branch on failure); make this a rule (R-candidate). *[research]*
62. **Claude Code adapter** — `claude --bare -p --output-format json --json-schema <OutcomeReport>` with `--max-turns`, `--max-budget-usd`, `--permission-mode dontAsk` + explicit allowlist; parse cost/usage/session_id from the single JSON result. *[research]* **Adapter landed 2026-07-28** (`pkg/harness/adapters/claudecode`: `-p --output-format json --permission-mode bypassPermissions` by default — `dontAsk` is not a real CLI mode; override via `PLOEG_CLAUDE_PERMISSION_MODE`; envelope cost/usage/session_id → OutcomeReport.usage). Still open: `--json-schema` structured outcomes, `--max-turns`/`--max-budget-usd` plumbing (#44), and a claude-runner image in webgrip/infrastructure before a team can actually run it.
63. **opencode adapter** — `opencode serve` + synchronous `POST /session/:id/message` (returns cost + token breakdown per message); locked-down `permission` block rather than blanket `--auto`; own the storage GC (no built-in pruning). *[research]*
64. **ACP adapter** — one adapter over the Agent Client Protocol covers OpenCode, Gemini CLI, Goose, OpenHands and more; implement `session/request_permission` programmatically, map stopReason to outcomes, pin protocol v1 (v2 is draft as of 2026-07). *[research]* Re-confirmed 2026-07-27: the client↔agent seam has consolidated on ACP (JetBrains, Zed, AWS Kiro, Copilot CLI `--acp`, OpenHands Agent Canvas; even Microsoft's AHP docs name ACP as their downstream layer), and structured `session/update` + stopReasons would replace the PR-poll/log-tail outcome inference and fix the stuck-vs-failed inversion (architecture.md §9.9, VIK-596) at the source. *[research: AHP sweep]* Re-confirmed again 2026-07-28: paperclip (75k★) ships ACP as its *richest* adapter tier via its `acpx` engine — event vocabulary `session` / `status` (incl. context-window usage) / `text_delta` / `tool_call` (status updates folding) / `result` (stop reason) / `error` (code + retryability) is the concrete event→OutcomeReport mapping to target; their Claude/Codex/Gemini adapters all prefer it over CLI-JSON parsing. *[research: paperclip sweep]* Re-confirmed a third time 2026-07-28: OpenHands closed its A2A tracking issue as not_planned (OpenHands/software-agent-sdk#1060) and shipped ACP on its new SDK instead — the harness we run today chose the protocol this item bets on. *[research: A2A sweep]*
65. **Stuck detection in the adapter** — loop heuristics (identical action-observation repeats, error repeats, ping-pong) promoting to a `stuck` outcome with reason, borrowed from OpenHands' StuckDetector thresholds. *[research]*
66. **Usage in the OutcomeReport** — optional tokens/cost fields (both flagship harnesses emit them natively) plus the designed trace-id/ledger-key passthrough; Ploeg links, never collects. **Wire format reserved 2026-07-28** (`usage` in outcomereport.v1 + `agent_runs.usage` JSONB, populated by the claude-code adapter); dashboards/consumers still open.
67. **Checkpoint tiering** — tier 1: branch + draft PR (survives everything, the Copilot-proven blueprint); tier 2: harness session state on a volume/object store for exact resume (Claude Code's cwd-scoped `~/.claude/projects`, opencode's `opencode.db`); tier 3: plan/status markdown in the branch. Each tier degrades into the next. *[research]*
68. **Idempotent checkpoint units** — side effect + checkpoint written as one idempotent unit keyed by (work item, phase), so resume never double-fires a side effect. *[research: Diagrid critique]*
69. **Adapter SDK + conformance suite** — a small library (claim, heartbeat, report) plus contract tests any new adapter must pass; exit-without-report scenarios included. **Seeded 2026-07-28**: `pkg/harness/harnesstest` runs a conformance kernel (runnable invocation, no-fabricated-outcomes, cancel-kills) over every in-tree CommandAdapter; the out-of-process SDK remains open.
70. **Resume mechanics per harness** — stable mount paths (Claude Code resume is cwd-scoped), `--session-id` pre-assignment, fork-on-retry semantics documented per adapter.

## H. Security — 71–80

71. **Default-deny egress** — NetworkPolicy/Cilium `toFQDNs` allowlist examples (LLM API, forge, package registries) shipped as code; documented gotchas (DNS-lookup requirement, per-hostname IP cap). *[research]*
72. **Optional CONNECT-only egress proxy** — Squid/Envoy domain allowlist for per-request audit logs on top of the network floor; enforced by policy so the agent can't bypass. *[research]*
73. **Hardened Job pod baseline** — runAsNonRoot, readOnlyRootFilesystem + sized emptyDirs (/workspace, /tmp, cache), drop ALL caps, seccomp RuntimeDefault, no SA token automount, resource + ephemeral-storage limits (kagent/Northflank-validated defaults). *[research]*
74. **RuntimeClass per team** — gVisor/Kata selection in the manifest with placement guidance (bare metal → Kata; VMs without nested virt → gVisor systrap; note gVisor's file-I/O penalty for clone-heavy runs). *[research]*
75. **Forge token broker** — per-Run repo-scoped Forgejo v15 tokens minted via API and **actively deleted** on outcome (Forgejo PATs never expire); machine-user-per-team fallback pre-v15; GitHub App installation tokens (1 h, down-scoped at mint) when the GitHub provider lands. *[research]*
76. **Workload identity for the broker** — Jobs authenticate with projected audience-bound ServiceAccount tokens; minted token TTL aligned to `activeDeadlineSeconds` + buffer. *[research]*
77. **Git credential injection** — credential helper / `GIT_ASKPASS` from env only; never `.netrc` or token-in-URL. *[research]*
78. **Optional LLM credential proxy** — per-Run virtual keys against an operator-provided gateway holding the real key (defuses prompt-injected key exfiltration); Ploeg configures the base URL, the gateway stays out of scope. *[research: kagent pattern]*
79. **Threat model + SECURITY.md** — prompt-injection exfiltration, webhook forgery/replay, lease theft, report-API spoofing; per-scenario mitigations mapped to items above.
80. **Supply chain** — distroless nonroot images, signed + digest-pinned, SBOM in releases; secrets in-repo only via SOPS (webgrip convention).

## I. Observability — 81–86

81. **Prometheus metrics** — queue depth per team, lease age, stale/needs_human counts, run durations, outcomes by type, webhook verify/dedup failures, reconciliation drift.
82. **OTel tracing** — one root span per Run with child spans for claim/checkpoint/outcome/write-back, plain OTLP exporter config; trace id passthrough into harness telemetry where supported. *[research: kagent]*
83. **Grafana dashboards as code** — stale leases, stuck/needs_human queue with age, outcomes by team, run durations, spend-per-team panel fed from OutcomeReport usage (links, not collects).
84. **Alert rules as code** — stale threshold tripped, needs_human backlog age, webhook delivery failures, scaler query latency, reconciliation divergence.
85. **Audit completeness** — every mutation *and every denied/conflicted attempt* (failed lease acquisitions included) logged with actor and before/after; a SQL cookbook of common audit questions. *[research: misospace/dispatch]*
86. **needs_human notification hook** — outbound webhook/ntfy on entry to needs_human with the mandatory reason; explicitly not a UI. Make the payload routable, not just readable: paperclip *rejects* prose-only blocked states — entering blocked requires a machine-routable waiting path (blocker edge, pending interaction naming a responder, or a structured `{owner, action}` unblock descriptor; "prose-only blocked routes to nobody"). Upgrade `stuck_reason` with an optional structured `{owner, action}` descriptor in the OutcomeReport so this hook has a routing target and the needs_human queue can answer "who unblocks this, by doing what" without a human reconstructing the thread. *[research: paperclip sweep 2026-07-28]*

## J. Testing & release engineering — 87–93

87. **State machine + lease manager unit tests** — table-driven over every legal/illegal transition and expiry path.
88. **Integration tests with real Postgres** — testcontainers: claim races, SKIP LOCKED under concurrency, transactional enqueue, dedup store.
89. **e2e on kind** — fake tracker/forge + real KEDA: webhook → queued → Job → outcome → write-back round trip.
90. **Chaos path coverage** — kill the pod mid-run (lease expiry + checkpoint resume), duplicate webhook replays, scaler overshoot with empty-handed workers, and an explicit test that the outcome-writer runs on all terminal paths from item 55.
91. **Golden fixtures** — recorded Vikunja/Forgejo webhook payloads per version, replayed in CI against providers.
92. **CI hardening** — golangci-lint, govulncheck, `-race`, coverage gate on `pkg/work` and the lease manager.
93. **Release pipeline** — goreleaser: multi-arch images to Forgejo registry + GHCR mirror, signed, changelog; version stamped into `ploegd`.

## K. Packaging, docs & governance — 94–103

94. **Helm chart** — ploegd, migrations job, ScaledJob templates, dashboards, network policies; CNPG cluster example values.
95. **Quickstart demo** — kind + Vikunja + Forgejo + one team in ~15 minutes; the "watch a ticket become a PR" moment that sells the elevator pitch.
96. **`ploegctl` operations CLI** — status, queue ls, needs-human ls (with reasons), stale ls, requeue, force-claim, team pause/resume; the operator surface, deliberately not a board.
97. **ADRs** — record the already-made decisions (Go, Apache-2.0, KEDA-as-default, lease model, Postgres-only state, provider-neutrality rule) in MADR format so future contributors inherit the *why*.
98. **Contributor + provider docs** — CONTRIBUTING, provider authoring guide against the conformance kit (D33), SPI godoc examples; community-owned-providers policy stated plainly.
99. **Domain-language enforcement** — regenerate `docs/domain/` in the same commit as model changes; CI check for `avoid`-listed terms (claim-as-noun, job-as-domain-term, crew) in code identifiers and docs.
100. **Review-gate instrumentation** — lightweight adoption signals (stars/forks/issue authors/provider PRs) collected quarterly toward the 2027-04 "product vs personal infrastructure" gate, so the decision is made on data.
101. **AHP watchlist — live run surface** — a Microsoft Agent Host Protocol "projector" over run events (sessions ≈ agent_runs, tool approvals ≈ needs_human, `session/inputNeeded` ≈ the human queue) as a separate service, never the worker (R6: durable state stays in Postgres + git/forge). Blocked until AHP ≥ 1.0 **and** a production non-Microsoft host exists (watch wyrd-company/ahp-server) or an OpenHands↔AHP bridge appears; the ACP adapter (64) is the prerequisite either way. *[research: 2026-07-27 AHP sweep]*
102. **A2A watchlist — north-facing dispatch facade** — expose ploegd as an A2A remote agent (`a2a-go/v2`: signed AgentCard at `/.well-known/agent-card.json`, skills = teams; `SendMessage` → create+assign a tracker ticket via the TrackerProvider so the board stays authoritative — never a direct `work_items` insert; `GetTask`/`ListTasks`/`SubscribeToTask` project `work_items`+`agent_runs` with the ~1:1 state mapping queued→`SUBMITTED`, leased→`WORKING`, needs_human→`INPUT_REQUIRED`, done→`COMPLETED`; PR link as `Artifact`; `CancelTask` ≈ unassignment, #8) as a separate service, never the worker (R6). Prerequisites: tracker write-backs (#31) and a ploegd single-item read endpoint. Blocked until a real A2A client exists in the stack: kagent (A2A-native) deployed in homelab-cluster (watch kagent-dev/kagent#1941 spec-1.0 migration), an OpenHands reversal (OpenHands/software-agent-sdk#1060 was closed not_planned 2026-06 — they shipped ACP instead, validating #64), A2A gaining queue/pub-sub transport (a2aproject/A2A#1029 — would also make it an executor-seam candidate), or the 2027-04 review gate (#100) demanding a product-grade dispatch API. Near-term A2A experiments go through LiteLLM's Agent Gateway (already deployed; OpenAI-compat↔A2A bridge), kept away from factory credentials. Explicitly rejected: A2A between factory internals (worker↔harness, dispatcher↔worker) — one trust boundary, N² point-to-point HTTP, no lease/queue semantics. Verdict ledger: design.md §8; full dossier: [research/2026-07-28-a2a-fit.md](research/2026-07-28-a2a-fit.md). *[research: 2026-07-28 A2A sweep]*
103. **Retire `PLOEG_TEAM_MAP`** (Teams concern, appended in number order) — resolve assignee→team from Vikunja team membership at runtime (factory-user JWT, cached) instead of the static env map; an unknown assignee drops the event, which also removes the `PLOEG_DEFAULT_TEAM` footgun that today silently routes a stranger's ticket to a real team. Depends on the Vikunja 2.4.0 upgrade (bot users are the provisioning primitive) and on the roster manifest + reconciler landing in homelab-cluster — this repo owns only the lookup. Full verdict: [research/2026-07-28-agent-roster-ssot.md](research/2026-07-28-agent-roster-ssot.md). *[research: 2026-07-28 roster SSoT sweep]*

---

## Rejected along the way (boundary check)

Considered and excluded as outside the accepted problem space: a web dashboard for
queues (Grafana + `ploegctl` cover it), built-in grooming/DoR semantics (operator
concern; open ambiguity in the domain model), an LLM gateway/cost ledger of our own
(LiteLLM et al.; Ploeg links via trace/ledger keys — re-confirmed 2026-07-28 against
OmniRoute, rejected with flip triggers recorded in design.md §8 *[research: OmniRoute
sweep]*), a Ploeg-maintained provider
matrix beyond the two references, GKE-only Pod Snapshot fast-resume (vendor lock;
agent-sandbox `Suspended` mode is the portable path), and Argo Workflows as the
execution substrate (a second orchestration system to operate — its *semantics* were
mined instead, see items 41, 42, 55, 56).
