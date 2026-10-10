# Unfold brand

Status: v1, 2026-10-01. The product is named Unfold ([ADR-0013](../adr/adr-0013-the-product-is-named-unfold.md)). Ploeg keeps its own brand: [Ploeg](../../apps/ploeg/docs/brand/README.md). The Unfold application carries this brand ([ADR-0020](../adr/adr-0020-unfold-is-the-application-and-the-name-vloer-is-retired.md)); the generator also writes the mark it draws.

This page is the short reference. The full brand book, with the construction drawing, the sizes enlarged pixel by pixel, the family rules, the surfaces and the voice, is published at <https://claude.ai/artifact/TCiHS96whd4m6zbAqqppTX>. Where the two disagree, the generator wins, because it is what ships.

Every file in this directory except this page and [TRADEMARK.md](TRADEMARK.md) is generated. [`scripts/build-brand.mjs`](../../scripts/build-brand.mjs) holds the construction and writes the SVGs, `tokens.css` and the site's copy of the geometry. Run `mise run brand` after changing it. `mise run brand-check`, which `mise run verify` runs in its `brand` group, fails when a committed file differs from the generator output, when the wings overlap, when the crease is not the design gap, when a cut is not centred, or when the site's `brand.css` names a different colour.

## The mark

The Vouwvlieger, a paper plane folded from one sheet. The upper wing is the sheet, in ink. The lower wing is the fold, in the accent. The flight axis runs from the tails to the nose at 52°, so the plane always climbs.

### Construction

Five base points on a 64 × 64 grid define the plane: the nose `N` (55, 10), the wingtip `W` (8, 30), the sheet's tail `T1` (29, 41), the keel `K` (42, 56) and the fold's tail `T2` (30, 44). Each cut scales them about (32, 32.5).

1. The sheet is the triangle `N W T1`.
2. The crease is a band of constant width along the line `N T1`. The fold's edge is that line moved one gap towards `K`. Where it meets `N K` is `A1`; where it meets `K T2` is `A2`. The fold is the triangle `A1 K A2`. The nose belongs to the sheet alone, so the two shapes never meet in a point.
3. Every corner is a true arc cut inside the outline, never a stroke, so nothing grows past its outline.
4. The pair is centred on (32, 32) by its bounding box. Centring by centre of mass was tried and rejected after measuring it; `optical` stays 0.

| | Master | Favicon cut |
| --- | --- | --- |
| Scale of the base points | 1.04 | 1.2 |
| Crease | 2.75 | 4.6 |
| Corner radii: tip, wingtip and keel, tails | 1, 1.8, 1.5 | 1.5, 2.5, 2.1 |
| Bounding box | 44.03 × 44.64 | 49.39 × 50.59 |

The generator samples both outlines and confirms that the closest distance between them equals the crease within 0.005 units, that no point of one lies inside the other, and that the bounding box is centred within 0.005 units. The sheet holds about 60 % of the mark's area and the fold 40 %.

Below 32 px the master's crease falls under one pixel. The favicon cut fills more of its frame and widens the crease, so the plane still reads as two wings at 16 px.

## Colour

Ink and paper are the family's; the accent is Unfold's own. Baken is the red of the approach lights that tell a pilot they are on the glide path.

| Name | Hex | Role |
| --- | --- | --- |
| Vouw | `#141A1D` | ink: the sheet, and text on paper |
| Baken | `#D23A4E` | accent: the fold, graphics and large text |
| Baken Diep | `#CC394D` | accent for links and small text on Vel |
| Baken Nacht | `#D65162` | accent on the dark ground |
| Vel | `#F4F6F2` | paper |
| Zwerk | `#111619` | dark ground |
| Grafiet | `#5E6B66` | muted text on paper |
| Grafiet Licht | `#8C9A94` | muted text on the dark ground |

### Measured contrast (WCAG 2.1)

Text needs 4.5:1; large text and graphics need 3:1.

| Foreground | Ground | Ratio | Use |
| --- | --- | --- | --- |
| Vouw | Vel | 16.16:1 | text |
| Vel | Zwerk | 16.75:1 | text |
| Baken | Vel | 4.33:1 | graphics and large text only |
| Baken Diep | Vel | 4.53:1 | text |
| Baken Nacht | Zwerk | 4.52:1 | text |
| Baken | Zwerk | 3.87:1 | graphics and large text only |
| Grafiet | Vel | 5.12:1 | text |
| Grafiet Licht | Zwerk | 6.22:1 | text |
| white | Baken Diep | 4.93:1 | text on a filled button |
| Zwerk | Baken Nacht | 4.52:1 | text on a filled button, dark |
| Vouw | Zwerk | 1.04:1 | never |

Baken Diep and Baken Nacht clear the text threshold by a few hundredths on their own ground and on nothing darker or lighter. A surface that tints the ground towards the accent's lightness takes them below 4.5:1. The site keeps its raised dark surfaces at Zwerk for that reason.

[`tokens.css`](tokens.css) defines the eight colours as `--unfold-*` variables and swaps `--unfold-accent` and `--unfold-mark` for the dark ground, under both `prefers-color-scheme` and `data-theme`.

## Type

Archivo by Héctor Gatti and Omnibus-Type, [SIL OFL 1.1](https://openfontlicense.org/), the face Ploeg and the Unfold application use.

| Role | Setting |
| --- | --- |
| Wordmark | Archivo 800, wdth 110, tracking −1.4 %, outlined |
| Display | Archivo 800, wdth 110 |
| Heading | Archivo 700 |
| Label | Archivo 600 |
| Body | Archivo 400 |

Fallback stack: `"Archivo", "Helvetica Neue", Arial, sans-serif`.

The wordmark ships as outlines in `wordmark.svg` and the lockups. Never re-set it in a live font. The outlines are cut from the font the site already ships, `apps/site/public/fonts/archivo-latin-wght-wdth110.woff2`: instanced at `wght 800` and `wdth 110` with `fontTools.varLib.instancer`, shaped with HarfBuzz using Archivo's own kerning (`f` + `o` closes by 7 units), tracked by −14 units per letter, and written with fontTools' `SVGPathPen` at two decimals. The generator carries the result as a constant, the way the application's brand generator does, so building the brand needs neither Python nor the font. To redo it, run that pipeline through `mise exec -- uvx --from 'fonttools[woff]' --with uharfbuzz python` and replace `wordmark.d` and `wordmark.bbox`. Unlike the application's wordmark, the `l` keeps its full ascender: no glyph is altered.

## Lockups

Every measure comes from the mark's height `H`, its bounding box (44.64 units on the master).

| | Horizontal | Stacked |
| --- | --- | --- |
| Cap height of the name | 0.75 `H` | 0.6 `H` |
| Space between mark and name, ink to ink | 0.25 `H` | 0.25 `H` |
| Alignment | the cap band centred on the mark's vertical centre | the name centred under the mark |

### Clear space

Keep 0.25 `H` clear on every side of the mark or a lockup. Nothing enters it: no other logo, edge or text.

### Minimum sizes

| | Minimum |
| --- | --- |
| Mark | 16 px; use `favicon.svg` below 32 px |
| Horizontal lockup | 96 px wide |
| Stacked lockup | 64 px wide |

## Motion

The mark moves in two ways, both drawn from the same outlines: only position, rotation, scale and the fold's hinge change. [`scripts/brand-motion.js`](../../scripts/brand-motion.js) holds the motion; `mise run brand` copies it to `apps/unfold/public/core/motion.js` and `apps/site/src/brand/motion.js`, and `mise run brand-check` fails when a copy differs.

| | The sting | The pop |
| --- | --- | --- |
| What happens | The plane winds up, the fold snaps open, it flies a figure eight tilted onto the 52° flight axis with a trail of approach lights, lands on the mark with a squash and a burst of eight lights | A squash, the fold snaps open with an overshoot, the plane jiggles and twelve lights burst out; it does not move from the mark |
| Length | 1.46 s, then 1.1 s at rest before the next flight | 0.94 s |
| Where | The application's loading screen, on repeat while it loads; the screen stays up until the flight in progress lands, at most 2.5 s | Hovering over, tapping or focusing the mark or lockup in the application and on the site |

Both are spring-driven squash and stretch, so they overshoot and settle rather than ease to a stop. The trail and the burst take the fold's colour. With reduced motion requested, the mark stays still and the loading screen is never held.

Two Playwright checks cover it at desktop, tablet and three phone sizes (390, 360 and 320 px wide): `UNFOLD_BROWSER_FLOWS=brand npm run test:browser` in `apps/unfold` (the loading flight, the sidebar and phone-drawer pop, the sign-in pop, no sideways scroll, reduced motion) and `pnpm run validate:motion` in `apps/site` after a build (every mark on both home pages, no sideways scroll, reduced motion). Neither runs in `mise run verify` or CI yet, because both need a Chromium.

## Misuse

Scale the file; never redraw it.

- Do not swap the colours. The weight moves to the fold and the plane reads as falling.
- Do not close the crease. Without it the mark is a dart, not a folded sheet.
- Do not show it at rest pointing down or left. The mark always climbs. In motion it may turn, but every animation starts and ends on the drawn mark.
- Do not stretch it. Scale both axes together, or the fold changes angle.
- Do not use a family accent. Klei is Ploeg's. Unfold, the mark and the application, uses Baken only.
- Do not outline it. An outline loses the weight of the sheet and the fold.
- Do not add a gradient, a shadow or a glow. Flat colour only.
- Do not put `mark.svg` on Zwerk: Vouw on Zwerk is 1.04:1. Use `mark-night.svg`.
- Do not show Ploeg beside Unfold at the same size. Ploeg appears smaller, quieter and after the Unfold name.

## Files

```text
mark.svg                    master, Vouw and Baken, for light grounds
mark-night.svg              master, Vel and Baken Nacht, for Zwerk
mark-mono.svg               one path, currentColor
favicon.svg                 the favicon cut, Vouw and Baken, for 16 to 32 px
tile.svg                    app and avatar tile: the master at 0.72 on a Vouw rounded square
wordmark.svg                "Unfold", outlined, Vouw
lockup-horizontal.svg       plus -night and -mono
lockup-stacked.svg          plus -night
tokens.css                  colour and type tokens
TRADEMARK.md                terms for the name and mark (hand-written)
```

The generator writes one file outside this directory: `apps/site/src/brand/geometry.json`, the master and favicon paths, the outlined wordmark and the horizontal lockup's placement. The site's `Mark.astro`, `Wordmark.astro`, `Lockup.astro` and favicon route draw from it, so the site and this directory cannot drift. The site's colours stay in `apps/site/src/styles/brand.css`, which the check compares with the palette above.

Not generated yet: PNG exports and a 1200 × 630 Open Graph image.

## Name and mark

The code and these files are [Apache-2.0](../../LICENSE). The name and the mark are trademarks under [TRADEMARK.md](TRADEMARK.md), proposed in [ADR-0014](../adr/adr-0014-the-unfold-name-and-mark-are-trademarks-not-cc-licensed-artwork.md) and pending a trademark search. Archivo is not ours; its licence is in `apps/site/public/fonts/OFL.txt`.
