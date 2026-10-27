# Angle 4 — Seam map: ACMM feedback loops in Ploeg, Unfold and this repository (as of 2026-10-27)

**Method.** A read-only sweep of this repository, with the unpacked Ploeg contract bundle under `apps/ploeg` (Ploeg source paths below are paths in that bundle, which Git ignores; they match the pinned Ploeg release). An ADR's frontmatter status was not trusted on its own: Ploeg leaves several built decisions `proposed`, so "implemented" below means code was found and "designed" means a decision or design exists without code. Greps that found nothing are named.

## A. The product: Ploeg and Unfold doing a customer's work

| Mechanism | ACMM | Status | Evidence |
| --- | --- | --- | --- |
| Instruction files read every Run | L2 | implemented | Writer prompt reads root and nearest `AGENTS.md` (`pkg/taskprompt/prompt.go`); readiness requires `AGENTS.md` on the base branch (`pkg/target/readiness.go`, Ploeg ADR-0038); files hashed and scanned for hidden Unicode (`pkg/worker/instructions.go`); repository instructions rank below the delivery contract (Ploeg ADR-0030); [prepare a repository](../../../how-to/prepare-a-repository.md) |
| Outcome counters per Team and Role | L3 | implemented | `ploeg_runs_finished_total{team,role,outcome,reason}`, `ploeg_shadow_reviews_total` (`pkg/httpapi/metrics.go`); alert `PloegRunsFailingRepeatedly` ([alerts](../../../../apps/ploeg/docs/ops/alerts.md)) |
| Acceptance (merged vs closed) per kind of work | L3 | designed | [KPIs](../../../reference/kpis.md): "Status: proposal. Nothing on this page is measured yet." K1 ready-for-review rate, K5 clean-merge rate; the merge facts exist (Ploeg ADR-0045, 0058, 0059). One-off measurements: [loop baseline](../../2026-09-27-loop-baseline.md), [cost per merged Work Item](../../2026-10-11-cost-per-merged-work-item.md) |
| Coverage gate | L3 | absent | No threshold anywhere; Ploeg backlog item 92 "coverage gate on `pkg/work`" |
| Flaky-test handling | L3 | partial | Run cards count CI reruns as a flaky hint; a cancelled CI run is re-run once (Ploeg ADR-0119); no quarantine |
| Production errors, sentiment, bug reports | L3 | implemented | Unfold app ADR-0042 error reports; [ADR-0023](../../../adr/adr-0023-unfold-measures-happiness-and-confusion-with-first-party-events-surveys-and-bug-reports.md), [ADR-0025](../../../adr/adr-0025-unfold-asks-one-ease-question-on-anomalies-and-a-random-baseline.md), [ADR-0024](../../../adr/adr-0024-bug-reports-are-filed-by-unfold-into-the-tenants-own-tracker.md) |
| Self-tuning weights, automatic blocking of a kind of work | L4 | absent by design | KPI decision lines are a person's: K6 "stop assigning that class to agents"; Ploeg ADR-0036 keeps the escalation lead proposal-only until E1 ≥ 90 % over 20 briefs |
| Capped retries | L4 | implemented | `MaxRunAttempts = 3` (`pkg/store/shift.go:176`); infra failures 10; separate budgets (Ploeg ADR-0021, `pkg/shiftengine/failedwriter.go`); no automatic retry of paused or cancelled work (Ploeg ADR-0101) |
| Concurrency caps | L4 | implemented | `teams.<name>.maxRunning` at claim time (`pkg/store/team_capacity.go`); created-work caps (Ploeg ADR-0031) |
| Review-loop caps | L4 | implemented | `maxFixRounds` 2 (Ploeg ADR-0017); `maxReworks` 3 (Ploeg ADR-0151) |
| Budget caps | L4 | implemented | Authorized and settled budgets (Ploeg ADR-0012); a spent LiteLLM budget parks the item (Ploeg ADR-0111) |
| Ready only when checks pass on the pushed commit | L4–L5 | implemented | Ploeg ADR-0070, 0119 (`pkg/shiftengine/forge_ci_gate.go`) |
| The system proposes work unprompted | L5 | implemented, held | Runs create Work Items held `proposed` (`autoDispatch: false`, Ploeg ADR-0031); [ADR-0007](../../../adr/adr-0007-clients-approve-ready-work.md) |
| People merge | L5 | implemented | Neither Ploeg's forge client nor Unfold calls a merge endpoint ([capability matrix](../../../reference/capability-matrix.md)) |
| Learnings → guidance | L5 | partial | Learnings are proposals a person reviews (Ploeg ADR-0066, 0088); no loop analyses merged pull requests |
| Auto-merge of verified pull requests | L6 | absent by policy | See the stance quotes below |
| Several agent roles | L6 | implemented | Writer and reader Roles (Ploeg ADR-0010, 0017), shadow reader (Ploeg ADR-0096), premise check (Ploeg ADR-0123), refinement ([ADR-0007](../../../adr/adr-0007-clients-approve-ready-work.md)); run-health judge and decider tripwire, shadow only ([ADR-0042](../../../adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md)) |
| Workload governor | L6 | implemented as scaling | KEDA scales workers to the pending count, clamped by `maxRunning` ([architecture](../../../../apps/ploeg/docs/architecture.md)); intake cadence does not change |
| Work-claim ledger | L6 | implemented | The Shift owns the Work Item and the Lease owns the branch (Ploeg ADR-0010); atomic `ClaimRole`; overlapping Shifts named in the briefing (Ploeg ADR-0123) |
| Paths that need a person | L6 | designed | Attention paths in `.unfold/attention` and CODEOWNERS ([ADR-0010](../../../adr/adr-0010-pull-requests-are-small-whole-and-explained.md), "Not implemented yet.") |
| Production signal → regression work | L6 | partial | Deploy facts (Ploeg ADR-0047), credential-leak parking (Ploeg ADR-0105), Reversal on a revert within 14 days; nothing opens a regression Work Item |
| Observability runbook | L6 | implemented | [Ploeg alerts](../../../../apps/ploeg/docs/ops/alerts.md); `investigate-session` skill |
| Rollback drill | L6 | designed | `apps/unfold/docs/design/self-improvement.md`; grep `rollback drill`: zero hits |
| Push escalation | L6 | designed | [ADR-0026](../../../adr/adr-0026-unfold-is-an-installable-web-app-that-notifies-from-the-server.md) (ntfy, Web Push); grep `ntfy|webpush|vapid` in `apps/unfold/src`: zero hits |

## B. This repository's own development

| Mechanism | ACMM | Status | Evidence |
| --- | --- | --- | --- |
| Instruction hierarchy, skills, hooks | L2 | implemented | Root and per-application `AGENTS.md` with word limits checked by `scripts/agents-files.py`; `.agents/skills`; staging hook `scripts/stage-explicit-paths.py`; a rule is added only after the same mistake happened twice ([agent instructions](../../../contributing/agent-instructions.md)) |
| Verify gates | L3 | implemented | `mise run verify` (`scripts/verify.mjs`), a failing `warnings` job, branch rule requires `checks`, `release-policy`, `ploeg-pin` ([way of working](../../../contributing/way-of-working.md)) |
| Coverage | L3 | absent | No coverage tool or threshold in any `package.json` or `mise.toml` |
| Scheduled suites | L3 | implemented, gate nothing | `on_nightly.yml` (browser suite, MCP e2e, Ploeg-behind), weekly `on_schedule.yml`; "the red scheduled run is the signal" ([CI](../../../operations/ci.md)) |
| Flaky handling | L3 | absent | Mitigations only; every nightly browser run failed from 2026-10-14 for lack of runner CPU, now with a ×3 timeout scale ([CI](../../../operations/ci.md)) |
| Acceptance of agent pull requests | L3 | absent | The `agent-trace` job reports which lines an agent wrote, non-blocking; no merged-vs-closed tracking |
| Renovate | L6 island | implemented | Non-major, lock-file and vulnerability updates merge themselves on green after a soak ([CI](../../../operations/ci.md), "Dependency updates"). The `explain-a-dependency-update` skill still says "Renovate opens the pull request; a person merges it" |
| Ploeg pin | L6 island → L5 | implemented | The release train merges the newest green pin ([ADR-0046](../../../adr/adr-0046-an-hourly-release-train-versions-unfold-from-a-checked-development-head.md) amendment) |
| Agent reviewer | L6 | implemented | "Review comments are input to the owner's decision, never the approval" ([review guide](../../../contributing/review.md)) |
| Paths that need the owner | L6 | partial | `.forgejo/CODEOWNERS` names the owner on instruction files, `.forgejo`, `knowledge/` and two scripts; the branch rule requires no approval, so it is advisory |
| Work-claim ledger | L6 | absent | Worktrees per session and explicit staging prevent collisions instead |

## Stance on merging, verbatim

* [Who Unfold is for](../../../concepts/who-unfold-is-for.md): "Unfold delivers a reviewed pull request and its preview. It never merges and never deploys to production."
* [Domain rules](../../../domain/rules.md): "Unfold never merges a pull request or deploys to production."
* [How work flows](../../../concepts/how-work-flows.md): "Ploeg never merges."
* [KPIs](../../../reference/kpis.md), K5: "Above 80 % for a quarter, spend less review time on low-risk classes of work. Ploeg still never merges."
* [ADR-0005](../../../adr/adr-0005-unfold-is-offered-to-agencies.md): "whether a pull request may merge without review is the agency's forge and repository setting."
* [RFC-0005](../../../design/rfc-0005-complete-agents-window-support.md) leaves open whether VS Code's Agent Merge may "merge through Ploeg when checks pass"; its recommended option keeps Accept.

## Absences

`ACMM`, `2604.09388`, `Shapiro`, `autonomy level`, `agent readiness`, `rollback drill`: zero hits. "Dark Factory" occurs only as a Vikunja board name. No `Protocol research contract` block in any `AGENTS.md`.

## Readiness today

Ploeg refuses a target without `AGENTS.md` (`target_not_ready`, Ploeg ADR-0038). Ploeg's wiring report (`GET /api/v1/operator/connections`, Ploeg ADR-0129) and Unfold's Settings → Connections show per repository whether it is ready for agents and the fix for each failure. [Connect a repository](../../../concepts/connect-a-repository.md) and [prepare a repository](../../../how-to/prepare-a-repository.md) describe the rest; branch rules are recommended there but "not enforced by Ploeg".
