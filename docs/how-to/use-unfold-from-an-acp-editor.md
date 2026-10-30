---
type: how-to
audience: [owner, integrator]
owner: unfold
last_verified: 2026-10-30
verified_by: "Read apps/unfold/extensions/acp-agent and src/auth.ts; ran apps/unfold/test/acp-agent.test.ts (a fake ACP client against the deterministic demo and a fake Unfold) and test/editor-sign-in.test.ts. Configuration read against the ACP protocol pages and registry schema, the JetBrains Air and AI Assistant ACP pages and the Zed agent settings on 2026-10-30. No real PhpStorm, Air, Zed or Neovim was run, the npm package is not published and the registry entry is not submitted."
---

# Use Unfold from PhpStorm and other ACP editors

Use this when you work in PhpStorm, JetBrains Air, Zed, Neovim or another editor that speaks the [Agent Client Protocol](https://agentclientprotocol.com) (ACP), and want to follow your Work Items without leaving it. Result: the editor lists **Unfold** as an agent. In its chat you see what waits for you, ask about a Work Item, steer its session and answer the tool permissions its Run asks for. Every spend and every change waits for your yes in the editor's own permission dialog.

The agent is [`unfold-acp-agent`](../../apps/unfold/extensions/acp-agent/README.md). It needs Node.js 22 or later and has no dependencies. It is not on npm yet, so run it from a checkout of this repository (`npm install --global ./apps/unfold/extensions/acp-agent` puts `unfold-acp-agent` on your `PATH`). Once it is published, `npx @webgrip/unfold-acp-agent` does the same.

If you want your editor to report sessions you run with *another* agent, such as Claude Code or Gemini, use the relay instead: [Link your Claude Code sessions](link-claude-code-sessions.md#editors-that-speak-the-agent-client-protocol).

## 1. Sign in once

```sh
UNFOLD_URL=https://unfold.example.org unfold-acp-agent login
```

It prints a link and a code such as `BCDF-GHJK`. Open the link, sign in, and approve only if the page shows **unfold-acp-agent on <your machine>** and the same code; deny it otherwise ([Unfold ADR 0037](../../apps/unfold/docs/adrs/0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md)). The editor credential lasts thirty days and is kept in `~/.config/unfold/acp-agent.json`, readable by you only. Sign it out under **Settings › Signed-in editors**, and run `unfold-acp-agent logout` to forget it on the machine. `UNFOLD_TOKEN` overrides the kept credential, for example in CI.

An editor that offers ACP's terminal sign-in runs this same command for you the first time you pick Unfold.

## 2. Add the agent to your editor

Every editor below starts the agent itself. Give it your Unfold's address with `UNFOLD_URL` or `--url`.

### PhpStorm and other JetBrains IDEs (AI Assistant)

In the AI Chat, open **⋯ › Add Custom Agent**. It opens `~/.jetbrains/acp.json`. JetBrains wants full paths:

```json
{
  "agent_servers": {
    "Unfold": {
      "command": "/usr/bin/node",
      "args": ["/home/you/src/unfold/apps/unfold/extensions/acp-agent/bin/unfold-acp-agent.mjs", "--url", "https://unfold.example.org"]
    }
  }
}
```

Restart the IDE after changing the file. On Windows the command is the full path to `node.exe`; Windows is not tested.

### JetBrains Air

Air reads the same `~/.jetbrains/acp.json`. Unfold needs neither the IDE's MCP server nor yours:

```json
{
  "agent_servers": {
    "Unfold": {
      "command": "/usr/bin/node",
      "args": ["/home/you/src/unfold/apps/unfold/extensions/acp-agent/bin/unfold-acp-agent.mjs", "--url", "https://unfold.example.org"],
      "use_idea_mcp": false,
      "use_custom_mcp": false
    }
  }
}
```

### Zed

In `settings.json` (**Agent Settings › External Agents › Add Custom Agent**):

```json
{
  "agent_servers": {
    "Unfold": {
      "type": "custom",
      "command": "unfold-acp-agent",
      "args": [],
      "env": { "UNFOLD_URL": "https://unfold.example.org" }
    }
  }
}
```

This assumes the global install, so `unfold-acp-agent` is on the `PATH` Zed starts agents with.

### Neovim and other clients

Any ACP client that starts an agent from a command line works: the command is `unfold-acp-agent` (or `node` and the path to `bin/unfold-acp-agent.mjs`) with `--url https://unfold.example.org`.

### Pin a Work Item

Set `UNFOLD_WORK_ITEM` (for example `105`) in the agent's environment to bind every new chat to that Work Item. A client that sends `_meta` on `session/new` can bind one per chat with `{"unfold": {"workItem": "105"}}`.

## 3. Work with it

A new chat follows nothing yet; its first message lists what waits for you. Pick a Work Item with the **Work Item** option in the chat's settings, or with a command:

| You type | What happens |
| --- | --- |
| `/now` | The Work Items that wait for you, with their state and Team |
| `/work 105`, `/work <session id>` or an Unfold link | The chat follows that Work Item, or your workbench session and its Work Item |
| a message, in **Ask** mode, or `/ask …` | An Unfold Ask about the Work Item. The team never reads it. From the record it is free; when the record does not answer, the editor asks you to allow a model call, naming the most it spends and what is left of the Team's Ask Allowance |
| a message, in **Steer** mode, or `/steer …` | After you allow it: a message to your own workbench session for this Work Item, which may spend from its budget, or, when Ploeg runs it without one, a note for its next Run, which costs nothing |
| `/watch` | Streams the session: the agent's messages, its tool calls and checks, and the end of each Run |
| `/propose …` | Drafts new work. It is **not** recorded: nothing is admitted and nothing runs (see below) |

While you watch, a tool permission the Run's harness asks for appears as the editor's permission dialog with **Allow once** and **Deny**, and goes to Unfold as your answer. The request text is written by the agent, not checked by Unfold, so read it. Only the person who runs the session is asked; there is no "always allow". If you close the dialog without choosing, the request keeps waiting in Unfold. A question the agent asks you is answered in Unfold, from the link the chat shows.

Stopping a prompt in the editor (ACP `session/cancel`) only stops the chat from following. It never pauses, cancels or restarts the work.

Answering a Work Item's question, restarting, approving, rejecting or stopping it stay in Unfold and in [`unfold-mcp`](ask-from-an-ai-client.md).

### Delegating from the editor

A delegation from an editor must be a proposed Work Item that waits for a person, never a Run. Ploeg offers no admission that holds a Work Item as proposed yet, so `/propose` only drafts the text and says so. Until then, put the work in your tracker and hand it to a Team from Unfold's **Tasks** page.

## What leaves your machine

Your questions, steer messages and notes, and only after you confirm the ones that act. The agent reads no files in your project and ignores the MCP servers the editor offers it.

## Against the demo

`mise run demo` starts the deterministic demo; point `UNFOLD_URL` at it, no sign-in needed. The chat says it is the demo, and every answer says no model was called and nothing was spent.

## The ACP registry

The [ACP registry](https://agentclientprotocol.com/get-started/registry) lists agents editors can install with one click. The entry for Unfold is kept in [`extensions/acp-agent/registry/unfold/`](../../apps/unfold/extensions/acp-agent/registry/unfold/agent.json), with its 16 × 16 monochrome icon. It points at `@webgrip/unfold-acp-agent` on npm, so it is submitted only after that package is published. Neither has happened.
