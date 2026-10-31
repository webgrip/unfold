---
type: how-to
audience: [operator, owner]
owner: unfold
last_verified: 2026-10-31
verified_by: "Read against public/start.js (the hand-off sheet, Take back), public/now.js and public/ploeg.js (Now rows, the Work Item page and its task chip), public/core/trackers.js, src/notify/triggers.ts, slack.ts, teams.ts and channels.ts (the task link in notices), src/task-providers/clickup.ts and src/flag-registry.json (client.sign-off); covered by test/trackers-view.test.mjs, test/start.test.mjs and test/notify-task-link.test.ts. Not checked against a real ClickUp Workspace."
---

# Working with Unfold from ClickUp

This guide is for project managers, developers and agency owners whose work lives in ClickUp. You keep planning in ClickUp. Unfold is where you follow the work an agent Team does on a task, and where you decide on the result. The words in **bold** are explained in the [glossary](../../../../docs/reference/glossary.md).

In short: you hand a ClickUp task to a **Team** by assigning the Team's ClickUp user. The Team works on it as a **Work Item** and ends with a pull request. You review that pull request and accept it or send it back.

## Once: connect ClickUp

An administrator does this part once, as [Connect a task system](task-connections.md#clickup) describes:

1. Connects your ClickUp List to Unfold, with Ploeg running its work.
2. Gives each Team a ClickUp user, such as `unfold-bronze`. Assigning that user is how a task reaches the Team.

If Unfold asks you to link your own ClickUp account, open **Settings › Linked accounts** and follow the steps. Until you do, that List shows you no tasks.

## Hand a task to a Team

You can do it from ClickUp or from Unfold. Both do the same thing.

* **In ClickUp:** assign the Team's ClickUp user to the task.
* **In Unfold:** open **Now**. Under **Up next** you see your open ClickUp tasks, with their own task id, such as `WEB-12`. Choose one. The hand-off sheet shows:
  * whether the task is ready for an agent, such as whether its description says when it is done;
  * the Teams that can take it, with how busy each one is;
  * **In ClickUp**: which ClickUp user it assigns, and that it leaves a comment on the task;
  * **Next**: Ploeg queues it, and a worker starts it when one is free;
  * **Take back**: how to undo it.

  Choose **Hand to** and the Team's name. Unfold confirms which ClickUp user it assigned.

A task works best with a clear description and the conditions that tell when it is done. The sheet has a link to open the task in ClickUp, so you can improve the description first.

## Take it back

Until a worker starts the task, choose **Take back** on Now or on the Tasks page. Unfold removes the Team's user from the task in ClickUp again, and nothing was spent.

Once a worker has started it, open the Work Item and choose **Cancel**. That stops the running agents and withdraws the Work Item.

## Follow the work

* **Now** shows what waits for you first, then what runs and what finished. Every row names the task as ClickUp shows it, such as **ClickUp #86c0abc12** or **ClickUp WEB-12**, and has an **Open in ClickUp** button.
* The **Work Item page** shows the task's title, the Team and the ClickUp task at the top. Select the ClickUp chip to open the task in a new tab. The page says in plain words what happens next and what you can do.
* **Notifications** reach you in Slack, Microsoft Teams, ntfy or your browser when work needs you or a pull request is ready. Each one names the ClickUp task. In Slack, Microsoft Teams and ntfy it has two links, **Open in Unfold** and **Open in ClickUp**; a browser notice opens Unfold. You choose which ones you get on the Notifications page, as [Get notified](notifications.md) explains.

## When it needs you

When the agents stop and need a person, the Work Item moves to **Needs you** on Now. The row says why in one sentence and what to do, for example:

* an agent asks a question: choose **Answer** and reply on the Work Item page;
* the attempt ran out of budget or tries: choose **Try again**, and add a note for the next attempt if it helps;
* something in the cluster failed: choose **Check Status** before you try again.

If a list cannot load, Unfold shows an error code, such as `task_not_found`. Quote it when you ask for help; [Error codes](../contracts/error-codes.md) says what each one means.

## Review, accept or send back

When the Team finishes, the Work Item shows as **Ready for review** with its pull request. The **review walkthrough** on the Work Item page explains, step by step and with screenshots where there are any, what the agent changed. An agent's review is evidence for you, not a decision.

You decide on the forge, in the pull request:

* **Accept**: approve and merge it. That is **Acceptance**: the Work Item is done.
* **Send back**: request changes. The same Team does a fix round on the same branch.
* **Close without merging**: the Work Item comes back to you under Needs you.

Unfold never merges for you.

## Client Sign-off

When your agency has the Client Sign-off feature turned on, someone at the agency can record what the Client thought of a pull request, on the Client's behalf: **looks good** or **needs changes**. A **Client Sign-off** is input to your Acceptance, never Acceptance itself: it merges nothing and changes nothing in ClickUp. It holds for the pull request as it was when it was recorded; a newer commit sets it aside, and the Client is asked again.

## What Unfold does not show yet

* The ClickUp status and the people assigned to a task are not on the Work Item page yet; open the task in ClickUp to see them.
* Apart from the comment it leaves when you hand a task off, nothing writes progress back to the ClickUp task yet. Follow progress in Unfold or through notifications.
