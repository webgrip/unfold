# Ploeg and De Vloer as documented, as built and as intended

Date: 2026-09-10. Both repositories were read at their trunks: De Vloer `development` at v0.3.0-rc.3, [Ploeg](https://forgejo.webgrip.dev/webgrip/ploeg) `development` at v0.3.0-rc.4. This page records what each says it does, what its code does, and what its own decisions and backlog say it should do. It exists because the two sets of documents describe a coupled pair of systems while the code describes two independent products that share one integer.

Ploeg paths below link to `https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/`.

## The one-line versions

| | Documented | Real | Desired |
|---|---|---|---|
| Ploeg | "Assign a ticket and Ploeg spins up an ephemeral team of agents on your cluster that works it, opens a pull request, reports the outcome and disappears" ([README](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/README.md)) | A careful, write-only dispatch plane with no read surface and no authentication | A CLI called `ploegctl` as the operator surface, metrics, and a read endpoint for projectors; a board UI is an explicit non-goal |
| De Vloer | "The human workbench beside Ploeg" ([AGENTS.md](../../AGENTS.md)) | A self-sufficient interactive agent platform that asks Ploeg one question | One shared work authority with fenced handover in both directions ([ADR 0005](../adrs/0005-one-work-authority.md)) |
| The seam | "De Vloer is the human front for both lanes" | One authenticated GET returning up to fifty integers, plus a config string that makes De Vloer refuse work | An authenticated operator protocol, never direct table reads |

## Ploeg

### Documented

Ploeg is "a dispatch plane: it turns work items from any tracker into ephemeral, leased, audited AI-agent runs on Kubernetes. The tracker stays the source of truth for what to do; Ploeg owns how work gets executed" ([docs/domain/overview.md](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/domain/overview.md)). Status is pre-alpha, "watch, don't install". Non-goals include a kanban or board UI and cost ledgering ([docs/design.md](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/design.md)). Its own [architecture.md](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/architecture.md) opens with "design.md records intent; this file records reality" and lists nineteen divergences.

### Built

The execution half is built and unusually careful:

- Ten HTTP routes, all in [pkg/httpapi/server.go](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/httpapi/server.go#L72-L86): health, tracker and forge webhooks, `claim`, `renew`, `checkpoint`, `outcome`, `queue/depth` and `queue/{team}`.
- Exactly one route returns a list, `GET /api/v1/queue/{team}`, and it returns non-done work items only, "deliberately not a board" ([pkg/store/store.go](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/store/store.go#L684-L714)). Nothing exposes runs, shifts, rounds, findings, verdicts, spend, checkpoints or audit rows, although the store has those queries.
- A separate `ploeg-worker` binary claims work at start inside a KEDA ScaledJob or CronJob pod, clones the target, mints a per-run LiteLLM key with alias `ploeg-<12 hex>` and revokes it on every return path ([pkg/worker/worker.go](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/worker/worker.go#L322-L374)). Four harness adapters exist: OpenHands, exec, Claude Code and ACP with an OpenCode profile.
- Ploeg does not open the pull request; the prompt tells the agent to, and Ploeg then reads the forge as ground truth ([pkg/worker/forge.go](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/worker/forge.go#L29-L51)). Findings become pull-request comments and the tracker gets a comment asking a human to merge; the board's status column is never moved by design ([pkg/shiftengine/publish.go](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/shiftengine/publish.go#L174-L189)).
- Leases are one row per item with a TTL and `SKIP LOCKED` claims; the idempotency mechanism is an advance-once update on the run row. There are no fencing tokens anywhere in the repository.
- There is no authentication on the API. The 48-hex run token in the path is the only credential and it guards one run; `claim`, `queue/depth` and `queue/{team}` are open to anyone who can reach the service. At the second estate that is the internal gateway only; the external route carries `/webhooks/` alone.
- Task sources are webhook-only, Vikunja and ClickUp; there is no poller and no tracker delivery deduplication.

### Intended

The operator surface is meant to be `ploegctl` with `status`, `queue ls`, `needs-human ls`, `requeue`, `force-claim` and team pause ([backlog #96](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/backlog.md)), and it does not exist. A web dashboard is "considered and excluded". Two watchlist items describe read-only projector services over run events, one of them for the Agent Host Protocol, and note that they need "a ploegd single-item read endpoint" first. Metrics and tracing in Go are wanted and absent. Per-run bearer tokens, reconciliation polling, state-machine enforcement and checkpoint-driven resume are all open.

## De Vloer

### Documented

"The tracker owns prioritization. Ploeg owns unattended dispatch. De Vloer owns interactive sessions and human intervention" ([AGENTS.md](../../AGENTS.md)). The founding decision says to expose Ploeg queue information through a read-only connector and never to "dispatch work through an imagined Ploeg endpoint" ([ADR 0001](../adrs/0001-the-human-workbench-beside-ploeg.md)). The generated [product design](../PRODUCT-DESIGN.md) contradicts that in places, stating that Vloer "invokes Ploeg to change execution ownership", which no code does. ADRs 0011 to 0014 and the three research documents of the same day mention Ploeg zero times.

### Built

- One Ploeg call in the codebase: `GET {ploeg.url}/api/v1/queue/depth?team=` per configured team, four-second timeout, result validated as a non-negative integer and discarded after the response ([src/http.ts](../../src/http.ts#L187-L200)).
- One nav item and one panel of tiles, fetched once per navigation, no polling ([public/app.js](../../public/app.js#L199-L202)). The VS Code extension shows lane labels only; the AHP host has no Ploeg projection.
- `executionOwner: 'ploeg'` is a string in De Vloer's own config. Its only effect is that De Vloer refuses to run that repository or import from that source ([src/engine.ts](../../src/engine.ts#L108-L112)). Ploeg neither sets nor sees it.
- De Vloer mints its own LiteLLM keys and runs `opencode serve` itself in every placement. It never pushes, never opens a merge request, and the candidate manifest hardcodes verification and publication as not performed and rejects a manifest that claims otherwise ([src/candidates.ts](../../src/candidates.ts#L230)).

### Intended

[ADR 0005](../adrs/0005-one-work-authority.md) wants Ploeg to own immutable work orders and fenced delivery attempts, with De Vloer's sessions referencing them, reached through "an authenticated, object-authorized operator protocol rather than exposing existing worker endpoints to an editor", and forbids querying Ploeg tables directly. [ADR 0006](../adrs/0006-trusted-verifier-and-publisher.md) puts publication behind a trusted publisher and a durable barrier. Twenty-seven backlog tickets target Ploeg; three are in review and the rest are planned. The product design's own table of the desired Vloer surface still lists `GET /api/ploeg` as "read-only queue projection", so the richer operator view was never designed on either side.

## What this means

Both lanes exist and both are real. What is fictional is the front. Ploeg records everything an operator would want, reachable only by SQL, and has decided against a board. De Vloer has the board, the event log, the editor client and the AHP host, and reads one number. The boundary between the lanes is fine. What is missing is a read API on Ploeg's side, a projection on De Vloer's side, and a credential to connect the two. [ADR 0015](../adrs/0015-ploeg-operator-read-api.md) proposes the shape.
