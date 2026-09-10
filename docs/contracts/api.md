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
| `POST /api/sessions` | `{title,objective,repositoryId,crewId,runtime,placement?,approval?,budgetUsd,trackerUrl?}` → created session, status 201. `approval` is `manual` (default) or `auto`; `auto` needs a `docker` or `kubernetes` placement and answers every tool permission inside the sandbox itself, while questions still reach the operator |
| `GET /api/sessions/:id` | Public session view, runs, retained artifacts and accounting status |
| `POST /api/sessions/:id/start` | `{}`; start queued work in the background |
| `POST /api/sessions/:id/pause` | `{}`; deliberately stop active execution while retaining the session |
| `POST /api/sessions/:id/resume` | `{}`; explicitly continue paused/interrupted work subject to spend reconciliation |
| `POST /api/sessions/:id/cancel` | `{}`; intentional cancellation, with no automatic replacement run |
| `POST /api/sessions/:id/messages` | `{text}`; persist an operator instruction |
| `POST /api/sessions/:id/budget` | `{amountUsd}`; administrator authorizes an additional positive amount within the total limit |

Selection values must come from the registered profiles. `placement` is one of the workspace backends listed in `placements` (`docker`, `kubernetes` or `local`); omitted, it takes the deployment default, and a demonstration deployment lists none. The created session records `placement`, and the `workspace.ready` event reports the resulting `backend` and `isolation` (`container`, `pod` or `working-directory`). Budgets are positive amounts in USD; they are not token allocations. One optional writer may precede reviewers, and roles execute sequentially. Completion requires explicit approval from required reviewers. A review requesting changes is a human decision point rather than an automatic rewriting loop.

A message does not promise immediate insertion into an executing model request. Pause, record the changed instruction and resume when the current run must restart with it. Resume preserves the existing authorization and settled spend. Unresolved prior spend remains reserved and can block resume. A process restart marks active work interrupted and does not silently repeat paid execution.

`POST /api/sessions/:id/approval` with `{approval}` switches a live session between `manual` and `auto`, records `approval.changed`, and when switching to `auto` answers the permissions already waiting with `always`. Later roles are created with allow rules; a read role keeps its edit, bash and task denials.

While a session runs, the workbench reads each held gateway key every fifteen seconds and records `budget.observed` with the spend the gateway has already attributed; the session carries it as `observedUsd`. The same tick reads the gateway's request ledger for the key and records per-model usage on the session as `usage`: the model that actually answered, the routed group when an auto-router chose it, requests, refusals, cost and tokens. It is a live reading, not the settled figure `spentUsd`, which still arrives after reconciliation. A turn refused by the gateway because the key's ceiling is reached fails with category `budget_exhausted`, whose remediation is to authorize more budget and resume.

A crew's read roles are not all reviewers. Only the final role of a crew carries the review verdict and is prompted for it; an earlier read role is an analysis role that answers the objective with evidence and returns no verdict, so an investigation crew of analyst then challenger completes on the challenger's approval alone. Run cards label the two as analysis and independent review.

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

## Linked accounts

| Route | Behaviour |
| --- | --- |
| `GET /api/links` | The signed-in person's links: provider, host, whether the workbench has an application ID, whether the person is linked, and the account name and scopes. Never a token |
| `POST /api/links/gitlab` | Starts an OAuth authorization with PKCE and returns the GitLab URL to visit; 409 `link_unconfigured` without an application ID |
| `GET /api/links/gitlab/callback` | GitLab's redirect target. Needs no cookie: the `state` names the person who started it, once, within ten minutes. Redirects to `/?linked=gitlab` or `/?link_error=<code>` |
| `DELETE /api/links/gitlab` | Forgets the tokens and asks GitLab to revoke them |

A link is the person's own credential. Tokens are encrypted at rest with the workbench key beside the database and refreshed server-side before use. When a session starts on a repository whose origin matches the link's GitLab host, the clone step receives the access token as a git authorization header for that origin; the agent container and its environment never do. Publication through the link is [ADR 0016](../adrs/0016-sign-in-and-link-your-own-accounts.md) work that has not started.

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

### Transcript detail

A `tool` event carries the OpenCode part id, the tool's input as a bounded JSON preview, the tail of its output once completed, and its error text when it failed, so the stream shows one card per tool call that opens to what ran and what came back. Every run also records a `transcript` artifact: the assistant's text, reasoning when the model returned it, and each tool call with input, output and error, prefixed with the model that answered. Transcripts are shown in the Handoff tab and are not fed to later roles as evidence. A run's summary and `summary` artifact have the JSON verdict block removed; the verdict itself is on the run.

## Candidate exports

| Method and path | Behavior |
| --- | --- |
| `GET /api/sessions/:id/candidate` | Export availability and immutable snapshot metadata |
| `GET /api/sessions/:id/candidate/download?format=bundle` | Authenticated Git bundle download |
| `GET /api/sessions/:id/candidate/download?format=patch` | Full binary-capable Git patch |
| `GET /api/sessions/:id/candidate/download?format=manifest` | JSON provenance, file and integrity metadata |
| `GET /api/sessions/:id/candidate/download?format=attestation` | DSSE envelope with the in-toto candidate provenance statement |
| `GET /api/sessions/:id/candidate/download?format=trace` | DSSE envelope with the Agent Trace 0.1.0 record |
| `GET /api/attestations/public-key` | PEM public key of the workbench's Ed25519 attestation key; `X-Key-Id` carries its identifier |

`candidate.attestation` records the key identifier and predicate types when signing succeeded; a `candidate.attestation_failed` event marks a captured but unsigned candidate.

## Agent host

| Method and path | Behavior |
| --- | --- |
| `GET /api/agent-host` | Protocol version, WebSocket address, connected client count and the shape of the VS Code setting |
| `POST /api/agent-host/tokens` | `{label?}` → `{token, address, vscodeSetting}`; the token is shown once and bound to the caller |

The WebSocket endpoint is the workbench address with `?tkn=<token>`; it speaks Agent Host Protocol 0.9.0 ([ADR 0012](../adrs/0012-agent-host-protocol-host.md)).

## Workspace relay

Routes under `/api/relay/` are for sandbox workers, authenticated by per-workspace or pool bearer tokens rather than login cookies, and are not part of the operator contract.

Candidate access uses the same owner/administrator checks as the session. A successful export preserves a reviewable change; it does not certify independent verification, authorize publication or merge anything. Availability and limitations are explicit in the metadata. Native harness history and credentials are not portable candidate contents.
