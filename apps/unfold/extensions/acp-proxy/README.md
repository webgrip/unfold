# unfold-acp: report Agent Client Protocol sessions to Unfold

`unfold-acp` reports the sessions you run in an editor that speaks the [Agent Client Protocol](https://agentclientprotocol.com) (ACP) to Unfold, whatever agent runs behind it. Zed, JetBrains AI Assistant and the Neovim ACP plugins all speak it. The editor starts `unfold-acp` instead of the agent. `unfold-acp` starts the real agent and passes every message between the two, byte for byte, without delaying, changing or dropping any of them. While it does that, it reads the stream and tells Unfold what the session is doing. The sessions show up under **Settings › Agent sessions** and on the Work Items they link to, as for the [Claude Code plugin](../claude-code/README.md). The how-to is [Link your Claude Code sessions to Work Items](../../../../docs/how-to/link-claude-code-sessions.md#editors-that-speak-the-agent-client-protocol).

It needs Node.js 22 or later and git. It has no dependencies. It imports the Agent Trace code from `../claude-code/scripts/agent-trace.mjs`, so run it from a checkout of this repository, or from `npm install --global ./apps/unfold/extensions/acp-proxy` run inside one. A global install from a directory is a link, so it keeps finding that file.

## Configure it

Set `UNFOLD_URL` and `UNFOLD_TOKEN` (an editor credential, `vle_…`) in the agent's environment. Without both, `unfold-acp` only relays and reports nothing. Optional: `UNFOLD_WORK_ITEM` links every session to one Work Item, `UNFOLD_HOOK_TIMEOUT_MS` bounds each report (default 3000), and `UNFOLD_HOOK_DEBUG=1` prints reporting errors on stderr, which editors show in their agent log.

Put `--` between `unfold-acp` and the agent command. Everything after it is the agent's command line, unchanged. `unfold-acp` starts the agent without a shell. On Windows that means a `.cmd` launcher, such as the ones npm installs, does not start. Name the agent's `.exe`, or `node` and the agent's script, instead. Windows is not tested.

### Zed

In `settings.json`, under **Agent Settings › External Agents › Add Custom Agent**:

```json
{
  "agent_servers": {
    "Gemini via Unfold": {
      "type": "custom",
      "command": "node",
      "args": ["/home/you/src/unfold/apps/unfold/extensions/acp-proxy/bin/unfold-acp.mjs", "--", "gemini", "--experimental-acp"],
      "env": { "UNFOLD_URL": "https://unfold.example.org", "UNFOLD_TOKEN": "vle_…" }
    },
    "Claude Code via Unfold": {
      "type": "custom",
      "command": "unfold-acp",
      "args": ["--", "claude-code-acp"],
      "env": { "UNFOLD_URL": "https://unfold.example.org", "UNFOLD_TOKEN": "vle_…" }
    }
  }
}
```

The second entry assumes the global install, so `unfold-acp` is on the `PATH` Zed starts agents with.

### JetBrains AI Assistant

In `~/.jetbrains/acp.json` (AI Chat › ⋯ › **Add Custom Agent**). JetBrains wants full paths:

```json
{
  "default_mcp_settings": {},
  "agent_servers": {
    "Gemini via Unfold": {
      "command": "/usr/bin/node",
      "args": ["/home/you/src/unfold/apps/unfold/extensions/acp-proxy/bin/unfold-acp.mjs", "--", "/usr/local/bin/gemini", "--experimental-acp"],
      "env": { "UNFOLD_URL": "https://unfold.example.org", "UNFOLD_TOKEN": "vle_…" }
    }
  }
}
```

Restart the IDE after you change the file.

### Neovim and other clients

Any ACP client that starts its agent from a command line works the same way. Make `unfold-acp` the command, and give it `--`, the agent's command and the agent's arguments as its arguments.

## What it reports

| ACP message | Report to `POST /api/linked-sessions/events` |
| --- | --- |
| `initialize` answer | Remembers `agentInfo`: its title (or name) starts the session title, its version is `harnessVersion` |
| `session/new` or `session/fork` answer, `session/load` or `session/resume` answer | `start`, with the title `<agent> · <folder>`, the repository and branch of `cwd`, and the model from `models.currentModelId` when the agent sends one |
| `session/prompt` | `prompt`: the session works. The prompt text is not read |
| `session/request_permission` | `waiting`, `waitingFor: permission_prompt`. An answer that selects an option reports `prompt` again |
| The `session/prompt` answer (any stop reason, or an error) | New commits in the session's repositories, then `idle` |
| The agent exits | New commits, then `end`. `unfold-acp` exits with the agent's exit code |

Each report uses `harness: "acp"` and the session id `acp-<ACP session id>`. An ACP id that does not fit Unfold's id pattern is hashed. The prefix keeps a session apart from the one the Claude Code plugin might report from inside the same agent. Unfold shows no resume command for these sessions, because only the editor that started one can resume it.

Reports go out one by one, in order, from a queue. Each is bounded by the timeout. A failed report is dropped. Relaying never waits on the queue, and when the agent exits, `unfold-acp` waits at most three timeouts (ten seconds at most) for the last reports.

## Commits and Agent Trace

After each turn and at exit, `unfold-acp` looks for new commits in the git repository of the session's `cwd` and of every file the agent edited. It reports each commit (id, subject, whether it carries an `Unfold-Session:` trailer).

It attributes lines only when the record would be sound. The agent's edits arrive as `tool_call` and `tool_call_update` messages with `diff` content. When such a tool call reaches status `completed`, `unfold-acp` fingerprints the lines its diffs added: the lines of `newText` that `oldText` lacks, or all of them for a new file. It does this locally, with the same line fingerprints the Claude Code plugin uses. A diff of a tool call that fails, or that never completes, is forgotten. A diff replayed while `session/load` restores history is ignored. A commit with lines that match gets an Agent Trace 0.1 record. The record names the agent in `tool.name` and has `harness: acp` in its `dev.unfoldhq` metadata. It is written to `refs/notes/agent-trace` and sent to Unfold. A commit without matching lines is reported without a record. With `UNFOLD_HOOK_DEBUG=1`, `unfold-acp` says so on stderr. That happens to anything written by a shell command, by a tool that sends no diff, or before `unfold-acp` started. Lines that are already somewhere in the old text are left out too. So the record may count too few AI lines, never too many.

## What leaves your machine

The session id, the agent's name and version, the model id, the repository address without credentials, the branch, the state, commit ids and subjects, and the Agent Trace records (paths, line ranges, hashes). Prompt text, agent messages, tool output and file contents are read only to pass them on. They never leave your machine.
