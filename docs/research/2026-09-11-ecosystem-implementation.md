# Implemented ecosystem: component inventory and interactions

This is an implementation inventory for the C4 discussion, dated 2026-09-11. It distinguishes code, deployment configuration and observed test results. It does not approve a future architecture or claim that every implemented path is qualified. The inspected revisions are [De Vloer 0.3.0-rc.14][vloer-revision], [Ploeg 0.3.0-rc.6][ploeg-revision] and [homelab configuration 8b2d069][cluster-revision].

The central fact is that **De Vloer currently contains an executor as well as the human interface**. Ploeg authorizes shared sessions, but De Vloer still creates their workspaces and executes their crew. Unattended assignments use Ploeg's separate worker path. Shared authorization therefore exists; a single shared execution implementation does not. This follows directly from [De Vloer's session engine](../../src/engine.ts), [workspace manager](../../src/runtime/workspace.ts), [Ploeg's worker][worker] and [KEDA template][scaledjob].

## C4 context: systems around the product

For this inventory, De Vloer and Ploeg are two separately deployed applications within the product being discussed. Whether the eventual C4 system boundary encloses both is a naming decision; it does not change the current network and authority boundaries below. Their separate deployments are explicit in [the workbench Helm template](../../ops/helm/de-vloer/templates/workbench.yaml) and [Ploeg's deployment template][ploeg-deployment].

| Participant or system | Current interaction | Implementation evidence |
| --- | --- | --- |
| Human developer | Uses the browser to inspect work, import a task, start a session, answer permissions, intervene and review evidence. | [Browser](../../public/app.js), [HTTP API](../../src/http.ts) |
| Editor client | Has an additional De Vloer Agent Host Protocol surface over WebSocket. It delegates to the same session engine and store; it is not another worker scheduler. | [Agent host](../../src/ahp/host.ts), [entrypoint](../../src/main.ts) |
| Task tracker | Holds task text, state, project/list and assignment. Ploeg consumes configured tracker webhooks. De Vloer reads registered sources and can bind an existing eligible Ploeg item. | [Task readers](../../src/tasks.ts), [binding client](../../src/task-binding.ts), [Ploeg source validation][operator-source], [webhook routes][ploeg-http] |
| Identity provider | Authentik supplies the configured workbench login through OIDC with PKCE. Ploeg receives a trusted consumer's assertion of the workbench actor, rather than verifying that person's Authentik token itself. | [OIDC client](../../src/oidc.ts), [Authentik blueprint][authentik], [authority client](../../src/execution-authority.ts), [Ploeg operator API][operator-api] |
| Git forge | Supplies repository contents and receives changes on the unattended path. De Vloer's ordinary candidate capture produces local evidence and downloadable Git artifacts. | [Workspace clone](../../src/runtime/kubernetes.ts), [candidate capture](../../src/candidates.ts), [worker Git operations][worker-git], [worker forge operations][worker-forge] |
| LiteLLM | Supplies model routing, scoped inference credentials and available usage records. The agent sends inference requests directly to it. Ploeg manages keys for shared execution. | [Managed workspace configuration](../../src/runtime/workspace.ts), [Ploeg LLM control][llm-control], [gateway broker][llm-broker] |
| Kubernetes | Runs the application deployments and isolated workspaces. De Vloer calls the API directly for interactive workspace resources; KEDA creates unattended Jobs from Ploeg's queue. | [Kubernetes client](../../src/runtime/kubernetes.ts), [KEDA template][scaledjob] |
| Flux, Helm and the secrets controllers | Reconcile application configuration, storage, access policies and secret references from the homelab repository. They are deployment infrastructure, rather than participants in each reasoning turn. | [Workbench Flux resources][vloer-flux], [Ploeg Flux resources][ploeg-flux], [workbench values][vloer-values], [secret references][tracker-secret] |

The current homelab model registration is `litellm/deepseek-chat`. It identifies the alias used by the applications, not a verified statement about which upstream vendor answered an individual request. That would require the gateway's routing and usage evidence. [The deployment values][vloer-values] and [managed model configuration](../../src/runtime/workspace.ts) establish this distinction.

## C4 containers: deployed processes and stores

| Container or store | What runs or persists there | Boundary to preserve in the diagram |
| --- | --- | --- |
| De Vloer browser application | Static HTML, CSS and JavaScript; authenticated HTTP requests and event consumption. | The browser is not the durable execution owner. [Browser source](../../public/app.js), [server routes](../../src/http.ts) |
| De Vloer workbench server | One Node process composes identity, HTTP, session orchestration, runtime adapters, workspace management, evidence and the optional delivery service. | These are components inside one deployed process, not separately deployed microservices. [Composition root](../../src/main.ts), [HTTP composition](../../src/http.ts) |
| De Vloer persistent volume | SQLite sessions, runs, events, permissions, users and encrypted internal records; candidate artifacts and the encryption key live under the application data directory. | SQLite uses WAL and the chart runs one replica. The chart stores application data in `/data/workbench`. [Store](../../src/store.ts), [chart](../../ops/helm/de-vloer/templates/workbench.yaml), [storage guidance](../operations/live.md#kubernetes) |
| Interactive workspace Pod | A clone init container prepares the repository. The agent container runs OpenCode; with pull transport, its relay process connects outward to the workbench. A session PVC retains repository and native state. | This Pod is created by De Vloer, not a Ploeg worker Job. [Resource construction and lifecycle](../../src/runtime/kubernetes.ts), [relay worker](../../ops/agent/relay-worker.mjs) |
| Ploeg controller | The `ploegd` Go process handles ingest, worker claims, operator execution commands, Shift evaluation, credential management and periodic recovery. | This is the authoritative backend for shared admission and spending, but it does not host the interactive harness process. [Composition root][ploegd-main], [HTTP server][ploeg-http], [sweeper][sweeper] |
| Ploeg PostgreSQL | Work Items, leases, Shifts, rounds, Runs, audit history, operator executions, LLM accounts and delivery records. | This is a different store and transaction boundary from De Vloer's SQLite. [Base store][store], [operator execution schema][execution-schema], [LLM schema][llm-schema], [delivery schema][delivery-schema] |
| KEDA controller | Reads queue counts and creates Jobs using Ploeg's rendered team/role templates. | It scales capacity; workers still claim work through Ploeg. [ScaledJob template][scaledjob], [worker claim][worker] |
| Unattended worker Job | `ploeg-worker` runs inside the configured harness image. It claims one item or role, maintains its lease, prepares Git, launches the adapter and reports its outcome. | It is a different runtime and workspace path from the interactive Pod. Kubernetes Job retries are disabled with `backoffLimit: 0`; Ploeg owns work retries. [Worker][worker], [pod template][worker-template], [ScaledJob][scaledjob] |

The checked homelab configuration selects plain Pods and pull transport for De Vloer, one concurrent session, a $0.25 session cap and Longhorn storage. It selects managed worker credentials for Ploeg and explicitly pauses bronze builder/reviewer ScaledJobs for the interactive pilot. Ploeg's configured harness default is OpenHands with Docker-in-Docker disabled. These are current deployment choices, not universal product constraints. [Workbench values][vloer-values], [Ploeg values][ploeg-values].

## C4 components inside De Vloer

| Component | Responsibility and significant connections |
| --- | --- |
| HTTP and identity | Authenticates users, checks object access and exposes sessions, task sources, permissions, candidates and delivery operations. OIDC and linked accounts have separate handlers. [HTTP](../../src/http.ts), [local identity](../../src/auth.ts), [OIDC](../../src/oidc.ts), [linked accounts](../../src/links.ts) |
| Task-source readers and binding | Reads configured tracker APIs, normalizes task snapshots and verifies a registered Ploeg target. A shared import adopts existing pristine queued work; it neither creates an assignment nor silently resets prior execution. [Readers](../../src/tasks.ts), [binding](../../src/task-binding.ts), [Ploeg adoption transaction][operator-source-store] |
| Session engine | Owns the interactive session, local crew-role sequence, human input, cancellation, artifact collection and recovery. It runs roles sequentially and supplies earlier results as evidence to later roles. [Engine](../../src/engine.ts) |
| Ploeg authority client | Persists admission and command payloads before transmission, sends actor identity, tracks revision/generation/expiry, obtains scoped inference access and confirms shared state before continuing. It replays the same uncertain command instead of inventing another execution. [Authority client](../../src/execution-authority.ts) |
| Runtime adapter | Converts a role turn into native harness operations. OpenCode uses HTTP sessions, one prompt submission, event streaming, polling, permission replies and abort. The command and demo adapters have different implementations behind the same TypeScript interface. [OpenCode](../../src/runtime/opencode.ts), [command](../../src/runtime/command.ts), [demo](../../src/runtime/demo.ts), [runtime types](../../src/types.ts) |
| Workspace manager | Selects an enabled local, Docker or Kubernetes backend and prepares the repository and scoped environment. Kubernetes provisioners have Pod and agent-sandbox implementations. These alternatives are source capabilities; the current deployment selects Pod. [Manager](../../src/runtime/workspace.ts), [Docker](../../src/runtime/docker.ts), [Pod](../../src/runtime/kubernetes.ts), [sandbox](../../src/runtime/sandbox.ts), [deployment selection][vloer-values] |
| Pull relay | Carries workbench-to-harness requests through an outbound connection from the workspace. It also supports stop/status and controlled execution operations. It does not make scheduling or spending decisions. [Server relay](../../src/runtime/relay.ts), [worker relay](../../ops/agent/relay-worker.mjs) |
| Store and event log | Persist sessions and events independently of browser connections. Sensitive internal records are encrypted using AES-GCM and a retained local key. [Store](../../src/store.ts), [event endpoints](../../src/http.ts) |
| Standalone broker | Mints, revokes and reconciles LiteLLM access only in the standalone configuration. The composition root does not instantiate it for shared execution. [Broker](../../src/broker.ts), [composition condition](../../src/main.ts) |
| Candidate and attestation components | Capture Git bundles, patches, manifests and signed provenance. Ordinary capture explicitly records verification and publication as not performed. A signature records provenance; it does not make the agent's test claims independently verified. [Candidates](../../src/candidates.ts), [attestations](../../src/attestations.ts), [canonicalizer's manifest checks](../../src/trusted-candidate.ts) |
| Optional trusted delivery service | Canonicalizes a retained candidate against an approved base and policy, runs separately configured checks in fresh Docker containers, persists the result and submits a receipt to Ploeg under a distinct verifier credential. The current workbench facade always reports publication disabled. [Delivery service](../../src/delivery.ts), [canonicalizer](../../src/trusted-candidate.ts), [verifier](../../src/delivery-verifier.ts) |

Vikunja access currently uses a server-configured token. Personal linking is implemented for GitLab and ClickUp, not Vikunja. The pilot injects the existing shared Vikunja service credential, which is also used for tracker write-backs elsewhere. The diagram should not label it a personal or read-only credential. [Account routes](../../src/http.ts), [link providers](../../src/links.ts), [source token resolution](../../src/tasks.ts), [existing credential purpose][tracker-secret], [pilot injection][vloer-overlay].

## C4 components inside Ploeg

| Component | Responsibility and significant connections |
| --- | --- |
| Tracker and forge adapters | Verify and interpret incoming webhooks; fetch authoritative task facts and resolve registered targets. Forge adapters also provide outgoing comments/reviews and repository identity. [HTTP ingest][ploeg-http], [provider interfaces][providers], [target resolution][target] |
| Shift engine | Creates/evaluates planned work, advances rounds, combines role reports, handles failed writers and decides terminal outcomes. Its findings flow through stored reports and forge comments. [Engine][shift-engine], [review loop][review-loop], [findings publication][findings-publication] |
| Worker API and authentication | Issues claims and accepts renewals, checkpoints and outcomes. Managed mode checks a team/role bootstrap credential and returns a signed capability for the claimed Run. [Worker authentication][worker-auth], [worker API client][worker-api] |
| Operator read and command API | Exposes scoped work views and controls operator executions with actor, consumer, team, command ID, revision, generation and expiry checks. [Scoped handler][operator-api], [execution endpoints][operator-execution-api], [execution transactions][operator-execution-store] |
| LLM control and ledger | Selects allowed models, budget and TTL on the server; reserves before minting; records issued/unknown/blocked states; keeps unresolved budget held after worker death. Observed spend and trusted settlement are distinct operations. [LLM control][llm-control], [account operations][llm-accounts], [hold calculation][llm-schema] |
| Worker coordinator and adapters | Prepare the Git workspace and task specification, acquire scoped inference access, launch the harness, renew the lease and report. The child harness environment is constructed from an allowlist. [Worker][worker], [adapter selection][worker-adapters], [environment][worker-environment] |
| Recovery and cleanup | Detect expired leases/executions, stop or block managed access and retry pending key blocks. Operator-owned work is excluded from the ordinary unattended retry path. [Sweeper][sweeper], [operator reconciliation][operator-reconcile], [store expiry predicates][store] |
| Delivery governance | Binds candidate, execution, repository, generation, canonical commit, artifact and policy. Requires a separately authorized verification receipt and candidate-bound approval. Persists a publication operation before effects; an uncertain operation cannot receive a fresh effect authorization merely because a later lookup found nothing. [Delivery API][delivery-api], [delivery transactions][delivery-store] |

The operator API's trust boundary is a configured consumer asserting an actor, not direct browser access to the worker claim API. [Scoped operator handler][operator-api], [worker authentication][worker-auth].

Managed worker deployments keep LiteLLM administration and capability-signing authority in the controller. The worker receives a scoped control capability and an inference credential; its child harness receives the intended execution environment. This is stronger than merely deleting a few environment variables, but the worker and harness still share a process/container boundary: the allowlist alone does not prove that a hostile process cannot inspect another same-user process. [Controller wiring][ploegd-main], [worker entrypoint][worker-main], [environment construction][worker-environment], [credential contract][worker-contract].

## The two execution paths

### Interactive session under shared Ploeg authority

1. The browser asks De Vloer to import a task or create a manual draft. An import reads the tracker and looks up the existing eligible Ploeg Work Item. [Task routes](../../src/http.ts), [binding client](../../src/task-binding.ts).
2. On Start, De Vloer rechecks the mandate and obtains Ploeg admission and a running generation. For a manual session, Ploeg creates a Work Item, Shift and `operator` Run. For a bound tracker session, it adopts the existing Work Item. [Authority client](../../src/execution-authority.ts), [Ploeg admission][operator-execution-store], [source adoption][operator-source-store].
3. Ploeg reserves spending authority and issues scoped inference access. De Vloer verifies the grant before paid preparation and role execution. [LLM control][llm-control], [engine](../../src/engine.ts).
4. **De Vloer directly creates the Kubernetes Secret, PVC, NetworkPolicy and Pod.** Pull mode does not create an agent Service. The clone init container prepares Git; the agent process runs OpenCode and the relay. KEDA is absent from this path. [Manifest construction and prepare/dispose methods](../../src/runtime/kubernetes.ts).
5. De Vloer drives the local crew roles, stores their events and asks the human for permissions. These role runs remain De Vloer records inside one Ploeg operator Run; they are not separate Ploeg Runs. [Engine](../../src/engine.ts), [execution contract](../contracts/ploeg-execution.md).
6. De Vloer reports shared state, captures available evidence and removes runtime resources while retaining the workspace PVC. A stop or uncertain prior execution does not authorize a replacement paid run automatically. [Engine](../../src/engine.ts), [authority client](../../src/execution-authority.ts), [workspace disposal](../../src/runtime/kubernetes.ts).

### Unattended assignment

1. A configured assignment webhook reaches Ploeg. The controller resolves its target, mirrors the Work Item and creates planned work when configured. [Webhook handling][ploeg-http], [Shift creation][shift-engine].
2. KEDA reads PostgreSQL counts for a team/role and creates a Job. The Job is capacity, not a claim: `ploeg-worker` must claim from the controller and exits if no eligible work remains. [ScaledJob][scaledjob], [worker][worker].
3. The worker renews its lease, prepares Git, obtains scoped inference access and invokes its configured adapter. The harness calls LiteLLM directly. [Worker][worker], [worker entrypoint][worker-main], [adapters][worker-adapters].
4. The worker reports its outcome and available evidence; Ploeg evaluates the next round or closes the Shift. A crashed worker is detected by lease expiry, with retry rules determined by the work/Shift state. [Outcome handling][ploeg-http], [Shift engine][shift-engine], [failed-writer handling][failed-writer], [sweeper][sweeper].

Switching a shared De Vloer execution from human to background supervision changes its supervision record. It does not hand the live workspace to a KEDA worker or migrate the OpenCode conversation to OpenHands. [Supervision operation](../../src/engine.ts), [authority commands](../../src/execution-authority.ts), [Ploeg command state machine][operator-execution-store].

## Differences from the intended product and unresolved boundaries

| Intended direction or question | What exists now | Consequence for the architecture discussion |
| --- | --- | --- |
| De Vloer is the human front; Ploeg is the backend. | De Vloer also owns workspace provisioning, sequential crew execution, native transport and candidate collection. Ploeg governs admission and budget. | Decide whether those execution components should remain a delegated executor in De Vloer, become a separate service, or move into Ploeg. Moving them is a proposal, not current behavior. [Engine](../../src/engine.ts), [workspace manager](../../src/runtime/workspace.ts), [shared contract](../contracts/ploeg-execution.md) |
| A person can work hands-on or delegate a ticket. | `execution.team` enables shared authority for the whole workbench. A supervision switch does not transfer executors. Imports require an existing pristine assignment. | There is no complete per-ticket choice between independent hands-on work and handing execution to Ploeg in this deployment. [Composition](../../src/main.ts), [source eligibility][operator-source-store], [authority client](../../src/execution-authority.ts) |
| People and unattended agents use interchangeable harnesses. | De Vloer registers its OpenCode/command/demo adapters; Ploeg registers its own OpenHands, Claude Code, exec and ACP adapters. Native state formats and lifecycle glue differ. | A common model gateway or adapter interface is not demonstrated native-session portability. [De Vloer registration](../../src/main.ts), [Ploeg registration][worker-adapters], [native OpenCode state](../../src/runtime/opencode.ts) |
| One understandable work model. | De Vloer has sessions and local role runs; Ploeg has Work Items, Shifts, rounds, Runs and operator executions. One shared session presently maps to one operator Run. | Explain both vocabularies explicitly; do not draw each De Vloer role as a Ploeg Run. A general successor-attempt/WorkOrder lifecycle remains outside the current binding. [Shared contract](../contracts/ploeg-execution.md), [execution schema][execution-schema], [source eligibility][operator-source-store] |
| Agents communicate and coordinate. | De Vloer passes earlier reports/artifacts to later roles. Ploeg stores role findings and injects/publishes them for later rounds. OpenCode child sessions are tracked within a workspace. | These are concrete coordination mechanisms. They do not establish a general cross-application agent messaging service or an autonomous research/plan/measure loop. [Crew prompt construction](../../src/engine.ts), [native child tracking](../../src/runtime/opencode.ts), [Ploeg findings][findings-publication], [review loop][review-loop] |
| One verification and publication policy. | Writer tool output and reader verdicts exist on ordinary runtime paths. The additional trusted delivery path has canonical binding, independent Docker checks and a Ploeg publication barrier. Existing unattended forge behavior uses different code. | Do not label all outputs independently verified or all forge effects protected by the new barrier. The homelab workbench has no delivery policy configured, and its facade has no enabled live publisher. [Runtime evidence](../../src/runtime/opencode.ts), [delivery service](../../src/delivery.ts), [verifier](../../src/delivery-verifier.ts), [Ploeg barrier][delivery-store], [worker forge path][worker-forge], [pilot values][vloer-values] |
| Thousands of agents. | Kubernetes can host separate workers, but De Vloer has one SQLite writer and local concurrency control; the pilot permits one session. KEDA limits exist per rendered team/role. | Distinguish an aspiration for cluster capacity from measured scheduler throughput, storage scale and operator usability. No thousand-agent qualification is established by these manifests. [Store](../../src/store.ts), [engine](../../src/engine.ts), [pilot values][vloer-values], [KEDA limits][scaledjob] |

The duplicated areas are therefore concrete: runtime adapters, workspace/Git preparation, lifecycle handling, evidence interpretation and standalone credential logic. The two stores also retain different views of shared execution. Some duplication serves distinct responsibilities; whether to consolidate it depends on the chosen owner of execution, rather than a desire to merge repositories. [De Vloer composition](../../src/main.ts), [Ploeg composition][ploegd-main], [worker][worker], [shared authority client](../../src/execution-authority.ts).

## Runtime evidence and current limits

The rc.14 fix serializes Kubernetes request bodies once and sends their byte length, including DELETE bodies. Its regression exercises a real HTTP parser: DELETE with non-ASCII JSON, an allowed 404 and a following GET on the same TCP connection. The chart also uses `/data/workbench` so the non-root server need not chmod the storage driver's volume root. These changes passed 211 repository tests, source checks, typecheck and Helm lint/render before release. [Client](../../src/runtime/kubernetes.ts), [regression](../../test/runtime-kubernetes.test.ts), [chart configuration](../../ops/helm/de-vloer/templates/config.yaml), [storage guidance](../operations/live.md#kubernetes).

A bounded local probe of the published rc.13 agent image, digest `sha256:3333fc9bac6ef4a899d2ac0920ceac8b0931cfbda41946899a54fa9b305c04d5`, ran OpenCode 1.18.30 with no external network, a read-only root, no host mounts and temporary writable workspace/config directories. Health became available in 13.3 seconds; unauthenticated health returned 401; managed provider configuration and native session create/delete worked. The model catalogue fetch timed out after 10 seconds but did not prevent startup. No inference request reached the local counting endpoint. This was a startup/configuration probe, consistent with the limited scope of [the repository's native probe](../../scripts/probe-opencode.mjs); it did not qualify tool execution or cross-harness continuation. The [image source](../../ops/agent/Dockerfile) pins the same OpenCode version.

The subsequent manual-permission failure was reproduced with that actual image and a deterministic loopback model fixture. The fixture emitted three `glob` calls with `pattern` and no optional `path`. OpenCode emitted permission events, but `GET /permission` returned this response:

```json
{
  "name": "BadRequest",
  "data": {
    "message": "Expected JSON value, got undefined\n  at [0][\"metadata\"][\"path\"]",
    "kind": "Body"
  }
}
```

This was HTTP 400, originating from OpenCode's response validation. The probe used one fake model response, no paid model calls and removed its container afterward. The current adapter polls that endpoint and turns a non-success response into `harness_rejected`. Its execution catch also drops the original HTTP status/detail, while native error extraction reads `error.message` but not `error.data.message`. Those handling paths are visible in [the current OpenCode adapter](../../src/runtime/opencode.ts) and [failure types](../../src/failures.ts). The manual-permission compatibility fix and diagnostic preservation were **not implemented** before work paused.

An adapter workaround would have to retain pending SSE permissions when this exact listing error occurs, never equate an unavailable list with an empty list, and preserve uncertainty across reconnection. Fixing the pinned harness itself is another option. Neither is selected here. A successful automatic-approval run would not prove that manual permission recovery works, and the startup probe did not test either path. [Permission reconciliation and completion conditions](../../src/runtime/opencode.ts).

There is no recorded qualification here for transferring a running conversation between Ploeg's unattended harness and De Vloer's interactive harness. Repository changes, reports and candidate artifacts are the implemented handoff material. Native conversation IDs remain adapter state. Separate fixture tests and the existence of ACP/AHP adapters must not be represented as an end-to-end portability result. [Native runtime](../../src/runtime/opencode.ts), [candidate artifacts](../../src/candidates.ts), [Ploeg adapter selection][worker-adapters], [editor host](../../src/ahp/host.ts), [shared execution contract](../contracts/ploeg-execution.md).

[vloer-revision]: https://forgejo.webgrip.dev/webgrip/de-vloer/src/commit/521fd0efb2ccb767e668c5c48bd8ed717a738e26
[ploeg-revision]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8
[cluster-revision]: https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/commit/8b2d069897415b3d42763966e94ef9b6eee16f83
[ploegd-main]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/cmd/ploegd/main.go
[ploeg-http]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/httpapi/server.go
[ploeg-deployment]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/ops/helm/ploeg/templates/deployment.yaml
[operator-api]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/httpapi/operator.go
[operator-source]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/httpapi/operator_source.go
[operator-source-store]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/store/operator_source.go
[operator-execution-api]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/httpapi/operator_execution.go
[operator-execution-store]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/store/operator_execution.go
[operator-reconcile]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/httpapi/operator_execution.go
[execution-schema]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/store/migrations/0013_operator_executions.sql
[llm-control]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/httpapi/llm_control.go
[llm-accounts]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/store/llm_accounts.go
[llm-schema]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/store/migrations/0012_run_llm_accounts.sql
[llm-broker]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/llmbroker/litellm.go
[store]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/store/store.go
[sweeper]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/cmd/ploegd/sweep.go
[providers]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/provider/provider.go
[target]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/target/resolver.go
[shift-engine]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/shiftengine/engine.go
[review-loop]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/shiftengine/reviewloop.go
[failed-writer]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/shiftengine/failedwriter.go
[findings-publication]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/shiftengine/publish.go
[worker]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/worker/worker.go
[worker-main]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/cmd/ploeg-worker/main.go
[worker-api]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/worker/api.go
[worker-auth]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/httpapi/worker_auth.go
[worker-environment]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/worker/environment.go
[worker-adapters]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/worker/adapters.go
[worker-git]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/worker/git.go
[worker-forge]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/worker/forge.go
[worker-template]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/ops/helm/ploeg/templates/_helpers.tpl
[worker-contract]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/docs/contracts/worker-control.md
[scaledjob]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/ops/helm/ploeg/templates/scaledjob.yaml
[delivery-api]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/httpapi/operator_delivery.go
[delivery-store]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/store/operator_delivery.go
[delivery-schema]: https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/023c29fd8380ac1d0cfa375fe0098e99006fc2e8/pkg/store/migrations/0015_operator_delivery.sql
[vloer-values]: https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/commit/8b2d069897415b3d42763966e94ef9b6eee16f83/kubernetes/apps/ploeg/de-vloer/app/helmrelease.yaml
[vloer-overlay]: https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/commit/8b2d069897415b3d42763966e94ef9b6eee16f83/kubernetes/apps/ploeg/de-vloer/app/kustomization.yaml
[ploeg-values]: https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/commit/8b2d069897415b3d42763966e94ef9b6eee16f83/kubernetes/apps/ploeg/ploeg/app/helmrelease.yaml
[vloer-flux]: https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/commit/8b2d069897415b3d42763966e94ef9b6eee16f83/kubernetes/apps/ploeg/de-vloer/ks.yaml
[ploeg-flux]: https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/commit/8b2d069897415b3d42763966e94ef9b6eee16f83/kubernetes/apps/ploeg/ploeg/ks.yaml
[tracker-secret]: https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/commit/8b2d069897415b3d42763966e94ef9b6eee16f83/kubernetes/apps/ploeg/ploeg/app/agent-vikunja-token.externalsecret.yaml
[authentik]: https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/commit/8b2d069897415b3d42763966e94ef9b6eee16f83/kubernetes/apps/authentik/app/blueprints/40-oidc-vloer.yaml
