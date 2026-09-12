# Publish and recover Glide documentation

Maintain documentation in Glide and publish it at [the Glide site](https://docs.webgrip.dev/glide/). Shared guides live in [root docs](../index.md); implementation guidance stays with [Vloer](../../apps/vloer/docs/index.md) and [Ploeg](../../apps/ploeg/docs/index.md). There is no separate documentation source repository or submodule to synchronize.

## What the pipeline publishes

The [docs entry point](../../.forgejo/workflows/on_docs_change.yml) runs on documentation changes to `development` and supports a manual rerun. The shared [generator](https://forgejo.webgrip.dev/webgrip/workflows/src/tag/v2.7.1/.forgejo/workflows/techdocs-generate.yml) assembles sources, checks generated models and links, builds TechDocs and uploads its artifact. The shared [publisher](https://forgejo.webgrip.dev/webgrip/workflows/src/tag/v2.7.1/.forgejo/workflows/techdocs-deploy-docs-site.yml) builds the human site with Zensical, validates the Markdown output, creates Pagefind search, scans the complete output with gitleaks and syncs it to Garage.

The pinned builder contains Zensical 0.0.53. `mkdocs.yml` remains the configuration format; MkDocs provides the TechDocs artifact, while Zensical provides the published human pages. A failed build, output check or secret scan stops publication.

| Output | Purpose |
| --- | --- |
| [Human site](https://docs.webgrip.dev/glide/) | Shared navigation plus application pages |
| [Raw start page](https://docs.webgrip.dev/glide/index.md) | The same maintained Markdown used to render the page |
| [llms.txt](https://docs.webgrip.dev/glide/llms.txt) | A short reading index derived from the repository's [index](../../llms.txt) |
| [llms-full.txt](https://docs.webgrip.dev/glide/llms-full.txt) | The Markdown pages selected by that index, with absolute links and the source commit |
| [Source manifest](https://docs.webgrip.dev/glide/docs-sources.json) | Source commit, repository paths, output paths and source-file hashes |

Every staged Markdown page is available at its `.md` path. Structured YAML and JSON remain available alongside it. The default reading bundle stays small; research, ADRs, design history and the historical Ploeg backlog remain reachable through explicit links and are excluded from MkDocs, Zensical and Pagefind search. An LLM index helps discovery; it does not prove that a statement is current.

## Validate or publish a change

1. Edit the maintained sources and regenerate affected models as described in the [documentation policy](../documentation.md).
2. Run `mise run docs-check`. Run `mise run docs-site-check` to exercise Zensical, both machine-readable outputs, Pagefind and the secret scan in the same pinned image as CI. Docker must be running and the image available locally. Output is under `.build/` and is not committed.
3. Run `mise run verify` before delivery. Changes to workflow gates also require `mise run release-check`.
4. Push the validated change to `development` and inspect [Glide Actions](https://forgejo.webgrip.dev/webgrip/glide/actions). `GLIDE_DOCS_PUBLISH_ENABLED=true` enables the documentation publisher on this branch. The called workflow checks this gate at every step.
5. Check the live pages and machine endpoints above. Their source manifest must name the intended commit. Rerun `on_docs_change.yml` manually for a retry at the same revision.

`GLIDE_RELEASES_ENABLED` is independent and remains disabled during documentation migration. Publishing these pages does not create an application release, push a container image or deploy Vloer or Ploeg.

## Storage and credentials

The [Garage bootstrap](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/garage/garage/bootstrap/techdocs.job.yaml) provisions `docs-glide` and `docs-glide-trash`. Its scoped key is mirrored through OpenBao to the [Forgejo bridge](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/forgejo/forgejo-actions-secrets/app/forgejo-actions-secrets.cronjob.yaml), which maintains Glide's two `TECHDOCS_S3_*` secrets. The publisher writes at the bucket root; the [HTTP route](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/garage/docs-site/app/httproute.yaml) strips `/glide` when serving it.

The key can write only Glide's site and trash buckets. Credential values stay in the existing vault and bridge. Neither source control nor the documentation output contains them. The [one-time seed job](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/forgejo/forgejo-actions-secrets/app/glide-docs-secrets.job.yaml) establishes the initial repo secrets; the hourly bridge maintains them thereafter.

## Legacy URLs and recovery

The old Vloer upload in `docs-site/de-vloer` is retained. Once Glide's live checks pass, retire only the old repository's docs publisher and switch its URLs through GitOps. Shared pages need explicit redirects to their new root locations; application pages retain their relative paths under `/glide/vloer/`. Ploeg had no docs deployment workflow or reachable `/ploeg/` site to retire.

Before switching, preserve the old sitemap and all referenced local assets, with SHA-256 hashes. Verify every old sitemap URL against the new site. Use reversible HTTP 302 redirects during the cutover; the old bucket contents provide the recovery snapshot.

To recover from a bad new publication, disable `GLIDE_DOCS_PUBLISH_ENABLED`, fix or revert the source change, validate, and rerun the docs workflow after re-enabling the gate. Replacements and deletions are also retained under dated prefixes in `docs-glide-trash`. Restore through the established Garage procedure if the source cannot reproduce the needed output. To restore the old Vloer URLs, revert the redirect route in Git and let Flux reconcile; its retained upload is still present.
