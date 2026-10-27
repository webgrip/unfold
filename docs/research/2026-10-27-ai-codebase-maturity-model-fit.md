# The AI Codebase Maturity Model × Unfold: fit record

Date: 27 October 2026, against `origin/development` at `8ec1854e`, the paper's v2 of 27 April 2026, [hivecommons/hive](https://github.com/hivecommons/hive) at `3f307bb4` and [kubestellar/console](https://github.com/kubestellar/console) at `88bf46ed`. This is a record. What it proposes to adopt is [ADR-0047](../adr/adr-0047-unfold-describes-a-repository-with-the-ai-codebase-maturity-model-and-delivers-at-level-5.md), which stays proposed until the owner accepts it. The [glossary](../reference/glossary.md) defines each capitalised term.

> **Method.** The paper was read in full from its v2 PDF ([1-paper.md](evidence/2026-10-27-acmm/1-paper.md)). Three research agents ran in parallel: a source dig of Hive, Beads and the KubeStellar Console case-study repository through `gh api` and read-only clones ([2-repo-dig.md](evidence/2026-10-27-acmm/2-repo-dig.md)); an ecosystem, critique and absence sweep ([3-ecosystem-and-absences.md](evidence/2026-10-27-acmm/3-ecosystem-and-absences.md)); and a read-only map of this repository's feedback loops ([4-seam-map.md](evidence/2026-10-27-acmm/4-seam-map.md)). These claims were checked first-hand rather than taken from an agent: the Hive rename, `SelfMergeMinACMMLevel` and the Tier 2/3 self-merge bypass in Hive, Hive's three-red-SHA escalation threshold, Hive's launch with permissions bypassed, Console's cumulative acceptance counts, the KPI page's "Nothing on this page is measured yet", ADR-0010's "Not implemented yet", the nightly browser suite's failures in the CI guide, and the dependency-update skill's "a person merges it". Nothing from the cloned repositories was run, and no model call was made.

## Verdict

**Adopt the model, not the reference implementation. Use ACMM's six levels to describe how ready a repository is for agents, keep Unfold's delivery at Level 5, and take the paper's one rule seriously: the next feedback loop to build is measurement, because Ploeg and Unfold built Level 4 to 6 machinery on a Level 3 that is not measured yet. Do not run Hive; mine five of its mechanisms.**

ACMM ([arXiv 2604.09388](https://arxiv.org/abs/2604.09388)) says a codebase becomes effective with agents through the feedback loops around the model, in a fixed order: instructions, then measurement, then loops that act on measurement, then a system that proposes its own work, then one that merges its own work. "You cannot skip levels, and at each level, the thing that unlocks the next one is another feedback mechanism." That thesis is Unfold's own bet put in other words: the delivery contract, not the model, is the product.

The two verdict axes, stated separately:

* **Maturity** is low. One author, one case study of a dashboard, no venue, three citations of which one is the author's and two are passing mentions. The author's outreach to about 30 CNCF projects produced one adopter. The reference implementation Hive is 69 % one person's commits and ships 5 to 15 tags a day. On 26 October the author renamed Level 6 from "Fully Autonomous" to "Autonomous" because it still parks work for people.
* **Fit** is high for the model and low for the implementation. The levels name the exact gap this repository's own documents describe, and Level 5, "the system proposes, it does not merge autonomously", is word for word Unfold's stance that it "never merges". Hive is the opposite of Ploeg where Ploeg is strict: agents run with permissions bypassed in tmux, a soft weekly budget is off by default, there is no tenant boundary, and at Level 6 a pull request touching guardrail paths can merge itself.

**Absences.** The paper names neither Unfold nor Ploeg, nor Forgejo, Vikunja, KEDA, Kata, MCP, A2A, multi-tenancy, client billing or a spend cap; it reports no money at all. Hive has since added Forgejo and Gitea adapters (merge only partly), OpenCode, Goose and LiteLLM backends, a weekly token budget and an ADR listing Kata as an option, which makes it the nearest open-source neighbour to Ploeg in this landscape (added to the [market landscape](../../apps/unfold/docs/research/market-landscape.md#411-hive-commons-acmm-levels-as-code-added-27-october-2026)).

Summary:

1. **Where Unfold stands.** The product reaches Level 5 by design and has Level 6 parts (roles, a claim ledger, caps, a runbook), but its Level 3 is a proposal: [the KPIs](../reference/kpis.md) say "Nothing on this page is measured yet". By ACMM's rule that makes it a Level 2 system with advanced parts. This repository is the same: strong Level 2, no coverage, no acceptance tracking, a nightly browser suite that failed every night from 14 October ([section 3](#3-component-by-component-fit)).
2. **Level 5 is the ceiling, on purpose.** The paper's Level 6 is "merges PRs, rolls back failures" without a person. Unfold's agencies own merging ([who Unfold is for](../concepts/who-unfold-is-for.md)). The evidence since the paper supports the ceiling: agents game tests ([ImpossibleBench](https://arxiv.org/abs/2510.20270)), and Console logged 14 "Main branch broken" issues in the 30 days to 27 October ([section 4](#4-the-one-honest-scenario)).
3. **What adoption means here** is a proposed ADR with five parts: the vocabulary, the Level 5 ceiling, measurement before any loop acts on agent outcomes, a level per connected repository on Settings → Connections, and the same rule applied to this repository ([section 5](#5-implementation-path-cheapest-first)).
4. **What to take from Hive**: escalate a CI fix loop after three distinct red commits with the failing log attached; detect tests weakened or deleted by the writer; a default list of attention paths; a reviewer that is not the writer's model family; change-failure evidence from reverts. The ADR-0010 attention paths, still unbuilt, are where the second and third land.
5. **Found along the way**: Console's "30-day rolling window" never rolls, so its acceptance rates are all-time; its merge guardrails stopped matching when Hive's bot changed its login. Both are the [dashboard-graveyard](#1-what-acmm-actually-is) anti-pattern the paper warns about, in the paper's own repository. Here, the dependency-update skill still says a person merges Renovate's pull requests, which is no longer true for non-major updates.

## 1. What ACMM actually is

A maturity model in the line of CMMI, defined by "feedback loop topology — the specific mechanisms through which a codebase measures, adapts to, and governs the behavior of AI agents". Its unit is "the codebase and its surrounding infrastructure, not the team or the organization". Three principles: each level subsumes the previous one; levels are defined by loops, not tools; and "progression is measured by the degree to which human judgment is encoded in system artifacts … rather than held in human memory".

| Level | Name | Loop | What a codebase has at this level | Anti-pattern |
| --- | --- | --- | --- | --- |
| 1 | Assisted | Open | Nothing but code | Blaming the tool for missing context |
| 2 | Instructed | Human → agent | Instruction files, guides that encode rejection reasons, PR templates | Contradictory instruction files nobody measures |
| 3 | Measured | Two-way, a person interprets | Acceptance rate per category, coverage gate, nightly suites, flaky-test analysis, error monitoring, sentiment | "Dashboard graveyard" |
| 4 | Adaptive | Closed | Thresholds act: low-acceptance categories blocked, triage loops, capped retries, a concurrency cap | Optimising a proxy and drifting from user value |
| 5 | Semi-automated | Self-improving | The system proposes fixes unprompted; people approve every merge | Proposals nobody reviews |
| 6 | Fully Autonomous | Orchestrated fleet | Auto-merge, a governor, a claim ledger, risk-path config, rollback drill | "Mistaking autonomy for abandonment" |

The evidence is one repository over 100 days: 4,499 pull requests merged at 86.3 % acceptance, merged pull requests per day rising from 16 to 81 and closed issues from 4 to 150 between January and April, 91 % coverage, 32 nightly suites ([1-paper.md](evidence/2026-10-27-acmm/1-paper.md)). The paper's own limitations section calls it "a single case study with a single maintainer" with "inherent survivorship bias". It counts pull requests and issues, not value, and reports no spend.

Independent evidence on its four practical claims is mixed ([3-ecosystem-and-absences.md](evidence/2026-10-27-acmm/3-ecosystem-and-absences.md)): small pull requests merge more (well supported, though "< 50 lines" is one repository's figure); category predicts acceptance (supported) but acceptance is not correctness (CodeRabbit finds about 1.7× more issues per AI-coauthored pull request); testing as the top investment is plausible but unproven; flaky tests poisoning an autonomous gate is logical but anecdotal.

**Hive**, the Level 6 reference, has since become [Hive Commons](https://github.com/hivecommons/hive): a Go service that runs a fleet of agent CLIs in tmux sessions inside one container, with level packs that decide what each agent may do, a queue-depth governor, risk tiers per pull request and a hosted hub ([2-repo-dig.md](evidence/2026-10-27-acmm/2-repo-dig.md)). Its README now says "Humans still merge… Start at 'open PRs only'".

## 2. Layer map

| Seam | What this system has | What ACMM asks for | What Hive implements |
| --- | --- | --- | --- |
| Instructions (L2) | `AGENTS.md` required by Ploeg's readiness gate, ranked below the delivery contract, scanned for hidden Unicode | Instruction files every session reads | Policy files re-read on every kick |
| Measurement (L3) | Outcome counters per Team and Role; KPIs K1 to K6 designed, **not measured**; one-off cost and baseline studies | Acceptance per category, coverage, nightly suites, flaky analysis | Outcome benchmark with Wilson intervals |
| Loops that act (L4) | Capped retries, fix rounds and reworks; budgets; `maxRunning`; KEDA scaling | Self-tuning weights, blocked categories | Governor modes; optional auto-demotion |
| Proposing (L5) | Runs create Work Items held `proposed`; refinement; a person assigns | Unprompted proposals, people approve merges | Hold-gated packs L3–L5 |
| Merging (L6) | **Nobody, by decision.** The Agency's forge setting may | Auto-merge of verified pull requests | Auto-merge at L6, with a Tier 2/3 self-merge bypass |
| Paths that need a person | Designed in ADR-0010, not built | Risk-assessment config | Guardrail tiers; `human_merge_paths` |
| Money | Authorized and settled budgets per Run | **Nobody** | Soft weekly budget, off by default |
| Tenancy | One Tenant per Agency, sandboxed runtime | **Nobody** | One pod per hive, Unix UIDs |
| A level per repository | **Nobody**; readiness is a yes or no | The model itself | Level packs; Console's scanner and badge |

Two seams nobody claims explain the whole fit. ACMM has no money and no tenancy, which is where Ploeg is strongest and where Hive is weakest. And nothing in Unfold says how far along a repository is; it says only whether it is ready. That empty row is where adopting the model is useful.

## 3. Component-by-component fit

**Ploeg's Run engine: orthogonal, already stricter.** Ploeg's claim ledger (the Shift owns the Work Item, the Lease owns the branch, [Ploeg ADR-0010](../../apps/ploeg/docs/adrs/0010-shift-owns-the-item-lease-owns-the-branch.md)), its capped retries ([Ploeg ADR-0021](../../apps/ploeg/docs/adrs/0021-infra-failures-and-agent-failures-get-separate-retry-budgets.md)), its fix-round cap ([Ploeg ADR-0017](../../apps/ploeg/docs/adrs/0017-the-review-loop-is-verdict-driven-and-capped.md)) and its check-on-the-pushed-commit gate ([Ploeg ADR-0070](../../apps/ploeg/docs/adrs/0070-a-pull-request-is-ready-for-review-only-when-its-checks-passed-on-the-pushed-commit.md)) are the paper's Level 4 and 6 mechanisms, built as database rows and Kubernetes Jobs instead of systemd timers. The paper's lesson "never trust the agent to keep itself alive" is the reason Ploeg leases work to pods. Nothing to adopt here except Hive's red-commit escalation: Ploeg counts failed Runs, while Hive counts distinct red head commits and attaches the CI log, which catches the "four days of red main" pattern where each fix attempt succeeds as a Run but fails as a change.

**Unfold's measurement: the gap.** The [KPIs](../reference/kpis.md) are exactly ACMM's Level 3, already designed with decision rules per metric, and every fact they need exists in Ploeg's settled pull request records. They are not measured, and the one-off studies ([loop baseline](2026-09-27-loop-baseline.md), [cost per merged Work Item](2026-10-11-cost-per-merged-work-item.md)) are snapshots. ACMM's sharpest warning applies: the decider tripwire, the run-health judge and the escalation lead are Level 4 to 6 loops, and they will be tuned without a measured baseline unless K1 and K5 come first. Unfold's design already puts a person between each of those loops and an action ([ADR-0042](../adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), [Ploeg ADR-0066](../../apps/ploeg/docs/adrs/0066-a-runs-learnings-are-proposals-a-person-reviews-before-any-run-sees-them.md)), which is the right shape; what is missing is the number they would act on.

**Settings → Connections and repository readiness: complementary.** Ploeg refuses a repository without `AGENTS.md` and its wiring report says whether each repository is ready for agents ([Ploeg ADR-0129](../../apps/ploeg/docs/adrs/0129-ploeg-reports-how-each-board-and-repository-it-routes-to-is-wired.md)); [prepare a repository](../how-to/prepare-a-repository.md) recommends branch rules that Ploeg does not enforce. ACMM turns that yes or no into a ladder an Agency's developer can climb: "Level 2: add required checks on `main` to reach Level 3." Factory's [Agent Readiness](https://factory.com/news/agent-readiness) and Console's ACMM scanner show the market expects this. The levels that matter for a repository Unfold delivers into are 2 and 3, because those are what the writer reads and what the CI gate checks; Levels 4 to 6 describe the delivery system, which is Unfold itself.

**Review and merging: competing, and Unfold's bet stands.** ACMM's Level 6 auto-merge contradicts [who Unfold is for](../concepts/who-unfold-is-for.md), the [domain rules](../domain/rules.md) and K5's "Ploeg still never merges". [ADR-0005](../adr/adr-0005-unfold-is-offered-to-agencies.md) already leaves auto-merge to the Agency's forge. The evidence gathered here re-confirms that bet: Hive's own Level 6 lets an App pull request on guardrail paths self-merge because Prow forbids self-approval, its sentinel for weakened CI gates "never blocks on its own", and Console's merge guardrails silently stopped matching when the bot's login changed.

**Attention paths: complementary, unbuilt.** [ADR-0010](../adr/adr-0010-pull-requests-are-small-whole-and-explained.md)'s `.unfold/attention` is ACMM's risk-assessment config. Hive's default guardrail list (CI workflows, policy and proxy rules, `CODEOWNERS`) and Console's tier rules (auth, middleware, Helm RBAC, release config, `go.mod` because of `replace`) are a ready default for a repository that has no `.unfold/attention` yet. Hive's "docs or tests only, but tests weakened" rule fits Unfold's tripwire rather than a merge gate.

**This repository's own process: Level 2 with Level 3 gaps.** Instructions are strong and tested by probes ([agent instructions](../contributing/agent-instructions.md)). Level 3 is partial: no coverage measured, scheduled suites gate nothing, the nightly browser suite failed every night from 14 October for lack of runner CPU ([CI](../operations/ci.md)), and no one counts how many agent pull requests merge. Renovate's non-major auto-merge is a bounded Level 6 island and can stay one: its scope is dependency versions and its gate is the full `checks` job.

## 4. The one honest scenario

The one place the full Level 6 could matter is an Agency that wants Unfold to merge low-risk work on green, the way Hive does and the way RFC-0005's open option (b) would let VS Code's Agent Merge "merge through Ploeg when checks pass". The tension is direct: it breaks "Unfold never merges", moves liability for a defect from the Agency's reviewer to Unfold, and makes the Delivery Fee's Acceptance event an automated one ([ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md)).

The shape that survives it already exists: the Agency configures its own forge to merge on green ([ADR-0005](../adr/adr-0005-unfold-is-offered-to-agencies.md)), Unfold's pull request is ready only when checks passed on its commit, and the Agency's branch rule decides. Unfold's part is to make that choice safe to take: attention paths that always ask a person, a measured K5 for the kind of work in question, and a revert counted against Acceptance. Nothing in the evidence argues for Ploeg holding a merge permission.

## 5. Implementation path, cheapest first

1. **Record and vocabulary (this change).** This record, [ADR-0047](../adr/adr-0047-unfold-describes-a-repository-with-the-ai-codebase-maturity-model-and-delivers-at-level-5.md) as proposed, and the Hive row in the market landscape. Costs nothing to run.
2. **Fix what the sweep found.** Correct the dependency-update skill's merge sentence; give the nightly browser suite the CPU it needs or a separate runner, so its red means something.
3. **Measure Level 3.** K1 and K5 per Team and per kind of work over a 30-day window, from Ploeg's existing records ([VIK-1214](https://vikunja.webgrip.dev/tasks/1214), [VIK-1215](https://vikunja.webgrip.dev/tasks/1215)). Use a real window: Console's never rolled. Do the same for this repository's agent pull requests.
4. **Repository level on Settings → Connections.** Ploeg's readiness report adds generic, observable checks per repository (instruction file present; required checks on the base branch; a fast check command; attention paths or `CODEOWNERS`), and Unfold shows the resulting level and the next missing check. The Ploeg part is a generic readiness contract that names no consumer; the level is Unfold's reading of it.
5. **Mine Hive.** Red-head-commit escalation with the CI excerpt (Ploeg); weakened-test detection as a tripwire signal (Unfold); default attention paths for ADR-0010; a reviewer Role that excludes the writer's model family (Team configuration); revert and reopened-issue evidence feeding K5.
6. **Only after a baseline:** Level 4 loops that recommend to a person, such as "K5 for dependency bumps is above 80 % this quarter; consider lighter review", in the KPI page's own decision lines.

**Never:** Ploeg or Unfold holding a forge merge permission; agents launched with permissions bypassed; a weight that silently stops a kind of work without a person seeing why; a level badge that counts files without reading whether the checks behind them gate anything.

## 6. Recommendations

1. Accept [ADR-0047](../adr/adr-0047-unfold-describes-a-repository-with-the-ai-codebase-maturity-model-and-delivers-at-level-5.md), or amend its five parts.
2. Treat measuring K1 and K5 as the next feedback loop for the product, ahead of new Level 4 to 6 loops.
3. Add the repository level to the Connect a repository journey as the readiness explanation an Agency developer sees.
4. Build ADR-0010's attention paths with Hive's and Console's lists as the default.
5. Do not run Hive, Beads or Console's scanner. Do not publish an ACMM badge.
6. Keep this repository's Renovate auto-merge as it is, and correct the skill that says otherwise.

## 7. Re-evaluation triggers

Any one of these reopens this record:

* ACMM appears at a peer-reviewed venue, or a second independent multi-repository validation is published.
* Hive merges cross-forge auto-merge for Forgejo (its `ROADMAP.md` lists it post-v5; [#6177](https://github.com/hivecommons/hive/issues/6177)), or makes its budget a per-task hard cap: it would then compete with Ploeg on Ploeg's own seam.
* An Agency asks Unfold to merge on its behalf, or RFC-0005's option (b) is chosen.
* K5 for some kind of work stays above 80 % for a quarter, the KPI page's own trigger for lighter review.
* A standard repository-readiness format appears that two or more agent vendors read (for example an OpenSSF Scorecard check; [ossf/scorecard#5021](https://github.com/ossf/scorecard/issues/5021) is the current proposal).

## 8. Tickets

None filed yet. The proposed tickets are the numbered steps 2 to 5 above; they are filed when the owner accepts or amends ADR-0047.
