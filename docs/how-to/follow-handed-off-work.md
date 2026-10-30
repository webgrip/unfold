---
type: how-to
audience: [owner, operator]
owner: unfold
last_verified: 2026-10-30
verified_by: "Written with the implementation: apps/unfold/public/core/handed-off.js, public/views/now.js, public/views/notifications.js, src/notify/ (handed-off.ts, service.ts, store.ts, preferences.ts, triggers.ts) and src/handoffs.ts. test/handed-off-view.test.mjs, test/notify-handed-off.test.ts and test/handoffs.test.ts cover the list, the notices and their dedupe; the browser flow scripts/browser/handed.mjs opens the card and answers a question at 390 px. Not checked: delivery to a real phone through a real push service or ntfy server."
---

# Follow the work you handed off, on any device

Use this when you hand work to agents from more than one place, such as the Unfold browser app, VS Code, Claude Code, ChatGPT or claude.ai, and want one place that shows all of it and tells you when it needs you. Result: Now lists everything you handed off, and your phone tells you when an item needs you or its pull request is ready.

Only Claude Code's terminal follows a hand-off itself, as an MCP task. The browser app works for every client, because Unfold records every hand-off with the person who made it and the app it came through ([system ADR-0037](../adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md)).

## See what you handed off

Open **Now**. The **Handed off by you** card lists your hand-offs, newest first per task or Work Item, with what needs you on top and pull requests ready for review next. Each row shows:

* the app you handed it off from, such as "From ChatGPT" or "From the browser";
* its Team and state, or **Not picked up yet** while Ploeg has not made a Work Item of it;
* why it waits, in the same words the rest of Now uses;
* a **Pull request** button once there is one, and what it spent so far.

Titles from the tracker and agents show as plain text. A task you took back, a task connection outside your Tenant and a Work Item outside your Teams are left out. The card stays hidden when you handed nothing off.

A hand-off made in the tracker itself, such as a label or an assignment set there, is not yours in Unfold's records. It shows on Now under its Team, not on this card.

## Get notified on your phone

1. Open Unfold in your phone's browser. On iPhone and iPad, add it to the Home Screen first (Share, then **Add to Home Screen**) and open it from there; Web Push only works for an installed web app on iOS.
2. Go to **Settings › Notifications**. If it says notifications are not on for you, ask an administrator to turn on the `notifications.push` flag for you.
3. Under **Channels**, choose **Subscribe this browser** for Web Push, or set up the ntfy app with the topic shown.
4. Under **Send to**, tick the channel, and save.

**Notify me about work I handed off** is on unless you turn it off. You get one notice when an item you handed off starts needing you, and one when its pull request becomes ready. A repeat of the same moment, such as an item going stale while it still waits on you, sends nothing new; the next notice comes after an agent has run again. Quiet hours hold these notices like any other.

A notice carries a fixed headline, the Work Item's number and its title cut to 120 characters, and a link to the Work Item. It never carries the question, the agent's text or any amount. If you also chose **A Work Item needs you** or **A pull request is ready for review**, you get the hand-off notice instead, not both.

## Answer from the notice

Tap the notice. Unfold opens the Work Item. Choose **Answer** under **Why this needs you**, type your answer and send it; the page works the same at phone width. A pull request notice leads to the same page, with the **Pull request** button to review it on the forge.
