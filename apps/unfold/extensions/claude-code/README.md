# Unfold plugin for Claude Code and other agents

This plugin reports your own Claude Code sessions to Unfold and links each one to the Work Items it works on. For every commit it records which lines the agent wrote, as an [Agent Trace](https://agent-trace.dev/) 0.1 record. To install and use it, see [Link your Claude Code sessions to Work Items](../../../../docs/how-to/link-claude-code-sessions.md). The decision behind it is [ADR 0047](../../docs/adrs/0047-people-link-their-own-agent-sessions-through-a-plugin-agent-trace-and-telemetry-never-a-claude-sign-in.md).

The same directory is also an [Agent Plugin](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md) (specification 1.0.0), so Codex, GitHub Copilot CLI, VS Code, Cursor and Kiro install it too: [Install the Unfold plugin in Codex, Cursor, Copilot and VS Code](../../../../docs/how-to/install-the-unfold-plugin.md). There it brings the skills only: `unfold` (how to use Unfold's MCP tools), `link-work-item`, and `brief`, whose scripts need Claude Code. Session reporting and Agent Trace need the hooks, and only Claude Code runs them.

## What each client reads

| Client | Manifest it reads | What it loads from this plugin |
| --- | --- | --- |
| Claude Code | `.claude-plugin/plugin.json` ([manifest reference](https://code.claude.com/docs/en/plugins-reference)) | `hooks/hooks.json`, `skills/`, `commands/`, and the `unfold-channel` MCP server it declares |
| Codex | `plugin.json`. A root manifest with the Agent Plugins 1.0.0 `$schema` wins over `.codex-plugin/`, `.claude-plugin/` and `.cursor-plugin/plugin.json` | `skills/`. It would read `mcp.json`, which does not ship |
| GitHub Copilot CLI | `plugin.json`. A root manifest with the Agent Plugins `$schema` takes precedence over `.claude-plugin/plugin.json` ([plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)) | `skills/`. It would read `mcp.json` and `com.github.copilot/`, and neither ships |
| VS Code 1.144 | `plugin.json`. VS Code checks for the Agent Plugins format before the Claude format ([authoring reference](https://code.visualstudio.com/docs/agents/reference/agent-plugin-reference)) | `skills/` for its Copilot and Codex harnesses, remote MCP servers only for its Claude harness. It would read `mcp.json` and `com.github.copilot/`, and neither ships |
| Cursor, Kiro | `plugin.json` | `skills/`, from a copied or imported folder |

Codex, Copilot CLI, VS Code and Claude Code read the marketplace at [`/.claude-plugin/marketplace.json`](../../../../.claude-plugin/marketplace.json). Copilot CLI and VS Code look for `marketplace.json`, `.plugin/marketplace.json` and `.github/plugin/marketplace.json` first, and Codex looks for `.agents/plugins/marketplace.json` first, so the repository has none of those. Its entry is a path inside this repository, so it follows the branch you added; a pinned entry lives in an installation's own marketplace ([below](#mcp-servers)). Keep `version` equal in `plugin.json` and `.claude-plugin/plugin.json`; the tests check it.

### Why the hooks stay in `hooks/hooks.json`

Agent Plugins 1.0.0 standardizes skills and MCP servers only. Anything client-specific belongs in a top-level folder named after the client's reverse-domain namespace. Claude Code defines no such namespace and reads plugin hooks from `hooks/hooks.json`, so they stay there. Agent Plugins clients don't read that path: Copilot CLI and VS Code take hooks from `com.github.copilot/hooks/hooks.json` only. That is on purpose. The hook script reads Claude Code's hook payloads, so it has nothing to work with in another client.

Not checked: VS Code's Claude agent passes plugins on to the Claude Agent SDK, which reads `.claude-plugin/plugin.json`. VS Code's architecture notes say an Agent Plugins package is not passed on that way, so in VS Code's Claude agent sessions the hooks may not run.

## Install in other clients

See [Install the Unfold plugin in Codex, Cursor, Copilot and VS Code](../../../../docs/how-to/install-the-unfold-plugin.md), with an install link for VS Code.

## MCP servers

`.claude-plugin/plugin.json` declares one local server, `unfold-channel` (`channel/unfold-channel.mjs`), and binds a [channel](https://code.claude.com/docs/en/channels-reference) to it. It is a one-way channel: it declares the `claude/channel` capability and no tools, and pushes `notifications/claude/channel` with `meta` `kind` and `sender`. It pushes nothing unless `UNFOLD_CHANNEL=1`, and then only while the hooks last saw the session stop. Independently, unless `UNFOLD_CONVERSATION=0`, it relays the session's conversation: it holds `POST /api/linked-sessions/<id>/conversation/wants` open, and for each read the owner's browser makes it reads the transcript the hooks recorded (`transcriptPath` in `sessions/<id>.json`) with `scripts/conversation.mjs` and posts the entries to `…/conversation/answers/<want>`. Entries are prompts and text replies with secrets masked, and one `permissionSummary` line per tool call; never tool results, thinking or subagent turns ([how-to](../../../../docs/how-to/link-claude-code-sessions.md#6-read-the-conversation-in-unfold)). It finds its session through `processes/<its parent pid>.json`, which the `SessionStart` hook writes, because Claude Code gives an MCP server no session id. It answers `initialize` with protocol revision 2025-11-25 or older, because Claude Code does not register a channel that negotiates 2026-07-28. How to turn it on is in the [how-to](../../../../docs/how-to/link-claude-code-sessions.md#when-the-session-is-idle-the-unfold-channel).

The plugin ships no `mcp.json` and no `.mcp.json`, and no remote server, because it works with any Unfold installation. Agent Plugins 1.0.0 forbids placeholder and environment-variable expansion in a remote server's `url` and `headers`, and it has no field for an OAuth client id ([agent-plugins-spec #7](https://github.com/agentplugins/agent-plugins-spec/issues/7), open). A shipped definition would therefore name one Unfold installation and still lack its client id.

An installation's own marketplace adds the server instead. [`scripts/agent-plugin-marketplace.mjs`](../../scripts/agent-plugin-marketplace.mjs) takes the installation's `UNFOLD_MCP_RESOURCE` (or `--mcp-url`) and a 40-character commit, and writes a marketplace with two entries: this plugin as a `git-subdir` source pinned by `sha`, and a generated `unfold-mcp` Agent Plugin whose `mcp.json` names that URL as a `streamable-http` server. The file holds no headers and no credential; the client signs in through the browser. `ploeg-mcp` stays out: people reach Ploeg through Unfold, and it has the same client id gap. `test/agent-plugin.test.ts` validates both manifests and the `mcp.json` against the vendored [schemas](schemas/agent-plugins/1.0.0/), and checks that the URL is the configured one and carries no secret.

Without such a marketplace, add the server yourself:

* **VS Code:** the [Unfold extension](../vscode/README.md) provides the Ploeg MCP server from the workbench it is connected to.
* **Claude Code:** `claude mcp add --scope user --transport http --client-id unfold-mcp unfold https://<your Unfold>/mcp`, as in [Serve unfold-mcp over HTTPS](../../../../docs/how-to/serve-unfold-mcp-over-https.md). Claude Code reads `.mcp.json`, not the Agent Plugins `mcp.json`, so the generated `unfold-mcp` plugin gives it nothing.
* **Other clients:** [Install the Unfold plugin](../../../../docs/how-to/install-the-unfold-plugin.md) lists each client's own setting.

When the specification allows configuration per installation, this plugin can ship its MCP servers itself.

## What each hook does

| Hook | Sends to `POST /api/linked-sessions/events` | Also |
| --- | --- | --- |
| `SessionStart` | `start`, with the repository, branch, model and Claude Code version, and `remoteApproval`: whether `UNFOLD_REMOTE_APPROVAL=1` | Records which session the Claude Code process runs in `${CLAUDE_PLUGIN_DATA}/processes/<pid>.json`, for the channel. Gives the session its Unfold page, its session id and the `Unfold-Session:` trailer as `additionalContext`. Sets `sessionTitle` from the first Work Item when the session has no title |
| `UserPromptSubmit` | `prompt`, never the prompt itself. When the prompt names a tracker task such as `VIK-2051`, an Unfold `#work/<id>` link or "Work Item 184", it adds only those ids as `mentions` | Collects the session's waiting Unfold messages from `POST /api/linked-sessions/<id>/inbox` and adds them as `additionalContext` |
| `Notification` | `waiting`, for `permission_prompt`, `idle_prompt`, `elicitation_dialog` and `agent_needs_input` only | |
| `PermissionRequest` (only with `UNFOLD_REMOTE_APPROVAL=1`) | `waiting` with `permission_prompt`, then the tool name and a redacted one-line summary to `POST /api/linked-sessions/<id>/permissions`, never the tool input | Waits up to `UNFOLD_REMOTE_APPROVAL_WAIT_S` (default 120) for the owner to answer in Unfold, asking `…/collect` every `UNFOLD_REMOTE_APPROVAL_POLL_MS` (default 2000), and prints the `allow` or `deny` decision. Claude Code shows its own prompt meanwhile and the first answer applies. Stops and withdraws the prompt when the transcript shows it was answered in the terminal, when Claude Code stops the hook, or when the wait ends. Its 310-second timeout only outlasts the longest wait. It never writes the session's state file, so a long wait cannot overwrite what other hooks recorded. See [Approve a tool from Unfold](../../../../docs/how-to/link-claude-code-sessions.md#approve-a-tool-from-unfold) |
| `PostToolUse` on `Write`, `Edit`, `MultiEdit` and `NotebookEdit` | Nothing | Remembers fingerprints of the lines written, per file and per repository, and which agent wrote each: `main`, or the subagent's `agent_type`. They are kept in `${CLAUDE_PLUGIN_DATA}/sessions/<id>.json`. The repository is the one the file is in, so a subagent working in its own git worktree is followed too |
| `PostToolUse` on `Bash` | `commit` for each new commit since the last one it saw, with the task and Work Item ids its message names as `mentions`, in every repository and worktree the session edited. Also any pull request address that a `pr create` command printed | Builds the commit's Agent Trace record, writes it to `refs/notes/agent-trace` and sends it to `POST /api/linked-sessions/<id>/traces`. At most every 30 seconds, collects waiting messages as `additionalContext`. With `UNFOLD_PUSH_AGENT_TRACE=1`, after a `git push` also pushes `refs/notes/agent-trace` to the same remote ([below](#push-the-notes-with-the-branch)). Records the command in the evidence ledger when it proves something |
| `PostToolUseFailure` on `Bash` | Nothing | Records the failed or interrupted command in the evidence ledger ([below](#the-evidence-ledger)) |
| `Stop` | Any new commits, then `idle`. Also the name the person gave with `/rename` as `title`, and pull requests Claude Code recorded in the transcript (`pr-link`) that were not sent before | Claude Code's own summary title (`ai-title`) is sent only with `UNFOLD_SHARE_TRANSCRIPT=1`. Collects messages people sent. When there are any, answers `decision: block` with them as `reason`, so the session continues. Notices wait for the next prompt |
| `SessionEnd` | Any new commits, then `end` | |

## Commands

| Command | What it does |
| --- | --- |
| `/unfold:start <work item>` | Starts the Run of a Work Item that waits for your own Claude Code (Ploeg ADR-0112). From a clone of the Work Item's repository, [`scripts/unfold-start.mjs`](scripts/unfold-start.mjs) claims the Run through `POST /api/ploeg/work-items/<id>/claim` with the id of the session that runs the command (`CLAUDE_CODE_SESSION_ID`), so Unfold links that session and never warns that it collides with the Run it started, dispatches it with `claude -p <prompt> --environment <id> --ref <ref> --output-format json` under your own login, and records the printed session through `POST /api/ploeg/work-items/<id>/claude-session`. It claims nothing outside a clone of the repository. Set `UNFOLD_CLAUDE_BIN` to use another `claude`, and `UNFOLD_DISPATCH_TIMEOUT_MS` (default 180000) to wait longer for the dispatch |
| `/unfold:takeover <work item>` | Picks up a Work Item you took control of in Unfold (Ploeg ADR-0142), once Ploeg parked it for you. From a clone of its repository, [`scripts/unfold-takeover.mjs`](scripts/unfold-takeover.mjs) reads `GET /api/ploeg/work-items/<id>/take-over`, fetches the branch Ploeg pushed the agent's work to, and checks it out with `git worktree add` under `.claude/worktrees/unfold-<id>` (reusing it when it exists, and your local branch when you have one). It prints the command that starts `claude` there with `UNFOLD_WORK_ITEM=<id>` and a brief of the yield commit, the marked work in progress commit and the latest Run's summary, quoted as data; run it in a new terminal. Run from a terminal yourself (`node scripts/unfold-takeover.mjs takeover <id>`), it starts `claude` directly; `UNFOLD_TAKEOVER_LAUNCH=print` or `exec` forces either. It checks nothing out before the Run stopped or outside a clone of the repository |
| `/unfold:handback <work item> [note]` | Hands it back. Refuses while the worktree (or the checkout you run it in, when it is on the Work Item's branch) has uncommitted changes, or commits that are not on `origin/<branch>` after a fetch, and says what to commit or push. Otherwise calls `POST /api/ploeg/work-items/<id>/hand-back` with your note, and Ploeg resumes the Round that stopped on the same branch from its head on the forge. Sends only the note |
| `/unfold:handoff [work item] [--team <team> [--target <repository>]]` | Hands the work of the session you are in to Ploeg, with its code and findings, in two steps ([below](#hand-a-session-to-a-team)). `preview` sends nothing: it shows the Team, what the Runs may spend, the branch it would push, the counts, the findings and `git diff HEAD` with new files, cut at 100 KB. `send <code>` runs once the person confirms that preview |
| `/unfold:brief [pull request or work item]` | Writes a Delivery Brief ([ADR 0057](../../docs/adrs/0057-a-delivery-brief-is-one-evidence-backed-record-rendered-per-audience.md)): one record of what changed, why, how it was checked, how to roll it out and back, with every claim marked `verified`, `unverified`, `stale` or `failed` against the evidence ledger. [`brief/render-brief.mjs`](brief/render-brief.mjs) validates it against [`brief/brief.schema.json`](brief/brief.schema.json) and renders one page in the Unfold brand with a fold for the reviewer, the operator and the Client. The skill publishes it as a claude.ai Artifact and adds its link to the Work Item |

## Hand a session to a Team

`/unfold:handoff` is for work you started in your own Claude Code and want a Ploeg Team to finish, like Devin's [Handoff plugin](https://github.com/club-cog/devin-handoff). `/unfold:handback` is the other case: it returns a Work Item you took over from Ploeg, with only a note. A hand-off from a session travels as repository changes and structured evidence, never as a diff blob:

* **The code** goes to the forge as the branch `unfold/handoff-<first 12 characters of the commit>`. [`scripts/unfold-handoff.mjs`](scripts/unfold-handoff.mjs) copies your index to a temporary one, adds every change and every new file `.gitignore` does not exclude, and writes one commit, `wip: work in progress handed to Ploeg`, on top of `HEAD`. Your branch, index and working tree stay as they are. With nothing uncommitted, the branch is `HEAD` itself; with no change against the base branch, nothing is pushed.
* **The findings** are JSON the session writes, `{title, tried, hypotheses, left}`, each at most 8 lines of 300 characters. Unfold masks credentials in them and puts them in the note Ploeg's Runs read, below a line that calls them untrusted reference material, not instructions.
* **The counts**: commits of yours and files changed against the base branch, insertions, deletions and new files.

Where it goes:

* With a Work Item this session is linked to (named, or the one Ploeg can take now), `send` calls `POST /api/linked-sessions/<session>/work-items/<id>/handoff` with `{commandId, context}`. Unfold requeues it from Round 1 with a note of at most 4,096 characters; findings that do not fit are left out, and the note says so. The preview names the Work Item's Team and the last attempt's budget, as "up to US$5.00 like the last attempt".
* With `--team`, `send` calls `POST /api/linked-sessions/<session>/work-items` and Ploeg admits a new Work Item in the session's repository (or `--target`), with the findings' `title` and the note in its brief. The preview says Unfold does not know the cap before Ploeg admits it.

Safeguards:

* **Secrets.** Before it shows anything, the preview scans every line the push would add against the base branch, and the findings. It runs `gitleaks stdin` when gitleaks is on `PATH` (or `UNFOLD_GITLEAKS_BIN`), with the repository's `.gitleaks.toml` when there is one: the scanner the repository's guard-secrets hook uses. It also runs its own check for private keys, provider and forge tokens, Unfold credentials, JWTs, passwords in URLs and quoted secret assignments. Any hit refuses the hand-off and names the rule and file, never the value. Nothing is pushed or sent.
* **Confirmation.** The command has no `allowed-tools`, so Claude Code asks before it runs either step unless you allowed it. The session must ask you, naming the Team and the spend line, before it runs `send`. `send` refuses a preview older than 15 minutes, one from another checkout, and a checkout whose `HEAD` or files changed since the preview. Run from a terminal, it asks `[y/N]` itself. It sends `X-Unfold-Confirmation: unfold-handoff-<code>:<sha256 of the preview>`, and Unfold refuses a hand-off from an editor credential without one (403 `confirmation_required`) and keeps it on the Action Record.
* **Authorization.** Only the session's owner can hand it over with a context, never an administrator, and only to a Work Item the session is linked to or a Team they belong to.

The preview waits in `${CLAUDE_PLUGIN_DATA}/handoffs/<code>.json`, readable by you only, until `send` uses it.

## Behaviour

* Every hook exits 0 and prints nothing when `UNFOLD_URL` or `UNFOLD_TOKEN` is unset, or when Unfold cannot be reached. A session is never blocked. Set `UNFOLD_HOOK_DEBUG=1` to see errors on stderr.
* A request gives up after `UNFOLD_HOOK_TIMEOUT_MS` (default 3000).
* Set `UNFOLD_WORK_ITEM=<id>` to link every session started from that shell to one Work Item.
* Set `UNFOLD_REMOTE_APPROVAL=1` to answer tool prompts from Unfold. Only the session's owner can, never an administrator, and never with the credential the plugin reports with.
* The evidence ledger is recorded with or without `UNFOLD_URL`; set `UNFOLD_EVIDENCE=0` to turn it off.
* Set `UNFOLD_PUSH_AGENT_TRACE=1` to push the notes after each `git push`; `UNFOLD_PUSH_AGENT_TRACE_TIMEOUT_MS` (default 8000) bounds every git call of that push together.

## The evidence ledger

`scripts/evidence.mjs` runs on every `PostToolUse` and `PostToolUseFailure` of `Bash`. It keeps a command only when it proves something: tests, lints and validators, renders (`helm template`, `kustomize build`, flux-local, `tofu plan`), CI reads, live reads (`kubectl get`, `flux get`, `bao status`, `curl` to an `https` address) and deliveries (`git push`, `merge`, `tag`). Reading and editing commands are not evidence. Each entry has an id (`e1`, `e2`, …), the time, the kind, the command, the directory's name, the outcome (`passed`, `failed` or `interrupted`), the exit code (`Exit code N` from Claude Code's failure message) and the last three lines of output. Credentials in headers, `token=`/`password=` pairs, `--token`-style flags, URL userinfo, provider keys, JWTs and long hex or base64 runs are replaced by `[redacted]` before anything is written, and the command and output are each cut to 300 characters.

The ledger is `${CLAUDE_PLUGIN_DATA}/evidence/<session>.jsonl`, readable by you only, with the newest 500 entries. It never leaves your machine: `/unfold:brief` reads it through `node scripts/evidence-ledger.mjs [session id] [--json]` and cites entry ids, and only the brief you choose to publish carries them.

## How a line is attributed

A line added by a commit is the agent's when its trimmed text matches a line this session's editing tools wrote to the same file. A short line, such as `}` or a blank line, follows the line directly before or after it. Consecutive lines by one agent form one range, which carries `content_hash: sha256:<16 hex>` of its text. Each agent gets its own conversation: the main agent at the session's Unfold page, and a subagent at that page with `?agent=<type>`, with a `parent-session` link back. `metadata["dev.unfoldhq"].agents` lists them. Lines the session did not write are left out.

The record's conversation `url` is the session's Unfold page. Its `related` links name the Remote Control session and the Work Items. Unfold's own fields are in `metadata["dev.unfoldhq"]`, with `method: "line-fingerprint"`.

## Push the notes with the branch

`scripts/push-agent-trace.mjs` runs after a `PostToolUse` on `Bash` whose command ran `git push`, when `UNFOLD_PUSH_AGENT_TRACE=1`. It takes the remote from the command, or the branch's push remote when the command names none, and skips dry runs, deletions, mirrors, tag-only pushes and pushes that already name `refs/notes`. It pushes `refs/notes/agent-trace:refs/notes/agent-trace` without `+`. When the remote refuses because its notes moved, it fetches them into `refs/notes/agent-trace-incoming-<random>`, runs `git notes --ref=agent-trace merge -s cat_sort_uniq` on that ref, deletes it and pushes once more. A note then holds one record per line, which Unfold's report reads. Off by default, because the notes leave your machine with it.

## Report on a range of commits

`scripts/agent-trace-report.mjs --base <rev> [--head <rev>] [--ref agent-trace] [--repo <dir>]` prints a Markdown summary of the Agent Trace notes on the commits in `base..head`: per commit and file, AI-written lines against added lines, the tool, the model and up to three conversation links. It reads `refs/notes/<ref>` and never fetches, pushes or writes a ref. Records from any tool are accepted when they pass Agent Trace 0.1 as strictly as Unfold's server checks it; `scripts/agent-trace-schema.mjs` is that check without dependencies, held to `src/agent-trace.ts` by a parity test. It exits 0 with a short notice when git cannot read the range, and 2 on a usage error.

## Develop

The scripts use only Node's standard library and need Node 22 or later. The tests are `apps/unfold/test/claude-code-plugin.test.ts`, `apps/unfold/test/claude-code-handoff.test.ts` for `/unfold:handoff` (a temporary git repository, a bare origin and a fake Unfold) and, for the inbox and the channel, `apps/unfold/test/claude-code-inbox.test.ts`. They run the real hook script against a fake Unfold in a temporary git repository. `test/agent-trace-push.test.ts` pushes notes to a bare repository in a temporary directory from two clones, and `test/agent-trace-report.test.ts` runs the report on a repository with notes from two tools. `apps/unfold/test/agent-plugin.test.ts` checks `plugin.json` against the Agent Plugins 1.0.0 schema in `schemas/agent-plugins/1.0.0/`, an unchanged Apache-2.0 copy. It also checks the skill names, the marketplace entries, and that no MCP server definition names a host.
