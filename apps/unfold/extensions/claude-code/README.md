# Unfold plugin for Claude Code

This plugin reports your own Claude Code sessions to Unfold and links each one to the Work Items it works on. For every commit it records which lines the agent wrote, as an [Agent Trace](https://agent-trace.dev/) 0.1 record. To install and use it, see [Link your Claude Code sessions to Work Items](../../../../docs/how-to/link-claude-code-sessions.md). The decision behind it is [ADR 0047](../../docs/adrs/0047-people-link-their-own-agent-sessions-through-a-plugin-agent-trace-and-telemetry-never-a-claude-sign-in.md).

## What each hook does

| Hook | Sends to `POST /api/linked-sessions/events` | Also |
| --- | --- | --- |
| `SessionStart` | `start`, with the repository, branch, model and Claude Code version | Gives the session its Unfold page, its session id and the `Unfold-Session:` trailer as `additionalContext`. Sets `sessionTitle` from the first Work Item when the session has no title |
| `UserPromptSubmit` | `prompt` (never the prompt itself) | |
| `Notification` | `waiting`, for `permission_prompt`, `idle_prompt`, `elicitation_dialog` and `agent_needs_input` only | |
| `PostToolUse` on `Write`, `Edit`, `MultiEdit` and `NotebookEdit` | Nothing | Remembers fingerprints of the lines written, per repository file, in `${CLAUDE_PLUGIN_DATA}/sessions/<id>.json` |
| `PostToolUse` on `Bash` | `commit` for each new commit since the last one it saw. Also any pull request address that a `pr create` command printed | Builds the commit's Agent Trace record, writes it to `refs/notes/agent-trace` and sends it to `POST /api/linked-sessions/<id>/traces` |
| `Stop` | Any new commits, then `idle` | |
| `SessionEnd` | Any new commits, then `end` | |

## Behaviour

* Every hook exits 0 and prints nothing when `UNFOLD_URL` or `UNFOLD_TOKEN` is unset, or when Unfold cannot be reached. A session is never blocked. Set `UNFOLD_HOOK_DEBUG=1` to see errors on stderr.
* A request gives up after `UNFOLD_HOOK_TIMEOUT_MS` (default 3000).
* Set `UNFOLD_WORK_ITEM=<id>` to link every session started from that shell to one Work Item.

## How a line is attributed

A line added by a commit is the agent's when its trimmed text matches a line this session's editing tools wrote to the same file. A short line, such as `}` or a blank line, follows the line directly before or after it. Consecutive agent lines form one range, which carries `content_hash: sha256:<16 hex>` of its text. Lines the session did not write are left out.

The record's conversation `url` is the session's Unfold page. Its `related` links name the Remote Control session and the Work Items. Unfold's own fields are in `metadata["dev.unfoldhq"]`, with `method: "line-fingerprint"`.

## Develop

The scripts use only Node's standard library and need Node 22 or later. The tests are `apps/unfold/test/claude-code-plugin.test.ts`. They run the real hook script against a fake Unfold in a temporary git repository.
