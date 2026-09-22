# Governed candidate delivery

This is an opt-in implementation for one completed [Ploeg execution](ploeg-execution.md). [ADR 0019](../adrs/0019-verify-canonical-candidates-outside-agent-workspaces.md) records the decision; [the qualification evidence](../research/evidence/delivery-2026-09-11/docker-verification.json) records the measured scope.

## Authority and identity

The ordinary workbench consumer may read its execution and request human approval. A distinct server credential, explicitly granted `verify` by Ploeg, registers the canonical Delivery Candidate and Verification Receipt. That credential is never put in a workspace environment. Ploeg independently registers the repository, policy SHA-256, verifier identity and minimum test count. A consumer cannot choose a weaker policy in an HTTP request.

Ploeg binds the candidate to its existing Work Item, execution and generation, the registered repository URL, approved base SHA, canonical commit SHA, tree SHA, manifest SHA-256 and policy SHA-256. Candidate admission requires completed execution and confirmed stop. The existing unique execution binding freezes ownership; there is no implicit successor attempt or automatic handback.

## Canonical Git artifact

The capture export has synthetic history. The controller imports an operator-provided approved base bundle and the captured bundle into a fresh bare repository with hooks, global configuration, external diff drivers and network protocols disabled. It verifies Git objects, the synthetic parent, both trees, exact binary patch, manifest file entries and protected paths. Regular files and executable file modes are supported; symlinks, submodules and oversized trees are blocked in this initial delivery lane.

It creates one deterministic commit whose parent is the actual approved base SHA. Its message binds the manifest and policy hashes. Verification and approval refer to this exact commit; the canonical download contains that commit and real ancestry. Nothing checks one commit and silently reconstructs another for publication.

The original capture, trace and signed provenance remain available. Their `verification: not_performed` statement describes capture time; an independent Ploeg receipt records later verification.

## Verification policy

`delivery` configuration contains a `verifierTokenEnv`, optional Docker `socketPath`, and one policy per registered repository. Policies specify:

- `repositoryId`, `approvedBaseSha` and an absolute `approvedBaseBundle` path.
- An immutable Docker `image` content ID (`sha256:…`) or registry digest (`name@sha256:…`). The verifier never pulls implicitly.
- An absolute trusted `directory` and `files` mapping relative paths to SHA-256 values. These files and the approved bundle must be outside workbench workspace storage.
- `protectedPaths`, whose files or descendants cannot change from the approved base.
- Nonempty `checks`, each with an ID, fixed absolute executable `argv`, exact expected `stdout` and expected `exitCode`.
- A bounded `timeoutMs`, default 30 seconds per check.

The policy hash includes repository identity, base, image, trusted file digests, protected paths, checks and timeout. Local path locations are provisioning details and do not affect the hash.

Every check runs in a new nonroot container with a read-only candidate and policy mount, no network, no Linux capabilities, a read-only root filesystem, bounded resources and disposable `/tmp`. It receives no inherited workbench environment, model key, Git credential or Docker socket. The control service compares the actual Docker exit code and stdout to the fixed policy. Test count comes from these completed control-defined checks; candidate text cannot invent discovery counts. A fake success message plus a failing exit remains failure. Timeouts, missing tools, missing images, OOM and unconfirmed cleanup never pass.

The local result is persisted before receipt submission. A lost HTTP response can replay that same immutable receipt after restart. A restart while a verifier was running leaves an explicit interrupted phase; it does not silently run checks again. Failed receipts are immutable and ineligible for approval. A new candidate or policy currently requires a new explicitly admitted session; a general re-verification lifecycle is future work.

## Workbench API

All routes require the existing session's owner or administrator; mutations also require operator authority and the application CSRF header.

| Route | Behavior |
| --- | --- |
| `GET /api/sessions/{id}/delivery` | Current candidate, receipt, approval and publication state from Ploeg, plus bounded local check results. |
| `POST /api/sessions/{id}/delivery/verify` | Canonicalize, register and independently verify the completed candidate. Replay retained evidence after an uncertain receipt response. |
| `POST /api/sessions/{id}/delivery/approve` | Require the displayed `candidateId`, `receiptId` and `policySha256`; Ploeg rejects stale or mismatched approval. |
| `GET /api/sessions/{id}/delivery/download` | Download the canonical Git bundle for review. |

The session's ordinary “Accept” review is a separate historical review note. Only “Approve this commit” creates the candidate-bound delivery approval.

## Publication boundary

Ploeg implements an explicitly enabled reservation and a durable publication barrier. Its first accepted operation response grants the external effect once. Replaying the request after a lost response does not re-grant it. Positive evidence naming the exact operation, repository, canonical SHA, branch and remote proposal can reconcile an unknown result. A negative lookup never authorizes a second creation request. Demo executions cannot reserve live publication.

This workbench increment deliberately exposes verification, canonical download and approval. **It has no live publisher executor.** The UI states that publication is disabled; approval never pushes, opens a proposal, merges or deploys. A Forgejo publisher adapter, external reconciliation and deployment qualification are the next bounded implementation. The backend reservation API is an authority contract, not evidence that a publication happened.

## Reproduce

Run ordinary gates through `mise exec -- npm test`, `mise exec -- npm run check` and `mise exec -- npm run typecheck`. For an already available pinned image containing `/usr/local/bin/node`:

```sh
VLOER_VERIFIER_IMAGE='<image content ID or digest>' \
VLOER_DOCKER_SOCKET='<Docker Engine socket>' \
mise exec -- node scripts/qualify-delivery.ts
```

The [cross-service script](../../scripts/qualify-delivery-authority.ts) runs through Ploeg's opt-in Go qualification harness with real PostgreSQL and both HTTP services. [The operating guide](../../../../docs/workflows/managed-execution.md) records the complete command and current results. All fixtures are explicit; no model calls, paid spend or live forge writes are synthesized.
