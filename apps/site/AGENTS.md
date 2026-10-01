# Unfold site

The static marketing site for Unfold, in English at `/` and Dutch at `/nl`. It is an Astro build on Cloudflare Workers Static Assets with its own `unfold-site-v…` release ([ADR-0012](../../docs/adr/adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md)). The root `AGENTS.md` applies here too. Read [docs/architecture.md](docs/architecture.md) before a non-trivial change and [docs/deploy.md](docs/deploy.md) before touching the release or deploy.

## Commands

The site uses pnpm through corepack. Run `mise exec -- corepack pnpm install --frozen-lockfile` once, then `mise exec -- corepack pnpm run <gate>` for `format:check`, `lint`, `typecheck`, `test` and `build` before delivery. `mise run verify` from the Unfold root runs the same gates. `validate:a11y` scans every page with axe after a build and needs a Chrome binary (`CHROME_PATH`). Never add a `package-lock.json`.

## Rules

- Scope every commit that touches this directory `site` (`feat(site): …`, `ci(site): …`, `build(site): …`). Unfold's train ignores that scope; an unscoped commit here bumps the Unfold version.
- Every brand value lives in `src/styles/brand.css`. The wordmark is `src/components/Wordmark.astro` and the mark is `src/components/Mark.astro`; the favicon is rendered from the mark. Nothing else names a colour, font file or logo shape; `src/lib/brand.test.ts` fails on a colour anywhere else.
- All copy lives in `src/i18n/en.ts` and `src/i18n/nl.ts`, which must declare the same keys. Use the glossary terms exactly: Work Item, Run, Shift, Role.
- State only what is true today. Anything decided but not built is labelled planned. Never invent numbers, customers, testimonials, logos, prices or benchmarks. No emoji.
- The demo is described as deterministic, with no model calls and no spend.
- The dark palette exists twice in `src/styles/tokens.css`; change both blocks or the tests fail.
- The build validates the CSP. Never add an `is:inline` or `define:vars` script below the CSP meta; the pre-paint theme script is the only inline one.
- `SITE_URL` in `src/config/site.ts` comes from `UNFOLD_SITE_URL` at build time and falls back to `http://localhost:4321`. The deploy sets it to the `workers.dev` origin Cloudflare reports. While it is a `workers.dev` or local host, every page is `noindex`. Keep `workers_dev = true` in `wrangler.toml` until a route exists: `workers_dev = false` without a route is a green deploy and a dead site.
