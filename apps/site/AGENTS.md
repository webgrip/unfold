# Glide site

The static marketing site for Glide, in English at `/` and Dutch at `/nl`. It is an Astro build with no server and no deploy yet. The root `AGENTS.md` applies here too. Read [docs/architecture.md](docs/architecture.md) before a non-trivial change.

## Commands

Run `mise exec -- npm run format:check`, `mise exec -- npm run lint`, `mise exec -- npm run typecheck`, `mise exec -- npm test` and `mise exec -- npm run build` in this directory before delivery. `mise run verify` from the Glide root runs the same gates. `npm run validate:a11y` scans every page with axe after a build and needs a Chrome binary (`CHROME_PATH`).

## Rules

- Every brand value lives in `src/styles/brand.css`. The wordmark is `src/components/Wordmark.astro` and the mark is `src/components/Mark.astro`; the favicon is rendered from the mark. Nothing else names a colour, font file or logo shape; `src/lib/brand.test.ts` fails on a colour anywhere else.
- All copy lives in `src/i18n/en.ts` and `src/i18n/nl.ts`, which must declare the same keys. Use the glossary terms exactly: Work Item, Run, Shift, Role.
- State only what is true today. Anything decided but not built is labelled planned. Never invent numbers, customers, testimonials, logos, prices or benchmarks. No emoji.
- The demo is described as deterministic, with no model calls and no spend.
- The dark palette exists twice in `src/styles/tokens.css`; change both blocks or the tests fail.
- `npm run build` validates the CSP. Never add an `is:inline` or `define:vars` script below the CSP meta; the pre-paint theme script is the only inline one.
- `SITE_URL` in `src/config/site.ts` is a placeholder. Do not add a deploy job, a `routes` entry or a custom domain until a domain is chosen ([deploy](docs/deploy.md)).
