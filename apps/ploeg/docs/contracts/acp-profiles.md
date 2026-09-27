# ACP profiles

The `acp` harness runs any agent that speaks the Agent Client Protocol (wire version 1) over stdio. A profile tells it three things: how to start the agent, how to point it at the Run's model gateway, and which config file (if any) to write. Profiles live in [profiles.go](../../pkg/harness/adapters/acp/profiles.go). A team selects one with `executor.harness.acp.profile` (`PLOEG_ACP_PROFILE`). An unknown name, or a config document that a profile cannot read, stops the worker at startup, before it claims anything.

Every profile gets the same inputs from the worker:

- The model gateway's base URL and a model key. With `PLOEG_LLM_KEY_ISOLATION=proxy` these are a loopback URL and a placeholder, and the worker adds the real key on the way out ([ADR-0034](../adrs/0034-the-harness-gets-placeholders-the-worker-keeps-credentials.md)). Profiles pass the key only through environment variables and never write it into a config file.
- `PLOEG_OUTCOME_FILE`, the outcome drop box ([ADR-0018](../adrs/0018-the-outcome-drop-box-is-every-harnesss-return-path.md)). ACP returns a stop reason, not a review, so a reading Run's findings and verdict still come back through this file.
- The Run's permission mode (`allow_always`, `allow_read_only` or `deny_all`). A profile sets the agent's own approval setting to match it. Under `allow_always` the agent runs without asking. Under the other two modes the agent asks for every tool call, and the adapter answers from the mode.

Config files and agent home directories are written to the scratch directory with the trace id in their names, because concurrent Runs share that directory.

## Profiles

The upstream facts below come from reading each project's source at the named tag on 27 September 2026. No live Run has measured them yet. `mise run harness-conformance` does that for the versions an image ships ([live_test.go](../../pkg/harness/harnesstest/live_test.go), harness names `acp`, `acp-qwen-code` and `acp-goose`).

| | `opencode` (default) | `qwen-code` | `goose` |
| --- | --- | --- | --- |
| Upstream checked | `opencode-ai` 1.18.30, as pinned in [the Vloer agent image](../../../vloer/ops/agent/Dockerfile) | [QwenLM/qwen-code](https://github.com/QwenLM/qwen-code) v0.24.6 (2026-09-26), npm `@qwen-code/qwen-code`, Apache-2.0 | [aaif-goose/goose](https://github.com/aaif-goose/goose) (formerly `block/goose`) v1.52.0 (2026-09-23), Apache-2.0 |
| Command | `opencode acp` | `qwen --acp --auth-type=openai` (`--acp` exists since v0.6.1; the older `--experimental-acp` is deprecated) | `goose acp` |
| Gateway wiring | Generated `OPENCODE_CONFIG` file with an `@ai-sdk/openai-compatible` provider; the key is the reference `{env:LLM_API_KEY}` | `OPENAI_API_KEY`, `OPENAI_BASE_URL` and `OPENAI_MODEL` | `GOOSE_PROVIDER=litellm`, `GOOSE_MODEL`, and `LITELLM_HOST`/`LITELLM_BASE_PATH`/`LITELLM_API_KEY`, with the base URL split into host and `<path>/chat/completions` |
| Config file | `opencode-<trace>.json`; `configJson` replaces it | `qwen-code-<trace>.json`, passed as `QWEN_CODE_SYSTEM_SETTINGS_PATH` (the settings scope that ranks above the repository's `.qwen/settings.json`); `configJson` replaces it. `QWEN_HOME` is a per-Run directory | None. Configured by environment only, and `configJson` is refused. `GOOSE_PATH_ROOT` is a per-Run directory, and `GOOSE_DISABLE_KEYRING=1` keeps it off the system keyring |
| Instructions | `AGENTS.md`, walking up from the working directory | `context.fileName: ["AGENTS.md"]` (upstream default is `QWEN.md` then `AGENTS.md`) | `CONTEXT_FILE_NAMES=["AGENTS.md"]` (upstream default is `.goosehints` and `AGENTS.md`), from the git root down to the working directory |
| Approval under `allow_always` / otherwise | Not set by the profile | `tools.approvalMode` `yolo` / `default` | `GOOSE_MODE` `auto` / `approve` |
| Calls outside the gateway, switched off | — | Usage statistics to Alibaba RUM (`QWEN_USAGE_STATISTICS_ENABLED=false`, `privacy.usageStatisticsEnabled: false`); auto-update (`general.enableAutoUpdate: false`); web search (`tools.webSearch.enabled: false`). `QWEN_CODE_NO_RELAUNCH=true` keeps the signalled process the agent itself | Telemetry (`GOOSE_TELEMETRY_OFF=1`); the extra session-naming call (`GOOSE_DISABLE_SESSION_NAMING=true`; `1` does not work in v1.52.0 because goose parses it as a number). Goose also calls `GET /model/info` on the gateway |
| Stop reasons | — | `end_turn`, `cancelled`, `max_tokens`; gateway errors arrive as JSON-RPC errors | `end_turn`, `cancelled`, `max_tokens`; a gateway authentication failure is a JSON-RPC `auth_required` error |
| ACP `authenticate` | Not needed | Not needed once the auth type resolves from the flag. Calling it would write to the user settings file | Not needed (the handler accepts and does nothing) |
| Shutdown | — | Exits 0 on stdin EOF and handles SIGTERM | Exits when stdin closes; has no SIGTERM handler, so SIGTERM kills it at once |

The adapter never calls `authenticate`, and neither new profile needs it.

## Before a team uses `qwen-code` or `goose`

Neither profile is qualified yet. Before a team switches, run the live conformance suite in the team's agent image and check these points:

- **Repository-supplied configuration.** Goose v1.52.0 enables MCP servers from `<working directory>/.agents/plugins/` the first time it sees them. `GOOSE_PATH_ROOT` does not cover that path. That means a target repository can start processes inside the Run. Qwen Code loads the first `.env` it finds walking up from the working directory, for variables the environment does not already set, and it merges the repository's `.qwen/settings.json` below Ploeg's system settings.
- **Permission storms.** Under `allow_read_only` and `deny_all`, both agents ask once per tool call. The adapter stops a Run after 200 requests, or after 60 in one minute ([permission.go](../../pkg/harness/adapters/acp/permission.go)).
- **The loopback proxy.** Both agents make their model calls from inside the worker container, so `PLOEG_LLM_KEY_ISOLATION=proxy` should hold. That is not yet measured.

## What an image needs

Ploeg does not install agents. Every profile's binary must be on `PATH` in the image that the team's `executor.harness.image` names (by default `executor.runnerImage`, `agent-runner`, which is built outside this repository). The worker checks this before it claims ([adapters.go](../../pkg/worker/adapters.go)). `executor.harness.entrypoint` replaces the binary path and keeps the profile's arguments.

- `qwen-code`: Node.js 22 or later and `npm install -g @qwen-code/qwen-code@0.24.6`, which provides `qwen`. Upstream releases every few days, so pin the version.
- `goose`: the `goose-x86_64-unknown-linux-musl` (or `aarch64`) release archive for v1.52.0, which is a static `goose` binary.

## Codex is not a profile yet

Codex reaches ACP through an adapter process. The Zed repository `zed-industries/codex-acp` was archived at v0.16.0. Its successor is [agentclientprotocol/codex-acp](https://github.com/agentclientprotocol/codex-acp) v1.13.1 (2026-09-23): TypeScript, npm only, Apache-2.0. It drives `codex app-server` from the npm dependency `@openai/codex` (^0.157.0) and takes its configuration from `CODEX_HOME` and a `CODEX_CONFIG` JSON variable, not from command-line flags.

Codex speaks only the Responses API. Its `wire_api = "chat"` option was removed in rust-v0.95.0 (2026-02-04). LiteLLM v1.102.1, the gateway version in production, serves `POST /v1/responses` and, according to its source, bridges it to chat completions for Anthropic and DeepSeek. What has not been shown is that the bridge carries Codex's own item types end to end: the freeform `apply_patch` tool, reasoning items, and compaction. Upstream issue [openai/codex#45393](https://github.com/openai/codex/issues/45393) reports that compaction fails against third-party Responses providers. codex-acp also has no mode that combines "never ask" with a workspace-write sandbox, so its permission mapping needs its own design. Adding the profile is tracked on the Ploeg board; it starts with a live probe of the gateway.
