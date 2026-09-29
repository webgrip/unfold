---
status: proposed
date: 2026-09-30
decision-makers: Ryan Grippeling
review-by: 2026-10-30
---

# Vloer hands a tracker task to Ploeg by assigning the team's tracker user

## Context and Problem Statement

A person reading a Vikunja task in the editor wants to see whether Glide is already working on it, and to hand it to a Ploeg team in one step. Ploeg's only intake for tracker work is the Vikunja `task.assignee.created` webhook: assigning the tracker user that routes to a team queues the task for that team, and removing that assignee withdraws it while it is still queued. How should Vloer start Ploeg work on a tracker task without creating a second intake path or a second source of truth?

## Decision Drivers

* The tracker owns work content, priority and assignment. Ploeg owns dispatch and execution.
* One intake path, so a task handed off from Vloer behaves exactly like one assigned in Vikunja.
* Every mutation needs an authenticated identity and object authorization.
* A deterministic demo never invents Ploeg records or spend.

## Considered Options

* Vloer assigns the team's tracker user on the task, as the workbench's Vikunja account, and leaves a comment
* Vloer creates the Work Item through a new Ploeg operator route
* People keep assigning the task in Vikunja by hand; Vloer only shows the status

## Decision Outcome

Chosen option: "Vloer assigns the team's tracker user on the task, as the workbench's Vikunja account, and leaves a comment", because it reuses Ploeg's existing intake unchanged and keeps the tracker the visible record of who holds the task.

* **Routing.** Ploeg's `GET /operator/teams` reports each team's `assignees`, the tracker usernames that route work to it. Vloer offers only teams the signed-in person may use in Ploeg and that have an assignee.
* **Hand-off.** An operator or administrator hands an open task off after Vloer rechecks its revision. Vloer adds the assignee and a comment naming the team and the person. Repeating it changes nothing.
* **One team at a time.** Ploeg keys Work Items by tracker identity, so a second team's assignment could re-route live work. Vloer refuses a hand-off while another team's user is on the task or any Work Item for it is live, checking every team the Ploeg consumer sees, and refuses when Ploeg cannot answer.
* **Pinned boards.** Ploeg can pin a board to one team, which then receives every assignment on it. Ploeg reports these pins as `pinnedScopes`, and Vloer offers only the pinned team on such a board.
* **Take back.** Vloer removes the assignee only while every Ploeg Work Item for that task, in any team, is queued, withdrawn, done or stale. Started work is cancelled from the Ploeg view instead.
* **Status.** Vloer lists Ploeg's Work Items for the tracker identity through `work-items?provider&externalId`, with the latest Shift's branch and spend and a pull request link from checkpoints.

### Consequences

* Good, because Ploeg needs only additive read changes (`assignees`, `pinnedScopes`, the tracker-identity filter) and no new write route.
* Good, because the tracker shows the hand-off and its author, so nobody has to open Glide to know who holds a task.
* Bad, because the workbench's Vikunja token needs permission to add and remove assignees and to add comments, not just to read.
* Bad, because the comment is posted by the workbench's account and only names the person in its text. Vikunja cannot attribute it to them.
* Bad, because a hand-off is not confirmed until Ploeg's webhook runs. Status can show an assignment before Ploeg lists the Work Item.

### Confirmation

Proposed. The Vloer side is implemented and covered by `test/task-handoff.test.ts` against fake Vikunja and Ploeg servers. It is confirmed when a person hands a real Vikunja task to a team in a cluster pilot, Ploeg queues it from the webhook, and taking it back before dispatch withdraws it.

Re-evaluate if Ploeg gains a second tracker provider, or an operator route that creates tracker-backed Work Items directly.

## Pros and Cons of the Options

### Create the Work Item through a Ploeg operator route

* Good, because Vloer gets a synchronous answer with the Work Item ID.
* Bad, because it adds a second intake path whose deduplication has to match the webhook's, and the tracker no longer shows who holds the task.

### Assign by hand in Vikunja

* Good, because Vloer needs no write access to the tracker.
* Bad, because the person has to know which tracker user routes to which team, and leave the editor to do it.

## More Information

* [Task connections](../operations/task-connections.md#hand-a-task-to-ploeg) describes setup and token permissions; the [API contract](../contracts/api.md#hand-a-task-to-ploeg) lists the routes and refusals.
* [ADR 0018](0018-bind-tracker-imports-to-existing-ploeg-work.md) binds an interactive import to an existing Work Item; this decision creates that Work Item through the tracker.
* 2026-09-30 — Proposed with the Vloer implementation and Ploeg's additive `assignees` and tracker-identity filter.
