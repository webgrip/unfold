# Deploy

The site is a static build served by an assets-only Cloudflare Worker named `glide-site`, on the account's `workers.dev` hostname until a domain is chosen. It has its own release train and deploys on its own release, outside the Glide version ([ADR-0012](../../../docs/adr/adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md)).

## How a change goes live

1. A commit scoped `site` (`feat(site): …`, `fix(site): …`) lands on `development`. Glide's release train ignores it.
2. The site's release job runs semantic-release in `apps/site` with [.releaserc.cjs](../.releaserc.cjs). It counts only commits that touch `apps/site`, writes `apps/site/CHANGELOG.md` and publishes a `glide-site-v<version>` release. `development` cuts `-rc.N` candidates, starting from a `glide-site-v0.0.0` seed tag the shared release action creates on its first run.
3. The published release starts a job that deploys only when the tag starts with `glide-site-v`. It calls the shared `cloudflare-deploy` workflow with `working-directory: apps/site` and `build-command: pnpm build`. That workflow installs with `pnpm install --frozen-lockfile`, builds, runs `pnpm exec wrangler deploy`, then checks `/`, `/nl`, `/robots.txt`, `/sitemap-index.xml` and `/favicon.svg` for a 200 and a missing path for a real 404.

The jobs are `site-release` in `on_source_change.yml`, which runs after Glide's own `release` job so the two never push a version commit at the same time, and `site-release-tag` plus `site-deploy` in `on_release_published.yml`. `scripts/workflow-policy.test.cjs` holds their routing, the tag rule and the deploy inputs.

`site-release-tag` runs on every published release and outputs `deploy=false` for anything but an enabled `glide-site-v…` tag; it is never skipped. Forgejo v15 evaluates `site-deploy`'s `with:` when it flattens the shared workflow, and a skipped `site-release-tag` has no outputs to read, so Forgejo fails the whole run before any job starts. That is how `glide-v0.4.0-rc.22` lost its publication (run 456).

A Glide release (`glide-v…`) never deploys the site, and a site release never publishes Glide's images, charts or extension: Glide's publication jobs only accept `glide-v…` tags.

## The hostname comes from Cloudflare

Nobody writes the `workers.dev` subdomain down. `site-release-tag` asks the Cloudflare API for the account's subdomain (`GET /accounts/{account}/workers/subdomain`) and outputs `https://glide-site.<subdomain>.workers.dev`. `site-deploy` passes that origin to the build as `GLIDE_SITE_URL` and to the live checks as `apex-url`.

`SITE_URL` in `src/config/site.ts` reads `GLIDE_SITE_URL` and falls back to `http://localhost:4321` for local builds and `mise run verify`. Every canonical URL, `hreflang` link, the sitemap, `robots.txt` and the JSON-LD derive from it. A value with a path or a trailing slash fails the build.

## No indexing on a platform hostname

`SITE_INDEXABLE` in `src/config/site.ts` is false while `SITE_URL` ends in `.workers.dev` or `.pages.dev`, or is a local host. Then every page carries `noindex, nofollow` and `robots.txt` answers `Disallow: /`; the sitemap still builds. `src/config/site.test.ts` holds the rule. Setting `SITE_URL` to a real domain turns indexing on with no other change.

## Credentials

The deploy uses the org-level Forgejo Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, the same ones twente.dev and webgrip.nl deploy with. Nobody adds them to this repository. Their source is OpenBao `secret/cloudflare/deploy`; the `forgejo-actions-secrets` bridge in `webgrip/homelab-cluster` publishes them hourly and fails loudly when Cloudflare rejects the token, and `cloudflare-token-roller` rotates it monthly.

With no route, the token needs Account › Workers Scripts: Edit and Account › Account Settings: Read. Reading the `workers.dev` subdomain is covered by the scripts permission. A route needs Zone › Workers Routes: Edit on its zone as well.

Before the first deploy, check that the account has a `workers.dev` subdomain enabled (Workers & Pages › Subdomain). `site-release-tag` fails with that instruction when Cloudflare returns none. When Cloudflare answers 401 the token itself is rejected: fix it in OpenBao, not in this repository.

## Adding a domain later

1. Make the deploy pass the domain instead of the `workers.dev` origin: set `site-url` in `site-release-tag` to it. Indexing turns on by itself.
2. Add a route to `wrangler.toml`, placed **above** the first `[table]` header, or TOML reads it as part of that table:

   ```toml
   routes = [{ pattern = "example.com/*", zone_name = "example.com" }]
   ```

   A route works on a hostname that still has an old proxied DNS record; a custom domain (`custom_domain = true`) refuses to be created while one exists. The zone's DNS is managed as code in `webgrip/cloudflare`.

3. Give the API token Zone › Workers Routes: Edit on that zone. Without it, wrangler uploads the Worker and then fails to bind the route, which looks like a deploy that went through.
4. Only then consider `workers_dev = false`. **`workers_dev = false` without a route is a green deploy and a dead site**: nothing binds a hostname, so every request fails.

## Follow-ups

- Preview deploys for pull requests (`environment: preview`). Left out for now: a preview upload on every pull request, including ones that never touch the site, is cost and noise without a reviewer asking for it.
- An Open Graph image; the pages declare a `summary` card without one.
- Lighthouse budgets in CI. `lighthouserc.json` exists, but its SEO assertion fails while every page is `noindex`.
