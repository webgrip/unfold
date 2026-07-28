# Published contracts

The versioned, machine-readable seams of Ploeg (backlog #59). Go types in
`pkg/harness` are pinned to these schemas by `pkg/harness/contract_test.go`;
change either side and the test tells you.

| File | Contract |
|---|---|
| [taskspec.v1.schema.json](taskspec.v1.schema.json) | Harness input: what a run knows (work item, repo, branch, trace id). Credentials never travel here (R8). |
| [outcomereport.v1.schema.json](outcomereport.v1.schema.json) | Harness output and the body of `POST /api/v1/runs/{token}/outcome`. Stuck requires a reason (R4). |
| [checkpoint.v1.schema.json](checkpoint.v1.schema.json) | The durable progress record (shared by TaskSpec, OutcomeReport, and the checkpoint endpoint). |
| [run-api.v1.schema.json](run-api.v1.schema.json) | All run-API message bodies (claim/renew/checkpoint/outcome/queue-depth). |
| [executor.md](executor.md) | The executor SPI: what any launcher (KEDA, CronJob, agent-sandbox, a human with curl) must and must not do. |

## Versioning policy

- **v1 is frozen.** Additive *optional* fields are allowed (with a schema
  update in the same commit); renames, removals, type changes, or new
  required fields are v2 — a new schema file and explicit adapter
  negotiation, not an edit.
- Consumers must ignore unknown fields (Go's default decoding already does).
- The outcome enum is owned by `pkg/work/types.go`; the schema mirrors it.
  `usage` (tokens/cost/sessionId) is reserved space for backlog #66/#70.
