# Fullsend repo dig (fullsend-ai/fullsend)

Source: a read-only clone of fullsend-ai/fullsend at d1f52c159 (HEAD 2026-10-27 20:46 UTC, 9,337 commits, first commit 2026-03-06), plus read-only `gh api` on 2026-10-27. Paths are relative to the repository root. `agents:` paths refer to https://github.com/fullsend-ai/agents (read via `gh api`, default branch HEAD).

## 1. Org inventory (`gh api orgs/fullsend-ai/repos`, 21 repos)

| Repo | Stars | Language | Last push | Note |
|---|---|---|---|---|
| fullsend | 164 | Go | 2026-10-27 | main product |
| agent-eval-harness | 45 | Python | 2026-10-27 | |
| rfe-creator | 18 | Python | 2026-10-27 | |
| agents | 5 | Shell | 2026-10-27 | "First-class agents for fullsend": harness YAMLs, agent prompts, pre/post scripts, policies |
| epic-creator | 4 | Python | 2026-10-26 | |
| assess-rfe | 3 | Python | 2026-10-26 | |
| strat-creator | 3 | Python | 2026-10-27 | |
| .fullsend | 1 | Shell | 2026-10-27 | |
| experiments | 1 | Python | 2026-10-26 | |
| pi-xai-vertex | 1 | TypeScript | 2026-10-26 | pi runtime extension |
| test-creator | 0 | Python | 2026-10-27 | |
| metrics | 0 | Shell | 2026-10-26 | |
| autonomy-readiness | 0 | – | 2026-08-11 | |
| autonomy-analysis | 0 | Python | 2026-08-13 | |
| adoption-analytics | 0 | – | 2026-09-01 | |
| pi-anthropic-vertex | 0 | TypeScript | 2026-10-26 | |
| auto-merge | 0 | Python | 2026-10-23 | "Security-focused lab for Fullsend autonomous merge authorization" (experimental) |
| pi-inference-gateway | 0 | TypeScript | 2026-10-26 | |
| devlake | 0 | – | 2026-10-23 | |
| org | 0 | Python | 2026-10-27 | created 2026-10-26 |
| assess-strat | 0 | Python | 2026-04-27 | archived |

## 2. Fullsend stats

- Stars 164, forks 126, watchers 9, licence Apache-2.0, created 2026-03-09, default branch `main`, homepage https://fullsend.sh, description "On the path to fully autonomous agentic engineering".
- Issues: 1,905 open / 3,936 closed. PRs: 2,309 merged, 145 open, 460 closed unmerged (GitHub search counts).
- Releases: 98 GitHub releases (80 stable, 18 pre-release) and 100 git tags. First v0.0.1 2026-04-02; latest v0.50.0 2026-10-23. Still 0.x. Stable releases per month: Apr 11, May 17, Jun 20, Jul 11, Aug 6, Sep 5, Oct 10. Since v0.44.0 (2026-10-02) every minor ships an `-rc.N` first. Cadence is roughly 1–2 minors a week, slowing from Aug–Sep.

## 3. Contributor concentration

Non-merge commits only (6,649 all-time; 3,516 since 2026-07-29). Aliases are merged by name, so Wayne Sun's gsun@redhat.com and ericbreeze@gmail.com count as one person.

| Author | All-time | % | Last 90 d | % |
|---|---|---|---|---|
| Fullsend agents (`fullsend-fix` + `fullsend-code`, `fullsend-ai-coder[bot]`) | 2,005 | 30.2 | 1,506 | 42.8 |
| Wayne Sun (Red Hat) | 1,295 | 19.5 | 721 | 20.5 |
| Ralph Bean (Red Hat) | 877 | 13.2 | 173 | 4.9 |
| Barak Korren (Red Hat) | 639 | 9.6 | 146 | 4.2 |
| Greg Allen (Red Hat) | 388 | 5.8 | 94 | 2.7 |
| Dharit Shah (Red Hat) | 221 | 3.3 | 184 | 5.2 |
| renovate-fullsend[bot] | 205 | 3.1 | 141 | 4.0 |

- Humans only: 50 distinct humans all-time, 32 in the last 90 days. The top human wrote 29.5% of human commits all-time and 39.0% in the last 90 days. The top four wrote 72.9% all-time and 66.2% in the last 90 days. Counting all authors, the top author (the Fullsend bot) has 30.2% and the top four 72.4%.
- Email domains across all commits: redhat.com 5,245, users.noreply.github.com 3,496 (bots plus personal noreply addresses of Red Hat staff such as rh-hemartin and ascerra), gmail.com 580, konflux-ci.dev 8, b4mad.net 6. **ibm.com: 0.** The project is effectively a Red Hat project; the core people (Ralph Bean, Wayne Sun, Barak Korren, Greg Allen) are Red Hat. `CODEOWNERS` is `* @fullsend-ai/core`.
- How much is written by agents (classified by `git log`):
  - All-time non-merge: 30.2% authored by Fullsend's own agents, 3.1% Renovate, 21.4% human-authored with a `Co-authored-by: Claude|Cursor|Codex` trailer, 45.3% human-only.
  - Last 90 days: 42.8% Fullsend agents, 4.0% Renovate, 10.8% human with an AI trailer, 42.4% human-only.
  - Trailer counts: Claude Opus 4.6 633 (+52 "1M context"), Cursor 569, Claude Sonnet 5.5 248, Claude Opus 5.5 228, Claude Sonnet 4.5 145, Codex 72, others below 30. In total, 1,402 commits carry a Claude co-author trailer.
  - Merged PRs authored by `app/fullsend-ai-coder`: 1,084 of 2,309 all-time (47%), and 770 of 1,178 merged since 2026-07-29 (65%). 90 open. The triage bot `app/fullsend-ai-triage` authored 158 issues.
  - GitHub's contributors API puts `fullsend-ai-coder[bot]` first with 1,862 contributions.

## 4. Architecture from code

- **Languages** (tracked files): 1,112 .go files with about 196k non-test lines and 363k test lines; 86 .sh (about 25.5k lines), 36 .py (about 22.8k), 28 .ts (about 3.9k: the Cloudflare mint worker and the site), 31 Gherkin .feature files, 307 .md. Module `github.com/fullsend-ai/fullsend`, Go 1.26.5. Key dependencies (`go.mod`): cobra, google/cel-go, go.opentelemetry.io/otel 1.44 plus the otlptracehttp exporter, cucumber/godog, knights-analytics/hugot (ONNX ML prompt-injection scan), golang.org/x/oauth2.
- **Entry points:** `cmd/fullsend/main.go` (the CLI; commands in `internal/cli/*`, e.g. `run.go` at 7,847 lines, `dispatch.go`, `poll.go`, `postreview.go`, `mint*.go`, `repos*.go`, `admin.go`); `cmd/mint/main.go` + `cmd/mint/proxy.go` (standalone token mint, its own go.mod); `cmd/mint-wasm/` (mint for the Cloudflare Worker). There are 49 `internal/` packages, among them `dispatch`, `harnessdispatch`, `normevent`, `celtrigger`, `harness`, `runtime`, `sandbox`, `security`, `forge{,/github,/gitlab,/jira}`, `tracker`, `jirapoll`, `poll`, `mint`, `mintcore`, `mintclient`, `inference{/vertex,/openaiwif,/actionsoidc}`, `telemetry`, `scaffold`, `repos`, `statuscomment`, `evalmeasure`. `pkg/behaviourtest` holds the shared behaviour-test framework.
- **`action.yml`:** a composite GitHub Action. It installs the fullsend CLI (from a vendored `.fullsend/bin/fullsend` or a release tag), creates `$GITHUB_WORKSPACE/output`, runs `fullsend run <agent> --output-dir`, and uploads the output as an artifact. Inputs: `agent`, `role`, `version`, `fullsend-dir`, `target-repo`, `github_token`, `mint-url`, `pr-head-sha`, `gcp_wif_provider`, `gcp_project_id`, `runner_secrets`. Outputs: `skipped`, `skip-reason`.
- **End-to-end flow on GitHub:**
  1. **Forge event → per-repo shim.** `.github/workflows/fullsend.yaml` (template `internal/scaffold/fullsend-repo/templates/shim-per-repo.yaml`) triggers on `issues`, `issue_comment` (`/fs-*` only, non-bot), `pull_request_target` and `pull_request_review`. It sets `permissions: {}` at top level and calls `uses: fullsend-ai/fullsend/.github/workflows/reusable-dispatch.yml` through `workflow_call`, with `id-token: write`. A `stop-fix` job handles `/fs-fix-stop`.
  2. **Route.** `.github/workflows/reusable-dispatch.yml` (2,214 lines), job `route`, step "Determine stage", is a bash router:
     - Slash commands `/fs-triage`, `/fs-code`, `/fs-review`, `/fs-fix`, `/fs-retro`, `/fs-prioritize`.
     - Labels `ready-for-triage`, `ready-to-code` (only from a write+ user or a bot), `ready-for-review`, `fullsend-fix` / `fullsend-no-fix`.
     - PR opened or synchronized → review; review submitted → fix; closed → retro.
     - Then an optional CEL route (`fullsend dispatch --route`), "Check kill switch", "Validate agents config", "Check agent is enabled", "Build event payload".
     - Stage jobs are inline: `triage`, `code`, `review`, `fix`, `retro`, `prioritize`, `harness-dispatch` and `harness-run` (custom harnesses matched by CEL `trigger`, `internal/harnessdispatch/core.go` `Dispatch()`).
     - `runs-on: ${{ inputs.runner_image }}`, default `ubuntu-24.04`, so jobs run on GitHub-hosted runners.
  3. **Mint.** Each stage job runs `.github/actions/mint-token`, which exchanges the job's GitHub OIDC token at the mint (`internal/mintcore/handler.go` `ServeHTTP` → `mintToken`) for a per-role GitHub App installation token. The CLI's runtime tokens (`GH_TOKEN`, `PUSH_TOKEN`, `REVIEW_TOKEN`) come from `mintAgentToken()` (per the `mint-url` input description in `action.yml`).
  4. **Run.** The stage invokes the composite action (`uses: ./.defaults/`, i.e. `action.yml`) → `fullsend run <agent>` → `internal/cli/run.go` `runAgent()`, which:
     - resolves the harness (`internal/harness`; the harness YAML comes from `fullsend-ai/agents`, SHA-pinned) and the config overlays;
     - stages the entity context snapshot (ADR 0141) and runs the `pre_script` on the host (`runPreScript`);
     - creates the sandbox (`internal/sandbox/sandbox.go` `Create`/`CreateWithRetry`, which shell out to `openshell`) and sets up providers and profiles (`EnsureProvider`, `ImportProfile`);
     - calls `runtime.Runtime.Bootstrap` then `Run` inside the sandbox;
     - runs the `validation_loop` (a JSON schema check with capped retries, ADR 0022), then the `post_script` on the host;
     - writes metrics to `metrics.json` and OTel spans.
  5. **PR.** `agents:harness/code.yaml` says: "The agent NEVER pushes or creates PRs/MRs as the sandbox policy does not allow it." Its `post_script: scripts/post-code.sh` runs on the host with `PUSH_TOKEN` (`env.runner`) and does the secret scan, pre-commit, push, PR creation and assigning a human.
  6. **Review.** The review stage posts a sticky review comment plus inline comments, a native GitHub review or GitLab approval, and labels `ready-for-merge` or `requires-manual-review` (`docs/agents/review.md` lines 18, 84–85; `internal/cli/postreview.go`).
  7. **Merge.** No production code merges. `MergeChangeProposal` is declared in `internal/forge/forge.go:1210` and implemented in `internal/forge/github/github.go:4132`, `internal/forge/gitlab/mr.go:382` and `internal/forge/fake.go`, but **no non-test caller exists** in `internal/`, `cmd/` or `pkg/`. Autonomous merge is only an experiment in https://github.com/fullsend-ai/auto-merge, where a separate app enrols the PR in GitHub's merge queue after six Gemara-policy checks.
- **GitLab path:** the cron poller (`fullsend poll`, `internal/poll`) plus a webhook fast path → GitLab child pipelines (`internal/scaffold/fullsend-repo-gitlab/.gitlab/ci/scripts/run-agent-job.sh`; ADRs 0067, 0125, 0131). There is no external webhook bridge.
- **Jira path:** `internal/jirapoll`, `internal/cli/jira_tracker.go`.

## 5. Autonomy and permission model in code

- **Config file** `.fullsend/config.yaml` (with a `.fullsend/config.base.yaml` preset underneath). The schema is in `internal/config/config.go` (structs around lines 694–745 and 831–845). Top-level keys:
  - `version`, `forge`, `tracker`, `kill_switch`, `runtime`, `keep_history`;
  - `roles` (list), `agents` (list of `{name, source, ref, enabled, runtime, model, effort, subagents, trigger}`);
  - `allowed_remote_resources`, `create_issues` (`allow_targets: {orgs, repos}`), `authorization` (`[{provider}]`);
  - `status_notifications` (`comment.{start,completion}`, `reaction.{start,completion}`), `mint_url`;
  - `inference` (`provider`, `project`, `region`, `wif_provider`, `wif_audience`, `service_account`, `openai.{audience,identity_provider_id,service_account_id}`, `gateway.{url,audience,auth,messages_auth_header,models,models_file}` in `internal/config/inference_gateway.go:91-106`);
  - `models` (`aliases`).
  - **No budget, cost or spend key exists.**
- **Roles:** `ValidRoles()` returns `fullsend, triage, coder, review, fix, retro, prioritize, e2e` (`internal/config/config.go:306`). Valid runtimes: `claude, pi, codex, opencode, dummy, dummy-playback` (`:325`). The only valid inference provider is `vertex` (`:311`).
- **Harness YAML keys** (`internal/harness/*.go`): `agent`, `role`, `slug`, `model`, `effort`, `image`, `policy`, `providers`, `openshell.profiles`, `host_files`, `pre_script`, `post_script`, `skills`, `plugins`, `validation_loop{script,schema,max_iterations,feedback_mode,preflight_check}`, `env{runner,sandbox}`, `timeout_minutes`, `sandbox_timeout_seconds`, `privilege_levels`, `trigger` (CEL), `overlays[{when,…}]`, `forge` (deprecated), `base`, `security{…}` (hook toggles: `ssrf_pretool`, `tirith`, `llm_guard`, `secret_redact_posttool`, `unicode_posttool`, `canary_*`, `tool_allowlist_pretool`, `context_suppress_posttool`), `api_servers`, `allowed_remote_resources`, `readonly_repo`, `review_label`.
- **Privilege levels per run stage:** `privilege_levels: {pre_script|runtime|post_script|default: <level>}`. The default is `write` (`internal/harness/privilege.go:21`, ADR 0073). The levels are named mint token scopes.
- **Who may trigger what:**
  - `internal/harnessdispatch/auth.go` `RequiredActorRole()`: `triage` and `review` harnesses need an actor at GitHub `triage` or above; every other role, including unknown or custom ones, needs `write` (fails closed). Bots must be resolved registered roles (ADR 0107).
  - The bash router enforces the same rule through `has_repo_permission` (collaborator permission API, ADR 0054). `ready-to-code` dispatches only when the labeler is write+ or a bot.
- **Human gates in code:**
  - The `ready-to-code` label by a write+ human, or agent handoff.
  - The code post-script assigns a human.
  - The review outcome is a label, never a merge.
  - `/fs-fix-stop` adds `fullsend-no-fix`.
  - `kill_switch` in config is checked in the "Check kill switch" route step.
  - ADR 0106 serializes agent runs per entity.
  - Merge stays with humans and repo branch protection. In fullsend's own repo the `main` ruleset requires 1 approval plus code-owner review, thread resolution, a merge queue, and the required checks `behaviour` and `playback` (`gh api repos/fullsend-ai/fullsend/rules/branches/main`).
- **LADDER.md is not an agent autonomy ladder.** It is the human *contributor* ladder: Vouched → Triage → Write → Maintainer. It maps the slash commands onto GitHub permissions: Triage unlocks `/fs-triage` and `/fs-review`; Write unlocks `/fs-code`, `/fs-fix`, `/fs-retro`, `/fs-prioritize` and `ok-to-test`. What code enforces:
  - The permission mapping is enforced, by `RequiredActorRole` and the router's `has_repo_permission`.
  - The vouch gate is enforced by `.github/workflows/vouch-check.yml` and `vouch-command.yml` (`.github/VOUCHED.td` on the `vouched` branch).
  - Ladder advancement (team membership, maintainer approvals) is a human GitHub-team process with no code.

## 6. Credentials and sandbox

- **Mint:**
  - Mint backends: GCP Cloud Function (`internal/dispatch/gcf`), Cloudflare Worker (`internal/dispatch/cf`, `cmd/mint-wasm`), and standalone (`cmd/mint`).
  - Verification: the GitHub Actions OIDC JWT is checked against `https://token.actions.githubusercontent.com` JWKS (`cmd/mint/main.go`) or through GCP STS (`internal/mintcore/sts_verifier.go`), then gated by `ALLOWED_WORKFLOW_FILES`, `ALLOWED_ROLES`, `ROLE_APP_IDS`, `PER_REPO_WIF_REPOS` and `WORKFLOW_HOST_REPOS` (`internal/mintcore/handler.go:93-110`).
  - Output: a GitHub App installation token per role, repo-scoped (`mintToken`, `mintTokenCrossOrg`). App PEMs live in GCP Secret Manager, Worker secrets or the filesystem.
  - `cmd/mint/proxy.go` falls back to an upstream mint when there is no local PEM.
  - On GitLab, per-role Developer-level bot PATs are stored as protected CI/CD variables; there is no OIDC mint (`docs/architecture.md`, ADR 0067).
- **Sandbox:** NVIDIA **OpenShell** (https://github.com/nvidia/openshell-community). It runs Podman containers on the GitHub-hosted runner, behind an `openshell-gateway` service (`images/README.md`), driven by shelling out to the `openshell` CLI (`internal/sandbox/sandbox.go`).
  - Images: `ghcr.io/fullsend-ai/fullsend-sandbox` and `fullsend-code`, digest-pinned in the harness.
  - Policy `agents:policies/base.yaml`: a read-only `/usr /lib /etc…`, read-write `/sandbox /tmp`, `landlock: best_effort`, `run_as_user: sandbox`.
  - **No gVisor, Kata or Firecracker in code.** They appear only in docs: `docs/problems/agent-infrastructure.md:108`, `docs/landscape.md:403`, `docs/problems/security-threat-model.md:401`. Searching issues for "gVisor" finds 0.
- **Egress:** default deny. Network access is granted per provider profile with per-host endpoint allowlists, L7 method/path rules, and binary allowlists. For example, `internal/scaffold/fullsend-repo/profiles/fullsend-github.yaml` allows `api.github.com:443` and `github.com:443` read-write, binaries `gh`, `git`, `node`, `pre-commit`; the base policy says curl is excluded on purpose (ADR 0065). OpenShell does TLS termination and injects its own CA (`images/code/Containerfile:36`).
- **Does the agent hold a forge token?** Not in raw form. `GH_TOKEN` is delivered through an OpenShell *provider*: the sandbox sees a placeholder and the real token is injected at the egress proxy for allow-listed hosts and binaries only (ADR 0017 tier 2, ADR 0025; `providers/github.yaml` `credentials: GH_TOKEN`). `PUSH_TOKEN` stays host-side in `env.runner`, used by `post_script`.
- **Does the agent hold a model key?**
  - Default, Claude on Vertex: **partly yes**. `scripts/prepare-sandbox-credentials.sh` rewrites the GCP WIF `external_account` config to read a pre-fetched GitHub OIDC token file. `agents:harness/code.yaml` `host_files` copies `${GOOGLE_APPLICATION_CREDENTIALS}` → `/tmp/.gcp-credentials.json` and `${GCP_OIDC_TOKEN_FILE}` → `/sandbox/workspace/.gcp-oidc-token`. The CLI refreshes the token roughly every 5 minutes. A short-lived federated credential therefore sits inside the sandbox.
  - OpenAI (pi/codex): exchanged through WIF and held in an OpenShell provider placeholder (ADR 0092).
  - Inference gateway route (ADR 0137): the job's OIDC token is seeded as an endpoint-bound placeholder and the gateway holds the upstream key. In `auth: api-key` mode (ADR 0138), a long-lived `FULLSEND_INFERENCE_GATEWAY_API_KEY` sits behind a placeholder.
  - Runner secrets go through one JSON secret, `FULLSEND_GITHUB_RUNNER_SECRETS`: a 0600 file on the host only, never in the sandbox (ADR 0136; `action.yml` `runner_secrets`).
- **Broker or proxy:** the OpenShell L7 egress proxy with provider placeholders. ADR 0046 adds a host-side REST "api_servers" tier for operations providers cannot do. In-sandbox hooks live in `internal/security/hooks/*.py`: SSRF pretool, tirith shell check, tool allowlist, secret redaction, unicode normalisation, canaries. ML prompt-injection scanning (ProtectAI DeBERTa-v3 through ONNX) runs only in the runner image (`internal/security/mlscan*.go`, `images/README.md`).

## 7. Money

- **No enforced budget, cap or pre-spend check exists anywhere in code or config.**
  - Cost is reported *after* the run, from the runtime's self-reported total: Claude Code's `total_cost_usd` result event (`internal/runtime/claude_progress.go:174,680`) and pi's (`internal/runtime/pi_run.go:1214`).
  - It is aggregated in `aggregateMetrics` (`internal/cli/run.go:205-215`) along with token counts (input, output, reasoning, cache_creation, cache_read), written to `metrics.json`, and emitted as the OTel attributes `fullsend.cost_usd` and `gen_ai.usage.*` (`run.go:4389-4412`), the status-comment footer (`runInfoFor`, `run.go:7826`), and a `::notice::`.
  - On a cancelled run `TotalCostUSD` is 0 (`run.go:4717`).
  - `error_max_budget_usd` and `error_max_turns` are only *recognised* as exit reasons from the runtime (`run.go:2154, 4652`). Fullsend never passes `--max-budget-usd` (zero hits in `internal/runtime`).
- **Only limits that exist:** wall clock and iterations: `timeout_minutes` (e.g. 60 for code), `validation_loop.max_iterations`, `sandbox_timeout_seconds`, ADR 0105 (a timed-out iteration ends the run), and ADR 0106 (serialised runs).
- **Open issues:**
  - #6588 "feat(harness): add a max_cost_usd budget cap for agent runs" (type/adr, 29 comments, opened 2026-08-25)
  - #2668 "Implement per-repository budget cap for agent usage" (2026-06-25)
  - #2599 "Add per-PR review budget to cap runaway review dispatches"
  - #1687 "per-user and per-repo rate limiting for agent invocations"
  - `docs/architecture.md` lists gateway spend limits as an open question.

## 8. Harness/runtime seam

- **Interface:** `runtime.Runtime` in `internal/runtime/runtime.go:169`: `Name()`, `System()`, `ConfigDir()`, `WorkspaceDir()`, `EnvExports()`, `Bootstrap(BootstrapInput)`, `Run(ctx, RunParams, printer, start, *RunMetrics) (exitCode, err)`, `ClearIterationArtifacts(sandboxName)`.
  - It is paired with `TranscriptHandler` in `runtime.Backend`.
  - Optional capability interfaces: `DebugLogNamer`, `ContextBridger`, `HomeInstructionsBridger`, `ProviderResolver` (OTel GenAI provider id), `GatewayRouteRuntime` (`gateway_route.go:71`), `SandboxHooksBootstrap` (`sandbox_hooks_bootstrap.go:20`, ADR 0090 runtime-neutral hooks), `OpenAICredentialSeeder`.
- **Implementations:** `ClaudeRuntime` (`claude*.go`, the default), `PiRuntime` (`pi*.go`, plus the `pi_extension/` dir), `CodexRuntime` (`codex*.go`, with a `codex_hook/` Python adapter), `OpenCodeRuntime` (`opencode*.go`; read-only agents only until the hook adapter lands, `config.go:316-324`), `DummyRuntime`, `DummyPlaybackRuntime` (test only).
- **Registration:** a hard-coded `switch` in `runtime.Resolve(name)` (`internal/runtime/registry.go:12`), gated by `config.ValidRuntimes()`. There is no plugin or registry mechanism; a new runtime means editing Go. Selection order: flag / `FULLSEND_*` env > `agents:` entry `runtime` > repo `runtime:` > `claude` (`ResolveForAgent`, ADR 0091). Every runtime runs inside the same OpenShell sandbox image.

## 9. Forge and tracker seams

- **Forge:** `forge.Client` in `internal/forge/forge.go:809`, about 125 methods (repos, issues, PRs/MRs, comments, reviews, labels, CI, secrets/variables, branches, protection, merge). Extension interfaces: `GitHubExtensions` (`:1605`), `GitLabExtensions` (`:1637`), `ProjectLeaser`, `RateLimitReporter`.
  - Implementations: `internal/forge/github` (about 15.9k lines) and `internal/forge/gitlab` (about 25.4k lines incl. `poll.go`, `hooks.go`, `service_accounts.go`), plus `fake.go`.
  - **GitLab parity gaps:** these return `forge.ErrNotSupported`: `MinimizeComment`, `ListIssueReactions`, `AddIssueReaction`, `DeleteIssueReaction`, `AddIssueCommentReaction`, `DeleteIssueCommentReaction`, `OrgSecretExists`, `DeleteOrgSecret`, `CreateOrUpdateOrgVariableAll`, `GetOrgVariable`, `DeleteOrgVariable`, `GetWorkflow`, `DispatchWorkflow` (`internal/forge/gitlab/issue.go:499-526`, `ci.go:539-815`). GitLab dispatch runs through a poller plus webhook instead of Actions events, and uses PAT credentials, not an OIDC mint.
  - **Forgejo: zero implementation.** The README says "(GitHub, GitLab, Forgejo)", and `forge.go:808` reads "Implementations exist for GitHub (and eventually GitLab, Forgejo)". `forge.DetectForge` (`internal/forge/detect.go:17`) recognises only `github.com` and `gitlab.com`. There is no `internal/forge/forgejo`. Non-doc Forgejo hits: `internal/forge/forge.go` comments, `internal/cli/run_test.go`, `pkg/behaviourtest/select_test.go`. GitHub search finds 0 issues with "forgejo" in the title.
- **Tracker:** `tracker.Client` in `internal/tracker/tracker.go:115`: `GetIssue`, `CreateIssue`, `ListComments`, `CreateComment`, `UpdateComment`, `DeleteComment`. Optional `StatusCommentClient`, `Reactor`, `Linker`, `Mover`. Implementations: `ForgeClient` (wraps `forge.Client`, `forge_client.go:18`) and `JiraClient` (`jira_client.go:77`, Jira Cloud; `Reactor` is not implemented for Jira, ADR 0093), plus a fake Jira. The Jira trigger is `internal/jirapoll` (polling).
  - `conversation.Client` (ADR 0086, GitHub Discussions/Slack) is **decided but not implemented**: no `package conversation` exists.

## 10. Tests and CI

- **Tests:** 632 `_test.go` files with 13,221 `func Test*`; 18 Python test files; 10 TS test files; 31 Gherkin `.feature` files under `e2e/behaviour/` (`suite_test.go`, `playback_suite_test.go`, ADR 0066 / ADR 0116). Test Go lines outnumber non-test Go lines about 1.85 to 1.
- **Workflows** (22 in `.github/workflows/`): `lint.yml` (jobs: `test` running `make lint-all`, `go test -race ./...` and `make script-test`; `test-sandbox-darwin`; `commit-lint`; `gateway-doc-configs`; `web`), `e2e.yml` (`gate`, `behaviour`, `playback` against real GitHub/GCP), `e2e-ok-to-test.yml`, `pr-title-lint.yml`, `release.yml`, `runner-image.yml`, `sandbox-images.yml`, `mint-cf-worker-test.yml`, `vouch-check.yml`, `vouch-command.yml`, `fullsend.yaml` (dogfood shim), `reusable-dispatch.yml`, `reusable-prioritize.yml`, `prioritize.yml`, `renovate.yml`, `stale.yml`, `branch-cleanup.yml`, `site-build.yml`, `site-deploy.yml`, `notify-*.yml`.
- **Required gates on `main`** (ruleset API): status checks `behaviour` and `playback` (strict), 1 approving review, code-owner review, thread resolution, merge queue (ALLGREEN, max 5). `lint.yml`'s `test` job is **not** a required check by name. Open issue #7045 reports that the security-hook Python tests are not run by any CI job.

## 11. Load-bearing open issues and adopters

**Open issues** (ranked by comments and reactions):
- #8835 gitlab: reconcile ADR 0125 security gates with implementation (26 comments)
- #6970 codex runtime sub-agent rosters via native spawn_agent (18)
- #1986 re-platform default agents as harness-driven configs (15)
- #1687 per-user/per-repo rate limiting (15)
- #5361 MLflow traces blank; token and cost omit cache tokens (15)
- #6787 WIF for self-managed forges behind a private issuer (14)
- #6678 re-onboarding with v0.37 removes custom agent configuration (13)
- #6621 agent job exits 0 when it cannot reach the forge API (priority/high)
- #6588 max_cost_usd budget cap (ADR, 29 comments)
- #2668 per-repo budget cap
- #7564 fix-agent dispatch ignores recent human activity on the branch
- #7045 security-hook tests not in CI

There are no open issues labelled `priority/critical`.

**Adopters:**
- GitHub code search: `path:.fullsend filename:config.yaml` gives 138 hits; `path:.github/workflows filename:fullsend.yaml reusable-dispatch` gives 137. Together they cover **145 unique repos** (list in [adopters.txt](adopters.txt)). Code search is incomplete, so this is a lower bound.
- By org: konflux-ci 51, fullsend-ai 15, RedHatInsights 13, majamassarini 8, redhat-developer 5, packit 5, unbound-force 4, ralphbean 4, conforma 4, release-engineering 3, redhat-community-ai-tools 3, redhat-appstudio 3; singletons include quay/quay, podman-desktop/podman-desktop, opendatahub-io/odh-dashboard, openshift/osdctl, RedHatProductSecurity/osidb-bindings, crc-org, kubearchive.
- **Essentially all adopters are Red Hat or Red Hat-adjacent** (Konflux, Insights, Packit, OpenShift, RHDH) or personal repos of Red Hat staff.
- **Shipped work:**
  - `author:app/fullsend-ai-coder is:pr is:merged` gives 2,102 merged PRs total; 775 outside the fullsend-ai org; 564 outside both fullsend-ai and konflux-ci; 118 outside fullsend-ai created since 2026-09-27.
  - Top external repos in the first 100 results: redhat-developer/rhdh-plugins 19, redhat-et/ProtoBot 17, redhat-community-ai-tools/ci-failure-tracker 10, redhat-developer/rhdh-plugin-export-overlays 8, konflux-ci/konflux-build-cli 5, quay/quay 4.
  - Orgs using their own App (`FULLSEND_APP_SET`) are not counted, so this too is a lower bound.
- **Shipped vs claimed:**
  - GitHub dispatch, review, code and fix are shipped and in real use.
  - GitLab is shipped, with gaps (#8835).
  - Jira as a tracker is shipped.
  - Forgejo is claimed in the README and has no code.
  - Autonomous merge is experimental, in a separate repo.

## 12. Protocols in code

- **MCP:** no MCP client or server of Fullsend's own. There are 20 non-test code-file hits (`internal/` + `cmd/` + `pkg/`); the ones inspected are incidental:
  - `internal/cli/tool_spans.go:28` recognises `mcp__server__tool` tool names in transcripts;
  - `internal/harness/harness.go:62` and `internal/resolve/resolve.go:391,864` keep the exec bit for MCP server binaries inside fetched Claude Code plugins;
  - `internal/sandbox/sandbox.go:343` is an MCP `strict_tool_names` comment.
  - So MCP servers can only ride along inside runtime plugins. Gateway or MCP-traffic brokering is an open question in `docs/architecture.md`.
- **A2A: zero code hits.** Docs only (`docs/landscape.md`, `docs/roadmap.md`, `docs/problems/agent-infrastructure.md`, ADR 0090).
- **ACP: zero code hits.** Docs only.
- **OpenTelemetry: real and extensive.** 32 code files: `internal/telemetry/{telemetry,trace,content,fileexporter}.go`, `internal/evalmeasure/export_otlp.go`, `cmd/mint/tracing.go`, `internal/mintcore/tracing.go`. It uses the OTLP/HTTP trace exporter, GenAI semantic conventions (`gen_ai.usage.*`, `gen_ai.system` through `ProviderResolver`), `fullsend.cost_usd`, tool-call spans (ADR 0108), and W3C `TRACEPARENT` propagation. The `OTEL_EXPORTER_OTLP_*` variables are wired through `reusable-dispatch.yml`, and MLflow is a consumer (#5361).
