# HTTP contract

This guide describes the v0.2 routes implemented by `src/http.ts` and session rules in `src/engine.ts`. The internal [implementation coordination contract](implementation.md) records the initial team agreement; executable tests and source resolve drift. Routes return JSON objects or arrays directly. Errors have the form `{"error":{"code":"...","message":"..."}}`.

## Identity and mutation requests

Live API access requires a login cookie. Every mutation, including login, requires `X-Vloer-Request: 1`; JSON requests require `Content-Type: application/json`. Browser requests also pass same-origin checks. Cross-origin access is not enabled. Login cookies are HttpOnly and SameSite Strict; an HTTPS base URL enables secure cookies. Configure the public base URL accurately behind a reverse proxy.

Operators can read and change sessions they own. Administrators can access all sessions and authorize budget additions. Viewers cannot mutate work. Inaccessible session IDs return 404. v0.1 does not expose shared team membership or invitation management.

| Method and path | Request or response |
| --- | --- |
| `POST /api/login` | `{name,password}` → `{user}` and login cookie |
| `POST /api/logout` | `{}` → `{ok:true}` and expired cookie |
| `GET /api/bootstrap` | Current user, mode, registered repositories/crews/models/runtimes, enabled workspace `placements` and limits |
| `GET /api/health` | Authenticated configuration/readiness summary; does not prove upstream provider reachability |
| `GET /healthz`, `GET /readyz` | Process/store health for probes; no provider credentials or endpoints returned |

## Sessions

| Method and path | Behavior |
| --- | --- |
| `GET /api/sessions` | Sessions visible to the current user |
| `POST /api/sessions` | `{title,objective,repositoryId,crewId,runtime,placement?,budgetUsd,trackerUrl?}` → created session, status 201 |
| `GET /api/sessions/:id` | Public session view, runs, retained artifacts and accounting status |
| `POST /api/sessions/:id/start` | `{}`; start queued work in the background |
| `POST /api/sessions/:id/pause` | `{}`; deliberately stop active execution while retaining the session |
| `POST /api/sessions/:id/resume` | `{}`; explicitly continue paused/interrupted work subject to spend reconciliation |
| `POST /api/sessions/:id/cancel` | `{}`; intentional cancellation, with no automatic replacement run |
| `POST /api/sessions/:id/messages` | `{text}`; persist an operator instruction |
| `POST /api/sessions/:id/budget` | `{amountUsd}`; administrator authorizes an additional positive amount within the total limit |

Selection values must come from the registered profiles. `placement` is one of the workspace backends listed in `placements` (`docker`, `kubernetes` or `local`); omitted, it takes the deployment default, and a demonstration deployment lists none. The created session records `placement`, and the `workspace.ready` event reports the resulting `backend` and `isolation` (`container`, `pod` or `working-directory`). Budgets are positive amounts in USD; they are not token allocations. One optional writer may precede reviewers, and roles execute sequentially. Completion requires explicit approval from required reviewers. A review requesting changes is a human decision point rather than an automatic rewriting loop.

A message does not promise immediate insertion into an executing model request. Pause, record the changed instruction and resume when the current run must restart with it. Resume preserves the existing authorization and settled spend. Unresolved prior spend remains reserved and can block resume. A process restart marks active work interrupted and does not silently repeat paid execution.

## Durable events and human input

Sessions may include an additive `failure` object: `{category, stage, message, remediation, promptAcceptance, automaticRetry:false, detail?}`. Its message and remediation come from a fixed safe catalog. Raw exception text, HTTP headers, credentials, stack traces and provider response bodies are excluded. The optional `detail` is the recorded cause when the server itself produced it: the failing workspace command, its exit code or signal, and the last 4 KiB of its standard error, with credentials, bearer tokens, key-shaped strings and server filesystem paths redacted and the whole bounded to 2,000 characters. Runtime exception messages never become `detail`. Older sessions and servers may omit both fields; `blocker` remains a compatible short message.

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

## Linked tasks

Connections are administrator-registered `taskSources`. Forgejo, GitHub, GitLab, ClickUp and Vikunja share the same read-only API. A source maps one tracker project or list to a configured repository. Task content cannot supply a repository URL, model credential, runtime command or execution owner. All authenticated users of this pilot deployment can browse its registered sources; source-level team authorization is a later feature.

| Method and path | Behavior |
| --- | --- |
| `GET /api/task-sources` | Public connection records; never connector credentials |
| `GET /api/task-sources/:sourceId/tasks?page=1` | `{tasks,nextPage?}` with bounded pagination |
| `GET /api/task-sources/:sourceId/tasks/:taskId` | Current task snapshot for explicit preview |
| `POST /api/task-imports` | `{sourceId,taskId,revision,crewId,runtime,placement?,budgetUsd}` → queued session, 201 new or 200 existing |

A snapshot includes `key`, `sourceId`, `provider`, `id`, `revision`, `title`, `description`, `url`, `status`, `repositoryId` and optional `updatedAt`. Status is normalized to `open`, `closed` or `unknown`; only open tasks can be imported. The revision hashes the material snapshot. Import refetches the configured source and returns 409 `task_changed` if the preview is stale. The server retains the accepted snapshot in `session.sourceTask`, redacting any known server credentials from its title and description before persistence and prompting and frames its body as untrusted reference material in the objective.

Import requires an operator or administrator and passes the same mutation guard as other actions. It does not call a model, assign a tracker task or start execution. Calling import twice for the same canonical task and revision returns the existing session across reconnects and process restarts. Another operator receives a generic conflict, without private session details. A changed revision cannot create competing work while an earlier session is active, stopping or has unresolved reservations. Finished revisions remain inspectable; importing is not a retry command.

Set `executionOwner: "ploeg"` on repositories assigned to unattended Ploeg execution. Vloer rejects both imported and ad hoc execution for those repositories, and rechecks this policy at start and resume. A Ploeg-owned source is also blocked. This is an administrator-configured separation of execution lanes, not a shared distributed claim with Ploeg. [Connection setup](../operations/task-connections.md) covers all providers.

## Candidate exports

| Method and path | Behavior |
| --- | --- |
| `GET /api/sessions/:id/candidate` | Export availability and immutable snapshot metadata |
| `GET /api/sessions/:id/candidate/download?format=bundle` | Authenticated Git bundle download |
| `GET /api/sessions/:id/candidate/download?format=patch` | Full binary-capable Git patch |
| `GET /api/sessions/:id/candidate/download?format=manifest` | JSON provenance, file and integrity metadata |

Candidate access uses the same owner/administrator checks as the session. A successful export preserves a reviewable change; it does not certify independent verification, authorize publication or merge anything. Availability and limitations are explicit in the metadata. Native harness history and credentials are not portable candidate contents.
