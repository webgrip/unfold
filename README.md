# Unfold

Unfold turns units of work into pull requests that AI agents write and you review. A unit of work, a *Work Item*, is something you have decided to do, or a problem described well enough that a solution can be formulated or at least conceived. You assign it to an agent team. Unfold runs the agents with a budget and a credential that expires, until a pull request is ready for your review. Work can also create work: splitting a Work Item or making it ready is a job for agents too.

[Ploeg](https://github.com/ploeg-hq/ploeg) authorizes, budgets and runs every agent Run. The [Unfold application](apps/unfold/README.md) is its front end and lives here. Ploeg is developed and released in its own repository, and this repository pins one tested commit of it as a Git submodule at `apps/ploeg` ([ADR-0019](docs/adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-vloer.md)). They deploy separately. Unfold is an internal, pre-1.0 tool that is self-hosted on Kubernetes.

```sh
git clone --recurse-submodules https://forgejo.webgrip.dev/webgrip/unfold.git
cd unfold
mise trust
mise install
mise run setup
mise run verify
mise run demo-unified   # Ploeg, Unfold and PostgreSQL; deterministic, no model calls
```

`mise run demo` starts Unfold's deterministic fixture alone. The site's `/demo` page replays a recording of it in the browser. The site build records it; `mise run demo-record` records it on its own. `mise run integration` exercises the managed path without paid providers, including key minting and blocking against a local fake LiteLLM gateway.

Read the [published documentation](https://docs.webgrip.dev/glide/) or start at [docs/index.md](docs/index.md). Agents start from [AGENTS.md](AGENTS.md) and [llms.txt](llms.txt).

| Location | Contents |
| --- | --- |
| [apps/ploeg](apps/ploeg/) | Pinned [Ploeg](https://github.com/ploeg-hq/ploeg) submodule: Go controller and worker, schemas, Helm chart |
| [apps/unfold](apps/unfold/) | TypeScript front end, VS Code extension, Helm chart |
| [apps/site](apps/site/) | Static marketing site in English and Dutch; not deployed, not released |
| [docs](docs/index.md) | System explanation, how-to guides, glossary, decisions |

The import preserved both application histories and 70 namespaced tags. On 2026-10-03 Ploeg moved to its own repository, with the module `github.com/ploeg-hq/ploeg` and releases from `v0.1.0`. Unfold's history keeps Ploeg's earlier source, and the versions Unfold published for Ploeg stay published. The application's package, image and chart are now named `unfold` ([ADR-0020](docs/adr/adr-0020-unfold-is-the-application-and-the-name-vloer-is-retired.md)). The [migration record](docs/migration.md) tracks the release cutover.

Code is [Apache-2.0](LICENSE). Original notices and bundled third-party licenses remain with each application. The [Unfold](docs/brand/TRADEMARK.md) (proposed) and [Ploeg](apps/ploeg/docs/brand/TRADEMARK.md) mark policies apply. Unfold's identity is in [docs/brand](docs/brand/README.md).
