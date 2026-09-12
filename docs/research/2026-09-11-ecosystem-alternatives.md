# Ecosystem alternatives: what exists, what we use, and what we actually evaluated

The [12 September transition proposal](../monorepo-transition.md) requires local work without Ploeg and keeps a shared runner under evaluation. This report retains the earlier comparison.

> Historical scope: this survey records the 11 September discussion. On 12 September the owner reopened universal Ploeg authority and local execution without Ploeg. See [current product questions](../landscape/questions.md). The survey below retains its original evidence and assumptions.

Research date: **11 September 2026**. Audience: product leadership and the CTO. Scope: twelve relevant products and components, checked against their official documentation and the Ploeg/De Vloer decision history. This is a documentation and source review, not a new installation, benchmark, procurement decision or claim of uniqueness.

**Several existing products could replace substantial parts of Ploeg and De Vloer.** The evidence supports keeping them on the comparison list. It does not establish that this combination is the only way to support people and background agents together. The useful question is which responsibilities we want to own, and which existing product can take those responsibilities without changing the intended way of working. The closest complete alternatives are OpenHands, Kandev, Coder and Paperclip; their documented boundaries are compared below.

## How to read the evidence

There are two separate questions: whether a capability is documented, and whether it works for this product's requirements. **High confidence** below means current primary documentation or repository evidence directly supports the stated capability or adoption status. **Medium confidence** marks our inference about architectural fit. Operational reliability, isolation, migration effort and total cost remain **unmeasured** for alternatives we have not run. Vendor security claims are not independent security assessments.

“Adopted” means software is part of our implementation. “Considered” means someone inspected documentation or source. “Rejected” means a dated decision declined adoption for a particular purpose. “Not tested” is not a synonym for rejected.

### What the earlier research actually established

| Existing evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| [Market landscape](market-landscape.md) and [source ledger](market-sources.json), 9 September | The ledger contains 41 sources. Every entry is marked `official_source_inspected`; every `independently_tested` value is `false`. It explicitly records no hands-on competitor comparison. | A list of sources is not 41 product tests. The document's agency/customer positioning is a hypothesis, not measured demand. |
| [Conventions and alternatives](conventions-and-alternatives.md) | A review of neighboring repositories and documented workbench concepts. It explicitly disclaims compatibility certification. | Successful installation, measured switching cost, or proof that another workbench cannot preserve tracker ownership. |
| [Ploeg's dedicated-dispatch decision](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/adrs/0005-build-a-dedicated-dispatch-plane.md), July | A recorded build-versus-adopt decision covering board tools, runtime layers and workflow engines. | A current, tested elimination of every listed alternative. Some capability claims have aged, as described below. |
| [Paperclip source study](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/research/2026-07-28-paperclip-fit.md) and [Ploeg ADR 0009](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/adrs/0009-paperclip-mine-for-design-never-integrate.md) | A deeper local-clone inspection and an explicit decision against depending on Paperclip. Design ideas were adopted; the software was not. | A hands-on deployment comparison, or permanent proof that integration is impossible. The [September review](2026-09-10-unified-workbench-baseline.md) reopens replacement as a question; it does not supersede the ADR. |
| [Runtime API evidence](agent-apis.md) and [validation record](../validation.md) | A real OpenCode 1.18.30 server was probed for authentication, sessions, events, permissions and cancellation. Those recorded probes sent no inference requests. | A paid model-quality comparison, Fireworks billing qualification, or a trial of OpenHands Agent Canvas. Later deployment evidence must be assessed separately. |
| [September baseline](2026-09-10-unified-workbench-baseline.md) and [Ploeg's A2A study](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/research/2026-07-28-a2a-fit.md) | Temporal is suggested as a future workflow engine. LangGraph and CrewAI appear as participants in the protocol ecosystem. | A prior Temporal, LangGraph or CrewAI prototype or rejection. Their focused documentation comparison below is new. |

## Products that could replace substantial parts of the solution

These products combine several responsibilities. Using one may mean adopting its task model and operating practices, rather than putting it invisibly behind our existing screens.

### 1. OpenHands: a workbench, an agent runtime, and automation

**Problem solved.** Agent Canvas provides a human interface over local or remote coding agents. The current repository explicitly separates Canvas, the Agent Server/SDK, and an Automation Server for schedules and events. It supports multiple harnesses, including ACP-compatible agents. [Official repository and architecture](https://github.com/OpenHands/OpenHands)

**Overlap and boundary.** Canvas overlaps De Vloer; automation overlaps Ploeg; the SDK can instead be used as an execution component. These are three different adoption decisions. The edition comparison places shared-user authorization and scalable isolated sandboxes in Cloud/Enterprise; a self-hosted Canvas launch should not be presented as equivalent to that edition. [Edition comparison](https://docs.openhands.dev/enterprise/enterprise-vs-oss)

**Our status.** Ploeg has an [OpenHands harness adapter](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/harness/adapters/openhands/openhands.go). De Vloer's [SDK mapping](agent-apis.md#openhands-mapping-for-a-future-runner) is a future integration. Canvas has been considered through documentation, not tried as a replacement. **Confidence: high** on that distinction; **medium** that adopting Canvas/Enterprise would reduce our total work. The exact OpenCode, gateway, tracker and handover combination remains untested.

### 2. Kandev: a developer workbench with agent workflows

**Problem solved.** Kandev combines tasks, agent sessions, repository changes and review. Its Kubernetes executor runs a session in a Pod; Kubernetes execution and a future Kubernetes operator are different capabilities. [Kubernetes guide](https://kandev.ai/docs/k8s)

**Overlap and boundary.** It could replace much of De Vloer's daily developer interface. Its own feature inventory marks authentication and multiple-organization isolation experimental, with known shared-resource and cross-organization limitations. Office coordination, budgets and routines remain in progress. The inventory describes `main`; released versions can lag. [Feature status](https://kandev.ai/docs/feature-status)

**Our status.** Considered in [De Vloer ADR 0001](../adrs/0001-the-human-workbench-beside-ploeg.md) and subsequent research; no recorded installation trial. **Confidence: high** on documented functionality and limits; **medium** on replacement fit. Whether it can use Ploeg as the sole owner of execution while keeping external tickets authoritative is an unanswered integration question, not an established missing feature.

### 3. Coder Agents and Workspaces: shared development infrastructure and an agent interface

**Problem solved.** Coder provides workspaces and a chat/API interface for delegated development and research. Its native agent runs in the Coder control plane, using workspaces for tools. Conversations survive workspace replacement, and model credentials stay outside the workspace. [Coder Agents](https://coder.com/docs/ai-coder/agents)

**Overlap and boundary.** It can replace workspace provisioning and much of the workbench/agent coordination experience. Its native agent is its own implementation, so choosing that experience also changes the harness; it is not an OpenCode wrapper. Community licensing currently permits five active agents at once; AI Premium uses purchased Agent Time. [Agent architecture](https://coder.com/docs/ai-coder/agents), [licensing](https://coder.com/docs/ai-coder/agents/licensing-usage)

**Our status.** Documentation considered in the [market review](market-landscape.md); not adopted or tested here. **Confidence: high** on the documented product boundary; **medium** that it could replace both products for an organization willing to adopt its model. External ticket ownership and our exact forge workflow need a trial. Evaluating only old Coder Tasks material would understate the current offering.

### 4. Paperclip: managing ongoing work across teams of agents

**Problem solved.** Paperclip provides its own goals, tasks, agent assignments, approvals, budgets and recurring work. It therefore addresses the broader research → planning → execution → follow-up ambition, beyond producing code changes. [Official repository](https://github.com/paperclipai/paperclip)

**Overlap and boundary.** It overlaps Ploeg, parts of De Vloer, and the tracker. Its documented OpenCode adapter supports custom provider configuration, although the gateway helpers have a local-target qualification. Its Kubernetes plugin is alpha; the default sandbox backend and the one-shot Job fallback have different capabilities. [OpenCode adapter](https://docs.paperclip.ing/reference/adapters/opencode/), [Kubernetes provider](https://docs.paperclip.ing/reference/adapters/sandbox-providers/#kubernetes-driver-kubernetes)

**Our status.** Software dependency **rejected by the July ADR** after source inspection; selected ideas adopted. September research recommends reconsidering deliberate replacement. **Confidence: high** on the decision history; **medium** on present fit. The documented competing task authority is a real design difference. Claims that no workable integration could ever exist, or that its current accounting is inferior in every deployment, exceed the evidence.

### 5. GitHub Copilot cloud agent: delegation inside the forge

**Problem solved.** Copilot can research a repository, plan work, change a branch, iterate with people and create a pull request. It supports scheduled/event-driven automation and reports pull-request outcome metrics. The current name is “cloud agent”; earlier material calls it “coding agent.” [Official overview](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent)

**Overlap and boundary.** It covers many reasons to build Ploeg and De Vloer when work already lives on GitHub. The documented restriction to GitHub-hosted repositories is a concrete mismatch for a Forgejo-centered workflow. Self-hosted Actions runners are supported; that does not move ownership of the product out of GitHub. [Repository restrictions](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent), [runner configuration](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment)

**Our status.** Considered, not adopted or tested in this study. **Confidence: high** on the repository boundary; **medium** on lower adoption effort for a GitHub-only organization. Do not describe research, human iteration or outcome metrics as exclusive to our proposal.

## Components that can be reused within the solution

These solve narrower problems. Reusing them can reduce custom code without replacing the product's decisions about work, people and acceptable results.

### 6. OpenCode: the program that does the reasoning and tool work

**Problem solved.** OpenCode supplies the coding-agent loop and developer clients. Its headless HTTP server lets another application create sessions, observe work and interact with the agent. Providers and compatible gateway endpoints are configurable. [Server API](https://opencode.ai/docs/server/), [providers](https://opencode.ai/docs/providers/)

**Overlap and boundary.** It supplies De Vloer's initial harness and can be sufficient for someone who only needs direct development. Using the same harness for people and background workers does not by itself unify task ownership, permissions or spending records; that is our integration responsibility. [Runtime/workspace decision](../adrs/0003-runtime-workspace-and-credential-seams.md)

**Our status.** **Adopted and protocol-tested**, with the exact limits recorded in [agent-apis.md](agent-apis.md). **Confidence: high** on implemented use; combined provider quality, continuity and cost still require version-specific evidence. Native session state is not a portable conversation format between different harnesses.

### 7. Temporal: keeping a long process moving through failures and waits

**Problem solved.** Temporal records workflow history, supports timers and messages, and recovers execution after failures. It can be operated as a self-hosted service. [Workflow execution](https://docs.temporal.io/workflow-execution), [self-hosting](https://docs.temporal.io/self-hosted-guide)

**Overlap and boundary.** It could implement Ploeg's long waits, retry rules and multi-step recovery. It would not determine which research is worthwhile, who approves spending, or what counts as an accepted result. External operations can execute again when completion was not recorded; Temporal explicitly requires application-level protection against duplicate side effects. A durable workflow does not automatically prevent a second model charge or duplicate ticket. [Activity semantics](https://docs.temporal.io/activity-definition)

**Our status.** **Not adopted; suggested for future evaluation**, with no prototype recorded in the [baseline review](2026-09-10-unified-workbench-baseline.md). **Confidence: high** on documented recovery semantics; **medium** on reducing Ploeg's maintenance burden. Replacing its existing lifecycle logic has a migration cost to measure.

### 8. KEDA: starting enough Kubernetes workers for the available work

**Problem solved.** KEDA scales Jobs from an external signal. Its PostgreSQL scaler can use a query returning the amount of pending work. Workers then claim and process work themselves. [Job scaling, current 2.20 documentation](https://keda.sh/docs/2.20/concepts/scaling-jobs/), [PostgreSQL scaler](https://keda.sh/docs/2.20/scalers/postgresql/)

**Overlap and boundary.** It supplies capacity underneath Ploeg. It does not know a ticket's business priority, approve a result, or implement the claim rules. Ploeg owns those semantics and makes its scaling query agree with them. [Executor contract](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/contracts/executor.md)

**Our status.** **Adopted** as Ploeg's default executor mechanism; a CronJob option also exists. **Confidence: high** on that implementation boundary. KEDA's availability is not evidence that our complete system has been qualified for thousands of simultaneous agents.

### 9. LiteLLM: controlled access to model providers and usage accounting

**Problem solved.** LiteLLM routes model requests, issues restricted virtual keys, supports expiry and blocking, and exposes spend records. Its documentation explains that spend is calculated from usage and configured model prices. [Virtual keys and spend](https://docs.litellm.ai/docs/proxy/virtual_keys)

**Overlap and boundary.** It is a shared component underneath both interactive and unattended work. Ploeg associates a permitted amount and credential with an execution; LiteLLM handles model access and metering. Neither a token count nor a price estimate proves that a result is useful. Gateway accounting is also distinct from a final provider invoice. [Ploeg metering decision](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/adrs/0008-litellm-is-the-credential-and-metering-seam.md), [current execution contract](../contracts/ploeg-execution.md)

**Our status.** **Adopted**, with clients and lifecycle tests. **Confidence: high** on the chosen boundary; exact enforcement, fallback behavior and accounting require evidence for the deployed gateway and model. Replacing Ploeg with LiteLLM would leave task ownership and execution management unresolved.

### 10. Fireworks AI: supplying inference capacity

**Problem solved.** Fireworks serves models through serverless and deployment options and provides training capabilities. It documents both OpenAI-compatible text APIs and LiteLLM integration. [Platform overview](https://docs.fireworks.ai/getting-started/introduction), [text API](https://docs.fireworks.ai/guides/querying-text-models), [LiteLLM integration](https://docs.fireworks.ai/ecosystem/integrations/litellm)

**Overlap and boundary.** In the proposed stack it is a model supplier behind LiteLLM, not the owner of a developer session or a ticket. Choosing it changes model availability, inference cost and operating terms. It does not itself establish our research acceptance process or cross-agent coordination.

**Our status.** **The user's stated provider choice**, but a Fireworks route is not separately demonstrated in the cited De Vloer qualification record. The [baseline architecture](2026-09-10-unified-workbench-baseline.md) allows Fireworks or another provider. **Confidence: high** on documented integration; **unmeasured** for the exact Fireworks/model/agent combination here. Existing personal use and a qualified De Vloer execution are different evidence; a generic gateway demonstration must not be labelled a Fireworks test.

### 11. LangGraph: programming an agent's multi-step process

**Problem solved.** LangGraph combines programmed steps with model-driven steps, persistent state, streaming and human interruptions. Persistent storage is an explicit choice; its in-memory checkpointer does not survive a restart. [Overview](https://docs.langchain.com/oss/python/langgraph/overview), [persistence](https://docs.langchain.com/oss/python/langgraph/persistence)

**Overlap and boundary.** It could implement a research/analysis workflow or part of the coordination logic executed under Ploeg. It is not automatically an OpenCode replacement or a complete operator product. Its interruption semantics can rerun a node, so actions performed before the interruption need duplicate protection. [Interrupt behavior](https://docs.langchain.com/oss/python/langgraph/interrupts)

**Our status.** **Not adopted or tested**; previously mentioned in the [A2A ecosystem study](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/research/2026-07-28-a2a-fit.md), now documentation-reviewed for this purpose. **Confidence: high** on documented framework scope; **medium** on fit. Assess it when a concrete multi-step process is clearer than a general request for “agents that talk.”

### 12. CrewAI: defining specialist agents and their shared process

**Problem solved.** CrewAI groups agents and tasks into sequential or manager-directed crews. Its Flows add state and control flow; persistence and checkpoints are documented capabilities. [Crews](https://docs.crewai.com/v1.15.21/en/concepts/crews), [Flows](https://docs.crewai.com/v1.15.21/en/concepts/flows)

**Overlap and boundary.** It could supply a researcher/analyst/writer process inside an admitted Ploeg workload. Its use of the word “crew” does not make it the same object as a [De Vloer crew](../architecture.md#sessions-runs-and-handoffs). Adopting it requires an explicit runtime and result contract; defining cooperating roles alone does not establish external ticket authority or trustworthy approval.

**Our status.** **Not adopted or tested**; previously an [A2A ecosystem mention](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/research/2026-07-28-a2a-fit.md). **Confidence: high** on the documented concepts; **medium** on reuse for non-coding work. This review has not assessed CrewAI's separate commercial platform as a full replacement.

## Corrections leadership should carry into the architecture discussion

The July [dedicated-dispatch ADR](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/adrs/0005-build-a-dedicated-dispatch-plane.md) says Kandev has no Kubernetes runtime. The current [executor guide](https://kandev.ai/docs/k8s) contradicts that historical claim. The same ADR's blanket dismissal of forge-native agents for self-hosted stacks is too broad: GitHub supports [self-hosted execution runners](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment), while GitLab has [self-hosted model options](https://docs.gitlab.com/administration/gitlab_duo_self_hosted/). Those options have different hosting and licensing boundaries; they should not be merged into one claim. This research flags the records for reconsideration and does not silently change accepted decisions.

The strongest evidenced gaps are specific: GitHub's repository restriction; Coder's choice of its own harness; OpenHands' edition boundary; Kandev's declared experimental team features; and Paperclip's competing task authority. None demonstrates that the entire product ambition is unique. No comparison here proves that another product lacks the exact Vikunja/ClickUp → Forgejo workflow: that combination has not been tested in the shortlisted alternatives. [Earlier research limitations](market-sources.json)

**Architectural inference, medium confidence:** retain a clear owner of work and a clear human interface, while leaving their implementations replaceable. Temporal can sit behind the execution service; a framework can run a particular process; a different workbench can replace De Vloer's screens. If a complete alternative is chosen, replace the corresponding ownership together instead of maintaining two competing queues. This follows the direction of the [proposed one-work-authority decision](../adrs/0005-one-work-authority.md) and the implemented [execution contract](../contracts/ploeg-execution.md); it is not a procurement verdict.

The remaining decision is empirical: compare a small research task that can conclude “do not build,” and a small change to an existing repository, using the same identities, model route, intervention, review and recovery requirements. Measure setup and human review effort. Until that comparison exists, “our contracts fit our current stack” is supported; “building our own is cheaper or more capable” is not.

## Appendix: adjacent components and communication protocols

Owner clarification, 11 September: the intended boundary gives Ploeg **all AI execution**. Vloer also permits conversation without a ticket; ticket management stays external. Automatic repair of failed CI checks before human review is desired. These are product requirements, not claims of completed implementation. See the [ecosystem explanation](../landscape/index.md). Confidence below is **high** for documented capabilities and source status; replacement fit remains **medium**, without new integration trials.

**Argo Workflows versus Temporal.** [Argo](https://argo-workflows.readthedocs.io/en/latest/) coordinates Kubernetes container steps, dependencies, retries and artifacts; [Temporal](https://docs.temporal.io/workflow-execution) preserves application workflow history across failures and waits. Either could support Ploeg's internal execution process. Neither supplies our acceptance policy automatically. Argo adoption was declined in the [July decision](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/adrs/0005-build-a-dedicated-dispatch-plane.md#argo-workflows-as-the-substrate); Temporal remains a suggestion. Neither was trialled here.

**Agent Sandbox, Kata and KEDA.** [Agent Sandbox](https://github.com/kubernetes-sigs/agent-sandbox) manages workspace lifecycle and warm pools. [Kata](https://github.com/kata-containers/kata-containers) supplies isolation through virtual machines. [KEDA](https://keda.sh/docs/2.20/concepts/scaling-jobs/) adjusts worker capacity. These responsibilities can coexist. De Vloer's [Sandbox provisioner](../../src/runtime/sandbox.ts) is implemented but [unqualified on the cluster](../adrs/0013-sandbox-crd-placement-with-warm-kata-pools.md); the current deployment selects the [Pod provisioner](2026-09-11-ecosystem-implementation.md). A configured RuntimeClass is not an isolation assessment.

**kagent.** Its [current agent documentation](https://kagent.dev/docs/kagent/concepts/agents/) includes chat, tool approvals, agent delegation, memory and sandboxed execution. It overlaps coordination and human interaction, beyond low-level runtime management. The [July ADR](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/adrs/0005-build-a-dedicated-dispatch-plane.md#kagent--kars--agent-sandbox) considered it; no implementation or trial was found in either application's inspected source. Its blanket “wrong layer” dismissal needs reconsideration. Ploeg ownership under a kagent integration is an unresolved design question.

**OpenTelemetry and Langfuse.** [OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/) transports traces, metrics and logs; [Langfuse](https://langfuse.com/docs/evaluation/overview) supports evaluation datasets, scoring, experiments and CI regression gates. They can help judge performance and results; work authorization remains elsewhere. OpenTelemetry is [proposed](../design/platform-and-governance.md#8-retention-observability-and-release-recovery); Langfuse is documentation-reviewed here, with no application integration found. An evaluation gate does not itself implement automatic CI repair.

**MCP: tools and data.** [MCP](https://modelcontextprotocol.io/docs/learn/architecture) exposes discoverable tools, resources and prompts. A Ploeg/Vloer tool interface remains [proposed](../design/00-product-system-design.md#interoperability-without-pretending-everything-is-portable). Ploeg's [ACP session creation](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/harness/adapters/acp/acp.go) currently passes an empty MCP-server list; harness support alone does not demonstrate a configured integration.

**ACP: editor-to-agent interaction.** [Agent Client Protocol](https://agentclientprotocol.com/get-started/introduction) standardizes communication with coding agents. Ploeg's [adapter](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/pkg/harness/adapters/acp/acp.go) is implemented; De Vloer currently uses OpenCode HTTP. ACP does not allocate our business budget or own the work queue.

**A2A: communication between agent services.** [A2A](https://a2a-protocol.org/latest/topics/what-is-a2a/) supports discovery, messages and asynchronous task exchange between independently implemented agents. Ploeg [explicitly deferred adoption](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md). It remains relevant when an actual external specialist must participate; choosing it would still require our authorization and result rules.

**AHP: sharing a live session across clients.** [Agent Host Protocol](https://microsoft.github.io/agent-host-protocol/) synchronizes session state and actions. De Vloer's [0.9.0 host](../../src/ahp/host.ts) and [protocol tests](../../test/ahp.test.ts) are implemented. Desktop attachment remains [unqualified](../adrs/0012-agent-host-protocol-host.md). Session synchronization can coexist with Ploeg owning execution; adopting AHP does not transfer that authority to the editor.
