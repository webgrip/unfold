---
status: proposed
date: 2026-10-01
decision-makers: Ryan Grippeling
review-by: 2026-10-31
---

# Binders, packs and pulls collect Run cards privately and fairly

## Context and Problem Statement

Run cards record one Work Item's change and its life in production ([ADR 0026](0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md)), and the forge skin draws them in 3D with a foil pattern and an earned finish ([ADR 0028](0028-the-forge-skin-renders-run-cards-in-3d-with-vendored-three-js.md)). The [Run cards concept](../../../../docs/concepts/run-cards.md) proposes the collection side: everyone involved in a card holds a copy with their role, a person keeps their copies in a **Binder**, a **Pack** hands them the cards they earned in a period, and a Team has a season page.

The owner decided the rules on 2026-10-01:

* Binders are private to their owner. Team pages are for the team, and clients see team aggregates only.
* Nobody is ranked.
* Rarity is open, so nothing may depend on it.
* A pack holds earned contents plus cosmetic-only seeded pulls with published odds. Nothing can be bought, re-rolled or traded, and each person gets one pack per period.
* The pull assigns the foil pattern, and the earned finish sets how much of the card the pattern covers.

Ploeg proposes a card list endpoint for binders and packs, `GET /api/v1/operator/cards?member=<login>` (card contract P4 addendum), built in parallel. How does Vloer let a person collect their cards and open packs so that the moment feels good, while staying private, fair and outside anything Ploeg authorizes, budgets or merges?

## Decision Drivers

* Privacy. A binder is readable by its owner only, an administrator included, and a team page names nobody.
* Fairness, so packs stay clear of the loot-box rulings. Contents are earned, pulls are cosmetic, the odds are published before opening, and a pull is fixed, recorded and auditable. Nothing can be bought, re-rolled, traded or given away.
* No ranking, streaks or comparisons ([concept guardrails](../../../../docs/concepts/run-cards.md#guardrails)), and no pressure: packs do not expire and nothing notifies or counts down.
* Rarity stays open. No odds, pack or reveal reads it.
* A demo says it is one and invents no spend ([Unfold ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md)).
* Every mutation has an authenticated identity and object authorization (Vloer `AGENTS.md`).
* No build step and the unchanged CSP ([ADR 0002](0002-native-node-and-single-writer-storage.md), [ADR 0024](0024-vloer-opens-on-now-with-one-vocabulary-and-one-token-system.md)); three.js stays vendored ([ADR 0028](0028-the-forge-skin-renders-run-cards-in-3d-with-vendored-three-js.md)).
* Reduced motion and keyboard use are first-class, and every ceremony can be skipped.

## Considered Options

* Vloer owns the collection: card facts come from Ploeg, while logins, packs, pulls and seen markers live in Vloer's own store, keyed by the signed-in person
* Ploeg owns packs and pulls, and Vloer only displays them
* No packs: the binder shows every card at once, and the pattern stays derived from the card's identity

## Decision Outcome

Chosen option: "Vloer owns the collection". Card facts stay with Ploeg, which never needs to know about cosmetics. What is personal (which logins are yours, what you pulled, what you have seen) stays in the front end that signs you in, keyed by your own account. This is **proposed**, implemented on the Vloer side against the card contract and fixtures.

1. **Identity.** A person's logins come from two places:
   * **The administrator's mapping.** When `ploeg.forgeLogins` maps the person's Vloer user id to a forge login (`PloegClient.forgeLogin`), that login comes first and is the only one Vloer trusts: only it can make the person a card's steward in the binder. In the demo, the demo login `demo-operator` plays this part.
   * **Their own logins.** A person adds other forge and tracker logins under **Settings › Card logins** (`#settings/cards`), up to 10, folded to lower case. They are stored per user in SQLite (`card_identities`) behind `GET` and `PUT /api/me/card-identity`, and linked GitLab accounts are offered as suggestions. **Self-declared logins only find cards to collect. They are never used for attribution, stewardship, cracks, mends or any other authority**, and Vloer never shows them to anyone else.

   A copy is a card whose roster names one of those logins. The copy's role is the first of developer, reviewer, QA, PO, acceptor and merger that the roster gives the person, or steward when the mapped login stewards a card without a roster role. A self-declared login that matches only a steward's name collects nothing.
2. **Card source.** [`PloegClient.memberCards`](../../src/ploeg.ts) calls Ploeg's card list with the person's logins as `member` (at most 20) and `limit=50`, and pages by `nextBefore` until it is null, for at most six pages. A short or empty page with a cursor is not the end. An older Ploeg answers 404, and Vloer falls back to a bounded scan: up to four pages of each Team's Work Items, the 60 most recently updated, and their cards. The binder says so. Only cards in the person's Teams pass, by the same scope check as the Work Item page. The demo reads the demo cards; their roster roles and gates are sample data, and their descriptions say so.
3. **Binder** (`#binder`, [`views/binder.js`](../../public/views/binder.js)). It shows the person's copies, newest moment first, with Team and role filters. Each thumbnail is a still forge frame: every thumbnail shares one WebGL renderer and one scene, drawn one after another into 2D canvases and cached ([`cards/thumbs.js`](../../public/cards/thumbs.js)). The focused card is drawn large by `<unfold-card>` and is the page's one live 3D card. A copy whose pull waits in an unopened pack sits in a sleeve. The readouts are personal only: cards, released, days live, days live added this quarter, mends. There is no comparison, average or rank. **Copies draw with the forge skin**, because pulls are forge cosmetics. The Work Item page, the team's view, keeps the skin its Work Target chose.
4. **Moments.** Vloer derives a card's moments from its facts alone ([`src/packs.ts`](../../src/packs.ts) `cardMoments`):
   * minted (its first Run);
   * each merged play;
   * released;
   * each finish step crossed (release time plus 7, 30, 90, 180 or 365 days);
   * each confirmed crack;
   * each mend.
5. **Periods.** A pack's period is the ISO week (Monday 00:00 UTC). A Team can use sprints instead, set in Vloer's configuration as `cards.teams.<team> = { lengthDays: 7–42, anchor: "YYYY-MM-DD" }`. A pack id is `2026-W40` or `<team>~<sprint start>`.
6. **Packs** (`#packs`, [`views/packs.js`](../../public/views/packs.js)):
   * **Contents.** The pack for a person and a period holds every copy with at least one moment in that period, with those moments. The rest of the card's history is not in it.
   * **Sealing.** A pack seals when its period ends. The current period's pack shows as filling, with its count and the date it seals, and cannot be opened yet.
   * **Order.** Packs open in order, oldest first, so the order cannot be chosen to shape a pull. One pack per person per period is a database key.
   * **Backfill.** History before a person's first visit, minus `cards.backfillPeriods` periods (default 1, 4 in the demo), never becomes a stack of packs.
   * **Upgrades.** A card is pulled once, in the first pack it appears in. Later packs show it as an upgrade: the finish rising, a crack, a mend, a merge.
   * **No pressure.** Packs never expire, nothing notifies, and the navigation shows no count for them.
7. **Pulls.**
   * **The draw.** Opening a pack draws a first pull for each new card with HMAC-SHA256 over `userId|workItemId|packId`. The key is 32 random bytes kept in Vloer's encrypted internal state (`cards:pull-key`); the demo uses a published fixed key, so the demo is deterministic.
   * **Pattern.** Bytes 0–3 pick one of the forge's sixteen patterns from the published odds table (version `2026.1`, basis points summing to 10 000): plain 24 %, holo 14 %, reverse holo 11 %, rainbow 9 %, etched 8 %, glitter 7 %, cosmos 6 %, cracked ice 5 %, liquid metal 4 %, prism 3,5 %, galaxy 3 %, refractor 2,5 %, lenticular 1,5 %, gold 0,8 %, black chrome 0,5 %, superfractor 0,2 %.
   * **Extras.** Each is drawn on its own: alternate art at 10 % (bytes 4–7; bytes 16–19 pick one of the 14 other presets, with an "Alt art" stamp), a full-art frame at 8 % (bytes 8–11) and a gold signature at 5 % (bytes 12–15).
   * **Recording.** Vloer stores the pack and its pulls in one transaction (`card_packs`, `card_pulls`). A first pull is never replaced, and a second open is refused. The stored digest lets anyone with the key audit a pull; the HMAC input never leaves the server.
   * **Independence.** The odds read no rarity, grade, finish, role or person.
   * **Coverage.** The earned finish still sets the pattern's coverage: none while matte, then the frame, the art window, the whole card, gold edges and an orbiting border.
8. **Rip ceremony** ([`cards/pack-scene.js`](../../public/cards/pack-scene.js)). This is a three.js scene in its own WebGL renderer.
   * **The pack.** A pillowed foil wrapper with crimped ends, a crinkle normal map, iridescence, the Unfold mark, the period and the card count. A demo pack is labelled "Demo pack · illustrative · no spend".
   * **Tearing.** The person tears the pack by dragging across its top edge, or with **Tear open**, Enter or Space. The cards deal face down, and each one reveals on click or Space.
   * **Anticipation.** It scales with the pull alone, never with the card: a rarer pattern or an extra charges longer and bursts bigger. Then come the flip, a foil wipe that previews the pattern before it settles to the earned coverage, particles and bloom, and a short title with the chance in nl-NL ("0,80% · 1 in 125").
   * **Summary.** The end shows a summary ("2 cards · 2 foil pulls · 1 alt art · 1 full art") and **Add to binder**. **Skip to summary** appears 300 ms after the tear.
   * **Reduced motion.** Every step is instant, with no charge, particles or bloom swell.
   * **Sound.** WebAudio sound, synthesised and off by default, sits behind a switch.
   * **Without WebGL2.** A flat pack does the same in markup.
9. **While you were away.** `card_binders` keeps when a person first opened their binder and the moment up to which they have seen their cards' news. The binder lists the moments since then, oldest first, at most 12, and marks them seen as soon as it loads, so nothing replays twice. With motion, it plays them on the focused card. `<unfold-card>` gained `asOf`, and [`cardAsOf`](../../public/cards/collection-model.js) undoes later facts, so the forge plays the finish rising (a new coverage tween), the crack and the mend. Skip ends it. With reduced motion the moments are a list.
10. **Season** (`#season`, [`views/season.js`](../../public/views/season.js)). One Team's totals per calendar quarter, from its cards only:
    * cards shipped;
    * days live added;
    * finish steps reached;
    * confirmed cracks, with the note that more reported cracks after rollout is a good sign;
    * mends;
    * the right-first-time share of shipped cards with gate facts;
    * bounce reasons;
    * complete sets.

    A figure whose facts Ploeg does not send reads "Not collected yet", never zero. The page names no person, and the API response carries no name. Only members of the Team see it. In its first week a quarter shows the one before.
11. **Authorization.** Card collection grants no authority: no copy, login, pull or pack changes what a person may do in Vloer or Ploeg. Every collection route requires a sign-in. Writes (`PUT` logins, `POST` seen, `POST` open) pass the existing request-header and origin guard. Every read and write is keyed by the signed-in user's id, and no route takes another person's id, so the object is always the caller's own: an administrator cannot read anyone's binder or packs. Viewers may keep a binder, because it changes no work.

### Consequences

* Good, because packs are earned, cosmetic, seeded, recorded and published. Nothing can be bought, re-rolled or traded, so they are built to stay outside the loot-box rulings, though an agency should still ask its counsel.
* Good, because nothing personal reaches Ploeg, and nothing a pull assigns changes a fact, a grade, a finish or anything Ploeg authorizes, budgets or merges.
* Good, because the binder, the packs and the season page run in the demo with no Ploeg and no spend, and the browser flow covers them under the CSP.
* Bad, because self-declared logins can be anyone's. Someone can list another person's login and collect copies of that person's cards in their own binder. That grants nothing beyond what the Team can already see: the cards are ones their Teams can already read, the pulls are their own, the binder they see is still only theirs (never the other person's binder, packs or pulls), and a self-declared login never makes anyone a steward or attributes anything. Attribution comes only from the administrator's `ploeg.forgeLogins` mapping, the same rule Vloer's crack attribution follows ([ADR 0030](0030-vloer-traces-bugs-under-an-administrator-mapped-forge-login.md)).
* Bad, because periods use UTC. A moment just after midnight on a Monday in the Netherlands lands in the week before.
* Bad, because the fallback scan reads up to 60 cards per visit against an older Ploeg, at most six at a time and cached for five seconds. It goes away once Ploeg serves the card list.
* Bad, because the four views, their model and stylesheet add about 75 KiB to every first load before gzip, since the view registry loads every view. The ceremony's scene and sound add about 40 KiB more, and a second WebGL renderer, while a pack is open. The binder's thumbnails share one renderer that is released after four seconds idle.
* Bad, because pack contents depend on the person's logins at opening time, so changing logins changes the packs that have not been opened yet.
* Neutral, because rarity is still open and nothing here reads it. If rarity is decided later, it gets its own channel and never feeds the odds.
* Neutral, because clients have no role in Vloer yet. The season page is the aggregate they would see.

### Confirmation

Proposed. The Vloer side is implemented against the card contract and fixtures, and against the Ploeg card list's documented shape. It is confirmed when the owner accepts the ceremony and the binder on a live Vloer, and a Ploeg with the card list serves a real binder.

In `apps/unfold`, `mise exec -- npm test` pins:

* [`test/packs.test.ts`](../../test/packs.test.ts): ISO weeks across year ends, sprint periods, settings validation, moments from facts, pack composition and the floor, copy roles, the odds summing to 10 000 over the sixteen forge patterns, HMAC determinism and auditability, and the pattern and extras following the odds independently over 60 000 draws. It also pins the season totals naming nobody and "Not collected yet" as null.
* [`test/collection.test.ts`](../../test/collection.test.ts): logins per person, the administrator's mapped login first and the only one that stewards, the binder's copies, roles and personal readouts, seen markers that only move forward, packs that open in order, once and only after their period, the stored pull equal to the HMAC draw with upgrades keeping it, nobody (an administrator included) reading another person's packs, and the store creating its tables on an existing database without touching its rows.
* [`test/api-collection.test.ts`](../../test/api-collection.test.ts): sign-in, the request header and methods; the demo routes with no spend; Ploeg's card list called with the person's own logins and paged past a short page; an administrator's `?user=` ignored; the HMAC input never sent; and the 404 fallback to the bounded scan.
* [`test/collection-model.test.mjs`](../../test/collection-model.test.mjs): nl-NL odds, anticipation by pull only, words for pulls, packs, moments and periods, copies drawn with the forge and its alternate art, full art and gold signature, and `cardAsOf`.

`mise exec -- npm run test:browser` runs [`scripts/browser/collection.mjs`](../../scripts/browser/collection.mjs):

* card logins;
* the binder with painted thumbnails, a focused card, filters and the once-only replay with Skip;
* a demo pack torn with Enter and revealed with Space, the reveal announced, to its summary and **Add to binder**;
* the odds page;
* the reduced-motion ceremony revealing at once;
* the season page naming nobody.

Re-evaluate when Ploeg ships the card list, when rarity is decided, when clients get a role, if a works council or counsel asks for changes to packs, or if periods need a local time zone.

## Pros and Cons of the Options

### Ploeg owns packs and pulls

* Good, because one service would hold every card fact and every pull.
* Bad, because Ploeg would learn which logins a person claims and what they pulled, which is personal data with no bearing on execution.
* Bad, because cosmetics would enter the engine that authorizes and budgets work, against the rule that card state never gates anything.

### No packs

* Good, because it is less code and has no odds to publish.
* Bad, because it drops the owner's decided ceremony and leaves the pattern a hash, with nothing personal about a copy.

## More Information

* [Run cards concept](../../../../docs/concepts/run-cards.md): packs, who sees what, and the guardrails.
* Card contract P4 addendum: "Card list for binders and packs", Ploeg's `GET /api/v1/operator/cards`, proposed and built in parallel.
* [HTTP contract](../contracts/api.md#card-collection): the collection routes.
* 2026-10-01: proposed with the Vloer side implemented against the card contract and fixtures.
* 2026-10-01: [ADR 0032](0032-an-effects-director-plays-run-card-moments-once-by-tier-within-accessibility-rules.md) moves the rip ceremony's sound into the shared sound banks (`cards/effects/sound.js`, preference `cardSound` instead of `packSound`) and its particles into the shared store, has the rip hold the effects director and follow the Card motion preference, and has "While you were away" play through the director and move the seen marks of the cards it showed.
