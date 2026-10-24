# Unfold plugin for Claude Code and other agents

This plugin reports your own Claude Code sessions to Unfold and links each one to the Work Items it works on. For every commit it records which lines the agent wrote, as an [Agent Trace](https://agent-trace.dev/) 0.1 record. To install and use it, see [Link your Claude Code sessions to Work Items](../../../../docs/how-to/link-claude-code-sessions.md). The decision behind it is [ADR 0047](../../docs/adrs/0047-people-link-their-own-agent-sessions-through-a-plugin-agent-trace-and-telemetry-never-a-claude-sign-in.md).

The same directory is also an [Agent Plugin](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md) (specification 1.0.0), so GitHub Copilot CLI and VS Code 1.143 install it too. There it brings the `link-work-item` skill only. Session reporting and Agent Trace need the hooks, and only Claude Code runs them.

## What each client reads

| Client | Manifest it reads | What it loads from this plugin |
| --- | --- | --- |
| Claude Code | `.claude-plugin/plugin.json` ([manifest reference](https://code.claude.com/docs/en/plugins-reference)) | `hooks/hooks.json`, `skills/`, `commands/`, and the `unfold-channel` MCP server it declares |
| GitHub Copilot CLI | `plugin.json`. A root manifest with the Agent Plugins `$schema` takes precedence over `.claude-plugin/plugin.json` ([plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)) | `skills/`. It would read `mcp.json` and `com.github.copilot/`, and neither ships |
| VS Code 1.143 | `plugin.json`. VS Code checks for the Agent Plugins format before the Claude format ([authoring reference](https://code.visualstudio.com/docs/agents/reference/agent-plugin-reference)) | `skills/`. It would read `mcp.json` and `com.github.copilot/`, and neither ships |

All three read the marketplace at [`/.claude-plugin/marketplace.json`](../../../../.claude-plugin/marketplace.json). Copilot CLI and VS Code look for `marketplace.json`, `.plugin/marketplace.json` and `.github/plugin/marketplace.json` first, so the repository has none of those. Keep `version` equal in `plugin.json` and `.claude-plugin/plugin.json`; the tests check it.

### Why the hooks stay in `hooks/hooks.json`

Agent Plugins 1.0.0 standardizes skills and MCP servers only. Anything client-specific belongs in a top-level folder named after the client's reverse-domain namespace. Claude Code defines no such namespace and reads plugin hooks from `hooks/hooks.json`, so they stay there. Agent Plugins clients don't read that path: Copilot CLI and VS Code take hooks from `com.github.copilot/hooks/hooks.json` only. That is on purpose. The hook script reads Claude Code's hook payloads, so it has nothing to work with in another client.

Not checked: VS Code's Claude agent passes plugins on to the Claude Agent SDK, which reads `.claude-plugin/plugin.json`. VS Code's architecture notes say an Agent Plugins package is not passed on that way, so in VS Code's Claude agent sessions the hooks may not run.

## Install in Copilot CLI or VS Code

Copilot CLI:

```sh
copilot plugin marketplace add https://forgejo.webgrip.dev/webgrip/unfold.git
copilot plugin install unfold@unfold
```

VS Code: add the repository to the `chat.plugins.marketplaces` setting, then install **unfold** from the plugin list.

```json
"chat.plugins.marketplaces": ["https://forgejo.webgrip.dev/webgrip/unfold.git"]
```

The marketplace names the plugin by a path inside this repository, so you get whatever the branch holds. To pin a version, list the plugin in your own marketplace with a `git-subdir` source: `url` set to this repository, `path` set to `apps/unfold/extensions/claude-code` and `sha` set to a full 40-character commit. Claude Code and VS Code accept that source. Copilot CLI documents `sha` on its `github` and `url` sources.

## MCP servers

`.claude-plugin/plugin.json` declares one local server, `unfold-channel` (`channel/unfold-channel.mjs`), and binds a [channel](https://code.claude.com/docs/en/channels-reference) to it. It is a one-way channel: it declares the `claude/channel` capability and no tools, and pushes `notifications/claude/channel` with `meta` `kind` and `sender`. It does nothing unless `UNFOLD_CHANNEL=1`, and then only while the hooks last saw the session stop. It finds its session through `processes/<its parent pid>.json`, which the `SessionStart` hook writes, because Claude Code gives an MCP server no session id. It answers `initialize` with protocol revision 2025-11-25 or older, because Claude Code does not register a channel that negotiates 2026-07-28. How to turn it on is in the [how-to](../../../../docs/how-to/link-claude-code-sessions.md#when-the-session-is-idle-the-unfold-channel).

The plugin ships no `mcp.json` and no `.mcp.json`, and no remote server, because it works with any Unfold installation. Agent Plugins 1.0.0 forbids placeholder and environment-variable expansion in a remote server's `url` and `headers`, and it has no field for an OAuth client id. A shipped definition would therefore name one Unfold installation and still lack its client id. Add the servers yourself:

* **VS Code:** the [Unfold extension](../vscode/README.md) provides the Ploeg MCP server from the workbench it is connected to.
* **Claude Code:** `claude mcp add --scope user --transport http --client-id unfold-mcp unfold https://<your Unfold>/mcp`, as in [Serve unfold-mcp over HTTPS](../../../../docs/how-to/serve-unfold-mcp-over-https.md).

When the specification allows configuration per installation, the plugin can ship its MCP servers.

## What each hook does

| Hook | Sends to `POST /api/linked-sessions/events` | Also |
| --- | --- | --- |
| `SessionStart` | `start`, with the repository, branch, model and Claude Code version, and `remoteApproval`: whether `UNFOLD_REMOTE_APPROVAL=1` | Records which session the Claude Code process runs in `${CLAUDE_PLUGIN_DATA}/processes/<pid>.json`, for the channel. Gives the session its Unfold page, its session id and the `Unfold-Session:` trailer as `additionalContext`. Sets `sessionTitle` from the first Work Item when the session has no title |
| `UserPromptSubmit` | `prompt`, never the prompt itself. When the prompt names a tracker task such as `VIK-2051`, an Unfold `#work/<id>` link or "Work Item 184", it adds only those ids as `mentions` | Collects the session's waiting Unfold messages from `POST /api/linked-sessions/<id>/inbox` and adds them as `additionalContext` |
| `Notification` | `waiting`, for `permission_prompt`, `idle_prompt`, `elicitation_dialog` and `agent_needs_input` only | |
| `PermissionRequest` (only with `UNFOLD_REMOTE_APPROVAL=1`) | `waiting` with `permission_prompt`, then the tool name and a redacted one-line summary to `POST /api/linked-sessions/<id>/permissions`, never the tool input | Waits up to `UNFOLD_REMOTE_APPROVAL_WAIT_S` (default 120) for the owner to answer in Unfold, asking `…/collect` every `UNFOLD_REMOTE_APPROVAL_POLL_MS` (default 2000), and prints the `allow` or `deny` decision. Claude Code shows its own prompt meanwhile and the first answer applies. Stops and withdraws the prompt when the transcript shows it was answered in the terminal, when Claude Code stops the hook, or when the wait ends. Its 310-second timeout only outlasts the longest wait. It never writes the session's state file, so a long wait cannot overwrite what other hooks recorded. See [Approve a tool from Unfold](../../../../docs/how-to/link-claude-code-sessions.md#approve-a-tool-from-unfold) |
| `PostToolUse` on `Write`, `Edit`, `MultiEdit` and `NotebookEdit` | Nothing | Remembers fingerprints of the lines written, per file and per repository, and which agent wrote each: `main`, or the subagent's `agent_type`. They are kept in `${CLAUDE_PLUGIN_DATA}/sessions/<id>.json`. The repository is the one the file is in, so a subagent working in its own git worktree is followed too |
| `PostToolUse` on `Bash` | `commit` for each new commit since the last one it saw, with the task and Work Item ids its message names as `mentions`, in every repository and worktree the session edited. Also any pull request address that a `pr create` command printed | Builds the commit's Agent Trace record, writes it to `refs/notes/agent-trace` and sends it to `POST /api/linked-sessions/<id>/traces`. At most every 30 seconds, collects waiting messages as `additionalContext`. With `UNFOLD_PUSH_AGENT_TRACE=1`, after a `git push` also pushes `refs/notes/agent-trace` to the same remote ([below](#push-the-notes-with-the-branch)) |
| `Stop` | Any new commits, then `idle`. Also the name the person gave with `/rename` as `title`, and pull requests Claude Code recorded in the transcript (`pr-link`) that were not sent before | Claude Code's own summary title (`ai-title`) is sent only with `UNFOLD_SHARE_TRANSCRIPT=1`. Collects messages people sent. When there are any, answers `decision: block` with them as `reason`, so the session continues. Notices wait for the next prompt |
| `SessionEnd` | Any new commits, then `end` | |

## Commands

| Command | What it does |
| --- | --- |
| `/unfold:start <work item>` | Starts the Run of a Work Item that waits for your own Claude Code (Ploeg ADR-0112). From a clone of the Work Item's repository, [`scripts/unfold-start.mjs`](scripts/unfold-start.mjs) claims the Run through `POST /api/ploeg/work-items/<id>/claim` with the id of the session that runs the command (`CLAUDE_CODE_SESSION_ID`), so Unfold links that session and never warns that it collides with the Run it started, dispatches it with `claude -p <prompt> --environment <id> --ref <ref> --output-format json` under your own login, and records the printed session through `POST /api/ploeg/work-items/<id>/claude-session`. It claims nothing outside a clone of the repository. Set `UNFOLD_CLAUDE_BIN` to use another `claude`, and `UNFOLD_DISPATCH_TIMEOUT_MS` (default 180000) to wait longer for the dispatch |
| `/unfold:takeover <work item>` | Picks up a Work Item you took control of in Unfold (Ploeg ADR-0142), once Ploeg parked it for you. From a clone of its repository, [`scripts/unfold-takeover.mjs`](scripts/unfold-takeover.mjs) reads `GET /api/ploeg/work-items/<id>/take-over`, fetches the branch Ploeg pushed the agent's work to, and checks it out with `git worktree add` under `.claude/worktrees/unfold-<id>` (reusing it when it exists, and your local branch when you have one). It prints the command that starts `claude` there with `UNFOLD_WORK_ITEM=<id>` and a brief of the yield commit, the marked work in progress commit and the latest Run's summary, quoted as data; run it in a new terminal. Run from a terminal yourself (`node scripts/unfold-takeover.mjs takeover <id>`), it starts `claude` directly; `UNFOLD_TAKEOVER_LAUNCH=print` or `exec` forces either. It checks nothing out before the Run stopped or outside a clone of the repository |
| `/unfold:handback <work item> [note]` | Hands it back. Refuses while the worktree (or the checkout you run it in, when it is on the Work Item's branch) has uncommitted changes, or commits that are not on `origin/<branch>` after a fetch, and says what to commit or push. Otherwise calls `POST /api/ploeg/work-items/<id>/hand-back` with your note, and Ploeg resumes the Round that stopped on the same branch from its head on the forge. Sends only the note |

## Behaviour

* Every hook exits 0 and prints nothing when `UNFOLD_URL` or `UNFOLD_TOKEN` is unset, or when Unfold cannot be reached. A session is never blocked. Set `UNFOLD_HOOK_DEBUG=1` to see errors on stderr.
* A request gives up after `UNFOLD_HOOK_TIMEOUT_MS` (default 3000).
* Set `UNFOLD_WORK_ITEM=<id>` to link every session started from that shell to one Work Item.
* Set `UNFOLD_REMOTE_APPROVAL=1` to answer tool prompts from Unfold. Only the session's owner can, never an administrator, and never with the credential the plugin reports with.
* Set `UNFOLD_PUSH_AGENT_TRACE=1` to push the notes after each `git push`; `UNFOLD_PUSH_AGENT_TRACE_TIMEOUT_MS` (default 8000) bounds every git call of that push together.

## How a line is attributed

A line added by a commit is the agent's when its trimmed text matches a line this session's editing tools wrote to the same file. A short line, such as `}` or a blank line, follows the line directly before or after it. Consecutive lines by one agent form one range, which carries `content_hash: sha256:<16 hex>` of its text. Each agent gets its own conversation: the main agent at the session's Unfold page, and a subagent at that page with `?agent=<type>`, with a `parent-session` link back. `metadata["dev.unfoldhq"].agents` lists them. Lines the session did not write are left out.

The record's conversation `url` is the session's Unfold page. Its `related` links name the Remote Control session and the Work Items. Unfold's own fields are in `metadata["dev.unfoldhq"]`, with `method: "line-fingerprint"`.

## Push the notes with the branch

`scripts/push-agent-trace.mjs` runs after a `PostToolUse` on `Bash` whose command ran `git push`, when `UNFOLD_PUSH_AGENT_TRACE=1`. It takes the remote from the command, or the branch's push remote when the command names none, and skips dry runs, deletions, mirrors, tag-only pushes and pushes that already name `refs/notes`. It pushes `refs/notes/agent-trace:refs/notes/agent-trace` without `+`. When the remote refuses because its notes moved, it fetches them into `refs/notes/agent-trace-incoming-<random>`, runs `git notes --ref=agent-trace merge -s cat_sort_uniq` on that ref, deletes it and pushes once more. A note then holds one record per line, which Unfold's report reads. Off by default, because the notes leave your machine with it.

## Report on a range of commits

`scripts/agent-trace-report.mjs --base <rev> [--head <rev>] [--ref agent-trace] [--repo <dir>]` prints a Markdown summary of the Agent Trace notes on the commits in `base..head`: per commit and file, AI-written lines against added lines, the tool, the model and up to three conversation links. It reads `refs/notes/<ref>` and never fetches, pushes or writes a ref. Records from any tool are accepted when they pass Agent Trace 0.1 as strictly as Unfold's server checks it; `scripts/agent-trace-schema.mjs` is that check without dependencies, held to `src/agent-trace.ts` by a parity test. It exits 0 with a short notice when git cannot read the range, and 2 on a usage error.

## Develop

The scripts use only Node's standard library and need Node 22 or later. The tests are `apps/unfold/test/claude-code-plugin.test.ts` and, for the inbox and the channel, `apps/unfold/test/claude-code-inbox.test.ts`. They run the real hook script against a fake Unfold in a temporary git repository. `test/agent-trace-push.test.ts` pushes notes to a bare repository in a temporary directory from two clones, and `test/agent-trace-report.test.ts` runs the report on a repository with notes from two tools. `apps/unfold/test/agent-plugin.test.ts` checks `plugin.json` against the Agent Plugins 1.0.0 schema in `schemas/agent-plugins/1.0.0/`, an unchanged Apache-2.0 copy. It also checks the skill names, the marketplace entries, and that no MCP server definition names a host.
