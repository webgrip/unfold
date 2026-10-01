---
status: proposed
date: 2026-10-01
decision-makers: Ryan Grippeling
review-by: 2026-10-31
---

# Run cards render in a card runtime with skin packs and themes

## Context and Problem Statement

The proposed Run cards feature gives every Work Item one card. The card records the change, never scores a person, and lists the Work Item's pull requests as plays. The owner has decided the unit (one card per ticket), that a Work Target chooses the card style, and that per-client themes sit on top of skins. Rarity is still open. Ploeg assembles the card from facts it stores (Ploeg ADR-0046, proposed in a parallel change) and serves it as `GET /api/v1/operator/work-items/{id}/card`. Ploeg sends facts only: no presentation and no display percentages, and an unknown value is absent or null, never zero.

Vloer has to draw that card in several looks: Vloer Native first, then other skins for other projects and themes for agency clients. The same card should later work in the marketing site, a client portal and the VS Code webview. Vloer is native ES modules with no build step and a strict Content Security Policy, `script-src 'self'; style-src 'self'`. The prototype skins inject `<style>` blocks and `style=""` attributes, and that CSP blocks both. How should Vloer render cards so that looks can vary per project and client without forking the card, while staying inside the CSP and [ADR 0024](0024-vloer-opens-on-now-with-one-vocabulary-and-one-token-system.md)'s single vocabulary and token system?

## Decision Drivers

* The CSP stays as it is. Skins ship as files and never inject style blocks or inline styles.
* One vocabulary and one token system ([ADR 0024](0024-vloer-opens-on-now-with-one-vocabulary-and-one-token-system.md)). Card states, money and dates come from `core/states.js` and `core/format.js`, and a skin draws with the design tokens, so light and dark work without extra code.
* A deterministic demo says it is one and invents no model calls or spend ([Glide ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md)).
* Unknown never reads as zero. A value Ploeg collects but did not report reads "Not reported", and a value Ploeg does not collect yet reads "Not collected yet".
* Every card shows the same facts, whatever its skin: title, state, cost, steward and ids.
* Motion helps and never harms: keyboard first, and reduced motion is honoured.
* No build step and no npm runtime dependency ([ADR 0002](0002-native-node-and-single-writer-storage.md)).

## Considered Options

* Five layers: Ploeg card data, a `<glide-card>` Web Component with shadow DOM, skin packs, declarative themes and a shared effects director
* Draw the card as string markup in `ploeg.js`, like the rest of the Work Item page, and restyle it per project with classes
* Port the prototype skins as they are and relax the CSP to allow inline styles

## Decision Outcome

Chosen option: "Five layers", because each look becomes a folder of files that the strict CSP allows, the card's facts and accessibility live once in the runtime, and the same element can be loaded by any page that can load an ES module.

1. **Card data (Ploeg).** Vloer proxies `GET /api/ploeg/work-items/{id}/card` to Ploeg ([`src/ploeg.ts`](../../src/ploeg.ts) `card`), like the other operator reads. It checks the caller's Team scope against the card's `team` and validates every field: known fields only, bounded lists, safe links, and an allowlist of event detail keys. It keeps absent values absent and accepts `schemaVersion` `1` or `"1.0"`. P1 always passes `rarity`, `grade` and `condition` as null and `finish` as `matte`, whatever Ploeg sends. A skin name that is not a plain folder name falls back to `vloer-native`. A play the forge has not described yet has no state and reads "In review". In the demo, [`src/ploeg-demo.ts`](../../src/ploeg-demo.ts) derives a card from each demo Work Item. The demo card has `demo: true`, cost status `not_reported`, and no cost, token, turn or tool-call figure.
2. **Runtime.** [`public/cards/glide-card.js`](../../public/cards/glide-card.js) defines `<glide-card>`. A page sets the card object on its `card` property. The element renders into an open shadow root and links its own stylesheet and the skin's with `<link>` inside the shadow root. The `face` (`front` or `back`) and `tab` attributes hold the view and are reflected, and each change fires `glide-card-change`. **More info** turns the card over and moves focus to the back's heading. **Front** or Escape turns it back and returns focus to More info. The back's six tabs (Economics, Agent, Change, Review & CI, Life, Context) follow the ARIA tabs pattern, with arrow keys, Home and End. The hidden face is `inert`. The runtime adds a title, state, cost, steward or ids slot that a skin leaves out, and adds a turn control when a skin draws none. [`public/cards/card-model.js`](../../public/cards/card-model.js) turns the card into a view model with no DOM: nl-NL money with two decimals ("US$ 0,58"), compact token counts, durations, the budget share, "Not reported", "Not collected yet", and "Arrives with deploy events (P2)" for days in production. Node tests import it.
3. **Skin packs (Glide, first-party).** A skin is a folder under `public/cards/skins/<id>/` with `manifest.json` (id, name, version, runtime version, stylesheet, optional script, finishes, moments, theme tokens), `skin.css` and an optional `skin.js` that exports `render(view, { face, escape, icon, link })` and returns markup. [`public/cards/registry.js`](../../public/cards/registry.js) loads only shipped skins, checks the manifest against runtime version 1, and requires the `matte` finish. A pack without a script borrows Vloer Native's markup under its own stylesheet. The server serves `/cards/…` and `/cards/skins/<id>/…` files by a strict name pattern. **Vloer Native** is the first pack: it draws with Vloer's tokens, so light and dark follow the page, and it uses SVG attributes for the budget ring, no inline styles.
4. **Themes (agency).** A theme will be declarative JSON on top of a skin, giving colours, fonts, set symbol, logo and card back. It sets only the custom properties a skin's manifest lists in `themeTokens` (Vloer Native lists `--gc-accent`, `--gc-surface` and `--gc-radius`). A Work Target names its skin and theme in Ploeg config (`cardStyle`), and Vloer resolves them against built-in skins plus a mounted themes folder. Custom code skins load only with an explicit administrator opt-in. **None of this layer is implemented in P1.** The theme name passes through the proxy and the runtime ignores it.
5. **Effects director (Vloer).** Later, the shared light, sound and ceremony rules will live here: tiers, coalescing, takeover limits and flash safety. Skins ask for effects and never draw page-level effects. **P1 has none.** Motion stays inside the card: the turn is a 3D flip over `--duration-slower`, and hover and tab changes are colour transitions. With `prefers-reduced-motion: reduce` the turn is an opacity crossfade, with no rotation.

**On the Work Item page** ([`public/ploeg.js`](../../public/ploeg.js) `cardSectionMarkup`, [`public/views/work.js`](../../public/views/work.js)) the card sits above Rounds, and the Rounds and Runs stay as they are. Vloer reads the card alongside the Work Item detail and fails soft. A 404 (also what an older Ploeg without the route answers), an invalid card or an unreachable Ploeg leaves no card and no error. A refresh that fails keeps the last card. The page keeps the same element across live refreshes, so a card turned to its back stays turned.

The card shows no rarity, no grade and no finish other than matte, as the owner decided while rarity is open.

### Consequences

* Good, because a new look is a folder: manifest, stylesheet and optionally a script, reviewed like any other code, and the CSP does not change.
* Good, because accessibility, the required slots and the "never zero" rule live in the runtime and the view model, so a skin cannot drop the cost or invent a value.
* Good, because the element is self-contained and the same file can later be loaded by the site, a client portal or the VS Code webview.
* Bad, because the runtime imports Vloer's `core/format.js`, `core/states.js` and `core/icons.js`. A second consumer either loads those too or the modules move into a shared package; the code moves only when such a consumer exists.
* Bad, because a shadow root links two stylesheets, so the card stays hidden until both load. The page reserves the card's size, so nothing jumps.
* Bad, because the Work Item page now makes two reads per refresh, the detail and the card. Vloer caches each for five seconds.
* Bad, because an older Ploeg's 404 cannot be told apart from a missing Work Item on the card route. The page hides the card either way.
* Neutral, because the demo's illustrative diff counts are labelled demo data, and its CI reads "Not reported", the same as the review checklist above it.

### Confirmation

Proposed. The Vloer side is implemented against the contract and fixtures. It is confirmed when a live Ploeg with the card endpoint serves a card for a real Work Item and the Work Item page shows it.

In `apps/vloer`, `mise exec -- npm test` pins the decision:

* [`test/card-model.test.mjs`](../../test/card-model.test.mjs): nl-NL formatting of every front slot; the six tabs; "Not reported" and "Not collected yet" instead of zero; demo cards with no spend or usage; manifest checks and the skin fallback; Vloer Native filling the required slots, escaping hostile text, dropping unsafe links and drawing without inline styles; and the card slot above Rounds only when a card exists.
* [`test/ploeg.test.ts`](../../test/ploeg.test.ts): the proxy validates and strips the card, drops rarity, grade and condition, refuses a card for another Work Item or Team, answers 404 for an older Ploeg and 405 for writes, and serves the demo card with no spend.
* [`test/static-assets.test.ts`](../../test/static-assets.test.ts): the `/cards/` path pattern and its refusals.

`mise exec -- npm run test:browser` ([`scripts/browser/work.mjs`](../../scripts/browser/work.mjs)) opens a demo Work Item and checks that the card sits above Rounds and shows the demo cost line and "Unsigned". It checks that More info moves focus to the back, that the arrow keys change tabs, that the Life tab names the deploy events, and that Escape turns the card back without closing the Work Item. The browser check fails on any CSP violation.

Re-evaluate when a second page outside Vloer loads the card, when themes or a second skin are built, when the effects director lands, or when the owner decides rarity.

## Pros and Cons of the Options

### Draw the card as string markup in `ploeg.js`

* Good, because it matches the rest of the Work Item page and needs no custom element.
* Bad, because every skin's rules would live in Vloer's global cascade, so a client theme could restyle the page around the card.
* Bad, because the card could not be reused outside Vloer without copying the page's styles.

### Port the prototype skins and relax the CSP

* Good, because the prototype's look and motion would arrive at once.
* Bad, because `style-src 'unsafe-inline'` weakens the whole application to make one feature easier, and ADR 0024 keeps the CSP strict on purpose.
* Bad, because the prototypes rank by rarity and grade, which P1 does not show.

## More Information

* Proposed design: the Run cards system page, "Card framework" section, and the game-feel research on timing and reduced motion (sections 2.4 and 3.3). Both are working documents outside the repository.
* Card contract v1 (P1): Ploeg ADR-0046 and the operator contract define the endpoint. This record covers only how Vloer renders it.
* 2026-10-01: proposed with the Vloer side implemented against fixtures, while the Ploeg endpoint was built in parallel.
