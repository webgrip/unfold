---
type: reference
audience: [contributor, agent]
owner: vloer
last_verified: 2026-09-30
verified_by: "Source read of apps/vloer/public (index.html, app.js, shell.js, styles.css, core/, views/index.js and each view's match, styles/tokens.css, base.css, shell.css), scripts/browser-check.mjs and src/http.ts at 3506e94; test and browser-flow names read, not run. Screens being rebuilt at that commit (Now, Work, Proposed, Runs, Activity, Insights, Sessions, Tasks, Settings, sign-in, palette) were not checked beyond their routes, their live registrations and the legacy modules' money formatters"
---

# Browser UI

This page is the contract for code in `apps/vloer/public/`: which routes exist, how a screen plugs in, which shared module owns what, and the rules for CSS, themes, accessibility and the Content Security Policy. [ADR 0024](adrs/0024-vloer-opens-on-now-with-one-vocabulary-and-one-token-system.md) records why it is shaped this way; it is still proposed. The [architecture](architecture.md) places these files among the server modules.

The browser app has no build step and no npm runtime dependency ([ADR 0002](adrs/0002-native-node-and-single-writer-storage.md)). Every file is a native ES module or stylesheet that the Vloer server serves as it is.

## Information architecture

The sidebar is the only navigation. [`shell.js`](../public/shell.js) draws it around every signed-in page.

| Group | Item | Route | What it holds | Count on the item |
| --- | --- | --- | --- | --- |
| (top) | Now | `#now` | Home: what waits on you, what runs, what finished | Items waiting on you |
| Ploeg | Work | `#work`, `#work/<id>` | A Team's Work Items by lane, and one Work Item's page | — |
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
* `#design`, the [living style guide](#living-style-guide), is not in the navigation. Preferences links to it.

Every page also has:

* a top bar with breadcrumbs, the search trigger (`/`, Ctrl K or ⌘ K), the status strip and the account menu;
* a status strip: Ploeg's connection state (demo, connected, partly unavailable, unreachable, not configured or no Teams), "Updated … ago" for the page on screen, a Live or Paused switch, and a Demo or Live badge;
* an account menu with the System · Light · Dark theme switch, Preferences, Keyboard shortcuts and, outside the demo, Sign out;
* one `<h1 id="page-title" tabindex="-1">`, and `document.title` set to `(<waiting>) <Page> · De Vloer`, without the count when nothing waits.

The search trigger opens a placeholder that says the command palette is coming. The palette itself is not implemented yet.

## Routes

A hash is `#<path>?<query>`. [`route.js`](../public/core/route.js) splits it with `parseHash` (the query is read with `URLSearchParams`) and builds one with `buildHash`, which drops empty values. Filters and the open item live in the hash, so reload, back, forward and a shared link restore the same view.

| Path | View | Query parameters |
| --- | --- | --- |
| `now` | [`now`](../public/views/now.js) | — |
| `work`, `work/<id>` | [`work`](../public/views/work.js) | `lane` (`needs_human`, `awaiting_review`, `leased`, `queued`, `all`), `team`. The last Team is remembered per browser |
| `proposed` | [`proposed`](../public/views/proposed.js) | — |
| `runs` | [`runs`](../public/views/runs.js) | `team`, `state`, `outcome` |
| `activity` | [`activity`](../public/views/activity.js) | `team`, `kind` |
| `insights` | [`insights`](../public/views/insights.js) | `window` (`24h`, `7d`, `30d`) |
| `tasks` | [`tasks`](../public/views/tasks.js) | — |
| `sessions`, `session/<id>` | [`sessions`](../public/views/sessions.js), [`session`](../public/views/session.js) | — |
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

The VS Code extension still opens `#ploeg` and `#ploeg/<id>`; these redirects keep it working. When you retire a route, add its redirect to [`route.js`](../public/core/route.js) and a case to [`test/route.test.mjs`](../test/route.test.mjs), which checks that every redirect lands on a registered view.

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

`shell(content, options)` takes `{ title, subtitle, overline, actions, breadcrumbs: [{ label, href }], wide }`. `actions` is markup the view built and escaped. The older `shell(content, title, subtitle)` still works.

### Extend the UI

| To add | Do this | Checked by |
| --- | --- | --- |
| A screen | Create `views/<name>.js` with `id`, `match` and either `enter` or `render` (plus `load` when it is a page), and add it to `views/index.js`. Add a sidebar item in `shell.js` only for a top-level destination | `test/view-registry.test.mjs`: unique ids, one view per path |
| A stylesheet for it | Fill `styles/<name>.css`; each view already has one, imported into the `views` layer by `styles.css`. A new one needs its own `@import … layer(views)` line | The browser check fails on a 404 or a CSP error |
| An action or form | Put `data-action="x"` or `data-form="x"` in the view's markup and `actions.x` or `forms.x` in the same view | `test/view-registry.test.mjs`: every name has exactly one handler, and every handler has markup |
| A field listener | Add a selector key to `inputs` or `changes` | `createRegistry` throws on a duplicate selector |
| A shortcut | Add a row to `shortcuts` in [`keys.js`](../public/core/keys.js) so the `?` help lists it, mark a character-only key `single: true`, and gate its binding with `singleKeyAllowed(event)`. A row with `keys: ['g', '<letter>']` and a `route` becomes a `g` chord by itself. The other global keys (`?`, `/`, Ctrl or ⌘ K) live in `createGlobalKeys` | `test/keys.test.mjs` |
| A live refresh | `live.register('<view id>', { interval, refresh })` with the view's own id. `refresh` throws on failure so the scheduler backs off, and the view calls `live.touch('<view id>')` after every successful load | `test/live.test.mjs` |
| A preference | Add the key, its default and its valid values to [`prefs.js`](../public/core/prefs.js), and a `[data-pref]` control on Preferences | `test/prefs.test.mjs` |
| A file outside `core/`, `views/` or `styles/` | Add it to the `assets` map in [`src/http.ts`](../src/http.ts) | `test/static-assets.test.ts` |

Files in `core/`, `views/` and `styles/` are served automatically when their name matches `[a-z0-9][a-z0-9-]*\.(js|css)`, with no subdirectories. Anything else in those folders is a 404.

Rules for handlers:

* No single key approves, rejects or cancels anything. Those actions need a click and, when they spend money or stop work, a confirmation.
* Live jobs run only while the tab is visible, someone is signed in, no dialog is open, live updates are on and their view is current. Use `scope: 'global'` only for data every page needs, as the navigation counts do.
* Activity refreshes every 15 seconds and the navigation counts every 60 seconds. Not implemented yet: the 30-second refresh the redesign specifies for Now, Work, Proposed and Runs.

## Core modules

[`public/core/`](../public/core/) never imports a view or the shell. The modules that Node tests import stay free of `document` and `DOMParser` at import time, because Node has neither.

| Module | Owns | Rule for callers |
| --- | --- | --- |
| [`format.js`](../public/core/format.js) | Money, counts, plurals, dates, times, relative times, durations and `<time>` markup | Format every amount and date here. Money is US dollars in nl-NL with two decimals (`US$ 1.234,50`), `< US$ 0,01` below a cent with the exact value in `title`, and "Not reported" for anything that is not a number. Absolute dates read `30-09-2026 21:30`; relative times are English ("5 min ago") and become a date after seven days. `configureFormat({ locale: 'browser' })` switches to the browser's locale |
| [`states.js`](../public/core/states.js) | The label, tone, glyph and meaning of every Work Item state, Run state, outcome, verdict, failure reason and session status | Never write a state label in a view. `stateMeta('run:running')` disambiguates with a kind prefix. `done` is "Done", never "Merged". An agent verdict reads "Agent review: …" |
| [`reasons.js`](../public/core/reasons.js) | Why a `needs_human` or `stale` Work Item waits on you: chip, sentence, fix and how to start again | `listReason(item)` for lists, `detailReason(detail)` for the Work Item page, `routingWarning(item)` for the secondary "Not routed" chip, which is never the reason |
| [`prefs.js`](../public/core/prefs.js), [`theme.js`](../public/core/theme.js) | Per-browser preferences in `localStorage` key `vloer.prefs`: `theme`, `density`, `singleKeyShortcuts`, `live`, `format`, `lastVisit`, `team` | Read and write through `prefs`; storage failures fall back to memory. `theme.js` is a classic script that applies theme and density before first paint |
| [`live.js`](../public/core/live.js) | The one refresh scheduler, backoff, the Live or Paused state and "Updated … ago" | See [Extend the UI](#extend-the-ui) |
| [`keys.js`](../public/core/keys.js) | The shortcut table, the `?` help dialog and the global keys | See [Extend the UI](#extend-the-ui) |
| [`counts.js`](../public/core/counts.js) | The navigation counts and the Ploeg status, read from `GET /api/ploeg/now` | A view that loads Now data passes it to `applyNowCounts` rather than fetching twice |
| [`route.js`](../public/core/route.js) | Hash parsing, building and redirects | Build hashes with `buildHash`, never by string concatenation |
| [`ui.js`](../public/core/ui.js) | Pure string builders: buttons, badges, chips, cards, sections, page header, empty states, skeletons, callouts, meters, stats, tabs, segmented controls, tables, list rows, `<time>` | Prefer a builder to hand-written markup. Text parameters are escaped; parameters named `body`, `actions`, `meta`, `lead`, `trail` and `empty`, table cells and `dl` values are HTML slots the caller escapes. `stateBadge` looks up Work Item states itself; for any other kind, pass it the meta from `states.js` |
| [`icons.js`](../public/core/icons.js) | The in-house 24-unit stroke icon set and `icon(name)` | Own path data only; no third-party icon set |
| [`markdown.js`](../public/core/markdown.js) | The escape-first Markdown renderer for briefs, findings and task descriptions | Render `descriptionMarkdown` from the server with it. It escapes first, links only `http(s)` URLs with `rel="noopener noreferrer"`, and draws no images |
| [`dom.js`](../public/core/dom.js) | `escape`, `safeUrl`, `renderHtml`, the toast and the live region | Escape every string from a user, tracker, agent or server before it enters markup |
| [`state.js`](../public/core/state.js), [`api.js`](../public/core/api.js), [`navigation.js`](../public/core/navigation.js), [`registry.js`](../public/core/registry.js) | The shared state object, the API client with its 401 handler, page entry and the view registry | Add new state fields to the initial object in `state.js` |

[`lookup.js`](../public/core/lookup.js) and [`observability.js`](../public/core/observability.js) hold the session labels and outbound Grafana links the session screens use. The legacy markup modules [`ploeg.js`](../public/ploeg.js), [`ploeg-activity.js`](../public/ploeg-activity.js), [`now.js`](../public/now.js) and [`delivery.js`](../public/delivery.js) stay at the top level because Node tests import them. Now, Work, Proposed, Runs, Activity and Insights still render through them, with their own labels and money formatting, until those screens are rebuilt on `states.js`, `format.js` and `ui.js`.

## CSS

[`styles.css`](../public/styles.css) fixes the layer order and imports every stylesheet into its layer. It also holds the two Archivo `@font-face` rules, which `npm run license:check` requires there. The files under `styles/` declare no layer of their own.

| Layer | File | Holds |
| --- | --- | --- |
| `legacy` | `styles/legacy.css` | The pre-redesign stylesheet, unchanged. Lowest priority, so any later rule wins whatever its specificity. Deleted once no markup uses its classes |
| `tokens` | `styles/tokens.css` | Custom properties only |
| `base` | `styles/base.css` | Element defaults, focus, forms, text utilities, reduced motion, forced colours and print |
| `components` | `styles/components.css` | The classes `ui.js` emits; the [living style guide](#living-style-guide) lists them all |
| `shell` | `styles/shell.css` | Sidebar, top bar, status strip, drawer, bottom bar and page header |
| `views` | `styles/<view>.css` | One file per screen |

Use tokens, never literal colours or sizes. The families in [`tokens.css`](../public/styles/tokens.css):

| Family | Examples | Use |
| --- | --- | --- |
| Brand primitives | `--vlak`, `--peil`, `--peil-diep`, `--peil-donker`, `--krijt`, `--hal`, `--stof`, `--stof-licht` | Only through the roles below, and in the brand mark |
| Surfaces | `--bg-canvas`, `--bg-surface`, `--bg-raised`, `--bg-overlay`, `--bg-sunken`, `--bg-hover`, `--bg-selected`, `--bg-track` | Hover, active, skeleton and track fills are translucent; never use them behind sticky or floating elements |
| Text | `--text`, `--text-muted`, `--text-subtle`, `--text-disabled`, `--text-on-solid` | `--text-on-solid` only on a tone's `-emphasis` or `--accent-solid` |
| Borders and focus | `--border-subtle`, `--border`, `--border-strong`, `--border-control`, `--border-control-strong`, `--focus-ring` | Checkboxes, radios and switches use `--border-control-strong` |
| Accent (Peil) | `--accent-fg`, `--accent-solid`, `--accent-graphic`, `--accent-bg` | Interaction only: links, primary buttons, selection, focus. Never a status |
| Status tones | `--{tone}-bg`, `-bg-hover`, `-border`, `-fg`, `-solid`, `-emphasis` for `neutral`, `live`, `attention`, `review`, `success`, `danger`, `severe` | Set `data-tone="<tone>"` on an element to get `--tone-bg`, `--tone-fg`, `--tone-border`, `--tone-solid` and `--tone-emphasis` |
| Type | `--font-sans`, `--font-mono`, `--text-2xs` … `--text-4xl` with matching `--leading-*`, `--weight-*`, `--tracking-*` | UI text 13 px (`--text-sm`), prose 14 px (`--text-md`) |
| Space and size | `--space-*` (4 px base), `--control-*`, `--row*`, `--icon-*`, `--sidebar-width`, `--prose-max` | — |
| Shape and depth | `--radius-*`, `--shadow-*`, `--z-*` | Pills use `--radius-sm`. Modal dialogs live in the top layer and need no `z-index` |
| Motion | `--duration-*`, `--ease-*`, `--motion-distance` | Multiply every translate by `--motion-distance`, which is 0 under reduced motion |
| Density | `--density-row`, `--density-pad-y`, `--density-pad-x`, `--density-gap` | Row height and padding that the compact density tightens |

The tones mean: `live` running, `attention` needs you, `review` ready for review, `success` done, `danger` failed, `severe` stale or interrupted, `neutral` everything else. The [brand book](brand/README.md#the-applications-own-palette) explains the choices.

## Theming and density

* Every colour that changes with the theme is a `light-dark()` pair, so `color-scheme` picks the value. The solid fills (`--accent-solid` with its `-hover` and `-active`, and every `-emphasis` token) and the text on them (`--text-on-solid`, `--text-inverse`, `--text-inverse-muted`) keep one value in both themes, as do the brand primitives. The default follows the operating system. `data-theme="light"` or `"dark"` on `<html>` overrides it, and `data-density="compact"` tightens rows.
* The theme and density preferences are set per browser from the account menu or Preferences. [`theme.js`](../public/core/theme.js) applies them before the stylesheet loads, so there is no flash, and `applyAppearance()` also updates the two `theme-color` metas.
* An element can pin its own scheme with `color-scheme`. The sidebar and navigation drawer use `color-scheme: dark`, so they stay dark (Hal) in both themes.
* While a page still renders legacy markup, a guard in `legacy.css` forces it to light, because the legacy rules were never written for dark.
* Coarse pointers get larger controls and taller rows automatically.

## Accessibility

* **Text size.** Nothing below 12 px, except 11 px uppercase overlines and key hints. Numbers use tabular figures (the `.num` class, and `<time>`).
* **Status.** Never colour alone: every state has a glyph and a word. A glyph next to its word is `aria-hidden`.
* **Focus.** Every focusable element shows a 2 px `--focus-ring` outline with an offset; the design research measured it at 3:1 or more against every surface in both themes. Route changes move focus to the page heading and announce it. Closing the navigation drawer or the account menu returns focus to its button.
* **Keyboard.** Every action is reachable by keyboard. Single-key shortcuts obey the Single-key shortcuts preference (WCAG 2.1.4); when it is off, only Ctrl or ⌘ K, Enter and Esc remain. No single-key shortcut acts inside a text field or while a dialog is open.
* **Motion.** The live dot, the skeleton shimmer and the loading line are the only continuous animations. They, and the entrance of dialogs, drawers and toasts, run only under `prefers-reduced-motion: no-preference`. A busy button's spinner keeps turning under reduced motion because it is status.
* **Live regions.** `#announcement` is polite. Announce a change once; never announce streamed tokens or every refresh.
* **Layout.** No horizontal scroll at 390 px. Targets are at least 24 px, and larger on touch.
* **Money.** Format amounts with `format.js` and draw them with the `ui.js` meters and stats: unknown spend then reads "Not reported" and demo spend "Demo · no model calls", and neither is drawn or written as zero. The legacy screens do not follow this rule yet: `ploeg.js` and `ploeg-activity.js` format with their own `usd2` and `usdNl`, which print an amount Ploeg did not report as zero.

## Content Security Policy

The server sends `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'` on every response ([`src/http.ts`](../src/http.ts)). For UI code that means:

* No `style="…"` attribute and no `<style>` element in markup. Set dynamic geometry with SVG presentation attributes (`width`, `x`, `fill`), with `<meter>` or `<progress>`, or through the CSSOM after render (`element.style.setProperty(…)`), as the style guide does for its swatches.
* No inline script and no `on…=` attribute. Behaviour goes through `data-action`, `data-form` and the registry.
* No CDN, remote font or remote image. Images may be `data:` URLs.
* Links from outside data pass `safeUrl()` (http or https, no credentials), and external links carry `rel="noopener noreferrer"`.

The browser check fails on any uncaught page error and on any console error, and a CSP violation is a console error. It ignores console errors whose text contains 401, 409 or 503, the responses its flows provoke on purpose ([`browser-check.mjs`](../scripts/browser-check.mjs)).

## Living style guide

`#design` renders every token and component from `ui.js` in the current theme: colour, type, space and shape, icons, buttons, status, surfaces, feedback, meters and stats, navigation, data, lists, overlays, progress, forms, text and a class reference. Its own controls preview light, dark and compact density without changing your preferences. Check a new component there in both themes before it ships.

## Tests that pin this contract

Run them in `apps/vloer` with `mise exec -- npm test` and `mise exec -- npm run test:browser`.

| Test | Pins |
| --- | --- |
| [`test/route.test.mjs`](../test/route.test.mjs) | Hash parsing, building and every redirect |
| [`test/view-registry.test.mjs`](../test/view-registry.test.mjs) | Unique views and handlers, markup for every handler, one view per path |
| [`test/states.test.mjs`](../test/states.test.mjs), [`test/reasons.test.mjs`](../test/reasons.test.mjs), [`test/format.test.mjs`](../test/format.test.mjs) | Vocabulary, reasons and formats |
| [`test/prefs.test.mjs`](../test/prefs.test.mjs), [`test/live.test.mjs`](../test/live.test.mjs), [`test/keys.test.mjs`](../test/keys.test.mjs), [`test/counts.test.mjs`](../test/counts.test.mjs) | Preferences, the scheduler, shortcuts and navigation counts |
| [`test/ui-components.test.mjs`](../test/ui-components.test.mjs) | Escaping, safe links, meters, badges and icons |
| [`test/static-assets.test.ts`](../test/static-assets.test.ts) | Which paths are served, ETag, 304 and gzip |
| [`scripts/browser/`](../scripts/browser/) | One flow per area; [`shell.mjs`](../scripts/browser/shell.mjs) covers redirects, title, focus, theme, live updates, shortcuts and the phone layout |
