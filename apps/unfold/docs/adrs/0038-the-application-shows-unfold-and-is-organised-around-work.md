---
status: accepted
date: 2026-10-04
decision-makers: Ryan Grippeling
---

# The application shows Unfold, and is organised around work

## Context and Problem Statement

The application was renamed Unfold ([system ADR-0020](../../../../docs/adr/adr-0020-unfold-is-the-application-and-the-name-vloer-is-retired.md)), but it still drew its former identity: a V standing on a floor in the Peil blue, a wordmark spelling its former name, and favicons, app icons, a link preview and an editor icon cut from that mark. Its sidebar grouped pages by part, "Ploeg", "Workbench" and "Cards", and a Work Item page started with the Run card, so a person had to read the card and the decision box to learn which stage the work was in.

The 2026-10-04 design review asked how a person should see the product. The owner accepted its recommendations: Unfold everywhere a person looks, the Work Item as the page people work on, its lifecycle shown as one sheet, a Shift shown as an attempt, and the Run card collection in the person menu. How does the application carry that?

## Decision Drivers

* One brand: what a person sees is the product, Unfold, and the mark on the site, the docs and the application is the same.
* Familiar controls: the sidebar, buttons and tables stay where daily users expect them.
* Stage at a glance: a Work Item page says where the work stands before anything else, from Ploeg's facts only.
* Honesty: a stage is never shown as done without a fact, and the page never says a change is live without a reported deploy.
* Colour carries meaning: red already means danger, so the brand red does not mark ordinary actions.

## Considered Options

* Unfold's brand, a work-first sidebar, a stage sheet at the head of the Work Item page and a delivery track
* Keep the Peil identity until a full redesign
* Unfold's brand only, without changing the pages

## Decision Outcome

Chosen option: "Unfold's brand, a work-first sidebar, a stage sheet and a delivery track", because it is the smallest change that makes the application recognisably Unfold and shows a Work Item's lifecycle, while every control people use daily stays where it was.

* **Brand.** The root generator ([`scripts/build-brand.mjs`](../../../../scripts/build-brand.mjs)) writes the mark the application draws, [`public/core/brand.js`](../../public/core/brand.js) and [`public/favicon.svg`](../../public/favicon.svg). Ink follows the text colour and the fold uses `--brand-fold` (Baken, or Baken Nacht on dark grounds). [`scripts/build-icons.mjs`](../../scripts/build-icons.mjs) rasterises the favicons, app icons, link preview and editor icon from the root brand files. The attention favicon draws the same paths. The application's separate brand directory and generator are gone.
* **Tokens.** Neutrals are Unfold's own (Vouw, Vel, Zwerk, Grafiet). Primary actions, checkboxes and switches are ink (`--accent-solid`, inverted on dark grounds, with `--accent-on-solid` on top). Baken is the text accent for links (`#C0303F` on light grounds, 5.2:1 on Vel and 4.8:1 on a selected row; a light Baken tint on dark grounds, at least 5.2:1), the focus ring, the current-stage crease and graphics. Selection is neutral. Danger keeps its own red and always comes with an icon and words.
* **Navigation.** The sidebar holds Now; then Work, Proposed and Tasks; then Runs, Activity, Insights and Sessions; then Settings. No group is named after a part. Binder, Packs and Season live under **Your cards** in the account menu.
* **Work Item page.** Under the header, [`core/stages.js`](../../public/core/stages.js) shows Define, Execute, Review and Deliver as one ordered list with `aria-current="step"` on the current or stopped stage. Below the decision, [`core/delivery-track.js`](../../public/core/delivery-track.js) shows the pull request, checks, approval, merge and each environment reached. Ploeg's records sit under **Execution details**, where a Shift reads as the attempt it is.

### Consequences

* Good, because the application, the site and the docs carry one mark and one palette.
* Good, because the stage of any Work Item is readable before the card, and a stopped stage says why.
* Good, because the delivery facts Ploeg already stores (merge, deploys) reach the page.
* Bad, because people who learned the blue accent and the part-named groups relearn two things once.
* Bad, because Define has no brief revisions yet, so its fact is the tracker task (VIK-1835 and VIK-1846).

### Confirmation

* `mise run brand-check` fails when `public/core/brand.js`, `public/favicon.svg` or the boot mark in `public/index.html` differ from the generator; `npm run icons:check` fails on a stale manifest or editor icon.
* `test/stages.test.mjs` pins the stage and delivery rules; `test/attention.test.mjs` pins that the favicon canvas draws favicon.svg's paths.
* The demo pages were opened in Chromium at 1440 px and 390 px, light and dark, on 2026-10-04.

## More Information

* 2026-10-04 — Decided by the owner in the design review (Q1, Q3, Q7; VIK-1831); built for VIK-1842, VIK-1843 and VIK-1844.
* Supersedes the navigation list of [ADR-0024](0024-unfold-opens-on-now-with-one-vocabulary-and-one-token-system.md) and the mark of [ADR-0020](0020-the-name-and-mark-are-trademarks.md); the trademark terms now live in the root [usage policy](../../../../docs/brand/TRADEMARK.md).
