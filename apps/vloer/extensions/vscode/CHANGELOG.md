# Changelog

## Unreleased

- Selecting a linked task opens a task view instead of a plain-text preview: the tracker description rendered as inert Markdown (Vikunja HTML is converted on the server), labels with their colours, assignees, priority and due date, and a **Glide** card that states whether Ploeg has the task, its state, attempts, spend and pull request.
- **Hand to Ploeg** from the task view: pick a team (the last one is remembered) and confirm; the workbench assigns that team's tracker user and comments who handed it over. Boards pinned to one Ploeg team offer only that team. **Take back** while the item is still queued. The view polls quickly for up to 90 seconds after a hand-off. A task whose description is too long opens shortened and says so.
- Ploeg tree rows open the matching task view when the workbench knows the tracker source; the inline icon still opens the Ploeg workbench. The tree shows the **Awaiting review** lane, says "1 role", marks paused teams, refreshes its snapshot every 30 seconds while visible and names the snapshot time.
- Linked Tasks rows show the tracker id, assignees and age, source rows show the repository name, and tooltips show readable text instead of raw HTML. Session rows show repository names.
- A single failed refresh no longer empties every view: the last state stays visible with a reconnecting notice, and the views go offline only after three consecutive failures or an expired sign-in. Reads retry once after an unreachable workbench or a gateway 502/503/504, and a gateway error page is reported as such instead of blaming the server URL.
- The session panel re-renders when a fresh snapshot arrives after a disconnect, so its controls re-enable even when the session itself did not change.
- Markdown task lists render as checkboxes, and HTTPS links in rendered Markdown open through the extension host.

## 0.3.0

- Parity with the web workbench for the 0.3.0 server: a **Gateway** tab with per-request attribution, the budget card's spend observed at the gateway with per-model usage and a cost curve, tool cards that collapse per part and show title, input and error, an expandable brief card for each `run.started` event, transcripts in the Brief tab, an approval control for isolated placements, and a **Gateway policy** failure label.
- Crew roles are labelled implementation, analysis or independent review; only the final read role counts as the reviewer in the situation sentence and tree.
- `vloer.create` offers automatic tool approval when the placement is a container or pod; new **Set Tool Approval** and **Linked Accounts** commands cover `/api/sessions/:id/approval` and `/api/links`.
- Node tests cover the webview script through a DOM stub, the run labels, and the approval and linked-account flows.

- Rebuilt the session panel around review: a situation sentence with the next permitted action, a crew strip with findings rendered as safe Markdown, and Brief, Changes, Checks and Activity tabs.
- Answer permission requests and crew questions inline. Scope comes from the adapter payload, a broader grant appears only when patterns are declared, and answers are confirmed before they are sent.
- Changes lists every file in the retained patch with added and removed counts and opens the patch at that file. Checks shows passed, failed or expected failure per artifact. Activity is chronological, filterable, coalesces streamed text and folds tool output.
- The composer reports four delivery states: draft on this device, sending, saved for the next execution, delivery unknown. An explicit pause-first option applies an instruction to an active run.
- Open panels follow the workbench event stream live from the extension host and fall back to polling. Every panel states when its state was last observed.
- Session tree items show repository, active role, spend and age; sessions expand into decisions, crew roles, evidence, the review candidate and the imported task. The activity-bar badge and an amber status bar item count waiting decisions; Find Session and Review Next Decision commands were added.
- Notifications for new decisions, failures, interruptions and sessions ready for human review, configurable with `vloer.notifications`.
- Evidence documents use stable URIs so reopening reuses the tab; checks open as logs, diffs as diffs, summaries as Markdown. Session panels are restored after a window reload.
- New session and task import run in one guided flow with a back button, retained draft and budget presets. Administrators can authorize more budget from the panel or the tree.
- Copy session link, open the original task in its tracker, a Get Started walkthrough, and a `vloer.liveUpdates` setting.
- Client tests cover the event stream and budget route against the real server; the webview check covers inline decisions, Markdown safety with hostile content, the changes list, check outcomes, activity filters and composer states.

## 0.2.0

- Added a native Linked Tasks view and provider-neutral task browsing for Forgejo, GitHub, GitLab, ClickUp and Vikunja sources configured on the workbench server.
- Added plain-text source previews, pagination, direct task IDs and explicit crew/runtime/budget import. Imported tasks remain queued until the operator starts them.
- Retained source revisions in session context; stale imports require a refreshed preview. Ploeg-owned sources remain inspection-only.
- Added the Preparing review lifecycle state and complete candidate evidence with explicit Git bundle, binary patch and manifest downloads.
- Added bounded authenticated downloads, refused redirects and bundle/patch digest verification before saving a new local file.
- Extended actual-server client integration tests and browser webview checks for linked tasks and candidate evidence. VS Code Extension Host qualification remains a separate manual gate.

## 0.1.1

- Show structured execution failures with a concrete next action and submission certainty.
- Keep unknown paid submissions explicit, with no automatic retry or repeat action.
- Render failure text safely in narrow and desktop session panels; retain compatibility with older servers.

## 0.1.0

- Added an origin-bound remote client with cookie login through VS Code SecretStorage.
- Added native remote session navigation and registered-profile creation.
- Added a theme-aware session panel with crew progress, evidence, durable history and human intervention.
- Added explicit lifecycle controls, instructions, allow-once/reject decisions and structured question responses.
- Added read-only evidence documents and bounded editor-context previews with destination confirmation.
- Added actual-server API integration tests, browser webview checks and VSIX packaging.
