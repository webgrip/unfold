# Published contracts

The versioned, machine-readable seams of Ploeg (backlog #59). Go types in
`pkg/harness` are pinned to these schemas by `pkg/harness/contract_test.go`;
change either side and the test tells you.

| File | Contract |
|---|---|
| [taskspec.v1.schema.json](taskspec.v1.schema.json) | Harness input: what a run knows (work item, repo, branch, trace id). Credentials never travel here (R8). |
| [outcomereport.v1.schema.json](outcomereport.v1.schema.json) | Harness output and the body of `POST /api/v1/runs/{token}/outcome`. Stuck requires a reason (R4). |
| [checkpoint.v1.schema.json](checkpoint.v1.schema.json) | The durable progress record (shared by TaskSpec, OutcomeReport, and the checkpoint endpoint). |
| [run-api.v1.schema.json](run-api.v1.schema.json) | All run-API message bodies (claim/renew/checkpoint/outcome). |
| [operator-api.v1.schema.json](operator-api.v1.schema.json) | Authenticated, team-scoped read projections of teams, work items, shifts, runs, checkpoints and snapshot audit pages. |
| [tracker-execution.md](tracker-execution.md), [v1 schema](tracker-execution.v1.schema.json) | Scoped source lookup and exclusive operator binding of an existing pristine tracker Work Item. |
| [executor.md](executor.md) | The executor SPI: what any launcher (KEDA, CronJob, agent-sandbox, a human with curl) must and must not do. |

## Versioning policy

- **v1 is frozen.** Additive *optional* fields are allowed (with a schema
  update in the same commit); renames, removals, type changes, or new
  required fields are v2 — a new schema file and explicit adapter
  negotiation, not an edit.
- Consumers must ignore unknown fields (Go's default decoding already does).
- The outcome enum is owned by `pkg/work/types.go`; the schema mirrors it.
  `usage` (tokens/cost/sessionId) is reserved space for backlog #66/#70.

## Operator read consumers

`PLOEG_OPERATOR_CONSUMERS` is a JSON array of named consumer policies. Each
entry requires `name` and `tokenEnv`; the bearer value is resolved from that
environment reference and retained as a hash. Tokens require at least 32 bytes.
An omitted `teams` grants all teams, an empty array grants none, and a populated
array restricts every resource read. `execute` defaults to false. Consumers
with execution permission may set `maxBudgetUsd` from 0.01 to 10000; the default
is 25. A read credential does not authorize execution commands.

`verify` defaults to false and grants the separate trusted delivery-verifier
operations. Configure that permission on a distinct consumer identity. The
chart forwards `operator.deliveryPolicies` as an array through
`PLOEG_OPERATOR_DELIVERY_POLICIES`; each entry pins `repositoryId`,
`policySha256`, `verifierId`, `minTests` and optional `publicationEnabled`.
Publication remains disabled when that last field is omitted. Policies and
verifier credentials stay in the controller deployment.

The token is supplied as `Authorization: Bearer …`. No consumers configured
means every operator request is refused. Consumer names and policies may live
in configuration; bearer values belong in the deployment's existing secret
provisioning path, supplied through environment references.

Read routes are `GET /api/v1/operator/teams`, `/work-items`,
`/work-items/{id}`, `/runs/{id}` and `/events`. Item/event pages accept `after`
and `limit` (default 50, maximum 200); IDs and cursors are decimal strings.
Item filters are `team`, `state` and `needsHuman=true`; event filters are
`team` and `workItemId`. Detail embeds the latest 200 records per collection
and marks truncated histories. Unknown costs remain unknown, and `paused`
is null because the current team model has no pause state.

Audit pages explicitly say `consistency: snapshot`: sequence allocation is
not transaction commit order, so clients must not treat this as a lossless
changefeed. Unbound forge events are excluded. Read projections omit worker
and gateway credentials and native harness session IDs; audit details are
allowlisted, recognizable credential patterns are redacted, and URLs omit
queries/fragments. Team authorization follows the work item's current team.
Each request has a bounded execution time and response size.

The Helm chart's `operator.consumers` entries resolve `tokenSecret: {name, key}`
into controller-only `secretKeyRef` environment variables. The generated
consumer policy references those variables. No value is embedded in Helm
configuration or inherited by a worker. See the [render fixture](../../ops/helm/ploeg/ci/operator-values.yaml)
and the [controller-isolation assertion](../../pkg/config/operator_chart_test.go).

`POST /api/v1/operator/work-items/{id}/cancel` withdraws tracker-originated
work, with the same effect as unassigning its Tracker Item. It needs `execute`
permission, `X-Ploeg-Actor` and team scope, and it takes no body. The live
Shift closes with reason `withdrawn_by_operator`, pending Runs are cancelled,
running Runs are finished and their model keys blocked, and the Work Item
becomes `withdrawn`. A repeated call returns `withdrawn: false`. An item bound
to an Operator Execution returns 409; cancel the execution instead.

Execution requests additionally require `X-Ploeg-Actor`, the stable session
owner identity asserted by the authenticated consumer. Commands may carry
`X-Ploeg-Acting-User` when an authorized administrator acts for that owner.
Ploeg validates a single bounded identity, binds it to command replay and
records it as the event actor; the execution owner remains unchanged. The
header defaults to the owner, including delegated internal executor reports.
The server overrides any `authenticatedBy` supplied in a command body.
Consumers must derive both identities from authenticated session authorization,
never forward an untrusted browser header.

Managed workers use the [worker control contract](worker-control.md); deployment and conservative accounting recovery are documented in [managed worker operations](../ops/managed-workers.md).

The [operator delivery contract](operator-delivery.md) and [versioned schema](operator-delivery.schema.json) govern canonical candidates, trusted verification, human approval and durable publication barriers for a completed Operator Execution.
