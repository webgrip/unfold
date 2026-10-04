# Run cards: holo, foil and game feel

Status: research record, 2026-10-01. It informs [Vloer ADR 0026](../adrs/0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md) and the proposed [Run cards](../../../../docs/concepts/run-cards.md). It is not current guidance; the ADR and the code in `public/cards/` describe what is built.

**Question.** How do you render foil and holographic cards on the web, and how do you make card events (pull request opened, CI passed, merged, level up, a crack, a kintsugi mend) feel good without harming accessibility, battery or focus?

**Method.** Source reading of [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) and the shipped Balatro Lua, the canonical game-feel talks, platform and accessibility specifications, and a measurement of three.js bundle sizes on jsDelivr. Each claim is marked **verified** (code read), **reported** (secondary source) or **proposed** (design).

**Limitations.** The Bloomberg colour-accessibility story answered 403, so that claim comes from a search summary. Marvel Snap reveal timing is observed in play, not documented. Parameters below are reference values; no code or texture was copied.

## Licences decide what we may reuse

| Source | Licence | What Unfold may do |
| --- | --- | --- |
| [simeydotme/pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) | GPL-3.0 | Unfold is Apache-2.0, so copy no CSS and no textures (some are third-party art). Learn the technique and write our own layers. |
| [simeydotme/hover-tilt](https://www.npmjs.com/package/hover-tilt) | MPL-2.0 | Usable as an unmodified dependency; modified files stay MPL. |
| Balatro (LocalThunk) | Proprietary; readable in the shipped game and in mirrors such as [balatro-src-reverse-engineering](https://github.com/balatro-src/balatro-src-reverse-engineering) | Parameters as reference values only. No code or shader text. |
| three.js | MIT | Free to use. |

## Foil rendering

### The pokemon-cards-css model (verified)

Demo: <https://poke-holo.simey.me/>; write-up: [CSS-Tricks, "Holographic trading card effect"](https://css-tricks.com/holographic-trading-card-effect/).

* **Stack.** A translater (perspective 600px), a rotator, the card back (`rotateY(180deg)`) and a front grid where the art, a **shine** layer (`color-dodge`) and a **glare** layer (`overlay`) sit on top of each other. Each effect is one element plus two pseudo-elements, each with several blended gradient layers. Rotated "sunpillar" palettes put the three rainbow layers out of phase, which reads as depth.
* **One JS module writes about eight custom properties** from the pointer: position, distance from centre (`--pointer-from-center`), a *compressed* background position (37–63 % and 33–67 %, so the rainbow slides about 26 % as the pointer crosses the card), tilt (at most ±14°) and an opacity that fades effects in only while interacting. Everything else is CSS.
* **The key trick:** the foil background is 200–1100 % of the card and its position is *amplified* (`calc(((50% - var(--background-x)) * 2.6) + 50%)`), so a small tilt sweeps a long stretch of rainbow, like real prismatic foil. **Foil brightens towards the edges** (`brightness(calc(pfc*0.4 + 0.4))`): the single biggest realism win.
* **Motion:** springs (interact stiffness 0.066, damping 0.25; release after 500 ms with 0.01 / 0.06), pointer events coalesced to one update per frame, a 360° spin on first pop-over capped at 1.75× scale. A non-interactive hover fallback sets fixed values with a 0.3 s transition.
* **Clip and mask decide the foil type as much as the gradient:** art window only (holo), everything but the art (reverse holo), whole card (full art, secret), or an alpha mask (etched).

| Foil | What makes it read as that foil |
| --- | --- |
| Regular holo | 110° rainbow overlaid with 1px scanlines, plus vertical "sun pillar" bars sliding in opposite directions; clipped to the art window |
| Reverse holo | Foil texture everywhere except the art window, fading out towards the edges |
| Cosmos | Three star layers moving at different rates: parallax inside the foil, randomly offset per card |
| Rainbow (secret) rare | Whole-card rainbow of darker, desaturated hues plus glitter, so dodge does not blow out |
| Gold secret rare | A two-stop yellow gradient times a texture; glitter shifted ±1px with the pointer, the cheapest sparkle |
| Radiant | Two crossed stepped bar gradients approximating a diamond lattice |
| Amazing rare | Very shiny textured foil that extends past the frame |
| V / VMAX | Diagonal metallic bands with a rainbow showing only through the highlights; VMAX adds a large textured plate |

**Proposed for Run cards:** adopt the variable contract, never the CSS. Write the variables on the hovered or active card only. Build each finish from a large rainbow, a structure pattern and a pointer radial. Every foil element repaints on each change, so animate only the one card being touched.

### Balatro's edition shaders (verified, parameters only)

Balatro renders editions as procedural fragment shaders that port to a WebGL quad: **foil** is a cold blue-white sheen from concentric sine rings and an angular sweep; **holo** is a hue shift over a slowly orbiting field plus a fine diamond grid; **polychrome** rotates the whole card's hue with saturation capped at 0.6. On hover, vertices bulge towards the cursor. When idle, each card's shine origin orbits with a phase derived from its id (radius 0.2), so neighbours shimmer out of phase. Copy that idea: idle motion with a per-card seeded phase.

### WebGL techniques (proposed)

CSS covers static and hovered cards. Use WebGL for physically plausible iridescence, normal-mapped emboss, per-facet glitter, particles in depth or a true 3D frame break.

* **Thin-film iridescence.** Reflectance per wavelength is about `0.5 + 0.5·cos(2π·OPD/λ + π)` with `OPD = 2·n·d·cosθt`, evaluated at 650, 532 and 450 nm and weighted by a Fresnel term ([Alan Zucconi, car-paint thin-film](https://www.alanzucconi.com/2017/10/27/carpaint-shader-thin-film-interference/), [GameDev.net thin-film tutorial](https://gamedev.net/tutorials/programming/graphics/thin-film-interference-for-computer-graphics-r2962), [Belcour & Barla 2017](https://belcour.github.io/blog/slides/2017-brdf-thin-film/slides.html)). three.js has it built in as `MeshPhysicalMaterial` iridescence ([three.js docs](https://threejs.org/docs/#api/materials/MeshPhysicalMaterial.iridescence), [PR #23869](https://github.com/mrdoob/three.js/pull/23869)), which needs an environment map.
* **Embossed or textured foil** from a normal map and Blinn-Phong; the CSS fallback is an SVG `feSpecularLighting` filter on the focused card only.
* **Glitter** as tiny mirrors with random normals: a flake lights only when its normal bisects light and view, so sparkles switch with tilt. Random per-frame twinkle reads as noise.
* **Reflections** from a matcap texture instead of a cubemap.
* **Gyroscope tilt.** iOS Safari 13+ needs `DeviceOrientationEvent.requestPermission()` from a user gesture over HTTPS ([DEV: iOS 13 permission](https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2)). Capture a baseline, clamp, and feed the same variables as the pointer.
* **Parallax and frame break.** Marvel Snap adds one effect per tier ([GameRant](https://gamerant.com/marvel-snap-all-card-levels/)) and finishes on splits ([snap.fan](https://snap.fan/news/infinity-splits-and-frame-breaks/)); Second Dinner built a Unity tool for layered 2D art with height maps ([Unity case study](https://unity.com/case-study/marvel-snap)). On the web: layers at different `translateZ`, or JS translation by tilt × depth; frame break is a subject image that overflows the card.

## Game feel

### The canon

* **Jan Willem Nijman, "The Art of Screenshake"** ([video](https://www.youtube.com/watch?v=SkgkIXZ_13Y), [Make Games SA thread](https://makegamessa.com/discussion/1537/the-art-of-screenshake-by-flambeer-s-jan-willem-nijman)): hit flash, freeze frames, shake, kickback, permanence, sound. A replication found freeze frames genre-dependent ([Blue Tengu](https://www.bluetengu.com/2014/12/12/art-of-screenshake-experiments/)).
* **Jonasson and Purho, "Juice it or lose it"** ([GDC Vault](https://www.gdcvault.com/play/1016487/juice-it-or-lose)): many small, cheap, responsive effects, each tied to an event.
* **Steve Swink, *Game Feel*** ([Wikipedia](https://en.wikipedia.org/wiki/Game_feel), [Liz England review](https://lizengland.com/blog/review-game-feel-by-steve-swink/), [chapter 1](http://mycours.es/gamedesign2014/files/2014/10/Game-Feel-Steve-Swink-chapter-1.pdf)): polish does not change the simulation, and the correction cycle is under 100 ms. **Every card reaction starts within 100 ms of its event.**
* **Squirrel Eiserloh, "Juicing Your Cameras With Math"** ([slides PDF](http://www.mathforgameprogrammers.com/gdc2016/GDC2016_Eiserloh_Squirrel_JuicingYourCameras.pdf), [GDC Vault](https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing)): keep a trauma value in [0, 1] that decays linearly; shake = trauma², so 0.3 / 0.6 / 0.9 trauma gives 3 / 22 / 73 % shake; use smooth noise, not random; "camera shake is like salt".

### Balatro's card juice (verified, parameters only)

* **Juice pop:** 0.4 s; an instant squash to `1 − 0.6·amount` on frame 0; scale oscillates at about 8.1 Hz with cubic decay and rotation at about 6.5 Hz with quadratic decay, low-pass filtered into a soft "boing". It returns immediately under reduced motion.
* **Room jiggle:** a permanent slow idle sway plus about 3 Hz translation and 6 Hz rotation proportional to accumulated energy, decaying with a 0.2 s time constant. The screenshake setting is a slider, forced to 0 under reduced motion.
* **Pitch ramp:** consecutive scoring sounds climb in pitch (`0.8 + percent·0.2`, `percent` from 0.3 by 0.08).
* **Counters** roll to the new value over 0.3 s.
* **Ceremony scales logarithmically:** flame intensity `max(0, log₅(score) − 2)`. Ten times the score is visibly, not absurdly, bigger.
* **A global speed (0.5× to 4×)** scales every animation; copy it as a `ceremonyTimeScale`.

A CSS approximation exists ([blakecrosley.com Balatro guide](https://blakecrosley.com/guides/design/balatro)); its values are web approximations, not Balatro's.

### Reveal patterns (reported)

* **Marvel Snap:** dark "piano glass" UI where cards top the hierarchy ([Tiffany Smart portfolio](https://www.tiffanysmart.com/work/marvel-snap)); cosmetic layers are visible to opponents.
* **Hearthstone:** face-down cards glow their rarity colour before the player chooses to flip ([Hearthstone wiki: Rarity](https://hearthstone.fandom.com/wiki/Rarity)); a legendary summon shakes the board ([Fandom game boards](https://hearthstone-archive.fandom.com/wiki/Game_boards)); hundreds of entrances stay cohesive by abstracting elements from the art ([GDC session](https://schedule.gdconf.com/session/vfx-storytelling-how-hearthstone-breathes-life-into-hundreds-of-cards/908026)); golden cards are animated art in a gold frame ([Golden card](https://hearthstone.wiki.gg/wiki/Golden_card)).
* **TCG Pocket:** a physical tear gesture whose sound was tuned on real packs ([Nintendo Wire](https://nintendowire.com/guides/pokemon-tcg-pocket/introduction/)); immersive cards expand beyond the frame ([Game8](https://game8.co/games/Pokemon-TCG-Pocket/archives/474500)); rare "god packs" are 0.05 % ([ptcgpocket.gg](https://ptcgpocket.gg/rare-packs/)). A fan simulator models face-down, charge, flip, burst and rarity-scaled shake, and halves durations under reduced motion ([poke-pack-sim PR #16](https://github.com/gabrielrauch/poke-pack-sim/pull/16)).
* **Hit-stop calibration:** fighting games use about 8 to 15 frames ([Shoryuken](http://shoryuken.com/2016/06/07/hitstop-in-street-fighter-v-kens-not-so-little-secret/), [Capcom column](https://game.capcom.com/cfn/sfv/column/131545)); in UI, 35 to 90 ms reads as weight and more than 120 ms as a dropped frame ([SwordArcade summary](https://swordarcade.xyz/guides/game-feel-hitstop-and-screen-shake/)); a web write-up uses 60 to 90 ms hit-stop and 6 to 40 particles by tier ([valdemird.com](https://valdemird.com/blog/game-feel-on-the-web/)).

### Parameters to build from (proposed)

Every event animation has four phases: **anticipation → impact → follow-through → settle**.

| Phase | Duration | Technique |
| --- | --- | --- |
| Anticipation | 60–250 ms, scaled by tier | ease-in; scale to 0.94–0.97, lift 4–12px, glow charge |
| Impact | one-frame squash plus 0–90 ms hit-stop | soft flash ≤ 50 ms at ≤ 0.6 opacity; add trauma |
| Follow-through | 300–700 ms | spring overshoot; juice wobble; particles |
| Settle | 200–400 ms | ease-out; leave a mark (stamp, crack, counter value) |

* **Shake:** trauma per tier 0 / 0.15 / 0.3 / 0.5, decay 1.2/s, at most 6px and 1.5° on the card (12px only for a page takeover). Shake the card, never the page, except for a legendary takeover.
* **Juice amount per tier:** 0.06 / 0.10 / 0.16 / 0.25.
* **Particles per tier:** 0–6, 12–20, 30–50, 80–150; canvas above about 40.
* **Counters:** roll over 300–600 ms, digits staggered, tabular numerals; money in nl-NL with two decimals.
* **Sound**, layered as transient, body, sub, tail and sting by tier ([Morphic layering guide](https://morphic.com/resources/how-to/how-to-layer-sound-effects), [SFX Engine impact guide](https://sfxengine.com/blog/impact-sound-effect)), with ±4 % random pitch. **Sound is opt-in** in a developer tool. Haptics exist on Android Chrome only.

## Ceremony scaled by rarity and frequency

How games make a legendary moment feel bigger: longer, player-controlled anticipation; a consistent colour language from grey to gold; dimming the rest of the screen; a unique sting; warmer colour; one added layer per tier; logarithmic scaling. Diablo 3's loud clang and beam became a chime and a pillar in Diablo 4, with per-rarity audio settings ([Diablo Wiki](https://www.diablowiki.net/Legendary), [gamerguides](https://www.gamerguides.com/diablo-iv/guide/equipment/loot-drops/item-rarity-differences-in-diablo-4), [VHPG](http://www.vhpg.com/diablo-4-gear-audio-cues/)); WoW has a dedicated legendary toast ([sound](https://www.wowhead.com/sound=63971/ui-legendaryloot-toast)). Even Blizzard found the loudest version too much over time.

**Proposed rules:**

1. **Intensity is inverse to frequency.** Ambient (dozens an hour): colour and opacity only. Pull request opened or CI passed (several a day): ≤ 350–500 ms, no shake. Merged: ≤ 900 ms, card shake. Level up: ≤ 1.8 s. Crack: ≤ 1.5 s, no red. Mend: ≤ 2.5 s. Legendary milestone: ≤ 3.5 s, skippable after 300 ms.
2. **Habituation guard.** The same event again within 10 s plays a tier lower; within 2 s, batch into one animation with a counter. At most one takeover per 10 minutes.
3. **Never interrupt work.** No takeover while focus is in an input or within 2 s of a keystroke. Hidden tab: no animation; on return, offer "while you were away".
4. **Skippable and speed-scalable.** Any input after 300 ms jumps to the settled state.
5. **Negative events inform, they do not punish.** The mend is more ceremonious than the crack, so the arc ends positive.
6. **Commons do not idle.** Only rare and above shimmer when idle, paused off screen and after 60 s without input.

## Accessibility

* **WCAG 2.3.3 Animation from Interactions (AAA):** motion triggered by interaction can be turned off; colour, blur or opacity alone is not motion ([W3C Understanding 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)).
* **Vestibular triggers** include zoom, spin, parallax and 2D planes moving in 3D, which is exactly card tilt ([WebKit, "Responsive design for motion"](https://webkit.org/blog/7551/responsive-design-for-motion/)).
* **WCAG 2.3.1 Three Flashes or Below Threshold (A):** at most three flashes a second, with a stricter red threshold. A 300×420 card already exceeds the area exemption (about 341×256 px), so never rely on it ([W3C Understanding 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)).

**Reduced motion (proposed):** no tilt, but the sheen still follows the pointer through colour; a 150 ms brightness pulse instead of shake and wobble; crossfades instead of zoom and flip; durations halved and capped at 400 ms; no idle shimmer. **Flash safety in code:** at most one flash per event and three per second globally, ≤ 0.5 opacity, confined to the card; no red flashes, so a crack is a dark fracture with desaturation; CRT flicker stays below 3 Hz at large amplitude.

## Performance

* Only `transform` and `opacity` run on the compositor; background position, filters, gradients and blend modes repaint ([web.dev animations guide](https://web.dev/articles/animations-guide)). `@property` animates typed values inside gradients but repaints each frame ([web.dev](https://web.dev/blog/at-property-baseline)).
* **Decision table:** transforms for tilt, wobble, shake and flip; layered CSS foil on one active card; static or pre-rendered foil, or one shared WebGL canvas, for many idle cards; WebGL for iridescence, emboss, glitter, CRT, crack and kintsugi; a canvas for more than about 40 particles; three.js only for a true 3D frame break.
* **three.js r186, measured 2026-10-01** from [jsDelivr](https://cdn.jsdelivr.net/npm/three/build/): the WebGL path is about 0.8 MB minified, **about 194 KB gzip**; the often-quoted 1.3 MB is the unminified module. Tree-shaking helps only somewhat ([three.js forum](https://discourse.threejs.org/t/what-is-the-state-of-tree-shaking/33168)). **Write card shaders as plain WebGL2 on a quad** (a 3–5 KB helper) and lazy-load three.js only for a legendary scene, never blocking a ceremony on it.
* **One WebGL context for all cards.** Browsers cap live contexts at about 16 (sometimes 8). Render each card's quad into one shared canvas with viewport and scissor ([three.js multiple-scenes manual](https://threejs.org/manual/en/multiple-scenes.html), [webglfundamentals multiple views](https://webglfundamentals.org/webgl/lessons/webgl-multiple-views.html)).
* **Render on demand**, pause off screen (`IntersectionObserver`, `visibilitychange`), cap the device pixel ratio, ask for `powerPreference: 'low-power'`, and drop a quality tier when the median frame time passes 20 ms. [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) helps only for the particle and takeover canvas. `will-change` only on the hovered card; never animate `backdrop-filter`.
* **Power:** at about €3 a year per continuous watt, an always-animating tab that sits open all day is a real cost, so render on demand.

## Skins (proposed)

Each skin has an idle state, a common event and an epic variant. Crack and mend apply to all skins, in each skin's material.

* **Holo Rarity** (Pokémon, Snap, Hearthstone): idle shine orbit for rare and above; "card flick" events with a glare sweep; the epic variant is a face-down charge, a spin and an added foil layer.
* **Loot Drop** (Diablo, WoW): heat shimmer; a drop with bounce and a beam of light in the quality colour; a page-level pillar for epics.
* **Arcade Cabinet:** scanlines and a slow roll band, palette cycling ([Attract Mode, TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/AttractMode), [Color cycling](https://en.wikipedia.org/wiki/Color_cycling), [CRTPlay](https://www.crtplay.com/blog/crt-effect)); stepped score ticks; "NEW HIGH SCORE" with a chromatic split. Blinks stay at 1 Hz.
* **Ticker Terminal** (Bloomberg): amber on black ([Ted Merz, "Amber on black"](https://ted-merz.com/2021/06/26/amber-on-black/), [IEEE Spectrum](https://spectrum.ieee.org/bloomberg-terminal)), with blue and red for up and down for colour accessibility ([Bloomberg](https://www.bloomberg.com/company/stories/designing-the-terminal-for-color-accessibility/), from a search summary). Split-flap digits; restraint is the signature.
* **Mission Patch:** thread sheen per stitch group; a stamp slam with a 60 ms hit-stop that stays on the card; redaction bars peel away for epics.
* **Vloer Native** (Linear or Vercel style): a pointer spotlight and a one-shot conic border sweep ([css-tip glowing border](https://css-tip.com/glowing-border/), [theosoti animated borders](https://theosoti.com/blog/animated-gradient-borders/)); a status change stays under 500 ms. The skin people can leave on all day.

**Crack:** an 80 ms hit-stop, five to eight fracture lines drawn from the impact point in 220 ms, a small flinch, the art desaturated by 30 %, a glass tick. Seed the lines from the card id so a card always cracks the same way. No red flash. **Kintsugi:** the same paths re-stroked in gold from the impact point over 900 ms, a glint along each seam, saturation briefly above the original, a rising sting. The gold seams stay forever.

## Recipe index (proposed)

| Recipe | When | Key timing |
| --- | --- | --- |
| Pointer → foil variables | any foil card on hover or tilt | springs as above; one frame per update |
| Sun-pillar holo | rare art windows | driven by the pointer |
| Gold secret foil | legendary cards, kintsugi seams | pointer plus idle orbit |
| Facet glitter (WebGL) | epic and above | reacts to tilt |
| Thin-film sheen (WebGL) | prism finish | film thickness rolls on level up over 800 ms |
| Juice pop | any reaction | 400 ms |
| Trauma shake | rare and above | decay 1.2/s, shake = trauma² |
| Hit-stop | epic impacts, crack, stamp | 0 / 40 / 60–70 / 90 ms, never over 120 |
| Face-down charge and flip | level up, new card, legendary | charge 400–1200 ms, flip 450 ms |
| Particle burst | rare and above | 12 / 40 / 100 particles, 500–1200 ms life |
| Counter roll | XP, checks, lines, cost | 300–600 ms |
| Seeded idle shimmer | visible rare and above | 30 fps cap, stops after 60 s idle |
| Loot beam, stamp slam, split-flap, CRT glitch, conic sweep | per skin | as in the skin notes |
| Crack, kintsugi | bug confirmed, mend confirmed | as above |
| Legendary takeover | monthly milestones, at most one per 10 minutes | ≤ 3.5 s; reduced motion ≤ 600 ms |

## Sources not cited inline above

The Balatro files read were `engine/moveable.lua`, `card.lua`, `functions/common_events.lua`, `functions/state_events.lua`, `functions/button_callbacks.lua`, `functions/UI_definitions.lua`, `game.lua` and `resources/shaders/{foil,holo,polychrome,CRT}.fs`. The pokemon-cards-css files read were `Card.svelte`, `orientation.js`, `base.css`, `cards.css` and the per-foil stylesheets.
