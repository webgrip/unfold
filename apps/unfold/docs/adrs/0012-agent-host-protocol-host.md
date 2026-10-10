# 0012 — Every session is an Agent Host Protocol host

Date: 2026-09-17. Status: accepted for 0.3.0; the VS Code 1.138 handshake is verified compatible against the shipped build, single-minor negotiation is recorded below as a defect, and attachment against a running desktop client remains unexercised.

## Context

VS Code 1.136 moved its agent sessions into a standalone host process that speaks the Agent Host Protocol: JSON-RPC over WebSocket, URI-addressed channels for the root, sessions, chats, terminals and changesets, one global sequence number, snapshots plus action envelopes, and any number of clients attached to the same session ([research](../research/2026-09-10-agent-host-protocol.md)). Version 0.9.0 is current; the client SDKs are MIT; there is no server SDK, and VS Code's own host hardcodes its agents while an extension API for third-party hosts remains an open issue. VS Code does, however, connect to any WebSocket address listed in its `chat.remoteAgentHosts` setting with a connection token in the `tkn` query parameter.

Unfold already has the state this protocol wants: durable events per session, permission requests as first-class records, operator instructions, candidates with file-level diffs, and an authorization model per user.

## Decision

Serve AHP 0.9.0 from the workbench itself on the same port as the HTTP API, with a dependency-free WebSocket server. An Unfold session is an `ahp-session` channel with exactly one chat; its events project into turns, markdown and system-notification parts, tool calls, permission confirmations and elicitation requests, and its candidate into an `ahp-changeset` channel whose file contents are read through `resourceRead`. Creating a session through AHP takes the crew, repository, budget and placement from `resolveSessionConfig`; the first chat message becomes the objective and starts the crew. Later messages become recorded instructions, a cancelled turn pauses the session, tool-call confirmations answer OpenCode permission requests, and completed input answers questions.

Clients authenticate with personal connection tokens issued through the HTTP API and bound to a user; the host applies the same ownership rules as the API. All attached clients receive every action envelope with its origin, so a browser, an editor and a second operator see one session.

Terminals and resource writes are not offered. The workbench never exposed a shell, and the candidate contract forbids editing the sandbox from outside.

## Consequences

The VS Code extension keeps its own views for now; the host is the path by which VS Code's native agent session UI can attach as soon as the setting is used. Any other AHP client, including the official SDKs, can drive Unfold without the extension. The projection is deterministic from durable events, so a reconnect gets the same turns a live client saw.

The protocol is weeks old and unversioned beyond SemVer 0.x; each minor may change the wire. The host negotiates only `0.9.x` and answers other versions with the documented error. Reconsider the projection when ACP v2 or AHP settle on one session model, and revisit terminals if the estate ever decides an operator may open a shell in a sandbox.

## Update, 2026-09-17

Evidence: [the roadmap and conformance sweep](../research/2026-09-17-agent-host-roadmap.md).

Three premises of the record above have changed. VS Code 1.138.0 stable offers `["0.9.0","0.7.0","0.6.0","0.5.2","0.5.1"]`, so the handshake matches today and `chat.remoteAgentHostsEnabled` and `chat.remoteAgentHostsAutoConnect` both default to true — attachment needs no opt-in beyond the entry itself. VS Code's own host is no longer the only server: `Qusic/pi-ahp` and `softov/ahpd` are independent implementations, and a paid iOS client ships against the protocol. An extension API for third-party hosts remains absent, and is now named as a non-goal in Microsoft's own extensibility roadmap ([vscode#336199](https://github.com/microsoft/vscode/issues/336199)) rather than merely unanswered in [#325827](https://github.com/microsoft/vscode/issues/325827) — the host seam is the supported path, not a waypoint to one.

Accepting `0.9.x` alone is a defect rather than a conservative choice. Spec minors land every 13 days on average and each is a wire break by AHP's own compatibility rule, while VS Code ships weekly; [vscode#325738](https://github.com/microsoft/vscode/issues/325738) records this failure in the field. The spec directs hosts to pick the highest offered version they implement, which requires holding a declared set rather than one minor. The host must also persist `serverSeq` — it resets to zero on restart while clients reconnect carrying `lastSeenServerSeq` — and evict projections, which are retained for the process lifetime.

`SessionStatus` carries `IsRead` and `IsArchived` bits the projection never sets, and nothing stands behind them: there is no retention, purge or expiry for sessions, events, candidates or agent-host tokens. That is ticket PV-048, and it is now a conformance gap as well as an operational one.

Terminals and resource writes stay declined. The protocol's server-to-client resource methods would let this host read and write an operator's local files through the editor's consent prompts, and the threat model for that posture is unresolved upstream ([AHP#266](https://github.com/microsoft/agent-host-protocol/issues/266) open, [PR #88](https://github.com/microsoft/agent-host-protocol/pull/88) unmerged since April). The candidate contract's refusal to edit a sandbox from outside is the safer position and is retained deliberately, not by omission.

## Update, 2026-10-01

Evidence: [the VS Code 1.140 sweep](../research/2026-10-01-vscode-1-140-fit.md).

The decision stands, but its premise that VS Code "can attach" has never been exercised and does not hold. VS Code 1.140 completes the handshake and then cannot run a session. The host rejects VS Code's session URI scheme (`<provider>:/<uuid>`), creates no default chat at creation, renames the session on its first turn, and does not echo client actions. Two further defects leak one user's sessions and rejected actions to every other attached user. The 2026-10-01 fit dossier lists fifteen findings, each with its ticket. The VS Code 1.140.0 stable bundle still lists `0.9.0` among its supported versions, and its client still offers `["0.9.0","0.7.0","0.6.0","0.5.2","0.5.1"]`, so the handshake matches. The harness picker is still limited to Copilot, Claude and Codex. `chat.remoteAgentHosts` still accepts a raw address and connection token, and VS Code's documentation now says other applications may implement either side of the protocol.

One new conformance gap: 1.140 archives chats and marks sessions done with `session/isArchivedChanged` and `chat/isArchivedChanged`. The host broadcasts only `session/isReadChanged` and rejects the others, so an Unfold session cannot be filed as Done from the Agents window. The host should broadcast both now and persist them with PV-048. Read from the code; not yet exercised against a desktop client.

The host must not advertise `_meta["vscode.remoteSessions"]` until a delegated session can only become a proposed Work Item that waits for a person. VS Code agents can delegate work to any host that advertises it, and through this host that would otherwise create budgeted work without Ploeg's authorization.

## Update, 2026-10-03

The WebSocket server is no longer dependency-free. [ADR 0036](0036-the-agent-host-speaks-websocket-through-ws.md) replaces the hand-written framing with `ws`, after local probes showed it read frames RFC 6455 requires a server to reject and ignored write backpressure. The host's connection interface and its token check on the upgrade are unchanged.

## Update, 2026-10-08

Evidence: [the VS Code 1.141 sweep](../research/2026-10-08-vscode-1-141-fit.md).

The 2026-10-01 update was already out of date when it landed. The same day, `5ecd610e` limited root notifications, rejections and `activeSessions` to the owning user. `78d4d6fd` adopted VS Code's `unfold:/<id>` session URIs, created the default chat with the session, kept the client's session id behind a persisted alias, stopped advertising `multipleChats` and `multipleWorkingDirectories`, and stopped sending the host path. Seven of the fifteen findings are fixed in code and in `ahp.test.ts`. Attachment against a running desktop client is still unexercised.

AHP 1.0.0 was released on 2026-10-02. Its versioning rule keeps `0.9.x` as one of two compatibility baselines, so this host is still conforming. VS Code 1.141 speaks a private `0.10.0` and still offers `0.9.0`. Two changes merged on VS Code main for 1.142 reach this host. Read state arrives as `chat/isReadChanged`. New sessions arrive as `ahp-session:/<uuid>`, while the host advertises them as `unfold:/<uuid>`. Both need a host change before 1.142 reaches Stable. The archive actions recorded on 2026-10-01 are still rejected. So is `root/configChanged`, which VS Code sends on every connect, and whose rejection echoes the client's trusted folders to the same user's other clients.

The single-minor defect recorded on 2026-09-17 is narrower than it looked: the AHP rule keeps 0.9 as a baseline until 2.0. The host should still answer with the exact offered version and reject malformed ones.

Implemented the same day; the commits are listed in the dossier's follow-up:

* **Negotiation.** The host returns the highest offered `0.9.x` as the exact string, rejects malformed versions, and closes after `-32005`.
* **Session URIs.** They are spelled per client by VS Code's own host rule: `unfold:/<id>` for a VS Code client without `_meta["vscode.ahpSessionUris"]`, `ahp-session:/<id>` for every other client. Both are accepted on input.
* **Read and archive marks.** Both are kept per person in `agent_host_views`, as status bits 32 and 64, and never change the session.
* **Echoes.** `root/configChanged` is echoed to the sender only. Every accepted client action is echoed in server order, and turns keep the client's turn id.
* **Messages during a Run.** Steering and queued messages become instructions for the next execution, as typed messages already did. `chat/truncated` is still refused, because the history is durable evidence.
* **Changesets.** The candidate is a `session` changeset with whole before and after files read from its Git bundle. Its one operation is **Accept**, through the browser's review path and owner check.
* **Questions.** They carry a message, a title and their choices. Declining one is still refused, because the engine takes only answers.
* **Reconnect.** A client known to the process resumes with a snapshot. It keeps its session spelling, and its active-client entry for 30 seconds.

An end-to-end run with Microsoft's AHP 1.0.0 client found six further defects, fixed the same day. Terminals and resource writes stay declined. No desktop VS Code has attached yet.

## Update, 2026-10-10

Evidence: [the AHP sign-in spike](../research/2026-10-10-ahp-sign-in-spike.md).

VS Code 1.141 cannot sign a person in to this host, and VS Code main does not change that. It resolves a third-party protected resource only through an authentication provider that is already registered, so a personal connection token stays the credential. The extension's command could not deliver that token either: VS Code 1.141 registers the application-scoped `chat.remoteAgentHosts` setting only in the Agents window, and the configuration API refuses it in editor windows.

Decision: after sign-in, the extension writes the entry straight into the default profile's user `settings.json`. It keeps comments and indentation and replaces the file in one atomic rename, as a hand-edited proof did against a running 1.141.0, which connected without a reload. The extension uses the configuration API only where the setting is registered, reuses a stored token the host still accepts, and mints nothing when the file cannot be parsed or written. `unfold.agentHost.autoConnect` opts out ([operations guide](../operations/live.md#attaching-vs-code-as-an-agent-host-client)). The token sits in plain text in that setting, which is how VS Code stores it.

2026-10-10: `serverSeq` is reserved in blocks in the store and never moves backwards across a restart, remembered clients and `activeClients` survive a restart, and an ended session's projection is evicted on dispose or after ten idle minutes without subscribers and rebuilt from its events on subscribe ([VIK-1646](https://vikunja.webgrip.dev/tasks/1646)).

2026-10-10: a new session's crew, budget, placement and approvals use the Agents window's own session-config pickers, with the repository read-only from the Workspace picker; a picker change made before the first message reaches the session through `session/configChanged`, and the composer's model reads `Ploeg crew · <team>` instead of a gateway model ([contract](../contracts/api.md#agent-host)).

2026-10-10: a failed session's last error part is resumable when the Run-again path accepts it, and VS Code's **Try Again** (`chat/turnResume`) creates the new queued session only when pressed; yes/no questions use the `boolean` kind; spend arrives as system notifications at Run end and at 50, 80 and 100 % of the budget, no longer in `usage._meta` ([VIK-1665](https://vikunja.webgrip.dev/tasks/1665), [contract](../contracts/api.md#agent-host)).

2026-10-10: declining a question is no longer refused ([VIK-1921](https://vikunja.webgrip.dev/tasks/1921)). Decision: a decline becomes an explicit answer. The host records `question.declined` and answers every question of the request with "Declined by <name>: no answer will be given. Continue with your best judgement and say what you assumed." through the same answer path, so OpenCode, the command bridge and a brief clarification all receive it without an engine change. OpenCode's own question reject was not used: it reaches the crew as a tool error rather than an answer, and the command bridge and brief clarification have no equivalent. VS Code 1.141 has no decline button and sends `cancel` when the question carousel is skipped or closed, so `cancel` counts as a decline too, except while the person is stopping the turn: then the question stays open and the session pauses. The chat shows the request as `decline` with each answer `skipped` and carrying that text.

2026-10-10: a candidate waiting for review offers **Request changes…** and **Reject…** beside Accept; each asks for its message in the session's chat and records it through the engine's review path and owner check, and Request changes also creates the next session, unstarted, with the message and the candidate's comments as its instruction. Comments are AHP annotations kept per session; VS Code's submitted feedback opens Request changes, Agent Merge accepts the candidate (merging stays on the forge), and `_meta.git` names the candidate branch. `sessions.agentHost.showBranchChanges` belongs to the new-session branch picker of a local checkout and has no Unfold session to act on ([API](../contracts/api.md#reviewing-a-candidate-from-vs-code)). Not yet exercised against a desktop VS Code.

## Update, 2026-10-10: automations

Evidence: VS Code 1.141.0's `sessions.desktop.main.js` (`AgentHostAutomationStore` and the connection gate in front of it) and the AHP automation types at [`types/channels-automation`](https://github.com/microsoft/agent-host-protocol/tree/main/types/channels-automation), read at `cb6ba61`. The owner asked for automations support on 2026-10-10.

**What VS Code calls an automation.** It is a saved prompt with a session template (provider, model, agent, working folder, configuration) and triggers. The AHP host persists it in the `ahp-automations://` catalogue, evaluates its triggers and starts a fresh session for each run with the prompt as an `automation`-origin message. VS Code's Automations view in the Customizations sidebar edits that catalogue. Its dialog has only schedules (hourly, daily, weekly, or manual); event triggers are projected as manual. **Run now** starts a session immediately, and VS Code says a disconnected host never falls back to local execution. VS Code 1.141 connects the view to a host only when `chat.automations.enabled` is on (the default), `InitializeResult.automations` is present, and `InitializeResult._meta["vscode.autonomousAutomations"]` is `true`. Without the last one it reports that the host needs an update. **New Automation** needs `automations.create`, and **Run**, **Edit** and **Delete** need the matching entry in each automation's `operations`. The "Whether this Agent Host may run automations" setting is `automationsEnabled` in the root configuration of VS Code's own host, which mirrors `chat.automations.enabled`. A third-party host does not have to offer it.

**What Unfold has instead.** Tracker-driven work in Unfold is Ploeg's: assigning a team's tracker user on a Vikunja board that Ploeg runs makes Ploeg queue a Work Item, and Ploeg authorizes, budgets and runs it ([ADR 0025](0025-hand-tracker-tasks-to-ploeg-by-assignment.md)). Unfold's task sources read Vikunja, Forgejo, GitHub, GitLab and ClickUp, and only the Vikunja hand-over writes, by adding that assignee to an existing task. Neither Unfold nor Ploeg has scheduled work, a route for Unfold to create a proposed Work Item, or a way to create tracker tasks.

**Mapping.**

| VS Code automation | Unfold |
| --- | --- |
| Catalogue entry | A route: one board Ploeg runs and one Ploeg team the person may route its tasks to (the pinned team on a pinned board) |
| Event trigger | The tracker assignment of the team's tracker user (`unfold.tracker-assignment`, event `task.assignee.created`) |
| Schedule trigger | None. Nothing in Unfold or Ploeg runs on a clock |
| `enabled` | The team is not paused |
| Run | A Work Item Ploeg queued from an assignment. It is not a session on this host, so runs stay empty |
| Create, update, remove, **Run now** | No equivalent that waits for a person or Ploeg's authorization |

**Decision.** The host serves a read-only catalogue of tracker routes. It cannot honour VS Code's model safely: every run of an automation created in VS Code is budgeted work that Ploeg did not authorize. Running it through the application's engine is the standalone execution this repository forbids extending. Turning it into Ploeg work would need an intake Ploeg does not have, and a hand-over needs an existing tracker task that a person chose. The 2026-10-01 rule about delegated sessions applies here too. The host advertises `automations: {}` without `create`, `schedules` or `runCancellation`, and sets `_meta["vscode.autonomousAutomations"]`. That flag is true: Ploeg evaluates the routes with no client attached, and VS Code never runs them. Every entry advertises no operations. `automation/createRequested`, `automation/updateRequested` and `automation/removed` are rejected with a reason, and `runAutomation` answers `-32009`. A demo workbench, or one without a live Ploeg connection and a board Ploeg runs, advertises no automations. The catalogue is refreshed each minute while someone watches it, and only that person's clients receive the changes ([api.md](../contracts/api.md#agent-host)).

Reconsider when Ploeg gains an intake for proposed Work Items that waits for a person, or scheduled work of its own. A VS Code automation could then become a proposal instead of a run. Not yet exercised against a desktop VS Code.

## Update, 2026-10-10: read-only terminals

Evidence: VS Code 1.141.0's `sessions.desktop.main.js` and its sources at the `1.141.0` tag (`agentHostTerminalService.ts`, `agentHostOutputChannel.ts`, `agentHostPty.ts`), and the AHP 0.9.0 terminal types at [`types/channels-terminal`](https://github.com/microsoft/agent-host-protocol/tree/v0.9.0/types/channels-terminal). The owner decided on 2026-10-10 to show a read-only terminal stream of the sandbox's commands and their output.

This changes the record above, which declined terminals entirely. Only a read-only stream is accepted. The host takes no terminal input, starts no shell, follows no client resize, and still offers no resource writes.

**What a client sees.** Each command a crew runs gets its own terminal, `ahp-terminal:/<session>/<event>`. `<event>` is the id of the durable `tool` event that first named the command, so a reconnect or a restart finds the same terminal. The command's tool call carries the command line as `toolInput` and a `terminal` content block with `isPty: false`. Once the command finishes, the block's `result` has the exit code the runtime reported and the recorded output. VS Code 1.141 shows such a tool call as a terminal pill. For a non-PTY block it subscribes through `AgentHostOutputChannel`, a plain-text output view that has no input path. It creates its input-capable `AgentHostPty` only for a PTY block, which this host never sends. The terminal's state has one `command` part, `supportsCommandDetection: true`, and a `session` claim. It is projected from the same durable events as the chat. When the command finishes, a subscriber receives `terminal/data`, `terminal/commandFinished` and `terminal/exited`. A command that its Run or session stopped before it reported ends without an exit code. The host never invents one. OpenCode reports none, so its commands end without an exit code. The demo runtime reports the real exit code of each check it runs.

**Threat reasoning.** A terminal that accepts input would be an interactive shell in a sandbox that holds a scoped gateway credential and a clone of the repository. Ploeg would neither authorize nor budget what was typed into it, and the evidence chain would not record it. That would be standalone execution through a side door. The record of 2026-09-17 declined exactly that, and it stays declined. So the host refuses every client action on a terminal channel (`terminal/input`, `terminal/resized`, `terminal/cleared`, `terminal/titleChanged`, `terminal/claimed`) with a reason. It answers `createTerminal` and `disposeTerminal` with `-32009`, and it never advertises `terminalCommandPrefix`. Reading output carries risks of its own, and the host closes each one:

* **Secrets.** Output passes through the event store's redaction when it is recorded, which removes run credentials and configured secrets. Before it is served, the host applies the HTTP API's known-secret redaction and the credential patterns of `safeDetail`.
* **Escape sequences.** Terminal escape sequences and other control characters are stripped, so a crew cannot write to the operator's clipboard (OSC 52), forge hyperlinks or rewrite the display. This is also why the terminal is plain text rather than a pseudoterminal.
* **Other people's sessions.** Ownership is checked on subscribe exactly as for the chat: the session's owner and administrators only. A person who may not see the session gets "Terminal not found" whether or not the terminal exists.

Reconsider input only if the estate decides that an operator may open a shell in a sandbox. Such a shell would need its own authorization, budget and evidence through Ploeg. Live output while a command runs needs the runtimes to record partial output as durable events, which none does today. Not yet exercised against a desktop VS Code.
