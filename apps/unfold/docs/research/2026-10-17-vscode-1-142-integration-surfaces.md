# Every integration surface around VS Code 1.142: the full crawl

Research date: 2026-10-17. This companion to [the 1.142 dossier](2026-10-16-vscode-1-142-fit.md) answers the owner's request to follow every link in the [1.142 release notes](https://code.visualstudio.com/updates/v1_142) "so we know for sure we know everything we could integrate with".

The 1.142 dossier read the notes, the agent docs and VS Code's source. This sweep follows every link in the notes. It then follows each agent-related docs page one level deeper and reads three more sources end to end: the Agent Host Protocol site, GitHub's Copilot plugin and canvas documentation, and the Agent Plugins specification.

**Method.** Five crawls ran:

- the notes and their 66 links, all HTTP 200, plus the 47 GitHub issues and pull requests the notes and the 1.143 draft name, and 112 VS Code docs pages;
- all 56 pages and 5 JSON schemas of the [AHP site](https://microsoft.github.io/agent-host-protocol/), with the repository at `1ef06429` (2026-10-17);
- the GitHub Copilot documentation at `github/docs@dae83f7d`, `github/copilot-sdk` v1.0.22, the [awesome-copilot](https://awesome-copilot.github.com/extensions/) contribution rules, and the GitHub Pull Requests extension changelog;
- the [Agent Plugins specification](https://github.com/agentplugins/agent-plugins-spec) 1.0.0 and the 1.1.0 draft;
- `microsoft/vscode` at tag 1.142.0 (`d956e8a6`) and main (`19fd9935`), for every claim about what a remote host or an extension can reach.

The source was checked first-hand for canvases, the agent-host extension methods and the Agents-window extension gate. **(source)** marks evidence from code rather than docs.

**Landing.** This dossier, rows T17 to T22 on the [protocol-gap watchlist](2026-10-13-protocol-integration-gaps.md#watchlist), and a dated sentence on the AHP row of the [protocol ledger](2026-09-11-ecosystem-alternatives.md#appendix-adjacent-components-and-communication-protocols).

## Verdict

The full crawl finds **one new distribution channel worth building now, Agent Plugins**, and three smaller integration surfaces. It also corrects one expectation in the 1.142 dossier. Everything else is VS Code-internal, Copilot-only or GitHub-only.

1. **Agent Plugins 1.0 is an open, publishable format, and 1.143 installs repository-declared plugins without a click.**
   - A plugin is a directory with a root `plugin.json`, `skills/` and an `mcp.json`, plus optional client-specific parts under reverse-domain folders.
   - VS Code, Copilot CLI and the Copilot app all install it from any Git repository acting as a marketplace, Forgejo included.
   - From 1.143 ([#336858](https://github.com/microsoft/vscode/issues/336858), closed), a trusted repository whose `.github/copilot/settings.json` or `.claude/settings.json` enables a plugin gets it installed and activated for that repository only, in the Copilot, Claude and Codex harnesses alike.
   - An Unfold plugin with the session skills and both MCP servers' URLs would reach every developer who opens a repository Unfold works on.
2. **Remote hosts get no canvases. This corrects the 1.142 dossier.** **(source)** VS Code renders `ChatState.canvases` only when `supportsCanvasPresentation` is set. It is set only for the local agent host and only for provider `copilotcli` (`agentHostChatContribution.ts@1.142.0:382`, `localAgentHostSessionsProvider.ts@1.142.0:341`). The remote client implements neither `listSessionCanvases` nor `openSessionCanvas`. The AHP canvas registry ([#528](https://github.com/microsoft/agent-host-protocol/pull/528)) would not change this, because VS Code would still have to lift the gate.
3. **A canvas can still show Unfold, from the person's own Copilot session.** A Copilot canvas extension (`createCanvas` from `@github/copilot-sdk/extension`) returns an `https` URL, and the app or VS Code shows that page beside the chat. Its actions become agent tools. It ships inside a plugin.
4. **The extension can lend Unfold's tools to Copilot sessions.** Tools an extension registers with the finalized `vscode.lm.registerTool` are routed back to the extension when the Copilot harness calls them in an editor window. The admin kill switch is the policy `ChatAgentExtensionTools`.
5. **A remote host can earn a Stop button.** VS Code shows Stop on a background shell whose `_meta['vscode.stopBackgroundWork']` is true and calls `vscode/stopBackgroundWork`. AHP itself has no stop action. 1.143 extends Stop to detached shells.

## What the crawl adds, by owner of the surface

### Open to any host or extension

| Surface | Exact names | Status | Opportunity |
| --- | --- | --- | --- |
| Agent Plugins | root `plugin.json` (`$schema` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`), `skills/`, `mcp.json`; `chat.plugins.enabled`, `chat.plugins.marketplaces`, `chat.pluginLocations`; Copilot-only parts in `com.github.copilot/` | Spec 1.0.0 published; VS Code marketplaces Experimental; repo auto-install from 1.143 | **Build:** recommendation 1 |
| Plugin MCP entries | `{type: "streamable-http", url, headers}`; HTTPS unless loopback; "defines no OAuth configuration"; credentials in headers forbidden | Spec 1.0.0 | The URLs ship in the plugin; the client id `ploeg-mcp` cannot, so VS Code asks once or the extension supplies it ([#383](https://forgejo.webgrip.dev/webgrip/unfold/pulls/383)) |
| Extension tools in agent-host sessions | finalized `vscode.lm.registerTool`; policy `ChatAgentExtensionTools` | Stable; editor window only | **Plan:** recommendation 3 |
| Language-model provider in agent-host sessions | finalized `lm.registerLanguageModelChatProvider`; `chat.agentHost.byokModels.enabled` | Stable | Watch: T19 |
| Agents-window extension opt-in | user setting `extensions.supportAgentsWindow: {"webgrip.unfold": true}`; self-declaring needs proposed `agentsWindowActivation` | Stable setting | **Document:** recommendation 4 |
| Stop for background work | `_meta['vscode.stopBackgroundWork']`; `vscode/stopBackgroundWork {chat, id}` → `{stopped}` | 1.142 attached shells; 1.143 detached | Part of RFC-0006's second target (T12) |
| Other VS Code host extensions | `vscode/moveSession` (gated by `vscode.sessionMove`), `vscode/removeSessionArtifact`, `vscode/importSession`, `vscode/readSavedChat`, `vscode/requestMcpAuthentication`, `vscode.detachedWorktrees` | main; not standardized in AHP (`x-` is AHP's own prefix) | None now; Unfold's sessions live in Ploeg workspaces |
| Pre-registered MCP clients | `McpAuthRequirement.oauthClient {clientId, clientSecret?}`; "clients MUST use it instead of dynamic client registration" | AHP 0.6.0 | Applies to MCP servers *a host runs*. Unfold's host runs none for the person, so none now |
| Session config pickers | `resolveSessionConfig`, `sessionConfigCompletions`, `enumDynamic`, `sessionMutable` | AHP Stable | Already used ([`session-config.ts`](../../src/ahp/session-config.ts)); budget and Work Item pickers fit here |
| Model pricing and usage | `SessionModelInfo._meta.pricing`, `chat/usage`, `UsageInfo` | AHP Stable; no cost field | Watch: T20 |
| Tool-call risk assessment | `ToolCallRiskAssessment` (judge, `safety`) on a pending confirmation | AHP Stable | Watch: T21 |
| Host telemetry | `InitializeResult.telemetry`, `ahp-otlp:`, `otlp/export*` | AHP Stable | None; Ploeg exports to its own OTel stack |
| Automations | `ahp-automations://`, `runAutomation`, host event triggers, `disableConditions` | AHP 1.0 early | Already projected read-only ([`automations.ts`](../../src/ahp/automations.ts)) |
| Remote delegation tools | `chat.remoteSessions.tools.enabled`; `list_agent_hosts`, `create_remote_session` | Experimental, default off | Watch: T22 |

### Copilot-only

| Surface | Exact names | Status | Opportunity |
| --- | --- | --- | --- |
| Canvas extensions | `createCanvas({id, displayName, actions, open() → {url, title, status}})`; `com.github.copilot/extensions/<name>/extension.mjs` inside a plugin | Experimental; Copilot CLI, app, and local Copilot sessions in VS Code (`chat.canvases.enabled`) | **Plan:** recommendation 2 |
| Copilot app deep links | `ghapp://session/new?repo=&branch=&prompt=&mode=`, `ghapp://plugins/install?source=NAME%40MARKET`, `ghapp://plugins/marketplace/add?source=` | Stable; each asks the person to confirm | An "Install the Unfold plugin" link next to the plugin |
| Managed plugins and MCP policy | `enabledPlugins`, `extraKnownMarketplaces`, `strictKnownMarketplaces`, `allowedMcpServers` (`serverUrl` wildcards) | Stable | Agency onboarding: one managed-settings block installs the plugin and allows both servers |
| Copilot hooks | `com.github.copilot/hooks/hooks.json` | Preview | Not for Runs (Ploeg owns approval); not now |
| Artifacts panel | `chat.artifacts.enabled`, rules by MIME type or path | Experimental | No remote-host path; AHP artifacts are draft [#508](https://github.com/microsoft/agent-host-protocol/pull/508) (T14) |

### GitHub-only, so not for a Forgejo or GitLab estate

- Agent Merge (`chat.agentMerge.*`);
- the pull-request form and comments in the Agents window;
- stacked pull requests (GitHub Pull Requests 0.170.0);
- remote control from GitHub.com (`/remote on`);
- cloud sessions;
- awesome-copilot listings ("GitHub-only in v1": a public GitHub repository and an immutable `ref` or `sha`).

### VS Code-internal

Session-scoped layout, panel alignment, the model picker, Compare Models (the attempt grid), moving chats (no remote host is offered `moveChat`), external-session discovery and dev-container sessions.

## Corrections to the 1.142 dossier

- **"What this unlocks later", A Work Item canvas.** A remote host cannot provide a canvas in 1.142 or on main. The trigger is VS Code setting `supportsCanvasPresentation` for remote hosts, not the AHP registry. Watchlist T13 is reworded below.
- **Recommendation 3 (VIK-1653).** Agent-host delivery drops `oauth` from forwarded definitions on 1.142 and main (`agentHostMcpServerSupport.ts:737-738`). The `oauthClientId` change on main (`23f0b8ef434`) touches only the customization migrator. [#383](https://forgejo.webgrip.dev/webgrip/unfold/pulls/383) records the same.
- **Recommendation 7, the agency risk.** Managed `permissions` and `sandbox.enabled` move only `local` chats. **(source)** The Agents window gates remote hosts only on `chat.remoteAgentHostsEnabled`, and neither remote-host setting has a policy (`remoteAgentHost.contribution.ts@1.142.0:59-75`). The risk the dossier named does not exist in 1.142.

## Recommendations

1. **Publish an Unfold Agent Plugin from this repository.** It contains:
   - a root `plugin.json` against the 1.0.0 schema;
   - `skills/` holding the session skills the Claude Code plugin of the [gap dossier's phase 1 item 3](2026-10-13-protocol-integration-gaps.md#6-phased-plan) would ship;
   - an `mcp.json` naming the remote `ploeg-mcp`, and the remote `unfold-mcp` once [#385](https://forgejo.webgrip.dev/webgrip/unfold/pulls/385) is deployed, by URL only.

   Serve a `marketplace.json` from the repository, which works from Forgejo through a `git` source, and pin plugin sources by `sha`. Document three install paths:
   - a repository's `.github/copilot/settings.json` or `.claude/settings.json` with `enabledPlugins`, which installs it automatically from 1.143;
   - `chat.plugins.marketplaces` in VS Code;
   - `copilot plugin marketplace add` and Claude Code's `/plugin`.

   One plugin directory serves VS Code, Copilot and Claude Code, so this replaces a separate Claude Code plugin rather than adding to it. The client id cannot ship in the plugin, so the docs keep the extension command from #383 and the `mcp.json` snippets.
2. **Spike a Work Item canvas as a Copilot canvas extension inside that plugin.**
   - `open()` returns the Work Item page's `https` URL, signed in through the person's browser session rather than a token in the URL.
   - Two actions become agent tools: "show the Work Item for this branch" and "ask Unfold about this Work Item". They are read-only; the ask is metered through the Ask Allowance.
   - It runs only where the Copilot harness runs, and the SDK marks it `@experimental`, so it is a spike with a named decision, not a feature.
3. **Register Unfold's read tools through `vscode.lm.registerTool` in the extension.**
   - Copilot-harness sessions in the editor window could then read a Work Item's state and its review decision without an MCP server. That covers people whose MCP policy blocks remote servers.
   - Keep it read-only. Anything that spends or decides stays in Unfold's own review gate.
   - Feature-detect it so `engines.vscode` stays `^1.99.0`.
4. **Document the Agents-window opt-in.** Add `extensions.supportAgentsWindow: {"webgrip.unfold": true}` to the walkthrough and the extension README. That closes the second half of [1.141 recommendation 10](2026-10-08-vscode-1-141-fit.md#recommendations), still to be checked in the desktop pass ([VIK-1922](https://vikunja.webgrip.dev/tasks/1922)).
5. **Write the agency onboarding block.** One managed-settings example:
   - `extraKnownMarketplaces` with the Unfold marketplace;
   - `enabledPlugins` with the Unfold plugin;
   - `allowedMcpServers` with `serverUrl` wildcards for both MCP servers.

   It belongs in the agency documentation of [Who Unfold is for](../../../../docs/concepts/who-unfold-is-for.md) once the plugin exists.
6. **Adopt nothing else from the crawl.** Canvases on the remote host, artifacts and move-session are blocked or not standardized. Agent Merge and stacked pull requests are GitHub-only. Hooks and the attempt grid belong to other harnesses.

## Watchlist additions

| Id | Item | Trigger |
| --- | --- | --- |
| T13 (reworded) | A Work Item canvas from the host | VS Code sets `supportsCanvasPresentation` for remote agent hosts, or implements `listSessionCanvases` on the remote client |
| T17 | Repository-declared Unfold plugin | VS Code 1.143 ships [#336858](https://github.com/microsoft/vscode/issues/336858); verify `.claude/settings.json` installs it in all three harnesses |
| T18 | OAuth client id in plugins | Agent Plugins 1.1 or later adds OAuth configuration to `mcp.json` |
| T19 | A Ploeg-budgeted model provider in the extension | An owner decision that people's own agents should spend through Ploeg's gateway; against the gap dossier's rule that no harness bypasses it, this would route through it |
| T20 | Ploeg prices in the model picker | AHP adds a cost field to `UsageInfo`, or VS Code renders `_meta.pricing` |
| T21 | Ploeg's reviewer as a tool-call risk judge | VS Code renders `ToolCallRiskAssessment` from a remote host |
| T22 | Unfold as a delegation target | `chat.remoteSessions.tools.enabled` defaults on, and `create_remote_session` accepts a third-party host |

## Not verified

- Nothing in this dossier was run. Plugin install, the canvas, extension tools in a Copilot session and the opt-in setting each need the desktop pass.
- Whether the remote client renders annotations, changeset review, automations, MCP Apps or terminals from a third-party host beyond what the 1.142 dossier records. The crawl only listed which commands `agentHostProtocolClient.ts` sends.
- The canvas folder layout inside an Agent Plugins plugin comes from a third-party plugin and awesome-copilot's contribution rules, not from GitHub's documentation.
- AHP documentation contradicts itself on `disposeChat`, and the README links a missing `guide/clients-multi-host` page.
