---
status: proposed
date: 2026-10-01
decision-makers: Ryan Grippeling
review-by: 2026-10-31
---

# The editor opens on Now and shares the browser's vocabulary

## Context and Problem Statement

The owner's screenshot of the VS Code extension on 2026-10-01 showed what a person meets in the editor sidebar:

* **Sessions** filled the top half. Its "Needs you 3" group held three demo sessions that had failed 20 days earlier ("Very simple: just say hi"), and the activity-bar badge counted them. Sessions is the interactive path that [Unfold ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md) retires.
* The Ploeg work that did need the owner sat two levels deep in the **Ploeg** view: team, then lane, then Work Item. No row said a pull request waited for review, and the view gave no reason why a Work Item needed a person.
* **Linked Tasks** listed 50 open tracker tasks as identical empty circles. Nothing said which of them Ploeg already had.
* The Work Item panel's toolbar and timestamp were clipped off the right edge, team roles read "→ builder → devops …" with a stray arrow, times were in 12-hour US format, and amounts read "$0.00".

The browser had already solved the same problems ([ADR 0024](0024-vloer-opens-on-now-with-one-vocabulary-and-one-token-system.md)): it opens on Now, names every state once in `public/core/states.js`, derives reasons in `public/core/reasons.js`, and formats amounts and dates in `public/core/format.js`. The extension used none of it. It kept its own label maps (`stateLabels` in `ploeg-tree.ts`, `stateNames` in `task.js`), so the two clients could name one state in two ways. The workbench already served everything a better editor needs: `GET /api/ploeg/now`, `GET /api/ploeg/work-items/{id}` and `/card`. The extension called none of them.

How should the editor sidebar and its Work Item panel be organised, worded and coloured, so that a person sees what waits on them without leaving the editor, and both clients say the same thing?

## Decision Drivers

* The five-second test from ADR 0024, in a 300-pixel sidebar: what waits on you, why, and the next action.
* One term, one meaning across the browser and the editor. Agent review never reads as human review, and unknown spend never reads as zero.
* [ADR 0007](0007-thin-editor-client.md) stays: native tree views, a narrow themed webview, and no third-party runtime dependency. The editor follows the user's theme; the brand accent is not forced on it.
* No server change. The editor uses routes the browser already uses.
* Command and view ids stay stable, so keybindings, walkthrough links and settings keep working.

## Considered Options

* Open the sidebar on Now; ship the browser's own vocabulary modules in the extension; contribute one theme colour per status tone
* Keep the Sessions-first layout and restyle it
* Embed the browser's Now page in a sidebar webview

## Decision Outcome

Chosen option: "Open the sidebar on Now; ship the browser's own vocabulary modules in the extension; contribute one theme colour per status tone". It answers the five-second question in native tree rows, removes the second vocabulary at its source, and needs no server work.

* **Views, in order.** **Now** (`vloer.now`, new) lists Ready for your review, then Needs you, then Proposed, then Running, across every Team the person may see. It is drawn from `GET /api/ploeg/now`, the same response as the browser's Now page. Needs-you rows lead with the reason chip from `reasons.js`; review rows name their pull request; Running rows show the Role, Round, elapsed time and the gateway's cost so far, never as settled spend. Sessions waiting for an answer also appear under Needs you. **Tasks** (was Linked Tasks) marks a tracker task that Ploeg holds as ready for review, needing you or proposed. **Work** (was Ploeg, id `vloer.ploeg` kept) keeps Team → lane → Work Item, names lanes and items from `states.js` and hides empty lanes. **Sessions** moves last and starts collapsed. Like the browser's sidebar entry, it shows only in the demo, with shared execution, or when sessions exist.
* **Attention.** The activity-bar badge counts what waits on a person: Work Items ready for review or needing them, and sessions waiting for an answer. A failed session no longer counts, because nothing about it is new. The status bar shows the review, needs-you and running counts, and it turns amber only when something needs the person. A Work Item that newly needs the person raises a notification under `vloer.notifications`. So does one that newly reaches Ready for review, under the `all` setting. The demo raises none.
* **One vocabulary.** `scripts/sync-core.mjs` copies `public/core/states.js`, `format.js` and `reasons.js` into the extension's `media/core/` at compile and test time. The extension host loads them through `loadCore` (`src/core.ts`), and webviews import them as modules. A test fails if a copy differs from its source or if a glyph lacks a codicon. Amounts and dates therefore read as in the browser: `US$ 1.234,50`, 24-hour times, "Not reported" for unknown spend.
* **One set of tones.** The extension contributes six theme colours, `vloer.live`, `vloer.attention`, `vloer.review`, `vloer.success`, `vloer.danger` and `vloer.severe`. Each defaults to the active theme's own chart or terminal colour: teal for running, amber for needs you, violet for review. Tree icons draw with them, and webviews read them as `--vscode-vloer-*` through `media/tokens.css`. A theme or the user's `workbench.colorCustomizations` can restyle every tone at once. The accent stays the theme's link and button colour, for interaction only.
* **The Work Item panel** opens from Now, Work and Tasks. It leads with the Work Item's state, its reason and one next action, then the pull request with CI and human reviews, the cost with the cost per role, the writer's problem and solution, the Runs by Round, the hand-off when one is possible, and the brief. It also opens for a Work Item without a tracker task, such as a proposal. It reads `GET /api/ploeg/work-items/{id}` and `/card`, and an older server's 404 leaves the status-only view.
* **Links.** Browser links open `#work/<id>` and `#now` instead of the legacy `#ploeg` hash.

### Consequences

* Good, because the browser and the editor cannot name a state, a reason or an amount differently: they run the same modules.
* Good, because a person sees a pull request waiting for review, with its number, without leaving the editor or expanding three levels.
* Good, because a theme can restyle Vloer's tones, and high-contrast themes get the theme's own colours.
* Bad, because Now costs the workbench several Ploeg reads. The editor reads it at most every 15 seconds and on a manual refresh, on top of the server's 5-second cache.
* Bad, because the extension now depends on files outside its folder at build time. A module in `public/core/` that imports a file the sync does not copy fails the build, and the error names the import.
* Bad, because a Tasks row shows Ploeg's state only for waiting work. Now's running rows carry a display reference (`VIK-585`), not the tracker id, so a running or queued task looks unmarked until Ploeg's run rows carry the tracker identity.
* Neutral, because Sessions stays reachable, and every session command keeps its id.

### Confirmation

Proposed; implemented on branch `feat/vloer-editor-redesign`. In `apps/unfold/extensions/vscode`, `mise exec -- npm test` pins it:

* `test/core.test.ts`: the shipped copies equal `public/core/`, states and amounts read as in the browser, and every glyph has a codicon.
* `test/now.test.ts`: Now's group order, the badge count, pull request numbers, reason-first Needs-you rows, settled and unknown spend, and demo rows without spend.
* `test/client.test.ts`: Now, a Work Item and its card come from the real demo server.
* `test/task-webview.test.ts` and `mise exec -- npm run test:webview`: the Work Item panel, including a page that never scrolls sideways at 1000 and 420 pixels.

The extension-host behaviour has no automated check. Activation, tree rendering, badges, contributed colours and notifications need a manual pass in VS Code 1.99 or later against the demo and against the homelab workbench before this is accepted.

Re-evaluate when Ploeg's run rows carry the tracker identity, when ADR 0024 changes the vocabulary modules' shape, or if a sidebar webview becomes necessary for something a tree row cannot show.

### Follow-ups

Proposed work, not implemented by this decision:

* **Act from the editor.** Approve or reject proposed work, and cancel a Work Item, from Now and the Work Item panel, through `POST /api/ploeg/work-items/{id}/(approve|reject|cancel)`. Use the browser's confirmation, which lists what a cancel stops.
* **Repository first.** List the Work Items of the open workspace's repository first in Now.
* **Review in the editor.** Check out a pull request's branch, or open its diff in VS Code, instead of only linking to the forge.
* **Running and queued state on Tasks rows.** This needs Ploeg's run rows to carry the tracker identity.
* **Live updates instead of polling Now.** This needs a Ploeg event stream ([ADR 0015](0015-ploeg-operator-read-api.md)).
* **Session panel.** Rebuild its layout on the same head-first structure; it already uses the tones.
* **Walkthrough and listing.** Add a walkthrough step for Now, and new screenshots for the Open VSX listing.

The panel picks up Ploeg's live Run usage (Ploeg ADR-0049), the writer's plain problem and solution summaries, and Run card facts frozen at Shift close when they ship.

## Pros and Cons of the Options

### Keep the Sessions-first layout and restyle it

* Good, because the diff is small and the views keep their order.
* Bad, because the first screen stays a retired path, and the work that needs the person stays three levels deep.

### Embed the browser's Now page in a sidebar webview

* Good, because it reuses the browser's markup as well as its vocabulary.
* Bad, because ADR 0007 keeps webviews to what native controls cannot do, and the browser page is not built for a 300-pixel sidebar.
* Bad, because a webview in the sidebar loses native keyboard navigation, tree badges and inline actions.

## More Information

* [ADR 0024](0024-vloer-opens-on-now-with-one-vocabulary-and-one-token-system.md): the browser decision this extends to the editor.
* [ADR 0025](0025-hand-tracker-tasks-to-ploeg-by-assignment.md): the hand-off that the Work Item panel keeps.
* [ADR 0007](0007-thin-editor-client.md): the thin editor client.
* [Extension README](../../extensions/vscode/README.md): what the extension shows and how to try it.
