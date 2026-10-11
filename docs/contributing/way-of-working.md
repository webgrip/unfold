---
type: explanation
audience: [contributor, agent]
owner: unfold
last_verified: 2026-10-11
verified_by: "Read against AGENTS.md, apps/*/AGENTS.md, .forgejo/workflows/on_pull_request.yml, scripts/verify.mjs, scripts/stage-explicit-paths.py, apps/.releaserc.cjs, the last 50 closed pull requests on Forgejo and Ploeg's writer and reviewer prompts in apps/ploeg/pkg/worker/task.go. Branch protection is described as decided on 2026-10-11, not as observed."
---

# How work on Unfold is done

This page is about changing Unfold itself. Preparing *your* repository for agents is [Prepare a repository](../how-to/prepare-a-repository.md).

Three kinds of contributor change this repository: the owner, interactive agent sessions (Claude Code, Codex, opencode) working next to the owner, and Ploeg's own Teams, which run Unfold's Work Items like any customer's. All three follow the same flow and the same gates.

## The flow

1. **A ticket.** Work starts as a ticket on the Unfold board in Vikunja (`https://vikunja.webgrip.dev/tasks/<id>`), referred to as `VIK-<id>`. A ticket is ready when it states the problem with evidence, acceptance conditions someone can verify, and the gate commands that prove it.
2. **A design, when the change is not trivial.** A decision that outlives the change is an ADR ([System decisions](../adr/index.md), or the application's own ledger). A change with requirements is an OpenSpec change under `openspec/changes/`, whose `adr` artifact becomes the ADR. A question still open is an RFC in `docs/design/`. A trivial fix needs none of these.
3. **A branch in its own worktree.** Branch from `development`, named `<type>/<short-slug>` (`fix/now-newest-first`); Ploeg names its branches `agent/vik-<id>`. Several sessions share one checkout, so each session works in its own worktree: [Set up a worktree](set-up-a-worktree.md).
4. **Small commits.** Conventional commits (`fix(unfold): …`). A commit under `apps/site` is scoped `site`, and a commit that moves the Ploeg pin is scoped `ploeg`; neither releases Unfold. A commit for a ticket ends with a bare `VIK-<id>` trailer line. Stage only the paths you wrote: a Claude Code hook refuses `git add -A`, `git add .` and `git commit -a`, and the same rule binds every other tool.
5. **The gates.** `mise run verify` from the repository root before every push, `mise run docs-check` after a docs or `AGENTS.md` change. CI runs the same gates.
6. **A pull request** into `development`: [Open a pull request](open-a-pull-request.md). One whole change per pull request ([ADR-0010](../adr/adr-0010-pull-requests-are-small-whole-and-explained.md) sets the size limits Unfold applies to agent work; its checks are not built yet, so here they are guidance).
7. **Review** against the [review guide](review.md). Tools decide format, types, tests and policy; review covers intent, risk and what no test sees.
8. **Merge** when every required check is green. Wait until a running `release` job on `development` has finished first: a merge during a release cancels the runs that would test it and the release tags the new head untested.
9. **Release.** Every push to `development` that touches an application cuts a release candidate ([CI and releases](../operations/ci.md)).

## Decided, not yet built

On 2026-10-11 the owner decided that `development` requires the `checks`, `release-policy` and `ploeg-pin` jobs to pass before a merge, with no required approvals. Until the branch rule is set in Forgejo, CI is advisory: never merge a red check.

## Where things are written down

Each kind of knowledge has one home; [Agent instructions](agent-instructions.md) lists them and what each agent reads.
