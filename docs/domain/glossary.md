# Glossary — Ploeg and Vloer

*Generated from `model.yaml` — do not edit by hand.*

## Acceptance Conditions
*Context: Work*

The observable conditions a result must satisfy to answer the requested work. They depend on the work; software tests alone cannot validate a business case.

**See also:** [Ticket](#ticket), [Result](#result), [Review](#review)  

## Agent
*Context: Execution*

A software participant that uses a model and tools to perform assigned work through a harness. A named agent role does not imply a separate running process.

**See also:** [Harness](#harness), [Model](#model), [Execution](#execution)  

## Budget
*Context: Execution*

An authorized spending limit for work. It is separate from a provisional usage estimate and from the eventual reconciled charge.

**See also:** [Execution](#execution)  

## Evidence
*Context: Work*

Inspectable material supporting a claim about a result or execution, such as cited research, an actual change, or the output of an executed check.

**See also:** [Result](#result), [Review](#review)  

## Execution
*Context: Execution*

An authorized attempt to perform a workload, with a recorded state and limits. A person may steer it live or allow agents to proceed within the agreed instructions.

**Do not use:** Ticket  
**See also:** [Workload](#workload), [Agent](#agent), [Budget](#budget), [Workspace](#workspace), [Session](#session)  

## Harness
*Context: Execution*

The program that manages the agent's conversation with a model and executes permitted tools. OpenCode is the harness on the tested Vloer path.

**See also:** [Agent](#agent), [Model](#model), [Workspace](#workspace)  

## Model
*Context: Execution*

The trained system that generates responses from supplied input. Its responses are used by a harness; the model is not the whole working agent.

**See also:** [Harness](#harness), [Model Provider](#model-provider)  

## Model Provider
*Context: Execution*

The service that runs a model and answers inference requests. A provider can run outside the cluster that hosts an agent's files and tools.

**Examples:** Fireworks.ai; DeepSeek  
**See also:** [Model](#model), [Harness](#harness)  

## Repair Subticket
*Context: Work*

An external ticket linked beneath the original ticket to track repair of a failed CI check. Its purpose is to restore the required behavior and passing checks.

**See also:** [Ticket](#ticket), [Acceptance Conditions](#acceptance-conditions), [Evidence](#evidence)  

## Result
*Context: Work*

The outcome produced by a workload, together with the evidence needed to judge it. It can be a code change, research conclusion, design, or another requested deliverable.

**See also:** [Workload](#workload), [Ticket](#ticket), [Evidence](#evidence), [Review](#review)  

## Review
*Context: Work*

An assessment of a result against its acceptance conditions and supporting evidence. A favorable assessment is distinct from releasing software to production.

**See also:** [Result](#result), [Acceptance Conditions](#acceptance-conditions), [Evidence](#evidence)  

## Session
*Context: Participation*

A continuing interaction around work, including instructions, questions, actions, and results. Closing one browser connection does not erase its record.

**See also:** [Workload](#workload), [Ticket](#ticket), [Execution](#execution)  

## Ticket
*Context: Work*

A recorded request for an outcome, including enough context and acceptance conditions to judge the result. It remains the same request if an execution fails.

**Also known as:** Tracker Item  
**See also:** [Result](#result), [Acceptance Conditions](#acceptance-conditions), [Workload](#workload), [Repair Subticket](#repair-subticket)  

## Workload
*Context: Execution*

AI work managed by Ploeg, with instructions, recorded activity, and results. It can begin as a conversation in Vloer without an external ticket.

**See also:** [Ticket](#ticket), [Session](#session), [Execution](#execution), [Result](#result), [Budget](#budget)  

## Workspace
*Context: Execution*

The working environment containing the files and tools available to an execution. Its contents are separate from the ticket and from the decision to accept a result.

**See also:** [Execution](#execution), [Harness](#harness), [Evidence](#evidence)  

---

## Example dialogues

Short exchanges showing the terms used precisely at concept boundaries.

### Research can stop implementation
*Context: Work*

> **Developer:** Does this research Ticket require a prototype?
> **Product owner:** The Evidence establishes that we should not build. The Result is the supported conclusion to stop.
> **Developer:** Then Review should judge that Evidence against the Acceptance Conditions.

### What a model can do
*Context: Execution*

> **Developer:** Does changing the Model move the files to a new computer?
> **Platform engineer:** No. The Workspace holds the files. The Harness sends input to the Model Provider and runs permitted tools.
> **Developer:** So Model, Harness, and Workspace are separate choices in an Execution.

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
**Recommendation:** Separate permission to propose from permission to spend and execute.  

### which decision records are required

Visibility into decisions needs a defined record beyond raw model messages and tool logs.

**Options:** Written decision with options and evidence, Transcript and actions alone  
**Recommendation:** Capture the decision, responsible person or rule, evidence, and expected consequence.  
