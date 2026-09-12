# 0004 — Portable operating procedure, explicit local contracts

Date: 2026-09-09. Status: accepted for v0.1.

## Context

Developer freedom depends on reusable operating knowledge as much as runtime choice. Copying long vendor-specific prompts into every repository increases drift and context cost. Webgrip's [ai-skills contract pattern](https://github.com/webgrip/ai-skills/blob/main/docs/contract-pattern.md) separates reusable behavior from local facts and supports several instruction clients.

## Decision

Keep a small `AGENTS.md` for repository-wide invariants. Put architecture decisions in `docs/adrs/`, integration contracts in `docs/contracts/` and evidence in `docs/research/`. Put the reusable session-operation procedure in `skills/operate-agent-session/SKILL.md`; place this repository's commands and facts in `.agents/contracts/operate-agent-session.md`.

Skills parameterize an authorized task. They do not grant network, credential or deployment permission. Prompt text is not a security control. Client-specific hooks, plugin manifests and installation remain explicit integrations and are not silently wired by copying a skill folder.

Use conventional commits and `development` as trunk. Run Node tests and source/config checks as fatal gates, plus Helm lint and render in CI. GitHub and Forgejo retain their own workflow files; neither is described as universally interchangeable. This follows the intent of Webgrip's [hard-gate workflow decision](https://github.com/webgrip/workflows/blob/main/docs/adrs/0003-hard-gate-quality-workflows.md) without adding a monorepo task runner to a small service.

## Consequences and reconsideration

The procedure can be reused with another harness while repository facts stay reviewable next to code. The initial skill includes three evaluation scenarios; these are expected behavior cases, not evidence that every agent client enforces them.

The workflow mirror inspected during research may lag the authoritative Forgejo repository. De Vloer uses self-contained checks instead of claiming to consume an unverified reusable workflow version. Reconsider shared workflow adoption when its exact Forgejo contract and pinned revision are available and reduce maintenance.
