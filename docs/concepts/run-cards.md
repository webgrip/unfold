---
type: explanation
audience: [owner, operator, contributor, agent]
owner: unfold
last_verified: 2026-10-02
verified_by: "built parts read against Ploeg ADR-0045, ADR-0046, ADR-0047, ADR-0049, ADR-0057 (apps/ploeg/pkg/flow) and ADR-0058 (apps/ploeg/pkg/playkpi), Vloer ADR 0026, apps/ploeg/pkg/store/card.go and apps/vloer/public/cards on development @ 810c97a; binders, packs and seasons read against Vloer ADR 0029 and apps/vloer/src/{collection,packs,season}.ts on feat/vloer-binder-packs; proposed parts checked against the owner's design page and card contracts of 2026-10-01; the Vloer collection was run in its demo browser flow"
---

# Run Cards

A **Run Card** is the record of one Work Item's change and its life in production. It shows who carried the change, what its Runs cost, which pull requests it took, how review and CI went and where it is deployed. Over time it is meant to show how well the change held up. It makes caring about a change visible, and it is meant to be fun.

**Most of this page is a proposal.** Ploeg already assembles a card for every Work Item and Vloer draws it, with days live and a finish. Ploeg computes rarity; Vloer does not show it yet. Everything else below is labelled **Proposed** and is not built. The [glossary](../reference/glossary.md) defines each **bold** term.

## A record of a change, not a score of a person

The research behind Run Cards draws one line ([gamification evidence](../research/2026-10-01-run-cards-gamification-evidence-and-law.md)):

* A card that records a change and how it holds up in production makes people care about their changes.
* A card that scores a person, through ranks, totals or streaks, makes people game it. In a Dutch company it also needs the works council's consent, and at scale a data protection impact assessment (DPIA).

So every number on a card describes the change. The person appears only as its **Steward**, the one who answers for it. Four consequences follow:

* **Ownership comes from signing, provenance and mending, not from points.**
* **Card state never gates anything.** Grade, rarity and finish never change what Ploeg authorizes, budgets or merges. A card reports outcomes; it does not decide them.
* **Nothing on a card is bought, traded or tied to pay.** Card data is never used in pay or performance reviews.
* **Nobody is ranked.** No shared view totals card data per person.

## What is built and what is proposed

The first three build phases are merged on `development`: P0 keeps the facts a card needs, P1 puts the card on the Work Item page, and P2 adds life in production. Their ADRs still have the status `proposed`. Later phases (cracks and mends, epics and full ceremony) are not started; the skins are built and draw grades, cracks and sets when a card carries them. The Vloer side of Binders, Packs and seasons is built against fixtures, waiting for Ploeg's card list.

| Part | State | Where it is recorded |
| --- | --- | --- |
| Ploeg keeps every usage figure a harness reports, and every merge and review fact a forge reports | Built; its ADR is still proposed | [Ploeg ADR-0045](../../apps/ploeg/docs/adrs/0045-keep-run-usage-and-merge-facts.md) |
| One card per Work Item, assembled from stored facts: state, Plays, Steward (fallback rule), Roster (merger and reviewer), agent crew, totals, events, diff size and CI | Built; ADR proposed | [Ploeg ADR-0046](../../apps/ploeg/docs/adrs/0046-a-run-card-is-assembled-per-work-item-from-stored-facts.md) |
| Card style chosen per Work Target (`cardStyle`) | Built; seven skins: Vloer Native, the 3D forge skin and five DOM skin packs | Ploeg ADR-0046, Vloer ADR 0026 and 0028 |
| A generic deploy endpoint, deployments per environment and the release time | Built; ADR proposed | [Ploeg ADR-0047](../../apps/ploeg/docs/adrs/0047-ploeg-learns-where-a-merged-change-is-deployed-from-a-generic-deploy-endpoint.md) |
| Usage so far while a Run is running | Built; ADR proposed | [Ploeg ADR-0049](../../apps/ploeg/docs/adrs/0049-a-run-card-reads-the-gateway-for-usage-so-far-while-a-run-is-running.md) |
| The `<unfold-card>` runtime, the Vloer Native skin, the card on the Work Item page, days live, the finish ladder and a demo card | Built; ADR proposed | [Vloer ADR 0026](../../apps/vloer/docs/adrs/0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md) |
| A card comment on the pull request: the card as a static image above a summary table, kept as one comment and updated at a merge, a release to production, a new finish or a mend. A team turns it on with `cards.prComment` | Built; ADR proposed; off by default | [Ploeg ADR-0055](../../apps/ploeg/docs/adrs/0055-ploeg-keeps-one-card-comment-with-a-static-card-image-on-the-pull-request.md) |
| Rarity: a challenge score, predicted at mint, revealed and frozen at release, tiered per project and quarter | Built in Ploeg; ADR proposed; Vloer still drops it | [Ploeg ADR-0056](../../apps/ploeg/docs/adrs/0056-a-run-cards-rarity-is-its-challenge-predicted-at-mint-and-frozen-at-release.md) |
| Flow figures: time in every tracker status, lead and cycle time, flow efficiency, blocked time, reopens, queue and agent time, merge to each environment and time to mend, in elapsed and working seconds | Built in Ploeg; ADR proposed; Vloer shows them (Vloer ADR 0035) | [Ploeg ADR-0057](../../apps/ploeg/docs/adrs/0057-a-run-cards-flow-figures-come-from-every-recorded-tracker-status-and-a-team-calendar.md) |
| Pull request, CI and change figures: time to first feedback, approval and merge, review rounds, comments, commits, CI runs, reruns, queue and minutes, indentation complexity, test ratio | Built in Ploeg; ADR proposed; Vloer shows them (Vloer ADR 0035) | [Ploeg ADR-0058](../../apps/ploeg/docs/adrs/0058-a-run-cards-pull-request-ci-and-change-shape-figures-are-read-from-the-forge-and-kept-per-play.md) |
| Key figures: time in every tracker status, lead and cycle time, flow efficiency, time to first feedback, CI timings and reruns, indentation complexity, merge to production; three or four on the card's front for its state, the rest on its back, team medians on the season page | Built in Vloer on Ploeg ADR-0057 and ADR-0058; ADRs proposed | [Vloer ADR 0035](../../apps/vloer/docs/adrs/0035-run-cards-lead-with-three-or-four-kpis-for-their-state-and-keep-the-rest-on-the-back.md) |
| Binders, Packs with published odds and stored cosmetic pulls, the pack ceremony and team season pages | Vloer side built against the card contract and fixtures; ADR proposed; Ploeg's card list built in parallel | [Vloer ADR 0029](../../apps/vloer/docs/adrs/0029-binders-packs-and-pulls-collect-run-cards-privately-and-fairly.md) |
| Grade, condition (Cracks and Mends), level, Gates and Bounces, Roster roles and copies, the Steward rule, Set Cards, themes, the effects director, retention | **Proposed** | This page |

To make a project count days live from real deploys, see [Send deploys from a pipeline to Ploeg](../../apps/ploeg/docs/how-to/send-deploys-from-a-pipeline.md). Until a project reports deploys, the release counts from the merge, and the card says so.

## The unit: one card per Work Item

The owner decided the unit on 2026-10-01.

* **One card per Work Item.** A Work Item that bounces three times in test produces four pull requests. Four cards would split one feature's story, cost and bugs, so the card is the Work Item.
* **Its pull requests are Plays.** Each pull request attaches as a numbered **Play** (for example #57, then #61 after the first bounce, then #64). Cost and lines are summed across Plays. The Runs of each Play appear on the back as the crew.
* **An epic is its own Set Card** (Proposed). An epic Work Item gets a **Set Card** whose children are Run Cards, numbered 1/5 to 5/5. Ploeg reads no tracker parent relations yet, so this needs an ingest change first.
* **Chores are tokens** (Proposed). A chore such as a dependency bump gets a minimal frame and stacks in the Binder; volume earns nothing.
* **Failures are scuffs, not separate cards** (Proposed). A failed Shift scuffs its Work Item's card. A Work Item never delivered is shelved as withdrawn. A sprint or a release is a page, not a card.

Ploeg derives the card's state today: `drafting` before the first pull request, `in_review` while one is open, `merged`, `closed` or `withdrawn` ([ADR-0046](../../apps/ploeg/docs/adrs/0046-a-run-card-is-assembled-per-work-item-from-stored-facts.md)).

## Five axes

Collectible games keep *what a card is* apart from *what it earned*; mixing them causes inflation and grind ([trading-card design](../research/2026-10-01-run-cards-trading-card-design.md)). A Run Card has five axes, each with its own visual channel.

### Rarity: decided, built in Ploeg

**Rarity** says how exceptional the change was, apart from how well it was done (Grade) and how long it has held up (Finish). It is cosmetic only. The owner decided on 2026-10-02 that rarity means challenge. Ploeg computes it ([Ploeg ADR-0056](../../apps/ploeg/docs/adrs/0056-a-run-cards-rarity-is-its-challenge-predicted-at-mint-and-frozen-at-release.md), proposed); Vloer does not draw it yet.

* **Challenge, from facts nobody pads afterwards.** The score adds the change's reach (modules and repositories), its sensitive ground (migrations, schemas, API definitions, deploy and CI files, and paths a Work Target marks for attention), its novelty (files no other card touched in the 180 days before) and its size in lines, damped and without lockfiles or generated files. Cost, time, tokens, bounces and the grade are never inputs. The formula is versioned and printed on the card's back.
* **Two moments.** From its first Run the card carries a tier predicted from what is known before the merge. At release it is revealed from the real change, and the two may differ.
* **Tiers are percentiles per project and quarter:** Legendary (top 1 %), Epic (next 4 %), Rare (next 10 %), Uncommon (next 25 %) and Common. Fixed thresholds apply while a project has fewer than 30 revealed cards that quarter.
* **Frozen at reveal.** Once revealed, a card keeps its tier even as its cohort grows.
* **Sets.** An epic's own card is legendary while its set is complete.

Proposed and not built: special printings for genuinely rare events (1st Edition, Black Label, Keystone and Untouched), and a Token tier for chores.

### Finish: built

A **Finish** is earned by staying live in production. Vloer computes it from Ploeg's release time and ignores the `finish` Ploeg sends ([Vloer ADR 0026](../../apps/vloer/docs/adrs/0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md)):

| Days live | Finish |
| --- | --- |
| under 7 | matte |
| 7 | foil |
| 30 | holo |
| 90 | prism |
| 180 | gilded |
| 365 | infinity |

Days live are whole days since the first production deploy of the latest merged Play. When the repository has never reported a production deploy, they count from the merge, and the card reads "counted from merge · no deploy signal" ([Ploeg ADR-0047](../../apps/ploeg/docs/adrs/0047-ploeg-learns-where-a-merged-change-is-deployed-from-a-generic-deploy-endpoint.md)). Each step adds one visual layer and never replaces the project's art, and the finish advances on its own, so nobody grinds for it.

### Grade: proposed

A **Grade** works like a graded slab: 1 to 10 in half steps, computed as 0.40 reliability + 0.25 durability + 0.20 delivery + 0.15 review.

* **Provisional cap.** While a card is under 180 days live, its grade is capped at 9. A 10 is possible only once it is Proven.
* **Labels.** Black Label is 10 on all four subgrades. Gold Label is an overall 10.
* **Qualifiers** name one honest defect instead of hiding it: `RV` reverted, `HF` hotfixed, `OB` over budget, `RT` retried Run, `MN` manual takeover.
* **Versioned formula.** The formula carries a version, and its inputs are printed on the back, so a grade is an attested fact rather than an opinion. A formula change never silently re-grades old cards.
* **Bounces.** Only defect and unknown bounces count against delivery (see [Gates and bounces](#gates-and-bounces)).

### Condition: Cracks and Mends (proposed)

Wear runs from factory new to battle-scarred. A confirmed defect gives the card a **Crack**. Its fix, a **Mend**, fills the crack with gold seams that stay forever: kintsugi. A mended card looks more distinguished than an untouched one, but its reliability ends slightly lower, so repair is celebrated and shipping bugs still never pays. Code deliberately replaced later retires with honours and loses nothing.

**A Crack is an inquiry, not a verdict.** Automatic bug-to-change tracing (SZZ) is right only about 64 to 73 % of the time per commit, and much less per pull request. A large share of bugs have no causing change at all ([game theory](../research/2026-10-01-run-cards-game-theory.md)). So the owner decided that a Crack happens **only with human confirmation**:

1. When a bug Work Item is fixed, Ploeg proposes the likely causing changes.
2. The fixer names the cause. "Requirement changed" marks the card Evolved and leaves no Crack, and so does "environment".
3. A second person who is not the Steward confirms. The Steward has 5 working days to dispute, and a rotating referee settles disputes.
4. The triager sets severity S1 to S4 (weights 4, 2, 1 and 0.25). At most three cards share a bug, as primary or contributing.
5. Weight is full for 0 to 180 days live, half for 181 to 365, and history only after that.
6. Discovery factor: self-reported 0.5, discovered 1.0, concealed 1.5. Self-reporting is the best move whenever there is a real chance of being found.
7. A Mend by the Steward counts 0.5 and by someone else 0.75. Whoever mends another person's card becomes a co-signer. A Mend is confirmed when the bug closes and nothing cracks again within 30 days.

Reporters, menders and Stewards all get visible credit. A team that feels safe reports more errors, so Cracks per team should *rise* after rollout. That is a good sign, and the team page should say so.

### Level: proposed

XP follows a log curve over days in production, reaching full value at 180 days, scaled by Size × risk (risk 1 to 1.75). Small bonuses come from pull request, CI, review and merge events. Levels need 25·n² XP, so each level takes longer. Accrual pauses while a Crack is unmended. XP is never spent, and nothing is tradeable. A reviewer who leaves a substantive review gets 25 % of the card's XP as an assist and never takes Cracks. A Steward's weekly Size points have diminishing returns (100 %, then 50 %, then 25 %).

## Flow figures: built in Ploeg

Besides the five axes, Ploeg sends the card's flow figures ([Ploeg ADR-0057](../../apps/ploeg/docs/adrs/0057-a-run-cards-flow-figures-come-from-every-recorded-tracker-status-and-a-team-calendar.md), proposed). Vloer does not show them yet. They are timings, not scores: no grade, rarity or finish uses them.

* **Time in every status.** Ploeg records every column a ticket enters on a board it watches, mapped to a gate or not, and the card lists the time spent in each, per gate and per kind. A kind is `active` (someone works on it), `waiting`, `blocked` or `done`. A board can set each column's kind; otherwise defaults based on the column name apply.
* **Lead time** runs from the ticket's creation in the tracker to the release, **cycle time** from the first active column or first Run to the release (else the merge), and **time to start** from creation to the first work. **Flow efficiency** is active time divided by active, waiting and blocked time in the cycle. **Reopens** count moves out of done.
* **Ploeg's own time:** how long the Work Item queued before its first Run, how long the Runs took, and the time from the first Run to the first pull request.
* **Delivery:** the time from the merge to the first deploy in each environment, and to production.
* **Restore:** the time from a confirmed Crack to its Mend, and the mean.
* **Working time.** Every duration except agent time also counts working seconds under the team's calendar: Monday to Friday, 09:00 to 17:00 in Europe/Amsterdam unless the team configures another, without holidays unless it lists them.
* **What it is not.** Waiting and blocked time say how work moves through the team's process, not how the Steward worked. No view adds flow figures up per person. Estimate against actual is not collected while the tracker has no estimate (Vikunja); ClickUp's estimate is read.

To configure kinds and working hours, see [Configure status kinds and working hours](../../apps/ploeg/docs/how-to/configure-status-kinds-and-working-hours.md).

## Pull request, CI and change figures: built in Ploeg

Each Play also carries what its pull request, its CI and its change looked like, and the card sums them up ([Ploeg ADR-0058](../../apps/ploeg/docs/adrs/0058-a-run-cards-pull-request-ci-and-change-shape-figures-are-read-from-the-forge-and-kept-per-play.md), proposed). Vloer does not show them yet. Ploeg reads them from Forgejo or GitLab when the pull request changes and at the merge, keeps who did what and when, and never keeps comment text, code or CI logs. Like the flow figures, they are facts about the change: no grade, rarity or finish uses them, and nobody is ranked by them.

| Figure | What it means | Where it misleads |
| --- | --- | --- |
| Time to first feedback | From ready for review to the first review, inline comment or comment by a person other than the author. Bots never count. | It measures how fast the team responded, not how good the change was or how fast its author worked. A draft counts from when it was marked ready. |
| Time to first approval, approval to merge, open to merge | From ready to the first approval, from the last approval to the merge, from opening to the merge. | A change approved and then left waiting for a release window looks slow. |
| Review rounds, comments, reviewers | Distinct commits humans reviewed (as the grade counts rounds), comments by people other than the author, people who submitted a review. | More comments can mean a careful review as easily as a muddled change. |
| Response time | The median time from a request for changes to the author's next push. | On an agent-written change, the author is Ploeg; this then measures the agent's round, not a person. |
| Commits, force pushes, coding time | Commits on the pull request, force pushes (Forgejo only; unknown on GitLab), and the time from the earliest commit's author date to ready. | Author dates can be rewritten by a rebase. |
| CI runs, failures and reruns | Runs across every pushed commit, those that failed, and repeat runs on the same commit. | Reruns are a flakiness signal for the pipeline, not a mark against the change. |
| Last green, time to green, queue, minutes, slowest jobs | Wall time of the final passing run, time from ready to the first all-green commit, time jobs waited for a runner, total job minutes and the three slowest jobs. | Queue time says how busy the runners were. On Forgejo, queue and start times come from the status texts Forgejo Actions writes; another CI has no queue time. |
| First-pass green | Whether the first CI run of the commit that was ready for review passed without a rerun. | A cancelled first run says nothing, so it stays unknown. |
| Complexity | Indentation complexity of the changed lines: each line counts how deeply it is indented, a language-independent stand-in for nesting (Hindle, Godfrey and Holt, 2008). Added, removed, net, the deepest line and the three files with the most added complexity. | It is a proxy. Deeply nested data files such as YAML score high, and it says nothing about whether nesting was needed. |
| Size, test ratio, docs, languages | Counted lines without lockfiles, generated and vendored code (as rarity counts them), test lines over other lines, documentation files touched, and the top three languages. | Test paths are matched by pattern, so a test helper outside them counts as code. A Work Target can set its own patterns. |

To set which files count as tests and documentation, see [Count tests and docs on Run cards](../../apps/ploeg/docs/how-to/count-tests-and-docs-on-run-cards.md).

## Life in production

Proposed lifecycle: drafted (a Run is live) → opened (pull request) → signed (approved) → merged → deployed → Provisional (0 to 29 days) → Settled (30 to 179 days) → Proven (180 days and more). At any point a card can become Retired (code replaced on purpose), Withdrawn (pulled for product reasons, no Crack) or Emeritus (the Steward left; the card stays).

## Gates and bounces

*Proposed.* A card moves through environments, and rejections knock it back.

* **Gates come from the tracker.** Each project maps tracker statuses to **Gates** (development, test, acceptance, production), plus the deploy endpoint per environment. Gates differ per agency and client, so the mapping is configuration.
* **A Bounce moves backwards.** A **Bounce** is a move from a later Gate back to an earlier one, such as "In test" back to "In progress", with a reason: defect, requirement, misunderstood, environment or unknown.
* **Reasons matter more than counts.** Only defect and unknown Bounces touch the Grade. A requirement change or a misunderstanding points at the process, never at the developer. Before acceptance the same card continues as Evolved; after acceptance a linked sequel card starts.
* **A new front stat** reads, for example, "Test 2 · Acc 1 bounces".
* **The moments shift.** Merging to development becomes a minor moment. Accepted and released become the major ones.
* **Silence and skips.** No answer within 10 working days counts as silent acceptance, as the glossary's Acceptance rule says. A hotfix straight to production gets its own small card, marked as a stage skip.

## Roles, copies and the Steward

*Proposed, except where marked built.* One card has many holders. Everyone involved holds a **copy** marked with their role, and the **Roster** on the card lists them all:

| Copy | Highlights |
| --- | --- |
| Developer (Steward and co-developers) | Plays, rework, time to acceptance |
| Reviewer | Review depth; findings that turned out to matter |
| QA | Defects caught before production, counted only when the developer confirms them |
| PO | Requirement stability: Evolved count, Bounces from unclear criteria |
| Client | Accepted first time, time to accept, days live; shown at team level |
| Agent crew | The credit line on every copy; never a Steward |

**Shared fate.** When the card cracks, every copy cracks. When it is mended, every copy gets the gold seams and names the mender. That makes QA, the PO and the reviewer care about production too, and keeps the Crack on the change instead of on a person.

**The Steward rule (proposed).** The Steward is the developer who carries the Work Item: the tracker assignee at release, handed over explicitly when needed. It falls back to the person who merged, then to the approver, and bot logins never count. The Steward answers for the change while it runs and has first right to mend it. It must be one name, so someone is told when the card cracks. A card without a Steward is an Orphan that anyone on the Roster may adopt within 14 days. Signing asks what was checked (tests read, behaviour run, risk areas), so the human is not made answerable for code they barely touched.

**Built today:** the Steward is whoever merged the latest merged Play, otherwise the last approver. The Roster lists humans with the roles merger and reviewer ([ADR-0046](../../apps/ploeg/docs/adrs/0046-a-run-card-is-assembled-per-work-item-from-stored-facts.md)).

## Packs

*Proposed.* Once per sprint, each person opens a sprint **Pack**: the ceremony that hands them the cards they earned that sprint.

* **The contents are earned.** A Pack holds exactly the cards the person holds a copy of from that sprint. Nothing in it is random except its cosmetics.
* **Random pulls are cosmetic only.** Opening may give a card one cosmetic variant: a foil pattern, alternative art, full art or a gold signature. The draw uses a recorded seed, so it can be replayed and audited.
* **The odds are published** in the product before anyone opens a Pack.
* **No purchase, no re-roll, no trade.** A Pack cannot be bought or opened again for a better pull, and neither it nor a variant can be given away.
* **One Pack per person per sprint.**
* **Pulls never change a Grade, a Rarity or any metric**, and never anything Ploeg authorizes, budgets or merges.

The loot-box rulings in Belgium and the Netherlands concerned packs bought with money ([trading-card design](../research/2026-10-01-run-cards-trading-card-design.md)). A Pack that nobody can buy, with cosmetic pulls and published odds, is built to stay clear of them. An agency should still have its counsel review it.

Vloer implements this proposal against fixtures ([Vloer ADR 0029](../../apps/vloer/docs/adrs/0029-binders-packs-and-pulls-collect-run-cards-privately-and-fairly.md)):

* **Period.** A Pack covers an ISO week by default, and a Team can set its sprint length and start date instead, which answers what a Pack covers for a team that does not work in sprints.
* **Contents.** A Pack holds each card with a moment in its period: minted, merged, released, a finish step crossed, cracked or mended.
* **Opening.** Packs seal when their period ends, open in order and never expire.
* **The pull.** A card is pulled once, in its first Pack, with HMAC-SHA256 over the person, the Work Item and the Pack, and Vloer stores the result.
* **What a pull gives.** The pull picks the foil pattern and may add alternate art, a full-art frame or a gold signature. The earned finish still decides how much of the card the pattern covers.

## Key figures

*Proposed.* Ploeg ADR-0057 and ADR-0058 add the figures a team asks about: how long the ticket sat in every tracker status, its lead and cycle time, how long until the first human feedback and the merge, how long CI took and how often it reran, and how complex the change was. Vloer shows them ([Vloer ADR 0035](../../apps/vloer/docs/adrs/0035-run-cards-lead-with-three-or-four-kpis-for-their-state-and-keep-the-rest-on-the-back.md)).

* **Three or four on the front, for the card's state.** In review: time to first feedback, or "waiting 3 h" while nobody has responded, CI's last green run with its reruns, complexity added and cycle time so far. Merged: lead time, first feedback, CI and time to production once a deploy reached it. Drafting: time to start or cycle time so far, lead time, blocked time and the estimate.
* **Every figure says what it means.** Its meaning is the tooltip and is listed on the back. Durations read "42 min", "3 h 10 min", "2 d 4 h".
* **Calendar or working hours.** Every human duration also exists in working hours, counted in the team's calendar (Monday to Friday, 09:00 to 17:00 Europe/Amsterdam by default). A reader switches between them on the back, and the choice holds for every card.
* **The back has the rest.** A Flow tab draws time per status as one stacked bar coloured by kind (active, waiting, blocked, done) with a table of the same facts. Review & CI shows the pull request's steps from opened to merged and every CI figure. Change shows indentation complexity, test ratio and languages. Life shows merge to each environment and restore times.
* **Colour only where the meaning is clear.** Reruns hint at flaky CI, blocked time and reopens are worth a look, and green first time is good. Waiting time measures how fast the team responded, not the author, and is never coloured.
* **Team medians, never per person.** The season page shows the team's median lead time, first feedback, CI minutes and flow efficiency. No figure is totalled or ranked per person, and none feeds the grade or rarity.

## Who sees what

The owner decided visibility on 2026-10-01:

* **Binders are private.** A person's **Binder**, their collection of cards, is visible only to them. They may share single cards. There is no manager view of an individual's Binder.
* **Team pages are for the team.** Every aggregate is at team or service level.
* **Clients see team aggregates only:** stewardship, cost and mend status at team level, never a named individual's history.

The [works council and DPIA pack](../reference/run-cards-works-council-pack.md) turns this into a visibility matrix, a data inventory and a sample consent request.

## Guardrails

* **Never rank people.** No leaderboards, no "top Stewards", no per-person totals of level, Cracks, grade, cost or lines in any shared view.
* **Not for appraisal.** A written clause in the product terms and the works council pack says card data is never used in pay or performance reviews.
* **Grades describe changes.** No AI-derived score ever attaches to a person. Under the EU AI Act, AI that evaluates workers' performance is high-risk.
* **Short person link** (proposed default). The Steward's identity is pseudonymised after 12 months (configurable) or when the person leaves. The record of the change stays.
* **No streaks, no "days since last crack", no automatic Cracks, no refunds triggered by Cracks, no skins that hide Cracks.**
* **Trial it like an experiment.** Run it for more than 10 weeks. Judge it by surveys on ownership and care and by team rework and change fail rates, never by card counts. Teams can switch cards off.

## Looks and motion

A **Skin** changes how a card looks and moves, never its numbers or where they sit, so any card reads the same anywhere. A Work Target picks its skin in Ploeg's `cardStyle`. Seven skins are built: Vloer Native, the 3D forge skin ([Vloer ADR 0028](../../apps/vloer/docs/adrs/0028-the-forge-skin-renders-run-cards-in-3d-with-vendored-three-js.md)), and Holo Rarity, Loot Drop, Arcade Cabinet, Ticker Terminal and Mission Patch ([Vloer ADR 0026](../../apps/vloer/docs/adrs/0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md)). None of them shows rarity. The forge's art window can be an inner world the card's tilt looks into, lit and filled by its facts, which a person who holds a copy may decorate for themselves only (proposed, [Vloer ADR 0033](../../apps/vloer/docs/adrs/0033-a-forge-card-s-art-window-is-an-inner-world-its-holder-may-decorate-privately.md)). Each plays small moments inside the card when its facts change, such as a signature, a merge, a new finish, a crack or a mend, and holds still when the reader asks for reduced motion. Per-client themes on top are proposed. Proposed ceremony rules scale effects inversely to how often an event happens. They cap full-screen moments at one per 10 minutes and never interrupt typing. Every effect can be skipped, and flashes stay within WCAG limits, with no red flashes ([holo and game feel](../../apps/vloer/docs/research/2026-10-01-run-card-holo-and-game-feel.md)).

## Decisions

| Question | Status | Answer |
| --- | --- | --- |
| Unit | Decided | One card per Work Item; pull requests are Plays; an epic is its own Set Card |
| Cracks | Decided | Only with human confirmation |
| Deploy signal | Decided, built | A generic "commit is live in environment" endpoint; merge as the fallback |
| Card style | Decided, built | On the Work Target; per-client themes on top of skins |
| Visibility | Decided | Binders private; team pages for the team; clients see team aggregates only |
| Rarity | Decided, built in Ploeg | Challenge, predicted at mint and frozen at release, percentile tiers per project and quarter; see [Rarity](#rarity-decided-built-in-ploeg) |
| Key figures | Proposed; Vloer side built | Three or four per state on the front, the rest on the back, a calendar or working-hours choice, team medians only; see [Key figures](#key-figures) |
| Steward and roles | Proposed | Role copies with shared fate; the Steward is the developer carrying the Work Item |
| Gates and bounces | Proposed | Tracker-status mapping per project plus the deploy endpoint |
| Packs | Proposed; Vloer side built | Earned, cosmetic-only pulls, published odds, one per person per period (an ISO week, or a Team's sprint) |

No product-level ADR records the guardrails yet; this page states them. The decided parts are recorded in the Ploeg and Vloer ADRs above.

## Research

* [Trading-card design](../research/2026-10-01-run-cards-trading-card-design.md): rarity versus finish, the graded slab, epics as sets.
* [Gamification evidence, ownership and law](../research/2026-10-01-run-cards-gamification-evidence-and-law.md): the guardrails.
* [Game theory and mechanism design](../research/2026-10-01-run-cards-game-theory.md): the rules and the Crack flow.
* [Metrics catalogue](../../apps/ploeg/docs/research/2026-10-01-run-card-metrics-catalogue.md): about 115 candidate numbers with source, cost and gameability.
* [Holo, foil and game feel](../../apps/vloer/docs/research/2026-10-01-run-card-holo-and-game-feel.md): rendering, ceremony, accessibility and performance.
