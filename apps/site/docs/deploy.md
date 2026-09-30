# Deploy

The site is a static build served by an assets-only Cloudflare Worker named `glide-site`, on the account's `workers.dev` hostname until a domain is chosen. It has its own release train and deploys on its own release, outside the Glide version ([ADR-0012](../../../docs/adr/adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md)).

## How a change goes live (intended)

1. A commit scoped `site` (`feat(site): …`, `fix(site): …`) lands on `development`. Glide's release train ignores it.
2. The site's release job runs semantic-release in `apps/site` with [.releaserc.cjs](../.releaserc.cjs). It counts only commits that touch `apps/site`, writes `apps/site/CHANGELOG.md` and publishes a `glide-site-v<version>` release. `development` cuts `-rc.N` candidates, starting from a `glide-site-v0.0.0` seed tag the shared release action creates on its first run.
3. The published release starts a job that deploys only when the tag starts with `glide-site-v`. It calls the shared `cloudflare-deploy` workflow with `working-directory: apps/site` and `build-command: pnpm build`. That workflow installs with `pnpm install --frozen-lockfile`, builds, runs `pnpm exec wrangler deploy`, then checks `/`, `/nl`, `/robots.txt`, `/sitemap-index.xml` and `/favicon.svg` for a 200 and a missing path for a real 404.

**Status:** the release config, the pnpm toolchain, `wrangler.toml` and the tests are in place. The two workflow jobs (the release job in `on_source_change.yml`, and the tag check plus the `cloudflare-deploy` call in `on_release_published.yml`) are not added yet, so nothing releases or deploys the site today.

A Glide release (`glide-v…`) never deploys the site, and a site release never publishes Glide's images, charts or extension: Glide's publication jobs only accept `glide-v…` tags.

## The hostname lives in two places

The `workers.dev` subdomain is not known yet. Both places carry the literal `SUBDOMAIN`, so `grep -rn SUBDOMAIN` finds them:

| Place                                                                                      | Value                                      |
| ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `SITE_URL` in `src/config/site.ts`                                                         | `https://glide-site.SUBDOMAIN.workers.dev` |
| `apex-url` of the deploy job in `.forgejo/workflows/on_release_published.yml` (once added) | the same origin                            |

Every canonical URL, `hreflang` link, the sitemap, `robots.txt` and the JSON-LD derive from `SITE_URL`.

## No indexing on a platform hostname

`SITE_INDEXABLE` in `src/config/site.ts` is false while `SITE_URL` ends in `.workers.dev` or `.pages.dev`. Then every page carries `noindex, nofollow` and `robots.txt` answers `Disallow: /`; the sitemap still builds. `src/config/site.test.ts` holds the rule. Setting `SITE_URL` to a real domain turns indexing on with no other change.

## What the owner provides before the first deploy

1. The account's `workers.dev` subdomain, written into both places above.
2. Forgejo Actions secrets on `webgrip/glide`: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. With no route, the token needs only Account › Workers Scripts: Edit and Account › Account Settings: Read. It needs Zone › Workers Routes: Edit once a route exists.
3. The workers.dev subdomain enabled on the account (Workers & Pages › your subdomain), if it is not already.
4. `GLIDE_RELEASES_ENABLED` set to `true`, which already gates Glide's own releases.

## Adding a domain later

1. Set `SITE_URL` to the domain and `apex-url` to the same origin. Indexing turns on by itself.
2. Add a route to `wrangler.toml`, placed **above** the first `[table]` header, or TOML reads it as part of that table:

   ```toml
   routes = [{ pattern = "example.com/*", zone_name = "example.com" }]
   ```

   A route works on a hostname that still has an old proxied DNS record; a custom domain (`custom_domain = true`) refuses to be created while one exists. The zone's DNS is managed as code in `webgrip/cloudflare`.

3. Give the API token Zone › Workers Routes: Edit on that zone. Without it, wrangler uploads the Worker and then fails to bind the route, which looks like a deploy that went through.
4. Only then consider `workers_dev = false`. **`workers_dev = false` without a route is a green deploy and a dead site**: nothing binds a hostname, so every request fails.

## Follow-ups

- Preview deploys for pull requests (`environment: preview`). Left out for now: without the Cloudflare secrets they would fail on every unrelated pull request.
- An Open Graph image; the pages declare a `summary` card without one.
- Lighthouse budgets in CI. `lighthouserc.json` exists, but its SEO assertion fails while every page is `noindex`.
