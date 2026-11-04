# T3 Code: source repo dig

- Date: 2026-11-02
- Subject: <https://github.com/pingdotgg/t3code>, default branch `main`
- Commit inspected: `47f2c8d29e981c7723467efe137ee19e91df924e` (committed 2026-11-02T00:18:56-08:00 by Theo Browne)
- Method: GitHub REST and GraphQL through the authenticated `gh api` CLI (repo, languages, releases (all 771, paginated), contributors (paginated), commits on `main` since 2026-10-03 (paginated, 4,463 commits), forks, `search/issues`, `search/repositories`, discussions search). Read-only `git clone --depth 1` into a new empty scratch directory; only `ls`, `cat`, `sed`, `grep`, `find` and one `python3 -I` JSON reader (script outside the clone, file passed as an argument) ran against it. No install, build or script in the repo was run. npm registry and npm downloads API read with `curl`. Nothing is from prior knowledge.
- Link convention: `SRC/<path>` means `https://github.com/pingdotgg/t3code/blob/47f2c8d29e981c7723467efe137ee19e91df924e/<path>`. Issues and PRs are `https://github.com/pingdotgg/t3code/issues/<n>` / `.../pull/<n>`; discussions `https://github.com/pingdotgg/t3code/discussions/<n>`.
- Caveat on greps: the repo tracks 21,835 files of vendored reference repos under `.repos/` (`alchemy-effect`, `effect-smol`; populated by `scripts/sync-reference-repos.ts`, see `"sync:repos"` in SRC/package.json). Keyword verdicts below exclude `.repos/`, `node_modules`, `pnpm-lock.yaml` and `third-party-licenses*`, because hits there are not T3 Code's own code.

## 1. Repo stats

Source: `gh api repos/pingdotgg/t3code`, `.../languages`, `search/issues` totals, `.../releases` (all pages).

| Fact | Value |
|---|---|
| Stars | 40,062 |
| Forks | 9,010 |
| Licence | MIT, "Copyright (c) 2026 T3 Tools Inc." (SRC/LICENSE) |
| Owner | GitHub Organization `pingdotgg`; homepage <https://t3.codes> |
| Created | 2026-02-08T23:46:22Z |
| Last push / last commit | pushed 2026-11-02T13:19:06Z; HEAD commit `47f2c8d` 2026-11-02 |
| Languages (bytes) | TypeScript 179.1 M (dominant), MDX 3.4 M, Astro 0.55 M, CSS 0.40 M, C 0.31 M, JavaScript 0.31 M, Kotlin 0.29 M, Swift 0.27 M, Rust 0.15 M, plus HTML, Shell, C++, Vue, Python, Svelte, QML, PowerShell, Dockerfile, Ruby, Nix, Zig |
| Open issues | 1,533 (search `is:issue is:open`); closed issues 5,362 |
| Open PRs | 2,606; merged PRs 8,540 |
| Discussions | 2,575 total; categories Announcements, Ideas, Q&A |
| Releases | 771 total: 653 `-nightly.*`, plus `-preview.*`, stable `v0.x`, `android-beta-*` |
| Latest stable | `v0.1.6`, published 2026-10-31T10:52:24Z (`releases/latest`); npm package `t3` latest 0.1.6, `repository.directory: apps/server` (<https://registry.npmjs.org/t3/latest>) |
| Latest prerelease | `v0.1.7-nightly.20261102.4066`, 2026-11-02T06:52:31Z |
| npm downloads (`t3`) | 114,912 in 2026-09-30..2026-10-29 (<https://api.npmjs.org/downloads/point/last-month/t3>) |

Release cadence (all releases per month, by `published_at`): 2026-03: 27, 04: 26, 05: 43, 06: 73, 07: 103, 08: 178, 09: 153, 10: 163, 11 (to date): 5. Several nightlies per day in October.

Stable tags with dates: v0.0.0-alpha.3 (2026-03-02) … alpha.22 (2026-03-06); v0.0.2 2026-03-07; v0.0.5 03-08; v0.0.9 03-09; v0.0.11 03-13; v0.0.13 03-20; v0.0.15 03-29; v0.0.17 04-10; v0.0.20 04-17; v0.0.21 04-23; v0.0.22 05-05; v0.0.24 05-15; v0.0.25 06-04; v0.0.27 06-09; v0.0.28 06-29; v0.0.29 07-27; v0.0.31 07-29; v0.0.33 08-10; v0.0.34 08-26; v0.0.38 09-01; v0.0.40 09-08; v0.0.42 09-16; v0.0.44 09-29; v0.0.45 10-02; **v0.1.0 2026-10-15**; v0.1.1 10-21; v0.1.2 10-22; v0.1.3 10-27; v0.1.4 and v0.1.5 10-29; v0.1.6 10-31. Stable cadence: roughly weekly through the summer, every 1-5 days since v0.1.0. Release workflows: SRC/.github/workflows/release.yml, SRC/.github/workflows/release-desktop.yml, SRC/.github/workflows/publish-aur.yml, mobile EAS workflows.

## 2. Contributor concentration, affiliation, governance

### All-time (contributors API, 475 entries, 8,653 commits counted)

| Login | Commits | Share | Affiliation (GitHub profile, `gh api users/<login>`) |
|---|---|---|---|
| juliusmarminge | 3,801 | 43.9% | "Founding Engineer @pingdotgg"; public `pingdotgg` org member |
| t3dotgg | 1,052 | 12.2% | Theo Browne, "CEO @ Ping.gg"; public `pingdotgg` org member |
| maria-rcks | 525 | 6.1% | no company listed; in maintainer exemption list |
| only21mil | 246 | 2.8% | none listed |
| Yash-Singh1 | 156 | 1.8% | none listed; in maintainer exemption list |
| shivamhwp | 135 | 1.6% | none |
| flamboh | 132 | 1.5% | "uoregon '27" |
| t3-code-bot[bot] | 128 | 1.5% | bot |
| saphid | 121 | 1.4% | company "Amazon" |
| StiensWout | 108 | 1.2% | "Europehospitals" |
| Bil0000 | 99 | 1.1% | "@Calendaty" |
| UtkarshUsername | 93 | 1.1% | none |
| PixPMusic | 83 | 1.0% | "Nebius" |

The six maintainer logins in SRC/.github/TRIAGE_EXEMPTIONS.td (`bmdavis419`, `juliusmarminge`, `maria-rcks`, `markflorkowski`, `t3dotgg`, `Yash-Singh1`) hold 5,541 / 8,653 = 64.0% of counted commits. `markflorkowski` lists company "T3 Tools"; `bmdavis419` bio "theo's channel manager". Public org members of `pingdotgg`: only `juliusmarminge`, `t3dotgg` (`gh api orgs/pingdotgg/members`).

### Last 30 days (commits on `main` since 2026-10-03, 4,463 commits, 560 distinct authors)

juliusmarminge 1,525 (34.2%), t3dotgg 497 (11.1%), maria-rcks 247 (5.5%), only21mil 246 (5.5%), Yash-Singh1 115, flamboh 93, saphid 92, shivamhwp 91, PixPMusic 69, ScottN-PV 49. The six exempt maintainers: 2,390 / 4,463 = 53.6%. Bots: 18. Bus factor is effectively one engineer (Julius Marminge) plus Theo, with a large external long tail.

### Governance and contribution stance

- No CLA: no "contributor license" text anywhere in the repo (grep over the clone); no CLA bot workflow in SRC/.github/workflows.
- SRC/CONTRIBUTING.md: "We are not actively seeking outside contributions and have limited review capacity. Opening a PR does not create an obligation to review or merge it." Features need "a prior discussion with explicit maintainer approval of the direction and scope"; "Focused bug fixes, reliability fixes, performance improvements, and maintenance work are the most likely to be accepted. Unsolicited features, opinionated rewrites, and unrelated cleanup are not." Feature requests go to Ideas discussions, not issues.
- SRC/README.md: "We are (mostly) not accepting contributions yet. Small fixes may be considered. Big features will not be."
- Automated agent triage of every PR from a contribution-triage skill loaded from trusted `main` (SRC/CONTRIBUTING.md "Triage and deeper review"; SRC/.github/triage), `vouch:*` labels from SRC/.github/VOUCHED.td (89 lines), `size:*` labels (SRC/.github/workflows/pr-size.yml, pr-vouch.yml), review handoff to Macroscope. Only TRIAGE_EXEMPTIONS logins bypass triage.
- Model policy in SRC/CONTRIBUTING.md "Models we do not accept": PRs are closed when the author states Gemini models or "Muse Wonder" wrote the code.
- Maintainers reply on issues through agents ("Grok responding on behalf of Julius", "Claude Opus 5.5 responding on behalf of Theo", <https://github.com/pingdotgg/t3code/issues/22031>).
- SRC/AGENTS.md: "Most T3 Code contributions will come from T3 Code itself, often controlled remotely"; claims "over 500,000 users"; maintainers are "Theo, Julius and the people building T3 Code".
- Security policy: SRC/.github/SECURITY.md.

## 3. Architecture from source

### Monorepo layout

pnpm workspace (SRC/pnpm-workspace.yaml: `apps/*`, `evals`, `infra/*`, `oxlint-plugin-t3code`, `packages/*`, `scripts`), `packageManager: pnpm@12.14.0`, root `engines.node: 26.12.1` (SRC/package.json), Vite+ (`vp`) task runner, `@tsc-rs/typescript` drop-in for typecheck (SRC/AGENTS.md "Verifying").

- `apps/server` - npm package `t3` 0.1.6, the environment server and CLI (`t3 serve`, `t3 up`, `t3 connect`, `t3 pair`); `engines.node "^22.16 || ^23.11 || >=24.10"` (SRC/apps/server/package.json).
- `apps/web` - React 19.3 SPA (TanStack Router, Tiptap composer, zustand, `@effect/atom-react`), served locally by `t3` and hosted at app.t3.codes (SRC/apps/web/package.json).
- `apps/desktop` - Electron 44.10.0 shell bundling the server (SRC/apps/desktop/package.json).
- `apps/mobile` - Expo 58 / React Native 0.88 iOS + Android app (SRC/apps/mobile/package.json).
- `apps/marketing` - Astro site.
- `infra/relay` - T3 Connect relay on Cloudflare Workers + Durable Objects, deployed with Alchemy (SRC/infra/relay/alchemy.run.ts); `infra/task-cache`.
- `native/` - `libghostty-vt` (terminal emulator, compiled to WASM for web), `resource-monitor` (Rust), `browser-secret`, `hyprland-snap-shot`, `kde-snap-shot`.
- `packages/` (29): `contracts`, `client-runtime`, `shared`, `effect-acp`, `effect-codex-app-server`, `provider-core`, `provider-acp`, `provider-acp-registry`, `provider-cursor`, `provider-fx`, `provider-grok`, `provider-muse`, `provider-opencode`, `provider-pi`, `provider-testing`, `secret-provider-core`, `secret-provider-definitions`, `secret-provider-onepassword`, `source-control-core`, `source-control-definitions`, `source-control-azure-devops`, `source-control-bitbucket`, `source-control-forgejo`, `source-control-gitcafe`, `source-control-github`, `source-control-gitlab`, `source-control-testing`, `ssh`, `tailscale`.
- `evals/` - model-behaviour evals for agent instructions and MCP tool text (SRC/evals/README.md).

### Tech stack

- **Effect 4.0.5** everywhere (catalog in SRC/pnpm-workspace.yaml: `effect`, `@effect/platform-node`, `@effect/sql-sqlite-do`, `@effect/sql-pg`, `@effect/vitest`, `@effect/atom-react` all 4.0.5). Services, layers, RPC, Schema and SQL all come from `effect/*`.
- **Node** runtime, not Bun (server `engines.node`; SQLite via `node:sqlite`, SRC/packages/shared/src/nodeSqliteClient.ts line 1).
- **React 19.3** (web, mobile), **Electron 44** (desktop), **Expo/React Native** (mobile).
- Cloud identity: Clerk (`@clerk/*` in web, desktop, mobile; SRC/docs/internals/t3-connect.md "T3 Connect uses Clerk for cloud identity").
- Telemetry: server sends product events to `ingest.t3.codes`, forwarded to PostHog; relay traces to Axiom (SRC/docs/user/telemetry.md; SRC/apps/server/src/telemetry/AnalyticsService.ts).

### Server-client transport

- WebSocket carrying **Effect RPC** with JSON serialization: `RpcServer.makeProtocolWithHttpEffectWebsocket`, `RpcServer.make(ServerWsRpcGroup, …)`, `RpcSerialization.layerJson` in SRC/apps/server/src/ws.ts (lines ~109, 619-620, 3381-3410).
- RPC schema: SRC/packages/contracts/src/rpc.ts (`Rpc.make` appears 209 times; built with `effect/rpc/Rpc`, `RpcGroup`, `RpcMiddleware`). SRC/docs/internals/overview.md: "The RPC contract is the boundary between independently versioned clients and servers."
- Per-method authorization separate from socket auth: SRC/apps/server/src/auth/RpcAuthorization.ts, SRC/packages/contracts/src/clientRpcPermissions.ts.
- Snapshot + sequence-cursor streaming: clients read a snapshot at `snapshotSequence` then stream events with greater `sequence` (SRC/docs/orchestration-v2/core-graph-and-data-model.md).
- HTTP also serves `/api`, `/oauth`, `/.well-known`, `/mcp` (SRC/AGENTS.md "Baking in origins"; SRC/apps/server/src/http.ts).

### Persistence

- SQLite file `statev2.sqlite` under the T3 home state dir (SRC/apps/server/src/config.ts line 148; default `~/.t3/userdata`, override `T3CODE_HOME` in SRC/apps/server/src/cli/app.ts line 195). WAL, `synchronous=NORMAL`, `busy_timeout 5000` (SRC/apps/server/src/persistence/Sqlite.ts).
- **Event sourced.** "The event log is the source of truth for orchestration state" (SRC/docs/internals/overview.md "Durable intent and side effects"). Table `orchestration_v2_events` (14 references under SRC/apps/server/src), plus `orchestration_v2_effect_outbox`, `orchestration_v2_projection_*`, `orchestration_v2_turn_item_positions`, `scheduled_tasks` (SRC/apps/server/src/persistence/Migrations/OrchestrationV2/*). 97 files in SRC/apps/server/src/persistence/Migrations.
- Pattern: SRC/apps/server/src/orchestration-v2/Orchestrator.ts serializes commands and decides events with no I/O; SRC/apps/server/src/orchestration-v2/EventSink.ts commits events, projections, command receipt and outbox effects in one transaction; SRC/apps/server/src/orchestration-v2/EffectWorker.ts runs side effects after commit (transactional outbox). Command receipts: SRC/apps/server/src/orchestration-v2/CommandReceiptStore.ts.
- Relay side: Cloudflare Durable Objects with SQLite storage for held webhooks (SRC/infra/relay/src/hooks/HookInboxObject.ts); relay DB config SRC/infra/relay/src/db.ts (catalog also pins `@alchemy.run/planetscale`, `@alchemy.run/drizzle`).
- Mobile local cache: `expo-sqlite`; web: `sql.js` dependency.

### Provider integration (exact paths)

Driver registry SRC/apps/server/src/provider/builtInDrivers.ts: `BUILT_IN_DRIVERS = [CodexDriver, ClaudeDriver, CursorDriver, GrokDriver, FxDriver, OpenCodeDriver, AntigravityDriver, PiDriver, MuseDriver, AcpRegistryDriver]`. Adapter boundary interface: SRC/packages/provider-core/src/server/ProviderAdapter.ts. Orchestration adapters: SRC/apps/server/src/orchestration-v2/Adapters/. Guide: SRC/docs/internals/adding-a-provider.md, SRC/docs/internals/providers.md.

| Provider | Transport | Paths |
|---|---|---|
| Codex | `codex app-server` subprocess, JSON-RPC (`"rpc.system": "jsonrpc"` in protocol.ts line 506); generated schema | SRC/packages/effect-codex-app-server/src/{protocol.ts,client.ts,rpc.ts,_generated/schema.gen.ts}; launch args `"app-server"` in SRC/apps/server/src/provider/codexLaunchArgs.ts; SRC/apps/server/src/provider/CodexProvider.ts; SRC/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts |
| Claude | `@anthropic-ai/claude-agent-sdk` ^0.3.276 (SRC/apps/server/package.json) | SRC/apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts, SRC/apps/server/src/provider/ClaudeProvider.ts, SRC/apps/server/src/provider/Drivers/ClaudeDriver.ts. Also reachable as `claude-agent-acp` via ACP (SRC/docs/user/providers-acp.md) |
| Cursor | `@cursor/sdk` 1.0.38 | SRC/packages/provider-cursor/src |
| OpenCode | `@opencode-ai/sdk/v2` HTTP client against `opencode serve`; 1.x one server per thread, 2.x one server per instance; per-thread `t3-code-<thread>` MCP entry | SRC/packages/provider-opencode/src/server/{adapter.ts,OpenCodeRuntime.ts,OpenCodeServerOwner.ts,v2/OpenCode2Server.ts,v2/adapter.ts} |
| Grok Build, fx, Antigravity | ACP via `effect-acp` | SRC/packages/provider-grok/src, SRC/packages/provider-fx/src, SRC/apps/server/src/orchestration-v2/Adapters/AntigravityAdapterV2.ts |
| Pi | user's `pi` in RPC mode (`@earendil-works/pi-coding-agent`) | SRC/packages/provider-pi/src/server/adapter.ts |
| Muse Code | `@muse-code/sdk` 1.4.6 | SRC/packages/provider-muse/src |
| Any ACP agent | ACP v2 preview with v1 fallback; installs from the official ACP Registry | SRC/packages/effect-acp/src/{protocol.ts,client.ts,agent.ts,_generated/schema.gen.ts,_generated/schema-v1.gen.ts}, SRC/packages/provider-acp/src, SRC/packages/provider-acp-registry/src, SRC/docs/user/providers-acp.md |
| Replay (dev) | free deterministic replay provider for dev | SRC/AGENTS.md "Verifying" |

Instances vs drivers: "A driver kind identifies an integration; an instance identifies one configuration and account lifecycle. Route work by instance" (SRC/docs/internals/providers.md). Multi-account per driver: SRC/apps/server/src/provider/ProviderInstanceRegistry.ts.

### Orchestration / domain model (exact type names)

Contract file SRC/packages/contracts/src/orchestrationV2.ts (4,321 lines); design doc SRC/docs/orchestration-v2/core-graph-and-data-model.md: graph `Project -> AppThread -> Run -> ExecutionNode tree`, plus ProviderThread handles, context transfers/handoffs, checkpoints.

- Project: `OrchestrationProjectShell` (SRC/packages/contracts/src/orchestrationProject.ts), `ProjectId`; server SRC/apps/server/src/orchestration-v2/ProjectStore.ts.
- Thread: `OrchestrationV2AppThread`, `OrchestrationV2AppThreadLineage`, `OrchestrationV2ThreadCapabilities`, `ThreadId`.
- Turn: `OrchestrationV2Run` (a counted user-visible turn; `RunId`, `ordinal`), `OrchestrationV2RunAttempt`, `OrchestrationV2RunStatus` = `preparing | queued | starting | running | waiting | completed | interrupted | failed | cancelled | rolled_back`; provider-native turn `OrchestrationV2ProviderTurn`.
- Work units: `OrchestrationV2ExecutionNode` (`NodeId`, `parentNodeId`, `countsForRun`), `OrchestrationV2RuntimeRequest` (approvals/user input).
- Session: `OrchestrationV2ProviderSession` (`ProviderSessionId`, live or resumable process), `OrchestrationV2ProviderThread` (provider-native conversation handle), `OrchestrationV2ProviderSessionDetached`.
- Checkpoint: `OrchestrationV2Checkpoint`, `OrchestrationV2CheckpointScope`, `OrchestrationV2CheckpointRollbackRequest`, `OrchestrationV2CheckpointFileSummary`, `OrchestrationV2CheckpointCapabilities`.
- Context movement: `OrchestrationV2ContextTransfer`, `OrchestrationV2ContextHandoff` (forks, provider switches, subagents).
- Events/commands: `OrchestrationV2DomainEvent` (union, line 1862), `OrchestrationV2StoredEvent = { sequence, commandId, event }` (line 2262), `OrchestrationV2Command` (union, line 2893), `isKnownOrchestrationV2EventType` (line 3845). 96 distinct `type` literals, e.g. `thread.create`, `thread.created`, `thread.fork`, `thread.settle`, `thread.auto-settle`, `thread.pull-request.link`, `thread.guest-share.open`, `run.created`, `run.interrupt`, `run.updated`, `node.updated`, `checkpoint.captured`, `checkpoint.rollback`, `provider.switch`, `provider-session.detached`, `project.updated`.
- Workspace strategy for a thread launch: `OrchestrationV2ThreadLaunchWorkspaceStrategy` = `root | existing_worktree | worktree{baseRef, branch?, startFromOrigin?}` (line 652).
- Glossary: SRC/AGENTS.md "A small glossary" and SRC/docs/internals/glossary.md (environment, project, thread, turn, provider, client, T3 home).
- Other server services of note in SRC/apps/server/src/orchestration-v2/: `RunExecutionService.ts`, `RunFinalizationService.ts`, `ProviderSessionManager.ts`, `ProviderSwitchService.ts`, `ThreadForkService.ts`, `ThreadSettlementService.ts`, `PullRequestSyncReactor.ts`, `PullRequestWatchReactor.ts`, `UsageLimitRecoveryWorker.ts`, `IdleCompactionService.ts`, `QueuedRunOrder.ts`.

### Git integration

- VCS driver abstraction: SRC/apps/server/src/vcs/{VcsDriver.ts,GitVcsDriver.ts,GitVcsDriverCore.ts,VcsDriverRegistry.ts}; `git worktree list --porcelain` (GitVcsDriverCore.ts line 1215), removal SRC/apps/server/src/vcs/worktreeRemoval.ts, worktree root SRC/apps/server/src/worktreesDirectory.ts. Git workflow (commit, push, PR): SRC/apps/server/src/git/{GitManager.ts,GitWorkflowService.ts,linkCreatedPullRequest.ts}.
- **Checkpoints via hidden git refs**: `CHECKPOINT_REFS_PREFIX = "refs/t3/orchestration-v2/checkpoints"` (SRC/apps/server/src/orchestration-v2/CheckpointService.ts line 26); SRC/apps/server/src/checkpointing/CheckpointStore.ts; "use hidden Git refs to capture workspace state without adding commits to the user's branch" (SRC/docs/internals/overview.md). Also `refs/t3/review-guide/<runId>/base` (SRC/apps/server/src/pullRequest/PullRequestReviewGuideService.ts line 215), `refs/t3code/pre-refresh`.
- PR creation per forge (SRC/packages/source-control-*): GitHub via REST `POST repos/{owner}/{name}/pulls` (SRC/packages/source-control-github/src/server/GitHubSourceControlProvider.ts lines 976-979) plus GraphQL for reviews/stacks; credentials from saved token, `GH_TOKEN`, or `gh auth` (`executable: "gh"`, line 194); GitLab via `glab`; Forgejo/Gitea via `fj` with `tea` fallback (SRC/packages/source-control-forgejo/src/server/ForgejoCli.ts); Azure DevOps via `az`; Bitbucket via API; GitCafe via `cafe`. User doc SRC/docs/user/source-control.md.
- PR lifecycle in domain: thread PR links, watch, sync, settlement (`thread.pull-request.*` events; SRC/apps/server/src/orchestration-v2/ThreadPullRequestService.ts; SRC/packages/contracts/src/threadPullRequest.ts). Merges outside T3 (`gh pr merge` by an agent) detected by re-reading links after runs (`changeRequestCloseCommand` per forge definition).

### Diff rendering and review

- Server diffs: SRC/apps/server/src/checkpointing/{Diffs.ts,CheckpointDiffQuery.ts} (npm `diff` 8.0.3); turn diff shows only the turn's own changes (SRC/docs/user/source-control.md "Review turn changes").
- Web: `@pierre/diffs` with a worker pool (SRC/apps/web/src/components/DiffPanel.tsx, SRC/apps/web/src/components/DiffWorkerPoolProvider.tsx); mobile native module `@t3tools/mobile-review-diff-native`.
- Review contracts: SRC/packages/contracts/src/review.ts (`ReviewDiffPreviewInput`, `ReviewBranchCommitsInput`, `ReviewDiffPreviewSource`), SRC/packages/contracts/src/pullRequestReviewGuide.ts; service SRC/apps/server/src/review/ReviewService.ts, SRC/apps/server/src/pullRequest/PullRequestReviewGuideService.ts. Human review of forge PRs (reply, resolve threads, reactions) via GraphQL mutations in SRC/packages/source-control-github/src/server/pullRequestMutations.graphql.

### Terminal

- Server PTYs via `node-pty` ^1.2.0-beta.15: SRC/apps/server/src/terminal/{NodePtyAdapter.ts,Manager.ts,OutputProtocol.ts}; history capped at 5,000 lines / 8 MiB per terminal (SRC/docs/internals/terminal-runtime.md).
- Web renderer: libghostty-vt compiled to WASM (SRC/apps/web/src/terminal/ghostty/{runtime.ts,renderer.ts,surface.ts}, SRC/native/libghostty-vt). Mobile: `@t3tools/mobile-terminal-native`.

### Auth and remote mode

- Environment-issued scoped sessions; pairing links delegate scopes (`terminal:operate`, `orchestration:operate`, `access:write`); cookies, bearer and DPoP tokens (SRC/docs/internals/environment-auth.md; SRC/apps/server/src/auth/{EnvironmentAuth.ts,EnvironmentAuthPolicy.ts,PairingGrantStore.ts,SessionStore.ts,dpop.ts,RpcAuthorization.ts}).
- Remote paths: LAN, Tailscale (SRC/packages/tailscale), SSH environments (SRC/packages/ssh), and **T3 Connect** managed tunnels + Clerk identity via the relay (SRC/docs/internals/t3-connect.md, SRC/apps/server/src/cloud/*, SRC/infra/relay). "the relay Worker does not proxy their HTTP or WebSocket sessions" except automation webhooks.
- Guest links: read-only HMAC tokens for one thread (SRC/apps/server/src/guest/GuestShareService.ts).
- MCP OAuth for outside agents: SRC/apps/server/src/auth/McpOAuth.ts.
- Single-user per environment: an environment is "one running T3 server and the machine, filesystem, provider credentials, and state it owns" (SRC/AGENTS.md glossary). No per-user identity inside an environment (see section 5, #12278).

### Other notable subsystems

Scheduled tasks and webhooks (SRC/packages/contracts/src/scheduledTask.ts, SRC/apps/server/src/scheduledTasks), secrets with 1Password provider (SRC/packages/secret-provider-onepassword), managed policy (SRC/packages/contracts/src/managedPolicy.ts, SRC/docs/user/managed-policy.md), in-app preview browser via playwright-core, triage playbook (SRC/docs/user/triage.md), peer links between environments (SRC/packages/contracts/src/peerLink.ts).

## 4. Normative schemas and contracts

- **SRC/packages/contracts** (`@t3tools/contracts` 0.1.6, sole dependency `effect`): 106 files in `src/`, all Effect `Schema`. SRC/AGENTS.md: "Anything crossing the wire is typed in `packages/contracts`. Change the schema and the server, web, mobile, and desktop all follow."
  - Wire RPC: SRC/packages/contracts/src/rpc.ts
  - Orchestration domain/events/commands: SRC/packages/contracts/src/orchestrationV2.ts, SRC/packages/contracts/src/orchestrationV2IdTable.ts, SRC/packages/contracts/src/orchestrationDispatch.ts, SRC/packages/contracts/src/orchestrationProject.ts
  - Providers: SRC/packages/contracts/src/provider.ts, providerInstance.ts, providerRuntime.ts, providerPolicy.ts, providerUsageLimits.ts, acpRegistry.ts
  - MCP: SRC/packages/contracts/src/orchestratorMcp.ts, threadMetadataMcp.ts, mcpApps.ts
  - Git/PR/review: git.ts, sourceControl.ts, pullRequest.ts, threadPullRequest.ts, review.ts, checkpointDiff.ts
  - Auth/remote: auth.ts, relay.ts, relayClient.ts, remoteAccess.ts, guestShare.ts, environment.ts, environmentHttp.ts, clientRpcPermissions.ts
  - Project file: t3ProjectFile.ts
- Vendored generated protocol schemas: SRC/packages/effect-codex-app-server/src/_generated/schema.gen.ts (Codex app-server), SRC/packages/effect-acp/src/_generated/schema.gen.ts and schema-v1.gen.ts (ACP v2 preview and v1).
- Design specs: SRC/docs/orchestration-v2/ (core-graph-and-data-model.md, entity-ids-and-correlation.md, feature-lifecycles.md, orchestrator-mcp-server.md, provider-capability-system.md, provider-switching-and-context.md, thread-lineage-and-context-transfer.md, testing-strategy.md).
- Compatibility rule: "Persisted events must remain decodable on replay" (SRC/docs/internals/overview.md).

## 5. Load-bearing issues, PRs and ideas

Note: feature requests are redirected to Ideas discussions and closed as issues (SRC/CONTRIBUTING.md), so the issue tracker under-represents demand. Top open issue by reactions is #15644.

1. #15644 (open issue, 36 reactions, top open issue) "Manage Cursor, Codex, and Claude cloud sessions from inside T3": start/list/steer/stop hosted provider cloud sessions with the T3 thread as control plane. <https://github.com/pingdotgg/t3code/issues/15644>
2. #12278 (closed not_planned) "RFC: OIDC-backed multi-user self-hosted environments": Julius closed it "as out of contribution scope for a large platform RFC … we are not looking for an implementation PR". <https://github.com/pingdotgg/t3code/issues/12278>; continued as Ideas #12283 "Multi-user self-hosted environments with isolated execution" (12 upvotes) <https://github.com/pingdotgg/t3code/discussions/12283>; newer Ideas #27974 "A small team in one environment: each person signs in as themselves" <https://github.com/pingdotgg/t3code/discussions/27974> and #27708 "Share threads with multiple people for team working sessions" (5 upvotes) <https://github.com/pingdotgg/t3code/discussions/27708>.
3. #15350 (open PR by t3dotgg) "feat: threads can run in Docker sandboxes with their own ports and services". <https://github.com/pingdotgg/t3code/pull/15350>
4. #14793 (closed issue) / Ideas #18019 (11 upvotes) "On-demand cloud task environments through an external sandbox broker"; a commenter calls it "the feature currently holding T3 Code back" vs Amp Orbs. <https://github.com/pingdotgg/t3code/issues/14793>, <https://github.com/pingdotgg/t3code/discussions/18019>
5. #26535 (closed) "RFC: K3s-backed linked environments via external provisioner (no new scheduler)". <https://github.com/pingdotgg/t3code/issues/26535>
6. Ideas #13073 (12 upvotes) "Show token usage and estimated cost per thread"; PR #9136 "feat(web): show thread API cost in composer" closed unmerged. <https://github.com/pingdotgg/t3code/discussions/13073>, <https://github.com/pingdotgg/t3code/pull/9136>
7. Ideas #15042 "Generic HTTP `usageLimitSources` kind for gateway / proxy spending budgets". <https://github.com/pingdotgg/t3code/discussions/15042>; related open issue #11873 Codex -32600 warnings for custom proxy providers <https://github.com/pingdotgg/t3code/issues/11873>; #25414 usage ignores LiteLLM long-context price tiers <https://github.com/pingdotgg/t3code/issues/25414>.
8. Issue trackers (none on `main`): open PRs #19259 "feat(issues): add issue tracking core with GitHub issues" <https://github.com/pingdotgg/t3code/pull/19259>, #19261 GitLab/Azure DevOps/Forgejo issue trackers (marked blocked) <https://github.com/pingdotgg/t3code/pull/19261>, #19274 Linear standalone tracker <https://github.com/pingdotgg/t3code/pull/19274>, #18456 Jira tracking <https://github.com/pingdotgg/t3code/pull/18456>, #23055 Jira and JSON watchers <https://github.com/pingdotgg/t3code/pull/23055>; #19406 Jira Cloud closed <https://github.com/pingdotgg/t3code/pull/19406>.
9. #14693 (open PR, 23 reactions, 45 comments) "feat(provider-kiro): add Kiro as an ACP provider". <https://github.com/pingdotgg/t3code/pull/14693>
10. #22031 (closed not_planned) "Support remote/cloud assistants as MCP clients": `/mcp` only reachable locally for cloud assistants; redirected to Ideas. <https://github.com/pingdotgg/t3code/issues/22031>
11. #4123 (open, reopened, 21 reactions) telemetry enabled by default contradicting an earlier "No telemetry unless you opt in" promise. <https://github.com/pingdotgg/t3code/issues/4123>
12. #11458 (open, 20 reactions) OpenCode Auto mode ignores user permission patterns. <https://github.com/pingdotgg/t3code/issues/11458>
13. #3736 (open) remote pairing cannot complete behind Cloudflare Access OAuth (the "gateway ask" referenced when #12278 was closed). <https://github.com/pingdotgg/t3code/issues/3736>
14. #16183 (open) scheduled tasks always branch from `main`. <https://github.com/pingdotgg/t3code/issues/16183>
15. Review: #915 "/review slash command" closed completed <https://github.com/pingdotgg/t3code/issues/915>; #345 "MCP Server for external agent access to T3 Code reviews" closed not_planned <https://github.com/pingdotgg/t3code/issues/345>; Ideas #21256 "Agent teams … (lead, builders, reviewer) across providers" <https://github.com/pingdotgg/t3code/discussions/21256>.
16. Historic: #6 "feat: Cloud Agents" (by juliusmarminge, closed completed, reframed as "Remote Agents") <https://github.com/pingdotgg/t3code/issues/6>; #4911 headless Docker image PR closed <https://github.com/pingdotgg/t3code/pull/4911>.

## 6. Dependents and forks of note

Source: `search/repositories?q=t3code`, `repos/pingdotgg/t3code/forks?sort=stargazers`.

- maria-rcks/t1code (541 stars) "T3Code, but in your terminal" <https://github.com/maria-rcks/t1code> (by a maintainer)
- opencoredev/akeru-bot (114, fork) "Open-source Grok Bot alternative for named AI teammates … Independent fork of T3 Code" <https://github.com/opencoredev/akeru-bot>
- erfnzdeh/t3code-atlas (83) architecture map <https://github.com/erfnzdeh/t3code-atlas>
- zortos293/t3code-copilot (58) GitHub Copilot fork <https://github.com/zortos293/t3code-copilot>
- maria-rcks/t3libre (44, fork) "T3 Code, liberated" <https://github.com/maria-rcks/t3libre>
- maddada/VSmux (35) IDE session manager <https://github.com/maddada/VSmux>
- what1f/t3kanban (29, fork) "Task-first workspace for parallel coding agents" <https://github.com/what1f/t3kanban>
- dizys/t3code-docker (15) Docker recipe <https://github.com/dizys/t3code-docker>
- UsefulSoftwareCo/openbot (13, fork) <https://github.com/UsefulSoftwareCo/openbot>
- ZhiweiXiao98/t3code, zds-xiaoxin/xiaoxin-t3code: Chinese community forks.
- Packaging: AUR (SRC/packaging/aur), nixpkgs `t3code`, Homebrew cask `t3-code`, winget `T3Tools.T3Code`, scoop (SRC/README.md).
- GitHub "dependents" graph not checked (no API); npm `t3` 114,912 downloads/month.

## 7. Cost, token and budget accounting

**Present: token usage and estimated cost reporting. Absent: any spend budget or cap enforcement.**

- Per-turn tokens in the domain: `OrchestrationV2ProviderTurnTokenUsage { usedTokens, maxTokens, inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens, promptCacheTtlMs, autoCompactThreshold, promptCacheExpiresAt, updatedAt }` (SRC/packages/contracts/src/orchestrationV2.ts lines 217-228), attached as `tokenUsage` (line 1183). Producers: SRC/apps/server/src/provider/ClaudeTurnTokenUsage.ts, SRC/apps/server/src/provider/CodexTurnTokenUsage.ts.
- Usage page (estimated API-equivalent cost, not billed): SRC/apps/server/src/usage/{UsageService.ts,usagePricing.ts,usageAggregation.ts,usageTranscriptReader.ts,usageScanCache.ts,CodexUsageHistory.ts}. It scans provider transcripts on disk (Codex, Claude Code, Grok, OpenCode SQLite, Antigravity, Pi, Muse; Cursor from its dashboard API) after the fact (SRC/docs/user/usage.md: "These estimates are not your subscription bill").
- Price source: LiteLLM's `model_prices_and_context_window.json` fetched from `https://raw.githubusercontent.com/BerriAI/litellm/main/...` (SRC/apps/server/src/usage/UsageService.ts lines 61-63); `ModelRate` with fast/ultrafast tiers (SRC/apps/server/src/usage/usagePricing.ts); user price overrides per environment (`UsageModelPriceOverride`, SRC/docs/user/usage.md "Set custom model prices").
- Provider-reported cost: Claude `costUSD` read into `reportedCostUsd` (SRC/apps/server/src/provider/Drivers/claudeUsage.ts lines 58-73); Codex and Antigravity readers set `reportedCostUsd: null`.
- Subscription limit windows: `ServerProviderUsageWindow { kind: session|weekly|monthly|other, usedPercent, resetsAt }`, `ServerProviderResetCredits` (SRC/packages/contracts/src/providerUsageLimits.ts); probes SRC/apps/server/src/provider/{claudeUsageLimits.ts,codexUsageLimits.ts,antigravityUsageLimits.ts}; auto-resume after a limit stop SRC/apps/server/src/orchestration-v2/UsageLimitRecoveryWorker.ts; Claude Enterprise spending budgets are displayed on the Limits view (PR #14911 <https://github.com/pingdotgg/t3code/pull/14911>, issue #10155 <https://github.com/pingdotgg/t3code/issues/10155>).
- Telemetry carries token counts per turn to PostHog (SRC/docs/user/telemetry.md).
- "budget" hits in first-party code are byte, context or stream budgets, not money: SRC/apps/server/src/orchestration-v2/LiveStreamBudget.ts, ContextHandoffBudget (SRC/apps/server/src/orchestration-v2/ContextHandoffService.ts), SRC/apps/server/src/provider/agentContextBudget.json, SRC/.github/workflows/agent-context-budget.yml.
- Confirmed absent: grep for `maxBudgetUsd|max_budget_usd|spend(ing)? ?limit|costLimit|budgetUsd|maxCost` over `apps/` and `packages/` (`*.ts`, non-test) returned nothing. No pre-run budget, no per-thread or per-project cap, no cost attribution to a person or team. The Claude Agent SDK's budget option is not used.
- AGENTS.md acknowledges cost for contributors only: "Real agent turns cost money … use the free `Replay (dev)` provider" (SRC/AGENTS.md "Verifying").

## 8. Term verdicts

| Term | Verdict | Evidence |
|---|---|---|
| Forgejo | **Supported** (source control: clone, publish, PRs, checks) | SRC/packages/source-control-forgejo/src/server/{ForgejoCli.ts,ForgejoPullRequestProvider.ts,ForgejoSourceControlProvider.ts,forgejoRequiredChecks.ts}; SRC/docs/user/source-control.md "Forgejo and Gitea"; PR #11436 <https://github.com/pingdotgg/t3code/pull/11436>. Issue tracker for Forgejo only in open PR #19261 |
| Gitea | **Supported** via the same integration with `tea` fallback | SRC/packages/source-control-forgejo/src/server/ForgejoCli.ts; SRC/packages/source-control-definitions/src/registry.ts; open bug #23551 <https://github.com/pingdotgg/t3code/issues/23551> |
| GitLab | **Supported** via `glab`, incl. self-hosted | SRC/packages/source-control-gitlab/src/server/GitLabCli.ts; open bugs #26606, #16463 |
| Kubernetes | **Absent** from first-party code (only `kubernetes-types` in third-party licence config and vendored `.repos/alchemy-effect`) | RFC #26535 (K3s via external provisioner, closed) <https://github.com/pingdotgg/t3code/issues/26535>; Ideas #26283 <https://github.com/pingdotgg/t3code/discussions/26283>. No Helm chart, no k8s manifests. Docker only via open PR #15350 and community dizys/t3code-docker |
| LiteLLM | **Price table only**, not as a gateway | SRC/apps/server/src/usage/UsageService.ts lines 61-63, SRC/apps/server/src/usage/usagePricing.ts; historic bug #1225 "Doesn't work with Claude models via LiteLLM" <https://github.com/pingdotgg/t3code/issues/1225>; 77 issues mention it |
| OpenCode | **Supported provider** (1.x and 2.x) | SRC/packages/provider-opencode; SRC/docs/user/providers-opencode.md |
| ACP (Agent Client Protocol) | **Supported, first-class**: own Effect ACP implementation, ACP v2 preview + v1, ACP Registry install, and an MCP-over-ACP stdio bridge | SRC/packages/effect-acp, SRC/packages/provider-acp, SRC/packages/provider-acp-registry, SRC/apps/server/src/mcp/AcpMcpStdioBridge.ts, SRC/docs/user/providers-acp.md; T3 is an ACP *client*, not an ACP agent |
| MCP | **Supported both ways**: T3 serves an MCP endpoint at `/mcp` (orchestrator tools: create/drive threads, delegated sub-agents, PR linking) with OAuth; and injects a per-thread MCP bridge into provider agents; renders MCP Apps | SRC/apps/server/src/mcp/{McpHttpServer.ts,OrchestratorMcpService.ts,WorktreeMcpService.ts,ThreadMetadataMcpService.ts}, SRC/apps/server/src/auth/McpOAuth.ts, SRC/docs/orchestration-v2/orchestrator-mcp-server.md, SRC/docs/user/outside-agents.md, SRC/packages/contracts/src/mcpApps.ts |
| A2A | **Absent** (only in vendored `.repos/alchemy-effect` GCP bindings); 0 issues match | search `repo:pingdotgg/t3code A2A` = 0 |
| Linear | **Absent on `main`** (word hits are "linear time" etc.) | Open PR #19274 <https://github.com/pingdotgg/t3code/pull/19274>; Ideas #6752, #21613, #18961 |
| Jira | **Absent on `main`** (Atlassian appears only as Bitbucket credentials in SRC/packages/source-control-bitbucket/src/shared/definition.ts) | Open PRs #18456, #23055; #16992 shows Jira used through MCP Apps <https://github.com/pingdotgg/t3code/issues/16992> |
| Multi-user / tenancy | **Absent**: one environment = one owner; RFC closed not_planned | #12278, Ideas #12283, #27974 |

## Not verified

- Contributor affiliations beyond GitHub profile text and the TRIAGE_EXEMPTIONS list (no LinkedIn or company page checked); `maria-rcks` and `Yash-Singh1` employment status unknown.
- The contributors API total (8,653) undercounts relative to the 4,463 commits in the last 30 days; all-time shares are indicative, the 30-day sample is exact for its window.
- GitHub dependents graph; Ideas discussions sorted by upvotes overall (only keyword searches were run).
- Behaviour was read from source and docs, not executed.
