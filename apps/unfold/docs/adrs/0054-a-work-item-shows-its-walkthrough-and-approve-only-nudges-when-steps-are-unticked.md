---
status: proposed
date: 2026-10-18
decision-makers: Ryan Grippeling
review-by: 2027-01-31
---

# A Work Item shows its Walkthrough, and Approve only nudges when steps are unticked

## Context and Problem Statement

On 2026-10-18 the owner said: "I want to have something tangible for a non-technical person when they look at what has been done. I want a clear test path defined or something for if they need to do that as the hitl."

Today a Work Item that waits for review shows the Problem and solution card ([Ploeg ADR-0042](../../../ploeg/docs/adrs/0042-a-writing-run-reports-the-problem-and-solution-a-reviewer-reads.md)) and a checklist of review questions. How to check the change sits in a folded developer section. Ploeg ADR-0125 (proposed, ploeg-hq #185) lets a writing Run report a Walkthrough: plain steps, each with a screenshot the agent took while walking it.

How does Unfold show a Walkthrough to a person who does not read code, and what does Approve do when they have not tried the steps?

## Decision Drivers

* Owner, 2026-10-18: screenshots only for now, no preview environment per pull request.
* Owner, 2026-10-18: Approve nudges when steps are unticked and never blocks.
* Owner, 2026-10-18: a change with nothing to see says so plainly, never with a staged screenshot.
* The Walkthrough is the agent's own account. The page says who wrote it, as the Problem and solution card does.
* Unfold reads what Ploeg serves and talks to no forge for it.
* The page's Content-Security-Policy forbids inline styles.

## Considered Options

* **A "What it looks like" gallery and a "Try it yourself" checklist under the Problem and solution card, with per-person ticks and a nudge on Approve**
* The gallery only, without ticks
* Approve disabled until every step is ticked

## Decision Outcome

Chosen option: "**a gallery and a checklist under the Problem and solution card, with per-person ticks and a nudge on Approve**", because it gives a non-technical reviewer something to look at and something to do, and leaves the decision to them.

1. **Gallery.** Under the Problem and solution card, "What it looks like" shows the newest writing Run's Walkthrough: each step's screenshot with its "do" and "you should see" text. It names the Role and Round that wrote it and says to check it against the pull request. A Walkthrough with `noVisibleChange` shows that reason instead of a gallery. Without a Walkthrough the section is absent.
2. **Stale.** When Ploeg marks the Walkthrough stale, a notice above the gallery says the screenshots were taken before the latest push.
3. **Checklist.** "Try it yourself" lists the same steps with a tick box each. Ticks are stored per person and Work Item in Unfold's database and are kept for the Walkthrough's Run. A newer Walkthrough starts with no ticks.
4. **Images.** Unfold's server fetches each screenshot from Ploeg's operator API with its own credential and serves it to a signed-in person who may read the Work Item, with the stored media type and a cache lifetime of one day. The browser never talks to Ploeg.
5. **Approve.** When a person approves a Work Item whose Walkthrough has unticked steps, the confirmation says "You haven't tried N of M steps" and offers "Approve anyway" and "Go back". Approve is never disabled. `unfold_approve_work` puts the same count in its confirmation.

### Consequences

* Good, because a product owner or a client sees what changed and has steps to repeat.
* Good, because ticks show who tried what, without becoming a gate nobody can pass when a step cannot be repeated.
* Bad, because without a preview environment a person can repeat steps only where the change already runs, for example on staging after merge. Accepted: the owner chose screenshots first, and the gallery is useful on its own.
* Bad, because ticks are the person's own word, not proof they tried the step. Accepted: they inform the nudge and decide nothing.

### Confirmation

* `npm test` in `apps/unfold`: parsing the Walkthrough from a Ploeg Run with and without the fields, the tick store keyed by person, Work Item and Run, the image proxy's permission check, media type and refusal of another Work Item's Run, and the nudge count in `unfold_approve_work`'s confirmation.
* Workbench stories for the gallery with screenshots, stale, no visible change and absent, checked by `npm run test:workbench`.
* A browser test that ticks a step, reloads and sees it ticked, and approves through the nudge.
* All of it runs through `mise run verify`.

## Pros and Cons of the Options

### The gallery only, without ticks

* Good, because it is smaller.
* Bad, because the owner asked for a test path the person in the loop follows, and without ticks Approve cannot say what was skipped.

### Approve disabled until every step is ticked

* Good, because nobody approves without looking.
* Bad, because the owner chose a nudge: some steps cannot be repeated before merge, and a forced tick teaches people to tick without trying.

## Re-evaluation triggers

* A preview environment per pull request becomes available, so steps can link to a running copy.
* People approve through the nudge on most Work Items, or ask for ticks to be required on some Teams.
* Ploeg ADR-0125 is rejected or changes the Walkthrough's shape.

## More Information

* Tickets VIK-2230 (gallery and checklist) and VIK-2231 (the nudge), under epic VIK-2226. OpenSpec change `add-review-walkthrough`.
* 2026-10-18: proposed, from the owner's request and answers the same day.
