# Live operation

Live mode runs paid or otherwise metered agent work. The intended first deployment is a private workbench on a remote server, then one configured Kubernetes environment. A browser on a laptop controls that deployment; the agent processes and repository checks run where the server/workspace backend runs.

Read [validation](../validation.md) for the actual qualification level. The local fixture demonstration does not validate these external integrations.

## First managed session

Ploeg authorizes and budgets every live agent Run ([ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md)). Standalone live mode, where Unfold minted its own gateway keys without Ploeg, is retired: since 2026-10-14 a live Unfold without a `ploeg` connection and an `execution` block refuses to start, and the error names the missing settings. Demo mode needs neither. Set up Ploeg first with [the managed-execution guide](../../../../docs/workflows/managed-execution.md): an operator consumer with team scope and `execute: true`, and a managed inference policy for the team.

Prepare Node 24, Git and the OpenCode version pinned in [the agent image](../../ops/agent/Dockerfile). The mise `live` and `probe-opencode` tasks install that version on demand; other mise commands do not. Register a repository the execution environment can clone. For the first qualification use a disposable public test repository; private forge credential provisioning is a separate deployment concern and must not inherit an operator's workstation login.

Prepare a LiteLLM gateway with a working model alias such as `coding`. The gateway must support the model's required tool calls. Ploeg holds the gateway's management credential and mints each Run's capped key; Unfold needs only the inference URL. Confirm model access and spend tracking in the gateway before supervising a paid session.

Copy the supplied non-secret configuration and set the repository URL, branch and verification argv, the gateway URL, Ploeg's URL and Team, and the Unfold user IDs that may use that Team:

```sh
cp config/live.example.json config/live.local.json
```

The example already has the blocks managed execution needs. `ploeg.tokenEnv` names the environment variable that holds Unfold's Ploeg consumer token, and `execution.team` must be one of `ploeg.teams`:

```json
"ploeg": { "url": "https://ploeg.internal.example", "tokenEnv": "PLOEG_OPERATOR_UNFOLD_TOKEN", "teams": ["delivery"] },
"execution": { "team": "delivery" }
```

`executionOwner: "ploeg"` on a repository records that Ploeg owns its work; with `execution` set, every session Unfold starts goes through Ploeg either way.

The minimal runtime selection is:

```json
{
  "kind": "opencode",
  "backend": "local",
  "binary": "opencode",
  "timeoutMs": 1200000
}
```

This is the `runtime` object, not a full configuration file, and it enables exactly one workspace backend. To offer a choice per session, list the enabled backends instead; the first entry is the default unless `backend` names another:

```json
{
  "kind": "opencode",
  "backends": ["docker", "local"],
  "timeoutMs": 1200000,
  "agentEnvironment": ["FORGEJO_AGENT_TOKEN"]
}
```

`agentEnvironment` is an allow-list of variable names copied from the server process into local and Docker workspaces. A launcher may read those values from OpenBao into its own shell; the configuration only names which of them an agent may see, and names carrying workbench, gateway, cluster or vault authority are refused at startup. Nothing here puts a value in a file. Sessions record their `placement`; the browser and editor show the selector only when more than one backend is enabled ([ADR 0009](../adrs/0009-workspace-placement-is-a-session-choice.md)).

`local` means local to the **Unfold server**. A remote server with this backend already moves agent CPU, memory and repository checks off the operator's laptop. Use this backend only for trusted single-user development on a dedicated host. It separates working directories and selected environment variables, but runs under the control server’s OS user. Approved shell commands or repository scripts can access server files, process environments and sibling workspaces. This is not a boundary for protecting the master key against hostile code. Use the Kubernetes backend with the supplied separate namespace and pod restrictions for a shared team pilot.

Supply credentials through the deployment's secret mechanism or a short-lived shell environment populated from the vault. Keep secret values out of configuration files. The application supports loading `.env`, but Webgrip's operating policy keeps originals in OpenBao; use the [estate secrets model](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/docs/techdocs/docs/adr/adr-0055-one-secrets-model-six-levels.md).

| Setting | Purpose |
| --- | --- |
| `UNFOLD_CONFIG` or `--config` | Configuration file path |
| `UNFOLD_ADMIN_NAME` | Initial administrator name; defaults to `admin` |
| `UNFOLD_ADMIN_PASSWORD` | Initial administrator password, at least 12 characters; creates the account only if absent and only while [local sign-in](#local-sign-in) is on |
| `UNFOLD_LOCAL_LOGIN` | `true` or `false`; overrides `auth.localLogin`. `false` turns [local sign-in](#local-sign-in) off |
| `UNFOLD_DATA_DIR` | Persistent state/workspace directory; defaults to `.unfold` |
| `UNFOLD_HOST`, `UNFOLD_PORT` | Bind address and port; default `127.0.0.1:4080` |
| `UNFOLD_BASE_URL` | Public HTTP(S) URL used for origin and secure-cookie behavior |
| `LITELLM_BASE_URL` | Agent inference endpoint, normally the gateway URL including `/v1` |
| `LITELLM_ADMIN_URL` | Gateway root the Status page checks for liveness; defaults to inference URL with trailing `/v1` removed |
| `LITELLM_MASTER_KEY` | Not used: Ploeg holds the gateway management credential and Unfold discards this value under managed execution. Leave it unset |
| The variable `ploeg.tokenEnv` names | Unfold's Ploeg operator consumer token, the same one registered in Ploeg's `PLOEG_OPERATOR_CONSUMERS`; never listed in `agentEnvironment` |
| The variable `ploeg.personTokens.clientSecretEnv` names | The secret of the confidential client Unfold exchanges sign-in tokens with ([Proving people to Ploeg](#proving-people-to-ploeg)); never listed in `agentEnvironment` |
| `UNFOLD_INSIGHT_EVENTS` | `on` (default) records product events from the browser; `off` stores none, and the browser posts none |
| `UNFOLD_INSIGHT_EXPORT` | Product-event sink: `off` (default), `faro` or `otlp` |
| `UNFOLD_INSIGHT_EXPORT_URL` | Full collector URL the server posts to; required for `faro` and `otlp`. For Faro it ends in `/collect`, for OTLP/HTTP in `/v1/logs` |
| `UNFOLD_INSIGHT_EXPORT_LEVEL` | `aggregate` (default, each finished day's rollup) or `events` (each event with its pseudonymous actor hash) |
| `UNFOLD_ERROR_OTLP_URL` | Optional OTLP/HTTP logs URL of an OpenTelemetry collector (ends in `/v1/logs`). Server errors (HTTP 5xx), unhandled rejections, crashes and failed Asks are sent there as log records. See [Error reports](#error-reports) |
| `UNFOLD_SENTRY_DSN` | Optional Sentry-protocol DSN (`https://<key>@<host>/<project>`) for Sentry, GlitchTip or Bugsink; the same reports as envelopes |
| `UNFOLD_ERROR_ENVIRONMENT` | Environment name on each report, such as `staging`; defaults to the mode |
| `UNFOLD_MCP_RESOURCE`, `UNFOLD_MCP_ISSUER`, `UNFOLD_MCP_TOKEN_AUDIENCE`, `UNFOLD_MCP_CLIENT_IDS` and the other `UNFOLD_MCP_*` | Serve `unfold-mcp` over HTTPS at `UNFOLD_MCP_RESOURCE`, for tokens of `UNFOLD_MCP_ISSUER` whose `aud` is that URL. `UNFOLD_MCP_TOKEN_AUDIENCE=client-id` also accepts the client id in `aud`, which Authentik needs. Off unless `UNFOLD_MCP_RESOURCE` is set. See [Serve Unfold's MCP tools over HTTPS](../../../../docs/how-to/serve-unfold-mcp-over-https.md#2-configure-the-unfold-server) |
| `UNFOLD_PLOEG_MCP_URL` | Optional exact resource URL of the remote `ploeg-mcp`, the same string as its `PLOEG_MCP_RESOURCE`. HTTPS, except on loopback. No default. See [Ploeg's MCP server in VS Code](#ploegs-mcp-server-in-vs-code) |
| `UNFOLD_PLOEG_MCP_CLIENT_ID` | The public OAuth client registered for that server, such as `ploeg-mcp`. Set it together with the URL; one without the other stops Unfold from starting |

The insight export forwards product events the browser and VS Code extension post to `POST /api/insight/events` ([RFC-0001](../../../../docs/design/rfc-0001-product-events-and-confusion-signals.md)). The call is server to server, so the browser never contacts the collector and the CSP stays `'self'`.

- `aggregate` sends each finished UTC day of the `product_event_daily` rollup once, without any actor hash, as events in the domain `unfold.insight.daily`. The hourly job sends a day an hour after it ends, because an event may say it happened up to an hour before it arrived. A day the collector refuses is offered again on the next hour.
- `events` sends each stored batch as it arrives, in the domain `unfold.insight`, with its 16-character base32 actor hash and an `at_ms` attribute (epoch milliseconds, so durations can be computed in LogsQL). The hash cannot be reversed to a user id without the tenant actor key, and the key is replaced every 13 months. A batch the collector refuses is dropped from the export; the stored rows stay.
- Faro event attributes are strings only, so numbers and booleans travel as text. OTLP keeps their types.
- An unreachable collector is logged once an hour and never blocks or slows the event route. One person may post 600 events a minute; past that the route answers `429`.

In Kubernetes, set these through the chart's `insight` values ([chart README](../../ops/helm/unfold/README.md#product-events-and-export)); recording is on and the export is off by default. On the owner's homelab instance the sink is `faro` at `http://alloy-gateway.observability.svc.cluster.local:12347/collect`. The [dashboard](../../ops/grafana/README.md) reads the events back in Grafana.

Then start and sign in:

```sh
mise run live --config config/live.local.json
```

Select the registered repository and delivery Team, authorize a small budget and start one session. Its **Ploeg runs this session** card links to the Work Item in Ploeg. Inspect actual tool activity, changes, verification output and the explicit review verdict. Exercise a human permission response when one occurs. Reload the browser to verify continuity. At completion verify the final spend state and that Ploeg blocked the Run's key; `unknown` is a blocker to investigate, not zero cost. Ploeg keeps the authorization until its accounting reconciles the spend; budget enforcement has the gateway's concurrency and in-flight request limits.

The workspace manager starts an authenticated OpenCode server per managed workspace and injects the session-scoped inference key Ploeg minted. Do **not** set `OPENCODE_URL` in live mode. Every live session receives a scoped model credential, and the workbench refuses to give one to a shared pre-existing OpenCode server, so live configuration with an external endpoint is rejected at startup. Use local provisioning on the remote host or Kubernetes provisioning.

For another operator, run `npm run user:add` against the same `UNFOLD_DATA_DIR` while the server is stopped, then restart it. The helper asks for a name and role and generates a password shown once unless `UNFOLD_USER_PASSWORD` is supplied through the environment. Keep that output private. This helper provisions local accounts. OIDC sign-in is also implemented; see [signing in with the estate](#signing-in-with-the-estate). Shared session membership is a separate capability.

## A second estate as a profile

The named estate examples in this section are recorded setup experience. Resolve current ports, identity-provider mounts, vault policies and model routes from that estate's deployment configuration before using them.

A profile is a config file plus a launcher; nothing in the source knows which estate it serves. The webgrip pilot runs on port 4080 with its data under `.unfold`, and a second estate's profile runs beside it on 4081 with its data under its own directory below `.unfold`, each pointing at its own LiteLLM, task source, repositories and Ploeg. Both files are ignored by Git (`config/*.local.json`, `*.local.sh`) so no estate detail is committed.

The launcher resolves every secret from the estate's OpenBao at start and exports it for the process. The second estate's OpenBao authenticates on the `authentik/` mount with one role per team, and only the `admin` role reads outside `secret/teams/<team>/*`, so the launcher logs in with `bao login -method=oidc -path=authentik role=admin`. The retired `oidc/` mount answers 403 to a login attempt, which reads like a policy problem and is a wrong path.

A private repository over HTTPS needs a credential the workspace can use without a token in the URL, which the config rejects, and without an askpass, which the Docker backend does not carry. Git reads configuration from `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_n` and `GIT_CONFIG_VALUE_n` even under the `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_NOSYSTEM=1` the clone step sets ([git config environment](https://git-scm.com/docs/git-config#ENVIRONMENT)). The launcher sets `http.https://gitlab.com/.extraheader` to a basic authorization header built from the token, plus the committer identity, and the profile allows those names in `agentEnvironment`. The clone, the push and the merge-request call then work with no code change.

That token is the one credential a sandbox holds beyond its inference key, and a Team that pushes its own branch and opens the merge request is the compatibility mode [ADR 0006](../adrs/0006-trusted-verifier-and-publisher.md) describes: it cannot claim the fencing guarantee. Use a project access token scoped to the one repository with `api` and `write_repository` and a short expiry, never a shared estate token. The [model gateway capabilities](../product/model-gateway-capabilities.md) page records the path that removes the token entirely, forge tools served through the gateway's MCP surface and granted per key.

## What the Team did

The Activity stream shows one card per tool call with its status; open it for the input, the output and the error when it failed. A read role's search tools depend on ripgrep, which the agent image now installs, so a session on an image built before 2026-09-10 shows every grep and glob failing with exit code 127 and the Team falling back to reads alone. The Handoff tab carries a transcript per role with the model that answered each message. The budget panel lists which models the gateway actually used, with the routed group when the session named an auto-router, and what each cost. The Gateway tab answers the provenance questions per request: which provider and endpoint served it and in which region, why the auto-router chose that tier and what it saved, whether the gateway retried, fell back, hit its cache or applied a guardrail, how long the request took and when the first token arrived, which harness version called, and the gateway call id to find the span in the estate's trace store. A refused request shows the gateway's error class, so a budget ceiling or a provider outage is visible where it happened.

## Linking the estate's observability

A profile can point the workbench at the estate's Grafana so every session links out to where the rest of the evidence lives:

```json
"observability": { "grafanaUrl": "https://grafana.example", "dashboards": { "spend": "litellm", "reliability": "litellm-reliability", "finops": "finops-fleet" }, "tracesDatasource": "victoriatraces", "logsDatasource": "victorialogs", "logsUrl": "http://vlsingle-victorialogs.observability.svc.cluster.local:9428", "metricsUrl": "http://vmsingle-vmsingle.observability.svc.cluster.local:8429" }
```

**Settings › Environment** lists the dashboards, the budget panel links to the spend board whose "Cost per run" table is keyed by the session's key alias, and the Gateway tab opens Grafana Explore on the trace and log datasources for the session's time window, or for one request's window from its row. The default trace query selects the gateway's service and the default log query its namespace and container; `traceQuery` and `logsQuery` override them and may use `{callId}`, `{alias}` and `{sessionId}` once the estate records the gateway call id as a span attribute or log field. At the second estate the spend board's per-run rows come from the ledger exporter, which reads the gateway's request log by key alias, so a session's cost survives the revocation of its key.

### Pod logs per Run

Set `observability.logsUrl` to the VictoriaLogs base URL, for example `http://vlsingle-victorialogs.observability.svc.cluster.local:9428`, and each Run on a Work Item page gets a **Pod logs** disclosure. Ploeg does not record which pod ran a Run, so the server finds it in two LogsQL queries against `/select/logsql/query`: the pods whose lines carry the Run's `trace=<key alias>` (the worker's run logger writes it on every line) between two minutes before the Run started and two minutes after it finished, then those pods' lines in the same window. A retried Run can show more than one pod; each line is then labelled with its pod. The answer holds the newest 500 lines, each cut at 4,000 characters, with terminal escapes stripped and credentials masked. While the Run is running and the disclosure is open, the page asks for newer lines every five seconds; it stops when the disclosure closes, the tab is hidden or the Run finishes. The route is `GET /api/ploeg/work-items/<id>/runs/<run>/logs` and authorizes like the Work Item itself.

The page reads each line the way Grafana's log panel does, in the browser over the lines it holds. Go `slog` text (logfmt) and JSON lines give a level, a message and their other fields; any other line is its own message, with a level only when a level word such as `WARN` leads it. Above the lines a volume chart counts lines per level over the Run's time, and choosing a bar shows only that slice. Level filters with counts, a search that marks its matches, Wrap and Times switches and a Download of the shown lines sit between the chart and the lines. Fields every line carries, such as `trace` and `role`, show once above the lines instead of on each one. A line opens to its store time, level, pod and fields and its raw text. The search and filters stay on the page and never reach the log store; for anything older than the newest 500 lines, use **Open in Grafana**.

Without `logsUrl` the disclosure says the logs are not connected and, when `grafanaUrl` and `logsDatasource` are set, links Grafana Explore to the same search. The demo has no agent pods and says so. In Kubernetes the Unfold pod needs NetworkPolicy egress to the VictoriaLogs pod on TCP 9428 (on the owner's homelab, pods labelled `app.kubernetes.io/name: vlsingle` and `app.kubernetes.io/instance: victorialogs` in the `observability` namespace); without it every read fails with "The log store could not be reached".

Set `observability.metricsUrl` to a Prometheus-compatible query API, for example `http://vmsingle-vmsingle.observability.svc.cluster.local:8429`, and a [Linked Session](../contracts/api.md#linked-sessions)'s page shows its cost estimate, tokens and active time from Claude Code's OpenTelemetry metrics; with `logsUrl` it also shows prompt and tool counts, the most used tools and the Claude account the session reported. Map `observability.dashboards["claude-code-session"]` to the uid of a Grafana dashboard that takes a `session` variable to link it. Claude Code sends that telemetry only when the person enables it in their own `~/.claude/settings.json` ([monitoring](https://code.claude.com/docs/en/monitoring-usage)). The Unfold pod needs egress to VictoriaMetrics on TCP 8429 as it does to VictoriaLogs.

## Error reports

Unfold reports what needs someone's attention to whichever error tracker it is given, without an SDK and without depending on one vendor. It has two destinations, which can be used separately or together:

- **OpenTelemetry** (`UNFOLD_ERROR_OTLP_URL`, in Helm `errorReports.otlpUrl`): one OTLP/HTTP JSON log record per report, sent to a collector such as Grafana Alloy or the OpenTelemetry Collector. The record follows OpenTelemetry's exception conventions (`exception.type`, `exception.message`, `exception.stacktrace`) and adds Unfold's tags as `unfold.*` attributes, plus `unfold.fingerprint`, `unfold.user_hash`, `unfold.extra` and `unfold.report_id`. The resource is `service.name=unfold` with `service.version`, `deployment.environment` and `host.name`. Any OpenTelemetry backend can store it, alert on it and group it by `unfold.fingerprint`.
- **Sentry protocol** (`UNFOLD_SENTRY_DSN`, in Helm `errorReports.sentry.existingSecret`): one envelope per report to `/api/<project>/envelope/`. Sentry, GlitchTip (MIT-licensed) and Bugsink accept it.

At most 30 reports a minute leave. Each send waits at most three seconds and never delays the request that caused it. Every report is also written to the log as an `error.reported` line, with or without a destination. A destination that is down or refuses a report costs one `error.report_failed` log line naming it.

| Source | Level | Grouped by |
| --- | --- | --- |
| A request that fails with 5xx | error | method and route, with ids replaced by `:id` |
| An unhandled promise rejection | error | the error |
| An uncaught exception, which still stops the process | fatal | the error |
| A failed Ask (see below) | error or warning | `ask`, the failure code and the model |
| A key Ploeg could not block after an Ask | error | `ask`, `finish` and the model |

Before a report leaves, configured secrets, the DSN itself, URL credentials, `sk-` keys and bearer, basic and token values are replaced by `[redacted]`, and the user id is replaced by the first 16 hex digits of its SHA-256. Reports carry the release `unfold@<version>`, the host name and the environment.

**Finding reports in VictoriaLogs.** When the collector forwards OTLP logs to VictoriaLogs on a Loki-protocol path, as Grafana Alloy's `loki.write` does, the record's `event.name` (`unfold.error`) and the resource's `service.name` (`unfold`) land as the stream fields `event_name` and `service_name`, with underscores. The other attributes keep their dots under `attributes.`: `attributes.exception.*` and `attributes.unfold.*`, such as `attributes.exception.message` and `attributes.unfold.fingerprint`. This LogsQL query lists every report:

```logsql
service_name:unfold event_name:"unfold.error"
```

Add `| stats by (attributes.unfold.fingerprint) count()` to group them.

### Why an Ask has no answer

Each failed or refused Ask stores a `failureCode`, says why in plain words on the Work Item page, in the VS Code chat and through `unfold_ask`, and offers **Ask again** when another try may help. Every failure is logged as `ask.failed` or `ask.refused`.

| Code | What the person reads | Ask again | Reported |
| --- | --- | --- | --- |
| `allowance_used_up` | The Team's Ask Allowance is used up, and when it resets | no | no |
| `not_admitted` | Ploeg's own reason, such as a Team with no Ask policy | no | warning |
| `ploeg_unavailable` | Ploeg could not be reached or failed | yes | error |
| `no_model` | The Team has no model for Asks | no | error |
| `gateway_unreachable` | The model gateway could not be reached | yes | error |
| `key_rejected` | The gateway refused the Ask's key: unknown, expired or blocked | no | error |
| `budget_exceeded` | Answering needed more than the per-Ask Budget | yes | warning |
| `spend_limit_reached` | A wider gateway spending limit, such as the Team's, is used up | no | error |
| `model_unavailable` | The gateway does not offer the Team's Ask model to the key, or the model does not exist | no | error |
| `too_long` | The record and the question are more than the model's context window | no | warning |
| `rate_limited` | The gateway or the provider is busy | yes | warning |
| `provider_error` | The provider failed, refused the gateway's credential, or its own quota is used up; also any error Unfold does not recognise | yes | error |
| `bad_response` | The gateway's reply could not be read | yes | error |
| `timeout` | No answer within 60 seconds | yes | warning |
| `cut_off` | The model spent all 1,500 output tokens reasoning and wrote nothing | yes | warning |
| `filtered` | The provider withheld the answer under its content rules | no | warning |
| `empty` | The model returned an empty answer | yes | warning |
| `interrupted` | Unfold restarted while answering; set the next time the Asks are listed, two minutes after the question | yes | warning |

Unfold reads the gateway's error from LiteLLM's error body first, its `type` and its wording, and from the HTTP status only when the body says nothing. A spent LiteLLM budget is therefore `budget_exceeded` or `spend_limit_reached` whichever status LiteLLM gives it: 429 up to LiteLLM 1.103, 422 from 1.104, and 400 or 402 elsewhere. The message names whose budget it was; only the Ask's own key is `budget_exceeded`. The art generator under [Card themes](#card-themes-and-generated-art) uses the same reading for its error message.

The call asks for `reasoning_effort: low`, since an answer is at most 120 words; a gateway that refuses that parameter is asked once more without it. An answer the model stopped at its length limit is kept and marked `cutOff`. Costs show as Ploeg reports them: an amount with "not final yet" while Ploeg can still correct it (a day after the Ask), "Cost not known yet" before the gateway has recorded anything, and "Nothing charged" for an Ask refused before any model call.

## Run health and its judge

While a Run runs, its row on the Work Item page shows a health badge (On track, Watch, Off track, Not judged yet or Not known) with a reason line that names its numbers ([RFC-0007](../../../../docs/design/rfc-0007-run-health.md), [ADR 0046](../adrs/0046-a-running-runs-health-is-computed-from-its-own-facts-and-a-judge-only-advises.md)). Unfold's server computes it from the Run, its limits, the tail of its transcript and the time, so every viewer sees one answer. The time-based signals need a Ploeg that serves each Run's `limits` (ploeg-hq/ploeg#160); with an older Ploeg they say Not known and Budget and Repeat still judge.

Each running Run is also judged against its Work Kind ([RFC-0009](../../../../docs/design/rfc-0009-judging-a-run-by-its-kind-of-work.md)). The kind comes from rules in [`public/core/work-kind.js`](../../public/core/work-kind.js): a reading Role is a Review, a writing Run after the first Round is a Repair, a conventional title prefix (`docs:`, `fix(scope):`, `chore(deps):`) names the kind, then keywords in the title; a writing Run no rule recognises counts as a Feature and says "(default)". The server tallies every call's Activity as it reads the transcript, and five signals compare the tally with the kind's expectations: Out of role (a Review that changes a file), Order (shipping after a change with no test run in between; a push is Off track), First change (no file changed by the expected minute), Overstay (reading too long without changing, testing, shipping or setting up) and Churn (more change-and-test rounds than expected). Each is Watch at its number and Off track at twice it. The defaults are in [`public/core/expectations.js`](../../public/core/expectations.js); a Team pins its own per kind:

```json
"judgement": { "teams": { "bronze": { "expectations": { "docs": { "firstChangeMinutes": 5 }, "spike": { "readMinutes": 90 } } } } }
```

`readMinutes` and `firstChangeMinutes` take whole minutes from 1 to 600, `cycles` 1 to 50, `verifyBeforeShip` true or false. The reason line says whether a number is the default or set for this Team.

A shadow judge can add a model's verdict. It is off until the `cards.health.judge` flag is on for the Run's Team ([feature flags](feature-flags.md)), and it needs a connected Ploeg and the gateway (`LITELLM_BASE_URL`). Each judgement is a Ploeg Ask paid from the Team's Ask Allowance and never counted as delivery spend. It runs on a plan change, when a signal turns to Watch, and otherwise at most every 10 minutes, at most 9 times per Run, one at a time, and only from the read of a person who is not a viewer. Its verdict can raise the badge, never lower it, and it never stops, requeues, steers or grades a Run.

```json
"runHealth": { "judgeModels": ["hetzner-qwen3-8-27b", "hetzner-qwen3-6-35b-a3b"] }
```

* `judgeModels` lists the gateway models the judge may use, in order. The default is Hetzner's free, EU-hosted experimental inference through LiteLLM, which does not store content. Hetzner says that service is not for production; the judge accepts that because it only advises, and a missing verdict leaves the signals. The judge uses the first listed model the Ask's key may call. When Ploeg offers none of them, the Ask is finished unused, the judge shows "Judge off" and logs `run_judge.model_not_offered`: it never falls back to a paid model.
* A verdict is kept only when it is one JSON object with `health`, a `reason` of at most 160 characters and at most 5 transcript `evidence` seqs from the window it read; anything else is discarded and logged as `run_judge.discarded`. A gateway that refuses `response_format` is asked once more without it.
* A spent Ask Allowance pauses the judge ("Judge paused: this month's allowance is spent") without counting an attempt. A failed or timed-out judgement shows nothing; the signals still answer.
* Health changes are recorded as the product event `run.health.changed` (old and new health, the deciding signal and the Run id, never transcript text), and the "This was wrong" control as `run.health.judge_wrong`.

## What a Run spent its time on

The trace on a Work Item page draws one lane per Activity (Orient, Explore, Change, Verify, Ship, and Setup, Wait or Other when a Run has them), read from each tool call's command by [`public/core/activity.js`](../../public/core/activity.js), not from the harness's tool name ([RFC-0009](../../../../docs/design/rfc-0009-judging-a-run-by-its-kind-of-work.md)). Hover a tick to see the rule that placed it.

To see the split over many past Runs, export Ploeg's Runs and transcript entries read-only and run the report:

```sh
P=$(kubectl -n ploeg get cluster ploeg-db -o jsonpath='{.status.currentPrimary}')
q() { kubectl -n ploeg exec "$P" -c postgres -- psql -U postgres -d app -At -v default_transaction_read_only=on -c "$1"; }
q "select json_agg(r) from (select a.id, a.team, a.role, a.state, a.outcome, a.harness, a.started_at, a.finished_at, w.title from agent_runs a join work_items w on w.id = a.work_item_id where a.id in (select distinct run_id from run_transcript_entries)) r" > runs.json
q "select json_agg(e order by run_id, seq) from (select run_id, seq, at, kind, body->>'toolKind' as tool_kind, body->>'title' as title, body->>'input' as input, body->>'toolCallId' as call_id, body->'paths' as paths from run_transcript_entries where kind = 'tool_call') e" > entries.json
node scripts/activity-report.mjs runs.json entries.json
```

It prints each Run's calls, moves, minutes to its first Change and the share of its time in each Activity, and how many calls no rule placed. The exports hold commands the agents ran, so keep them out of the repository and delete them afterwards.

## Deliveries and the silent Acceptance calendar

Insights lists the window's Deliveries: each attempted Work Item's Acceptance, its date and the Token Charge base, which is the settled cost of every attempt before any Markup. The rules come from [system ADR-0006](../../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md); the route is in the [API contract](../contracts/api.md). This is phase 1 of billing per accepted Work Item: figures only. Unfold charges nothing, and has no Credits, Delivery Fee, Reversals or invoices; those are phase 2 and wait for the owner's pricing decisions.

A pull request with no decision from a person counts as silently accepted 10 working days after the agents handed it over. Ploeg records no ready-for-review moment, so the hand-over is the finish of the Shift's last writing Run, the same stand-in the clean-merge rate uses. Working days are Monday to Friday in UTC; public holidays count as working days. An installation that wants to skip specific dates lists them as extra non-working dates in the configuration file (default none).

```json
"acceptanceCalendar": { "nonWorkingDates": ["2026-12-25", "2026-12-26"] }
```

Unfold refuses to start when a date is not a real `YYYY-MM-DD` date or the list holds more than 1000.

Not counted yet: a change that lands on the base branch by another route, attempts that failed through Unfold's own fault (they are in the base), and Reversals after a revert.

## Decider tripwire

The tripwire screens every new tool call of a running Run with a decider, a model asked for scores instead of prose ([RFC-0008](../../../../docs/design/rfc-0008-decision-models.md), [ADR-0042](../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), both proposed). Built on branch `feat/tripwire-reader`, not released. It is off until a `decider` block is configured and the `runs.tripwire` flag is on for the Run's Team ([feature flags](feature-flags.md)); it needs a connected Ploeg.

```json
"decider": { "baseUrl": "https://litellm.example/v1", "keyEnv": "UNFOLD_DECIDER_KEY", "model": "hetzner-qwen3-8-27b", "name": "Hetzner Qwen", "requestsPerMinute": 8 }
```

* `baseUrl` is the gateway's OpenAI-compatible base URL. `keyEnv` (default `UNFOLD_DECIDER_KEY`, must start with `UNFOLD_`, so it never reaches an agent workspace) holds Unfold's own LiteLLM virtual key, limited to the decider models with a budget of zero. Unfold refuses to start when the variable is unset or holds the master key, and never sends the master key. `model` defaults to Hetzner's free EU-hosted `hetzner-qwen3-8-27b`; `name` (default "Hetzner Qwen") is what each hit shows, so scores from two deciders are never mixed. The demo ignores the block. In the chart, set the `decider` values instead ([chart](../../ops/helm/unfold/README.md)).
* Every 15 seconds the server lists Ploeg's running Runs with the operator credential and, for each Run whose Team has the flag on, reads its transcript after the last seq it handled. These reads are for no person, like the fleet poller's; a person who opens the hits is authorized as for the Work Item. A tool call is screened once, on its first entry with an input or paths (or its final entry), as its title, kind, input and paths after redaction. All five checks (`reads_credentials`, `probes_sandbox`, `edits_own_instructions`, `follows_injected_orders`, `remote_code`) go in one call at temperature 0 with a strict JSON schema and thinking off, retried once without both when the gateway refuses them. An answer that is not exactly the five whole scores from 0 to 3 is discarded.
* One screen at a time, at most `requestsPerMinute` a minute (default 8; Hetzner allows 10 requests a minute per key). Calls over the cap wait for the next minute; a Run that finishes before they are screened keeps them unscreened. Each Run's cursor is stored with its hits, so a restart never screens a call twice.
* Every check scoring 2 or more is stored in `tripwire_hits` with the Run, Work Item, Team, seq, time, check, score, decider name and model, and an excerpt of at most 300 characters. A decider failure is a missed screen, counted on the Run and logged as `tripwire.screen_missed`; a Run without a transcript (Claude Code, headless OpenHands, an older Ploeg) is skipped and counted.
* What it never does: stop, cancel, withdraw, steer, requeue or note a Run, or slow one down. It only reads Ploeg. A later stop needs a service actor Ploeg does not admit yet (RFC-0008, step 5).
* Hits show in the Run's Tripwire list and, while the Run runs, in the live view's containment panel. Right and Wrong record the person's verdict and the product event `run.tripwire.verdict` (Run, hit, check, score, verdict and decider, never the excerpt). A score of 3 on `probes_sandbox`, `follows_injected_orders` or `remote_code` is announced to screen readers once.

With the `runs.progress-checks` flag on for a Team, the same reader and decider also read what the agent writes ([RFC-0009](../../../../docs/design/rfc-0009-judging-a-run-by-its-kind-of-work.md), [`public/core/checks.js`](../../public/core/checks.js)). Each thought or message of 40 characters or more, with the Work Item's title in front, is scored on three checks: `already_done` (the agent thinks the work may already be done), `asks_for_help` (it says it is blocked or needs a person) and `off_brief` (it describes work the Work Item does not ask for). Hits are stored like tripwire hits and listed under Progress checks in the Run's Decider list. Hits from 2 are listed; a 3 on `already_done` or `asks_for_help` that nobody marked wrong raises the Run's health to Watch with the decider's words; `off_brief` is only recorded until its hits are judged. Once per Run whose title no rule recognises, the decider also scores the title against the Work Kinds; the single top kind at 2 or more replaces the "Feature (default)" kind, and the page says the decider guessed it. Messages and guesses share the tripwire's `requestsPerMinute`. The two flags are independent: a Team can have either or both.

## Card themes and generated art

Run card themes are proposed ([ADR 0031](../adrs/0031-card-themes-a-card-designer-and-generated-art.md), [contract](../contracts/card-themes.md)). Administrators make them in **Settings › Card designer** and Unfold keeps them in its store. A Work Target picks one in Ploeg's configuration with `cardStyle: { skin, theme }`; Unfold never edits that file. Two optional settings:

```json
"cardThemes": {
  "directory": "/etc/unfold/card-themes",
  "assetQuotaMb": 256,
  "ai": { "baseUrl": "https://litellm.example/v1", "model": "claude-sonnet", "keyEnv": "UNFOLD_CARD_ART_KEY", "requestsPerHour": 30 }
}
```

* `directory` mounts read-only themes: `<id>.json` files and an `assets/` folder with the files they name. Mount it from a ConfigMap or a Git checkout; Unfold reads it at start-up and lists refused files in the designer.
* `ai` lets administrators generate shader art. Create a LiteLLM virtual key for Unfold alone, with a small budget and only the model you name, and put it in the environment variable `keyEnv` names (it must start with `UNFOLD_`, so it can never be passed to an agent workspace). Never use the master key: Unfold refuses to start with it. `maxTokens` (4096) and `timeoutMs` (90 seconds) are optional. The demo ignores `ai`.

## Seeing what the gateway dropped

The gateway drops request parameters a provider does not accept, and it does not record what it dropped. The second estate therefore serves strict twins of its Anthropic aliases, `claude-sonnet-5-strict` and `claude-haiku-4-5-strict`, with dropping off: a request that carries an unsupported parameter fails with a 400 the ledger records. Run the same objective once on the plain alias and once on the strict twin, then compare the two sessions; a refusal on the strict side with an otherwise identical brief names the parameter the plain side silently lost.

## Comparing two ways of running the same objective

A session can pin one configured model for every role from the new-session form, so an objective can be run once on `auto` and once on a pinned model, or once on Anthropic and once on a Fireworks model. From either session, "Compare with another session" opens a side-by-side table built from the gateway ledger and the recorded runs: outcome and final verdict, wall time, requests and refusals, the providers and models that answered, tokens, cost, router savings, median time to first token and the number of change artifacts. Cells that differ are highlighted. Compare sessions with the same objective and Team; the table does not normalise for different briefs.

## Keeping inference where policy allows

A profile can name the providers and regions the gateway may route a session to:

```json
"gatewayPolicy": { "providers": ["anthropic", "fireworks_ai"], "regions": ["eu"] }
```

The provider rule is enforced before the first turn, from the gateway's model catalogue, including every tier behind an auto-router; a session whose Team names a model served elsewhere does not start. The region rule can only be checked against what the gateway attributes after a request, so a violation stops the session at the next ledger read and revokes its key, and the Gateway tab marks the row. The names are the gateway's own: `anthropic`, `fireworks_ai`, and regions such as `global` or `eu` as the provider reports them. Anthropic's public endpoint reports `global`, so a profile that requires `eu` needs a gateway route to a regional endpoint first.

Ploeg execution refuses `gatewayPolicy` at start-up, so on a live Unfold enforce provider and region restrictions in the gateway's own policy instead; this setting is kept for the retired standalone path until its code is deleted.

### How residency is enforced

Residency is enforced in the model gateway, not in the agent workspace. Every model request an agent makes goes through the gateway with a key Ploeg authorizes, and that key may call only the model aliases in the Team's managed inference policy ([managed execution](../../../../docs/workflows/managed-execution.md)). The gateway serves each alias only from the deployments configured for it, so the aliases a policy allows decide which providers and regions can answer. For a deployment that must keep inference in the EU, configure each allowed alias on a provider's regional endpoint and leave other aliases out of the policy. Unfold and Ploeg add no second filter on a live workbench; `gatewayPolicy` is the check of the retired standalone path described above.

### Reading Where your data goes

**Where your data goes** on the Status page ([`residency.ts`](../../src/residency.ts)) reads the requests Unfold has stored from the gateway's ledger and checks each against `gatewayPolicy`. Its badge says:

| Badge | Meaning | What to do |
| --- | --- | --- |
| Within the policy | Every request in the last 7 days came from an allowed provider and region | Nothing |
| Outside the policy | At least one request in the last 7 days came from a provider or region the policy does not name | Open the listed session, Run or Work Item, then check the gateway route for its model. A session the engine caught while it ran is already stopped and its key revoked |
| Nothing to check | A policy is set and no request reached the gateway in 7 days | Nothing |
| No policy set | Unfold reads the ledger but no `gatewayPolicy` is set, so nothing counts as outside | Set a policy if the workbench must keep requests anywhere in particular |
| Unknown | Unfold reads no gateway ledger, which is always the case under Ploeg execution: Ploeg budgets the Runs and the gateway's own policy decides where they go | Read the gateway's spend log for the providers and regions that answered |
| Demo | The demo makes no model calls and shows no requests | Nothing |

The table counts requests per provider and per region for the last 24 hours and 7 days, marks names the policy does not allow as **outside**, and counts requests whose ledger row named no provider or region as **not reported**; a request is judged only on what it reports. A row the engine already marked with a violation stays outside after the policy changes. Each request outside the policy links to its session, names its Run by Role and links its Work Item when the reader may open them; another person's request shows as a count line only. The line does not change the verdict at the top or the navigation dot, because a request outside the policy does not stop new work from starting.

**Where each part runs** names what the configuration says about Unfold, Ploeg and the agent workspaces: the Ploeg API host and the workspace namespace and RuntimeClass for administrators, the backend kind for everyone. Unfold reads no region from its configuration and no Kubernetes node labels, so the Region column reads Unknown rather than a guess.

Each role's brief is recorded with the run and shown in the Activity stream, and the budget panel draws cumulative cost against the ceiling from the gateway's rows.

## Keeping a thin brief from spending the budget

For a manually written objective, the API requires at least twenty characters and four words. When enabled and applicable, the brief check asks a configured model whether the instructions are actionable; it prefers a model whose name matches a small/fast heuristic, not a measured cheapest model. Tracker imports and already-checked briefs skip this step. An unavailable or malformed check is recorded as skipped, so it is not an authorization gate. A request for clarification waits for the person's answers. Each role also has a configurable tool-call limit, eighty by default. See [the session engine](../../src/engine.ts) for the conditions. Do not assume a fixed price for the brief check.

The model choice on the new-session form shows what the gateway will do with it: the provider that serves a pinned model, or for an auto-router each tier and where it goes. At the second estate, `auto` routes every tier to Anthropic, while `auto-frugal` sends its low tiers to open-weight models on Fireworks; a session that should reach Fireworks needs `auto-frugal` or a Fireworks model pinned.

An investigation Team, one with no writer, completes with its challenger's verdict rather than failing on it. Only a delivery Team treats a missing approval as an incomplete review.

## Approving tool use

Every OpenCode session starts with `ask` for every tool, so each read, search and shell command waits for the operator. That is the right default on the `local` backend, where the Team shares the workbench's files. In a container or a pod the sandbox is the boundary, so a session there can be created with automatic approval, or switched to it from the decision panel while it runs. The switch answers the permissions already waiting and creates later roles with allow rules; read roles still cannot edit or run commands, and a Team's questions still wait for a person. Automatic approval is refused on the `local` backend.

The gateway can refuse requests with `budget_exhausted`. Displayed spend is an observation, and final accounting may arrive later; it is not a strict ceiling for requests in flight. Qualify the configured model and Team with a small explicit budget.

## Gateway tools for a repository

A repository can give its sessions read-only tools that the LiteLLM gateway serves over MCP. It is off unless the repository names a gateway team and the MCP access groups that team allows:

```json
{ "id": "orders", "mcp": { "litellmTeamId": "agents-orders", "accessGroups": ["observability-read-orders"] } }
```

Ploeg mints the session key, so it must apply that team as `team_id` and those groups as `object_permission.mcp_access_groups`; the gateway refuses the mint when the team does not allow those groups. With `require_key_mcp_access_defined` on the gateway, a key minted without them gets no tools at all, whatever team it is in. Unfold only writes the agent configuration: the agent gets one remote MCP server, `litellm`, at the gateway root with `/v1` removed plus `/mcp`, authenticated with the session key in `x-litellm-api-key`. The tools fall under the session's approval mode like every other tool, so they ask unless the session approves automatically.


In VS Code's Agents window the session lists the server as **Gateway tools (<access groups>)**, managed by the host. It cannot be started, stopped or turned off from there, and VS Code rolls such a change back. Under Ploeg it shows an error until Ploeg mints keys with the repository's access groups (VIK-1934). Plugins added from VS Code are refused; the session lists the client's own plugins with the reason ([ADR 0012](../adrs/0012-agent-host-protocol-host.md#update-2026-10-10-mcp-servers-and-plugins)).

## What "awaiting your review" means

A completed session has done everything the machine does: every role finished, the final reviewer's verdict is on its run, the candidate is captured as a bundle, patch and manifest with two signed statements over them, the workspace is released, and nothing was pushed or merged. The label now says what is missing: a person's review. Accept records that you inspected the candidate and consider it fit to take further, with an optional note; reject requires a reason, which the next attempt receives. Both are recorded with your name in the session history and shown on the session instead of the label. Until the publish action exists, taking an accepted candidate further is still a manual push and merge request from the downloaded bundle.

Pending or unknown spend stays visible after the Team finishes. Ploeg retains the authorization until trusted accounting reconciles it; see [shared recovery](../../../../docs/workflows/managed-execution.md#recovery).

## Trying a failed session again

A session Ploeg executes cannot be reset in place: reconcile the failed authorization and create an explicit new session. The in-place "Try again" reset belongs to the retired standalone path. "Duplicate as a new session" prepares a new brief, model, Team or budget selection; it does not itself authorize execution. See [the retry implementation](../../src/engine.ts).

## Linking ClickUp

A person links ClickUp by pasting their own personal API token on the Linked accounts page: ClickUp shows it under the avatar menu, Settings, Apps, API Token. The workbench checks the token against ClickUp's account endpoint, stores it encrypted for that account only, and from then on reads every task connection that names no `tokenEnv` with it. The Tasks view says when a link is missing. No application, secret or administrator is involved. GitLab accepts a pasted personal access token the same way, with `read_api`, `read_repository` and `write_repository`, and uses it for private clones as well as the API.

OAuth is optional on top: a workbench that registers a ClickUp OAuth application, which needs the application's client secret because ClickUp's OAuth has no PKCE, can offer a "Link ClickUp" button next to the paste form by setting `links.clickup.clientId` and `clientSecretEnv`. Unlinking forgets the token; ClickUp tokens do not expire and have no remote revocation.

## Signing in with the estate

Register the workbench as an OAuth2 application at the estate's Authentik: a public client with PKCE, so no secret exists, client id `unfold`, redirect URI `<baseUrl>/api/auth/oidc/callback` matched strictly, the `openid`, `email` and `profile` scopes so groups are sent, and one scope mapping that turns membership into a role claim. At the second estate that is a blueprint in the Authentik blueprints ConfigMap next to the other applications, with groups `unfold-admins` and `unfold-operators` granted through the entitlements model rather than by hand. The profile then carries:

```json
"auth": { "oidc": { "issuer": "https://auth.example/application/o/unfold/", "clientId": "unfold", "displayName": "Authentik" } }
```

Optional keys: `roleClaim` (default `unfold_role`), `groupsClaim` (default `groups`), `roles` mapping each of admin, operator and viewer to group names (defaults `unfold-admins`, `unfold-operators`, `unfold-viewers`), `scopes`, `clientSecretEnv` for a confidential client, and `subjectNamespace`. Who can sign in is decided by the provider: at the second estate only Workspace accounts reach enrolment, and a person who signs in without one of the admitted groups is refused by the workbench with a message naming the group to ask for. The local password stays as the bootstrap administrator's door until you turn [local sign-in](#local-sign-in) off. The editor extension signs in through the same provider: connecting to a workbench with single sign-on offers "Sign in with Authentik", opens the browser on the workbench's own sign-in with a one-time code, and collects its session once the person has signed in, so the editor holds a session for the same identity as the browser and needs no client registration of its own.

The callback checks the authorization response's issuer as RFC 9207 describes, which stops a different provider's answer from being passed off as this one's. When the answer carries `iss`, it must equal the issuer the provider's discovery document names, character for character, with no trailing-slash or case folding. When discovery sets `authorization_response_iss_parameter_supported` and the answer carries no `iss`, it is refused too. Either refusal sends the browser back with `login_error=oidc_issuer` before the code is exchanged. A provider that neither sends `iss` nor advertises the parameter is accepted.

A person's account is identified by the provider's subject together with `subjectNamespace`, which defaults to the issuer. Authentik puts the application slug in the issuer, so renaming the application changes the issuer, and without a namespace every person who signs in afterwards gets a new, empty account. Set `subjectNamespace` to the issuer the accounts were created under, and keep it when the issuer changes again:

```json
"auth": { "oidc": { "issuer": "https://auth.example/application/o/unfold/", "subjectNamespace": "https://auth.example/application/o/former-slug/", "clientId": "unfold" } }
```

This carries accounts across only while the provider keeps issuing the same subject for a person. Authentik's default subject mode, a hashed user id, is the same in every application of one Authentik. A provider set to a per-application subject breaks the link, and so does pointing the namespace at a different provider, which would hand one provider's accounts to another provider's people.

### Tenant and Client memberships

Groups in the same `groupsClaim` also carry a person's [Tenant](../../../../docs/reference/glossary.md#tenant) and [Client](../../../../docs/reference/glossary.md#client) memberships ([system ADR-0017](../../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md)). Unfold records them, and checks them only while [`tenancy.enforce`](#limiting-people-to-their-tenant-and-client) is on; with it off, a membership changes nothing a person can see or do. The workbench role above still decides who may sign in.

| Group | Membership |
| --- | --- |
| `unfold/<tenant>/viewer` | Viewer in that Tenant |
| `unfold/<tenant>/member` | Developer in that Tenant |
| `unfold/<tenant>/admin` | Admin in that Tenant |
| `unfold/<tenant>/client/<client>` | Client membership of that Client in that Tenant, with no Tenant role |

* Tenant and Client ids are lower-case letters, digits and inner hyphens, at most 63 characters. The group must match exactly: any other case, an extra or empty segment, or another role word is ignored, never read as something close.
* A Tenant named by several role groups keeps the highest: viewer, then developer, then admin.
* The roles are [Access Roles](../../../../docs/reference/glossary.md#access-role). ADR-0017 names the middle group `member`, a word the glossary avoids; reading it as Developer is proposed until the owner confirms it. Lead, Product owner and Account owner have no group yet.
* A local password account and the demo account hold their workbench role in the `default` Tenant: admin as Admin, operator as Developer, viewer as Viewer. A person who signs in with single sign-on joins `default` only through an `unfold/default/<role>` group.
* `GET /api/bootstrap` reports them as `user.memberships`, for example `[{ "kind": "tenant", "tenant": "default", "role": "admin" }]`, and so does a password sign-in's answer.
* Each single sign-on saves them on the account, in `user_memberships`, replacing what the previous sign-in saved: a group removed at the provider removes its membership at the person's next sign-in, and their open sessions report the new set from then on.
* Repositories and task sources name the Tenant and Client that own them with `tenant` and `client` ([who owns a source](task-connections.md#who-owns-a-source-and-a-repository)). Unfold checks those fields at startup and compares them with memberships while `tenancy.enforce` is on.

### Limiting people to their Tenant and Client

`tenancy.enforce` turns on the checks of [system ADR-0017](../../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md) in Unfold. It is off by default, and while it is off every answer is the same as without it. In the chart it is `config.tenancy.enforce`. Turning it on for a deployment is a change to that deployment's values; give every person their `unfold/<tenant>/...` groups first, because a person without a membership then sees no task source, repository or Work Item.

```json
"tenancy": { "enforce": true }
```

While it is on:

* A Tenant membership, with any Access Role, reaches every repository and task source of that Tenant, including every Client's. A Client membership reaches only what that Client owns, never what no Client owns. The workbench role grants no Tenant: an admin without a membership reaches nothing.
* `GET /api/bootstrap`, `GET /api/task-sources`, the task list and task reads, `GET /api/tasks/lookup`, the hand-off routes, `POST /api/task-imports`, `POST /api/sessions` and the folders of `GET /api/agent-host` see only what the person reaches. Unfold decides this before it reads a tracker with a source's token.
* Anything else answers exactly like an id that does not exist: `404 source_not_found` for a task source, `400 unknown_profile` for a repository in `POST /api/sessions`, `404 ploeg_not_found` for a Work Item. Probing ids shows nothing about another Tenant.
* Importing, handing off and taking back need a Developer or Admin membership of the source's Tenant. A Viewer or a Client user reads the tasks and gets `403 forbidden` for those.
* The Ploeg reads Unfold already limits by Team are limited again by the owner of each Work Item's target repository: Work Item lists and reads, Now, Proposed, Runs, a Work Item's value stream, audit events, Run Cards and the card lists of the collection and Team pages, crack attributions and their candidates, the unsettled accounts on Insights, and the figures read from Ploeg's delivery facts, `GET /api/ploeg/economics` and `GET /api/ploeg/deliveries` with its CSV. A Work Item the person does not reach never counts in those totals, rates or the sample threshold, a card of one answers like an unknown card, and an attribution or candidate whose other side they do not reach is left out. Ploeg does not record a Tenant yet, so Unfold takes the owner of the registered repository the target names, through a task source's Ploeg target or the repository's `owner/name`. A Work Item with no target, or one no registered repository matches, belongs to the `default` Tenant with no Client; one whose target matches repositories of different owners reaches nobody. Each Run, audit event, unsettled account or attribution side whose Work Item Unfold has not read yet costs one Ploeg read.
* A delegated `unfold-mcp` credential holds only the memberships the account held both when it was minted and when it is used, and over HTTP only those the caller's access token's groups also grant. Each Tenant role is capped at the role the credential acts with: viewer as Viewer, operator as Developer, admin as Admin. A token whose role is lowered to viewer can read in its Tenant but cannot hand off, and a token without `unfold/` groups reaches nothing.
* A person in several Tenants sees all of them together until the Tenant switcher exists (VIK-1877). The per-Team counts and spend of `GET /api/ploeg/summary`, which Ploeg adds up itself, Ploeg connections and the folders the agent host offers over its own protocol are still limited by Team only.

### Local sign-in

Local sign-in is the name-and-password door: the bootstrap administrator from `UNFOLD_ADMIN_PASSWORD` and the accounts `npm run user:add` creates. It is on by default, so the demo and a first local install work without an identity provider. Once single sign-on works, turn it off so every person comes through the provider and its groups:

```json
"auth": { "localLogin": false, "oidc": { "issuer": "https://auth.example/application/o/unfold/", "clientId": "unfold" } }
```

`UNFOLD_LOCAL_LOGIN=false` does the same and overrides the file; in Kubernetes set the chart value `auth.localLogin: false` ([chart README](../../ops/helm/unfold/README.md#sign-in)). With local sign-in off:

* `GET /api/auth/methods` answers `local: false` and the sign-in page shows only the single sign-on button.
* `POST /api/login` answers `404 local_login_off` before it reads the name or password.
* No bootstrap administrator is created, even with `UNFOLD_ADMIN_PASSWORD` set, and the server no longer asks for one at startup. Remove the variable from the credentials Secret.
* A local account's browser sessions, editor credentials and delegated `unfold-mcp` credentials stop working at their next request. The accounts and their rows stay in the database, so turning local sign-in back on restores them; a local account is one with a password, and an account created by single sign-on never has one.

Unfold refuses to start with local sign-in off and no `auth.oidc`, because nobody could sign in; the chart refuses to render the same combination.

## Behind a reverse proxy

Behind an ingress controller or load balancer, the socket's peer is the proxy, not the person's browser. Unfold then counts every local sign-in attempt, every editor sign-in start and every Request intake delivery against the proxy's address, so one client that fails ten passwords locks every other client out for five minutes. Set the top-level `trustedProxies` to the addresses and CIDR ranges of the proxies themselves, in the chart under `config.trustedProxies`:

```json
"trustedProxies": ["10.42.0.0/16"]
```

When the peer is one of them, Unfold reads `X-Forwarded-For` from the right and takes the first address that is not a trusted proxy. That address keys the local sign-in throttle (10 failed attempts per five minutes), the editor sign-in start limit (20 per ten minutes), the [Request intake rate limit](request-intake.md#rate-limit), and the source address the [security audit](audit-siem.md) records for a browser request and an `unfold-mcp` request over HTTP. Without `trustedProxies`, or from a peer that is not listed, the header is ignored, because any client can write it. List only the proxies, such as the ingress controller's pod network, never `0.0.0.0/0`: a listed range whose other addresses reach Unfold directly lets those clients choose their own address.

## Security headers

Every response starts with these headers; a route may set a stricter `Content-Security-Policy` of its own, such as the sandboxed policy on retained evidence files, but never removes one.

| Header | Value |
| --- | --- |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `X-Frame-Options` | `DENY` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains`, only when `baseUrl` is https |

`Strict-Transport-Security` tells a browser to reach the host only over HTTPS for `max-age` seconds, two years by default, and with `includeSubDomains` every host below it too. Unfold sends it when `baseUrl` starts with `https://` and never for an http `baseUrl`, where browsers ignore it. The top-level `hsts` setting changes it; in the chart it is `config.hsts`:

```json
"hsts": { "maxAge": 63072000, "includeSubDomains": true, "preload": false }
```

* `"hsts": false` sends no header, for a host whose subdomains still serve plain HTTP; `maxAge` and `includeSubDomains` alone narrow it.
* `preload` is off unless you set it. It adds `preload`, which asks browser vendors to ship the host in their built-in HTTPS-only list once you submit it at hstspreload.org. That list covers the whole registrable domain and every subdomain, and leaving it takes months, so set it only when the domain's owner decides every host under it is HTTPS for good. Unfold refuses `preload` without `includeSubDomains` or with a `maxAge` under one year.
* An explicit `hsts` with an http `baseUrl` stops startup.

## Proving people to Ploeg

Without this, Unfold calls Ploeg with its consumer token and names the person in `X-Ploeg-Actor`, which Ploeg records as *asserted*. With `ploeg.personTokens`, Unfold also sends a short-lived token the identity provider issued for that person, and Ploeg records the change as *proven* ([Unfold ADR 0055](../adrs/0055-unfold-proves-the-person-to-ploeg-with-a-token-exchanged-from-their-sign-in.md), Ploeg ADR-0150, [RFC-0011](../../../../docs/design/rfc-0011-every-agent-action-names-its-person.md)). It needs single sign-on (`auth.oidc`) and a Ploeg release that accepts `X-Ploeg-Person-Token`.

```json
"ploeg": {
  "url": "https://ploeg.internal.example",
  "tokenEnv": "PLOEG_OPERATOR_UNFOLD_TOKEN",
  "personTokens": {
    "tokenUrl": "https://authentik.example/application/o/token/",
    "clientId": "unfold-exchange",
    "clientSecretEnv": "UNFOLD_EXCHANGE_CLIENT_SECRET",
    "audience": "ploeg-for-unfold"
  }
}
```

| Key | Meaning |
| --- | --- |
| `tokenUrl` | The identity provider's token endpoint. Authentik serves one for all applications at `/application/o/token/` |
| `clientId` | A confidential client allowed only the token exchange grant, which federates the providers people sign in to Unfold with: the browser's and the one `UNFOLD_MCP_ISSUER` names for `unfold-mcp` over HTTP |
| `clientSecretEnv` | The environment variable holding that client's secret. At the estate it comes from OpenBao `authentik/unfold-exchange-oidc`, key `client_secret`, through the credentials Secret |
| `audience` | The exchange's target: the provider whose tokens Ploeg accepts for Unfold, such as `ploeg-for-unfold` |

Unfold refuses to start when `clientSecretEnv` is unset or listed in `agentEnvironment`, or when `auth.oidc` is missing.

What Unfold does with it:

* At sign-in it keeps the person's access token, and the refresh token when the provider returns one, encrypted in its store and bound to that browser login. Signing out deletes them; store upkeep deletes them once the login expires. The browser never sees them.
* Before each change it makes in Ploeg for a person, it exchanges the access token (`grant_type` `urn:ietf:params:oauth:grant-type:token-exchange`, `subject_token_type` access token, `audience` as configured) and sends the result as `X-Ploeg-Person-Token` beside the usual headers. It reuses the result until 30 seconds before it expires. Reads carry no person token.
* A change through `unfold-mcp` over HTTP exchanges the access token of that request instead, once per request; Unfold neither keeps nor refreshes it. The Agents-window chat's tools use the person's kept sign-in.
* When it cannot get a token, the change goes out as before, with the person named by Unfold, and the Status page tells that person in plain words. An expired access token is refreshed first when a refresh token is kept. An administrator acting for someone else's session never sends one.

What the identity provider and Ploeg need:

* **The sign-in provider.** Authentik exchanges only an access token it still holds. Its access tokens last as long as the provider's access token validity (one hour by default), and Unfold sessions last `sessionHours` (twelve by default). For proof to last the whole session, allow the `refresh_token` grant on the provider, give it the `offline_access` scope mapping and add `offline_access` to `auth.oidc.scopes`. Without that, proof lapses an hour after sign-in, and the Status page asks the person to sign in again.
* **Ploeg.** Unfold's consumer in `PLOEG_OPERATOR_CONSUMERS` lists `"audiences": ["ploeg-for-unfold"]`. `PLOEG_OPERATOR_PERSON_ISSUER` is the issuer of the exchanged tokens; for Authentik's global issuer that is `https://authentik.example/`. Set `PLOEG_OPERATOR_PERSON_SUBJECT_NAMESPACE` to Unfold's account namespace: `auth.oidc.subjectNamespace`, or `auth.oidc.issuer` when that is unset. Ploeg derives the person's id from that namespace and the token's subject. That id must equal the Unfold account id Unfold puts in `X-Ploeg-Actor`, or Ploeg refuses every change with `actor_conflict`.
* **The same subject.** The target provider must issue the same `sub` for a person as the sign-in provider; Authentik's default subject mode, a hashed user id, does. Unfold checks it and sends no token for another subject.

### When Ploeg refuses changes without proof

Ploeg's `PLOEG_OPERATOR_ATTRIBUTION` decides what happens to a change that carries no person token (Ploeg ADR-0171). Under `asserted`, Ploeg accepts it, records it as named by Unfold and answers with a `Warning: 299` header; Unfold logs each distinct warning once as `ploeg.warning`. Under `proven`, Ploeg refuses every operator change other than a read without a verified person token, answers 403 `person_token_required`, changes nothing and writes an `operator.attribution_refused` audit row. Reads stay open either way.

What Unfold does under `proven`:

* Every refused change answers `ploeg_person_unproven` with a message that tells the person to sign out and sign in again, whichever route made it: an approval, a note, an Ask, a chat message, an admission, context, a delivery step or an execution command. The Status page's person-proof line then turns degraded with `gap` `required`, also without `ploeg.personTokens`, and recovers at that person's next accepted change. Unfold logs `ploeg.person_unproven` once.
* A session whose heartbeat or command is refused stops at once, without waiting for its lease to run out. Its blocker asks the person to sign in again and reconcile; the refused command is not kept for a retry, and store upkeep does not send the session's report again until someone acts on it.
* A person token Ploeg rejects with 401 `invalid_token` is sent once more without the token, as under `asserted`, and the refusal that follows keeps Ploeg's reason for the rejection. Ploeg does not report its attribution mode (its version route names only its release and contracts), so Unfold learns it from the first `person_token_required` and from then on returns a rejected token's 401 as it is, without the retry.

Unfold cannot check Ploeg's mode when it starts, for the same reason. The Unfold chart checks it instead: it sets `ploeg.operator.attribution: asserted` and refuses to render a resolved `proven` without `config.ploeg.personTokens`.

Moving to Ploeg chart 0.3.0, whose empty `operator.attribution` resolves to `proven`, needs either `ploeg.operator.attribution: asserted` (the Unfold chart's default) or person tokens on both sides:

| Where | Setting |
| --- | --- |
| Unfold | `config.ploeg.personTokens` as above, with `auth.oidc` |
| Ploeg chart | `ploeg.operator.personTokens.issuer` (and `subjectNamespace` when it differs from the issuer), which the chart renders as `PLOEG_OPERATOR_PERSON_ISSUER` and its siblings |
| Ploeg chart | `audiences: [ploeg-for-unfold]` on Unfold's entry in `ploeg.operator.consumers` |
| Ploeg chart | `ploeg.operator.attribution: proven`, or empty from 0.3.0 |

Ploeg's chart refuses to render `proven` with consumers and no `operator.personTokens`. Changes Unfold makes without a person (the `unfold-cards` pull request comments, the delivery verifier's calls, an administrator acting for someone else's session) carry no person token, so Ploeg refuses them under `proven`; Ploeg has not yet decided how such a caller is attributed.

## Linking GitLab

Register one OAuth application per workbench in GitLab, under your user or the group that owns the repositories ([GitLab OAuth applications](https://docs.gitlab.com/integration/oauth_provider/)): redirect URI `<baseUrl>/api/links/gitlab/callback`, confidential off, scopes `read_api`, `read_repository` and `write_repository`. The application ID is not a secret. Put it in the profile as `links.gitlab.clientId`, or export `UNFOLD_GITLAB_CLIENT_ID`, and set `links.gitlab.baseUrl` for a self-hosted GitLab. `baseUrl` on the workbench must match what the browser uses, because it forms the redirect URI.

Each person then opens Linked accounts, links GitLab, and approves the application once. From then on a session on a repository from that GitLab clones with their token, which reaches only the clone step. The person can unlink at any time, which also revokes the tokens at GitLab.

## Docker on the workbench host

The `docker` backend runs the clone and the OpenCode server inside a container from the pinned agent image, through the Docker Engine socket. The workbench never invokes a shell or the Docker CLI. Build the image once from the repository and reference it by tag, or pull a digest-pinned build from the registry:

```sh
docker build -t unfold-agent:1.19.5 ops/agent
```

The Dockerfile pulls its hardened base from `dhi.io`, which needs `docker login dhi.io` with a Docker account; pass `--build-arg REGISTRY_DHI=<your-proxy>` to use a mirror. Released builds are at `ghcr.io/webgrip/unfold-agent:<version>`, signed and within a zero critical, zero high CVE budget ([releases](release.md)).

Add a `docker` block next to `runtime`:

```json
{
  "image": "unfold-agent:1.19.5",
  "cpus": 2,
  "memoryMb": 4096,
  "pidsLimit": 512,
  "network": "bridge",
  "gatewayUrl": "https://litellm.example/v1"
}
```

`socketPath` defaults to `/var/run/docker.sock`. `gatewayUrl` overrides the inference URL seen inside containers when the gateway address differs from the host's view, for example `http://host.docker.internal:4000/v1` for a gateway on the workbench host; the containers always get `host.docker.internal` mapped to the host. `user` pins the container uid; on Linux the workbench's own uid and gid are used so the bind-mounted session directory stays readable for candidate capture, and on macOS Docker Desktop the image's `node` user is fine. Each session gets one container named after its workspace, bind-mounted to `<dataDir>/workspaces/<session>`, with a read-only root filesystem, all capabilities dropped, no new privileges, a CPU, memory and PID budget, and the OpenCode port published only on `127.0.0.1` behind a per-session random password. The only credential inside is the session's scoped LiteLLM key plus whatever `agentEnvironment` allows. Container egress follows the Docker network it joins; restrict it by pointing `network` at a network you control.

Set `"transport": "pull"` in the `docker` block to let the container dial out instead of publishing a port. The container then runs the relay worker baked into the agent image, polls `docker.relayUrl` (default `http://host.docker.internal:<port>`) with a per-session token and forwards requests to OpenCode on its own loopback. On macOS Docker Desktop that reaches a workbench bound to `127.0.0.1`; on Linux bind the workbench to an address the Docker network can reach. Nothing is published on the host in pull mode ([ADR 0011](../adrs/0011-sandboxes-dial-out-through-a-relay.md)).

Candidate capture stops the container, confirms the stop and snapshots the host directory. The container is removed on disposal; the session directory is retained like the local backend's. Reproduce the no-inference qualification against your image with:

```sh
node scripts/probe-docker.mjs unfold-agent:1.19.5
```

The probe serves a fixture repository to the container, verifies the hardened container configuration, authenticated health, managed configuration, adapter session creation, the event stream, abort, candidate capture and container removal, and records that zero inference requests reached its sink.

## Kubernetes

Deployment assets live under `ops/helm/unfold`, and its [README](../../ops/helm/unfold/README.md) lists what an install needs. The application Dockerfile and `ops/agent/Dockerfile` build separate control-plane and agent images. The chart defaults to the public release images on `ghcr.io`; to use your own builds, publish them to an authorized registry and configure explicit image tags or digests in values. The supplied configuration is an example, not the user's actual cluster inventory.

Validate manifests before installation:

```sh
helm lint ops/helm/unfold
helm template unfold ops/helm/unfold > /tmp/unfold-rendered.yaml
```

The chart defaults to **demo** mode. Copy `ops/helm/unfold/values.live.example.yaml` to a private `values.live.local.yaml` and replace its example forge, gateway/model, network selectors and the Ploeg settings under `ploeg:`, which configure the Ploeg release the chart carries ([chart README](../../ops/helm/unfold/README.md#ploeg)). Leave the images alone: a published chart already names each by its released digest. Configure `credentialsSecret` in the application namespace with the environment variables listed above. Put Unfold's Ploeg consumer token there under the name `config.ploeg.tokenEnv` gives; the gateway master key belongs to Ploeg, not to Unfold or the workspace namespace. To give a credential its own Secret, and so its own RBAC and rotation, name it in `credentialRefs` (`{ENV_NAME: {name, key}}`), or let `externalSecrets` render an ExternalSecret per credential from a SecretStore or ClusterSecretStore; either wins over the same name in `credentialsSecret`, which stays mounted. Keeping the verifier token apart from the operator token this way is what makes the verifier's separate Ploeg consumer worth having. In live mode the chart refuses a store key on the data volume while `storeKey.allowFileOnDataVolume` is `false`: set `storeKey.existingSecret` or `externalSecrets.storeKey` ([The store key](storage.md#the-store-key)). The [chart README](../../ops/helm/unfold/README.md#secrets-and-the-store-key) lists every value. Configure `workspaceGitSecretName` only when a dedicated repository read credential has been provisioned there. `workspaceUserNamespaces` maps the workspace pod into its own user namespace (`hostUsers: false`), so the container's root is an unprivileged uid on the node; user namespaces are generally available from Kubernetes 1.36 and the cluster's container runtime must support them, so it is opt-in and refused together with the sandbox provisioner, where the guest kernel already provides that boundary. `workspacePodRuntimeClassName` puts the pod provisioner's agent and export pods under a RuntimeClass, such as `kata` or `gvisor`, so each runs behind a sandbox runtime ([Run agent code in a sandbox runtime](../../../../docs/how-to/run-agent-code-in-a-sandbox-runtime.md)); it is refused together with `workspaceUserNamespaces` for the same reason. In live mode the chart refuses to render while the provisioner's RuntimeClass is empty, so a pod-provisioner install either names one or sets `workspaceAllowUnsandboxed: true`, which user namespaces without a sandbox runtime also need; the install notes then warn that workspaces run on the node's kernel. `workspaceAgentSecrets` lists Secrets in the workspace namespace whose keys become environment inside the agent container only, never the clone container; an External Secret from OpenBao is the intended way to let an agent pod reach something beyond the repository and the gateway. The chart refuses to render when `workspaceAgentSecrets` lists `credentialsSecret`; the delivery verifier and publisher tokens live only in the application namespace's credentials Secret or a dedicated Secret there. Candidate delivery in the cluster uses the Kubernetes verifier: set `delivery.enabled`, the policies, the inputs volume, `delivery.verifier.image` and, for publication, `delivery.publisher.existingSecret`; the [chart README](../../ops/helm/unfold/README.md#candidate-delivery) lists the values and the [delivery contract](../contracts/candidate-delivery.md#kubernetes-verifier) how each check pod is isolated. Register `unfold-kubernetes-v1` as the verifier ID in Ploeg's delivery policy. The chart's deny-all NetworkPolicy only isolates check pods where the network plugin enforces NetworkPolicy; the verifier probes from inside every check pod and fails the check as `network_reachable` when it is not enforced.

Use **one application replica** with persistent storage and the chart's `Recreate` rollout strategy. Configure a separate workspace namespace, storage class/size, CPU/memory limits (`workspaceCpu`, `workspaceMemory`) and what each workspace reserves (`workspaceCpuRequest`, `workspaceMemoryRequest`, the limits when empty; see [workspace size](../../ops/helm/unfold/README.md#workspace-size)), an agent image and an inference gateway URL reachable by agent Pods. The control plane needs the chart's narrowly scoped workspace-management RBAC. Agent Pods must not mount the control-plane service account or LiteLLM master credential.

With one replica and `Recreate`, every second of a restart is downtime, so the chart keeps it short. The startup probe checks `/healthz` every second for up to 60 seconds, and the readiness probe checks `/readyz` every second, so the pod receives traffic about a second after the server listens instead of up to ten. On `SIGTERM` the server marks running sessions interrupted, or leaves reattachable ones to reconnect, then closes; when closing takes longer than 10 seconds it logs `server.shutdown_deadline` and exits with status 1. The pod's `terminationGracePeriodSeconds` is 20, which leaves room for that deadline. There is no `preStop` sleep: it exists to let another pod take over the traffic, and with one replica there is none. Idle HTTP keep-alive connections stay open for 75 seconds (Node's default is 5), so the proxy in front of the workbench is less likely to reuse a connection Node is closing; a proxy whose upstream idle timeout is shorter than 75 seconds avoids that race entirely. Each start logs `server.ready` with `bootMs`, the milliseconds from process start to listening, and `recoveredSessions`, the sessions it reconnected or stopped after the restart.

Unfold asks the connected Ploeg which contract majors it serves (`GET /api/v1/operator/version`) at start and every minute. When Ploeg does not serve one Unfold requires, Unfold logs `ploeg.contract_incompatible` once with both versions and pauses managed actions: every call to Ploeg is refused before it is sent with 503 `ploeg_contract_incompatible`, and every page shows a banner saying Ploeg's version does not match. Unfold stays ready, so the pages and Unfold's own data stay reachable while you fix the pair; read the state from `ploegContract` on `/healthz` or `GET /api/status`. Running shared executions miss their heartbeats meanwhile and are interrupted when the Ploeg lease runs out, as on any loss of Ploeg authority. A Ploeg that cannot be reached keeps the last answer and logs `ploeg.version_unreadable`, because an outage is not an incompatibility. A Ploeg without the route predates it and counts as serving major 1 of every contract. An Unfold release supports the Ploeg it carries and the Ploeg minor before it ([system ADR-0044](../../../../docs/adr/adr-0044-unfold-refuses-a-ploeg-that-does-not-serve-the-contract-majors-it-requires.md)): deploy Ploeg and Unfold from one Unfold release, which the chart does by default.

The chart mounts the application volume at `/data` and stores application state in `/data/workbench`. The non-root process creates that private subdirectory with mode `0700`; it does not change permissions on the storage driver's volume root. Back up the entire application directory, including `unfold.sqlite`, its `unfold.sqlite.key` encryption key and retained evidence. When upgrading an existing deployment that stored state directly in `/data`, stop the application and move its complete state into `/data/workbench` with ownership matching the chart's application UID before starting the new version. An empty application directory initializes a new instance; the chart does not migrate existing state automatically.

Review the live render with the deployment's own values:

```sh
helm lint ops/helm/unfold -f values.live.local.yaml
helm template unfold ops/helm/unfold --namespace unfold -f values.live.local.yaml > /tmp/unfold-live.yaml
```

After preparing images, namespace policy, persistent storage and Secret references, render the configuration for review. Apply desired state through the deployment repository's GitOps reconciliation:

```sh
mise exec -- helm template unfold ops/helm/unfold --namespace unfold -f values.live.local.yaml
```

The manager provisions real Kubernetes resources through the API. It retains workspace PVCs after runtime disposal so changes and native state can survive. Once an hour the workbench deletes the PVC of each finished session that has not changed for `workspaceRetentionDays` (default 7; `0` keeps every volume), first removing its pod and the pod's Secret, Service and NetworkPolicy, and records `workspace.volume_released` on the session. It keeps the volume while the session can still run or resume, while its stop or its spend is unresolved, and while a writing Run's change has not been captured, because recovery captures from the workspace. A captured candidate lives in the workbench's data directory, so reviewing, accepting and publishing it never need the volume. A cluster whose admission policy refuses to delete an unannotated PVC can list the annotations the sweep sets on the claim just before deleting it in `workspaceVolumeDeleteAnnotations`; it is empty by default, and the annotation is then the deliberate, logged decision that policy asks for. Only the pod provisioner's PVCs are released; the sandbox provisioner's claims belong to the agent-sandbox controller. Configure `workspaceEgress` for the actual forge and inference gateway; example selectors are not universal access rules. When repository URLs name the forge's public host, set `workspaceGitRewrites` so the clone and agent containers fetch from the forge's in-cluster Service instead, and leave the ingress gateway out of `workspaceEgress`: a gateway serves every application behind it, not only the forge ([ADR 0052](../adrs/0052-agent-workspaces-reach-the-forge-in-cluster-never-through-a-gateway.md)). Kubernetes network isolation depends on the cluster's network-policy implementation, so chart rendering cannot prove enforcement.

The API client sets the byte length of every serialized JSON request, including Pod deletion options, so a subsequent request can reuse the connection safely. A missing Pod remains an allowed cleanup result. The [HTTP framing regression](../../test/runtime-kubernetes.test.ts) checks a DELETE body containing non-ASCII text followed by a GET on the same connection and retains the allowed-404 behavior.

`workspaceTransport: pull` (the chart default) makes agent pods dial out to the workbench Service instead of receiving a Service and an ingress rule; `workspaceRelayUrl` overrides the address the pods use. Candidates are then captured in place through the relay, without an export pod. `workspaceProvisioner: sandbox` switches from hand-rolled pods to the agent-sandbox CRDs: a `Sandbox` per session under `workspaceRuntimeClassName` (default `kata`), or, with `workspaceWarmPool` set, a `SandboxClaim` against a warm pool whose pods receive their session over the relay. The controller, the template and the pool token are cluster concerns described in [ops/cluster/agent-sandbox](../../ops/cluster/agent-sandbox/README.md) and [ADR 0013](../adrs/0013-sandbox-crd-placement-with-warm-kata-pools.md); a warm pod proves itself with a projected service account token (audience `unfold-relay`) that the workbench checks by TokenReview, so no pool secret is shared; the chart grants `tokenreviews` `create` only when `workspaceWarmPool` is set.

With the pull transport and the `pod` provisioner, a session Ploeg executes keeps running while the workbench restarts, for example on a redeploy ([ADR 0051](../adrs/0051-a-running-session-survives-a-workbench-restart.md)). The restarted workbench reads the workspace's OpenCode credentials back from the workspace Secret, so it needs `get` on Secrets in the workspace namespace, which provisioning already uses, and waits `runtime.reconnectGraceMs` (default 300000 ms, at most what the Ploeg lease leaves) for the worker to poll again. The worker in the agent image retries an unreachable workbench indefinitely and a refused poll for `UNFOLD_RELAY_REFUSAL_GRACE_MS`; both behaviours need an agent image built from this version, so a `workspaceImage` override must move with the workbench; the published chart's `workspaceAgentImage` already does. A session whose workspace does not reconnect in time is interrupted, as every restart interrupted sessions before.

The in-cluster workbench is the supported way to use the Kubernetes backend. A workbench on a workstation cannot drive a pod through the API server's service proxy, because the API server strips the `Authorization` header that OpenCode's Basic authentication needs; a port-forward transport under the operator's own identity is the identified next step and is not implemented. The estate's `agent-runner` image is Ploeg's unattended OpenHands body and contains no OpenCode server, so it is not a workspace image for Unfold; publish `ops/agent/Dockerfile` as its `opencode-runner` sibling instead.

Before a team rollout, qualify Pod startup/readiness, repository cloning, model requests, interruption, permission handling, restart recovery, spend settlement and resource cleanup on the target cluster. Record the tested image digests, Kubernetes version, gateway version and result in [validation](../validation.md). No automated chart command deploys this application.

## Another harness through the command bridge

Set `runtime.kind` to `command`, `backend` to `local`, and `command` to an administrator-controlled argv array such as `["/opt/company-agent/runner"]`. This process runs in the session checkout on the Unfold server. It is not executed through a shell, and operators cannot supply arbitrary executable paths through the session form.

The bridge sends a versioned `start` JSON line on stdin, forwards human responses, and expects normalized event lines plus one terminal result and exit code zero. Cancellation sends a cancel line before process termination. The exact protocol and exercised adapter evidence are in [agent API research](../research/agent-apis.md). An OpenHands SDK wrapper can implement this seam; the existence of the seam does not mean every harness or SDK version has been tested.

## Routine intervention and recovery

- To steer a running role, pause, record the instruction and explicitly resume. Preserve the original objective history and authorization.
- If a reviewer requests changes or gives no conclusive approval, inspect the findings and decide the next task. There is no automatic unlimited review loop.
- If the server restarts, active sessions become interrupted. Inspect retained changes, resolve uncertain spend and explicitly resume. Do not create a replacement session to bypass accounting.
- An attached Agents window resumes on its own after a restart: the workbench remembers it, gives it fresh snapshots and keeps which windows were active in each session. Nothing it saw before the restart is replayed out of order ([API contract](../contracts/api.md)).
- When a session stops unexpectedly, is interrupted, needs reconciliation or says "Execution authority lost", start from evidence, not from the message: "authority lost" only says Unfold stopped trusting its Ploeg binding, not which side failed. `python3 .agents/skills/investigate-session/scripts/investigate.py <session-id-prefix>` lines up Unfold's events, Ploeg's execution revisions, heartbeat gaps, restarts, probe failures, logs and resource use for the stop window, read-only, and the [skill](../../../../.agents/skills/investigate-session/SKILL.md) matches the result against known failure classes.
- To add budget, an administrator authorizes a positive increment within the total configured limit. Active spending may need to be paused and reconciled first.
- Back up SQLite consistently using a SQLite-aware snapshot or by stopping the single server before copying the database and associated files. Preserve retained workspace/PVC evidence separately and test restore before relying on it.

Subscription authentication is not provided by this managed path. If a harness later supports an upstream-approved personal subscription flow, it still needs separate visible identity/quota semantics; it does not become a pool of LiteLLM API credit. Use API-backed gateway credentials for the currently implemented managed model budget.

## Attaching VS Code as an agent host client

The workbench serves the Agent Host Protocol on its own port. With the Unfold extension, attaching takes one step: sign in with **Unfold: Connect to Workbench**, and Unfold appears in VS Code's Agents window within seconds, without a reload. The extension adds an entry for the workbench to `chat.remoteAgentHosts` in the default profile's user `settings.json`, because that setting is application-scoped and the Agents window reads it from there whichever profile a window uses. VS Code 1.141 registers the setting only in the Agents window, so an editor window cannot write it through the configuration API. The extension edits the file instead, keeping comments, other settings and indentation, and replaces it in one atomic rename. Where the setting is registered, the extension uses the configuration API instead. **Unfold: Connect VS Code Agents Window** does the same on demand and offers to open the Agents window. Running it again changes nothing when the entry and its token are still good. The entry is named `Unfold`; when the file holds entries for more than one workbench, each is named `Unfold (<host>)`, and a name the person changed is kept.

The connection token sits in that setting in plain text, because VS Code 1.144 reads it only from there. `chat.remoteAgentHosts` is application-scoped without `ignoreSync`, so Settings Sync would upload it. Before the extension writes a token there, it adds `chat.remoteAgentHosts` to `settingsSync.ignoredSettings`, which is application-scoped too and lives in the same file; the line stays after sign-out. The extension also keeps a copy in VS Code's SecretStorage and reuses it while the workbench still accepts it and the entry was never synced. It mints a new one when the workbench has rejected the old one, or when the old one sat in `chat.remoteAgentHosts` before the ignore was there, and revokes the token it replaced. If `settings.json` cannot be parsed or written, the extension changes nothing, mints nothing, and offers **Copy address**. Set `unfold.agentHost.autoConnect` to `false` to stop the automatic step. A signed-in editor that is missing its entry is attached again when the extension starts. After attaching, the extension checks every 20 seconds whether an Agents window is connected with its token, through the `attached` list of `GET /api/agent-host`. The status bar shows **Unfold · Agents window ✓** or **Unfold · Agents window not connected**; clicking it offers to open the Agents window, reconnect, or [troubleshoot](#troubleshooting-the-agents-window).

From the browser, **Connect VS Code** on **Settings › Signed-in editors** (also in the account menu) opens `vscode://webgrip.unfold/connect-agents-window?origin=<workbench>`. The extension adds the entry for that workbench, signing in first if it has to, and offers **Open Agents Window**; a link for another workbench than the one the extension uses asks before switching. Without the extension, the same card links the extension in VS Code's Extensions view and on Open VSX, and **Copy address** mints a token only when clicked and copies `wss://…/?tkn=…` for **Sessions: Add Remote Agent Host…**.

Without the extension, or as a fallback, add the host by hand. Create a personal connection token:

```sh
curl -sS -X POST -H 'X-Unfold-Request: 1' -H 'Content-Type: application/json' -b "$COOKIE" \
  http://127.0.0.1:4080/api/agent-host/tokens -d '{"label":"laptop"}'
```

The response contains `address` and a ready-made `vscodeSetting.entry` with the token. In the Agents window, run **Sessions: Add Remote Agent Host…** and paste the address with the token as a `tkn` query parameter, for example `wss://unfold.example.com/?tkn=<token>`. You can also add the entry to `chat.remoteAgentHosts` in your user `settings.json` yourself.

Sessions appear in VS Code's agent sessions list, grouped under **Unfold · <repository> [Unfold]**, where the part in brackets is the entry's name. To start one from the Unfold extension, run **Unfold: Start a Session in the Agents Window** (the first button on its Now and Sessions views): it opens the Agents window on a new session with the repository's folder chosen, using the folder paths `GET /api/agent-host` lists under `folders`. By hand, choose **New**, open the composer's **Workspace ▾** picker, choose **Folders (Unfold)** and pick the repository's folder, named after its forge path (for example `twente.dev`); the workbench offers its configured repositories there as folders. The composer then shows the repository you picked, read-only, with pickers for Team, budget and, when more than one backend is enabled, placement; the approvals picker offers automatic approval only for a container or pod, also when your organisation's policy (`ChatDefaultConfiguration`) makes it the default. A session started without a repository folder, such as a quick chat or a Compare Models comparison, is refused with how to pick one, and nothing runs. VS Code remembers your last choices for the next session. The model shown in the composer is the Team, `Ploeg team · <team>`; each Team's entry in the picker names the model every role runs on. The first message starts the Team. Every other client attached with a token of the same user sees the same session. Tokens are bound to the user who created them and honour the same ownership rules as the HTTP API. A token expires after `auth.sessionHours` without use; each connection or message renews it, but never past the absolute expiry of the browser login or editor credential that issued it, and a token no sign-in issued does not renew at all. Signing out, or the end of the sign-in session that issued it, revokes it and closes its open connections. `DELETE /api/agent-host/tokens/<id>` revokes one token, where `<id>` is the token's SHA-256 digest. When you sign out, the extension revokes its token, removes the entry it wrote and leaves entries it did not issue. When it replaces a token the workbench rejected, it revokes the old one too ([ADR 0012](../adrs/0012-agent-host-protocol-host.md)). Marking a session read or done in VS Code's Agents window is kept per person and changes nothing about the session itself, and a ready candidate appears in the Changes view with **Accept**, **Request changes…** and **Reject…** while its review is open. Reject and Request changes ask for your message in the session's chat. Request changes turns your message and your comments on the candidate's files into the instruction of a new session with the same brief, which waits for you to start it. Comments you add in the Changes view's diff editor are kept with the session; **Submit** opens Request changes with them. Merging still happens on the forge, never from the editor. A command the Team runs shows as a terminal on its tool call. The terminal is read-only: it shows the command line and the recorded output with secrets and escape sequences removed, and the exit code when the runtime reported one. Typing into it, resizing it or opening a new terminal on the Unfold host is refused. A failed session shows VS Code's **Try Again**, which creates a new session with the same brief and budget that waits for you to start it; it never runs on its own. Yes/no questions show Yes and No, skipping or closing a question tells the Team you declined to answer, and spend appears in the chat at the end of each Run and when it passes half, four fifths and all of the budget. Each Role's Run shows in the chat as a subagent: expand it to follow the Run's tool calls with their input and output, or open it to read the Run's own chat. A write Run's file diff and the captured candidate appear as edited files whose diff opens on click.

The Unfold extension in [extensions/vscode](../../extensions/vscode/README.md) is the other way in, and it now mirrors what the browser shows for a 0.3.0 server: the same run labels (implementation, analysis, independent review), the brief each role received, tool input and error text in the Activity tab, a Gateway tab with the gateway's per-request attribution, the spend observed at the gateway with the cost curve, transcripts, the approval switch for `docker` and `kubernetes` sessions, and GitLab linking through **Unfold: Linked Accounts**. Both clients read the same API and event stream, so a session opened in one is the same session in the other.

### Automations in the Agents window

VS Code's **Automations** view, in the Customizations sidebar, lists Unfold's tracker routes when the workbench has a live Ploeg connection and a Vikunja board whose task source sets `executionOwner: "ploeg"`. Each card reads `<board> → <team>`: assigning that team's tracker user to a task on the board makes Ploeg queue a Work Item, which Ploeg authorizes, budgets and runs. A paused team's card shows as disabled. The cards show as manual and have no **Run now**, **Edit** or **Delete**, and **New Automation** is unavailable for the Unfold host. An automation created in VS Code would start budgeted work on a schedule without Ploeg's authorization, so the host refuses it ([ADR 0012](../adrs/0012-agent-host-protocol-host.md#update-2026-10-10-automations)). To start tracker work, hand the task over from the Tasks page or assign it in Vikunja. The view needs `chat.automations.enabled`, which is on by default.

### Troubleshooting the Agents window

When the status bar says **not connected**, open the Agents window: it connects when it opens, and the status catches up within 20 seconds. If it still does not connect, check these in order:

1. In the Agents window, open the Output panel and choose the **Agent Host** channel. A `403` on the WebSocket upgrade means the workbench rejected the token: run **Unfold: Connect VS Code Agents Window**, which replaces a rejected token.
2. Open the user `settings.json` and look for the `chat.remoteAgentHosts` entry with your workbench's address. If it is missing, `unfold.agentHost.autoConnect` may be `false`, or the file could not be parsed.
3. Without a GitHub account, the Agents window asks for GitHub sign-in before it shows anything. VS Code decides that, not Unfold ([sign-in spike](../research/2026-10-10-ahp-sign-in-spike.md)).
4. A workbench behind a proxy must pass WebSocket upgrades on `/` or `/ahp`, with the `Origin` header unchanged.
5. With `auth.agentHostOriginMode` set to `enforce`, a `403` with `agent_host.origin_refused` in the workbench log means the page the client runs in is not an allowed origin; see [Who may open the WebSocket](#who-may-open-the-websocket).

### Who may open the WebSocket

The upgrade carries the connection token in an `Authorization: Bearer <token>` header or in the `tkn` query parameter. VS Code 1.144's Agents window sends only `?tkn=`, because a browser WebSocket cannot set headers, so the query form stays supported. The first time a token arrives in the query, the workbench logs `agent_host.token_in_query` with the first 12 hex digits of its digest and the client's user agent, never the token. A query token can end up in the access log of every proxy and ingress in front of the workbench: configure them to log the path without the query string, or to drop the `tkn` parameter, on `/` and `/ahp`.

A request from a web page names that page in `Origin`. The allowed origins are `vscode-file://vscode-app`, the page origin VS Code's desktop Agents window loads from, and the workbench's own `baseUrl` origin. A request without `Origin` comes from a client that is not a web page and is accepted on its token. `auth.agentHostOrigins` replaces the default list, for example to add VS Code for the Web. Each entry is `scheme://host[:port]`; `"*"` accepts any page. In Kubernetes set both keys under the chart's `config.auth`.

`auth.agentHostOriginMode` decides what happens to any other origin:

| Mode | An origin outside the list |
| --- | --- |
| `report` (default) | Connects on its token. The workbench logs `agent_host.origin_unlisted` with the origin, once per origin per hour |
| `enforce` | Gets `403` and an `agent_host.origin_refused` log line |

Every connection still needs a valid token in either mode. To switch to `enforce`:

1. Leave the mode at `report` and connect an Agents window from each kind of client people use: desktop VS Code, Insiders and, if anyone uses it, VS Code for the Web.
2. Search the workbench log for `agent_host.origin_unlisted`. No lines means every client's origin is already allowed. Each line names an origin that would be refused.
3. Add every origin that belongs to a real client to `auth.agentHostOrigins`, keeping `vscode-file://vscode-app` in the list. An origin you do not recognise is the reason to enforce, so leave it out.
4. Set the mode and restart:

    ```json
    "auth": { "agentHostOrigins": ["vscode-file://vscode-app", "https://vscode.dev"], "agentHostOriginMode": "enforce" }
    ```

5. Watch for `agent_host.origin_refused`. A refused real client is fixed by adding its origin, or by setting the mode back to `report`.

## Ploeg's MCP server in VS Code

When Ploeg serves `ploeg-mcp` over HTTPS ([Ploeg's guide](../../../ploeg/docs/how-to/serve-ploeg-mcp-over-https.md)), set `UNFOLD_PLOEG_MCP_URL` and `UNFOLD_PLOEG_MCP_CLIENT_ID`, or the chart's `ploegMcp.url` and `ploegMcp.clientId` ([chart README](../../ops/helm/unfold/README.md#the-ploeg-mcp-server-for-editors)). Both are public values, so they belong in plain configuration, not in a Secret. `GET /api/mcp-servers` then names the server to every signed-in person ([API contract](../contracts/api.md#mcp-servers-for-editors)). The VS Code extension provides it to chat by URL, and VS Code signs the person in through the browser ([extension README](../../extensions/vscode/README.md#use-ploegs-tools-in-vs-code-chat)). On the homelab the values would be `https://mcp-ploeg.webgrip.dev/mcp` and `ploeg-mcp`; the desired state for that lives in `webgrip/homelab-cluster`, not here.

The identity provider's client must allow VS Code's redirect URIs, `http://127.0.0.1:33418` and `https://vscode.dev/redirect`. Unfold never sees the person's Ploeg token.

## Verifying a candidate

Every ready candidate ships a signed provenance statement and an Agent Trace record. Download all five formats and the public key, then verify offline:

```sh
node scripts/verify-candidate.mjs ./candidate unfold-attestation.pub
cosign verify-blob-attestation --key unfold-attestation.pub --signature candidate.attestation.json \
  --type https://webgrip.dev/attestations/agent-candidate/v1 --insecure-ignore-tlog manifest.json
```

The script recomputes the bundle, patch and manifest digests, checks both DSSE signatures against the key and confirms the attested commit matches the manifest. The key is generated on first use in the data directory; back it up with the database and treat its loss as a re-keying event ([ADR 0014](../adrs/0014-signed-candidates.md)).
