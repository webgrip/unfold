# Glide

Glide turns units of work into pull requests that AI agents write and you review. A unit of work, a *Work Item*, is something you have decided to do, or a problem described well enough that a solution can be formulated or at least conceived. You assign it to an agent team. Glide runs the agents with a budget and a credential that expires, until a pull request is ready for your review. Work can also create work: splitting a Work Item or making it ready is a job for agents too.

[Ploeg](apps/ploeg/README.md) authorizes, budgets and runs every agent Run. [Vloer](apps/vloer/README.md) is its front end. Both live here and deploy separately. Glide is an internal, pre-1.0 tool that is self-hosted on Kubernetes.

```sh
mise trust
mise install
mise run setup
mise run verify
mise run demo-unified   # Ploeg, Vloer and PostgreSQL; deterministic, no model calls
```

`mise run demo` starts Vloer's deterministic fixture alone. `mise run integration` exercises the managed path without paid providers, including key minting and blocking against a local fake LiteLLM gateway.

Read the [published documentation](https://docs.webgrip.dev/glide/) or start at [docs/index.md](docs/index.md). Agents start from [AGENTS.md](AGENTS.md) and [llms.txt](llms.txt).

| Location | Contents |
| --- | --- |
| [apps/ploeg](apps/ploeg/) | Go controller and worker, schemas, Helm chart |
| [apps/vloer](apps/vloer/) | TypeScript front end, VS Code extension, Helm chart |
| [docs](docs/index.md) | System explanation, how-to guides, glossary, decisions |

The import preserved both application histories and 70 namespaced tags. Package, Go module, image and chart names are unchanged. The [migration record](docs/migration.md) tracks the release cutover.

Code is [Apache-2.0](LICENSE). Original notices and bundled third-party licenses remain with each application. The [Vloer](apps/vloer/docs/brand/TRADEMARK.md) and [Ploeg](apps/ploeg/docs/brand/TRADEMARK.md) mark policies apply.
