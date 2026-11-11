---
type: how-to
audience: [operator, contributor]
owner: unfold
last_verified: 2026-11-11
verified_by: "Checked against .github/workflows/on_docs_change.yml, ops/docs/wrangler.toml, scripts/docs.py, scripts/docs-output.py, scripts/docs-live.py, pyproject.toml and a local build of 1,743 output files; the Workers have not been deployed yet, so the live addresses were not checked"
---

# Publish and recover Unfold documentation

Maintain documentation in Unfold and publish it at [docs.unfoldhq.dev](https://docs.unfoldhq.dev/). Shared guides live in [root docs](../index.md); implementation guidance stays with [the Unfold application](../../apps/unfold/docs/index.md) and [Ploeg](../../apps/ploeg/docs/index.md). Ploeg's pages come from the contract bundle Unfold pins in `apps/ploeg`: the build unpacks it before staging, and moving the pin republishes the site. Change Ploeg's pages in [its repository](https://github.com/ploeg-hq/ploeg).

## What the pipeline publishes

[Zensical](https://zensical.org/) renders the site from `mkdocs.yml` and the staged Markdown, and [Pagefind](https://pagefind.app/) indexes it for search. `pyproject.toml` pins both, and `uv.lock` holds their hashes. `mkdocs.yml` remains the configuration format; nothing in the repository builds a Backstage TechDocs site any more.

[The docs workflow](../../.github/workflows/on_docs_change.yml) runs on documentation changes to `development` and on a manual run. Every job runs only in `unfold-hq/unfold`, so a fork or mirror never publishes. It has two jobs:

1. `build` unpacks the pinned Ploeg bundle and runs `scripts/docs.py --check`. That checks the sources, builds the site with Zensical in strict mode, validates the output with [the output check](../../scripts/docs-output.py) and indexes it with Pagefind. The job then scans the whole output with gitleaks and [its narrow allowlist](../../scripts/docs-gitleaks.toml), and uploads the site. A failed build, output check or secret scan stops publication.
2. `deploy`, on `development` only, uploads the site to the staging Worker `unfold-docs-staging` and checks it live, then uploads the same files to the production Worker `unfold-docs` and checks that too. A failed staging check leaves production as it was.

Until Unfold's move to `unfold-hq` is complete, the previous [Forgejo docs workflow](../../.forgejo/workflows/on_docs_change.yml) still runs on the old forge. The cutover removes it.

Both Workers serve static assets only, without Worker code. [ops/docs/wrangler.toml](../../ops/docs/wrangler.toml) configures them:

| Worker | Address | Configuration |
| --- | --- | --- |
| `unfold-docs` | <https://docs.unfoldhq.dev/> | top level |
| `unfold-docs-staging` | <https://docs-staging.unfoldhq.dev/> | `[env.staging]` |

Each address is a route on the `unfoldhq.dev` zone, and a route needs a proxied DNS record for its hostname. The [DNS config](../../apps/site/ops/dns/dnsconfig.js) declares `docs` and `docs-staging` as proxied `AAAA 100::`, like the site's own records ([the site's DNS guide](../../apps/site/docs/deploy.md#dns)). `workers_dev` and preview URLs are off, so the routes are the only way in. Zensical writes canonical links to `site_url`, so the staging copy points search engines at production.

| Output | Purpose |
| --- | --- |
| [Human site](https://docs.unfoldhq.dev/) | Shared navigation plus application pages |
| [Raw start page](https://docs.unfoldhq.dev/index.md) | The same maintained Markdown used to render the page |
| [llms.txt](https://docs.unfoldhq.dev/llms.txt) | A short reading index derived from the repository's [index](../../llms.txt) |
| [llms-full.txt](https://docs.unfoldhq.dev/llms-full.txt) | The Markdown pages selected by that index, with absolute links and the source commit |
| [Source manifest](https://docs.unfoldhq.dev/docs-sources.json) | Source commit, repository paths, output paths and source-file hashes |

Every staged Markdown page is available at its `.md` path. Structured YAML and JSON remain available alongside it. The default reading bundle stays small. History pages remain reachable through explicit links: research and evidence, ADR records, design baselines, planning and backlog pages, and OpenSpec. The [staging step](../../scripts/docs.py) classifies them by path in [the history rules](../../scripts/docs-rules.py). It gives each staged copy front matter `search: {exclude: true}` and a one-line banner, "Record from <date>; not current guidance." Zensical honors that front matter; the output check hides the same pages from Pagefind and fails if one reaches Zensical's search index. The source files stay unchanged. ADR index pages are the current view of each ledger and stay searchable. An LLM index helps discovery; it does not prove that a statement is current.

A local build has 1,743 files and 72 MB, well inside the Workers static-asset limits of 20,000 files per version on the free plan and 25 MiB per file.

## Validate or publish a change

1. Edit the maintained sources and regenerate affected models as described in the [documentation policy](../documentation.md).
2. Run `mise run docs-check`. Besides generated-view drift, it fails on a missing link target or heading anchor, on a current page that links through a [moved path](../research/2026-09-12-glide-document-paths.json), on a current page that is neither in the `mkdocs.yml` nav nor linked from a nav page, on an inconsistent ADR ledger (system, Ploeg or application), on a stale [decision register](../reference/decisions.md), and on a Zensical warning. Regenerate that register with `mise run docs-decisions`. The check leaves the publishable site, with its Pagefind index, in `.build/site`; `mise run docs-build` builds the same site without the checks. Output under `.build/` is not committed.
3. Run `mise run verify` before delivery.
4. Merge the change to `development` and follow the docs workflow in the repository's Actions tab.
5. The `deploy` job checks every human page and Markdown export, both search indexes and the source manifest against its checkout, first on staging and then on production. Run `mise run docs-live-check` locally for the same check against production; the checkout must match the published revision. `uv run --frozen python scripts/docs-live.py --base https://docs-staging.unfoldhq.dev/` checks staging. Rerun the workflow manually for a retry at the same revision.

Publishing these pages does not create an application release, push a container image or deploy Unfold or Ploeg.

## Credentials

The `deploy` job reads two repository secrets, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; the `build` job reads none. The token needs Account › Workers Scripts: Edit, and Zone › Workers Routes: Edit on `unfoldhq.dev`. When Cloudflare answers 401 the token itself is rejected; a 403 on a route means it lacks Workers Routes on the zone. Fix either in the secret, not in this repository.

## Recovery

To take back a bad publication, revert the source change on `development`; the workflow publishes the reverted site. To restore an earlier version without a commit, roll the Worker back in Cloudflare's dashboard (the Worker's Deployments tab) or with `wrangler rollback`, then fix the source so the next run does not undo it. Do the same for `unfold-docs-staging`.

## Legacy URLs

Before Unfold moved to `unfold-hq`, the documentation was published under a path on the owner's previous docs host, and before that by the front end's own repository. The [cutover evidence](../research/2026-09-12-docs-cutover.json) records the URL mapping from that first move; the output check still fails when one of its targets no longer exists. Redirects from the old addresses are configured where those hosts live, not in this repository.

The earlier documentation consolidation removed headings, especially from the old combined product-design book. Page redirects cannot translate URL fragments, which browsers do not send to the server. Of 1,092 distinct legacy section links checked, 256 no longer have the same heading in the maintained pages.
