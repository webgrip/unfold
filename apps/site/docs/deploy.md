# Deploy

The site is not deployed, on purpose. No domain has been chosen, so no workflow publishes it.

`wrangler.toml` describes the target: an assets-only Cloudflare Worker named `glide-site` that serves `./dist`. It has no `routes` entry and sets `workers_dev = false`. Deploying that file as it is succeeds and produces a dead site: without a route or custom domain nothing binds a hostname, and every request fails. Before wiring a deploy:

1. Choose the domain, then set `SITE_URL` in `src/config/site.ts`. `https://glide.webgrip.dev` is a placeholder; canonical URLs, `hreflang`, the sitemap, `robots.txt` and JSON-LD all derive from that constant.
2. Add a `routes` entry to `wrangler.toml`, above the first `[table]` header, or a custom domain once no conflicting DNS record exists. The zone's DNS is managed as code in `webgrip/cloudflare`.
3. Add a job to the root workflows that builds the site and runs `wrangler deploy` with a scoped Cloudflare token. `wrangler` is not a dependency yet; add it with the job, and call it through `npm exec`.
4. Add an Open Graph image; the pages declare a `summary` card without one until then.
