# Component workbench

The workbench shows Unfold's browser components on their own, rendered from fixtures, with every state at phone, tablet and desktop width in both themes. The same stories feed the unit tests and a browser check that fails on layout, contrast, target-size, naming, motion and Content Security Policy problems. [ADR 0048](adrs/0048-components-are-built-and-checked-in-a-workbench-outside-the-app.md) records why it is not Storybook.

## Run it

```sh
mise exec -- npm run workbench        # serves http://127.0.0.1:7745/workbench/
mise exec -- npm run test:workbench   # every story × 390/768/1280 px × light/dark, plus reduced motion
```

The workbench keeps one frame per width and theme loaded and re-renders it in place when you pick another story, so a switch takes milliseconds and makes no requests. It reloads when the content of a file under `public/` or `workbench/` changes; reading a file does not count. Each frame's caption shows its check result; hover it for the details. `UNFOLD_WORKBENCH_PORT` changes the port.

`test:workbench` takes these variables: `UNFOLD_WORKBENCH_STORIES` (a regular expression over story ids, such as `layouts|dial`), `UNFOLD_WORKBENCH_WIDTHS` (`390,1280`), `UNFOLD_SCREENSHOTS` (a folder for full-page screenshots), `UNFOLD_WORKBENCH_REPORT` (a JSON file with every result) and `UNFOLD_CHROMIUM_BIN` (a Chromium binary, as for `test:browser`).

## The real app

The workbench's **Real app** tab runs Unfold itself: the real `index.html` and `app.js`, unchanged, with the hosted replay shim answering its API from a recording. Every frame is the actual Work Item page, checked like a story. Picking another Work Item changes the frame's address in place, so it takes milliseconds.

| Recording | Where it comes from | Kept |
| --- | --- | --- |
| `demo` | The deterministic demo, recorded by `npm run replay:record` into `apps/site/replay/replay.json` | In Git |
| any other name | A live Unfold, recorded by `npm run workbench:record` | Only on your machine, in `workbench/recorded/` (ignored by Git) |

Record live Work Items with your own session:

```sh
UNFOLD_COOKIE='<cookie name>=<value>' mise exec -- npm run workbench:record -- vik-2049 190
```

`UNFOLD_URL` defaults to `https://unfold.webgrip.dev`. The recorder opens Unfold in headless Chromium with your cookie, visits Now, Work and each Work Item, opens every disclosure so Run logs and transcripts load, and keeps every JSON `GET` answer. It blocks every other method, so recording never changes anything. Pages Unfold does not visit, such as Sessions, keep the demo's answers. A recording holds real tracker text, logs and your account; it never leaves your machine.

`test:workbench` checks one demo Work Item per state and every local recording at every width and theme, once as shipped, once with the `work.live-view` Labs flag on and once with `work.unified` (Unified Work Item page) on. In the workbench, the **Labs** boxes turn flags on for the frames; the server does it by adding them to the recorded bootstrap (`/app/<recording>~<flag>,<flag>/`). A request the recording cannot answer is a `recording` warning.

## What it checks

`workbench/checks.js` runs in every frame. A failure breaks `test:workbench`; a warning is listed only.

| Rule | Fails when |
| --- | --- |
| `page-overflow` | the page scrolls sideways |
| `element-overflow` | an element ends past the story's edge outside a scroll box |
| `clipped-text` | a box hides text without an ellipsis |
| `broken-word` | an ordinary word (letters only, up to 20) breaks across lines, such as “P ul l re q u e st” in a narrow box; code, paths and URLs may break |
| `target-size` | a control is smaller than 24 × 24 px and closer than 12 px from its centre to another target, unless it is a link inside a sentence (WCAG 2.2 2.5.8 with its spacing and inline exceptions); under 44 px tall is a warning |
| `contrast` | text is below 4.5:1, or 3:1 when large, against what is behind it |
| `name` | a control has no accessible name, or a graphic is neither labelled (`role="img"`, or `group` around controls) nor hidden |
| `duplicate-id` | an id appears twice |
| `motion` | an animation runs under reduced motion |
| `csp` | the page broke the app's Content Security Policy |
| `console` | the page logged an error (only in `test:workbench`) |

`test/live-stories.test.mjs` checks every story's markup without a browser: no inline styles or handlers, no leaked `undefined` or `NaN`, money in nl-NL, labelled or hidden SVG, typed buttons and unique ids.

## The live Work Item components

`public/live/` holds the components for following a running Work Item, from the designs of 17 October 2026:

| Module | Draws |
| --- | --- |
| `model.js` | `liveModel()`: one view model from a Ploeg detail and the followed Run's folded transcript. Its invariants are tested: one spend figure, machine-ended Runs counted as lost and not as Role work, agent time = useful + lost, attempts and Runs numbered from 1, no estimate unless one is passed |
| `flight-path.js` | the flight: one column per leg on a shared runway. Each Run is a hop whose altitude follows its calls per minute; a machine-ended Run drops back with a neutral bolt, an agent failure with a red mark, three or more in a row bounce as one burst with a count, a stalled Run circles in a holding pattern, a waiting Run taxis, and a stopped Work Item ends in a flag. Under 34 rem it stands up as a vertical flight log. `flightLegs()` returns the same as data for tests |
| `instruments.js` | spend against what the attempt holds, time, tokens, what was lost |
| `trace.js` | lanes on one time axis per attempt, move and Activity (`public/core/activity.js`, RFC-0009); the moves as disclosures; `activitySummary` for the one-line "Explore 14 min · no change yet" |
| `answers.js` | the questions people ask, answered from the record with their source |
| `landing.js` | `landingEstimate()`: when the running writing Run should open its pull request, from the median time the Team's last finished Runs of that Role took to open one; the slowest tenth once it runs long, and no landing time past them all or with fewer than three |
| `dial.js` | the Shift dial |
| `fold-strip.js` | the stages as folds, full or row-sized |
| `layouts.js` | the cockpit, instrument and fleet pages |
| `fleet.js` | the fleet board Now shows while the `now.fleet` Labs flag is on: `fleetModel()` from a Now and a 24-hour summary response, the headline and totals, the airspace (a lane per Team, a plane per Work Item from the gate to landed, approach lights while a pull request waits, the last Runs as a contrail) and the departures and arrivals boards on the night ground. Its fixtures are in `fleet-fixtures.js` |

`fixtures.js` holds the scenarios: VIK-2049 as it ran, first try, stalled, close to budget, a fix round after review, timed out and waiting for a worker, ready for review, needs you after agent failures, out of budget, stopped retrying after ten machine failures, withdrawn mid-Run, landed, queued, usage not reported, and a stress case with 40 Runs and 240 calls.

These components are not wired into the Work Item page yet. The fleet board is wired into Now behind `now.fleet`.

## Controls

`public/controls/` holds controls the app's pages share. Their stories sit beside them and are listed in the same `stories/index.js`.

| Module | Does |
| --- | --- |
| `time-range.js` | the time arithmetic, without a DOM: Grafana expressions (`now-6h`, `now-1d/d`, `now/w` with weeks from Monday), `18-10-2026 09:00` and ISO moments, the quick ranges, names such as `Last 45 minutes` or `18-10-2026 07:00 to 08:15`, moving back and forward by half the span, zooming out, a typed span such as `3 days` as a range, recently used ranges, the `from`, `to` and `refresh` query parameters and the `t ←`, `t →`, `t z` shortcuts |
| `time-picker.js` | the time picker: `pickerUpdate()` is its state machine, `timePicker()` its markup and `mountTimePicker()` makes it act, with focus kept, Escape and a click outside closing the panel, arrow keys through the quick ranges and auto-refresh only while the page is visible |

Runs and Activity use the picker through [`views/time-range-control.js`](../public/views/time-range-control.js), without its auto-refresh, because both pages refresh themselves. [`range-filter.js`](../public/controls/range-filter.js) decides which Runs and events fall inside a range.

## Play functions

A story can export a `play({ canvasElement, args })` function, as in Storybook. The frame runs it after the markup is in the page and before the checks, so `play` can make a component act and drive an interaction through it. A `play` that throws fails the frame with a `render` failure, at every width and theme, so an interaction test runs inside `npm run test:workbench`. `public/live/stories/play.js` has the helpers: `expect`, `find`, `click`, `type`, `press` and `shown`. A `play` that returns a function has it called before the frame renders the next story, to remove listeners it added.

The time picker's stories test it this way: `PicksATypedSpan`, `KeyboardShortcuts`, `ChecksTypedRanges`, `ClosesLikeAPopover` and `RefreshesOnSchedule`. `Interactive` only makes the picker act, so you can try it in the workbench.

## Add a component

1. Write a pure function that takes a view model and returns HTML. Use classes from a stylesheet under `public/styles/`, never a `style` attribute, and SVG presentation attributes for geometry.
2. Add a `*.stories.js` file under the component's `stories/` folder: `export default meta({ title, render })` and one named export per state, then list the file in `stories/index.js`. Add a `play` to the stories that test an interaction.
3. Run `npm run workbench`, then `npm run test:workbench` and `npm test`.

A story file is Component Story Format 3, so Storybook's HTML renderer can load it as it is.
