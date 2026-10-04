---
type: reference
audience: [contributor, agent]
owner: unfold
last_verified: 2026-10-01
verified_by: "Source read of apps/unfold/public (index.html, app.js, shell.js, styles.css, core/, every module in views/, now.js, ploeg.js, ploeg-activity.js, styles/tokens.css, base.css, shell.css), scripts/browser-check.mjs, scripts/browser/, test/view-registry.test.mjs and src/http.ts at 68c90cf on feat/unfold-redesign, after the screen rebuild and the removal of legacy.css. Screen descriptions come from the markup builders; the pages were not opened in a browser for this pass. The Cards group, Card logins and the Binder, Packs and Season screens were added from views/binder.js, packs.js, season.js and card-identity.js on feat/unfold-binder-packs and opened in the demo browser flow on 2026-10-01"
---

# Browser UI

This page is the contract for code in `apps/unfold/public/`: which routes exist, what each screen shows, how a screen plugs in, which shared module owns what, and the rules for CSS, themes, accessibility and the Content Security Policy. [ADR 0024](adrs/0024-vloer-opens-on-now-with-one-vocabulary-and-one-token-system.md) records why it is shaped this way; it is implemented and still proposed, waiting for the owner's decision. The [architecture](architecture.md) places these files among the server modules.

The browser app has no build step and no npm runtime dependency ([ADR 0002](adrs/0002-native-node-and-single-writer-storage.md)). Every file is a native ES module or stylesheet that the Unfold server serves as it is.

## Information architecture

The sidebar is the only navigation. [`shell.js`](../public/shell.js) draws it around every signed-in page.

The groups carry no part names: the first group is the work itself, the second follows it, and Settings sits at the bottom ([ADR 0038](adrs/0038-the-application-shows-unfold-and-is-organised-around-work.md)).

| Group | Item | Route | What it holds | Count on the item |
| --- | --- | --- | --- | --- |
| (top) | Now | `#now` | Home: what waits on you, what runs, what finished | Items waiting on you |
| Work | Work | `#work`, `#work/<id>` | Work Items by lane, for one Team or all, and one Work Item's page | — |
| Work | Proposed | `#proposed` | Work Items agents proposed, across Teams, with Approve and Reject | Proposed items |
| Work | Tasks | `#tasks` | Tracker tasks to preview and import | — |
| Follow | Runs | `#runs` | Run history | — |
| Follow | Activity | `#activity` | Ploeg's audit feed | — |
| Follow | Insights | `#insights` | Per-Team counts and spend in a window, as stats and tables | — |
| Follow | Sessions | `#sessions`, `#session/<id>` | Interactive sessions | Sessions that need you |
| (bottom) | Settings | `#settings/accounts` | Linked accounts, Environment, Preferences, Signed-in editors, Card logins and the Card designer | — |

The groups are drawn without headings, separated by a rule. **Your cards** (Binder `#binder`, Packs `#packs`, `#packs/odds`, `#packs/<id>`, and Season `#season`) lives in the account menu, above Preferences; their breadcrumb reads "Your cards".

* Sessions shows only in demo mode, when shared execution is configured, when sessions exist, or while a session page is open ([`showsSessions`](../public/shell.js)).
* A count is hidden when it is zero or unknown. Unknown is `null`, never `0`.
* From 720 px to 1100 px of viewport the sidebar is a 4 rem icon rail. Below 720 px it is hidden: the top bar's menu button opens it as a `<dialog>` drawer, and a bottom bar holds Now, Work, Runs and More.
* `#design`, the [living style guide](#living-style-guide), is not in the navigation. Preferences and the command palette link to it.

Every page also has:

* a top bar with breadcrumbs, the search button ("Search or jump to…", also `/`, Ctrl K or ⌘ K), the status strip and the account menu. As the bar narrows, the search button drops its text and then its key hint, "Updated … ago" hides below 1366 px and the account name below 1280 px. On phones the breadcrumbs shrink to the page title, or to a back link when the page passes `back` to `shell()`, and the search button to its icon;
* a status strip: on a session page, whether its event stream is connected; Ploeg's connection state (demo, connected, partly unavailable, unreachable, not configured or no Teams); "Updated … ago" for the page on screen; a Live or Paused switch; and a Demo or Live badge;
* an account menu with the System · Light · Dark theme switch, Preferences, Keyboard shortcuts and, outside the demo, Sign out;
* one `<h1 id="page-title" tabindex="-1">`, and `document.title` set to `(<waiting>) <Page> · Unfold`, without the count when nothing waits;
* on the six Settings pages, a sub-navigation: Preferences, Environment, Linked accounts, Signed-in editors, Card logins, Card designer.

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
| `settings/accounts`, `settings/environment`, `settings/preferences`, `settings/editors`, `settings/cards`, `settings/card-designer` | [`account`](../public/views/account.js), [`system`](../public/views/system.js), [`preferences`](../public/views/preferences.js), [`editors`](../public/views/editors.js), [`card-identity`](../public/views/card-identity.js), [`designer`](../public/views/designer.js) | — |
| `editor-sign-in/<code>` | [`editor-sign-in`](../public/views/editor-sign-in.js) | — |
| `binder` | [`binder`](../public/views/binder.js) | `card`: the focused card, written with `history.replaceState` |
| `packs`, `packs/odds`, `packs/<id>` | [`packs`](../public/views/packs.js) | — |
| `season` | [`season`](../public/views/season.js) | `team`, `quarter` (`2026-Q3`) |
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

* **Since you were away.** A line opens the page: "Since 09:12 · 3 h ago", then how many Work Items became ready for review or need you, how many were proposed and how many Runs finished since then. The start is the `lastVisit` preference, which Now writes when you leave it and when you press **Mark as caught up**. Each tab keeps its start in `sessionStorage` key `unfold.nowSince`, so a reload or a short trip to a Work Item keeps it; a new period starts once Now has been out of sight for 30 minutes. Rows that changed since the start carry an unread dot. A first visit shows "Welcome to Unfold" instead.
* **Stat row.** Waiting on you (a breakdown, not a link, because the list follows), Running (to `#runs?state=running`), Queued (to `#work?lane=queued`) and Spend · 24 h (to `#insights?window=24h`). Queued and spend come from `GET /api/ploeg/summary?window=24h`. A value that could not be read shows "—" with the reason; in the demo the spend tile shows a muted "—" and "Demo · no model calls". On phones the stat row moves below the lists.
* **Budget Ploeg cannot release.** When any finished Run in your Teams still holds budget because Ploeg cannot block its model key, a severe callout above the line says "3 Runs hold budget Ploeg cannot release" with the held total, a **Show the 3 Runs** disclosure whose rows open `#work/<id>`, and Ploeg's runbook `apps/ploeg/docs/ops/managed-workers.md`, "Reconcile uncertainty". The list comes with the summary from Ploeg's `GET /api/v1/operator/unsettled-accounts`; the count and total are summed from the rows you may see. There is no callout with none, when the list could not be read, or in the demo, and Unfold offers no settle, release or retry action. Insights shows the same count and total in its **Cannot release** tile.
* **Waiting on you**, in three groups: **Ready for your review**, **Needs you**, **Proposed**, each in Ploeg's order, oldest first. A Needs you row leads with its reason chip and one line saying why, with the secondary **Not routed** chip when no repository resolved. Once Needs you holds more than five Work Items and a reason repeats, it splits into one sub-group per shared reason (largest first, the fix written once in its header, three rows each) and **Other reasons**. An ungrouped group lists eight rows, then "Show N more in Work" or "in Proposed". Stale Work Items are not in Ploeg's waiting list; Now shows their count as one row that opens Work. Needs you starts with **Could not start**: tracker tasks that Ploeg's routing refused in the last 14 days (Ploeg's `GET /api/v1/operator/route-refusals`), which are not Work Items. Each row names the task, says why in plain words with the `repo/` labels its board allows, and offers **Open in Vikunja** (or the task's own tracker), built from the task connection whose provider and project match. Without one it opens the configured tracker root, or offers no button. A task leaves the group once it is queued. When the list cannot be read, Needs you shows an inline notice with **Try again**; an older Ploeg without the list shows nothing. The demo shows one illustrative refusal.
* **Row actions.** The row opens `#work/<id>`. A review row has **Pull request**, and the agent's verdict when one of the recently finished Runs reported it. A proposal has **Approve or reject**, which opens `#proposed?id=<id>`. The task in the tracker is an icon link, and so is Grafana, when it is configured, for an infrastructure reason.
* **Running now** lists running Runs with a budget meter: observed spend of the authorized amount, hatched "Not reported" when unknown, "Demo · no model calls" in the demo. **Recently finished** shows the six latest by finish time with outcome and agent verdict. Both link to Runs.
* **Refresh.** Every 30 seconds. New waiting items and finished Runs wait behind an "N new · Show" button, so the list never moves under you. A group that fails keeps the others on screen with its own Try again.
* **Keys.** `j` and `k` move between rows, Enter opens, `o` opens the focused review row's pull request, or otherwise its task in the tracker.

### Work and the Work Item page

Work lists Work Items by lane; the Work Item page says why one waits and what to do ([`ploeg.js`](../public/ploeg.js), [`views/work.js`](../public/views/work.js)).

* **Toolbar.** A Team select (All teams by default; the choice is remembered in the `team` preference), one lane control with counts (**Ready for review**, **Needs you**, **Running**, **Queued**, **All**) and Refresh. Counts cover the pages loaded so far and read "4+" when a Team has more.
* **Rows.** Title, tracker key (with the Team when all Teams show), repository, Round and age. A queued row in infrastructure backoff reads "Retrying later". **Needs you** groups rows under one header per reason, with the reason chip, the Not routed chip, a count and the one-line fix. While a Work Item is open beside the list the fix line is hidden for space and shows as the header's tooltip. **Ready for review** rows read "PR #5 · Agent approved" or "No agent verdict"; Unfold reads up to twelve Work Item details for this and caches them by `updatedAt`. A live Work Item that has spent something, or is running, shows its spend of the Shift budget. **All** shows each row's state badge.
* **Layout.** When the Work area is at least 49 rem wide (about a 1100 px window), the list and the Work Item page sit side by side and the list scrolls on its own. Narrower, the page replaces the list and a back link returns to it.
* **Refresh.** Every 30 seconds; the page redraws only when Ploeg's data changed, so focus and a text selection survive.
* **Keys.** `j`, `k` and Enter in the list; `o` opens the open Work Item's pull request or tracker task; Esc closes the Work Item.

The Work Item page, `#work/<id>`, reads from top to bottom:

1. **Header.** Back link, "Team <name>" and tracker key (a link to the task), **Copy link**, **Check out branch**, **Cancel Work Item** and Close. **Check out branch** appears once Ploeg reported a branch for a routed Work Item, and never in the demo. Its dialog names the branch and repository and offers **Open in VS Code**, a `vscode://webgrip.unfold/checkout?workItem=<id>&origin=<workbench>` link the extension handles, and the `git fetch`, `git switch`, `git merge --ff-only` command to copy. The branch is the latest Shift's, else the newest checkpoint's, else the newest open pull request's ([`core/checkout.js`](../public/core/checkout.js)); a name that would need shell quoting is never offered. The title is `h2#ploeg-item-title`, focused after each load. The status line is the state badge with the reason chip, plus the Not routed chip. The facts line gives the repository and base branch, the pull request link, the Round, the number of Runs in the latest Shift and the last update. The agent attempt counter Ploeg keeps is under **Execution details**, so the page counts work in one word: Runs.
2. **Stages**, right under the header: Define, Execute, Review and Deliver as one ordered list ([`core/stages.js`](../public/core/stages.js)). The stage the work is in carries `aria-current="step"` and the Baken crease; a stopped stage (Needs you, Stopped retrying, Withdrawn) carries the attention tone and says why; stages not reached are hatched, and Deliver reads "No change to deliver" for work that ended without a merged pull request. Each stage shows one fact from Ploeg's records or the Run card: the tracker task, the attempt (a Shift), its Runs and spend, the pull request and its checks, and "Live in `<environment>`" only when a deploy was reported, otherwise "Merged · no deploy reported". Below 40 rem the stages stack.
3. **Problem and solution**, once a writing Run reported them: what was wrong or missing, and what the pull request changes, side by side on a wide screen. Unfold takes them from the newest writing Run of the latest Shift, or from an earlier Shift when no writer of the latest one reported yet, and says which Role and Round wrote them. The text is the agent's own account, so the card says to check it against the pull request. Without a report the card is absent ([Ploeg ADR-0042](../../ploeg/docs/adrs/0042-a-writing-run-reports-the-problem-and-solution-a-reviewer-reads.md)).
4. **Decision box.** For **Needs you** (and **Stopped retrying**) it is **Why this needs you**: Unfold's explanation, Ploeg's own sentence quoted under it when the evidence does not already say it, the Shift's budget meter when the budget ran out, the Runs that are the evidence, and the Not routed warning. A budget stop whose close reason shows more held than spent, or Ploeg's own `budget held by unsettled runs` reason, reads **Budget held, not spent**: the sentence gives the spent and held amounts from the close reason, names the failure that came first, says whether Ploeg has released the hold since (from the Shift's current `reservedUsd`), and the fix points at that failure, because a larger budget does not help while money is only held. Ploeg's own sentence is not quoted for the budget reasons, since it only repeats Unfold's. **What you can do** lists the steps, with one primary button: open the pull request, or the task in the tracker. The last step is always to assign the task to the Team again in the tracker, the only way to start again today. When Ploeg reported no link, the button is disabled and says where to look. `plan_exhausted` becomes **No pull request** or **Changes unresolved**, and never quotes Ploeg, whose sentence for it reads as if the work were ready to merge. For **Ready for review** it is **Ready for your review**: a receipt (agent review, findings, Rounds, time, branch, spend of budget), a **Before you merge** checklist and **On the forge**, which says what merging, requesting changes and closing without merging do. The checklist leads with the pull request's merge state from Ploeg: **Conflicts with `<base>`** in attention tone, saying to merge the base into the branch before reviewing; **No conflicts with `<base>`** with the time Ploeg checked; **Not checked yet**; or, when Ploeg reports no merge state, the note "Merge state: not reported". A conflict also shows as **PR #N · Conflicts** on the Ready for review lane and as a **Merge conflict** chip on the Now row. The checklist is never green for data Unfold lacks: CI always reads "not reported", spend is green only when settled within the budget, and instruction files named in the findings are a warning. Other states get a short box: **Running now**, **Waiting to start**, **Done**, **Withdrawn**, or **Waiting for your approval** with a link to Proposed.
5. **Delivery**, once the Work Item has a pull request: the pull request, its checks on head, a person's approval, the merge and the first deploy to each environment in the order they were reached, each with its time ([`core/delivery-track.js`](../public/core/delivery-track.js)). A failed check or a closed pull request reads as failed and nothing is marked next; a stage without a fact is never done. A card without deploy facts says so.
6. **Trace this bug** (proposed, [ADR 0030](adrs/0030-vloer-traces-bugs-under-an-administrator-mapped-forge-login.md)), only when Ploeg listed candidate causes or attributions for the Work Item. It says a crack is an inquiry, not a verdict, and names the forge login Ploeg knows the reader by. It lists the attributions on the bug (state, severity, share, discovery, who proposed and confirmed, until when the steward may dispute, the mend), Ploeg's candidate plays with the files they share with the fix, and the bugs already traced to the Work Item as a card. **Propose as cause**, **Confirm**, **Dispute**, **Resolve as referee** and **Requirement changed** show only to people Ploeg would let take that step, and a line says why a step is missing. Each opens a dialog that checks its fields; the result is announced in the panel. **How tracing a bug works** lists the rules: Ploeg only suggests, the fixer proposes, two people confirm, the steward may dispute within five working days, a referee's decision is final, and a changed requirement gives no crack. The demo's bug DEMO-24 shows the flow and records nothing.
7. **Linked sessions**, when an Unfold session drives the Work Item.
8. **Brief.** `descriptionMarkdown` rendered by [`markdown.js`](../public/core/markdown.js); a long brief folds behind "Show the full brief". Source links to the task.
9. **Run Card** (proposed feature, [ADR 0026](adrs/0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md)), when Ploeg sent one. A `<unfold-card>` in the Work Target's skin, Unfold Native by default. The front shows the title, state, cost against the budget as a ring, tokens, run time, diff, pull request and CI, the crew, the steward or "Unsigned", the number of plays and the ids, and once released a "Day N" chip with the finish name (matte, foil, holo, prism, gilded, infinity) that the skin draws as a restrained light layer. A card with a rarity (proposed, [ADR 0034](adrs/0034-run-cards-show-rarity-as-frame-metal-and-a-set-symbol-and-reveal-it-once-at-release.md), against the unmerged Ploeg PR #121) prints its set symbol and tier (Common, Uncommon, Rare, Epic, Legendary) and draws its frame in the tier's metal (steel, bronze, silver, gold, prismatic); a rarity still predicted reads "Predicted rare" and glows instead. Chips name a crack or mend ("Cracked · S3"), an evolved requirement and the card's place in its epic's set ("2/5 · Checkout and confirmation hardening"). When Ploeg recorded gate moves, a strip shows development, test, acceptance and done with the current gate, a marker on each gate the Work Item bounced back from (red when it counts against right first time), and a "Right first time" or "1 bounce back" chip. When Ploeg sends KPI figures (proposed, [ADR 0035](adrs/0035-run-cards-lead-with-three-or-four-kpis-for-their-state-and-keep-the-rest-on-the-back.md), against the unmerged Ploeg PR #130 and #133), a strip of three or four headline figures picked for the card's state sits under the gates: in review, time to first feedback ("waiting 3 h" while nobody has responded), CI's last green run with its reruns, complexity added and cycle time so far; merged, lead time, first feedback, CI and time to production (or complexity); drafting, time to start or cycle time so far, lead time, blocked time and the estimate. Each figure's meaning is its tooltip; only reruns, blocked time and reopens (amber) and green first time (green) are coloured. **More info** turns it to twelve tabs: Economics, Agent, Change (with complexity added, removed and net, deepest nesting, hotspots, test ratio, documentation, languages, commits and coding time when Ploeg sends them), Review & CI (with the pipeline's first feedback, open to merge, review rounds, CI minutes, reruns and first-pass green, medians over several plays, and per play its timeline as steps, its review rows and its CI rows with the slowest jobs), Flow (a sentence, a Calendar / Working hours toggle the browser remembers for every card, the team calendar, tiles for lead, cycle and start time, flow efficiency, blocked time, reopens, the queue before the first Run, agent time and estimate against actual, a stacked bar of time per status coloured by kind with a table of status, kind, visits, calendar and working time beneath it, and what Ploeg does not collect), Gates (the path and each bounce with its reason and who moved it), Grade (the formula, subgrades and every input, "Not collected yet" where Ploeg has no source), Rarity (why this rarity, the prediction and the reveal, the challenge score, the rank in the repository's cards that quarter, the formula, its four components and the sensitive paths, and a note that rarity is challenge, not the grade or the finish), Condition (each confirmed crack's severity, share, discovery, warranty, weight, confirmers, dispute and mend), Life, Set (an epic's children as a grid, or "3/5 of" the epic) and Context. Life lists days live, merge to each environment, time to production and restore times when Ploeg sends them, the release source ("counted from merge · no deploy signal" when the repository never reported a deploy, "Not live in production yet" when it does and none carried the change), the deployments per environment and the next finish. Values Ploeg did not report read "Not reported", and values it does not collect yet read "Not collected yet". The demo card reads "Demo · no model calls". Without a card, for example from an older Ploeg, the section is absent. A Work Target with `cardStyle.skin: "forge"` gets the proposed forge skin ([ADR 0028](adrs/0028-the-forge-skin-renders-run-cards-in-3d-with-vendored-three-js.md)): the card as a 3D object in a dark stage, with the foil covering more of it as its finish rises, relief that catches the light, a grading slab when Ploeg sent a grade, and cracks or gold kintsugi for its condition. Its face adds a Gates row and prints the set position beside the set symbol. Below it sit the state, cost, day, condition and set chips, **Turn over** for the 3D back, and **More info** for the same twelve tabs. Its face paints the headline figures as four cells under the type line and leaves crew and run time to its text facts and the back. It renders live while on screen, a still frame under reduced motion or on a software rasteriser, and Unfold Native without WebGL2. Six demo Work Items use it. A Work Target with `cardStyle.skin` set to `holo`, `loot`, `arcade`, `ticker` or `patch` gets one of five proposed DOM skins: Holo Rarity (a foil trading card), Loot Drop (an RPG item tooltip), Arcade Cabinet (a cabinet with a CRT screen), Ticker Terminal (a trading terminal) or Mission Patch (a mission dossier). Each draws the same facts in its own genre on a dark stage, including the headline figures (Holo in its rules box, Loot as affix lines, Arcade as a neon score block, Ticker as a quote board, Patch as after-action rows), with one more finish layer per step of the ladder, the grade as a slab label, cracks or gold kintsugi, the delivery gate, and an epic's Set Card in its own layout. A change to the card, such as a signature, a merge, a new finish, a crack or a mend, plays a short moment inside the card, and an idle animation runs only while the card is on screen; under reduced motion both hold still. **More info** turns to the same tabs in the skin's colours. Fifteen demo Work Items use them, three per skin. News on the card since the reader last saw it (a merge, a release, a revealed rarity, a finish step, a new grade, a confirmed crack, a mend or a completed set) plays a ceremony once (proposed, [ADR 0032](adrs/0032-an-effects-director-plays-run-card-moments-once-by-tier-within-accessibility-rules.md)): the card's skin reacts (Unfold Native sweeps its border, pops the chip that changed and rolls the day count; the forge stamps a merge seal, wipes in a finish as its coverage rises, draws a crack dark and flows gold into a mend), a short title names the moment, and page-level light plays on a shared overlay. The reader's seen mark moves before anything plays, so a reload or a second tab never replays it, and a first look at a card plays nothing. Under Calm (the default while the device asks for reduced motion) the card only glows and the title crossfades; Off plays nothing. The news is announced either way. Any key or click after 300 ms ends a ceremony.
10. **Rounds.** The Round ladder, a table of Roles by Rounds whose cells show the outcome or verdict (and the cost, outside the demo) and open their Run. A cell with more than one Run counts them by result ("5 Runs: 4 failed, 1 not started") and shows the newest failure rather than a Run Ploeg closed before it started; such a Run has no cost to report. Repeated Runs of one job read "Run 4 of 5 · after 3 infrastructure failures"; below 34 rem it becomes a list per Round. Then the Shift's budget meter, the Runs (failed and stuck first, then running, then newest; eight shown, the rest behind a disclosure), and earlier Shifts. An expanded Run shows its outcome, verdict, failure cause, stuck reason and findings, rendered as Markdown.
11. **Activity.** The Work Item's audit events in plain words ("Opened pull request #7"), eight shown, and the raw events as JSON on demand.
12. **Execution details**, collapsed, Ploeg's own records: ids, tracker key, revision, priority, repository, branch, attempts, next eligible time, Lease, Shift (the attempt) and close reason, checkpoints and times.

On phones the primary button also sits in a sticky bar above the bottom bar, hidden while the decision box's own button is on screen.

**Cancel Work Item** shows only to operators and administrators, and only when Ploeg would stop something: the Work Item is `ingested`, `queued` or `leased`, its latest Shift is still open, or one of its Runs has not finished. A stopped Work Item with a closed Shift has nothing to cancel, so it gets no button. It opens a confirmation that lists what Ploeg then does (withdraws the Work Item and closes its open Shift, stops running Runs and cancels waiting ones, blocks their model keys, revokes their forge tokens, comments on the tracker task, and leaves an open pull request on the forge), the spend so far, and that only the tracker can start it again. Focus starts on **Keep it**. Confirming posts `POST /api/ploeg/work-items/<id>/cancel` and shows Ploeg's answer: Runs stopped, Runs cancelled before they started, and whether the model keys are blocked, with "not reported" for a figure Ploeg left out. In the demo the dialog says nothing runs, so there is nothing to cancel; its confirm button is disabled and Unfold never sends the request.

### Proposed, Runs, Activity and Insights

These four read Ploeg's operator activity API ([`ploeg-activity.js`](../public/ploeg-activity.js)) and share `styles/feeds.css`. Each keeps its last data on screen when a refresh fails, with a notice and Try again.

* **Proposed** lists Work Items agents proposed, across Teams, in Ploeg's order. A card shows the kind (split from its source, clarification or discovered work), a Ready or Needs refinement badge, the Team, the brief as Markdown (folded when long), the Work Item it was found in, the proposing agent, the repository or Not routed, and whose budget it spends ("Spends from the delivery Team's budget"; Ploeg does not report Team budgets, so no amount). Operators and administrators get **Approve**, which asks for confirmation (**Approve and queue** or **Keep it proposed**), and **Reject**, which needs a reason: live, Ploeg marks the proposal Done without running it and keeps the reason; in the demo it is withdrawn from the sample data. Viewers see one note that an operator or administrator decides. Refreshes every 30 seconds.
* **Runs** is a table with a sticky header: Status (state, outcome, agent verdict, and a failure's cause and next step), Work Item (with Role, Round and tracker key), Started (with how long it took or has been running), Spend (a meter of settled, or observed so far, against authorized; "Not reported" when unknown) and Model (models and tokens). Running and waiting Runs come first. One toolbar filters by Team, State and Outcome; Outcome needs State Finished and says so. Below a 60 rem container the table becomes cards with every field. **Load older** pages back. Refreshes every 30 seconds.
* **Activity** is Ploeg's audit feed grouped by day, each event in plain words with its Work Item, actor and Team. Actors read as a person ("Ryan (you)" or "An operator"), "Agent", "Ploeg" or the tracker's name. One toolbar filters by Team and kind. It checks every 15 seconds and holds new events behind an "N new events" button that never moves the list. **Load older** pages back.
* **Insights** has a **Runs and spend** section for the chosen window (**24 hours**, **7 days**, **30 days**): Runs finished, Failed, Stuck and Settled spend, then a table with a row per Team. A **Work Items** section counts what is in each state right now, whatever the window, in tiles and a table of its own; its **Cannot release** tile counts the finished Runs whose budget Ploeg cannot release, with the held total, or reads "Could not be loaded" or "Not reported by this Ploeg". The count tiles link to the matching Runs filter, Work lane or Proposed. Stats and tables only, never a chart; on phones the tables become cards. Refreshes every 60 seconds.

### Tasks, Sessions and a session

* **Tasks** ([`tasks.js`](../public/views/tasks.js)) lists the open tasks of one task connection beside the selected task. On a wide screen the first task opens by itself; on a phone the list and the task alternate, with an **All tasks** back button. The brief is rendered from Markdown, and each row names the task's tracker assignees. On a connection Ploeg runs, a **Ploeg** card says where the task stands (Not with Ploeg yet, Assigned, Queued, Running, Ready for review, Needs you, Done or Taken back), lists its Work Items with state, spend and pull request, offers **Hand to** a team, and **Take back** until Ploeg starts ([ADR 0025](adrs/0025-hand-tracker-tasks-to-ploeg-by-assignment.md)). The import form, headed "Bring this task onto the floor.", appears on such a connection only when the task continues a queued Work Item of the execution team. It takes a crew, a runtime and a budget, and **Create session** stays in reach at the bottom of the window. **Connections** explains the five supported trackers. `j` and `k` move through the list.
* **Sessions** ([`sessions.js`](../public/views/sessions.js)) lists sessions with one filter, **All**, **Needs you**, **Open** and **Closed**, and a search; both live in the address. Needs you uses the same rule as the sidebar count. A reviewed session reads Accepted or Rejected, a finished unreviewed one Ready for your review, and one behind the delivery gate Awaiting your approval. A Workbench card shows the slots in use, recorded spend and what is configured. **New session** (`n`) is there for operators and administrators. Refreshes every 30 seconds.
* **A session** (`#session/<id>`, [`session.js`](../public/views/session.js)) puts the decision it waits on at the top: failure guidance as numbered steps, a permission or question card, the delivery gate, "Your review is next." with an evidence receipt, or, for a session that has not started, **Start crew**. Below are the brief (an imported task's text, with the agent prompt behind "What the crew was told"), the crew's progress and the evidence tabs Activity, Gateway, Changes, Checks and Handoff. The side column holds the budget meter and **Repository handoff**. The header holds Export handoff once there is evidence, Cancel, and Pause or Resume. On phones a sticky **Record your review** bar carries Reject… and Accept.

### Settings and sign-in

* **Linked accounts** lists the GitLab and ClickUp accounts a person links for their own use, with **Unlink** behind a confirmation. An OAuth link reads "Renews when used" instead of an expiry countdown.
* **Signed-in editors** (`#settings/editors`, [ADR 0037](adrs/0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md)) lists the VS Code editors the person approved, with when each was approved, last used and ends, and **Sign out** behind a confirmation.
* **Editor sign-in** (`#editor-sign-in/<code>`) is where the browser lands after signing in for an editor. It says "A VS Code editor is asking to sign in to <workbench> as you.", shows the code the editor shows, the role it would act with and what approving gives, warns to deny a link someone else sent, and offers **Approve** and **Deny**. An unknown, expired or someone else's request shows why it cannot be approved.
* **Environment** is a checklist of six health checks (Ploeg connection, Model gateway, Workspace placements, Agent runtimes, Task connections, Dashboards) with a tally, then the workbench facts and repositories. Administrators see which setting or environment variable fixes a check; everyone else is told to ask an administrator. Dashboards is optional and never a failure.
* **Preferences** has Appearance (theme, density, and how numbers and dates are written), Behaviour (single-key shortcuts, Refresh automatically and Desktop notifications) and Run cards (card motion: Automatic, Full, Calm or Off; card sound, off by default), and links to the style guide. Its controls stay in step with the top bar's Live switch and the account menu's theme.
* **Card designer** (`#settings/card-designer`, proposed, [ADR 0031](adrs/0031-card-themes-a-card-designer-and-generated-art.md)) designs Run card themes. A live preview draws the draft on a sample card (a demo card that says it is illustrative and makes no model calls, with a finish switch from Matte to Infinity) or on a Work Item's card by number. **Theme** picks a theme or starts a new one, with its name, id, skin, and for the forge its frame (Classic, Full art, Graded slab), foil pattern, art (per card, a preset, an uploaded image or video, or a shader), its inner world (off, Sky islands, Deep sea or Neon city), the colour and radius tokens the skin reads, a set symbol (SVG) and a card back. **Save theme** stores a version; **Versions** reopens an older one. **Shader art** generates art from a description when `cardThemes.ai` is configured, showing each attempt and its compiler log, and always accepts a pasted shader behind **Compile and use**. **Use it for a project** shows the `cardStyle` block for Ploeg's configuration and the theme JSON. Only administrators edit; everyone else sees the preview. The page is wide and keeps the preview beside the controls from a 60 rem container.
* **Inner world** (proposed, [ADR 0033](adrs/0033-a-forge-card-s-art-window-is-an-inner-world-its-holder-may-decorate-privately.md)). A forge card's art window can hold sky islands, a deep sea or a neon city that the card's tilt looks into, lit for its days live (dawn before release, night with an aurora after a year), with a windmill once merged, a lighthouse at 180 days live, a dark fissure for a crack and a gold seam and koi pond for a mend. A forge card without a theme shows the islands; a theme chooses its world or keeps its art. Hovering a thing shows the pointer and a click plays its reaction; **Flatten art** (or F while focus is in the card) squashes it into a flat picture and **Make it 3D** brings it back; the focused art window takes the arrow keys and Enter, and describes the world to screen readers. A person who holds a copy gets **Decorate** under the card: the world, time of day and weather, things to place on the ground (locked ones say what unlocks them) and an eraser, saved for them alone. Only the live card on a page draws a world; on the Work Item page, in the binder and in the designer's preview alike.
* **Sign-in** is a split page with the brand lockup. When single sign-on is configured, **Continue with** and the provider's name is the primary button. A failed attempt keeps the account name. An expired session shows "Your session expired" and, after signing in again, returns to the page you were on (`sessionStorage` key `unfold.returnTo`).

### Binder, Packs and Season

The collection side of Run cards ([ADR 0029](adrs/0029-binders-packs-and-pulls-collect-run-cards-privately-and-fairly.md), proposed). Copies draw with the forge skin, because pulls are forge cosmetics; the Work Item page keeps the skin its Work Target chose.

* **Card logins** (`#settings/cards`) shows the login an administrator mapped to the person (the demo login in the demo), which alone can name them a steward, and the other forge and tracker logins they add to collect cards, with their linked accounts' logins as suggestions. Notes say added logins never attribute anything, and that the binder and packs are private, administrators included.
* **Binder.** The readouts are personal (cards, released, days live, days live this quarter, mends), with no comparison. A focused card is drawn large by `<unfold-card>` with its roles, its pull and its chance. A grid of still forge thumbnails sits beside it, drawn one after another by one shared renderer ([`cards/thumbs.js`](../public/cards/thumbs.js)), with Team, rarity and role filters and a **Rarest first** sort; each caption names the card's rarity. A copy whose pull waits in an unopened pack sits in a sleeve. On the first load after news, **While you were away** plays each moment since the last visit on the focused card (finish rising, crack, mend, merge), with **Skip**. It is marked seen at once, so it never replays, and under reduced motion it is a list.
* **Packs.** The oldest sealed pack is the hero: a 3D foil pack ([`cards/pack-scene.js`](../public/cards/pack-scene.js)).
  * **Tearing.** Drag across its top edge, or press **Tear open** or Enter.
  * **Revealing.** Cards deal face down, and **Reveal card n of m**, a click on the stage or Space reveals each one. The anticipation grows with the pull's odds alone, then come the flip, the foil wipe, particles and bloom, and a title with the pattern, its chance in nl-NL, any extras and the card's rarity, announced in the live region. The rarity never changes the pull or its anticipation.
  * **Ending.** **Skip to summary** appears after 300 ms, and the summary offers **Add to binder**. Reduced motion reveals instantly with no particles. Sound is off until the **Sound** switch turns it on (preference `cardSound`, shared with every card ceremony). The ceremony holds the effects director, follows the card motion preference (Calm and Off reveal instantly) and draws its particles with the shared [`effects/particles.js`](../public/cards/effects/particles.js).
  * **Lists.** Below the hero: the other sealed packs (Waiting, opened in order), the current period's pack (Filling now, with the date it seals) and opened packs.
* **Odds** (`#packs/odds`) lists every pattern's chance and "1 in N", the three extras, and the rules: earned contents, cosmetic pulls, one pull per card, a fixed HMAC draw, no purchase, re-roll, trade or expiry.
* **Season** shows the Team and quarter as segmented links, with Team totals as stats and tables: finishes reached and bounce reasons, and Team medians of lead time, time to first feedback, CI minutes and flow efficiency over the quarter's shipped cards (proposed, [ADR 0035](adrs/0035-run-cards-lead-with-three-or-four-kpis-for-their-state-and-keep-the-rest-on-the-back.md)), each with the number of cards it covers. A figure Ploeg does not send reads "Not collected yet". A line says the page names and ranks nobody.

### Command palette

The search button, `/`, and Ctrl K or ⌘ K open the palette ([`palette.js`](../public/views/palette.js)), an ARIA combobox over a grouped listbox. Ctrl K does nothing while another dialog is open, so a half-filled form is never hidden under it.

* Empty, it shows **Recent** (the last eight Work Items and sessions you opened in this browser, kept per user under `localStorage` key `unfold.recent`), **Commands** and **Go to**.
* Typing matches pages, Work lanes and Settings pages (**Go to**); commands (switch theme, pause or resume live updates, refresh this page, new session, keyboard shortcuts, preferences, desktop notifications, density, single-key shortcuts, copy link, and sign out outside the demo); **Work Items**; and **Sessions**. Matching ignores case and accents and takes the words in any order.
* Work Items come from what the tab already loaded, plus at most one `GET /api/ploeg/now` a minute when the palette opens. A number such as `108` offers "Open Work Item #108". No match offers **Open Work**. A failed read shows a notice with Retry.
* Arrow keys, Page Up and Down, Enter and Esc work from anywhere in the palette; Tab stays inside it. On phones it is a full-screen sheet with a Cancel button.

### Attention signals

* The page title starts with the number of items waiting on you.
* While something waits, the favicon becomes a PNG drawn on a canvas with an amber dot (`--attention-signal`), from the same shapes as `favicon.svg` ([`favicon.js`](../public/core/favicon.js)).
* Desktop notifications are off by default. Turned on in Preferences or the palette, the browser first asks for permission. Then an Unfold tab that is open but not in front notifies once per item that starts waiting, and once per head commit when a waiting pull request starts to conflict ("PR #N now conflicts"); more than three at once become one summary. Open tabs share `localStorage` key `unfold.notified`, so only one of them notifies ([`attention.js`](../public/core/attention.js)).
* The counts behind these refresh every 60 seconds, also in a background tab, which browsers slow to about once a minute. The job skips its read while Now is on screen, because Now reads the same data.

### Not built

These appear in the design research or the redesign's reports and are not implemented. Each is proposed:

* Starting a Work Item again from Unfold. Today the only way is assigning the task to the Team again in the tracker; a requeue would be Ploeg work.
* A structured attention reason from Ploeg. Unfold derives reasons from close-reason strings.
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
| [`prefs.js`](../public/core/prefs.js), [`theme.js`](../public/core/theme.js) | Per-browser preferences in `localStorage` key `unfold.prefs`: `theme`, `density`, `singleKeyShortcuts`, `live`, `notify`, `format`, `lastVisit`, `team`, `cardMotion`, `cardSound` | Read and write through `prefs`; storage failures fall back to memory. `theme.js` is a classic script that applies theme and density before first paint |
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
| Brand primitives | `--vouw`, `--baken`, `--baken-nacht`, `--vel`, `--zwerk`, `--grafiet`, `--grafiet-licht`, `--brand-fold` | Unfold's palette from [docs/brand](../../../docs/brand/README.md); only through the semantic tokens below, except the mark's `--brand-fold` |
| Surfaces | `--bg-canvas`, `--bg-surface`, `--bg-raised`, `--bg-overlay`, `--bg-sunken`, `--bg-hover`, `--bg-selected`, `--bg-track` | Hover, active, skeleton and track fills are translucent; never use them behind sticky or floating elements |
| Text | `--text`, `--text-muted`, `--text-subtle`, `--text-disabled`, `--text-on-solid` | `--text-on-solid` only on a tone's `-emphasis` or `--accent-solid` |
| Borders and focus | `--border-subtle`, `--border`, `--border-strong`, `--border-control`, `--border-control-strong`, `--focus-ring` | Checkboxes, radios and switches use `--border-control-strong` |
| Accent | `--accent-fg`, `--accent-solid`, `--accent-on-solid`, `--accent-emphasis`, `--accent-graphic`, `--accent-bg` | Primary actions, checkboxes and switches in ink (inverted on dark grounds); links, focus and graphics in Baken; selection stays neutral ([ADR 0038](adrs/0038-the-application-shows-unfold-and-is-organised-around-work.md)) |
| Status tones | `--{tone}-bg`, `-bg-hover`, `-border`, `-fg`, `-solid`, `-emphasis` for `neutral`, `live`, `attention`, `review`, `success`, `danger`, `severe`; `--attention-signal` | Set `data-tone="<tone>"` on an element to get `--tone-bg`, `--tone-fg`, `--tone-border`, `--tone-solid` and `--tone-emphasis`. `--attention-signal` is only the favicon dot, brighter than `--attention-solid` so it shows in a tab strip |
| Type | `--font-sans`, `--font-mono`, `--text-2xs` … `--text-4xl` with matching `--leading-*`, `--weight-*`, `--tracking-*` | UI text 13 px (`--text-sm`), prose 14 px (`--text-md`) |
| Space and size | `--space-*` (4 px base), `--control-*`, `--row*`, `--icon-*`, `--sidebar-width`, `--prose-max`, `--tabbar-height`, `--bottombar-height` | `--bottombar-height` is the phone bottom bar's height and 0 elsewhere; sticky action bars and the toast sit above it |
| Shape and depth | `--radius-*`, `--shadow-*`, `--z-*` | Pills use `--radius-sm`. Modal dialogs live in the top layer and need no `z-index` |
| Motion | `--duration-*`, `--ease-*`, `--motion-distance` | Multiply every translate by `--motion-distance`, which is 0 under reduced motion |
| Density | `--density-row`, `--density-pad-y`, `--density-pad-x`, `--density-gap` | Row height and padding that the compact density tightens |

The tones mean: `live` running, `attention` needs you, `review` ready for review, `success` done, `danger` failed, `severe` stale or interrupted, `neutral` everything else. The [brand book](../../../docs/brand/README.md#colour) explains the choices.

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

Run them in `apps/unfold` with `mise exec -- npm test` and `mise exec -- npm run test:browser`.

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
| [`test/forge-world.test.mjs`](../test/forge-world.test.mjs), [`test/card-worlds.test.ts`](../test/card-worlds.test.ts) | The forge's inner world: facts to time of day and things, the theme's choice, the controls under the CSP, the world's front shader, and private, earned, holder-only decorations with their routes |
| [`test/collection-model.test.mjs`](../test/collection-model.test.mjs) | The words and numbers of the binder and packs: nl-NL odds, anticipation by pull only, copies drawn with the forge, and cards as they stood at a moment |
| [`scripts/browser/`](../scripts/browser/) | One flow per area, run in this order: `now`, `tasks`, `sessions`, `shell`, `palette`, `settings`, `feeds`, `work`, `forge`, `world`, `collection`, `login`. [`shell.mjs`](../scripts/browser/shell.mjs) covers redirects, title, focus, theme, live updates, shortcuts, the skip link and the phone layout; [`work.mjs`](../scripts/browser/work.mjs) covers the demo Cancel Work Item dialog and a mocked live cancel; [`collection.mjs`](../scripts/browser/collection.mjs) covers card logins, the binder, a demo pack ripped by keyboard, the odds, the reduced-motion ceremony and the season page |
