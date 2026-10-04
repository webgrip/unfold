# Deploy

The site is a static build served by a Cloudflare Worker whose code handles only `/api/*` (the sign-up form). A release candidate from `development` goes to staging at `https://staging.unfoldhq.dev` (Worker `unfold-site-staging`); a stable release goes to production at `https://unfoldhq.dev` (Worker `unfold-site`). `development` cuts only candidates, so until Unfold has a `main` branch that releases stable versions, staging is the only site that is live. It has its own release train and deploys on its own release, outside the Unfold version ([ADR-0012](../../../docs/adr/adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md)).

## How a change goes live

1. A commit scoped `site` (`feat(site): …`, `fix(site): …`) lands on `development`. Unfold's release train ignores it.
2. The site's release job runs semantic-release in `apps/site` with [.releaserc.cjs](../.releaserc.cjs). It counts only commits that touch `apps/site`, writes `apps/site/CHANGELOG.md` and publishes a `unfold-site-v<version>` release. `development` cuts `-rc.N` candidates, starting from a `unfold-site-v0.0.0` seed tag the shared release action creates on its first run.
3. The published release starts a job that deploys when the tag starts with `unfold-site-v` or is an Unfold release candidate (`unfold-v0.x.y-rc.N`): a site `-rc.N` tag and every Unfold candidate go to staging with `wrangler-env: staging`, so staging's `/demo` follows Unfold, and any other site tag goes to production. Production's `/demo` therefore changes only with a stable site release. Each calls the shared `cloudflare-deploy` workflow with `working-directory: apps/site` and a `build-command` that installs Unfold's runtime dependencies (`npm --prefix ../unfold ci --omit=dev`) and runs `pnpm run build:release`. That first checks that `wrangler.toml` has a real D1 database id and then runs `pnpm build`, which records the demo replay and assembles `/demo` before Astro builds. That workflow installs with `pnpm install --frozen-lockfile`, builds, runs `pnpm exec wrangler deploy`, then checks `/`, `/nl`, `/robots.txt`, `/sitemap-index.xml`, `/favicon.svg`, `/demo/`, `/demo/replay/replay.json`, `/privacy` and `/nl/privacy` for a 200 and a missing path for a real 404. `wrangler deploy` bundles `main` itself, so the shared workflow at `v2.7.5` needs no change for the Worker.

The jobs are `site-release` in `on_source_change.yml`, which runs after Unfold's own `release` job so the two never push a version commit at the same time, and `site-release-tag`, `site-deploy-staging` and `site-deploy-production` in `on_release_published.yml`. `scripts/workflow-policy.test.cjs` holds their routing, the tag rule and the deploy inputs.

`site-release-tag` runs on every published release and outputs `channel=prerelease` for an enabled site or Unfold candidate tag, `channel=stable` for an enabled stable site tag and `channel=none` for anything else; it is never skipped. Forgejo v15 evaluates each deploy job's `with:` when it flattens the shared workflow, and a skipped `site-release-tag` has no outputs to read, so Forgejo fails the whole run before any job starts. That is how `unfold-v0.4.0-rc.22` lost its publication (run 456).

An Unfold release candidate redeploys staging from its own tag; it never deploys production. The site at that commit carries every released site change, plus site commits that do not release, such as `chore(site)` or `docs(site)`. A site release never publishes Unfold's images, charts or extension: Unfold's publication jobs only accept `unfold-v…` tags.

## The domains

| Release                   | Worker                                                     | Address                        | Indexed |
| ------------------------- | ---------------------------------------------------------- | ------------------------------ | ------- |
| `unfold-site-vX.Y.Z-rc.N` | `unfold-site-staging` (`[env.staging]` in `wrangler.toml`) | `https://staging.unfoldhq.dev` | no      |
| `unfold-site-vX.Y.Z`      | `unfold-site` (top level of `wrangler.toml`)               | `https://unfoldhq.dev`         | yes     |

Each deploy job names its address twice: as `UNFOLD_SITE_URL` in the build command and as `apex-url` for the live checks. Each Worker has a route in `wrangler.toml` for its hostname. A route only takes traffic for a hostname that has a proxied DNS record: the apex has the record the zone came with, and `staging` gets a proxied `AAAA 100::` from the DNS config below. That address goes nowhere, which is fine because the Worker answers first.

Both Workers bind the same sign-up database. Staging is the only live site for now, so the people who sign up there are real. Give staging its own database before production goes live.

`workers_dev = true` stays on, so each Worker also answers on its `workers.dev` hostname. Those pages still canonicalise to the address the build was given.

`SITE_URL` in `src/config/site.ts` reads `UNFOLD_SITE_URL` and falls back to `http://localhost:4321` for local builds and `mise run verify`. Every canonical URL, `hreflang` link, the sitemap, `robots.txt` and the JSON-LD derive from it. A value with a path or a trailing slash fails the build.

## DNS

The `unfoldhq.dev` zone's records live in [ops/dns/dnsconfig.js](../ops/dns/dnsconfig.js) as DNSControl config. twente.dev keeps its zone the same way; `webgrip/cloudflare` keeps only account-wide objects. `on_dns_change.yml` calls the shared `dnscontrol.yml` workflow:

- A push to `development` that changes `apps/site/ops/dns/` previews the corrections and then applies them. Merging the pull request is the review. A push that would delete a record is refused unless the commit body names it in a `DNS-Allow-Delete: <name>` line.
- Every day at 05:45 UTC it fails when the live zone differs from the config.
- Every job is skipped while the Forgejo secret `CLOUDFLARE_DNS_TOKEN` is missing.

The config declares `staging` and a 301 from `www` to the apex. It ignores the apex and `www` address records that came with the zone, so DNSControl never deletes them; production's route depends on the apex one. Any other record that Cloudflare holds and the config does not declare appears in the first preview as a deletion. Copy it into the config, or delete it with the trailer.

`CLOUDFLARE_DNS_TOKEN` is `forgejo-ci-dns`, the DNSControl token that twente.dev uses too. It needs Zone › Zone: Read, Zone › DNS: Edit and Zone › Single Redirect: Edit on `unfoldhq.dev`. It lives in OpenBao `secret/cloudflare/dnscontrol`, and the `forgejo-actions-secrets` bridge in `webgrip/homelab-cluster` publishes it hourly to each repository listed in `CLOUDFLARE_DNS_REPOS`. It is not the deploy token.

## No indexing outside production

`SITE_INDEXABLE` in `src/config/site.ts` is false while `SITE_URL` ends in `.workers.dev` or `.pages.dev`, starts with `staging.`, or is a local host. Then every page carries `noindex, nofollow` and `robots.txt` answers `Disallow: /`; the sitemap still builds. `src/config/site.test.ts` holds the rule. Only the production build, with `https://unfoldhq.dev`, is indexable.

## The `/demo` replay

`pnpm build` first runs Unfold's [recorder](../../unfold/scripts/record-replay.ts), which writes `replay/` (ignored by Git), then [scripts/build-demo.mjs](../scripts/build-demo.mjs). That copies `apps/unfold/public` from the same checkout and the recording into `public/demo/`, which Git also ignores, and writes `public/demo/index.html` from Unfold's own `index.html` with a meta CSP, `noindex, nofollow` and the replay banner outside `#app` ([ADR-0015](../../../docs/adr/adr-0015-the-hosted-demo-is-a-recorded-replay-of-the-deterministic-demo.md)). The shared deploy workflow checks out the whole repository, so `../unfold` is there. The recorder fails when Unfold's browser code calls an API path the replay neither answers nor refuses, and the build fails when a file in `apps/unfold/public` no longer matches the sha256 in `replay/manifest.json`. `/demo` is not an Astro page, so it is never in the sitemap.

The site train counts only commits under `apps/site`, so an Unfold change alone never releases the site. Instead, every Unfold release candidate redeploys staging, so staging's `/demo` shows the application from the latest Unfold candidate, and production's `/demo` the application at the latest stable site release. An Unfold change on `development` that has not been released yet is not on `/demo`. The banner names the commit the replay was recorded at.

## Credentials

The deploy uses the org-level Forgejo Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, the same ones twente.dev and webgrip.nl deploy with. Nobody adds them to this repository. Their source is OpenBao `secret/cloudflare/deploy`; the `forgejo-actions-secrets` bridge in `webgrip/homelab-cluster` publishes them hourly and fails loudly when Cloudflare rejects the token, and `cloudflare-token-roller` rotates it monthly.

With no route, the token needs Account › Workers Scripts: Edit, Account › Account Settings: Read and Account › D1: Edit. The D1 permission is new with the sign-up form: the upload binds the Worker to the database by id. Cloudflare's own Workers token templates pair D1 with Edit; a narrower Read-only grant has not been tried. Reading the `workers.dev` subdomain is covered by the scripts permission. The routes need Zone › Workers Routes: Edit on the `unfoldhq.dev` zone as well. Without it, wrangler uploads the Worker and then fails to bind the route.

When Cloudflare answers 401 the token itself is rejected, and a 403 on the route means it lacks Workers Routes on the zone: fix either in OpenBao, not in this repository.

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

After the first deploy, sign up on `https://staging.unfoldhq.dev` and read it back:

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

## Changing a domain

1. Change the address in the deploy job (`build-command` and `apex-url`) and its expectation in `scripts/workflow-policy.test.cjs`.
2. Change the route in `wrangler.toml`. The top-level `routes` stays **above** the first `[table]` header, or TOML reads it as part of that table. A route needs a proxied DNS record for its hostname. A custom domain (`custom_domain = true`) refuses to be created while such a record exists.
3. Give the deploy token Zone › Workers Routes: Edit on the new zone, and add the record to the DNS config if the zone is new.
4. Only then consider `workers_dev = false`. **`workers_dev = false` without a route is a green deploy and a dead site**: nothing binds a hostname, so every request fails.

## Follow-ups

- Preview deploys for pull requests (`environment: preview`). Left out for now: a preview upload on every pull request, including ones that never touch the site, is cost and noise without a reviewer asking for it.
- An Open Graph image; the pages declare a `summary` card without one.
- A double opt-in mail for sign-ups. The form stores consent but sends nothing; the first mail to the list is written by hand.
- Lighthouse budgets in CI. `lighthouserc.json` exists, but its SEO assertion fails while every page is `noindex`.
