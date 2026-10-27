# Angle 2 — Source repo dig: Hive, Beads and KubeStellar Console (as of 2026-10-27)

**Method.** `gh api` for repository facts and pull request counts; read-only `git clone --filter=blob:none` of each repository into the session scratchpad, read with `git log`, `grep` and `sed` only. Nothing from the clones was run. Three claims were re-checked first-hand after the agent's report: `SelfMergeMinACMMLevel` in `automerge_sweep.go:423`, `DefaultThreshold = 3` in `escalation.go:32`, the cumulative `.merged += $count` in `auto-qa-tuner.yml:144`, the `--dangerously-skip-permissions` launch in `manager_launch.go`, and the Tier 2/3 bypass in `EvaluateForAppSelfMerge` (`intent.go:252`). `gh api repos/kubestellar/hive` resolves to `hivecommons/hive`.

Both reference repositories named in the paper have moved: `kubestellar/hive` → [hivecommons/hive](https://github.com/hivecommons/hive) (default branch `v5`, HEAD `3f307bb4`), `steveyegge/beads` → [gastownhall/beads](https://github.com/gastownhall/beads) (HEAD `5011528b`). [kubestellar/console](https://github.com/kubestellar/console) is unchanged (HEAD `88bf46ed`).

## 1. Repo facts

| | hivecommons/hive | gastownhall/beads | kubestellar/console |
| --- | --- | --- | --- |
| Stars | 77 | 28,241 | 152 |
| Language, licence | Go, Apache-2.0 | Go, MIT | TypeScript + Go, Apache-2.0 |
| Created | 2026-04-17 | 2025-10-12 | 2026-01-16 |
| Last push | 2026-10-27 | 2026-10-27 | 2026-10-27 |
| Commits | 10,633 | 11,457 | 12,100 |
| Releases | 570 tags; v5.186.4 on 2026-10-18; 5–15 tags a day in October | v1.3.2 on 2026-10-24 | nightly prereleases, v0.3.43-nightly.20261027 |
| Open issues / PRs | 42 / 23 | 1,076 / 473 | 12 / 8 |
| PRs merged / closed unmerged since 2026-09-27 | 2,918 / 106 | 593 / 33 | 489 / 16 (`label:ai-generated`: 462 / 7) |

**Contributor concentration.** Hive: Anderson 68.7 % of commits, bots 21.4 %, next human 4.3 %. Console: Anderson 53.2 %, Hive bots 29.6 %. Beads: Steve Yegge 41.4 %, agent identities about 8 %, several other humans above 100 commits.

**Branch protection.** Hive `v5` requires 11 checks for everyone (gate, DCO, build-and-test, test, coverage, golangci-lint, gosec, govulncheck, changelog guard, PR contents, sign-off). Console `main` requires only `build-gate`, enforced for non-admins; Console's `CLAUDE.md` tells agents tide can be bypassed with `--admin`.

## 2. Hive as built

Hive is now "Hive Commons", with a hosted hub at `hive.hivecommons.dev`. Its level names differ from the paper since [#14317](https://github.com/hivecommons/hive/pull/14317) (2026-10-26): L1 Inception, L2 Advisory, L3 Quality-Gated, L4 Security-Aware, L5 Semi-Autonomous, L6 Autonomous. The README: "Humans still merge… Start at 'open PRs only'; once you trust it, turn the setting up to merge on green."

**Process model** (`src/docs/architecture.md` §2). One container: a Node proxy, the Go `hive` binary (governor, agent manager, dashboard, a MITM GitHub proxy, an inference translator, hub heartbeat, token collector) and ttyd. Each agent runs in its own tmux session, optionally under its own Unix UID.

**Roles.** Level packs `src/pkg/config/packs/level-{1..6}.yaml` set the roster, model, mode (`ADVISORY`, `ISSUES_ONLY`, `ISSUES_AND_PRS`, `ISSUES_PRS_MERGE`) and cadences. The L6 roster: supervisor, scanner, ci-maintainer, quality, guide, sec-check, architect, strategist, outreach, reviewer, adjudicator, dedupe, brainstorm, telemetry, operations. The reviewer pool sets `exclude_author_model` and `exclude_author_family`. Mode ladder in `src/crux/agentmode/agentmode.go`.

**Governor** (`src/pkg/governor/governor.go`). Modes SURGE, BUSY, QUIET, IDLE on queue depth (actionable issues plus open PRs). Base thresholds 20/10/2 (`src/pkg/config/config.go:2188-2190`), scaled by repository count unless set explicitly. Packs L4–L6 seed 10/5/2. A comment in `level-4.yaml` records that pausing workers in SURGE meant the queue never drained.

**Merge decision.**

* `merge_policy`: L1–L2 manual; L3–L5 hold-gated (every agent PR gets `hold`, no agent merges); L6 auto-merges on green. App self-merge requires `SelfMergeMinACMMLevel = 6` (`src/pkg/github/automerge/automerge_sweep.go:423`).
* Risk tiers in `src/pkg/intent/intent.go`. Tier 3 when a file matches a guardrail path (defaults `.github/workflows/**`, `**/gh-wrapper*`, `**/proxy/rules*`, `policies/**`, `hive.yaml`, `OWNERS`, `CODEOWNERS`); Tier 0 docs- or tests-only and additive (weakened tests make it Tier 1); Tier 2 a feature signal in title or labels; Tier 1 otherwise. Evidence needed: none, a linked issue, an approved plan or a person, a person.
* `EvaluateForAppSelfMerge` (`intent.go:252`) returns `Authorized: true` for Tier 2 and Tier 3 App PRs without a person's approval, because Prow forbids self-approval. Only `auto_merge.human_merge_paths` (`automerge_human_paths.go`, fails closed when the file list is incomplete) stops a guardrail-path PR at L6.
* Other gates: the evaluated head SHA must equal the merged one (`src/cmd/hive/merge_eligibility.go:288-301`), current base, required checks, a person's changes-requested, the reviewer verdict, a merger allowlist.
* `src/pkg/sentinel/sentinel.go` (eight rules including CI-gate weakening and test gutting) only labels; it "never blocks on its own".

**Fix loop.** `src/pkg/escalation/escalation.go:32`, `DefaultThreshold = 3` distinct red head SHAs, then `needs-human` with the raw CI excerpt. Added after the Console incident of 2026-07-31 to 08-04, when `main` stayed red for four days while the scanner opened fix PRs without seeing the error.

**Health.** Watchdog modes off, observe (default), heal (`src/crux/config/watchdog.go`); restart backoff 1–16 min, pause after 5 failures; busy-without-output threshold 30 min. Spokes heartbeat to the hub every 2 min and the hub can answer with an upgrade-to-SHA callback.

**Rollback.** No automated revert (zero hits for `git revert|RevertPullRequest|createRevert`). Change-failure evidence from reverts and reopened issues is recorded and "never read back into a merge decision" (`src/pkg/evidence/change_failure.go`). Optional `autonomy.auto_demote` lowers a repository one level on rollback or rework; off by default. Manual runbook: `src/docs/running-at-level-6.md`, "After a bad merge".

**Money.** `governor.budget` (`config.go:3005`): weekly tokens, USD or coins, `critical_pct` 90. Exhaustion stops new kicks, not a running turn; agents can be exempted; no limit by default. USD is list price times session token counts, not a billing feed (`architecture.md` §9). No per-run or per-task budget.

**Credentials.** Agents act as a GitHub App. The installation token is minted without narrowing (`MintInstallationToken(ctx, nil)`, `src/pkg/hub/feedback.go:292`). Narrowing comes from per-mode tool denials, unsetting `GH_TOKEN` for agents that cannot push, and a MITM proxy mapping method and path to a minimum mode. Proxy-side token injection is opt-in, so by default a push-capable agent holds the real token.

**Isolation.** Agents run with approvals bypassed: Claude Code with `--dangerously-skip-permissions`, Copilot with `--allow-all` (`src/crux/agent/manager_launch.go`). The code calls this deliberate: Hive restrains agents through GitHub tool denials and token removal, not local permission prompts. An opt-in rootless Podman or Kubernetes Job sandbox strips `*TOKEN*`/`*SECRET*` variables (`src/crux/sandbox/sandbox.go`). Zero hits for gVisor, Kata, Firecracker, seccomp, Landlock, RuntimeClass. A sandbox-runtime ADR (`src/docs/adr/0026-sandbox-runtime-selection.md`, 2026-10-25) lists runc, gVisor and Kata as options.

**Tenancy.** One hive per org or project; agents share the pod, separated by UIDs. The hosted hub provisions a namespace per hive. Zero hits for `tenant_id|TenantID`.

**Forges.** Adapters for GitHub, GitLab and Gitea/Forgejo in `src/pkg/forge/`; merge only partly done outside GitHub; automerge skips other forges (#14150); cross-forge orchestration is post-v5 (`ROADMAP.md:501-502`). A Forgejo smoke workflow was added on 2026-10-26.

**Backends.** claude, gemini, copilot, goose, opencode, openhands, aider, codex and others; LiteLLM as an inference path.

**Incidents.** 14 "Main branch broken" issues on Console since 2026-09-27 (for example #24527, #24365, #24244); [console#18187](https://github.com/kubestellar/console/issues/18187) "merge gate still absent"; [hive#12874](https://github.com/hivecommons/hive/issues/12874) contributor auto-promotion re-trusted revoked contributors.

**Hive's ledger is not Beads.** `src/pkg/beads/beads.go` is its own JSON file per agent with its own `bd` command; `go.mod` has no Dolt or Beads dependency.

## 3. Beads

v1.3.2 (2026-10-24). Dolt only: embedded single-writer mode by default, `dolt sql-server` for concurrent writers. Issues carry status, type, priority, assignee, acceptance criteria, and a lease (`LeaseExpiresAt`, `HeartbeatAt`, `LeaseGrantedNode`). `bd update <id> --claim` sets assignee and `in_progress` atomically with typed conflict errors; default lease 5 min renewed by heartbeat (`internal/storage/issueops/lease.go:28`). Blocking and non-blocking dependency types (`internal/types/types.go:1463-1493`). An MCP server (`integrations/beads-mcp`, PyPI `beads-mcp`). Federation through Dolt remotes; `bd serve` HTTP API with capability tokens.

## 4. KubeStellar Console's tuning loop

* `.github/auto-qa-tuning.json` exists and is updated daily by `hivecommons-hive[bot]` (latest PR #24649, 2026-10-27). Per category: merged, closed, acceptance rate, status (normal, blocked, boosted), weight.
* Updater `.github/workflows/auto-qa-tuner.yml`: `BLOCKED_THRESHOLD: 20`, `BOOSTED_THRESHOLD: 80`, `MIN_SAMPLES: 10`; weight 0 when blocked, 2.0 when boosted, else `rate × 1.5` clamped to 0.3–2.0. Consumer `.github/workflows/auto-qa.yml` four times a day.
* **Defect:** the counts accumulate forever (`.categories[$cat].merged += $count`, line 144); `rolling_window_days: 30` is written once and never read. The stored rates (0.63–0.87) are all-time. The last-30-day acceptance of AI-labelled PRs is 462 / 469 = 98.5 %. No category has been blocked in the 30 history entries.
* Risk-path config `.github/tier-classifier-rules.yml` labels only; its header says merge wiring comes "in a follow-up PR".
* `.github/workflows/scanner-merge-guardrails.yml` (main-red circuit breaker, merges-per-hour limit) matches the login `kubestellar-hive[bot]`; Hive has authored as `hivecommons-hive[bot]` since 2026-09-21, so the guardrail no longer fires for Hive's PRs.

## 5. Mechanisms worth copying

1. Escalate a fix loop after three distinct red head SHAs, with the raw CI excerpt attached (`escalation.go`).
2. Pin the evaluated head SHA in the merge decision and fail closed on mismatch (`merge_eligibility.go:288-301`).
3. Deterministic path-and-diff risk tiers with the evidence each needs, including test-weakening detection (`intent.go`, Console `tier-classifier-rules.yml`).
4. A per-repository list of paths that always need a person, failing closed (`automerge_human_paths.go`).
5. A queue-depth governor whose lesson is "never pause the workers that drain the queue" (`governor.go`, `level-4.yaml`).
6. A cross-model review pool that excludes the author's model family (`level-6.yaml`).
7. Change-failure evidence from reverts and reopened issues after merge (`change_failure.go`).
8. A security control inventory: control, threat, file, how to check it is on (`src/docs/security-model.md` §2).
9. An acceptance-rate loop per category, with a real time window, unlike Console's.
10. Key guardrails on a stable identity, not a login string, unlike Console's.
