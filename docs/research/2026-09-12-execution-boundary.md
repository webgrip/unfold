# Execution boundary comparison

Date: 12 September 2026. This comparison supports the Glide migration. It does not qualify paid providers or a production deployment.

Retain the current engines. Vloer's runtime interface already serves standalone work and a crew delegated by Ploeg. Ploeg's Go worker has its own lease, capability and subprocess lifetime. The shared requirements are useful contract checks; the evidence does not justify a new common engine.

## Method

Run `mise run integration` from Glide. The [driver](../../scripts/integration.mjs) records logs and a machine-readable result under `.build/qualification`. It executes the same order-rounding fixture through two existing application paths, using deterministic runtime actions and real repository checks. It never selects a paid model.

The standalone side uses [HTTP workflow tests](../../apps/vloer/test/api-workflow.test.ts) and the [real process-crash test](../../apps/vloer/test/api-process.test.ts). Its configuration explicitly has no Ploeg connection or execution configuration. The managed side uses [Ploeg's qualification test](../../apps/ploeg/pkg/httpapi/operator_workbench_qualification_test.go), which starts real PostgreSQL and an HTTP authority and invokes [Vloer's qualification client](../../apps/vloer/scripts/qualify-ploeg.ts).

## What the comparison exercises

| Concern | Standalone Vloer | Ploeg-managed Vloer |
| --- | --- | --- |
| Admission and identity | Explicit local start of a queued session; no Ploeg service or configuration | Ploeg execution identity and one operator Run cover the Vloer crew |
| Workspace and task | Order-rounding fixture, real baseline failure, patch and passing checks | Same fixture and checks under Ploeg authority |
| Harness interface | Vloer `AgentRuntime.execute(ExecutionContext)` | The same interface, behind managed admission |
| Human intervention | Pause survives restart; resume is explicit; cancel cannot become a retry | Confirmed stop, fenced resume generation and same execution identity |
| Reconnect and restart | Durable replay and real server crash without resubmission | Client disconnect preserves background work; service-instance restart does not invoke the runtime |
| Evidence | Actual diff, check output, independent review and durable events | The same evidence plus Ploeg execution events and Work Item outcome |

Ploeg's [Task Spec and Outcome Report](../../apps/ploeg/pkg/harness/contract.go) serve unattended workers. They do not have the same lifetime as Vloer's [session and role context](../../apps/vloer/src/types.ts). Native harness session state remains opaque; a shared repository does not make it portable.

## Authority during failures

A managed execution must remain managed when Ploeg becomes unreachable. The application suites cover permission checks, ambiguous admission, heartbeat failure and interrupted recovery. No mode switch was added in this migration. The fixture comparison does not by itself prove every provider's response to network partitions; use the [managed contract](../../apps/vloer/docs/contracts/ploeg-execution.md) and its recovery tests for that boundary.

## Result and limits

Both comparison paths passed from the imported application paths. The run used zero model calls and zero model spend. The standalone fixture includes a process crash; managed restart is a service-instance restart. Neither result proves settled external billing, Kubernetes isolation, arbitrary harness portability or high-concurrency behavior.

Revisit extraction when a concrete lifecycle fix must be implemented twice, or when a local Ploeg worker needs an execution capability already implemented in Vloer. Start with that shared behavior and a compatibility test. Do not introduce a generic runner solely to make the directory structure symmetrical.

The [migration record](../migration.md) tracks repository qualification and distribution dependencies. The [original audit](../../apps/vloer/docs/research/2026-09-12-documentation-audit.md) and [second pass](../../apps/vloer/docs/research/2026-09-12-documentation-second-pass.md) retain their dated scope.
