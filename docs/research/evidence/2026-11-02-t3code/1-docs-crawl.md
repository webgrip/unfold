# T3 Code: product and docs crawl

- Date: 2026-11-02
- Subject: T3 Code, <https://github.com/pingdotgg/t3code> (owner T3 Tools Inc / Ping, maintainers "Theo, Julius")
- Method: GitHub REST API (repo metadata, releases, recursive tree of `main`) and raw downloads of every `docs/**/*.md`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md` and `.github/SECURITY.md` from `main`, read and grepped locally. WebFetch of <https://t3.codes> and <https://t3.codes/security-policy> (both returned as model summaries, so only the strings marked "verbatim" below are exact). One WebSearch for a roadmap. Nothing is from prior knowledge.
- Short links used below: `README` = <https://github.com/pingdotgg/t3code/blob/main/README.md>; `docs/...` = `https://github.com/pingdotgg/t3code/blob/main/docs/...`.

## 1. Self-description, version, stability

### Self-description (verbatim)

- README (<https://github.com/pingdotgg/t3code/blob/main/README.md>): "T3 Code is an "agent harness control surface". It enables control of the agents on your machine with a best-in-class mobile app (iOS, Android), web app and Electron-based desktop app."
- README: "Works with your subscriptions on Claude Code, Codex, Cursor, Grok Build, OpenCode, Google Antigravity, and fx. If they're set up on your computer, T3 Code can control them."
- README, "Wait, what are you selling me?": "Nothing. We built T3 Code because we wanted the best possible development experience with agents. We were inspired by existing solutions like the Codex desktop app, Conductor, Claude Desktop and Cursor Glass, but none met our bar." / "We wanted something performant, remote-ready, and truly open. If we ever go the wrong direction, we want you to have everything you need to fork and build the editor that you want."
- AGENTS.md (<https://github.com/pingdotgg/t3code/blob/main/AGENTS.md>): "T3 Code is a minimal GUI for coding agents. A Node WebSocket server wraps provider CLIs and agents (Codex, Claude Code, Cursor, Grok, OpenCode, Antigravity) and serves web, desktop, and mobile clients." / "You can think of T3 Code as an open source "bring-your-own-subscription" alternative to apps like Claude Desktop, Codex App, Cursor Glass and Conductor."
- FAQ (<https://github.com/pingdotgg/t3code/blob/main/docs/user/faq.md>), "Is T3 Code a harness?": "No. ... T3 Code uses those harnesses. It is not a harness, and it does not work without one." / "Chef = LLM. Kitchen = harness. T3 Code = the restaurant that lets you bring whatever kitchen you want."
- Marketing site <https://t3.codes>: hero headline (verbatim) "The open-source control plane for coding agents." Section headings (verbatim per fetch): "Tolerated by over 500,000 devs", "Bring your own sub", "One button to commit, push, and make a PR", "If you don't like something, fork it", "Your agents deserve better than a terminal". Footer "© 2026 T3 Tools Inc · MIT licensed". Subheadline was returned only as a summary: one interface for Claude Code, Codex, Antigravity, OpenCode, Cursor and Grok, with your own subscriptions, forkable source.
- Repo metadata (GitHub API, 2026-11-02): description empty, homepage `https://t3.codes`, licence MIT, 40,060 stars, created 2026-02-08, last push 2026-11-02T12:59Z.

### Version and release date

- Current stable: **v0.1.6, published 2026-10-31T10:52:24Z** (<https://github.com/pingdotgg/t3code/releases/tag/v0.1.6>, the API's `releases/latest`). Notes: "521 changes from 137 contributors". Highlights: side chats, pin/archive projects, review local commits in the Diff pane, 1Password for provider and source-control credentials.
- Newest pre-release: v0.1.7-nightly.20261102.4066, 2026-11-02T06:52:31Z (<https://github.com/pingdotgg/t3code/releases>). Channels: Stable and Nightly, plus "Preview (maintainer test build, do not install)" builds and Android beta builds.
- Cadence: 771 releases total, 61 stable. Oldest stable tag `v0.0.0-alpha.3` (2026-03-02). v0.1.0 on 2026-10-15 ("T3 Code Orchestrator V2 is now stable", <https://github.com/pingdotgg/t3code/releases/tag/v0.1.0>); v0.1.1 to v0.1.6 between 2026-10-21 and 2026-10-31.
- Package versions: `apps/server` is npm package `t3` at 0.1.6; `apps/desktop` is `@t3tools/desktop` 0.1.6 (package.json files on `main`).

### Stability statements (verbatim)

- README: "We are very very early in this project. Expect bugs."
- README: "We are (mostly) not accepting contributions yet. Small fixes may be considered. Big features will not be."
- README: "Full docs live in docs/. There's no docs site yet."
- The macOS app is named "T3 Code (Beta)", formerly "T3 Code (Alpha)": "Updating an older **T3 Code (Alpha)** installation can replace it with **T3 Code (Beta)** without reopening the app." (docs/user/updating.md)
- Features marked beta in docs: Review guides ("Review guides are in beta", docs/user/source-control.md), Guest links ("Guest links are a beta", docs/user/guest-links.md), "Fold working threads (beta)", "Group threads by project (beta)" (docs/user/thread-sidebar.md), "Simlock hosts (alpha)" (docs/user/devices.md). ACP "v2 preview protocol" (docs/user/providers-acp.md).
- Docs `docs/orchestration-v2/README.md`: "This document set describes the target architecture for the next orchestration model. It is not a patch plan for the current implementation" (V2 shipped stable in v0.1.0).

## 2. Core abstractions (as named in docs/internals/glossary.md)

Source: <https://github.com/pingdotgg/t3code/blob/main/docs/internals/glossary.md>, verbatim definitions.

- **Environment**: "One running server and the machine, credentials, workspace access, and state it owns."
- **Client**: "A web, desktop, or mobile UI connected to an environment. The desktop app can also host a server."
- **Project**: "An environment-local workspace record rooted at a directory."
- **Workspace root**: "The project's base filesystem directory on the environment."
- **Worktree**: "A separate Git checkout a thread can use instead of the project's main checkout."
- **Thread**: "The durable conversation and work history for a project. It survives provider process exits." (A thread can also run with no project, in `~/.t3/scratch`, docs/user/thread-sidebar.md.)
- **Turn**: "One user-to-agent cycle, a V2 run. Provider work can end before checkpoint and diff work settles."
- **Activity**: "A non-message timeline item, such as a tool action, approval, or failure."
- **T3 home**: "The base data directory."
- **Command / Event / Orchestrator / Projection / Command receipt / Outbox effect / Effect worker**: event-sourced orchestration; "The event log is the source of truth for orchestration state" (docs/internals/overview.md).
- **Provider**: "The agent runtime T3 Code controls, such as Codex or Claude Code."
- **Driver**: "The integration for a provider kind."
- **Provider instance**: "One configured provider, with its own settings and lifecycle. Multiple instances can use the same driver."
- **Adapter**: "The boundary translating a provider's native protocol into T3 Code operations and events."
- **Session**: "The provider runtime attached to a thread. A session can be stopped and resumed without deleting the thread."
- **Runtime mode**: "The thread's permission policy." (= permission modes)
- **Interaction mode**: "How the agent approaches the task, such as planning. Separate from permission policy."
- **Checkpoint**: "A saved workspace state used for diffs and restore, stored as a hidden Git ref."
- **Checkpoint baseline**: "The workspace state captured before the work being compared."
- **Turn diff**: "The workspace changes attributed to one turn."
- **Pull request link**: "A persisted thread association identified by host, repository, and number."
- **Pull request sync**: the worker that refreshes linked reviews and discovers stack layers.
- **Current pull request**: "The link used by single-review controls and older clients."
- **Context record / Context reference / Attachment binding / Attachment inventory**: composer context model.
- Other named product concepts in user docs: **Settle / Settled thread** (finished work moved out of the active list), **Side chat** (`/side`, `/btw`), **Subagent** / `delegate_task` (child thread on any provider), **Fork**, **Goal** (`/goal`), **Queue / Steer**, **Scheduled task** and **Webhook automation**, **T3 Connect** (tunnel/relay), **Pairing link / scopes**, **Guest link**, **Review guide**, **Managed policy**, **Device panel**, **SnapShots**, **Portable handoff** (context summary when switching provider). Sources: docs/user/thread-sidebar.md, composer.md, project-settings.md, remote-access.md, guest-links.md, source-control.md, managed-policy.md, devices.md, snap-shot.md, portable-handoffs.md.
- Orchestration V2 invariants (verbatim, docs/orchestration-v2/README.md): "App ids are primary. Provider ids are refs." / "Child execution completion never closes the parent run." / "Provider switches create explicit context handoff artifacts; they are not hidden prompt hacks." / Goal: "Model root turns, subagents, tools, approvals, plans, and checkpoints as one execution graph."

## 3. Surface inventory and providers

### Surfaces

- **Server + CLI** (`t3`, npm `t3`): "Node WebSocket server" (AGENTS.md). Install `curl -fsSL https://t3.codes/install.sh | sh` or `npx t3@latest`; `t3` "start[s] the server and open[s] the local web app"; `t3 service install`, `t3 update`, `t3 up`, `t3 connect`, `t3 thread start|send|show|list`, `t3 auth ...`, `t3 policy check|show` (README; docs/user/outside-agents.md; docs/user/remote-access.md; docs/user/managed-policy.md). No `t3` binary for Intel Macs (docs/user/faq.md).
- **Desktop**: Electron ("a full Electron app that bundles the server runner as well", AGENTS.md); `electron` 44.10.0, `electron-updater` (apps/desktop/package.json). macOS, Windows (winget, scoop), Linux (.deb, AUR, Nix) (README). Can act as host for remote clients or run "as a Remote Only" (docs/user/remote-access.md).
- **Web**: locally served by `npx t3`, and hosted client <https://app.t3.codes> (AGENTS.md: "Web is kind of two surfaces").
- **Mobile**: React Native iOS (<https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824>) and Android (<https://play.google.com/store/apps/details?id=com.t3tools.t3code>). "The phone is a remote. Your computer does the work and needs to stay on." (docs/user/faq.md)
- **Remote/server mode**: core value "Remote ready" (AGENTS.md). Paths: T3 Connect (Cloudflare tunnel, "Our relay sets up the link. It does not proxy your HTTP or WebSocket sessions", faq.md), LAN pairing, Tailscale (incl. Tailscale HTTPS), desktop-managed SSH ("T3 Code starts or reuses a server there and opens the port forward for you", remote-access.md). FAQ: "Less than 5% of my prompts run on my laptop."
- **MCP server** for outside agents at `https://<environment-address>/mcp` with OAuth (docs/user/outside-agents.md).
- **Browser panel** and **Device panel** (iOS Simulator / Android Emulator, agents drive via `device_*` tools and `agent-device` CLI) (docs/user/remote-access.md, docs/user/devices.md).

### Providers and how each is driven

Integration shape (docs/internals/adding-a-provider.md, verbatim): "ACP agents start as ACP Registry entries ... An agent gets a dedicated driver only when it needs behavior the spec does not cover, and then it is a small flavor over the shared ACP adapter, like Grok and Antigravity." / "Other protocols get a native adapter that implements `ProviderAdapterV2`, like Codex, Claude, Cursor, OpenCode, Pi, and Muse."

| Provider | Driven via | Source |
| --- | --- | --- |
| Codex | Codex App Server, child process over stdio (`packages/effect-codex-app-server`, `CodexAppServerClient` spawns a child process with stdio) | faq.md ("the app plus the Codex App Server"); <https://github.com/pingdotgg/t3code/blob/main/packages/effect-codex-app-server/src/client.ts> |
| Claude Code | Anthropic Agent SDK (`@anthropic-ai/claude-agent-sdk` ^0.3.276 in apps/server) | faq.md "T3 Code drives Claude through Anthropic's Agent SDK"; apps/server/package.json |
| Claude Agent (ACP) | ACP Registry / local `claude-agent-acp`, ACP v2 preview by default | docs/user/providers-acp.md |
| Cursor | official `@cursor/sdk` TypeScript package, local-agent runtime; "It does not use Cursor's ACP transport for V2 execution." | docs/user/cursor.md |
| Grok Build | dedicated flavor over the shared ACP adapter (`acpSupport.ts`, `xaiAcpExtension`) | adding-a-provider.md; packages/provider-grok |
| Google Antigravity | "Google's official Antigravity ACP agent"; no CLI required, T3 installs runtime | docs/user/providers-antigravity.md |
| OpenCode | `@opencode-ai/sdk` (1.x, one T3-managed server per thread) and `@opencode/client`/`@opencode/protocol` (2.x, one server per instance) | docs/internals/providers.md; packages/provider-opencode/package.json |
| Pi | user's `pi` install "in RPC mode" | docs/internals/providers.md |
| Muse Code (Meta) | `@muse-code/sdk` 1.4.6; disabled by default | packages/provider-muse/package.json; docs/user/providers-muse.md |
| fx | ACP-based (`packages/provider-fx/src/server/acpSupport.ts`) | packages/provider-fx |
| ACP Registry agents (e.g. Devin, Cline, Kimi, Droid) and any "Local ACP command" | ACP v2 preview, negotiates ACP v1 | docs/user/providers-acp.md; v0.1.0 notes |

- Every provider is used through the user's own login/subscription on the server machine; API keys and OpenRouter via extra provider instances (faq.md).
- "Does T3 Code support local models? No. T3 Code is a serious developer tool. Locally runnable models are not capable of meaningful engineering work." (faq.md)
- T3 injects its own MCP (`t3-code` server key) into provider sessions (docs/orchestration-v2/orchestrator-mcp-server.md; docs/internals/providers.md).

## 4. Feature inventory (review-oriented)

- **Diff / review UI**: Diff pane per turn: "A turn's changed files and diff show only the turn's own work"; branch comparison against base; **Commits** source picker to review one local commit at a time (newest 100). Diffs derived from checkpoints, Codex `turn/diff/updated` opted out (docs/user/source-control.md; docs/internals/providers.md). `@pierre/diffs` is patched in (repo `patches/`).
- **Pull request review in-app**: **Pull requests** page to "review changes and comments, request reviewers, check out a branch, or merge"; line comments drafted until review submit; mark files as viewed (synced to GitHub's own viewed marks); auto-merge on GitHub/GitLab/Azure DevOps; GitHub stacks (**Merge stack**, **Rebase stack**); revert PR for a merged change (docs/user/source-control.md).
- **Review guides (beta)**: "The **Guide** tab gives you a tour of a pull request without reading it line by line: stops through the change in reading order." Stops marked **Look closely** carry "a call only a maintainer can make"; mechanical changes grouped at the end; every changed file appears; written by Claude or Codex in a temporary checkout; shared for everyone on the server; custom **Review guide instructions** (docs/user/source-control.md).
- **Forges**: "GitHub, GitLab, Forgejo, Gitea, Bitbucket, Azure DevOps, and GitCafe" via API token or the forge CLI (`gh`, `glab`, `fj`/`tea`, `az`, `cafe`) (docs/user/source-control.md).
- **Branch / PR creation**: "Use a thread's Git actions to commit, push, and create a pull request. T3 Code can generate commit messages, review titles, and descriptions from your changes. Descriptions also draw on the work in the thread, including the checks it ran." (source-control.md). Site: "Each agent thread writes to its own branch. One button opens a GitHub PR" (t3.codes, summarized). Optional **Remove agent credits when merging** (off by default).
- **Linked PRs and PR watching**: a thread holds several PRs; auto-linked when agent runs `gh pr create`/`glab mr create`; `link_pull_request` tool; `watch_pull_request` polls every two minutes and wakes the agent on failed checks, passing required checks, comments/reviews, conflicts; stops on merge/close or after limits (source-control.md).
- **Thread settlement**: auto-settle after three days inactive or when PR merged; server-owned (thread-sidebar.md; overview.md).
- **Git worktrees**: **New worktree** per thread; worktrees under T3 home `worktrees` (configurable); branch naming rules; automatic cleanup in **Settings → Worktrees → Cleanup**; "One user cleared 500 GB" (faq.md; project-settings.md). Multi-model fan-out: "Shift-click models ... Each selection starts a separate thread and worktree" (thread-sidebar.md). `t3.json` project scripts incl. `runOnSettle`.
- **Checkpoints / revert**: hidden Git refs; **Edit from here** with **Revert and keep changes** or **Revert files too**; "File restore is only offered for threads running in a worktree" and refused when another session shares the directory; providers that cannot roll back conversation reject revert before touching files (composer.md; overview.md; providers.md).
- **Approvals / permissions**: four permission modes (see section 7); subagent approvals surface in the parent; "Agents can't approve their own permission requests." (v0.1.0 notes).
- **Plan mode**: Interaction mode "such as planning" (glossary); `/plan` command (composer.md); OpenCode "Plan mode uses OpenCode's `plan` agent"; Antigravity uses native `/plan` rather than "T3 Code's separate Plan mode"; Muse has no separate Plan mode (provider docs).
- **Goals**: `/goal <done-condition>` for Codex and Claude; agent keeps working across turns (composer.md).
- **Terminal**: integrated terminals on the server, 5,000 lines / 8 MiB scrollback retained (docs/user/terminal.md); `libghostty-vt` native module in repo tree.
- **Multi-agent parallelism**: many threads in parallel, background start (`Cmd+Enter`), `delegate_task` "lets an agent hand work to a child agent on any provider and model ... **This is the recommended way to combine harnesses**, for example Claude planning and Codex implementing." (v0.1.0 notes); **Agents** view for subagents; fork any thread; switch provider/model mid-thread via portable handoff.
- **Cost / token display**: **Usage** page (`mod+u`) "shows token use, cache savings, model breakdowns, and estimated API-equivalent cost ... These estimates are not your subscription bill."; custom model prices; CLIProxyAPI hub pooled limits; legacy context meter off by default (docs/user/usage.md; composer.md).
- **Model selection**: model picker per thread (`mod+shift+m`), effort (`mod+shift+e`), host (`mod+shift+h`), custom models, model defaults per project (keybindings.md; composer.md).
- **Notifications**: mobile push "when an agent finishes, fails, needs approval, or asks for input", iOS Live Activities, Android Live Updates; requires T3 Connect (docs/user/mobile-notifications.md).
- **Keybindings**: fully configurable command IDs with `when` conditions, config file editable (docs/user/keybindings.md).
- **MCP**: (a) T3 MCP injected into provider sessions with orchestration tools (create/wait/cancel sub-agents, threads, link PRs, settle, scheduled tasks); (b) environment `/mcp` endpoint for outside agents (Claude Code, Codex, ChatGPT) with OAuth and per-agent scope Read only (default) through Full access (outside-agents.md; orchestrator-mcp-server.md). Provider MCP servers/skills pass through (`$` skills, restart agent session).
- **Automations**: scheduled tasks and webhook-triggered tasks, GitHub signature check, payload placeholders marked as untrusted (docs/user/project-settings.md).
- **Remote access / tunnels**: T3 Connect (Cloudflare tunnel), LAN, Tailscale, SSH; scoped pairing tokens (remote-access.md).
- **Auth / multi-user**: environment auth with pairing links and scopes (`orchestration:read`, `orchestration:operate`, `terminal:operate`, `filesystem:read|write`, `source-control:write`, `relay:read` ...); T3 Connect account (desktop uses `@clerk/electron`); Okta sign-in mentioned in v0.1.6 fixes. **Guest links (beta)**: one teammate follows one thread with no account, 24 h, their messages wait for owner Send/Dismiss. **Pull request sharing** between trusted environments. **Managed policy** for administrators (JSON, `t3 policy`). No team/workspace/multi-tenant user model is documented; access is per environment/device session (remote-access.md; guest-links.md; managed-policy.md).
- Other: side chats, prompt stash, queued messages persisted server-side, voice input (iPhone), HTML/PDF renders, SnapShots, 1Password secret provider, OpenTelemetry export to your own receiver.

## 5. Pricing, licence, business model, hosted service, telemetry

- Licence: MIT (GitHub API; README; site footer "© 2026 T3 Tools Inc · MIT licensed").
- Pricing (verbatim, faq.md): "Nothing. There's no way to pay us to use T3 Code. You bring your own sub. It is free and open source (MIT). You still pay your provider like you already do. T3 Connect is free too, for now. Every account can connect up to 3 machines running T3 Code." / "We don't want to charge for this, but if the bill gets unacceptable we may have to change course."
- Monetisation link: T3 Chat (Ping's paid chat product) raises T3 Connect limits: "up to 10 machines with T3 Chat Pro, or 100 with Premier" (faq.md; remote-access.md).
- Site: "T3 Code doesn't resell tokens" (t3.codes, summarized), no paid tiers listed.
- Hosted pieces: hosted web client <https://app.t3.codes> (UI only; execution stays on your environment); T3 Connect relay/tunnel infrastructure (`infra/relay`); optional webhook hold "stores requests to a T3 Connect URL for up to 24 hours"; push notifications via T3 Connect. No hosted agent execution service is documented. "Does my code go to T3 servers? No." (faq.md)
- Telemetry (docs/user/telemetry.md, verbatim): "The T3 Code server sends product usage events to T3 Code's own endpoint at `ingest.t3.codes` ... forwards events to PostHog." Events include "provider, model, reasoning effort, permission mode, turn and request results, duration, release channel, and token counts". Sends hashed T3 Connect, OpenAI and Claude account identifiers. "Events do not include prompts, responses, file contents, authentication tokens, conversation IDs, raw provider events, or child-agent output." Relay traces to Axiom; mobile crash reports to Axiom. Opt-out `T3CODE_TELEMETRY_ENABLED=false`; on by default.
- ToS stance (faq.md): "We work with all of the labs and T3 Code is within the TOS of Claude Code, Codex, and Google Antigravity." / FAQ on multi-account: "If we add an auto-switcher, we are risking TOS bans for our users."

## 6. Anti-goals, "not" statements, roadmap

- Not a harness: "It is not a harness, and it does not work without one." (faq.md)
- No local models (faq.md, quoted above).
- No account pool/auto-switcher: "I don't think T3 Code is the right place to manage a pile of accounts." (faq.md)
- Contributions: "We are not actively seeking outside contributions and have limited review capacity." / "Unsolicited features, opinionated rewrites, and unrelated cleanup are not [likely to be accepted]." (CONTRIBUTING.md, <https://github.com/pingdotgg/t3code/blob/main/CONTRIBUTING.md>)
- "Models we do not accept": PRs closed when the author states "Gemini models (any version ...) or Muse Wonder wrote any of the code" (CONTRIBUTING.md).
- AGENTS.md non-negotiables: "1. Open at the core", "2. Performance without compromise", "3. Remote ready", "4. Multi-surface". Theo's note: "Do not introduce machinery because it looks architecturally impressive." / "Fight scope creep."
- AGENTS.md to agents: "Never make a PR unless the developer explicitly asks you to do so."
- Managed policy is not a sandbox: "The limit decides which modes T3 Code asks the provider for. It is not a sandbox" (managed-policy.md).
- Roadmap: AGENTS.md claims "We share our roadmap", but **no roadmap file, page or GitHub Project was found**: no `roadmap` path in the repo tree, `/repos/pingdotgg/t3code/projects` returns 404, and a web search found none. Feature requests go to Ideas discussions (<https://github.com/pingdotgg/t3code/discussions/categories/ideas>). Forward-looking items seen: site "more harnesses are planned" (summarized); voice input "Web, desktop, and Android do not have it yet" (faq.md); GitCafe line comments "not available ... yet" (source-control.md).

## 7. Security model in its own words

- Ownership boundary (docs/internals/overview.md): "T3 Code keeps execution in the environment that owns the workspace. Web, desktop, and mobile clients control it over authenticated RPC. A remote client must never substitute its own filesystem, provider credentials, or machine state for the environment's." / "Authentication of a socket does not authorize every method on it."
- Permission modes (docs/user/permission-modes.md, verbatim table): **Supervised** "Requests approval for commands and file changes."; **Auto-accept edits** "Approves file edits automatically; other actions can still require approval."; **Auto** "Uses the provider's automatic review to approve routine actions and ask about others."; **Full access** "Allows commands and edits without approval prompts."
- Default (verbatim): "The initial default is **Full access**".
- "Providers enforce permissions differently." Auto falls back to asking on OpenCode and Antigravity; fx has no Auto-accept edits or Full access; Muse only Supervised and Full access; Grok no Auto-accept edits. Claude "can still ask in **Full access** when its settings disable bypass permissions"; "Dangerous-removal safety checks in bypass mode reject the command with the original warning." (permission-modes.md)
- No T3-level sandbox: sandboxing is the provider's. ACP: "Registry agents read files, edit, and run commands themselves, under their own sandbox and approval rules ... use its sandbox and permission controls when that matters." (providers-acp.md). Cursor: "full access disables its sandbox" (cursor.md). Pi: T3's policy "is not an operating-system sandbox" (providers-pi.md). Antigravity helpers: "Prompt instructions and tool denial do not create a native sandbox." (internals/providers.md)
- Attachments: "A path in the prompt does not grant filesystem access. Keep provider sandbox and approval rules in force" (internals/providers.md).
- Remote access scopes (remote-access.md): without `--scope`, "pairing tokens and issued bearer sessions get every permission, including managing access and T3 Connect. A terminal or a full-access agent on the host can reach those as well". `source-control:write` "does not restrict what a task does ... the agent it runs can use Git however the environment allows." "Treat pairing URLs and authorization codes as passwords."
- Outside agents via MCP: "Read only is the default"; "A thread it starts or steers cannot run with more permissions than the mode you chose." (outside-agents.md)
- Webhooks: payload values "marked as untrusted request data. This helps the agent tell it apart from your instructions, but it doesn't guarantee the agent ignores what the text says." (project-settings.md)
- Managed policy limits: "T3 Code enforces the policy in its own processes, which run as the user, so it stops users from changing managed settings in T3 Code but does not stop a user who modifies or replaces T3 Code itself." Provider CLIs read their own config; "use their own managed configuration, such as Claude Code's managed settings." (managed-policy.md)
- Security policy (<https://t3.codes/security-policy>, last updated 2026-07-15, summarized fetch): shared responsibility, "we do not control the security of your devices, environments, repositories, networks, credentials, or third-party providers"; users should be "Reviewing commands, source changes, and other agent output before applying or executing it." No sandboxing statement on that page. Reporting to security@ping.gg (.github/SECURITY.md).

## Absences (confirmed)

- No docs site ("There's no docs site yet", README); docs live in repo `docs/`.
- No published roadmap found (see section 6).
- No OS-level sandbox provided by T3 Code itself; no T3-level sandbox documented anywhere.
- No team/organisation account, RBAC role model or multi-tenant hosting documented; access control is per environment via pairing scopes, plus managed policy per machine and single-thread guest links.
- No hosted agent-execution service; no paid T3 Code tier.
- No local-model support (explicit).
- Tauri: not used (desktop is Electron).
- Voice input absent on web, desktop and Android.

## Not verified

- t3.codes body text and subheadline: only a model summary was available, not verbatim HTML.
- Exact Codex App Server wire format (JSON-RPC framing) not read beyond the client spawning a child process over stdio.
- Claims such as "500,000 users" are the project's own; not independently checked.
