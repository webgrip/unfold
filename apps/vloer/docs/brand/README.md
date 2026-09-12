# De Vloer — brand identity

Status: v1 · 2026-09-11 · every source file lives in this directory.

A browsable version of this document is [brandbook.html](brandbook.html), with the assets
inline, the eight measured type candidates side by side and a ground you can invert. Open it
locally; it needs Google Fonts and falls back to the system stack without a network.

*Vloer* is Dutch for floor, and *de werkvloer* is where the work actually happens — the place
people stand while the machines run. The product is the shop floor of an agent estate: it
does not do the work, it carries it and gives a person somewhere to stand while they watch.
That is what the mark draws.

The assets are generated. [`scripts/build-brand.mjs`](../../scripts/build-brand.mjs) holds the
construction and writes every SVG, the token file and the PNG exports. Editing an SVG by hand
is a change that the next `npm run brand:build` discards, and `npm run brand:check` fails the
quality job when a committed file no longer matches the construction.

---

## 1. The mark

A capital **V** standing on a floor, with the floor drawn over its foot. The V is the work;
the floor is what carries it. The colour codes exactly that: the floor is ink because it
bears the load, the V is accent because it is the thing standing there.

The V's point sits **below** the floor's underside. It is set into the floor, not balanced on
top of it, and that distinction is the whole reading. A V resting on a bar is an object on a
plinth. A V whose foot goes into the bar is something standing on a ground that continues
past it.

### Construction

Everything comes from one measure: the stroke width **w = 15** on a 64 × 64 canvas.

| | Value | Derived from |
|---|---|---|
| Stroke width `w` | 15 | the measure |
| Arm ends, centreline | 17.5, 14.5 and 46.5, 14.5 | edges on 10, 7 and 54 |
| Point, centreline | 32, 49.5 | foot on 57 |
| Arm spread | 14.5 over a run of 35 | **22.5° from vertical**, a 45° apex |
| Floor | x 10, y 42, 44 × 8 | top edge one `w` above the foot |
| Envelope | 10, 7 → 54, 57 | 44 × 50, centred on (32, 32) |

```
V         M17.5 14.5L32 49.5L46.5 14.5
floor     M10 42H54V50H10Z
```

The V is a single `stroke` with `stroke-width="15"`, `stroke-linecap="round"`,
`stroke-linejoin="round"` and an explicit `fill="none"`. The floor is a filled rectangle laid
over it in ink. Draw the V first.

Five decisions that are not arbitrary:

- **22.5° arms.** 14.5 of spread over a run of 35 is 22.504° — a 45° apex, split in half. A
  narrower V closes its counter at this stroke weight; a wider one stops reading as a letter
  and starts reading as a funnel.
- **The floor's top edge at y 42** is one stroke width above the foot, which leaves 7 units of
  the V below it. Less and the V looks balanced on the bar; more and the floor reads as a belt
  across the letter rather than a ground.
- **The floor is 8 deep**, half a stroke rounded up so both of its edges land on whole units.
  7.5 would put an edge on a half and soften it at small sizes.
- **The floor never rises above y 29.9.** That is where the V's counter closes
  (49.5 − 7.5 / sin 22.5°). A floor drawn higher lets the counter show through it, and the
  mark falls apart into two blue wedges above a bar.
- **Half centrelines, whole edges.** With an odd stroke width the *edges* land on whole units
  when the centreline lands on a half. Edges are what render crisply, not centrelines.

The V's arm ends and point sit on the same coordinates as Ploeg's mark — x 17.5 and 46.5,
y 14.5 and 49.5. Set the two side by side and they share a footing and a shoulder. The
envelope here is 44 × 50 against Ploeg's 42 × 48, because an open letter needs slightly more
room than a solid one to carry the same weight.

`fill="none"` is on the stroke itself and not only on the `<svg>` element. Copy the path into
a component, a sprite or an icon set without it and you get a filled black wedge.

### One continuous path

For stamps, embroidery, print and single-colour badges, `mark-mono.svg` carries the whole mark
as one filled path — the V's stroke converted to an outline, with the floor as a second
subpath wound the same direction so `nonzero` fills their union:

```
M10.571 17.371L25.071 52.371A7.5 7.5 0 0 0 38.929 52.371L53.429 17.371A7.5 7.5 0 0 0 39.571 11.629L32 29.904L24.429 11.629A7.5 7.5 0 0 0 10.571 17.371ZM10 42V50H54V42Z
```

It is generated from the same centreline, and it renders identically to the stroked master:
at 512 px the two differ on 112 of 262,144 pixels, all of them anti-aliased edges.

### Favicon

At 16 px the master is too generously framed and its stroke too heavy in proportion.
`favicon.svg` is built separately: a fuller envelope (8, 4 → 56, 59) and a stroke that is
*lighter* relative to its height — 15 on 55 is 27.3 %, against 30 % in the master. Heavy
strokes clog at small sizes, and you compensate by thinning them relative to the frame, not
by thickening them.

| | Value |
|---|---|
| Arm ends, centreline | 15.5, 11.5 and 48.5, 11.5 |
| Point, centreline | 32, 51.5 |
| Floor | x 8, y 44, 48 × 8 |

---

## 2. Colour

Seven values. The names come from the floor.

| Name | Hex | Role |
|---|---|---|
| **Vlak** | `#15191C` | ink — the plane that carries, and text on a light ground |
| **Peil** | `#3D84E8` | accent — *vloerpeil* is the level a floor is set and checked against |
| **Peil Diep** | `#2A66D6` | accent for small text on a light ground |
| **Krijt** | `#F3F5F4` | paper |
| **Hal** | `#0F1416` | dark ground |
| **Stof** | `#5C6A6B` | muted text on light |
| **Stof Licht** | `#8B9A9A` | muted text on dark |

### Measured contrast (WCAG 2.1)

| | on Krijt | on Hal |
|---|---|---|
| Vlak | 16.15:1 · AAA | — (use Krijt) |
| Krijt | — | 16.94:1 · AAA |
| Peil | 3.39:1 · **graphic only** | 5.00:1 · AA text |
| Peil Diep | 4.83:1 · AA text | 3.51:1 · graphic only |
| Stof | 5.14:1 · AA text | — |
| Stof Licht | — | 6.35:1 · AA text |

**Peil is not a text colour on a light ground.** 3.39:1 clears the graphic threshold (3:1) and
not the text one (4.5:1). In the mark that is fine, because the mark is a graphic. For a link
or a label on Krijt, use Peil Diep. On Hal it reverses: there Peil carries text and Peil Diep
does not. [`tokens.css`](tokens.css) makes that swap automatically through `--vloer-accent`.

Peil was chosen to carry the same weight as Ploeg's Klei on both grounds — Klei measures
3.39:1 on Kalk and 4.95:1 on Nacht, Peil 3.39:1 and 5.00:1. The two products can sit in one
document with their accents at the same strength, and the hue is what tells them apart.

---

## 3. Typography

### Archivo

**Archivo**, variable, set at `wght 800` / `wdth 110`, tracking −1.4 %. Designed by Héctor Gatti /
Omnibus-Type, [SIL OFL 1.1](https://openfontlicense.org/), available through Google Fonts.

It is the face Ploeg uses, at the setting Ploeg uses. Two products in one estate get one typographic
voice; what tells them apart is the mark and the accent, not the lettering. The width axis comes along
with that decision rather than being argued for again here — Ploeg took `wdth 110` for the broad stance
it gives a blunt object, and a floor has no reason to stand narrower.

The weight still has to measure. The mark's stroke is **30.0 %** of its height, and the wordmark has to
sit just under that, because the mark is a solid object and should read slightly heavier than the text
beside it:

| Candidate | Stem as % of cap height |
|---|---|
| Space Grotesk 700 | 18.9 % — far too light |
| Manrope 800 | 18.9 % — far too light |
| Instrument Sans 700 | 21.4 % |
| Familjen Grotesk 700 | 21.5 % |
| Public Sans 800 | 23.5 % |
| Inter 800 | 23.6 % |
| Chivo 700 | 24.3 % |
| Archivo 800 / wdth 100 | 26.1 % — the same face at its default width |
| **Archivo 800 / wdth 110** | **27.5 % — chosen** |
| Chivo 800 | 27.6 % |

Measured on the Google Fonts instances by scanning a horizontal line across the `H` at 15 % below its
cap line, above the crossbar, and dividing the stem run by the cap height. The `wdth 110` instance is
cut from the variable font with `fontTools.varLib.instancer`; Google Fonts serves the same default-width
static file whichever `wdth` value you ask its CSS API for, so asking for 110 there gets you 100.
Re-run the measurement before changing this table; a different scanline gives different absolute
numbers, and only the ordering and the gaps are meaningful.

### Use

| Role | Setting |
|---|---|
| Wordmark (fixed) | Archivo 800, wdth 110, tracking −1.4 % |
| Headings | Archivo 700, wdth 110, tracking −2 % |
| Interface and labels | Archivo 500–600 |
| Body | Archivo 400, or the system stack |
| Code | any monospace; the brand does not name one |

Fallback stack: `"Archivo", "Helvetica Neue", Arial, sans-serif`.

### The workbench serves its own copy

The running application does not fetch the font from a CDN. Two `woff2` subsets of the variable
face, cut at `wdth 110`, sit in [`public/fonts/`](../../public/fonts/) with
[`OFL.txt`](../../public/fonts/OFL.txt) beside them, declared through `@font-face` in
`public/styles.css` and served by `src/http.ts`. A self-hosted workbench whose sandboxes
deliberately cannot dial out has no business depending on `fonts.gstatic.com` to render its own
interface.

Serving the font makes De Vloer a redistributor of Archivo, and SIL OFL 1.1 requires its text to
travel with it — which is what `OFL.txt` is for. `npm run license:check` fails if that file goes
missing, if either route stops being served, or if `styles.css` names Archivo without an
`@font-face` to back it.

### One departure from stock Archivo

The wordmark is not quite the word typed out. **The `l` is trimmed to the cap line.** Archivo's `l` is a
plain stem running to 724 against a cap height of 687, so in a flat-topped word like this one it breaks
the line the `D` and the `V` set, by 5.4 % of the cap. As running text that is correct and invisible; set
once, large, as a name, it reads as a fault. The stem is cut to 687 so every top in the word is flat.

Ploeg does **not** do this — its own `l` runs past the `P`. That is the one place the two wordmarks are
built differently, and it is deliberate: `Ploeg` puts the `l` immediately beside a cap and gets away with
it, while `De Vloer` sets it between a `V` and an `o` in the middle of a longer word, where the spike has
nothing to sit against.

Nothing else is touched. `V` + `l` needs no kern here — Archivo's `V` carries a 13-unit right side
bearing, so the pair opens to 62 units against 88 for `l` + `o`, which is inside the rhythm of the word.
Every pair is Archivo's own spacing plus the −1.4 % tracking.

> The wordmark in `wordmark.svg` is **converted to outlines**. No font is needed to show it and
> it does not shift when Archivo is missing. Never re-set the words in a live font and call that
> the wordmark — use the file, and remember that re-typing it would bring the long `l` back.

---

## 4. Lockups

| File | When |
|---|---|
| `lockup-horizontal.svg` | the default: README, site, slides |
| `lockup-stacked.svg` | square or narrow spaces |
| `mark.svg` | beside an existing name, or where the name is already in context |
| `mark-tile.svg` | avatar, app icon, forge org profile |
| `favicon.svg` | browser tab, 16–32 px |
| `banner.svg` | a README or page header, where the surrounding ground is not ours to choose |

### Proportions

- Wordmark cap height = **46** in mark units, against a mark height of 50. With the `l` trimmed to
  the cap line, every top in the word sits at y 11, four units under the mark's top at 7, and the
  baseline sits on the mark's foot at 57.
- Space between mark and wordmark = **15**, exactly one stroke width, measured ink to ink
  rather than to the glyph's side bearing.
- Stacked: the mark is set at **1.5×**, which puts its width at a quarter of the wordmark's.
  At 1× a mark this open reads as an afterthought above a word this long. The space between
  them is one stroke width of the mark as drawn, 22.5.

### Clearspace

Keep one stroke width clear around every lockup — 15 units against a mark height of 50, so
30 % of the height of the mark. Nothing in that margin.

### Minimum sizes

| | Minimum |
|---|---|
| Mark | 24 px (below that use `favicon.svg`) |
| Favicon | 16 px |
| Horizontal lockup | 160 px wide |
| Stacked lockup | 96 px wide |

---

## 5. What not to do

- Put `mark.svg` on Hal. Vlak against Hal is 1.05:1 and the floor disappears, leaving a
  floating V. Use `mark-reverse.svg` or `mark-currentcolor.svg`.
- Swap the two colours. The **floor is ink and the V is Peil** — that is the meaning, not
  decoration.
- Move the floor up into the V's counter. Above y 29.9 the counter shows through it.
- Change the stroke width, the 22.5° arms or the envelope. Scale the file instead.
- Set Peil as small text on a light ground. Use Peil Diep.
- Re-set the wordmark in another face, or Archivo at another weight or width.
- Rotate the mark. A floor is level; that is the only thing the word means.
- Put the mark in a gradient, a drop shadow or an outline.
- Edit anything in this directory except this document, `TRADEMARK.md` and
  `social-profile-copy.md`. The rest is built.

---

## 6. Files

```
mark.svg                      two-tone, Peil on Vlak, for light grounds
mark-reverse.svg              two-tone, Peil on Krijt, for dark grounds
mark-currentcolor.svg         theme-following: currentColor floor + var(--vloer-peil)
mark-mono.svg                 one path, currentColor
mark-black.svg / -white.svg   one path, fixed colour
mark-peil.svg                 one path, accent
mark-tile.svg                 bleeding tile, the mark at 0.75 on Vlak
favicon.svg / favicon-dark.svg  built for 16–32 px
wordmark.svg / -white.svg     "De Vloer", converted to outlines
lockup-horizontal.svg         + -white, + -mono
lockup-stacked.svg            + -white
banner.svg / banner-dark.svg  the lockup on its own ground, for READMEs and headers
tokens.css                    colour and type tokens
brandbook.html                this document, browsable, with the assets live
social-profile-copy.md        canonical descriptions and the per-platform asset table
png/                          transparent PNG exports, 512 and 1024 px high
social/                       link previews, headers, banners and the avatar
```

The generator writes one file outside this directory: [`public/favicon.svg`](../../public/favicon.svg),
the icon the running workbench serves. It is the favicon with its floor switched between Vlak and
Krijt by an embedded `prefers-color-scheme` rule, so it survives a dark browser tab. `brand:check`
covers it too.

Every SVG carries a `viewBox` and no fixed units beyond `width`/`height` — scale with CSS, or
by deleting those two attributes.

The PNGs are rendered from these SVGs by `npm run brand:social`, which also renders the icons
and social banners below. It drives the Playwright Chromium already pinned for the browser checks. Every variant is exported except
`mark-currentcolor.svg` and the `-mono` files, which have no colour outside a CSS context; use
the black and white exports for those. Change an SVG and re-render rather than editing a PNG.
They exist for the places that will not take an SVG: social platforms, slides, documents, mail.

---

## 7. Icons, social and the running site

### What the workbench serves

`npm run brand:social` writes these into `public/`, and [`src/http.ts`](../../src/http.ts) serves
each one:

| File | What it is |
|---|---|
| `favicon.svg` | the theme-aware favicon, floor switching between Vlak and Krijt |
| `favicon.ico` | 16, 32 and 48 px, PNG-in-ICO, for anything that will not take an SVG |
| `favicon-16x16.png` · `favicon-32x32.png` | PNG fallbacks |
| `apple-touch-icon.png` | 180 px, square and full-bleed — iOS applies its own corner mask |
| `android-chrome-192x192.png` · `-512x512.png` | the rounded tile, for the manifest |
| `site.webmanifest` | name, icons, `theme_color` Vlak, `background_color` Krijt |
| `og-image.png` | 1200 × 630 link preview, declared in `index.html` |

`index.html` carries the Open Graph and Twitter card tags that point at `og-image.png`. Changing
the tagline means changing it in `scripts/build-brand.mjs`, re-rendering, and updating the meta
description to match.

### Social banners

Named for the platform and the nominal size, rendered at twice it, in `social/`. The
composition is always the same: the lockup and a line of copy standing on a Peil floor line
near the foot of the frame. The list and the per-platform guidance are in
[social-profile-copy.md](social-profile-copy.md), together with the canonical descriptions —
use those rather than writing a new bio per platform.

### The application's own palette

[`public/styles.css`](../../public/styles.css) declares the brand values at `:root` and maps
them onto the roles the interface uses:

| Role | Token | Value |
|---|---|---|
| Body text, headings | `--ink` | Vlak |
| Muted text | `--muted` | Stof |
| Page ground | `--paper` | Krijt |
| Sidebar | `--nav` | Hal |
| Buttons, links | `--accent` | Peil Diep — carries white text at 5.29:1 |
| Focus rings, selection, indicators | `--accent-graphic` | Peil — graphic weight, 3.39:1 |
| Button hover | `--accent-hover` | `#1F51AC` |
| Success | `--ok` | `#1C7A55` |

Interactive elements take **Peil Diep**, because Peil does not carry white text. Anything purely
graphic — a focus ring, a selected-row bar, a tab underline — takes **Peil**. Status tints for
warning and error are deliberately outside the brand palette: they encode meaning, and the
accent has to stay the accent.

---

## 8. Name and mark

The code is [Apache-2.0](../../LICENSE) and so are the files in this directory. §6 of that
licence grants no rights in trade names or marks, and that carve-out is deliberate.
**"De Vloer" and the mark are trademarks**, on the terms in [TRADEMARK.md](TRADEMARK.md).

Short version: reproduce the unmodified mark to refer to De Vloer — articles, talks, badges,
integration lists — without asking. What needs permission: shipping a **fork** under the name
or the mark, and any use that suggests **endorsement or affiliation**.

There is deliberately **no separate licence file under `docs/brand/`**. A Creative Commons
licence on a logo is the wrong instrument: it is irrevocable, it grants the right to *modify*
the mark, and Creative Commons itself warns that it can cost you your trademark rights. The
reasoning is in [ADR 0020](../adrs/0020-the-name-and-mark-are-trademarks.md), and
[`scripts/brand-marks.sh`](../../scripts/brand-marks.sh) holds it in CI.

**Archivo** is not ours: Héctor Gatti / Omnibus-Type, [SIL OFL 1.1](https://openfontlicense.org/).
That licence stands apart from everything above. If the font is ever shipped inside a docs
site, the OFL text belongs in the repository with it.
