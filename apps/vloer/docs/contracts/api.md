# HTTP contract

This guide describes routes implemented by [HTTP handlers](../../src/http.ts) and lifecycle rules in [the session engine](../../src/engine.ts). Executable tests and source resolve implementation drift. Routes return JSON objects or arrays directly. Errors have the form `{"error":{"code":"...","message":"..."}}`.

## Identity and mutation requests

Live API access requires a login cookie. Every `POST`, `PUT`, `PATCH` or `DELETE`, including login, requires `X-Vloer-Request: 1` and passes same-origin checks: a present `Origin` must match the configured base URL, and `Sec-Fetch-Site: cross-site` is refused with 403 `csrf` or `origin`. The one exception is the editor sign-in under `/api/auth/editor`, which an editor extension calls without a browser; it is exempt from the header and origin checks and is protected by its one-time code and secret instead (see [Single sign-on](#single-sign-on)). JSON request bodies require `Content-Type: application/json`, so an action that takes no input still sends `{}`. Cross-origin access is not enabled. Login cookies are HttpOnly and SameSite Strict; an HTTPS base URL enables secure cookies. Configure the public base URL accurately behind a reverse proxy.

Operators can read and change sessions they own. Administrators can access all sessions and authorize budget additions. Viewers cannot mutate work. Inaccessible session IDs return 404. The current API does not expose shared team membership or invitation management.

| Method and path | Request or response |
| --- | --- |
| `POST /api/login` | `{name,password}` → `{user}` and login cookie |
| `POST /api/logout` | `{}` → `{ok:true}` and expired cookie |
| `GET /api/bootstrap` | Current user, mode, registered repositories/crews/models/runtimes, enabled workspace `placements` and limits |
| `GET /api/health` | Authenticated configuration/readiness summary; does not prove upstream provider reachability |
| `GET /healthz`, `GET /readyz` | Process/store health for probes; no provider credentials or endpoints returned |

### Single sign-on

When `auth.oidc` is configured, `GET /api/auth/methods` (public) reports the provider's display name and issuer, `GET /api/auth/oidc` redirects to the provider with an authorization-code request carrying PKCE, `state` and `nonce`, and `GET /api/auth/oidc/callback` completes it: the workbench exchanges the code server-side, fetches the provider's signing keys, verifies the identity token's signature, issuer, audience, expiry and nonce, and derives the role. The role is the `roleClaim` value when the provider sends one, otherwise the first of admin, operator and viewer whose configured groups intersect the `groupsClaim` list; a person in none of them is refused with `oidc_not_entitled` and no session. The user record is keyed by issuer and subject, named by email, and its role is refreshed on every sign-in. The local password login remains for the bootstrap administrator.

An editor signs in through the same browser flow. `POST /api/auth/editor` (public, exempt from the mutation header and origin checks, and only routed when OIDC is configured) returns a one-time `code`, a `secret` only the editor holds, and the `url` to open, which is the sign-in with `?editor=<code>`; the workbench refuses an unknown or expired code before redirecting. When the person completes the sign-in, the callback binds a fresh session to the code and sends the browser to `/?editor=done`. The editor polls `POST /api/auth/editor/<code>` with `{secret}`: 202 while pending, 200 once with `{cookie, user}`, then 404. Codes and their sessions expire after ten minutes.

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
| `POST /api/sessions/:id/messages` | `{text}`; persist an operator instruction |
| `POST /api/sessions/:id/budget` | Standalone only: `{amountUsd}`; administrator authorizes an additional positive amount within the total limit. A gateway key keeps the budget it was minted with and is never extended in place, so the increase is refused with 409 `pause_required` while the session executes or holds unreconciled keys; it applies to the key minted on the next resume. A finished session answers 409 `invalid_state`, and an increase beyond `maxBudgetUsd` answers 400. Shared budget extension is not implemented: a Ploeg-authorized session answers 409 `authority_budget` |

Selection values must come from the registered profiles. `placement` is one of the workspace backends listed in `placements` (`docker`, `kubernetes` or `local`); omitted, it takes the deployment default, and a demonstration deployment lists none. The created session records `placement`, and the `workspace.ready` event reports the resulting `backend` and `isolation` (`container`, `pod` or `working-directory`). Budgets are positive amounts in USD; they are not token allocations. One optional writer may precede reviewers, and roles execute sequentially. Completion requires explicit approval from required reviewers. A review requesting changes is a human decision point rather than an automatic rewriting loop.

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
| `GET /api/sessions/:id/events?after=N` | Server-sent events; numeric `id`, JSON Event in `data` |
| `GET /api/sessions/:id/permissions` | Human permission/question requests without native credential state |
| `POST /api/sessions/:id/permissions/:requestId` | Permission `{decision:"once"|"always"|"reject"}` or question `{answers:string[][]}` |

An event contains `id`, `sessionId`, `type`, `at`, `actor`, optional `runId` and structured `data`. Reconnection can use `after` or the standard `Last-Event-ID` header. Treat events as replayable and deduplicate by ID. A terminal session remains inspectable through history.

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

A snapshot includes `key`, `sourceId`, `provider`, `id`, `revision`, `title`, `description`, `url`, `status`, `repositoryId` and optional `updatedAt`. It may also carry `labels` (`{name,color?}`, at most 50), `assignees` (`{username,name?}`, at most 50), the provider's own `priority` (omitted when unset), `dueAt` and the tracker's display `identifier` such as `GLIDE-12`. None of these change the revision. A list page cuts a description over 16,000 characters and sets `descriptionTruncated: true`; its revision still covers the whole description. A preview with `truncate=1` shortens it the same way, while a plain preview or an import of that task still refuses it. The preview alone adds `descriptionMarkdown`, the description to display. A Vikunja description that looks like HTML is first converted to the Markdown subset the browser renders, with relative links resolved against the tracker's web address; any other description is taken as it is. In every case the source's token is then replaced by `[redacted]` ([`presentTask`](../../src/tasks.ts)). The list, the snapshot's `revision`, the stored `sourceTask` and the import never carry it. Status is normalized to `open`, `closed` or `unknown`; only open tasks can be imported. The revision hashes the material snapshot. Import refetches the configured source and returns 409 `task_changed` if the preview is stale. The server retains the accepted snapshot in `session.sourceTask`, redacting any known server credentials from its title and description before persistence and prompting and frames its body as untrusted reference material in the objective.

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

Hand-off resolves the user through `GET /projects/:project/projectusers?s=`, then `GET /users?s=`, and sends `PUT /tasks/:id/assignees` and `PUT /tasks/:id/comments` with `<p>Handed to Ploeg team <code>TEAM</code> by NAME from Vloer.</p>`, NAME HTML-escaped. Take-back sends `DELETE /tasks/:id/assignees/:userId` and a `Taken back from Ploeg team` comment. Both are idempotent: when there is nothing to change, nothing is written. A failed comment leaves the assignment in place and adds a warning. Each action writes a `task.handoff` or `task.take_back` log line with the actor, source, task, team and outcome.

Set `executionOwner: "ploeg"` on repositories assigned to Ploeg execution. Standalone Vloer refuses to execute those repositories. With shared authority configured, supported tracker imports instead require the current registered Ploeg binding and canonical admission checks at Start. See [tracker binding](ploeg-tracker-binding.md) and [connection setup](../operations/task-connections.md).

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
| `GET /api/agent-host` | Protocol version, WebSocket address, connected client count and the shape of the VS Code setting |
| `POST /api/agent-host/tokens` | `{label?}` → `{token, address, vscodeSetting}`, status 201; viewers are refused. The token is shown once and bound to the caller and the sign-in that issued it |

A connection token lives as long as a login. It expires after `auth.sessionHours` (twelve by default) without use, and every connection or message renews that window. The workbench stores only its SHA-256 digest. Signing out through `POST /api/logout` revokes every token the sign-in issued and closes their connections with WebSocket code 1008; a sign-in that expires has the same effect at the token's next use. There is no route that revokes one token on its own: sign out to revoke them.

The WebSocket endpoint is the workbench address, on path `/` or `/ahp`, with `?tkn=<token>`; it speaks Agent Host Protocol 0.9.0 ([ADR 0012](../adrs/0012-agent-host-protocol-host.md)). Without an agent host, both routes answer 404 `agent_host_disabled`.

## Workspace relay

Routes under `/api/relay/` are for sandbox workers, authenticated by per-workspace or pool bearer tokens rather than login cookies, and are not part of the operator contract.

Candidate access uses the same owner/administrator checks as the session. A successful export preserves a reviewable change; it does not certify independent verification, authorize publication or merge anything. Availability and limitations are explicit in the metadata. Native harness history and credentials are not portable candidate contents.

## Ploeg workbench

These routes are Vloer's scoped proxy for Ploeg's operator API ([`ploeg.ts`](../../src/ploeg.ts)). Each needs a login cookie and reads only the Teams the signed-in person may see. `refresh=1` bypasses the short cache. Reads are `GET`; the only writes are the three Work Item decisions, and any other method under `/api/ploeg` answers 405. Responses are snapshots with explicit bounds and uncertainty, and demo responses carry `demo: true`.

| Method and path | Response |
| --- | --- |
| `GET /api/ploeg?team=` | Overview: `{configured, available, demo, teams, selectedTeam?, lanes?, fetchedAt?, trackerUrl?, message}`. Each lane (`awaiting_review`, `needs_human`, `leased`, `queued`, `all`) is `{items, nextCursor}` |
| `GET /api/ploeg/teams` | `{teams}`, the Team ids |
| `GET /api/ploeg/work-items?team=&state=&after=` | One page of a Team's Work Items, `{items, nextCursor}`; `state` defaults to `all` |
| `GET /api/ploeg/work-items/:id` | `{item, shifts, runs, checkpoints, events, truncated, demo, fetchedAt}` |
| `GET /api/ploeg/work-items/:id/card` | The proposed Run card: `{card, demo, fetchedAt}`. `card` is Ploeg's card v1, validated. Unknown values stay absent, `rarity`, `grade` and `condition` are always null and `finish` is `matte` in P1, and a skin that is not a plain name becomes `vloer-native`. A card outside the caller's Teams, a missing Work Item and an older Ploeg without the route all answer 404. The demo derives a card from each demo Work Item with `demo: true`, cost status `not_reported` and no cost or usage figures. See [ADR 0026](../adrs/0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md) |
| `GET /api/ploeg/now` | What waits on the person, what runs and what finished recently, across their Teams; see [Now](#now) |
| `GET /api/ploeg/proposed` | `{demo, items, truncated, fetchedAt}` across Teams; each item adds `sourceTitle` |
| `GET /api/ploeg/runs?team=&state=&outcome=&before=` | `{demo, runs, nextBefore, fetchedAt}` |
| `GET /api/ploeg/events?team=&before=` | `{demo, events, nextCursor, fetchedAt}`; each event adds `workItemTitle` |
| `GET /api/ploeg/summary?window=` | Per-Team and total counts and spend for `24h`, `7d` or `30d`: `{demo, window, generatedAt, teams, totals, fetchedAt}` |
| `POST /api/ploeg/work-items/:id/approve` | `{}` → `{workItemId, team, state, demo}`; only a `proposed` Work Item |
| `POST /api/ploeg/work-items/:id/reject` | `{reason}`, required, at most 4096 characters → `{workItemId, team, state, demo}`; only a `proposed` Work Item |
| `POST /api/ploeg/work-items/:id/cancel` | `{}` → the cancellation result; see [Cancel](#cancel) |

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

`GET /api/ploeg/now` answers `{demo, teams, waiting, running, recent, runningTruncated, recentTruncated, errors, fetchedAt}`. `running` and `recent` are Run rows, the same shape as `/api/ploeg/runs`: the first page of each. `runningTruncated` and `recentTruncated` are true when Ploeg holds more Runs than that page. A group that fails is empty and names its failure in `errors.waiting`, `errors.running` or `errors.recent`; the other groups still answer.

`waiting` lists `awaiting_review`, then `needs_human`, then `proposed` Work Items, oldest first within each. A row carries no description. Its fields:

| Field | Meaning |
| --- | --- |
| `id`, `team`, `state`, `title`, `url`, `createdAt`, `updatedAt` | As on the Work Item |
| `provider`, `externalId`, `priority` | The tracker, the tracker's id, and the tracker's priority. Vloer never re-ranks |
| `attempts` | Run claims so far, reader and writer alike. It is not "N of 3" |
| `infraFailures` | Infrastructure failures counted on the legacy lease path |
| `target` | `{forge, owner, repo, baseBranch}`, or `null` when no repository was resolved ("not routed") |
| `closeReason` | The latest Shift's close reason, or `null` while the Shift is open or when there is none |
| `latestShift` | `{round, closeReason, budgetUsd, spentUsd, reservedUsd, closedAt}`, or `null` |
| `spentUsd` | The latest Shift's spend, or `null` when unknown |
| `pullRequestUrl` | For up to ten review rows, the pull request link from the newest checkpoint or Run; otherwise `""` |
| `sourceWorkItemId`, `sourceTitle`, `createdKind`, `ready` | Proposed rows only, when Ploeg reports them |

### Cancel

Cancel is for operators and administrators; viewers get 403. Live, Vloer asks Ploeg to cancel the Work Item as the signed-in person and answers `{workItemId, team, state, demo: false, withdrawn, shiftId, cancelledRuns, stoppedRuns, keysBlocked, message}` with Ploeg's own figures:

* `withdrawn: false` means nothing was live, and `state` keeps the Work Item's state.
* `keysBlocked: false` means Ploeg could not yet confirm that the stopped Runs' model keys are blocked; its sweep retries.
* A field that Ploeg leaves out or sends malformed is `null`, meaning unknown, never `0` or `false`. `message` is `""` unless Ploeg sends one.
* A Work Item that a workbench session drives answers 409 `ploeg_decision_conflict`: cancel that session instead.

In the demo, cancel answers 200 and changes nothing: `withdrawn: false`, `cancelledRuns: 0`, `stoppedRuns: 0`, `keysBlocked: null` and a `message` that says no Run was stopped, no model key or push token was blocked and the tracker was not told.

What Ploeg does on cancel is [journey D](../../../../docs/concepts/journeys.md#d-stopping-work).

## Static files

The server answers `GET` for the browser workbench from its public directory ([`static.ts`](../../src/static.ts)): the page, the named top-level assets in `src/http.ts`, and any `/core/`, `/views/` or `/styles/` file whose name matches `[a-z0-9][a-z0-9-]*\.(js|css)`. Anything else is 404.

* Every response carries `Cache-Control: no-cache` and a strong `ETag`: 32 base64url characters of the file's SHA-256.
* `If-None-Match` with that tag, weakly compared, or `*`, answers 304 with no body. The 304 keeps the `ETag`, `Cache-Control`, `Vary` and every security header, the Content Security Policy included.
* HTML, CSS, JavaScript, SVG and the web manifest are gzipped when `Accept-Encoding` accepts `gzip` or `x-gzip` with a non-zero quality, and only when that is smaller. The gzipped variant's tag ends in `-gzip`. These types carry `Vary: Accept-Encoding`; fonts, images and plain text are never compressed.
* File bodies and their gzip are cached in memory by path, modification time and size, up to 512 files.
