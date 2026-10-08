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
