# Site architecture

The site is a static Astro build with one small Worker for the sign-up form. Every page is HTML at build time and works without JavaScript; the scripts that exist enhance it: the theme toggle and its pre-paint script, the walkthrough player, the video's play-when-visible and the form's inline confirmation. The toolchain comes from the Webgrip estate's shared packages (`@webgrip/tsconfig`, `@webgrip/eslint-config-astro`, `@webgrip/prettier-config` and `@webgrip/astro-site-toolkit`), pinned to the versions webgrip.nl uses, so the three Astro sites keep the same rules.

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

The page shows the deterministic demo two ways, and leaves a slot for a third.

- **The walkthrough** plays `src/data/demo-timeline.json`, which `scripts/demo-timeline.ts` writes from a real run of Vloer's deterministic demo: it starts `createApplication(loadConfig(['--demo']))` in-process, creates the same session Vloer's own Run the demonstration button creates, waits for it and turns its history into events with run ids replaced by `run-1`, `run-2` and times rounded to 100 ms after the Work Item was created. `mise run site-timeline` rewrites it. `scripts/demo-timeline.ts --check` runs the demo again and fails when anything but the event offsets differs; the mask is `VOLATILE_FIELDS` in `src/lib/timeline.ts`. `mise run verify` runs the check in its `site-demo` group, so a change to the demo's shape fails until the timeline is regenerated. Every step is rendered as HTML at build time; the script only reveals the steps at their recorded offsets, once when the walkthrough scrolls into view and again from its button. Without JavaScript or under reduced motion every step is visible at once.
- **The recording** in `public/media` is written by `mise run site-video` (`scripts/record-demo-video.ts`). It starts the same demo, drives Vloer's UI with Playwright through Run the demonstration, the Changes tab and the Checks tab, and writes a VP9 webm, an H.264 mp4 and a WebP poster, with `src/data/demo-video.json` naming the files, the Vloer version and the date. It needs a local Chromium (`CHROME_PATH`, or the newest one under `~/.cache/ms-playwright`) and uses ffmpeg from `FFMPEG`, `PATH` or `uvx --from imageio-ffmpeg`; without ffmpeg it keeps the raw Playwright webm and a PNG poster. CI has no Chromium, so nothing re-records the video there; the timeline check prints a notice when the recorded Vloer version differs from `apps/vloer/package.json`, and the caption shows the version it was recorded with. The video is muted, loops, plays inline and has controls; it starts only while it is on screen and never by itself under reduced motion. `preload="none"` keeps it out of the first load.
- **The full replay** is a separate page at `/demo`. The slot in `Home.astro` (`data-slot="demo-replay"`) links to `/demo/` once the committed replay recording (`apps/site/replay/manifest.json`) exists, and says it is coming until then.

The hero animation is CSS only. Motion uses transforms and clip paths rather than opacity on text, so axe measures contrast on final colours at any moment, and every animation sits under `prefers-reduced-motion: no-preference`. Scroll reveals (`.reveal` in `global.css`) use `animation-timeline: view()` where the browser supports it and are static elsewhere.
