---
type: how-to
audience: [owner, operator]
owner: unfold
last_verified: 2026-10-30
verified_by: "Read apps/unfold/extensions/claude-code against the Agent Plugins 1.0.0 specification and schemas at agentplugins/agent-plugins-spec ff8ab5e; ran test/agent-plugin.test.ts. VS Code steps read in the VS Code 1.144.0 source (pluginUrlHandler.ts, marketplaceReference.ts, pluginMarketplaceService.ts, AGENTS_PLUGINS.md). Codex steps read in the openai/codex main branch source on 2026-10-30 (marketplace_cmd.rs, marketplace.rs, plugin_namespace.rs, agent_plugin_config.rs), not the 0.166.0 tag. Copilot CLI steps read in its plugin reference and changelog up to 1.0.105. Cursor and Kiro steps read in their documentation only. No install was run in any of these clients, and no client signed in to unfold-mcp from a plugin."
---

# Install the Unfold plugin in Codex, Cursor, Copilot and VS Code

**Goal:** your agent knows Unfold. It gets two skills, `unfold` (how to use Unfold's MCP tools) and `link-work-item` (link a session to a Work Item), and, when your operator publishes it, the connection to your Unfold's MCP tools. For Claude Code, which also reports sessions and records Agent Trace, follow [Link your Claude Code sessions](link-claude-code-sessions.md#3-install-the-plugin) instead.

One directory, [`apps/unfold/extensions/claude-code`](../../apps/unfold/extensions/claude-code/README.md), is the plugin for every client. Its root `plugin.json` is an [Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md) manifest, which these clients read before any client-specific one. Claude Code reads `.claude-plugin/plugin.json` in the same directory.

Each step says how far it was checked:

* **Source**: read in the client's source code. Not run.
* **Docs**: read in the client's documentation or changelog. Not run.
* **Not checked**: an assumption from the two above.

## What each client gets

| Client | Installs from this repository | Skills | Unfold's MCP tools | Session reporting |
| --- | --- | --- | --- | --- |
| Codex | yes, marketplace (Source) | yes (Source) | from your operator's marketplace, or `codex mcp add` | the separate [Codex reporter](link-opencode-and-codex-sessions.md) |
| GitHub Copilot CLI | yes, marketplace (Docs) | yes (Docs) | from your operator's marketplace, or your own MCP settings | no |
| VS Code (Copilot agent plugins) | yes, `chat.plugins.marketplaces` or an install link (Source) | yes (Source) | from your operator's marketplace, or your `mcp.json` | no |
| Cursor | no, copy the folder (Docs) | yes (Docs) | your `~/.cursor/mcp.json` | no |
| Kiro | no, import the folder (Docs) | yes (Docs) | your Kiro MCP settings | no |

The `brief` skill also loads in every client, but its scripts need Claude Code's `${CLAUDE_PLUGIN_ROOT}`, so it only works in Claude Code. The plugin's hooks stay in Claude Code's format and only Claude Code runs them. Portable hooks wait for the specification ([agent-plugins-spec #89](https://github.com/agentplugins/agent-plugins-spec/pull/89), a draft).

## Why the MCP connection is a second plugin

The `unfold` plugin ships no `mcp.json`, because it works with any Unfold installation. Agent Plugins 1.0.0 forbids placeholders in a remote server's `url` and has no field for an OAuth client id, so an `mcp.json` names exactly one installation. An operator therefore generates a small second plugin, `unfold-mcp`, whose `mcp.json` names their own unfold-mcp endpoint, and publishes it next to the pinned `unfold` plugin ([below](#for-operators-publish-a-marketplace-for-your-installation)). It holds no credential. Each client signs you in through the browser itself.

Sign-in needs a client id when the identity provider supports neither Dynamic Client Registration nor Client ID Metadata Documents. Authentik, which [Serve Unfold's MCP tools over HTTPS](serve-unfold-mcp-over-https.md) uses, supports neither, so the client must send `unfold-mcp`:

* **VS Code** asks you for a client id and secret when registration fails (Source). Enter `unfold-mcp` and leave the secret empty.
* **Codex** has no prompt (Source). Add the server yourself with the client id, as below.
* **Copilot CLI** has a static client id setting (Docs). Whether it prompts for one: Not checked.
* **Cursor** and **Kiro** take a client id only in their own MCP settings (Docs), so add the server there.

## Codex

```sh
codex plugin marketplace add https://forgejo.webgrip.dev/webgrip/unfold.git
codex plugin add unfold@unfold
```

Source: Codex accepts any HTTPS git URL as a marketplace, reads `.claude-plugin/marketplace.json` when the repository has no `.agents/plugins/marketplace.json`, and takes the root `plugin.json` over `.claude-plugin/plugin.json`. Codex was not run against forgejo.webgrip.dev.

For the MCP tools without an operator marketplace:

```sh
codex mcp add unfold --url https://unfold.example.com/mcp --oauth-client-id unfold-mcp
```

Source: the `--url` and `--oauth-client-id` flags. Not run.

## GitHub Copilot CLI

```sh
copilot plugin marketplace add https://forgejo.webgrip.dev/webgrip/unfold.git
copilot plugin install unfold@unfold
```

Docs: Copilot CLI reads `.claude-plugin/marketplace.json` after `marketplace.json`, `.plugin/marketplace.json` and `.github/plugin/marketplace.json` (this repository has none of those), and a root `plugin.json` with the Agent Plugins `$schema` takes precedence. The reference shows only github.com URLs; a Forgejo URL is Not checked.

## VS Code

Add the marketplace to your user settings, then install **unfold** from the **Agent Customizations** editor, or with **Chat: Install Plugin from Source**:

```json
"chat.plugins.enabled": true,
"chat.plugins.marketplaces": ["https://forgejo.webgrip.dev/webgrip/unfold.git"]
```

Source: VS Code accepts an HTTPS URL as a marketplace, with or without `.git`, and `#<ref>` after it pins a branch, tag or commit. It reads the same `.claude-plugin/marketplace.json`. Its Claude agent harness gets only remote MCP servers from an Agent Plugins package, not the skills.

### An install link

VS Code 1.144 opens `vscode://chat-plugin/install?source=<marketplace>&plugin=<name>`. Put it behind a button on your own page:

```html
<a href="vscode://chat-plugin/install?source=https%3A%2F%2Fforgejo.webgrip.dev%2Fwebgrip%2Funfold.git&plugin=unfold">Install the Unfold plugin in VS Code</a>
```

Source:

* The `source` value may be `owner/repo`, an HTTPS or SSH git URL, or either one base64-encoded. Percent-encode a URL, as above.
* VS Code refuses a `file://` source and a plugin name with `@`.
* It asks you to confirm, and needs `chat.plugins.enabled`.
* The link works only through a Copilot agent host session, and offers to create one. The Copilot agent host adds the marketplace and installs the plugin, not VS Code itself.

Not checked: whether the Copilot agent host clones a non-GitHub URL from a link. Use the setting above when the link fails.

## Cursor

Cursor imports team marketplaces from GitHub, GitLab, Bitbucket and Azure DevOps only (Docs), so copy the plugin in:

```sh
git clone https://forgejo.webgrip.dev/webgrip/unfold.git
mkdir -p ~/.cursor/plugins/local
cp -R unfold/apps/unfold/extensions/claude-code ~/.cursor/plugins/local/unfold
```

Then run **Developer: Reload Window** and check **Customize**. Docs: Cursor loads an Agent Plugins package from that folder, and follows a symbolic link only when it points inside the folder, so copy rather than link. Whether Cursor also runs the Claude Code `hooks/hooks.json` of an Agent Plugins package is Not checked. Without `UNFOLD_URL` and `UNFOLD_TOKEN` the hook script exits silently.

Add the MCP tools in `~/.cursor/mcp.json`, as in [Serve Unfold's MCP tools over HTTPS](serve-unfold-mcp-over-https.md#3-connect-a-client).

## Kiro

In the Powers panel choose **Add Custom Power**, then **Import power from a folder**, and pick `apps/unfold/extensions/claude-code` in a clone of this repository. Docs: Kiro reads the root `plugin.json`, `skills/` and `mcp.json` as a power and documents GitHub-only imports. Its documentation names no precedence over `.claude-plugin/`.

## For operators: publish a marketplace for your installation

Generate a marketplace that pins the `unfold` plugin to one Unfold commit and adds `unfold-mcp` with your endpoint. The URL is the `UNFOLD_MCP_RESOURCE` your Unfold serves unfold-mcp on:

```sh
UNFOLD_MCP_RESOURCE=https://unfold.example.com/mcp \
  node apps/unfold/scripts/agent-plugin-marketplace.mjs \
  --sha "$(git rev-parse 'unfold-v0.4.0-rc.125^{commit}')" \
  --out ../your-agent-plugins
```

It writes five files:

* `.claude-plugin/marketplace.json` with a `git-subdir` entry, which VS Code, Codex and Copilot CLI 1.0.102 or later accept, pinned by the full 40-character `sha`;
* `unfold-mcp/plugin.json`;
* `unfold-mcp/mcp.json`, one `streamable-http` server named `unfold` with your URL and no headers;
* `unfold-mcp/.claude-plugin/plugin.json` and `unfold-mcp/.mcp.json` for Claude Code, which reads neither of the two above: one `http` server named `unfold` with your URL and `oauth.clientId`. `--client-id` sets it, `unfold-mcp` by default. Claude Code then connects on protocol 2026-07-28, where `unfold_hand_off` can become an MCP task ([Follow hand-offs as tasks in a terminal](follow-hand-offs-as-tasks-in-a-terminal.md)).

It refuses a URL that is not HTTPS (except `localhost`), or that carries user information, a query, a fragment or a placeholder, so no credential can end up in it. `--repository` points the pin at your own mirror. It must be an HTTPS URL ending in `.git`, which VS Code requires.

Commit the output to a repository your people can clone, and give them that repository's URL instead of this one in the steps above. Then they install both `unfold` and `unfold-mcp`. To move to a new Unfold release, generate again with the new commit.

## Symptom → cause → fix

| Symptom | Cause | Fix |
| --- | --- | --- |
| The client lists no `unfold` plugin after adding the marketplace | It read another marketplace file first, or skipped the entry | Check that the repository has no `marketplace.json`, `.plugin/marketplace.json` or `.github/plugin/marketplace.json` |
| VS Code skips `unfold` from a generated marketplace | The pin is not a full 40-character commit | Generate again with `git rev-parse <tag>^{commit}` |
| The MCP server fails to sign in, or asks for a client id | Your identity provider registers no clients by itself | Enter `unfold-mcp` when asked, or add the server with that client id in the client's own MCP settings |
| `unfold_*` tools are missing, but the skills are there | No MCP connection | Install `unfold-mcp` from your operator's marketplace, or add the server yourself |
| The install link says plugin links are unavailable | `chat.plugins.enabled` is off, or chat is disabled | Turn it on, or use `chat.plugins.marketplaces` |
