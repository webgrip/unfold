---
status: accepted
date: 2026-09-22
decision-makers: Ryan Grippeling
---

# The unit of work is the Work Item, and work can create work

## Context and Problem Statement

Glide's documentation described its input as "tracker tickets", and the product model had three names for the thing being worked on: Ticket, Workload and Work Item. The owner's goal is not about tickets. It is about units of work: things we have decided to do, or problems described in enough detail that a solution can be formulated or at least conceived. A tracker is only one place such a unit is written down. What is the unit Glide works on, and where can it come from?

## Decision Drivers

* One name for the thing agents work on, whatever its source.
* A clear threshold for when work can be given to agents.
* Deciding, splitting and clarifying work is itself work that agents can do.

## Considered Options

* The Work Item is the unit of work, from any source, and Runs may create Work Items
* Keep Ticket as the product term and Work Item as Ploeg's record of it
* Keep tickets as the only input and treat decomposition as out of scope

## Decision Outcome

Chosen option: "The Work Item is the unit of work, from any source, and Runs may create Work Items", because it names the actual unit once and lets agents do the work of producing work.

* A **Work Item** is something we have decided to do, or a problem described well enough that a solution can be formulated or at least conceived. It can come from a tracker (a Tracker Item), from Vloer, or from other work (a Follow-Up).
* A Work Item is **Ready** when it meets that threshold. Work that is not Ready can be given to agents whose job is to make it Ready.
* **Work can create work.** A Run may split a Work Item, make one Ready, or record work it discovered. Each new Work Item names its source and states whether it is Ready ([Product R12](../domain/rules.md#r12)).
* The terms Ticket, Workload and Repair Subticket are retired in the [glossary](../reference/glossary.md).

### Consequences

* Good, because every rule and page refers to one unit.
* Good, because refining work gets the same authority, budget and review path as writing code.
* Bad, because agents that create work can flood the queue. Limits on depth, count and budget for created work must exist before Runs create Work Items unattended.

### Confirmation

Accepted, and partly implemented. The vocabulary and rules are in both domain models, and `mise run docs-check` fails when the generated glossary drifts from them. Ploeg has the `follow_up_created` Outcome and the `follow_up` origin, but no Run creates Work Items yet. That part is complete when a Run can create a Work Item that names its source, within configured limits, and the Work Item is dispatched like any other.

## More Information

* 2026-09-22 — The owner stated that Glide is about units of work rather than tickets, and that work can be to create work.
