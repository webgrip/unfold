---
status: proposed
date: 2026-10-27
decision-makers: Ryan Grippeling
review-by: 2027-01-31
---

# A person snoozes rows on their own Now, and nothing shared changes

## Context and Problem Statement

Now's Unstick lane lists every Work Item Ploeg stopped on and every tracker task Ploeg could not start in the last 14 days. A person who has seen a row and will deal with it later cannot clear their view without fixing everything, so the banner's "N things need you" and the Now badge stay high and stop meaning anything. Old refusals that nobody will fix keep counting too.

How does a person set rows aside without taking priority from the tracker or dispatch from Ploeg?

## Decision Drivers

* The tracker owns priority and Ploeg owns dispatch ([ADR 0023](0023-unfold-submits-work-to-ploeg-and-never-executes-it.md)). Setting a row aside must not write to either.
* The banner and the Now badge say the same number.
* A snoozed row must come back when something happens to it, so a snooze never hides news.
* A viewer has the same need and changes nothing shared by setting their own view.

## Considered Options

* **Per-person snoozes in Unfold's store, keyed by the row and a fingerprint of what would change**
* Snoozes in the browser's `localStorage`
* A tracker label or a Ploeg hold that sets the item aside for everyone

## Decision Outcome

Chosen option: "**per-person snoozes in Unfold's store, keyed by the row and a fingerprint**", because it follows the person across browsers and devices and touches nothing shared.

1. **What can be set aside.** A Needs-you row and a "Could not start" row can be snoozed for 1 day, 1 week or until it changes. A "Could not start" row can also be dismissed, which lasts until the refusal changes.
2. **Change.** A snooze stores a fingerprint: a Work Item's state and `updatedAt`, a refusal's code and `refusedAt`. When the fingerprint differs, the row shows again, whatever time the snooze had left.
3. **Counts.** A row the person set aside leaves the banner, the lane counts and the Now badge, which all read the same filter. A quiet "N snoozed · Show" line lists them with Unsnooze.
4. **Old refusals.** A refusal older than 7 days folds into "N older refusals" and stops counting. Unfolding it lists them and still does not count them.
5. **Storage.** `now_snoozes` in Unfold's database, one row per person and key, at most 200 per person (the oldest goes), ended snoozes pruned on read, and snoozes that wait for a change kept for 90 days. Every role may set their own. Another person cannot read or change them. The demo keeps them the same way and says nothing was written outside Unfold.

### Consequences

* Good, because a person can bring the banner to what they will act on today, and a change brings a row back.
* Good, because priority and dispatch are untouched: the tracker and Ploeg never hear of a snooze.
* Bad, because a teammate still sees the row. Accepted: setting work aside for everyone is a tracker decision.
* Bad, because a row whose fingerprint fields Ploeg never updates stays hidden until its snooze ends or 90 days pass. Accepted: snoozes that wait for a change are listed under "N snoozed".

### Confirmation

* `npm test` in `apps/unfold`: `test/api-now-snoozes.test.ts` (per-person reads and writes, validation, the cap and pruning, the demo) and `test/now-snoozes.test.mjs` (the filter, change detection, the fold, and the badge equal to the banner).
* The browser flow `scripts/browser/loop.mjs` snoozes and dismisses by keyboard and mouse, reloads, and unsnoozes.
* All of it runs through `mise run verify` and `npm run test:browser`.

## Pros and Cons of the Options

### Snoozes in the browser's `localStorage`

* Good, because it needs no server route.
* Bad, because the Now badge on another device or browser disagrees with the banner, and storage can come back empty.

### A tracker label or a Ploeg hold

* Good, because the whole Team sees it.
* Bad, because it takes priority from the tracker or dispatch from Ploeg, which this decision must not do.

## More Information

* Contract: [HTTP contract, Snoozes](../contracts/api.md#snoozes); behaviour: [Browser UI, Now](../browser-ui.md#now).
* 2026-10-27: proposed with its implementation, building on the Now consistency fix (#646).
