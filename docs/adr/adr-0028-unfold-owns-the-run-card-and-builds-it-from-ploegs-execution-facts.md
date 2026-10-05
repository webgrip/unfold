---
status: proposed
date: 2026-10-05
decision-makers: Ryan Grippeling
---

# Unfold owns the Run card and builds it from Ploeg's execution facts

## Context and Problem Statement

Today Ploeg assembles the Run card: its grade, rarity, image, card list, cracks and the card comment on the pull request. Unfold renders it (`src/ploeg.ts:795,1063-1155`, the `card-*` modules, packs, seasons and collection).

To feed the card, Ploeg ingests tracker status history, epics, deploys, pull request activity, CI runs and change shape. Its execution core never reads any of these. Ploeg's [ADR-0074](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0074-ploeg-publishes-execution-facts-and-consumers-own-presentation-and-delivery-analytics.md) proposes that the concept of a card leave Ploeg entirely. The evidence is Ploeg's [boundary audit](https://github.com/ploeg-hq/ploeg/blob/development/docs/research/2026-10-05-ploeg-boundary-audit.md).

If Ploeg stops assembling the card, where does each card input come from, and what does Unfold take on?

This covers the Run card, the card list, cracks, delivery gates, flow figures, rarity, epics as sets, and the card comment on the pull request.

## Decision Drivers

* The card is Unfold's product, and so are its vocabulary, formulas and skins.
* Unfold has no execution features ([ADR-0002](adr-0002-ploeg-is-the-only-engine.md)). Reading a tracker or forge and posting a comment are not execution.
* Data Ploeg holds that cannot be recomputed must reach Unfold before Ploeg drops it.
* A card must keep working across the switch.

## Considered Options

* Unfold builds the card from Ploeg's operator events and resources, plus its own tracker and forge reads
* Ploeg keeps assembling the card
* Ploeg relays every card input as an event, and Unfold only computes

## Decision Outcome

Chosen option: "**Unfold builds the card from Ploeg's operator events and resources, plus its own tracker and forge reads**".

| Card input | Source after the switch |
| --- | --- |
| Shift, Rounds, Runs, Outcomes, usage, settled spend, live spend | Ploeg operator resources and events (`run.finished`, `shift.closed`) |
| Pull request state, merged-by, reviews, CI state on the pushed head | Ploeg operator Work Item resource (facts Ploeg keeps for its own decisions) |
| Pull request activity, CI jobs, changed files, reverts, change shape | Unfold reads the forge with its own read-only identity |
| Tracker status history, delivery gates, epics | Unfold reads the tracker, and records status changes it observes from then on |
| Deploys | The pipeline posts deploy events to Unfold |
| Rarity, grade, flow calendar, cracks, card list by person | Computed and stored by Unfold (SQLite, single writer) |
| The card comment on the pull request | Posted and edited by Unfold with its own forge identity, found by its own marker |

Unfold's existing `src/rarity.ts` and calendar code stop being copies of Ploeg formulas and become the only implementation.

### Order

1. Unfold implements the sources above behind its existing card model, while Ploeg still serves its card routes.
2. Unfold imports Ploeg's one-off export: crack confirmations, revealed rarity, posted card comment ids, epic first-seen times, status and gate history, and deploys.
3. Unfold stops calling Ploeg's card routes, then pins the Ploeg release that removes them.

### Consequences

* Good, because card changes no longer need a Ploeg release, migration or contract version.
* Good, because the card's formulas live in one place.
* Bad, because Unfold needs read access to each tenant's forge and tracker, and a forge identity that can comment, with their rate limits.
* Bad, because tracker status history before the switch exists only in Ploeg's export. Vikunja does not keep it.

### Confirmation

* Unfold's card tests build every card field from Ploeg operator fixtures plus forge and tracker fakes, with no call to `/api/v1/operator/work-items/{id}/card`, `/cards` or the crack routes. A test fails if `src/ploeg.ts` still calls any of them.
* An import test loads a sample of Ploeg's export, and proves that revealed rarity and crack confirmations survive unchanged.
* `mise run verify` runs both.

## Pros and Cons of the Options

### Ploeg keeps assembling the card

* Good, because nothing moves.
* Bad, because Ploeg keeps a consumer's product, and every card change needs a Ploeg release.

### Ploeg relays every card input as an event

* Good, because Unfold needs no forge or tracker credentials.
* Bad, because Ploeg keeps the ingest pipelines, which are most of the code ADR-0074 removes. Ploeg's ADR-0074 keeps this as a fallback, for a fact Unfold cannot read itself.

## More Information

* Related: [ADR-0027](adr-0027-unfold-checks-its-ploeg-client-against-ploegs-published-schemas.md), Ploeg [ADR-0069](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0069-ploeg-names-none-of-its-consumers.md) and [ADR-0074](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0074-ploeg-publishes-execution-facts-and-consumers-own-presentation-and-delivery-analytics.md).
* 2026-10-05: proposed after the owner said the concept of a card should be unfamiliar to Ploeg.
