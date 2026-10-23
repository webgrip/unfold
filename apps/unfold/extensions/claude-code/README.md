# Unfold plugin for Claude Code and other agents

This plugin reports your own Claude Code sessions to Unfold and links each one to the Work Items it works on. For every commit it records which lines the agent wrote, as an [Agent Trace](https://agent-trace.dev/) 0.1 record. To install and use it, see [Link your Claude Code sessions to Work Items](../../../../docs/how-to/link-claude-code-sessions.md). The decision behind it is [ADR 0047](../../docs/adrs/0047-people-link-their-own-agent-sessions-through-a-plugin-agent-trace-and-telemetry-never-a-claude-sign-in.md).

The same directory is also an [Agent Plugin](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md) (specification 1.0.0), so GitHub Copilot CLI and VS Code 1.143 install it too. There it brings the `link-work-item` skill only. Session reporting and Agent Trace need the hooks, and only Claude Code runs them.

## What each client reads

| Client | Manifest it reads | What it loads from this plugin |
| --- | --- | --- |
| Claude Code | `.claude-plugin/plugin.json` ([manifest reference](https://code.claude.com/docs/en/plugins-reference)) | `hooks/hooks.json`, `skills/` |
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

The plugin ships no `mcp.json` and no `.mcp.json`, because it works with any Unfold installation. Agent Plugins 1.0.0 forbids placeholder and environment-variable expansion in a remote server's `url` and `headers`, and it has no field for an OAuth client id. A shipped definition would therefore name one Unfold installation and still lack its client id. Add the servers yourself:

* **VS Code:** the [Unfold extension](../vscode/README.md) provides the Ploeg MCP server from the workbench it is connected to.
* **Claude Code:** `claude mcp add --scope user --transport http --client-id unfold-mcp unfold https://<your Unfold>/mcp`, as in [Serve unfold-mcp over HTTPS](../../../../docs/how-to/serve-unfold-mcp-over-https.md).

When the specification allows configuration per installation, the plugin can ship its MCP servers.

## What each hook does

| Hook | Sends to `POST /api/linked-sessions/events` | Also |
| --- | --- | --- |
| `SessionStart` | `start`, with the repository, branch, model and Claude Code version | Gives the session its Unfold page, its session id and the `Unfold-Session:` trailer as `additionalContext`. Sets `sessionTitle` from the first Work Item when the session has no title |
| `UserPromptSubmit` | `prompt`, never the prompt itself. When the prompt names a tracker task such as `VIK-2051`, an Unfold `#work/<id>` link or "Work Item 184", it adds only those ids as `mentions` | |
| `Notification` | `waiting`, for `permission_prompt`, `idle_prompt`, `elicitation_dialog` and `agent_needs_input` only | |
| `PostToolUse` on `Write`, `Edit`, `MultiEdit` and `NotebookEdit` | Nothing | Remembers fingerprints of the lines written, per file and per repository, and which agent wrote each: `main`, or the subagent's `agent_type`. They are kept in `${CLAUDE_PLUGIN_DATA}/sessions/<id>.json`. The repository is the one the file is in, so a subagent working in its own git worktree is followed too |
| `PostToolUse` on `Bash` | `commit` for each new commit since the last one it saw, with the task and Work Item ids its message names as `mentions`, in every repository and worktree the session edited. Also any pull request address that a `pr create` command printed | Builds the commit's Agent Trace record, writes it to `refs/notes/agent-trace` and sends it to `POST /api/linked-sessions/<id>/traces` |
| `Stop` | Any new commits, then `idle` | |
| `SessionEnd` | Any new commits, then `end` | |

## Behaviour

* Every hook exits 0 and prints nothing when `UNFOLD_URL` or `UNFOLD_TOKEN` is unset, or when Unfold cannot be reached. A session is never blocked. Set `UNFOLD_HOOK_DEBUG=1` to see errors on stderr.
* A request gives up after `UNFOLD_HOOK_TIMEOUT_MS` (default 3000).
* Set `UNFOLD_WORK_ITEM=<id>` to link every session started from that shell to one Work Item.

## How a line is attributed

A line added by a commit is the agent's when its trimmed text matches a line this session's editing tools wrote to the same file. A short line, such as `}` or a blank line, follows the line directly before or after it. Consecutive lines by one agent form one range, which carries `content_hash: sha256:<16 hex>` of its text. Each agent gets its own conversation: the main agent at the session's Unfold page, and a subagent at that page with `?agent=<type>`, with a `parent-session` link back. `metadata["dev.unfoldhq"].agents` lists them. Lines the session did not write are left out.

The record's conversation `url` is the session's Unfold page. Its `related` links name the Remote Control session and the Work Items. Unfold's own fields are in `metadata["dev.unfoldhq"]`, with `method: "line-fingerprint"`.

## Develop

The scripts use only Node's standard library and need Node 22 or later. The tests are `apps/unfold/test/claude-code-plugin.test.ts`. They run the real hook script against a fake Unfold in a temporary git repository. `apps/unfold/test/agent-plugin.test.ts` checks `plugin.json` against the Agent Plugins 1.0.0 schema in `schemas/agent-plugins/1.0.0/`, an unchanged Apache-2.0 copy. It also checks the skill names, the marketplace entries, and that no MCP server definition names a host.
