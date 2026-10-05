---
status: accepted
date: 2026-10-03
decision-makers: Ryan Grippeling
review-by: 2027-04-03
---

# The agent host speaks WebSocket through `ws`

## Context and Problem Statement

[ADR 0012](0012-agent-host-protocol-host.md) serves the Agent Host Protocol over a dependency-free WebSocket server, because [ADR 0002](0002-native-node-and-single-writer-storage.md) kept Unfold's production npm dependency set empty. That server was a hand-written RFC 6455 frame parser in `src/ahp/websocket.ts`. The [2026-10-02 code quality review](../../../../docs/research/2026-10-02-code-quality-review.md) probed it locally: it accepted a text frame with a reserved bit set, a text frame that is not UTF-8, a fragmented ping and a continuation frame with no message to continue, and kept the connection open each time. Its `send()` ignored `socket.write()` backpressure, so a peer that stops reading grows the server's memory without bound. Node 24 ships a WebSocket client but no server. Should Unfold keep its own framing or take a dependency for it?

## Decision Drivers

* An authenticated client must not be able to put the server in an undefined protocol state or exhaust its memory.
* The owner wants protocol correctness from code that many servers already run, not from more hand-written parsing.
* A runtime dependency adds supply-chain surface, and the image must still ship with zero critical and high findings ([ADR 0010](0010-one-release-train-with-zero-cve-images.md)).
* The AHP host's connection interface and its authentication of the upgrade stay as they are.

## Considered Options

* `ws` as the one runtime dependency
* Repair the hand-written parser
* Another WebSocket server library

## Decision Outcome

Chosen option: "`ws` as the one runtime dependency", decided by the owner on 2026-10-03 (VIK-1723). `ws` is MIT-licensed, has no runtime dependencies of its own, validates frames against RFC 6455 and closes the connection with the matching status code.

1. **Pin.** `package.json` pins `ws` to an exact version under `dependencies` (8.22.0 since 2026-10-03), and `package-lock.json` records it. Renovate proposes updates like any other npm pin. `@types/ws` is a pinned devDependency for the type checker. The optional native add-ons `bufferutil` and `utf-8-validate` are not installed; `ws` uses Node's own `buffer.isUtf8`.
2. **Policy.** `npm run check` accepts a production dependency only when its name maps to an ADR in `decidedRuntimeDependencies` and its version is exact, and it lets `src/` import only native modules, repository files and those names. `ws` maps to this ADR. Any other runtime dependency still needs its own decision.
3. **Licence.** `npm run license:check` requires each runtime dependency to carry a permitted licence (MIT, ISC, BSD-2-Clause, BSD-3-Clause or Apache-2.0) and its own `LICENSE` file when installed, `NOTICE` to name it with its version, and the Dockerfile to install it.
4. **Image.** The Dockerfile's stage copies `package.json` and `package-lock.json` and runs `npm ci --omit=dev --ignore-scripts`, so the runtime image carries `node_modules/ws` and nothing else from npm.
5. **Connection.** `src/ahp/websocket.ts` keeps its exports for the host: `isWebSocketUpgrade`, `upgradeToWebSocket`, `rejectUpgrade`, `connectionToken` and `WebSocketConnection` with `open`, `send`, `close` and the `message`, `binary`, `error` and `close` events. It completes the upgrade through a `WebSocketServer` in `noServer` mode with per-message compression off, no subprotocol negotiated, `maxPayload` at 16 MiB and a one-second `closeTimeout`. `isWebSocketUpgrade` now also requires a well-formed `Sec-WebSocket-Key`, so a malformed one gets Unfold's own 400 before the token is checked.
6. **Backpressure.** `send()` disconnects a peer whose unread outbound bytes (`bufferedAmount`) exceed `maxBufferedBytes`, 16 MiB, before writing more. The connection emits `error` and `close`; the host drops the client as it does for any closed connection.

The host authenticates the upgrade exactly as before: the path, then `isWebSocketUpgrade`, then the `tkn` token, and only then the 101 response.

### Consequences

* Good, because reserved bits, invalid UTF-8, fragmented control frames, orphan continuations, unmasked client frames and oversized messages close the connection with 1002, 1007 or 1009 instead of being read.
* Good, because a slow or stalled peer costs at most the limit plus one message, then it is disconnected.
* Bad, because Unfold now depends on a third-party package at runtime. A `ws` vulnerability becomes an Unfold image finding, and the release gate holds the image until Renovate's update lands.
* Bad, because starting from a checkout now needs `npm ci` (`mise run setup` already runs it). ADR 0002's "startup performs no dependency installation" no longer holds for the server; the browser still has no build step and no npm dependency.
* Neutral, because after a protocol error the server sends its close frame and ends the socket at once, and after a close it starts (a revoked token, shutdown) it waits one second (`closeTimeout`) for the peer's answer, as the hand-written server did, and then destroys the socket.

### Confirmation

In `apps/unfold`:

* `mise exec -- npm test`: [`test/websocket.test.ts`](../../test/websocket.test.ts) sends raw masked frames over a real socket and checks the close code for each violation, the 16 MiB limit, the one-second closing timeout, a fragmented message with an interleaved ping, the disconnect of a peer that stops reading and that a reading peer stays connected, and that the agent host still answers 403 without a valid token. [`test/ahp.test.ts`](../../test/ahp.test.ts) runs unchanged.
* `mise exec -- npm run check` and `npm run license:check` enforce the dependency policy above.
* The CI container build context step builds the image; `node_modules/ws` must be present in it.

Re-evaluate when Node ships a WebSocket server, when `ws` stops being maintained, or when a second runtime dependency is proposed.

## Pros and Cons of the Options

### Repair the hand-written parser

* Good, because the production dependency set stays empty.
* Bad, because every fix is new parsing code that only Unfold runs, and the probes showed the first version missed four cases.

### Another WebSocket server library

* Bad, because the common alternatives either build on `ws` (Socket.IO) or ship native binaries (uWebSockets.js).

## More Information

* Ticket: VIK-1723.
* Amends [ADR 0002](0002-native-node-and-single-writer-storage.md) (the production dependency set is `ws` only) and [ADR 0012](0012-agent-host-protocol-host.md) (the WebSocket server is `ws`, not dependency-free).
