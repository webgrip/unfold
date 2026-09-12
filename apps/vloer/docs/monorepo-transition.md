# Move toward one repository

Status: proposal. Vloer and Ploeg can share a repository while retaining independent applications, release versions and deployments. Local Vloer work must remain usable without a Ploeg service. A shared runner is worth testing before committing to an extraction.

## Decide what belongs together

| Concern | Owner | Reason |
| --- | --- | --- |
| Interactive sessions, prompts, intervention and review | Vloer | These follow the person's working session |
| Unattended scheduling, managed admission and organizational budgets | Ploeg | These govern work admitted to Ploeg |
| Local authorization and local execution history | Standalone Vloer | A person must be able to work without deploying Ploeg |
| Workspace preparation, harness invocation, interruption and evidence capture | Existing implementations; possible shared runner | Share only the behavior both paths actually need |
| Product language and cross-application workflows | System documentation | One source for concepts used by both applications |
| Service configuration, operations and API schemas | Producing application | A service change should update its contract and guide together |

Ploeg-free operation does not promise offline inference, repository-free chat, or a single binary. Existing standalone Vloer is the starting point. The [architecture](architecture.md), [Ploeg execution contract](contracts/ploeg-execution.md) and [workspace placement decision](adrs/0009-workspace-placement-is-a-session-choice.md) describe its current boundaries.

## Prove the runner boundary first

Compare the [Vloer engine](../src/engine.ts) and [runtime adapters](../src/runtime/) with [Ploeg's worker](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/worker/worker.go) and [harness contract](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/harness/contract.go). Use a small fixture with no paid model calls initially.

Run the same task in two ways: standalone Vloer with no Ploeg configuration or service, and an explicitly Ploeg-admitted execution. Compare start identity, workspace preparation, harness input, interruption and returned evidence. Vloer's sequential role runs and Ploeg's operator Run are different objects; preserve that mapping.

A possible contract takes an execution identity, objective, workspace specification, harness choice and bounded capabilities. It emits durable progress, requests for human input and an outcome with evidence references. Keep credentials out of the serializable task body. Avoid fixing a wire format until both paths have exposed their actual needs. TypeScript and Go may share a process protocol more naturally than a library.

The comparison must establish:

- Standalone work starts and completes while Ploeg is absent. Only its local authority authorizes another attempt.
- Ploeg-managed work retains its authority when the connection fails. A grant's validity and the configured stop policy determine what may continue; there is no automatic standalone fallback.
- Pause and cancel survive a restart. An uncertain start or unfinished stop cannot silently create another paid attempt.
- Each path preserves inspectable changes, check output and cost uncertainty. A harness assertion alone does not verify a result.

If the common behavior is small, share that part. If reconciling lifecycle differences creates more coupling than it removes, retain separate engines with compatible contracts. This comparison can succeed by rejecting the extraction.

## Assemble the monorepo separately

Choose a repository name, then rehearse the import in a disposable checkout. Preserve both histories and record old-to-new paths. A possible layout is:

```text
<repository>/
  apps/
    vloer/             application, service docs, contracts and deployment
    ploeg/             application, service docs, contracts and deployment
  docs/                shared product language, system explanation and workflows
```

Create a runner package only if the comparison justifies it. Keep each service's manifests and release train independent initially. The repository name need not rename packages, namespaces, images, services or public products.

Before switching the working repository, verify both applications' existing gates from their new paths, then update build contexts, generated-doc paths, links and agent instructions. Inspect CI path filters, release tagging and GitOps consumers. The cross-application contract checks must run when either producer or consumer changes. Keep the old repositories available until the imported trees, builds and history are verified.

## Keep documentation from drifting again

Use [the documentation policy](documentation.md): one Markdown body for people and agents, structured sources where software needs validation, and generated views for those sources. Publish a short current reading path. Keep decision history and dated evidence accessible with their scope visible. Link and generation checks belong beside the builds; a calendar review alone will not notice a renamed setting.

The [audit](research/2026-09-12-documentation-audit.md) records the first pass. Its follow-up records remaining contradictions, changes and validation. These audit records explain the cleanup; the current guides remain the place to learn the system.
