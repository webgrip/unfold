---
status: proposed
date: 2026-10-01
decision-makers: Ryan Grippeling
review-by: 2026-10-31
---

# The forge skin renders Run cards in 3D with vendored three.js

## Context and Problem Statement

[ADR 0026](0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md) gave Run cards a runtime with skin packs, and Vloer Native draws them with markup and CSS. The owner's Card Forge prototype draws the same card as a 3D object in three.js r165: an extruded body with a metal edge, a front composited in one fragment shader (face, moving art, foil, cracks and kintsugi), a back, a grading slab, light that follows the pointer, and short moments such as the reveal. The owner wants it in Vloer as the flagship look, and asked for a new layer on top: relief, so the raised frame, title and coin catch the light as the card tilts.

The prototype loads three.js and its fonts from CDNs through an import map, and injects `<style>` blocks. Vloer's Content Security Policy is `script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:`, so none of that loads. Vloer also has no bundler and no production npm dependency ([ADR 0002](0002-native-node-and-single-writer-storage.md)). A WebGL renderer per card would exhaust the browser's context limit and the reader's GPU, and a card must still honour reduced motion and work without WebGL. How does Vloer draw a Run card in 3D inside those constraints?

## Decision Drivers

* The CSP stays as it is: no CDN, no inline style or script, no import map.
* No bundler and no production npm dependency ([ADR 0002](0002-native-node-and-single-writer-storage.md)).
* Every card shows the same facts whatever its skin, a demo never invents spend ([Unfold ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md)), and unknown never reads as zero ([ADR 0026](0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md)).
* Motion helps and never harms: reduced motion is honoured, and nothing draws while nobody can see it.
* A page holds at most one live WebGL renderer for cards.
* Rarity is still open. The earned finish, the grade (card contract P2b) and the condition (P3) are facts the card may show.

## Considered Options

* A `forge` skin pack that draws with three.js 0.165.0, vendored into `public/vendor/three/` by a script
* The same skin with hand-written WebGL2 and no library
* three.js from a CDN through an import map, with the CSP relaxed for it
* A bundler that builds three.js and the skin into one file

## Decision Outcome

Chosen option: "A `forge` skin pack with vendored three.js", because it ports the prototype's scene almost as written, loads only from Vloer's own origin under the unchanged CSP, keeps the runtime and its accessibility rules, and adds no production dependency or build step.

1. **Vendoring.** `three` is a pinned devDependency (0.165.0). [`scripts/vendor-three.mjs`](../../scripts/vendor-three.mjs) (`npm run vendor:three`) copies the minified build and the addons the skin uses (room environment, rounded box, effect composer, render, bloom and output passes, and their shaders) into `public/vendor/three/` under flat kebab-case names, and rewrites every bare `three` import and relative addon import to the flat sibling. The browser imports them without an import map. Each file starts with a header naming the version, and the folder carries three.js's MIT `LICENSE` and a `VERSION`. `REUSE.toml` declares the folder MIT, `LICENSES/MIT.txt` holds the licence text, and `NOTICE` names the bundled copy. The server serves `/vendor/three/<name>.js` by a strict pattern and nothing else under `/vendor/`. `npm run check` accepts only the listed files, requires the unedited header, and compares the folder with `node_modules/three` when it is installed. `npm run license:check` requires the licence, the NOTICE line, the REUSE annotation, the pin and the route.
2. **Skin pack.** [`public/cards/skins/forge/`](../../public/cards/skins/forge/) is a first-party pack. Its manifest adds three optional fields the registry now checks: `renderer` (`dom` by default, or `webgl2`), `fallback` (the shipped pack to draw instead without WebGL2, required for `webgl2`), and `extends` (a shipped pack whose stylesheet the runtime links first). The forge pack declares `webgl2`, falls back to and extends Vloer Native, and lists every finish. The runtime reflects the pack it drew as `data-skin` on `<unfold-card>`, falls back when `webglSupport()` finds no WebGL2, and now calls `attach(front, view)` with the view model. A Work Target selects the pack with `cardStyle.skin: "forge"`; Vloer Native stays the default.
3. **The front markup.** [`skin.js`](../../public/cards/skins/forge/skin.js) draws a stage for the canvas, a bar with the state chip, the cost line and the day chip, a **Turn over** button and **More info**. The card's facts (title, crew, plays, diff, run time, release, grade, finish, steward, ids) are also written as text for screen readers, and that text shows in place of the 3D card if WebGL fails. The back is Vloer Native's six tabs. The skin module is light: three.js, the shaders and the painter load with a dynamic `import()` only when a forge card attaches.
4. **The scene.** [`engine.js`](../../public/cards/skins/forge/engine.js) builds the prototype's card: an extruded body whose edge is steel while matte, chrome once foiled and gold once gilded; a front `ShaderMaterial` (GLSL ES 3.0) that composites the face canvas over the art and lays the foil over it; a back with the Unfold mark; a grading slab when the card has a grade; soft bloom; springs for tilt and turn; and ambient motes. [`face.js`](../../public/cards/skins/forge/face.js) paints the face, a region mask and a height map from [`forge-model.js`](../../public/cards/skins/forge/forge-model.js)'s `faceFacts`, which takes every value from the view model. A demo card's coin reads "Demo", its footer "Demo · no model calls · illustrative", and it paints no amount. An unknown cost paints "—" with "not reported". The face is painted in Archivo, which Vloer already serves.
5. **Finish as coverage.** The earned finish sets how much of the card the foil covers: none while matte (under 7 days live), the frame at foil (7), the frame and art window at holo (30), the whole card at prism (90), plus gold edges and a gold hairline at gilded (180), plus a light orbiting the border at infinity (365). The shader limits the pattern to those regions and gives the rest a faint satin sheen.
6. **Pattern and art.** The prototype's sixteen foil patterns and fifteen art presets ship as GLSL in ES modules ([`shader-foils.js`](../../public/cards/skins/forge/shader-foils.js), [`shader-art.js`](../../public/cards/skins/forge/shader-art.js), [`shader-prelude.js`](../../public/cards/skins/forge/shader-prelude.js)); all are original work for this project. Until packs assign a pattern, a card's pattern is picked by a stable FNV-1a hash (`stableHash` in `card-model.js`) of its Work Item id and its theme, or skin when it has none, from the twelve patterns that draw on both frame and art window. The art preset is picked the same way. The view model carries `foilPattern`, null today, so a later pull can name the pattern and the forge draws it. Each card's shader calls only its own art and pattern, and the compiler drops the rest.
7. **Relief.** The painter draws a height map beside the face: a raised frame with engraved lines and a fine hatch, a raised title, a domed cost coin, a recessed art window, a debossed set symbol, slightly raised panels and labels. The front shader takes normals from it by finite differences and adds diffuse and specular light from the moving light, so relief catches the light as the card tilts. The art window gets extra parallax depth and an inner shadow that moves with the view.
8. **Grade and condition.** The proxy now passes `grade` and `condition` through in the shape the card contract's P2b and P3 addendum defines and drops any other shape to null; it still forces `rarity` to null and `finish` to `matte`. The view model formats the grade ("8,5", provisional, label, qualifiers, subgrades, formula) and the condition ("Mended · VIK-1642, S2 · mended by its steward in #68"). The forge puts a graded card in a slab labelled "Unfold Grading", and draws open cracks as dark fractures and mended ones as gold kintsugi. A live card that changes condition plays the crack or the mend. Vloer Native shows neither on its front; both appear on the back's Review & CI and Life tabs.
9. **Performance and accessibility.** The first forge card on a page that may move gets the one live renderer. It renders only while it is on screen (an `IntersectionObserver`), facing front, in a visible tab and without reduced motion, and pauses otherwise. Every other forge card, a card with `motion="still"`, a reader who prefers reduced motion and a software rasteriser (SwiftShader, llvmpipe) get one still frame from a single shared renderer, copied into a 2D canvas and redrawn only when the facts, the size or the turn change. `motion="live"` asks for live rendering on a software rasteriser. Reduced motion also drops the reveal, the motes and the idle drift. The scene outlives the runtime's redraws by three seconds, so a live refresh repaints the face only when a fact changed.
10. **Demo.** Six demo Work Items use the forge skin (105, 117, 119, 120, 122 and 123), so `mise run demo` shows matte, foil, holo, prism, gilded and infinity cards. 119, 120, 122 and 123 carry illustrative grades and 119 and 120 illustrative cracks; their briefs say so. Every other demo card keeps Vloer Native.

### Consequences

* Good, because the prototype's look reaches Vloer without changing the CSP, adding a production dependency or a build step.
* Good, because the card's facts, the "never zero" rule and the demo's "no model calls" still come from the view model, and screen readers get them as text.
* Good, because a page never holds more than two WebGL contexts for cards, one live and one shared for still frames, and the live one stops when nobody can see it.
* Bad, because the forge adds about 812 KiB of JavaScript (211 KiB gzipped) on the first forge card, 678 KiB of it three.js. It loads only for a forge card and is cached afterwards. On the demo under SwiftShader, the Work Item page drew its first forge card about 1.5 s after navigation and later ones about 0.3 s after.
* Bad, because the painted text is part of a texture: it is not selectable, does not follow the theme and is small at the card's size. The bar, the screen-reader text and More info carry the same facts.
* Bad, because GPU cost on low-end machines is unmeasured. A software rasteriser gets a still frame; a weak GPU gets the live card.
* Bad, because a three.js upgrade is two steps: Renovate bumps the devDependency, and `npm run check` fails until someone runs `npm run vendor:three` and commits the copy.
* Neutral, because the 3D back is decorative. **More info** still turns the runtime to the data tabs, and **Turn over** shows the 3D back.

### Confirmation

Proposed. The forge skin and the proxy change are implemented against the card contract and its P3 addendum, which Ploeg does not implement yet. It is confirmed when the owner accepts the look on a live Work Item and a Ploeg with grades or cracks serves one.

In `apps/vloer`:

* `mise exec -- npm test`: [`test/forge-skin.test.mjs`](../../test/forge-skin.test.mjs) pins the finish-to-coverage ladder, the stable hashes and the pull override, the painted facts (a demo paints no amount, unknown never reads as zero), the escaped markup without inline styles, the manifest, the shader libraries against the catalogue, and the unedited, pinned vendored copy. [`test/card-model.test.mjs`](../../test/card-model.test.mjs) pins the grade and condition views and the demo's forge cards, and [`test/ploeg.test.ts`](../../test/ploeg.test.ts) the proxy's validation of grade and condition. [`test/static-assets.test.ts`](../../test/static-assets.test.ts) pins the `/vendor/three/` route and its refusals.
* `mise exec -- npm run check` and `npm run license:check` pin the vendored copy and its licence.
* `mise exec -- npm run test:browser` ([`scripts/browser/forge.mjs`](../../scripts/browser/forge.mjs)) opens demo forge cards under the CSP and checks painted pixels, the facts, Turn over, More info, the cracked and mended chips, a live card that pauses on its back and below the fold, the still frame under reduced motion, and the fallback to Vloer Native without WebGL2.

Re-evaluate when packs assign patterns, when rarity is decided, when a second page outside Vloer loads the card, when the effects director lands, or if the forge measurably slows the Work Item page on the owner's hardware.

## Pros and Cons of the Options

### Hand-written WebGL2 without a library

* Good, because it ships no third-party code and only the bytes the card needs.
* Bad, because the extruded geometry, PBR metal with an environment map, the bloom chain and the render-target handling would be rewritten from scratch, and the prototype could not be ported as written.

### three.js from a CDN through an import map

* Good, because there is nothing to vendor.
* Bad, because it needs `script-src` to allow the CDN and an inline import map, which the CSP forbids on purpose, and it makes the card depend on a third party at runtime.

### A bundler

* Good, because tree shaking would drop unused three.js code.
* Bad, because it reverses [ADR 0002](0002-native-node-and-single-writer-storage.md) for one feature and adds a build step every contributor runs.

## More Information

* Card Forge prototype and its shader contracts: working documents outside the repository.
* Card contract P2b–P4 addendum (grade, condition, sets): proposed Ploeg work; Ploeg sends `grade` and `condition` as null today.
* 2026-10-01: proposed with the forge skin, the vendored three.js 0.165.0 and the proxy's grade and condition implemented on the Vloer side.
* 2026-10-01: [ADR 0031](0031-card-themes-a-card-designer-and-generated-art.md) lets a theme choose the forge's frame (classic, full art, slab), default foil pattern, art (a preset, a shader or an uploaded image or video), set symbol, card back and frame colours. A theme's pattern yields to a pack pull. `frontShader` moved to `front-shader.js` so the designer's compiler can build it.
* 2026-10-02: [ADR 0034](0034-run-cards-show-rarity-as-frame-metal-and-a-set-symbol-and-reveal-it-once-at-release.md) gives the frame band the rarity's metal through new front-shader uniforms, fills the set symbol in the tier's colour and prints the tier on the type line; the proxy now passes a contract rarity through.
