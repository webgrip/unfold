# Tracker imports under Ploeg authority

This contract extends [shared execution](ploeg-execution.md). Architecture ratification remains proposed in [ADR 0018](../adrs/0018-bind-tracker-imports-to-existing-ploeg-work.md).

## Registered source and target

An administrator adds `ploeg: { target: { forge, owner, repo, baseBranch } }` to a Vikunja or ClickUp task source with `executionOwner: "ploeg"`. The source's existing `provider`, normalized `baseUrl` and `project` identify Ploeg's configured singleton provider and native project or home List. Ploeg checks the API root by equality to its configuration; it never requests a client-supplied URL. The registered target must match the Ploeg Work Target and the De Vloer repository URL and base branch. Credentials remain server-side environment references or the session owner's linked account.

Unmapped sources remain readable where their existing permissions allow it. Import into shared execution fails closed. Forgejo, GitHub and GitLab remain available for standalone imports; they are not Ploeg tracker adapters in this milestone.

## Preview and import

`TaskSnapshot.revision` remains a SHA-256 hash of the normalized preview. `nativeRevision` retains the provider's original revision string, and `scope` records the verified native container. These values are not interchangeable.

Ploeg lookup uses `GET /api/v1/operator/work-items/lookup?provider=...&externalId=...&scope=...&baseUrl=...`. A successful response contains `item` and a `source` pin: `workItemId`, `provider`, `externalId`, `expectedBaseUrl`, `expectedScope`, `expectedRevision`, `expectedUpdatedAt` and `expectedTarget`. All Work Item IDs remain strings. Lookup refreshes authoritative source facts and requires an existing eligible mirror; it does not ingest, reassign, requeue or create work.

The task browser shows the linked Work Item and exact repository target. `bindingRevision` hashes the server-derived source pin and accompanies the import request, independently from `revision`. Import refetches the task with the authenticated owner's source access and compares both accepted hashes. It stores the source pin beside the queued session. Same-owner imports of the same task revision return the existing session. Another owner's session produces a generic conflict without its ID, name, content or execution details; authenticated administrators retain their existing session inspection rights.

## Start and replay

Before first admission, De Vloer refetches the original source as the session owner, checks the content hash, native ID, open status, container and native revision, repeats the Ploeg lookup and compares the pinned Work Item revision, update timestamp and target. Configuration changes cannot silently retarget a retained draft. An acting administrator does not replace the owner's linked credential.

Ploeg admission receives the pin as optional `source` on the existing execution registration. It validates current source and target facts and atomically claims only queued pristine work, including a wholly pending Shift if Ploeg permits it. Work with execution history, an active claim or unresolved accounting is rejected. The tracker owns priority and content. Import never calls an ingestion operation that resets attempts or requeues finished work.

The first admission payload is persisted before transmission. If its result is uncertain, retries send the same payload and session identity. They do not create another Work Item or silently refresh the mandate. Existing admitted executions retain their pause, resume, cancellation, restart and generation rules from the shared execution contract. A stale unstarted draft must be explicitly cancelled before importing a newly reviewed source pin; shared import deduplication includes the binding revision so unchanged task text cannot trap a cancelled draft on an obsolete Ploeg row version.

## Evidence

Source and binding details remain attached to the owner's retained session and are included in signed candidate provenance. Candidate capture and review use the existing evidence workflow. Binding a tracker item neither publishes a candidate nor transfers another execution's native harness state.

The provider adapter removes the actual resolved tracker credential from title and description before calculating a snapshot hash. Credential-bearing URLs, native revisions and other opaque identity fields are rejected with a generic safe error. This includes per-user linked credentials, which are not part of the deployment-wide secret list. The [owner-linked regression](../../test/task-binding.test.ts) covers preview, persisted session, objective and admission.
