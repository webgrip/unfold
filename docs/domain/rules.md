---
type: reference
audience: [owner, integrator, contributor, agent]
owner: unfold
generated_by: "mise run domain"
---

# Business Rules — Unfold

*Generated from `model.yaml` — do not edit by hand. Cite rules by id in specs.*

## Agency

### R16

Intended behavior — Unfold never merges a pull request or deploys to production. A Preview Environment never receives production secrets.

**Why:** Unfold's responsibility ends at a reviewed pull request and its preview; production stays with the Agency.

**Also applies to:** Preview Environment, Acceptance

## Binder

### R18

Intended behavior — a Binder is visible only to its owner, team pages only to the team, and a Client sees team aggregates only, never a named person's history.

**Why:** Person-level views invite appraisal use, profiling and client pressure on named staff.

**Also applies to:** Run Card, Client

## Budget

### R6

An unknown or pending charge must not be described as zero spend against a Budget.

**Why:** Missing cost data cannot justify more expenditure.

**Also applies to:** Shift

### R14

Intended behavior — Ploeg refuses a Shift it cannot fund and never raises a Budget on its own. A Shift that reaches its Shift Budget stops and offers a split into new Work Items.

**Why:** A guaranteed ceiling on spend is what Agencies buy.

**Also applies to:** Shift, Size

## Client

### R15

Intended behavior — Unfold never contacts a Client directly; questions for a Client go through its Agency.

**Why:** The Agency owns the Client relationship.

**Also applies to:** Agency, Refinement

## Crack

### R19

Intended behavior — a Crack needs human confirmation by the fixer and one person who is not the Steward, and the Steward may dispute it. Ploeg may propose candidates but never applies a Crack on its own.

**Why:** Automatic bug-to-change tracing is wrong too often, and a wrong Crack on a signed card is a fairness incident.

**Also applies to:** Steward

## Delivery Fee

### R13

Intended behavior — the Delivery Fee is charged only on Acceptance. The Token Charge is charged for every attempt up to the Shift Budget, except attempts that fail through Unfold's own fault.

**Why:** The Agency pays for delivered work, and rejecting work is never free, so neither side profits from the other's mistakes.

**Also applies to:** Token Charge, Acceptance

## Evidence

### R5

Evidence of executed checks is distinct from an Agent's assertion that checks passed.

**Why:** A reviewer needs an inspectable basis for accepting a result.

**Also applies to:** Agent, Review

## Harness

### R2

A Model and Harness are implementation choices behind the working experience.

**Why:** People should not have to change their way of organizing work merely to change an AI tool.

**Also applies to:** Session

## Pack

### R20

Intended behavior — a Pack is earned, never bought. Its random pulls are cosmetic, drawn from published odds, and cannot be re-rolled or traded; a pull never changes a Grade, a Rarity or any metric.

**Why:** Randomness bought with money is the loot-box problem; cosmetic, earned and published pulls keep Packs clear of it.

**Also applies to:** Grade, Rarity

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

Ploeg is the Authority for every Run (system ADR-0002). Unfold requests Admission through Ploeg's API and never falls back to its own execution when Ploeg is unavailable, whatever the cause. Without Ploeg, Unfold runs only its deterministic demo, which makes no model calls. Current state — Unfold's standalone mode and its own engine remain until the migration to ploeg-worker is complete; no new execution features are added to that engine.

**Why:** One authority, one budget path and one revocable credential per Run; runner location does not decide who authorizes work.

**Also applies to:** Work Item, Session

## Run Card

### R17

A Run Card describes a change and never scores a person. Its state never changes what Ploeg authorizes, budgets or merges, and no shared view totals card data per person. Intended behavior — card data is never used in pay or performance reviews; Unfold states this in its terms and its works council pack.

**Why:** A record of a change makes people care about it; a score of a person gets gamed, and in the Netherlands it needs works council consent.

**Also applies to:** Steward, Grade

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
