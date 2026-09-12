# Ploeg + De Vloer: design-partner and launch playbook

**Status:** proposed commercial plan and publication-ready draft copy, 9 September 2026. Nothing has been published, no customer has been contacted, and no pilot has been sold. Features described as planned remain planned until their release is qualified.

Read this alongside the [product and system design](../design/00-product-system-design.md), [78-ticket implementation backlog](../../backlog/README.md), [gap register](../design/gap-register.md) and [market research](../research/market-landscape.md). The [validation record](../validation.md) governs what a release can claim.

## 1. The initial proposition

**Ploeg helps teams turn approved engineering work into changes they can review and own. De Vloer is the workbench for steering that work.**

The intended result is consistent delivery across existing client toolchains: a ticket keeps its business context, execution happens remotely, a person can intervene, and the returned change carries evidence and attributable cost. The ambition is larger than the current prototype. The first sale should be a measured design-partner engagement that helps prove the missing delivery loop.

Do not sell a universal autonomous engineering platform. Sell an outcome that one team can evaluate: less setup and supervision for a bounded class of work, without losing control of review, credentials or spending. The customer keeps the authority to accept work and decide what ships.

Use one product story externally. Introduce Ploeg as the open delivery system, then explain De Vloer as its browser and editor workbench. Prospects should understand the job before learning component names.

## 2. Ideal first customer: a hypothesis to test

The strongest starting hypothesis is an agency or internal platform team responsible for several applications and delivery teams. Its engineers work across client repositories, trackers or forge instances. It already has CI, code review and a person who can own a small platform pilot. Its problem is repeated coordination and inconsistent operating practices around agents.

| Signal | Why it indicates a possible fit |
| --- | --- |
| Several client repositories have different access and spending rules | A shared procedure must preserve client boundaries |
| Developers use different coding agents | The team may value a common operating workflow without a mandated harness |
| Agents run in many laptop terminals | Remote execution and durable supervision may remove repeated setup |
| Reviewers reconstruct what an agent did from chat | A compact, candidate-bound evidence package may save human effort |
| The tracker, forge and deployment platform are already established | Integration can be more acceptable than migration |
| A platform lead owns identity, CI and Kubernetes | A controlled pilot can use existing operational capability |

These are qualification signals, not evidence of demand. A CTO's enthusiasm is insufficient if developers will not use the workflow or reviewers do not trust its output.

Deprioritize prospects who only need autocomplete, have no meaningful review process, require a fixed production SLA immediately, or are satisfied with their existing forge-native agent. Also decline an initial pilot that requires simultaneous support for every project, a shared environment for mutually untrusted clients, or automatic production deployment.

## 3. Three narratives for the buying group

**For developers:** “Give a bounded task to a remote workspace. Keep your editor. Return to the patch, checks and the next decision. When the task needs you, take over without rebuilding the context.” The proof is a smooth developer journey, including a failed run. Avoid turning the extension into another dashboard developers must manage.

**For the CTO and platform owner:** “Standardize how delegated work enters the delivery system. Keep repository, model and spending policy consistent, and measure human effort per accepted change.” The proof is an attributable work history, credible recovery and a maintainable operating model. More agent processes alone do not establish business value.

**For product owners and client budget holders:** “Your ticket stays the place where scope and acceptance live. You can see progress, blockers and the proposed outcome without understanding an agent transcript.” The proof is accurate tracker state and a clear acceptance decision. A completed agent session must never be presented as a shipped business outcome.

All three stories meet at one work item. Separate marketing promises for each audience will fail if the implementation creates disconnected histories or hides unresolved costs.

## 4. Landing-page copy: safe to use with the release labels intact

### Hero

**Your tickets. Your tools. A clearer way to delegate engineering work.**

Ploeg and De Vloer are an open-source delivery system in development for teams working across client repositories. Run agents remotely, steer the work from a shared workbench, and build toward a consistent path from approved ticket to reviewed change.

**Primary action:** Try the working prototype.

**Secondary action:** Discuss a measured team pilot.

### The problem

Your team already has a tracker, a forge, CI and a way to review code. Adding agents should reduce repeated setup and supervision. It should also make the resulting work easier to understand.

Ploeg handles dispatch. De Vloer gives people a place to inspect progress, answer questions and intervene. The design keeps business priorities in the tracker and merge decisions in the forge.

### What you can try today

The De Vloer prototype includes durable operator sessions, reusable sequential crews, instructions, permission responses, pause/resume/cancel, changes and check evidence. It includes OpenCode and command-runner adapters, LiteLLM credential lifecycle code and Kubernetes workspace provisioning code, with integration-specific qualification limits.

The included demonstration changes real code and runs real tests. It makes no AI calls. It is a reproducible way to inspect the operating workflow before connecting a model account or cluster.

**Read the validation record before connecting live infrastructure.**

### What the team is building next

A governed ticket-to-review loop across existing tools: authoritative ticket intake, one execution claim, immutable candidate evidence, independent verification, controlled publication, human takeover and consistent access from VS Code.

The VS Code companion is an early prototype surface; installation and supported actions must be checked against its release documentation. Complete ticket ingestion, team/client isolation and commercial operating guarantees are separate milestones.

### Why this direction

Keep your tracker and forge. Choose supported models and harnesses. Run work inside an execution boundary you control. Review the evidence and decide what ships.

These are the product's design commitments. The public backlog shows which controls exist, which are being qualified and which remain proposed.

### Pilot invitation

Bring one repository, a named reviewer and a few well-scoped tickets. Together, we will test whether delegated execution reduces setup, supervision and review effort in your actual workflow. The pilot includes failures and recovery, not only a successful demo.

### Short FAQ

**Is it production-ready?** It is a proof of concept with a working demonstration and documented validation. Production qualification and the complete delivery loop are work in progress.

**Can we keep our current coding tools?** The design uses adapters. Supported capabilities differ by harness; changing harness does not automatically migrate native conversation state.

**Does self-hosting keep every byte inside our network?** That depends on the configured model, repository services and other integrations. Review the documented data paths for the selected deployment.

**Does it replace ClickUp, Forgejo or GitLab?** No. The design connects execution to their existing work and review authority.

**Can we leave?** The project is Apache-2.0. A complete portable evidence/export contract is part of the implementation plan; source availability alone does not complete that exit path.

## 5. Public claims and required proof

| Say now | Say only after the named milestone |
| --- | --- |
| “Working open-source workbench prototype” | “Supported team deployment” after identity, restore, upgrade and operating qualification |
| “Remote execution integrations included; qualification documented” | “Qualified on your cluster” after actual scheduling, network, lifecycle and cleanup tests |
| “Designed to connect approved tickets to reviewed changes” | “Tickets automatically become review proposals” after an authoritative end-to-end connector test |
| “LiteLLM credential and accounting lifecycle” | “Client-attributable live spend” after real gateway reconciliation and failure cases |
| “Early VS Code companion” | “Complete editor/browser parity” after supported-action and reconnect testing |
| “Interchangeable adapter architecture” | “Portable workflow demonstrated on two open harnesses” after equivalent contract tests |

Never imply certification, zero data egress, perfect spending ceilings, seamless context portability or quantified productivity improvement without relevant evidence. Keep planned screenshots visually labeled. An interactive mockup must not be shown as a running customer environment.

## 6. A paid design-partner offer

The first paid offer should be a **fixed-scope implementation and evaluation engagement**, priced after discovery from actual work and support assumptions. It is not a promise that unfinished controls already exist. A prospective customer must see the qualification gaps and agree which are delivered within the engagement.

Suggested scope: one organization, one isolated deployment boundary, one registered repository initially, one tracker/forge path, a supported model gateway, two operators and a named reviewer. Expand to a second repository only after the first loop meets its acceptance gates. Include six to twelve bounded tasks, one budget-stop exercise, one interrupted run, one human takeover and one revised ticket. The numbers define an experiment, not capacity guarantees.

Deliver a deployment/configuration record, a supported-version list, retained evidence, a cost reconciliation, an operating walkthrough and an end-of-pilot recommendation. The customer receives exportable project materials and a clear continuation or removal path. Initial production changes remain outside the pilot unless separately and explicitly scoped.

Before any paid agent work, complete the applicable prerequisite tickets. M0 enables supervised dogfooding; M1 establishes trustworthy candidates and mutations; M2 establishes the governed ticket loop; M3 adds shared identity and takeover; M4 qualifies the customer pilot. The [backlog](../../backlog/README.md) defines dependencies. A calendar date does not waive a gate.

### Success gates agreed before starting

| Gate | Pass evidence |
| --- | --- |
| Work authority | Every attempt has one source work item, authorized revision and claimant |
| Candidate integrity | Reviewer sees exact base/head identity and complete change evidence |
| Verification | Required independent checks run against the candidate being reviewed |
| Operator control | Pause/cancel/takeover work without unexplained duplicate execution |
| Attribution | All paid attempts have attributable costs or explicitly unresolved reconciliation |
| Usability | Both operators independently complete the agreed workflow and identify the next action |
| Economics | Human handling and total cost are compared with the customer's recorded baseline |
| Continuation | Customer chooses repeat use for a defined task class, or the pilot stops with findings |

Set outcome targets with the customer after measuring its baseline. Do not preselect a percentage improvement to make the pitch attractive. Record unsuccessful tasks and review rework. A decision to use an existing tool instead is a valid evaluation outcome.

## 7. Pricing and unit economics hypotheses

Test three commercial structures: paid installation plus support, an operated single-customer deployment, and maintained integration/qualification services. Preserve the usable Apache-2.0 path. Avoid charging a fee that rewards unnecessary agent activity while hiding model cost.

A quote should separate discovery/setup, connector work, recurring platform operation, support assumptions, workspace infrastructure and inference. Where possible, inference uses the customer's gateway account with visible attribution. Define whether unused credits expire, who bears failed attempts and which support actions require authorization before they can create further paid work.

For the customer, measure total cost per accepted work item:

```text
(all attempt inference + compute + storage + allocated platform operation
 + preparation + review + rework) / accepted work items
```

For the supplier, measure contribution after actual delivery labor, support, infrastructure, third-party licenses and the maintenance reserve. Source availability does not make any of these costs disappear. A pilot that requires a custom engineer for every new repository is a service business until onboarding becomes repeatable.

The pricing hypothesis is that buyers will pay for a dependable operating workflow and maintained integration fit. No willingness-to-pay figure has been established. Use discovery and real proposals to test it. Do not derive a market price from competitor seat fees: those may bundle different model allocations, compute, features and support. The [market study](../research/market-landscape.md) records current pricing caveats, including contradictory official Devin Teams wording.

## 8. Proposed 30/60/90-day launch experiments

This sequence is a proposed experiment calendar. It is not a release commitment or an estimate that all 78 tickets fit in ninety days.

| Window | Experiment and deliverable | Decision gate |
| --- | --- | --- |
| Days 1–30 | Use the stable service to improve a candidate Vloer branch; complete prerequisite controls; conduct six to ten discovery conversations; prepare a clearly labeled demo and release evidence page | Continue if the recurring problem is specific, owned and expensive enough for a measured pilot |
| Days 31–60 | Run one internal pilot; compare a best-fitting incumbent and an open alternative on representative tasks; test tracker intake, evidence, review and recovery | Continue only if mandatory controls pass and the workflow improves handling or integration fit |
| Days 61–90 | Invite up to two qualified design partners; offer a scoped paid engagement; publish one authorized case study and versioned installation guide | Expand only with repeat usage, credible support economics and measured value |

Publish engineering evidence before broad acquisition campaigns: an issue-to-proposal walkthrough, a candid recovery demo, the compatibility matrix and a short explanation of data boundaries. Use a synthetic public repository for demonstrations until a customer authorizes other material.

Possible channels include existing engineering relationships, regional developer communities and platform-engineering discussions. These are proposed channels, not an outreach authorization. Start with a small invitation that asks for a real workflow problem, not mass messages claiming a finished enterprise product.

## 9. Discovery questions that qualify the opportunity

Ask for the last actual examples, then request artifacts only with permission.

1. Which three recent agent-assisted tasks were useful, and what happened after the generated patch?
2. Who selected the work, and where did its acceptance criteria live?
3. How much active time went into setup, supervision, review and repair?
4. Which client, repository or network boundary prevented wider use?
5. Who supplied credentials, and how were failed runs charged?
6. What does your current agent or forge integration already do well?
7. When a laptop closes or a process crashes, who recovers the work?
8. Can another developer understand and continue a task without its original operator?
9. Which checks and human decisions are mandatory before a merge?
10. Would one standard workflow help, or do projects intentionally require different methods?
11. Who owns platform operation and who can authorize a pilot budget?
12. What result would make you stop using the system after the pilot?

Record the observed workflow separately from proposed features. “We would like that” is weaker than a person bringing a repository, allocating reviewer time and agreeing to compare results.

## 10. Honest competitor objection responses

**“Why not Kandev?”** “You should evaluate it. It already offers a substantial multi-agent workbench, and its dedicated documentation includes Kubernetes execution. Our intended focus is a governed external-ticket, client-boundary and evidence workflow. If Kandev meets that workflow better, an integration may be the right outcome.” [Kandev Kubernetes](https://kandev.ai/docs/k8s), [feature status](https://kandev.ai/docs/feature-status).

**“OpenHands already does this.”** “There is significant overlap. Canvas and Enterprise have different collaboration and isolation boundaries. We will compare the edition that meets your requirements, then justify any custom layer with your actual integration and operating needs.” [OpenHands edition comparison](https://docs.openhands.dev/enterprise/enterprise-vs-oss).

**“We already have Coder.”** “Keep that investment in the comparison. Coder has its own agent and established workspaces. We would first test whether Ploeg needs only an adapter, or whether Coder's native workflow already covers the requirement.” [Coder Agents](https://coder.com/docs/ai-coder/agents).

**“Why not our forge's agent?”** “If your delivery fits its workflow and terms, it may be simpler. GitHub supports self-hosted runners, and GitLab supports self-hosted models. The proposed value here is consistency across different client systems, with explicit evidence and operating boundaries.” [GitHub environment](https://docs.github.com/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment), [GitLab models](https://docs.gitlab.com/administration/gitlab_duo_self_hosted/).

**“Is this cheaper than Cursor, Devin or Factory?”** “We have not established that. We compare all-attempt cost and human review effort for your tasks. A polished commercial tool may win. We also evaluate source rights, deployment and exit requirements separately from price.” [Comparison method](../research/market-landscape.md).

**“Can it improve itself?”** “The stable service can supervise work on a separate candidate branch. Independent checks, human review and the existing release pipeline remain in control. An agent does not approve or deploy its own change.” [Self-improvement design](../design/self-improvement.md).

## 11. Open-source and enterprise boundary

The repository remains Apache-2.0. This playbook proposes no license change. Basic operation, documented contracts and the ability to inspect and export work should remain usable without a vendor-hosted account. Commercial value can come from qualified releases, installation, integrations, operation and support.

Publish supported versus experimental capability by release. Define contribution review, security reporting, compatibility support and the ownership of connectors before recruiting outside contributors. A maintained upstream integration is preferable to quietly copying a competitor's code. Component licenses and proprietary harness permissions remain separate from this project's license.

Before commercial commitments, settle product ownership, contributor rights, brand availability and the relationship between personal and employer-funded work. No ownership or trademark clearance is asserted here. This is a concrete launch dependency, not a reason to pause reversible prototype development.

The immediate next commercial asset is an honest demonstration of one complete, governed workflow. The next engineering work comes from the linked backlog. Publish the result only with the implementation status, failure behavior and qualification evidence intact.
