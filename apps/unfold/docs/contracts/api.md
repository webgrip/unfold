# HTTP contract

This guide describes routes implemented by [HTTP handlers](../../src/http.ts) and lifecycle rules in [the session engine](../../src/engine.ts). Executable tests and source resolve implementation drift. Routes return JSON objects or arrays directly. Errors have the form `{"error":{"code":"...","message":"..."}}`.

## Identity and mutation requests

Live API access requires a login cookie, or an editor credential as a bearer token (see [Single sign-on](#single-sign-on)). Every `POST`, `PUT`, `PATCH` or `DELETE`, including login, requires `X-Unfold-Request: 1` and passes same-origin checks: a present `Origin` must match the configured base URL, and `Sec-Fetch-Site: cross-site` is refused with 403 `csrf` or `origin`. The one exception is the editor sign-in under `/api/auth/editor`, which an editor extension calls without a browser; it is exempt from the header and origin checks and is protected by its one-time code and secret instead (see [Single sign-on](#single-sign-on)). JSON request bodies require `Content-Type: application/json`, so an action that takes no input still sends `{}`. Cross-origin access is not enabled. Login cookies are HttpOnly and SameSite Strict; an HTTPS base URL enables secure cookies. Configure the public base URL accurately behind a reverse proxy.

Operators can read and change sessions they own. Administrators can access all sessions and authorize budget additions. Viewers cannot mutate work. Inaccessible session IDs return 404. The current API does not expose shared team membership or invitation management.

| Method and path | Request or response |
| --- | --- |
| `POST /api/login` | `{name,password}` → `{user}` and login cookie |
| `POST /api/logout` | `{}` → `{ok:true}` and expired cookie |
| `GET /api/bootstrap` | Current user, mode, registered repositories/crews/models/runtimes, enabled workspace `placements` and limits, and `insight.events`, which tells the browser whether to post product events |
| `POST /api/insight/events` | `{events:[{name,at,screen,workItemId?,shiftId?,props?}]}` → `202 {accepted,dropped}`. At most 50 events and 32 KB per call; an unknown event name is dropped and counted in `dropped`, and any property its RFC-0001 catalogue entry does not list is removed. An `at` outside the hour before arrival is clamped into it, and a Work Item or Shift id may be an integer or a digit string. Administrators and operators may post; viewers get 403, and one person posting more than 600 events a minute gets 429. With `UNFOLD_INSIGHT_EVENTS=off` it stores nothing and answers `204` |
| `GET /api/health` | Authenticated configuration/readiness summary; does not prove upstream provider reachability |
| `GET /healthz`, `GET /readyz` | `{status, version}` for probes. `/healthz` answers from the process without touching storage; `/readyz` runs one trivial database query and reads no session. No provider credentials or endpoints returned |

### Single sign-on

When `auth.oidc` is configured, `GET /api/auth/methods` (public) reports the provider's display name and issuer, `GET /api/auth/oidc` redirects to the provider with an authorization-code request carrying PKCE, `state` and `nonce`, and `GET /api/auth/oidc/callback` completes it: the workbench exchanges the code server-side, fetches the provider's signing keys, verifies the identity token's signature, issuer, audience, expiry and nonce, and derives the role. The role is the `roleClaim` value when the provider sends one, otherwise the first of admin, operator and viewer whose configured groups intersect the `groupsClaim` list; a person in none of them is refused with `oidc_not_entitled` and no session. The user record is keyed by issuer and subject, named by email, and its role is refreshed on every sign-in. The local password login remains for the bootstrap administrator.

An editor signs in through the same browser flow, and its person approves it ([ADR-0037](../adrs/0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md)). `POST /api/auth/editor` (public, exempt from the mutation header and origin checks, and only routed when OIDC is configured) returns a one-time `code`, a `secret` only the editor holds, a short `userCode` such as `BCDF-GHJK` that the editor displays, the `url` to open (the sign-in with `?editor=<code>`), `expiresIn` (600) and the polling `interval` in seconds (2). It allows 20 starts per client address per ten minutes and 1000 waiting tickets, then answers 429 `rate_limited`. The workbench refuses an unknown, expired or already claimed code before redirecting. The callback records who signed in and sends the browser to `#editor-sign-in/<code>`; signing in does not complete the ticket.

| Method and path | Behavior |
| --- | --- |
| `GET /api/editor-requests/<code>` | For the person who signed in for the ticket: `{userCode, status: waiting\|approved\|denied, createdAt, expiresAt, workbench, user, role, credentialDays}`; 404 for anyone else or an expired ticket |
| `POST /api/editor-requests/<code>/approve`, `.../deny` | Same person, browser session and mutation checks; one decision per ticket, then 409 `editor_login_decided` |
| `POST /api/auth/editor/<code>` | `{secret}` from the editor: 202 `{status:"pending"}` until approval; 200 once `{status:"ready", token, expiresAt, user}` after approval; 403 `editor_login_denied` once after a denial; 404 for unknown, expired, consumed or wrong-secret polls (five wrong secrets end the ticket); 429 `slow_down` for a poll within one second of the last |
| `GET /api/editor-credentials` | The person's live editor credentials: `{editors:[{id,label,scope,createdAt,expiresAt,lastUsedAt?}]}` |
| `DELETE /api/editor-credentials/<id>` | Revokes one, with the Agent Host connection tokens it issued; returns the remaining list |

The `token` is an editor credential, `vle_` followed by 43 base64url characters, sent as `Authorization: Bearer <token>`. Unfold stores only its SHA-256 hash. It lasts thirty days from approval and is not renewed by use. It acts as its person with their current role, except that the `editor-requests` and `editor-credentials` routes answer 403 `browser_only` to it. `POST /api/logout` with the bearer token revokes that credential only. A request with a malformed or unknown bearer token is unauthenticated, whatever cookie it also carries.

## Status

Every signed-in person can read `GET /api/status`; only administrators post and resolve notes. Mutations follow the [identity rules](#identity-and-mutation-requests).

| Method and path | Request or response |
| --- | --- |
| `GET /api/status` | `{generatedAt, overall, checks, waiting, failures, notes}`. `overall` is `operational`, `degraded` or `down`: the worst check or open note. `checks` holds `workspaces`, `gateway` and `ploeg`, each `{id, title, state, summary, detail?}` with `state` one of `ok`, `degraded`, `down`, `idle` (no workspace started in 24 hours) or `not_used`; `detail` is for administrators only. `waiting` lists sessions preparing a workspace, `{sessionId?, title?, own, phase, since, reason?}`, where `phase` is `preparing`, `scheduling`, `capacity`, `creating` (placed; storage and image), `image_unavailable`, `container_error`, `cloning`, `starting` or `connecting`; another person's session carries no id or title unless the reader is an administrator, and only an administrator sees `reason`. `failures` is `{since, total, causes:[{category, message, count, lastAt, sessions:[{id,title}]}]}` for the last 24 hours without `cancelled` and `review_incomplete`. A workbench cause (`capacity`, `timeout`, `connectivity`, `missing_executable`, `gateway_rejected`, `workspace_setup`) counts every session; any other cause counts only the reader's own sessions, or every session for an administrator. `sessions` lists only sessions the reader may open. `notes` holds open notes and those resolved in the last seven days |
| `POST /api/status/notes` | Administrator: `{severity: info\|degraded\|outage, text}` with 1–500 characters → 201 note `{id, severity, text, author, createdAt}` |
| `POST /api/status/notes/:id/resolve` | Administrator: `{}` → the note with `resolvedAt` and `resolvedBy`; 404 for an unknown id |

The `workspaces` check reads the workspaces Unfold is preparing and the last `workspace.ready` event. While a workspace starts, the session records one `workspace.waiting` event `{phase, message}` each time the phase changes, starting with `preparing`; `message` never carries the scheduler or container reason. A Kubernetes workspace whose Pod the scheduler cannot place reports `capacity` while it waits; when its time limit runs out it fails as `capacity` (or `missing_executable` for an image that cannot be pulled, `workspace_setup` for a container that cannot be created) instead of `timeout`. A `capacity` failure keeps the check `degraded` for 30 minutes unless a workspace starts after it. The gateway check calls LiteLLM's unauthenticated `/health/liveliness` with a three-second limit and keeps the answer for 15 seconds.

## Sessions

| Method and path | Behavior |
| --- | --- |
| `GET /api/sessions` | Sessions visible to the current user |
| `POST /api/sessions` | `{title,objective,repositoryId,crewId,runtime,placement?,approval?,model?,budgetUsd,trackerUrl?}` → created session, status 201. `model` pins one configured model id for every role of the session, overriding the crew's role models, which is how the same objective is run pinned and auto-routed for comparison; `approval` is `manual` (default) or `auto`; `auto` needs a `docker` or `kubernetes` placement and answers every tool permission inside the sandbox itself, while questions still reach the operator |
| `GET /api/sessions/:id` | Public session view, runs, retained artifacts and accounting status |
| `POST /api/sessions/:id/retry` | Standalone only: after unresolved spend is reconciled, releases the workspace, resets crew roles and current artifacts, records `session.retried`, and launches. Durable history and spent budget remain. Returns 409 `spend_unresolved` for open accounting or `new_authorization_required` for shared Ploeg execution; shared work requires an explicit new session |
| `POST /api/sessions/:id/start` | `{}`; start queued work in the background |
| `POST /api/sessions/:id/pause` | `{}`; deliberately stop active execution while retaining the session |
| `POST /api/sessions/:id/resume` | `{}`; explicitly continue paused/interrupted work subject to spend reconciliation |
| `POST /api/sessions/:id/cancel` | `{}`; intentional cancellation, with no automatic replacement run |
| `POST /api/sessions/:id/messages` | `{text}`; persist an operator instruction for the next execution. A Ploeg-executed session that is stopped and cannot run again answers 409 `session_stranded`, whose message says why and names the way out (deliver, run again or cancel); nothing is recorded and no Ploeg command is sent |
| `GET /api/sessions/:id/recovery` | The next steps for a stopped session; see [Recovering a stopped session](#recovering-a-stopped-session). Reads Ploeg and sends it no command |
| `POST /api/sessions/:id/deliver` | `{}`; deliver a stopped Ploeg-executed session whose last reviewer approved. Returns the completed session |
| `POST /api/sessions/:id/run-again` | `{}`; create a new queued session with the same brief, repository, crew, placement, approval, model and budget, and `previousSessionId` set. Status 201; it never starts. A session imported from a tracker answers 409 `tracked_task` |
| `POST /api/sessions/:id/budget` | Standalone only: `{amountUsd}`; administrator authorizes an additional positive amount within the total limit. A gateway key keeps the budget it was minted with and is never extended in place, so the increase is refused with 409 `pause_required` while the session executes or holds unreconciled keys; it applies to the key minted on the next resume. A finished session answers 409 `invalid_state`, and an increase beyond `maxBudgetUsd` answers 400. Shared budget extension is not implemented: a Ploeg-authorized session answers 409 `authority_budget` |

Selection values must come from the registered profiles. `placement` is one of the workspace backends listed in `placements` (`docker`, `kubernetes` or `local`); omitted, it takes the deployment default, and a demonstration deployment lists none. The created session records `placement`, and the `workspace.ready` event reports the resulting `backend` and `isolation` (`container`, `pod` or `working-directory`). Budgets are positive amounts in USD; they are not token allocations. One optional writer may precede reviewers, and roles execute sequentially. Completion requires explicit approval from required reviewers. A review requesting changes is a human decision point rather than an automatic rewriting loop.

### Recovering a stopped session

`GET /api/sessions/:id/recovery` answers:

```json
{
  "sessionId": "…", "status": "interrupted", "stranded": true,
  "summary": "Reviewer approved the work before Ploeg stopped the session. It will not run again on its own: deliver the approved work, or run it again as a new session.",
  "review": { "runId": "…", "roleName": "Reviewer", "verdict": "approve", "source": "transcript" },
  "execution": { "state": "interrupted", "stopConfirmed": true, "leaseExpired": true, "canPayAgain": false },
  "actions": [
    { "id": "deliver", "label": "Deliver the approved work", "description": "…", "method": "POST", "path": "/api/sessions/…/deliver", "available": true },
    { "id": "resume", "label": "Resume", "description": "…", "method": "POST", "path": "/api/sessions/…/resume", "available": false, "unavailableReason": "Ploeg blocked this execution's inference key when it stopped, so it cannot pay for another generation." },
    { "id": "run_again", "label": "Run again", "description": "…", "method": "POST", "path": "/api/sessions/…/run-again", "available": true },
    { "id": "cancel", "label": "Cancel", "description": "…", "method": "POST", "path": "/api/sessions/…/cancel", "available": true }
  ]
}
```

`stranded` is true for a paused or interrupted session that Ploeg executes and that cannot run again: Ploeg no longer holds it stopped, or its inference capability can no longer pay because Ploeg blocked the key when it stopped. `review` is the last role's verdict, `null` without one; `source` is `result` when the Run finished and `transcript` when the Run stopped after its stored answer already ended in a complete verdict block. `execution` is `null` for a standalone session; `canPayAgain` is `null` when it was not read. `actions` lists every step that applies to the session's state, in this order: `deliver` and `resume` for a stopped session, `run_again` for a stopped, failed or cancelled one, `cancel` for one that has not ended, and `close_work_item` for a failed or cancelled Ploeg session whose Work Item is still open. Each action names its call; a step that applies but cannot be taken now has `available: false` and an `unavailableReason`. Viewers get 403.

`POST /api/sessions/:id/deliver` requires a Ploeg-executed session that is paused or interrupted, not starting or stopping, with Ploeg's confirmed stop, a writing crew, every earlier Run completed, a last reviewer verdict of `approve`, a retained workspace and no captured candidate; otherwise 409 `not_deliverable` with the reason. It first confirms the remote turn stopped (409 `interrupt_unconfirmed`), then captures the candidate from the workspace; if that fails it answers 409 `candidate_unavailable` and has changed nothing in Ploeg. With a candidate it sends Ploeg `resume`, which starts a new generation, marks the reviewer Run completed, signs and keeps the candidate, completes the session and reports it `completed` to Ploeg, which closes the Shift. It makes no model call and mints no key. Ploeg refusals answer as on resume. The completed session then follows the normal path: review, independent checks and approval.

A message does not promise immediate insertion into an executing model request. Pause, record the changed instruction and resume when the current run must restart with it. Resume preserves the existing authorization and settled spend. Unresolved prior spend remains reserved and can block resume. A process restart marks active work interrupted and does not silently repeat paid execution.

`POST /api/sessions/:id/approval` with `{approval}` switches a live session between `manual` and `auto`, records `approval.changed`, and when switching to `auto` answers the permissions already waiting with `always`. Later roles are created with allow rules; a read role keeps its edit, bash and task denials.

In standalone mode, while a session runs, the workbench reads each held gateway key every fifteen seconds and records `budget.observed` with the spend the gateway has already attributed; the session carries it as `observedUsd`. The same tick reads the gateway's request ledger for the key and records per-model usage on the session as `usage`: the model that actually answered, the routed group when an auto-router chose it, requests, refusals, cost and tokens. The session also carries `requests`, one row per gateway request with the provider and endpoint host that served it, the inference region, the routed group with the router's tier and cause, the router's savings, retries, fallbacks, guardrails, cache hits and cached tokens, tokens, cost, duration and time to first token, the calling harness, the gateway call id for trace lookup, the error class on refusal, and the role it is attributed to by time. Settlement refreshes both once more. The Gateway tab shows the rows; the signed provenance records the usage and the set of providers. It is a live reading, not the settled figure `spentUsd`, which still arrives after reconciliation. A turn refused by the gateway because the key's ceiling is reached fails with category `budget_exhausted`, which requires mode-specific recovery; failed shared execution needs new explicit authorization.

A crew's read roles are not all reviewers. Only the final role of a crew carries the review verdict and is prompted for it; an earlier read role is an analysis role that answers the objective with evidence and returns no verdict, so an investigation crew of analyst then challenger completes on the challenger's approval alone. Run cards label the two as analysis and independent review.

### Gateway policy

`gatewayPolicy` in the configuration lists the providers and inference regions a workbench allows, as the gateway names them, for example `{"providers": ["anthropic"], "regions": ["eu"]}`. Before a session starts, the workbench resolves every model its crew will use through the gateway's catalogue, following an auto-router into its tiers, and refuses the start with 409 `policy_provider` when any tier is served by a provider outside the list. While the session runs, every ledger row is checked; the first row attributed to a provider or region outside the list stops the session with failure category `policy_violation`, revokes its gateway credential, records `policy.violated` with the offending request, and marks the row in `requests` with `violation`. Regions are only known after the fact, so the region rule is enforced within the fifteen-second ledger read, never before the first token.

### The brief a role received

`run.started` carries the composed prompt as `prompt`, split into objective, role instruction, operator notes, prior work, supplied evidence and the closing guidance, plus the model chosen for the role and `promptSha`, the SHA-256 of the exact text sent. The run keeps `promptSha` and the signed provenance records it per run, so a reviewer can match a transcript to the brief that produced it.

### Before the crew spends

`POST /api/sessions` refuses a manually written objective under twenty characters or four words with 400 `objective_too_thin`; an imported task is exempt. The optional brief check uses the session's credential and prefers a model whose identifier matches the small/fast heuristic, falling back to the first configured model. It does not compare prices. Imported tasks, already-checked briefs and `runtime.briefCheck: false` skip the check. An unavailable or malformed result is recorded as skipped; the check is not an authorization gate. An unclear result records `brief.unclear` and asks up to three questions. Answering through the permissions route appends the answers, records `brief.clarified`, and continues the crew.

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
| `GET /api/sessions/:id/events?after=N` | Server-sent events; numeric `id`, JSON Event in `data`. Catch-up from an old cursor is read from storage in batches of 200 events until the client is current |
| `GET /api/sessions/:id/permissions` | Human permission/question requests without native credential state |
| `POST /api/sessions/:id/permissions/:requestId` | Permission `{decision:"once"|"always"|"reject"}` or question `{answers:string[][]}` |
| `GET /api/sessions/:id/investigation` | Read-only first diagnosis of why the session stopped: `class` (`unfold_stall`, `ploeg_unreachable`, `ploeg_refused`, `unfold_restart`, `operator_stop`, `guard` or `unclear`), the `verdict` and the `rule` that matched, `facts`, a `timeline` of Unfold events and Ploeg revisions around the stop, `next` steps and whether the Ploeg side was `read`, `unavailable` or `not_bound`. It sends no Ploeg command and records nothing |

An event contains `id`, `sessionId`, `type`, `at`, `actor`, optional `runId` and structured `data`. Streamed agent text arrives as `message` events that each carry part of one `partId`; a client joins consecutive parts with the same run and `partId`. Unfold stores at most one such event per part every 500 ms. Reconnection can use `after` or the standard `Last-Event-ID` header. Treat events as replayable and deduplicate by ID. A terminal session remains inspectable through history.

Permission and question details depend on the adapter. Answer only the actual unresolved request; a generic message is not a permission grant. A successful HTTP action reflects the stored lifecycle transition, not completion of all subsequent background work.

## Ploeg

The scoped read surface and shared-session mutations are described under [Ploeg workbench](#ploeg-workbench). Reads use Ploeg's operator API through [the connector](../../src/ploeg.ts); worker queue authentication is a different interface.

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

Connections are administrator-registered `taskSources`. Forgejo, GitHub, GitLab, ClickUp and Vikunja share the same read API. Only hand-off to Ploeg writes to a tracker, and only to Vikunja. A source maps one tracker project or list to a configured repository. Task content cannot supply a repository URL, model credential, runtime command or execution owner. All authenticated users of this pilot deployment can browse its registered sources; source-level team authorization is a later feature.

| Method and path | Behavior |
| --- | --- |
| `GET /api/task-sources` | Public connection records with `handoff`; never connector credentials |
| `GET /api/task-sources/:sourceId/tasks?page=1` | `{tasks,nextPage?}` with bounded pagination |
| `GET /api/task-sources/:sourceId/tasks/:taskId` | Current task snapshot for explicit preview, plus `descriptionMarkdown` for display (see below) |
| `POST /api/task-imports` | `{sourceId,taskId,revision,crewId,runtime,placement?,budgetUsd}` → queued session, 201 new or 200 existing |
| `GET /api/task-sources/:sourceId/tasks/:taskId/ploeg` | `TaskPloegStatus`: Ploeg's teams, the task's hand-off and its Work Items; `refresh=1` bypasses the short cache |
| `POST /api/task-sources/:sourceId/tasks/:taskId/handoff` | `{team,revision}` → `TaskPloegStatus` with optional `warnings` |
| `DELETE /api/task-sources/:sourceId/tasks/:taskId/handoff?team=` | Takes the task back from that team → `TaskPloegStatus` with optional `warnings` |
| `GET /api/tasks/lookup?provider=vikunja&id=` | `{sourceId}` of the configured source whose project holds the task, or 404 `task_source_unknown` |

A snapshot includes `key`, `sourceId`, `provider`, `id`, `revision`, `title`, `description`, `url`, `status`, `repositoryId` and optional `updatedAt`. It may also carry `labels` (`{name,color?}`, at most 50), `assignees` (`{username,name?}`, at most 50), the provider's own `priority` (omitted when unset), `dueAt` and the tracker's display `identifier` such as `UNFOLD-12`. None of these change the revision. A list page cuts a description over 16,000 characters and sets `descriptionTruncated: true`; its revision still covers the whole description. A preview with `truncate=1` shortens it the same way, while a plain preview or an import of that task still refuses it. The preview alone adds `descriptionMarkdown`, the description to display. A Vikunja description that looks like HTML is first converted to the Markdown subset the browser renders, with relative links resolved against the tracker's web address; any other description is taken as it is. In every case the source's token is then replaced by `[redacted]` ([`presentTask`](../../src/tasks.ts)). The list, the snapshot's `revision`, the stored `sourceTask` and the import never carry it. Status is normalized to `open`, `closed` or `unknown`; only open tasks can be imported. The revision hashes the material snapshot. Import refetches the configured source and returns 409 `task_changed` if the preview is stale. The server retains the accepted snapshot in `session.sourceTask`, redacting any known server credentials from its title and description before persistence and prompting and frames its body as untrusted reference material in the objective.

Import requires an operator or administrator and passes the same mutation guard as other actions. It does not call a model, assign a tracker task or start execution. Calling import twice for the same canonical task and revision returns the existing session across reconnects and process restarts. Another operator receives a generic conflict, without private session details. A changed revision cannot create competing work while an earlier session is active, stopping or has unresolved reservations. Finished revisions remain inspectable; importing is not a retry command.

### Hand a task to Ploeg

A source has `handoff: true` when it is a Vikunja source with a token, `executionOwner: "ploeg"` and a live Ploeg operator connection. Hand-off assigns the tracker user that routes work to a team, which Ploeg's `task.assignee.created` webhook turns into a queued Work Item ([ADR 0025](../adrs/0025-hand-tracker-tasks-to-ploeg-by-assignment.md)).

```ts
type TaskPloegStatus = {
  available: boolean; message?: string; demo: boolean;
  handoff: { allowed: boolean; reason?: string };
  teams: { id: string; assignee: string; queueDepth: number; paused: boolean | null; roles: string[] }[];
  assignedTeams: string[];
  workItems: { id: string; team: string; state: string; attempts: number; updatedAt: string; prUrl?: string; branch?: string; spentUsd?: number; budgetUsd?: number }[];
  fetchedAt: string;
  warnings?: string[];
};
```

`teams` are the caller's Ploeg teams that report at least one tracker assignee; `assignee` is the first. `assignedTeams` are those whose assignee is on the task, compared without case because Ploeg lowercases routing names. `workItems` come from Ploeg's `work-items?provider&externalId` filter, limited to the caller's teams, with the latest Shift's branch and spend and, for the three most recent, a pull request link from checkpoints. An unreachable Ploeg gives `available: false`. A Ploeg too old to report assignees or the filter gives empty `teams` or `workItems` with a reason; neither is an error. The demo fixture source answers `available: false` with `Demo fixture tasks are not linked to Ploeg.`

Hand-off and take-back pass the mutation guard and require an operator or administrator.

| Refusal | Meaning |
| --- | --- |
| 403 `forbidden` | A viewer |
| 422 `handoff_unsupported` | The source cannot hand off |
| 404 `handoff_team` | The team is outside the caller's Ploeg scope, has no tracker user, or Ploeg does not report assignees |
| 409 `task_closed`, 409 `task_changed` | The re-read task is done, or its revision differs from `revision`; reload it |
| 502 `task_write_forbidden` | The workbench's Vikunja token cannot add or remove assignees or add comments |
| 502 `handoff_assignee_unknown` | Vikunja has no user with the team's tracker username that the token can see |
| 409 `handoff_active` | Hand-off while another team's tracker user is on the task, or while any Work Item for it is in a state other than withdrawn, done or stale; a team outside the caller's scope is not named; nothing is written |
| 409 `handoff_started` | Take-back while any Work Item for the task, in any team, is in a state other than queued, withdrawn, done or stale |

These safety checks read Ploeg's Work Items for the task across every team the workbench's Ploeg consumer can see, not only the caller's teams, because Ploeg files one Work Item per tracker task and a board pin can place it in another team. A board that Ploeg pins to a team (`pinnedScopes` on that team) offers only that team; if it has no tracker user or is outside the caller's access, the status explains why hand-off is unavailable.
| 503 `handoff_unverified` | Hand-off or take-back while Ploeg cannot list Work Items by tracker task; nothing is written |

Hand-off resolves the user through `GET /projects/:project/projectusers?s=`, then `GET /users?s=`, and sends `PUT /tasks/:id/assignees` and `PUT /tasks/:id/comments` with `<p>Handed to Ploeg team <code>TEAM</code> by NAME from Unfold.</p>`, NAME HTML-escaped. Take-back sends `DELETE /tasks/:id/assignees/:userId` and a `Taken back from Ploeg team` comment. Both are idempotent: when there is nothing to change, nothing is written. A failed comment leaves the assignment in place and adds a warning. Each action writes a `task.handoff` or `task.take_back` log line with the actor, source, task, team and outcome.

Set `executionOwner: "ploeg"` on repositories assigned to Ploeg execution. Standalone Unfold refuses to execute those repositories. With shared authority configured, supported tracker imports instead require the current registered Ploeg binding and canonical admission checks at Start. See [tracker binding](ploeg-tracker-binding.md) and [connection setup](../operations/task-connections.md).

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

## Candidate delivery

Delivery applies only to a shared Ploeg execution on a repository with a configured delivery policy; [governed candidate delivery](candidate-delivery.md) owns the full contract. Each route uses the session's owner or administrator check, and the two `POST` routes also require an operator or administrator, the mutation header and a JSON body. Refusals are 409 with a delivery code, for example `shared_execution_required` for a standalone session or `completed_candidate_required` before the execution has completed and confirmed its stop.

| Method and path | Behavior |
| --- | --- |
| `GET /api/sessions/:id/delivery` | `{configured, policySha256?, localPhase?, checks?, candidate, receipt, approval, operation, publicationEnabled:false}`: Ploeg's delivery record for the execution, validated against the session, plus the local verification phase and check results |
| `GET /api/sessions/:id/delivery/download` | The canonical Git bundle `canonical-candidate.git.bundle`; 409 `canonical_candidate_unavailable` before verification has canonicalized it |
| `POST /api/sessions/:id/delivery/verify` | `{}`; canonicalizes the captured candidate on the approved base, registers it with Ploeg, runs the pinned policy checks and records the receipt. A retry replays the retained result instead of running checks again |
| `POST /api/sessions/:id/delivery/approve` | `{candidateId, receiptId, policySha256}` exactly; records the candidate-bound approval in Ploeg. Publication stays disabled |

## Agent host

| Method and path | Behavior |
| --- | --- |
| `GET /api/agent-host` | Protocol version (`protocolVersion`, the newest baseline, and `protocolVersions`, both baselines), WebSocket address, the shape of the VS Code setting, and the caller's own initialized connections: `clients` counts them and `attached` lists each as `{name?, version?, protocolVersion, connectedAt, tokenId}`, oldest first. `name` and `version` are the `clientInfo` the client sent in `initialize`, `protocolVersion` the version the connection negotiated, and `tokenId` is the `id` of the token it connected with. Another person's connections never appear |
| `POST /api/agent-host/tokens` | `{label?}` → `{token, id, address, vscodeSetting}`, status 201; viewers are refused. The token is shown once and bound to the caller and the sign-in that issued it. `id` is the token's SHA-256 digest in lowercase hex |
| `DELETE /api/agent-host/tokens/:id` | `{revoked: true}`; revokes one of the caller's tokens and closes its open connections with WebSocket code 1008. It needs the mutation header, as `POST` does. A token that is unknown, already revoked or another person's answers 404 `not_found` |

A connection token lives as long as a login. It expires after `auth.sessionHours` (twelve by default) without use, and every connection or message renews that window. The workbench stores only its SHA-256 digest. Signing out through `POST /api/logout` revokes every token the sign-in issued and closes their connections with WebSocket code 1008; a sign-in that expires has the same effect at the token's next use. An editor that holds a token derives its `id` by hashing it, so it can revoke the token without keeping anything else.

The WebSocket endpoint is the workbench address, on path `/` or `/ahp`, with `?tkn=<token>`; it speaks both released Agent Host Protocol baselines, 1.0.0 and 0.9.0 ([ADR 0012](../adrs/0012-agent-host-protocol-host.md)). Without an agent host, both routes answer 404 `agent_host_disabled`.

The host answers `initialize` with the highest version the client offered in `>=1.0.0 <2.0.0` or `>=0.9.0 <0.10.0`, as the exact string offered: VS Code main, which offers `1.0.0, 0.10.0, 0.9.0`, gets `1.0.0`, and VS Code 1.141, which offers `0.10.0, 0.9.0, …`, gets `0.9.0`. An offer with neither gets `-32005` with `supportedVersions: ['^1.0.0', '^0.9.0']` and the connection closes; a malformed version gets `-32602`, even when another entry would match. The negotiated version holds for the connection and for a later `reconnect` of the same client. A 0.9 client never receives an action that AHP 1.0.0's registry introduces after 0.9 (`chat/canvasesChanged`, `canvas/stateChanged`), nor `SessionSummary.chats` or `defaultChat`. A 1.x client receives both in `listSessions`, `root/sessionAdded` and `root/sessionSummaryChanged`: `chats` holds the session's one chat with its `status` bits, read (32) and archived (64) included, its `origin`, `interactivity` and, once a candidate is ready, `changes`. A chat's read or archive mark republishes that catalog to the person's 1.x clients. A VS Code client whose `clientInfo.name` is `vscode-agents-window` or `vscode-editor-window` and that does not send `_meta["vscode.ahpSessionUris"]` sees sessions as `unfold:/<id>`. Every other client sees `ahp-session:/<id>`, and both spellings are accepted on input. `initialize` answers with `defaultDirectory: file:///unfold-repositories`, a virtual folder: `resourceList` on it lists one directory per configured repository, named `Unfold · <repository>` after the last segment of the repository's forge path, with ` (<id>)` added when two repositories share that name. `resourceList` on `file:///` lists only that folder, and any other path answers `-32008`; the host's own filesystem is never listed. A working directory in that folder, in `resolveSessionConfig` or as the first of `createSession`'s `workingDirectories`, sets the session's repository and overrides `config.repository`. A session's `project` is `{uri: <repository url>, displayName: Unfold · <repository>}`. A failed session's `activity`, in its summary and its chat's, is `Failed: <reason>`, from the classified failure or the session's blocker. VS Code 1.141 shows a chat's activity whatever its state, but shows a session's activity only while it runs or needs input. The `unfold` agent in the root state declares `protectedResources: []`: the connection token already identifies the person, and VS Code 1.141 treats an agent without that field as gated behind GitHub Copilot sign-in ([sign-in spike](../research/2026-10-10-ahp-sign-in-spike.md)). Read and archive marks are kept per person; they never pause, cancel or change a session. Accepting, rejecting or requesting changes on a candidate from a client's Changes view uses the same review path and owner check as the browser ([below](#reviewing-a-candidate-from-vs-code)). A client that this host initialized can resume with `reconnect` on a new connection, also after a restart, and always receives snapshots, never a replay; any other client must initialize again (`-32008`). The host remembers the last 1,000 clients. `serverSeq` never moves backwards: the host reserves sequence numbers in blocks of 1,000 in its store and resumes after the last reservation, so numbers may skip but a pre-restart `lastSeenServerSeq` is always behind the next action. A session's `activeClients` survive a restart; each restored client gets the usual 30-second grace period to come back. Disposing a session drops its active clients. The host keeps a session's chat projection in memory while it is subscribed, and drops it on `disposeSession` or ten minutes after the last client unsubscribed from an ended session; the next subscribe rebuilds the same snapshot from the durable events.

A session's configuration schema, from `resolveSessionConfig` and in every session state, has `repository` (read-only, an enum of repository ids with their names as `enumLabels`; the picked working directory decides it), `crew` (crew ids, names as labels, and per crew a description naming each role's configured model, or none in the demo), `budgetUsd` (a string enum of presets from 1 to 1000 up to `maxBudgetUsd`, plus the default, the limit and the current value, labelled in the shared money format; a number is still accepted), `placement` when more than one backend is enabled, `approvalMode` (`manual`, plus `allow-all` only when the effective placement is `docker` or `kubernetes`; the engine's `auto`) and `title`. Unknown keys a client sends are dropped. Defaults are the picked or first repository, the first crew, 5 within the limit, the runtime's default placement and `manual`. `createSession` refuses a configuration this workbench does not offer with `-32602`. Before the first message, `session/configChanged` on the session channel changes the draft's configuration and is echoed with the full result and `replace: true`; a different `repository` is refused. After it, only `approvalMode` may change, through the same route as `POST /api/sessions/:id/approval`, and only while the session runs in a container or pod, which its schema marks `sessionMutable`; any other changed value is refused. The root state's `unfold` agent advertises one model, `unfold-crew`, named `Ploeg crew · <execution.team>`, `Unfold crew` without managed execution, or `Demo crew · no model calls`. A user turn carries no `message.model`, so VS Code labels a response with no model the host did not observe.

On a workbench with a live Ploeg connection and at least one Vikunja task source whose `executionOwner` is `ploeg`, `initialize` also answers `automations: {}` and `_meta["vscode.autonomousAutomations"]: true`. `ahp-automations://` is then a read-only catalogue of tracker routes ([ADR 0012](../adrs/0012-agent-host-protocol-host.md#update-2026-10-10-automations)). Each entry, `ahp-automation:/tracker.<source>.<team>`, is one such board and one Ploeg team the person may route its tasks to: the board's pinned team, or else each of their teams with a tracker user. Its `definition` has `title` `<board> → <team>`, an `automation`-origin message that explains the route, `session: {provider: "unfold", workingDirectories: [<the repository's folder>]}`, `enabled` false while the team is paused, and one event trigger of type `unfold.tracker-assignment` whose `config` is `{source, team, assignee}`. `operations` and `runs` are always empty. `listAutomationTriggerDefinitions` returns that trigger type, `fetchAutomationRuns` answers `{}`, and `runAutomation` answers `-32009`; a resource that is not one of the person's routes answers `-32008`. `automation/createRequested`, `automation/updateRequested` and `automation/removed` are rejected with a `rejectionReason`. While someone watches the catalogue the host reads Ploeg's teams again each minute and sends that person's clients `automation/set` and `automation/removed` for what changed. A person without Ploeg team access gets an empty catalogue whose `_meta["dev.webgrip.unfold"].reason` says why. Without that Ploeg connection or board, `initialize` carries no `automations`, the channel answers `-32008` and the three commands `-32601`.

Each command a crew runs is a read-only terminal, `ahp-terminal:/<session id>/<event id>`, named after the `tool` event that first carried the command line ([ADR 0012](../adrs/0012-agent-host-protocol-host.md#update-2026-10-10-read-only-terminals)). A `tool` event names a command with a `command` field, as the demo runtime and command bridges may set it. A shell tool such as OpenCode's `bash` names it with the `command` in its input. The command's tool call gets `toolInput` with the command line, and `chat/toolCallContentChanged` adds `{type: "terminal", resource, title, isPty: false}`. Its completed result repeats that block with `result: {exitCode?, preview, truncated}`. `exitCode` is present only when the runtime reported one, and `preview` is the recorded output. Subscribing to the terminal returns a `TerminalState` with one `command` part, a `session` claim in the client's own spelling, `supportsCommandDetection: true` and `isPty: false`. When the command finishes, subscribers receive `terminal/data`, `terminal/commandFinished` and `terminal/exited`. A command whose Run or session stopped before it reported exits without an exit code. Command lines, titles and output are served with the event store's redaction, the API's known-secret redaction and the credential patterns applied, and with control characters other than newline and tab removed. Only the session's owner and administrators can subscribe; anyone else gets `-32008` `Terminal not found`. Every client action on a terminal is rejected with a `rejectionReason`, and `createTerminal` and `disposeTerminal` answer `-32009`. A tool call opened by a `pending` tool event stays streaming until the next event, so its command line arrives with `chat/toolCallReady`. A `failed` tool event completes the tool call as unsuccessful, as `error` does.

A session's `customizations` list the MCP servers its agent is configured with, read-only, and nothing else the host loads. A repository with `mcp` (the gateway's team and access groups) gives an OpenCode session one top-level server: `{type: 'mcpServer', id, uri, name: 'litellm', state, _meta}`, whose `id` and `uri` are both `mcp-top-level:unfold:<id>:litellm`, with `_meta['agentHost.mcpServerSource']: 'managed'`, `_meta['vscode.mcpServerDisplayName']: 'Gateway tools (<access groups>)'` and `_meta['dev.webgrip.unfold']: {source, repository, team, accessGroups, keyScope, clientControl: false}`. Its state is `starting` before the session runs, `ready` while it runs and `stopped` after it. A session Ploeg executes gets `error` with `errorType: 'gateway_key_unscoped'` until it ends. The entry never carries the gateway address, a header, a key or an `mcp://` channel. A tool call whose name starts with `litellm_` names the server as its `contributor`. `session/customizationToggled` and `session/mcpServer{Start,Stop,Background}Requested` are rejected. A plugin an active client publishes in `activeClient.customizations` is listed as `{type: 'plugin', …, clientId, load: {kind: 'error', message}, children: []}` and is never read. `session/customizationsChanged` announces each change. A `root/configChanged` whose `config.customizations` is not empty is rejected, which is what VS Code's **Add Remote Plugin** sends ([ADR 0012](../adrs/0012-agent-host-protocol-host.md#update-2026-10-10-mcp-servers-and-plugins)).

A message is never a dead end in the Agents window. Only a completed session's chat whose candidate no longer waits for review is `read-only`; every other chat takes a message, and the host sets no `vscode.chatInputState` block.

- **Running, queued or paused.** The message is an instruction for the next execution, as `POST /api/sessions/:id/messages` records it. Its turn keeps the client's turn id and is echoed with the client's origin, then a `systemNotification` says who reads it: "Queued for the <Role>'s next step", with what to do when that Role is not the one working now. When the next Run starts, a second `systemNotification` reads "Picked up by <Role> at HH:MM UTC".
- **Stranded, failed or cancelled.** A message no crew will read becomes a choice. The turn is accepted, a Markdown part says why no crew reads it, and an input request asks one single-select question: **Run again and start**, **Run again with this message**, **Deliver the approved work first** (only when the recovery answer lists delivery as available) and **Cancel**. The options come from `GET /api/sessions/:id/recovery` under the same owner check. Running again calls the run-again path, which keeps the brief, crew, repository, placement and budget, and records the message on the new session as its instruction; the new session is announced with `root/sessionAdded` and starts only on **Run again and start**. Delivering calls the deliver path and the turn ends with the outcome. **Cancel**, skipping the question or stopping the turn changes nothing. A newer message replaces a choice still open.
- **Failed, with Try Again.** A failed session's turn ends with an `error` part as its last part, with `resumable: true` when the run-again path accepts the session (it failed and was not imported from a tracker). VS Code shows **Try Again** under it. Pressing it dispatches `chat/turnResume` for that turn; the host echoes it with the client's origin, calls the run-again path under the same owner check (viewers are refused), announces the new session with `root/sessionAdded`, records `chat.turn_resumed` with the new session's id, adds a Markdown part saying what it created and that nothing runs until it is started, and completes the turn. The new session is `queued`; a message into it or **Start** on its session page starts it. A `chat/turnResume` for any turn but the last failed one is refused with a reason. Nothing is tried again unless a person presses it, and such a session gets no "What next?" turn, which would hide the button.
- **After it stops by itself.** An interrupted session's chat, or a failed one without Try Again, gets one host turn, "What next?", with the next steps the recovery answer lists as available (**Deliver the approved work**, **Resume**, **Run again and start**, **Run again, start later**, **Leave it for now**) and links to the pull request and the session page. It is offered once per stop and does nothing until answered.

A crew's question with exactly the options yes and no (in any case, without descriptions, one answer) is a `boolean` question; VS Code shows Yes and No, and the answer reaches the crew as the option's own label. Every other question is `single-select`, `multi-select` or `text`. Declining a question, with `response: "decline"` or with VS Code's `cancel` from skipping or closing the questions, records `question.declined` and answers each question with "Declined by <name>: no answer will be given. Continue with your best judgement and say what you assumed."; the chat completes the request with `response: "decline"` and each answer `skipped` with that text. While the person is stopping the turn a `cancel` is refused instead, and the question stays open ([ADR 0012](../adrs/0012-agent-host-protocol-host.md)).

Spend appears as a `systemNotification` in the active turn: at the end of each Run, "Spent US$ 1,20 of US$ 8,00", and once each time the spend crosses 50, 80 or 100 % of the budget, with that share added. The figure is the settled spend, or the gateway's observed spend marked "observed, not settled"; before any is reported it reads "Spend not reported yet", and a demo reads "Demo · no model calls or spend" and never crosses a threshold. A raised budget starts the thresholds again. `chat/usage` carries tokens and their source only, no cost.

The host records a choice as session events: `choice.offered` with the options, `choice.answered` with the option and the reply, and `choice.reported` when carrying out an answer failed. They survive a restart, and an answered choice cannot be answered again. An option the host did not offer is refused.

### Reviewing a candidate from VS Code

A completed session whose candidate waits for review (no review recorded, and no delivery policy that hands the review to the forge) offers three `changeset` operations: **Accept**, **Request changes…** and **Reject…**. A session imported from a tracker offers no Request changes, because running it again means importing the task again. Accept records `accepted` at once. Reject and Request changes take a message, which a changeset operation cannot carry, so invoking one opens a host choice in the session's chat with one `text` question and answers with where to find it; nothing is recorded until the question is answered. A second invocation while the question is open points at it. Skipping the question or stopping the turn records nothing.

- **Reject** requires the reason and records `rejected` with it as the note, through the engine's review path and owner check, as `POST /api/sessions/:id/review` does.
- **Request changes** records `rejected` with the person's message as the note, then creates the next session with the same brief, repository, crew, placement, approval, model and budget and `previousSessionId` set, as run again does, and records one operator instruction on it: the message and every open comment on the candidate, each with its file and one-based lines. The new session is announced with `root/sessionAdded` and waits for an explicit start. With comments, the message is optional and the note says how many comments there were.

Comments are AHP annotations. The host serves each session's annotations channel, `<session URI>/annotations` in either spelling, to the people who may see the session; it accepts the five `annotations/*` actions under AHP's reducer, with at most 500 annotations of at most 50 entries of 8,000 characters, keeps them with the session and echoes them to that person's other clients. The session state carries an `annotations` summary once there is one. VS Code 1.141 sends a person's submitted feedback as a `chat/turnStarted` whose text is `/act-on-feedback` and whose attachments carry the comments (`type: "annotations"`, or `simple` with `_meta.agentFeedback.feedbackItems`). On a candidate waiting for review, that turn is accepted and opens Request changes with those comments. While a crew can still read it, the turn becomes an instruction listing each comment with its file and lines. A typed message on a candidate waiting for review is refused with a pointer to the review operations.

VS Code's Agent Merge (`session/configChanged` with only `config.agentMerge`) maps onto the review: enabling it accepts a candidate waiting for review through the same path as Accept, and the session's configuration then reads `agentMerge: {enabled: true}`. Disabling it after acceptance is refused, because a review is recorded once. A session under a delivery policy refuses it with a pointer to the pull request on the forge. Nothing is merged or pushed from the editor. VS Code 1.141 hides Agent Merge unless `chat.agentMerge.enabled` is set, which defaults to off on Stable. A session's `_meta.git` names the candidate's `branchName` and the repository's `baseBranchName`; VS Code 1.141's `sessions.agentHost.showBranchChanges` is a button on the new-session branch picker for a local checkout, so it has no Unfold session to act on.

## Workspace relay

Routes under `/api/relay/` are for sandbox workers, authenticated by per-workspace or pool bearer tokens rather than login cookies, and are not part of the operator contract.

Candidate access uses the same owner/administrator checks as the session. A successful export preserves a reviewable change; it does not certify independent verification, authorize publication or merge anything. Availability and limitations are explicit in the metadata. Native harness history and credentials are not portable candidate contents.

## Ploeg workbench

These routes are Unfold's scoped proxy for Ploeg's operator API ([`ploeg.ts`](../../src/ploeg.ts)). Each needs a login cookie and reads only the Teams the signed-in person may see. `refresh=1` bypasses the short cache. Reads are `GET`; the only writes are the three Work Item decisions and the five crack attribution steps, and any other method under `/api/ploeg` answers 405. Responses are snapshots with explicit bounds and uncertainty, and demo responses carry `demo: true`.

| Method and path | Response |
| --- | --- |
| `GET /api/ploeg?team=` | Overview: `{configured, available, demo, teams, selectedTeam?, lanes?, fetchedAt?, trackerUrl?, message}`. Each lane (`awaiting_review`, `needs_human`, `leased`, `queued`, `all`) is `{items, nextCursor}` |
| `GET /api/ploeg/teams` | `{teams}`, the Team ids |
| `GET /api/ploeg/work-items?team=&state=&after=` | One page of a Team's Work Items, `{items, nextCursor}`; `state` defaults to `all` |
| `GET /api/ploeg/work-items/:id` | `{item, shifts, runs, checkpoints, events, truncated, demo, fetchedAt}` |
| `GET /api/ploeg/work-items/:id/card` | The proposed Run Card: `{card, demo, fetchedAt}`. `card` is the card v1 that Unfold assembles from Ploeg's delivery facts, validated. Unknown values stay absent, `finish` is always `matte` (the browser derives the finish from `release`), `rarity` (Ploeg PR #121, ADR-0056, proposed and not merged: tier, prediction, reveal, score, percentile, cohort, inputs and reveal time; fields Unfold does not know are dropped, an older Ploeg's null stays null, [ADR 0034](../adrs/0034-run-cards-show-rarity-as-frame-metal-and-a-set-symbol-and-reveal-it-once-at-release.md)), `grade` (with its `inputs` under formula 2026.1, 2026.2 or 2026.3; 2026.3's `review.reworkRounds` is null and its `missing` list absent when an older Ploeg did not send them, so Unfold claims complete evidence only from a `missing` list Ploeg sent, Ploeg ADR-0061), `condition` (with each crack's `weight`, `warranty` and mend `confirmedAt`), `gates` and `set` pass through in the card contract's shapes and any other shape becomes null ([ADR 0028](../adrs/0028-the-forge-skin-renders-run-cards-in-3d-with-vendored-three-js.md), [ADR 0030](../adrs/0030-unfold-traces-bugs-under-an-administrator-mapped-forge-login.md)), `evolved` passes only as `true`, `deployments`, `release`, `gates`, `evolved` and `set` stay absent for an older Ploeg, `flow`, `pipeline` and `shape`, and each play's `timeline`, `ciTiming` and `shape` (Ploeg PR #130 and #133, ADR-0057 and ADR-0058, proposed and not merged) pass through figure by figure: a known figure is checked, an unreadable figure or sub-object becomes null, an unreadable list entry is left out, fields Unfold does not know are dropped, and a field Ploeg did not send stays absent ([ADR 0035](../adrs/0035-run-cards-lead-with-three-or-four-kpis-for-their-state-and-keep-the-rest-on-the-back.md)), and a skin that is not a plain name becomes `unfold-native`. A card outside the caller's Teams and a Work Item Ploeg has no facts for answer 404, and a Ploeg that supplies no delivery facts answers 503 `cards_facts_unavailable`. The demo derives a card from each demo Work Item with `demo: true`, cost status `not_reported` and no cost or usage figures; its merged cards carry illustrative deployments and releases, nineteen cards an illustrative rarity computed from made-up inputs with formula 2026.1, eleven of them illustrative grades, seven illustrative cracks and illustrative gates, and four illustrative epics hold sets: DEMO-25, and one each drawn by the holo, arcade and patch skin packs. Twenty-three demo cards carry illustrative flow, pull request, CI and change-shape figures derived from their own illustrative times, with working time in Monday to Friday, 09:00 to 17:00 Europe/Amsterdam; only the demo's own Runs count as agent time. Every demo card of the five DOM skin packs (three per pack) labels its gates, set membership, grade and cracks as sample data. See [ADR 0026](../adrs/0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md) |
| `GET /api/ploeg/now` | What waits on the person, what runs and what finished recently, across their Teams; see [Now](#now) |
| `GET /api/ploeg/proposed` | `{demo, items, truncated, fetchedAt}` across Teams; each item adds `sourceTitle` |
| `GET /api/ploeg/runs?team=&state=&outcome=&before=` | `{demo, runs, nextBefore, fetchedAt}` |
| `GET /api/ploeg/events?team=&before=` | `{demo, events, nextCursor, fetchedAt}`; each event adds `workItemTitle` |
| `GET /api/ploeg/summary?window=` | Per-Team and total counts and spend for `24h`, `7d` or `30d`: `{demo, window, generatedAt, teams, totals, fetchedAt}` |
| `POST /api/ploeg/work-items/:id/approve` | `{}` → `{workItemId, team, state, demo}`; only a `proposed` Work Item |
| `POST /api/ploeg/work-items/:id/reject` | `{reason}`, required, at most 4096 characters → `{workItemId, team, state, demo}`; only a `proposed` Work Item |
| `POST /api/ploeg/work-items/:id/cancel` | `{}` → the cancellation result; see [Cancel](#cancel) |
| `GET /api/ploeg/work-items/:id/crack-candidates` | `{workItemId, crackCandidates, demo, fetchedAt}`: the candidate causes of a bug Work Item that Unfold finds in the changes it indexed, `{bug, fixFiles, fixFilesTruncated, since, until, candidates}`, each candidate `{card, play, repo, mergedAt, mergedBy, sharedFiles, share, files, reverted, attribution}`. Unfold only proposes them |
| `GET /api/ploeg/work-items/:id/cracks` | `{workItemId, cracks, viewer, demo, fetchedAt}`: every attribution where the Work Item is the bug or the card, in the caller's Teams, and `viewer` `{login, canAct, reason}`, the caller's mapped forge login and whether they may take a step |
| `POST /api/ploeg/work-items/:bug/cracks` | `{card, play?, severity, share, discovery?, note?}` → 201 `{crack, demo, message}`; the bug and the card in the caller's Teams and the same Team |
| `POST /api/ploeg/work-items/:bug/evolved` | `{card, note?}` → `{crack, demo, message}`: the bug is a changed requirement, so the card evolves and gets no crack |
| `POST /api/ploeg/work-items/:id/cracks/:crack/confirm` | `{severity?, share?, note?}` → `{crack, demo, message}`; the attribution must be one of the Work Item's in the caller's Teams |
| `POST /api/ploeg/work-items/:id/cracks/:crack/dispute` | `{reason}`, required, at most 2000 characters → `{crack, demo, message}` |
| `POST /api/ploeg/work-items/:id/cracks/:crack/resolve` | `{resolution: upheld or unlinked, note?}` → `{crack, demo, message}` |

The attribution steps act under the caller's forge login from `ploeg.forgeLogins`, never a login the caller sets ([ADR 0030](../adrs/0030-unfold-traces-bugs-under-an-administrator-mapped-forge-login.md)). Viewers get 403 `forbidden`, an account without a mapped login 403 `ploeg_forge_login`, and invalid input 400 `crack_invalid_request` before any step is taken. Refusals by the crack rules come back as `crack_<code>` (`crack_forbidden_actor` 403; `crack_invalid_state`, `crack_crack_limit`, `crack_already_attributed`, `crack_not_merged`, `crack_merged_after_bug`, `crack_dispute_closed` and `crack_concealment_unproven` 409). The demo applies the same rules to its sample attributions, keeps nothing and answers `demo: true` with a message that Ploeg recorded nothing.

Unfold serves the card, card list and crack routes itself from Ploeg's delivery facts (Ploeg ADR-0079, probed with `GET facts?limit=1` at most once a minute, and again on `refresh=1`; [root ADR-0030](../../../../docs/adr/adr-0030-run-cards-are-an-unfold-domain-on-top-of-ploegs-delivery-facts.md)).

* **Cards.** It assembles them from `GET work-items/:id/facts` and the facts list, and passes them through the same validator, so every card route answers the same shape.
* **Cracks.** It checks the crack steps' rules in its own store, under the forge login, and writes nothing to Ploeg. Cracks Ploeg recorded before were imported once, keep Ploeg's ids, and take every step like Unfold's own.
* **Without facts.** A Ploeg that is down or older than v0.2.0-rc.10 supplies no facts. The card, card list and crack routes then answer 503 `cards_facts_unavailable` with a sentence that says why, and the Work Item page shows no card. Unfold never reads Ploeg's removed card routes in their place.

A Ploeg that lacks the activity routes answers 501 `ploeg_unsupported` for runs, events and summary. A Team outside the person's scope is 404 `ploeg_not_found`, and a non-administrator with no Ploeg Team is 403 `ploeg_scope`.

A workbench without a `ploeg` block, outside the demo, answers by route. Some routes check the connection first ([`PloegOperator`](../../src/ploeg.ts) `connected`), the others only the person's scope (`authorize`):

| Routes | Non-administrator | Administrator |
| --- | --- | --- |
| `GET /api/ploeg` | 403 `ploeg_scope` | 200 with `configured: false` and a message |
| `GET /api/ploeg/teams`, `/work-items`, `/work-items/:id` | 403 `ploeg_scope` | 503 `ploeg_credential`, because the operator credential is missing |
| `GET /api/ploeg/now`, `/proposed`, `/runs`, `/events`, `/summary` and the three decisions | 503 `ploeg_unconfigured` | 503 `ploeg_unconfigured` |

A viewer's decision is refused with 403 `forbidden` before any of these checks.

A shared session exposes a credential-free `execution` binding. `POST /api/sessions/:id/supervision` accepts `{"supervision":"human"}` or `{"supervision":"background"}` for an active owned session. Existing start, pause, resume, cancel, message and permission routes delegate through Ploeg when configured. See [the shared execution contract](ploeg-execution.md).

### Descriptions

Every Work Item in the overview lanes, the work-item pages, the detail and the proposed list carries `descriptionMarkdown` beside the untouched `description`. For a Vikunja item whose description looks like HTML it is that HTML converted to the Markdown subset the browser's renderer reads, with relative links resolved against the item's `url`. For every other item it equals `description`. Render it with the escape-first renderer; never insert `description` as HTML. [`rich-text.ts`](../../src/rich-text.ts) and [`markdown.ts`](../../src/markdown.ts) implement it.

### Now

`GET /api/ploeg/now` answers `{demo, teams, waiting, active, running, recent, runningTruncated, recentTruncated, truncatedStates, errors, fetchedAt}`. `running` and `recent` are Run rows, the same shape as `/api/ploeg/runs`: the first page of each. `runningTruncated` and `recentTruncated` are true when Ploeg holds more Runs than that page. Unfold reads every page of each team's `awaiting_review`, `needs_human`, `leased` and `queued` Work Items up to 200 per team and state, and `proposed` through the proposed list (its first page per team, at most 50). `truncatedStates` names each of those states for which Ploeg holds more than the response lists; it is empty when every list is complete. A group that fails is empty and names its failure in `errors.waiting`, `errors.active`, `errors.running` or `errors.recent`; the other groups still answer.

`waiting` lists `awaiting_review`, then `needs_human`, then `proposed` Work Items, oldest first within each. `active` lists `leased`, then `queued` Work Items the same way, so a client can show that Ploeg holds a task it handed over before that task waits on anyone. Rows in both lists carry no description. Their fields:

| Field | Meaning |
| --- | --- |
| `id`, `team`, `state`, `title`, `url`, `createdAt`, `updatedAt` | As on the Work Item |
| `provider`, `externalId`, `priority` | The tracker, the tracker's id, and the tracker's priority. Unfold never re-ranks |
| `attempts` | Run claims so far, reader and writer alike. It is not "N of 3" |
| `infraFailures` | Infrastructure failures counted on the legacy lease path |
| `target` | `{forge, owner, repo, baseBranch}`, or `null` when no repository was resolved ("not routed") |
| `closeReason` | The latest Shift's close reason, or `null` while the Shift is open or when there is none |
| `latestShift` | `{round, closeReason, budgetUsd, spentUsd, reservedUsd, closedAt}`, or `null` |
| `spentUsd` | The latest Shift's spend, or `null` when unknown |
| `pullRequestUrl` | For up to ten review rows, the pull request link Ploeg's list reports, else the one from the newest checkpoint or Run; otherwise `""` |
| `pullRequest` | Passed through from Ploeg's Work Item list: `{url, number, mergeState, baseBranch, headSha, checkedAt}`, or `null` when the Work Item has no pull request. Absent when Ploeg sends no field. `mergeState` is `clean`, `conflicted`, `unknown`, or `null` when Ploeg reported none ([Ploeg ADR-0040](../../../ploeg/docs/adrs/0040-a-conflicted-pull-request-becomes-a-priority-ticket-ploeg-resolves.md)) |
| `sourceWorkItemId`, `sourceTitle`, `createdKind`, `ready` | Proposed rows only, when Ploeg reports them |

### Cancel

Cancel is for operators and administrators; viewers get 403. Live, Unfold asks Ploeg to cancel the Work Item as the signed-in person and answers `{workItemId, team, state, demo: false, withdrawn, shiftId, cancelledRuns, stoppedRuns, keysBlocked, message}` with Ploeg's own figures:

* `withdrawn: false` means nothing was live, and `state` keeps the Work Item's state.
* `keysBlocked: false` means Ploeg could not yet confirm that the stopped Runs' model keys are blocked; its sweep retries.
* A field that Ploeg leaves out or sends malformed is `null`, meaning unknown, never `0` or `false`. `message` is `""` unless Ploeg sends one.
* A Work Item that a workbench session drives answers 409 `ploeg_decision_conflict`: cancel that session instead.

In the demo, cancel answers 200 and changes nothing: `withdrawn: false`, `cancelledRuns: 0`, `stoppedRuns: 0`, `keysBlocked: null` and a `message` that says no Run was stopped, no model key or push token was blocked and the tracker was not told.

What Ploeg does on cancel is [journey D](../../../../docs/concepts/journeys.md#d-stopping-work).

## Card collection

The binder, packs and season pages ([ADR 0029](../adrs/0029-binders-packs-and-pulls-collect-run-cards-privately-and-fairly.md), proposed; [`collection.ts`](../../src/collection.ts)). Each route needs a login cookie, and writes pass the request-header and origin checks above. Every route reads and writes the signed-in person's own records only; none takes another person's id, so an administrator reads only their own binder and packs. Cards are assembled from Ploeg's facts list (`GET /api/v1/operator/facts?member=`, paged by `nextBefore`, up to six pages), and only cards in the caller's Teams pass. Without Ploeg's delivery facts these routes answer 503 `cards_facts_unavailable`. Errors use the codes below, or Ploeg's (`ploeg_scope` 403 for a person with no Team).

| Method and path | Request and response |
| --- | --- |
| `GET /api/me/card-identity` | `{logins, mapped, declared, verified, source, updatedAt}`. `mapped` is the forge login an administrator mapped to the person in `ploeg.forgeLogins` (the demo login `demo-operator` in the demo), and the only `verified` one: only it can make the person a card's steward. `declared` are the person's own logins, which only find cards to collect and never attribute anything. `logins` is both, mapped first. `source` is `mapped`, `setting`, `demo` or `none` |
| `PUT /api/me/card-identity` | `{logins}`, the declared logins, at most 10, each one word of letters, digits and `. _ @ + : -`; folded to lower case and deduplicated → the same shape. Anything else is 400 `card_logins` |
| `GET /api/binder` | `{demo, identity, source, now, startedAt, seenAt, copies, readouts, away, awayTotal, seenUntil, filters}`. `copies` is newest moment first, each `{card, copy: {role, roles, steward, pull, waitingIn}, lastActivityAt}`; `steward` is true only through the mapped login; `pull` is the stored first pull without its HMAC input, and `waitingIn` the unopened pack it waits in. `readouts` are personal: `cards`, `released`, `daysLive`, `daysLiveThisQuarter`, `quarter`, `mends`, `pulled`. `away` lists the moments since `seenAt`, oldest first, at most 12. `source` is `{kind: list | scan | demo, scanned, truncated}`; a live workbench answers `list` and no longer produces `scan` |
| `POST /api/binder/seen` | `{until, cards?}` → `{startedAt, seenAt}`. Creates the binder mark on the first visit and moves `seenAt` forward to `until`, never back and never past now. `cards` names up to 12 Work Items whose news the binder showed; each one's card seen mark (below), when it has one, moves forward to `until` too |
| `GET /api/cards/:id/seen` | `{workItemId, seenAt, snapshot, now}`: the person's seen mark on one card, for the effects director ([ADR 0032](../adrs/0032-an-effects-director-plays-run-card-moments-once-by-tier-within-accessibility-rules.md), proposed). `seenAt` and `snapshot` are null before their first look. The card must be in the caller's Teams (Ploeg's 404 `ploeg_not_found` otherwise); an id that is not a Work Item id is 400 `card_id` |
| `POST /api/cards/:id/seen` | `{until?, snapshot}` → the same shape. Moves `seenAt` forward to `until` (now when absent), never back and never past now, and stores `snapshot`, kept to `{grade: half-step 0–10 or null, setComplete: boolean}`. A person keeps marks for at most 2000 cards, dropping the least recently seen |
| `GET /api/cards/:id/world` | `{workItemId, demo, holds, role, world, updatedAt, facts, now, reason?}`: the person's decoration of one card's inner world ([ADR 0033](../adrs/0033-a-forge-card-s-art-window-is-an-inner-world-its-holder-may-decorate-privately.md), proposed). `holds` says whether they hold a copy and so may decorate it; `world` is their saved decoration as the card can show it now (`{v: 1, kind, tod, weather, objects: [{t, x, z, s}]}`), or null when they saved none or hold no copy, with `reason` saying why. `facts` is `{days, merged, condition}`, what unlocks the time of day and the things. The card must be in the caller's Teams (404 otherwise); an id that is not a Work Item id is 400 `card_id` |
| `PUT /api/cards/:id/world` | `{world}` → the same shape. Only a holder of a copy (403 `card_copy` for anyone else, administrators included). `world` must have only `v`, `kind` (`islands`, `deepsea`, `city`, `off`), `tod` (`auto` or a time of day the card has reached), `weather` (`clear`, `rain`, `snow`, `fireflies`) and `objects`: at most 24 `{t, x, z, s}` with `t` one of `crystal`, `lantern`, `tree`, `windmill` (card merged), `lighthouse` (180 days live), `koi` (crack mended), `x` from −4 to 4, `z` from −3 to 3 and `s` from 0 to 1. Anything else is 400 `card_world` with the reason. A person keeps at most 2000 decorations, dropping the least recently changed |
| `DELETE /api/cards/:id/world` | Forgets the person's decoration → the same shape with `world: null`. Only a holder of a copy |
| `GET /api/packs` | `{demo, identity, source, now, odds: {version}, packs}`, oldest first. Each pack is `{id, period, state: opened | sealed | filling, count, firsts, upgrades, openedAt, next, demo}`; only the one with `next: true` can be opened. Ids are `2026-W40` (ISO week, UTC) or `<team>~<sprint start>` |
| `POST /api/packs/:id/open` | `{}` → `{demo, odds, pack: {id, period, openedAt, demo, entries}}`; each entry is `{workItemId, kind: new | upgrade, moments, card, copy, pull}`. Draws and stores the first pull of every new card. 409 `pack_opened`, `pack_filling` or `pack_order` (open the older pack first); 404 `pack_not_found` |
| `GET /api/packs/:id` | An opened pack, the same shape; 404 for a pack this person has not opened |
| `GET /api/packs/odds` | `{version, scale: 10000, patterns, extras, altArtChoices}`: every probability in basis points |
| `GET /api/season?team=&quarter=` | `{demo, team, teams, quarters, quarter, justStarted, aggregates, source}` for a Team in the caller's scope (404 `team_not_found` otherwise). `aggregates` holds Team totals only: `cards`, `shipped`, `daysLiveAdded`, `finishes`, `cracks`, `mends`, `rightFirstTime` (`{share, cards}` or null), `bounceReasons` (or null), `sets` (or null) and `medians`: `leadTimeSeconds`, `firstFeedbackSeconds`, `ciMinutes` and `flowEfficiency`, each `{value, cards}` over the quarter's shipped cards that know the figure, or null. No person is named. A quarter that has not started is 400 `quarter`; without `quarter`, the first week of a quarter shows the one before and names it in `justStarted` |

Pack settings live in the configuration file under `cards`: `backfillPeriods` (0 to 12; 1, or 4 in the demo) and `teams`, a sprint per Team as `{lengthDays: 7–42, anchor: "YYYY-MM-DD"}` in place of the ISO week. The Run card rules Unfold applies live beside them:

* `cards.rules`: repositories, boards, Teams, bots, and whether to compute flow figures and rarity.
* `cards.publishPullRequestComment`: whether Unfold publishes the card comment; off by default.

[Move Run cards from Ploeg to Unfold](../operations/run-cards-upgrade.md) lists every key and the Ploeg setting it replaces.

## Card themes

Proposed ([ADR 0031](../adrs/0031-card-themes-a-card-designer-and-generated-art.md)). Every route needs a login cookie. Reads are open to every role; writes are for administrators and need the request marker header.

| Method and path | Response |
| --- | --- |
| `GET /api/card-themes` | The themes, whether you may edit them, each skin's theme rules, the asset limits and whether art generation is configured |
| `GET /api/card-themes/:id`, `/versions`, `/versions/:n` | A theme with the metadata of its assets; its saved versions; one version |
| `PUT /api/card-themes/:id` | `{theme, baseVersion}` → the saved theme. 409 `theme_changed` on a stale `baseVersion`, 409 `theme_managed` for a theme from the mounted folder |
| `DELETE /api/card-themes/:id` | Deletes a stored theme and its versions |
| `POST /api/card-assets?purpose=` | A raw `application/octet-stream` upload for `art`, `back`, `symbol` or `shader` → `{id, purpose, mediaType, bytes}` |
| `GET /api/card-assets/:id` | The asset, with its stored type, `nosniff` and a sandboxing CSP |
| `POST /api/card-art/generate` | `{prompt, attempt?, compilerLog?}` → `{code, problems, attempt, model}`; live mode with `cardThemes.ai` only |

[Card themes](card-themes.md) holds the format, the validation rules, the asset limits, resolution and generated art.

## Static files

The server answers `GET` for the browser workbench from its public directory ([`static.ts`](../../src/static.ts)): the page, the named top-level assets in `src/http.ts`, and any `/core/`, `/views/` or `/styles/` file whose name matches `[a-z0-9][a-z0-9-]*\.(js|css)`. Anything else is 404.

* Every response carries `Cache-Control: no-cache` and a strong `ETag`: 32 base64url characters of the file's SHA-256.
* `If-None-Match` with that tag, weakly compared, or `*`, answers 304 with no body. The 304 keeps the `ETag`, `Cache-Control`, `Vary` and every security header, the Content Security Policy included.
* HTML, CSS, JavaScript, SVG and the web manifest are gzipped when `Accept-Encoding` accepts `gzip` or `x-gzip` with a non-zero quality, and only when that is smaller. The gzipped variant's tag ends in `-gzip`. These types carry `Vary: Accept-Encoding`; fonts, images and plain text are never compressed.
* File bodies and their gzip are cached in memory by path, modification time and size, up to 512 files.
