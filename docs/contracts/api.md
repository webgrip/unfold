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

### Single sign-on

When `auth.oidc` is configured, `GET /api/auth/methods` (public) reports the provider's display name and issuer, `GET /api/auth/oidc` redirects to the provider with an authorization-code request carrying PKCE, `state` and `nonce`, and `GET /api/auth/oidc/callback` completes it: the workbench exchanges the code server-side, fetches the provider's signing keys, verifies the identity token's signature, issuer, audience, expiry and nonce, and derives the role. The role is the `roleClaim` value when the provider sends one, otherwise the first of admin, operator and viewer whose configured groups intersect the `groupsClaim` list; a person in none of them is refused with `oidc_not_entitled` and no session. The user record is keyed by issuer and subject, named by email, and its role is refreshed on every sign-in. The local password login remains for the bootstrap administrator.

An editor signs in through the same browser flow. `POST /api/auth/editor` (public) returns a one-time `code`, a `secret` only the editor holds, and the `url` to open, which is the sign-in with `?editor=<code>`; the workbench refuses an unknown or expired code before redirecting. When the person completes the sign-in, the callback binds a fresh session to the code and sends the browser to `/?editor=done`. The editor polls `POST /api/auth/editor/<code>` with `{secret}`: 202 while pending, 200 once with `{cookie, user}`, then 404. Codes and their sessions expire after ten minutes.

## Sessions

| Method and path | Behavior |
| --- | --- |
| `GET /api/sessions` | Sessions visible to the current user |
| `POST /api/sessions` | `{title,objective,repositoryId,crewId,runtime,placement?,approval?,budgetUsd,trackerUrl?}` → created session, status 201. `model` pins one configured model id for every role of the session, overriding the crew's role models, which is how the same objective is run pinned and auto-routed for comparison; `approval` is `manual` (default) or `auto`; `auto` needs a `docker` or `kubernetes` placement and answers every tool permission inside the sandbox itself, while questions still reach the operator |
| `GET /api/sessions/:id` | Public session view, runs, retained artifacts and accounting status |
| `POST /api/sessions/:id/retry` | Tries a failed session again from the beginning: after spend has settled, the workspace is released, every run returns to queued, artifacts and ledger rows are cleared, `session.retried` is recorded with the attempt number, and the crew launches. 409 `spend_unresolved` while accounting is still open |
| `POST /api/sessions/:id/start` | `{}`; start queued work in the background |
| `POST /api/sessions/:id/pause` | `{}`; deliberately stop active execution while retaining the session |
| `POST /api/sessions/:id/resume` | `{}`; explicitly continue paused/interrupted work subject to spend reconciliation |
| `POST /api/sessions/:id/cancel` | `{}`; intentional cancellation, with no automatic replacement run |
| `POST /api/sessions/:id/messages` | `{text}`; persist an operator instruction |
| `POST /api/sessions/:id/budget` | `{amountUsd}`; administrator authorizes an additional positive amount within the total limit |

Selection values must come from the registered profiles. `placement` is one of the workspace backends listed in `placements` (`docker`, `kubernetes` or `local`); omitted, it takes the deployment default, and a demonstration deployment lists none. The created session records `placement`, and the `workspace.ready` event reports the resulting `backend` and `isolation` (`container`, `pod` or `working-directory`). Budgets are positive amounts in USD; they are not token allocations. One optional writer may precede reviewers, and roles execute sequentially. Completion requires explicit approval from required reviewers. A review requesting changes is a human decision point rather than an automatic rewriting loop.

A message does not promise immediate insertion into an executing model request. Pause, record the changed instruction and resume when the current run must restart with it. Resume preserves the existing authorization and settled spend. Unresolved prior spend remains reserved and can block resume. A process restart marks active work interrupted and does not silently repeat paid execution.

`POST /api/sessions/:id/approval` with `{approval}` switches a live session between `manual` and `auto`, records `approval.changed`, and when switching to `auto` answers the permissions already waiting with `always`. Later roles are created with allow rules; a read role keeps its edit, bash and task denials.

While a session runs, the workbench reads each held gateway key every fifteen seconds and records `budget.observed` with the spend the gateway has already attributed; the session carries it as `observedUsd`. The same tick reads the gateway's request ledger for the key and records per-model usage on the session as `usage`: the model that actually answered, the routed group when an auto-router chose it, requests, refusals, cost and tokens. The session also carries `requests`, one row per gateway request with the provider and endpoint host that served it, the inference region, the routed group with the router's tier and cause, the router's savings, retries, fallbacks, guardrails, cache hits and cached tokens, tokens, cost, duration and time to first token, the calling harness, the gateway call id for trace lookup, the error class on refusal, and the role it is attributed to by time. Settlement refreshes both once more. The Gateway tab shows the rows; the signed provenance records the usage and the set of providers. It is a live reading, not the settled figure `spentUsd`, which still arrives after reconciliation. A turn refused by the gateway because the key's ceiling is reached fails with category `budget_exhausted`, whose remediation is to authorize more budget and resume.

A crew's read roles are not all reviewers. Only the final role of a crew carries the review verdict and is prompted for it; an earlier read role is an analysis role that answers the objective with evidence and returns no verdict, so an investigation crew of analyst then challenger completes on the challenger's approval alone. Run cards label the two as analysis and independent review.

### Gateway policy

`gatewayPolicy` in the configuration lists the providers and inference regions a workbench allows, as the gateway names them, for example `{"providers": ["anthropic"], "regions": ["eu"]}`. Before a session starts, the workbench resolves every model its crew will use through the gateway's catalogue, following an auto-router into its tiers, and refuses the start with 409 `policy_provider` when any tier is served by a provider outside the list. While the session runs, every ledger row is checked; the first row attributed to a provider or region outside the list stops the session with failure category `policy_violation`, revokes its gateway credential, records `policy.violated` with the offending request, and marks the row in `requests` with `violation`. Regions are only known after the fact, so the region rule is enforced within the fifteen-second ledger read, never before the first token.

### The brief a role received

`run.started` carries the composed prompt as `prompt`, split into objective, role instruction, operator notes, prior work, supplied evidence and the closing guidance, plus the model chosen for the role and `promptSha`, the SHA-256 of the exact text sent. The run keeps `promptSha` and the signed provenance records it per run, so a reviewer can match a transcript to the brief that produced it.

### Before the crew spends

`POST /api/sessions` refuses an objective under twenty characters or four words with 400 `objective_too_thin`; an imported task is exempt because its brief is generated from the ticket. When a session starts and the gateway is configured, the workbench first asks the cheapest listed model, with the session's own credential, whether the brief is actionable, and records `brief.checked`. If it is not, the session waits with a question titled "The brief needs more before the crew starts", carrying the model's reason and up to three questions, and `brief.unclear` is recorded; nothing else is spent. Answering the question through the permissions route appends the answers to the objective as an operator clarification, records `brief.clarified`, and starts the crew. `runtime.briefCheck: false` disables the check.

Each role may make at most `runtime.maxToolCalls` tool calls, eighty by default, or the role's own `maxToolCalls`; beyond that the session fails with category `runaway` and `run.runaway` is recorded. A crew without a write role, an investigation, completes with its final reader's verdict on the run instead of failing when that verdict is not approve; only a crew with a writer treats a missing approval as `review_incomplete`.

`GET /api/models` describes the configured models through the gateway's catalogue: the provider that serves each, and for an auto-router its tiers and the provider set behind them.

### The human review

`completed` means the crew finished, the candidate was captured and signed, the workspace was released, and nothing was published; the label reads "Awaiting your review". `POST /api/sessions/:id/review` with `{decision, note?}` records that review once: `accepted`, with an optional note, or `rejected`, which requires a note so the next attempt can use it. The session carries `review` with the decision, who made it, when and the note, and `review.recorded` is appended to the history. A reviewed session cannot be reviewed again; 409 `already_reviewed` names the earlier decision. Publication, when it arrives, will require an accepted review.

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
| `PUT /api/links/gitlab` or `PUT /api/links/clickup` with `{token}` | Links by a pasted personal token: the workbench verifies it against the provider's account endpoint and stores it encrypted for the person; needs no application. A link made this way carries `method: "token"` |
| `DELETE /api/links/gitlab` | Forgets the tokens and asks GitLab to revoke them |
| `POST /api/links/clickup`, `GET /api/links/clickup/callback`, `DELETE /api/links/clickup` | The same flow for ClickUp, whose OAuth has no PKCE and needs the application's client secret on the workbench; the token does not expire and there is no revocation endpoint, so unlinking forgets it |

`GET /api/bootstrap` also carries `gateway`, the gateway host, `gatewayPolicy`, and `observability`, the estate's Grafana URL, dashboard uids and datasource uids the browser uses to build outbound links.

A task connection whose configuration names no `tokenEnv` reads tasks with the signed-in person's link for its provider; `GET /api/task-sources` marks such a connection with `needsLink`, and listing, previewing or importing from it without a link answers 409 `source_unlinked`. A GitLab link's token is sent as a bearer token to the GitLab API.

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
