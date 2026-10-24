---
type: reference
audience: [contributor, agent]
owner: unfold
last_verified: 2026-10-11
verified_by: "Risk areas grouped from the fix commits on development between 2026-09-20 and 2026-10-11 and the reviews on pull requests #249 and #303; review order taken from apps/ploeg/pkg/harness/skills/ploeg-review-against-work-item/SKILL.md."
---

# Review guide

How a pull request to Unfold is reviewed, by a person, by Ploeg's `reviewer` Role, or by an interactive agent through the review command (`/unfold-review` in Claude Code and opencode). Review comments are input to the owner's decision, never the approval.

## What tools decide

Do not review what a check already decides: formatting, types, lint, unit tests, documentation rules, agent instruction files, release policy, workflow policy and new tool warnings. `mise run verify` runs them and CI repeats them. If a check is red, the review stops there. If a check could have caught a finding, say so; the fix is a check, not a comment.

## Order

Stop at the first step that fails and report it.

1. **Scope.** Every acceptance condition of the ticket is met, and nothing else changed. An unrequested change is a finding.
2. **Whole and small.** One change a reviewer can hold in mind. [ADR-0010](../adr/adr-0010-pull-requests-are-small-whole-and-explained.md)'s limits (S: 150 changed lines in 5 files; M: 400 in 12; L: 800 in 25; tests, lockfiles and generated files not counted) are the guide.
3. **Evidence.** The description says what changed, why, and how it was verified, with the gate output or the CI run. A fix carries a test that fails without it.
4. **Risk areas** below, for each one the diff touches.
5. **Consequences** for callers, stored data, migrations, the Ploeg contract and the VS Code extension.

## Risk areas

These are where fixes landed after merge most often.

| Area | Ask |
| --- | --- |
| Tenancy and authorization | Does every mutation check an authenticated identity and the object's owner? Can a token, session or link reach another user, tenant or repository? |
| Money and spend | Is every charge settled once, with exact precision? Can a restart or retry repeat paid work? Does a pause or cancel stay a pause or cancel? |
| Lifecycle and concurrency | Does cleanup run on every return, timeout and kill? Are related writes in one transaction? Can two workers claim the same thing? |
| Protocols | Does the change still match Ploeg's published schemas ([ADR-0027](../adr/adr-0027-unfold-checks-its-ploeg-client-against-ploegs-published-schemas.md)) and the VS Code Agent Host Protocol, spelling included? |
| Demo and replay | Does the deterministic demo still say it is one, with no invented model calls or spend? Does the hosted replay still match the recording? |
| Interface | Does an error say what went wrong in plain words? Is focus visible, contrast sufficient, and the page usable by keyboard? |
| CI and release | Does a workflow change follow [`.forgejo/AGENTS.md`](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/.forgejo/AGENTS.md)? Can it skip, cancel or release something unintended? |
| Names | Does a rename leave the old name only where [ADR-0020](../adr/adr-0020-unfold-is-the-application-and-the-name-vloer-is-retired.md) keeps it? Do new words match the [glossary](../reference/glossary.md)? |
| Agent instructions | A change to `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `.openhands/` or `knowledge/` changes how every agent works here. The owner reviews it, and it is never part of an unrelated change. |

## Findings

Each finding names the file and line, the problem, its effect and the fix. Mark a preference as optional. End with one verdict: approve, or request changes with the blocking findings listed first. A person keeps the decisions no reviewer can make: intent, product fit, money and migration risk, and sign-off.
