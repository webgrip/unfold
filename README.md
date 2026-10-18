# Unfold

Unfold turns units of work into pull requests that AI agents write and you review.

You describe a *Work Item*: something you have decided to do, or a problem described well enough that a solution can be conceived. You assign it to an agent team. Unfold runs the agents with a budget and a credential that expires, until a pull request is ready for your review. Work can also create work: splitting a Work Item or making it ready is a job for agents too.

Unfold is an internal, pre-1.0 tool, self-hosted on Kubernetes.

## How it fits together

| Part | What it does | Where it lives |
| --- | --- | --- |
| **Ploeg** (Go) | Authorizes, budgets and executes every agent Run | [github.com/ploeg-hq/ploeg](https://github.com/ploeg-hq/ploeg), pinned here at [apps/ploeg](apps/ploeg/) |
| **Unfold application** (TypeScript) | Where people define, follow and review work | [apps/unfold](apps/unfold/README.md) |

Unfold runs managed work only through Ploeg ([ADR-0002](docs/adr/adr-0002-ploeg-is-the-only-engine.md)). The two deploy separately. The [glossary](docs/reference/glossary.md) defines the terms: a *Run* is one Role executing against a Work Item, and a *Shift* is the whole attempt.

## Quick start

You need [mise](https://mise.jdx.dev/). It installs every other tool at the pinned version.

```sh
git clone https://forgejo.webgrip.dev/webgrip/unfold.git
cd unfold
mise trust
mise install
mise run setup          # Ploeg's contract bundle, per-app tools, npm, pnpm and uv dependencies
mise run verify         # every gate; run it before you deliver
mise run demo-unified   # Ploeg, Unfold and PostgreSQL; deterministic, no model calls
```

Run every tool through `mise exec -- <command>`, not from your `PATH`.

## Common tasks

| Command | What it does |
| --- | --- |
| `mise run verify` | Both application gates, the site gates and the cross-application qualification |
| `mise run demo` | Unfold's deterministic fixture alone, without Ploeg or paid model calls |
| `mise run demo-unified` | Both applications and PostgreSQL with a deterministic runtime |
| `mise run integration` | The standalone and Ploeg-managed paths without paid providers, against a local fake LiteLLM gateway |
| `mise run docs-check` | Links, generated models, agent instruction files and strict TechDocs output |
| `mise run docs-build` | Build the documentation site |
| `mise tasks` | List every task |

Live-provider tests stay opt-in. The demos say they are deterministic and never invent model calls or spend.

## Working with the released Ploeg

Unfold depends on one release of [ploeg-hq/ploeg](https://github.com/ploeg-hq/ploeg) ([ADR-0039](docs/adr/adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md)). [apps/unfold/ploeg-release.json](apps/unfold/ploeg-release.json) pins Ploeg's contract bundle on GHCR by version and digest, and [apps/unfold/scripts/unified-demo/go.mod](apps/unfold/scripts/unified-demo/go.mod) pins its Go module at the same version. This repository holds no copy of Ploeg's source.

- **Empty `apps/ploeg`?** Run `mise run ploeg-contract` (part of `mise run setup`). It unpacks the pinned bundle after checking its digests. Without it, `verify` and the docs build fail. A leftover checkout of the old submodule is refused; delete it with `rm -rf apps/ploeg`.
- **Changing Ploeg:** land the change in `ploeg-hq/ploeg` and let it release. Ploeg's release then runs `scripts/consume-ploeg-release.sh` and opens one `fix(ploeg)` pull request that moves both pins; Forgejo merges it when the required checks are green, which cuts the next Unfold candidate. To move by hand, run `scripts/consume-ploeg-release.sh 0.x.y-rc.N`.
- **An Unfold change that needs the new Ploeg** goes in a separate commit with its own scope.
- **The pin check:** [scripts/ploeg-contract.py](scripts/ploeg-contract.py) `check` runs in `verify` and fails when the bundle and the Go module name different releases or `apps/ploeg` holds another bundle. In CI it also requires the registry tag to still be the pinned digest.

Before you change behavior that crosses Ploeg and Unfold, read [managed execution](docs/workflows/managed-execution.md).

## Repository layout

| Location | Contents |
| --- | --- |
| `apps/ploeg` | Ploeg's unpacked contract bundle, ignored by Git: schemas, domain model, ADRs and docs of the pinned release |
| [apps/unfold](apps/unfold/) | TypeScript front end, VS Code extension, Helm chart |
| [apps/site](apps/site/) | Static marketing site in English and Dutch; not deployed, not released |
| [docs](docs/index.md) | System explanation, how-to guides, glossary, decisions |
| [scripts](scripts/) | Verify, release and documentation tooling |

## Contributing

- The trunk is `development`. Use [Conventional Commits](https://www.conventionalcommits.org/).
- Other sessions share this checkout. Stage only the paths you wrote, and never run `git add -A`, `git add .` or `git commit -a`.
- Read the app's own `AGENTS.md` before you change that app, for example [apps/unfold/AGENTS.md](apps/unfold/AGENTS.md).
- Production desired state lives in `webgrip/homelab-cluster`, not here.
- Agents start from [AGENTS.md](AGENTS.md) and [llms.txt](llms.txt).

## Documentation

- Published: [docs.webgrip.dev/glide](https://docs.webgrip.dev/glide/)
- In the repo: start at [docs/index.md](docs/index.md)
- Product direction: [Who Unfold is for](docs/concepts/who-unfold-is-for.md)

## History

This repository was assembled from two applications, and it preserves both histories and 70 namespaced tags. On 2026-10-03 Ploeg moved to its own repository, with the module `github.com/ploeg-hq/ploeg` and releases from `v0.1.0`. The versions of Ploeg that Unfold published before the move are still available. The [migration record](docs/migration.md) tracks the release cutover.

## License

Code is [Apache-2.0](LICENSE). Each application keeps its original notices and bundled third-party licenses. The [Unfold](docs/brand/TRADEMARK.md) (proposed) and [Ploeg](apps/ploeg/docs/brand/TRADEMARK.md) trademark policies apply. Unfold's visual identity is in [docs/brand](docs/brand/README.md).
