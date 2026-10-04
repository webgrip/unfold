---
status: accepted
date: 2026-10-01
decision-makers: Ryan Grippeling
---

# The marketing site releases and deploys on its own, outside the Unfold version

## Context and Problem Statement

The marketing site lives in `apps/site` and should go live before a domain is chosen. [ADR-0004](adr-0004-unfold-releases-one-version.md) gives everything under `apps/` one `unfold-v…` version, and an Unfold release publishes images, charts and the extension. The site ships none of those; it is static HTML served by Cloudflare. Should a site change bump the Unfold version and ride its release, or have a release of its own?

## Decision Drivers

* A copy change on the site must not publish new Ploeg and Vloer artifacts, and an Unfold release must not redeploy the site.
* A site deploy must be traceable to a tag, like every other published thing in Unfold.
* The site must be reachable before a domain exists, and must not be indexed on a temporary hostname.

## Considered Options

* A separate `unfold-site-v…` release train that deploys the site
* Deploy the site from every push to `development`, with no release
* Keep the site inside the Unfold version

## Decision Outcome

Chosen option: "A separate `unfold-site-v…` release train that deploys the site", because it keeps both release loops free of each other's artifacts while every deploy still names a version.

* [apps/site/.releaserc.cjs](../../apps/site/.releaserc.cjs) is a monorepo semantic-release train with `package-path: apps/site`, `package-name: unfold-site` and tags `unfold-site-v<version>`. `development` releases `-rc.N` candidates, like Unfold. Unfold's zero-major policy does not apply.
* Unfold's train in [apps/.releaserc.cjs](../../apps/.releaserc.cjs) never releases a commit scoped `site`, so site commits never bump `unfold-v…`. Neither train reads the other's tags, and Unfold's publication jobs accept only `unfold-v…` tags.
* A published `unfold-site-v…` release deploys `apps/site` to Cloudflare Workers Static Assets through the shared `cloudflare-deploy` workflow, through Worker routes: a candidate to `https://staging.unfoldhq.dev`, a stable release to `https://unfoldhq.dev` (on the account's `workers.dev` hostname until 2026-10-03). There is no image, chart or cluster change.
* While `SITE_URL` is a platform hostname, every page is `noindex` and `robots.txt` disallows all crawling.

### Consequences

* Good, because a site fix goes live without an Unfold release, and an Unfold release never touches the site.
* Good, because a deploy is a tagged, published release that can be redeployed from its tag.
* Bad, because contributors must scope site commits `site`; an unscoped commit that touches only `apps/site` still versions Unfold.
* Bad, because there are now two release jobs pushing version commits to `development`. The site's job runs after Unfold's, so an Unfold release failure also holds back a site release until the next push.

### Confirmation

`mise run release-check` runs [release isolation](../../scripts/release-isolation.test.cjs): the site train counts only `apps/site` commits, Unfold's train ignores `site` commits, each train reads only its own tags, and Unfold's publisher rejects `unfold-site-v…` tags. The site's own tests (`apps/site/src/config/site.test.ts`) check that a `workers.dev` URL is never indexed.

## Pros and Cons of the Options

### Deploy the site from every push to `development`, with no release

* Good, because there is no second release train.
* Bad, because a deploy names only a commit, and nothing records what went live when.

### Keep the site inside the Unfold version

* Good, because there is one version to reason about.
* Bad, because every copy change would rebuild and republish every image and chart, and every Unfold release would redeploy an unchanged site.

## More Information

* Refines [ADR-0004](adr-0004-unfold-releases-one-version.md): one Unfold version covers Vloer and Ploeg, not the marketing site.
* 2026-10-01 — Accepted. The site train and the deploy run from `on_source_change.yml` and `on_release_published.yml`; the deploy reads the `workers.dev` origin from Cloudflare and uses the org-level Cloudflare credential that the bridge publishes from OpenBao.
* 2026-10-03 — The site moves to `unfoldhq.dev`. The deploy names the origin in `site-release-tag` instead of reading the `workers.dev` subdomain from Cloudflare, and `wrangler.toml` routes `unfoldhq.dev/*` to the Worker.
* 2026-10-03 — Candidates deploy to `staging.unfoldhq.dev` and stable releases to `unfoldhq.dev`, as twente.dev does. The zone's DNS records live in `apps/site/ops/dns` and `on_dns_change.yml` applies them.
* 2026-10-04 — An Unfold release candidate now also redeploys staging, from its own tag, because the site build records the `/demo` replay and the recording is no longer committed ([ADR-0015](adr-0015-the-hosted-demo-is-a-recorded-replay-of-the-deterministic-demo.md)). Production still changes only with a stable site release. This replaces "an Unfold release must not redeploy the site". The trains stay separate: a site commit still never versions Unfold, and a site release still publishes no image, chart or extension. The staging redeploy carries site commits that did not release, such as `chore(site)`.
* 2026-10-04 — A stable site release comes from `main`. `on_source_change.yml` also runs on `main`, where only the site's release job versions: Unfold's `release` job stays limited to `development`, so promoting `development` to `main` cuts `unfold-site-vX.Y.Z` and deploys `unfoldhq.dev` without releasing Unfold. Staging gets its own EU D1 database, `unfold-site-signups-staging`; production keeps `unfold-site-signups`. After a stable release, merge `main` back into `development` so the next promotion does not conflict on `apps/site/CHANGELOG.md`.
