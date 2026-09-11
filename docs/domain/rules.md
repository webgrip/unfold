# Business Rules — Ploeg and Vloer

*Generated from `model.yaml` — do not edit by hand. Cite rules by id in specs.*

## Budget

### R6

An unknown or pending charge must not be described as zero spend against a Budget.

**Why:** Missing cost data cannot justify more expenditure.

**Also applies to:** Execution

## Evidence

### R5

Evidence of executed checks is distinct from an Agent's assertion that checks passed.

**Why:** A reviewer needs an inspectable basis for accepting a result.

**Also applies to:** Agent, Review

## Execution

### R4

A completed Execution does not by itself prove that its Result is accepted or released.

**Why:** Finishing a process, accepting its output, and changing production are separate decisions.

**Also applies to:** Result, Review

## Model

### R2

A Model and Harness are implementation choices behind the working experience.

**Why:** People should not have to change their way of organizing work merely to change an AI tool.

**Also applies to:** Harness, Session

## Result

### R10

Software Results go through automated checks and Agent Review before a person is asked to accept them.

**Why:** Human reviewers should receive prepared results with unresolved failures made explicit.

**Also applies to:** Agent, Review, Evidence

### R11

A person initially accepts Results; automatic acceptance requires a separately agreed rule.

**Why:** Responsibility for accepting work must be explicit while the process is being established.

**Also applies to:** Review

## Ticket

### R1

A Ticket can supply a Workload's intended outcome; an Execution records an attempt to perform the Workload.

**Why:** Retrying work must not erase the request or hide the earlier attempt.

**Also applies to:** Workload, Execution

### R3

A research Result may satisfy its Ticket with convincing Evidence and a conclusion not to build.

**Why:** A rejected business case should stop unnecessary implementation and design work.

**Also applies to:** Result, Evidence

### R9

In projects with automatic repair enabled, failed CI creates a Repair Subticket and agents repair it before human Review, regardless of who wrote the change.

**Why:** The repair must be visible without replacing the original requested outcome.

**Also applies to:** Repair Subticket, Evidence

## Workload

### R7

A Workload may begin as an open conversation without a Ticket or repository.

**Why:** Asking questions and exploring ideas are supported work in their own right.

**Also applies to:** Ticket, Session

### R8

Ploeg is responsible for every Workload's Execution, including work a person steers live through Vloer.

**Why:** Human participation should not create a competing execution owner.

**Also applies to:** Execution, Session
