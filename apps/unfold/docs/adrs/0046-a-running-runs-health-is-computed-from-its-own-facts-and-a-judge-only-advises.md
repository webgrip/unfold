---
status: proposed
date: 2026-10-17
decision-makers: Ryan Grippeling
review-by: 2027-01-17
---

# A running Run's health is computed from its own facts, and a judge only advises

## Context and Problem Statement

A running Run's card shows its state, elapsed time, authorized budget and plan, but not whether it will end in a pull request. On 2026-10-17 Run 305 (Work Item 190) spent 45 minutes, marked 1 of 6 plan steps done, started a 23-minute command and was stopped by the ACP idle watchdog with nothing pushed. The facts that showed the drift were on the card or one fact short of it, and nothing combined them. The owner asked for the answer on the page itself: on track, or veering off. [RFC-0007](../../../../docs/design/rfc-0007-run-health.md) has the evidence, the job stories and the state matrix.

How does Unfold tell a person, while a Run runs, whether it is on track, and what may decide that?

## Decision Drivers

* The answer is read on every look at a running Run, so it must be visible without a click and cost nothing to compute.
* A missed warning costs the Run's spend and its work; a false one costs a person's attention. Warnings must name the numbers behind them.
* Unknown inputs (no limits, no cost, no transcript) must never read as healthy.
* A model's verdict is not trusted before its precision is measured, and it spends money only with the owner's OK (no paid test runs, owner 2026-10-13).
* Unfold shows and does not execute ([ADR 0023](0023-unfold-submits-work-to-ploeg-and-never-executes-it.md)); every model call goes through Ploeg's authorization (Ploeg ADR-0082).

## Considered Options

* Signals computed in the browser, plus a judge model as a Ploeg Ask behind a Team flag that is off by default
* Signals only
* A judge model always on
* Ploeg computes health and acts on it

## Decision Outcome

Chosen option: "Signals computed in the browser, plus a judge model as a Ploeg Ask behind a Team flag that is off by default", because it answers the question for free from facts Unfold already polls, keeps every model call under Ploeg's allowance, and lets the judge's precision be measured before anyone relies on it. The owner chose this on 2026-10-17, and on 2026-10-18 moved the computation to Unfold's server, kept the judge shadow only and gave it a free EU-hosted model (see the bullets marked amended).

* **One health per running Run:** On track, Watch, Off track, Not judged yet or Not known, as a badge next to the Run's state badge, with one reason line naming the numbers it used. It is shown only while the Run runs.
* **Signals are deterministic.** Quiet (time since the newest transcript entry against the idle limit), Pace (plan progress against the share of the prompt limit used), Time, Budget (observed spend against the authorized budget, only when cost is observed or provisional) and Repeat (the same tool-call input repeated). The worst signal wins. The thresholds are the named constants in RFC-0007 and live in one shared pure module, [`public/core/run-health.js`](../../public/core/run-health.js); changing one is a reviewed change with a test.
* **Unfold's server computes health** (amended 2026-10-18). The server runs that shared function over each running Run's facts and a transcript tail it reads incrementally from Ploeg, and serves the result (`GET /api/ploeg/work-items/:id/runs/:run/health`). Every viewer sees one answer, and the judge's triggers do not depend on someone's browser being open. The browser only shows it, polling every 30 seconds.
* **Unknown is named.** A Run without limits, cost or transcript shows the signals it can judge and says which it cannot. It never shows On track for lack of evidence.
* **The judge is an Ask and is shadow only.** When the Team's `cards.health.judge` flag is on, Unfold asks a model, through a Ploeg Ask, for a verdict in a fixed shape (`health`, a reason of at most 160 characters, transcript evidence). It records and shows: it may raise the badge, never lower it, and it never stops, requeues, steers or grades a Run. Its line carries an AI label and a "this was wrong" control. It runs on a plan change, on a signal turning to Watch, and otherwise at most every 10 minutes, at most 9 times per Run, one at a time, started only by the read of a person who is not a viewer.
* **The judge's model is free and EU-hosted, with no paid fallback** (amended 2026-10-18). By default the judge uses Hetzner's free, EU-hosted experimental inference through the gateway (`runHealth.judgeModels`: `hetzner-qwen3-8-27b`, then `hetzner-qwen3-6-35b-a3b`), the first of them the Ask's key may call. When Ploeg offers none, the Ask is finished unused and no verdict is made; it never falls back to a paid model. Hetzner says that service is not for production. That is acceptable here because the judge only advises: a missing or failed verdict leaves the signals, which answer on their own.
* **Ploeg supplies the limits.** The Run's prompt and idle limits and the time the prompt started come from Ploeg on the operator API Run, as Ploeg ADR-0091's record of a Run's configuration. Until Ploeg serves them, the time-based signals show Not known.

### Consequences

* Good, because the question the owner asked of Run 305 is answered on the card, eight minutes before that Run's stop, with no spend.
* Good, because the signals are unit-testable with fixtures, and the judge's precision and cost are measured (`run.health.changed`, "this was wrong") before it matters.
* Good, because no new path to a model is added: the judge is an Ask, paid from the Team's allowance and never counted as delivery spend.
* Bad, because the badge can be wrong both ways. Thresholds are guesses until outcomes are measured, so they start conservative (Watch before Off track) and are revised with evidence.
* Bad, because a badge adds no action. A person still cancels or requeues through the existing controls; a Needs-you entry for Off track is left to a later decision.
* Bad, because the time-based signals depend on a Ploeg change; until it ships, only Budget and Repeat are judged.

### Confirmation

* `test/run-health.test.mjs` covers every row of RFC-0007's state table with fixtures, including the Run 305 timeline: Watch from 09:11 (pace), Off track before 09:19 (quiet).
* `test/run-health-judge.test.ts` proves the judge's limits: flag off means no Ask and no call; a model Ploeg does not offer is never called and the Ask is finished; a verdict never lowers the signals; a reply of the wrong shape or with evidence outside its window is discarded; at most 9 per Run, every 10 minutes, one at a time; the demo and viewers never start one; the Ask is always finished.
* The browser flow checks the badge on a running demo Run at 320 px and the widest layout, in light and dark, with no CSP violation.
* A judge call is made only when the Team flag is on, through the Ask path, and its verdict is discarded unless it matches the fixed shape; a test proves a judge verdict never lowers the signals' health.

## Pros and Cons of the Options

### Signals computed in the browser, plus a judge as an Ask behind a flag that is off

* Good, because free by default and measurable before trust.
* Neutral, because two sources of truth must be combined by one rule (worst of the signals, raised by the judge).

### Signals only

* Good, because cheapest and fully deterministic.
* Bad, because it cannot tell slow work on the ticket from fast work off it.

### A judge model always on

* Good, because the best answer from the first day.
* Bad, because it spends without the owner's OK and trusts a model before its precision is known.

### Ploeg computes health and acts on it

* Good, because a Ploeg-side health could stretch an idle limit for a known-slow command or stop a lost Run.
* Bad, because acting changes what a Run does, which is Ploeg's decision and needs its own ADR and the evidence this one collects first.

## More Information

* [RFC-0007: Run health on the Run card](../../../../docs/design/rfc-0007-run-health.md): evidence, job stories, wording, signals, state matrix, measures and plan.
* Owner request and choice: 2026-10-17. No paid test runs: owner, 2026-10-13; the judge is off by default for that reason.
* Related: [ADR 0043](0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md) (flags), [ADR 0045](0045-unfold-records-the-run-card-rules-it-computes.md) (Run card rules), Ploeg ADR-0082 (Asks), ADR-0090 (transcripts), ADR-0091 (Run configuration), ADR-0096 (a shadow reader records its verdict and never acts).
* Re-evaluate when the judge has run on one Team for a month, or when Ploeg proposes acting on health.
* 2026-10-17 — Proposed.
* 2026-10-18 — Amended by the owner while building RFC-0007 steps 2 and 3: health is computed by Unfold's server from one shared pure function, so every viewer sees one answer and the judge does not depend on a browser; the judge is shadow only; its default model is Hetzner's free EU-hosted experimental inference with no paid fallback, accepted although Hetzner says it is not for production, because the judge only advises.
