# VS Code extension: the 0.3 operator experience

> Design baseline: September 2026. This chapter preserves proposals and the original audit; some gaps have since closed. Check [current architecture](../architecture.md), [contracts](../contracts/ploeg-execution.md) and [open product choices](../landscape/questions.md) before treating a statement as current behavior.

Status: execution plan for the 0.3.0 extension, written 2026-09-09 against the shipped 0.2.0 baseline. The [IDE and operator experience design](ide-and-operator-experience.md) remains the product target; this document turns its editor sections into concrete, testable work for the current server API. Nothing here adds server capability. Every item projects existing routes in [the HTTP contract](../contracts/api.md).

## What the 0.2.0 extension gets wrong for an operator

The screenshot that prompted this plan shows a failed investigation session. The panel tells the operator the status, but it makes them work for everything else.

| Observed friction | Consequence |
| --- | --- |
| The status pill says **Failed**, the notice says **Execution needs attention**, and the tree says **Needs attention**; none of them say what to do next. | The operator reads three surfaces to learn "a reviewer did not approve; revise or re-review". |
| Run summaries are dumped as raw Markdown text (`## Investigation…`). | The most valuable evidence in the session is the hardest to read. |
| Decisions leave the panel: **Review request** opens a chain of Quick Picks. | Answering a question loses the surrounding context; a permission card cannot show scope. |
| One flat **Evidence** tab mixes diff, checks and handoff. | No per-file navigation, no pass/fail at a glance, no way to open the exact hunk. |
| Activity is newest-first, unfiltered, and shows every token part as its own event. | Streams are unreadable; tool output is truncated to text. |
| The tree shows title and status only. | No spend, no age, no active role, no pending decision, no children to navigate. |
| The status bar counts but does not act. | "2 need input" has no route to the oldest decision. |
| Instruction state is binary. | Sent instructions cannot be distinguished from drafts or unknown deliveries. |
| Updates arrive on a 5-second poll. | A running crew feels frozen; a decision appears late. |
| Multi-step creation has no back button. | One typo restarts six prompts. |
| Evidence documents get a fresh timestamped URI every time. | Reopening a diff opens another tab. |
| A window reload closes every session panel. | Context is lost on every extension update. |

## Principles that decide every trade-off

1. **State the situation and the next permitted action in one sentence.** Every session surface leads with it: tree tooltip, panel hero, notification body.
2. **Decide where you read.** Permissions and questions are answered inline, with their scope visible, confirmed before submission, and never granted by navigation or by Enter in a text field.
3. **Evidence is native.** Changes open as diff documents at the exact file; checks open as log documents; summaries render as safe Markdown. URIs are stable so tabs are reused.
4. **Live, and honest about it.** Open panels subscribe to the server event stream and fall back to polling. Every surface shows when the state was last observed.
5. **Nothing runs on the laptop.** The extension stays a thin client of the authenticated API. No new mutations, no retries of paid actions, no automatic application of patches.
6. **Native first, webview where it earns it.** TreeView, Quick Pick, status bar, notifications, walkthrough and documents carry orientation; the webview carries the one-session review surface.

## Workstreams

### W1 · Sidebar that orients

- Session items show repository, state, observed spend and age. Tooltips carry the status sentence and next action.
- Sessions expand into children: pending decisions, crew roles with status, retained evidence, the review candidate and the imported task. Each child opens the right thing.
- The activity-bar badge counts sessions waiting for this operator. Groups are ordered attention, running, ready, history; items within a group sort by last change.
- Inline actions per state: start when ready, resume when paused or interrupted, open decisions when waiting.
- `Vloer: Find Session` searches title, ID, repository and imported task. `Vloer: Review Next Decision` opens the oldest unresolved decision.

### W2 · Status bar that acts

- Warning background while decisions wait; the click target opens the next decision. Otherwise it shows running work and opens the sessions view.

### W3 · Notifications reserved for attention

- One notification per newly required decision, failure, interruption and reviewable completion, with a direct action. Nothing for tokens or tool completions. Configurable with `vloer.notifications`.

### W4 · Session panel rebuilt around review

- Hero: title, status, situation sentence, next action, primary control.
- Decision cards inline: permission scope from the adapter payload, **Allow once** prominent, **Reject** equally reachable, broader grant only when the adapter exposes patterns. Questions keep their option semantics and show a confirmation summary.
- Crew strip with the active role highlighted and per-role summaries rendered as safe Markdown.
- Tabs **Brief · Changes · Checks · Activity**. Changes lists files with added and removed line counts and opens the patch at that file. Checks shows pass, fail or expected-failure per artifact with its output. Activity is chronological, filterable, coalesces streamed text and folds tool output.
- Composer with four delivery states: draft on this device, sending, saved for next execution, delivery unknown. An explicit **pause first** option when a run is active.
- Budget card with authorized, observed and reserved amounts; administrators can authorize more from the panel.
- Freshness footer: live, polling or disconnected, with the last observed time.

### W5 · Live updates

- Open panels read `GET /api/sessions/:id/events` as server-sent events from the extension host and refetch the session snapshot on each burst. Polling continues as the fallback heartbeat. `vloer.liveUpdates` turns the stream off.

### W6 · Native evidence

- Stable `vloer-evidence:` URIs per artifact; content resolved on demand with the server's authorization. Diffs open with `diff` language at the requested file, checks with `log`, summaries with `markdown`.
- Copy session link, open the web dashboard, open the original task in its tracker (validated HTTPS only).
- Session panels are restored after a window reload.

### W7 · Guided creation

- New session and task import run in one multi-step flow with a back button and retained draft. Budget offers presets within the deployment limit. A final confirmation shows destination, repository, crew, runtime and authorization before anything is created.
- A Get Started walkthrough covers connect, browse tasks, start the crew, review evidence.

### W8 · Verification and release

- Client tests cover the event stream and budget route against the real server. Webview tests cover inline decisions, Markdown safety with hostile content, the changes file list, checks status, activity filtering and composer states.
- README, CHANGELOG, iteration notes and this plan are updated. Version 0.3.0. Package the VSIX and install it locally.

## Out of scope

Team handoff, review workspaces, tracker write-back, OAuth device login and side-by-side diffs with real base and head contents all need server work described in the design document and the [gap register](gap-register.md). They are not faked here.
