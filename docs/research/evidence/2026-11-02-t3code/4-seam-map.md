# 4. Unfold seam map for the T3 Code comparison

> **Stale.** Researched against a local `development` at `21a939d5`, which was 661 commits behind `origin/development` on 2 November 2026. Linked Sessions, publishers and notifications changed since; [the fit record](../../2026-11-02-t3code-fit.md) carries the corrected statements.
>
> Date: 2 November 2026, against `development` at `21a939d5`. Method: one read-only agent over this repository; every claim names its path. Paths are relative to the repository root. The synthesis is in [the fit record](../../2026-11-02-t3code-fit.md).


## 1. Components, tech stack, and how Unfold talks to Ploeg

**Stack**
- Package: `@webgrip/unfold` 0.4.0-rc.109, Node 24, native TypeScript run directly with `node src/main.ts`.
- The only runtime dependency is `ws` 8.22.0. Dev dependencies include `@microsoft/agent-host-protocol` 1.0.0, `@modelcontextprotocol/client`, playwright, three and typescript 7. Source: apps/unfold/package.json.
- ADRs: 0002 (native Node and single-writer SQLite storage) and 0036 (`ws` for WebSocket), under apps/unfold/docs/adrs/.

**Server** (apps/unfold/src/)
- `main.ts`: startup.
- `http.ts`: the single router for REST, SSE (`text/event-stream` at around line 937) and static files.
- `store.ts`: SQLite.
- `engine.ts`: session lifecycle (start, pause, resume, cancel, retry, respond, addBudget, requestChanges, deliver).
- `auth.ts` and `oidc.ts`: sign-in.
- `runtime/`: harness and workspace seam, covered in section 2.
- `ahp/`: Agent Host Protocol host that serves VS Code's Agents window over WebSocket. Files include `host.ts`, `websocket.ts`, `work-items.ts`, `runs.ts`, `run-live.ts`, `terminals.ts`, `review.ts`, `questions.ts` and `asks.ts`.
- `chat/`: the Unfold chat (ADR 0049).
- `ask/`: metered read-only Ask.
- `cards/`: Run cards.
- `linked-sessions.ts`, `agent-trace.ts`, `linked-telemetry.ts`: Linked Sessions.
- Module map: apps/unfold/docs/architecture.md.

**Web UI**
- apps/unfold/public/ is plain ES modules with no build step and a hash router.
- Contract doc: apps/unfold/docs/browser-ui.md.
- Views are in `public/views/*.js`, shared modules in `public/core/*.js`, and component stories with a workbench in `public/live/` (ADR 0048).

**VS Code extension**
- apps/unfold/extensions/vscode/: README, `package.json` and `src/` (`extension.ts`, `agent-host.ts`, `checkout.ts`, `lm-tools.ts`, `mcp-servers.ts`, `notifications.ts`, `wizard.ts`, `panel.ts`, `now-tree.ts`, and others).
- Commands include connect, start, pause, resume, cancel, retry, review, sendInstruction, attachSelection, attachFile, addBudget, setApproval, acceptAndOpenPullRequest, checkoutBranch, openInAgentsWindow and startInAgentsWindow.
- Ships through Open VSX first (ADR 0021). It is a thin client (ADR 0007).

**Claude Code plugin**
- apps/unfold/extensions/claude-code/: `plugin.json`, `hooks/hooks.json`, `scripts/unfold-hook.mjs`, `agent-trace.mjs`, `mentions.mjs`, and the skill `skills/link-work-item`.

**MCP server `unfold-mcp`**
- apps/unfold/src/mcp.ts, with a stdio entry at apps/unfold/scripts/mcp.ts (`npm run mcp`, `unfold-mcp [login]`).
- Streamable HTTP variant: apps/unfold/src/mcp-http.ts and `mcp-auth.ts`.
- Protocol versions: 2025-03-26, 2025-06-18, 2025-11-25 and the stateless 2026-07-28.
- Tools: `unfold_now`, `unfold_find_work`, `unfold_get_work`, `unfold_sessions`, `unfold_linked_sessions`, `unfold_link_session`, `unfold_spend`, `unfold_digest`, `unfold_ask`, `unfold_hand_off`, `unfold_steer_session`. The last one is message, pause, resume or cancel, with confirmation.

**CLI**
- There is no standalone end-user CLI. Only npm scripts and `unfold-mcp` exist (package.json `scripts`).

**Other app**
- apps/site is the marketing site (root ADR-0012).

**Transport to Ploeg**
- Unfold calls Ploeg's authenticated HTTP JSON operator API under `/api/v1/operator/...` with a bearer token.
- Read client: apps/unfold/src/ploeg.ts.
- Execution client: apps/unfold/src/execution-authority.ts (executions, commands, credential, spend, block, delivery).
- Routes seen in the bundle include work-items (approve, reject, cancel, requeue, claim, context, notes, asks, questions/{id}/answer, facts), runs/{id}/transcript, runs/{id}/briefing, events, summary, teams/{team}/chats, and executions/{execution}/{commands,events,credential,spend,delivery/*}.
- `ploeg-mcp` is a separate MCP server: apps/ploeg/cmd/ploeg-mcp/.

**Contract bundle and pin**
- Bundle identity: apps/ploeg/ploeg-contract.json says ploeg-contract 0.2.0-rc.48 at commit 3a0b18a1.
- Pin: apps/unfold/ploeg-release.json says `ghcr.io/ploeg-hq/ploeg-contract:0.2.0-rc.50@sha256:291bdd…`. The unpacked bundle says rc.48 while the pin says rc.50, so the two disagree.
- Schemas in apps/ploeg/docs/contracts/: `operator-api.v1.schema.json`, `run-api.v1.schema.json`, `taskspec.v1.schema.json`, `outcomereport.v1.schema.json`, `checkpoint.v1.schema.json`, `deploy-api.v1.schema.json`, `tracker-execution.v1.schema.json`, `operator-delivery.schema.json`, plus `acp-profiles.md`, `executor.md`, `worker-control.md`. Bundle format is described in `README.md` there.
- Unfold-side contract docs: apps/unfold/docs/contracts/ploeg-execution.md and `api.md`.
- Related root ADRs: 0027 (check the client against Ploeg's schemas), 0039 (depend on Ploeg through its contract bundle and Go module), 0041, 0043.

## 2. Harness and provider seam

**Unfold side, current code**
- Interface `AgentRuntime` in apps/unfold/src/types.ts: `prepare`, `execute`, `respond`, `interrupt`, `dispose`, `captureCandidate`, `reattach`, `revokeWorker`.
- `RuntimeKind = 'demo' | 'opencode' | 'command'`.
- Implementations in apps/unfold/src/runtime/:
  - `opencode.ts`: `OpenCodeRuntime` drives OpenCode over its HTTP and event stream (sessions, prompts, permission replies, transcript).
  - `command.ts`: `CommandRuntime`, a JSON-lines subprocess bridge.
  - `demo.ts`: `DemoRuntime`.
- Workspaces in the same folder: `docker.ts`, `kubernetes.ts`, `sandbox.ts`, `relay.ts`, `workspace.ts` (`git clone --depth 100`; these are not worktrees).
- How a runtime registers: one runtime is chosen from `config.runtime.kind`, validated in apps/unfold/src/config.ts around lines 360–366. Unfold has no plugin registry.
- Live mode refuses to start without Ploeg (`requirePloegExecution`, per architecture.md).

**Unfold, proposed**
- ADR 0044 (proposed, not implemented): apps/unfold/docs/adrs/0044-sessions-run-in-ploeg-with-a-harness-chosen-per-session-and-interaction-kept.md.
  - Delete `OpenCodeRuntime`, `CommandRuntime`, the workspace code and the `unfold-agent` image.
  - Sessions run in `ploeg-worker`.
  - The person picks the Harness and model per session from the Team's allowlist.
  - Interaction (permission requests, questions, mid-Run messages, pause and resume) is relayed through ploegd. "Approve tool use automatically" maps to Ploeg's `autoApprove`.
- Plan: openspec/changes/sessions-run-in-ploeg/ (`tasks.md`; every Ploeg prerequisite is unchecked).

**Ploeg side (the real harness seam)**
- Interfaces `harness.Adapter` (`Name`, `Run(ctx, TaskSpec, RunEnv)`, `ExpectsLLM`), `CommandAdapter` (spawn-and-wait), `PromptLimiter` and `RemoteSessionAPI`: apps/ploeg/pkg/harness/adapter.go.
- Registration is an explicit switch, not init-time magic: `NewAdapter` and `HarnessBinary` in apps/ploeg/pkg/worker/adapters.go. The env var is `PLOEG_HARNESS` with values `openhands` (default), `exec`, `claude-code`, `acp`, `claude-environment`. A new harness needs a new case there plus an adapter package.
- Adapters in apps/ploeg/pkg/harness/adapters/:
  - `openhands`.
  - `claudecode`: headless `claude -p` with a JSON result envelope.
  - `claudeenv`: a Team's self-hosted Claude environment (Ploeg ADR-0084).
  - `execbin`.
  - `acp`: Zed's Agent Client Protocol over stdio. Profiles are registered in the `Lookup` switch in `acp/profiles.go`: `opencode` (default), `qwen_code`, `goose`, `openhands`, `custom`. Permission modes `allow_always`, `allow_read_only`, `deny_all`, with storm caps in `acp/permission.go`.
- Profile documentation: apps/ploeg/docs/contracts/acp-profiles.md.
- Conformance suite: apps/ploeg/pkg/harness/harnesstest.
- Qualified harnesses are `openhands`, `acp/openhands` and `exec`. `qwen-code` and `goose` are unqualified.
- Ploeg ADRs on harness choice: 0097, 0098 (accepted, operator chooses the harness from the Team allowlist), 0099 (accepted, one workload per harness), 0103 (accepted, per-Run model), 0100/0101/0104 (proposed: attended relay, pause keeps the pod, message reaches the next prompt turn), 0118 (proposed, retire the OpenHands CLI).

**Codex**
- Codex is not a profile. The section "Codex is not a profile yet" in acp-profiles.md says codex-acp v1.13.1 drives `codex app-server`, and that the Responses-API bridge in LiteLLM is unproven for compaction and `apply_patch`. Adding it is tracked on the Ploeg board.
- `codex-acp` was smoke-tested against `/v1/responses`: docs/research/2026-10-01-vscode-surface-and-agency-fit.md (leverage-map table).
- No code anywhere implements Codex app-server JSON-RPC. It appears only in research evidence:
  - docs/research/evidence/2026-09-29-mcp-access/prior-art.md line 56
  - docs/research/evidence/2026-09-30-mcp-server-patterns/advanced-patterns.md
  - docs/research/evidence/2026-10-14-hermes-agent/1-docs-crawl.md
  - apps/unfold/docs/research/2026-10-01-vscode-1-140-fit.md lines 60 and 92

**Claude Agent SDK**
- Absent from code. It is mentioned only in research:
  - 2026-10-01-vscode-1-140-fit.md line 60 (VS Code imports `@anthropic-ai/claude-agent-sdk`)
  - apps/unfold/docs/research/2026-09-17-agent-host-roadmap.md line 85 (`softov/ahpd` has a Claude Agent SDK backend)
  - apps/unfold/extensions/claude-code/README.md line 21
- Claude Code is reached via the `claude -p` CLI only.

## 3. Feature overlap with "a GUI for coding agents"

**Live transcript / streaming — implemented**
- Session events stream over SSE (`src/http.ts`).
- The AHP host projects turns and tool calls to VS Code (`src/ahp/host.ts`, `run-live.ts`).
- Ploeg Run transcripts are read via `src/run-transcript.ts` and pod logs via `src/run-logs.ts` (Ploeg ADR-0090 is proposed).
- ADR 0053 (proposed, behind the `work.unified` flag) opens Runs in place to their transcript and pod logs.
- ADR 0023 keeps the live view for Ploeg Runs as polling.

**Diff / review view — implemented**
- Session Changes tab with a unified-diff parser and per-file tables: apps/unfold/public/views/session.js lines 23 and 69–379.
- AHP changesets with before/after content and Accept, Request changes or Reject: `src/ahp/host.ts` lines 257–836 and `src/ahp/review.ts`.
- `requestChanges` in `engine.ts`.
- Delivery gate: `public/delivery.js`.
- Accept opens a PR through a trusted publisher (ADR 0040: accepted, not implemented).
- Walkthrough (ADR 0054): proposed.

**Git worktrees — partial**
- Agent work runs in Docker or Kubernetes sandboxes or a local clone, not worktrees (`src/runtime/workspace.ts`; ADRs 0009, 0011, 0013).
- "Check out branch" in the browser opens a `vscode://webgrip.unfold/checkout` link. The extension then adds a git worktree beside the clone: apps/unfold/extensions/vscode/src/checkout.ts lines 52–75, and browser-ui.md under the Work Item page header.

**Checkpoints / revert — absent as a user revert or rewind**
- Ploeg checkpoint records exist: `checkpoint.v1.schema.json` and the Checkpoint entity in apps/ploeg/docs/domain/entities.md.
- Ploeg ADR-0075 (proposed): a stopped writing Run leaves a checkpoint its retry starts from.
- Ploeg ADR-0044 (accepted): an operator restarts from a chosen Round.
- Candidates are captured as a git bundle and patch (`src/candidates.ts`) and signed (ADR 0014).
- No undo or rewind of turns was found.

**Approvals / permission prompts — implemented**
- `PermissionRequest` with kinds permission and question (`src/types.ts`), `engine.respond`, AHP `questions.ts`.
- Session page permission and question card (browser-ui.md, "A session").
- The extension's `setApproval`.
- Auto-approve checkbox in apps/unfold/public/views/dialogs.js line 75.
- Asks are a separate thing (root ADR-0031, `src/ask/`).

**Plan mode — absent**
- Zero hits for plan mode / planMode / plan_mode. Ploeg has `pkg/plan`, but that is run planning, not a UI mode.

**Terminal — read-only projection only**
- `src/ahp/terminals.ts` shows the sandbox's commands as read-only AHP terminals (`readOnlyTerminal`, `noClientShell`).
- No interactive terminal, xterm or pty.

**Model picker — implemented, legacy**
- The "Runtime, model and approval" disclosure in `public/views/dialogs.js` is backed by `/api/models`, plus the Runtime select (OpenCode only).
- The per-Team picker from Ploeg is proposed (ADR 0044, openspec tasks 4.1–4.3).

**Cost / token display — implemented**
- Gateway tab with tokens, latency and cost per request: `public/views/session.js` lines 22 and 342.
- Budget meters, Now "Spend · 24 h", the Runs Spend and Model columns, and Insights (browser-ui.md).
- `costStatus` values: demo, observed, settled, unknown.
- Linked-session cost labelled as an API-price estimate (ADR 0047).

**Notifications — implemented in the browser**
- Desktop notifications, off by default: apps/unfold/public/core/attention.js.
- Favicon dot and title count.
- VS Code notifications in `extensions/vscode/src/notifications.ts`.
- Server push for an installable web app is proposed and not built (root ADR-0026). No service worker or push code was found; `public/site.webmanifest` exists.

**Keyboard shortcuts — implemented**
- apps/unfold/public/core/keys.js: j/k, Enter, o, Esc, n.
- Command palette on `/` and Ctrl/⌘ K (`public/views/palette.js`).
- Shortcuts help dialog.

**Desktop app — absent**
- No Electron or Tauri. Electron appears only in VS Code internals in ADR 0012 line 177, and Tauri only for BAND Jam in apps/unfold/docs/research/2026-09-18-band-and-the-interaction-layer.md line 69.
- The desktop surfaces are the browser web app and VS Code's Agents window via AHP.

**Remote access — server architecture by design**
- Self-hosted server with OIDC. The editor connects to a remote workbench over HTTPS and `wss://` (extension README, "Connect and sign in").
- Responsive mobile layout (browser-ui.md, Information architecture).
- No tunnel or relay feature for a laptop. Tailscale and "remote access" appear only in research on Vibe Kanban.

**Linked Sessions — implemented (ADR 0047 proposed with implementation; openspec change `linked-agent-sessions`)**
- A Linked Session is a person's own local Claude Code session that reports to Unfold through plugin hooks (SessionStart, UserPromptSubmit, Notification, PostToolUse, Stop, SessionEnd) to `POST /api/linked-sessions/events`, using the `vle_` editor credential. Unfold never starts, steers or pays for it.
- Statuses: working, waiting, idle, ended; a session reads as stale after 30 minutes without a report.
- Links come from branch names, commit trailers `Unfold-Session:`, mentions, PRs, or the `unfold_link_session` tool.
- Agent Trace 0.1 records per commit are stored in `refs/notes/agent-trace`. Telemetry is read from VictoriaMetrics and VictoriaLogs. Unfold holds no Claude credential.
- Only the `claude-code` harness is supported (`linkedHarnesses`).
- Code: apps/unfold/src/linked-sessions.ts, `public/views/linked-sessions.js`, `public/core/linked-sessions.js`.
- ADR: apps/unfold/docs/adrs/0047-people-link-their-own-agent-sessions-through-a-plugin-agent-trace-and-telemetry-never-a-claude-sign-in.md.
- Glossary: docs/reference/glossary.md line 116.

**Steering / interrupt — implemented on Unfold's own runtime**
- `engine.pause`, `resume`, `cancel`, `retry`, `addBudget` and messages (`engine.ts` lines 245–805; "operator instruction for the next execution" at line 767).
- `AgentRuntime.interrupt`.
- Extension commands `sendInstruction`, `pause`, `resume`.
- MCP tool `unfold_steer_session`.
- For Ploeg Runs: ADR 0023 says steering reaches the next Round. ADR 0044 and Ploeg ADR-0104 propose mid-Run messages. Root ADR-0022 (accepted): context files added while steering reach the next Run.

**Other overlaps**
- AHP host (ADR 0012, accepted).
- Unfold chat in the Agents window (ADR 0049).
- Blackboard questions and answers (ADR 0050).
- Sessions survive a workbench restart (ADR 0051).
- Multi-Run Team Roles run in sequence (`engine.ts`).

## 4. Lifecycle states

**Unfold** (apps/unfold/src/types.ts lines 9–10)
- `SessionStatus`: queued, running, waiting_input, exporting, paused, completed, failed, cancelled, interrupted.
- `RunStatus`: queued, running, waiting_input, completed, failed, cancelled, paused.

**Ploeg Work Item** (apps/ploeg/pkg/work/types.go lines 11–28)
- `State`: ingested, proposed, queued, active, needs_human, awaiting_review, stale, done, withdrawn.
- `leased` is the retired name for `active` (ADR-0093).
- Unfold's `PloegState` in `src/ploeg.ts` still lists `leased` and has no `active`.

**Ploeg Run** (entities.md, Run)
- state: pending, running, finished.
- outcome: pr_opened, pr_updated, issue_updated, follow_up_created, stuck, failed, no_change_needed.
- `PloegRun.state` in `src/ploeg.ts` matches.

**Ploeg Shift**
- No state enum. A Shift has `openedAt`, `closedAt` and `closeReason` (`PloegShift` in `src/ploeg.ts`; entities.md, Shift). It owns the branch, budget pool and Round counter (Ploeg ADR-0010).

**Ploeg Operator Execution** (entities.md lines 12–48)
- admitted, running, waiting_input, pause_requested, paused, cancel_requested, cancelled, interrupted, completed, failed.
- `supervision` is human or background.

**Cost status** (`pkg/work/types.go` lines 56–72)
- observed, provisional, settled, unknown.

## 5. Mentions of the named competitors

- **t3code, T3 Code, pingdotgg: zero hits** anywhere in the repo (node_modules and .git excluded).
- **Conductor: zero hits.**
- **Claude Code desktop and "Claude desktop": zero hits.**
- **"Codex app": found, but never as a competitor entry.**
  - docs/contributing/agent-instructions.md line 49 is about the Codex desktop app's external agent import syncing `.claude/commands` into `.agents/skills`.
  - The other hits are "Codex app-server" in research evidence (section 2).
- **Vibe Kanban: covered in research.**
  - apps/unfold/docs/research/market-landscape.md section 4.8 ("Continue and Vibe Kanban…", sunsetting; remote-access concept).
  - apps/unfold/docs/research/conventions-and-alternatives.md line 26.
  - 2026-09-18-band-and-the-interaction-layer.md line 200.
  - apps/unfold/docs/adrs/0001-the-human-workbench-beside-ploeg.md.
  - docs/research/evidence/2026-10-14-hermes-agent/4-seam-map.md lines 610–613.
  - `market-sources.json` and `2026-09-12-documentation-audit.json`.
- **Sculptor: one hit**, 2026-09-18-band-and-the-interaction-layer.md line 200 ("silent since April").
- **Crystal: no product mention.** Hits are only the forge card-skin "crystal" art: `public/cards/skins/forge/world/*.js`, `forge-model.js`, `docs/contracts/card-themes.md`, `test/forge-world.test.mjs`, and the copies under `apps/site/public/demo`.
- **The unnamed worktree pattern.** Line 200 of the band report also says the category is "almost all … N isolated agents in git worktrees plus a dashboard", and that the largest open-source entry has about 71,400 stars. That entry is not named.

## 6. Roadmap, backlog and open-question docs

**docs/landscape/questions.md**
- Flagged unverified and stale against root ADR-0002.
- Product intention: "Unfold is the place the developer starts. The particular harness is an implementation choice."
- It also states "Local work must be usable without any Ploeg service". Round one notes that since 2026-10-14 this no longer holds: live Unfold refuses to start without Ploeg.
- Open questions: open conversation without a ticket, the shared runner, retry authority.

**docs/concepts/who-unfold-is-for.md**
- Audience is agencies and developers who do not bill hourly; Work Items become reviewed PRs with previews.
- Phase 1 is self-hosted for the owner and the owner's employer's agency (ClickUp). Phase 2 is hosted EU tenants.
- None of the agency offering is implemented. No local-developer or desktop persona.

**VS Code research**
- docs/research/2026-10-01-vscode-surface-and-agency-fit.md
  - VS Code is "the developer's cockpit, not an engine".
  - PHP agencies use PhpStorm far more than VS Code (68% vs 23%), so ACP is proposed as the JetBrains counterpart.
  - Competitor editor-handoff table: Copilot, Cursor, Devin, Ona, Coder, Factory, OpenHands, Codex cloud, Zed Delta, Amp, Jules, Warp.
  - Journeys J1–J10.
  - Copilot CLI and codex-acp profiles were smoke-tested.
- Per-release fit dossiers in apps/unfold/docs/research/: `2026-10-01-vscode-1-140-fit.md`, `2026-10-08-vscode-1-141-fit.md`, `2026-10-16-vscode-1-142-fit.md`, `2026-10-17-vscode-1-142-integration-surfaces.md`, `2026-10-23-vscode-1-143-fit.md`.

**Protocol gaps**
- apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md, seam table lines 67–78.
- JetBrains, Zed, Neovim and Emacs session UI: nobody.
- Packaging for agent CLIs (Claude Code, Codex, opencode): nobody. This is stale; ADR 0047 has since shipped a Claude Code plugin.
- Hosted AI apps: nobody.

**Ploeg backlog**
- apps/ploeg/docs/backlog.md section G, items 59–70: Claude Code adapter (#62, landed), opencode (#63, closed into ACP), ACP adapter (#64, landed), checkpoint tiering (#67), resume per harness (#70).

**Ploeg landscape**
- apps/ploeg/docs/research/2026-09-26-agent-orchestration-landscape.md, section 5 "The workbench layer". Its product list was not enumerated here; the zero-hit greps above cover it.

**Open OpenSpec changes** (openspec/changes/)
- `sessions-run-in-ploeg`, `linked-agent-sessions`, `add-review-walkthrough`, `scoped-agent-knowledge`, `feature-flags`.

**Relevant Unfold ADRs** (registry: apps/unfold/docs/adrs/README.md)
- 0001 Human workbench beside Ploeg (accepted)
- 0003 Keep harness, workspace and credential seams distinct (accepted)
- 0007 Thin editor client (accepted)
- 0009 Workspace placement is a per-session choice (accepted)
- 0011 Sandboxes dial out through a relay (accepted)
- 0012 Every session is an AHP host (accepted)
- 0017 Delegate interactive execution to Ploeg (proposed)
- 0021 Extension ships through Open VSX first (accepted)
- 0023 Unfold submits Work Items to Ploeg and never executes them (accepted; not implemented; partly superseded by 0044)
- 0027 Editor opens on Now (proposed)
- 0036 AHP over `ws` (accepted)
- 0037 Editor sign-in by person approval with its own credential (accepted)
- 0040 Accept opens a PR through the trusted publisher (accepted; not implemented)
- 0044 Sessions run in Ploeg with a Harness chosen per session and interaction kept (proposed; not implemented)
- 0046 Run health computed from facts, judge advises (proposed)
- 0047 Linked Sessions via plugin, Agent Trace and telemetry (proposed with implementation)
- 0049 Agents-window Unfold chat acts on confirm (proposed with implementation)
- 0050 Blackboard (accepted)
- 0051 Session survives a workbench restart (proposed with implementation)
- 0053 Work Item and its session are one page (proposed with implementation)
- 0054 Walkthrough on the Work Item (proposed)

**Relevant root ADRs** (index: docs/adr/index.md)
- 0002 Ploeg is the only engine (accepted)
- 0003 Unit of work is the Work Item (accepted)
- 0005 Offered to agencies (accepted)
- 0011 Reachable over MCP, read-first (accepted)
- 0022 Context files at start and while steering (accepted)
- 0026 Installable web app that notifies from the server (proposed)
- 0031 Metered read-only Ask (accepted)
- 0032 Unfold serves its own MCP tools (accepted)
- 0035 Interactive sessions reach knowledge only through unfold-mcp (proposed)
- 0037 Every action names person, channel and confirmation (accepted)
- 0042 Self-hosted decider as a shadow tripwire (proposed)

**Relevant Ploeg ADRs** (in apps/ploeg/docs/adrs/)
- 0006 AHP is the wrong layer
- 0018 Outcome drop box is every harness's return path
- 0034 Harness gets placeholders, the worker keeps credentials
- 0041 OpenAI Agents API stays outside the Run
- 0044 Restart from a chosen Round (accepted)
- 0075 Stopped writing Run leaves a checkpoint (proposed)
- 0084 Claude Code Run in a Team's self-hosted Claude environment (accepted)
- 0090 Bounded redacted transcript (proposed)
- 0094 Connect a Team's Claude login from Unfold (rejected)
- 0097 Record harness version
- 0098 Choose harness from the Team allowlist (accepted)
- 0099 One workload per harness (accepted)
- 0100 Attended Run relays harness requests (proposed)
- 0101 Paused Run keeps its pod for a bounded time (proposed)
- 0102 Operator consumer admits, worker executes (accepted)
- 0103 Choose model per Run (accepted)
- 0104 Message reaches an attended Run at the next prompt turn (proposed)
- 0108 Every operator action names its person; MCP actions need confirmation (accepted)
- 0112 Claude environment uses the acting person's login (proposed)
- 0113 Harness OpenTelemetry (no status read)
- 0118 Retire the OpenHands CLI (proposed)
- 0125 Walkthrough (proposed)
- 0126 Attack drill against every harness (no status read)
- 0128 Chat as a read-only Run (proposed)

## 7. Competitor and alternatives ledgers

**apps/unfold/docs/research/2026-09-11-ecosystem-alternatives.md** (11 September 2026; marked historical scope)
- Replacements: OpenHands, Kandev, Coder Agents/Workspaces, Paperclip, GitHub Copilot cloud agent.
- Components: OpenCode, Temporal, KEDA, LiteLLM, Fireworks AI, LangGraph, CrewAI.
- Appendix: Argo Workflows, Agent Sandbox, Kata, kagent, OpenTelemetry, Langfuse, MCP, ACP, A2A, BAND, AP2, AHP, AG-UI.

**apps/unfold/docs/research/market-landscape.md** (9 September 2026; sources in `market-sources.json`)
- Kandev, OpenHands Agent Canvas/Enterprise, Coder, Paperclip, GitLab Duo Agent Platform, GitHub Copilot cloud agent, Factory, Devin, Cursor cloud agents, OpenCode, Claude Code (section 4.7, "components, not equivalent products"), Continue, Vibe Kanban, BAND/Jam (added 18 September), LiteLLM `agent()` (added 8 October).

**apps/unfold/docs/research/conventions-and-alternatives.md**
- Kandev, Vibe Kanban, OpenCode, OpenHands, plus internal estate repos.

**2026-09-18-band-and-the-interaction-layer.md, section 7**
- Microsoft Foundry Agent Service, Kandev, OpenHands Enterprise, Terragon (shut down), Vibe Kanban, Continue, Coder Tasks (removed), Sculptor.
- "Empty columns" claim: provenance and signing, per-task budget, replay, reviewer crews, agency tenancy, a self-hosted control plane.

**Absent from every ledger:** T3 Code, Conductor, Crystal, Claude Code desktop, the Codex desktop app as a competitor, Sculptor beyond its one line, and Superset or similar worktree GUIs.
