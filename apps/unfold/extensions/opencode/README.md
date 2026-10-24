# Unfold plugin for OpenCode

This plugin reports your own OpenCode sessions to Unfold as Linked Sessions and records an [Agent Trace](https://agent-trace.dev/) 0.1 record for each commit, the way the [Claude Code plugin](../claude-code/README.md) does. To install and use it, see [Link your OpenCode and Codex sessions](../../../../docs/how-to/link-opencode-and-codex-sessions.md).

It supports OpenCode 1.x (`opencode-ai`). A real OpenCode 1.18.33 server loaded it and reported a session's start and end; the other events are tested with payloads shaped like the `@opencode-ai/sdk` 1.19.4 types. OpenCode 2 (`@opencode/cli`) replaced the plugin interface with `Plugin.define({ id, setup(ctx) })` and hooks registered on `ctx`. Supporting it needs its event names, which its documentation does not list yet, so it is not supported.

## Files

| File | What it is |
| --- | --- |
| `unfold-plugin.mjs` | The plugin. It exports only `UnfoldPlugin`, because OpenCode calls every function a plugin file exports |
| `writes.mjs` | Reads the written text out of OpenCode's `write`, `edit`, `multiedit`, `patch` and `apply_patch` tool arguments |
| [`../shared/linked-report.mjs`](../shared/linked-report.mjs) | Reporting, commit scanning and Agent Trace, shared with the Codex reporter. It builds records with the Claude Code plugin's [`agent-trace.mjs`](../claude-code/scripts/agent-trace.mjs) |

## What each event does

| OpenCode event or hook | Sends to `POST /api/linked-sessions/events` | Also |
| --- | --- | --- |
| `session.created`, `session.updated` | `start`, once per session, with the repository, branch and OpenCode version | A child session (one with `parentID`) is a subagent: it reports as its parent |
| `chat.message`, `session.status` busy | `prompt` when the session was not working yet, with the model as `provider/model` | Never the message itself |
| `permission.asked`, `permission.updated` | `waiting` with `permission_prompt` | |
| `question.asked` | `waiting` with `agent_needs_input` | Never the question or the answer |
| `permission.replied`, `question.replied`, `question.rejected` | `prompt` | |
| `tool.execute.after` on an editing tool | Nothing | Remembers fingerprints of the written lines per file, as `main` or, in a child session, `subagent` |
| `tool.execute.after` on `bash` | `commit` for each new commit, and pull request addresses a `pr create` command printed | Builds the Agent Trace record, writes it to `refs/notes/agent-trace` and sends it to `POST /api/linked-sessions/<id>/traces` |
| `session.idle` | New commits, then `idle` | |
| `session.deleted`, plugin `dispose` | `end` (after new commits on `dispose`) | |
| `experimental.chat.system.transform` | Nothing | Adds Unfold's start-up text (the session's page and the `Unfold-Session:` trailer) to the system prompt |

Reports run one after another off OpenCode's event path, each with a 3-second timeout (`UNFOLD_HOOK_TIMEOUT_MS`), so a slow or absent Unfold never holds a session up. Errors are silent unless `UNFOLD_HOOK_DEBUG=1`. The session title is never sent, because OpenCode writes it from the first prompt.
