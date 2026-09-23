---
type: reference
audience: [owner, integrator, contributor, agent]
owner: glide
generated_by: "mise run domain"
---

# Business Rules — Glide

*Generated from `model.yaml` — do not edit by hand. Cite rules by id in specs.*

## Budget

### R6

An unknown or pending charge must not be described as zero spend against a Budget.

**Why:** Missing cost data cannot justify more expenditure.

**Also applies to:** Shift

## Evidence

### R5

Evidence of executed checks is distinct from an Agent's assertion that checks passed.

**Why:** A reviewer needs an inspectable basis for accepting a result.

**Also applies to:** Agent, Review

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

## Run

### R8

Ploeg is the Authority for every Run (Glide ADR-0002). Vloer requests Admission through Ploeg's API and never falls back to its own execution when Ploeg is unavailable, whatever the cause. Without Ploeg, Vloer runs only its deterministic demo, which makes no model calls. Current state — Vloer's standalone mode and its own engine remain until the migration to ploeg-worker is complete; no new execution features are added to that engine.

**Why:** One authority, one budget path and one revocable credential per Run; runner location does not decide who authorizes work.

**Also applies to:** Work Item, Session

## Shift

### R4

A finished Run or closed Shift does not by itself prove that its Result is accepted or released.

**Why:** Finishing a process, accepting its output, and changing production are separate decisions.

**Also applies to:** Run, Result, Review

## Work Item

### R1

A Work Item states the intended Result; each Shift records one attempt at it, and a failed Shift leaves the Work Item in place.

**Why:** Retrying work must not erase the request or hide the earlier attempt.

**Also applies to:** Shift

### R3

A research Result may satisfy its Work Item with convincing Evidence and a conclusion not to build.

**Why:** A rejected business case should stop unnecessary implementation and design work.

**Also applies to:** Result, Evidence

### R7

Intended behavior — a Work Item may begin as an open conversation without a tracker or repository; repository-free conversation is not implemented in the current session API.

**Why:** Asking questions and exploring ideas are supported work in their own right.

**Also applies to:** Session

### R9

Intended behavior — in projects with automatic repair enabled, failed CI creates a Follow-Up Work Item and agents repair it before human Review, regardless of who wrote the change. This general workflow remains unimplemented.

**Why:** The repair must be visible without replacing the original requested outcome.

**Also applies to:** Follow-Up, Evidence

### R12

Work can create work. A Run may produce new Work Items: it can split a Work Item into smaller ones, make unready work Ready, or record work it discovered. Each new Work Item names its source and is Ready or explicitly not. Implemented for Runs (Ploeg ADR-0031, proposed): created Work Items stay in Ploeg, wait as proposed until a person approves them unless the Team sets autoDispatch, and are bounded per Team by count, depth, open items and a budget pool. A failed check on a Ploeg pull request also creates a repair Follow-Up for a Team that opted in.

**Why:** Refining and dividing work is itself work; agents should do it under the same authority, budget and review as code.

**Also applies to:** Follow-Up, Ready, Run
