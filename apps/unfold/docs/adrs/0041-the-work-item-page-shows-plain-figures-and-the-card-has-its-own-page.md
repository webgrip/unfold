---
status: accepted
date: 2026-10-11
decision-makers: Ryan Grippeling
review-by: 2027-01-11
---

# The Work Item page shows plain figures, and the card has its own page

## Context and Problem Statement

[ADR 0026](0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md) put the Run card at the head of the Work Item page, and the page's figures (spend, tokens, run time, diff, pull request and CI, crew, lead and cycle time) lived only inside it. A person who opens a running Work Item to see where it stands found a half-finished trading card instead: a card label, a predicted rarity, "Unsigned" and "No plays yet". The owner rejected that on 2026-10-11: the Work Item page should say clearly, at the top, what state everything is in, and the cards are a separate thing.

Where do the figures go, and where do the cards go?

## Decision Drivers

* The Work Item page is a tool used many times a day; familiar, plain figures beat a novel surface there.
* One spend figure, with what it means (observed so far, settled, reserved, of which budget), instead of several that disagree.
* The cards stay complete, with their skins, motion and back, and reachable.

## Considered Options

* A status panel of plain figures at the head of the Work Item page, and the card on its own page
* Keep the card on the Work Item page and add a figures strip above it
* Keep the card and drop its game elements

## Decision Outcome

Chosen option: **a status panel of plain figures, and the card on its own page**, because it answers "where does this stand?" with the application's own stat tiles and leaves the card whole for the place it belongs.

1. **Status panel** ([`public/ploeg.js`](../../public/ploeg.js) `statusMarkup`, `statusFacts`). Below the stage strip and across the content width: one headline with the state and what the review shows, the one primary action, and three labelled groups of `ui.stat` tiles. **Agent work:** spend as a meter against the Shift budget (observed so far while a Run runs, otherwise settled, with what is reserved), tokens in and out, run time, crew and Round. **Change:** pull request and its state, CI checks, the diff and files, and the person who approved or merged it. **Flow:** the flow figures [ADR 0035](0035-run-cards-lead-with-three-or-four-kpis-for-their-state-and-keep-the-rest-on-the-back.md) picks for the state (cycle, lead, first feedback, blocked, estimate). The figures come from the same delivery facts as the card, through `cardView`; while they load, or when Ploeg sends none, the agent figures come from Ploeg's own detail and the rest say "Not reported".
2. **No card on the Work Item page.** It loads no `<unfold-card>`, no skin and no effects. The review box always uses its short form, because the panel carries the spend and the primary action; it keeps the agent-verdict checks and drops "CI checks: not reported" when the forge sent a CI state.
3. **Card page** (`#card/<id>`, [`public/views/card.js`](../../public/views/card.js)) under Your cards: the full `<unfold-card>` with its skin, moments and back, refreshed every 30 seconds while open, with a link to the Work Item. The binder's focused card links to it. The Work Item page does not link to it.

### Consequences

* Good, because the page's top answers the state at a glance, on a phone too, without a game vocabulary.
* Good, because spend has one figure that says what kind it is.
* Bad, because a person who wants the card must go to Your cards; the Work Item page does not lead there.
* Neutral, because "Trace this bug" stays on the Work Item page and still speaks of cracks and cards: renaming it is a separate change.

### Confirmation

[`test/ploeg-view.test.mjs`](../../test/ploeg-view.test.mjs) pins the panel's groups, figures and absence of card traces, and [`scripts/browser/work.mjs`](../../scripts/browser/work.mjs) checks that the Work Item page has no `<unfold-card>` and that the card's face and back work on `#card/109`. The card skin, effect, rarity, KPI, forge, world and trace browser checks open cards on the card page.

## More Information

* Supersedes the "On the Work Item page" paragraph of [ADR 0026](0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md).
* 2026-10-11: accepted by the owner's request and implemented.
