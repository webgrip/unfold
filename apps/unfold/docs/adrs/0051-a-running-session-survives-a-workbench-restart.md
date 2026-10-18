---
status: proposed
date: 2026-10-18
decision-makers: Ryan Grippeling
review-by: 2027-01-18
---

# A running session survives a workbench restart

## Context and Problem Statement

Renovate redeploys the workbench several times a day. Every supervised session running at that moment failed (VIK-2210). On 2026-10-17 the twente.dev session 93fdff4e kept its workspace agent working through three redeploys, and its relay worker logged `poll failed (1): UND_ERR_SOCKET`, then `ECONNREFUSED`, then 40 × `UND_ERR_CONNECT_TIMEOUT`, and finally `relay refused the worker (HTTP 401); stopping`.

The restarted workbench refused the worker because everything that tied it to the workspace lived only in the old process: the relay token (`WorkerRelay.register` kept it in a `Map`, [ADR 0011](0011-sandboxes-dial-out-through-a-relay.md): "Tokens live in memory with the workspace"), and the workspace's OpenCode password (`KubernetesWorkspaces.passwords`). The engine's start-up recovery then marked every running session `interrupted`, and stopping a workspace whose OpenCode password was gone disposed of it. The workbench never gave the worker a chance.

How does a running session keep running when the workbench restarts, without accepting an old or revoked credential and without repeating paid work?

## Decision Drivers

* A restart does not end, repeat or re-prompt paid work, and nobody has to act for the session to continue.
* Ploeg authorizes every Run ([system ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md)); a session continues only while Ploeg still holds its execution running.
* A revoked or ended session's worker is refused and stops; the store never holds a token.
* Spend accounting is the same with or without a restart.

## Considered Options

* Persist the digest of each worker credential, and reattach running workspaces after a restart.
* Derive worker tokens from a persisted key (HMAC of the session id).
* Keep restarts interrupting sessions, and have someone resume them.

## Decision Outcome

Chosen option: persist the digest and reattach, because it keeps revocation per workspace and changes nothing a worker already holds.

1. **The relay keeps a digest.** `WorkerRelay` stores the SHA-256 of each worker token in the store's encrypted internal state (`relay:<session>`), never the token. A restarted relay rebuilds the workspace's registration from that digest when the worker polls again with the token it holds. Releasing a workspace writes a `revoked` marker, which a restart keeps; a poll with a revoked credential gets `401` with code `revoked`.
2. **A session that ends revokes its worker.** When a session completes, fails or is cancelled, Unfold captures the candidate first and then revokes the worker's relay credential. The worker stops and the workspace's storage is kept for recovery. A paused or interrupted session keeps its worker, because capture and delivery still use the relay.
3. **The stopping workbench leaves reattachable work running.** A session is reattachable when Ploeg executes it, its workspace is a pull-transport Kubernetes Pod, and the workspace has accepted the prompt of the Run that is running (OpenCode records `native.session` with `prompted: true` after `prompt_async` succeeds). On shutdown Unfold stops observing such a session but neither aborts the agent nor reports it to Ploeg, and records `workspace.waiting` with phase `reconnecting`. Every other session is interrupted as before.
4. **The restarted workbench reattaches within a grace window.** Start-up recovery checks with Ploeg that the execution is still running in the same generation, reads the workspace's OpenCode credentials back from its own Kubernetes Secret, and waits for the worker to poll the relay again. It waits `runtime.reconnectGraceMs` (default five minutes), and never longer than the Ploeg lease leaves, less one heartbeat. On success it records `workspace.reconnected` and observes the running Run to the end without prompting again, then runs the remaining Runs as usual. If Ploeg no longer holds the execution, the lease is nearly gone or the worker does not come back, the session is interrupted exactly as a restart interrupted it before.
5. **The worker rides out the restart.** It retries its poll with backoff for as long as the workbench is unreachable, retries a plain `401` or `404` for `UNFOLD_RELAY_REFUSAL_GRACE_MS` (two minutes by default) because a starting workbench may not serve the relay yet, and stops at once on `revoked`.

While the session reconnects its status stays `running`; the Status page lists it with phase `reconnecting`, and the session view says so. The issued inference key and Ploeg's spend record carry on, so no second key is minted and the observed spend is read as before.

### Consequences

* Good, because a redeploy no longer fails running sessions, and a stopped workbench costs nothing extra: the agent's model calls during the gap are metered by the gateway as always.
* Good, because revocation is explicit and durable; the cheap way out, accepting any old token, stays closed.
* Bad, because a turn's own `runtime.timeoutMs` restarts when it is reattached, so one turn can run for up to that long again after a restart.
* Bad, because only the pull-transport `pod` provisioner reattaches. The `sandbox` provisioner, Docker and local workspaces, and sessions Unfold runs without Ploeg are still interrupted by a restart.
* Neutral, because the first deploy of this change is still stopped by the previous version, which interrupts running sessions.

### Confirmation

`test/session-restart.test.ts` starts a session against a workbench whose Kubernetes client starts the real relay worker, restarts the workbench over the same store and port, and requires the session to complete without a second prompt or a second inference key; a cancelled session's worker must get `401 revoked` and stop, also after a restart. `test/relay.test.ts` covers the digest, the revoked marker and the worker's refusal grace.

## Pros and Cons of the Options

### Derive worker tokens from a persisted key

* Good, because nothing per workspace is stored.
* Bad, because revoking one workspace then needs a stored deny list anyway, and rotating the key revokes every workspace at once.

### Keep interrupting, resume by hand

* Good, because nothing changes.
* Bad, because Renovate redeploys several times a day and every long session needs a person.

## More Information

[ADR 0011](0011-sandboxes-dial-out-through-a-relay.md) is updated to point here. Ticket: VIK-2210.
