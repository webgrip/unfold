---
status: accepted
date: 2026-10-01
decision-makers: Ryan Grippeling
---

# The marketing site releases and deploys on its own, outside the Glide version

## Context and Problem Statement

The marketing site lives in `apps/site` and should go live before a domain is chosen. [ADR-0004](adr-0004-glide-releases-one-version.md) gives everything under `apps/` one `glide-v…` version, and a Glide release publishes images, charts and the extension. The site ships none of those; it is static HTML served by Cloudflare. Should a site change bump the Glide version and ride its release, or have a release of its own?

## Decision Drivers

* A copy change on the site must not publish new Ploeg and Vloer artifacts, and a Glide release must not redeploy the site.
* A site deploy must be traceable to a tag, like every other published thing in Glide.
* The site must be reachable before a domain exists, and must not be indexed on a temporary hostname.

## Considered Options

* A separate `glide-site-v…` release train that deploys the site
* Deploy the site from every push to `development`, with no release
* Keep the site inside the Glide version

## Decision Outcome

Chosen option: "A separate `glide-site-v…` release train that deploys the site", because it keeps both release loops free of each other's artifacts while every deploy still names a version.

* [apps/site/.releaserc.cjs](../../apps/site/.releaserc.cjs) is a monorepo semantic-release train with `package-path: apps/site`, `package-name: glide-site` and tags `glide-site-v<version>`. `development` releases `-rc.N` candidates, like Glide. Glide's zero-major policy does not apply.
* Glide's train in [apps/.releaserc.cjs](../../apps/.releaserc.cjs) never releases a commit scoped `site`, so site commits never bump `glide-v…`. Neither train reads the other's tags, and Glide's publication jobs accept only `glide-v…` tags.
* A published `glide-site-v…` release deploys `apps/site` to Cloudflare Workers Static Assets through the shared `cloudflare-deploy` workflow, on the account's `workers.dev` hostname until a domain is chosen. There is no image, chart or cluster change.
* While `SITE_URL` is a platform hostname, every page is `noindex` and `robots.txt` disallows all crawling.

### Consequences

* Good, because a site fix goes live without a Glide release, and a Glide release never touches the site.
* Good, because a deploy is a tagged, published release that can be redeployed from its tag.
* Bad, because contributors must scope site commits `site`; an unscoped commit that touches only `apps/site` still versions Glide.
* Bad, because there are now two release jobs pushing version commits to `development`, and their pushes can race. The shared release action retries a rejected push.

### Confirmation

`mise run release-check` runs [release isolation](../../scripts/release-isolation.test.cjs): the site train counts only `apps/site` commits, Glide's train ignores `site` commits, each train reads only its own tags, and Glide's publisher rejects `glide-site-v…` tags. The site's own tests (`apps/site/src/config/site.test.ts`) check that a `workers.dev` URL is never indexed.

## Pros and Cons of the Options

### Deploy the site from every push to `development`, with no release

* Good, because there is no second release train.
* Bad, because a deploy names only a commit, and nothing records what went live when.

### Keep the site inside the Glide version

* Good, because there is one version to reason about.
* Bad, because every copy change would rebuild and republish every image and chart, and every Glide release would redeploy an unchanged site.

## More Information

* Refines [ADR-0004](adr-0004-glide-releases-one-version.md): one Glide version covers Vloer and Ploeg, not the marketing site.
* 2026-10-01 — Accepted. The workflow jobs that run the site train and the deploy are not wired yet; [the site's deploy guide](../../apps/site/docs/deploy.md) lists what remains.
