# RFC-0007: Run health on the Run card

> Status: **Proposed** 2026-10-17, revised 2026-10-18 with what the live Work Item view taught ([below](#revision-2026-10-18-what-the-live-view-taught)) · Owner request (2026-10-17): "Are we on track or losing it? I want that clear on the page itself. Are we in the pipe, 5 by 5, or veering off track?" Owner choice the same day: deterministic signals now, a judge model behind a switch that is off by default · Decision record: [Unfold ADR 0046](../../apps/unfold/docs/adrs/0046-a-running-runs-health-is-computed-from-its-own-facts-and-a-judge-only-advises.md) (proposed) · Builds on: [Unfold ADR 0045](../../apps/unfold/docs/adrs/0045-unfold-records-the-run-card-rules-it-computes.md) (Run card rules), Ploeg ADR-0082 (Asks), ADR-0090 (transcripts), ADR-0091 (Run configuration), ADR-0096 (a shadow reader never acts)
>
> **TL;DR.** While a Run runs, its card shows a clock, an authorized budget and a plan checklist, but no answer to the one question a person has: will this end in a pull request? Today that answer takes reading the transcript and doing arithmetic the card could do. This RFC adds one health badge to the running Run's card, with a one-line reason: **On track**, **Watch** or **Off track**. Four free signals drive it: time against the Run's limit, quiet time against the idle stop, budget used, and repeated commands. A judge model can add a fifth, "is it still working on the ticket?", as an Ask, behind a Team setting that is off by default. The judge only advises: it never stops, steers or grades a Run. Unfold needs one new fact from Ploeg, each Run's time limits.

## The problem, from one Run

[Work Item 190](https://unfold.webgrip.dev/#work/190) ([VIK-2049](https://vikunja.webgrip.dev/tasks/2049)) asked bronze to make a CI job finish under 60 minutes. Its Run 305, on 2026-10-17:

| Time (UTC) | What happened | What the card showed |
| --- | --- | --- |
| 08:34 | Run started; read its notes and knowledge; agent started | Running · 0 min |
| 08:37–09:10 | Measured the suites, found two real causes (a 30-second shutdown poll in every suite's fake server, one quadratic distill test) and cut the brain-eval suite from about 53 s to about 20 s | Running |
| 09:11 | Marked step 1 of 6 done; started timing the full distill mutation script, which took about 23 minutes in CI | Running · 37 min · Plan 1 of 6 |
| 09:19 | The ACP idle watchdog stopped the agent: "no protocol activity for 10m0s after 288 events". Nothing was pushed; the measured fix was lost. US$0.22 spent | Failed |

Two facts were enough to see this coming eight minutes before the stop. At 09:11 the plan was 1 of 6 done at 41 % of the 90-minute prompt limit, a pace that ends past the limit. From 09:16 one command had shown no output for 5 minutes, half of the 10-minute idle stop. The card had both inputs on screen (the transcript's last entry time, the plan) or one fact short of them (the limits), and computed neither. The owner asked the question by screenshot, and a person had to answer it by hand.

## Who needs this, and when

Job stories, each from what we have, not from interviews (there are none):

| # | Job story | Source |
| --- | --- | --- |
| J1 | When a Run is running, I want to know at a glance whether it will reach a pull request within its time and budget, so I can leave it alone. | Owner, 2026-10-17 |
| J2 | When a Run is drifting, I want one sentence saying why, so I can decide to stop it, requeue it with a note, or let it finish. | Run 305; owner, 2026-10-17 |
| J3 | When a Run is about to hit a stop (idle, prompt limit, budget), I want to see it before it happens, so its work is not lost silently. | Run 305; ACP watchdog messages in `apps/unfold/public/core/states.js` |
| J4 | When several Runs run at once, I want the ones veering off to stand out from the ones on track, so my attention goes where it is needed. | Proxy: the Now view and the Needs-you list already sort by attention |
| J5 | When a Run has finished, I want to see when it started to drift, so the next ticket or the Team's limits can be fixed. | Proxy; Run 305 post-mortem |

Proxy ranking of the tasks, labelled as a proxy: J1 happens on every look at a running Run and must cost nothing; J2 and J3 are rarer and costlier when missed; J4 matters once more than one Team runs; J5 is review work.

**Frequency and cost.** J1 is frequent, so the badge must be readable without opening anything and must never ask for a click. A wrong "Off track" costs a person's attention; a missed one costs a Run's whole spend and its work. So the badge errs towards **Watch** (look, don't act) and keeps **Off track** for evidence that does not depend on judgement.

**What a person can do about it today.** Cancel the Run, requeue the Work Item with a note for the next Run (Ploeg's `requeue` and `notes` operator routes), or let it run. The badge does not add an action; it points at these. A "nudge the running agent" action is out of scope ([Unfold ADR 0023](../../apps/unfold/docs/adrs/0023-unfold-submits-work-to-ploeg-and-never-executes-it.md) keeps steering to the next Round).

## What the badge says

One badge next to the Run's state badge, plus one reason line in the Run's body. Words follow the screen vocabulary of [system ADR-0036](../adr/adr-0036-ploeg-and-unfold-use-one-vocabulary-with-named-screen-words.md); "in the pipe" stays the owner's phrase, not a label.

| Health | Tone (existing) | Glyph | Example reason line |
| --- | --- | --- | --- |
| **On track** | `success` | check | "Plan 3 of 6 at 38 of 90 min · US$0.31 of US$1.00 · last activity 20 s ago" |
| **Watch** | `attention` | eye | "A command has had no output for 6 min; the idle stop is at 10 min" |
| **Off track** | `danger` | warning | "Plan 1 of 6 at 70 of 90 min: at this pace the time limit comes first" |
| **Not judged yet** | `neutral` | dash | "Starting: health is shown once the agent has a plan or 5 min have passed" |
| **Not known** | `neutral` | question mark | "Ploeg did not report this Run's limits" |

Rules that come from the product UX floor, not from taste:

* Never colour alone: every state has a glyph and a word ([docs/browser-ui.md](../../apps/unfold/docs/browser-ui.md), status rule).
* The badge appears only while the Run runs. A finished Run's outcome takes over; the health history (J5) moves into the Run's body.
* Unknown inputs are named, never shown as zero or as "On track". A Run whose limits Ploeg did not report shows **Not known**, not a guess.
* The reason line names the numbers it used, so a person checks the verdict instead of trusting it.
* No toasts, no sound, no confirmation. A change to **Off track** is announced politely to screen readers once, not on every poll.

## The signals

Computed in the browser from facts the card already polls every 4 seconds, plus the Run's limits. Free, deterministic and testable with fixtures.

| Signal | Input | Watch when | Off track when |
| --- | --- | --- | --- |
| **Quiet** | Now minus the newest transcript entry's `at`, against the Run's idle limit | ≥ 50 % of the idle limit | ≥ 80 % of the idle limit |
| **Pace** | Plan steps completed (an in-progress step counts half) against the share of the prompt limit used, projected to the end | Projection overruns the limit by any amount, after 25 % of the limit | Projection overruns by ≥ 25 %, after 50 % of the limit |
| **Time** | Elapsed against the prompt limit | ≥ 75 % used | ≥ 90 % used and the plan's last step is not in progress |
| **Budget** | Observed spend against the authorized budget, only when `costStatus` is `observed` or `provisional` | ≥ 70 % | ≥ 90 % |
| **Repeat** | The same tool-call input three times in the last ten tool calls | three repeats | five repeats |
| **Tripwire** | The Run's tool calls against Unfold's tripwires (`public/live/guard.js`): orders aimed at agents in tool output, spreading them into the repository, remote code, credential reads, sandbox probes, hosts outside the brief, edits to the agent's own instructions | any medium hit | any high hit; the containment panel opens below the flight |

The worst signal wins; the reason line shows that signal's numbers and, in a tooltip, all of them. Thresholds live in one place, `healthThresholds` in `public/core/run-health.js`, and each is a named constant with a test, so changing one is a reviewed change ([Unfold ADR 0045](../../apps/unfold/docs/adrs/0045-unfold-records-the-run-card-rules-it-computes.md): a rule the card computes has a record).

Two things the signals deliberately do not try: they do not read what the agent says (that is the judge's job), and they do not score quality (the Run card's grade does that, after review).

### What Unfold needs from Ploeg

Unfold has `startedAt`, `authorizedUsd`, `costStatus`, `usage.costUsd`, the plan and every entry's time. It does not have the limits that stop a Run: the ACP `promptTimeout` (bronze: 90 min) and `idleTimeout` (10 min) exist only in the worker's configuration, and `expiresAt` on a Run is the heartbeat lease, not a limit. Ploeg ADR-0091 already records each Run's configuration (model, harness, plan); this RFC asks it to record and serve the limits the same way:

```json
"limits": { "promptSeconds": 5400, "idleSeconds": 600, "promptStartedAt": "2026-10-17T08:34:05Z" }
```

on the operator API's Run, set by the worker when the prompt starts. A Run from an older Ploeg has no `limits`; Unfold then shows **Not known** for Time, Pace and Quiet and still judges Budget and Repeat. This is a Ploeg change, proposed separately in ploeg-hq.

## The judge (off by default)

The signals cannot answer "is it still working on the ticket?". Run 305 was on the ticket the whole time; a Run that rewrites an unrelated module while every number looks fine is not. A model can read the ticket's acceptance conditions, the plan and the last stretch of transcript and say which.

**How it runs.** As a Ploeg Ask (ADR-0082): a read-only Run with no Shift, paid from the Team's periodic allowance, with a capped key Ploeg returns to Unfold. Unfold makes the call and finishes the Ask; Ploeg keeps no question. No new path to a model is added, and the judge's spend is never counted as the Work Item's delivery spend.

**What it reads.** The Work Item's title and acceptance conditions, the current plan, the last 40 transcript entries cut to 8 KB, and the signals above. Everything but the signals is untrusted text written by a tracker or an agent, and the prompt says so.

**What it may say.** Only a fixed shape: `{"health": "on_track" | "watch" | "off_track", "reason": "<= 160 characters", "evidence": [<transcript seq>, …]}`. Anything else is discarded. Unfold escapes the reason, shows the evidence as links to those transcript entries, and labels the line as the judge's.

**When it runs.** When the plan changes, when a signal turns to Watch, and otherwise at most every 10 minutes per Run; never after the Run finishes. At most 9 judgements per Run.

**What it costs.** One judgement is one small model call: the Ask spike measured about US$0.0002 per Ask on the Team's Ask model; the per-Ask cap is US$0.02. A 90-minute Run with 9 judgements costs well under US$0.02, inside the Team's monthly Ask allowance (default US$2). The switch is a Team setting (`cards.health.judge`, a flagd flag per [Unfold ADR 0043](../../apps/unfold/docs/adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md)), off by default, so nothing is spent until the owner turns it on.

**What it may not do.** The judge advises. It never stops, requeues, steers or grades a Run, and it never lowers a signal: when the signals say Off track and the judge says On track, the badge stays Off track and shows both. This is ADR-0096's rule for the shadow reader, applied here. The badge combines as: worst of the signals, then raised (never lowered) by the judge.

**Disclosure.** The judge's line carries an "AI" label announced to screen readers, its model name in a tooltip, and a "this was wrong" control that records the disagreement as a product event ([RFC-0001](rfc-0001-product-events-and-confusion-signals.md)), so its precision can be measured before anyone relies on it.

## States the card must handle

| State | Badge | Note |
| --- | --- | --- |
| Pending, not started | none | The state badge says Pending |
| Running, first 5 min, no plan | Not judged yet | Avoids an early false Watch |
| Running, plan and limits known | On track / Watch / Off track | The common case |
| Running, Ploeg sent no `limits` | worst of Budget and Repeat, else Not known | Older Ploeg |
| Running, transcript not loaded yet | the signals that need no transcript; the others say "loading its calls" | The page fetches the running Run's transcript itself; it never asks a person to open the Run first |
| Running, transcript unavailable (Claude Code harness, ADR-0090) | Time and Budget only; Quiet, Pace, Repeat and Tripwire say "no transcript" | `run.transcript.available` is false |
| Running, transcript poll failing | last health, greyed, "health as of 2 min ago" | Never a fresh verdict on stale data |
| Running, cost unknown | Budget not judged | Never treat unknown spend as zero |
| Judge on, Ask refused (allowance spent) | signals only, reason line says "judge paused: this month's allowance is spent" | |
| Judge on, judge failed or timed out | signals only, no judge line | Failure is quiet; signals still work |
| Finished | none; a "Health over time" strip in the Run's body | J5 |
| Earlier Runs ended by the machine | not counted | Infrastructure failures are not the agent's; the attempt shows them, the running Run's health does not |
| Demo mode | computed from demo data, labelled as demo; Quiet, Pace, Repeat and Tripwire say "the demo records no transcripts" | A demo never invents a judge call or a transcript |

Every one of these is a fixture-driven unit test in `test/run-health.test.mjs`, and `npm run test:workbench` checks the badge and the live view at 390, 768 and 1280 px, in light and dark and under reduced motion, on the demo and on local recordings.

## Revision 2026-10-18: what the live view taught

On 2026-10-17 the owner and Claude designed and built a live view of a running Work Item (Unfold PR #402) around this same Work Item 190. Building it against the real page in the component workbench ([Unfold ADR 0048](../../apps/unfold/docs/adrs/0048-components-are-built-and-checked-in-a-workbench-outside-the-app.md)) taught seven things, and the owner asked on 2026-10-18 to apply them here:

1. **Name why calls are missing.** "Not loaded yet", "no transcript from this harness" and "the demo records no transcripts" are three different facts. Reading a Run as quiet because its transcript was not fetched yet is a false alarm the first build made; the page now fetches the running Run's transcript itself.
2. **The machine is not the agent.** Run 305's Work Item lost six Runs to machines before Run 305 started. Those count in the attempt, never in the running Run's health.
3. **Containment is health.** A Run that reads injected orders, goes after credentials or edits its own instructions is off track whatever its pace. The Tripwire signal joins the table; a high hit is Off track, with the containment panel naming each call.
4. **One function, two places.** The badge on the Run's row and the live view read the same `runHealth` result, so the page cannot say two things about one Run.
5. **The judge stays an Ask.** A first sketch had a judge that could abort a Run through a new Ploeg event. That is dropped: the judge advises, may only raise the badge, and never stops anything.
6. **Never On track for lack of evidence.** Without Ploeg's limits the progress signals (Quiet, Time, Pace) cannot be judged; then a Run with nothing off reads **Not known**, with the reason naming what could not be judged. A Run is On track only when at least one progress signal was judged.
7. **Every mark means something.** Each state, signal and mark has an entry in the meaning ledger (`public/live/meaning.js`) saying what it means, where its data comes from and whether that is real, derived or proposed; a test fails on any mark the ledger does not explain.

Run 305's two moments are fixtures in the workbench: Watch at 09:17 (quiet 6 of 10 min, pace overrun) and Off track at 09:19 (quiet 8 of 10 min), both with the proposed `limits`.

## Options considered

**(a) Signals in the browser, judge as an Ask, off by default (recommended, chosen by the owner).** Free by default, testable, no new service, and the judge's cost and trust are measured before anyone leans on it.

**(b) Signals only.** Cheapest, but cannot tell "slow and on task" from "fast and off task". It stays the fallback when the judge is off.

**(c) Judge always on.** Better answers sooner, but spends without the owner's OK, and trusts a model's verdict before its precision is known.

**(d) Ploeg computes health and acts on it** (for example, lengthens the idle limit while a known-slow command runs, or stops a Run that is off track). That changes what a Run does, which is Ploeg's decision and needs its own ADR. This RFC only shows; the data it collects (judge verdicts against outcomes) is what such a decision would need.

## How we will know it works

* **Early warning:** of Runs that end by a watchdog or the prompt limit, the share whose badge showed Watch or Off track at least 5 minutes before the stop. Target: most of them. Run 305 would have been one.
* **False alarms:** of Runs that ended in a pull request, the share that showed Off track at any point. Target: rare.
* **Judge precision:** "this was wrong" clicks against judgements shown, and the judge's verdicts against Run outcomes, per model.
* **Cost:** judge spend per Team per month against its allowance.

Each comes from product events Unfold already records ([RFC-0001](rfc-0001-product-events-and-confusion-signals.md)) plus one new event, `run.health.changed`, with the old and new health, the deciding signal and the Run id; never transcript text.

## Plan

1. **Ploeg:** record and serve `limits` on the operator API Run (ploeg-hq change and ADR, extends ADR-0091).
2. **Unfold, signals:** `runHealth({ run, transcript, plan, now, limits, judge, tripwires })` in `public/core/run-health.js`, the badge and reason line on each running Run's row behind the `work.run-health` Labs flag, the same result in the live view (`work.live-view`), fixtures, tests, workbench stories and `run.health.changed`. Works without step 1, showing Not known for the time-based signals.
3. **Unfold, judge:** the Ask call, the verdict shape and its validation, the AI line, the Team flag off by default.
4. **Later, separately:** the "Health over time" strip (J5), and a Needs-you entry for Runs that are Off track (J4).

## Open questions for the owner

1. Is **On track / Watch / Off track** the wording, or should the badge borrow the owner's "in the pipe"?
2. Should **Off track** also list the Run in Needs you, or stay on the card until the strip and the list are designed (step 4)?
3. When the judge is turned on, on which Team first: bronze (cheapest model, most Runs) or all Teams at once?
