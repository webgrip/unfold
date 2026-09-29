---
type: reference
audience: [owner, integrator, contributor, agent]
owner: glide
generated_by: "mise run domain"
---

# Glossary — Glide

*Generated from `model.yaml` — do not edit by hand.*

The [combined Glide glossary](../reference/glossary.md) lists every term of every model once, with its owner and the words it must not be confused with.

## Acceptance
*Context: Work*

The Agency's decision that a pull request delivers its Work Item. An explicit approval, a merge with or without review, or no decision ten working days after the pull request opened all count. Acceptance charges the Delivery Fee. A Client's feedback on the Preview Environment is input to it, not Acceptance itself.

**Do not use:** client acceptance, silent approval  
**Not to be confused with** [Review](#review): An assessment of a Result against its Acceptance Conditions; Acceptance is the Agency's decision that follows.  
**Not to be confused with** [Verdict](../reference/glossary.md#verdict): A reviewing Run's answer; Evidence for the Agency, never Acceptance.  
**See also:** [Delivery](#delivery), [Delivery Fee](#delivery-fee), [Review](#review), [Acceptance Conditions](#acceptance-conditions), [Agency](#agency)  

## Acceptance Conditions
*Context: Work*

The observable conditions a Result must satisfy to answer the requested work. They depend on the work; software tests alone cannot validate a business case. For a Client's work, the Client's Definition of Done supplies conditions and the Agency's own definition wins where they conflict.

**See also:** [Work Item](../reference/glossary.md#work-item), [Result](#result), [Review](#review), [Acceptance](#acceptance), [Client Profile](#client-profile)  

## Agency
*Context: Offering*

A business that uses Glide to build software for its Clients and pays for it. A freelancer, or an in-house team that is its own only Client, is an Agency too. An Agency reviews and merges every pull request and owns production. It uses Glide hosted, in its own Tenant, or self-hosted.

**Do not use:** customer, operator, reseller  
**Not to be confused with** [Tenant](#tenant): The isolated space that holds one Agency's work in hosted Glide.  
**Not to be confused with** [Client](#client): The Agency's own customer.  
**See also:** [Tenant](#tenant), [Client](#client), [Acceptance](#acceptance)  

## Agent
*Context: Execution*

A software participant that uses a model and tools to perform assigned work through a Harness. A named agent Role does not imply a separate running process.

**See also:** [Harness](../reference/glossary.md#harness), [Model](#model), [Role](../reference/glossary.md#role), [Run](../reference/glossary.md#run)  

## AHP
*Context: Tooling · Owner: Vloer*

Agent Host Protocol: Microsoft's JSON-RPC protocol that lets VS Code's Agent Host and other clients share agent sessions. Vloer implements an AHP host for its VS Code extension. Ploeg ADR-0006 keeps AHP out of Ploeg's harness boundary.

**Also known as:** Agent Host Protocol  
**See also:** [Vloer](#vloer), [Harness](../reference/glossary.md#harness)  

## Attention Path
*Context: Work*

A repository path whose changes need careful review, listed as a glob in .glide/attention or covered by CODEOWNERS. Agents may change it; a pull request that does is labelled and lists those files first.

**See also:** [Review](#review), [Diff Limit](#diff-limit)  

## Budget
*Context: Execution*

An authorized spending limit for work. It is separate from a provisional usage estimate and from the eventual reconciled charge. Ploeg holds the budget pool of each Shift. A Budget is named by what it limits: a Shift Budget (set by the Work Item's Size), a Client Budget (per Client per month, set by the Agency) or an Agency Budget (metered usage per month). Its cap is the limit amount, not a separate concept.

**Do not use:** cap (as a noun for a limit)  
**See also:** [Shift](../reference/glossary.md#shift), [Authority](../reference/glossary.md#authority), [Size](#size), [Client](#client), [Agency](#agency)  

## Candidate
*Context: Participation · Owner: Vloer*

The reviewable change Vloer captures from a Session's Workspace when its Crew stops: a Git bundle, a binary patch and a manifest, signed when the workbench key is available. It is ready, or unavailable with a reason. Capturing it never publishes or merges anything.

**Not to be confused with** [Delivery Candidate](../reference/glossary.md#delivery-candidate): Ploeg's immutable record of one canonical commit rebuilt from a Candidate on an approved base, used for verification and approval.  
**Not to be confused with** [Result](#result): What a Work Item delivers with its Evidence; a Candidate is one piece of that Evidence.  
**See also:** [Session](#session), [Workspace](#workspace), [Evidence](#evidence), [Review](#review)  

## Client
*Context: Offering*

An Agency's customer. A Client submits requests, answers Refinement questions, approves Quotes and gives feedback on Preview Environments in the Client Portal. Glide never contacts a Client directly.

**Do not use:** customer, end client, end customer  
**See also:** [Agency](#agency), [Client Portal](#client-portal), [Client Profile](#client-profile), [Quote](#quote)  

## Client Portal
*Context: Offering · Owner: Vloer*

The part of Vloer where Clients submit requests, talk to the refinement agent, approve Quotes and open Preview Environments through signed links. It shows the Agency's price; Glide's own charge is hidden unless the Agency shows it.

**Also known as:** Portal  
**See also:** [Client](#client), [Quote](#quote), [Vloer](#vloer)  

## Client Profile
*Context: Offering*

A Client's Definition of Ready, Definition of Done and extra instructions for agents. It ranks below the delivery contract, like repository instructions. The Definition of Done becomes Acceptance Conditions.

**See also:** [Client](#client), [Ready](#ready), [Acceptance Conditions](#acceptance-conditions), [Refinement](#refinement)  

## Credit
*Context: Billing*

The unit of the Delivery Fee: one Credit pays for one accepted S Work Item. Agencies buy Credits in bundles, and a Credit is always shown with its euro value. Paid Credits never expire while the account is active; promotional Credits can expire and are used first. Tokens and hosting are charged in euros, never in Credits.

**Not to be confused with** [Budget](#budget): An authorized spending limit, not something bought.  
**See also:** [Delivery Fee](#delivery-fee), [Size](#size)  

## Crew
*Context: Participation · Owner: Vloer*

Vloer's registered, reusable list of one to eight Roles that a Session runs in order. Each Role either writes or only reads, and may name its model; the final Role gives the review Verdict. An administrator registers crews in configuration and a person picks one when starting a Session. In Ploeg's language this is a Team. New text says Team; "Start crew" remains a Vloer interface label.

**Not to be confused with** [Team](../reference/glossary.md#team): Ploeg's manifest of Roles, budget and concurrency that claims a Work Item. Ploeg avoids "crew".  
**See also:** [Team](../reference/glossary.md#team), [Role](../reference/glossary.md#role), [Session](#session), [Step](#step)  

## Cutover
*Context: Release*

The switch from the old per-application repositories to Glide for releases and published documentation, including a first live pilot. Documentation publishing has moved to Glide; release cutover waits for its own Qualification.

**See also:** [Qualification](#qualification)  

## Delivery
*Context: Billing*

A Work Item whose pull request received Acceptance. The Delivery Fee is charged per Delivery. The delivery rate is Deliveries divided by closed Work Items.

**Not to be confused with** [Delivery Candidate](../reference/glossary.md#delivery-candidate): Ploeg's immutable record of one canonical commit prepared for verification.  
**See also:** [Acceptance](#acceptance), [Delivery Fee](#delivery-fee), [Work Item](../reference/glossary.md#work-item)  

## Delivery Fee
*Context: Billing*

The part of a Work Item's price paid in Credits, charged only on Acceptance. A Shift that ends without a Delivery returns its Credits.

**See also:** [Credit](#credit), [Token Charge](#token-charge), [Acceptance](#acceptance), [Delivery](#delivery)  

## Diff Limit
*Context: Work*

The most changed lines and files a Size allows in one pull request, counted without tests, lockfiles and generated files. A Shift that would exceed it stops and proposes a split into Follow-Ups.

**Do not use:** diff budget  
**Examples:** S: at most 150 lines in 5 files.  
**See also:** [Size](#size), [Follow-Up](../reference/glossary.md#follow-up), [Attention Path](#attention-path)  

## Evidence
*Context: Work*

Inspectable material supporting a claim about a Result or a Run, such as cited research, an actual change, or the output of an executed check.

**See also:** [Result](#result), [Review](#review)  

## Glide
*Context: System*

The product and the monorepo that holds Vloer and Ploeg. A person creates a work item and assigns it to agents; the agents do the code work until a pull request is ready for a person to review and merge. Vloer and Ploeg remain separately deployable applications.

**See also:** [Vloer](#vloer), [Ploeg](#ploeg)  

## Markup
*Context: Billing*

The published percentage Glide adds to token and compute cost when billing an Agency. It depends on the Agency's tier, which is recalculated quarterly from its acceptance rate. The price an Agency charges its Client is the Agency's own and is not a Markup.

**See also:** [Token Charge](#token-charge), [Agency](#agency)  

## Model
*Context: Execution*

The trained system that generates responses from supplied input. Its responses are used by a Harness; the model is not the whole working agent.

**See also:** [Harness](../reference/glossary.md#harness), [Model Provider](#model-provider)  

## Model Provider
*Context: Execution*

The service that runs a model and answers inference requests. A provider can run outside the cluster that hosts an agent's files and tools.

**Examples:** Fireworks.ai; DeepSeek  
**See also:** [Model](#model), [Harness](../reference/glossary.md#harness)  

## OpenSpec
*Context: Tooling · Owner: Ploeg*

A spec-driven change workflow and CLI. Ploeg keeps its change proposals and specs under apps/ploeg/openspec; mise.toml pins the CLI. A Work Item can name a change with a description line "openspec: <change-id>"; its Run is then briefed from the change and handed off for review only when strict validation of the change passes.


## Placement
*Context: Participation · Owner: Vloer*

Where a Session's Workspace runs, chosen per Session from the backends a deployment enables: a container on the workbench host (docker), a pod in the cluster (kubernetes) or a working directory shared with the server (local). Omitted, it takes the deployment default. A demonstration lists no placements.

**See also:** [Session](#session), [Workspace](#workspace)  

## Ploeg
*Context: System · Owner: Ploeg*

Glide's execution engine and its only Authority. It takes work from trackers and from Vloer, admits it, sets its budget, controls who may write each branch and runs the agents. Dutch for a crew or shift team.

**See also:** [Vloer](#vloer), [Admission](../reference/glossary.md#admission), [Authority](../reference/glossary.md#authority), [Run](../reference/glossary.md#run), [Shift](../reference/glossary.md#shift)  

## Preview Environment
*Context: Work*

A running copy of one pull request's change, deployed with generated test data by a CI step in the Agency's own pipeline, to the Agency's infrastructure or to Glide's preview hosting in the Agency's Tenant. Its address is posted to the pull request and the Client Portal. It is deleted when the pull request merges or closes, or after an idle limit, and never receives production secrets.

**Also known as:** Preview  
**Do not use:** staging, review app  
**See also:** [Acceptance](#acceptance), [Client Portal](#client-portal), [Tenant](#tenant)  

## Qualification
*Context: Release*

Recorded, repeatable proof that a component or path works as required before anyone relies on it. For example, `mise run integration` qualifies the execution paths with a deterministic fixture, no model calls and no spend. A qualification record states what it did not cover.

**See also:** [Cutover](#cutover)  

## Quote
*Context: Billing*

A Work Item's Size and the Agency's price for it, drafted by Refinement and approved by the Client or by the Agency on its behalf. A Work Item with a Client waits as proposed until its Quote is approved.

**See also:** [Size](#size), [Refinement](#refinement), [Client](#client), [Ticket](#ticket)  

## Ready
*Context: Work*

A Work Item is ready when it states something we have decided to do, or describes a problem in enough detail that a solution can be formulated or at least conceived. Ready work can be given to agents. Work that is not ready can itself be given to agents whose job is to make it ready. A Client's Definition of Ready adds conditions for that Client's work; it never removes this baseline.

**See also:** [Work Item](../reference/glossary.md#work-item), [Acceptance Conditions](#acceptance-conditions), [Follow-Up](../reference/glossary.md#follow-up), [Client Profile](#client-profile), [Refinement](#refinement)  

## Refinement
*Context: Work*

Turning a request into a Ready Work Item with Acceptance Conditions and a proposed Size. A refinement Role does it, asks for missing information through the Agency, and cannot dispatch the Work Item. Its Ready Check tells the Agency, before any Shift spend, whether the Work Item is ready for agents. Sold on its own, it is request-to-quote.

**Also known as:** request-to-quote  
**See also:** [Ready](#ready), [Quote](#quote), [Size](#size), [Client Profile](#client-profile)  

## Result
*Context: Work*

What a Work Item delivers, together with the evidence needed to judge it. It can be a code change, a research conclusion, a design or another requested deliverable.

**Not to be confused with** [Outcome](../reference/glossary.md#outcome): Ploeg's terminal code for one Run, such as pr_opened or stuck.  
**See also:** [Work Item](../reference/glossary.md#work-item), [Evidence](#evidence), [Review](#review)  

## Review
*Context: Work*

An assessment of a Result against its Acceptance Conditions and supporting Evidence. A favorable assessment is distinct from releasing software to production.

**Not to be confused with** [Verdict](../reference/glossary.md#verdict): A reviewing Run's approve or request_changes answer. It is Evidence for a Review, not acceptance.  
**See also:** [Result](#result), [Acceptance Conditions](#acceptance-conditions), [Evidence](#evidence), [Verdict](../reference/glossary.md#verdict)  

## Session
*Context: Participation · Owner: Vloer*

Vloer's continuing record of a person's interaction around work: instructions, questions, actions and results. Closing a browser does not erase it. A started session is linked to one Ploeg Work Item, Shift and Run.

**Not to be confused with** [Shift](../reference/glossary.md#shift): Ploeg's whole attempt on a Work Item; Ploeg avoids "session" for it.  
**See also:** [Work Item](../reference/glossary.md#work-item), [Shift](../reference/glossary.md#shift), [Crew](#crew)  

## Size
*Context: Billing*

The class S, M or L that Refinement proposes for a Work Item and the Client approves in its Quote. A Size sets the Delivery Fee in Credits, the Shift Budget and the Diff Limit. There is no larger Size; Refinement splits work estimated above L.

**Examples:** S: 1 Credit, a €4 Shift Budget, at most 150 changed lines in 5 files.  
**See also:** [Quote](#quote), [Credit](#credit), [Budget](#budget), [Diff Limit](#diff-limit)  

## Step
*Context: Participation · Owner: Vloer*

A part of one Run that Vloer performs internally, such as one Crew role in a delegated Run. A Step is not a separate Ploeg Run and has no Lease or budget of its own.

**Do not use:** role run  
**Not to be confused with** [Run](../reference/glossary.md#run): One Role executing against a Work Item, authorized by Ploeg.  
**See also:** [Run](../reference/glossary.md#run), [Crew](#crew), [Vloer](#vloer)  

## Supervision
*Context: Participation · Owner: Vloer*

Whether a person is watching a Ploeg-authorized Session live (human) or has handed it back to run on its own (background). Switching it changes only who is paying attention; the same execution keeps running and no new Run starts. Standalone Sessions have no supervision setting.

**See also:** [Session](#session), [Run](../reference/glossary.md#run), [Authority](../reference/glossary.md#authority)  

## TechDocs
*Context: Tooling*

Backstage's documentation format: a static site built from Markdown by MkDocs with the techdocs-core plugin. `mise run docs-check` builds Glide's TechDocs output in strict mode.

**See also:** [Zensical](#zensical)  

## Tenant
*Context: Offering*

The isolated space in hosted Glide that holds one Agency's Work Items, Shifts, credentials, Preview Environments and Budgets: its own namespaces, default-deny network, sandboxed runtime and model budget. Ploeg records it on every Team, Work Item, Shift and credential. Clients are users inside a Tenant, never Tenants. Self-hosted Glide has no Tenants.

**See also:** [Agency](#agency), [Client](#client), [Preview Environment](#preview-environment)  

## Ticket
*Context: Offering*

The word Agencies and Clients use for a Work Item with a Quote. Use it only in the Client Portal, sales material and price lists. Everywhere else, including code and these docs, say Work Item: the unit of work is the Work Item, whatever its source.

**See also:** [Work Item](../reference/glossary.md#work-item), [Quote](#quote), [Tracker Item](../reference/glossary.md#tracker-item)  

## Token Charge
*Context: Billing*

The part of a Work Item's price charged for every attempt: model tokens and compute at cost plus the Agency's Markup, up to the Shift Budget. Rejected work still pays it; attempts that fail through Glide's own fault do not.

**See also:** [Delivery Fee](#delivery-fee), [Markup](#markup), [Budget](#budget)  

## Vloer
*Context: System · Owner: Vloer*

Glide's front end: the web workbench and VS Code extension where people start work, steer agents live and review evidence. It asks Ploeg to admit and run every Run. Without Ploeg it runs only a deterministic demo that makes no model calls. Dutch for "floor", as in shop floor.

**Also known as:** De Vloer  
**Examples:** Current state: Vloer's own engine still executes delegated Steps until the Glide ADR-0002 migration is complete.  
**See also:** [Ploeg](#ploeg), [Session](#session), [Step](#step)  

## Workspace
*Context: Execution*

The working environment containing the files and tools available to a Run. Its contents are separate from the ticket and from the decision to accept a Result.

**See also:** [Run](../reference/glossary.md#run), [Harness](../reference/glossary.md#harness), [Evidence](#evidence)  

## Zensical
*Context: Tooling*

The static site generator that renders Glide's published human pages from the same mkdocs.yml and Markdown sources. The builder image pins its version.

**See also:** [TechDocs](#techdocs)  

---

## Retired terms

Do not use these names as terms.

### Workload
*Use instead: [Work Item](../reference/glossary.md#work-item)*

A second name for the unit of work made every rule ambiguous about which record it meant.

### Repair Subticket
*Use instead: [Follow-Up](../reference/glossary.md#follow-up)*

A repair is work created by work; Ploeg's Follow-Up already names it.

### Execution
*Use instead: [Shift](../reference/glossary.md#shift), [Run](../reference/glossary.md#run)*

The attempt it named is a Shift, and one Role's part of it is a Run. A second name for a Shift would make every execution statement ambiguous. The word remains a bounded-context name and part of Ploeg's Operator Execution record.

## Terms owned by other models

This model uses these terms with their owners' meaning: [Admission](../reference/glossary.md#admission), [Authority](../reference/glossary.md#authority), [Follow-Up](../reference/glossary.md#follow-up), [Harness](../reference/glossary.md#harness), [Lease](../reference/glossary.md#lease), [Outcome](../reference/glossary.md#outcome), [Role](../reference/glossary.md#role), [Run](../reference/glossary.md#run), [Shift](../reference/glossary.md#shift), [Team](../reference/glossary.md#team), [Tracker Item](../reference/glossary.md#tracker-item), [Verdict](../reference/glossary.md#verdict), [Work Item](../reference/glossary.md#work-item).

## Decisions cited

- [Glide ADR-0002](../adr/adr-0002-ploeg-is-the-only-engine.md): Ploeg is the only execution engine and Vloer is its front end.
- [Glide ADR-0005](../adr/adr-0005-glide-is-offered-to-agencies.md): Glide is offered to agencies; delivery ends at a reviewed pull request with a preview.
- [Glide ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md): A Work Item with a Quote is the billing unit; the Delivery Fee is charged on Acceptance.

---

## Example dialogues

Short exchanges showing the terms used precisely at concept boundaries.

### Research can stop implementation
*Context: Work*

> **Developer:** Does this research Work Item require a prototype?
> **Product owner:** The Evidence establishes that we should not build. The Result is the supported conclusion to stop.
> **Developer:** Then Review should judge that Evidence against the Acceptance Conditions.

### What a model can do
*Context: Execution*

> **Developer:** Does changing the Model move the files to a new computer?
> **Platform engineer:** No. The Workspace holds the files. The Harness sends input to the Model Provider and runs permitted tools.
> **Developer:** So Model, Harness, and Workspace are separate choices for a Run.

### Run, Step and Shift
*Context: Participation*

> **Developer:** My Vloer session ran a planner, an implementer and a reviewer. Is that three Runs?
> **Platform engineer:** Today it is one delegated Run with three Steps inside Vloer. After the Glide ADR-0002 migration each Role executes as its own Ploeg Run.
> **Developer:** And the whole attempt, with its branch and budget?
> **Platform engineer:** That is the Shift. Only the writing Run holds the Lease on its branch.

### Acceptance, Review and the Client
*Context: Billing*

> **Agency developer:** The Client liked the **Preview Environment**. Is the Work Item accepted now?
> **Product owner:** No. The Client's feedback is input. **Acceptance** is our decision on the pull request, by approving it or merging it.
> **Agency developer:** And the reviewer Role's approve Verdict?
> **Product owner:** That is Evidence for our **Review**. Only our Acceptance makes it a **Delivery** and charges the **Delivery Fee**.

---

## ⚠ Flagged ambiguities

### a CI failure with no original ticket

Repair subtickets require a parent, but a human-written change may not already have an external ticket.

**Options:** Create a parent work ticket linked to the change, Attach repair to a project incident ticket  
**Recommendation:** Preserve a direct link to the failed change and agree the external parent-ticket rule.  

### limits on automatic repair

Repeated CI failures could create duplicate subtickets or consume an unbounded amount of work.

**Options:** One active repair subticket per failure with bounded attempts, A new subticket per failed check run  
**Recommendation:** Reuse an active repair subticket for the same failure and stop at agreed limits.  

### agents create and execute follow-up work

Creating a proposed ticket and authorizing its execution grant different powers.

**Options:** Agents propose and people authorize, Explicit project rules authorize bounded follow-up work  
**Recommendation:** Separate permission to propose from permission to spend and execute. Ploeg's Admission grants the second.  

### which decision records are required

Visibility into decisions needs a defined record beyond raw model messages and tool logs.

**Options:** Written decision with options and evidence, Transcript and actions alone  
**Recommendation:** Capture the decision, responsible person or rule, evidence, and expected consequence.  
