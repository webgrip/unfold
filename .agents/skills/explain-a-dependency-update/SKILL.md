---
name: explain-a-dependency-update
description: What a Renovate pull request on this repository touches and how to judge it, for the Run that explains a dependency update on the pull request (Ploeg ADR-0106) and for a person reviewing one. Where each kind of pin is used in Unfold, which generated files and lockfiles a bump leaves stale, which checks catch that, and what "worth adopting" means here. Use when explaining, reviewing or repairing a dependency update, a Renovate pull request, a lockfile or a stale generated file.
metadata:
  ploeg-tags: dependency update renovate pull request release notes lockfile
  ploeg-paths: renovate.json, mise.toml, mise.lock, apps/*/mise.toml, apps/*/package.json, apps/*/package-lock.json, apps/*/pnpm-lock.yaml, apps/*/Dockerfile, apps/unfold/ops/agent/Dockerfile, .forgejo/workflows/*.yml, apps/unfold/scripts/build-landscape.mjs
---

# Explain a dependency update in this repository

Renovate opens the pull request; a person merges it. Your explanation stands between the two. Write it for that person: what changed, what it touches here, what to check, what the new version makes possible, and what should follow as its own change.

## Where each kind of pin is used

| Pin | Lives in | What depends on it |
| --- | --- | --- |
| `opencode-ai` | `apps/unfold/ops/agent/Dockerfile` (`OPENCODE_VERSION`), `apps/unfold/mise.toml`, the `unfold-agent:<version>` tag in `apps/unfold/config/*.example.json` and `apps/unfold/docs/operations/live.md` | The agent image every workspace session runs; `scripts/probe-opencode.mjs` probes its server API without a model call. Unfold sets `OPENCODE_DISABLE_AUTOUPDATE` and `OPENCODE_DISABLE_SHARE`, so update and sharing changes upstream rarely matter here |
| `dhi.io/node`, `undici`, `brace-expansion` | `apps/unfold/ops/agent/Dockerfile` | The hardened base of the agent image and the copies patched into npm; `undici` stays below 7 and `brace-expansion` below 6 because the patch script accepts only npm's bundled major |
| `node`, `helm`, `uv`, `mise` itself | `mise.toml`, `apps/*/mise.toml`, `.forgejo/workflows/*.yml` (`mise-action` `version:`) | Every gate and every CI job. A tool bump must relock `mise.lock`; CI installs with `--locked` and fails on a stale lock |
| npm dependencies of the application | `apps/unfold/package.json`, `apps/unfold/package-lock.json` | The Unfold server, the browser app and the VS Code extension; `@types/vscode` stays below the `engines.vscode` floor |
| pnpm dependencies of the site | `apps/site/package.json`, `apps/site/pnpm-lock.yaml`, `packageManager` | The marketing site's own release train. A `packageManager` bump must relock, or `pnpm install --frozen-lockfile` fails the gate |
| `mermaid`, `marked` | `apps/unfold/scripts/build-landscape.mjs` | The landscape explorer is generated from them; a bump without `mise run landscape` fails `ploeg-docs` with `Stale landscape` |
| `harbor.webgrip.dev/webgrip/*` toolchain images, BuildKit, SBOM scanner, Playwright image | `mise.toml`, `scripts/docs-site.sh`, `.forgejo/workflows/*.yml` | The CI toolchain; the browser suite runs on the Playwright image |
| Workflow actions (`actions/checkout`, `mise-action`) | `.forgejo/workflows/*.yml` | Forgejo Actions, not GitHub Actions: read `.forgejo/AGENTS.md` before judging a workflow change |
| The Ploeg submodule | `.gitmodules`, `apps/ploeg` | The engine Unfold runs on. Its pull request never merges itself and regenerates the glossary and decision register; a term clash leaves `ploeg-glossary-conflicts.txt` |

## What to check before saying it is safe

1. The pull request's own checks. `checks` runs `mise run verify`; `ploeg-docs` checks the generated domain pages, glossary, decision register and landscape; `release-policy` and `ploeg-pin` guard the release train and the pin. Name the failing one and the file that makes it fail.
2. A stale lockfile or generated file. The fixes are `mise lock <tool>` or `mise install` for `mise.lock`, `pnpm install` in `apps/site` for its lockfile, `npm install` in `apps/unfold` for `package-lock.json`, and `mise run landscape` for the explorer.
3. Breaking changes in the release notes against the uses in the table above. A change to the OpenCode server API matters only where `apps/unfold/src/runtime/opencode.ts` or the probe calls it.
4. A security fix: say so, and that it raises the urgency of merging.

## What "worth adopting" means here

A new OpenCode capability matters when a workspace session or the probe could use it; a new Node or tooling feature matters when a gate could become simpler or faster; a new Mermaid or Marked feature matters when the landscape or the documentation would render better. Say in one sentence what would change in Unfold, or say that nothing is worth adopting.

## Follow-up work

Propose a created Work Item for each change that should land as its own pull request: a relock or regeneration the bump needs before merging, an adoption of a new capability, a bound in `renovate.json` to raise or lower, a document to update. Each description must name the file and the command that proves it is done. Do not propose preferences.
