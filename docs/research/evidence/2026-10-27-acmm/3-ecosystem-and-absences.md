# Angle 3 — Ecosystem, critiques and absence checks (as of 2026-10-27)

**Method.** Web search and page fetches; arXiv, Semantic Scholar and OpenAlex for citations; GitHub code and issue search for uptake. Absence checks grep the v2 PDF text and the Hive clone at `3f307bb4`. Claims marked "per search" were not opened directly.

## Timeline

| Date | Event |
| --- | --- |
| mid-Dec 2025 | KubeStellar Console started by one maintainer with Claude Code and Copilot |
| 2026-01-23 | Dan Shapiro, [The Five Levels](https://www.danshapiro.com/blog/2026/01/the-five-levels-from-spicy-autocomplete-to-the-software-factory/) |
| 2026-04-10 | [v1](https://arxiv.org/abs/2604.09388v1), 5 levels ending at "Self-Sustaining" |
| 2026-04-16 | Author opens [ossf/scorecard#5021](https://github.com/ossf/scorecard/issues/5021) proposing ACMM badges; no maintainer reply, marked stale 2026-08-05 |
| 2026-04-17 | Hive repository created |
| 2026-04-23 | Author files about 30 "Your project is on the ACMM Leaderboard" issues on CNCF projects |
| 2026-04-26 | The New Stack, ["Beyond prompting"](https://thenewstack.io/ai-codebase-maturity-model/), by the author |
| 2026-04-27 | v2, 6 levels, Hive and Beads |
| 2026-05-14 | [CNCF blog post](https://www.cncf.io/blog/2026/05/14/when-ai-agents-become-contributors-how-kubestellar-reached-81-pr-acceptance/) by the author; still 5 levels, no auto-merge |
| 2026-07-01 | Companion paper, IEEE SSE 2026, ["Teaching Feedback Loop Engineering"](https://doi.org/10.1109/SSE72781.2026.00048) (289 CNCF repos scanned, 8 mentees). The only peer-reviewed item; the ACMM paper itself has no venue |
| 2026-10-26 | [hive#14317](https://github.com/hivecommons/hive/pull/14317) renames L6 "Fully Autonomous" to "Autonomous": L6 still parks work for people and honours `hold` |
| 2026-11-09..12 | KubeCon NA lightning talk on Hive (per search) |

## Uptake

* **Citations.** Three on Semantic Scholar: the author's own SSE paper; [GAIE, arXiv 2606.22484](https://arxiv.org/abs/2606.22484), a related-work mention ("ACMM describes what level of AI assistance exists but not how to govern it proportionately"); [AgentStripes, arXiv 2610.18603](https://arxiv.org/abs/2610.18603), a mention calling it "supported by one practitioner's four-month experience report".
* **Author-owned tools.** An ACMM scanner and badge in Console (`web/src/lib/acmm`, about 65 criteria) at <https://console.kubestellar.io/acmm>; a [leaderboard](https://kubestellar.io/en/acmm-leaderboard) of 289 CNCF projects; Hive's [policy matrix](https://github.com/hivecommons/hive/blob/main/src/docs/acmm-policy-matrix.md) enforcing levels in code.
* **Independent tools.** [sroberts/plumbline](https://github.com/sroberts/plumbline), a Go CLI with a `--fail-below N` CI gate, based on v1 and GitHub Actions only (8 stars).
* **Badge adopters.** [kai-scheduler/KAI-Scheduler](https://github.com/kai-scheduler/KAI-Scheduler/issues/1462) and a few personal repositories.
* **Outreach response.** Of about 30 leaderboard issues: one adoption (KAI-Scheduler), one polite decline, one hostile reply ("Github issues are not for promoting your project"), the rest closed or staled by bots.

## Adjacent models

| Model | Axis | Difference from ACMM |
| --- | --- | --- |
| Shapiro, Five Levels | Autonomy | Conceptual; no prerequisites per level |
| [ELEKS AI-SDLC](https://eleks.com/blog/ai-sdlc-maturity-model/) | Organisational governance | Enterprise process, not repository infrastructure |
| [AIDMM](https://dev.to/ggondim/ai-development-maturity-model-4i47) | Developer role | Writer → orchestrator |
| [AI-MM SET](https://github.com/Gigacore/AI-Maturity-Model) | Autonomy × Controls × Governance | "Autonomy without controls is risk"; team-level |
| DORA metrics | Delivery outcomes | Outcomes, not levels |
| [DORA 2025 AI Capabilities Model](https://cloud.google.com/blog/products/ai-machine-learning/introducing-doras-inaugural-ai-capabilities-model) | Seven organisational capabilities | Survey-validated; includes "working in small batches" and "strong version control"; no testing capability |
| [Factory Agent Readiness](https://factory.com/news/agent-readiness) | Five levels over eight pillars | File-presence and hygiene checks, 80 % bar per level; closest to a repository scanner |
| GAIE | Oversight tier per task | Human-in-the-loop, on-the-loop or monitored, chosen by impact, reversibility and data sensitivity: the governance ACMM lacks |
| AgentStripes | Grades agent releases | Not codebases |

## Critiques

1. **n = 1, self-reported.** The paper's own limitations; throughput counts PRs and issues, not value; no cost data. The model was derived from the project used to validate it.
2. **The author retreated from "fully" autonomous.** Hive renamed L6, merges are human by default, and its reviewer verdict does not stop the auto-merge sweep unless `review.require_approval` is set.
3. **AI pull request quality and review load.** [CodeRabbit, 2025-12-17](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report): about 1.7× more issues per AI-coauthored PR. Faros AI 2025 (vendor data): +98 % PRs merged, +91 % review time, +154 % PR size. [METR 2025](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/): experienced developers 19 % slower; the [2026 update](https://metr.org/blog/2026-02-24-uplift-update/) calls that signal unreliable. [Stanford CodeX](https://law.stanford.edu/2026/02/08/built-by-agents-tested-by-agents-trusted-by-whom/): agents that write and test share blind spots.
4. **Tests as the merge gate can be gamed.** [ImpossibleBench, arXiv 2510.20270](https://arxiv.org/abs/2510.20270): frontier agents pass impossible tasks by editing or deleting tests, more so with stronger models. Coverage is not strongly correlated with suite effectiveness ([Inozemtseva and Holmes, ICSE 2014](https://doi.org/10.1145/2568225.2568271)).
5. **Autonomous agents with write tokens.** [Nx "s1ngularity"](https://www.wiz.io/blog/s1ngularity-supply-chain-attack) weaponised agent CLIs run with permissions bypassed; ["PromptPwnd"](https://www.esecurityplanet.com/threats/ai-agents-create-critical-supply-chain-risk-in-github-actions/): untrusted issue text into AI actions holding privileged tokens.

## Evidence on the paper's claims

| Claim | Status |
| --- | --- |
| Testing is the most important investment | Plausible, not established. [Ehsani et al., MSR 2026](https://arxiv.org/abs/2601.15195) (~33k agent PRs): unmerged agent PRs often fail CI. [Haque et al., MSR 2026](https://arxiv.org/abs/2601.03556): agent PRs with tests are larger and slower, merge rates similar. DORA's capabilities omit testing |
| Flaky tests are dangerous for autonomous workflows | Logically sound, empirically anecdotal; general flakiness evidence is strong ([Google](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html), [Parry et al., TOSEM 2021](https://doi.org/10.1145/3476105)), no study of autonomous merge pipelines |
| Acceptance rate per category is a tuning signal | Category matters (docs, CI and build PRs merge most; Ehsani et al.). Acceptance is not correctness, and tuning toward what is accepted invites Goodhart. No study of closed-loop weight tuning |
| Smaller PRs merge more (< 50 lines) | Direction well supported (Ehsani et al.; Faros; DORA small batches). The 50-line figure comes from one repository's self-analysis |

Agent merge rates in the AIDev dataset (33,596 PRs): Codex 82.6 %, Cursor 65.2 %, Claude Code 59.0 %, Devin 53.8 %, Copilot 43.0 %.

## Absence checks

| Name | Paper v2 | Web with ACMM | Hive |
| --- | --- | --- | --- |
| Unfold, Ploeg | absent | absent | absent |
| Forgejo, Gitea | absent | absent | adapters; merge partial; post-v5 roadmap |
| Vikunja | absent | absent | absent |
| LiteLLM | once ("Ollama + litellm proxy") | absent | inference path |
| KEDA | absent | absent | absent |
| Kata Containers | absent | absent | listed in an ADR as an option, no code |
| OpenCode | absent | absent | backend |
| Goose | backend table | — | backend |
| Claude Code | central | — | backend, run with permissions bypassed |
| MCP | absent | — | used; `.mcp.json` is an ACMM scanner signal |
| A2A | absent | absent | one design doc |
| Agency or client billing | absent | absent | absent |
| Multi-tenancy | absent; levels are "not the team or the organization" | absent | "no hosted multi-tenant plane holding adopter data"; namespace per hive on the hub |
| Spend caps | absent; only "token burn rates" on a dashboard | absent | soft weekly budget, off by default |
