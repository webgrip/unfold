---
type: how-to
audience: [owner, contributor]
owner: unfold
last_verified: 2026-10-30
verified_by: "Read the Claude Code MCP page (section 'MCP tasks that run on the server'), the plugin manifest reference and the environment variable reference on 2026-10-30. Pointed Claude Code 2.1.310's `claude mcp list` at a local stdio server and a local HTTP server that log what they receive: both got `server/discover` with protocol 2026-07-28 first. Loaded the `unfold-mcp` plugin that apps/unfold/scripts/agent-plugin-marketplace.mjs generates with `claude --plugin-dir`: `claude plugin validate` passed, the server `plugin:unfold-mcp:unfold` connected on 2026-07-28, sat beside the `unfold` plugin's channel server, and was hidden while a user-scope server had the same URL. Ran apps/unfold/extensions/vscode/test/claude-terminal.test.ts and apps/unfold/test/agent-plugin.test.ts. Not run: the OAuth sign-in through the generated plugin, a real hand-off that became a task, and the VS Code command in a real editor."
---

# Follow your hand-offs as tasks in a terminal

Use this when you hand tracker tasks to a Ploeg Team from Claude Code with `unfold_hand_off` and want to follow them as [MCP tasks](https://code.claude.com/docs/en/mcp#mcp-tasks-that-run-on-the-server). Result: Claude Code runs in a terminal, connected to your Unfold's `unfold-mcp` over HTTPS on protocol revision 2026-07-28, and each hand-off shows in its footer (`1 MCP task`) and under `/tasks`. What a task then shows, and how to answer an agent's question from it, is in [Follow a hand-off as a task](ask-from-an-ai-client.md#follow-a-hand-off-as-a-task).

## Where tasks show

| Where you run Claude Code | MCP tasks |
| --- | --- |
| A terminal, including VS Code's integrated terminal, on Claude Code 2.1.304 or later | Yes |
| The Agent SDK and GitHub Actions | Yes, according to Claude Code's documentation |
| The Claude Code panel of the VS Code extension | No |
| The Claude Code desktop app | No |
| A one-shot `claude -p "<prompt>"` | No |

A hand-off becomes a task only when all of these hold:

* Claude Code is 2.1.304 or later, in a terminal session, and the main conversation calls the tool, not a subagent.
* Claude Code reaches `unfold-mcp` over HTTPS. The stdio server from a checkout never answers with a task.
* The connection uses protocol revision 2026-07-28. `MCP_PROTOCOL_NEGOTIATION=legacy` or `MCP_SDK_GENERATION=v1` keeps every server on the 2025 handshake.
* Claude Code fetches feature flags. `DISABLE_TELEMETRY`, `DO_NOT_TRACK`, `DISABLE_GROWTHBOOK`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, Amazon Bedrock, Google Cloud and Microsoft Foundry each turn that off.
* The `mcp.tasks` flag is on for you in Unfold ([feature flags](../../apps/unfold/docs/operations/feature-flags.md)). It is off by default.

## 1. Update Claude Code

```sh
claude --version
claude update
```

You need 2.1.304 or later.

## 2. Connect unfold-mcp to the CLI over HTTPS

Use one of these. Both sign you in through the browser and keep the token in Claude Code's own credential store, never in a configuration file. Claude Code 2.1.310 asks the server for 2026-07-28 first, and `unfold-mcp` answers it.

* **From your installation's marketplace.** When your operator [published one](install-the-unfold-plugin.md#for-operators-publish-a-marketplace-for-your-installation), install `unfold-mcp` next to `unfold`: `/plugin install unfold-mcp@<marketplace>`. Its `.mcp.json` names your Unfold's endpoint and the `unfold-mcp` OAuth client.
* **By hand:**

  ```sh
  claude mcp add --scope user --transport http --client-id unfold-mcp unfold https://<your Unfold>/mcp
  ```

Then run `/mcp` in `claude`, choose the server and **Authenticate**.

When both are set up with the same address, Claude Code keeps your own server and hides the plugin's. A stdio `unfold` server from a checkout ([Ask from an AI client](ask-from-an-ai-client.md#unfold)) gives no tasks and keeps its `vle_…` credential in plain text in `~/.claude.json`; remove it with `claude mcp remove unfold -s user` before you add the HTTPS one under the same name.

The `unfold` plugin's channel server (`unfold-channel`) stays on the 2025 handshake by itself. Leave `MCP_PROTOCOL_NEGOTIATION` unset; `legacy` would turn tasks off for every server.

## 3. Open Claude Code in a terminal

In VS Code, run **Unfold: Follow Hand-offs in a Claude Code Terminal** from the Command Palette. It:

1. runs `claude --version`, and if `claude` is missing (also checked in `~/.local/bin`) or older than 2.1.304, says so and offers the install guide or `claude update` instead of opening a terminal;
2. runs `claude mcp list` in the workspace and looks for a server named `unfold` (any scope, or a plugin's) or one on your workbench's host;
3. writes one line per check to the **Unfold: Claude Code** output: the Claude Code version, the `unfold-mcp` server, its transport and state, whether 2026-07-28 would be negotiated, and whether anything in VS Code's environment or the `env` block of `~/.claude/settings.json` turns tasks off. It does not read the `mcp.tasks` flag;
4. opens an integrated terminal in the first workspace folder and starts `claude` there. Without an `unfold-mcp` server it offers to copy the `claude mcp add` command for your workbench.

Outside VS Code, run `claude` in any terminal.

## 4. Hand off

Ask Claude to hand a task to a Team, for example "hand VIK-123 to the backend Team in Unfold", and confirm the question Claude Code shows. The footer counts the task and `/tasks` lists it. A task on a remote server keeps running after you leave `claude`; resume the same session to follow it again. `x` in `/tasks` stops following it, never the Work Item.

## When it does not work

| Symptom | Cause | Fix |
| --- | --- | --- |
| The hand-off answers at once and `/tasks` stays empty | The VS Code panel or the desktop app, a version before 2.1.304, a stdio server, a setting above, or `mcp.tasks` off for you | Run the VS Code command; its output names every cause but the flag. Ask your administrator about the flag |
| `plugin:unfold-mcp:unfold` shows "Needs authentication" | Not signed in yet | `/mcp`, choose it, **Authenticate** |
| The plugin's server is missing from `/mcp` | A server you added yourself has the same address | Nothing to fix: yours is used |
| The VS Code command says Claude Code is not installed, but a terminal finds it | VS Code's environment lacks the directory `claude` is in | Start VS Code from that terminal, or put `claude` on the PATH of your login shell |
