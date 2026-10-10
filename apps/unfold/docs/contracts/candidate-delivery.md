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

`delivery` configuration contains a `verifierTokenEnv`, optional Docker `socketPath`, an optional `publisher` (see [Publication](#publication)), and one policy per registered repository. Policies specify:

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
| `POST /api/sessions/{id}/delivery/publish` | Require the displayed `policySha256`, optionally `candidateId` and `receiptId`. Verify and approve when missing, then reserve, push and open one pull request. Replays resume the persisted phase. |
| `GET /api/sessions/{id}/delivery/download` | Download the canonical Git bundle for review. |

[ADR 0040](../adrs/0040-accept-opens-a-pull-request-through-the-trusted-publisher-in-the-unfold-control-service.md) decides that “Accept” on a verified candidate approves that commit and opens a pull request through the trusted publisher. That is proposed behavior until the publisher ships: today the session's ordinary “Accept” review is a separate historical review note, and only “Approve this commit” creates the candidate-bound delivery approval.

## Publication boundary

Ploeg implements an explicitly enabled reservation and a durable publication barrier. Its first accepted operation response grants the external effect once. Replaying the request after a lost response does not re-grant it. Positive evidence naming the exact operation, repository, canonical SHA, branch and remote proposal can reconcile an unknown result. A negative lookup never authorizes a second creation request. Demo executions cannot reserve live publication.

[ADR 0040](../adrs/0040-accept-opens-a-pull-request-through-the-trusted-publisher-in-the-unfold-control-service.md) places a trusted publisher in this control service. It pushes the canonical commit to a new branch and opens one pull request as the Forgejo user `unfold-publisher`, whose token has `write:repository` only and never reaches a workspace. Approval alone never pushes, opens a proposal, merges or deploys. Only the publish route below performs an external effect, and merge stays human.

## Publication

`delivery.publisher` enables the trusted Forgejo publisher in the control service:

```json
{ "kind": "forgejo", "apiUrl": "https://forgejo.example/api/v1", "tokenEnv": "UNFOLD_PUBLISHER_TOKEN" }
```

`apiUrl` is the Forgejo API root over HTTPS without embedded credentials. `tokenEnv` names a server environment variable holding the publisher identity's token. Configuration is rejected when that name is listed in `runtime.agentEnvironment`, equals `ploeg.tokenEnv` or equals `verifierTokenEnv`, and when a delivery repository URL is not `https://host/owner/repository`. The token is read per call, sent only as a request header (`Authorization: token …` for the API, an `http.extraHeader` passed through the Git child's environment for the push), and never placed in a URL, argument list, event or log. The Git wrapper keeps `protocol.allow=never`; only the push and remote-ref lookups allow `https`, with redirects and credential helpers disabled.

`publicationEnabled` in the delivery view is true only when a publisher is configured and Ploeg has not refused this session's reservation. Ploeg's read API does not expose its policy's `publicationEnabled`, so a disabled Ploeg policy surfaces as a refused reservation (`publication_refused`) on the first attempt.

Identities are deterministic: operation `pub-<candidateId>` and branch `unfold/wi-<workItemId>/<candidateId[0:12]>`, falling back to `unfold/session-<sessionId>/<candidateId[0:12]>` when the Work Item identity would not form a branch Ploeg accepts.

`POST /api/sessions/{id}/delivery/publish` runs serialized per session. Each phase is persisted encrypted in the control service before its external effect:

| Phase | Next step |
| --- | --- |
| `reserving` | `POST /publication` to Ploeg with the approved candidate, receipt, approval, policy and branch. Only `201` with `effectAuthorized: true` moves to `authorized`. A `200` replay finds no local authorization: the publisher looks for positive forge evidence, and without it records `recovery_required`, reports `unknown` to Ploeg and never pushes (`publication_recovery_required`). A `409` without an operation records `refused`. |
| `authorized` | Push the exact canonical SHA to the branch with `--force-with-lease` expecting the ref to be absent. The same SHA already present counts as pushed; a different SHA records `unknown` and reports it to Ploeg (`publication_unknown`, a human decides). |
| `pushed` | `POST /repos/{owner}/{repo}/pulls`. A `409` triggers a paged lookup by head and base branch. |
| `proposed` | A positive `GET` of the pull request matched its number, head SHA, head and base branch, repository and hidden marker. Report `published` with the pull request number and URL to Ploeg using the verifier credential. |
| `published` | Terminal. |

The pull request body starts with the hidden marker `<!-- unfold-publication: pub-<candidateId> -->` and lists the Work Item, session URL, tracker link, candidate, receipt and approval identities, canonical, base and tree SHAs, policy SHA-256, verifier, approver and that merge stays human.

Reconciliation runs at startup and on each delivery view for `authorized`, `pushed`, `proposed`, `unknown` and `recovery_required` records. It uses only idempotent steps: remote-ref lookup, pull request lookup and verification, and a replayable status report. It never pushes or creates a pull request. A foreign SHA on the branch stays `unknown` until a human resolves it.

[`test/delivery-publisher.test.ts`](../../test/delivery-publisher.test.ts) exercises this against a fake Forgejo serving real pushes through `git http-backend` and a fake Ploeg: the happy path, a lost `201`, a crash after the push, a lost pull request response (`409` and paged lookup), a foreign SHA on the branch and a lost status report. Ploeg-side forge verification and cluster wiring are separate work.

## Reproduce

Run ordinary gates through `mise exec -- npm test`, `mise exec -- npm run check` and `mise exec -- npm run typecheck`. For an already available pinned image containing `/usr/local/bin/node`:

```sh
UNFOLD_VERIFIER_IMAGE='<image content ID or digest>' \
UNFOLD_DOCKER_SOCKET='<Docker Engine socket>' \
mise exec -- node scripts/qualify-delivery.ts
```

The [cross-service script](../../scripts/qualify-delivery-authority.ts) runs through Ploeg's opt-in Go qualification harness with real PostgreSQL and both HTTP services. [The operating guide](../../../../docs/workflows/managed-execution.md) records the complete command and current results. All fixtures are explicit; no model calls, paid spend or live forge writes are synthesized.
