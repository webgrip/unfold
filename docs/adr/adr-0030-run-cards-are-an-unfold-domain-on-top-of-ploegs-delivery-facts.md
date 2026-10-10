---
status: accepted
date: 2026-10-10
decision-makers: Ryan Grippeling
---

# Run cards are an Unfold domain on top of Ploeg's delivery facts

## Context and Problem Statement

Until Ploeg v0.2.0-rc.9, Ploeg assembled the Run card and Unfold drew it. Ploeg computed:

* the grade (formulas 2026.1 to 2026.3) and the rarity;
* the flow, pull request, CI and change-shape figures;
* the crack workflow, sets and the card list;
* the card comment with its image on the pull request.

Unfold proxied all of it (`apps/unfold/src/ploeg.ts`).

The owner decided on 2026-10-10: "Ploeg no longer has any card logic, or it shouldn't. So this is purely an extra fun little domain on top of what unfold is. And unfold uses ploeg to schedule agents."

[ADR-0028](adr-0028-unfold-owns-the-run-card-and-collects-its-inputs-itself.md) already moved card ownership to Unfold, and [ADR-0029](adr-0029-unfold-collects-run-card-data-in-a-separate-go-service.md) proposed a separate Go collector with its own forge and tracker identities. Neither is built.

Where do card concepts live, where does their human-made state live, and how does Ploeg's existing card state move without loss?

This covers the Unfold application (`apps/unfold`), Ploeg's operator API, and the card state Ploeg holds today: cracks, frozen rarities, card comment ids and stored play shapes.

## Decision Drivers

* Ploeg authorizes, budgets and executes Runs ([ADR-0002](adr-0002-ploeg-is-the-only-engine.md)). A card formula is not execution and must not need a Ploeg release.
* Ploeg already collects the forge and tracker facts. A second collector would need its own identities, webhooks and rate limits for the same facts.
* Cracks are people's decisions. They need Unfold's sign-in, its administrator-mapped forge logins ([Unfold ADR 0030](../../apps/unfold/docs/adrs/0030-unfold-traces-bugs-under-an-administrator-mapped-forge-login.md)) and object authorization.
* Ploeg's existing card state, and the play shapes measured from diffs nobody kept, must reach Unfold before Ploeg drops them.
* The browser contract, the skins, the binder, the packs and the deterministic demo must keep working unchanged.

## Considered Options

* Ploeg supplies plain delivery facts; the Unfold application owns every card concept and its state
* A separate collector service that reads the forge and tracker itself (ADR-0029)
* Ploeg keeps assembling the card

## Decision Outcome

Chosen option: "**Ploeg supplies plain delivery facts; the Unfold application owns every card concept and its state**".

### Who owns what

| Part | Owner |
| --- | --- |
| Shifts, Runs, usage, live usage and budget holds; checkpoints; pull requests with reviews, events, CI runs, changed files with per-file indentation measurements, reverts and deploys; tracker board, admission time, status and gate moves; tracker parents; the facts list by member or Team | Ploeg's delivery facts ([Ploeg ADR-0079](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0079-run-cards-belong-to-the-consumer-and-ploeg-supplies-delivery-facts.md)) |
| Card assembly and state, grade (every formula version), rarity and freezing, flow figures with the team calendar, play figures, change shape and complexity, steward and roster, gates and bounces, sets, crack candidates, card list order and activity | Unfold, computed on read (`apps/unfold/src/cards/`) |
| Cracks and their workflow, the crack audit trail, frozen rarities, frozen play shapes, the card comment record | Unfold's SQLite store (`apps/unfold/src/cards/card-store.ts`) |
| Card configuration: status kinds, working calendars, path rules, release environments, hotfix labels, referees, card styles | Unfold's `cards.rules` setting |
| Posting the comment on the forge | Ploeg's keyed pull request comment; Unfold writes its content |

Ploeg's grade, rarity, flow, play-figure and comment code moved to TypeScript with identical behaviour. Its Go tests are golden fixtures. A replay of the cards Ploeg's own store tests assemble (`apps/unfold/scripts/card-golden`) must match Unfold's assembly field for field.

### Two-part removal from Ploeg

1. **Part 1** (Ploeg PR ploeg-hq/ploeg#91). Ploeg adds:
   * the delivery facts (`GET work-items/{id}/facts`, `GET facts`);
   * the keyed pull request comment (`PUT` and `DELETE work-items/{id}/pull-request-comments/{key}`);
   * the one-time `GET card-legacy-export`;
   * the `cards.enabled` switch.

   Its card endpoints keep working for that release.
2. **Part 2**, in a later Ploeg release, removes Ploeg's card code, tables and endpoints.

Unfold reads facts first. Until the pinned Ploeg serves facts, it keeps proxying Ploeg's card endpoints and logs `cards.facts_unavailable`. It never falls back silently.

### The import

The first time the pinned Ploeg serves facts, Unfold copies Ploeg's card state from `card-legacy-export`:

* cracks in every state, keeping Ploeg's ids;
* frozen rarities;
* card comment records;
* stored play shapes.

Unfold then reads the facts list once to index earlier changes for novelty, sets and crack candidates.

* The import runs behind an idempotent marker and resumes after the last page it stored. A failure is retried at the next sweep.
* No crack step is accepted until the import finishes.
* The Status page shows the result under Ploeg: "imported N cracks, M frozen rarities from Ploeg", or why nothing was imported.

### The comment

Unfold publishes the card comment through Ploeg's keyed comment (key `run-card`) at the same moments Ploeg did: a merge, a release, a new finish and a mend.

The publisher is off until an operator turns on `cards.publishPullRequestComment`. That must happen after Ploeg's `cards.enabled` is false. Otherwise Ploeg's sweep would post a second card. The first publish takes over Ploeg's comment with `adoptCommentId`.

### Consequences

* Good, because a card change never needs a Ploeg release, and Ploeg holds no card concept once part 2 ships.
* Good, because cracks run under Unfold's own sign-in and object authorization, with an audit trail in Unfold.
* Good, because no second forge or tracker identity is needed: Ploeg collects every fact once.
* Bad, because Unfold depends on Ploeg's facts contract, which now carries more forge detail than Ploeg uses itself.
* Bad, because the novelty, set and crack-candidate indexes hold only the Work Items Unfold has read. The import's backfill fills them once, and later sweeps keep them current.
* Bad, because an upgrade has an ordered manual step: turn Ploeg's card switch off, then Unfold's publisher on.

### Confirmation

* `apps/unfold/test/cards-assembly.test.ts` replays the cards and card lists Ploeg's store tests assembled, from facts and an export written by Ploeg's own exporters, and asserts Unfold assembles the same JSON, frozen rarity and card list order.
* The `cards-*` tests port every Go test of `pkg/gate`, `pkg/flow`, `pkg/rarity`, `pkg/playkpi`, `pkg/cardimage` and the grade formulas, plus generated golden cases. `mise run verify` runs them.
* `apps/unfold/test/cards-service.test.ts` asserts:
  * with facts, no request reaches Ploeg's `/card` or crack routes;
  * without facts, the fallback is logged.

## Pros and Cons of the Options

### A separate collector service that reads the forge and tracker itself (ADR-0029)

* Good, because Ploeg's API would stay minimal.
* Bad, because it duplicates Ploeg's forge and tracker readers, identities and webhooks.
* Bad, because it adds a third deployable with its own database.

### Ploeg keeps assembling the card

* Good, because nothing moves.
* Bad, because Ploeg keeps a consumer's product, and every card change needs a Ploeg release.

## More Information

* Upgrade steps for operators: [Move Run cards from Ploeg to Unfold](../../apps/unfold/docs/operations/run-cards-upgrade.md).
* Concept: [Run Cards](../concepts/run-cards.md).
* 2026-10-10: accepted, superseding ADR-0028 and ADR-0029.
* 2026-10-10: Ploeg PR ploeg-hq/ploeg#92 adds the facts the first contract lacked: the tracker board (`workItem.externalScope`), the admission time, checkpoints and budget holds. With them the parity replay matches all 120 cards. Unfold still reads facts without them from an older Ploeg.
