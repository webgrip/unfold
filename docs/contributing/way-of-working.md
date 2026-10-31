---
type: explanation
audience: [contributor, agent]
owner: unfold
last_verified: 2026-10-31
verified_by: "Board section read against the homelab-cluster ClickUp routing (kubernetes/apps/ploeg/unfold/app/helmrelease.yaml) and apps/unfold/docs/operations/working-from-clickup.md. Rest read against AGENTS.md, apps/*/AGENTS.md, .forgejo/workflows/on_pull_request.yml, scripts/verify.mjs, scripts/stage-explicit-paths.py, apps/.releaserc.cjs, the last 50 closed pull requests on Forgejo and Ploeg's writer and reviewer prompts in pkg/taskprompt/prompt.go of the pinned Ploeg release. Branch rule for development read from the Forgejo settings on 2026-10-11, and its gate from the Forgejo API on 2026-10-27."
---

# How work on Unfold is done

This page is about changing Unfold itself. Preparing *your* repository for agents is [Prepare a repository](../how-to/prepare-a-repository.md).

Three kinds of contributor change this repository: the owner, interactive agent sessions (Claude Code, Codex, opencode) working next to the owner, and Ploeg's own Teams, which run Unfold's Work Items like any customer's. All three follow the same flow and the same gates.

## The flow

1. **A ticket.** Work starts as a task in the Unfold Space in ClickUp (`https://app.clickup.com/t/<id>`), referred to as `CU-<id>`, and moves across [the board](#the-board). A ticket is ready when it states the problem with evidence, acceptance conditions someone can verify, and the gate commands that prove it. The Vikunja board is an archive: older commits and documents cite `VIK-<id>`.
2. **A design, when the change is not trivial.** A decision that outlives the change is an ADR ([System decisions](../adr/index.md), or the application's own ledger). A change with requirements is an OpenSpec change under `openspec/changes/`, whose `adr` artifact becomes the ADR. A question still open is an RFC in `docs/design/`. A trivial fix needs none of these.
3. **A branch in its own worktree.** Branch from `development`, named `<type>/<short-slug>` (`fix/now-newest-first`); Ploeg names its branches `agent/clickup-<id>`. Several sessions share one checkout, so each session works in its own worktree: [Set up a worktree](set-up-a-worktree.md).
4. **Small commits.** Conventional commits (`fix(unfold): …`). A commit under `apps/site` is scoped `site` and never releases Unfold; a commit that moves the Ploeg release is a `fix(ploeg)` and cuts an Unfold candidate. A commit for a ticket ends with a bare `CU-<id>` trailer line. Stage only the paths you wrote: [`scripts/stage-explicit-paths.py`](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/scripts/stage-explicit-paths.py) refuses `git add -A`, `git add .` and `git commit -a` in Claude Code, OpenHands and opencode, and the same rule binds every other tool. `apps/ploeg` is the unpacked contract bundle of the pinned Ploeg release, not a checkout; Ploeg work happens in a clone of `ploeg-hq/ploeg`.
5. **The gates.** `mise run verify` from the repository root before every push, `mise run docs-check` after a docs or `AGENTS.md` change. CI runs the same gates.
6. **A pull request** into `development`: [Open a pull request](open-a-pull-request.md). One whole change per pull request ([ADR-0010](../adr/adr-0010-pull-requests-are-small-whole-and-explained.md) sets the size limits Unfold applies to agent work; its checks are not built yet, so here they are guidance).
7. **Review** against the [review guide](review.md). Tools decide format, types, tests and policy; review covers intent, risk and what no test sees.
8. **Merge** when every required check is green; Forgejo refuses the merge before that. Wait until a running `release` job on `development` has finished first: the release can tag the new head before that head's own run has tested it. Never cancel a `development` push run; its `release` job is how the merge ships.
9. **Release.** Every push to `development` that touches an application cuts a release candidate ([CI and releases](../operations/ci.md)).

## The board

The board is the Board view of each List in the Unfold Space. Every List has the same five columns, and a task moves left to right:

| Column | A task is here when | Who moves it in |
| --- | --- | --- |
| **Backlog** | it is written down, not yet ready | anyone |
| **Ready** | it meets the ready rule in [the flow](#the-flow), step 1 | the owner, after refining it |
| **In progress** | someone, a person or a Team, works on it | Ploeg when a Shift opens; a person moves their own |
| **In review** | its pull request waits for review | Ploeg when the pull request opens; a person moves their own |
| **Done** | its pull request merged | Ploeg when the Work Item finishes; a person moves their own |

Work is pulled, not pushed. Take the top task of **Ready**, never one from Backlog: a Team gets nothing but the task's title and description, so a task that is not ready wastes a Run. Keep **In review** to three tasks at most. Review time is the scarce resource, so a full In review column means review first and start nothing new.

To give a task to agents, assign the ClickUp member `unfold-agent`, or choose **Hand to** on Unfold's Now page, which does the same. Ploeg's Team bronze picks it up, works on branch `agent/clickup-<id>`, and moves the card. Unassigning `unfold-agent` before a worker starts takes it back. Only that member starts work: assigning yourself or a colleague starts nothing. [Working with Unfold from ClickUp](../../apps/unfold/docs/operations/working-from-clickup.md) covers following, reviewing and stopping the work. A task stops at **In progress** when the agents need a person; Unfold's Now page lists it under **Needs you** with the reason.

A task tagged `repo/homelab-cluster` is worked in `webgrip/homelab-cluster` instead of this repository. Tasks in the Ploeg Space are not picked up by agents, because its repository is on GitHub; change Ploeg by hand in `ploeg-hq/ploeg`.

## Branch rules

Since 2026-10-11, `development` is protected in Forgejo: a pull request merges only when [the pull request gate](../operations/ci.md#the-pull-request-gate) passed, with no required approvals. Since 2026-10-27 the branch rule requires that one context, `* / gate (pull_request)`, and the gate waits for every pull request job except the advisory `agent-trace` and `warnings`; `warnings` is advisory because it is sometimes never scheduled when two runs overlap. Pushing stays enabled. Until 2026-10-25 the `release` job pushed its release commit straight to the branch; releases now push only a tag, so no CI job needs to push to `development` any more. A direct push does not run through the checks, so nobody pushes there. `main`, which receives only promotion pull requests, gets the same rule.

## Where things are written down

Each kind of knowledge has one home; [Agent instructions](agent-instructions.md) lists them and what each agent reads.
