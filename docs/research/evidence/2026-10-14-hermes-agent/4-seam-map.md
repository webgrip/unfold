# 4 — Seam map: Unfold (glide) × Ploeg, for a Hermes Agent fit judgement


## Method

- **Repository and pin.** `/home/ryan/projects/webgrip/glide`, branch `development`, HEAD `7575e4d3` (2026-10-13, the merge of PR #370 "plan sessions that ploeg-worker executes with a harness and model chosen per session"). The Ploeg submodule `apps/ploeg` is pinned at `v0.2.0-rc.21` (`d692f1a`, 2026-10-13).
- **What was done.** Everything is a static read of source, contracts, ADRs and research.
  - Greps were case-insensitive. Occurrences were counted with `grep -rio | wc -l` and files with `grep -ril`, over the five trees named in the brief.
  - One extra sweep covered the whole repository (excluding `node_modules`, `.git` and `dist`) for "hermes" and "nous research".
- **What was not done.** No test was run, and no cluster, tracker or gateway was queried.
- **How to read the labels.** "Not implemented" means zero code hits at this pin. ADR statuses come from each file's front matter and from the ledgers.

## Headlines

1. **The harness seam accepts any stdio ACP agent.**
   - The `acp` adapter plus a `Profile` is enough. A profile is a command, an environment translation, and an optional config writer that sees the permission mode.
   - A route with no Go change exists (`acp.profile: custom`). It cannot write a home-directory config file, cannot see the permission mode, and runs with the credential proxies off unless forced on.
2. **The harness is never told its budget, deadline or remaining spend.**
   - The claim response carries `Authorized` (USD) and `Deadline`. Neither reaches the prompt or the TaskSpec.
   - LiteLLM's per-key `max_budget` just starts refusing calls.
   - Backlog #44 ("map the authorized figure onto native harness levers") is still open.
3. **Checkpoints are forensic phase markers, not resume state.**
   - ADR-0075 (resume from a WIP ref) is proposed and not built.
   - `TaskSpec.checkpoint` is never filled in.
4. **The agent's `learnings` appear to be dropped before they can be kept (static read).**
   - `harness.MergeDropBox` does not copy `learnings` from the drop box, and every adapter returns through it.
   - So the learning and Work Item Notes channel (ADR-0066 and ADR-0088) looks inert end to end.
   - No test sends learnings through a drop box.
5. **Skills are minimal.**
   - Only two embedded Ploeg skills exist.
   - ADR-0083 (accepted) is at 0 of 13 tasks and ADR-0092 (proposed) at 0 of 22.
   - No skill catalogue, hub or security scanner exists in code.
6. **Hermes appears in exactly two files in the whole repository.**
   - Both are Ploeg research: the 2026-09-26 landscape and the 2026-07-28 Paperclip fit.
   - The landscape says Hermes Agent speaks A2A 1.0 as client and server. Deploying it in the webgrip stack would meet ADR-0007's re-evaluation trigger "a real A2A client lands in the webgrip stack".

## 1. Component inventory

| Component | Where | What it talks to (transport; auth) |
|---|---|---|
| `ploegd` | `/home/ryan/projects/webgrip/glide/apps/ploeg/cmd/ploegd/main.go`; HTTP routes in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/httpapi/server.go` | See the routes and dependencies below the table |
| `ploeg-worker` | `/home/ryan/projects/webgrip/glide/apps/ploeg/cmd/ploeg-worker/main.go`; logic in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/worker.go`; launcher in `/home/ryan/projects/webgrip/glide/apps/ploeg/cmd/ploeg-worker/sandbox.go` and `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/sandboxlaunch/launcher.go` | See the notes below the table |
| Unfold server | `/home/ryan/projects/webgrip/glide/apps/unfold/src/main.ts`; Node 24 with a single-writer SQLite store (`/home/ryan/projects/webgrip/glide/apps/unfold/docs/architecture.md`) | See the notes below the table |
| VS Code extension | `/home/ryan/projects/webgrip/glide/apps/unfold/extensions/vscode` (package.json version 0.4.0-rc.78) | REST to Unfold's `/api/*` (`/home/ryan/projects/webgrip/glide/apps/unfold/extensions/vscode/src/client.ts`). It registers Unfold as a remote agent host for VS Code's Agents window (`/home/ryan/projects/webgrip/glide/apps/unfold/extensions/vscode/src/agent-host.ts`) |
| `unfold-mcp` | `/home/ryan/projects/webgrip/glide/apps/unfold/src/mcp.ts`; launcher `/home/ryan/projects/webgrip/glide/apps/unfold/scripts/mcp.ts` (`npm run mcp`) | MCP over stdio only. It answers MCP revisions 2025-11-25, 2025-06-18 and 2025-03-26, then calls Unfold's HTTP API with `Authorization: Bearer vle_…` |
| `ploeg-mcp` | `/home/ryan/projects/webgrip/glide/apps/ploeg/cmd/ploeg-mcp/{main.go,tools.go,http.go}`; MCP go-sdk v1.8.0 (`/home/ryan/projects/webgrip/glide/apps/ploeg/go.mod`) | Stdio, or `ploeg-mcp http`: stateless Streamable HTTP as an OAuth resource server. Both call ploegd's operator API. Auth details are in §7 |
| site | `/home/ryan/projects/webgrip/glide/apps/site` | A static Astro build on Cloudflare Workers Static Assets, plus a Worker that stores sign-ups in D1 in the EU (`/home/ryan/projects/webgrip/glide/apps/site/README.md`; root ADR-0012 and ADR-0016 in `/home/ryan/projects/webgrip/glide/docs/adr/`). It has no runtime link to Ploeg |
| (extra) `ploeg-okf` | `/home/ryan/projects/webgrip/glide/apps/ploeg/cmd/ploeg-okf/main.go` | A CLI for OKF bundles: `validate`, `pack`, `to-omnigraph`, `from-omnigraph`, `context inspect` |

**`ploegd` routes**
- Webhooks: `/webhooks/{tracker,forge}/{provider}`.
- Worker run API: `/api/v1/claim`, `/runs/{token}/{renew,checkpoint,outcome,llm/credential,llm/block,llm/spend,knowledge,context/{id},transcript,forge-credential,claude-session}`.
- Operator API: `/api/v1/operator/*`.
- `/api/v1/deploys` and `/metrics`.

**`ploegd` dependencies**
- **PostgreSQL.** It is the only process with database credentials.
- **LiteLLM admin.** It holds the master key and calls `/key/generate`, `/key/block`, `/key/delete` and `/spend/logs` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/litellm/client.go`).
- **Forges.** It mints per-Run push tokens. GitHub uses App installation tokens (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/githubapp`).
- **Trackers.** It writes comments and statuses back.
- **Omnigraph knowledge graphs.** Through `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/knowledgegraph` and `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/omnigraph/client.go`.
- **KEDA.** KEDA polls ploegd's database with SQL: a count of `pending` agent_runs per Team and Role (`/home/ryan/projects/webgrip/glide/apps/ploeg/ops/helm/ploeg/templates/scaledjob.yaml`; `/home/ryan/projects/webgrip/glide/docs/concepts/inside-a-run.md`).

**`ploeg-worker`**
- **One pod per Run.** A KEDA ScaledJob per Team and Role starts it, or a `sandbox-launch` pod creates an agent-sandbox `SandboxClaim`.
- **To ploegd.** HTTP to the run API. A bootstrap capability is exchanged at claim for a Run token plus a signed control capability (at most 24 h), with `X-Ploeg-Worker-ID` (`/home/ryan/projects/webgrip/glide/apps/ploeg/docs/contracts/worker-control.md`).
- **To the forge.** git smart-HTTP and forge REST.
- **To the model gateway.** LiteLLM's OpenAI-compatible HTTP with the per-Run key, behind loopback proxies.
- **To the harness.** A child process: stdio JSON-RPC for ACP, spawn-and-wait for the other adapters.
- **Refuses to start** if it sees `LITELLM_MASTER_KEY`, `LITELLM_ADMIN_URL`, `PLOEG_WORKER_SIGNING_KEY`, `PLOEG_WORKER_BOOTSTRAPS`, `PLOEG_FORGEJO_ADMIN_TOKEN`, `PLOEG_FORGEJO_BOT_PASSWORD`, `PLOEG_DATABASE_URL` or `KUBECONFIG` (`/home/ryan/projects/webgrip/glide/apps/ploeg/cmd/ploeg-worker/main.go`).
- **Network reach** is DNS, the ploeg pods, LiteLLM `ai:4000`, Forgejo `:3000` and Vikunja `:3456` (`/home/ryan/projects/webgrip/glide/docs/concepts/inside-a-run.md`).

**Unfold server**
- **Browser and extension.** REST plus SSE (`/home/ryan/projects/webgrip/glide/apps/unfold/src/http.ts`).
- **AHP.** A WebSocket host through `ws` (`/home/ryan/projects/webgrip/glide/apps/unfold/src/ahp/host.ts`, `/home/ryan/projects/webgrip/glide/apps/unfold/src/ahp/websocket.ts`).
- **Ploeg.** The operator API with an Operator Consumer bearer:
  - read client: `/home/ryan/projects/webgrip/glide/apps/unfold/src/ploeg.ts`;
  - execution client: `/home/ryan/projects/webgrip/glide/apps/unfold/src/execution-authority.ts`;
  - the `ploeg.tokenEnv` checks are in `/home/ryan/projects/webgrip/glide/apps/unfold/src/config.ts`.
- **Sign-in.** OIDC (`/home/ryan/projects/webgrip/glide/apps/unfold/src/oidc.ts`).
- **Trackers.** `/home/ryan/projects/webgrip/glide/apps/unfold/src/tasks.ts`.
- **Standalone LiteLLM broker.** `/home/ryan/projects/webgrip/glide/apps/unfold/src/broker.ts`.
- **Its own runtimes still exist** in `/home/ryan/projects/webgrip/glide/apps/unfold/src/runtime/`: an opencode HTTP runtime (`opencode.ts`), a JSON-lines command bridge (`command.ts`), and Docker, Kubernetes, sandbox and relay backends.
- **Planned removal.** Root ADR-0002 retires this engine. Unfold ADR-0044 (proposed) deletes `OpenCodeRuntime` and `CommandRuntime` (`/home/ryan/projects/webgrip/glide/apps/unfold/docs/adrs/0044-sessions-run-in-ploeg-with-a-harness-chosen-per-session-and-interaction-kept.md`).

## 2. The harness seam

### 2.1 Interface

**`harness.Adapter`** is in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/adapter.go`:
- `Name() string`
- `Run(ctx, TaskSpec, RunEnv) (OutcomeReport, error)`; a cancelled `ctx` means the lease is lost.
- `ExpectsLLM() bool`

**Sub-contract `CommandAdapter`** (same file):
- Methods: `Prepare(spec, env) (Invocation, error)`, `ParseOutcome(spec, ExecResult) (OutcomeReport, error)` and `ExpectsLLM`.
- `harness.RunCommand` lifts it to `Adapter`: exec in the repo directory, an 8 KiB log tail, an idle watchdog.

**`RunEnv`** carries:
- `RepoDir`, `ScratchDir`, `Prompt` (composed by Ploeg), `BaseEnv`;
- `LLM LLMEnv{APIKey, BaseURL, Model, TraceID, MCPURL}`;
- `Checkpoint func(work.Checkpoint)`, `Transcript`, `IdleTimeout`, `Activity`, `RemoteSession`.

**`TaskSpec` and `OutcomeReport`** are in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/contract.go`, with schemas in `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/contracts/taskspec.v1.schema.json` and `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/contracts/outcomereport.v1.schema.json`.

### 2.2 Implementations

The explicit registry is the switch in `NewAdapter` in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/adapters.go`. `CheckHarnessBinary` (same file) fails the worker before it claims when the binary is missing.

| `PLOEG_HARNESS` | Shape | Starts | Files |
|---|---|---|---|
| `openhands` (default) | CommandAdapter | Image entrypoint `docker-entrypoint.sh --headless -f <task file>`; reads the drop box | `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/adapters/openhands/openhands.go` |
| `acp` | Session adapter | Any ACP v1 stdio agent, through a profile | `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/adapters/acp/*.go` |
| `claude-code` | CommandAdapter | `claude -p --output-format json`, `bypassPermissions` by default. The target repository's hooks and MCP servers are disabled (`--settings`, `--strict-mcp-config`). Sets `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` (gateway without `/v1`), `ANTHROPIC_MODEL`, and model aliases pinned to the Run's model | `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/adapters/claudecode/claudecode.go` |
| `claude-environment` | Adapter (remote) | Dispatches a Claude Code session to a Team's self-hosted environment (`--environment ccpool_…`), then polls ploegd for the runner's report (ADR-0084) | `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/adapters/claudeenv/claudeenv.go` |
| `exec` | CommandAdapter | Any argv with `{taskspec}` and `{taskfile}` substituted; writes `taskspec.json` (v1) and `task.md`; decodes `outcome.json`. Team `copper` runs `/bin/cat` | `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/adapters/execbin/execbin.go` |

### 2.3 How a Team selects one

- **Override order.** Global `executor.harness`, then `executor.teams[].harness`, then `executor.teams[].plan[].roles[].harness`, field by field. Files: `/home/ryan/projects/webgrip/glide/apps/ploeg/ops/helm/ploeg/values.yaml`, `/home/ryan/projects/webgrip/glide/apps/ploeg/ops/helm/ploeg/values.schema.json`, `/home/ryan/projects/webgrip/glide/apps/ploeg/ops/helm/ploeg/templates/_helpers.tpl`.
- **Values that become worker environment variables:**

  | Value | Environment variable / effect |
  |---|---|
  | `name` | `PLOEG_HARNESS`: openhands, exec, claude-code, acp or claude-environment |
  | `image` | Required; Ploeg publishes no agent image |
  | `entrypoint` | `PLOEG_HARNESS_ENTRYPOINT` |
  | `args`, `outcomeFile` | exec only |
  | `dind` | Default `true` in the chart |
  | `credentialIsolation` | `""` or `proxy` |
  | `timeout` | `PLOEG_HARNESS_TIMEOUT`, default 100m |
  | `idleTimeout` | `PLOEG_HARNESS_IDLE_TIMEOUT`, default 15m |
  | `toolchains`, `verify`, `verifyTimeout` | Toolchains on PATH and the verify commands |
  | `acp.profile` | `PLOEG_ACP_PROFILE`; schema enum `opencode`, `qwen-code`, `goose`, `openhands`, `custom` |
  | `acp.argv` | `PLOEG_ACP_ARGV` |
  | `acp.configJson` | `PLOEG_ACP_CONFIG_JSON` |
  | `acp.permissionMode` | `PLOEG_ACP_PERMISSION_MODE`: `allow_always` (default), `allow_read_only`, `deny_all` |
  | `acp.promptTimeout` | Default 45m |
  | `acp.idleTimeout` | Default 10m |
  | `claudeEnvironment.*` | claude-environment only |

- **Reference.** All of these are in `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/reference/configuration.md`. There is no `configuration.md` under `/home/ryan/projects/webgrip/glide/docs/reference/`, which is the path the brief named.
- **Credential proxies.** They default on only for harnesses listed in `ploeg.isolationQualifiedHarnesses`: `openhands`, `acp/openhands` and `exec` (`/home/ryan/projects/webgrip/glide/apps/ploeg/ops/helm/ploeg/templates/_helpers.tpl`).
  - Any other harness renders with both proxies off, and `PLOEG_CREDENTIAL_ISOLATION_OFF_REASON` is `unqualified` or `dind`.
  - A workload can force them on with `harness.credentialIsolation: proxy`.
  - Evidence: `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/research/2026-10-04-isolation-qualification.md`.
- **What a Run records.** ploegd records each Run's harness, harness profile, model, plan hash and ploegd version: ADR-0091 (proposed, but built) in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/store/migrations/0050_run_config.sql` and `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/store/run_config.go`.

### 2.4 ACP adapter internals

All in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/adapters/acp/` unless noted.

- **Protocol.** ACP wire v1 only, through `github.com/coder/acp-go-sdk` v0.13.5. The agent must negotiate exactly the client's version or the Run fails.
  - Wire enums are Ploeg-owned and parsed from raw `session/update` lines, because the SDK lags upstream and its `UsageUpdate` has no `cost` field (`wire.go`, `state.go`).
- **Phases and timeouts** (`acp.go`):
  - phases: launch, `initialize` (30 s), `session/new` (60 s), `session/prompt` (45 m wall, 10 m with no protocol activity);
  - cancel grace 30 s; on shutdown the adapter closes stdin, sends SIGTERM, and sends SIGKILL after 10 s;
  - the process group is started with `Setpgid` (`launcher.go`).
- **Client capabilities.** All are false. `fs/*`, `terminal/*` and `elicitation/*` are refused, and `authenticate` is never called (`client.go`, `acp.go`).
- **MCP.** `session/new` gets one server at most: the LiteLLM gateway's `/mcp`, over HTTP, with header `x-litellm-api-key`. That happens only if the key was minted with MCP access groups and the agent advertises `mcpCapabilities.http` (ADR-0078; `acp.go` `mcpServers`).
- **Permission policy** (`permission.go`):
  - modes `allow_always`, `allow_read_only` (allows tool kinds read, search, fetch and think) and `deny_all`;
  - it picks options by `kind` (allow_once before allow_always; reject_once before reject_always), then by name or id match;
  - a storm cap of 200 requests per Run or 60 per minute stops the session and reports `stuck`.
- **Stop-reason mapping** (`outcome.go`):

  | Stop reason or failure | Outcome |
  |---|---|
  | `end_turn` with no completed edit, delete or move tool call | `no_change_needed` |
  | `end_turn` otherwise | Empty outcome; the forge decides |
  | `refusal` | `stuck` |
  | `max_turn_requests` | `stuck` ("turn budget … likely needs splitting") |
  | `max_tokens` | `failed`, reason `budget` (token ceiling, not money) |
  | `cancelled` | `stuck` |
  | Unknown stop reason | Treated as `end_turn` |
  | Launch or `initialize` failure | `failed`, reason `infra_node` |
  | `session/new` failure | `failed`, reason `infra_llm` when stderr or the error contains auth_required, authentication, unauthor, forbidden, 401, 403, 429, quota, rate limit, upstream or api key; otherwise `infra_node` |
  | Crash mid-prompt, idle watchdog or prompt wall | `failed`, reason `agent_error` |
  | Lease lost | `failed`, reason `lease_lost` |
- **Checkpoints from the protocol** (`acp.go`): `agent_started`, `plan_ready` and `changes_made`, plus a `progress` heartbeat every 5 min, at most 15 per Run. They are non-blocking.
- **Transcript.** `session/update` lines are transcribed (ADR-0090; `transcribe.go`).
- **Usage.** Used and size tokens, plus cost when the agent sends one (`outcome.go` `buildUsage`). The worker then overwrites `CostUSD` with the spend it observed on the gateway (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/worker.go` `runWatchedAgent`).
- **Return path.** `PLOEG_OUTCOME_FILE`, the drop box (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/dropbox.go`).

### 2.5 Profiles

**The struct** (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/adapters/acp/profiles.go`):
- `Name string`
- `Argv []string`; `argv[0]` is replaced by `PLOEG_HARNESS_ENTRYPOINT`
- `Env func(harness.LLMEnv) []string`
- `Configure func(spec TaskSpec, env RunEnv, mode PermissionMode) ([]string, error)`, which writes a config file and returns the environment that points at it

**Overrides** are `ProfileOverrides{Entrypoint, Argv, ConfigJSON}`. `Lookup` is a switch, and an unknown name is a startup error.

**Common env (`openAICompatEnv`):** `OPENAI_API_KEY`, `LLM_API_KEY`, `OPENAI_BASE_URL`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_TRACE_ID`. It sets no `OPENAI_API_BASE` and no `OPENAI_MODEL`.

| Profile | Command | Environment | Config written | Approval mapped from the mode | `configJson` |
|---|---|---|---|---|---|
| `opencode` (default) | `opencode acp` | Common env | `<scratch>/opencode-<trace>.json`: an `@ai-sdk/openai-compatible` provider `litellm`, apiKey `{env:LLM_API_KEY}`, model `litellm/<model>`; pointed to by `OPENCODE_CONFIG` | Not set | Replaces the generated file |
| `qwen-code` | `qwen --acp --auth-type=openai` | Common env plus `OPENAI_MODEL`, `QWEN_USAGE_STATISTICS_ENABLED=false`, `QWEN_CODE_NO_RELAUNCH=true` | `<scratch>/qwen-code-<trace>.json` via `QWEN_CODE_SYSTEM_SETTINGS_PATH`; per-Run `QWEN_HOME`; AGENTS.md; web search and auto-update off | `tools.approvalMode`: `yolo` or `default` | Replaces the generated file |
| `goose` | `goose acp` | Environment only: `GOOSE_PROVIDER=litellm`, `GOOSE_MODEL`, `LITELLM_HOST`, `LITELLM_BASE_PATH`, `LITELLM_API_KEY`, `GOOSE_PATH_ROOT`, `GOOSE_DISABLE_KEYRING`, `GOOSE_TELEMETRY_OFF`, `GOOSE_DISABLE_SESSION_NAMING=true`, `CONTEXT_FILE_NAMES` | None | `GOOSE_MODE`: `auto` or `approve` | Refused |
| `openhands` | `openhands acp --override-with-envs` | `LLM_*`, `LITELLM_PROXY_API_KEY`, model `litellm_proxy/<m>` | `<scratch>/openhands-<trace>/agent_settings.json` (no key); `OPENHANDS_PERSISTENCE_DIR` | None; the agent asks over ACP | Refused |
| `custom` | `PLOEG_ACP_ARGV` (required) | Common env | None | None | Ignored |

**Qualification state** (`/home/ryan/projects/webgrip/glide/apps/ploeg/docs/contracts/acp-profiles.md`):
- `qwen-code` and `goose` are "not yet qualified".
- `openhands` was checked on 2026-09-29 and is qualified for both proxies.
- Stop reasons recorded: `end_turn`, `cancelled`, `max_tokens` for qwen-code and goose; `end_turn` checked for openhands.

**Rules a profile must keep** (same contract file):
- The key goes only into environment variables, never into a config file.
- Config files and agent home directories are suffixed with the trace id.
- The agent's own approval setting follows the permission mode.
- Calls outside the gateway are switched off.
- Repository-supplied configuration is a risk. Goose enables MCP servers from `.agents/plugins/`; Qwen Code reads the repository's `.env` and `.qwen/settings.json`.

### 2.6 Conformance

**Offline kernel:** `harnesstest.Run(t, Fixture{NewAdapter | NewSessionAdapter})` in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/harnesstest/conformance.go`.
- **Properties checked:**
  - `PrepareProducesRunnableInvocation`
  - `SuccessWithoutStructuredOutput`
  - `FailureNeverFabricatesAnOutcome`
  - `StuckAlwaysCarriesAReason`
  - `FailureReasonIsValidOrEmpty`
  - `SurvivesGarbageOnStdout`
  - `CancelKillsTheHarness` (within 5 s)
  - `ReadingRunFindingsSurviveTheAdapter`
  - `WritingRunProblemAndSolutionSurviveTheAdapter`
  - `WritingRunAccountSurvivesGarbageOnStdout`
  - `DeliveryClaimsNeverSurviveTheAdapter`
- **Where it runs:** `acp_test.go`, `execbin_test.go`, `claudecode_test.go`, `openhands_test.go`. It does not run for `claudeenv_test.go` (0 `harnesstest` hits).
- **What it does not cover:** individual profiles. Those are pinned by `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/adapters/acp/profiles_test.go` and `profiles_secret_test.go` (the opencode config must not contain the key). There is also no property that learnings survive an adapter.

**Live suite:** `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/harnesstest/live_test.go`.
- **How to run it.** `mise run harness-conformance`, defined in `/home/ryan/projects/webgrip/glide/mise.toml`. It runs in `apps/ploeg` with `PLOEG_HARNESS_CONFORMANCE=1` and executes `go test -p 1 -count=1 -v -run '^TestLive' ./pkg/harness/harnesstest/`.
- **Inputs.** `PLOEG_CONFORMANCE_HARNESSES` (comma-separated filter), `PLOEG_CONFORMANCE_LLM_API_KEY`, `_BASE_URL` and `_MODEL`.
- **Behaviour.** It makes real model calls, gives each Run 10 min, and skips a harness whose binary is not on `PATH`.
- **`TestLiveCanaries`** measures whether each `liveHarnessTable` entry loads a root and a nested (`service/`) AGENTS.md by itself.
  - Entries: `openhands`, `claude-code`, `acp` (opencode), `acp-qwen-code`, `acp-goose`, `acp-openhands`.
  - Repository layouts are in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/harnesstest/canary.go`.
  - The claims must match the table in `/home/ryan/projects/webgrip/glide/docs/how-to/prepare-a-repository.md`.
- **`TestLiveClaudeCodeIgnoresTargetHooksAndMCPServers`** applies to claude-code only.
- **Coverage gap.** The live suite measures instruction-file loading only. Stop reasons, permission storms and proxy behaviour remain manual pre-switch checks (`/home/ryan/projects/webgrip/glide/apps/ploeg/docs/contracts/acp-profiles.md`).

### 2.7 What a Hermes-shaped profile would need

This is for an agent that reads `OPENAI_API_BASE` and `OPENAI_API_KEY` and a home-directory `config.yaml`.

**In code** (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/adapters/acp/profiles.go`):
1. **A new `Lookup` case.** Names are normalised (`-` and spaces become `_`, lower case; `normalise` in `wire.go`). Add the name to the "known" error text.
2. **`Argv`.** The agent's stdio ACP command. The binary must be on `PATH` in the Team's `harness.image`, because Ploeg installs no agents.
3. **`Env`.**
   - Emit `OPENAI_API_BASE`; `openAICompatEnv` only emits `OPENAI_BASE_URL`.
   - Emit whatever model variable the agent reads, as qwen-code does with `OPENAI_MODEL`.
   - Under key isolation the key is a random placeholder and the base URL is a loopback address (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/llmproxy.go`).
   - The proxy accepts the placeholder only in `Authorization: Bearer`, `X-Api-Key` or `X-Litellm-Api-Key: Bearer`.
4. **`Configure`.** Write `config.yaml` with no key in it: either an env reference or no key field at all.
   - The Run's `HOME` is `<scratch>/home`, set as `HOME=` in `env.BaseEnv` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/worker.go`, `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/environment.go`).
   - Either derive `HOME` from `BaseEnv`, or point the agent at a per-Run directory with its own home variable. The precedents are `QWEN_HOME`, `GOOSE_PATH_ROOT` and `OPENHANDS_PERSISTENCE_DIR`.
   - Overriding `HOME` in the extra environment would take effect, but it would hide `$HOME/.agents/skills` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/skills/skills.go`).
5. **Approval.** Map `allow_always` to the agent's own auto-approve setting. Under the other two modes the agent must ask through `session/request_permission`, with `kind`-tagged options and typed tool kinds. An agent that asks on every call even under `allow_always` hits the 200/60 storm cap.
6. **No `authenticate` call, and no client `fs/*`, `terminal/*` or elicitation.**
7. **Stop reasons and tool kinds.** Edits must be reported as `edit`, `delete` or `move` for the no-change inference to be right. Otherwise the unpublished-work guard in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/unpublished.go` decides.
8. **Disable everything outside the gateway:** the agent's own MCP servers or plugins, telemetry, update checks and web search. The pod reaches only LiteLLM, Forgejo and Vikunja.
9. **Read AGENTS.md.**
10. **Skills directory.** `SkillDirectories` returns nil for `acp`, so only `$HOME/.agents/skills` gets skills (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/adapters.go`). Add the agent's own skills directory if it does not read that one.

**In the chart and docs:**
- **Schema.** Add the name to the profile enum in `/home/ryan/projects/webgrip/glide/apps/ploeg/ops/helm/ploeg/values.schema.json`.
- **Qualification.** Optionally add `acp/<name>` to `ploeg.isolationQualifiedHarnesses` after qualifying it.
- **Configuration reference.** Regenerate `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/reference/configuration.md`; the `docs-configuration.py --check` step in `/home/ryan/projects/webgrip/glide/apps/ploeg/mise.toml` checks it.
- **Docs and tests.**
  - a column in `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/contracts/acp-profiles.md`;
  - a row in `/home/ryan/projects/webgrip/glide/docs/how-to/prepare-a-repository.md`;
  - a `liveHarnessTable` entry;
  - a test that the generated config holds no key.

**Route with no Go change.** Set `acp.profile: custom` and `acp.argv: [<wrapper>]`.
- The wrapper maps `OPENAI_BASE_URL` to `OPENAI_API_BASE`, writes `$HOME/.<agent>/config.yaml` from `LLM_MODEL` and `LLM_BASE_URL`, then execs the ACP command.
- **Limits:**
  - The child cannot see the permission mode, because `PLOEG_ACP_PERMISSION_MODE` is not on the allowlist.
  - `configJson` is ignored.
  - The proxies are off unless `credentialIsolation: proxy` is set.
  - There is no live-suite entry.

### 2.8 Child environment and HOME

**From the worker's environment**, `harnessEnvironment` passes only `PATH`, `LANG`, `LC_ALL`, `TZ`, `TERM`, `DOCKER_HOST`, `DOCKER_CERT_PATH`, `DOCKER_TLS_VERIFY`, `LITELLM_LOCAL_MODEL_COST_MAP` and `OPENHANDS_SUPPRESS_BANNER` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/environment.go`).

**It then sets:**
- `HOME=<scratch>/home` and `TMPDIR=<scratch>`;
- `XDG_CONFIG_HOME`, `XDG_DATA_HOME` and `XDG_CACHE_HOME` under `HOME`;
- `LLM_BASE_URL` and `LLM_MODEL`;
- for writers, `AGENT_BUILDER_TOKEN` (a placeholder under the forge proxy).

**The worker adds** (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/worker.go`, `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/git.go`):
- `PLOEG_VERIFY_SCRIPT`, `PLOEG_SKILLS_DIR`, `PLOEG_CONTEXT_DIR`, `PLOEG_KNOWLEDGE_DIR`;
- `GITHUB_PAT`, a canary, for writers;
- toolchain `PATH` entries and environment;
- git settings: `GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`, plus an extraheader or the proxy `insteadOf`;
- `LLM_TRACE_ID` and `LLM_API_KEY`.

**The adapter adds** `PLOEG_OUTCOME_FILE` and the profile's environment.

**Lifetime.** Scratch lives under `WORK_DIR`, default `/mnt/ci-shared` (`/home/ryan/projects/webgrip/glide/apps/ploeg/cmd/ploeg-worker/main.go`). That is an 8 Gi `emptyDir` per pod (`/home/ryan/projects/webgrip/glide/apps/ploeg/ops/helm/ploeg/templates/_helpers.tpl`). So anything an agent writes to `HOME` (memory, self-written skills, a SQLite board) dies with the pod.

**Contract text** is in `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/contracts/worker-control.md`, section "Workspace boundary". The brief's root `docs/contracts/` does not exist.

## 3. The budget and credential seam

### 3.1 Minting and capping the key

- **Authorization.** At claim, ploegd authorizes `min(roleCap, budget − spent − reserved)` under the Shift row lock. `reserved` is the sum of `authorized` over running Runs (ADR-0012, accepted: `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/adrs/0012-two-level-budgets-authorized-and-settled.md`; `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/store/migrations/0008_shifts.sql`).
  - An exhausted pool spawns nothing (backlog #44 in `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/backlog.md`).
  - `ClaimResponse.Authorized` and `Deadline` are defined in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/api.go`.
- **Minting.** The worker calls `POST /runs/{token}/llm/credential`. ploegd then calls LiteLLM's `POST /key/generate` with:
  - `key_alias` = trace `ploeg-<12hex>`;
  - `max_budget`, `models`, `duration` (TTL; chart default `executor.litellm.keyDuration: 4h`);
  - `team_id` and `object_permission.mcp_access_groups` (ADR-0078);
  - `metadata.disable_fallbacks=true`.

  Code: `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/litellm/client.go`, `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/llmbroker/litellm.go`, `/home/ryan/projects/webgrip/glide/apps/ploeg/ops/helm/ploeg/values.yaml`.
- **Revoke and block.** The worker revokes the key on every return path and blocks it via `/runs/{token}/llm/block`. It reads provisional spend from `/llm/spend`.
- **Settlement.** A sweep settles from `/spend/logs` after a quiet period (`PLOEG_LLM_SETTLE_AFTER`, 15m; `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/ops/alerts.md`).
- **Account states.** reserved, minting, issued, unknown, blocked, reconciled (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/store/migrations/0012_run_llm_accounts.sql`; `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/store/llm_accounts.go`).
- **Cost status vocabulary.** observed, provisional, settled, unknown (`work.CostStatus`, ADR-0093).
- **ADR-0008** (accepted; review-by 2026-10-31) keeps LiteLLM as the seam. The coupling is confined to the `Broker` interface in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/llmbroker/broker.go`.
- **Asks.** An Ask's budget is `PLOEG_ASK_BUDGET_USD`, default 0.02 (ADR-0082).

### 3.2 Isolation and leak watch

All from `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/contracts/worker-control.md` and ADR-0034 (accepted).

- **Model key proxy.** With `PLOEG_LLM_KEY_ISOLATION=proxy`, the harness gets a placeholder and a loopback URL. The proxy forwards only requests that present the placeholder, compared in constant time.
  - It does not filter by path (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/llmproxy.go`).
  - Gateway traffic is not scanned.
- **Forge token proxy.** With `PLOEG_FORGE_TOKEN_ISOLATION=proxy`, the proxy serves a per-Role allowlist in the Run's own repository (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/forgeproxy.go`; push fence in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/pushfence.go`).
  - Allowed: git fetch and push, reading and opening the pull request, comments, reading commit statuses (and check runs on GitHub).
  - Pushes are fenced to `refs/heads/<run branch>`.
- **Leak watch.** The worker watches the real model key, the real forge token and the `GITHUB_PAT` canary (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/leakwatch.go`).
  - A forge request carrying one gets 403, and the Run loses forge writes.
  - Pushed commits are scanned with `git log --patch`. A hit makes the Run `failed`, reason `credential_leak`, with no links and no verdict.
  - Learnings are scanned too.
- **Other protections.**
  - The worker marks itself non-dumpable (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/conceal_linux.go`).
  - The worker's own git runs in a fresh git directory (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/workergit.go`).

### 3.3 Outcome codes and failure reasons

From `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/contracts/outcomereport.v1.schema.json`, mirrored in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/work/types.go`. Required fields are `outcome` and `summary`.

| Field | Values |
|---|---|
| `outcome` | pr_opened, pr_updated, issue_updated, follow_up_created, stuck, failed, no_change_needed |
| `failureReason` | infra_node, infra_llm, agent_error, budget, lease_lost, timeout, idle, credential_leak |
| `verdict` | approve, request_changes |
| `delivery.observed` | opened, updated, none, unknown |
| `verification.result` | passed, failed, incomplete |
| verification check | passed, failed, not_run |
| `createdWorkItems.kind` | split, clarify, discovered |
| `learnings.scope` | work-item, repository, client, tenant |

- **Classification.** `IsInfra` is true for infra_node, infra_llm and lease_lost.
- **Outcome to Work Item state** (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/work/state.go` `StateForOutcome`):
  - stuck becomes needs_human;
  - failed becomes queued (a retry);
  - pr_opened and pr_updated become awaiting_review;
  - everything else becomes done.

**Reasons the worker assigns itself:**
- **`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/unpublished.go`.** For a writer that reports `no_change_needed` or `pr_updated` and did not deliver, the outcome becomes `stuck` with one of:
  - "Ploeg could not confirm what the writer delivered"
  - "could not inspect the writer's checkout for unpublished changes"
  - "the writer pushed its branch but opened no pull request"
  - "the writer changed the checkout but delivered none of it"
- **`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/delivery.go`.**
  - `forgeUnreadableBeforeRun` gives `failed`, reason `infra_node`, before any key is minted.
  - `withoutDeliveryClaims` strips the adapter's `pr_opened`/`pr_updated`, links, checkpoint, verification and delivery.
- **Other sources.** The launcher start timeout gives `infra_node` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/unstarted.go`). The precedence among outcomes is in `resolveOutcome` in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/worker.go`.

### 3.4 Delivery facts (ADR-0059, proposed; the worker side is built)

- **What the worker reads.** The pull request for the Run's branch, before and after the harness.
  - It counts only a pull request from the Run's own branch, in the Work Item's repository (not a fork), against the target's base branch.
  - It tries three times, with backoff 0, 2 s and 5 s (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/forge.go`).
- **What it records.** `Delivery{forge, repository, branch, observed, number, url, base, head, headBefore, reason}` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/contract.go`).
- **ploegd stores and prefers it.** `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/store/migrations/0039_run_delivery.sql`; `RunPullRequest` in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/store/delivery.go`.

### 3.5 Are commit statuses or check runs read?

**Grep counts in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg`, excluding tests:**
- "check run": 5 occurrences in 3 files (`store/store.go`, `provider/forgejo/forgejo.go`, `provider/github/github.go`).
- "commit status": 18 occurrences in 9 files (`httpapi/pull_request_facts.go`, `forgefacts/forgefacts.go`, `provider/provider.go`, `provider/github/github.go`, `store/pull_requests.go`, `provider/gitlab/gitlab.go`, `provider/forgejo/forgejo.go`, `provider/forgejo/activity.go`, `shiftengine/review.go`).
- "statuses": 55 occurrences in 17 files. Many of those are tracker statuses: `gate`, `clickup`, `config`.

**Where they are read:**
- `provider.CommitStatusReader` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/provider/provider.go`) is implemented for all three forges: `forgejo/forgejo.go`, `gitlab/gitlab.go`, and `github/github.go` (which reads both statuses and check runs).
- **It feeds pull request facts only.** The callers are `forgefacts.CI`, `ReviewWatch.recordFacts` in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/shiftengine/review.go`, and `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/httpapi/pull_request_facts.go`. The results land in `pull_requests.ci_state` (migration `0024_pull_request_diff_and_ci.sql`).
- **The ready gate ignores forge CI.** ADR-0070 (accepted) uses only the worker's own verification. `checks_not_passed` comes from `checksHoldBackReview` reading `Verification` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/shiftengine/reviewloop.go`).
- **Failed-check webhooks** (`check_failed`) act only for Teams that set `forgeFollowUps` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/httpapi/forge_followup.go`).
- **Agents can read CI too.** The harness may read statuses and check runs through the forge proxy allowlist.

## 4. The checkpoint seam

**What a checkpoint contains** (`work.Checkpoint` in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/work/types.go`; schema `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/contracts/checkpoint.v1.schema.json`):
- `workItemId` and `phase` (required);
- `branch`, `prUrl`, `commit` (a reviewer's checked-out commit), `nodeName`, `podUid`, `at`;
- `instructionFiles[{path, sha256}]`.

**When it is written:**
- **By the worker at start**: `branch_created`, with node, pod and instruction-file digests (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/worker.go`).
- **By the ACP checkpointer**: `agent_started`, `plan_ready`, `changes_made`, and a `progress` heartbeat every 5 min, at most 15.
- **Inline in the outcome**: `pr_opened`, `pr_updated` and `reviewed` (`worker.go` `resolveOutcome`; `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/review.go`).
- **Route**: `POST /api/v1/runs/{token}/checkpoint` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/httpapi/server.go`).

**Who uses it:**
- the `ploeg_shift_idle_seconds_max` metric (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/httpapi/metrics.go`);
- operator detail (`OperatorCheckpoint` in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/store/operator.go`).

**Nothing resumes from it:**
- `TaskSpec.Checkpoint` exists, but no code assigns it (`grep spec.Checkpoint`: 0 hits).
- A retry re-clones from scratch.

**ADR-0075 is not built** (`/home/ryan/projects/webgrip/glide/apps/ploeg/docs/adrs/0075-a-stopped-writing-run-leaves-a-checkpoint-its-retry-starts-from.md`, proposed). It specifies a WIP ref at `refs/ploeg/wip/<shift>/<run>`, the last N messages, the harness and image, and a briefed retry. `refs/ploeg/wip` has 0 code hits.

**Budget visibility to the harness: none.**
- **The prompt.** `ComposePrompt` and `ComposePlannerPrompt` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/task.go`) never mention money, a deadline or turns. The only "budget" there is `maxBriefingBytes` (8000).
- **The support sections** add nothing about budget either (`runSupportSection` in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/verify.go`; `writeKnowledge`/`writeLearningsInvitation` in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/knowledge.go`).
- **The TaskSpec schema.** Zero matches for budget, remaining, deadline or cost; its properties are workItem, role, checkpoint, repo, branch, traceId, briefing, openSpec, knowledge, context.
- **Native levers.** None are passed: no `--max-budget-usd`, `--max-turns` or `max_iterations` in `claudecode.go` or `openhands.go`.
- **What people see instead.** Shift budget notices go to the tracker and the pull request after exhaustion (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/shiftengine/publish.go`). Run cards show usage-so-far to people (ADR-0049).
- **Unverified side door.** Because the proxy does not filter paths, a harness could in principle ask the gateway about its own key. That is not designed and was not tested.

## 5. The knowledge, skills and learning seam

### Skills

- **ADR-0035** (proposed, review-by 2026-12-31) is built for skills:
  - Two skills are embedded in the binary: `ploeg-verify-before-handoff` for writers and readers, and `ploeg-review-against-work-item` for readers. Planners get none.
  - They are installed under `$HOME/.agents/skills` plus a harness directory: `.openhands/skills/installed` or `.claude/skills`.
  - The prompt names each skill's path.
  - Files: `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/skills/skills.go` and the two `SKILL.md` files under `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/skills/`.
- **ADR-0083** (accepted) is not built.
  - It specifies selection per Work Item, `PLOEG_SKILL_LIMIT`, `metadata.ploeg-tags`/`ploeg-paths`, and `TaskSpec.skills`. All of these have 0 code hits, and the schema has no `skills` field.
  - Tasks: 0 of 13 in `/home/ryan/projects/webgrip/glide/apps/ploeg/openspec/changes/select-skills-per-work-item/tasks.md`.
- **ADR-0092** (proposed, 2026-10-13) is not built.
  - It specifies a Team catalogue in APM `apm.yml`/`apm.lock.yaml`, fetched once by ploegd, checked by content hash with a host allowlist, failing open on availability and closed on content.
  - There is no `pkg/skillcatalogue`. Tasks: 0 of 22 in `/home/ryan/projects/webgrip/glide/apps/ploeg/openspec/changes/pin-skill-catalogues/tasks.md`.
- **No hub, registry or security scan exists in code.**
  - `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/research/2026-10-13-sharing-agent-skills.md` notes that scanners exist (Cisco skill-scanner, skills.sh audits) and that OWASP AST02 proposes signing.
  - Its chosen control is a content hash in a reviewed lockfile plus a host allowlist.

**Grep counts** for catalogue, catalog and scan:

| Directory | "catalogue" | "catalog" | "scan" |
|---|---|---|---|
| `apps/ploeg/docs/adrs` | 12 / 2 files | 17 / 4 files | 12 / 10 files |
| `apps/ploeg/docs/research` | 5 / 2 | 26 / 5 | 13 / 9 |
| `docs/adr` | 0 | 0 | 1 / 1 |
| `docs/research` | 9 / 4 | 30 / 11 | 29 / 13 |
| `apps/unfold/docs/adrs` | 10 / 3 | 11 / 3 | 6 / 2 |
| `apps/unfold/docs/research` | 3 / 2 | 10 / 5 | 6 / 4 |

- **No hit describes a skill scanner in code.** The only scans the code performs are the leak scan (`leakwatch.go`) and a check of instruction files for hidden Unicode (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/instructions.go`).

### Knowledge

- **ADR-0065** (proposed; proof of concept built).
  - Sources: the repository's own `knowledge/` OKF bundle, the directories in `PLOEG_KNOWLEDGE_DIRS`, and context-bundle concepts.
  - It is selected by term match within `PLOEG_KNOWLEDGE_BUDGET_BYTES` (default 24,000) and written outside the clone. The index goes in the prompt; the directory is `PLOEG_KNOWLEDGE_DIR`.
  - Code: `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/knowledge/pack.go`, `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/knowledge.go`, `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/okf/okf.go`.
- **ADR-0087 and ADR-0088** (proposed; partly built).
  - Runs read through `GET /runs/{token}/knowledge`, without holding any graph credential.
  - A pending-notes outbox is written to Omnigraph.
  - A Promotion is stored only as `suggested_scope`; there is no route that accepts one.
  - Code: `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/httpapi/knowledge.go`, `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/knowledgegraph/notes.go`, `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/store/work_item_notes.go`.
- **ADR-0089** (proposed): operator consumers write notes through `POST /api/v1/operator/work-items/{id}/notes`.

### Learnings

- **ADR-0066** (proposed).
  - The prompt invites `learnings`, at most 10, typed Pitfall, Convention or Fact.
  - The worker writes them as OKF concepts under `learned/` in `PLOEG_KNOWLEDGE_OUTBOX/<trace>` with `status: proposed`.
  - The review step ("a person accepts it in Vloer") is not built: 0 hits for learning or promotion in `/home/ryan/projects/webgrip/glide/apps/unfold/src`.
- **Apparent break.** `MergeDropBox` does not copy `Learnings` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/dropbox.go`). So drop-box learnings never reach:
  - `keepLearnings` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/knowledge.go`);
  - the Work Item Notes written from `keptLearnings` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/httpapi/knowledge.go`).

  This is a static finding; verify it with a test (see §11).
- **Design for a review queue.** `/home/ryan/projects/webgrip/glide/docs/research/2026-10-04-rfc-agent-knowledge.md` describes proposed learnings shown under "Needs you". ADR-0065 and ADR-0066 stay proposed until spike VIK-1859 reports.

### Context

- **ADR-0067** (accepted): context bundles are stored per Work Item in Postgres.
  - Limits: 20 MiB per upload, 50 MiB per Work Item, archive rules.
  - Uploaded with `POST /operator/work-items/{id}/context`; the worker unpacks them to `PLOEG_CONTEXT_DIR`.
- **ADR-0068** (accepted): context added while work runs reaches the next Run.
- Files: `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/contextbundle`, `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/context.go`.

**Root-ledger counterparts:** ADR-0021, ADR-0034 and ADR-0035 in `/home/ryan/projects/webgrip/glide/docs/adr/`, all proposed.

## 6. The tracker and forge seams

### Interfaces

All in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/provider/provider.go`.

- **`TrackerProvider`**: `Name`, `ParseWebhook(*http.Request) ([]TrackerEvent, error)`, `FetchItem`, `Comment`, `SetStatus(work.State)`.
  - Event kinds: assigned, updated, unassigned, closed.
- **`ForgeProvider`**: `Name`, `ParseWebhook`, `Comment`, `Comments`, `EditComment`, `PullRequestState`, `PullRequestFacts`.
  - Event kinds: review_submitted, check_failed, merge_state_dirty, pr_merged, pr_closed, pr_opened, pr_synchronized.
- **Optional capability interfaces** in the same package:
  - `BoardReader`, `TaskLinker`, `CommitStatusReader`, `AncestryReader` (`provider.go`);
  - `ExecutionReader`, `ForgeRepositoryLocator`, `RepositoryInspector` (`execution.go`);
  - `MergeabilityReader` (`mergeability.go`);
  - `ChangedPathsReader` (`changed_paths.go`);
  - `PullRequestActivityReader`, `CIHistoryReader`, `PullRequestDiffReader` (`activity.go`);
  - `PullRequestChangeReader` (`change.go`), `PublishedPullRequestReader` (`published.go`);
  - `CommentAttacher` (`attachment.go`), `CommentDeleter` (`comments.go`);
  - `RelationReader` (`relations.go`), `DeliveryIdentifier` (`delivery.go`).

### Implementations

- **Trackers:**
  - `vikunja`: `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/provider/vikunja/`
  - `clickup`: `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/provider/clickup/`
  - `githubissues`, whose `Name()` is "github": `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/provider/githubissues/githubissues.go`. Under ADR-0085 (proposed), a `ploeg:<team>` label or a mapped assignee dispatches an issue, using a repo-scoped GitHub App token.
- **Forges:**
  - `forgejo`: `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/provider/forgejo/`
  - `gitlab`: `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/provider/gitlab/`
  - `github`: `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/provider/github/` (ADR-0086, proposed)
- **Registration is compile time:** `/home/ryan/projects/webgrip/glide/apps/ploeg/cmd/ploegd/{webhooks.go,main.go,github.go}`.
- **ADR-0095** (proposed): assigning one Ploeg user dispatches the item, and a team label picks the Team.
- **ADR-0077** (proposed) is not built: out-of-process Work Source and Change Destination adapters over CloudEvents (0 hits for "cloudevent" in Go).

### Lifecycle enums

- **Work Item.** `work.State` in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/work/types.go`: ingested, proposed, queued, active, needs_human, awaiting_review, stale, done, withdrawn.
  - `leased` is a retired alias of `active` (ADR-0093).
  - DB check: `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/store/migrations/0052_work_item_state_active.sql`.
  - Transitions: `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/work/state.go`.
- **Shift.** There is no state enum. A Shift is open while `closed_at IS NULL`, and has a free-text `close_reason` (`0008_shifts.sql`). Reason constants:
  - plan_exhausted, review_approved, fix_round_cap_reached, budget_exhausted_before_fix_round, "budget exhausted", review_failed, "budget held by unsettled runs", checks_not_passed (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/shiftengine/reviewloop.go`);
  - writing_run_failed_repeatedly, writing_run_killed_repeatedly (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/shiftengine/failedwriter.go`);
  - withdrawn_unassigned, withdrawn_by_operator, withdrawn_closed, withdrawn_session_ended (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/store/withdraw.go`).
- **Run.** `agent_runs.state` moves pending → running → finished. It exists only as a SQL check (`0008_shifts.sql`), with no Go enum. The terminal result is `work.Outcome` plus `work.FailureReason`.
- **Operator execution.** admitted, running, waiting_input, pause_requested, paused, cancel_requested, cancelled, completed, failed, interrupted (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/store/migrations/0013_operator_executions.sql`; `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/store/operator_execution.go`).
- **LLM account.** As in §3.1.

## 7. The north seam

**`unfold-mcp`** (`/home/ryan/projects/webgrip/glide/apps/unfold/src/mcp.ts`)
- Tools: `unfold_now`, `unfold_find_work`, `unfold_get_work`, `unfold_sessions`, `unfold_spend`, `unfold_digest`, `unfold_ask`.
  - `unfold_digest` keeps its state in `~/.local/state/unfold-mcp/digest.json`.
  - `unfold_ask` is the only tool that writes or spends. It needs `use_model: true` and an MCP `elicitation/create` confirmation; without it there is no spend. It is paid from the Team's Ask Allowance.
- Auth: `UNFOLD_URL` plus `UNFOLD_TOKEN`, a `vle_…` editor credential valid for 30 days. It comes from a device-code login, `npm run mcp -- login`, which needs OIDC configured.
- Docs and decisions: `/home/ryan/projects/webgrip/glide/docs/how-to/ask-from-an-ai-client.md`; root ADR-0032.

**`ploeg-mcp`** (`/home/ryan/projects/webgrip/glide/apps/ploeg/cmd/ploeg-mcp/tools.go`)
- Tools: `ploeg_overview`, `ploeg_find_work`, `ploeg_get_work`, `ploeg_recent_runs`, `ploeg_changes_since`. All are marked readOnly and idempotent, with openWorld false.
- **Stdio mode:** `PLOEG_URL` plus `PLOEG_MCP_TOKEN`, the token of a read-only Operator Consumer.
- **HTTP mode** (`/home/ryan/projects/webgrip/glide/apps/ploeg/cmd/ploeg-mcp/http.go`): stateless Streamable HTTP as an OAuth resource server.
  - Listens on `:8090`; serves `/.well-known/oauth-protected-resource`.
  - Verifies tokens against `PLOEG_MCP_ISSUER`.
  - `PLOEG_MCP_GROUPS` maps IdP groups to a consumer `tokenEnv`, first match wins.
- Docs: ADR-0081 (accepted); `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/how-to/ask-ploeg-from-an-ai-client.md`, `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/how-to/serve-ploeg-mcp-over-https.md`.
- Both servers' instructions tell clients to treat any "untrusted" value as data, never as instructions.

**Operator API, beyond MCP** (`/home/ryan/projects/webgrip/glide/apps/ploeg/docs/contracts/README.md`, "Operator read consumers")
- Consumers are bearer-authenticated. Read routes need only a token.
- **Every write route needs `execute: true` and `X-Ploeg-Actor`** (`executionActor` in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/httpapi/operator_execution.go`):
  - approve and reject proposed work, requeue, cancel;
  - context uploads, notes, asks, pull request comments;
  - `executions`.
- **Executions** are how Unfold runs under Ploeg's authority. A consumer admits a Work Item, Shift and Run, gets one scoped LiteLLM credential (`maxBudgetUsd`, default 25, range 0.01 to 10000), sends commands (start, pause, cancel, message, heartbeat, report) and reads spend (`/home/ryan/projects/webgrip/glide/apps/unfold/docs/contracts/ploeg-execution.md`).
- **There is no route that creates a Work Item for normal worker execution.** Work enters only through a tracker.
  - The "submit-work-items" route is planned (Unfold ADR-0023 and ADR-0044).
  - The A2A facade (ADR-0007, backlog #102) is watchlisted.
  - The AHP projector (ADR-0006, backlog #101) is parked.

## 8. Existing mentions

Occurrences and files, case-insensitive.

| Term | `docs/` | `apps/unfold/docs` | `apps/ploeg/docs` | `apps/ploeg/pkg` | `apps/unfold/src` |
|---|---|---|---|---|---|
| hermes | 0 | 0 | **6 / 2 files** | 0 | 0 |
| nous (substring) | 11 / 9 | 8 / 6 | 13 / 9 | 2 / 2 | 1 / 1 |
| nous (whole word) | 0 | 0 | 0 | 0 | 0 |
| openclaw | 0 | 0 | 15 / 3 | 0 | 0 |
| kanban | 0 | 22 / 7 | 14 / 7 | 0 | 0 |
| ralph | 0 | 0 | 2 / 1 | 0 | 0 |
| goal loop | 0 | 0 | 0 | 0 | 0 |
| iteration budget | 0 | 0 | 0 | 0 | 0 |
| self-improv | 5 / 4 | 30 / 13 | 0 | 0 | 0 |

- **"nous" substring hits** are all false positives: asynchronous, synchronous, poisonous, ruinous. "Nous Research" has 0 hits repo-wide.
- **hermes**
  - `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/research/2026-09-26-agent-orchestration-landscape.md` (5 hits):
    - §1 and the §2 layer-map row "North-facing client API": "OpenClaw, Hermes, ZeroClaw speak A2A 1.0 both ways";
    - §8 "Hermes Kanban" among the single-host competing local dispatchers;
    - §8 "Hermes Agent … ship A2A 1.0";
    - §10 item 7 "Hermes … now ready clients" for the ADR-0007 facade.
  - `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/research/2026-07-28-paperclip-fit.md` (1 hit): Paperclip's Hermes adapter test fixture.
  - The repo-wide sweep finds only these 2 files.
- **openclaw**: the landscape, the paperclip fit, and `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/adrs/0009-paperclip-mine-for-design-never-integrate.md`.
- **ralph**: the landscape §8 ("Ralph's `prd.json`", "`ralph.sh`").
- **kanban in Ploeg docs**:
  - `adrs/0005-…` and `backlog.md` mention vibe-kanban as a considered option; `backlog.md` also says "not on this list: any kanban/board UI";
  - `adrs/0051-…` and `how-to/map-tracker-statuses-to-gates.md` mean Vikunja kanban buckets;
  - research: `2026-08-28-onboarding-friction.md`, `2026-07-28-paperclip-fit.md`, the landscape.
- **kanban in Unfold docs**: research (market-landscape §4.8 Vibe Kanban, conventions-and-alternatives, ploeg-and-unfold-split, band-and-the-interaction-layer, two JSON audits) and `adrs/0001-the-human-workbench-beside-ploeg.md`.
- **self-improv** is about dogfooding the product, not agents learning.
  - Main source: `/home/ryan/projects/webgrip/glide/apps/unfold/docs/design/self-improvement.md`. "The current trusted release helps propose the next"; an agent must not approve its own patch, widen its tools, refill its budget or deploy itself.
  - `/home/ryan/projects/webgrip/glide/apps/unfold/docs/design/gap-register.md` GAP-04 (P0): "Self-improvement has no protected release lane".

## 9. Roadmap, backlog and watchlist items

**Harness swaps and benches**
- `/home/ryan/projects/webgrip/glide/docs/research/2026-10-11-agentic-models-and-topology.md` (record only; "nothing … decided or built"):
  - VIK-1617 (cost and merge rate; evidence in `/home/ryan/projects/webgrip/glide/docs/research/2026-10-11-cost-per-merged-work-item.md`);
  - VIK-1621 (builder bench, open-weight versus frontier, US$40 cap);
  - VIK-1651 (EU route for client code);
  - VIK-1686, VIK-1687, VIK-1678.
  - Its benches vary models, not harnesses. It notes that "the harness moves scores by up to tens of points" and that trialling a model means cloning a Team.
  - The same tickets, with dependencies, are in `/home/ryan/projects/webgrip/glide/docs/research/2026-10-01-economics-drill-down.md`.
- `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/research/2026-08-08-benchmarking-the-loop.md` §3.8 makes "Harness adapter" the headline axis (`openhands` vs `claude-code` vs `acp`/opencode vs `exec`).
- Backlog (`/home/ryan/projects/webgrip/glide/apps/ploeg/docs/backlog.md`):
  - #64 ACP adapter (open: verify the opencode provider keys);
  - #69 out-of-process adapter SDK (open);
  - #70 resume mechanics per harness;
  - #62 claude-code (`--json-schema`, `--max-turns`/`--max-budget-usd` open).
- Profiles: qwen-code and goose are unqualified; Codex is a planned profile (`/home/ryan/projects/webgrip/glide/apps/ploeg/docs/contracts/acp-profiles.md`). The landscape's §10 item 2 and §11 propose these profiles.
- Per-session harness choice: Unfold ADR-0044 (proposed) and `/home/ryan/projects/webgrip/glide/openspec/changes/sessions-run-in-ploeg/` (1 of 39 tasks done).
  - Its harness-selection spec offers only the per-Team allowlist, with qualification shown.
  - It needs Ploeg changes `record-harness-per-run`, `submit-work-items`, `select-harness-per-run` and `interactive-runs`, and Ploeg ADR-0103. None of these exist at this pin.

**Skills catalogue:** ADR-0092 (proposed), ADR-0083 (accepted, not built), `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/research/2026-10-13-sharing-agent-skills.md`.

**Learning review queue:**
- ADR-0066 (proposed; "an ignored review queue means no learning");
- ADR-0088 (proposed; "Promotions add a review queue");
- `/home/ryan/projects/webgrip/glide/docs/research/2026-10-04-rfc-agent-knowledge.md`;
- spike VIK-1859.

**Delivery facts from checks:**
- ADR-0070 (accepted). Its triggers include "the forge's own check status becomes available to Ploeg for every supported forge".
- ADR-0058 (run-card CI figures read from the forge).
- ADR-0059 (proposed).
- `/home/ryan/projects/webgrip/glide/docs/concepts/architecture.md` risk row: failed checks act only with `forgeFollowUps`.
- Backlog #10 and #110.

**Checkpoint and budget warnings:**
- ADR-0075 (proposed, not built).
- Backlog #16, #44 (open: map the authorized figure to native levers), #61, #67, #68, #70, #110.
- People-facing budget alerts at 50, 75, 90 and 100% with a pause at the cap: "Decided", in `/home/ryan/projects/webgrip/glide/docs/concepts/users-and-journeys.md` journey 7. Its portal is not built (VIK-1500).

**Multi-tenant isolation:**
- Root ADR-0009 (accepted; "Not implemented yet") and root ADR-0017 (accepted; enforcement "Not implemented yet" in both Ploeg and Unfold; VIK-1740), in `/home/ryan/projects/webgrip/glide/docs/adr/`.
- `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/research/2026-09-28-credential-isolation-cluster-plan.md`.

**Agency offering phases:**
- Root ADR-0005: the self-hosted phase comes first (the owner, and the owner's employer as an agency on ClickUp). The hosted agency business is phase two, with a pilot of 4 to 6 weeks.
- `/home/ryan/projects/webgrip/glide/docs/research/2026-09-28-agency-offering-proposal.md`, "Order" steps 1 to 7, with tenancy first.
- Root ADR-0009: the hosted phase runs on a rented EU cluster.

**Ledger status columns:**
- **`/home/ryan/projects/webgrip/glide/apps/ploeg/docs/adrs/README.md`** (records 0001 to 0096; review calendar in the same file):
  - accepted: 0005, 0006, 0007, 0008, 0009, 0012, 0034, 0067, 0068, 0070, 0081, 0082, 0083, 0084, 0093;
  - proposed: 0017, 0018, 0032, 0033, 0035, 0041, 0059, 0065, 0066, 0075, 0077, 0078, 0085, 0086, 0087, 0088, 0090, 0091, 0092, 0095, 0096;
  - superseded: 0074, by 0079;
  - due 2026-10-31: 0006, 0007, 0008, 0009.
- **`/home/ryan/projects/webgrip/glide/docs/adr/index.md`** (records 0001 to 0036):
  - accepted: 0005, 0006, 0007, 0009, 0011, 0017, 0031, 0032;
  - proposed: 0021, 0034, 0035.

## 10. Prior fit surveys (structure precedent)

The Ploeg ones are in `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/research/`.

- **`2026-07-28-a2a-fit.md`**
  - Verdict: "adopt nothing now"; the only fit is a north-facing facade (ADR-0007).
  - Tables: a layer map (§3), a state-machine mapping (§4), triggers (§8).
  - A Hermes row belongs to its client-adoption argument (§2) and to the ADR-0007 trigger list.
- **`2026-07-28-omniroute-fit.md`**
  - Verdict: "adopt nothing"; it lacks per-key budget, TTL and alias minting, and its trust posture is poor (ADR-0008).
  - Tables: a layer map and a component table.
  - Gateway-only, so there is no natural Hermes row.
- **`2026-07-28-paperclip-fit.md`**
  - Verdict: "do not integrate, do not depend — mine it for design" (ADR-0009, refined by ADR-0033).
  - Contents: an absence-check table, a layer map, tiers of semantics worth mining, and a scorecard.
  - It is the best template for judging Hermes Kanban as a board control plane, and Hermes would be a third entry in ADR-0033's scope after Paperclip and Multica.
- **`2026-09-30-openai-agents-api-fit.md`**
  - Verdict: "a hosted agent loop, one layer below Ploeg"; it stays outside the Run until it accepts an authorized budget; meet it over MCP and run Codex through ACP instead (ADR-0041).
  - Structure: a layer map; "does that we don't", "we do that it doesn't", "can we use it", "design worth mining"; two verdict axes.
  - It is the closest template for an external agent product.
- **`2026-09-26-agent-orchestration-landscape.md`**
  - Verdict: nothing removes Ploeg's reason to exist; the niche is the combination of its four properties plus the authorize-then-settle spend model.
  - Tables a Hermes row fits:
    - §2 layer map (already names Hermes);
    - §3 direct-rivals table (Project, Stars, Trigger, Trackers/forges, Claim, Isolation, Spend, Undercuts?);
    - §7 harness table (Harness, ACP, "Base URL covers every model call", Notes), if Hermes runs as a harness;
    - §8 prose (already names Hermes Kanban and A2A).
- **Unfold side**, in `/home/ryan/projects/webgrip/glide/apps/unfold/docs/research/`:
  - `2026-10-01-vscode-1-140-fit.md` and `2026-10-08-vscode-1-141-fit.md` (verdict sections plus trigger tables);
  - `2026-10-13-protocol-integration-gaps.md` (verdict: "adopt more MCP … stage an ACP agent"; it has a capability matrix);
  - root `/home/ryan/projects/webgrip/glide/docs/research/2026-10-01-vscode-surface-and-agency-fit.md` (verdict: "VS Code as the developer's cockpit, not as an engine").
- **`/home/ryan/projects/webgrip/glide/apps/unfold/docs/landscape/*.md`** are 3-line "Documentation moved" stubs. The real files are `/home/ryan/projects/webgrip/glide/docs/landscape/{index,components,c4,bottlenecks,questions}.md`. They explain the product; they are not competitor ledgers, though `index.md` links `/home/ryan/projects/webgrip/glide/apps/unfold/docs/research/2026-09-11-ecosystem-alternatives.md`.
- **`/home/ryan/projects/webgrip/glide/docs/research/evidence/2026-09-29-agency-pricing/competitors-and-white-label.md`**
  - It has no table. It is organised as Q1 to Q5, with bold per-competitor entries: Devin, Factory, Copilot, Cursor, Codex, Jules, Kiro, Replit, Lovable/Bolt/v0, OpenHands Cloud, Warp Oz, Symphony, Multica, and "Other".
  - A Hermes entry would fit Q1 (pricing unit) and Q4 (agencies), as an open-source personal agent rather than a ticket-to-PR SaaS.

## 11. Drift and gaps found while mapping

1. **Learnings channel looks broken (static, high confidence, not executed).**
   - `MergeDropBox` in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/harness/dropbox.go` copies findings, verdict, problem, solution, createdWorkItems, and usage, plus outcome, summary and stuckReason when the adapter set none. It never copies `Learnings`.
   - All five adapters return through it: `acp.go`, `openhands.go`, `claudecode.go`, `claudeenv.go`, `execbin.go`.
   - `resolveOutcome` takes learnings only from the adapter's report (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/worker.go`).
   - The tests in `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/knowledge_test.go` and `leakwatch_test.go` build reports that already contain learnings, so none covers the drop-box path.
2. **ADR-0059 and the code disagree on the failure reason.** The ADR specifies `infra_forge` for a failed pre-run forge read. The code uses `infra_node` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/delivery.go`), and `infra_forge` has 0 code hits.
3. **`/home/ryan/projects/webgrip/glide/docs/concepts/inside-a-run.md` is stale in two places** (last verified 2026-09-29).
   - It says `adapters.go` "builds one of four" adapters; there are five, since `claude-environment` was added.
   - It says ploegd "does not yet check or store `delivery`"; migration `0039_run_delivery.sql` and `/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/store/delivery.go` now do.
4. **Stale scratch-directory claim.** The comment in `profiles.go` says "ScratchDir is os.TempDir() and shared per process", and `acp-profiles.md` repeats it. The worker now creates a per-Run scratch directory with `os.MkdirTemp` (`/home/ryan/projects/webgrip/glide/apps/ploeg/pkg/worker/worker.go`).
5. **Two docs still describe ploeg-mcp as stdio only.**
   - `/home/ryan/projects/webgrip/glide/apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md` says ploeg-mcp is stdio-only with no OAuth.
   - `/home/ryan/projects/webgrip/glide/docs/how-to/ask-from-an-ai-client.md` says "for now a port-forward".
   - The pin has Streamable HTTP with OAuth (`/home/ryan/projects/webgrip/glide/apps/ploeg/cmd/ploeg-mcp/http.go`, Ploeg commit `f5cedbb`).
6. **ADR-0070 trigger may be met.** Its trigger "the forge's own check status becomes available … for every supported forge" may already be true in code (`CommitStatus` on Forgejo, GitLab and GitHub). That reading is used only for facts today, not for the gate.
7. **The planned per-session harness picker references Ploeg work that does not exist yet.** Unfold ADR-0044 and the `sessions-run-in-ploeg` change reference Ploeg ADR-0103 and four ploeg-hq changes that are absent at the pin. Ploeg's ADRs end at 0096, and `/home/ryan/projects/webgrip/glide/apps/ploeg/openspec/changes/` contains none of those changes.
8. **Paths in the brief that do not exist:**
   - `docs/reference/configuration.md` is actually `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/reference/configuration.md`.
   - `docs/contracts/worker-control.md` is actually `/home/ryan/projects/webgrip/glide/apps/ploeg/docs/contracts/worker-control.md`.
   - `apps/unfold/docs/landscape/*` are stubs (see §10).