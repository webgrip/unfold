# Site architecture

The site is a static Astro build. Every page is HTML at build time; the only JavaScript is the theme toggle and a pre-paint theme script. The toolchain comes from the Webgrip estate's shared packages (`@webgrip/tsconfig`, `@webgrip/eslint-config-astro`, `@webgrip/prettier-config` and `@webgrip/astro-site-toolkit`), pinned to the versions webgrip.nl uses, so the three Astro sites keep the same rules.

## Package manager

The site uses npm with a committed `package-lock.json`, like Vloer. The root `mise run setup` installs it with `npm ci`, and Renovate's npm manager already covers lockfiles in this repository, so no second package manager enters Glide.

## Brand seam

The brand is not decided yet. Everything that would change with it sits in three files:

| File                            | Holds                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles/brand.css`          | The colours (ink, paper, dark ground, muted, muted light, accent, accent deep, on-accent, surface), the font family and its `@font-face` rules, the wordmark weight and tracking |
| `src/components/Wordmark.astro` | The wordmark, currently the name set in the brand font                                                                                                                           |
| `src/components/Mark.astro`     | The mark, currently a placeholder SVG                                                                                                                                            |

`src/styles/tokens.css` maps semantic tokens (`--bg`, `--fg`, `--accent`, …) onto the brand values with `var()` and `color-mix()`, and components use only the semantic tokens. The favicon (`src/pages/favicon.svg.ts`) renders `Mark.astro` with the ink and accent read from `brand.css`, and `BaseHead.astro` reads the `theme-color` values and the preloaded font from the same file. `src/lib/brand.test.ts` fails if any other source file names a colour, and checks that every font `brand.css` loads ships in `public/fonts` with its licence.

The current values are the estate's neutral family colours and the Archivo face Vloer already ships (width 110, weights 400 to 800). The accent is a placeholder teal. On the light ground, small accent text and filled buttons use the deeper accent; the brighter accent is used for decoration and for everything on the dark ground.

## Light and dark

`prefers-color-scheme` sets the default and `[data-theme]` on the root overrides it in both directions, so the dark palette is declared twice in `tokens.css`. `src/lib/tokens.test.ts` asserts both blocks declare the same tokens. The pre-paint script in `BaseLayout.astro` applies a stored choice before first paint. It sits above the CSP meta element, which a meta-delivered policy does not govern, so it needs no hash.

## Locales

English is the default locale at `/`; Dutch is at `/nl`. Astro's i18n routing is configured with `prefixDefaultLocale: false`. Each page is a thin file under `src/pages` that passes a locale to a shared component (`Home.astro`, `NotFound.astro`). `src/i18n/routes.ts` builds paths and the `hreflang` alternates, including `x-default` pointing at English, and `BaseHead.astro` emits them with the canonical URL, Open Graph locale tags and JSON-LD. The sitemap lists both home pages with their alternates and leaves out both 404 pages.

Copy is a typed dictionary per locale. `nl.ts` is typed against `en.ts`, and `src/i18n/dictionary.test.ts` checks at runtime that both declare the same keys and list lengths, that no entry is empty or carries emoji, and that the glossary terms keep their spelling.

## Output and security

`build.format: 'file'` writes `index.html`, `nl.html`, `404.html` and `nl/404.html`; Cloudflare's `html_handling = "auto-trailing-slash"` serves them at clean URLs, and `not_found_handling = "404-page"` serves the nearest `404.html`. `trailingSlash: 'never'` keeps canonical URLs without a trailing slash.

Stylesheets are inlined (`inlineStylesheets: 'always'`), and Vite never inlines assets as `data:` URIs (`assetsInlineLimit: 0`), because `font-src 'self'` would block an inlined font. `compressHTML` stays off: the compressor can remove the space between a text node and a following element.

Astro writes a meta CSP with a hash for every inline script and style and no `unsafe-inline`. `npm run build` ends with `webgrip-validate-csp`, which fails the build when an inline script or style below the CSP meta is not authorised by that page's policy. `public/_headers` adds the headers a meta CSP cannot carry, `frame-ancestors 'none'` among them. `lighthouserc.json` lists every indexable page, and `scripts/axe-scan.ts` scans those pages plus both 404 pages with axe.

Nothing on the site loads a third-party resource: fonts are self-hosted, and there is no analytics, telemetry, form or embed.
