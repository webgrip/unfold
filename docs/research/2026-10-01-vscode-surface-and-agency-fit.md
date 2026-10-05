# The surface Glide shares with VS Code, and who it serves

Research date: 2026-10-01. This record follows [the VS Code 1.140 fit dossier](../../apps/unfold/docs/research/2026-10-01-vscode-1-140-fit.md). That dossier asked what 1.140 changes. This one asks how much of the surface Glide shares with VS Code it can use, for whom, and in what order.

**Method.** Eight research agents ran in parallel, covering:

- the VS Code extension API at tag 1.140.0;
- the AHP surface the Unfold host does not use;
- VS Code tooling inside Ploeg;
- Copilot CLI and Codex as ACP agents, smoke-tested against a mock gateway;
- server-side AHP hosts;
- harness OpenTelemetry and model routing;
- competitors' editor hand-off;
- the NL agency market.

Claims carry their source link. A claim marked *unverified* rests on a search snippet or a secondary source.

## Owner direction

On 2026-10-01 the owner asked to "leverage as much as possible" of the surface Glide shares with VS Code. This record therefore moves from "what to avoid" to "how to use each piece without breaking Glide's rules":

- Ploeg authorizes every Run.
- A proposal never dispatches.
- Real credentials never enter a Run.
- Native harness state stays opaque.

Where the first dossier said "keep shut", this one says what has to exist first.

## Verdict

Use VS Code as the developer's cockpit, not as an engine. It is also only one of two cockpits.

Four stable surfaces reach the agents that VS Code 1.140 runs on its agent host. Glide can use them today, and none needs a proposed API:

- extension-provided MCP servers;
- extension-contributed skills and custom agents;
- extension tools;
- `vscode://` deep links, Glide's own (through a URI handler) and VS Code's `vscode://agents/new`.

Unfold's AHP host is meant to be a fifth surface, but read against the 1.140 client it cannot yet run a session, and it leaks sessions between users. The fifteen findings are in [the fit dossier](../../apps/unfold/docs/research/2026-10-01-vscode-1-140-fit.md).

The market caps the payoff. Glide's first buyers are PHP agencies, and PHP developers use PhpStorm far more than VS Code:

| Survey | PhpStorm | VS Code |
| --- | --- | --- |
| [JetBrains State of PHP 2025](https://blog.jetbrains.com/phpstorm/2025/10/state-of-php-2025/) | 68% | 23% |
| [State of Laravel 2025](https://stateoflaravel.com/results) | 48% | 44% |

So every VS Code surface needs a JetBrains counterpart. That counterpart is ACP, which JetBrains and Zed use for external agents and which Ploeg already speaks south.

The opening is unchanged and still unmeasured:

- No competitor sells "tickets to review-ready pull requests, per agency, across client forges, billed per accepted ticket".
- None of them supports Forgejo or Gitea.
- None of them has client approval.

## Who touches what

| Person (phase) | Where they work | What VS Code can give them |
| --- | --- | --- |
| Owner, and the employer's developers (phase 1) | VS Code or PhpStorm, the forge, Vikunja or ClickUp | Takeover, evidence, Glide tools inside their own agent, Needs-you attention |
| Agency developer and reviewer (phase 2) | Same as phase 1, with the agency's forges (GitLab self-managed is common) | Same as phase 1, inside their Tenant |
| Dev lead (phases 1 and 2) | Browser, sometimes the editor | All Work Items in the Agents window; the browser stays primary |
| Account manager (phase 2) | Browser and tracker | Nothing in the editor |
| Client (phase 2) | Client Portal and Preview Environment | Never the editor ([ADR-0007](../adr/adr-0007-clients-approve-ready-work.md)) |

## Market facts that bear on fit

**Editors.** In [Stack Overflow 2025](https://survey.stackoverflow.co/2025/technology), 75.9% of all developers use VS Code, as do 76.2% of professionals. PHP is the exception (table above). A VS Code-only integration misses half to two-thirds of PHP agency developers.

**Agent use.** The [JetBrains agent adoption survey 2026](https://blog.jetbrains.com/research/2026/08/ai-coding-agent-adoption-2026/) (n > 15,000) found:

- 90% of developers use agents at work weekly.
- Claude Code is used at work by 39% (and is the primary tool of 31%).
- Copilot is used by 21%, down from 29%.
- 39% of Copilot users run it inside JetBrains IDEs.

No figure exists for Agents window adoption.

**Forges.** In State of Laravel 2025, GitHub is used by 83.9%, GitLab by 23.2%, Bitbucket by 18.0%, and a self-hosted forge by 11.8%. GitHub's own cloud agent "only works with repositories hosted on GitHub" ([docs](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent)).

**Dutch agencies.**

- [DDA](https://dutchdigitalagencies.com/over-ons/) has 146 member agencies. Its 2024 benchmark ([Emerce](https://www.emerce.nl/nieuws/omzet-nederlandse-digital-agencies-12-miljard-euro)) counts €1.2 billion revenue and 7,701 FTE, down from 8,390. Nearly all use AI, and 58% have not adjusted pricing.
- The [Simplicate benchmark](https://www.emerce.nl/nieuws/105-euro-per-uur-helft-tijd-nietproductief) (about 550 agencies of 5 to 120 people) finds an average €105 per hour and 55% billable time.
- [Computable](https://www.computable.nl/2026/09/24/door-ai-nemen-it-dienstverleners-afscheid-van-het-uurtje-factuurtje/), 2026-09-24, quotes ABN Amro: "who keeps selling hours sees AI eat into revenue; who takes responsibility for the result can earn more from it".
- [Productive's 2026 pulse](https://productive.io/reports/agencies-in-the-ai-era-pulse-report/) (174 agencies, 54% of them in Europe) finds 61% unsure about their pricing model.

That is the per-ticket billing thesis of [ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md), seen from the buyer's side.

**Sub-processing.** A hosted Glide is the agency's sub-processor under GDPR article 28. The model provider sits below Glide ([analysis](https://www.juridischadviesvoorbedrijven.nl/blog/2026/saas-ai-functies-subverwerker-artikel-28-avg)).

## How competitors hand work to the editor

| Product | Takeover in the editor | Mechanism | Non-GitHub forges | Agency features |
| --- | --- | --- | --- | --- |
| [GitHub Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/agent-management) | "Open in VS Code" | Copilot plus the GitHub Pull Requests extension; Agents window session targets | None | Cost centers, per-user budgets |
| [Cursor](https://cursor.com/docs/cloud-agent) | Moves an agent between cloud and local in its own Agents window | Proprietary editor; ACP only for the local CLI | GitLab including self-hosted, Bitbucket, Azure DevOps | None |
| [Devin](https://docs.devin.ai/cli/handoff.md) | `/pickup` checks out the pull request branch locally | CLI, SSH, Devin Desktop; ACP for JetBrains and Zed | GitLab self-managed, Bitbucket, Azure DevOps | Per-organization billing separation (Enterprise) |
| [Ona](https://ona.com/docs/ona/editors/vscode) | "Open" connects the editor to the agent's live environment | Extension plus Remote-SSH | GitLab, Bitbucket, Azure DevOps | None |
| [Coder](https://github.com/coder/vscode-coder) | `vscode://coder.coder-remote/open?owner=…&workspace=…` | URI handler plus Remote-SSH | GitLab self-hosted (diff view) | Organizations, AI Gateway budgets |
| [Factory](https://docs.factory.com/ide-integrations.md) | `droid computer ssh` | Extension, SSH; ACP | GitLab via self-managed SCM (Enterprise) | Sub-organizations, dedicated EU deployment |
| [OpenHands Cloud](https://docs.openhands.dev/openhands/usage/key-features.md) | Browser VS Code tab; otherwise the pull request branch | ACP for the local CLI | GitLab, Bitbucket; Forgejo in open source only, undocumented | Organization budgets |
| [Codex cloud](https://learn.chatgpt.com/docs/ide) | Delegate from the IDE extension, apply the result back | Extension (Marketplace and Open VSX); ACP adapter | GitLab in beta (*unverified*) | Enterprise analytics |
| [Zed Delta](https://zed.dev/blog/delta-public-beta) | Shared multiplayer thread | Own app on DeltaDB | None found | None |
| [Amp](https://ampcode.com/manual/orbs), [Jules](https://jules.google/docs/cli/reference), [Warp](https://docs.warp.dev/platform/handoff/) | `amp sync`, `jules remote pull`, `/continue-locally` | CLI or terminal | Warp: GitLab triggers | Warp: team metrics |

Two lessons follow:

1. The best takeovers either open the agent's own environment (Ona, Coder) or check out the agent's branch with its context (Devin, Copilot). A pre-filled prompt alone is the weakest form.
2. Nobody else uses AHP. Unfold's host is the only third-party AHP integration among these products. That costs nothing while `chat.remoteAgentHosts` stays open, and it differentiates nothing either.

## The leverage map

Each surface comes with its status and what Glide puts on it. "Stable" means usable in an extension published to Open VSX or the Marketplace.

| Surface | Status | Glide on it | Rule it must keep |
| --- | --- | --- | --- |
| AHP host (`chat.remoteAgentHosts`) | Undocumented but open; on by default | Unfold sessions today. Ploeg Work Items as sessions once ADR 0023 decides the host's role. Archive and read state; peer chats | Steering reaches the next Round, not the running Run. Archiving is not cancelling |
| `_meta["vscode.remoteSessions"]` and `create_remote_session` | Experimental, off by default | A VS Code agent can delegate a ticket to Glide. The delegated session becomes a **proposed** Work Item waiting for a person | Never dispatches. Ploeg authorizes, a person approves ([ADR-0011](../adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md)) |
| `vscode://agents/new?prompt=&workspace=` | Stable | The fallback "Continue in VS Code" on a Work Item that needs you | Says Glide does not meter work done locally |
| `vscode://agents/agent-host-session/<provider>/<id>` | Source only | Browser link from an Unfold session to the same session in VS Code | Verify it resolves for a remote host first |
| `window.registerUriHandler` (`vscode://webgrip.unfold/…`) | Stable | Take over a Work Item, open a session, the sign-in callback | Validate every parameter. A link never mutates without confirmation |
| Git extension API (`clone`, `createWorktree`, `checkout`) | Stable 1.106 and 1.107; feature-detect | Take over the Work Item's branch locally, in a worktree | Never pushes for the user |
| `lm.registerMcpServerDefinitionProvider` | Stable 1.101 | Provides `ploeg-mcp` to every harness, through VS Code's forwarding to the agent host | Token from SecretStorage. The Copilot harness reaches only local, unauthenticated servers; test each harness |
| `chatSkills`, `chatAgents`, `chatInstructions` | Stable 1.109 and 1.105 | Glide skills (find work, propose a Work Item, read a Run, take over) and a Glide agent limited to Glide tools. They sync to the agent host | Skills call `ploeg-mcp`; they carry no authority of their own |
| Agent Plugins 1.0 package | Stable standard (1.133) | The same skills and MCP entry for Claude Code and Copilot CLI outside VS Code | Distributed from git, not Open VSX |
| `lm.registerTool` | Stable | Editor-context actions: attach the selection or diff to a Work Item instruction, open Run evidence | Only while the window is connected |
| `authentication.registerAuthenticationProvider` | Stable | A `glide` account backed by Authentik with PKCE, replacing the cookie and password | Per-Tenant issuer in phase 2 |
| Tree badges, status bar, Pseudoterminal | Stable | Needs-you count; Run logs streamed from Unfold's SSE | None |
| VS Code Marketplace listing | Distribution | The extension is on Open VSX only (2,904 downloads; [API](https://open-vsx.org/api/webgrip/de-vloer)). Microsoft VS Code users, the Agents window users, cannot find it | Amends [ADR 0021](../../apps/unfold/docs/adrs/0021-the-extension-ships-through-open-vsx-first.md) |
| VS Code agent OTel (`chat.agentHost.otel.*`) | Stable | The owner's own editor traces in the same Tempo as Runs | Personal setting; identity is personal data in phase 2 |
| `git.worktreeSymlinkFolders` | Experimental | Faster worktrees for people working on Glide and on target repositories | Development experience only |
| Dev container agent hosts | Experimental | A `.devcontainer/` for Glide's own repository | Not a Run toolchain path; see the Ploeg rows |
| `chatSessionsProvider`, `agentsWindowActivation`, `authIssuers`, `chatPromptFiles` providers | **Proposed**, Insiders only | Work Items in the Sessions view, the extension in the Agents window, per-Tenant OAuth issuer | Watch only; unpublishable |

Ploeg-side surfaces:

| Surface | Status | Glide on it | Blocking fact |
| --- | --- | --- | --- |
| Copilot CLI as an ACP profile | Works: `copilot --acp` with `COPILOT_PROVIDER_BASE_URL` needs no GitHub login since v1.0.89 (smoke-tested on 1.0.90) | A fifth ACP profile, metered through LiteLLM chat completions | Proprietary licence ([LICENSE.md](https://github.com/github/copilot-cli/blob/main/LICENSE.md)); fine for phase 1; phase 2 needs a check. ACP is in public preview |
| Codex via `codex-acp` | Works against `/v1/responses` with a virtual key (smoke-tested) | A profile for OpenAI-family models | Responses-only. The LiteLLM bridge loses encrypted reasoning and compaction. `codex app-server` is "experimental". LiteLLM [#38176](https://github.com/BerriAI/litellm/issues/38176) (Responses spend not counted in provider budgets) is not in production 1.102.1 |
| One W3C trace per Run | Claude Code `-p` reads `TRACEPARENT`; `CLAUDE_CODE_PROPAGATE_TRACEPARENT=1` forwards it to a proxy; LiteLLM continues an inbound `traceparent`; Codex reads `TRACEPARENT` | Ploeg backlog item 82 becomes small: a root span per Run, the trace context into the harness, the worker's LLM proxy adding `traceparent` | Goose, opencode and OpenHands do not read an inbound `TRACEPARENT` (*code search, possibly incomplete*) |
| Live attach to a running Run over AHP | Possible: `@ahpd/agent-acp` wraps an ACP agent and serves AHP (MIT, single maintainer, three weeks old) | A human watching a Run live from VS Code | Proposed ADR 0023 rejects live attach. R6 keeps durable state out of the worker. `code agent host` is excluded by the [VS Code Server licence](https://code.visualstudio.com/license/server) |
| Cascade or critique routing | LiteLLM Auto Router v2 (complexity tiers); research shows routing at session start only ([Harness Tokenomics](https://arxiv.org/abs/2609.28919)) | A per-Role tier rule, not mid-Run switching | [ADR-0039](../../apps/ploeg/docs/adrs/0039-a-run-calls-only-its-roles-model-and-the-advisor-waits-for-metering.md): a Run calls only its Role's model; per-model spend attribution first |
| Toolchain from `devcontainer.json` | `@devcontainers/cli` needs a container engine. `envbuilder` is in maintenance mode. kaniko is archived | An operator-run build job turns a repository's devcontainer into a toolchain image, mounted the [ADR-0035](../../apps/ploeg/docs/adrs/0035-runs-get-ploeg-owned-skills-mounted-toolchains-and-worker-verification.md) way | Repository-supplied build code is arbitrary code; registry egress |
| Multi-repository work | VS Code multi-folder sessions; nobody ships multi-repo pull requests | A planner splits an item into linked per-repository Work Items | [ADR-0014](../../apps/ploeg/docs/adrs/0014-work-target-is-a-work-item-attribute.md): one repository per Work Item |
| JetBrains through ACP north | JetBrains AI Assistant and Air run ACP agents as local subprocesses ([docs](https://www.jetbrains.com/help/ai-assistant/acp.html)) | A `glide` ACP agent that lists, reads, proposes and takes over Work Items from PhpStorm | Local-only. Needs `ploeg-mcp`'s read and propose model behind it |

## Journeys

Each journey names its persona, trigger, steps, surfaces, and what exists today. The tickets for the missing parts are listed at the end.

### J1. Take over a Work Item that needs you (phase 1; the most valuable)

- **Persona:** owner or agency developer.
- **Trigger:** the Work Item page says *Needs you*, for example "Budget ran out — Finish the work by hand".
- **Steps:**
  1. Click **Continue in VS Code**.
  2. The link `vscode://webgrip.unfold/take-over?item=…` opens the extension.
  3. The extension finds or clones the repository through the git API and creates a worktree on the Work Item's branch.
  4. It opens that folder and writes the brief, the stop reason and the evidence links into a file next to the code.
  5. It offers `vscode://agents/new` with that context as the prompt, so the developer's own agent can continue.
  6. The developer pushes. Ploeg's review reconcile sees the pull request.
- **Exists:** the stop reasons and "Finish the work by hand" text in `apps/unfold/public/core/reasons.js`.
- **Missing:** the button, the URI handler, and the git takeover.
- **JetBrains:** the same via the ACP agent's `take_over` tool, or a plain `git` command shown on the page.

### J2. See every Work Item from the Agents window (phase 1, then phase 2 for a dev lead)

- **Trigger:** a morning check or an attention badge.
- **Steps:**
  1. Attach with **Attach as Agent Host**.
  2. Work Items appear as sessions: `InputNeeded` for *Needs you*, Done when merged.
  3. Mark as done files an item away for this viewer only.
- **Exists:** the host and the attach command, for Unfold sessions only.
- **Missing:** archive and read state; projecting Ploeg Work Items (PV-081). The decision on proposed [ADR 0023](../../apps/unfold/docs/adrs/0023-unfold-submits-work-to-ploeg-and-never-executes-it.md) comes first.

### J3. Delegate a ticket from my own agent to Glide (phase 1)

- **Trigger:** while coding, the developer asks their agent to "give this to Glide".
- **Steps:**
  1. The agent calls `ploeg-mcp` (provided by the extension) to propose a Work Item, or uses `create_remote_session` against Unfold's host.
  2. Either path creates a **proposed** Work Item.
  3. The developer, or the owner in Vikunja, approves it.
  4. Ploeg authorizes and dispatches.
- **Exists:** "Hand to Ploeg" from a linked task in the extension.
- **Missing:** `ploeg-mcp`; the extension's MCP provider; the remote-session capability with a proposal-only create.

### J4. Review an agent pull request with its evidence (phases 1 and 2)

- **Trigger:** the Work Item reaches *Ready for review*.
- **Steps:**
  1. Open the Work Item in the extension.
  2. Read the problem and solution card and the checks.
  3. Check out the branch with the git API, run it locally, and review on the forge.
- **Exists:** evidence documents, the Ploeg tree, and candidate download.
- **Missing:** branch checkout from the Work Item, and the problem and solution card in the extension.

### J5. Answer a question or an approval from the editor (phase 1)

- **Exists:** for Unfold sessions, through `unfold.reviewNextDecision` and through AHP tool confirmations.
- **Missing:** for Ploeg Work Items. An answer becomes an instruction for the next Round, because Ploeg steers between Runs.

### J6. Move from the browser to the editor and back (phase 1)

- **Missing:** a browser link to `vscode://agents/agent-host-session/unfold/<id>` (verify it first), and a link from the extension back to the browser page. The second exists.

### J7. Use Glide inside any agent, any editor (phases 1 and 2)

- **Steps:** the Glide skills and Glide agent ship with the extension. The same package ships as an Agent Plugin for Claude Code and Copilot CLI, and as an ACP agent for PhpStorm.
- **Exists:** nothing. ADR-0011 is accepted but not built.

### J8. A client approves ready work (phase 2)

- **Steps:** the Client Portal and Preview Environment. The developer's Acceptance (J4) bills the Delivery Fee.
- **VS Code part:** none, by design.

### J9. The owner watches cost and traces (phase 1)

- **Steps:** a Run's trace runs from the worker through the harness to LiteLLM in Tempo. The owner's own VS Code agent traces land next to it.
- **Missing:** Ploeg's OTel (backlog item 82) and the trace propagation described above.

### J10. Bring a repository's environment (phases 1 and 2)

- **Steps:** a developer works in Glide's own repository in a dev container. An operator turns a target repository's devcontainer into a Run toolchain image.
- **Missing:** both.

## Recommendations, in order

1. Fix what is broken first:
   - the cross-user leak (VIK-1661);
   - the session lifecycle VS Code cannot follow (VIK-1662, VIK-1663);
   - the archive and done actions (VIK-1631);
   - single-minor negotiation (VIK-1645);
   - the agent-host token stored in plain text in user settings, which Settings Sync may upload (VIK-1647).
2. Ship J1, the takeover. It turns the most common Needs-you outcome into one click, and copies the pattern that the best competitors (Coder's URI handler, Devin's `/pickup`) proved.
3. Publish the extension to the VS Code Marketplace as well. Without it, the Agents window users cannot find Glide.
4. Build `ploeg-mcp` (ADR-0011), then provide it from the extension along with skills and a Glide agent. This puts Glide inside every harness VS Code runs, with Ploeg's authority intact.
5. Decide ADR 0023 so the AHP host's future is known, then project Work Items (J2) and offer proposal-only delegation (J3).
6. Start JetBrains reach through an ACP agent in parallel with step 4. PHP agencies are the market.
7. On the Ploeg side:
   - make backlog item 82 small with W3C trace propagation;
   - spike Copilot and Codex as ACP profiles for model choice, with a licence check before phase 2;
   - keep cascade, devcontainer toolchains and multi-repository work as spikes behind their ADRs.
8. Watch the proposed APIs: `chatSessionsProvider`, `agentsWindowActivation`, `authIssuers`. Each one would turn a workaround into a native surface.

## Tickets

All the tickets are children of [VIK-1644](https://vikunja.webgrip.dev/tasks/1644) on the Glide board. The dependencies are recorded as relations there.

| Area | Tickets |
| --- | --- |
| Security first | [1661](https://vikunja.webgrip.dev/tasks/1661) (cross-user leak), [1647](https://vikunja.webgrip.dev/tasks/1647) (token in synced settings) |
| AHP host conformance | [1662](https://vikunja.webgrip.dev/tasks/1662) (create and follow), [1663](https://vikunja.webgrip.dev/tasks/1663) (echo actions), [1631](https://vikunja.webgrip.dev/tasks/1631) (archive and done), [1645](https://vikunja.webgrip.dev/tasks/1645) (version negotiation), [1646](https://vikunja.webgrip.dev/tasks/1646) (sequence and eviction), [1664](https://vikunja.webgrip.dev/tasks/1664) (Changes view), [1665](https://vikunja.webgrip.dev/tasks/1665) (questions and retry), [1666](https://vikunja.webgrip.dev/tasks/1666) (composer chips), [1672](https://vikunja.webgrip.dev/tasks/1672) (`#` completions) |
| J1 takeover | [1648](https://vikunja.webgrip.dev/tasks/1648) (URI handler and git takeover), then [1649](https://vikunja.webgrip.dev/tasks/1649) (browser button) |
| J2 and J3 over AHP | [1667](https://vikunja.webgrip.dev/tasks/1667) (decision), then [1668](https://vikunja.webgrip.dev/tasks/1668) (Work Items as sessions), [1669](https://vikunja.webgrip.dev/tasks/1669) (proposal-only delegation), [1670](https://vikunja.webgrip.dev/tasks/1670) (inline review comments), [1671](https://vikunja.webgrip.dev/tasks/1671) (automations spike) |
| J6 | [1660](https://vikunja.webgrip.dev/tasks/1660) (session link spike) |
| J7, Glide inside every agent | [1653](https://vikunja.webgrip.dev/tasks/1653) (MCP provider, after `ploeg-mcp` [1509](https://vikunja.webgrip.dev/tasks/1509)), [1654](https://vikunja.webgrip.dev/tasks/1654) (skills and agent), [1655](https://vikunja.webgrip.dev/tasks/1655) (agent plugin), [1657](https://vikunja.webgrip.dev/tasks/1657) (editor tools) |
| Extension platform | [1650](https://vikunja.webgrip.dev/tasks/1650) (Marketplace), [1656](https://vikunja.webgrip.dev/tasks/1656) (Authentik account), [1658](https://vikunja.webgrip.dev/tasks/1658) (badge and status bar), [1659](https://vikunja.webgrip.dev/tasks/1659) (editor matrix), [1684](https://vikunja.webgrip.dev/tasks/1684) (proposed API watch) |
| JetBrains | [1673](https://vikunja.webgrip.dev/tasks/1673) (ACP agent spike) |
| Ploeg | [1674](https://vikunja.webgrip.dev/tasks/1674) (trace per Run), [1676](https://vikunja.webgrip.dev/tasks/1676) (provider error on `end_turn`), [1675](https://vikunja.webgrip.dev/tasks/1675) (Copilot profile); Codex stays in [1277](https://vikunja.webgrip.dev/tasks/1277), with new evidence on [1516](https://vikunja.webgrip.dev/tasks/1516) |
| Ploeg spikes and decisions | [1677](https://vikunja.webgrip.dev/tasks/1677) (live attach), [1678](https://vikunja.webgrip.dev/tasks/1678) (model tiers), [1679](https://vikunja.webgrip.dev/tasks/1679) (devcontainer toolchains), [1680](https://vikunja.webgrip.dev/tasks/1680) (multiple repositories), [1681](https://vikunja.webgrip.dev/tasks/1681) (ADR 0006 review, due 2026-10-31) |
| Development experience and docs | [1682](https://vikunja.webgrip.dev/tasks/1682) (dev container and worktrees), [1683](https://vikunja.webgrip.dev/tasks/1683) (editor traces), [1685](https://vikunja.webgrip.dev/tasks/1685) (current pages) |

## Re-evaluation triggers

| Trigger | What changes |
| --- | --- |
| `chatSessionsProvider` is finalized | Work Items appear in the Sessions view from the extension. Projecting them through the AHP host becomes optional |
| `chat.remoteAgentHosts` is removed or gated behind a product allowlist | J2 and J3 over AHP stop working. MCP, skills and the URI handler carry the integration alone |
| Stack Overflow 2026 or a JetBrains PHP 2026 survey moves the PhpStorm share | Re-weigh recommendation 6 against 4 |
| A competitor ships Forgejo or Gitea support, client approval or per-ticket billing | Revisit the opening in [the market landscape](../../apps/unfold/docs/research/market-landscape.md) |
| Copilot CLI's licence or terms address hosted third-party use | Unblock or drop the Copilot profile for phase 2 |
| LiteLLM ships the #38176 fix in a stable release | The Codex profile can count spend in provider budgets |

## Method and limits

- Nothing here was run against a live VS Code client attached to Unfold, or against production LiteLLM.
- The Copilot and Codex smoke tests used a mock gateway that returned HTTP 400. Both harnesses reported that error as a message with `stopReason: end_turn`, not as a protocol error. A profile must not read `end_turn` as success.
- Reddit, Tweakers and Hacker News were not indexed usefully, so agency pain points come from surveys and trade press.
- Agency editor share comes from PHP and Laravel surveys, not from Dutch agencies directly.
- Visual Studio Magazine returned 403.
