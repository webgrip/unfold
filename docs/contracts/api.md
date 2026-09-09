# HTTP contract

This guide describes the v0.1 routes implemented by `src/http.ts` and session rules in `src/engine.ts`. The internal [implementation coordination contract](implementation.md) records the initial team agreement; executable tests and source resolve drift. Routes return JSON objects or arrays directly. Errors have the form `{"error":{"code":"...","message":"..."}}`.

## Identity and mutation requests

Live API access requires a login cookie. Every mutation, including login, requires `X-Vloer-Request: 1`; JSON requests require `Content-Type: application/json`. Browser requests also pass same-origin checks. Cross-origin access is not enabled. Login cookies are HttpOnly and SameSite Strict; an HTTPS base URL enables secure cookies. Configure the public base URL accurately behind a reverse proxy.

Operators can read and change sessions they own. Administrators can access all sessions and authorize budget additions. Viewers cannot mutate work. Inaccessible session IDs return 404. v0.1 does not expose shared team membership or invitation management.

| Method and path | Request or response |
| --- | --- |
| `POST /api/login` | `{name,password}` → `{user}` and login cookie |
| `POST /api/logout` | `{}` → `{ok:true}` and expired cookie |
| `GET /api/bootstrap` | Current user, mode, registered repositories/crews/models/runtimes and limits |
| `GET /api/health` | Authenticated configuration/readiness summary; does not prove upstream provider reachability |
| `GET /healthz`, `GET /readyz` | Process/store health for probes; no provider credentials or endpoints returned |

## Sessions

| Method and path | Behavior |
| --- | --- |
| `GET /api/sessions` | Sessions visible to the current user |
| `POST /api/sessions` | `{title,objective,repositoryId,crewId,runtime,budgetUsd,trackerUrl?}` → created session, status 201 |
| `GET /api/sessions/:id` | Public session view, runs, retained artifacts and accounting status |
| `POST /api/sessions/:id/start` | `{}`; start queued work in the background |
| `POST /api/sessions/:id/pause` | `{}`; deliberately stop active execution while retaining the session |
| `POST /api/sessions/:id/resume` | `{}`; explicitly continue paused/interrupted work subject to spend reconciliation |
| `POST /api/sessions/:id/cancel` | `{}`; intentional cancellation, with no automatic replacement run |
| `POST /api/sessions/:id/messages` | `{text}`; persist an operator instruction |
| `POST /api/sessions/:id/budget` | `{amountUsd}`; administrator authorizes an additional positive amount within the total limit |

Selection values must come from the registered profiles. Budgets are positive amounts in USD; they are not token allocations. One optional writer may precede reviewers, and roles execute sequentially. Completion requires explicit approval from required reviewers. A review requesting changes is a human decision point rather than an automatic rewriting loop.

A message does not promise immediate insertion into an executing model request. Pause, record the changed instruction and resume when the current run must restart with it. Resume preserves the existing authorization and settled spend. Unresolved prior spend remains reserved and can block resume. A process restart marks active work interrupted and does not silently repeat paid execution.

## Durable events and human input

Sessions may include an additive `failure` object: `{category, stage, message, remediation, promptAcceptance, automaticRetry:false}`. Its message and remediation come from a fixed safe catalog. Raw exception text, HTTP headers, credentials, URLs, stack traces and provider response bodies are excluded. Older sessions and servers may omit the field; `blocker` remains a compatible short message.

Stages are `credentials`, `workspace`, `runtime`, `prompt` and `execution`. Prompt certainty is `not_submitted`, `rejected`, `accepted` or `unknown`. `accepted` means submission was acknowledged, not completed work or settled spend. `unknown` means the runtime may have started paid work; it never authorizes an automatic retry. `session.failed` and operator pause/cancel events retain the same safe object in `data.failure`. An explicit new execution clears the current failure; durable history retains earlier evidence. Cancellation metadata is stop intent, not proof of remote termination.

| Method and path | Behavior |
| --- | --- |
| `GET /api/sessions/:id/history?after=N` | Durable event array after cursor `N` |
| `GET /api/sessions/:id/events?after=N` | Server-sent events; numeric `id`, JSON Event in `data` |
| `GET /api/sessions/:id/permissions` | Human permission/question requests without native credential state |
| `POST /api/sessions/:id/permissions/:requestId` | Permission `{decision:"once"|"always"|"reject"}` or question `{answers:string[][]}` |

An event contains `id`, `sessionId`, `type`, `at`, `actor`, optional `runId` and structured `data`. Reconnection can use `after` or the standard `Last-Event-ID` header. Treat events as replayable and deduplicate by ID. A terminal session remains inspectable through history.

Permission and question details depend on the adapter. Answer only the actual unresolved request; a generic message is not a permission grant. A successful HTTP action reflects the stored lifecycle transition, not completion of all subsequent background work.

## Ploeg

`GET /api/ploeg` reads configured team depths from Ploeg's `/api/v1/queue/depth?team=...`. It returns configuration/reachability information and any configured tracker link. The connector does not expose a dispatch action, create tickets, assign work or modify Ploeg state.
