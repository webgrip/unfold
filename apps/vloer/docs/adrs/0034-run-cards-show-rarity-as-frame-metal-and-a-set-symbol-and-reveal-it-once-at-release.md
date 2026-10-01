---
status: proposed
date: 2026-10-02
decision-makers: Ryan Grippeling
review-by: 2026-11-02
---

# Run cards show rarity as frame metal and a set symbol, and reveal it once at release

## Context and Problem Statement

Rarity was the one open card fact. [ADR 0026](0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md) left it out, the proxy forced `rarity` to null, the skins were tested to print no rarity word, and [ADR 0032](0032-an-effects-director-plays-run-card-moments-once-by-tier-within-accessibility-rules.md) kept every ceremony's size independent of it. The owner has now decided it: "rarity is how exceptional the work was." The agreed design is a challenge score from reach, sensitive paths, novelty and damped size, never cost, time, tokens, bounces or the grade. It is predicted at mint and revealed at release, tiered by percentile within the repository's cards of that quarter (top 1, 5, 15 and 40 % are legendary, epic, rare and uncommon), with fixed thresholds while the cohort holds fewer than 30 cards. A revealed rarity is frozen. An epic's own card is legendary while its set is complete, and it is cosmetic only.

Ploeg implements the score in Ploeg PR #121 (ADR-0056), which is **proposed and not merged**; until it merges, Ploeg's schema on `development` still says `rarity` is null. Its card gains `rarity`: null, or `{formula, predicted, revealed, tier, score, percentile, cohort, inputs, revealedAt}`. Vloer has to show it on seven skins, keep it apart from the grade (how well the work was done) and the finish (how long it has lived), play its reveal once, and keep working against a Ploeg that still sends null. How does a Run card show rarity?

## Decision Drivers

* Rarity is challenge. It must never read like quality (the grade) or survival (the finish), and it never changes what Ploeg authorizes, budgets or merges, or a pack's odds.
* Every skin shows the same fact, in the same place in its own genre, read out to screen readers. A demo says it is a demo.
* A prediction is a hint, not a result; the reveal is the moment.
* Vloer reads the contract strictly but additively: absent, null, an older shape or an unreadable value become null, and fields it does not know are dropped rather than refused.
* [ADR 0032](0032-an-effects-director-plays-run-card-moments-once-by-tier-within-accessibility-rules.md)'s rules hold: once per person, tiered intensity, coalescing and budgets, reduced motion, flash safety, sound only when switched on. A reveal below its prediction must feel fair.
* The CSP, no build step, no production dependency, and one WebGL budget ([ADR 0028](0028-the-forge-skin-renders-run-cards-in-3d-with-vendored-three-js.md)).
* The forge's front shader is being reworked elsewhere for its art; rarity may change only the frame band's colour.

## Considered Options

* Frame metal, a coloured set symbol and the tier's word on every card through the runtime stylesheet and the skin kit, with per-skin flourishes, a Rarity tab on the back, and a reveal moment from `revealedAt` through the effects director
* Rarity as more foil: let a higher tier cover more of the card
* A rarity chip only, beside the state chip
* Each skin invents its own rarity look

## Decision Outcome

Chosen option: "Frame metal, a coloured set symbol and the tier's word on every card", because it uses the trading-card language people already read, gives every skin the same signal from one place, leaves foil to the finish and the slab to the grade, and plays the reveal under the rules every other ceremony keeps. **Proposed**, implemented on the Vloer side against the unmerged Ploeg PR #121 (ADR-0056).

1. **Reading the contract.** The proxy's `cardRarity` ([`src/ploeg.ts`](../../src/ploeg.ts)) keeps a rarity only in the contract's shape: a known tier, a formula name, a score from 0 to 100, a percentile above 0 and at most 100, a cohort with a `YYYYQn` quarter, whole-number inputs, a novelty share of at most 1 and up to 20 sensitive paths. Anything else, including an unknown tier, makes the whole rarity null, as an older Ploeg sends it. Fields it does not know, at any depth, are dropped; a newer formula name and a newer `notCollected` entry pass through.
2. **The view.** `cardView` ([`card-model.js`](../../public/cards/card-model.js)) gives `rarity`: the tier, `predicted` or `revealed` (an epic card legendary from its complete set counts as revealed while the set stays complete, and drops back when it reopens), the prediction and the reveal, the score ("74,2 of 100"), the share from the top computed from Ploeg's percentile as 100 − percentile + 100 / cohort size ("top 4% of webgrip/unfold in 2026-Q4"), the formula, the inputs and, for formula 2026.1 only, the four components in points. The components use Vloer's copy of the published formula ([`src/rarity.ts`](../../src/rarity.ts) and `rarityComponents` in the card model, kept equal by a test); a newer formula shows the tier and score without a breakdown. A plain "why" line names the one or two strongest components ("Epic because it reached 4 modules and broke new ground in 50% of its files: a challenge score of 74,2, in the top 4% of webgrip/unfold in 2026-Q4").
3. **The visual language.** The frame climbs metals; the set symbol follows the trading-card ladder of black, silver, gold and mythic orange, one step ahead of the frame, so neither repeats the other and a glance at either reads the tier. Legendary turns both iridescent.

    | Tier | Share of cohort | Fixed score | Frame metal | Set symbol |
    | --- | --- | --- | --- | --- |
    | Common | the rest | below 35 | Steel, matte | Black, with a light rim |
    | Uncommon | top 40 % | 35 | Bronze | Silver |
    | Rare | top 15 % | 55 | Silver | Gold |
    | Epic | top 5 % | 70 | Gold | Mythic orange |
    | Legendary | top 1 % | 85 | Prismatic | Iridescent |

    The tier's word sits beside the symbol on every card. A predicted rarity reads "Predicted rare": the symbol is ghosted with a glow, and instead of the metal the frame carries a thin outline in the tier's colour that pulses every 2.6 s, still under reduced motion.
4. **Every skin.** `<unfold-card>` reflects `data-rarity` and `data-rarity-state` on itself, and the runtime's stylesheet ([`unfold-card.css`](../../public/cards/unfold-card.css)) turns them into tokens (`--rarity-metal`, `--rarity-edge`, `--rarity-symbol`, `--rarity-ink`, `--rarity-glow`) inside every skin's shadow root. The skin kit ([`skin-kit.js`](../../public/cards/skin-kit.js)) prints one escaped mark (`rarityMark`: the gem, the word, the sentence for screen readers) and one frame ring (`rarityFrame`). Each skin places them in its genre and adds a flourish where it has a hook: Vloer Native in the header with the ring around the card; Holo Rarity on the type line, MTG's set-symbol position, with the frame's own metal stops (`--m1` to `--m3`) recoloured, prismatic for legendary; Loot Drop in the quality line with the tooltip's frame line in the tier's edge colour; Arcade Cabinet under the state in its bitmap font; Ticker Terminal in the status bar; Mission Patch in the header with the patch's merrowed edge stitched in the tier's metal; the forge in its bar, its text facts and its painted face.
5. **The forge.** Its front shader ([`front-shader.js`](../../public/cards/skins/forge/front-shader.js)) takes `uMetalLo`, `uMetalHi`, `uHint` and `uRarity` and changes only the frame band (the mask's green outside the art window): `uRarity.x` blends it through the tier's metal under the earned foil, `.y` adds iridescence for legendary, `.z` is the predicted glow at the card's edge, and `.w` sweeps light along the frame during the reveal. The art window, the foil patterns and the extruded edge (steel, chrome, gold by finish) are untouched. The face painter ([`face.js`](../../public/cards/skins/forge/face.js)) fills the set symbol with the tier's colour once revealed (dashed in its ink while predicted) and prints the gem and word on the type line. The metals are in [`forge-model.js`](../../public/cards/skins/forge/forge-model.js) `rarityMetals`.
6. **The back.** A **Rarity** tab after Grade leads with the why line, then the tier, the prediction, the reveal and its time, the challenge score, the rank in the cohort or "Fixed thresholds: 12 cards in webgrip/unfold for 2026-Q4, fewer than 30", the formula, what the card shows for it, the four components with their weights, points and facts (and the epic-set bonus while predicted), what Ploeg does not collect yet, and the sensitive paths. Its note says rarity is how exceptional the work was, not the grade or the finish, which inputs never count, when it is predicted, revealed and frozen, and that it is cosmetic. The shared back renders a tab's `lead` line for it.
7. **The reveal.** A card's moments gain `rarity` at `revealedAt` with `{tier, predicted}`, right after the release it happened at, in both [`effects/moments.js`](../../public/cards/effects/moments.js) and [`src/packs.ts`](../../src/packs.ts), so the seen gate plays it once per person, the binder's "While you were away" replays it, and a pack's upgrade names it. The reveal is the one moment whose size follows rarity, by the revealed tier only: common and uncommon are minor, rare major, epic epic, legendary legendary, with the page takeover, slow motion and prism. This amends ADR 0032's rule that no ceremony follows rarity, for this moment alone. Each tier has its look ([`effects/timeline.js`](../../public/cards/effects/timeline.js) `rarityLooks`) and the `rarity` sound cue, which always rises and adds notes and shimmer with the tier. A reveal below its prediction plays exactly like the same tier revealed as predicted: no falling cue, no dark palette, and a title that reads "Rare · revealed at release"; one above it reads "beat its prediction of rare". The forge sweeps the metal in as the predicted glow fades; Vloer Native lights its ring; the DOM skins get `data-moment="rarity"`.
8. **Binder and packs.** The binder adds a rarity filter and a **Rarest first** sort (revealed before predicted within a tier, then by score) and prints the tier in each caption. The pack rip's title, tray, summary and announcement name the tier. Pull odds, the anticipation before a reveal and the pull itself stay as [ADR 0029](0029-binders-packs-and-pulls-collect-run-cards-privately-and-fairly.md) set them, from the pull alone.
9. **Demo.** Nineteen demo cards carry a deterministic rarity that [`src/ploeg-demo.ts`](../../src/ploeg-demo.ts) computes with formula 2026.1 from illustrative inputs: every tier, two predictions (105 and 109), a reveal below its prediction (120, epic to rare), one above it (134, rare to epic) and the legendary epic 139 from its complete set. The demo's cohorts hold fewer than 30 cards, so fixed thresholds decide and no percentile is shown. The Rarity tab says "Demo · illustrative inputs, not rated by Ploeg".

### Consequences

* Good, because one mark, one ring and one set of tokens give seven skins the same rarity, and a skin that adds a flourish cannot change what the tier means.
* Good, because rarity, grade and finish now have separate places: the frame and symbol, the slab, and the foil.
* Good, because the reveal plays once per person under every accessibility rule of ADR 0032, and a reveal below its prediction is told plainly.
* Good, because an older Ploeg, a missing field or a future one never breaks a card; it shows no rarity, or a rarity without the breakdown.
* Bad, because Vloer keeps a copy of formula 2026.1 to draw the breakdown; a new formula shows no components until Vloer learns it.
* Bad, because the frame metal now belongs to rarity: on a holo card a black or gold label no longer darkens the frame and shows on the slab only.
* Bad, because a common card's black symbol needs a light rim to read on dark frames, and an uncommon card's silver symbol is faint on Vloer Native's light surface.
* Bad, because the binder builds a card view per copy to sort and filter by rarity (cached per card).
* Neutral, because an epic's legendary from its complete set plays the set ceremony, not a rarity reveal of its own.

### Confirmation

Proposed. It depends on Ploeg PR #121 (ADR-0056), which is not merged, and it is confirmed when a Ploeg with rarity serves a live Work Item, its reveal plays on release, and the owner accepts the look.

In `apps/vloer`:

* `mise exec -- npm test`: [`test/rarity.test.ts`](../../test/rarity.test.ts) pins the proxy's reading (null, absent, predicted only, revealed, the legendary epic, unknown future fields dropped, each refusal), formula 2026.1 and its thresholds, the demo's tiers and that its rarity reveals at release, and that a pull never depends on it. [`test/card-rarity.test.mjs`](../../test/card-rarity.test.mjs) pins the tier table, the view and the tab for every state, a reveal below its prediction without loss words, the share from the top, Vloer's breakdown against the server's, the escaped mark and ring and their tokens, the reveal's tiers, looks, sound levels and flash safety, the moment and the card before it, and the forge's metals and shader uniforms. [`test/ploeg.test.ts`](../../test/ploeg.test.ts) passes a contract rarity through the proxy, [`test/card-skins.test.mjs`](../../test/card-skins.test.mjs) requires the mark and ring on every DOM skin card with a rarity and no rarity word on one without, and [`test/effects.test.mjs`](../../test/effects.test.mjs) the reveal in a card's news.
* `mise exec -- npm run test:browser` ([`scripts/browser/rarity.mjs`](../../scripts/browser/rarity.mjs)) draws every tier, predicted and revealed, on Vloer Native, the five DOM skins and the forge under the CSP, opens the Rarity tab, plays a legendary reveal and a reveal below its prediction, checks the still glow under reduced motion, and sorts and filters the binder.

Re-evaluate when Ploeg PR #121 merges or changes the contract, when Ploeg publishes a new formula, when a cohort first reaches 30 cards on a live Vloer, or if people read rarity as a judgement of the person.

## Pros and Cons of the Options

### Rarity as more foil

* Good, because it needs no new visual element.
* Bad, because foil already means survival (the finish ladder, [ADR 0028](0028-the-forge-skin-renders-run-cards-in-3d-with-vendored-three-js.md)), so a challenging change would look like a long-lived one.

### A rarity chip only

* Good, because it is the smallest change.
* Bad, because it reads as one more status and loses the trading-card feel the owner asked for; nothing on the card itself changes when a legendary is revealed.

### Each skin invents its own rarity look

* Good, because each skin could go furthest in its own genre.
* Bad, because the same tier would look different on every skin, and the accessibility and reveal rules would have to be repeated seven times.

## More Information

* Owner decision, 2026-10-02: "rarity is how exceptional the work was", with the design summarized in the context above.
* Ploeg PR #121 (ADR-0056), proposed: the `card.rarity` contract and `$defs/cardRarity` in Ploeg's operator API schema on that branch.
* [Game-feel research](../research/2026-10-01-run-card-holo-and-game-feel.md): "Ceremony scaled by rarity and frequency".
* ADR 0033 is reserved for the forge's inner-world art, written in parallel.
* 2026-10-02: proposed with the proxy, the view, the mark and ring on every skin, the forge's frame metal, the Rarity tab, the reveal moment, the binder and pack display and the demo's rarity implemented on the Vloer side.
