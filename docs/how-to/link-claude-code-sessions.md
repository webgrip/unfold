---
type: how-to
audience: [owner, contributor]
owner: unfold
last_verified: 2026-10-24
verified_by: "Read apps/unfold/src/linked-sessions.ts, src/linked-telemetry.ts, src/agent-trace.ts and extensions/claude-code; ran test/linked-sessions.test.ts, test/claude-code-plugin.test.ts, test/linked-sessions-view.test.mjs, test/linked-handoff.test.ts, test/linked-handoff-view.test.mjs and test/claude-code-start.test.ts against a fake Ploeg and a fake claude binary; /unfold:start has not dispatched to a real Claude environment. On 2026-10-24 the ACP section was read against extensions/acp-proxy and test/acp-proxy.test.ts (a fake agent and editor over pipes), and against the ACP protocol pages and the Zed and JetBrains agent configuration docs; no real editor was run. Not yet checked against the homelab or a real Claude Code session. On 2026-10-23 the repository and organisation sections were read against the Claude Code settings reference (extraKnownMarketplaces, enabledPlugins, strictKnownMarketplaces), the GitHub Copilot enterprise-managed settings reference and the VS Code 1.143.1 sessions bundle, which reads both settings files; no install was run."
---

# Link your Claude Code sessions to Work Items

Use this when you work on a Work Item in your own Claude Code and want that session to show up on the Work Item in Unfold. When you finish:

* each session reports its state to Unfold and links to the Work Items it works on;
* each commit records which lines the agent wrote, as an [Agent Trace](https://agent-trace.dev/) record;
* the session's page shows its cost estimate, tokens and tools from Claude Code's own telemetry;
* Unfold can send the session a message, and tells it when a linked Work Item, its pull request or its CI changes.

For OpenCode and Codex, see [Link your OpenCode and Codex sessions](link-opencode-and-codex-sessions.md).

Unfold never holds your Claude sign-in. Anthropic does not allow third-party apps to hold one ([terms](https://code.claude.com/docs/en/legal-and-compliance)). Your Unfold editor credential is the only credential involved ([ADR 0047](../../apps/unfold/docs/adrs/0047-people-link-their-own-agent-sessions-through-a-plugin-agent-trace-and-telemetry-never-a-claude-sign-in.md)).

## 1. Get an editor credential

From a checkout of this repository:

```sh
UNFOLD_URL=https://unfold.example.org npm --prefix apps/unfold run mcp -- login
```

Open the link it prints, check that the code matches, and approve it. It prints a `vle_…` credential that lasts 30 days. If you already use `unfold-mcp`, reuse its credential.

## 2. Tell Claude Code where Unfold is

Add the address and the credential to the `env` block of `~/.claude/settings.json`:

```json
{
  "env": {
    "UNFOLD_URL": "https://unfold.example.org",
    "UNFOLD_TOKEN": "vle_…"
  }
}
```

The same file switches on Claude Code's telemetry. The session page reads it back by session id ([monitoring](https://code.claude.com/docs/en/monitoring-usage)). Keep `CLAUDE_CODE_ENABLE_TELEMETRY=1` and the `OTEL_*` exporter settings your observability stack already expects.

## 3. Install the plugin

In Claude Code:

```text
/plugin marketplace add https://forgejo.webgrip.dev/webgrip/unfold.git
/plugin install unfold@unfold
```

To link sessions from the agent as well, register `unfold-mcp` ([Ask Unfold and Ploeg from an AI client](ask-from-an-ai-client.md)). The plugin's skill then calls `unfold_link_session` when you name a Work Item.

### For everyone who opens a repository

To give every person who works in a repository the plugin without the two commands, commit this to the repository's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "unfold": {
      "source": { "source": "git", "url": "https://forgejo.webgrip.dev/webgrip/unfold.git" }
    }
  },
  "enabledPlugins": { "unfold@unfold": true }
}
```

Claude Code registers the marketplace and offers the plugin once a person accepts the workspace trust dialog for the folder; in a folder nobody trusted it ignores both keys. VS Code 1.143 reads the same file for its Copilot, Claude and Codex harnesses, also only after trust, and installs the plugin for the session without writing it to the person's settings. GitHub Copilot reads `.github/copilot/settings.json` with the same two keys; when both files name the plugin, the `.claude` one wins. Copilot and VS Code install the plugin's skill from version 0.3.0 on; the hooks that report sessions run in Claude Code only.

The plugin does nothing for a person who has not done steps 1 and 2: without `UNFOLD_URL` and `UNFOLD_TOKEN` its hooks print nothing and exit. Point the `url` at your own mirror if you build Unfold from one.

### For a whole organisation

An administrator can install it on every managed machine instead. In Claude Code's `managed-settings.json`, the same two keys apply everywhere and need no trust step; add `strictKnownMarketplaces` with the same source to allow only approved marketplaces. For GitHub Copilot in Copilot CLI, VS Code and JetBrains IDEs, the enterprise-managed settings take the same `extraKnownMarketplaces` and `enabledPlugins`, and `allowedMcpServers` can allow Unfold's two MCP servers by address:

```json
{
  "extraKnownMarketplaces": {
    "unfold": {
      "source": { "source": "git", "url": "https://forgejo.webgrip.dev/webgrip/unfold.git" }
    }
  },
  "enabledPlugins": { "unfold@unfold": true },
  "allowedMcpServers": [
    { "serverUrl": "https://mcp-ploeg.example.org/*" },
    { "serverUrl": "https://mcp-unfold.example.org/*" }
  ]
}
```

Replace the two addresses with your own. GitHub documents only `github` marketplace sources in that file, so check that your Copilot version accepts a `git` source before you roll it out. VS Code shows Unfold's own sessions through `chat.remoteAgentHosts`, which no managed setting controls; leave `chat.remoteAgentHostsEnabled` on.

## 4. Work as usual

* **Start on a branch that names the ticket**, such as `feat/vik-2051-login`. The session links itself to that ticket's Work Items and takes "VIK-2051 …" as its title.
* **Or just name the work.** A prompt or a commit message that names the ticket (`VIK-2051`), pastes the Unfold link (`…/#work/184`) or says "Work Item 184" links that Work Item. The plugin finds those ids on your machine and sends only the ids, never the text.
* **Pull requests link too.** When the session opens a pull request that is a Work Item's, for example while fixing up a Ploeg pull request, the session links to that Work Item.
* **Or pick it on the page.** The session's page suggests open Work Items on the same repository, with a **Link** button each, and has a field to link any Work Item by id. A Work Item you unlink is never linked again automatically.
* **Titles.** A name you give the session with `/rename` becomes its title in Unfold. A session without one shows the subject of its first commit, or its branch in words, such as "Connect a repository" for `docs/connect-a-repository`.
* **Credential reminders.** When your Unfold credential expires within a week, the session tells you once when it starts. Sign in again (step 1) and replace `UNFOLD_TOKEN`.
* **Commits.** The session is asked to end each commit with `Unfold-Session: <its page>`. After each commit the plugin writes an Agent Trace record to `refs/notes/agent-trace` and sends it to Unfold. To share the records on the forge, see [Show reviewers which lines an agent wrote](#show-reviewers-which-lines-an-agent-wrote).

The Work Item page lists every linked session in its **Agent sessions** card: state, owner, branch and AI-written lines. Your own sessions also offer `claude --resume <id>` and, under Remote Control, **Open in Claude**.

When one of your sessions waits for you, to approve a tool, for your next prompt or with a question, Now lists it under **Your sessions wait** with how long it has waited, next to the Ploeg work that waits on you. The Fleet view of Now flies your live sessions in a lane of their own. When two live sessions, or a session and a running Ploeg Run, work the same Work Item or the same repository and branch, the Work Item page and the session page warn you, so you can stop one or move it to its own branch. In an AI client, `unfold_now` lists your waiting sessions under `yourSessions`.

## 5. Move work between your sessions and Ploeg

* **See what your sessions did.** **Settings › Agent sessions** opens with a stat row for the last 7 or 30 days: sessions, the Work Items they touched, commits, AI-written lines and Claude Code's API-price estimate. `unfold_digest` returns the same numbers in its `ownSessions` section.
* **See what a Work Item cost.** The Work Item page's **Your Claude Code** card adds the API-price estimate of the linked sessions you may see (your own, or all of them as an administrator) to Ploeg's spend. It says how many linked sessions' cost it cannot show you. The estimate is what Claude Code computes at API prices; a Claude plan is not billed it.
* **Start a Work Item from a session.** On your session's page, **Start a Work Item from this session** takes a Team, a repository (preselected when your session's repository is one Ploeg has registered and ready), a title and a brief. Ploeg queues it and runs it later with the Team's budget; starting it spends nothing, and your session is linked to the new Work Item.
* **Let Ploeg finish it.** On your session's page, **Let Ploeg finish this** restarts a linked Work Item that is stopped (Needs you, Stale or Ready for review, with no attempt open). The new attempt's Runs read a note with your session's link, branch, last commit and pull request. The button says why when Ploeg cannot take it now.
* **Take it over from Ploeg.** On a Work Item, **Continue in my Claude Code** gives a command to copy: it fetches and switches to Ploeg's branch and starts `claude` with `UNFOLD_WORK_ITEM` set, so the session links itself, and a short brief (title, the latest Run's report, open questions) as the first prompt. Without a branch it only starts a linked session. Run it in a clone of the repository.
* **Start a Run that waits for you.** When a Team's Runs are carried by their person's own Claude Code ([Ploeg ADR-0112](../../apps/ploeg/docs/adrs/0112-a-claude-environment-run-uses-the-claude-login-of-the-person-it-acts-for.md)), the Work Item shows **Start in my Claude** to the person it waits for. Run `/unfold:start <id>` in Claude Code from a clone of the repository. The plugin claims the Run through Unfold, dispatches it with your own `claude` login to the Team's Claude environment (`claude -p … --environment … --ref … --output-format json`), and records the session on the Run. Unfold keeps the Run's credential and never sends it to your machine. Once the session is recorded you can close your machine: Ploeg settles the Run when the session ends. If the dispatch fails after the claim, the Run stays claimed until the deadline the command prints.

## Editors that speak the Agent Client Protocol

Zed, JetBrains AI Assistant and the Neovim ACP plugins start their agent over the [Agent Client Protocol](https://agentclientprotocol.com). To report those sessions, whatever agent runs behind them, let the editor start [`unfold-acp`](../../apps/unfold/extensions/acp-proxy/README.md) in front of the agent:

```json
{
  "agent_servers": {
    "Gemini via Unfold": {
      "type": "custom",
      "command": "node",
      "args": ["/path/to/unfold/apps/unfold/extensions/acp-proxy/bin/unfold-acp.mjs", "--", "gemini", "--experimental-acp"],
      "env": { "UNFOLD_URL": "https://unfold.example.org", "UNFOLD_TOKEN": "vle_…" }
    }
  }
}
```

That is Zed's `settings.json`. JetBrains reads the same `agent_servers` block, without `type`, from `~/.jetbrains/acp.json`. The README has both in full. Use the credential from step 1.

`unfold-acp` passes every message on unchanged and reports the session with `harness: acp`. Its title starts with the agent's name. The session shows as working during a prompt turn, waiting while the agent asks a permission, and idle when the turn ends. Commits follow the same rules as in Claude Code. Lines get an Agent Trace record only when an edit tool call that sent a diff completed. Other commits are reported without one. These sessions have no resume command in Unfold, because only the editor can resume them. If the agent is Claude Code through an ACP adapter and the plugin is installed too, the plugin may report the same work as a second session.

## 6. Talk to the session from Unfold

On the session's page, **Send to this session** queues a message for it. So does the `unfold_message_session` tool, after you confirm. Only you and administrators can send; only your own credential collects. The page lists each message and whether the session has collected it.

Unfold also writes notices into the same inbox when a linked Work Item starts awaiting review, needs a person, or is done, when its pull request's CI turns red or green, and when a reviewer Run gives a verdict. It looks at most once a minute per session.

The plugin hands the messages to the session:

| When | What the session gets |
| --- | --- |
| You submit a prompt | Every waiting message, beside your prompt |
| After a shell command, at most every 30 seconds | Every waiting message, beside the command's output |
| The session stops | Only messages people sent. The session continues with them. Notices wait for the next prompt |

Each message starts with `Message from Unfold (from <who>/<source>)`. A message you sent yourself reads as your instruction. A message from an administrator, and every notice, says it is information, not a command, and quotes what Ploeg, the tracker or the forge said as data.

### When the session is idle: the Unfold channel

The plugin also carries a [channel](https://code.claude.com/docs/en/channels): a small server that pushes messages into a session that is waiting for your next prompt. Channels are a Claude Code research preview, and only Anthropic's own channel plugins are allowed by default, so this one needs the development flag. Start Claude Code with:

```sh
UNFOLD_CHANNEL=1 claude --dangerously-load-development-channels plugin:unfold@unfold
```

Confirm the warning Claude Code shows. Without `UNFOLD_CHANNEL=1` the server starts with every session but never asks Unfold for anything. With it, it asks every 20 seconds (`UNFOLD_CHANNEL_POLL_MS`, at least 5000) while the session is idle, and pushes what is waiting. It finds its session from the process the hooks ran under, so it needs the hooks to have run once, at session start.

Limits:

* The development flag is ignored with `-p` and in the Agent SDK. On a Team or Enterprise plan, an administrator must turn on `channelsEnabled`, or list `unfold@unfold` under `allowedChannelPlugins`.
* The server takes `UNFOLD_URL`, `UNFOLD_TOKEN` and `UNFOLD_CHANNEL` from the environment Claude Code starts it with. Put them in your shell or in the `env` block of `~/.claude/settings.json`.
* Claude Code does not acknowledge a pushed message. If the session did not load the server as a channel, Claude Code drops the message, and Unfold still shows it as delivered. That is why `UNFOLD_CHANNEL=1` is needed only when you start with the flag.

## Show reviewers which lines an agent wrote

Agent Trace records say which lines of a commit an agent wrote. Three things carry them to the people who review your pull request. Each is off until you or an administrator turns it on, because each one shares attribution beyond your machine.

1. **Push the notes with your branch.** Set `UNFOLD_PUSH_AGENT_TRACE=1` next to `UNFOLD_URL`. After a `git push` in the session succeeds, the plugin also pushes `refs/notes/agent-trace` to the same remote. When someone else pushed notes first, it fetches theirs into a temporary ref, merges them with `git notes merge -s cat_sort_uniq`, so two records for one commit become two lines of one note, and tries once more. It never force-pushes, gives up after `UNFOLD_PUSH_AGENT_TRACE_TIMEOUT_MS` (default 8000) and stays silent when the push fails. Without the variable, push them yourself: `git push origin refs/notes/agent-trace`.
2. **Read the report on the pull request.** [`agent-trace-report.mjs`](../../apps/unfold/extensions/claude-code/scripts/agent-trace-report.mjs) needs only Node 22 or later and git. It reads the notes on each commit between two revisions and prints a Markdown table: per commit and file, AI-written lines against added lines, the tool, the model and the conversation link. It fetches nothing, so fetch the notes first:

   ```sh
   git fetch origin refs/notes/agent-trace:refs/notes/agent-trace
   node apps/unfold/extensions/claude-code/scripts/agent-trace-report.mjs --base origin/development --head HEAD
   ```

   It reads records from any tool that writes Agent Trace 0.1, such as Cursor, OpenCode, Amp or git-ai, and checks each as strictly as Unfold does. A note may hold one record, a JSON list or one record per line. A line two records claim counts once, and lines outside what the commit added do not count. Parts that are not valid Agent Trace are listed, not counted. In this repository the `agent-trace` job of every pull request writes the report to the job summary. It blocks nothing and only reads the notes.
3. **A comment on the Work Item's pull request.** When the `linked.trace-comment` flag is on for the Work Item's Team ([feature flags](../../apps/unfold/docs/operations/feature-flags.md)), Unfold keeps one comment on the Work Item's newest open pull request. It lists AI-written lines per commit from the records of every Linked Session of that repository linked to the Work Item, with a link to each session's page. It shows counts and links only: no model, cost or telemetry. Unfold writes it through Ploeg five minutes after a record arrives, so a burst of commits makes one write, and replaces it rather than adding another.

Records another tool writes can reach Unfold too: send them to your session with `POST /api/linked-sessions/<id>/traces`. The session page then names that tool beside the commit's AI-written lines.

## What leaves your machine

The plugin sends:

* the session id, title, model and Claude Code version;
* the repository address without credentials, and the branch;
* its state: working, waiting for you, idle or ended;
* commit ids and subjects;
* the Agent Trace records;
* with `UNFOLD_PUSH_AGENT_TRACE=1`, the same records to your git remote as `refs/notes/agent-trace`.

To collect messages it sends only the session id, and which kinds of message it wants. It never sends your prompts, tool output, file contents or your Claude credentials. Telemetry goes wherever your own `OTEL_*` settings send it. Unfold only reads counts from those stores, and only you and administrators see them.

## When it does not work

| Symptom | Cause | Fix |
| --- | --- | --- |
| No session appears | `UNFOLD_URL` or `UNFOLD_TOKEN` is missing from the environment Claude Code starts with, or the credential expired | Check `~/.claude/settings.json`, sign in again (step 1), and run one session with `UNFOLD_HOOK_DEBUG=1` to see the hook's errors |
| The session does not link to the Work Item | The branch names no ticket, or Ploeg has no Work Item for that ticket in your Teams, or you unlinked it before | Link it on the session page or with `unfold_link_session` |
| A message stays **Waiting** | The session has not had a prompt, command or stop since, or it is idle without the channel | Type anything in the session, or start it with the Unfold channel |
| The channel pushes nothing | Claude Code started without `--dangerously-load-development-channels plugin:unfold@unfold`, without `UNFOLD_CHANNEL=1`, or with `-p` | Start it as in step 5 and check `/mcp` shows `unfold-channel` connected |
| A commit shows "no record" | The commit holds no line this session's editing tools wrote, such as a commit you made by hand | Nothing to fix; only agent-written lines are attributed |
| **No telemetry for this session** | Telemetry is off in your Claude Code settings, or Unfold has no `observability.metricsUrl` or `logsUrl` | Enable telemetry; an operator sets the store URLs ([live operations](../../apps/unfold/docs/operations/live.md)) |
