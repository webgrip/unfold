# 0015 — Ploeg exposes a read-only operator API and Unfold projects it

Date: 2026-09-10. Status: proposed; nothing implemented on either side.

## Context

Unfold's window into Ploeg is `GET /api/v1/queue/depth?team=`, one integer per configured team, fetched on navigation and discarded ([src/http.ts](../../src/http.ts#L187-L200)). Ploeg records work items, leases, shifts, rounds, runs with role, outcome, verdict, findings and spend, checkpoints and an audit log, and exposes none of it: its API has ten routes, one of which lists non-done work items for a named team ([pkg/httpapi/server.go](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/httpapi/server.go#L72-L86)). No route is authenticated; the run token in the path is the only credential and it guards one run. Ploeg has decided against a board UI and intends a CLI, `ploegctl`, that has not been written. Two of its watchlist items want read-only projectors over run events and name a single-item read endpoint as the prerequisite. The full comparison is in [the research record](../research/2026-09-10-ploeg-and-unfold-split.md).

[ADR 0005](0005-one-work-authority.md) already fixes two constraints: an authenticated, object-authorized operator protocol rather than the worker endpoints, and no direct reads of Ploeg's tables. Grafana at the second estate reads Ploeg's Postgres through a dedicated role; that is the precedent this decision rejects for Unfold, because a schema is not a contract. Both estates authenticate people through Authentik and hold service credentials in OpenBao, so a bearer for a consumer and, later, an OIDC token for a person are both available without new infrastructure.

## Decision

Ploeg grows a read-only operator API. A new prefix, `/api/v1/operator/`, registered on its own mux that accepts `GET` only, backed by store methods that only read. Resources:

- `teams`: the configured teams with queue depth per role and their paused state, so a consumer never has to know team names in advance.
- `work-items`: paginated, filtered by team, state and `needs_human`, each item carrying attempts, next eligibility, resolved target, the live lease if any and a summary of the latest shift.
- `work-items/{id}`: the item with its shifts, every run with role, round, state, outcome, failure reason, verdict, findings, usage and authorized versus settled spend, its checkpoints, its audit rows and its links, including the pull or merge request URL Ploeg found on the forge.
- `runs/{id}`: one run, the same shape.
- `events`: the audit log from a cursor, long-poll first and server-sent events later, so a projector can mirror without polling lists.

Responses carry the LiteLLM key alias for ledger joins and never a run token, forge token or credential. The shape is a versioned JSON schema beside the existing run-api schema in Ploeg's `docs/contracts`, and the first version is frozen when Unfold ships against it.

Authentication starts with consumer bearers and grows into OIDC. Version one is a set of named static tokens in Ploeg's environment, each optionally scoped to teams, compared in constant time, delivered by ExternalSecret from OpenBao like every other Ploeg secret. Version two validates OIDC tokens from the estate's Authentik through its JWKS and maps a group claim to team scope, at which point the same middleware fronts `claim` and `renew`, which closes Ploeg's own open item on worker authentication. The operator prefix never ships unauthenticated, not even on the internal gateway.

Route exposure does not change. The internal gateway keeps `/`; the external gateway keeps `/webhooks/` only. webgrip gets an internal HTTPRoute for Ploeg, which it lacks today, so a workbench on that network can reach it the way the second estate's can.

Unfold projects, and stores nothing. The `ploeg` block gains `tokenEnv` and `teams` becomes optional. A new client module mirrors the broker's posture: `http` or `https` only, no credentials in the URL, bounded timeouts, redirects refused, response size and shape validated. `/api/ploeg` returns the projection: teams first, then items needing a human, then running items with role, round and spend, then the queue; `/api/ploeg/work-items/:id` returns the detail. The web view becomes that list with a detail drawer; the VS Code tree gains a Ploeg node; the Agent Host Protocol host later lists Ploeg runs as read-only sessions once `events` exists. Unavailable Ploeg degrades to today's `available: false`. Nothing from Ploeg enters Unfold's event log; a short in-memory cache is the only state.

Writes wait. Requeue, pause, cancel and handover stay out of this decision. They need Ploeg's fenced attempts and revision-checked mutations first, and [ADR 0005](0005-one-work-authority.md) already governs that order. The existing backlog item for the operator API narrows to the write half and depends on the read half.

## Consequences

Unfold becomes an honest front for both lanes: a person sees what Ploeg is doing, what it cost and where it stalled, in the same place they steer their own sessions. Ploeg gains its first authenticated surface, and the middleware it introduces is the one its worker endpoints need. Exposing the read model will surface Ploeg's recorded defects sooner, such as swept runs that never settle their spend and the fifty-item forge page limit; that is a benefit. Unfold's tests need a Ploeg fixture server. The webgrip estate needs one HTTPRoute. Ploeg is pre-alpha, so the operator schema will move; the version field and a frozen first version are what protect Unfold from that.

## Reconsider when

Ploeg ships `ploegctl` or a native event stream, in which case the projection consumes those instead; OIDC is enforced on every Ploeg route, at which point the static bearers are removed; [ADR 0005](0005-one-work-authority.md) is accepted, at which point the write half joins this API.

## Sequence

1. PV-079, Ploeg: operator read API version one with consumer bearers and its schema.
2. PV-080, Unfold: the client, projection, web view and extension node, replacing the depth tiles.
3. PV-081, Ploeg and Unfold: `events` and the read-only Agent Host Protocol projection of Ploeg runs.
4. PV-024, Ploeg: the write half, after PV-023.

## Implementation evidence — 2026-09-10

The read API, scoped browser projection and editor tree are implemented and qualified in [the unified baseline](../../../../docs/workflows/managed-execution.md). Fleet audit reads explicitly provide snapshot consistency; the proposed lossless fleet stream and AHP projection remain open. Separate operator executions now have serialized revision events and scoped commands under [ADR 0017](0017-delegate-interactive-execution-to-ploeg.md). The proposal above is retained as its original decision context; this dated note records implementation without silently accepting its unimplemented parts.

## Update, 2026-10-11

[ADR 0023](0023-unfold-submits-work-to-ploeg-and-never-executes-it.md) is accepted. The Agent Host Protocol projection of Ploeg runs in step 3 becomes the projection of Ploeg Work Items as Agents-window sessions ([epic VIK-1978](https://vikunja.webgrip.dev/tasks/1978)). Its commands use the operator API's existing withdraw and requeue routes and one new `message` command, not a general write half. This record stays proposed for the parts it names as open.
