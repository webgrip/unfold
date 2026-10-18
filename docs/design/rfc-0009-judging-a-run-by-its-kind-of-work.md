# RFC-0009: Judging a Run by the kind of work it does

> Status: **Proposed** 2026-10-18; owner answered the open questions the same day (see [Owner decisions](#owner-decisions)); steps 0 and 1 built on branch `feat/run-activity` (see [Plan](#plan)) · Owner request (2026-10-18, on the Work Item page of [Work Item 242](https://unfold.webgrip.dev/#work/242)): "I feel like we could categorize work being done here, and get different kinds of decision / judge on progress, configurable etc via the best way we can think of, let's properly design this to be a coherent thing, something that REALLY makes sense" · Builds on: [RFC-0007](rfc-0007-run-health.md) and [Unfold ADR 0046](../../apps/unfold/docs/adrs/0046-a-running-runs-health-is-computed-from-its-own-facts-and-a-judge-only-advises.md) (Run health), [RFC-0008](rfc-0008-decision-models.md) and [ADR-0042](../adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md) (the decider and the tripwire), [Unfold ADR 0043](../../apps/unfold/docs/adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md) (flags), Ploeg ADR-0082 (Asks), ADR-0096 (a shadow reader never acts), ADR-0123 (premise check)
>
> **TL;DR.** Today Unfold asks one question of every running Run, "on track?", with one set of thresholds, whatever the work is and whatever the agent is doing. That is why a Run that has read code for 16 minutes without changing a file gets an "AI · on track". This RFC splits the question into three that each have a cheap, checkable answer: **what kind of work is this** (the Work Kind, set once per Run), **what is the agent doing now** (the Activity of each tool call, from the command it ran), and **is that what this kind of work should look like at this point** (Expectations per Work Kind, learned from the Team's own finished Runs). Every judgement Unfold makes, from the free signals to the tripwire and the judge model, becomes an entry in one **check registry** with the same fields: what it asks, when, who answers, what shape the answer has and what it may do. Teams configure which checks run and how much authority each has, and a check earns more authority only from measured precision. Everything stays free: rules first, the free decider second, the judge model only when something cheaper tripped.

## The problem, from one Run

[Work Item 242](https://unfold.webgrip.dev/#work/242) ([VIK-2240](https://vikunja.webgrip.dev/tasks/2240)) asked bronze to carry a session's failure detail to Ploeg and the Work Item page. The ticket is small and specific: its header says `effort S · time hours · unc low`, and its Approach names three files with the lines to change. Its Run 381, on 2026-10-18 from 19:26 UTC, as the page showed it at 19:43:

| What the page showed | What it meant |
| --- | --- |
| 95 calls, nearly all in the **Shell** lane | OpenHands runs everything through the shell, so `cat AGENTS.md` and `sed -i` both read as Shell. The lane names the mechanism, not the work. Most of the 95 were reads. |
| **2 moves** | Moves split on a pause of more than 2 minutes or an agent stage entry; this agent writes neither, so 16 minutes of work is two blocks. |
| **0 files changed**, 16 min airborne | For a small change whose files are named in the ticket, 16 minutes of reading is long. Nothing on the page said so. |
| **AI · on track** | The judge read the last 40 entries and answered the only question it is asked. The agent was on the ticket, so "on track" was not wrong, just useless. |
| A line at 19:27 in the transcript: "the fix for logging session failures may have already landed" | The agent noticed [#472](https://forgejo.webgrip.dev/webgrip/unfold/pulls/472), merged at 18:37 UTC, which logs the failure detail but does not send it to Ploeg. A doubt about the ticket's premise, raised in the first minute, and visible only to someone reading the transcript. |

Each of the three missing answers needs a different kind of judgement:

* **What were the calls?** A classification of each call, from its command. A rule answers most of them; nothing needs a model.
* **Is 16 minutes of reading too long?** A comparison with how this Team's small changes usually go. That is arithmetic over past Runs, the same arithmetic the landing estimate does ([#475](https://forgejo.webgrip.dev/webgrip/unfold/pulls/475), not merged) for the Approach leg.
* **Did the agent doubt the premise?** A yes/no question about what the agent wrote. The decider answers that for free.

The judge model is the right tool for none of the three. It is the right tool for the question that follows from them: "it has read for 16 minutes with no change; is that justified for this ticket?"

The minutes in this section are from one Run. How long small changes on bronze usually explore before their first change is not measured yet; step 0 of the [plan](#plan) measures it before any threshold is set.

## Three questions, answered in layers

```text
Work Kind     what kind of work is this?            once per Run       rules, then the decider, a person may correct it
Activity      what is the agent doing right now?    every tool call    rules, then the decider for what rules cannot place
Expectation   is that what this kind should look    every health read  arithmetic over the Team's own finished Runs
              like at this point?
   └── Checks the questions asked of all three, from one registry, each with its answerer, its trigger and its authority
```

Each layer only uses the ones above it, and each can be wrong on its own and corrected on its own.

### Work Kind

What a Run is expected to produce, and so what progress means for it. Set when the Run starts and shown as a chip next to the Role. Work Kinds come in five families (owner, 2026-10-18: "more granular is okay"); a kind shares its family's defaults and Expectations until it has enough finished Runs of its own.

| Family | Work Kind | Expected result | Progress looks like | Set from |
| --- | --- | --- | --- | --- |
| **Change** | **Feature** | a diff and a pull request | orient, explore, change, verify, ship | the default for a writing Role; a `feature` label |
| | **Fix** | a diff with a test that failed before | explore, reproduce (verify), change, verify, ship | a `bug` or `fix` label, a conventional `fix:` title |
| | **Refactor** | a diff that keeps behaviour | change and verify in many short cycles | a `refactor` label or title |
| | **Docs** | a diff to documentation only | explore, change, the docs check, ship | a `docs` label or title, or every named file under a `docs/` directory |
| | **Tests** | a diff to tests or CI only | change, verify, ship | a `test` or `ci` label or title |
| **Chore** | **Dependency** | a version bump | a change within minutes, then verify | Renovate's author, a `dependencies` label |
| | **Config** | a setting, a value, a rename | a change within minutes, then verify | a `chore` or `config` label, or Size S with named files |
| **Repair** | **Repair** | a diff that answers review findings | orient on the findings, then change soon | a fix Round after `request_changes` (Ploeg ADR-0017) |
| **Investigate** | **Spike** | a finding and a recommendation; a diff is optional | explore, try (setup, verify), write findings | a `spike` label or title |
| | **Research** | findings or a proposal, no code | explore, write findings | a `research` label or title |
| **Review** | **Review** | a Verdict | orient, explore, verify; never change | a reading Role |

The rules run first: the Role, the Round, the pull request's author, tracker labels and Size. When they leave it open, the decider answers one choice question over the title and description ("which of these is the work?"), and the chip says it was guessed. A person can correct the chip on the page; the correction is recorded with their name and becomes a test case for the rules.

Work Kind is not [Size](../reference/glossary.md#size): Size says how big, Work Kind says what shape. Expectations use both.

### Activity

What one tool call does, read from the command, not from the harness's tool name. Consecutive calls of the same Activity form a move, so moves stop depending on pauses and on whether a harness writes stage entries.

| Activity | Recognised by (first match wins, examples) |
| --- | --- |
| **Orient** | reading the instructions and the briefing: `AGENTS.md`, `CLAUDE.md`, `$PLOEG_KNOWLEDGE_DIR`, notes, the board file, the ticket |
| **Explore** | reading and searching code and history: ACP `read`/`search`, `cat`, `head`, `sed -n`, `rg`, `grep`, `ls`, `find`, `git log`/`show`/`diff`/`status` |
| **Change** | ACP `edit`/`delete`/`move`, `apply_patch`, `sed -i`, a redirect or `tee` into a tracked file, a file-writing heredoc |
| **Verify** | the repository's test, build, lint, type or verify commands: `mise run verify`, `$PLOEG_VERIFY_SCRIPT`, `npm test`, `go test`, `tsc` |
| **Ship** | `git commit`, `git push`, opening a pull request, writing the outcome file |
| **Setup** | installing or repairing the environment: `mise install`, `npm ci`, `apt`, `pip install`, fixing a tool |
| **Wait** | `sleep`, polling CI or a pod |
| **Other** | anything the rules do not place |

A chained command (`a && b | c`) takes the strongest Activity in it, in the order Change, Ship, Verify, Setup, Wait, Explore, Orient. A file written under `/tmp` is the agent's scratch, not a Change; one drafting a pull request body there is Ship. A short interruption (at most 2 calls within 60 s) between two stretches of one Activity stays in that move, except a Change, Verify or Ship call, which always shows. An **Other** call goes to the decider as one choice question, at most one call per Run per minute so the decider key's 10 requests a minute hold, and its label says it was guessed. The rules live in one pure module shared by the browser and the server, next to `run-health.js`, with a fixture per rule.

What changes on the page: the trace's lanes become Orient, Explore, Change, Verify, Ship and Setup, with the harness's tool name in each tick's tooltip; Failed stays a mark on its tick. "Inside Builder · Run 1: 2 moves, 95 calls" becomes "Explore 14 min · Orient 2 min · no change yet".

### Expectations

For each Work Kind, the shape a Run of that kind usually has on this Team. Five numbers, each a median and a p90 over the Team's finished Runs of that Work Kind and Role that ended well (`pr_opened` for writing Roles, a Verdict for reading ones):

| Expectation | Meaning | Example for Change |
| --- | --- | --- |
| `orient` | minutes in Orient before anything else | p90 3 min |
| `firstChange` | minutes until the first Change | p90 from history; none for Investigate and Review |
| `share` | the most of the Run one Activity takes | Explore at most p90 of the history's Explore share |
| `cycles` | Change then Verify rounds before Ship | p90 from history |
| `verifyBeforeShip` | a Verify after the last Change before Ship | required for Change, Chore, Repair |

They are computed the way the landing estimate is: from `/api/ploeg/runs` and the stored transcripts, at least 5 Runs before a learned number is used, otherwise the configured default, and a configured value always wins over a learned one. The page shows which it used: "small changes usually start changing by min 6 (p90 9, from 23 Runs)" or "(default; 2 Runs so far)".

With Expectations, Run health gains five signals beside RFC-0007's six, computed in the same function, with the same Watch and Off track words:

| Signal | Watch when | Off track when |
| --- | --- | --- |
| **Overstay** | the current Activity is past its p90 | past twice its p90 |
| **First change** | no Change past the Work Kind's p90 | past twice its p90 |
| **Order** | Ship without a Verify after the last Change | a push without a Verify |
| **Churn** | Change and Verify cycles past p90 | past twice p90 |
| **Out of role** | a Change in a Review Run, or a write to a ticket's protected area | the same, twice |

For Run 381 at 19:43 that gives: Kind Change (Size S, files named), Activity Explore for about 14 minutes, **First change: Watch**, with the reason "Exploring 14 min, no change yet; small changes on bronze usually start changing by min N". N is whatever step 0 measures.

## Checks: every judgement in one registry

Run health signals, the five tripwire checks, the judge and the premise check are four judgements built four ways. This RFC gives them one shape:

| Field | Meaning | Values |
| --- | --- | --- |
| `key` | the check's name | `first_change`, `reads_credentials`, `already_done`, … |
| `asks` | the question, in words | "Does the agent say the work may already be done?" |
| `of` | what it reads | a call, a move, the Run, the Work Item |
| `when` | what starts it | every call, an Activity change, a signal turning Watch, before the Run |
| `appliesTo` | which Work Kinds and Activities | `kinds: [change, chore]`, `activities: [orient, explore]` |
| `answeredBy` | who answers | `rule` (free, deterministic), `decider` (free, typed), `judge` (a model writing a reason, through an Ask) |
| `answer` | the shape | `health` (On track, Watch, Off track), `score` 0 to 3, `choice`, `yes_no` |
| `authority` | what the answer may do | `record`, `show`, `needs_you`, `stop` |

The existing judgements as entries:

| Check | of | when | answeredBy | answer | authority today |
| --- | --- | --- | --- | --- | --- |
| Quiet, Pace, Time, Budget, Repeat, Tripwire ([RFC-0007](rfc-0007-run-health.md)) | Run | every health read | rule | health | show |
| Overstay, First change, Order, Churn, Out of role (this RFC) | Run | every health read | rule | health | show |
| `reads_credentials` and the other four ([RFC-0008](rfc-0008-decision-models.md)) | call | every call | decider | score | show |
| Premise check (Ploeg ADR-0123) | Work Item | before the Run | Ploeg's free model | yes_no | Ploeg's own |
| The judge (RFC-0007) | Run | today on a 10-minute timer | judge | health | show |

New checks this design makes possible, each free:

| Check | asks | of | when | answeredBy |
| --- | --- | --- | --- | --- |
| `already_done` | Does the agent say the work may already be done, or overlaps other work? | the agent's messages | an Orient or Explore move ends | decider, yes_no |
| `off_brief` | Is this move about something the ticket does not ask for? | a move | a move ends | decider, score |
| `explain_overstay` | "It has been in Explore for 14 min with no change; the ticket names its files. Is that justified, and what is it looking for?" | the Run | Overstay or First change turns Watch | judge, health with a reason |

The judge changes the most. It stops running on a timer to answer a vague question, and runs when a rule or the decider has tripped, with that check's numbers in its prompt, to answer that specific doubt. That is RFC-0008's rule, "decide cheaply, explain only when something trips", applied to every judgement. For Run 381 the page would have said, by 19:28, "The agent thinks #472 may already do this" (from `already_done`), and around minute 10, a reasoned line on whether the long read was justified.

### How answers combine

As ADR 0046 says: the badge is the worst rule signal, raised and never lowered by a decider or judge check with `show` or more. The reason line leads with the deciding check and its numbers; the tooltip lists every check that ran, who answered and when. A decider or judge answer always carries its "AI" label, its model and the "this was wrong" control.

### Authority is earned

Every check starts at `record` (stored, visible on the config page) or `show` (on the Work Item page). The one exception is `already_done`, which the owner put at `needs_you` from the start (2026-10-18): it asks nothing of the Run, only that a person look at the premise. It moves up one step only when the owner promotes it for a Team, and the config page shows what that decision rests on: the right and wrong marks it has had, its precision, and how many Runs it fired on.

| Authority | Effect | Needs |
| --- | --- | --- |
| `record` | stored and counted, shown only on the config page | nothing |
| `show` | on the Work Item page and the flight path | nothing |
| `needs_you` | the Work Item is listed in Needs you with the check as the reason | the owner's promotion, after at least 20 marked answers |
| `stop` | the Run is withdrawn by the named service actor `tripwire` | the owner's promotion, and the Ploeg ADR-0108 amendment RFC-0008 already needs |

Nothing in this RFC lowers a Ploeg rule or makes Ploeg aware of Unfold: a stop is Ploeg's generic service-actor action, which Unfold calls like any operator consumer.

## Configuration

One `judgement` block per Team in Unfold's configuration (chart values), with shipped defaults, so a Team with no block behaves as today plus the free rule signals. Each check is also a flagd flag ([Unfold ADR 0043](../../apps/unfold/docs/adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md)), `checks.<key>`, so it can be rolled out per Team or switched off without a release.

```yaml
judgement:
  teams:
    bronze:
      kinds:
        dependency: { labels: [dependencies], authors: [renovate] }
        spike: { labels: [spike] }
      expectations:
        change: { firstChange: { p90Minutes: 12 } }   # pins one number; the rest are learned
      checks:
        already_done: { authority: needs_you }   # owner decision 2026-10-18
        off_brief: { authority: record }
        explain_overstay: { authority: show }
        reads_credentials: { authority: show }
```

A read-only page, **Settings → How Unfold judges**, shows per Team: the Work Kinds and how each is recognised, the Expectations with their numbers and whether each was learned or configured, and each check with who answers it, its authority, its precision so far and its spend. Editing on that page comes later; until then a change is a reviewed configuration change, as ADR 0045 asks for a rule a card computes.

Why Unfold and not Ploeg's Team manifest (Ploeg ADR-0110): judging is Unfold's job (ADR 0046) and Ploeg never calls a model (Ploeg ADR-0082). If another Ploeg consumer later wants Work Kinds or Expectations, they become Ploeg's own contract then, defined without naming Unfold.

## Corrections

Every answer a person can see can be corrected where they see it: a Work Kind chip, an Activity label on a tick, a check's line. A correction is stored with the person and the version of the rule that made the mistake. Corrections do not change behaviour live; they show up as failing fixtures in the rule tests and as precision on the config page, and someone changes the rule in a reviewed change. That keeps every verdict explainable by a rule version.

## What it costs

| Part | Answered by | Price |
| --- | --- | --- |
| Work Kind, Activity, Expectations, the new signals | rules and arithmetic | free |
| Activity for Other calls, `already_done`, `off_brief`, a guessed Work Kind | the decider (Hetzner's free Qwen, later Strands on a soyo node) | free, within the decider key's 10 requests a minute |
| `explain_overstay` and the judge | the judge, through an Ask on Hetzner's free models | free model; fewer Asks than today, because it runs on a trip, not a timer |

No paid model is called; no check falls back to one.

## What this is not

* Not a grade: the Run Card grades quality after review.
* Not steering: no check talks to the running agent ([Unfold ADR 0023](../../apps/unfold/docs/adrs/0023-unfold-submits-work-to-ploeg-and-never-executes-it.md)).
* Not a Ploeg change, except the stop that RFC-0008 already asks for.

## States the page must handle

| State | Shows |
| --- | --- |
| A Team with fewer than 5 finished Runs of a Work Kind | Expectations from defaults, labelled "default" with the count |
| Work Kind guessed by the decider | the chip says "guessed"; a person can correct it |
| A harness without a transcript (Claude Code `-p`) | no Activity, no Expectations; RFC-0007's Time and Budget only |
| Decider down | Other calls stay Other; decider checks show "not asked"; rule signals unchanged |
| Demo | computed from demo transcripts, labelled demo; no decider or judge call |
| Finished Run | the Activity strip and every check's answers in the Run's body (RFC-0007's J5) |

## Options considered

**(a) Three layers and one check registry (recommended).** Most of the answers are free and testable; the models are asked narrow questions; one place to configure and measure every judgement.

**(b) Give the judge more context and keep one question.** One prompt change, and the judge would likely have flagged Run 381. But its answer stays a sentence on a timer, nothing is learned per Work Kind, and the trace still says Shell.

**(c) Let the decider classify every call.** No rules to write, but about 100 calls a bronze Run against a 10-requests-a-minute key, answers that differ between runs of the same input, and a label nobody can trace to a rule.

**(d) Ploeg judges and enforces.** Ploeg never calls a model, and a Run's judgement is not something every Ploeg consumer needs.

## How we will know it works

* **Activity accuracy:** corrected Activity labels against all labels shown; target fewer than 1 in 20 after a week.
* **Early warning:** as RFC-0007, plus the share of Runs that ended without a pull request where a First change or Overstay signal showed at least 10 minutes before the end.
* **False alarms:** Runs that ended in a pull request but showed Off track from an Expectation.
* **Judge usefulness:** "this was wrong" against `explain_overstay` answers, compared with the timer judge's rate before.
* **Premise doubts:** `already_done` hits against Work Items later closed as duplicates or as already done.

## Plan

0. **Measure (done 2026-10-18).** `apps/unfold/scripts/activity-report.mjs` reads an export of Ploeg's Runs and transcript entries and prints each Run's Activity split, moves and minutes to first Change. Ploeg has kept transcripts since 2026-10-17: 34 Runs, 8 of them with tool calls (the others ran a harness without a transcript), 438 calls. What it found:
   * The rules place 92 % of the calls. The 35 left as Other are 9 interrupts (`C-c`), 2 plan entries and the agent's own scratch scripts under `/tmp`.
   * Only two builder Runs ended in a pull request, Runs 360 and 376, both small docs changes: first change after 1 and 2 minutes, about 7 minutes in all.
   * Run 381 (the Run in [The problem](#the-problem-from-one-run)) at 28 minutes: 127 calls, 99 % Explore, no change.
   * The two CI-speed Runs that failed (305, 306) spent 74 % and 57 % of their time exploring; their first change came at 28 and 7 minutes.

   Two well-ended Runs are far below the 5 per Work Kind that learning needs, so step 3 starts from configured defaults, and the script runs again once each Work Kind has 5.
1. **Activity (built 2026-10-18, not released).** The pure classifier `public/core/activity.js` and its fixtures, Activity lanes and Activity moves on the trace, the Activity chip on each move, and the one-line summary ("Explore 29 min · Orient 19 s · no change yet · 127 calls"). Free, and needs no flag beyond the page's existing ones.
2. **Work Kind.** Rules, the chip, the correction; the decider question for what the rules leave open.
3. **Expectations.** Learned numbers and the five new signals in `run-health.js`.
4. **The check registry.** Health signals, tripwire and judge as entries, the `judgement` configuration, the `checks.<key>` flags, the read-only config page.
5. **New decider and judge checks.** `already_done`, `off_brief`, `explain_overstay`; the timer judge retires once `explain_overstay` has a week of answers.
6. **Authority.** `needs_you` per check on the owner's promotion; `stop` after RFC-0008's Ploeg amendment.

Each step is its own pull request and shows something on its own; step 1 alone fixes the "Shell, 2 moves" trace.

## Owner decisions

Answered 2026-10-18:

1. **Work Kinds:** more granular is fine. The five became families with eleven kinds ([Work Kind](#work-kind)).
2. **Activity names:** Orient, Explore, Change, Verify, Ship, Setup, Wait and Other are the lane words.
3. **`already_done`** starts at `needs_you`: a doubted premise goes to Needs you at once, since it is cheapest to answer early.
4. **The timer judge** retires once `explain_overstay` has a week of answers.
5. **Steps 0 and 1** ship together in one pull request.
