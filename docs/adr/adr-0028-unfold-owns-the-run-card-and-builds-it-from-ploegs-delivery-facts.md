---
status: proposed
date: 2026-10-06
decision-makers: Ryan Grippeling
---

# Unfold owns the Run card and builds it from Ploeg's delivery facts

## Context and Problem Statement

Today Ploeg assembles the Run card: its grade, rarity, image, card list, cracks and the card comment on the pull request. Unfold renders it (`src/ploeg.ts:795,1063-1155`, the `card-*` modules, packs, seasons and collection).

Ploeg's [ADR-0074](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0074-ploeg-exposes-delivery-facts-and-consumers-own-the-card-and-every-formula-over-them.md) proposes that the concept of a card leave Ploeg while Ploeg keeps collecting and exposing every raw fact the card needs:
* pull request activity, CI runs, changed files and reverts;
* tracker status transitions;
* deploys;
* relations between Work Items;
* usage and spend.

The evidence is Ploeg's [boundary audit](https://github.com/ploeg-hq/ploeg/blob/development/docs/research/2026-10-05-ploeg-boundary-audit.md).

When the card is Unfold's, what does Unfold compute, store and publish, and what does it read from Ploeg?

This covers the Run card, the card list, cracks, delivery gates, flow figures, rarity, grade, epics as sets, and the card comment on the pull request.

## Decision Drivers

* The card is Unfold's product, and so are its vocabulary, formulas and skins.
* Unfold has no execution features ([ADR-0002](adr-0002-ploeg-is-the-only-engine.md)) and needs no forge or tracker credentials of its own: Ploeg is the one collector.
* Derived data Ploeg holds and cannot re-derive must reach Unfold before Ploeg drops it.
* A card must keep working across the switch.

## Considered Options

* Unfold computes the card from Ploeg's facts endpoint and publishes its comment through Ploeg's generic pull request note
* Unfold reads the forge and tracker itself
* Ploeg keeps assembling the card

## Decision Outcome

Chosen option: "**Unfold computes the card from Ploeg's facts endpoint and publishes its comment through Ploeg's generic pull request note**".

| Card part | Source after the switch |
| --- | --- |
| Shift, Rounds, Runs, Outcomes, usage, settled and live spend | Ploeg operator resources and events |
| Pull request state, reviews, CI, activity, changed files, reverts | Ploeg `GET /api/v1/operator/work-items/{id}/facts` |
| Tracker status transitions, relations, deploys | The same facts endpoint |
| Grade, rarity, change-shape figures, delivery gates, flow figures and the working calendar | Computed and stored by Unfold (SQLite, single writer) |
| Card list by person, crack confirm, dispute and resolve, referees | Unfold |
| The card comment on the pull request | Rendered by Unfold, published through Ploeg's generic pull request note with Unfold's marker |

Unfold's existing `src/rarity.ts` and calendar code stop being copies of Ploeg formulas and become the only implementation. Unfold follows new facts through Ploeg's audit events, not by polling every item.

### Order

1. Ploeg ships the facts endpoint, its events and the generic note beside its card routes.
2. Unfold builds the card from them behind its existing card model, and imports Ploeg's one-off export:
   * crack confirmations;
   * revealed rarity;
   * posted card comment ids.
3. Unfold stops calling Ploeg's card routes, then pins the Ploeg release that removes them.

### Consequences

* Good, because card changes no longer need a Ploeg release, migration or contract version.
* Good, because the card's formulas live in one place, and Unfold needs no forge or tracker credentials.
* Bad, because Unfold now stores derived card state (grades, frozen rarity, crack decisions) and must back it up.
* Bad, because a fact Ploeg does not expose cannot appear on a card until Ploeg adds it.

### Confirmation

* Unfold's card tests build every card field from Ploeg facts-endpoint fixtures, validated against `operator-api.v1` ([ADR-0027](adr-0027-unfold-checks-its-ploeg-client-against-ploegs-published-schemas.md)), with no call to `/card`, `/cards` or the crack routes. A test fails if `src/ploeg.ts` still calls any of them.
* An import test loads a sample of Ploeg's export, and proves that revealed rarity and crack confirmations survive unchanged.
* `mise run verify` runs both.

## Pros and Cons of the Options

### Unfold reads the forge and tracker itself

* Good, because Unfold does not depend on Ploeg exposing each fact.
* Bad, because Unfold would need forge and tracker credentials, webhooks and rate limits, and would collect facts Ploeg already records.

### Ploeg keeps assembling the card

* Good, because nothing moves.
* Bad, because Ploeg keeps a consumer's product, and every card change needs a Ploeg release.

## More Information

* Related: [ADR-0027](adr-0027-unfold-checks-its-ploeg-client-against-ploegs-published-schemas.md), and Ploeg [ADR-0069](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0069-ploeg-names-none-of-its-consumers.md) and [ADR-0074](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0074-ploeg-exposes-delivery-facts-and-consumers-own-the-card-and-every-formula-over-them.md).
* 2026-10-05: proposed with Unfold reading the forge and tracker itself.
* 2026-10-06: revised. Ploeg stays the one collector and exposes the facts; Unfold computes the card and publishes through Ploeg's generic note.
