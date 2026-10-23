---
type: how-to
audience: [owner, contributor]
owner: unfold
last_verified: 2026-10-24
verified_by: "Read apps/unfold/extensions/opencode, extensions/codex and extensions/shared; ran test/linked-harnesses.test.ts. The OpenCode plugin was loaded by a real OpenCode 1.18.33 `opencode serve`, which reported start and end for a session created and deleted over its API; prompts, permissions and commits were tested with event payloads shaped like the @opencode-ai/sdk 1.19.4 types. Codex was not run: its hook and notify payloads come from the Codex hooks and advanced-configuration docs read on 2026-10-24."
---

# Link your OpenCode and Codex sessions to Work Items

Use this when you work on a Work Item in OpenCode or in OpenAI's Codex CLI and want the session on the Work Item in Unfold, the way [Claude Code sessions](link-claude-code-sessions.md) show up. Each session reports its state, links itself to the Work Items its branch names, and records an [Agent Trace](https://agent-trace.dev/) record for each commit. Unfold never holds your OpenAI or model-provider sign-in; your Unfold editor credential is the only credential involved ([ADR 0047](../../apps/unfold/docs/adrs/0047-people-link-their-own-agent-sessions-through-a-plugin-agent-trace-and-telemetry-never-a-claude-sign-in.md)).

Both reporters live in this repository, so you need a checkout of it on the machine where you run the agent. Below, `/path/to/unfold` is that checkout.

## 1. Get an editor credential

Follow step 1 of [Link your Claude Code sessions](link-claude-code-sessions.md#1-get-an-editor-credential). You get a `vle_…` credential. Export it, with Unfold's address, in the shell profile that starts your agent:

```sh
export UNFOLD_URL=https://unfold.example.org
export UNFOLD_TOKEN=vle_…
```

Without both variables the reporters send nothing and do nothing.

## 2a. OpenCode

The plugin works with OpenCode 1.x, the `opencode-ai` package. Create `~/.config/opencode/plugins/unfold.js` with this one line:

```js
export { UnfoldPlugin } from '/path/to/unfold/apps/unfold/extensions/opencode/unfold-plugin.mjs';
```

OpenCode loads every file in that folder at start-up and calls every function it exports as a plugin, so keep the file to this one export. For one project only, put the same file in the project's `.opencode/plugins/` instead.

OpenCode 2, the `@opencode/cli` package, has a different plugin interface (`Plugin.define` with `setup(ctx)`), and the plugin does not support it yet.

Resume a session with `opencode --session <id>`; the session's page in Unfold shows the command.

## 2b. Codex CLI

Codex runs hooks from `~/.codex/hooks.json` or from `[hooks]` tables in `~/.codex/config.toml`. Copy [`extensions/codex/hooks.json`](../../apps/unfold/extensions/codex/hooks.json) to `~/.codex/hooks.json` and replace `/path/to/unfold`, or add the same hooks to `config.toml`:

```toml
[[hooks.SessionStart]]
[[hooks.SessionStart.hooks]]
type = "command"
command = 'node "/path/to/unfold/apps/unfold/extensions/codex/unfold-codex.mjs"'
timeout = 10
```

Repeat the block for `UserPromptSubmit` (timeout 5), `PermissionRequest` (5), `PostToolUse` with `matcher = "^(Bash|apply_patch)$"` (20), `Stop` (20), `Interrupt` (3) and `SessionEnd` (3). Then open `/hooks` in Codex once and trust them; Codex does not run a hook nobody reviewed.

On a Codex without hooks, use the notify program instead. It hears only finished turns, so the session shows as idle and reports its commits, but never as working or waiting:

```toml
notify = ["node", "/path/to/unfold/apps/unfold/extensions/codex/unfold-codex.mjs"]
```

Resume a session with `codex resume <id>`.

## 3. Work as usual

Start on a branch that names the ticket, such as `feat/vik-2051-login`, and the session links itself to that ticket's Work Items. You can also link it on its page under **Settings › Agent sessions**, or with `unfold_link_session` when `unfold-mcp` is registered. End commit messages with `Unfold-Session: <the session's page>`. Both agents are told that line: Codex at session start, OpenCode in its system prompt once Unfold has answered the session's first report. Agent Trace records go to `refs/notes/agent-trace`; push them with `git push origin refs/notes/agent-trace`.

## What each harness reports

| State | OpenCode | Codex hooks | Codex notify |
| --- | --- | --- | --- |
| Started | `session.created`, or the first event of a resumed session | `SessionStart` | First finished turn |
| Working | A new message or a busy status | `UserPromptSubmit`, and the first tool call after an approval | Not reported |
| Waiting for you | `permission.asked` (as `permission_prompt`), `question.asked` (as `agent_needs_input`) | `PermissionRequest` (as `permission_prompt`) | Not reported |
| Idle | `session.idle` | `Stop`, `Interrupt` | `agent-turn-complete` |
| Ended | `session.deleted`, or OpenCode shutting down | `SessionEnd` | Not reported |
| Commits and Agent Trace | After every `bash` call and when the session goes idle; lines written by `write`, `edit`, `multiedit`, `patch` and `apply_patch` | After every `Bash` call and at `Stop`; lines written by `apply_patch` | At each finished turn, without attribution: notify never sees an edit, so a commit shows "no record" |

A subagent in OpenCode runs as a child session; its edits count toward the parent session as `subagent`. Neither harness reports a cost estimate or telemetry to Unfold; the session page shows none for them.

## What leaves your machine

Both reporters send:

* the session id, the model, and the OpenCode or Codex version;
* the repository address without credentials, and the branch;
* the state: working, waiting for you, idle or ended;
* commit ids and subjects, and pull request addresses that a `pr create` command printed;
* the Agent Trace records: file paths, line ranges and short hashes of the written lines.

They never send your prompts, the session title (OpenCode writes it from your first prompt), answers you give the agent, tool output or file contents. The Codex notify payload carries your messages and the agent's last answer; the reporter reads only the session id and folder from it. Each session keeps a small state file, readable only by you, under `~/.local/state/unfold-opencode/` or `~/.local/state/unfold-codex/`.

## When it does not work

| Symptom | Cause | Fix |
| --- | --- | --- |
| No session appears | `UNFOLD_URL` or `UNFOLD_TOKEN` is missing from the environment the agent starts with, or the credential expired | Export both in the shell profile, sign in again, and start one session with `UNFOLD_HOOK_DEBUG=1` to see errors on stderr |
| Codex reports nothing | The hooks are not trusted yet | Open `/hooks` in Codex and trust them |
| OpenCode reports every event twice | The plugin file exports more than one function, or both the global and the project folder hold it | Keep one file with the one export |
| A commit shows "no record" | No line in it was written by the session's editing tools, or you use Codex notify | Nothing to fix; only lines the session wrote are attributed |
