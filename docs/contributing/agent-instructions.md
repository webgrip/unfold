---
type: reference
audience: [contributor, agent]
owner: unfold
last_verified: 2026-10-17
verified_by: "OpenHands row measured with 18 headless OpenHands 1.16.0 runs on 2026-10-11 (VIK-2001); the hook outcome reproduced with and without a mise shim under a fresh home. Load matrix from Ploeg's adapters (apps/ploeg/pkg/harness/adapters, pkg/worker/adapters.go, task.go) and the homelab Team configuration; Claude Code rows measured with headless probes on 2.1.296 (PR #308). OpenHands, opencode and Codex rows marked inferred were read from their sources and docs, not measured. Codex app import: source-command-* folders written by the openai.chatgpt extension with external-agent-import-sync-enabled = true, checked 2026-10-17 (they stopped after setting it to false)."
---

# Agent instructions

Where each kind of knowledge about working on Unfold lives, and what each agent reads. One kind of rule has one home; a second copy is replaced with a link.

## Where each thing goes

| Content | Home |
| --- | --- |
| Commands an agent cannot guess, repository-wide traps, pointers to docs | root [`AGENTS.md`](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/AGENTS.md) (at most 400 hand-written words) |
| Rules for every webgrip repository | the block between `<!-- apm:start -->` and `<!-- apm:end -->` in the root `AGENTS.md`, compiled from [agent-standards](https://forgejo.webgrip.dev/webgrip/agent-standards); see [Shared rules and skills](#shared-rules-and-skills) |
| Rules for one application or directory | that directory's `AGENTS.md` (at most 600 words), for example `apps/unfold/`, `apps/site/`, `.forgejo/` |
| Anything that must hold every time | a test, a CI job or a hook; the file may point at it |
| Product knowledge, flows, reasons | `docs/` and the application's `docs/`, linked from `AGENTS.md` |
| Decisions | ADRs ([System decisions](../adr/index.md)) |
| Requirements for a change | an OpenSpec change under `openspec/changes/` |
| Terms | the product model, [`docs/domain/model.yaml`](../domain/model.yaml), generated into the [glossary](../reference/glossary.md) |
| A procedure needed sometimes | a skill in `.agents/skills/` |
| A procedure a person starts | a prompt in `.apm/prompts/<name>.prompt.md`, which `mise run agents-install` writes as the `/<name>` command for Claude Code and opencode; the `/opsx:*` commands are OpenSpec's own |
| Review criteria | the [review guide](review.md) |
| Facts and pitfalls Ploeg packs into a Run's brief when they match the Work Item | `knowledge/` (OKF): a short concept with tags a Work Item would use and a link to the page that owns it, never a copy of an `AGENTS.md` rule |
| One person's preferences | that person's tool configuration (`~/.claude/`, `~/.codex/`), never this repository |
| Open work | a ticket |

`CLAUDE.md` beside each `AGENTS.md` is one line, `@AGENTS.md`, so Claude Code reads the same file. Each skill in `.agents/skills` has a link in `.claude/skills` (`ln -s ../../.agents/skills/<name> .claude/skills/<name>`); a shared skill from agent-standards is a copy APM writes into both.

## Shared rules and skills

[`apm.yml`](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apm.yml) pins three [agent-standards](https://forgejo.webgrip.dev/webgrip/agent-standards) packages at one release tag: `baseline`, the rules for every webgrip repository; `secrets`, the `guard-secrets` hook and skill and the `secrets-levels` skill; and `board`, the `vikunja` MCP server through the webgrip LiteLLM gateway with the `product-owner` and `product-owner-contract` skills. `mise run agents-install` installs them and compiles the baseline into the marked block of the root `AGENTS.md`; the lockfile and every file APM writes are committed, so Ploeg and OpenHands see them without running APM.

- Never edit inside the markers, a shared skill's copy, or the hook entry APM merged into `.claude/settings.json`. Change the source in agent-standards (or the skill in ai-skills), release it, then move the `ref` in `apm.yml` and run `mise run agents-install`.
- The baseline reaches Claude Code only through `@AGENTS.md`. Its dependency targets `opencode` and `codex`, because APM would otherwise also write it to `.claude/rules` and Claude would load it twice ([why](https://forgejo.webgrip.dev/webgrip/agent-standards/src/branch/main/docs/adopting.md#why-the-baseline-skips-claudes-rules-folder)).
- `mise run agents-check` fails when a deployed file differs from `apm.lock.yaml` or the compiled block is stale. It runs in the `agents-check` job of every pull request, without blocking until 2026-11-07.
- Ploeg starts Claude Code with `disableAllHooks`, so `guard-secrets` protects interactive sessions only.
- The `vikunja` server in `.mcp.json`, `opencode.json` and `.codex/config.toml` reads its key from `LITELLM_MCP_KEY` in your environment; the files never hold it.

## Who owns a term

Ploeg owns a term when Ploeg stores it or its API names it, such as Run, Shift, Verdict and every state and code the operator API sends. Unfold owns presentation, product, billing and card terms. Unfold imports a Ploeg term in [`model.yaml`](../domain/model.yaml) instead of defining it again, and moves any product-only clause into one of its own terms, as Tenant and Client did in [#339](https://forgejo.webgrip.dev/webgrip/unfold/pulls/339). What the screen calls each Ploeg value is in [Ploeg words and screen words](../reference/ploeg-words.md), which `apps/unfold/test/ploeg-contract.test.ts` checks against Ploeg's published schemas.

## What each agent reads

| Agent | Root `AGENTS.md` | Nested `AGENTS.md` | `.agents/skills` | Repository hooks |
| --- | --- | --- | --- | --- |
| Claude Code, interactive | yes | when it reads a file under that directory | yes, through the link | `.claude/settings.json` runs |
| Claude Code under Ploeg | yes | as above | yes | none: Ploeg starts it with `disableAllHooks` |
| OpenHands under Ploeg (Unfold's Team today) | yes (probe: 6 of 6 quoted it without opening a file) | when Ploeg's brief says to read the nearest one (probe: 6 of 6 read `.forgejo/AGENTS.md` before editing a workflow) | yes, plus `.openhands/skills` (probe: 6 of 6 saw a repository skill's description) | `.openhands/hooks.json` runs before every tool call (seen in every probe run); it blocks only when the hook's `python3` starts, see below |
| opencode | yes | when it walks up from a file (inferred) | yes (inferred) | `.opencode/plugins/` run (inferred; not yet observed) |
| Codex | yes | only from the root down to the working directory | yes (inferred) | a project hook needs Codex's hook trust; not observed to run |

Ploeg starts every agent with a fresh home directory, so nothing from a person's `~/.claude` or `~/.codex` reaches a Run. It installs its own skills, `ploeg-verify-before-handoff` and `ploeg-review-against-work-item`, outside the clone.

The Codex app's external agent import (`external-agent-import-sync-enabled` under `[desktop]` in `~/.codex/config.toml`) copies each `.claude/commands/*.md` into `.agents/skills/source-command-<name>/`, and through the `.claude/skills` link Claude Code then lists every command twice. Codex reads `.agents/skills` itself and OpenSpec installs Codex's own `openspec-*` skills, so the copies are never needed: `.gitignore` keeps them out of commits, and setting the option to `false` stops them appearing.

The OpenHands row was measured on 2026-10-11 with OpenHands 1.16.0, team silver's models (DeepSeek V4.1 Flash and GLM 5.3 Flash through LiteLLM), a fresh home directory and Ploeg's own brief wording, three runs per model. A hook only blocks with exit code 2; any other failure lets the call through. In the probe the hook's `python3` resolved to a mise shim, which refuses to run without a trusted configuration under a fresh home, so the hook exited 1 and `git add -A` went through in all six runs. With the runner image's own Python (it has no mise) the same hook exits 2 and blocks. When a guard matters, run its command once in the harness's real environment, home directory and `PATH` included.

## Adding a line

Add a rule only after the same mistake happened twice, and only when no test, hook or check can enforce it. Put it in the narrowest file that covers it, with its reason in one clause. `mise run docs-check` runs [`scripts/agents-files.py`](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/scripts/agents-files.py), which checks word limits, links, named commands, the `CLAUDE.md` imports, the skills link, hidden Unicode, sentences repeated from the root file, and the `knowledge/` bundle (fields, resources, index, no copied rules). `go run ./cmd/ploeg-okf pack -title "<Work Item title>" ../../knowledge` from `apps/ploeg` shows which concepts a Work Item would receive.

A rule earns its place by changing what an agent does. Probe it before and after with headless runs on the cheapest model that shows the mistake; a rule no probe needs is removed. On 2026-10-11 the Forgejo `enabled` rule took a small model from 4 of 10 correct to 10 of 10, while a mise lockfile rule changed nothing and was dropped.
