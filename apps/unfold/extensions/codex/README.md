# Unfold reporter for Codex CLI

This hook script reports your own Codex CLI sessions to Unfold as Linked Sessions and records an [Agent Trace](https://agent-trace.dev/) 0.1 record for each commit, the way the [Claude Code plugin](../claude-code/README.md) does. To install and use it, see [Link your OpenCode and Codex sessions](../../../../docs/how-to/link-opencode-and-codex-sessions.md).

Codex was not run while building it. The payloads it reads come from the Codex [hooks](https://developers.openai.com/codex/hooks) and advanced configuration documentation as of 2026-10-24, and the tests replay them against a fake Unfold.

## Files

| File | What it is |
| --- | --- |
| `unfold-codex.mjs` | The reporter. Codex hooks give it a JSON payload on stdin; the `notify` program gives it one as its last argument |
| `hooks.json` | The hooks to copy to `~/.codex/hooks.json`, with `/path/to/unfold` replaced |
| [`../shared/linked-report.mjs`](../shared/linked-report.mjs) | Reporting, commit scanning and Agent Trace, shared with the OpenCode plugin |

## What each hook does

| Codex hook | Sends to `POST /api/linked-sessions/events` | Also |
| --- | --- | --- |
| `SessionStart` | `start`, with the repository, branch, model and Codex version (read from the session's rollout file) | Gives the session its Unfold page and the `Unfold-Session:` trailer as `additionalContext` |
| `UserPromptSubmit` | `prompt` (never the prompt itself) | |
| `PermissionRequest` | `waiting` with `permission_prompt` | Prints nothing, so Codex asks you as usual |
| `PostToolUse` on `apply_patch` | `prompt` if the session was waiting | Remembers fingerprints of the lines the patch adds |
| `PostToolUse` on `Bash` | `prompt` if the session was waiting, `commit` for each new commit, and pull request addresses a `pr create` command printed | Builds the Agent Trace record, writes it to `refs/notes/agent-trace` and sends it to `POST /api/linked-sessions/<id>/traces` |
| `Stop` | New commits, then `idle` | |
| `Interrupt` | `idle` | |
| `SessionEnd` | `end` | Codex allows at most 3 seconds here, so it reports with a 1.5-second timeout and leaves the commit scan to `Stop` |
| `notify` (`agent-turn-complete`) | New commits, then `idle` | For a Codex without hooks |

## What it cannot report

* With `notify` only: working, waiting, start and end. Notify fires on finished turns only, and it sees no edits, so commits get no Agent Trace attribution.
* A subagent's edits. Codex reports `SubagentStart` and `SubagentStop`, but the reporter does not subscribe to them yet, so a subagent's `apply_patch` lines count as the main agent's.
* Cost, tokens and telemetry. Unfold reads Claude Code's telemetry only.
* Edits made through a shell command instead of `apply_patch`, such as `sed -i`. Those lines show as written by a person.

Every report has a 3-second timeout (`UNFOLD_HOOK_TIMEOUT_MS`); errors are silent unless `UNFOLD_HOOK_DEBUG=1`, and the script always exits 0.
