# Run the unified workbench

For a local browser test with real Ploeg authority and PostgreSQL, run `mise run demo-unified` from Glide. The [local demonstration guide](local-demo.md) covers prerequisites, supervision, pause/resume and cleanup. It uses the actual code from both applications, a deterministic fixture and zero model calls; no cluster deployment is required.

De Vloer now combines Ploeg's work overview with an opt-in path for Ploeg-owned interactive execution. Start with the read connection, then enable shared execution for one registered repository and team. The [execution contract](../../apps/vloer/docs/contracts/ploeg-execution.md) describes ownership, recovery and remaining limits.

## Configure the services

For a cluster pilot, use an isolated Ploeg namespace and database, one registered repository/team, one concurrent workbench session and a small explicit inference budget. Start with De Vloer and its Docker workspace/verifier on the workstation. Keep unattended executors and publication disabled until this path is qualified with the actual gateway and repository.

Build from the matching prereleases. Existing Ploeg deployments must review the [managed-worker migration](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/ops/managed-workers.md): managed worker authentication is now the default and requires its control-plane credentials and policies. Pin chart and image versions in Git; let Flux reconcile the reviewed manifests.

Publishing a prerelease does not change the `latest` tag, but deployment automation can still select it. On 2026-09-11, the homelab [Renovate configuration](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/.renovaterc.json5) allowed Ploeg prereleases alongside matching patch/minor automerge rules. Review the current rules and deployment pins before a pilot release is adopted into an existing environment. The local demonstration does not modify these settings.

Use [the unified example](../../apps/vloer/config/unified.example.json) as a profile. Supply environment-specific URLs through your deployment configuration. Provision secret values through the estate's vault and existing ExternalSecret workflow; this guide contains names and references only.

1. Configure a Ploeg operator consumer with explicit team scope. Grant read access first. Grant `execute: true` and an explicit `maxBudgetUsd` when enabling execution. Ploeg's chart supports `operator.consumers[].tokenSecret` references; it mounts consumer credentials only on the controller.
2. Point De Vloer's `ploeg.url` at Ploeg's authenticated internal API, and `ploeg.tokenEnv` at that consumer's environment variable. Do not expose the operator API through the public webhook route.
3. Map actual De Vloer user IDs to teams with `ploeg.userTeams`. Unmapped non-administrators are denied. Administrators still remain inside the configured deployment and upstream consumer scope.
4. Configure `execution.team` to opt in to shared execution. Register the repository in De Vloer and set `executionOwner: "ploeg"`. This manual lane does not import a tracker item or create a duplicate assignment.
5. Configure a Ploeg managed inference policy for the team's `operator` role, including allowed model aliases, a budget ceiling and TTL. The chart exposes `executor.workerAuth.additionalLLMPolicies` for that policy. The actual key authorization is capped by the requested Run budget.
6. Supply De Vloer's inference gateway base URL and the selected workspace backend. A shared workbench does not need the LiteLLM master key. Use the existing authenticated repository-link flow for Git access.

The same consumer token must resolve in Ploeg and De Vloer. Ploeg's consumer registry is loaded at startup; rotate it through the deployment's secret lifecycle. De Vloer reads its environment value server-side, and never sends it to browsers, editor clients or agent workspaces. Provider and region restrictions must be enforced in the control-plane gateway policy for shared execution.

An example registration shape, with secret material omitted:

```json
[
  {
    "name": "de-vloer",
    "tokenEnv": "PLOEG_OPERATOR_VLOER_TOKEN",
    "teams": ["delivery"],
    "execute": true,
    "maxBudgetUsd": 1
  }
]
```

The registry is `PLOEG_OPERATOR_CONSUMERS`; the separate named environment variable contains the credential. Ploeg rejects short or malformed consumer credentials and unscoped execution details. Read access and execution access are independent. Existing unconfigured operator routes stay closed.

## Use it

Open **Ploeg** in the browser or editor tree. Choose a team and inspect work needing a human, running work, queued work or the paginated full list. Details show shifts, runs, reviewer findings, checkpoints, safe audit records and observed versus unresolved budget. Every snapshot states its limits. An unavailable API clears stale content rather than presenting it as live.

Create a session with a registered repository, a crew, a concrete objective and a budget. Start explicitly. Its header links to the Ploeg work item and shows the authority state. **Continue in background** and **Supervise here** retain the execution, workspace and history. A message becomes durable before it is accepted for the next turn. Permission and question responses continue through the existing session UI.

Close the client and reconnect: execution remains server-owned. Pause waits for runtime interruption and acknowledges it to Ploeg. Resume is explicit and advances the generation. Cancel persists intent, stops locally even if Ploeg is unreachable, and retries reconciliation without restarting work.

## Recovery

| Situation | Expected behavior |
| --- | --- |
| Start response is lost | Replay the same admission or command identity; no second Run |
| Browser disconnects | Crew continues under its existing grant; history is replayable |
| Ploeg becomes unreachable | Workbench interrupts, attempts key blocking, preserves unresolved state |
| Pause cannot confirm interruption | Resume remains blocked; capability blocking is attempted |
| De Vloer restarts | Active sessions become interrupted; no native turn starts automatically |
| Credential response is lost | Account remains issued or uncertain; another key is not minted |
| Gateway billing is delayed | Show unknown/provisional spend; retain authorization |
| Cancellation races with admission | The recorded stop supersedes launch; no workspace or paid turn starts |

Keep both stores and the workbench encryption key backed up. Restoring session JSON without the internal encrypted state cannot recover issued inference keys and must not trigger replacement issuance. Preserve native workspaces and candidate evidence during investigation. A failed shared execution needs an explicit new session after accounting reconciliation; changing a local flag must never revive it.

## Reproduce qualification

From the Glide root, the ordinary suites need no provider credentials:

```sh
mise run verify
mise exec -- npm --prefix apps/vloer run test:browser
```

The shared qualification also has a root command:

```sh
mise run integration
```

The Go test starts real PostgreSQL and Ploeg HTTP handlers, creates an ephemeral scoped consumer and launches [the workbench qualification](../../apps/vloer/scripts/qualify-ploeg.ts). That script uses the real De Vloer HTTP API and deterministic runtime: it changes a real Git fixture, executes failing and passing checks, verifies the review, detaches a stream, changes supervision, pauses, resumes, cancels, reopens the application and checks retained evidence. Its output explicitly reports zero inference calls and zero spend. This is distinct from the illustrative records in an unconnected demo workbench.

See [validation](../../apps/vloer/docs/validation.md) for the recorded result. A production pilot still needs one live scoped OpenCode run against the estate's LiteLLM/Fireworks route, actual workspace isolation, attributable metering, intervention, key blocking and cleanup. Start with one team and measure time to reviewed result and human intervention minutes before increasing concurrency.

## Planning beyond this baseline

Live publication, agent delegation and broader repair workflows require separate design and qualification. Use the [product questions](../landscape/questions.md), [research baseline](../../apps/vloer/docs/research/2026-09-10-unified-workbench-baseline.md) and [planning guide](../../apps/vloer/docs/operations/backlog.md). This operating procedure does not set implementation priority.

## Adopt an existing tracker item

The [tracker binding contract](../../apps/vloer/docs/contracts/ploeg-tracker-binding.md) extends the manual path. Register an exact source and Work Target in `taskSources[].ploeg`. The first adapters are Ploeg's configured Vikunja and ClickUp instances. Preview and import show the existing Ploeg item; Start refetches the original owner's tracker access and checks the frozen native revision, scope, routing target and Ploeg row version.

Only queued, pristine work can be adopted. Ploeg atomically retires wholly unstarted pending Runs and fences both claim paths and the KEDA scale predicate. Work with a started Run, paid authorization, durable checkpoint or live writer is rejected. The tracker retains its provider, native ID, origin, content and priority. A later webhook cannot requeue the operator-owned item, even after cancellation or completion. General ownership release and active-worker takeover remain separate work.

## Enable independent candidate checks

Follow the [candidate delivery contract](../../apps/vloer/docs/contracts/candidate-delivery.md) to register one trusted policy. Provision its approved base bundle, pinned image and policy files outside workspace storage. Add a distinct Ploeg consumer with `verify: true`, team scope and no execution permission; give only the control service its secret reference through `delivery.verifierTokenEnv`. Register the matching policy digest, `verifierId: "de-vloer-docker-v1"` and minimum fixed check count in Ploeg's `PLOEG_OPERATOR_DELIVERY_POLICIES`. Keep `publicationEnabled: false`.

Once a shared session has completed and confirmed stop, **Run independent checks** creates a canonical commit on the approved base and executes the policy in fresh Docker containers. Review its canonical bundle and check results, then **Approve this commit**. The approval and receipt live in Ploeg; the UI explicitly states that publication is disabled. The ordinary session review does not authorize publication.

From `apps/ploeg`, the optional delivery qualification is:

```sh
PLOEG_WORKBENCH_PATH=/absolute/path/to/glide/apps/vloer \
VLOER_VERIFIER_IMAGE='<existing immutable image ID or digest>' \
VLOER_DOCKER_SOCKET='<Docker Engine socket>' \
mise exec -- go test ./pkg/httpapi -run TestOperatorDeliveryWorkbenchQualification -v -count=1
```

The [recorded authority qualification](../../apps/vloer/docs/research/evidence/delivery-2026-09-11/authority-qualification.json) used real PostgreSQL, both HTTP services, Git objects, fixed checks in fresh containers, restart, receipt replay and candidate-bound approval. The [separate verifier qualification](../../apps/vloer/docs/research/evidence/delivery-2026-09-11/docker-verification.json) proves failure before the fix, success after it, and rejection of fake success output with a failing process exit. Neither submitted model inference or published to a forge.

The [tracker admission qualification](../../apps/vloer/docs/research/evidence/delivery-2026-09-11/tracker-authority-qualification.json) is independently reproducible from Ploeg with `PLOEG_WORKBENCH_PATH=/absolute/path/to/glide/apps/vloer mise exec -- go test ./pkg/httpapi -run TestOperatorTrackerWorkbenchQualification -v -count=1`. It uses a local Vikunja HTTP fixture and controlled runtime, and records the committed-admission response loss plus one retained canonical Work Item.
