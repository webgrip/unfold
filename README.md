# Glide

Vloer and Ploeg, developed together and deployed independently.

[Vloer](apps/vloer/README.md) is the human workbench for AI sessions, intervention and review. [Ploeg](apps/ploeg/README.md) authorizes and coordinates managed work. Vloer can run locally without Ploeg; managed executions retain Ploeg authority throughout their lifecycle.

```sh
mise trust
mise install
mise run setup
mise run verify
mise run demo
```

`mise run demo` starts a deterministic Vloer fixture without Ploeg or model charges. `mise run demo-unified` runs both applications with PostgreSQL; see its [prerequisites](docs/workflows/local-demo.md). Use the [published documentation](https://docs.webgrip.dev/glide/) for live setup and contracts, or read the [Markdown index](docs/index.md) in the repository. Agents can start from [llms.txt](https://docs.webgrip.dev/glide/llms.txt).

| Location | Contents |
| --- | --- |
| [apps/vloer](apps/vloer/) | TypeScript workbench, VS Code extension, service contracts and deployment |
| [apps/ploeg](apps/ploeg/) | Go controller and worker, published schemas and deployment |
| [docs](docs/index.md) | Shared product language, system explanation and cross-application workflows |

`mise run integration` qualifies both execution modes without paid providers, including managed key minting and blocking against a local fake LiteLLM gateway. `mise run docs-check` checks generated domain pages and builds TechDocs strictly; `mise run docs-build` writes the TechDocs site to `.build/site`. `mise run docs-site-check` builds and scans the Zensical publication using the pinned CI image; see [publishing and recovery](docs/operations/docs-publishing.md). Both app gates also run in the [root CI workflow](.forgejo/workflows/on_source_change.yml).

The import preserves both histories and 70 namespaced tags. Existing packages, Go module, images and charts retain their names. [The migration record](docs/migration.md) distinguishes local qualification from remote publication and production cutover.

Code is [Apache-2.0](LICENSE). Original notices and bundled third-party licenses remain with each application. The [Vloer](apps/vloer/docs/brand/TRADEMARK.md) and [Ploeg](apps/ploeg/docs/brand/TRADEMARK.md) mark policies remain applicable.
