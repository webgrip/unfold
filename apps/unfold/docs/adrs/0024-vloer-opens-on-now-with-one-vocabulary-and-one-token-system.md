---
status: proposed
date: 2026-09-30
decision-makers: Ryan Grippeling
review-by: 2026-10-30
---

# Vloer opens on Now, names every state one way and draws from one token system

## Context and Problem Statement

The owner's production screenshot of Ploeg › Needs human showed what an operator meets today:

* The Vikunja brief printed as escaped HTML (`<p>…</p><p>Do not change anything else.</p>`). Vikunja sends HTML, and `ploeg.js` escaped it as text.
* Three rows of navigation for the same five lanes: top tabs, four stat cards and the list's inner tabs, about 330 px before the first Work Item.
* Seventeen identical "Needs your attention" badges in a list already filtered to that state. Why each item needed a person sat inside an expanded Run on the detail page.
* US dates in 12-hour time ("7/30/2026, 9:30:50 PM"), because `toLocaleString()` followed the browser, and money in two notations on one page ("$3.00" and "US$ 0,00").

The stylesheet behind it had grown to 3,176 lines with 306 distinct hex colours (382 literals), a hard-coded `color-scheme: light` and so no dark mode, and 173 `font-size` declarations between 6 and 10 px. The design research measured contrast failures where they hurt most: the session Accept button at 1.63:1, session status pills around 3:1, and an input focus ring at 1.89:1. Three label maps named the same states differently; a failed session read "Needs attention". Until the Now page landed, Vloer opened on Sessions, the interactive path that [Unfold ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md) retires.

How should Vloer's browser UI be organised, worded and styled so that a person opens it and knows within five seconds what needs them, why, and which button to press, while it stays a no-build application under a strict Content Security Policy?

## Decision Drivers

* The five-second test: what waits on you, why, and the next action, on the first screen.
* One term, one meaning. Every screen names a Ploeg state the same way, agent review never reads as human review, and unknown spend never reads as zero.
* [ADR 0002](0002-native-node-and-single-writer-storage.md) stays: native modules, no build step, no npm runtime dependency. The CSP stays `style-src 'self'`, so markup carries no `style` attribute.
* Old links keep working: bookmarks, tracker comments, and the VS Code extension, which opens `#ploeg` and `#ploeg/<id>`.
* Several people rebuild screens at the same time without editing the same file.
* The De Vloer brand book stays binding, and every text pair meets WCAG 2.2 AA in both themes.
* The owner's standing preferences: nl-NL money with two decimals, and stats and tables rather than charts.

## Considered Options

* Rebuild on the existing module application: Now as home, one sidebar, one vocabulary module, one formatter, an OKLCH token system with light and dark themes, legacy CSS in the lowest cascade layer, and a view registry
* Move the browser UI to a framework with a build step
* Keep the Ploeg tab structure and restyle it

## Decision Outcome

Chosen option: "Rebuild on the existing module application", because it removes every problem in the screenshot at its source (one navigation, one vocabulary, one formatter, one colour system) without reopening ADR 0002, and its view registry lets each screen be rebuilt by a different person behind one contract.

* **Navigation.** The sidebar is the only navigation: **Now**; a **Ploeg** group with **Work**, **Proposed**, **Runs**, **Activity** and **Insights**; a **Workbench** group with **Tasks** and **Sessions**; and **Settings**. Now is the home page and lists what waits on you, grouped Ready for your review, then Needs you, then Proposed. "Ploeg" names the engine in the status strip, not a page. Sessions shows only in demo mode, with shared execution configured, or when sessions exist. No page has more than one row of filters, and stat tiles summarise and link but never navigate a second way. On phones a top bar opens the navigation as a drawer, and a bottom bar holds Now, Work, Runs and More.
* **Routes.** Hash routes carry their filters and selection as query parameters (`#work?lane=needs_human&team=delivery`, `#work/105`), so reload, back, forward and shared links work. Every old hash redirects permanently with `history.replaceState`: `#ploeg` to `#insights`, `#ploeg/<id>` to `#work/<id>`, `#ploeg/lane/<lane>` to `#work?lane=<lane>`, `#account` and `#system` under `#settings/…`, `#compare/…` to `#sessions`, and an empty hash to `#now`. The [UI reference](../browser-ui.md#redirects) holds the full table.
* **One vocabulary.** [`public/core/states.js`](../../public/core/states.js) holds the label, tone and glyph of every state, and no screen defines its own. The labels that change, and why:

  | State | Label | Why |
  | --- | --- | --- |
  | `needs_human` | Needs you, always with its reason | Says who must act, in two words. A list filtered to this state drops the pill and shows the reason instead |
  | `awaiting_review` | Ready for review (pill), Ready for your review (heading) | The product's goal state; it must not look like Done |
  | `leased` | Running | What a person sees happening |
  | `stale` | Stopped retrying | Says what Ploeg did, and that it will not try again by itself |
  | `done` | Done, never "Merged" | `done` also covers no-change outcomes and rejected proposals |
  | Agent verdicts | Agent review: approve, changes requested, inconclusive | An agent verdict is never presented as a human review |

  [`public/core/reasons.js`](../../public/core/reasons.js) derives why a Work Item needs a person from its Shift's close reason. The Work Item page leads with the state and that reason, explains it in Vloer's words, and quotes Ploeg's own `work_item.needs_human` sentence under the explanation. For `plan_exhausted` it leaves Ploeg's sentence out, because that sentence asks a person to review and merge when no pull request may exist. An unresolved repository is a secondary "Not routed" warning, never the reason. Every reason ends with what to fix and how to start again: assign the task to the Team again in the tracker. Starting again from Vloer is proposed Ploeg work.
* **Formatting.** [`public/core/format.js`](../../public/core/format.js) formats every number, amount and date. Copy stays English; numbers and absolute dates use nl-NL: `US$ 1.234,50`, `30-09-2026 21:30` in 24-hour time and the browser's time zone, relative times in English ("5 min ago"). Amounts stay in US dollars with two decimals, `< US$ 0,01` below a cent, and "Not reported" when unknown. A preference switches numbers and dates to the browser's locale.
* **Token system.** [`public/styles/tokens.css`](../../public/styles/tokens.css) defines every colour once, in OKLCH on top of the unchanged brand colours, as a `light-dark()` pair wherever it changes with the theme (the solid fills and the text on them keep one value), plus type, space, radius, elevation, motion and density scales. Seven status tones (neutral, live, attention, review, success, danger, severe) each carry a glyph and a word, so status is never colour alone. Peil, the brand accent, is reserved for interaction. The theme follows the operating system, with a System · Light · Dark switch stored per browser and applied before first paint. The sidebar stays dark in both themes. Text is at least 12 px; 11 px is allowed only for uppercase overlines and key hints. There are no charts: a budget meter is a gauge drawn with SVG attributes, and the Round ladder is a table.
* **Cascade layers.** [`public/styles.css`](../../public/styles.css) declares `@layer tokens, base, components, shell, views;`. While the screens were rebuilt, the pre-redesign stylesheet sat unchanged in a `legacy` layer below these, so any new rule won whatever its specificity. It was deleted once no markup used its classes.
* **No build.** Browser code stays native ES modules with no bundler, no npm runtime dependency and no CDN. Dynamic geometry comes from SVG presentation attributes, `<meter>` or the CSSOM after render.
* **View registry.** [`public/app.js`](../../public/app.js) is only the entry. Shared modules live in `public/core/` and never import a view. Each screen area is one descriptor module in `public/views/`, and `createRegistry` refuses two views that claim the same id, action, form or field selector. The server serves `/core/`, `/views/` and `/styles/` modules by a strict file-name pattern.
* **Small server additions, all in Vloer.** `GET /api/ploeg/now` rows carry what a reason needs (`closeReason`, `latestShift`, `attempts`, `infraFailures`, `target`, `priority`, `provider`, `externalId`). Ploeg Work Items and the task preview carry `descriptionMarkdown`, tracker HTML converted to the Markdown the browser renders. The cancel route passes Ploeg's cancellation result through. Static files get a content ETag, 304 revalidation and gzip. The [HTTP contract](../contracts/api.md#ploeg-workbench) documents each one. Ploeg itself does not change.
* **Cancel Work Item.** The Work Item page offers Cancel Work Item to operators and administrators behind a confirmation that lists what it stops, then shows what Ploeg reports it stopped. In the demo the confirmation explains that nothing runs and its confirm button is disabled. No single key approves, rejects or cancels anything.

### Consequences

* Good, because each word, format and colour has one source that unit tests pin, and a new screen gets them by importing rather than copying.
* Good, because old bookmarks, tracker links and the VS Code extension's `#ploeg` links keep working without a change to the extension.
* Good, because dark mode, a 12 px floor and measured contrast come from the tokens, not from each screen.
* Good, because screens can be rebuilt in parallel: each has its own view module and view stylesheet.
* Good, because Now and the detail page can say why without a Ploeg change.
* Bad, because the browser now loads 65 modules and stylesheets where it loaded five files, one or two import levels deeper. With every screen rebuilt, on 2026-09-30 the HTML, JavaScript and CSS totalled about 970 KB, or about 270 KB with gzip, which the server applies; the foundation alone was about 550 KB. The largest files are the session page, the Work markup and the feeds markup.
* Bad, because Work reads up to twelve Work Item details to label Ready for review rows with their pull request and agent verdict, until the lane rows carry both.
* Bad, because English copy with Dutch number notation puts decimal commas in English sentences ("US$ 1,20 of US$ 3,00").
* Bad, because reasons are derived in Vloer from Ploeg's close-reason strings. A new or renamed code reads "Needs a decision" until Vloer learns it, and a missing one "Stopped; open for details". A structured reason from Ploeg would remove the derivation; it is proposed Ploeg work.
* Neutral, because the dark sidebar is one CSS declaration (`color-scheme: dark` on `.app-sidebar`); removing it makes the sidebar follow the theme.

### Confirmation

Implemented on the redesign branch and still proposed, waiting for the owner's decision. Every screen renders on `states.js`, `format.js` and `ui.js`; `public/styles/legacy.css` is gone; and the Work Item page has Cancel Work Item. The [UI reference](../browser-ui.md#screens) describes each screen as built.

In `apps/unfold`, `mise exec -- npm test` pins the decision:

* [`test/route.test.mjs`](../../test/route.test.mjs): every old link redirects to its new home, and every redirect lands on a registered view.
* [`test/view-registry.test.mjs`](../../test/view-registry.test.mjs): view ids and handlers are unique, every `data-action` and `data-form` has exactly one handler, and every hash routes to at most one view.
* [`test/states.test.mjs`](../../test/states.test.mjs), [`test/reasons.test.mjs`](../../test/reasons.test.mjs) and [`test/format.test.mjs`](../../test/format.test.mjs): the labels, the reasons and the nl-NL formats, including "Not reported" for unknown money.
* [`test/ui-components.test.mjs`](../../test/ui-components.test.mjs): every builder escapes hostile text, links only render for in-app paths and safe URLs, and unknown or demo spend is never drawn or written as zero.
* [`test/now-view.test.mjs`](../../test/now-view.test.mjs) and [`test/ploeg-view.test.mjs`](../../test/ploeg-view.test.mjs): Now's group order, reason chips and nl-NL money, the Work lanes, the decision box, the readiness checklist that is never green without data, and the Cancel Work Item dialog, shown only to operators and administrators.
* [`test/static-assets.test.ts`](../../test/static-assets.test.ts) and [`test/rich-text.test.ts`](../../test/rich-text.test.ts): ETag, 304 and gzip with every security header, and hostile tracker HTML that renders inert.

`mise exec -- npm run test:browser` runs the flows in [`scripts/browser/`](../../scripts/browser/). [`shell.mjs`](../../scripts/browser/shell.mjs) checks that old links redirect without adding a history entry, that a route change sets the title, focuses the page heading and announces it, the theme switch, and that the phone layout does not scroll sideways. [`work.mjs`](../../scripts/browser/work.mjs) checks the demo's Cancel Work Item dialog, whose confirm is disabled, and a mocked live cancel whose result takes focus. The browser check fails on any uncaught page error or console error, a CSP violation included; it ignores console errors that mention 401, 409 or 503, which its flows provoke on purpose.

The bar for implemented was that every screen renders without legacy classes, `public/styles/legacy.css` is gone, and the Work browser flow covers Cancel Work Item. All three held on 2026-09-30.

Re-evaluate if a screen needs client-side state that string-built markup cannot keep, if the module count measurably slows the first load over the real network, if Ploeg exposes a structured attention reason, or when Dutch copy is added.

## Pros and Cons of the Options

### Move the browser UI to a framework with a build step

* Good, because components, reactive state and a router come ready-made.
* Bad, because it reverses [ADR 0002](0002-native-node-and-single-writer-storage.md) and needs its own decision.
* Bad, because a bundler and runtime packages widen the supply chain that [ADR 0010](0010-one-release-train-with-zero-cve-images.md) holds to a zero-finding budget.
* Bad, because it rewrites every screen at once, which the owner then has to review as one change.
* Neutral, because the view registry leaves the door open: each view is already a separate unit.

### Keep the Ploeg tab structure and restyle it

* Good, because the diff is smaller and no link or test changes.
* Bad, because it keeps the repeated lane navigation and a page named after the engine, and Now stays one tab among many.

### Variant: let the sidebar follow the theme

* Good, because a light sidebar in light mode is calmer; the design research recommended it.
* Bad, because it drops the dark Hal sidebar that is Vloer's recognisable look today. Kept dark; the change back is one declaration.

### Variant: show amounts in euros

* Good, because the owner and the agencies in the offering think in euros.
* Bad, because Ploeg authorizes and settles in US dollars. A conversion needs a rate source and date, and would show amounts no ledger holds. Kept in US dollars, written in Dutch notation.

## More Information

* [Browser UI reference](../browser-ui.md): routes, redirects, the screens, the view contract, core modules, layers, tokens and accessibility rules.
* [Brand book §7](https://forgejo.webgrip.dev/webgrip/unfold/src/commit/87b2088ff8500498eb4eace340b3fc72535904a3/apps/vloer/docs/brand/README.md#the-applications-own-palette): the application palette and its status tones.
* [HTTP contract](../contracts/api.md#ploeg-workbench): the server additions.
* Supported by [ADR 0002](0002-native-node-and-single-writer-storage.md). The Sessions demotion follows [Unfold ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md). Cancel Work Item uses Ploeg's operator cancel, [journey D](../../../../docs/concepts/journeys.md#d-stopping-work).
* 2026-09-30 — Proposed for the owner's decision, with the foundation implemented and the screens being rebuilt. The build took some choices in the owner's absence (sidebar dark, "Insights" as a page name, Proposed as its own page, a command palette, opt-in desktop notifications); the redesign pull request lists them for review.
* 2026-09-30 — Implemented on the redesign branch: every screen rebuilt and the legacy stylesheet deleted. Still proposed. One choice departs from the redesign brief: the Work Item page quotes Ploeg's own `needs_human` sentence under Vloer's explanation instead of making it the headline, and leaves it out for `plan_exhausted`.
* 2026-10-01 — The owner's screenshot of a Work Item that read "Budget ran out" with US$ 0,00 spent led to these changes. Ploeg's sentence is no longer quoted for the budget reasons either, because it only restates Vloer's. A budget stop with more held than spent gets its own reason, **Budget held, not spent**, which names the failure behind the hold. The page no longer says that starting again from Vloer is proposed Ploeg work; that stays a fact of the decision, not something on screen. Work is counted in one word, Runs ("Run 4 of 5"), instead of attempts and tries, and `plan_exhausted` reads "Every Round ran, no result".
