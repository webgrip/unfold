---
status: superseded by ADR-0030
date: 2026-10-10
decision-makers: Ryan Grippeling
---

# Unfold owns the Run card and collects its inputs itself

## Context and Problem Statement

Today Ploeg assembles the Run card and collects every card input:
* forge pull request activity, CI runs, changed files and reverts;
* tracker status transitions;
* deploys and relations.

Unfold renders it (`src/ploeg.ts:795,1063-1155`, the `card-*` modules, packs, seasons and collection).

Ploeg's [ADR-0074](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0074-ploeg-exposes-its-execution-facts-and-consumers-collect-everything-else.md) proposes that Ploeg expose only its execution facts, a versioned event stream and its own metrics, and collect nothing for the card. Its [ADR-0077](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0077-ploeg-knows-work-sources-and-change-destinations-never-vendors.md) proposes that Ploeg core know no forge or tracker at all.

When the card is Unfold's, where do its inputs come from?

This covers the Run card, the card list, cracks, delivery gates, flow figures, rarity, grade, epics as sets, and the card comment on the pull request.

## Decision Drivers

* The card is Unfold's product, and so are its vocabulary, formulas and skins.
* Card collection must not share Ploeg's critical path.
* Unfold has no execution features ([ADR-0002](adr-0002-ploeg-is-the-only-engine.md)). Observing a forge or a tracker is not execution.
* Data Ploeg holds and cannot re-read must reach Unfold before Ploeg drops it.

## Considered Options

* Unfold's collector service follows Ploeg's events and reads the forge and tracker under its own identities
* Ploeg keeps collecting card inputs and exposes them raw
* Ploeg keeps assembling the card

## Decision Outcome

Chosen option: "**Unfold's collector service follows Ploeg's events and reads the forge and tracker under its own identities**". The service is [ADR-0029](adr-0029-unfold-collects-run-card-data-in-a-separate-go-service.md).

| Card part | Source |
| --- | --- |
| Shifts, Rounds, Runs, Outcomes, usage, live and settled spend, the pull requests Ploeg produced | Ploeg's operator resources and event stream, read with a read-only token |
| Pull request activity, CI runs and jobs, changed files, reverts | The collector, reading the forge with its own bot identity and webhooks |
| Tracker status transitions, relations | The collector, from tracker webhooks with a periodic board read as a fallback |
| Deploys | The pipeline posts them to the collector |
| Grade, rarity, KPIs, delivery gates, flow figures, cracks, card list | Computed and stored by the collector |
| The card comment | Posted and edited by the collector's own forge identity |

The Unfold application reads cards from the collector. Its `src/rarity.ts` and calendar copies are replaced by the collector's single implementation.

### Order

1. Ploeg ships its execution facts, event stream and a one-off export.
2. The collector ingests live while Ploeg still collects, and imports the export:
   * crack confirmations;
   * revealed rarity;
   * epic first-seen times;
   * status and gate history;
   * deploys.
3. A compare job diffs the collector's cards against Ploeg's for two weeks.
4. Unfold switches its card source to the collector.
5. The collector posts fresh card comments, because a different identity cannot edit Ploeg's. Ploeg then removes its card code.

### Consequences

* Good, because card changes never need a Ploeg release, and collection cannot slow a claim or a review.
* Good, because card formulas live in one place.
* Bad, because the collector needs forge and tracker identities, webhooks and rate limits of its own.
* Bad, because a collector outage loses what cannot be re-read: tracker status transitions, and deploys seen once.

### Confirmation

* The Unfold app's card tests read only the collector's card contract, with no call to Ploeg's `/card`, `/cards` or crack routes. A test fails if `src/ploeg.ts` still calls any of them.
* The collector's compare job reports zero unexplained differences for two weeks before cutover.
* `mise run verify` runs the app's tests.

## Pros and Cons of the Options

### Ploeg keeps collecting card inputs and exposes them raw

* Good, because Unfold needs no forge or tracker credentials.
* Bad, because Ploeg keeps vendor readers it does not use, on its critical path, against Ploeg ADR-0074 and ADR-0077.

### Ploeg keeps assembling the card

* Good, because nothing moves.
* Bad, because Ploeg keeps a consumer's product, and every card change needs a Ploeg release.

## More Information

* 2026-10-05: proposed with Unfold reading the forge and tracker itself.
* 2026-10-06: briefly revised to "Ploeg collects", then returned to Unfold-side collection in a separate service, after the owner chose minimal Ploeg exposure.
* 2026-10-10: superseded by [ADR-0030](adr-0030-run-cards-are-an-unfold-domain-on-top-of-ploegs-delivery-facts.md). Unfold still owns the card, but Ploeg supplies the delivery facts and Unfold collects nothing from the forge or tracker itself.
