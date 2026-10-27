# 4 — Seam map: Unfold (glide) × Ploeg, for a Hive fit judgement

## Method

- **Repository:** branch `development` at `d1d355da` (2026-10-27). Paths are relative to the repository root.
- **Ploeg:** `apps/ploeg` is a git-ignored, unpacked contract bundle (`.gitignore:9`, `mise.toml:53`). The bundle on disk was `0.2.0-rc.64` (`2fc4ddc`, unpacked 2026-10-24) while Unfold's committed pin is `0.2.0-rc.50` (`apps/unfold/ploeg-release.json`). Every Ploeg claim below describes rc.64 as it sat on disk. The bundle holds 655 of the 1,539 files in `apps/ploeg/files.txt`: no `_test.go` files, no migrations, no Helm chart, no `openspec/`, so chart defaults could not be checked.
- **Scope:** static reads only. Nothing was run. The 2026-10-14 map ([Hermes evidence](../2026-10-14-hermes-agent/4-seam-map.md)) was the starting point; each claim was re-checked.

## Changed since 2026-10-14

- `harness.MergeDropBox` now copies `Learnings` (`apps/ploeg/pkg/harness/dropbox.go:97-98`).
- Runs are told their budget and limits (ADR-0133): `apps/ploeg/pkg/taskprompt/limits.go` writes a "## Your Run" prompt section with the model budget in US$, time limits and the round count; data from `runLimits` in `apps/ploeg/pkg/worker/prompt.go:33`.
- Ploeg ADRs run to 0152, Unfold ADRs to 0054, root ADRs to 0043.
- New Ploeg seams in code: Operator work admission, questions and answers, take-over, the knowledge-note review queue, chats, connections, the forge-CI ready gate, the premise check, the blackboard, Claude Code plugins, a separate harness container, OTel export.

## 1. Work sources and forges

- **Trackers** (`apps/ploeg/pkg/provider/`): `vikunja/`, `clickup/`, `githubissues/` (dispatch by a `ploeg:<team>` label or a mapped assignee; ADR-0085 proposed, ADR-0095 accepted). Dispatch waits for tracker dependencies (ADR-0123; `apps/ploeg/pkg/shiftengine/dispatch_gate.go`).
- **Forges:** `forgejo/`, `gitlab/`, `github/` (GitHub ADR-0086 proposed; App tokens in `apps/ploeg/pkg/githubapp`). Interfaces `TrackerProvider` and `ForgeProvider` in `apps/ploeg/pkg/provider/provider.go`; webhooks `POST /webhooks/{tracker,forge}/{provider}`.
- **Direct admission:** `POST /api/v1/operator/work-items` with `budgetUsd` ≤ the consumer's `maxBudgetUsd` (`apps/ploeg/pkg/httpapi/operator_work_admission.go`; ADR-0102); MCP tool `ploeg_submit_work`.
- **Pull requests others open** (ADR-0109 proposed; `apps/ploeg/pkg/store/pull_request_readings.go`).
- **Absent:** Linear (0 code hits), Jira (one comment, `provider.go:37`), GitHub Projects (0). ADR-0077 out-of-process adapters not built.
- **Unfold:** `TaskProvider = 'forgejo'|'github'|'gitlab'|'clickup'|'vikunja'|'demo'` (`apps/unfold/src/tasks.ts:5`); only Vikunja tasks hand off to Ploeg from the workbench (`tasks.ts:131`).

## 2. Harness adapters

- `harness.Adapter` (`apps/ploeg/pkg/harness/adapter.go`), registry `NewAdapter` in `apps/ploeg/pkg/worker/adapters.go`: openhands (default), exec, claude-code, acp, claude-environment.
- ACP profiles (`apps/ploeg/pkg/harness/adapters/acp/profiles.go:69`): opencode (default), qwen-code, goose, openhands, custom. Permission modes `allow_always`, `allow_read_only`, `deny_all`.
- Codex is not a profile (`apps/ploeg/docs/contracts/acp-profiles.md:72-76`). Copilot CLI, Aider: 0 hits. Gemini: one comment.
- Qualified harnesses: `openhands`, `acp/openhands`, `exec` (`acp-profiles.md:45`); unqualified ones need `allowUnqualifiedHarnesses` (ADR-0098). ADR-0118 (proposed) retires the OpenHands CLI.
- Bake-off on several configurations with a shadow judge (ADR-0135): 0 code hits.
- Unfold still has its own runtimes (`apps/unfold/src/runtime/`); linked-session reporters for Claude Code, Codex, OpenCode, ACP and VS Code in `apps/unfold/extensions/`.

## 3. Admission, budget and spend

- Authorize, then settle (ADR-0012): at claim, ploegd authorizes `min(roleCap, pool − spent − reserved)` (`apps/ploeg/pkg/plan/plan.go`).
- Per-Run LiteLLM key with `max_budget` and a TTL (`apps/ploeg/pkg/litellm/`, `apps/ploeg/pkg/llmbroker/`; ADR-0008). Cost status observed / provisional / settled / unknown (`apps/ploeg/pkg/work/types.go:53-72`).
- A spent shared budget parks the Work Item (ADR-0111; `apps/ploeg/pkg/worker/budgetspent.go`).
- Monthly inference allowances (`apps/ploeg/pkg/store/allowance.go`). Created-work limits per Team (`apps/ploeg/pkg/config/config.go:167-180`).
- Usage: `agent_runs.usage` (`apps/ploeg/pkg/store/usage.go`), a usage report on each PR, `unfold_spend`, `#insights`.

## 4. Credentials

- The harness holds placeholders; the worker keeps the real model key and forge token (ADR-0034; `apps/ploeg/pkg/worker/llmproxy.go`, `forgeproxy.go`, `pushfence.go`, `leakwatch.go`).
- The harness runs in its own container with no credential in it (ADR-0138; `apps/ploeg/pkg/harness/launch/`).
- A credential leak parks the Work Item and closes its PR (ADR-0105; `apps/ploeg/pkg/shiftengine/credentialleak.go`).
- Exception: the claude-environment runner gets a forge credential via `POST /api/v1/claude-sessions/forge-credential`.

## 5. Sandbox

- One pod per Run: a KEDA ScaledJob per Team and Role, or an agent-sandbox `SandboxClaim` (`apps/ploeg/pkg/sandboxlaunch/launcher.go:25-26,147`).
- Kata and gVisor appear in docs only (ADR-0136 strict isolation profile as chart default, ADR-0138, ADR-0143). Default-deny NetworkPolicy per pod (ADR-0137), restricted Pod Security Standard (ADR-0120).
- Unfold's own sandbox runtime defaults `runtimeClassName` to `kata` (`apps/unfold/src/runtime/sandbox.ts:20,148`).

## 6. Review and merge

- Roles `plan.Role{Name, Writes, Cap, Planner, Shadow}`; a Round is a fan-out of readers or a single writer; verdict-driven fix loop capped by `MaxFixRounds` (ADR-0017; `apps/ploeg/pkg/shiftengine/reviewloop.go`).
- Ready only when the forge's CI passed on the head (ADR-0119; `apps/ploeg/pkg/shiftengine/forge_ci_gate.go`).
- Review walkthrough: Ploeg ADR-0125 and Unfold ADR-0054 proposed, no UI.
- **A person always merges.** No merge call exists in `apps/ploeg/pkg/provider`. Sources: `docs/concepts/who-unfold-is-for.md:39`, `docs/concepts/how-work-flows.md:61`.

## 7. Human in the loop

- `needs_human` state (`apps/ploeg/pkg/work/state.go`). Questions (ADR-0121; `apps/ploeg/pkg/shiftengine/questions.go`). Take-over (ADR-0142; `apps/ploeg/pkg/httpapi/take_over.go`). Attended runs: permission relay, pause, steer (ADR-0100/0101/0104).
- Approve, reject, requeue, cancel routes and their `unfold_*` MCP tools. Every operator action names its person and channel (ADR-0108); signed single-use confirmations (ADR-0152 proposed; `apps/ploeg/cmd/ploeg-mcp/confirm.go`).
- Blackboard (ADR-0124; `apps/ploeg/pkg/harness/blackboard.go`).

## 8. Dashboard surfaces

- Routes `#now`, `#work`, `#proposed`, `#tasks`, `#runs`, `#activity`, `#insights`, `#status`, `#sessions`, cards (`apps/unfold/docs/browser-ui.md`); `connections`, `labs`, `linked-sessions`, `report` views are missing from that table.
- Run cards (`apps/unfold/src/cards/`) correspond to Hive's evidence cards. Fleet view behind `now.fleet`, off. Run-health judge advises only (`apps/unfold/src/run-health/`).

## 9. Learnings, skills, knowledge

- Learnings are proposals a person reviews (ADR-0066); review queue `GET /operator/knowledge/reviews` (`apps/ploeg/pkg/httpapi/operator_knowledge.go`). No Unfold consumer of the queue (0 hits).
- Omnigraph in `apps/ploeg/pkg/omnigraph`; 0 hits in Unfold `src`.
- Three embedded skills (`apps/ploeg/pkg/harness/skills/skills.go:22-24`); per-Work-Item selection (ADR-0083) and the catalogue (ADR-0092) not built.

## 10. Autonomy

- **No autonomy-level setting exists.** Autonomy is the sum of `Role.Writes`, `Planner`, `Shadow`, `MaxFixRounds`, `CreatedWork.AutoDispatch`, `forgeFollowUps`, `premiseCheck`, `maxRunning` (`apps/ploeg/pkg/config/config.go:137-165`), plus ACP `permissionMode`, harness and model allowlists, egress and MCP access groups.
- ADR-0110 (proposed, not built) proposes a Team manifest with `may: [{action, resource, effect: allow|ask|deny}]`.

## 11. Protocols

- `unfold-mcp` (`apps/unfold/src/mcp.ts`, HTTP transport in `mcp-http.ts`) and `ploeg-mcp` (`apps/ploeg/cmd/ploeg-mcp/`), stdio and Streamable HTTP with OAuth.
- ACP harness adapter and `unfold-acp` proxy; AHP host (`apps/unfold/src/ahp/`); OTLP export (ADR-0113; `apps/ploeg/pkg/worker/telemetry.go`); A2A adopt-nothing (ADR-0007).
- Discord and Slack: 0 code hits.

## 12. Tenancy and hosted plans

- `docs/concepts/who-unfold-is-for.md`: "None of the agency offering is implemented yet." Phase 1 self-hosted; phase 2 hosted on a rented EU cluster, one Tenant per Agency. Pricing copy "Planned · not on sale yet" (`apps/site/src/i18n/en.ts:257-284`).

## 13. Hive in this repository

- `hivecommons`, `spektacular`, whole-word `hive`: **0 hits** (excluding node_modules, .git, .build, worktrees, dist).
- "co-maintainer": 0 files. Fullsend: not checked by this map.
- Competitor docs: `apps/unfold/docs/research/market-landscape.md`, `conventions-and-alternatives.md`, `2026-09-11-ecosystem-alternatives.md`, `apps/ploeg/docs/research/2026-09-26-agent-orchestration-landscape.md`, fit records for Paperclip, the OpenAI Agents API and Hermes Agent.

## 14. Dogfooding

- `apps/unfold/docs/design/self-improvement.md` (proposed): an agent must not approve its own patch, widen its tools, refill its budget or deploy itself. GAP-04 (P0) in `apps/unfold/docs/design/gap-register.md`: no protected release lane for self-improvement.
- Since 2026-09-01: 22 commits by the Ploeg worker identity `agent-builder`, 57 by Renovate, 11 by `ploeg-release`.

## 15. Drift found

1. Bundle on disk (rc.64) ≠ pinned Ploeg (rc.50); chart defaults unverifiable.
2. `docs/concepts/inside-a-run.md:125` says adapters.go "builds one of four"; there are five.
3. `apps/ploeg/docs/reference/configuration.md:108` lists `PLOEG_HARNESS` values without `claude-environment`.
4. `apps/unfold/docs/browser-ui.md` route table omits four views.
5. `.agents/skills/explain-a-dependency-update/SKILL.md` cites Ploeg ADR-0106; the matching ADR is 0109.
