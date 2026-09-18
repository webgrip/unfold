# 0012 — Every session is an Agent Host Protocol host

Date: 2026-09-17. Status: accepted for 0.3.0; the VS Code 1.138 handshake is verified compatible against the shipped build, single-minor negotiation is recorded below as a defect, and attachment against a running desktop client remains unexercised.

## Context

VS Code 1.136 moved its agent sessions into a standalone host process that speaks the Agent Host Protocol: JSON-RPC over WebSocket, URI-addressed channels for the root, sessions, chats, terminals and changesets, one global sequence number, snapshots plus action envelopes, and any number of clients attached to the same session ([research](../research/2026-09-10-agent-host-protocol.md)). Version 0.9.0 is current; the client SDKs are MIT; there is no server SDK, and VS Code's own host hardcodes its agents while an extension API for third-party hosts remains an open issue. VS Code does, however, connect to any WebSocket address listed in its `chat.remoteAgentHosts` setting with a connection token in the `tkn` query parameter.

De Vloer already has the state this protocol wants: durable events per session, permission requests as first-class records, operator instructions, candidates with file-level diffs, and an authorization model per user.

## Decision

Serve AHP 0.9.0 from the workbench itself on the same port as the HTTP API, with a dependency-free WebSocket server. A De Vloer session is an `ahp-session` channel with exactly one chat; its events project into turns, markdown and system-notification parts, tool calls, permission confirmations and elicitation requests, and its candidate into an `ahp-changeset` channel whose file contents are read through `resourceRead`. Creating a session through AHP takes the crew, repository, budget and placement from `resolveSessionConfig`; the first chat message becomes the objective and starts the crew. Later messages become recorded instructions, a cancelled turn pauses the session, tool-call confirmations answer OpenCode permission requests, and completed input answers questions.

Clients authenticate with personal connection tokens issued through the HTTP API and bound to a user; the host applies the same ownership rules as the API. All attached clients receive every action envelope with its origin, so a browser, an editor and a second operator see one session.

Terminals and resource writes are not offered. The workbench never exposed a shell, and the candidate contract forbids editing the sandbox from outside.

## Consequences

The VS Code extension keeps its own views for now; the host is the path by which VS Code's native agent session UI can attach as soon as the setting is used. Any other AHP client, including the official SDKs, can drive De Vloer without the extension. The projection is deterministic from durable events, so a reconnect gets the same turns a live client saw.

The protocol is weeks old and unversioned beyond SemVer 0.x; each minor may change the wire. The host negotiates only `0.9.x` and answers other versions with the documented error. Reconsider the projection when ACP v2 or AHP settle on one session model, and revisit terminals if the estate ever decides an operator may open a shell in a sandbox.

## Update, 2026-09-17

Evidence: [the roadmap and conformance sweep](../research/2026-09-17-agent-host-roadmap.md).

Three premises of the record above have changed. VS Code 1.138.0 stable offers `["0.9.0","0.7.0","0.6.0","0.5.2","0.5.1"]`, so the handshake matches today and `chat.remoteAgentHostsEnabled` and `chat.remoteAgentHostsAutoConnect` both default to true — attachment needs no opt-in beyond the entry itself. VS Code's own host is no longer the only server: `Qusic/pi-ahp` and `softov/ahpd` are independent implementations, and a paid iOS client ships against the protocol. An extension API for third-party hosts remains absent, and is now named as a non-goal in Microsoft's own extensibility roadmap ([vscode#336199](https://github.com/microsoft/vscode/issues/336199)) rather than merely unanswered in [#325827](https://github.com/microsoft/vscode/issues/325827) — the host seam is the supported path, not a waypoint to one.

Accepting `0.9.x` alone is a defect rather than a conservative choice. Spec minors land every 13 days on average and each is a wire break by AHP's own compatibility rule, while VS Code ships weekly; [vscode#325738](https://github.com/microsoft/vscode/issues/325738) records this failure in the field. The spec directs hosts to pick the highest offered version they implement, which requires holding a declared set rather than one minor. The host must also persist `serverSeq` — it resets to zero on restart while clients reconnect carrying `lastSeenServerSeq` — and evict projections, which are retained for the process lifetime.

`SessionStatus` carries `IsRead` and `IsArchived` bits the projection never sets, and nothing stands behind them: there is no retention, purge or expiry for sessions, events, candidates or agent-host tokens. That is ticket PV-048, and it is now a conformance gap as well as an operational one.

Terminals and resource writes stay declined. The protocol's server-to-client resource methods would let this host read and write an operator's local files through the editor's consent prompts, and the threat model for that posture is unresolved upstream ([AHP#266](https://github.com/microsoft/agent-host-protocol/issues/266) open, [PR #88](https://github.com/microsoft/agent-host-protocol/pull/88) unmerged since April). The candidate contract's refusal to edit a sandbox from outside is the safer position and is retained deliberately, not by omission.
