---
status: proposed
date: 2026-10-01
decision-makers: Ryan Grippeling
review-by: 2026-10-31
---

# An effects director plays Run card moments once, by tier, within accessibility rules

## Context and Problem Statement

[ADR 0026](0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md) gave Run cards five layers and left the fifth, the effects director, unbuilt: the shared light, sound and ceremony rules that skins ask for and never draw themselves. Since then the forge skin draws cards in 3D ([ADR 0028](0028-the-forge-skin-renders-run-cards-in-3d-with-vendored-three-js.md)), packs have a rip ceremony with particles, bloom and WebAudio sound ([ADR 0029](0029-binders-packs-and-pulls-collect-run-cards-privately-and-fairly.md)), and the DOM skin packs compare each redraw with the last and fire `unfold-card-moment` through `skin-kit.js`. Each of those carries its own timing, its own reduced-motion check and its own sound.

A card's news (a merge, a release, a finish step, a new grade, a confirmed crack, its mend, a completed set) mostly happens while nobody is looking, and a page-local comparison sees it only if the page was open. The [game-feel research](../research/2026-10-01-run-card-holo-and-game-feel.md) sets the rules a ceremony must keep: intensity inverse to frequency, coalescing and a habituation guard, at most one full-screen takeover per ten minutes, nothing that interrupts typing, skippable after 300 ms, at most three flashes a second and no saturated red flashes (WCAG 2.3.1), and reduced-motion swaps (WCAG 2.3.3). The CSP stays strict, three.js stays vendored, and a page holds at most two WebGL contexts for cards. How does Unfold play a card's news once per person, at the right size, without each skin or view reinventing the rules?

## Decision Drivers

* Rarity is open, so a ceremony's size may not depend on it.
* The same news plays once per person: not on reload, not twice in two tabs, and a card's history never plays as a backlog.
* Accessibility rules hold in code, for every skin, and can be tested.
* No interruption: nothing steals focus or blocks typing, and every ceremony can be skipped.
* One WebGL budget: no new context for page-level light.
* The CSP, no build step and no production dependency ([ADR 0002](0002-native-node-and-single-writer-storage.md)).
* Reuse the pack ceremony's particles and sound instead of a second copy.

## Considered Options

* A shared effects director in `public/cards/effects/` that consumes moments, gates them with a per-person seen mark per card, and plays them by tier through one stage
* Each skin keeps playing its own moments from page-local redraw comparisons
* A WebGL overlay, shared with the forge's live renderer, for page-level light

## Decision Outcome

Chosen option: "A shared effects director", because it puts the tier, budget and accessibility rules in one tested place, plays news the person missed, and lets skins keep only their card-level signature. **Proposed**, implemented on the Unfold side.

1. **One moment source.** Every skin fires `unfold-card-moment` through `skin-kit.js`: the DOM packs from `attachSkin`, and Unfold Native and the forge from their `attach` through the new `emitMoments(host, view)`. The event is a trigger, not the truth: on the Work Item page [`effects/unfold.js`](../../public/cards/effects/unfold.js) `watchCardMoments` passes the card to the seen gate on every event, a page-local `reveal` included.
2. **Seen marks.** [`effects/seen.js`](../../public/cards/effects/seen.js) reads the person's mark on the card (`GET /api/cards/:id/seen`), works out the news since then from the card's facts ([`effects/moments.js`](../../public/cards/effects/moments.js), whose `cardMoments` mirrors `src/packs.ts`, plus a changed grade and a newly complete set from the stored snapshot), moves the mark forward (`POST`) **before** anything plays, and then plays. A first look only creates the mark. Marks live in Unfold's store (`card_seen`, keyed by the person's id and the Work Item, at most 2000 per person), only move forward, never past now, and need the card to be in the person's Teams. When the binder plays "While you were away" it moves the marks of those cards too.
3. **Tiers from the moment, never from rarity** ([`effects/tiers.js`](../../public/cards/effects/tiers.js)): merged and released are major (at most 900 ms); a finish step is epic (1.8 s) and the year-long infinity step legendary (3.5 s); a confirmed crack is major and capped at 1.5 s, and its mend epic at 2.5 s, so the arc ends on the repair; a first or higher grade is major and a lower one minor; a completed set is legendary.
4. **The director** ([`effects/director.js`](../../public/cards/effects/director.js)) plays one ceremony at a time. The same moment on the same card within 2 s joins the waiting or playing ceremony (its title shows "× 2"); the same kind again within 10 s plays a tier quieter; more than six ceremonies above minor in a minute play as minor; at most six wait. A legendary moment takes over the page (a dim around the card and letterbox bars) at most once per ten minutes, and never while focus is in a text field or within 2 s of a keystroke. A hidden tab queues until it is visible. Any key or click 300 ms into a ceremony settles it. Every window runs on an injectable clock, so tests drive it in simulated time.
5. **Timelines and flash safety** ([`effects/timeline.js`](../../public/cards/effects/timeline.js)): anticipation (60–250 ms, a lift of 4–12 px), impact (a squash, hit-stop of 50–90 ms, trauma 0.15–0.5 decaying 1.2 a second, at most 6 px and 1.5° on the card only), follow-through (particles, slow motion for epic and legendary) and settle. A ceremony flashes at most once, at most half opacity, confined to the card, in a warm, cool, gold or white tone; a crack never flashes and reads as a dark fracture. Every flash, a skin's included, asks the page's flash ledger, which refuses a fourth inside any second and any saturated red.
6. **Card motion preference.** Settings › Preferences gains **Card motion**: Automatic (the default: Full, or Calm while the device asks for reduced motion), Full, Calm or Off (`cardMotion`). Calm replaces all movement with a 150 ms brightness pulse and a crossfaded title, halves each ceremony and caps it at 400 ms, draws no overlay and holds the forge still. Off plays no ceremony. The news is announced to screen readers in every mode. The pack rip and the binder follow the same preference: Calm and Off reveal instantly and list the binder's moments.
7. **Sound** ([`effects/sound.js`](../../public/cards/effects/sound.js)): the pack ceremony's synthesiser became a bank registry with a `default` (warm) and a `bright` bank, cues for the pack and for each moment, and ±4 % pitch on repeated cues. Sound stays off until **Card sound** (`cardSound`, replacing `packSound`) is on. A theme picks a bank by `soundBank` through `soundBankFor(theme)`; card themes land in a parallel change.
8. **One overlay, no new WebGL context** ([`effects/overlay.js`](../../public/cards/effects/overlay.js)): page-level particles, rings, the card-confined flash and a takeover's dim draw on one fixed 2D canvas that ignores the pointer, is hidden from assistive technology, exists only while it draws and follows the slow-motion clock. Its particle store is [`effects/particles.js`](../../public/cards/effects/particles.js), which the pack scene now uses too.
9. **Title layer** ([`effects/title.js`](../../public/cards/effects/title.js)): one DOM element, hidden from assistive technology, styled by classes and custom properties set through the CSSOM.
10. **Skins react on the card.** `<unfold-card>` gains `playMoment(moment, api)`, which calls the skin's optional `onMoment(moment, api)` (the registry now loads it) or, for a skin without one, sets the moment on its `data-moment`. The `api` carries the moment, tier, mode, length and impact time, the card before the moment, an abort signal, `emit` for page particles, `flash` through the ledger, `sound`, and `time`, the hit-stop and slow-motion clock ([`effects/time.js`](../../public/cards/effects/time.js), at most 120 ms and 2 s) that the forge's live loop now scales its frame time by. The forge steps its scene back to the card as it was and plays its signature at the impact: the merge seal (a stamp, a glint and a ring of sparks), the release glint, the finish wiping in as its coverage rises, the crack drawing dark with a desaturation, the gold flowing into a mend. A still forge card renders frames for the ceremony and returns to one still frame. Unfold Native sweeps its border in the moment's tone, pops the chip that changed and rolls the day count.
11. **The pack rip and the binder use the director.** The rip holds the director while it runs, takes its sound player, motion preference and skip delay from it, and draws particles with the shared store; its steps are unchanged. The binder's "While you were away" asks the director for each moment on the focused card instead of timing its own replay.

### Consequences

* Good, because news the person missed plays once, at a size set by what happened, and never replays on reload.
* Good, because the flash, motion, takeover and typing rules are enforced in one place for every skin and pinned by tests.
* Good, because page light needs no WebGL context, so the forge keeps its budget of two.
* Bad, because every first look at a Work Item card writes a seen mark, one small row per person and card.
* Bad, because the client derives moments from facts, so `effects/moments.js` must stay in step with `src/packs.ts`; a test compares them on every demo card.
* Bad, because a forge card that also replays a crack or a finish on a live refresh by itself is stepped back and replayed by the director, a brief double start.
* Bad, because the pack scene's particles now upload their colours each burst; before, they were never uploaded and drew black, so the rip now shows the coloured sparks it was written to show.
* Neutral, because Full chosen explicitly wins over the device's reduced-motion request for ceremonies, while the forge's live tilt still follows the device.

### Confirmation

Proposed. Confirmed when the owner accepts the ceremonies on a live Unfold.

In `apps/unfold`, `mise exec -- npm test` pins it: [`test/effects.test.mjs`](../../test/effects.test.mjs) covers the tier of every moment kind and that rarity does not move it, the per-kind caps, every timeline's phases and its calm swap, flash safety for every kind, tier and mode (at most three flashes in any second, at most half opacity, no saturated red) and the director keeping 60 queued ceremonies at three flashes a second, coalescing, habituation, the budget, the takeover limit and typing, Off, Calm and Full and the Automatic default, hidden tabs, holds and the 300 ms skip, moments mirroring the server's, news since a mark, the seen gate marking before it plays and never replaying, the clamped hit-stop and slow motion, the shared particles and the sound banks. [`test/card-seen.test.ts`](../../test/card-seen.test.ts) covers the seen routes: sign-in, the request header, Team scope, marks that only move forward, the sanitised snapshot, the binder's hand-off and the per-person limit. [`test/static-assets.test.ts`](../../test/static-assets.test.ts) pins the `/cards/effects/` route.

`mise exec -- npm run test:browser` ([`scripts/browser/effects.mjs`](../../scripts/browser/effects.mjs)) plays a merge on a demo Unfold Native card once and not after a reload, a finish step on a demo forge card, the calm swap under reduced motion with no overlay and no movement, and Off with the news still announced, under the CSP with no console errors.

Re-evaluate when rarity is decided, when card themes land with sound banks, when a second page outside Unfold loads the card, or if people find the ceremonies too frequent.

## Pros and Cons of the Options

### Each skin plays its own moments

* Good, because it needs no new module.
* Bad, because a page-local comparison misses everything that happened while the page was closed, and replays a `reveal` on every load.
* Bad, because every skin would re-implement flash safety, reduced motion and the takeover limit, and the limits could not be enforced across skins.

### A WebGL overlay shared with the forge's renderer

* Good, because bloom and additive particles would match the forge's look.
* Bad, because the forge's live renderer draws into its own card-sized canvas; a page-sized overlay would need a third context or a re-architected forge, against [ADR 0028](0028-the-forge-skin-renders-run-cards-in-3d-with-vendored-three-js.md)'s budget.

## More Information

* [Game-feel research](../research/2026-10-01-run-card-holo-and-game-feel.md): sections "Parameters to build from", "Ceremony scaled by rarity and frequency" and "Accessibility".
* The owner's arena and forge prototypes (ceremony tiers, cinematic titles, camera rig, hit-stop, slow motion, sound synthesis): working documents outside the repository; not CSP-safe, so only their parameters were taken.
* 2026-10-01: proposed with the director, the seen marks, the forge and Unfold Native reactions, and the pack and binder refactor implemented on the Unfold side.
* 2026-10-02: rarity is decided. [ADR 0034](0034-run-cards-show-rarity-as-frame-metal-and-a-set-symbol-and-reveal-it-once-at-release.md) adds the `rarity` moment at a card's reveal; it alone takes its size from the revealed tier (common and uncommon minor, rare major, epic epic, legendary legendary). Every other moment's tier still never follows rarity.
* 2026-10-10: [root ADR-0030](../../../../docs/adr/adr-0030-run-cards-are-an-unfold-domain-on-top-of-ploegs-delivery-facts.md): the moments the director plays now come from cards Unfold assembles; their order and tiers are unchanged.
