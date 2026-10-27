# Hive (hivecommons/hive): repo dig

Source: a clone of `https://github.com/hivecommons/hive`, default branch `v5` at `3f307bb49` (2026-10-27 20:48 UTC), unshallowed blobless to the full history (10,633 commits). The `v6` tip was fetched at depth 1 for a protocol check only. Metadata comes from `gh api` on 2026-10-27. Paths are repo-relative. None of the repo's code was run.

## 1. Org inventory (`gh api orgs/hivecommons/repos`)

Org created 2026-09-01; 18 public repos. Blog: https://hivecommons.dev

| Repo | Stars | Language | Last push |
|---|---:|---|---|
| hive | 77 | Go | 2026-10-27 |
| spektacular | 24 | Go | 2026-10-26 |
| hotshot | 8 | Swift | 2026-10-26 |
| pluk | 4 | JavaScript | 2026-10-27 |
| promptargs | 3 | TypeScript | 2026-10-27 |
| rationguard | 3 | TypeScript | 2026-10-27 |
| crux | 1 | Go | 2026-10-27 |
| dibs | 0 | Go | 2026-10-27 |
| docs | 0 | TypeScript | 2026-10-27 |
| hivecommons.github.io | 0 | JavaScript | 2026-10-27 |
| homebrew-hive | 0 | Python | 2026-10-27 |
| .github | 0 | – | 2026-10-27 |
| homebrew-repo | 0 | Ruby | 2026-10-26 |
| spektacular-website | 0 | MDX | 2026-10-26 |
| infra | 0 | – | 2026-10-23 |
| cncf-sandbox-onboarding | 0 | Python | 2026-10-23 |
| hive-redirect | 0 | HTML | 2026-10-20 |
| .project | 0 | – | 2026-10-20 |

Each repo's role is listed in `docs/repositories.md`. pluk is tmux pub-sub and ships in the hive image. dibs is a contributor-attribution service. spektacular is spec-driven development. `crux` is the agent runtime; the hive repo also carries a copy at `src/crux` and syncs it through `.github/workflows/crux-sync.yml`.

## 2. Hive stats

- Stars 77, forks 47, watchers 1. `open_issues_count` is 65; search splits that into 42 open issues and 23 open PRs. Size 244 MB. Licence Apache-2.0 (`LICENSE`). Topics include `kubernetes`, `golang` and `multi-agent-systems`.
- Created 2026-04-17. The repo was transferred: `gh api repos/kubestellar/hive` resolves to `hivecommons/hive`. Old identities still appear in history: `kubestellar-hive[bot]` (same App id 280983584 as `hivecommons-hive[bot]`) and `sec-check@hive.kubestellar.io`.
- Highest number: #14704, all issues and PRs together. Search totals: 9,836 PRs (9,179 merged) and 4,850 issues. Of the PRs, 7,807 were created in the last 90 days (since 2026-07-29).
- Commits per month: Apr 439, May 690, Jun 1,245, Jul 682, Aug 1,839, Sep 3,261, Oct (to the 27th) 2,477. Total 10,633.
- Releases: 567 GitHub releases, 570 tags. All are dated between 2026-08-27 (`v4.0.0`) and 2026-10-18 (`v5.186.4`, the current `releases/latest`). That is 203 v4.x and 364 v5.x releases: 1 in Aug, 402 in Sep, 164 in Oct, about 11 per day over 52 days. Nothing has been published in the 9 days since 2026-10-18.
- Release lines (`ROADMAP.md`, "Release lines at a glance"):
  - v4 is frozen as of 2026-09-21.
  - v5 is the default branch and stable line since 2026-09-21. Every green merge retags the `candidate` and `latest` image channels; `stable` moves through a soak-gated promotion (`.github/workflows/promote-stable.yml`).
  - v6 is the development line and publishes the `edge` channel.
- The remote has 301 branches.
- Governance (`OWNERS`, `GOVERNANCE.md`): five approvers.
  - clubanderson (Andy Anderson, IBM)
  - hanthor (James Reilly, Universal Blue)
  - Danathar (Doug Baggett, independent)
  - nicholasjackson (Nic Jackson, IBM; GitHub profile says @hashicorp)
  - kellyaa (Kelly Abuelsaad, IBM)
- The README says Hive is a "CNCF sandbox project candidate" and adds that this "does not imply CNCF acceptance". Copyright is assigned to The Linux Foundation.
- README outcome claims, generated from `src/docs/benchmarks/outcomes-2026-10.md`:
  - 11,571 PRs and 15,054 AI reviews across 10 repos
  - 2 in 3 sent-back PRs came back fixed (369/563)
  - 97% of planted prompt injections screened out
  - "about $2 of agent spend per merged pull request"

## 3. Contributor concentration (git history on `v5`)

Identities are merged by email: `andy@clubanderson.com`, `andan02@gmail.com` and `*clubanderson*` count as ANDY. App id 280983584 counts as HIVE-APP-BOT. The `doug.baggett`, `Danathar` and `berths-purger` addresses count as DANATHAR.

| Window | Commits | #1 | Top 4 share | Distinct authors |
|---|---:|---|---|---:|
| All time | 10,633 | ANDY 7,377 (69.4%) | ANDY + HIVE-APP-BOT 1,188 + hive-release-bot 567 + DANATHAR 520 = 9,652 (90.8%) | 48 |
| Last 90 days | 7,765 | ANDY 4,542 (58.5%) | ANDY + HIVE-APP-BOT 1,171 + hive-release-bot 567 + DANATHAR 520 = 6,800 (87.6%) | 47 |

How much of Hive Hive writes itself:

- **Commits authored by Hive's own agent identities.** That is `hivecommons-hive[bot]`/`kubestellar-hive[bot]` plus the local agent identities `scanner@`, `sec-check@` and `hive-quality@hive.kubestellar.io`. All time: 1,433 of 10,633 (13.5%). Last 90 days: 1,404 of 7,765 (18.1%). In the last two weeks (since 2026-10-13): 463 bot commits against 611 from Andy.
- **PRs authored by `app/hivecommons-hive`** (search):
  - All time: 1,890 of 9,836 (19.2%), 1,747 of them merged.
  - Last 90 days: 1,860 of 7,807 (23.8%).
  - clubanderson for comparison: 6,466 of 9,836 all time (65.7%, 6,205 merged); 4,490 of 7,807 in the last 90 days (57.5%).
- **AI co-author trailers.** 3,169 commits (29.8%) carry an AI or agent `Co-authored-by`. That includes 2,362 for `Copilot <223556219+Copilot@...>` and 297 for Claude (Opus 5, Fable 5.1 and others). There are also 48 `Claude-Session:` trailers. Most of the "Andy Anderson" commits are therefore assisted by an agent CLI. The squash committer is "GitHub" on 7,525 commits.
- Example: the latest commit, `3f307bb49` "🐛 fix(tokens): …" (#14698), is authored by `hivecommons-hive[bot]`, signed off by `scanner`, with Copilot and MikeSpreitzer as co-authors.
- The Hive App also opens PRs elsewhere: 15,668 PRs in total. These include 4,179 in `kubestellar/console`, 951 in `org:projectbluefin` and 29 in `org:frostyard`.
- `gh api repos/hivecommons/hive/contributors` returns 31 contributors.
- Affiliations from `gh api users/*` company fields: clubanderson `ibm.com`, kellyaa `IBM`, MikeSpreitzer `IBM`, nicholasjackson `@hashicorp`, arteeh `Batenburg Beenen`. Danathar, hanthor and mendezr list none.

## 4. Architecture

**Languages.**

- Go workspace `src/go.work` with two modules: root `github.com/hivecommons/hive` (go 1.26.10) and `src/crux` (`github.com/hivecommons/hive/crux`).
- 1,742 non-test `.go` files (about 564k LOC) and 3,572 `_test.go` files (about 829k LOC).
- Shell pipeline in `bin/` (252 `.sh` files across the repo).
- Node: `src/proxy/server.js` (Express 5), `discord/bot.js` (discord.js 14) and the legacy `dashboard/`.

Key Go dependencies (`src/go.mod`): `google/go-github/v72`, `spf13/cobra`, `charmbracelet/bubbletea` (TUI), `go.opentelemetry.io/otel` 1.47 with the OTLP/HTTP trace and metric exporters.

**Entry points in `src/cmd/`.**

- `hive`: orchestrator, governor, dashboard API and hub. Boot runs through `cmd/hive/boot*.go`.
- `hivectl`: CLI and TUI.
- `crux`: runtime.
- `bd`: beads ledger CLI.
- `apiproxy`, `hive-backup`, `hive-quota-publisher`, `flue-fixture`.

Shell entry points: `bin/hive.sh`, `bin/supervisor.sh`, `bin/agent-launch.sh`, `bin/run-pipeline.sh`. `bin/README.md` indexes the rest.

**Main packages.**

- Governor: `src/pkg/governor`.
- Scheduler: `src/pkg/scheduler`.
- GitHub client: `src/pkg/github`, including auto-merge under `src/pkg/github/automerge`.
- Forge: `src/pkg/forge`.
- Work sources: `src/pkg/worksource`. Adapters: GitHub Issues, GitHub Projects, Linear, Jira, wavefront.
- External engines: `src/pkg/extwork`, with flue, managedagents, omp and vibekanban.
- Review: `src/pkg/review`.
- Claims: `src/pkg/claims` (hub ledger) and `src/pkg/issueclaim` (`<!-- hive:claim … -->` comment marker).
- Beads: `src/pkg/beads`.
- Tokens: `src/pkg/tokens`.
- Dashboard: `src/pkg/dashboard`.
- Hub: `src/pkg/hub`.
- Convergence and mutation journal: `src/pkg/convergence`.
- Agent runtime: `src/crux/agent` (tmux manager), `src/crux/proxy` (MITM GitHub proxy and inference translator), `src/crux/sandbox` (Podman), `src/crux/kubejob` (Kubernetes Job), `src/crux/pushbroker`.
- Runtime seam: the `crux.Runtime` interface (`src/crux/runtime.go:350`) composes Lifecycle, Observer, Kicker, Definitions, Fleet, Credentials, Resumer, Supervisor, Restorer, Background and Authorizer.
- There are 26 ADRs under `src/docs/adr/`.

**Process model** (`src/docs/architecture.md` §2).

- One container. `src/deploy/entrypoint.sh` is PID 1. It sets an iptables redirect of :443 to :18443 and installs the proxy CA.
- It supervises three processes:
  - Node proxy on :3001, the public dashboard front door (`src/proxy/server.js`).
  - The Go `hive` binary on :3002, the internal API.
  - `ttyd` on :7681, a web terminal.
- Goroutines inside the Go binary: the governor loop, the tmux agent manager, the dashboard API and SSE, the MITM GitHub proxy on :18443, the inference translator on :18444, hub heartbeat, token collector and trajectory reviewer.
- Agents are long-lived tmux sessions named `hive-<agent>`, optionally under per-agent OS UIDs.
- Host daemon examples: `launchd/com.hive.plist.example`, `systemd/`, `src/deploy/systemd`, `src/deploy/quadlet`. Deploy options are Docker Compose (`src/docker-compose.yaml`), Podman, and Kubernetes through kustomize (`src/deploy/kustomize`, `src/deploy/k8s`).
- Hub and spoke: the same image runs as hub with `HIVE_MODE=hub` (hosted at hive.hivecommons.dev). Spokes heartbeat every 2 minutes, and the hub answers with callbacks such as upgrade-to-SHA.

**Dashboard.**

- Go API in `src/pkg/dashboard/server.go`; spec at `dashboard/openapi.json`.
- Frontend is one 3.9 MB vanilla `src/pkg/dashboard/static/index.html` with `tokens.css`/`components.css`. No framework and no `<script src>`.
- Live updates over SSE at `/api/events`.
- The root `dashboard/` is legacy and only builds snapshots (`dashboard/README.md`).

**Discord.** `discord/bot.js` with `discord/lib/{command-router,dashboard-bridge,pipeline-watcher}.js`. It is a two-way operator bot over the dashboard API with no cluster access. The one-way alerts are a separate webhook (`notifications.discord.webhook`).

**How a Run is dispatched, end to end (v5).**

1. **Tick.** The governor eval loop runs every `governor.eval_interval_s`.
2. **Enumerate.** `(*github.Client).EnumerateActionable` (`src/pkg/github/client.go:1460`). The shell twin is `bin/enumerate-actionable.sh`, which writes `/var/run/hive-metrics/actionable.json`. Tracker sources come in through the `pkg/worksource.WorkSource` interface (`src/pkg/worksource/worksource.go:73`).
3. **Pre-kick pipeline.** `bin/run-pipeline.sh` runs the stages in `hive-project.yaml` in topological order:
   - `issue-classifier.sh`: tier Simple/Medium/Complex maps to haiku/sonnet/opus; also lane and cluster. Go mirror: `pkg/classify`.
   - `pr-cluster-detector.sh`
   - `architecture-detector.sh`
   - `merge-gate.sh`, which writes `merge-eligible.json`
   - `conflict-sweeper.sh`
   - `copilot-comment-checker.sh`
4. **Mode and cadence.** `(*Governor).computeMode` (`src/pkg/governor/governor.go:511`) picks IDLE, QUIET, BUSY or SURGE from queue depth. `updateCadences` (:673) and `agentsDueForKick` (:891) follow; the budget gate applies here.
5. **Claim.**
   - Beads ledger: `bd ready --actor X`, stored at `/data/beads/<agent>/beads.json`.
   - Issue-claim marker comment: `src/pkg/issueclaim/issueclaim.go`.
   - Hub claim ledger: `src/pkg/claims/claims.go`.
   - Duplicate-PR claim ledger: `pkg/github`.
   - Stage labels run `stage/010-actionable` → `020-claimed` → `030-in-progress` → … → `100-merge-queue`.
6. **Kick.** `(*Scheduler).BuildKickMessages` (`src/pkg/scheduler/kickmessage.go:260`) builds the work order. `(*Manager).SendKick` (`src/crux/agent/manager_kick.go:103`) types it into the agent's tmux CLI prompt, sending `/clear` first when `clear_on_kick` is set.
   - **Default path:** an interactive CLI session in the hive container. The agent works through the API and `gh`, and keeps no clone unless `project.checkouts_dir` is set.
   - **Opt-in sandbox path:** `(*Manager).startSandboxKickLocked` (`src/crux/agent/manager_sandbox.go:103`). Hive clones a workspace with its own credentials and writes `.hive/kick-prompt.txt`. It then runs `sandbox.PodmanLauncher.Run` (`src/crux/sandbox/sandbox.go`), or `kubejob` when `sandbox.runtime: job`.
   - CLI launch strings are built by `backendLaunchCmdWithBobSession` (`src/crux/agent/manager_launch.go:915`).
7. **PR.**
   - Agents call `bin/hive-open-pr.sh` instead of `gh pr create`. It writes a request file owned by the agent's UID. The hive watcher checks `(*Manager).AuthorizePROpen` (`src/crux/agent/manager_modes.go`: UID forge-resistance plus `CanPush()`) and opens the PR as the App bot.
   - Branch pushes go through `bin/hive-push-branch.sh` and `AuthorizePushBranch`.
   - Sandbox commits go through `(*pushbroker.Broker).Run` (`src/crux/pushbroker/pushbroker.go:306`). It scans the diff for secrets and protected paths, mints a short-lived scoped App token, then pushes and opens the PR.
8. **Review.** `src/pkg/review` handles dispatch, review heads and the aggregate verdict (`verdict_labels.go`). The reviewer agent is configured in `hive.yaml` (example: backend copilot, `mode: ADVISORY`). The trajectory reviewer pauses an agent on drift and fails open.
9. **Merge.** `bin/merge-gate.sh` writes `merge-eligible.json`. `bin/hive-merge.sh` merges. `src/pkg/github/automerge/automerge_sweep.go` holds the lanes: self-authored, trusted-author, contributor and bot takeover. Merges are credited and DCO stages are applied (`automerge_merge_credit.go`, `automerge_stage_dco.go`). Gate details are in §5.

## 5. Permission and autonomy model

- **Four agent modes** (`src/crux/agentmode/agentmode.go`): `ADVISORY` → `ISSUES_ONLY` → `ISSUES_AND_PRS` → `ISSUES_PRS_MERGE`. Per-agent override via `agents.<name>.mode` in `hive.yaml`. Each repo can override the level with `project.repo_policies[].acmm_level` and `acmm_pinned` (`src/pkg/config/repo_policy.go:24`). The global level is `acmm_level` in `src/pkg/config/config.go:95`.
- **ACMM level to mode table** (`DefaultAgentMode`, `src/crux/agentmode.go:25`). `supervisor` is always ADVISORY.

  | Level | Modes |
  |---|---|
  | L1–L2 | all ADVISORY |
  | L3 | `quality` ISSUES_AND_PRS, rest ADVISORY |
  | L4 | quality, sec-check, ci-maintainer ISSUES_AND_PRS; scanner, guide ISSUES_ONLY |
  | L5 | all ISSUES_AND_PRS, every PR carries the literal `hold` label |
  | L6 | `scanner` ISSUES_PRS_MERGE, rest ISSUES_AND_PRS; auto-merge on green |

  `telemetry` and `operations` exist only from L5. The full matrix is `src/docs/acmm-policy-matrix.md`. Prompt policy packs per agent and level (for example `scanner-holdgated.md`, `scanner-automerge.md`) live in `src/policies/*.md`.
- **Three enforcement layers** (`src/docs/architecture.md` §5):
  1. CLI tool denies at launch. Claude runs with `--dangerously-skip-permissions` plus `claudeGitHubWriteDenyFlags` and host-state denies. Copilot runs with `--allow-all` plus `copilotGitHubWriteDenyFlags`; its GitHub MCP is read-only.
  2. A per-agent scoped GitHub App token by trust tier. Sub-L3 tiers are minted without `contents:write` (`src/pkg/github/app.go`, `bin/git-credential-hive.sh`). Before any credential is used, the `gh` wrapper `bin/gh-wrapper.sh` (installed as `/usr/local/bin/gh`) checks the per-agent restriction file `/etc/hive/restrictions/<agent>.json` (`config/restrictions/`).
  3. The MITM proxy `src/crux/proxy/github_proxy.go` (`NewGitHubProxy`, :454).
     - Rules map (method, path) to a minimum mode: `PUT …/merge` needs ISSUES_PRS_MERGE; PR create, review and push need ISSUES_AND_PRS; issues, comments, labels and GraphQL mutations need ISSUES_ONLY.
     - The agent is identified by UID through `/proc/net/tcp` (`procnet.go`). Its mode is read from `/tmp/.hive-mode-<agent>`.
     - Writes are limited to a repo allowlist (`project.repos`).
     - Only `api.github.com` is inspected; `github.com` is tunnelled.
- **Merge fences** (`src/pkg/github/automerge/`, keys in `src/docs/operator-reference.md` lines 231–451):
  - `auto_merge.self_authored` (default on), `max_merges` (3), `min_head_age` (3m), `required_checks`, `repos.<repo>.required_checks`, `no_ci_ok`, `require_current_base`, `squash_only`, `credit_issue_authors`, `bot_takeover.enabled`.
  - `auto_merge.human_merge_paths`: per-repo globs that a person must merge (`automerge_human_paths.go`).
  - `auto_merge.trusted_authors.{enabled(false),repos,require_role(merger),require_github_permission(true),exclude_labels}`.
  - `auto_merge.contributor_lane.{enabled(true),soak_minutes(30),require_reviewer_verdict(true),require_tiers(trusted,merger),registry_tiers_sufficient,approve_held_runs_for_registry_trusted,owner_approval_releases_workflow_fence(true),repos,exclude_labels}`.
  - `auto_merge.contributor_tier.auto_promote_after_merged` (5).
  - Without a reviewer agent the contributor lane never merges (`contributor-lane:no-reviewer`).
- **Workflow-path fence.** `contributorLaneWorkflowPaths = {".github/workflows/**", "**/.github/workflows/**", ".github/actions/**"}` (`automerge_contributor_lane.go:142`) keeps unattended merges away from these paths, since changing them "changes what CI green means". An owner or trusted-merger APPROVED review on the current head, or `/hive decision approve` bound to that head, releases it (`automerge_contributor_workflow_approval.go`, `workflowFenceReleased`, #14664). A test-removal fence mirrors Sentinel's rule (`contributorLaneTestPaths`).
- **Hold labels.** The forge-neutral `hold` label (`pkg/forge.SetHold`), `hive-pause/<hive-id>`, and the exclude labels `do-not-merge`, `needs-human`, `blocked`, `needs-rebase`. `src/pkg/holdguard` re-applies a removed `hold`.
- **Needs-decision flow.** Issues park on `stage/045-needs-decision` and PRs on `stage/085-needs-decision`, alongside `stage/090-needs-human` and `090-ready-for-human-merge`. `project.agent_issue_decision_policy` takes `resolve` (default) or `escalate` (`src/hive.yaml.example`). The dashboard "Decide…" verbs are in `src/pkg/dashboard/api_repo_item_decision.go`:
  - approve: `/hive approve`, or `/lgtm`+`/approve` on a PR
  - direction: `/hive decision <comment>`, which counts as a human change request and kicks the author agent
  - close-superseded
  - close-wontfix

  Authorization is `canToggleRepoHold`: an owner, or a GitHub user with write access. None of these verbs merges.
- **Raising ACMM is a human decision** (`src/docs/architecture.md` §6). Under the v5 reviewer lane (#5480), reviewer output stays advisory wherever a human approval is required (`ROADMAP.md`).

## 6. Credentials and isolation

- **GitHub on the default tmux path.** The agent holds no PAT, but its process does reach a credential:
  - The agent UID can read a per-agent, tier-scoped App installation token file (`crux.AgentTokenCachePath`, `HIVE_AGENT_TOKEN_CACHE`). `bin/gh-wrapper.sh` and `bin/git-credential-hive.sh` read it.
  - With `project.app_authored_prs` on and a push-capable mode, the token is also exported as `GITHUB_TOKEN` into the CLI env (`src/crux/agent/manager_env.go` ~l.340).
  - The MITM proxy rewrites `Authorization` to the scoped token for GitHub hosts only (`injectsGitHubAuthForHost`, `github_proxy.go:1930`).
  - `bin/agent-env-scrub.sh` unsets tokens in child tool shells through BASH_ENV (#4045). This was added after Copilot CLI re-exported `GITHUB_TOKEN` and an agent bypassed the wrapper with `curl`.
- **Model keys.**
  - Gateway-routed backends (LiteLLM, vLLM, llm-d) get the placeholder `ANTHROPIC_API_KEY=sk-hive-<agent>` and `ANTHROPIC_BASE_URL=http://127.0.0.1:18444` (`manager_env.go:307`). The in-process translator injects the real key (`applyInferenceAuth`, `src/crux/proxy/inference_route.go:225`). This is a broker.
  - Claude subscription agents read the shared `/data/home/.claude` credentials file themselves. `CLAUDE_CODE_OAUTH_TOKEN` is injected only as a last resort (`manager_env.go:363`).
  - Copilot gets `COPILOT_GITHUB_TOKEN` directly in its env.
  - **The CLI process holds the model credential directly for every backend except the gateway-routed ones.**
- **Sandbox** (`src/docs/sandbox-isolation.md`).
  - Off by default. It needs both `agent_sandbox.enabled: true` and `agents.<name>.sandbox.enabled: true`.
  - Implementation: rootless Podman (`src/crux/sandbox/sandbox.go`). It strips `GITHUB_TOKEN`, `GH_TOKEN`, `HIVE_GITHUB_TOKEN`, `COPILOT_GITHUB_TOKEN` and the ASKPASS variables.
  - `network_mode`: `restricted` (default) or `none`. `restricted` depends on a network or proxy policy that the operator supplies.
  - Kubernetes Job runtime: `src/crux/kubejob/kubejob.go` (#6311). It mounts a shared RWX PVC subPath and passes only the Secrets in `env_from_secrets`. The brokered GitHub token never enters the Job, and Hive pushes afterwards through pushbroker.
- **gVisor and Kata: not used by the hive or sandbox code.** The only gVisor hit is optional `HIVE_K8S_RUNTIME_CLASS` → `runtimeClassName` on the contributor k8s workload, tested in `src/deploy/test_contribute_k8s_workload.sh:108` (example value `gvisor`). There are zero Kata or Firecracker hits. ADR-0026 (`src/docs/adr/0026-sandbox-runtime-selection.md`, Proposed) evaluates NVIDIA OpenShell and OpenSandbox.
- **Egress.** Only GitHub and Linear traffic is inspected. Every other host passes through the proxy unexamined, and other third-party secrets sit in plain text in the agent env. RFC #14291 ("Proxy egress allowlist and brokered secrets", v6, on hold, not accepted) says this outright.
- **Contributor-local confinement** depends on the backend; tiers are in §8. The relay is ClankeR (`bin/contributor-relay.js`), and per the architecture doc contributors' credentials stay on their own machine.
- `src/pkg/logscrub` redacts GitHub tokens and JWTs from logs. `src/pkg/ioscan` screens for prompt injection with a canary-egress check (`inspectCanaryEgress`).

## 7. Tokens, money and caps

- **Collection** (`src/pkg/tokens/`: `collector.go`, `claude_scanner.go`, `copilot_scanner.go`, `bob_scanner.go`, `pricing.go`, `managed_agents_ledger.go`; doc `src/docs/token-tracking.md`).
  - Reads session JSONL after the fact, rescanning every 30 s, plus a live sniff of Copilot usage in the proxy (`src/crux/proxy/copilot_usage.go`).
  - Cost is list price times tokens from a dated price table (`pricing.go`; `price-table-refresh.yml`). It is labelled `estimated` versus `native`, and is "not a billing feed" (`src/docs/architecture.md` §9).
  - A proposal (#6234/#6242) would replace the scanners with a pinned `ccusage` subprocess.
- **Budget config** (`BudgetConfig`, `src/pkg/config/config.go:3005`): `budget.total_tokens`, `usd`, `period_days`, `critical_pct`, `coins.<backend>.{tokens_per_coin,usd_per_coin,label,budget}`. Bob coin defaults come from env.
- **Enforcement happens between kicks, never per request.**
  - `(*Governor).budgetExhausted` (`src/pkg/governor/governor.go:858`) compares collected spend with the weekly token, coin or USD limit. When it is exhausted, `agentsDueForKick` and the kick paths (:1146, :1219, :1344) suppress new kicks except for `IgnoredAgents`.
  - It warns at 90%. `IgnoreAll` keeps the alerts and opens the gate.
  - **No pre-spend check and no per-Run cap exists on the CLI path.** A session already running continues, and spend is known only once the logs are scanned.
- **Provider spend refusals.** `src/crux/proxy/inference_budget.go` latches when a provider returns a spend-limit error (told apart from 429 by response body). `pkg/governor/budget_notify.go:ProviderBudgetSuppresses` then holds kicks and probes on a fixed cadence until the provider accepts requests again. This reacts to the refusal; it does not cap spend.
- **The one hard USD cap is on the Claude Managed Agents path only.** `DefaultManagedAgentsDailyBudgetCents = 2500` (USD 25/day, `pkg/tokens/managed_agents_ledger.go:25`), set with `extwork … daily_budget_cents` (`pkg/extwork/managedagents/adapter.go:54`).
- `src/crux/proxy/agent_github_budget.go` budgets GitHub API calls, not money.
- The latest tokens commit is `3f307bb49` "fix(tokens): do not report model usage for requests that got no model response" (#14698).

## 8. Backend adapter seam

- **No Go interface for CLI backends.** The seam is a string `switch backend` in `backendLaunchCmdWithBobSession` (`src/crux/agent/manager_launch.go:915`). It has cases for claude, copilot, gemini, agy, pi, goose, bob, codex and omp; anything else gets the bare binary. Per-backend files sit in `src/crux/agent/*` (for example `bob_settings.go`, `copilot_token_store.go`, `claude_session_adopt.go`).
- **Lists that must agree:**
  - `KNOWN_BACKENDS="claude copilot goose codex agy bob pi aider litellm opencode kilo muse omp openhands omnigent"` (`config/backends.conf:23`, 15 entries)
  - `CLIBackends` (`src/pkg/config/config.go`, aliased from `crux/config`)
  - Parity is guarded by `TestShellAndGoCLIBackendListsAgree` (`src/pkg/config/backend_list_parity_test.go`). Exceptions are `litellm` and `gemini`.
  - The `hive.yaml` backend comment also lists vllm, llm-d and watsonx as gateway backends (`src/crux/watsonx`, `src/crux/openrouter`).
  - Per-spoke allow and deny: `backends.allow`/`deny` (`src/crux/config/backends.go`).
- **Adding a backend** (`src/docs/backend-support-tiers.md`, tracking #6231):
  - Add it to `KNOWN_BACKENDS`, `backend_binary` and `backend_perm_flag` in `backends.conf`, to `CLIBackends`, and to `localBackendPostures`.
  - Wire `detect_cli` in `bin/contributor-agent.sh`.
  - Pin it in the Dockerfile with a SHA256.
  - Add docs rows and a changelog entry.
  - T3 backends also need `HIVE_<NAME>_DANGEROUSLY_RUN_UNCONFINED`.
- **Support tiers:**

  | Tier | Backends |
  |---|---|
  | T1 core (headless pod) | claude, litellm, copilot, codex, goose |
  | T2 confined (contributor local) | claude/litellm, codex, copilot, muse (sandboxed); opencode (deny-listed only) |
  | T3 experimental (unconfined) | goose (local), agy, bob, pi, aider, kilo, omp, openhands, omnigent |

  OpenHands is held at T3 permanently because upstream calls the CLI legacy (OpenHands#18046). gemini is wired in Go only.
- **Second seam for hosted engines.** `pkg/extwork.Adapter` (`src/pkg/extwork/adapter.go:111`: `Engine/Start/Observe/Cancel/OpenArtifact`), registered with `(*Registry).Register(engine, Factory)` (`registry.go:36`). Implementations: `flue`, `managedagents` (Claude Managed Agents), `omp`, `vibekanban`. External hosts are admitted only in report-only or shadow mode (`omp.CheckReportOnly`). gh-aw dispatch is proposed, not supported.
- **Runtime seam.** `crux.Runtime` (§4). The v6 changelog includes `changed-crux-cmd-hive-runtime-seam.md` and work on sidecar runtimes.

## 9. Forge seam

- **The abstraction exists:** `pkg/forge.Forge` (`src/pkg/forge/forge.go:182`).
  - Methods: `Kind`, `GetRepo`, `ListOpenIssues`, `ListOpenChangeRequests`, `RemoveLabel` and `SetHold`, plus the embedded `IssueWriter` (`CreateIssueComment`, `AddLabels`).
  - Optional extensions: `Merger`, `IssueCreator` (GitHub only) and `IssueFinder`.
  - Kinds: `github`, `gitlab`, `gitea` (Gitea and Forgejo share one adapter).
  - Adapters: `github_forge.go` wraps `pkg/github`; `gitlab_forge.go` uses stdlib REST v4; `gitea_forge.go` uses stdlib REST v1. All three implement `Merge`.
  - `src/pkg/forge/forgejo_smoke_test.go` (build tag `forgejo_smoke`) runs against a live Forgejo seeded by `.github/workflows/forgejo-smoke.yml`.
- **Wiring** (`src/cmd/hive/forgewire.go`).
  - `governorForge` and `forgeForRepo` choose by `project.forge` or `project.repo_policies[].forge`/`forge_url`, with tokens read from env vars named by `gitlab.token_env`/`gitea.token_env`. A failed GitLab/Gitea build falls back to the GitHub client.
  - `forgeMergeSelector` feeds the merge relay (`main.go:2547`).
  - Only six non-test files import `pkg/forge`. **209** non-test files import `pkg/github`, which is built on `google/go-github/v72`. Go code contains 379 `api.github.com` literals, and 27 scripts in `bin/` and `src/deploy` call the `gh` CLI. The MITM proxy inspects GitHub only.
- **Hive's own docs say the same:**
  - `src/docs/forge-app-setup.md` table: for GitLab, Gitea and Forgejo, "Agents do work: **No**"; read API "Adapter only, unwired"; comment/label "Wired but unreachable"; opening issues and PRs "Not implemented".
  - `src/docs/getting-started.md:47`: "GitLab, Gitea, and Forgejo are **not supported for running a hive** today."
  - That table lists Gitea merge as "Not implemented", yet `giteaForge.Merge` exists (`gitea_forge.go:348`). The doc lags the code.
  - Sequencing of the Forgejo program: `ROADMAP.md:501` (#6177, #6167).

## 10. Tests and CI

- Test files: 3,572 Go `_test.go` (about 829k LOC, more than the 564k LOC of non-test Go), 83 shell tests (`test_*.sh`, `*.test.sh`), 35 JS `*.test.js` and 2 Python.
- `AGENTS.md` tells agents not to run `go test` or vet locally ("CI is the sole verdict"); a Go shim inside the pod blocks them.
- There are 75 workflows in `.github/workflows/`. The main one is `v2-tests.yml`, with jobs test-hub, test-sliced, test-agent, test-rest, test-dashboard-shuffle, test and coverage, plus per-package coverage floors (#4112) mirrored in `coverage-hourly.yml`. Others include:
  - `changelog-fragment-guard`, `copilot-dco`/`dco-*`, `go-security-analysis`
  - `formal-verify` (Promela/Spin models in `src/formal/`)
  - Podman lanes: rootless, rootful, arm64, plus `podman-contract`
  - Smoke tests: `forgejo-smoke`, `backend-smoke`, `omp-smoke`, `flue-smoke`
  - Supply chain: `scorecard`, `fossa`, `image-attestation-guard`
  - `ai-fix`, `weekly-competitor-report.lock.yml` (gh-aw), `promote-stable`, `v4-freeze-gate`
- Required checks on `v5` (branch protection, enforcement `everyone`): `gate`, `DCO`, `build-and-test`, `test`, `coverage`, `golangci-lint`, `gosec (insecure patterns)`, `govulncheck (known vulnerabilities)`, `changelog-fragment-guard`, `verify PR contents`, `Sign-off survives the squash`.
- Architecture ratchets: `internal/testutil/sleep_ratchet_test.go`, `dashboard_import_ratchet_test.go`, `crux_boundary_ratchet_test.go`.

## 11. Key open issues and adopters

Open issues ranked by comments and reactions (reactions are almost all 0–1):

| # | Comments | Summary |
|---|---:|---|
| [#9735](https://github.com/hivecommons/hive/issues/9735) | 28 | v6 readiness live exercise: dashboard chat, inception via chat, standby. Opened by the bot; hold, needs-human |
| [#2364](https://github.com/hivecommons/hive/issues/2364) | 16 | "🐝 Hive Advisory Report", a standing self-report issue |
| [#10574](https://github.com/hivecommons/hive/issues/10574) | 15 | Opt-in `actions: read` for agent scoped tokens: ci-maintainer can't read failed CI logs. External author Tim-van-Oudheusden; top by reactions |
| [#9846](https://github.com/hivecommons/hive/issues/9846) | 14 | Track CNCF Sandbox onboarding |
| [#14551](https://github.com/hivecommons/hive/issues/14551) | 10 | v6 retro: learn from what human reviewers wrote, with owner-approved lessons |
| [#13135](https://github.com/hivecommons/hive/issues/13135) | 10 | Feedback button overlaps header (MikeSpreitzer) |
| [#9701](https://github.com/hivecommons/hive/issues/9701) | 9 | v6 readiness: escalation (email, push/on-call) and admin MCP endpoint |
| [#9699](https://github.com/hivecommons/hive/issues/9699) | 8 | v6 readiness: chat surfaces (Slack, Discord, Matrix, Telegram) |
| [#13096](https://github.com/hivecommons/hive/issues/13096) | 8 | RFC: repo-targeted Experiment Lab campaigns on Nous discovery (kellyaa) |
| [#14291](https://github.com/hivecommons/hive/issues/14291) | – | RFC (held), v6: proxy egress allowlist and brokered secrets. Confirms non-GitHub egress is open today |
| [#13606](https://github.com/hivecommons/hive/issues/13606) | – | v6: risk-tiered ACMM holds; let test-only and docs-only PRs skip the level hold |
| [#14598](https://github.com/hivecommons/hive/issues/14598) | 4 | RFC: PKCE for the Hub GitHub OAuth login (hanthor) |

Ten open issues carry `hold`.

`ADOPTERS.md` lists seven adopters. Existence was checked via `gh api`, and App activity by searching `author:app/hivecommons-hive`. Self-hosted hives run their own App under another name, so a count of 0 does not rule out adoption.

| Adopter | Listed tier | Exists | Evidence of use |
|---|---|---|---|
| KubeStellar Console (`kubestellar/console`) | Production | Yes, 152 stars, pushed 2026-10-27 | 4,179 PRs by the hivecommons-hive App. Strongest real use; same IBM/KubeStellar circle as the maintainer |
| tunaos.org / tuna-os | Production | Yes, 43 repos; https://tunaos.org returns 200 | 0 hivecommons-hive PRs (own App); evidence cited as #5773 |
| Project Bluefin (`projectbluefin/dakota`) | Production | Yes, dakota 192 stars | 951 App PRs in the org; https://docs.projectbluefin.io/factory/ returns 200 |
| Frostyard | Pre-production | Yes, 65 repos | 29 App PRs |
| Open Horizon | Pre-production | Yes, 25 repos | 0 App PRs |
| Open Horizon Services | Pre-production | Yes, but last updated 2022-10-19 (stale org) | 0 App PRs |
| Danathar | Pre-production | Yes; a personal account and a Hive maintainer, so not independent | – |

## 12. Protocols in code (`v5` unless noted)

- **MCP: present but limited.**
  - No MCP SDK dependency in `src/go.mod` or `src/crux/go.mod`.
  - v5 serves a hand-rolled, read-only "public knowledge" MCP endpoint (`src/pkg/dashboard/mcp_knowledge.go`, #10615, enabled with `HIVE_PUBLIC_KNOWLEDGE`). Its tools are search, get and export.
  - Agent CLIs can be configured with MCP tool servers (`src/hive.yaml.example:280–286`, `type: mcp`). GitHub MCP write tools are denied on every backend (`manager_launch.go`).
  - **v6** adds a hand-rolled admin MCP and a task MCP: `src/cmd/hive-admin-mcp`, `src/pkg/adminmcp` (`EndpointPath="/api/admin/mcp"`, `ProtocolVersion="2025-03-26"`, tools such as `hive_status` and `agents_list`), and `src/crux/taskmcp`. The v6 `go.mod` has no MCP SDK either.
- **ACP: one functional use.** It probes goose's ACP server (`goose acp`, JSON-RPC over stdio) only to list models (`src/pkg/dashboard/cli_models.go:155–160`). Hive does not speak ACP as a client or server for Runs. Otherwise ACP appears once, in a slide deck (`docs/presentations/hive-hub-and-spoke.html:217`).
- **A2A: no hits in code.** Docs mention only (`src/docs/design/external-workflow-admission.md:57,225`).
- **AG-UI: no hits anywhere.**
- **OpenTelemetry/OTLP: present.**
  - Uses the otel SDK 1.47 with `otlptracehttp` and `otlpmetrichttp`; 17 non-test Go files hit, for example `src/crux/agent/tracing.go`, `src/pkg/forgestate/otel.go` and `src/pkg/turn/journal.go`.
  - Configured by an `otel:` block in `hive.yaml`, off by default.
  - Spans cover governor eval, kicks and lifecycle/PR events, with GenAI semantic-convention attributes (`gen_ai.system`, `gen_ai.request.model`, token usage) plus `hive.agent`, `hive.lane`, `hive.acmm_level` and `hive.governor.mode` (`src/docs/architecture.md` §10).
  - Prometheus-style `/metrics` on :3002.
