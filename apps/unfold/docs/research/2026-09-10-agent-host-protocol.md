# Agent Host Protocol 0.9.0 as seen from De Vloer

Research date: 2026-09-10. Sources: the [specification](https://microsoft.github.io/agent-host-protocol/), the [repository](https://github.com/microsoft/agent-host-protocol) at commit `0d6d983` (2026-09-05, spec 0.9.0 released 2026-08-28), the [VS Code blog post](https://code.visualstudio.com/blogs/2026/08/26/agent-host-architecture), the [1.136 release notes](https://code.visualstudio.com/updates/v1_136), the [agent host concept page](https://code.visualstudio.com/docs/agents/concepts/agent-host), [issue #325827](https://github.com/microsoft/vscode/issues/325827) and VS Code's own server under `src/vs/platform/agentHost/node/`.

## Transport and authentication

JSON-RPC 2.0, one message per WebSocket text frame, no subprotocol, no batching. The protocol leaves authentication to the transport; VS Code passes a connection token as the `tkn` query parameter and answers a bad token with HTTP 403. A `ping` request on `ahp-root://` must be answered before `initialize`; VS Code pings after five seconds of silence and drops the connection after twenty. Malformed frames get a `-32700` reply and the tenth closes the connection. TLS arrives through SSH or a dev tunnel; the standalone server listens on plain `ws://`.

## Channels and synchronisation

Every command and notification carries `params.channel`. The root is `ahp-root://` and holds agents, terminals and configuration. Sessions are `ahp-session:/<uuid>` with the client choosing the id; chats `ahp-chat:/<id>` with the server allocating; terminals, changesets, annotations and resource watches have their own schemes. A client subscribes and receives a snapshot with `fromSeq`, then `action` notifications whose envelope carries the channel, the action, a global `serverSeq`, the `origin` client and sequence for echoed client actions, and an optional `rejectionReason`. `reconnect` replays or resnapshots. Reducers per channel are pure and shipped in the TypeScript package, so a host must emit actions the reducers accept.

## The method map used by the host

| Operation | Wire |
| --- | --- |
| Handshake | `initialize` with `protocolVersions`, `clientId`, `initialSubscriptions`; result `protocolVersion`, `serverSeq`, `snapshots` |
| Sessions | `listSessions` on the root; `createSession` on the session channel with `provider`, `workingDirectories`, `config`; `disposeSession` |
| Session configuration | `resolveSessionConfig` returns a JSON-schema-like `schema` and `values`; `sessionConfigCompletions` lists enum values |
| Chats | `createChat` with `chat` URI and optional `initialMessage`; the server emits `session/chatAdded` and `session/defaultChatChanged` |
| Turns | client `chat/turnStarted` with a `turnId` and `message`; server `chat/responsePart` then `chat/delta` per markdown part, `chat/toolCallStart`, `chat/toolCallReady`, `chat/toolCallComplete`, `chat/usage`, and `chat/turnComplete`, `chat/turnCancelled` or `chat/error` |
| Permissions | `chat/toolCallReady` without `confirmed` puts a tool call in `pending-confirmation` with `options`; a client answers with `chat/toolCallConfirmed`; the first answer wins |
| Questions | `chat/inputRequested` with typed questions; `chat/inputAnswerChanged` and `chat/inputCompleted` |
| Changesets | listed on the session state with a `uriTemplate`; the channel state carries `files` with `FileEdit.before` and `after` content references resolved by `resourceRead` |
| Cancellation | client `chat/turnCancelled`; disposal cascades from `disposeSession` |

Error codes: the JSON-RPC set plus `-32001` session not found, `-32002` provider not found, `-32003` session already exists, `-32004` turn in progress, `-32005` unsupported protocol version with `supportedVersions`, `-32007` auth required, `-32008` not found, `-32009` permission denied, `-32011` conflict.

## Multi-client semantics

Any number of clients may subscribe to a channel; each receives every envelope including other clients' actions, and reconciles its own echoes by origin. Permissions have no owner: the first confirmation wins, later ones are rejected. Drafts are shared state, so clients see each other's unsent text. Client-provided tools are declared per client and only that client may complete them.

## VS Code today

VS Code spawns its host as a utility process locally and connects to a remote host over WebSocket through SSH, WSL, a dev tunnel or a plain address. The `chat.remoteAgentHosts` setting stores entries of the form `{ "address": "ws://host:port", "name": "…", "connectionToken": "…" }` and the client appends the token itself. A compliant server that negotiates `0.9.x` and returns a root state with at least one agent is reachable that way without changing `product.json`; whether the WebSocket factory is registered in every stable build was not verifiable from the notes. There is no extension API to register a host; that request is [open](https://github.com/microsoft/vscode/issues/325827). The community OpenCode plugin implements an obsolete pre-SemVer dialect and does not negotiate with a 0.9 client.

## SDKs and versioning

The TypeScript package `@microsoft/agent-host-protocol` is MIT, has no runtime dependencies and exports the types, the reducers, a client, a state mirror and a WebSocket transport; Rust, Kotlin, Go, Swift and .NET clients exist at the same version. All are clients; the only server is VS Code's. Versions are SemVer strings; compatibility is same minor while the major is 0. `ACTION_INTRODUCED_IN` lets a host omit actions unknown to the negotiated version.

## Fit

De Vloer maps one session to one chat, projects its durable events into the chat actions above, exposes the candidate as a changeset backed by the harness's native diff, and answers permission and question requests through the engine. Terminals and writes are deliberately absent. The result is in [ADR 0012](../adrs/0012-agent-host-protocol-host.md) and `src/ahp/`.
