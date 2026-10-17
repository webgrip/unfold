---
status: proposed
date: 2026-10-17
decision-makers: Ryan Grippeling
review-by: 2027-01-17
---

# Components are built and checked in a workbench outside the app

## Context and Problem Statement

On 2026-10-17 the owner looked at a running Work Item (Vikunja #2049) and asked for new ways to show it. After two rounds of designs they asked: "Make actual proper frontend design components that we can test etc, storybook etc maybe? Make it awesome so we can pull the UI loose from the actual app and we can properly test constraints etc."

Unfold's browser code has no build step and no framework: views are functions that return HTML strings, styles are layered CSS on design tokens, and the Content Security Policy allows no inline style or script. Components could only be seen inside the running app, with demo or live data, and the browser checks drive whole flows. Nothing showed one component in every state at every width, and nothing checked layout, contrast or target size per component.

How should components be developed, shown and checked on their own?

## Decision Drivers

* A component renders from fixtures alone, without the app, a server or Ploeg.
* Every state is a named story; the same stories feed the browser view, the unit tests and the browser checks.
* Checks run on what a person sees: page and element overflow, clipped text, target size (WCAG 2.2 2.5.8), contrast, accessible names, duplicate ids, motion under reduced motion, and the app's Content Security Policy.
* No new dependency: the application has one runtime dependency and a decision for each ([ADR 0036](0036-the-agent-host-speaks-websocket-through-ws.md)); Playwright is already a development dependency.
* Stories stay portable, so Storybook can be added later without rewriting them.

## Considered Options

* Storybook with its HTML renderer.
* Stories in Component Story Format, shown by a workbench of our own.
* Only the in-app Design page (`#design`).

## Decision Outcome

Chosen option: stories in Component Story Format 3, shown by a workbench of our own, because it needs no dependency, keeps the app's CSP in force and still lets Storybook's HTML renderer read the same files.

* Components live under `public/live/` as pure functions: a view model built from a Ploeg detail, and render functions that return HTML strings.
* Stories live in `public/live/stories/*.stories.js`: a default export with `title`, `render`, `args`, `argTypes` and `decorators`, and one named export per state.
* `npm run workbench` serves `public/` and `workbench/` with the app's CSP and opens a browser that shows each story at 390, 768 and 1280 px, light and dark, with its check results.
* `npm run test:workbench` renders every story at those widths and themes and once under reduced motion in headless Chromium and fails on any check failure.
* `node --test` covers the model's invariants and every story's markup.

### Consequences

* Good, because a component's constraints are tested where they break: at a width, in a theme, under reduced motion.
* Good, because the stories are plain modules that tests, the workbench and a later Storybook all read.
* Bad, because the workbench is ours to keep working; Storybook's addons (controls panel, docs pages, visual diffing) are not available until it is adopted.
* Neutral, because the in-app Design page stays the reference for tokens and shared `ui.js` parts.

### Confirmation

`npm run test:workbench` passes; `test/live-model.test.mjs` and `test/live-stories.test.mjs` pass in `npm test`.

## Pros and Cons of the Options

### Storybook with its HTML renderer

* Good, because it is the standard, with controls, docs and many addons.
* Bad, because it brings a bundler and hundreds of development packages to an application without a build step.
* Bad, because its preview runs with its own policy, so CSP failures show up only in the app.

### The in-app Design page only

* Good, because it already exists.
* Bad, because it needs a signed-in app, shows one width at a time and checks nothing.

## More Information

[The workbench guide](../workbench.md) explains how to add a component and a story.
