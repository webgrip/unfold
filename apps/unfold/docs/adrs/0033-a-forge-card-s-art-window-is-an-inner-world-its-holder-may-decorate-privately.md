---
status: proposed
date: 2026-10-02
decision-makers: Ryan Grippeling
review-by: 2026-10-31
---

# A forge card's art window is an inner world its holder may decorate privately

## Context and Problem Statement

The forge skin draws a Run card as a 3D object whose art window shows a preset, a theme's shader or an uploaded picture ([ADR 0028](0028-the-forge-skin-renders-run-cards-in-3d-with-vendored-three-js.md), [ADR 0031](0031-card-themes-a-card-designer-and-generated-art.md)). The art moves with the card, but it is flat. On 2026-10-02 the owner asked for more:

> "I want your mouse or your movement of the card to have an effect on what's in the 'art'. That art needs to be an inner world. It's a 3d image in there, or... it can be. It can also change from 3d to flat again and back. Maybe clicking on certain things in it has an effect. I want to have a model like this where people can change things about their own cards."

A working prototype, outside the repository, renders a small three.js scene into a texture that the front shader samples as the art: sky islands, a deep sea and a neon city; a camera that the card's tilt moves, so the art reads as a window; a flatten that squashes the scene into a posterized picture and springs back; a sky for each time of day; weather; things that react to a click; a fissure for a crack that turns to gold when mended; and a decorate mode that places and erases things.

The prototype invents its unlocks (a "level") and keeps decorations in the page. Unfold has rules it must keep: the CSP (`script-src 'self'; style-src 'self'`), no bundler and vendored three.js ([ADR 0002](0002-native-node-and-single-writer-storage.md), [ADR 0028](0028-the-forge-skin-renders-run-cards-in-3d-with-vendored-three-js.md)); at most two WebGL contexts for cards on a page ([ADR 0032](0032-an-effects-director-plays-run-card-moments-once-by-tier-within-accessibility-rules.md)); binders are private and nobody is ranked ([ADR 0029](0029-binders-packs-and-pulls-collect-run-cards-privately-and-fairly.md)); rarity is open, so nothing may depend on it; and every mutation needs an authenticated identity and object authorization (the application's `AGENTS.md`). How does the art become a world that moves with the card, what decides what is in it, and how do people change their own cards without breaking those rules?

## Decision Drivers

* A card shows facts. What the world holds must follow the card's facts, not invented progress, and a demo still says it is one.
* Cosmetic only. A decoration never touches a grade, a finish, rarity, a pull or the published odds.
* Private like a binder: a person's decoration is theirs, administrators included.
* Every write is signed in, carries the request header, names a card in the person's Teams and a copy they hold, and is checked on the server against the card's facts now.
* No new WebGL context, no new dependency, no inline script or style.
* Power and battery: one world at a time, only on screen, sized to the pixels it fills.
* Reduced motion, keyboard use and screen readers are first-class.

## Considered Options

* Render the world into the forge's own renderer as a texture, unlock its contents from card facts, and keep each person's decoration of their copy in Unfold's store
* Give the world its own canvas and WebGL context layered over the art window
* One shared decoration per card, set by its steward and shown to everyone
* Keep decorations in the browser's local storage
* Let Ploeg store decorations with the card

## Decision Outcome

Chosen option: "Render the world into the forge's own renderer, unlock from facts, keep decorations per person and copy in Unfold", because it adds depth and play without a third WebGL context, ties what a card holds to what its work earned, and keeps a person's changes private, cosmetic and authorized like their pulls. **Proposed**, implemented in Unfold.

1. **The world is the art.** [`public/cards/skins/forge/world/`](../../public/cards/skins/forge/world/) splits the prototype into modules: [`index.js`](../../public/cards/skins/forge/world/index.js) (`InnerWorld`: scene, camera, render target, flatten, picking, decoration), [`sky.js`](../../public/cards/skins/forge/world/sky.js), [`particles.js`](../../public/cards/skins/forge/world/particles.js), [`objects.js`](../../public/cards/skins/forge/world/objects.js), [`worlds.js`](../../public/cards/skins/forge/world/worlds.js), [`kit.js`](../../public/cards/skins/forge/world/kit.js), the WebGL-free [`rules.js`](../../public/cards/skins/forge/world/rules.js), [`controls.js`](../../public/cards/skins/forge/world/controls.js) and [`storage.js`](../../public/cards/skins/forge/world/storage.js). Textures are drawn on canvases; there is no inline script or style. The forge's `ForgeStage` renders the world into its half-float, 4× multisampled render target just before the card, with the same renderer, and the front shader's world variant samples it in place of the art: tone-mapped from linear HDR, a glass streak that fades as it flattens, posterized toward flat, and the foil over the window held at 22 % so the window reads as glass. The world variant leaves the preset library out. The card's tilt moves the world's camera (up to about 2.4 units sideways and 1.2 up), and the pointer over the art pans it a little. **Flatten** springs a squash of the scene's depth together with a dolly zoom that keeps the frame's height, so the picture goes near-orthographic, and thins the fog. A card without a world keeps its art and compiles exactly as before. The world loads with a dynamic `import()` only when a card gets one. The shader edits stay inside the art sampling and one line after the foil mix.
2. **Worlds per theme.** The forge manifest lists `theme.worlds`: `islands`, `deepsea` and `city`. Theme format v1 gains an optional `world` ([contract](../contracts/card-themes.md)); `off`, `null` or absent shows the art, so existing themes keep their look. A forge card without a theme shows the islands. The card designer has an **Inner world** choice.
3. **Facts decide what it holds.** [`rules.js`](../../public/cards/skins/forge/world/rules.js) and [`src/card-worlds.ts`](../../src/card-worlds.ts) hold the same tables, and a test keeps them equal on every demo card:

   | Card fact | What the world shows or unlocks |
   | --- | --- |
   | None yet (drafting, in review) | Dawn and the starter things: crystals, lanterns, trees |
   | Whole days live (from the release: the first production deploy, or the merge without deploy signal) | `auto` time of day: dawn under 7, morning from 7, noon from 30, sunset from 90, golden hour from 180, night with an aurora from 365, the finish ladder's steps. A decoration may pick only a step already reached |
   | State merged | The windmill. This replaces the prototype's invented "level": merging is the first fact every card that ships reaches |
   | 180 days live | The lighthouse, with a beam that can be switched off |
   | Condition cracked | A dark fissure across the ground |
   | Condition mended | The fissure turns to a gold seam, and the gold koi pond unlocks |

   The neon city always shows night; that is the world's look, not an unlock. The starting things of each world are those the card has earned, laid out with seeds from the card's own seed, so everyone sees the same default. A demo card follows the same rules over its sample facts, and its face and the decoration panel still say it is a demo.
4. **Interaction.** Hovering a thing shows the pointer cursor; a click plays its reaction: a crystal chimes and pulses, a lantern toggles, a tree shakes off leaves, a windmill spins up, a lighthouse beam switches, koi scatter, a jellyfish rises, the city's hologram spins. **Flatten art** and **Make it 3D** are a card control, and F toggles it while focus is in the card. The art window is focusable: the arrow keys walk its things left to right, Enter touches the focused one, and Escape drops a placing tool. The effects director's moments reach the world through the forge's `onMoment`: the reveal springs its depth, and a crack or a mend redraws the fissure with a burst of dust or gold along it. Sound goes only through the effects director's `cardSounds`, so it stays off until **Card sound** is on; the default bank gained a `chime` cue.
5. **People decorate their own copy.** A person who holds a copy opens **Decorate** and picks the world (or off), the time of day, the weather (clear, rain, snow, fireflies), places any unlocked thing by clicking the ground (or by Enter on the focused art) and erases with the eraser, a shift-click or Enter. Locked things say what unlocks them. Changes save 700 ms after the last one; **Use the card's own world** forgets the decoration.
   * **Routes.** `GET`, `PUT` (`{ world }`) and `DELETE /api/cards/:id/world` ([API](../contracts/api.md)), beside the seen marks.
   * **Storage.** `card_worlds` in Unfold's store, keyed by the person's user id and the Work Item, the decoration as JSON; a person keeps at most 2000, the least recently changed dropped first. Ploeg never sees it.
   * **Authorization.** A sign-in; the request header on writes; the card read through Ploeg within the person's Teams (404 otherwise); and a copy, by `copyOf` over the person's logins as in [ADR 0029](0029-binders-packs-and-pulls-collect-run-cards-privately-and-fairly.md) (403 `card_copy` for anyone else, an administrator included). A self-declared login can make someone a holder for decorating, as it does for collecting, because a decoration is private and attributes nothing.
   * **Validation.** Only `v`, `kind`, `tod`, `weather` and `objects`; known values for each; at most 24 things, each exactly `{ t, x, z, s }` with a known type, `x` from −4 to 4, `z` from −3 to 3 and a seed from 0 to 1, rounded on save; and every time of day and thing re-checked against the card's facts now. A refusal is 400 `card_world` with the reason. On read, things the card no longer has earned (a mend that reopened) are left out and an unearned time of day falls back to `auto`.
   * **Visibility.** A decoration is shown only to its owner, wherever they view the card. Everyone else, administrators included, sees the theme's world. There is no way to show a decoration to someone else.
   * **Cosmetic only.** Nothing in a decoration is read by grading, finishes, rarity, packs, pulls, odds, the binder's readouts or Ploeg.
6. **Performance budget.** At most one world per page: the live hero card, or, under reduced motion on a hardware GPU, the first card that may draw one; every other card keeps its art. A card builds its world only once the IntersectionObserver reports it on screen, renders it only inside the forge's live loop (which pauses off screen, turned over, in a hidden tab and under reduced motion), and frees its render target, geometry, materials and textures with the card. The render target is sized to the art window's on-screen pixels at the renderer's pixel ratio (the device's, capped at 2), between 64 and 1024 pixels a side; the particle pool holds 1400. There is no new WebGL context. Without WebGL2 the card is Unfold Native, on a software rasteriser it is a still frame of its art unless the page asks for a live card, and a world shader the GPU refuses falls back to the art.
7. **Accessibility.** Under reduced motion the world draws on demand with no animation, particles, springs or pan, and flattens at once. A description names the world, its light, whether it follows days live, the weather, what can be touched and the card's condition (`aria-describedby` on the art window); a polite live region says what a click, a key or a save did. Every control is a real button or select.

### Consequences

* Good, because the art now moves with the card and answers the pointer, and the light and the things inside say how far the work got: dawn before release, night after a year live, a windmill once merged, a lighthouse once proven, a gold seam and a koi pond once mended.
* Good, because people make their own copy theirs without any of it reaching a grade, a pull or another person.
* Good, because the world shares the card's renderer and its pauses, so the page keeps its WebGL budget.
* Bad, because a live card renders a second scene each frame, about the art window's pixels again; one world per page and the pause rules bound it.
* Bad, because the rules live in two places, `rules.js` and `src/card-worlds.ts`; a test compares them.
* Bad, because a decoration whose card loses an unlock (a reopened mend) hides those things without saying so; they come back if the card earns them again before the person saves, and are gone for good once they save.
* Bad, because a still card on a software rasteriser, as in CI, shows no world; the browser test asks for a live card, and builds a reduced-motion world directly to check its rules.
* Neutral, because the camera and the decoration live in the browser: two tabs of the same card can save over each other, last write wins.

### Confirmation

Proposed. Confirmed when the owner tilts, flattens, clicks and decorates a live forge card on a real GPU and accepts its look and its unlocks.

In `apps/unfold`, `mise exec -- npm test` pins it: [`test/card-worlds.test.ts`](../../test/card-worlds.test.ts) refuses every malformed or unearned decoration with its reason, checks that only a holder may save or reset, that one person never sees another's decoration, that unlocks follow a card as it ages and mends, that a decoration changes no binder, pack or pull, the per-person limit, and the routes' sign-in, request header, Team scope and copy checks. [`test/forge-world.test.mjs`](../../test/forge-world.test.mjs) compares the browser's and the server's rules, their verdicts on the same decorations and the facts they read on every demo card, and pins the facts to times of day and things on the demo cards, the deterministic default, the theme's choice, the controls' markup under the CSP with locked reasons, the world variant of the front shader, the manifest, the modules' imports and the static route. `mise exec -- npm run test:browser` ([`scripts/browser/world.mjs`](../../scripts/browser/world.mjs)) loads a demo forge card with its islands under the CSP, checks its description, flattens and restores it by button and F, touches a thing by keyboard and one found by its hover cursor, places a crystal by pointer, erases a thing by keyboard, saves, reloads and finds the decoration, resets it, and checks a reduced-motion world.

Re-evaluate when rarity is decided, when someone asks to show a decoration to others, when a second page outside Unfold loads the card, or if the second render costs too much on low-end hardware.

## Pros and Cons of the Options

### A separate canvas and WebGL context for the world

* Good, because the world could render at its own rate.
* Bad, because a third context breaks the page's budget, and the world could not sit under the foil and the card's light.

### One shared decoration per card, set by its steward

* Good, because everyone would see the same card.
* Bad, because it lets one person change what others see, needs a moderation rule, and mixes a person's taste into a team's record.

### Decorations in local storage

* Good, because it needs no server change.
* Bad, because a decoration would not follow the person to another browser, and the server could not check unlocks or holding a copy.

### Ploeg stores decorations

* Good, because the card would carry everything.
* Bad, because cosmetics would cross into the engine that authorizes and budgets Runs, and Ploeg does not know Unfold's users.

## More Information

* The owner's inner world prototype: a working document outside the repository; its look and parameters were ported, its invented level was replaced by the merged state.
* 2026-10-02: proposed with the world runtime, fact-driven unlocks, theme worlds, the designer choice and private per-copy decorations implemented in Unfold.
* 2026-10-10: [root ADR-0030](../../../../docs/adr/adr-0030-run-cards-are-an-unfold-domain-on-top-of-ploegs-delivery-facts.md): the facts that light and unlock a card's inner world now come from the card Unfold assembles from Ploeg's delivery facts; the world itself is unchanged.
