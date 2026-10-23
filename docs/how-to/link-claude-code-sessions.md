---
type: how-to
audience: [owner, contributor]
owner: unfold
last_verified: 2026-10-24
verified_by: "Read apps/unfold/src/linked-sessions.ts, src/linked-telemetry.ts, src/agent-trace.ts and extensions/claude-code; ran test/linked-sessions.test.ts, test/claude-code-plugin.test.ts, test/linked-sessions-view.test.mjs, test/linked-handoff.test.ts, test/linked-handoff-view.test.mjs and test/claude-code-start.test.ts against a fake Ploeg and a fake claude binary; /unfold:start has not dispatched to a real Claude environment. Not yet checked against the homelab or a real Claude Code session. On 2026-10-23 the repository and organisation sections were read against the Claude Code settings reference (extraKnownMarketplaces, enabledPlugins, strictKnownMarketplaces), the GitHub Copilot enterprise-managed settings reference and the VS Code 1.143.1 sessions bundle, which reads both settings files; no install was run."
---

# Link your Claude Code sessions to Work Items

Use this when you work on a Work Item in your own Claude Code and want that session to show up on the Work Item in Unfold. When you finish:

* each session reports its state to Unfold and links to the Work Items it works on;
* each commit records which lines the agent wrote, as an [Agent Trace](https://agent-trace.dev/) record;
* the session's page shows its cost estimate, tokens and tools from Claude Code's own telemetry.

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
* **Commits.** The session is asked to end each commit with `Unfold-Session: <its page>`. After each commit the plugin writes an Agent Trace record to `refs/notes/agent-trace` and sends it to Unfold. To share the records on the forge, push them: `git push origin refs/notes/agent-trace`.

The Work Item page lists every linked session in its **Agent sessions** card: state, owner, branch and AI-written lines. Your own sessions also offer `claude --resume <id>` and, under Remote Control, **Open in Claude**.

When one of your sessions waits for you, to approve a tool, for your next prompt or with a question, Now lists it under **Your sessions wait** with how long it has waited, next to the Ploeg work that waits on you. The Fleet view of Now flies your live sessions in a lane of their own. When two live sessions, or a session and a running Ploeg Run, work the same Work Item or the same repository and branch, the Work Item page and the session page warn you, so you can stop one or move it to its own branch. In an AI client, `unfold_now` lists your waiting sessions under `yourSessions`.

## 5. Move work between your sessions and Ploeg

* **See what your sessions did.** **Settings › Agent sessions** opens with a stat row for the last 7 or 30 days: sessions, the Work Items they touched, commits, AI-written lines and Claude Code's API-price estimate. `unfold_digest` returns the same numbers in its `ownSessions` section.
* **See what a Work Item cost.** The Work Item page's **Your Claude Code** card adds the API-price estimate of the linked sessions you may see (your own, or all of them as an administrator) to Ploeg's spend. It says how many linked sessions' cost it cannot show you. The estimate is what Claude Code computes at API prices; a Claude plan is not billed it.
* **Start a Work Item from a session.** On your session's page, **Start a Work Item from this session** takes a Team, a repository (preselected when your session's repository is one Ploeg has registered and ready), a title and a brief. Ploeg queues it and runs it later with the Team's budget; starting it spends nothing, and your session is linked to the new Work Item.
* **Let Ploeg finish it.** On your session's page, **Let Ploeg finish this** restarts a linked Work Item that is stopped (Needs you, Stale or Ready for review, with no attempt open). The new attempt's Runs read a note with your session's link, branch, last commit and pull request. The button says why when Ploeg cannot take it now.
* **Take it over from Ploeg.** On a Work Item, **Continue in my Claude Code** gives a command to copy: it fetches and switches to Ploeg's branch and starts `claude` with `UNFOLD_WORK_ITEM` set, so the session links itself, and a short brief (title, the latest Run's report, open questions) as the first prompt. Without a branch it only starts a linked session. Run it in a clone of the repository.
* **Start a Run that waits for you.** When a Team's Runs are carried by their person's own Claude Code ([Ploeg ADR-0112](../../apps/ploeg/docs/adrs/0112-a-claude-environment-run-uses-the-claude-login-of-the-person-it-acts-for.md)), the Work Item shows **Start in my Claude** to the person it waits for. Run `/unfold:start <id>` in Claude Code from a clone of the repository. The plugin claims the Run through Unfold, dispatches it with your own `claude` login to the Team's Claude environment (`claude -p … --environment … --ref … --output-format json`), and records the session on the Run. Unfold keeps the Run's credential and never sends it to your machine. Once the session is recorded you can close your machine: Ploeg settles the Run when the session ends. If the dispatch fails after the claim, the Run stays claimed until the deadline the command prints.

## What leaves your machine

The plugin sends:

* the session id, title, model and Claude Code version;
* the repository address without credentials, and the branch;
* its state: working, waiting for you, idle or ended;
* commit ids and subjects;
* the Agent Trace records.

It never sends your prompts, tool output, file contents or your Claude credentials. Telemetry goes wherever your own `OTEL_*` settings send it. Unfold only reads counts from those stores, and only you and administrators see them.

## When it does not work

| Symptom | Cause | Fix |
| --- | --- | --- |
| No session appears | `UNFOLD_URL` or `UNFOLD_TOKEN` is missing from the environment Claude Code starts with, or the credential expired | Check `~/.claude/settings.json`, sign in again (step 1), and run one session with `UNFOLD_HOOK_DEBUG=1` to see the hook's errors |
| The session does not link to the Work Item | The branch names no ticket, or Ploeg has no Work Item for that ticket in your Teams, or you unlinked it before | Link it on the session page or with `unfold_link_session` |
| A commit shows "no record" | The commit holds no line this session's editing tools wrote, such as a commit you made by hand | Nothing to fix; only agent-written lines are attributed |
| **No telemetry for this session** | Telemetry is off in your Claude Code settings, or Unfold has no `observability.metricsUrl` or `logsUrl` | Enable telemetry; an operator sets the store URLs ([live operations](../../apps/unfold/docs/operations/live.md)) |
