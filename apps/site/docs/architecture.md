# Site architecture

The site is a static Astro build with one small Worker for the sign-up form. Every page is HTML at build time and works without JavaScript; the scripts that exist enhance it: the theme toggle and its pre-paint script, the Shift explorer, mobile navigation, and the form's inline confirmation. The toolchain comes from the Webgrip estate's shared packages (`@webgrip/tsconfig`, `@webgrip/eslint-config-astro`, `@webgrip/prettier-config` and `@webgrip/astro-site-toolkit`), pinned to the versions webgrip.nl uses, so the three Astro sites keep the same rules.

## Package manager

The site uses pnpm, unlike Vloer, because the shared `cloudflare-deploy` workflow installs with `pnpm install --frozen-lockfile` and runs `pnpm exec wrangler`. The pnpm version is `packageManager` in `package.json`, which corepack reads locally and in CI, so it is pinned in one place. `pnpm-workspace.yaml` allows install scripts only for esbuild (Astro's bundler) and workerd (wrangler's runtime), and holds new releases back for a day. The root `mise run setup` runs `corepack pnpm install --frozen-lockfile`, and verification runs each gate as `corepack pnpm run <gate>`. Renovate's npm manager reads `package.json` and `pnpm-lock.yaml` and updates `packageManager` too.

## Brand

The site carries Unfold's brand. The palette, the mark's construction and the rules for using them are in [docs/brand/README.md](../../../docs/brand/README.md); the terms for the name and mark are in [TRADEMARK.md](../../../docs/brand/TRADEMARK.md) (proposed).

| File                            | Holds                                                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles/brand.css`          | The colours (ink Vouw, paper Vel, dark ground Zwerk, muted Grafiet and Grafiet Licht, accent Baken, accent deep Baken Diep, accent night Baken Nacht, on-accent, surface), the font family and its `@font-face` rules |
| `src/brand/geometry.json`       | Generated: the master and favicon paths, the outlined wordmark and the horizontal lockup's placement                                                                                                                  |
| `src/components/Mark.astro`     | The mark, from the generated paths                                                                                                                                                                                    |
| `src/components/Wordmark.astro` | The wordmark, outlined from the generated path                                                                                                                                                                        |
| `src/components/Lockup.astro`   | The horizontal lockup: `Mark.astro` and `Wordmark.astro` placed by the generated lockup geometry                                                                                                                      |

`scripts/build-brand.mjs` at the Unfold root writes `src/brand/geometry.json` along with `docs/brand/`, so the site's mark and the published brand files have one source. Never edit the JSON by hand: `mise run brand` regenerates it, and the `brand` group of `mise run verify` fails when it is stale or when a colour in `brand.css` differs from the palette.

`src/styles/tokens.css` maps semantic tokens (`--bg`, `--fg`, `--accent`, …) onto the brand values with `var()` and `color-mix()`, and components use only the semantic tokens. The mark's sheet takes `--fg` and its fold `--accent-decor`, so it switches to Vel and Baken Nacht on the dark ground. The favicon (`src/pages/favicon.svg.ts`) draws the favicon cut with colours read from `brand.css`, and switches to the night colours under `prefers-color-scheme: dark`. `BaseHead.astro` reads the `theme-color` values and the preloaded font from the same file. `src/lib/brand.test.ts` fails if any other source file names a colour, and checks that every font `brand.css` loads ships in `public/fonts` with its licence.

On the light ground, accent text, links and filled buttons use Baken Diep, and Baken is for decoration. On the dark ground all of them use Baken Nacht, with Zwerk text on filled buttons. Both accents clear 4.5:1 only on their own ground, so raised surfaces in dark mode stay Zwerk rather than lightening.

## Light and dark

`prefers-color-scheme` sets the default and `[data-theme]` on the root overrides it in both directions, so the dark palette is declared twice in `tokens.css`. `src/lib/tokens.test.ts` asserts both blocks declare the same tokens. The pre-paint script in `BaseLayout.astro` applies a stored choice before first paint. It sits above the CSP meta element, which a meta-delivered policy does not govern, so it needs no hash.

## Locales

English is the default locale at `/`; Dutch is at `/nl`. Astro's i18n routing is configured with `prefixDefaultLocale: false`. Each page is a thin file under `src/pages` that passes a locale to a shared component (`Home.astro`, `NotFound.astro`). `src/i18n/routes.ts` builds paths and the `hreflang` alternates, including `x-default` pointing at English, and `BaseHead.astro` emits them with the canonical URL, Open Graph locale tags and JSON-LD. The sitemap lists both home pages with their alternates and leaves out both 404 pages.

Copy is a typed dictionary per locale. `nl.ts` is typed against `en.ts`, and `src/i18n/dictionary.test.ts` checks at runtime that both declare the same keys and list lengths, that no entry is empty or carries emoji, and that the glossary terms keep their spelling.

## Output and security

`build.format: 'file'` writes one HTML file per page and locale (`index.html`, `nl.html`, `privacy.html`, `thanks.html`, `signup-problem.html`, `404.html` and their `nl/` twins); Cloudflare's `html_handling = "auto-trailing-slash"` serves them at clean URLs, and `not_found_handling = "404-page"` serves the nearest `404.html`. `trailingSlash: 'never'` keeps canonical URLs without a trailing slash.

Stylesheets are inlined (`inlineStylesheets: 'always'`), and Vite never inlines assets as `data:` URIs (`assetsInlineLimit: 0`), because `font-src 'self'` would block an inlined font. `compressHTML` stays off: the compressor can remove the space between a text node and a following element.

Astro writes a meta CSP with a hash for every inline script and style and no `unsafe-inline`. `pnpm build` ends with `webgrip-validate-csp`, which fails the build when an inline script or style below the CSP meta is not authorised by that page's policy. `public/_headers` adds the headers a meta CSP cannot carry, `frame-ancestors 'none'` among them. `lighthouserc.json` lists every indexable page, and `scripts/axe-scan.ts` scans those pages plus the 404, thanks and problem pages with axe. The sitemap leaves out the 404, thanks and problem pages, which are `noindex`.

Deployment, releases and indexing are in [deploy](deploy.md). Nothing on the site loads a third-party resource: fonts and the demo video are self-hosted, and there is no analytics, telemetry or embed. The form posts to the site's own Worker.

## The sign-up Worker

[ADR-0016](../../../docs/adr/adr-0016-site-sign-ups-are-stored-in-cloudflare-d1-in-the-eu.md) records the decision. `wrangler.toml` points `main` at `src/worker/index.ts`, binds the assets as `ASSETS` and limits `run_worker_first` to `/api/*`, so pages never pass through code. The entry module exports only its default handler, because workerd reads every named export as an entrypoint; the routing lives in `src/worker/app.ts` and the form handling in `src/worker/signup.ts`, which the form component imports for its field names and the four interests.

`POST /api/signup` answers a plain form with a 303 to `/thanks` or `/signup-problem` in the form's locale, and a request with `Accept: application/json` with JSON. The handler creates the `signups` table if it is missing and upserts by lowercase email. It stores the email, the interest, the locale, `PRIVACY_VERSION` and the time, and nothing from the request itself; invocation logs are off in `wrangler.toml`. A filled `homepage` field (the honeypot) is answered as a success and stored nowhere. A cron trigger runs the retention job daily and deletes rows older than `SIGNUP_RETENTION_MONTHS`. `src/worker/signup.test.ts` covers the handler with a fake D1; `wrangler dev` runs it against a local D1.

The controller's details, the privacy version and the retention period are constants in `src/config/site.ts`. The privacy copy repeats them in both dictionaries, and `src/config/privacy.test.ts` fails when they drift.

## How it works, on the page

The homepage makes one recorded Shift inspectable before introducing the guardrails, architecture, experimental status, planned pricing and sign-up. Both dictionaries hold all explanatory copy; original fixture titles, commands, test names and diffs remain in their recorded language.

- `Hero.astro` presents a Work Item, implementer and reviewer evidence, and the local demo result. Its short, one-shot movement uses the generated brand mark and transforms; no essential text waits for an animation. All movement is disabled under reduced motion.
- `ShiftExplorer.astro` renders four evidence sections from the committed `src/data/demo-timeline.json`. Without JavaScript, links navigate to all four sections. With JavaScript, `shift-explorer.ts` offers direct selection, arrow-key navigation and pausable playback. Stage links preserve their fragment destination. Reduced motion keeps manual selection and removes timed playback. Playback pauses when the page is hidden, the explorer leaves view, or focus enters an evidence panel, so it cannot hide a focused code block.
- The complete event log lives in an expandable recording section. `Walkthrough.astro` renders every recorded event and its original offset without automatic playback. The timeline is generated by `mise run site-timeline`, never edited by hand; verification compares it with the real deterministic demo.
- `DemoVideo.astro` retains the real version-labelled recording, its poster and native video controls. Playback is manual, does not loop automatically and uses `preload="none"`. Regenerate the recording with `mise run site-video`; the video and timeline make no model calls and incur no spend.
- The full replay remains at `/demo/`, built from Vloer's recorded interface. Neither visiting the homepage nor opening this replay executes an agent or changes a local repository.

Ploeg's unattended worker workflow can publish pull requests. Vloer's managed candidate path does not publish them yet. The architecture diagram is a conceptual view of the components and connected services, not a claim that every component runs inside one cluster or that the accepted single-worker migration is complete.

The mobile menu uses a native disclosure. Without scripting it is in flow and the header is not sticky. With scripting it closes on section navigation or Escape. Both themes share the unchanged brand palette and geometry. The desktop composition becomes a single column on narrow screens; code blocks scroll within their own labelled regions.
