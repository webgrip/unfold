---
status: proposed
date: 2026-10-27
decision-makers: Ryan Grippeling
---

# Unfold describes a repository with the AI Codebase Maturity Model, and delivers at Level 5

## Context and Problem Statement

The AI Codebase Maturity Model (ACMM, [arXiv 2604.09388](https://arxiv.org/abs/2604.09388)) describes six levels a codebase passes through as agents become effective in it: Assisted, Instructed, Measured, Adaptive, Semi-automated and Fully Autonomous. Each level is defined by a feedback loop that must exist before the next one helps, and the paper's rule is that levels cannot be skipped. The owner asked to adopt it on 27 October 2026.

Unfold has no shared way to say how far along a repository is. Ploeg's readiness check answers only yes or no ([Ploeg ADR-0038](../../apps/ploeg/docs/adrs/0038-a-repo-label-selects-among-registered-targets-and-the-board-default-is-the-fallback.md)), and the [fit record](../research/2026-10-27-ai-codebase-maturity-model-fit.md) found that Ploeg and Unfold have built Level 4 to 6 parts (roles, a claim ledger, caps) while their Level 3, [the KPIs](../reference/kpis.md), is not measured. What does adopting the model mean for the product and for this repository?

## Decision Drivers

* Unfold never merges ([who Unfold is for](../concepts/who-unfold-is-for.md)); an Agency's forge decides whether anything merges without review ([ADR-0005](adr-0005-unfold-is-offered-to-agencies.md)).
* An Agency developer needs to know what to change in a repository to get better pull requests, not only whether agents may start.
* A loop that acts on agent outcomes needs a measured baseline first, or it tunes a proxy.
* The model's evidence is one repository; adopt what holds without trusting its numbers.

## Considered Options

* Adopt the levels as a description of a repository and as an order of work, with Level 5 as Unfold's ceiling
* Adopt the model including Level 6, and let Ploeg merge verified pull requests
* Run Hive, the paper's reference implementation, next to or instead of Ploeg
* Adopt nothing and keep the yes-or-no readiness check

## Decision Outcome

Chosen option: "**Adopt the levels as a description of a repository and as an order of work, with Level 5 as Unfold's ceiling**", because it keeps the merge with the Agency, gives the readiness check a ladder, and puts measurement before loops that act on it.

1. **Vocabulary.** Unfold's documents use the paper's v2 level numbers and names. A level describes a repository together with the loops around it, never a person or a Team. Hive's later renames are not used.
2. **Level 5 is the ceiling.** Ploeg and Unfold propose work and open pull requests that a person merges. Neither holds a forge merge permission. A repository can be at Level 6 only through its own forge setting, which the Agency owns.
3. **Measure before acting.** No automatic loop changes routing, budgets, review depth or what agents are given, based on agent outcomes, until the metric it reads is measured over a stated time window: K1 and K5 per Team and per kind of work first. Once measured, such a loop recommends to a person, as the KPI decision lines already do.
4. **A level per connected repository.** Settings → Connections shows each repository's level from Ploeg's readiness facts, and the next missing check. Levels 2 and 3 are the ones checked, because they are what a repository brings: an instruction file, required checks on the base branch, a fast check command, and attention paths or `CODEOWNERS`. Ploeg reports the facts without naming any consumer; the level is Unfold's reading of them.
5. **This repository follows the same rule.** It counts as Level 2 with Level 3 incomplete. Its next loops are a nightly browser suite whose result can be trusted, coverage reported, and the merge rate of agent pull requests. Renovate's non-major auto-merge stays as it is ([CI](../operations/ci.md)).

Not implemented yet.

### Consequences

* Good, because an Agency developer sees what to change in a repository, in a vocabulary others also use.
* Good, because the Level 5 ceiling restates the existing stance in terms the market now uses.
* Good, because the order of work points at measurement, which Unfold had designed and not built.
* Bad, because the model rests on one author and one repository, and a level shown in Unfold may suggest more evidence than exists. The level is described as a checklist, not a score.
* Bad, because measuring K1 and K5 per kind of work needs a classification of work that Ploeg does not record today.
* Neutral: Hive's mechanisms worth reusing are taken one by one into Ploeg and Unfold, each through its own decision.

### Confirmation

Confirmed for parts 1, 2 and 5 when no Unfold or Ploeg document claims a merge by Unfold and this repository's documents use the levels as defined here. Part 3 is confirmed when the KPI page no longer says "Nothing on this page is measured yet" before any outcome-driven loop ships. Part 4 is confirmed when a Settings → Connections test shows a repository without required checks at Level 2 with that check named as the next step.

## Pros and Cons of the Options

### Adopt the model including Level 6

* Good, because merges stop waiting for a person on low-risk work.
* Bad, because it breaks "Unfold never merges" and moves a defect's liability from the Agency's reviewer to Unfold.
* Bad, because the reference implementation's own Level 6 lets a pull request on guardrail paths merge itself, and agents pass impossible tasks by editing tests ([ImpossibleBench](https://arxiv.org/abs/2510.20270)).

### Run Hive

* Good, because it is maintained daily and implements every Level 6 criterion.
* Bad, because it runs agents with permissions bypassed in shared tmux sessions, has no tenant boundary, and its budget is a soft weekly limit, off by default.
* Bad, because its merge path is GitHub-only; Forgejo merge is on its post-v5 roadmap.

### Adopt nothing

* Good, because it costs nothing.
* Bad, because the readiness check stays a yes or no, and the missing measurement stays unnamed.

## More Information

* Evidence: [fit record](../research/2026-10-27-ai-codebase-maturity-model-fit.md), with the paper, repository, ecosystem and seam-map evidence beside it.
* 2026-10-27: proposed.
