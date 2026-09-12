# What each component means

The definitions distinguish product intent from implementation. Deployment notes refer to the 11 September inspection, not a live inventory. Existing source and deployment links are collected in the [dated implementation evidence](../../apps/vloer/docs/research/2026-09-11-ecosystem-implementation.md).

## Vloer

**The place where a person works with AI and follows work given to agents.** Its human responsibilities are selecting a ticket, supplying context, discussing the work, seeing activity and results, making interventions, and recording review decisions.

Today it is a browser application and a server, with an editor client also present in the repository. Its server stores sessions, imports ticket snapshots, manages workspaces, runs a sequential crew with an optional writer and a final reviewer, and saves downloadable changes. Calling it only a front end conceals these server responsibilities. The desired open conversation without a ticket or repository is broader than today's repository-and-crew session setup. In shared mode, every started session is authorized by Ploeg, but its workspace execution still lives in Vloer. See the [architecture](../../apps/vloer/docs/architecture.md) and [execution contract](../../apps/vloer/docs/contracts/ploeg-execution.md).

## Ploeg

**The service that authorizes and coordinates admitted agent work.** It records eligibility, execution ownership, budget, activity and stop conditions. Vloer performs the interactive workspace execution in shared mode. Standalone local work must remain usable without this service. A common runner for both paths remains an [open implementation choice](questions.md).

Its unattended workers can claim queued work and run it. Vloer can also ask Ploeg to authorize an execution and then perform that execution itself. These are two current execution paths. Ploeg does not choose business priorities; those remain in the tracker. It does not itself host the language model. See [Ploeg's architecture](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/architecture.md) and [operator execution decision](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/adrs/0024-operator-work-uses-one-execution-authority.md).

## Ticket tracker — currently Vikunja for this test

**The record of requested work, its priority, and its assignment.** A ticket describes an outcome; an execution is an attempt to produce that outcome. A ticket can survive a failed execution.

Vloer currently imports a snapshot linked to an existing Ploeg work item. Ticket systems remain external in the intended product; a free conversation in Vloer does not require a ticket. The initial ticket creation and assignment in the homelab test happen in Vikunja. Automatic repair subtickets are desired behavior, not a demonstrated integration. See the [tracker binding contract](../../apps/vloer/docs/contracts/ploeg-tracker-binding.md).

## Harness — currently OpenCode on the tested Vloer path

**The program that repeatedly asks the model what to do, runs allowed tools, and returns their results to the model.** Examples of tools are reading a file, running tests, and editing code. The model supplies responses; the harness supplies the working loop.

[OpenCode](https://opencode.ai/docs/) is a harness with its own interfaces and session state. [OpenHands](https://docs.openhands.dev/) offers an agent SDK and broader application capabilities. These products overlap, but swapping one into this deployment still requires an adapter and qualification. Supporting multiple adapters does not prove that hidden conversation state moves between them. The user's contract should be with Vloer, not with a particular harness. See [runtime boundaries](../../apps/vloer/docs/adrs/0003-runtime-workspace-and-credential-seams.md).

## Model

**The trained system that receives input and generates a response.** A model is not a running worker, a ticket, or a whole agent. It does not automatically receive the repository or run commands; the harness supplies context and executes tools.

The same model can be used by a developer's session and an unattended worker. Changing it can change quality, latency, tool behavior, and cost, even if the API shape stays the same. See the configured-model boundary in [Vloer's runtime](../../apps/vloer/src/runtime/opencode.ts).

## Fireworks.ai

**A service that hosts models and answers inference requests.** It supplies model execution on provider infrastructure. The home cluster can run the agent's tools while Fireworks runs the model elsewhere. Hosting agents on Kubernetes does not imply hosting model GPUs there. See [Fireworks' introduction](https://docs.fireworks.ai/getting-started/introduction).

Fireworks is the user's intended provider in this ecosystem. It is not configured in the inspected homelab LiteLLM deployment. The completed cluster test used the existing DeepSeek route instead. This distinction is shown explicitly in the deployment view.

## LiteLLM

**The shared entry point for model requests.** It routes a requested model to a configured provider and offers keys with access restrictions, budget controls, and spend records. Ploeg decides what an execution is authorized to spend; LiteLLM enforces its configured request controls and records usage. A gateway record is not automatically a settled provider invoice. See [virtual keys](https://docs.litellm.ai/docs/proxy/virtual_keys) and the [Ploeg credential decision](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/adrs/0008-litellm-is-the-credential-and-metering-seam.md).

On the shared path, Ploeg holds the credential used to manage model access. The workspace receives a limited execution key. Vloer does not receive the gateway master key. Model traffic travels from the harness to LiteLLM; it does not pass through the Ploeg work queue.

## KEDA

**The component that starts more Kubernetes workers when its configured signal says work is waiting.** For Ploeg's unattended path, that signal is queue depth. A started worker still has to ask Ploeg for a valid claim; KEDA does not decide which ticket that worker owns. See [KEDA job scaling](https://keda.sh/docs/2.20/concepts/scaling-jobs/) and [Ploeg's chart](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/ops/helm/ploeg).

KEDA is not currently in the Vloer Start-to-workspace path. Vloer creates that workspace through the Kubernetes API. Bronze's unattended workers are paused for the test so they do not claim tickets intended for Vloer. KEDA scaling adds worker instances within configured limits; it does not create unlimited machines, provider allowance, or review capacity.

## Kubernetes cluster

**A set of machines managed as a shared place to run software.** Kubernetes places Pods on machines with suitable available resources and manages the requested workloads. Storage, networking, and security settings determine what those workloads can use. See the [Kubernetes scheduler](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/).

The homelab hosts Vloer, Ploeg, workers, databases, and LiteLLM. A workspace Pod runs the harness and tools. More Pods require real CPU, memory, storage, network capacity, and provider quota. An isolated workspace also needs deliberate credential and network restrictions; the word Kubernetes alone is not an isolation guarantee.

## Workspace

**The working environment for an execution: files, tools, and the running harness.** Today a coding workspace contains a repository checkout and retained native state on a separate volume. A workspace is not the ticket or the record of whether its result was accepted. See [Kubernetes workspace creation](../../apps/vloer/src/runtime/kubernetes.ts).

## Forge and delivery tools — currently Forgejo and CI

**The forge stores repositories and proposed code changes; CI runs configured checks.** The current Ploeg unattended path and Vloer candidate path publish differently. Vloer saves a change for review; its separate trusted verification and publication features are disabled in this cluster. Do not draw a completed Vloer session as an automatic production deployment. See the [delivery contract](../../apps/vloer/docs/contracts/candidate-delivery.md).

For the platform itself, Git commits drive release pipelines, registry artifacts, and Flux deployment. That is how the platform is maintained; it does not prove the same path is available for arbitrary agent-produced applications. See the [homelab test guide](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/docs/techdocs/docs/runbooks/ploeg-vloer-test.md).

## Supporting services

These solve separate operating needs. They should appear in deployment and security discussions without crowding the leadership pitch.

- **Authentik:** signs people in and supplies identity and groups. See [Vloer sign-in](../../apps/vloer/docs/adrs/0016-sign-in-and-link-your-own-accounts.md).
- **OpenBao and External Secrets:** hold long-lived secrets and deliver the configured copies to the appropriate applications. They do not decide which ticket an agent should work on. See the [estate's secrets model](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/docs/techdocs/docs/adr/adr-0055-one-secrets-model-six-levels.md).
- **Harbor:** stores the published container images and charts. **Flux:** keeps the cluster aligned with the deployment definitions in Git. See the [homelab application manifests](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/ploeg).
- **PostgreSQL:** stores Ploeg's work and execution records. **SQLite and files:** store Vloer's sessions, activity, and saved results. Those are separate records with explicit links, not one interchangeable database. See [Vloer's storage decision](../../apps/vloer/docs/adrs/0002-native-node-and-single-writer-storage.md).
- **Monitoring and evaluation tools:** observe failures, performance, and model quality. Existing application events and spend records are useful inputs, but a complete cross-system view of decisions, costs, quality, and business outcomes remains work to define. See [the bottleneck measurements](bottlenecks.md).

## Three meanings of scheduling

Ploeg answers **“what work is allowed to run?”** KEDA answers **“how many unattended worker jobs should be started?”** Kubernetes answers **“which machine can run this Pod?”** Keeping these questions separate removes a large part of the apparent overlap.
