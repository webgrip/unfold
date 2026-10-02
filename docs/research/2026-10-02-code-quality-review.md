# Code quality review, 2 October 2026

Status: research record, 2026-10-03. It summarizes an external code quality, security and architecture review of `development @ 2d0496f` dated 2026-10-02, and records which findings still hold on `development @ 8a834e6` and which ticket fixes each one. The review's PDF and evidence bundle (probes, logs, file manifest) were deleted on 2026-10-03; [Finding details](#finding-details) keeps what a fix needs from them. Commit ids here are after the 2026-10-03 history rewrite; the review itself cited the pre-rewrite id `6394c6d`.

## Verdict

The review rates the domain model (Work Item, Shift, Run, Lease, authorized versus settled spend) and the control-plane concurrency design as strong. It found the weaknesses where outside input enters, at webhooks, sign-in, the editor handoff and the signup form, and in the unfinished move to Ploeg as the only engine ([ADR-0002](../adr/adr-0002-ploeg-is-the-only-engine.md), Vloer ADR-0023). It advises against a framework rewrite, microservices, event sourcing or a message broker.

The reviewed snapshot failed `mise run verify`. On `8a834e6` every gate passes, including the PostgreSQL suites and `runtime-docker.test.ts` that the auditor could not run as root.

## Findings

Evidence labels are the review's own: *reproduced* (a local probe showed it), *source* (the code path establishes it), *deployment* (exposure depends on configuration outside this repository).

| # | Finding | Evidence | Status on `8a834e6` | Ticket |
| --- | --- | --- | --- | --- |
| F01 | Forge webhook records the delivery id before checking the signature | source | Open | VIK-1715, inbox VIK-1727 |
| F02 | Vikunja and ClickUp webhooks accept unsigned events when no secret is set | reproduced | Open | VIK-1716 |
| F03 | Editor sign-in hands the initiator a session without the user approving | reproduced | Open | VIK-1718 |
| F04 | OIDC sign-in is not bound to the browser that started it | reproduced | Open | VIK-1717 |
| F05 | Vendored Three.js 0.186.1 disagrees with the 0.165.0 pin | reproduced | Fixed by `10bb764` | — |
| F06 | Recorded demo replay is stale | reproduced | Fixed by `39e500c` | — |
| F07 | Release jobs do not wait for the warnings gate | source | Deliberate per [CI](../operations/ci.md) and `scripts/workflow-policy.test.cjs`; owner to decide whether to keep it | VIK-1719 |
| F08 | Signup body limit trusts `Content-Length` | reproduced | Open | VIK-1720 |
| F09 | VS Code checkout matches `owner/repo` across forges | reproduced | Open | VIK-1722 |
| F10 | ClickUp `client_secret` sent in the token URL | source | Open | VIK-1721 |
| F11 | Custom WebSocket accepts invalid frames, ignores backpressure | reproduced | Open; owner chose the `ws` library | VIK-1723 |
| F12 | Health probes read every session; event replay has no limit | source | Open | VIK-1724 |
| F13 | ploegd has no read or idle timeout | source | Open | VIK-1725 |
| F14 | Migrations are not serialized across processes | source | Open | VIK-1726 |
| F15 | Review comments to the forge are best-effort | source | Open, deliberate trade-off | VIK-1728 |

## Recommendations

| # | Recommendation | Where it goes |
| --- | --- | --- |
| A01 | Finish the Ploeg-only execution boundary | Vloer ADR-0023's increments |
| A02 | Make worker isolation a deployment contract before hostile code | VIK-1731 (Homelab Roadmap) |
| A03 | Prove the bot token cannot merge or bypass branch protection | VIK-1731 |
| A04 | One admission cap across tracker and workbench work | With A01 |
| A05 | Versioned wire contracts between Ploeg and Vloer | When feature work touches the client |
| A06 | Split large modules by invariant (`engine.ts`, `ploeg.ts`, `card.go`, `extension.ts`) | When feature work touches them |
| A07 | Exact Money type before billing | VIK-1730, phase 2 |
| A08 | Secret scanning, govulncheck, shipped-asset inventory, pinned actions | VIK-1729; action pinning in VIK-1719 |

All tickets sit under the epic VIK-1714 on the Glide board.

## Finding details

What each open finding is, where it lives, the fix the review proposed and when it counts as fixed. Priority and severity are the review's. Every location below was re-checked on `development @ ce6e2db`.

### F01 Forge webhook dedup before signature check (P0, high)

`Server.handleForgeWebhook` in `apps/ploeg/pkg/httpapi/server.go` calls `Store.SeenDelivery` before `ParseWebhook` verifies the signature. `SeenDelivery` is an insert, not a lookup, so an unsigned request can record a delivery id and the later genuine delivery with that id is acknowledged with 202 and dropped. A crash after the insert loses an honest redelivery the same way.

Fix: verify the signature on the bounded raw body before any write, then keep a durable inbox keyed by provider and authenticated delivery id with payload hash, status and attempts, and let a worker retry pending effects. Done when an invalid signature inserts nothing, a valid request after an invalid one with the same id executes, a crash after receipt recovers, and a reused id with a different payload is reported as a conflict.

### F02 Unsigned tracker webhooks accepted when no secret is set (P0, high, conditional)

`Provider.ParseWebhook` in `apps/ploeg/pkg/provider/vikunja/vikunja.go` and `apps/ploeg/pkg/provider/clickup/clickup.go` verifies the signature only when `Secret` is non-empty. Vikunja is registered at startup and ClickUp is enabled by its API token alone, so a reachable live webhook route without a secret accepts forged assignment and withdrawal events. The auditor fed unsigned payloads to both parsers and each produced an event.

Fix: refuse to start with an enabled live webhook route and no signing secret; make unsigned fixtures a named test mode that live configuration cannot enable. Done when such a configuration fails validation, and missing, malformed or wrong signatures change no state while valid ones still work for both providers.

### F03 Editor sign-in hands over a session without approval (P0, high)

The editor sign-in in `apps/vloer/src/http.ts` and `apps/vloer/src/auth.ts` lets an unauthenticated caller start a sign-in, send the URL to someone else and collect that person's workbench session once they sign in. Nothing asks the signed-in person to approve the editor request. This is device-flow phishing, not a bypass of the identity provider.

Fix: after sign-in, show an approval page naming the editor request with a short code to compare, with deny and expiry, and issue a scoped, revocable editor credential instead of the full session cookie. Done when signing in alone never makes a ticket collectable, polling before approval returns pending, and the user can revoke the editor credential.

### F04 OIDC sign-in not bound to the starting browser (P1, medium)

`apps/vloer/src/oidc.ts` keeps pending OIDC state (PKCE verifier, nonce) in a process-wide map, and the start route sets no browser-binding cookie, so any client holding `code` and `state` can finish the transaction. That allows login CSRF: a victim completes an attacker-started sign-in and works inside the attacker's account.

Fix: a short-lived Secure, HttpOnly transaction cookie (SameSite=Lax for the callback) whose digest is stored with the pending state and checked before the session is issued. Done when a callback without the binding, with another browser's binding or with an expired one fails, and a normal round trip succeeds.

### F08 Signup size limit trusts `Content-Length` (P1, medium)

The signup Worker in `apps/site/src/worker/signup.ts` compares the `content-length` header with `MAX_BODY_BYTES`, treats a missing header as 0, then calls `request.formData()` on an unbounded body. A 65,610-byte form without the header was accepted against the 8,192-byte limit.

Fix: read the body through a byte-counting stream with a hard cap before parsing; treat the header as an early-rejection hint only. Done when every oversized body, with a missing, misleading or correct header, returns 413 without touching D1.

### F09 VS Code checkout matches repositories across forges (P1, medium)

`remoteMatches` in `apps/vloer/extensions/vscode/src/git-remotes.ts` reduces a remote URL to its last two path parts and compares `owner/repo` case-insensitively, ignoring the host and any namespace. A same-named repository on another forge matches, and `decodeURIComponent` outside the parse guard throws on malformed encoding.

Fix: compare a canonical identity of forge origin, full namespace and name, with explicit mapping for SSH host aliases, and treat malformed URLs as non-matching. Done when tests cover the same name on different hosts, nested GitLab namespaces, ports, SSH aliases and malformed URLs, and no automatic choice crosses forges.

### F10 ClickUp client secret in the token URL (P1, medium)

The ClickUp token exchange in `apps/vloer/src/links.ts` puts `client_id`, `client_secret` and `code` in the query string of a bodyless POST. URLs end up in proxy logs, traces and error messages; ClickUp documents these as body parameters.

Fix: send them as a JSON or form-encoded body and redact token-exchange fields from diagnostics. Done when an intercepted test request shows no secret or code in the URL.

### F11 Custom WebSocket accepts invalid frames (P1, medium)

`apps/vloer/src/ahp/websocket.ts` accepted text frames with an RSV bit, invalid UTF-8, a fragmented ping and an orphan continuation frame in local probes, and `send()` ignores `socket.write()` backpressure. Masking and the 16 MiB message limit are enforced, and the route needs authentication.

Fix (owner's choice): replace it with the `ws` library behind the existing connection interface, with payload and queue bounds. Done when each invalid frame closes the connection with a protocol error, legal fragmentation and ping/pong work, and a slow peer cannot grow memory without bound.

### F12 Health probes read every session; replay is unbounded (P1, medium)

`/healthz` and `/readyz` in `apps/vloer/src/http.ts` call `listSessions()`, which reads, parses and restores the secret of every session on the synchronous SQLite API. Event replay in `apps/vloer/src/store.ts` reads all later events with no `LIMIT` before the SSE byte threshold applies.

Fix: liveness becomes a process check and readiness a cheap bounded storage query; session listing and replay get indexed pagination capped by count and bytes. Done when probe cost stays flat as sessions grow and a corrupt old session cannot fail liveness.

### F13 ploegd has no slow-body or idle timeout (P1, medium, deployment-dependent)

`apps/ploeg/cmd/ploegd/main.go` builds the `http.Server` with `ReadHeaderTimeout` only. Webhook readers cap bytes, but nothing limits how slowly a client sends them, so slow clients can hold connections on unauthenticated routes.

Fix: a documented timeout policy (body read, idle, per-route deadlines) agreed with the ingress limits, with per-write deadlines for streaming routes instead of one short write timeout. Done when a local slow-body test is cut off within the budget and maximum-size webhooks and long-lived streams still work.

### F14 Migrations not serialized across processes (P1 before overlapping starts, medium)

`apps/ploeg/pkg/store/store.go` checks `schema_migrations` outside the per-migration transaction and takes no advisory lock, so two processes starting together can both apply the same migration and one fails at startup.

Fix: hold a PostgreSQL advisory lock on one connection across check and apply, or run migrations as a single job before rollout, and record checksums. Done when two concurrent fresh starts converge on one migration set without failing.

### F15 Review comments are best-effort (P2, medium, deliberate)

`apps/ploeg/pkg/shiftengine/publish.go` logs failed forge comments and moves on, and two evaluators can both publish before the round-advance compare-and-swap picks a winner. A forge outage can leave a reviewer without a finding or budget-stop explanation, and concurrent evaluation can duplicate comments. The outcome itself stays in storage.

Fix: an outbox table written with the domain transition and a polling worker that retries with deterministic comment markers; no message broker needed. Done when a comment missed during an outage is published after recovery without uncontrolled duplicates.

### F07 Release does not wait for the warnings gate

In `.forgejo/workflows/on_source_change.yml` the `release` job needs only `checks`, not `warnings`. That is deliberate today (see [CI](../operations/ci.md)). If the owner wants warnings to block releases, add one release-ready gate that needs both and make every release job depend on it.

### Recommendations in brief

- **A02, worker isolation.** The worker can run a privileged Docker-in-Docker sidecar, its main container lacks the restrictive security context of the control plane, and sandbox RuntimeClass and network policy are optional (`apps/ploeg/ops/helm/ploeg`). Before hostile code: an isolated runtime, default-deny egress, bounded resources, and privileged DinD only as an explicit exception.
- **A03, bot authority.** Per-run Forgejo tokens are scoped to one repository with `write:repository`, but the worker proxy (`apps/ploeg/pkg/worker/forgeproxy.go`) allows any API subpath. Prove on a disposable repository that the bot can push run branches but cannot merge, push protected branches or delete the repository.
- **A07, money.** Spend passes through floating-point values in Go and TypeScript. Before invoicing: a Money type in integer micro-units or decimals, with rounding only at external boundaries.
- **A08, assurance.** Add secret scanning and govulncheck to PR checks, pin external actions by revision, and inventory shipped assets including vendored browser code (F05 showed the package graph can differ from what is served).

## Limitations

The auditor attacked no deployed service, made no paid model calls and inspected no cluster, Forgejo settings or provider permissions. Package scans (`npm audit`, `pnpm audit`, `govulncheck`) were clean for the analyzed dependency graphs; they do not cover vendored browser files or container images. No accessibility, load, fuzz or history-wide secret scan was done.
