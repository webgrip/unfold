---
status: proposed
date: 2026-10-01
decision-makers: Ryan Grippeling
review-by: 2026-10-31
---

# Card themes, a card designer and generated art

## Context and Problem Statement

[ADR 0026](0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md) planned themes as layer 4 of the card runtime: declarative JSON on top of a skin, a Work Target naming its skin and theme in Ploeg's `cardStyle`, and custom code skins only with an administrator's opt-in. None of it was built, and the runtime ignored the theme name. [ADR 0028](0028-the-forge-skin-renders-run-cards-in-3d-with-vendored-three-js.md) then brought the owner's Card Forge prototype into Unfold as the forge skin, but without the prototype's designer: its frames (classic, full art, slab), its choice of foil pattern and art, image and video uploads, a design library with theme JSON export, and art that Claude writes as a GPU shader, compiled in the browser with the errors sent back.

The owner wants to make his own cards and give each project or client its own design. Unfold keeps a strict Content Security Policy (`script-src 'self'; style-src 'self'`), no bundler and no production dependency ([ADR 0002](0002-native-node-and-single-writer-storage.md)); every mutation needs an authenticated identity and object authorization; and no agent workspace may hold a gateway master key. How do themes get made, stored and applied, and how does generated art reach the card without opening a hole for code or CSS?

## Decision Drivers

* A theme is data, never code: no arbitrary CSS, no script, no markup, under the unchanged CSP.
* Each skin decides what a theme may change; Unfold refuses the rest with a reason rather than dropping it.
* Ploeg's configuration owns which Work Target gets which look. Unfold stores themes and draws them, and never writes Ploeg's config.
* Making and changing themes is an administrator's decision. Every signed-in person sees themed cards.
* Generated code runs only on the GPU, and the model call uses Unfold's own small budget, never the master key. A demo makes no model call.
* Uploaded files are typed by their bytes and bounded; an SVG cannot carry script or links.

## Considered Options

* Format v1 themes in Unfold's store and an optional read-only folder, a designer page for administrators, and optional art generation through an OpenAI-compatible endpoint with a browser compile loop
* Themes only as files in a mounted folder, edited by hand, with the prototype kept as a separate tool
* Custom code skins per client, uploaded as JavaScript and CSS behind an administrator flag
* Generate art on the server: call the model and run the compile loop in Node with a headless GL library

## Decision Outcome

Chosen option: "Format v1 themes, a designer and optional generated art", because it gives the owner the prototype's designer inside Unfold, keeps a theme to an allow-listed document that the CSP and the skin manifest bound, and lets the compile loop use the same WebGL2 the card draws with.

1. **Format v1.** A theme is `{schemaVersion, id, name, extends, tokens, frame, foilPattern, art, setSymbol, cardBack, soundBank}` ([contract](../contracts/card-themes.md), [schema](../contracts/card-theme.v1.schema.json)). `extends` names a shipped skin. Each skin's manifest now lists what a theme may set: `themeTokens` and a `theme` section with `frames`, `foilPatterns`, `artPresets`, `art` kinds, `soundBanks`, `setSymbol` and `cardBack`. The forge lists its three frames, fifteen patterns, fifteen presets, all three art kinds and six tokens (adding `--forge-frame`, `--forge-accent` and `--forge-back`); Unfold Native lists its three tokens only. Token values are hex colours or whole pixel lengths. `soundBank` must stay null: no skin has sound banks until the effects director exists (proposed). [`src/card-themes.ts`](../../src/card-themes.ts) `validateTheme` is the authority; [`public/cards/themes.js`](../../public/cards/themes.js) checks every value again before the runtime uses it.
2. **Assets.** Art images and short videos, the card back, the set symbol and art shaders are uploaded raw and stored in Unfold's SQLite store by the SHA-256 of their content, within a quota (`cardThemes.assetQuotaMb`, 256 MiB). [`src/card-assets.ts`](../../src/card-assets.ts) types each file from its signature (PNG, JPEG, WebP, MP4, WebM), bounds its bytes and image size, and checks shaders against the source rules. [`src/svg-sanitize.ts`](../../src/svg-sanitize.ts) parses a set symbol against an element and attribute allow-list and stores a rebuilt copy; scripts, styles, handlers, links, external references, text and entities are refused. Assets are served with their stored type, `nosniff` and a sandboxing CSP.
3. **Storage.** Themes live in the store with every saved version kept, and a save names the version it edited, so a concurrent save answers 409. `cardThemes.directory` adds read-only themes from files, with assets referenced by file name; a refused file is listed for administrators instead of stopping Unfold.
4. **Resolution.** The runtime reads the theme that `card.style.theme` names, draws the skin the theme extends, sets the tokens the drawn skin lists on the element through the CSSOM, and passes the checked theme to the skin as `view.theme`. The forge paints the frame and accents from the tokens, lays the art window out for the frame (full art fills the face under translucent panels; slab puts the card in its grading slab), uses the theme's foil pattern unless a pack pull names one, draws a preset, the theme's shader or the uploaded texture in the art window, and paints the set symbol and the card back. A shader the GPU refuses falls back to the derived preset.
5. **Roles.** Reading themes and assets needs a sign-in. Creating, changing and deleting themes, uploading assets and generating art need the administrator role, Unfold's existing highest role; operators and viewers get 403.
6. **Designer.** `#settings/card-designer` ([`views/designer.js`](../../public/views/designer.js)) shows a live forge preview of the draft on a sample card (a demo card: no spend, "illustrative, no model calls", with a finish switch) or on a real Work Item's card, and controls for the skin, frame, foil pattern, art (preset, upload, shader), tokens, set symbol and card back. It saves and versions themes, opens older versions, exports the theme JSON and shows the `cardStyle` snippet to paste into Ploeg's configuration. Non-administrators get the preview only.
7. **Generated art.** Optional, live only, behind `cardThemes.ai`: an OpenAI-compatible base URL, a model and `keyEnv`, an `UNFOLD_` environment variable that holds a low-budget virtual key for Unfold, which `runtime.agentEnvironment` can never pass to a workspace. Unfold refuses that key when it equals `LITELLM_MASTER_KEY`, limits each administrator to `requestsPerHour`, sends the Card Forge generator template with the subject, and returns the first GLSL block with the server's rule problems ([`src/card-art.ts`](../../src/card-art.ts)). The browser compiles it with WebGL2, on its own and inside the forge's front shader, renders a probe and refuses a flat picture, and sends the compiler log back at most twice ([`art-generator.js`](../../public/cards/art-generator.js), [`art-compiler.js`](../../public/cards/skins/forge/art-compiler.js)). A shader that compiles is stored as an asset. Without the setting the designer says how to enable it and accepts a pasted shader.
8. **Custom code skins** stay unbuilt. There is no setting for them; `cardThemes` refuses unknown keys.

### Consequences

* Good, because a client's look is a short JSON document that a skin's manifest bounds, so no theme can restyle the page around the card or run code.
* Good, because the owner designs, previews and saves cards in Unfold, and the same JSON can live in a mounted folder for teams that keep themes in Git.
* Good, because generated art compiles on the same GPU path the card uses, and the server never runs, compiles or evaluates it.
* Bad, because Unfold cannot compile GLSL itself, so a shader stored through the API without the designer is checked only against the source rules; the forge falls back to a preset when it does not compile.
* Bad, because assets in SQLite grow the store file; the quota bounds it, and nothing deletes an asset that no theme uses any more.
* Bad, because the server cannot check a video's length or codec, only its bytes and signature; the designer refuses clips over 15 seconds.
* Bad, because a page with a themed card makes one more read, cached for 30 seconds.
* Neutral, because Ploeg sends only the theme's name; whether a theme exists is Unfold's, and a missing theme draws the plain skin.

### Confirmation

Proposed. Implemented in Unfold; it is confirmed when the owner designs a theme for a real project, assigns it through Ploeg's `cardStyle`, and the Work Item page draws a live card with it.

In `apps/unfold`:

* `mise exec -- npm test`: [`test/card-themes.test.ts`](../../test/card-themes.test.ts) pins the format's allow-lists (keys, tokens per skin, frames, patterns, presets, art kinds, sound banks, asset purposes), the SVG sanitizer's refusals of scripts, handlers, styles, links and external references, asset typing, size, pixel and quota limits, administrator-only writes with operators and viewers refused, versions and the 409 on a stale save, asset serving headers and ranges, read-only folder themes and their file assets, art generation against a fake endpoint (Unfold's own key, the subject, the compiler log on the retry, three attempts at most, the rate limit and gateway failures), and the settings that refuse a non-`UNFOLD_` key, an inline key, the master key and custom skins. [`test/card-themes-runtime.test.mjs`](../../test/card-themes-runtime.test.mjs) pins the manifests against the forge catalogue, skin resolution, tokens set only through the CSSOM and only when listed, the theme view, the forge's use of a theme's frame, pattern and art, the front shader for shader and uploaded art, the designer's saved document, and the generator's retry loop.
* `mise exec -- npm run test:browser` ([`scripts/browser/designer.mjs`](../../scripts/browser/designer.mjs)) designs a theme in the demo and checks that the preview follows each control, refuses a hostile SVG and a broken shader with their reasons, saves, versions and reloads it, previews it on a real Work Item and fits 390 px; then, in live mode against a fake model, generates art that fails once, retries with the compiler log and ends as the card's art.

Re-evaluate when Ploeg sends more than the theme's name, when the effects director adds sound banks, when an agency portal needs per-client theme ownership, or if an administrator asks for custom code skins.

## Pros and Cons of the Options

### Themes only as files in a mounted folder

* Good, because themes are reviewed in Git like any other configuration.
* Bad, because the owner would design in the prototype and copy JSON by hand, with no preview on a real card. Kept as an option beside the store.

### Custom code skins per client

* Good, because a client could get any look at all.
* Bad, because uploaded JavaScript runs with the operator's session under Unfold's origin; ADR 0026 allows it only with an explicit administrator opt-in, and nothing needs it yet.

### Generate art on the server

* Good, because the API alone could guarantee a shader compiles.
* Bad, because headless GL is a native dependency ([ADR 0002](0002-native-node-and-single-writer-storage.md)) and compiles on a different driver from the reader's GPU.

## More Information

* Card Forge prototype and its generator guide: working documents outside the repository; the template is copied verbatim into `src/card-art.ts`.
* 2026-10-01: proposed with format v1, theme storage and resolution, the designer and optional generated art implemented in Unfold.
* 2026-10-10: [root ADR-0030](../../../../docs/adr/adr-0030-run-cards-are-an-unfold-domain-on-top-of-ploegs-delivery-facts.md): a theme's card style is now set per repository in Unfold's `cards.rules`, not in Ploeg's `cardStyle`; themes themselves are unchanged.
