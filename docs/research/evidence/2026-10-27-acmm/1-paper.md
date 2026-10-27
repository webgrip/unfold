# Angle 1 — The paper: arXiv 2604.09388 v2 (as of 2026-10-27)

**Method.** The v2 PDF was downloaded from <https://arxiv.org/pdf/2604.09388v2> on 2026-10-27, converted with `pdftotext -layout`, and read in full. The arXiv HTML rendering returns 404 for this paper. Quotes below are verbatim; section numbers are the paper's. No later version exists: the arXiv API's `updated` field is 2026-04-27.

## Bibliographic facts

| Fact | Value |
| --- | --- |
| Title | The AI Codebase Maturity Model: From Assisted Coding to Fully Autonomous Systems |
| Author | Andy Anderson, Ph.D. (GitHub `clubanderson`), IBM Research, chief maintainer of KubeStellar |
| Versions | v1 2026-04-10 (5 levels, "Self-Sustaining Systems"); v2 2026-04-27 (6 levels, adds Level 6 and Hive) |
| Length | 30 pages, 7 tables, cs.SE |
| Venue | None. Preprint only |
| Disclosure | "This paper was written with AI assistance. The author was interviewed by Claude Code" |

## Thesis

* "the intelligence of an AI-driven development system resides not in the AI model itself, but in the infrastructure of instructions, tests, metrics, and feedback loops that surround it."
* "You cannot skip levels, and at each level, the thing that unlocks the next one is another feedback mechanism."
* "Testing — the volume of test cases, the coverage thresholds, and the reliability of test execution — proved to be the single most important investment in the entire journey."
* Design principle 3: "Progression is measured by the degree to which human judgment is encoded in system artifacts — instruction files, tests, metrics, workflow rules — rather than held in human memory."
* Positioning (§2.4): "A team that gives AI full autonomy without measurement is not mature — it is reckless. Autonomy is an output of maturity, not a definition of it." The unit of analysis is "the codebase and its surrounding infrastructure, not the team or the organization."

## The six levels (§3, Table 1)

| Level | Name | Feedback loop | Key artifacts | Human role | Transition trigger to the next level | Anti-pattern |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Assisted | Open loop | None | Executor | The same corrections repeat across sessions | "it doesn't understand our codebase": blaming the tool for absent context |
| 2 | Instructed | One-way (human→AI) | Instruction files (CLAUDE.md, copilot-instructions.md, development guides encoding rejection reasons, PR templates) | Rule-writer | Instructions improve consistency but nobody can tell whether the AI performs well | Ever-growing contradictory instruction files with no way to tell which rules work |
| 3 | Measured | Two-way, with human interpretation | Acceptance-rate logs per category, coverage gate, nightly suites, error monitoring, NPS, weekly flaky-test analysis | Analyst | Patterns in the data show responses that should be automated | "Dashboard graveyard": metrics collected but never acted on |
| 4 | Adaptive | Closed loop, automated response | Self-tuning configs (categories below 20 % acceptance blocked), triage loop every 15 min, retry with backoff, cap of 2 concurrent sessions | Governor | Behaviour is determined by artifacts, not real-time decisions: "The code is the policy." | Autonomous action optimising a proxy metric and drifting from user value |
| 5 | Semi-automated | Multi-loop, self-improving | "The entire codebase is the AI's operating manual"; weekly analysis of merged PRs updates guidance | Operator | The system proposes well but waits for a human on every merge; human availability is the bottleneck | Alert fatigue: proposals nobody reviews |
| 6 | Fully Autonomous | Multi-loop with external orchestration | Agent fleet, policy files read on every firing, Beads work ledger, governor config, push notifications, observability runbook | Strategist | — | "Mistaking autonomy for abandonment" |

Level 5, verbatim: "humans still approve — the system proposes, it does not merge autonomously." Level 6: "The system acts on what it finds — generates issues, dispatches agents, merges PRs, rolls back failures."

## Level 6 criteria (§5.3)

| Criterion | Description |
| --- | --- |
| Automated issue generation | Cron-triggered scan for TODOs, stale dependencies, failing tests, coverage gaps |
| Multi-agent orchestration | A dispatcher coordinating several agents on parallel work |
| Merge queue / auto-merge | "Verified PRs merge without human intervention"; "Humans gate the queue config, not individual merges" |
| Strategic dashboard | Sessions, fixes, merge pipeline |
| Risk assessment config | "Prevents autonomous changes to high-risk areas" |
| Production feedback signal | Production observations feed back into development |
| Observability runbook | How humans debug autonomous behaviour |
| Rollback drill | "Autonomy without a kill switch is recklessness" |

## Hive as described in the paper (§5.2)

* "use battle-tested Linux infrastructure — systemd, tmux, cron, bash — for the things that must not fail: scheduling, health monitoring, restart, and coordination."
* Executor mode: the agent reads its policy and waits; a systemd timer fires the governor, which sends work orders over `tmux send-keys`.
* Governor, every 5 minutes, on issue plus PR backlog: SURGE above 20 (scanner and reviewer every 10 min, architect and outreach paused), BUSY above 10, QUIET above 2, IDLE at 2 or fewer (opportunistic roles every 30 min).
* `fix_attempts`: "3 failed attempts → status='skip', operator gets notified".
* Resilience: supervisor poll every 10 s, renew every 6 days ("Claude Code's /loop cron expires at 7 days"), heartbeat check every 20 min, `MAX_RESPAWNS` then page a person.
* Beads: "agents claim work with --actor to prevent duplicate effort, backed by a versioned database"; "The agent's 'memory' lives in the ledger, not in the conversation history."

## Reported numbers (§4.5, §5.4)

| Metric | Value |
| --- | --- |
| Workflows | 74 (22 AI-specific) |
| Nightly suites | 32 |
| Coverage | 91 % across 12 shards; PR gate at 80 % |
| Bug-to-fix | ~30 min; feature ~60 min |
| PRs merged per day | 16 (Jan, L1–2) → 29 (Feb, L3) → 40 (Mar, L4) → 81 (Apr, L5–6) |
| Issues closed per day | 4 → 8 → 32 → 150 |
| 100-day totals | 4,499 PRs merged, 713 closed unmerged (86.3 %); Copilot PRs 320/859 (37.3 %) |
| First week of Hive | 36+ issues closed and 20+ PRs merged autonomously, median fix ~20 min, 0 production incidents |
| Example tuning | `operator` 11 merged / 129 closed (8 %) → weight 0; `a11y` 62 % → weight 0.93 |

The paper reports no money: no model spend, no cost per merged pull request, no budget.

## Limitations the paper states (§6.7)

"a single case study with a single maintainer and a specific technology stack", "primarily a dashboard (UI/API integration), not safety-critical", "inherent survivorship bias", "has not been independently validated across multiple organizations", and Hive "in production for approximately one week at the time of writing".

## Other practices it recommends

* §6.2 "Ask Questions, Not Commands": asking "why didn't you catch this?" yields a new test or rule; "fix this bug" yields a patch.
* §6.3 Refactoring is an investment because "Technical debt directly degrades AI output quality".
* §7 "Start with Level 2 … Then invest in test coverage — not just for correctness, but as the trust mechanism that enables every subsequent level."
