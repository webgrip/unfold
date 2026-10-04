# Unfold site

The marketing site for Unfold, in English at `/` and Dutch at `/nl`. It is a static Astro build on Cloudflare Workers Static Assets, plus one small Worker for the sign-up form. It has its own `unfold-site-v…` release ([ADR-0012](../../docs/adr/adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md)). The root `AGENTS.md` applies here too. Read [docs/architecture.md](docs/architecture.md) before a non-trivial change and [docs/deploy.md](docs/deploy.md) before touching the release or deploy.

## Commands

The site uses pnpm through corepack. Run `mise exec -- corepack pnpm install --frozen-lockfile` once, then `mise exec -- corepack pnpm run <gate>` for `format:check`, `lint`, `typecheck`, `test` and `build` before delivery. `mise run verify` from the Unfold root runs the same gates. `validate:a11y` scans every page with axe after a build and needs a Chrome binary (`CHROME_PATH`). Never add a `package-lock.json`.

## Rules

- Scope every commit that touches this directory `site` (`feat(site): …`, `ci(site): …`, `build(site): …`). Unfold's train ignores that scope; an unscoped commit here bumps the Unfold version.
- Every brand colour and font lives in `src/styles/brand.css`. The mark, wordmark and lockup are `src/components/Mark.astro`, `Wordmark.astro` and `Lockup.astro`, drawn from `src/brand/geometry.json`, which the root `mise run brand` generates; never edit it by hand. The favicon uses the same geometry. Nothing else names a colour, font file or logo shape; `src/lib/brand.test.ts` fails on a colour anywhere else, and `mise run brand-check` fails when `brand.css` departs from the palette in `docs/brand/README.md`.
- All copy lives in `src/i18n/en.ts` and `src/i18n/nl.ts`, which must declare the same keys. Use the glossary terms exactly: Work Item, Run, Shift, Role.
- State only what is true today. Anything decided but not built is labelled planned. Never invent numbers, customers, testimonials, logos, prices or benchmarks. No emoji.
- The demo is described as deterministic, with no model calls and no spend. The walkthrough plays `src/data/demo-timeline.json` and the video comes from `public/media`; both come from the real demo. Regenerate them with `mise run site-timeline` and `mise run site-video`, never by hand.
- Pricing on the site shows the model only, labelled planned, with no amounts, until ADR-0006's price list is published.
- The Worker entry `src/worker/index.ts` exports only its default handler. The form stores no IP address or request metadata; a change to what it stores changes the privacy pages and `PRIVACY_VERSION` in the same commit.
- The dark palette exists twice in `src/styles/tokens.css`; change both blocks or the tests fail.
- The build validates the CSP. Never add an `is:inline` or `define:vars` script below the CSP meta; the pre-paint theme script is the only inline one.
- `SITE_URL` in `src/config/site.ts` comes from `UNFOLD_SITE_URL` at build time and falls back to `http://localhost:4321`. A candidate release builds it as `https://staging.unfoldhq.dev` and a stable release as `https://unfoldhq.dev`; `wrangler.toml` routes each hostname to its own Worker. Only production is indexed. The zone's records live in `ops/dns/dnsconfig.js`; `on_dns_change.yml` only previews them and checks drift, and CI never holds a DNS write token (see `docs/deploy.md`). Never set `workers_dev = false` without a route: that is a green deploy and a dead site.
