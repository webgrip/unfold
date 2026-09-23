# Glossary — Glide

*Generated from `model.yaml` — do not edit by hand.*

The [combined Glide glossary](../reference/glossary.md) lists every term of every model once, with its owner and the words it must not be confused with.

## Acceptance Conditions
*Context: Work*

The observable conditions a Result must satisfy to answer the requested work. They depend on the work; software tests alone cannot validate a business case.

**See also:** [Work Item](../reference/glossary.md#work-item), [Result](#result), [Review](#review)  

## Agent
*Context: Execution*

A software participant that uses a model and tools to perform assigned work through a Harness. A named agent Role does not imply a separate running process.

**See also:** [Harness](../reference/glossary.md#harness), [Model](#model), [Role](../reference/glossary.md#role), [Run](../reference/glossary.md#run)  

## AHP
*Context: Tooling · Owner: Vloer*

Agent Host Protocol: Microsoft's JSON-RPC protocol that lets VS Code's Agent Host and other clients share agent sessions. Vloer implements an AHP host for its VS Code extension. Ploeg ADR-0006 keeps AHP out of Ploeg's harness boundary.

**Also known as:** Agent Host Protocol  
**See also:** [Vloer](#vloer), [Harness](../reference/glossary.md#harness)  

## Budget
*Context: Execution*

An authorized spending limit for work. It is separate from a provisional usage estimate and from the eventual reconciled charge. Ploeg holds the budget pool of each Shift.

**See also:** [Shift](../reference/glossary.md#shift), [Authority](../reference/glossary.md#authority)  

## Candidate
*Context: Participation · Owner: Vloer*

The reviewable change Vloer captures from a Session's Workspace when its Crew stops: a Git bundle, a binary patch and a manifest, signed when the workbench key is available. It is ready, or unavailable with a reason. Capturing it never publishes or merges anything.

**Not to be confused with** [Delivery Candidate](../reference/glossary.md#delivery-candidate): Ploeg's immutable record of one canonical commit rebuilt from a Candidate on an approved base, used for verification and approval.  
**Not to be confused with** [Result](#result): What a Work Item delivers with its Evidence; a Candidate is one piece of that Evidence.  
**See also:** [Session](#session), [Workspace](#workspace), [Evidence](#evidence), [Review](#review)  

## Crew
*Context: Participation · Owner: Vloer*

Vloer's registered, reusable list of one to eight Roles that a Session runs in order. Each Role either writes or only reads, and may name its model; the final Role gives the review Verdict. An administrator registers crews in configuration and a person picks one when starting a Session. In Ploeg's language this is a Team. New text says Team; "Start crew" remains a Vloer interface label.

**Not to be confused with** [Team](../reference/glossary.md#team): Ploeg's manifest of Roles, budget and concurrency that claims a Work Item. Ploeg avoids "crew".  
**See also:** [Team](../reference/glossary.md#team), [Role](../reference/glossary.md#role), [Session](#session), [Step](#step)  

## Cutover
*Context: Delivery*

The switch from the old per-application repositories to Glide for releases and published documentation, including a first live pilot. Documentation publishing has moved to Glide; release cutover waits for its own Qualification.

**See also:** [Qualification](#qualification)  

## Evidence
*Context: Work*

Inspectable material supporting a claim about a Result or a Run, such as cited research, an actual change, or the output of an executed check.

**See also:** [Result](#result), [Review](#review)  

## Glide
*Context: System*

The product and the monorepo that holds Vloer and Ploeg. A person creates a work item and assigns it to agents; the agents do the code work until a pull request is ready for a person to review and merge. Vloer and Ploeg remain separately deployable applications.

**See also:** [Vloer](#vloer), [Ploeg](#ploeg)  

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

A spec-driven change workflow and CLI. Ploeg keeps its change proposals and specs under apps/ploeg/openspec; mise.toml pins the CLI.


## Placement
*Context: Participation · Owner: Vloer*

Where a Session's Workspace runs, chosen per Session from the backends a deployment enables: a container on the workbench host (docker), a pod in the cluster (kubernetes) or a working directory shared with the server (local). Omitted, it takes the deployment default. A demonstration lists no placements.

**See also:** [Session](#session), [Workspace](#workspace)  

## Ploeg
*Context: System · Owner: Ploeg*

Glide's execution engine and its only Authority. It takes work from trackers and from Vloer, admits it, sets its budget, controls who may write each branch and runs the agents. Dutch for a crew or shift team.

**See also:** [Vloer](#vloer), [Admission](../reference/glossary.md#admission), [Authority](../reference/glossary.md#authority), [Run](../reference/glossary.md#run), [Shift](../reference/glossary.md#shift)  

## Qualification
*Context: Delivery*

Recorded, repeatable proof that a component or path works as required before anyone relies on it. For example, `mise run integration` qualifies the execution paths with a deterministic fixture, no model calls and no spend. A qualification record states what it did not cover.

**See also:** [Cutover](#cutover)  

## Ready
*Context: Work*

A Work Item is ready when it states something we have decided to do, or describes a problem in enough detail that a solution can be formulated or at least conceived. Ready work can be given to agents. Work that is not ready can itself be given to agents whose job is to make it ready.

**See also:** [Work Item](../reference/glossary.md#work-item), [Acceptance Conditions](#acceptance-conditions), [Follow-Up](../reference/glossary.md#follow-up)  

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

### Ticket
*Use instead: [Work Item](../reference/glossary.md#work-item), [Tracker Item](../reference/glossary.md#tracker-item)*

The unit of work is the Work Item, whatever its source. A tracker is one place a Work Item's text can live (a Tracker Item); Vloer and other Runs are others.

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

## Resolved ambiguities

- **shared execution implementation** — Glide ADR-0002 (2026-09-22) makes Ploeg the only engine, so no shared runner is needed. Vloer is to delegate execution to ploeg-worker and keep only its deterministic demo; that migration is not yet implemented.
- **local work without Ploeg** — Glide ADR-0002 chose Ploeg authority for every Run. Offline laptop use requires a running Ploeg; without it Vloer offers only the deterministic demo.
