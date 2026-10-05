---
status: proposed
date: 2026-10-02
decision-makers: Ryan Grippeling
review-by: 2026-11-02
---

# Run cards lead with three or four KPIs for their state, and keep the rest on the back

## Context and Problem Statement

On 2026-10-02 the owner asked for "important KPIs on there. The amount of time the ticket was in every status etc, you know what I mean. How long CI took. How long it took to get merged / first feedback, complexity, etc etc." Earlier he asked that a card "feel good to see, to immediately know what things mean, what numbers mean", that cards keep their details on a "more info" back, that dashboards prefer stats and tables over timeseries for single values and comparisons, and that clients see team aggregates only.

Ploeg sends the figures in two stacked pull requests, both **proposed and not merged**: Ploeg PR #130 (Ploeg ADR-0057) adds `card.flow`, the time in every tracker status with its kind (active, waiting, blocked, done), lead, cycle and start time, flow efficiency, blocked time, reopens, the queue before the first Run, agent time, merge to each environment, restore times, the tracker's estimate and the team calendar, each human duration also in working seconds. Ploeg PR #133 (Ploeg ADR-0058) adds a play's `timeline` (opened, ready, first feedback, approvals, merge, review rounds, comments, reviewers, response time, commits, coding time, force pushes), its `ciTiming` (runs, failures, reruns, last green run, queue, time to green, minutes, the slowest jobs, first-pass green) and its `shape` (indentation complexity, test ratio, documentation, languages), with `card.pipeline` and `card.shape` adding them up. Everything is optional and an unknown figure is null.

That is more than forty figures. A card front already carries the title, state, cost, steward, ids, gates, rarity and finish on seven skins, two of which (the forge's painted face and the DOM skins' fixed-height cards) have no spare room. Which figures go on the front, how do they read, where does the rest go, and how do they stay facts about a change rather than a score of a person?

## Decision Drivers

* A reader understands a figure at a glance and can find out what it means without leaving the card.
* The figures that matter differ by state: a card in review is about waiting for feedback and CI; a delivered card is about how long delivery took.
* Card facts, not people. Waiting for a review measures the team. No figure ranks or colours a person, and none feeds the grade or rarity. Clients see team aggregates only.
* Every skin shows the same facts in its own genre, as rarity did ([ADR 0034](0034-run-cards-show-rarity-as-frame-metal-and-a-set-symbol-and-reveal-it-once-at-release.md)), without crowding a fixed-height card and without horizontal scrolling at phone width.
* Unfold reads the contract strictly but additively: an older Ploeg's card looks exactly as it did.
* Working time and calendar time both mislead on their own: a ticket opened on Friday evening "waited" all weekend.
* The CSP, no build step and no production dependency.

## Considered Options

* Three or four headline figures chosen by the card's state through the skin kit, a Flow tab on the back, the other figures in the tabs they belong to, a calendar ↔ working-hours toggle, and team medians on the season page
* Every figure on the front in a dense grid
* A KPI dashboard page beside the card, with charts over time
* No front figures: a KPI tab only

## Decision Outcome

Chosen option: "three or four headline figures chosen by state", because the front answers the question a reader has for that state, the back keeps every figure with its meaning, every skin gets the same strip from one place, and the season page answers the team question without naming anyone. **Proposed**, implemented on the Unfold side against the unmerged Ploeg PR #130 and #133.

1. **Reading the contract.** [`src/card-kpis.ts`](../../src/card-kpis.ts) reads `card.flow`, `card.pipeline`, `card.shape` and each play's `timeline`, `ciTiming` and `shape` figure by figure: a known field is checked (whole seconds, a share of at most 1, a time, a status kind, an environment name, a signed net complexity), an unreadable figure or sub-object becomes null and an unreadable list entry is left out, so one bad value never fails the card. Fields Unfold does not know are dropped at any depth. A field Ploeg did not send stays absent, so an older Ploeg's card keeps its shape.
2. **Headline figures per state.** [`card-kpis.js`](../../public/cards/card-kpis.js) `headlineKpis` picks the first three or four known figures, in this order:

    | State | Figures, in order |
    | --- | --- |
    | Drafting | Time to start while work has not started, else cycle time so far; lead time so far; blocked time when there was any; the estimate against the working cycle time |
    | In review | Time to first feedback, or "waiting 3 h" since ready while nobody has responded; CI's last green run with its reruns ("1 rerun") or "green first time"; complexity added; cycle time so far |
    | Merged | Lead time (else cycle time); time to first feedback; CI; time to production once a deploy reached it, else complexity added |
    | Closed, withdrawn | Cycle time, first feedback, CI, complexity |

    A card without figures prints no strip.
3. **Formatting.** Durations are compact and human, the two largest units that matter: "42 min", "3 h 10 min", "2 d 4 h", whole days from ten days ("12 d") ([`format.js`](../../public/core/format.js) `compactDuration`). Working time is written in hours, never days, because a working day is shorter than a calendar day ("26 h"; `workingDuration`). Numbers and dates use nl-NL ("31,6 min", "30-09-2026 05:00"), shares are whole percentages ("41%"). A figure Ploeg does not know reads "Not reported", never zero. Every figure carries a plain-language meaning (`kpiMeanings`) as its tooltip and in the Flow tab's "What these figures mean"; a span adds where its ends came from ("This card: from the tracker's creation to the release").
4. **Colour.** Only figures with one meaning get a tone: reruns are an attention hint (flaky CI), blocked time and reopens are attention, and green first time is success. Waiting for feedback, lead time, complexity and every other duration stay neutral. Nothing colours, ranks or names a person.
5. **Every skin.** The skin kit ([`skin-kit.js`](../../public/cards/skin-kit.js)) prints one escaped strip (`kpiStrip`: label, a short label for cramped skins, a value, an optional note, the meaning as title) and the runtime stylesheet ([`unfold-card.css`](../../public/cards/unfold-card.css)) draws it through `--uc-kpi-*` tokens. Each skin places it in its genre: Unfold Native as a row of tiles under the gates; Holo Rarity in the rules box as a two-by-two in place of the finish reminder; Loot Drop as affix lines ("Lead time: 9 d 3 h") that take two of its line budget and replace the flavour quote; Arcade Cabinet as a neon two-by-two with short labels, tightening its banner; Ticker Terminal as a quote board under its key figures; Mission Patch as two more after-action rows, in place of the remarks, with its ribbons capped at three. The forge paints four cells under its type line ([`face.js`](../../public/cards/skins/forge/face.js)) and moves crew and run time to its text facts and the back, so its face keeps its height. Below 26rem Unfold Native switches to short labels and lets values wrap.
6. **The Flow tab.** A Flow tab sits between Review & CI and Gates. It leads with a sentence ("Delivered in 8 d 6 h from ticket to release; 41% of the cycle was active work."), the calendar ↔ working-hours toggle with the team calendar ("Working hours: Mon–Fri 09:00–17:00 Europe/Amsterdam"), tiles for lead time, cycle time, time to start, flow efficiency, blocked time, reopens, the queue before the first Run, agent time and the estimate against actual, one horizontal stacked bar of time per status coloured by kind (active blue, waiting grey, blocked amber and hatched, done green) drawn as SVG attributes under the CSP, and a table beneath it with status, kind, visits, calendar and working time and a "now" marker. A done status that is still current runs on for as long as the card lives, so it is listed in the table and left out of the bar, which says so. What Ploeg does not collect (status moves, an estimate, holidays) is listed as "Not collected yet". The shared back gains `blocks` (stats, bar, table, steps, clock, glossary) so every skin's back draws them in its own colours.
7. **The other tabs.** Review & CI shows the card's pipeline (first feedback, open to merge, review rounds and comments, CI minutes, reruns, first-pass green), medians when there are several plays, and per play its timeline as steps with the gap since the step before ("+42 min"), its review rows and its CI rows with the three slowest jobs and where the timings were read; the "Not collected yet" rows for CI duration and review rounds go once Ploeg sends them. Change shows complexity added, removed and net, the deepest nesting, hotspots, test ratio, documentation, languages, commits, coding time and force pushes, with one line on what indentation complexity is. Life shows merge to each environment in deploy order, time to production and each mended crack's restore time with their mean.
8. **Calendar or working hours.** Every duration with a working twin prints both (`clockText`), and the runtime shows the one the card's `data-clock` names. The toggle sets it for every card on the page and remembers it per viewer in `localStorage` (`unfold.cards.clock`, read and written in try/catch, calendar when storage is unavailable). The forge's painted face stays in calendar time; its text facts follow the toggle.
9. **Team medians only.** The season page ([`season.ts`](../../src/season.ts) `seasonMedians`) adds a Team medians section over the quarter's shipped cards: lead time of delivered cards, time to first feedback, CI minutes and flow efficiency, each with the number of cards it covers, or "Not collected yet". There is no per-person figure anywhere, in line with the visibility decision (binders private, team pages for the team, clients team aggregates only).
10. **Demo.** [`ploeg-demo-kpis.ts`](../../src/ploeg-demo-kpis.ts) gives 23 demo cards deterministic, illustrative figures derived from their own illustrative times, with working time counted in Monday to Friday, 09:00 to 17:00 Europe/Amsterdam: a flaky-CI card with four reruns (DEMO-40), a card on hold for almost five days (DEMO-13), a nine-minute first feedback (DEMO-42), three cards with an estimate, a review still waiting for feedback (DEMO-9) and drafting cards whose cycle runs to now. Only the demo's own Runs count as agent time, and no model call or spend is invented; the cards keep "Demo · no model calls".
11. **Effects.** No new ceremony. A first feedback arriving is a candidate moment for [ADR 0032](0032-an-effects-director-plays-run-card-moments-once-by-tier-within-accessibility-rules.md)'s director and is deferred.

### Consequences

* Good, because a reader sees the three or four figures that matter for the card's state, in words, and every other figure is one turn away with its meaning.
* Good, because one strip and one set of tokens reach seven skins, and the back's blocks reach every skin's back.
* Good, because the toggle answers "but it was the weekend" without a second figure on the front.
* Good, because an older Ploeg, a missing figure or an unreadable one never breaks a card.
* Bad, because the fixed-height skins give something up for the strip: Holo's finish reminder, Loot's flavour quote, Patch's remarks and its fourth ribbon, the forge's crew and run-time rows, Arcade's banner subtitle.
* Bad, because a figure computed on read changes between two reads while a span is running, and "waiting 3 h" is Unfold's clock against Ploeg's `readyAt`.
* Bad, because a reader may still take waiting time as the author's speed; the meanings and the Flow tab's note say it measures the team.
* Bad, because indentation complexity is a proxy and deeply nested data files score high; the Change tab says so.
* Neutral, because the forge's face shows calendar time only.

### Confirmation

Proposed. It depends on Ploeg PR #130 (ADR-0057) and PR #133 (ADR-0058), which are not merged, and it is confirmed when a Ploeg with both serves live Work Items and the owner accepts the look.

In `apps/unfold`:

* `mise exec -- npm test`: [`test/card-kpis.test.ts`](../../test/card-kpis.test.ts) pins the proxy's reading (absent, null, the full contract, unknown fields dropped, each malformed figure and entry, an older card's shape), the demo's coverage, its working-hours calendar across daylight saving and the season medians. [`test/card-kpis-view.test.mjs`](../../test/card-kpis-view.test.mjs) pins the duration formats, the calendar line, the headline figures per state, the Flow tab's blocks, the Review & CI, Change and Life rows, the escaped strip and clock pairs, the back's markup without inline styles, the forge's face facts and the strip on every DOM skin.
* `mise exec -- npm run test:browser` ([`scripts/browser/kpis.mjs`](../../scripts/browser/kpis.mjs)) draws the headline figures on Unfold Native, the forge and each DOM skin pack, waits on DEMO-9, opens the Flow tab's bar and table, switches to working hours and keeps it across a reload, reads the Review & CI steps and CI rows and the Change and Life tabs, and checks phone width without horizontal scrolling.

Re-evaluate when Ploeg PR #130 or #133 merges or changes the contract, when a live card's headline misleads, or if someone asks for a figure per person, which is a works council matter first.

## Pros and Cons of the Options

### Every figure on the front

* Good, because nothing is hidden.
* Bad, because forty figures on a trading card read as noise, and the fixed-height skins cannot hold them.

### A KPI dashboard page with charts over time

* Good, because trends are visible.
* Bad, because the owner prefers stats and tables for single values and comparisons, and a dashboard per card leaves the card.

### A KPI tab only

* Good, because the front does not change.
* Bad, because the reader has to turn every card to learn whether it is waiting on review or blocked.

## More Information

* Owner request, 2026-10-02, quoted above.
* Ploeg PR #130 (Ploeg ADR-0057) and PR #133 (Ploeg ADR-0058), proposed: `cardFlow`, `cardFlowStatus`, `cardSpan`, `cardDuration`, `cardPlayTimeline`, `cardPlayCITiming`, `cardPlayShape`, `cardPipeline` and `cardShape` in Ploeg's operator API schema on those branches.
* Abram Hindle, Michael W. Godfrey and Richard C. Holt, "Reading Beside the Lines: Indentation as a Proxy for Complexity Metrics", ICPC 2008, pp. 133–142, doi:10.1109/ICPC.2008.13: the basis of Ploeg's indentation complexity.
* 2026-10-02: proposed with the proxy, the view model, the strip on every skin, the forge's face cells, the Flow tab, the Review & CI, Change and Life rows, the toggle, the season medians and the demo figures implemented on the Unfold side.
