---
status: proposed
date: 2026-10-29
decision-makers: Ryan Grippeling
review-by: 2026-10-30
---

# Unfold hands a tracker task to Ploeg by assigning the team's tracker user

## Context and Problem Statement

A person reading a Vikunja or ClickUp task in the editor or on the browser's Tasks page wants to see whether Unfold is already working on it, and to hand it to a Ploeg team in one step. Ploeg's intake for tracker work is the tracker's assignment webhook (Vikunja `task.assignee.created`, ClickUp `taskAssigneeUpdated`): assigning the tracker user that routes to a team queues the task for that team, and removing that assignee withdraws it while it is still queued. Ploeg routes a ClickUp assignee by username or email. How should Unfold start Ploeg work on a tracker task without creating a second intake path or a second source of truth?

## Decision Drivers

* The tracker owns work content, priority and assignment. Ploeg owns dispatch and execution.
* One intake path, so a task handed off from Unfold behaves exactly like one assigned in the tracker.
* Every mutation needs an authenticated identity and object authorization.
* A deterministic demo never invents Ploeg records or spend.

## Considered Options

* Unfold assigns the team's tracker user on the task, as the workbench's tracker account, and leaves a comment
* Unfold creates the Work Item through a new Ploeg operator route
* People keep assigning the task in the tracker by hand; Unfold only shows the status

## Decision Outcome

Chosen option: "Unfold assigns the team's tracker user on the task, as the workbench's tracker account, and leaves a comment", because it reuses Ploeg's existing intake unchanged and keeps the tracker the visible record of who holds the task.

* **Routing.** Ploeg's `GET /operator/teams` reports each team's `assignees`, the tracker usernames that route work to it. Unfold offers only teams the signed-in person may use in Ploeg and that have an assignee. On ClickUp an assignee's email also matches, as it does in Ploeg.
* **Hand-off.** An operator or administrator hands an open task off after Unfold rechecks its revision. Unfold adds the assignee and a comment naming the team and the person: HTML on Vikunja, plain text that notifies nobody on ClickUp. Repeating it changes nothing.
* **One team at a time.** Ploeg keys Work Items by tracker identity, so a second team's assignment could re-route live work. Unfold refuses a hand-off while another team's user is on the task or any Work Item for it is live, checking every team the Ploeg consumer sees, and refuses when Ploeg cannot answer.
* **Pinned boards.** Ploeg can pin a board to one team, which then receives every assignment on it. Ploeg reports these pins, Vikunja projects and ClickUp Lists, as `pinnedScopes`, and Unfold offers only the pinned team on such a board.
* **Take back.** Unfold removes the assignee only while every Ploeg Work Item for that task, in any team, is queued, withdrawn, done or stale. Started work is cancelled from the Ploeg view instead.
* **Status.** Unfold lists Ploeg's Work Items for the tracker identity through `work-items?provider&externalId`, with the latest Shift's branch and spend and a pull request link from checkpoints.
* **Where it shows.** The editor's task view and the browser's Tasks page show the same status and actions. On a connection Ploeg runs, the Tasks page offers the session import only for a task that continues a queued Work Item of the execution team. Any other task shows its Ploeg status instead of a binding warning, because a task nobody has handed over is the normal case, not a fault.

### Consequences

* Good, because Ploeg needs only additive read changes (`assignees`, `pinnedScopes`, the tracker-identity filter) and no new write route.
* Good, because the tracker shows the hand-off and its author, so nobody has to open Unfold to know who holds a task.
* Bad, because the workbench's tracker token needs permission to add and remove assignees and to add comments, not just to read. On ClickUp that is the personal token's whole account access.
* Bad, because the comment is posted by the workbench's account and only names the person in its text. Neither tracker can attribute it to them.
* Bad, because a hand-off is not confirmed until Ploeg's webhook runs. Status can show an assignment before Ploeg lists the Work Item.

### Confirmation

Proposed. The Unfold side is implemented and covered by `test/task-handoff.test.ts` against fake Vikunja, ClickUp and Ploeg servers, and the Tasks page's status rules by `test/tasks-view.test.mjs`. It is confirmed, per tracker, when a person hands a real Vikunja or ClickUp task to a team in a cluster pilot, Ploeg queues it from the webhook, and taking it back before dispatch withdraws it.

Re-evaluate if Ploeg takes work from a tracker by something other than assignment, routes it by a field other than the assignee (Ploeg ADR-0095 adds team labels), or gains an operator route that creates tracker-backed Work Items directly.

## Pros and Cons of the Options

### Create the Work Item through a Ploeg operator route

* Good, because Unfold gets a synchronous answer with the Work Item ID.
* Bad, because it adds a second intake path whose deduplication has to match the webhook's, and the tracker no longer shows who holds the task.

### Assign by hand in the tracker

* Good, because Unfold needs no write access to the tracker.
* Bad, because the person has to know which tracker user routes to which team, and leave the editor to do it.

## More Information

* [Task connections](../operations/task-connections.md#hand-a-task-to-ploeg) describes setup and token permissions; the [API contract](../contracts/api.md#hand-a-task-to-ploeg) lists the routes and refusals.
* [ADR 0018](0018-bind-tracker-imports-to-existing-ploeg-work.md) binds an interactive import to an existing Work Item; this decision creates that Work Item through the tracker.
* 2026-09-30 — Proposed with the Unfold implementation and Ploeg's additive `assignees` and tracker-identity filter.
* 2026-09-30 — Renumbered from 0024, which the redesign took. The browser's Tasks page gains the same status and hand-off, replacing the binding warning that every task on the Unfold board showed.
* 2026-10-29 — Extended to ClickUp, which Ploeg takes by the same assignment ([PR #674](https://forgejo.webgrip.dev/webgrip/unfold/pulls/674)).
* 2026-10-30 — Not extended to GitHub Issues, GitLab issues or Jira (OpenSpec change `jira-tracker`). Ploeg 0.2.0-rc.97 takes GitHub issues by an assignee in `PLOEG_GITHUB_TEAM_MAP`, but `GET /operator/teams` reports only the assignees of `teams.<team>.assignees` and `PLOEG_TEAM_MAP`, so Unfold cannot tell which GitHub login routes to a team. Ploeg has no GitLab or Jira tracker.
