# Ploeg + De Vloer: market landscape and product opportunity

Research date: **9 September 2026**. Decision horizon: the next two product increments, followed by a new comparison before a commercial launch.

This document separates **documented competitor behavior**, **current repository evidence**, and **proposed product strategy**. Competitors were researched through their own repositories, documentation, product pages and pricing pages. They were not deployed or benchmarked for this study. A documented feature is not an independently verified security guarantee. The source ledger is [market-sources.json](market-sources.json). De Vloer's actual validation remains in [validation.md](../validation.md).

## 1. The decision

There is a credible product opportunity, but “a dashboard for remote, model-independent coding agents” is already a crowded category. The stronger proposed position is:

> An open delivery control plane for teams working across client repositories: turn approved tickets into reviewable changes, with reusable procedures, accountable costs, and human control from the tools people already use.

The initial audience should be agencies and internal platform teams managing several clients, repositories, forge instances, environments and commercial boundaries. The buyer is likely a CTO or platform lead; the everyday users are developers and reviewers; product owners need progress and acceptance evidence. This is a **customer hypothesis**, grounded in the initiating team's workflow, not measured market demand.

Ploeg and De Vloer should earn a place by making the difficult boundary crossings reliable: tracker to dispatch, dispatch to isolated work, work to evidence, evidence to review, and review back to the original ticket. They should accommodate different harnesses without pretending their native conversations are interchangeable. They should preserve existing priorities instead of creating a second managerial universe that everyone has to keep synchronized.

Build the narrow workflow and evidence layer. Reuse model gateways, coding harnesses, identity providers, forges, workspaces and IDE capabilities wherever practical. Run a serious buy-versus-build comparison against Kandev, OpenHands and Coder before expanding into a general development environment. The work already invested in De Vloer is not, by itself, a reason to keep building.

## 2. What changed enough to invalidate older comparisons

Several findings materially change the competitive story:

- **OpenHands now presents Agent Canvas as a self-hosted, multi-harness control center with remote backends and automations.** Comparing only the old single coding-agent interface understates the overlap. Its application, SDK, TypeScript client and automation service have separate repository responsibilities. [OpenHands repository](https://github.com/OpenHands/OpenHands).
- **Kandev documents a per-session Kubernetes executor.** Its README still discusses a Kubernetes operator as future work, but an operator and a Kubernetes executor are different capabilities. The dedicated guide describes Pods, workspace storage and resource recovery. “Kandev cannot run agents on Kubernetes” is therefore not a defensible claim. [Kandev Kubernetes guide](https://kandev.ai/docs/k8s).
- **Coder has a native self-hosted coding agent and orchestration surface**, not only remote development workspaces. [Coder Agents](https://coder.com/docs/ai-coder/agents).
- **Continue is no longer an independent maintained platform choice.** Its site announces acquisition by Cursor; its repository says it is read-only, no longer actively maintained, with a final 2.0.0 release. Earlier Mission Control material is historical inspiration. [Continue announcement](https://continue.dev/), [Continue repository](https://github.com/continuedev/continue).
- **GitHub Copilot supports self-hosted Actions runners.** Hosting the execution environment yourself does not make the orchestration product independently self-hostable. [GitHub environment configuration](https://docs.github.com/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment).
- **GitLab Duo supports self-hosted models, including an offline deployment path with commercial conditions.** “GitLab forces every model call into a public SaaS” is an incorrect blanket comparison. [GitLab self-hosted models](https://docs.gitlab.com/administration/gitlab_duo_self_hosted/), [offline deployment](https://docs.gitlab.com/administration/gitlab_duo_self_hosted/offline_deployment/).

These changes are also a product requirement: publish a dated capability ledger and recheck it. An integration claim should identify the release, deployment mode and contract that were tested.

## 3. Compare the right layers

A model provider supplies inference. A coding harness performs the reasoning and tool loop. A workspace platform supplies compute, filesystem access and development tools. An orchestration product owns assignments, policy, state and coordination. A workbench owns the human experience. A tracker and forge own work planning and merge authority. Some products cover several layers; none of these labels guarantees the behavior of another layer.

“Open source,” “self-hosted,” “model-independent,” and “portable” are separate buying questions:

| Question | Evidence required in a procurement conversation |
| --- | --- |
| Can we continue operating the software? | License for the exact components, reproducible build, documented backup and restore, replaceable external services |
| Where does execution occur? | Workspace topology, operating-system and network boundary, lifecycle after disconnect and failure |
| Where does our data go? | Separate paths for Git, prompts, tool outputs, audit records, telemetry, identity and billing |
| Can we choose inference? | Supported gateway protocol, model capabilities, account requirements and restrictions on each selected harness |
| Can we change harness? | Explicit adapter contract and portable evidence; no unsupported promise of native context migration |
| Can our teams use it together? | Object authorization, organization boundaries, identity, secret scoping, operating support and documented limitations |
| Can it finish our actual workflow? | Ticket eligibility, durable claim, cancellation, check evidence, forge review and reconciled tracker state |

A local Git worktree avoids ordinary branch conflicts. It is not a security boundary between clients. An MCP connection exposes tools and context; it is not proof of durable ticket ingestion or exactly-once execution. Those distinctions should appear in the product, documentation and sales demonstrations.

## 4. Shortlist: products that should influence the decision

The entries below summarize official documentation, not this project's test results. “Not established” means the research did not establish that exact capability; it does not assert absence.

| Product | Source and deployment boundary | Ticket and coordination surface | Remote execution / IDE | Why it matters to Ploeg + De Vloer |
| --- | --- | --- | --- | --- |
| **Kandev** | AGPL-3.0; self-hostable workbench | Multi-step workflows, parallel tasks, integrations and task MCP | Local, Docker, SSH, Sprites; Kubernetes documented separately; integrated review/editor | Closest open workbench comparison; substantial functionality already exists |
| **OpenHands Agent Canvas / Enterprise** | MIT Canvas; commercial team/enterprise capabilities differ | Multi-harness conversations and automations | Local, remote and cloud backends; enterprise sandboxes and administration | Strong build-on or replace-workbench candidate |
| **Coder Workspaces / Agents** | Open-source workspace foundation; licensed product tiers | Native coding agent, subagents, API-driven work | Self-hosted workspaces; established editor access | Strong infrastructure partner and direct enterprise competitor |
| **Paperclip** | MIT; self-hosted orchestration | Company/project/goal hierarchy, tasks, budgets, approvals, routines | External runtimes and workspace integration | Broad orchestration competitor; challenges any “we invented governed agent teams” claim |
| **GitLab Duo Agent Platform** | GitLab product and license conditions; self-managed options | Agents, flows, sessions, issue-to-MR workflow | Editor extension; self-hosted model options | Important incumbent where GitLab already owns the delivery system |
| **GitHub Copilot cloud agent** | Commercial GitHub service | Issues, agent sessions, PR iteration, automations | Actions environment, including self-hosted runners; VS Code entrypoint | Low-friction incumbent for GitHub-only organizations |
| **Factory** | Commercial; cloud, hybrid and airgapped deployment patterns documented | Droids, subagents; broader Software Factory is private preview | CLI, app, remote environments and enterprise controls | Strong reference for delivery coverage and model/gateway governance |
| **Devin** | Commercial; team and enterprise offerings | Tickets, automations, playbooks and review | Cloud execution; enterprise deployment options | Strong outcome-oriented competitor; do not compare against old ACU-only packaging |
| **Cursor cloud agents** | Commercial cloud-agent service | Event/schedule automations and agent work | Remote computers plus editor integration | Establishes expectations for polished asynchronous developer UX |
| **OpenCode** | MIT coding harness | Native sessions and subagents; not the whole proposed delivery contract | Server API and IDE integration | Preferred initial execution component; can also be sufficient alone for simpler needs |

Sources for the matrix: [Kandev](https://github.com/kdlbs/kandev), [OpenHands edition comparison](https://docs.openhands.dev/enterprise/enterprise-vs-oss), [Coder pricing](https://coder.com/pricing), [Paperclip](https://github.com/paperclipai/paperclip), [GitLab](https://docs.gitlab.com/user/duo_agent_platform/), [GitHub](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent), [Factory deployment](https://docs.factory.ai/enterprise/network-and-deployment), [Devin integrations](https://docs.devin.ai/integrations/overview), [Cursor cloud agents](https://cursor.com/docs/cloud-agent), [OpenCode repository](https://github.com/anomalyco/opencode).

### 4.1 Kandev: the comparison that can stop unnecessary work

Kandev already combines workflows, heterogeneous agents, review, terminals, repository work and remote executors. Its documented import/export format is a useful reference for reusable team procedures. [Repository](https://github.com/kdlbs/kandev).

The detailed feature inventory is unusually valuable: authenticated team access and multi-tenancy are experimental, with explicit cross-organization and shared-runtime caveats; Office coordination and budgets remain in progress. It describes the Kubernetes executor as dependency-bound and distinguishes it from experimental control-plane deployment. These are version-specific qualifications, not a permanent product weakness. [Feature status](https://kandev.ai/docs/feature-status).

**Our inference:** Kandev may be a better base than rebuilding a general browser IDE. Test whether external tracker authority, exact client boundaries, LiteLLM attribution and a VS Code operator extension can be added without fighting its domain model. If yes, a Ploeg adapter or upstream contribution may create more value than a competing workbench. If no, document the concrete mismatch with a reproduction, rather than appealing to taste.

Borrow its visible review stages, task-level resource disclosures, and workflow portability concept. Do not copy source into this Apache-licensed repository without an explicit dependency and license decision. A separate deployment behind an adapter and a source-code fork are different product commitments.

### 4.2 OpenHands: an execution component and a full alternative

Agent Canvas supports multiple agent backends and ACP-compatible agents, while the SDK owns canonical execution APIs and the automation service owns scheduling and webhooks. That separation closely resembles the proposed Ploeg/workbench boundary. [Repository architecture](https://github.com/OpenHands/OpenHands).

Its edition comparison is essential: open Canvas has scheduled/polling automation and reachable-VM event triggers, while authentication, authorization, multi-user organizations and scalable isolated sandboxes are positioned in Cloud/Enterprise. The local Docker launch should not be confused with a complete shared tenant-isolation product. [Edition comparison](https://docs.openhands.dev/enterprise/enterprise-vs-oss). Enterprise advertises integrations, usage management and team controls. [Enterprise repository](https://github.com/OpenHands/enterprise).

**Our inference:** assess three options independently: use the SDK as a harness; use Canvas as an alternative operator surface; buy Enterprise. De Vloer should win only when its open workflow contract and operating fit matter more than the work required to build missing team capabilities. Avoid a custom OpenHands compatibility layer when the maintained client or SDK can carry the same responsibility safely.

### 4.3 Coder: do not rebuild a workspace platform casually

Coder Agents runs its own agent loop in the control plane, connects to workspaces for tools, supports subagents and configurable model providers, and persists chat separately from workspace lifetime. Its architecture deliberately keeps LLM credentials out of workspaces. Editors connect to those workspaces for human follow-up. [Coder Agents](https://coder.com/docs/ai-coder/agents).

Community licenses permit five concurrently active agents. AI Premium removes that cap using purchased Agent Time; its documentation describes usage reporting and special arrangements for airgapped cases. This is a licensing and operating boundary to evaluate, not proof that all source is freely available under the workspace license. [Licensing and usage](https://coder.com/docs/ai-coder/agents/licensing-usage), [workspace repository license](https://github.com/coder/coder/blob/main/LICENSE).

**Our inference:** a workspace-provider interface should allow Coder to replace low-level provisioning later. A team already running Coder should evaluate its native agent workflow first. De Vloer would need a compelling external-ticket, policy or evidence advantage to justify another control plane. Its current per-worker scoped inference key is a reasonable PoC boundary, but it must not be advertised as stronger than a design that keeps all inference credentials outside the workspace.

### 4.4 Paperclip: governed teams are not an exclusive idea

Paperclip describes company-scoped tasks, agent adapters, execution checkout, budget policies, approvals, recurring triggers, durable activity and portable organizations. Its explicit center is organizational work orchestration rather than pull-request review. [Repository](https://github.com/paperclipai/paperclip). The repository license is MIT. [License](https://github.com/paperclipai/paperclip/blob/master/LICENSE).

**Our inference:** the opportunity is not another simulated organization chart. An agency already has people, priorities, customers and a tracker. Ploeg can preserve those authorities while adding execution. If a customer actively wants agent-managed organizations and broad operational tasks, Paperclip may fit better. Borrow actionable blockers, budget allocation by work ownership, run identity and exportability as ideas. Preserve one scheduling owner and one recorded claimant; importing the visual metaphor must not introduce competing task managers.

### 4.5 GitLab and GitHub: the incumbent advantage

GitLab Duo Agent Platform documents custom/external agents, flows, sessions and a Developer Flow that turns issues into merge requests. It is generally available from GitLab 18.8, with feature and version conditions. [Platform](https://docs.gitlab.com/user/duo_agent_platform/). Its self-hosted path supports private models, with usage-based online licensing and an offline add-on path. [Self-hosted models](https://docs.gitlab.com/administration/gitlab_duo_self_hosted/).

GitHub's cloud agent can research, plan, modify a branch, create PRs and run from issues or VS Code; it uses Actions minutes and AI credits. Its documented workflow targets GitHub repositories, with one repository and branch per task. [Cloud agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent). Self-hosted runners are supported, but require explicit network controls and compatible ephemeral runners. [Runner configuration](https://docs.github.com/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment).

**Our inference:** if all work and code already live in one of these platforms, native adoption may be cheaper and clearer. The Ploeg proposition gets stronger when a service team needs Forgejo, GitLab and external client trackers together, with one procedure and separate commercial boundaries. Integration breadth alone will erode; reliable semantics and lower switching effort must be demonstrated.

### 4.6 Factory, Devin and Cursor: the experience bar

Factory's deployment documentation includes internal gateways, controlled infrastructure, airgapped operation and an enterprise EU region. Model independence and remote execution are therefore not exclusive open-source benefits. Its broader Software Factory delivery dashboard is explicitly **private preview**. [Deployment patterns](https://docs.factory.ai/enterprise/network-and-deployment), [Software Factory](https://docs.factory.ai/software-factory/overview). Custom droids have separate prompts, models and tool policy; skills and subagents are explicitly different constructs. [Subagents](https://docs.factory.ai/harness/subagents).

Devin documents native SCM and ticket integrations, programmatic session creation, reusable playbooks, and team-oriented review and automations. [Integrations](https://docs.devin.ai/integrations/overview), [billing mechanics](https://docs.devin.ai/admin/billing/self-serve). Its pricing page advertises multiple model providers and enterprise deployment options. [Pricing](https://devin.ai/pricing).

Cursor cloud agents and automations combine remote execution with scheduled and event-triggered work. Its documentation lists model-based usage billing and configurable spend limits. [Cloud agents](https://cursor.com/docs/cloud-agent), [automations](https://cursor.com/docs/cloud-agent/automations).

**Our inference:** these products establish the expected ease of use. “We have source code” will not compensate for a confusing handoff, missing progress, unexplained bills or unreliable cancellation. Borrow the flow of prepare, delegate, inspect, intervene and accept. Differentiate on the customer's delivery controls and freedom to replace components, while honestly conceding that a polished commercial system can be the right choice.

### 4.7 OpenCode and Claude Code: components, not equivalent products

OpenCode provides a documented HTTP server surface and IDE integration. Its MIT source and provider configuration make it a useful initial adapter boundary. [Server](https://opencode.ai/docs/server/), [IDE](https://opencode.ai/docs/ide/), [providers](https://opencode.ai/docs/providers/).

Claude Code Remote Control keeps the session executing on the originating machine; its browser/mobile surface controls that session. The current documentation restricts Remote Control to eligible subscription login and disallows gateway/proxy endpoints. This is different from its cloud execution product. [Remote Control](https://code.claude.com/docs/en/remote-control).

**Our inference:** somebody who only needs to supervise one trusted remote machine may require little more than an existing harness and secure remote access. Ploeg/Vloer makes sense when shared state, assignment, evidence, spending and handoffs become organizational work. Optional proprietary harness adapters can preserve developer choice, but the default usable path must remain open. Model compatibility, subscription eligibility and team authorization must be separate entries in the capability matrix.

### 4.8 Continue and Vibe Kanban: ideas with lifecycle caveats

Continue's former Mission Control direction emphasized reusable agents and source-controlled checks. The current project is no longer actively maintained, so it is an archive to study rather than a managed-platform recommendation. [Repository](https://github.com/continuedev/continue), [earlier agent concept](https://continue.ghost.io/what-are-continue-agents-any-workflow-your-teams-way/).

Vibe Kanban's official site says it is sunsetting and continuing as community-maintained open source. Its remote-access concept and review-oriented task experience remain useful references. [Official site](https://www.vibekanban.com/), [remote access](https://www.vibekanban.com/blog/remote-access).

**Our inference:** exitability should be a demonstrable product behavior. Users need their task definitions, Git changes, costs, evidence and run history exported in documented formats. A downloadable source repository does not automatically provide a usable exit path.

## 5. What De Vloer can claim today, and what must be earned

The current implementation is the reference, not the desired market position. This table deliberately avoids assigning planned features to v0.1.

| Claim | Current evidence | Additional proof before marketing it broadly |
| --- | --- | --- |
| Self-hosted human workbench | Browser UI, native service, durable sessions and events | Tested installation, upgrade, backup and restore on a supported environment |
| Remote agent execution | OpenCode/command adapters and Kubernetes provisioning implementation | Paid real-repository run on target cluster, cancellation and resource cleanup |
| Reusable crews | Sequential roles: optional writer then explicit reviewers | Versioned crew contracts, shared catalog, policy validation and evaluation data |
| Attributable model spending | LiteLLM key lifecycle and conservative reconciliation states | Live invoice/log reconciliation, expiry and in-flight spending tests |
| Ticket-to-reviewed-change delivery | Ploeg has dispatch context; De Vloer's existing connector is read-only | Durable ticket ingestion, eligibility, dispatch identity, forge publication and writeback |
| VS Code operator experience | Design and extension work are a new increment | Auth, navigation, event replay, diff review and parity tests with remote execution |
| Client isolation | Some object authorization and workspace boundaries | Explicit client tenancy, identity propagation, secret/network policy and adversarial tests |
| Self-improving platform | The repo can be an execution target | Candidate/stable separation, independent gates, rollout, rollback and no self-approval |
| Portable between harnesses | Adapter interfaces and artifact handoffs | Same contract demonstrated on two maintained open harnesses |

Source: [current architecture](../architecture.md), [validation](../validation.md), [HTTP contract](../contracts/api.md), and the executable implementation referenced there. “Crew” presently does not mean arbitrary parallel writers or autonomous organizational management.

## 6. The proposed wedge: client-aware delivery operations

A useful differentiator is a bundle of behaviors that customers experience together. None of the following should be claimed as unique in isolation.

**External authority stays legible.** The source ticket remains the place a product owner prioritizes and accepts work. De Vloer shows the authoritative tracker revision and the exact scope the agent received. A changed ticket can invalidate preparation or require an operator decision; it must not silently expand a paid run.

**A client is an operating boundary.** Repository permissions, model policy, budget ownership, artifact retention, network access and reviewer membership travel together. Selecting a ticket from another client should not reuse a broad credential or a previous conversation's context. The first product should use separate instances where strong shared tenancy has not been proven.

**Every returned change carries a compact evidence package.** Include the source work item, source revision, base and head commit, approved procedure version, checks, model/harness versions, incurred cost state, unresolved findings and acceptance owner. The decision should be understandable without reading every token of a transcript.

**The same work is controllable from several surfaces.** A developer sees a focused VS Code task view; an operator sees cross-repository work and interventions in the browser; a product owner sees a ticket update and preview link. They must observe the same session and authorization decisions, not three disconnected chat histories.

**Automation progresses through explicit permissions.** Start with suggested preparation, then operator-authorized execution, then unattended execution for a narrow class of eligible tasks. Merging or deployment remains a separate permission. Increase automation based on measured acceptance and failure behavior, not an arbitrary “autonomous” toggle.

**Reusable methods have provenance.** A crew or skill is reviewed, versioned and scoped to an organization or project. It declares inputs, tools, verification, cost policy and expected output. Users can export it. Shared methods should accumulate successful procedures rather than unexplained prompt folklore.

The resulting positioning is stronger than “AI teams”: **consistent delivery across fragmented client toolchains**. It connects developer freedom to a concrete organizational promise: less time setting up and supervising agent processes, and less time reconstructing what happened when a change arrives for review.

## 7. Product ideas to adopt, with acceptance tests

The following are design recommendations. Their usefulness remains to be tested in this product.

| Idea | Inspiration | Concrete Ploeg/Vloer behavior | Proof that it helps |
| --- | --- | --- | --- |
| Decision inbox | Review gates and human wait states in Kandev | Group unresolved permissions, questions, stale tickets and failed checks by next responsible person | Reviewer can identify their next action without reading a full transcript |
| Workflow-as-code | Kandev workflow portability; Continue's reusable definitions | Reviewed task/crew manifests with schema, digest, defaults and project overrides | Same manifest runs in development and team deployment without hand-editing prompts |
| Workspace readiness | Coder templates and Factory coverage | Preflight repository credentials, image, tests, gateway and policy before reserving paid work | Known configuration failure creates an actionable blocker before a model call |
| Evidence-first review | Existing forge review and commercial agent handoff | Open exact patch and check evidence in the editor with ticket acceptance criteria beside it | Reviewer can trace a failed criterion to a changed line/check |
| Real portability | ACP's client/agent interface separation | Capability-negotiated adapters and exportable handoffs | Same task can be intentionally continued by a second harness without claiming native-state migration |
| Budget as workflow state | Paperclip budget ownership and gateway policy | Reserve, authorize, reconcile and expose unknown costs separately | Duplicate events and restart do not double-charge the internal allocation ledger |
| Coverage map | Factory Software Factory preview | Show which repositories are prepared, verified, actively used or blocked | Platform lead can prioritize onboarding based on actual missing dependencies |
| Human takeover | Remote workspaces and cloud-agent iteration | Explicitly stop agent writes, preserve branch, open remote workspace, hand back after a checkpoint | No two writers modify the same workspace concurrently |
| Visible recovery | Durable orchestration patterns | Show last confirmed action, ambiguous outcome and available safe recovery choices | Crash injection produces no unexplained duplicate publication or model retry |
| Published compatibility ledger | Kandev's feature-status approach | Release-tagged supported/experimental/qualified matrix | A coworker can predict the limits before connecting credentials |

The protocol reference for the adapter idea is [Agent Client Protocol](https://agentclientprotocol.com/get-started/introduction). ACP standardizes editor/client communication with agents; it does not replace Ploeg's durable scheduling, workspace isolation, credentials or a tracker integration contract.

## 8. Build, adopt, integrate or buy

| Situation | Preferred decision | Why |
| --- | --- | --- |
| One developer wants remote OpenCode | Use OpenCode on a trusted remote host first | The organizational orchestration problem has not appeared yet |
| A team wants a broad multi-agent browser workbench now | Evaluate Kandev and OpenHands before extending De Vloer | Their existing surfaces may save substantial UI and lifecycle work |
| A company already uses Coder | Evaluate native Agents and a Ploeg/Coder adapter | Workspace, identity and IDE access are expensive to duplicate |
| GitHub-only or GitLab-only delivery with acceptable commercial terms | Trial the native agent workflow | Existing permissions, review and procurement may make adoption simpler |
| An agency has several forges, client trackers and spending boundaries | Pilot Ploeg + De Vloer's narrow delivery contract | The fragmented workflow is the proposed source of value |
| Agent organizations across many business functions | Compare Paperclip | That domain is broader than this repository's software-delivery scope |
| A customer needs supported enterprise controls immediately | Buy an established offering or fund an explicitly scoped qualification | A PoC is not a substitute for an operating team or contractual support |

Avoid implementing a new code editor, remote terminal protocol, model gateway, secret store, project tracker or general workflow engine just to keep everything under one logo. Own the task contract, dispatch semantics, human intervention, evidence and portability that the target users actually need.

Before a substantial second investment, run a **timeboxed bakeoff**. Suggested scope: twelve representative tickets across three repositories, including one external tracker and one self-hosted forge. Use comparable model families and cost limits where supported, randomize tool assignment, and preserve all results, including failures. A small sample is directional, not a statistical claim of model superiority.

Measure setup effort, time to first useful change, active human supervision, review time, accepted changes, rework after acceptance, failed-run cost, recovery behavior and operator confidence. Compare a native incumbent, one open workbench and Ploeg/Vloer. Treat source rights, data boundary and mandatory client controls as pass/fail requirements rather than points that a pretty UI can compensate for.

**Stop or change direction** if an existing tool satisfies the mandatory workflow and the custom layer produces no meaningful operator benefit; if integrations consume more time than users save; if realistic model costs overwhelm the value of accepted work; or if maintaining security boundaries exceeds available ownership. A successful result can be Ploeg integrations and procedures running on another workbench.

## 9. Pricing and economics without invented certainty

Prices are volatile and not directly comparable: seat access, model usage, agent compute, workspace compute and support may be separate. The following is a dated reference, not a customer quote.

| Offering | Verified public pricing fact on research date | Comparison caveat |
| --- | --- | --- |
| De Vloer v0.1 | Apache-2.0 repository; no software price set | Infrastructure, inference, integration and operating labor still cost money |
| Kandev | AGPL-3.0 source repository | Agent subscriptions/API access and infrastructure are separate |
| OpenHands | Open Source and hosted/commercial plans; BYOK supported | Enterprise deployment and team capabilities require edition review; obtain a quote |
| Coder | Community is free; AI Premium is custom | Five-agent Community concurrency; AI Premium Agent Time and infrastructure/inference must be accounted for |
| GitHub Copilot cloud agent | Paid Copilot access; Actions minutes plus AI credits | Included allocations and model-dependent consumption vary |
| GitLab Agent Platform | GitLab Credits and self-hosting license conditions | Offline and online purchasing differ |
| Cursor cloud agents | Model API-based usage pricing documented | Plan eligibility and automation scope affect billing |
| Devin | Pro $20/month; Max $200/month | Official Teams pages conflict on minimum-versus-base-fee wording; do not calculate a team quote from this study |

Pricing evidence: [OpenHands](https://www.openhands.dev/pricing), [Coder](https://coder.com/pricing), [Coder licensing](https://coder.com/docs/ai-coder/agents/licensing-usage), [GitHub costs](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent), [GitLab models/licensing](https://docs.gitlab.com/administration/gitlab_duo_self_hosted/), [Cursor billing](https://cursor.com/docs/cloud-agent), [Devin pricing](https://devin.ai/pricing), [Devin billing explanation](https://docs.devin.ai/admin/billing/self-serve).

Devin's pricing page presents an $80 team plan plus full developer seats; its billing explanation describes an $80 minimum satisfied by seats and credits. That discrepancy is recorded deliberately. Verify the checkout or written quote before using either interpretation. Old Core/ACU comparisons are especially unsafe here.

For our own pilot, track:

```text
cost_per_accepted_change =
  (inference_for_all_attempts
   + workspace_compute_and_storage
   + allocated_platform_operation
   + human_preparation_review_and_rework)
  / accepted_changes
```

A failed attempt belongs in the numerator. Unsettled model spend must remain an explicit uncertainty. Record human time separately before converting it to a loaded rate; otherwise the model's cheap tokens can conceal expensive review.

Illustrative decision arithmetic, **not measured performance or a market price**: forty accepted changes with thirty minutes less human handling each yield twenty hours of capacity. At an assumed €75/hour internal value, that is €1,500 of capacity. If inference, infrastructure and allocated operation add €700, the arithmetic leaves €800 before sales, support and product maintenance. If review time does not fall, the apparent benefit can disappear. Agencies must also decide how recovered capacity becomes client value or margin in an hours-based commercial model.

Do not sell “unlimited agents” or “guaranteed hard monetary ceilings.” Concurrency increases compute use and can saturate review. A gateway budget can still have in-flight requests and delayed accounting. Sell understandable limits and observable outcomes.

## 10. Commercial packaging and positioning hypotheses

Keep the existing Apache-2.0 project license for this planning increment. A license change is a separate decision; nothing in this report changes it. Consider these business options rather than assuming only seat-based SaaS works:

1. **Open-source workflow with paid deployment and support.** Sell a qualified installation, integration setup, upgrades, support and measured rollout. This best matches an early platform-consulting relationship.
2. **Managed single-customer deployment.** Operate an isolated instance in an agreed environment, with transparent infrastructure and model costs. This avoids making shared multi-tenancy a prerequisite for the first paid pilot.
3. **Paid workflow packs and qualification services.** Provide maintained connectors, acceptance procedures and integration certification while preserving an exportable contract. Avoid turning essential security and basic exitability into paywalls.
4. **Later hosted service.** Only after identity, tenant isolation, quotas, backups, incident response and support economics are proven. Hosting convenience must not make the documented self-host path unusable.

An AGPL-based product would express a different contribution and hosting strategy; dual licensing would introduce contributor-rights and operational decisions. Do not make either change incidentally while borrowing an upstream UI. Component licenses remain component-specific, and proprietary model/harness permissions remain independent of this project's license.

Use **Ploeg** for the execution/dispatch service and **De Vloer** for the human workbench. For external buyers, explain both under one plain category, such as “Ploeg — open agent delivery,” with De Vloer as its operator interface. Two unexplained Dutch names increase onboarding effort for an international audience. No trademark or domain clearance was performed by this study.

Candidate message hierarchy:

- **Promise:** approved tickets become changes your team can review and own.
- **Mechanism:** remote workspaces, reusable procedures, explicit human decisions and attributable cost.
- **Freedom:** keep your tracker, forge, models and deployment boundary.
- **Proof:** show the original ticket, the exact patch, executed checks, human acceptance and reconciled spend.
- **Invitation:** bring one repository and three bounded tickets to a measured pilot.

Avoid “autonomous software company,” “replace your developers,” “the only open alternative,” “zero lock-in,” “enterprise-ready” and unmeasured speed multipliers. The story is improved operating leverage for a real team. It must remain true when the agent fails and a person has to take over.

## 11. Discovery and go-to-market experiments

No TAM, market share, willingness-to-pay survey or independently verified customer outcome was established. Repository activity and marketing pages demonstrate supply, not demand. Validate the narrow audience before broad launch.

Run six to ten structured discovery conversations with platform leads, agency CTOs, senior developers and product owners from several organizations. Ask about the last three actual agent-assisted changes: how work was selected, where execution ran, who supplied credentials, how review worked, what failed, and how cost was allocated. Ask for examples rather than agreement with a pitch. Record whether the pain belongs to the user, budget holder or client.

A design-partner pilot should have one accountable operator, a small registered repository set, a spending cap, explicit data boundaries and an end date. Begin with low-risk documentation, focused regressions and reproducible maintenance. Include at least one failure-recovery exercise, one human takeover and one ticket revision while work is waiting. Success requires both accepted output and a workflow coworkers voluntarily use again.

Build launch material from those runs: a short screen recording that begins in the real tracker, a developer walkthrough from VS Code, a diagram of data boundaries, a comparison against the best-fitting incumbent, and a candid measured case study. Never reuse a client repository, screenshot or task description in public material without authorization. A synthetic public repository can demonstrate the mechanics while real outcomes are reported only in approved aggregate form.

Track qualified pilot requests, completed setup, first accepted change, repeat weekly use, reviewer return rate, support hours per customer and cost per accepted change. A thousand demo sessions with no repeat users is weak evidence. A small group repeatedly using the workflow on paid client work is much more informative, provided the human review and failure costs are visible.

## 12. Research limitations and next refresh

This study used official material available on the research date. Main-branch documentation can lead released binaries; pricing tables sometimes lose checkmarks when rendered as text; product pages can conflict. Where the exact capability or price could not be established, the uncertainty is explicit. No competitor was installed, no production boundary was penetration-tested, no commercial quote was obtained, and no market-size estimate was fabricated.

Before publishing comparison pages, recheck the source ledger, pin tested versions and run the representative bakeoff. Before making a strong differentiating claim, produce a reproducible example of the claimed advantage. Before choosing to build another generic feature, ask whether adopting an upstream component would let this team deliver its actual client workflow sooner.
