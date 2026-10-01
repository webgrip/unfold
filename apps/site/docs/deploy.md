# Deploy

The site is a static build served by a Cloudflare Worker named `unfold-site` whose code handles only `/api/*` (the sign-up form), on the account's `workers.dev` hostname until a domain is chosen. It has its own release train and deploys on its own release, outside the Unfold version ([ADR-0012](../../../docs/adr/adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md)).

## How a change goes live

1. A commit scoped `site` (`feat(site): …`, `fix(site): …`) lands on `development`. Unfold's release train ignores it.
2. The site's release job runs semantic-release in `apps/site` with [.releaserc.cjs](../.releaserc.cjs). It counts only commits that touch `apps/site`, writes `apps/site/CHANGELOG.md` and publishes a `unfold-site-v<version>` release. `development` cuts `-rc.N` candidates, starting from a `unfold-site-v0.0.0` seed tag the shared release action creates on its first run.
3. The published release starts a job that deploys only when the tag starts with `unfold-site-v`. It calls the shared `cloudflare-deploy` workflow with `working-directory: apps/site` and `build-command: pnpm run build:release`, which first checks that `wrangler.toml` has a real D1 database id and then runs `pnpm build`. That workflow installs with `pnpm install --frozen-lockfile`, builds, runs `pnpm exec wrangler deploy`, then checks `/`, `/nl`, `/robots.txt`, `/sitemap-index.xml`, `/favicon.svg`, `/privacy` and `/nl/privacy` for a 200 and a missing path for a real 404. `wrangler deploy` bundles `main` itself, so the shared workflow at `v2.7.5` needs no change for the Worker.

The jobs are `site-release` in `on_source_change.yml`, which runs after Unfold's own `release` job so the two never push a version commit at the same time, and `site-release-tag` plus `site-deploy` in `on_release_published.yml`. `scripts/workflow-policy.test.cjs` holds their routing, the tag rule and the deploy inputs.

`site-release-tag` runs on every published release and outputs `deploy=false` for anything but an enabled `unfold-site-v…` tag; it is never skipped. Forgejo v15 evaluates `site-deploy`'s `with:` when it flattens the shared workflow, and a skipped `site-release-tag` has no outputs to read, so Forgejo fails the whole run before any job starts. That is how `unfold-v0.4.0-rc.22` lost its publication (run 456).

An Unfold release (`unfold-v…`) never deploys the site, and a site release never publishes Unfold's images, charts or extension: Unfold's publication jobs only accept `unfold-v…` tags.

## The hostname comes from Cloudflare

Nobody writes the `workers.dev` subdomain down. `site-release-tag` asks the Cloudflare API for the account's subdomain (`GET /accounts/{account}/workers/subdomain`) and outputs `https://unfold-site.<subdomain>.workers.dev`. `site-deploy` passes that origin to the build as `UNFOLD_SITE_URL` and to the live checks as `apex-url`.

`SITE_URL` in `src/config/site.ts` reads `UNFOLD_SITE_URL` and falls back to `http://localhost:4321` for local builds and `mise run verify`. Every canonical URL, `hreflang` link, the sitemap, `robots.txt` and the JSON-LD derive from it. A value with a path or a trailing slash fails the build.

## No indexing on a platform hostname

`SITE_INDEXABLE` in `src/config/site.ts` is false while `SITE_URL` ends in `.workers.dev` or `.pages.dev`, or is a local host. Then every page carries `noindex, nofollow` and `robots.txt` answers `Disallow: /`; the sitemap still builds. `src/config/site.test.ts` holds the rule. Setting `SITE_URL` to a real domain turns indexing on with no other change.

## Credentials

The deploy uses the org-level Forgejo Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, the same ones twente.dev and webgrip.nl deploy with. Nobody adds them to this repository. Their source is OpenBao `secret/cloudflare/deploy`; the `forgejo-actions-secrets` bridge in `webgrip/homelab-cluster` publishes them hourly and fails loudly when Cloudflare rejects the token, and `cloudflare-token-roller` rotates it monthly.

With no route, the token needs Account › Workers Scripts: Edit, Account › Account Settings: Read and Account › D1: Edit. The D1 permission is new with the sign-up form: the upload binds the Worker to the database by id. Cloudflare's own Workers token templates pair D1 with Edit; a narrower Read-only grant has not been tried. Reading the `workers.dev` subdomain is covered by the scripts permission. A route needs Zone › Workers Routes: Edit on its zone as well.

Before the first deploy, check that the account has a `workers.dev` subdomain enabled (Workers & Pages › Subdomain). `site-release-tag` fails with that instruction when Cloudflare returns none. When Cloudflare answers 401 the token itself is rejected: fix it in OpenBao, not in this repository.

## The sign-up database

The form writes to a D1 database bound as `SIGNUPS` ([ADR-0016](../../../docs/adr/adr-0016-site-sign-ups-are-stored-in-cloudflare-d1-in-the-eu.md)). A D1 jurisdiction can only be set when a database is created, so the owner creates it once by hand. Until its id is in `wrangler.toml`, `pnpm run build:release` stops the deploy with an instruction and the previous release stays live; local builds, `mise run verify` and pull request checks do not need it.

1. From `apps/site`, with a token or `wrangler login` session that may create D1 databases on the Webgrip account, create the database in the EU jurisdiction:

   ```sh
   mise exec -- corepack pnpm exec wrangler d1 create unfold-site-signups --jurisdiction eu
   ```

   If wrangler offers to add the binding to `wrangler.toml`, decline: the binding is already there.

2. Copy the `database_id` it prints into `wrangler.toml`, replacing `PASTE-THE-EU-D1-DATABASE-ID-HERE` under `[[d1_databases]]`. This is the only place the id lives. Commit it as `fix(site): set the sign-up database id`.
3. Give the deploy token Account › D1: Edit. The token lives in OpenBao `secret/cloudflare/deploy` and `cloudflare-token-roller` in `webgrip/homelab-cluster` rotates it, so the permission is added there, not in this repository.
4. Check the database: Cloudflare's dashboard lists it under Storage & databases › D1 with the EU jurisdiction. The table does not exist until the first sign-up; the Worker creates it.

After the first deploy, sign up on the `workers.dev` page and read it back:

```sh
mise exec -- corepack pnpm exec wrangler d1 execute unfold-site-signups --remote \
  --command "select email, interest, locale, updated_at from signups order by updated_at desc"
```

To act on a withdrawal or an erasure request, delete the row:

```sh
mise exec -- corepack pnpm exec wrangler d1 execute unfold-site-signups --remote \
  --command "delete from signups where email = 'person@example.nl'"
```

The cron trigger in `wrangler.toml` deletes rows not confirmed for 24 months every night at 03:17 UTC. Locally, `pnpm exec wrangler dev` runs the Worker against a local D1 with the same binding.

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
- A double opt-in mail for sign-ups. The form stores consent but sends nothing; the first mail to the list is written by hand.
- Lighthouse budgets in CI. `lighthouserc.json` exists, but its SEO assertion fails while every page is `noindex`.
