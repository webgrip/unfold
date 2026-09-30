---
type: reference
audience: [contributor, agent]
owner: vloer
last_verified: 2026-09-30
verified_by: "Source read of apps/vloer/public (index.html, app.js, shell.js, styles.css, core/, every module in views/, now.js, ploeg.js, ploeg-activity.js, styles/tokens.css, base.css, shell.css), scripts/browser-check.mjs, scripts/browser/, test/view-registry.test.mjs and src/http.ts at 68c90cf on feat/vloer-redesign, after the screen rebuild and the removal of legacy.css. Screen descriptions come from the markup builders; the pages were not opened in a browser for this pass"
---

# Browser UI

This page is the contract for code in `apps/vloer/public/`: which routes exist, what each screen shows, how a screen plugs in, which shared module owns what, and the rules for CSS, themes, accessibility and the Content Security Policy. [ADR 0024](adrs/0024-vloer-opens-on-now-with-one-vocabulary-and-one-token-system.md) records why it is shaped this way; it is implemented and still proposed, waiting for the owner's decision. The [architecture](architecture.md) places these files among the server modules.

The browser app has no build step and no npm runtime dependency ([ADR 0002](adrs/0002-native-node-and-single-writer-storage.md)). Every file is a native ES module or stylesheet that the Vloer server serves as it is.

## Information architecture

The sidebar is the only navigation. [`shell.js`](../public/shell.js) draws it around every signed-in page.

| Group | Item | Route | What it holds | Count on the item |
| --- | --- | --- | --- | --- |
| (top) | Now | `#now` | Home: what waits on you, what runs, what finished | Items waiting on you |
| Ploeg | Work | `#work`, `#work/<id>` | Work Items by lane, for one Team or all, and one Work Item's page | — |
| Ploeg | Proposed | `#proposed` | Work Items agents proposed, across Teams, with Approve and Reject | Proposed items |
| Ploeg | Runs | `#runs` | Run history | — |
| Ploeg | Activity | `#activity` | Ploeg's audit feed | — |
| Ploeg | Insights | `#insights` | Per-Team counts and spend in a window, as stats and tables | — |
| Workbench | Tasks | `#tasks` | Tracker tasks to preview and import | — |
| Workbench | Sessions | `#sessions`, `#session/<id>` | Interactive sessions | Sessions that need you |
| (bottom) | Settings | `#settings/accounts` | Linked accounts, Environment and Preferences | — |

* Sessions shows only in demo mode, when shared execution is configured, when sessions exist, or while a session page is open ([`showsSessions`](../public/shell.js)).
* A count is hidden when it is zero or unknown. Unknown is `null`, never `0`.
* From 720 px to 1100 px of viewport the sidebar is a 4 rem icon rail. Below 720 px it is hidden: the top bar's menu button opens it as a `<dialog>` drawer, and a bottom bar holds Now, Work, Runs and More.
* `#design`, the [living style guide](#living-style-guide), is not in the navigation. Preferences and the command palette link to it.

Every page also has:

* a top bar with breadcrumbs, the search button ("Search or jump to…", also `/`, Ctrl K or ⌘ K), the status strip and the account menu. As the bar narrows, the search button drops its text and then its key hint, "Updated … ago" hides below 1366 px and the account name below 1280 px. On phones the breadcrumbs shrink to the page title, or to a back link when the page passes `back` to `shell()`, and the search button to its icon;
* a status strip: on a session page, whether its event stream is connected; Ploeg's connection state (demo, connected, partly unavailable, unreachable, not configured or no Teams); "Updated … ago" for the page on screen; a Live or Paused switch; and a Demo or Live badge;
* an account menu with the System · Light · Dark theme switch, Preferences, Keyboard shortcuts and, outside the demo, Sign out;
* one `<h1 id="page-title" tabindex="-1">`, and `document.title` set to `(<waiting>) <Page> · De Vloer`, without the count when nothing waits;
* on the three Settings pages, a sub-navigation: Linked accounts, Environment, Preferences.

When something waits on you, the favicon also carries an amber dot ([attention signals](#attention-signals)).

## Routes

A hash is `#<path>?<query>`. [`route.js`](../public/core/route.js) splits it with `parseHash` (the query is read with `URLSearchParams`) and builds one with `buildHash`, which drops empty values. Filters and the open item live in the hash, so reload, back, forward and a shared link restore the same view.

| Path | View | Query parameters |
| --- | --- | --- |
| `now` | [`now`](../public/views/now.js) | — |
| `work`, `work/<id>` | [`work`](../public/views/work.js) | `lane` (`awaiting_review`, `needs_human`, `leased`, `queued`, `all`), `team`. With no `team`, the last Team chosen in this browser, or all Teams. A row's link carries both, so the Work Item page keeps its list; Copy link gives the bare `#work/<id>` |
| `proposed` | [`proposed`](../public/views/proposed.js) | `id` scrolls to that proposal and focuses it |
| `runs` | [`runs`](../public/views/runs.js) | `team`, `state`, `outcome` |
| `activity` | [`activity`](../public/views/activity.js) | `team`, `kind` |
| `insights` | [`insights`](../public/views/insights.js) | `window` (`24h`, `7d`, `30d`). `24h` is the default and is left out of the address |
| `tasks` | [`tasks`](../public/views/tasks.js) | `source`, `task`: the open task, written with `history.replaceState` so choosing a task adds no history entry |
| `sessions`, `session/<id>` | [`sessions`](../public/views/sessions.js), [`session`](../public/views/session.js) | On `sessions`: `filter` (`needs`, `active`, `done`) and `q`, the search text |
| `settings/accounts`, `settings/environment`, `settings/preferences` | [`account`](../public/views/account.js), [`system`](../public/views/system.js), [`preferences`](../public/views/preferences.js) | — |
| `design` | [`design`](../public/views/design.js) | — |

A Work Item id is 1 to 20 digits and does not start with 0. An unknown path opens Now.

### Redirects

Before routing, [`app.js`](../public/app.js) asks `redirect(hash)` for a new home. When there is one it replaces the history entry with `history.replaceState`, so Back does not return to the old link. Query parameters carry over, except on the compare redirect.

| Old hash | New hash |
| --- | --- |
| empty | `#now` |
| `#ploeg`, `#ploeg/overview` | `#insights` |
| `#ploeg/<id>` | `#work/<id>` |
| `#ploeg/lane/<lane>` | `#work?lane=<lane>` |
| `#ploeg/work` | `#work` |
| `#ploeg/proposed`, `#ploeg/runs`, `#ploeg/activity` | `#proposed`, `#runs`, `#activity` |
| any other `#ploeg/…` | `#insights` |
| `#account`, `#settings` | `#settings/accounts` |
| `#system` | `#settings/environment` |
| `#compare`, `#compare/…` | `#sessions` |

The VS Code extension still opens `#ploeg` and `#ploeg/<id>`; these redirects keep it working. The session Compare view is gone; its links land on Sessions. When you retire a route, add its redirect to [`route.js`](../public/core/route.js) and a case to [`test/route.test.mjs`](../test/route.test.mjs), which checks that every redirect lands on a registered view.

## Screens

What each screen shows, as built. The words for states, outcomes, verdicts and reasons come from [`states.js`](../public/core/states.js) and [`reasons.js`](../public/core/reasons.js), money and dates from [`format.js`](../public/core/format.js). The flow in [`scripts/browser/`](../scripts/browser/) named after each area pins its behaviour.

### Now

Now answers what needs you, why, and which button to press ([`now.js`](../public/now.js), [`views/now.js`](../public/views/now.js)).

* **Since you were away.** A line opens the page: "Since 09:12 · 3 h ago", then how many Work Items became ready for review or need you, how many were proposed and how many Runs finished since then. The start is the `lastVisit` preference, which Now writes when you leave it and when you press **Mark as caught up**. Each tab keeps its start in `sessionStorage` key `vloer.nowSince`, so a reload or a short trip to a Work Item keeps it; a new period starts once Now has been out of sight for 30 minutes. Rows that changed since the start carry an unread dot. A first visit shows "Welcome to De Vloer" instead.
* **Stat row.** Waiting on you (a breakdown, not a link, because the list follows), Running (to `#runs?state=running`), Queued (to `#work?lane=queued`) and Spend · 24 h (to `#insights?window=24h`). Queued and spend come from `GET /api/ploeg/summary?window=24h`. A value that could not be read shows "—" with the reason; in the demo the spend tile shows a muted "—" and "Demo · no model calls". On phones the stat row moves below the lists.
* **Waiting on you**, in three groups: **Ready for your review**, **Needs you**, **Proposed**, each in Ploeg's order, oldest first. A Needs you row leads with its reason chip and one line saying why, with the secondary **Not routed** chip when no repository resolved. Once Needs you holds more than five Work Items and a reason repeats, it splits into one sub-group per shared reason (largest first, the fix written once in its header, three rows each) and **Other reasons**. An ungrouped group lists eight rows, then "Show N more in Work" or "in Proposed". Stale Work Items are not in Ploeg's waiting list; Now shows their count as one row that opens Work.
* **Row actions.** The row opens `#work/<id>`. A review row has **Pull request**, and the agent's verdict when one of the recently finished Runs reported it. A proposal has **Approve or reject**, which opens `#proposed?id=<id>`. The task in the tracker is an icon link, and so is Grafana, when it is configured, for an infrastructure reason.
* **Running now** lists running Runs with a budget meter: observed spend of the authorized amount, hatched "Not reported" when unknown, "Demo · no model calls" in the demo. **Recently finished** shows the six latest by finish time with outcome and agent verdict. Both link to Runs.
* **Refresh.** Every 30 seconds. New waiting items and finished Runs wait behind an "N new · Show" button, so the list never moves under you. A group that fails keeps the others on screen with its own Try again.
* **Keys.** `j` and `k` move between rows, Enter opens, `o` opens the focused review row's pull request, or otherwise its task in the tracker.

### Work and the Work Item page

Work lists Work Items by lane; the Work Item page says why one waits and what to do ([`ploeg.js`](../public/ploeg.js), [`views/work.js`](../public/views/work.js)).

* **Toolbar.** A Team select (All teams by default; the choice is remembered in the `team` preference), one lane control with counts (**Ready for review**, **Needs you**, **Running**, **Queued**, **All**) and Refresh. Counts cover the pages loaded so far and read "4+" when a Team has more.
* **Rows.** Title, tracker key (with the Team when all Teams show), repository, attempts, Round and age. A queued row in infrastructure backoff reads "Retrying later". **Needs you** groups rows under one header per reason, with the reason chip, the Not routed chip, a count and the one-line fix. **Ready for review** rows read "PR #5 · Agent approved" or "No agent verdict"; Vloer reads up to twelve Work Item details for this and caches them by `updatedAt`. A live Work Item that has spent something, or is running, shows its spend of the Shift budget. **All** shows each row's state badge.
* **Layout.** When the Work area is at least 49 rem wide (about a 1100 px window), the list and the Work Item page sit side by side and the list scrolls on its own. Narrower, the page replaces the list and a back link returns to it.
* **Refresh.** Every 30 seconds; the page redraws only when Ploeg's data changed, so focus and a text selection survive.
* **Keys.** `j`, `k` and Enter in the list; `o` opens the open Work Item's pull request or tracker task; Esc closes the Work Item.

The Work Item page, `#work/<id>`, reads from top to bottom:

1. **Header.** Back link, Team and tracker key (a link to the task), **Copy link**, **Cancel Work Item** and Close. The title is `h2#ploeg-item-title`, focused after each load. The status line is the state badge with the reason chip, plus the Not routed chip. The facts line gives the repository and base branch, the pull request link, attempts, Round and the last update.
2. **Decision box.** For **Needs you** (and **Stopped retrying**) it is **Why this needs you**: Vloer's explanation, Ploeg's own sentence quoted under it when the evidence does not already say it, the Shift's budget meter when the budget ran out, the Runs that are the evidence, and the Not routed warning. **What you can do** lists the steps, with one primary button: open the pull request, or the task in the tracker. The last step is always to assign the task to the Team again in the tracker, the only way to start again today. When Ploeg reported no link, the button is disabled and says where to look. `plan_exhausted` becomes **No pull request** or **Changes unresolved**, and never quotes Ploeg, whose sentence for it reads as if the work were ready to merge. For **Ready for review** it is **Ready for your review**: a receipt (agent review, findings, Rounds, time, branch, spend of budget), a **Before you merge** checklist and **On the forge**, which says what merging, requesting changes and closing without merging do. The checklist is never green for data Vloer lacks: CI always reads "not reported", spend is green only when settled within the budget, and instruction files named in the findings are a warning. Other states get a short box: **Running now**, **Waiting to start**, **Done**, **Withdrawn**, or **Waiting for your approval** with a link to Proposed.
3. **Linked sessions**, when a Vloer session drives the Work Item.
4. **Brief.** `descriptionMarkdown` rendered by [`markdown.js`](../public/core/markdown.js); a long brief folds behind "Show the full brief". Source links to the task.
5. **Rounds.** The Round ladder, a table of Roles by Rounds whose cells show the outcome or verdict (and the cost, outside the demo) and open their Run; below 34 rem it becomes a list per Round. Then the Shift's budget meter, the Runs (failed and stuck first, then running, then newest; eight shown, the rest behind a disclosure), and earlier Shifts. An expanded Run shows its outcome, verdict, failure cause, stuck reason and findings, rendered as Markdown.
6. **Activity.** The Work Item's audit events in plain words ("Opened pull request #7"), eight shown, and the raw events as JSON on demand.
7. **Technical details**, collapsed: ids, tracker key, revision, priority, repository, branch, attempts, next eligible time, Lease, Shift and close reason, checkpoints and times.

On phones the primary button also sits in a sticky bar above the bottom bar, hidden while the decision box's own button is on screen.

**Cancel Work Item** shows only to operators and administrators, and only in the states `ingested`, `queued`, `leased`, `awaiting_review`, `needs_human` and `stale`. It opens a confirmation that lists what Ploeg then does (withdraws the Work Item and closes its open Shift, stops running Runs and cancels waiting ones, blocks their model keys, revokes their forge tokens, comments on the tracker task, and leaves an open pull request on the forge), the spend so far, and that only the tracker can start it again. Focus starts on **Keep it**. Confirming posts `POST /api/ploeg/work-items/<id>/cancel` and shows Ploeg's answer: Runs stopped, Runs cancelled before they started, and whether the model keys are blocked, with "not reported" for a figure Ploeg left out. In the demo the dialog says nothing runs, so there is nothing to cancel; its confirm button is disabled and Vloer never sends the request.

### Proposed, Runs, Activity and Insights

These four read Ploeg's operator activity API ([`ploeg-activity.js`](../public/ploeg-activity.js)) and share `styles/feeds.css`. Each keeps its last data on screen when a refresh fails, with a notice and Try again.

* **Proposed** lists Work Items agents proposed, across Teams, in Ploeg's order. A card shows the kind (split from its source, clarification or discovered work), a Ready or Needs refinement badge, the Team, the brief as Markdown (folded when long), the Work Item it was found in, the proposing agent, the repository or Not routed, and whose budget it spends ("Spends from the delivery Team's budget"; Ploeg does not report Team budgets, so no amount). Operators and administrators get **Approve**, which asks for confirmation (**Approve and queue** or **Keep it proposed**), and **Reject**, which needs a reason: live, Ploeg marks the proposal Done without running it and keeps the reason; in the demo it is withdrawn from the sample data. Viewers see one note that an operator or administrator decides. Refreshes every 30 seconds.
* **Runs** is a table with a sticky header: Status (state, outcome, agent verdict, and a failure's cause and next step), Work Item (with Role, Round and tracker key), Started (with how long it took or has been running), Spend (a meter of settled, or observed so far, against authorized; "Not reported" when unknown) and Model (models and tokens). Running and waiting Runs come first. One toolbar filters by Team, State and Outcome; Outcome needs State Finished and says so. Below a 60 rem container the table becomes cards with every field. **Load older** pages back. Refreshes every 30 seconds.
* **Activity** is Ploeg's audit feed grouped by day, each event in plain words with its Work Item, actor and Team. Actors read as a person ("Ryan (you)" or "An operator"), "Agent", "Ploeg" or the tracker's name. One toolbar filters by Team and kind. It checks every 15 seconds and holds new events behind an "N new events" button that never moves the list. **Load older** pages back.
* **Insights** has a **Runs and spend** section for the chosen window (**24 hours**, **7 days**, **30 days**): Runs finished, Failed, Stuck and Settled spend, then a table with a row per Team. A **Work Items** section counts what is in each state right now, whatever the window, in tiles and a table of its own. The count tiles link to the matching Runs filter, Work lane or Proposed. Stats and tables only, never a chart; on phones the tables become cards. Refreshes every 60 seconds.

### Tasks, Sessions and a session

* **Tasks** ([`tasks.js`](../public/views/tasks.js)) lists the open tasks of one task connection beside the selected task. On a wide screen the first task opens by itself; on a phone the list and the task alternate, with an **All tasks** back button. The brief is rendered from Markdown. The import form, headed "Bring this task onto the floor.", takes a crew, a runtime and a budget, and **Create session** stays in reach at the bottom of the window. **Connections** explains the five supported trackers. `j` and `k` move through the list.
* **Sessions** ([`sessions.js`](../public/views/sessions.js)) lists sessions with one filter, **All**, **Needs you**, **Open** and **Closed**, and a search; both live in the address. Needs you uses the same rule as the sidebar count. A reviewed session reads Accepted or Rejected, a finished unreviewed one Ready for your review, and one behind the delivery gate Awaiting your approval. A Workbench card shows the slots in use, recorded spend and what is configured. **New session** (`n`) is there for operators and administrators. Refreshes every 30 seconds.
* **A session** (`#session/<id>`, [`session.js`](../public/views/session.js)) puts the decision it waits on at the top: failure guidance as numbered steps, a permission or question card, the delivery gate, "Your review is next." with an evidence receipt, or, for a session that has not started, **Start crew**. Below are the brief (an imported task's text, with the agent prompt behind "What the crew was told"), the crew's progress and the evidence tabs Activity, Gateway, Changes, Checks and Handoff. The side column holds the budget meter and **Repository handoff**. The header holds Export handoff once there is evidence, Cancel, and Pause or Resume. On phones a sticky **Record your review** bar carries Reject… and Accept.

### Settings and sign-in

* **Linked accounts** lists the GitLab and ClickUp accounts a person links for their own use, with **Unlink** behind a confirmation. An OAuth link reads "Renews when used" instead of an expiry countdown.
* **Environment** is a checklist of six health checks (Ploeg connection, Model gateway, Workspace placements, Agent runtimes, Task connections, Dashboards) with a tally, then the workbench facts and repositories. Administrators see which setting or environment variable fixes a check; everyone else is told to ask an administrator. Dashboards is optional and never a failure.
* **Preferences** has Appearance (theme, density, and how numbers and dates are written) and Behaviour (single-key shortcuts, Refresh automatically and Desktop notifications), and links to the style guide. Its controls stay in step with the top bar's Live switch and the account menu's theme.
* **Sign-in** is a split page with the brand lockup. When single sign-on is configured, **Continue with** and the provider's name is the primary button. A failed attempt keeps the account name. An expired session shows "Your session expired" and, after signing in again, returns to the page you were on (`sessionStorage` key `vloer.returnTo`).

### Command palette

The search button, `/`, and Ctrl K or ⌘ K open the palette ([`palette.js`](../public/views/palette.js)), an ARIA combobox over a grouped listbox. Ctrl K does nothing while another dialog is open, so a half-filled form is never hidden under it.

* Empty, it shows **Recent** (the last eight Work Items and sessions you opened in this browser, kept per user under `localStorage` key `vloer.recent`), **Commands** and **Go to**.
* Typing matches pages, Work lanes and Settings pages (**Go to**); commands (switch theme, pause or resume live updates, refresh this page, new session, keyboard shortcuts, preferences, desktop notifications, density, single-key shortcuts, copy link, and sign out outside the demo); **Work Items**; and **Sessions**. Matching ignores case and accents and takes the words in any order.
* Work Items come from what the tab already loaded, plus at most one `GET /api/ploeg/now` a minute when the palette opens. A number such as `108` offers "Open Work Item #108". No match offers **Open Work**. A failed read shows a notice with Retry.
* Arrow keys, Page Up and Down, Enter and Esc work from anywhere in the palette; Tab stays inside it. On phones it is a full-screen sheet with a Cancel button.

### Attention signals

* The page title starts with the number of items waiting on you.
* While something waits, the favicon becomes a PNG drawn on a canvas with an amber dot (`--attention-signal`), from the same shapes as `favicon.svg` ([`favicon.js`](../public/core/favicon.js)).
* Desktop notifications are off by default. Turned on in Preferences or the palette, the browser first asks for permission. Then a De Vloer tab that is open but not in front notifies once per item that starts waiting, and more than three at once become one summary. Open tabs share `localStorage` key `vloer.notified`, so only one of them notifies ([`attention.js`](../public/core/attention.js)).
* The counts behind these refresh every 60 seconds, also in a background tab, which browsers slow to about once a minute. The job skips its read while Now is on screen, because Now reads the same data.

### Not built

These appear in the design research or the redesign's reports and are not implemented. Each is proposed:

* Starting a Work Item again from Vloer. Today the only way is assigning the task to the Team again in the tracker; a requeue would be Ploeg work.
* A structured attention reason from Ploeg. Vloer derives reasons from close-reason strings.
* Listing stale Work Items in `GET /api/ploeg/now`, and the pull request and latest verdict on Work lane rows.
* A Team budget in Ploeg, so Proposed can show the amount at stake.
* Names for other operators in Activity; today only you are named.
* Filtering Work by reason.
* Server-side search in the palette, and a second action (open the pull request) on a palette result.
* A session summary field that says a delivery-gated commit was approved, so the Sessions list can stop counting it as needing you.

## View descriptors

Each module in [`public/views/`](../public/views/) default-exports one view descriptor, and [`views/index.js`](../public/views/index.js) lists them. The list order is the dispatch order for key bindings and page loaders. The typedefs are in [`registry.js`](../public/core/registry.js).

| Property | Type | Meaning |
| --- | --- | --- |
| `id` | string, required | Unique. `state.view` holds the current one |
| `match(path)` | returns params or null | Claims a path (no `#`, no query). Two views must never match the same path |
| `enter(params)` | async | The view handles the route itself. `params` includes `query` |
| `load()` | async | Only on a page (a view with `match` and no `enter`): runs after the shared page entry `openPage(id)` has rendered it |
| `render()` | function | Draws the view with `renderHtml(shell(content, options))` |
| `actions` | `{ name: (element, event) }` | Clicks on `[data-action="name"]`; a disabled element is ignored; a throw re-enables the element and shows the toast |
| `forms` | `{ name: (data, form, event) }` | Submits of `[data-form="name"]`; `data` is `Object.fromEntries(new FormData(form))`; the submit button is disabled while it runs |
| `inputs`, `changes` | `{ selector: (element, event) }` | `input` and `change` events whose target is inside `selector`; not awaited |
| `keys` | `[(event) => boolean]` | Key bindings; the first that returns true stops the rest |

Navigation ([`navigation.js`](../public/core/navigation.js)) gives views `render()`, `boot()` and `openPage(id)` without importing the entry. After a route change `renderHtml` moves focus to `#page-title` and announces the page name in `#announcement`, unless focus is already on an element that survived the render.

`shell(content, options)` takes `{ title, subtitle, overline, actions, breadcrumbs: [{ label, href }], back: { label, href }, wide }`. `actions` is markup the view built and escaped. `back` puts a back link in place of the title on phones, as a session page does. The older `shell(content, title, subtitle)` still works.

### Extend the UI

| To add | Do this | Checked by |
| --- | --- | --- |
| A screen | Create `views/<name>.js` with `id`, `match` and either `enter` or `render` (plus `load` when it is a page), and add it to `views/index.js`. Add a sidebar item in `shell.js` only for a top-level destination | `test/view-registry.test.mjs`: unique ids, one view per path |
| A stylesheet for it | Each screen has its own file in `styles/`, imported into the `views` layer by `styles.css`; the Settings pages share `settings.css`, and Proposed, Runs, Activity and Insights also share `feeds.css`. A new file needs its own `@import … layer(views)` line | The browser check fails on a 404 or a CSP error |
| An action or form | Put `data-action="x"` or `data-form="x"` in the view's markup, or pass `action: 'x'` to a `ui.js` builder, and add `actions.x` or `forms.x` to the same view | `test/view-registry.test.mjs`: every name has exactly one handler, and every handler has markup (a literal attribute, or `action: 'x'` in a builder call) |
| A field listener | Add a selector key to `inputs` or `changes` | `createRegistry` throws on a duplicate selector |
| A shortcut | Add a row to `shortcuts` in [`keys.js`](../public/core/keys.js) so the `?` help lists it, mark a character-only key `single: true`, and gate its binding with `singleKeyAllowed(event)`. A row with `keys: ['g', '<letter>']` and a `route` becomes a `g` chord by itself. The other global keys (`?`, `/`, Ctrl or ⌘ K) live in `createGlobalKeys` | `test/keys.test.mjs` |
| A live refresh | `live.register('<view id>', { interval, refresh })` with the view's own id. `refresh` throws on failure so the scheduler backs off, and resolves to `false` when it read nothing without failing (a superseded request, a page already left), which neither backs off nor claims an update. The view calls `live.touch('<view id>')` after every successful load | `test/live.test.mjs` |
| A preference | Add the key, its default and its valid values to [`prefs.js`](../public/core/prefs.js), and a `[data-pref]` control on Preferences | `test/prefs.test.mjs` |
| A file outside `core/`, `views/` or `styles/` | Add it to the `assets` map in [`src/http.ts`](../src/http.ts) | `test/static-assets.test.ts` |

Files in `core/`, `views/` and `styles/` are served automatically when their name matches `[a-z0-9][a-z0-9-]*\.(js|css)`, with no subdirectories. Anything else in those folders is a 404.

Rules for handlers:

* No single key approves, rejects or cancels anything. Those actions need a click and, when they spend money or stop work, a confirmation.
* Live jobs run only while the tab is visible, someone is signed in, no dialog is open, live updates are on and their view is current. Use `scope: 'global'` only for data every page needs, as the navigation counts do, and `hidden: true` only for a job that must keep running in a background tab.
* Activity refreshes every 15 seconds; Now, Work, Proposed, Runs and Sessions every 30 seconds; Insights and the navigation counts every 60 seconds.

## Core modules

[`public/core/`](../public/core/) never imports a view or the shell. The modules that Node tests import stay free of `document` and `DOMParser` at import time, because Node has neither.

| Module | Owns | Rule for callers |
| --- | --- | --- |
| [`format.js`](../public/core/format.js) | Money, counts, percentages, plurals, dates, day headings, times, relative times, durations and `<time>` markup | Format every amount and date here. Money is US dollars in nl-NL with two decimals (`US$ 1.234,50`), `< US$ 0,01` below a cent with the exact value in `title`, and "Not reported" for anything that is not a number. Absolute dates read `30-09-2026 21:30`; relative times are English ("5 min ago") and become a date after seven days. `configureFormat({ locale: 'browser' })` switches to the browser's locale |
| [`states.js`](../public/core/states.js) | The label, tone, glyph and meaning of every Work Item state, Run state, outcome, verdict, failure reason, checkpoint and session status, plus `auditEvent(entry)` and `actorName(actor)` for audit events | Never write a state label in a view. `stateMeta('run:running')` disambiguates with a kind prefix. `done` is "Done", never "Merged". An agent verdict reads "Agent review: …"; its `short` form ("Agent approved") is for cells whose heading already says agent review. `failureNote(key, { live })` drops the retry promise once a Work Item has stopped |
| [`reasons.js`](../public/core/reasons.js) | Why a `needs_human` or `stale` Work Item waits on you: chip, glyph, sentence, fix and how to start again | `listReason(item, { demo })` for lists, `detailReason(detail)` for the Work Item page, `routingWarning(item)` for the secondary "Not routed" chip, which is never the reason. A free-text close reason reads "Needs a decision"; a missing one, or an open Shift, "Stopped; open for details" |
| [`prefs.js`](../public/core/prefs.js), [`theme.js`](../public/core/theme.js) | Per-browser preferences in `localStorage` key `vloer.prefs`: `theme`, `density`, `singleKeyShortcuts`, `live`, `notify`, `format`, `lastVisit`, `team` | Read and write through `prefs`; storage failures fall back to memory. `theme.js` is a classic script that applies theme and density before first paint |
| [`live.js`](../public/core/live.js) | The one refresh scheduler, backoff, the Live or Paused state and "Updated … ago" | See [Extend the UI](#extend-the-ui) |
| [`keys.js`](../public/core/keys.js) | The shortcut table, the `?` help dialog and the global keys | See [Extend the UI](#extend-the-ui) |
| [`counts.js`](../public/core/counts.js) | The navigation counts and the Ploeg status, read from `GET /api/ploeg/now` | A view that loads Now data passes it to `applyNowCounts` rather than fetching twice. `onCountsChange(listener)` hands listeners the Now response, which the palette and the attention signals read |
| [`route.js`](../public/core/route.js) | Hash parsing, building and redirects | Build hashes with `buildHash`, never by string concatenation |
| [`ui.js`](../public/core/ui.js) | Pure string builders: buttons, badges, chips, cards, sections, page header, empty states, skeletons, callouts, meters, stats, tabs, segmented controls, tables, list rows, `<time>` | Prefer a builder to hand-written markup. Text parameters are escaped; parameters named `body`, `actions`, `meta`, `lead`, `trail` and `empty`, table cells and `dl` values are HTML slots the caller escapes. `stateBadge(key)` reads `states.js`, so pass a kind prefix (`session:completed`) for anything but a Work Item state. `meter` draws unknown spend hatched with "Not reported" and demo spend as "Demo · no model calls" |
| [`icons.js`](../public/core/icons.js) | The in-house 24-unit stroke icon set and `icon(name)` | Own path data only; no third-party icon set |
| [`markdown.js`](../public/core/markdown.js) | The escape-first Markdown renderer for briefs, findings and task descriptions: paragraphs (consecutive lines join with a line break), headings, bullet, numbered and task lists, quotes, code, emphasis, strikethrough and links | Render `descriptionMarkdown` from the server with it and wrap the result in `.prose`. It escapes first, links only what `safeUrl` accepts, with `rel="noopener noreferrer"`, and draws no images |
| [`dom.js`](../public/core/dom.js) | `escape`, `safeUrl`, `renderHtml`, the toast and the live region | Escape every string from a user, tracker, agent or server before it enters markup |
| [`state.js`](../public/core/state.js), [`api.js`](../public/core/api.js), [`navigation.js`](../public/core/navigation.js), [`registry.js`](../public/core/registry.js) | The shared state object, the API client with its 401 handler, page entry and the view registry | Add new state fields to the initial object in `state.js`, and clear per-user fields in `forgetUserData()`, which runs on sign-out and on an expired session |
| [`attention.js`](../public/core/attention.js), [`favicon.js`](../public/core/favicon.js) | Desktop notifications and the favicon dot | See [attention signals](#attention-signals) |
| [`brand.js`](../public/core/brand.js) | The outlined lockup and mark as inline SVG, for the sidebar, drawer and sign-in page | Never set the name as live text in the lockup |

[`lookup.js`](../public/core/lookup.js) names repositories, crews, runtimes, placements and tracker providers from the bootstrap for Tasks, Sessions and Settings. [`observability.js`](../public/core/observability.js) builds a session page's outbound Grafana trace, log and dashboard links. The markup modules [`ploeg.js`](../public/ploeg.js), [`ploeg-activity.js`](../public/ploeg-activity.js), [`now.js`](../public/now.js) and [`delivery.js`](../public/delivery.js) stay at the top level because Node tests import them. Now, Work, Proposed, Runs, Activity and Insights render through them, on `states.js`, `format.js` and `ui.js` like every other view.

## CSS

[`styles.css`](../public/styles.css) fixes the layer order and imports every stylesheet into its layer. It also holds the two Archivo `@font-face` rules, which `npm run license:check` requires there. The files under `styles/` declare no layer of their own.

| Layer | File | Holds |
| --- | --- | --- |
| `tokens` | `styles/tokens.css` | Custom properties only |
| `base` | `styles/base.css` | Element defaults, focus, forms, text utilities, reduced motion, forced colours and print |
| `components` | `styles/components.css` | The classes `ui.js` emits; the [living style guide](#living-style-guide) lists them all |
| `shell` | `styles/shell.css` | Sidebar, top bar, status strip, drawer, bottom bar, page header, Settings sub-navigation, skip link, toast, boot screen, and the print layout that leaves the chrome out |
| `views` | `styles/<view>.css` | One file per screen, and `feeds.css` for what Proposed, Runs, Activity and Insights share |

Use tokens, never literal colours or sizes. The families in [`tokens.css`](../public/styles/tokens.css):

| Family | Examples | Use |
| --- | --- | --- |
| Brand primitives | `--vlak`, `--peil`, `--peil-diep`, `--peil-donker`, `--krijt`, `--hal`, `--stof`, `--stof-licht` | Only through the roles below, and in the brand mark |
| Surfaces | `--bg-canvas`, `--bg-surface`, `--bg-raised`, `--bg-overlay`, `--bg-sunken`, `--bg-hover`, `--bg-selected`, `--bg-track` | Hover, active, skeleton and track fills are translucent; never use them behind sticky or floating elements |
| Text | `--text`, `--text-muted`, `--text-subtle`, `--text-disabled`, `--text-on-solid` | `--text-on-solid` only on a tone's `-emphasis` or `--accent-solid` |
| Borders and focus | `--border-subtle`, `--border`, `--border-strong`, `--border-control`, `--border-control-strong`, `--focus-ring` | Checkboxes, radios and switches use `--border-control-strong` |
| Accent (Peil) | `--accent-fg`, `--accent-solid`, `--accent-graphic`, `--accent-bg` | Interaction only: links, primary buttons, selection, focus. Never a status |
| Status tones | `--{tone}-bg`, `-bg-hover`, `-border`, `-fg`, `-solid`, `-emphasis` for `neutral`, `live`, `attention`, `review`, `success`, `danger`, `severe`; `--attention-signal` | Set `data-tone="<tone>"` on an element to get `--tone-bg`, `--tone-fg`, `--tone-border`, `--tone-solid` and `--tone-emphasis`. `--attention-signal` is only the favicon dot, brighter than `--attention-solid` so it shows in a tab strip |
| Type | `--font-sans`, `--font-mono`, `--text-2xs` … `--text-4xl` with matching `--leading-*`, `--weight-*`, `--tracking-*` | UI text 13 px (`--text-sm`), prose 14 px (`--text-md`) |
| Space and size | `--space-*` (4 px base), `--control-*`, `--row*`, `--icon-*`, `--sidebar-width`, `--prose-max`, `--tabbar-height`, `--bottombar-height` | `--bottombar-height` is the phone bottom bar's height and 0 elsewhere; sticky action bars and the toast sit above it |
| Shape and depth | `--radius-*`, `--shadow-*`, `--z-*` | Pills use `--radius-sm`. Modal dialogs live in the top layer and need no `z-index` |
| Motion | `--duration-*`, `--ease-*`, `--motion-distance` | Multiply every translate by `--motion-distance`, which is 0 under reduced motion |
| Density | `--density-row`, `--density-pad-y`, `--density-pad-x`, `--density-gap` | Row height and padding that the compact density tightens |

The tones mean: `live` running, `attention` needs you, `review` ready for review, `success` done, `danger` failed, `severe` stale or interrupted, `neutral` everything else. The [brand book](brand/README.md#the-applications-own-palette) explains the choices.

## Theming and density

* Every colour that changes with the theme is a `light-dark()` pair, so `color-scheme` picks the value. The solid fills (`--accent-solid` with its `-hover` and `-active`, and every `-emphasis` token) and the text on them (`--text-on-solid`, `--text-inverse`, `--text-inverse-muted`) keep one value in both themes, as do the brand primitives. The default follows the operating system. `data-theme="light"` or `"dark"` on `<html>` overrides it, and `data-density="compact"` tightens rows.
* The theme and density preferences are set per browser from the account menu or Preferences. [`theme.js`](../public/core/theme.js) applies them before the stylesheet loads, so there is no flash, and `applyAppearance()` also updates the two `theme-color` metas.
* An element can pin its own scheme with `color-scheme`. The sidebar and navigation drawer use `color-scheme: dark`, so they stay dark (Hal) in both themes.
* Coarse pointers get larger controls and taller rows automatically.

## Accessibility

* **Text size.** Nothing below 12 px, except 11 px uppercase overlines and key hints. Numbers use tabular figures (the `.num` class, and `<time>`).
* **Status.** Never colour alone: every state has a glyph and a word. A glyph next to its word is `aria-hidden`.
* **Focus.** Every focusable element shows a 2 px `--focus-ring` outline with an offset; the design research measured it at 3:1 or more against every surface in both themes. List rows, tabs and segmented controls draw it inset (`--focus-ring-inset`), so a scrolling or clipped container never cuts it off. Route changes move focus to the page heading and announce it. Closing the navigation drawer, the account menu or the command palette returns focus to what opened it.
* **Keyboard.** Every action is reachable by keyboard. The `?` help lists every shortcut in [`keys.js`](../public/core/keys.js): `/` or Ctrl or ⌘ K for the palette, `g` then a letter for a page, `j`, `k`, Enter and `o` on Now and Work (`j` and `k` on Tasks too), Esc, and `n` for a new session on Sessions. Single-key shortcuts obey the Single-key shortcuts preference (WCAG 2.1.4); when it is off, only Ctrl or ⌘ K, Enter and Esc remain. No single-key shortcut acts inside a text field or while a dialog is open.
* **Motion.** The live dot, the skeleton shimmer and the loading line are the only continuous animations. They, and the entrance of dialogs, drawers and toasts, run only under `prefers-reduced-motion: no-preference`. A busy button's spinner keeps turning under reduced motion because it is status.
* **Live regions.** `#announcement` is polite. Announce a change once; never announce streamed tokens or every refresh.
* **Layout.** No horizontal scroll at 390 px. Targets are at least 24 px, and larger on touch.
* **Money.** Format amounts with `format.js` and draw them with the `ui.js` meters and stats: unknown spend then reads "Not reported" and demo spend "Demo · no model calls", and neither is drawn or written as zero.

## Content Security Policy

The server sends `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'` on every response ([`src/http.ts`](../src/http.ts)). For UI code that means:

* No `style="…"` attribute and no `<style>` element in markup. Set dynamic geometry with SVG presentation attributes (`width`, `x`, `fill`), with `<meter>` or `<progress>`, or through the CSSOM after render (`element.style.setProperty(…)`), as the style guide does for its swatches.
* No inline script and no `on…=` attribute. Behaviour goes through `data-action`, `data-form` and the registry.
* No CDN, remote font or remote image. Images may be `data:` URLs.
* Links from outside data pass `safeUrl()` (http or https, no credentials), and external links carry `rel="noopener noreferrer"`.

The browser check fails on any uncaught page error and on any console error, and a CSP violation is a console error. It ignores console errors whose text contains 401, 409 or 503, the responses its flows provoke on purpose ([`browser-check.mjs`](../scripts/browser-check.mjs)).

## Living style guide

`#design` renders every token and component from `ui.js` in the current theme: colour, type, space and shape, icons, buttons, status, surfaces, feedback, meters and stats, navigation, data, lists, overlays, progress, forms, text and a class reference. Its own controls preview light, dark and compact density without changing your preferences; leaving the page restores the saved theme and density. Check a new component there in both themes before it ships.

## Tests that pin this contract

Run them in `apps/vloer` with `mise exec -- npm test` and `mise exec -- npm run test:browser`.

| Test | Pins |
| --- | --- |
| [`test/route.test.mjs`](../test/route.test.mjs) | Hash parsing, building and every redirect |
| [`test/view-registry.test.mjs`](../test/view-registry.test.mjs) | Unique views and handlers, markup for every handler, one view per path |
| [`test/states.test.mjs`](../test/states.test.mjs), [`test/reasons.test.mjs`](../test/reasons.test.mjs), [`test/format.test.mjs`](../test/format.test.mjs) | Vocabulary, reasons and formats |
| [`test/prefs.test.mjs`](../test/prefs.test.mjs), [`test/live.test.mjs`](../test/live.test.mjs), [`test/keys.test.mjs`](../test/keys.test.mjs), [`test/counts.test.mjs`](../test/counts.test.mjs) | Preferences, the scheduler, shortcuts and navigation counts |
| [`test/ui-components.test.mjs`](../test/ui-components.test.mjs), [`test/markdown-renderer.test.mjs`](../test/markdown-renderer.test.mjs) | Escaping, safe links, meters, badges and icons; hostile Markdown staying inert |
| [`test/now-view.test.mjs`](../test/now-view.test.mjs), [`test/ploeg-view.test.mjs`](../test/ploeg-view.test.mjs), [`test/ploeg-activity.test.mjs`](../test/ploeg-activity.test.mjs), [`test/session-view.test.mjs`](../test/session-view.test.mjs) | The markup of Now, Work and the Work Item page, the four feed pages, and the session page |
| [`test/palette.test.mjs`](../test/palette.test.mjs), [`test/attention.test.mjs`](../test/attention.test.mjs) | Palette matching, grouping and markup; the favicon dot and desktop notifications |
| [`test/static-assets.test.ts`](../test/static-assets.test.ts) | Which paths are served, ETag, 304 and gzip |
| [`scripts/browser/`](../scripts/browser/) | One flow per area, run in this order: `now`, `tasks`, `sessions`, `shell`, `palette`, `settings`, `feeds`, `work`, `login`. [`shell.mjs`](../scripts/browser/shell.mjs) covers redirects, title, focus, theme, live updates, shortcuts, the skip link and the phone layout; [`work.mjs`](../scripts/browser/work.mjs) covers the demo Cancel Work Item dialog and a mocked live cancel |
