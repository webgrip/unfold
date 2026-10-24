---
status: proposed
date: 2026-10-17
decision-makers: Ryan Grippeling
review-by: 2027-01-17
---

# People link their own agent sessions through a plugin, Agent Trace and telemetry, never a Claude sign-in

## Context and Problem Statement

On 2026-10-17 the owner asked to "link my Anthropic account to Unfold, so I can also just link my Claude Code sessions to certain issues", and to see those sessions in Unfold. From the options researched that day, the owner chose four: [Agent Trace](https://agent-trace.dev/) "implemented properly", "proper OpenTelemetry", an MCP tool that links a session, and a Claude Code plugin whose hooks report the session.

Unfold knows only the sessions it starts itself or that Ploeg runs. A session a person runs in Claude Code on their own machine is invisible to it, even when it works on a Work Item and opens that Work Item's pull request.

Anthropic's [legal and compliance terms](https://code.claude.com/docs/en/legal-and-compliance) rule out the literal ask. Third-party developers may not offer a claude.ai login, and may not "collect, store, or intermediate Claude.ai credentials or session tokens". [Ploeg ADR-0084](../../../ploeg/docs/adrs/0084-a-claude-code-run-can-execute-in-a-teams-self-hosted-claude-environment.md) already says Ploeg never offers a Claude sign-in.

So the question is how a person's own sessions reach Unfold, become linked to Work Items, and show what they wrote and cost, without Unfold holding a Claude credential.

## Decision Drivers

* Unfold holds no Claude credential and offers no Claude sign-in.
* The person's existing Unfold identity, the `vle_` editor credential ([ADR 0037](0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md)), is the only credential involved.
* Telemetry already flows from Claude Code to the estate's VictoriaMetrics and VictoriaLogs, with Grafana dashboards for each session. Unfold should read that data, not run a second pipeline.
* Attribution uses an open record other tools can read: Agent Trace 0.1.
* A hook never blocks or slows a session, and never sends prompts or file contents.
* Seeing a session follows the Work Items it is linked to. Changing a session's links is for its owner, or for an administrator.

## Considered Options

* A Claude Code plugin reports to Unfold, Unfold reads the session's telemetry from the estate's stores, and each commit carries an Agent Trace record
* Unfold receives Claude Code's OTLP export itself, as an OpenTelemetry collector
* Unfold reads the local transcripts in `~/.claude/projects` through a sync daemon
* Account linking through a stored `claude setup-token` or OAuth token

## Decision Outcome

Chosen option: **a plugin, telemetry read from the estate's stores, and Agent Trace per commit**.

* **Linked Session.** A new Unfold record ([glossary](../../../../docs/reference/glossary.md#linked-session)): an agent session a person runs outside Unfold that reports to it. Unfold never starts it, steers it or pays for it.
  * The first report claims the harness session id for the person who sent it. A report for someone else's session answers not found.
  * The session's state follows its hooks: idle, working, waiting for its person, ended. It reads as stale after 30 minutes without a report.
* **Plugin.** A Claude Code plugin with command hooks for SessionStart, UserPromptSubmit, Notification, PostToolUse, Stop and SessionEnd.
  * It reports the session id, title, repository without credentials, branch, model, state and commit ids to `POST /api/linked-sessions/events`, using the person's editor credential. Prompts, tool output and file contents are never sent.
  * At SessionStart it tells the session its Unfold page, its session id and the `Unfold-Session:` commit trailer to add. It names a session after its Work Item when the session has no title.
  * It does not rewrite commands. A PreToolUse rewrite would either skip the person's permission prompt or ask on every commit.
* **Links.** A branch that names a tracker task, such as `feat/vik-2051-login`, links the Work Items of that task that the person may read.
  * The MCP tool `unfold_link_session`, the session's page and its owner can add or remove links.
  * An unlinked Work Item is remembered, so the branch does not link it again.
  * Link changes are Action Records ([system ADR-0037](../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md)). Heartbeats are not.
* **Agent Trace.** For each new commit, the plugin matches added lines against fingerprints of the lines the session's editing tools wrote. Short lines follow their neighbours.
  * It builds one Agent Trace 0.1 record holding the agent-written ranges, a `content_hash` per range, the session's Unfold page as the conversation URL, and its Work Items as `related` links. Unfold's own fields go under `metadata["dev.unfoldhq"]`.
  * The record is stored as a git note under `refs/notes/agent-trace` and sent to Unfold.
  * Unfold validates every record as strictly as the [hosted schema](https://agent-trace.dev/schemas/v1/trace-record.json), where unknown fields are refused outside `metadata`. It accepts `0.1` and the spec's own `0.1.0` as versions.
  * Lines the session did not write are not attributed.
* **Telemetry.** Unfold reads one session's counters from `observability.metricsUrl`, a Prometheus-compatible API, and its event counts, top tools and Claude account id from `observability.logsUrl` (VictoriaLogs), both by `session.id`.
  * It links Grafana's session dashboard when `observability.dashboards["claude-code-session"]` names it.
  * Cost is labelled an API-price estimate, because a Claude plan is not billed it. Prompt and tool content is never queried.
  * Only the session's owner, or an administrator, sees its telemetry.
* **"Linking the Anthropic account"** means the Claude account id Claude Code reports in its own telemetry, shown on the session's page as a label. It is never a credential.

### Consequences

* Good: a person's own sessions show on the Work Item they serve, with state, owner, branch, AI-written lines and the command that resumes them.
* Good: Agent Trace records travel with the repository in git notes, so any Agent Trace reader can use them without Unfold.
* Good: no new dependency, no second telemetry pipeline, no Claude credential.
* Bad: line attribution by fingerprint is a heuristic. A line a person retypes identically counts as the agent's, and a line the agent wrote and the person then edited does not.
* Bad: the commit trailer depends on the session following its instructions. The plugin records whether each commit carries it.
* Bad: git notes are not pushed by default. A person who wants the records on the forge pushes `refs/notes/agent-trace`.
* Neutral: Claude Code's telemetry still has to be enabled in the person's own settings. The plugin cannot switch it on.

### Confirmation

* `test/linked-sessions.test.ts` covers:
  * claiming a session, linking by branch and dismissing a link;
  * readers of a linked Work Item, who see the session without its telemetry;
  * strict Agent Trace validation;
  * the telemetry queries and partial failures;
  * the API, including that heartbeats stay out of the action log.
* `test/claude-code-plugin.test.ts` runs the real hook script against a fake Unfold in a temporary repository. It checks the session title, the commit report, an Agent Trace record that passes Unfold's validation, the git note, and silence when unconfigured.
* `test/mcp.test.ts` covers `unfold_link_session` and `unfold_linked_sessions`.

## Pros and Cons of the Options

### Plugin, telemetry read from the estate's stores, Agent Trace per commit

* Good, because it uses only documented Claude Code surfaces (plugins, command hooks, the hook input's `session_id`, OpenTelemetry) and an open attribution record.
* Bad, because three moving parts must be set up: the plugin, the editor credential and telemetry.

### Unfold as the OTLP receiver

* Good, because Unfold would get every event without a query.
* Bad, because Claude Code exports to one endpoint, so the estate's existing pipeline and dashboards would lose the data, or Unfold would have to forward it.

### A transcript sync daemon

* Good, because the transcript holds the most detail, including the pull request a session opened.
* Bad, because the transcript format is internal and undocumented, and it is deleted after 30 days.
* Bad, because it holds every prompt, which this decision keeps off the network.

### Storing a Claude token

* Bad, because Anthropic's terms forbid it, and Ploeg ADR-0084 rejects it.

## More Information

* [OpenSpec change](../../../../openspec/changes/linked-agent-sessions/proposal.md)
* [How to link your Claude Code sessions](../../../../docs/how-to/link-claude-code-sessions.md)
* [API contract](../contracts/api.md#linked-sessions)
* Ticket VIK-2137

## Update, 2026-10-23

The plugin (0.3.0) is also an [Agent Plugin](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md) (specification 1.0.0), so one directory installs in Claude Code, GitHub Copilot CLI and VS Code 1.143 from the same repository marketplace, `/.claude-plugin/marketplace.json`. Claude Code reads `.claude-plugin/plugin.json`, `hooks/hooks.json` and `skills/`. Copilot CLI and VS Code read the root `plugin.json`, whose Agent Plugins `$schema` takes precedence over the Claude manifest, and load only `skills/`: in Agent Plugins mode they take hooks from `com.github.copilot/hooks/hooks.json`, so the Claude Code hooks reach Claude Code alone, as their payloads require. The plugin ships no MCP servers. The specification forbids expansion in a remote server's `url` and `headers` and defines no OAuth client id, so a shipped definition would name one Unfold installation. People keep adding `ploeg-mcp` and `unfold-mcp` themselves until the specification allows configuration per installation ([plugin README](../../extensions/claude-code/README.md)).

## Update, 2026-10-24

Unfold no longer only reads a Linked Session. Its owner can now act on it from Unfold, so "Unfold never starts it, steers it or pays for it" holds only for starting and paying:

* **Messages.** The owner, or an administrator, queues a message for the session; the plugin hands it to the session as context on the next prompt, shell command or stop, and the opt-in `unfold-channel` MCP server pushes it into an idle session. Unfold also writes notices about the session's Work Items, its pull requests' CI and reviewer verdicts. A message from anyone but the owner, and every notice, is framed as information, not an instruction ([how-to](../../../../docs/how-to/link-claude-code-sessions.md)). The plugin now ships that one MCP server, a local stdio server that names no Unfold installation, so the update of 2026-10-23 no longer holds on that point.
* **Tool permissions.** With `UNFOLD_REMOTE_APPROVAL=1`, the owner, and only the owner, answers a tool prompt the session waits on with allow or deny, once, before it expires. The editor credential that reported a prompt cannot answer it, an answer through an editor or MCP credential carries the person's confirmation, and each answer is an Action Record. Unfold never offers "always allow". The first answer, in the terminal or in Unfold, applies.
* **Hand-overs.** The owner hands a linked Work Item to Ploeg with a note, or claims a Run that waits for their own Claude Code; the session records each hand-over so it never collides with the Run it started.

Unfold still never starts a Linked Session and never pays for it, and it still holds no Claude credential. Starting sessions on a person's own machine is proposed separately in [RFC-0010](../../../../docs/design/rfc-0010-agents-on-your-own-machine.md).
