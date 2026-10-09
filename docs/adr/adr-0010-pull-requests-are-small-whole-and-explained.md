---
status: accepted
date: 2026-09-29
decision-makers: Ryan Grippeling
---

# Unfold pull requests are small, whole and explained, and CI asks the reviewer questions

## Context and Problem Statement

Unfold's pull requests pass their tests, yet the owner, who reviews them, often cannot tell what was made, why each change is there, or what the Work Item's language means. Green CI shows that nothing obvious broke; it does not show that the change is right, necessary or understood. An agency reviewer will meet the same problem ([ADR-0005](adr-0005-unfold-is-offered-to-agencies.md)). How does an Unfold pull request become something its reviewer understands before merging?

## Decision Drivers

* The reviewer must understand what changed and why before accepting it.
* Three small pull requests the reviewer understands are better than one large one.
* Each pull request is a whole: one coherent change with a clean seam, not a fragment and not a bundle.
* Agents may change any path, but changes to important paths must be visible as such.
* Understanding is checked in the pull request itself, as part of CI, where every forge user sees it.

## Considered Options

* Small, whole, explained pull requests, a Diff Limit per size, Attention Paths, and a CI check that asks the reviewer questions
* Rely on tests and the reviewer Role's Verdict
* Forbid agents from changing important paths

## Decision Outcome

Chosen option: "Small, whole, explained pull requests, a Diff Limit per size, Attention Paths, and a CI check that asks the reviewer questions", because it makes the reviewer's understanding part of delivery rather than an assumption.

* **One whole change per pull request.** A pull request contains one coherent change: the behaviour, its tests and its documentation, with nothing unrelated. The reviewer Role rejects changes the Work Item did not ask for.
* **Diff Limit per size.** Changed lines are counted without tests, lockfiles and files marked generated in `.gitattributes`. S: at most 150 lines in 5 files. M: at most 400 lines in 12 files. L: at most 800 lines in 25 files. A Shift that would exceed its budget stops and proposes a split into follow-up Work Items ([Ploeg ADR-0031](../../apps/ploeg/docs/adrs/0031-runs-create-work-items-held-for-approval-within-limits.md)). The numbers are starting values, to be tuned on measured pull requests.
* **The pull request explains itself.** Its description starts with what changed, why, and how it works, in plain language. It then gives one line per file saying why that file changed, and how to verify the change (preview, commands, tests that ran with their real output). Domain terms link to the [glossary](../reference/glossary.md).
* **Attention paths.** A repository lists its important paths in `.unfold/attention`, one glob per line; paths in `CODEOWNERS` count too. Agents may change them. A pull request that touches one is labelled for careful review and lists those files first, each with its explanation.
* **CI asks the reviewer questions.** A required check, "Unfold review questions", posts three to five questions to the reviewer about the pull request: what the change does, what it assumes, and any term that may be unfamiliar. The check passes when each question has a reply, or when the reviewer skips it explicitly. A reply that shows the change is not what the reviewer expected becomes feedback for a fix round.

Not implemented yet.

### Consequences

* Good, because the reviewer understands each change before accepting it, which is the trust the pre-mortem named as the most likely cause of failure.
* Good, because small, whole pull requests are faster to review and easier to revert.
* Bad, because more Work Items are split, adding refinement and review overhead.
* Bad, because the questions check adds a step to every merge; a reviewer can skip it, which weakens it.

### Confirmation

Confirmed when an Unfold pull request over its size's budget is stopped and split in a Ploeg test, a pull request touching an attention path carries the label and the file list, and the questions check blocks merging until answered or skipped, on each supported forge.

## Pros and Cons of the Options

### Rely on tests and the reviewer Role's Verdict

* Good, because nothing new is built.
* Bad, because it is today's situation, in which the owner merges code without understanding it.

### Forbid agents from changing important paths

* Good, because important code is only changed by people.
* Bad, because it stops agents from doing work the owner wants them to do; the owner wants to be told, not blocked.

## More Information

* 2026-09-29 — The owner reported merging Unfold pull requests without understanding them, chose small and whole pull requests over large ones, allowed agents on important paths as long as they are flagged, and asked for CI to question the reviewer.
* 2026-09-29 — Wording aligned with the domain model (Work Item, Diff Limit, Attention Path); no decision changed.
* 2026-10-08 — How follow-up pull requests from a split would show as a stack on each forge. This is input to the split, which is not implemented, and not a decision. GitHub's native [stacked pull requests](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available) became generally available on github.com on 2026-10-06, and `POST /repos/{owner}/{repo}/stacks` creates a stack from pull requests whose base is the previous one's head ([REST API](https://docs.github.com/en/rest/pulls/stacks)). GitLab 19.1 detects [stacked merge requests](https://docs.gitlab.com/user/project/merge_requests/reviews/stacked_merge_requests/) from branch topology alone. Forgejo has no stacks ([forgejo#10641](https://codeberg.org/forgejo/forgejo/issues/10641) was closed in favour of design work). If a follow-up Work Item branches from its predecessor's head, GitLab shows the chain as a stack for free, GitHub needs one API call, and Forgejo shows separate pull requests. Ploeg has no GitHub forge provider today. Source: recommendation 12 of the [VS Code 1.141 dossier](../../apps/unfold/docs/research/2026-10-08-vscode-1-141-fit.md).
